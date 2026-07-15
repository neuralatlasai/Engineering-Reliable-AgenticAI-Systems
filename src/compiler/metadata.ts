import type {
  CompilerResult,
  DerivationStep,
  Diagnostic,
  MetadataConflict,
  MetadataEntry,
  MetadataPolicy,
  MetadataRecord,
  MetadataValue,
  ResolvedValue,
  ValueOrigin,
} from "./model";

const FALLBACK_PRECEDENCE: readonly ValueOrigin[] = [
  "source",
  "configuration",
  "derived",
  "defaulted",
  "generated",
];

const FORBIDDEN_METADATA_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export interface MetadataResolutionInput {
  readonly sourceId: string;
  readonly normalizedPath: string;
  readonly source: Readonly<Record<string, MetadataValue>>;
  readonly sourceEntries?: readonly MetadataEntry[];
  readonly configured?: Readonly<Record<string, MetadataValue>>;
  readonly derived?: Readonly<Record<string, MetadataValue>>;
  readonly rawFrontMatter?: string;
  readonly firstHeading?: string;
}

export interface ResolvedDocumentMetadata {
  readonly metadata: MetadataRecord;
  readonly title: ResolvedValue<string>;
  readonly documentId: ResolvedValue<string>;
  readonly parentId?: ResolvedValue<string>;
  readonly order?: ResolvedValue<string | number>;
  readonly route?: ResolvedValue<string>;
  readonly slug?: ResolvedValue<string>;
  readonly aliases: ResolvedValue<readonly string[]>;
}

interface Candidate<T> {
  readonly value: T;
  readonly origin: ValueOrigin;
  readonly key: string;
  readonly evidence: string;
}

interface Resolution<T> {
  readonly resolved?: ResolvedValue<T>;
  readonly selected?: Candidate<T>;
  readonly candidates: readonly Candidate<T>[];
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableStringify(value: MetadataValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const objectValue = value as { readonly [key: string]: MetadataValue };
  return `{${Object.keys(objectValue)
    .sort(compareCodePoints)
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(objectValue[key] ?? null)}`,
    )
    .join(",")}}`;
}

function valuesEqual(left: MetadataValue, right: MetadataValue): boolean {
  return stableStringify(left) === stableStringify(right);
}

function orderedOrigins(policy: MetadataPolicy): readonly ValueOrigin[] {
  const seen = new Set<ValueOrigin>();
  const result: ValueOrigin[] = [];

  for (const origin of [...policy.precedence, ...FALLBACK_PRECEDENCE]) {
    if (!seen.has(origin)) {
      seen.add(origin);
      result.push(origin);
    }
  }

  return result;
}

function sourceMapForOrigin(
  input: MetadataResolutionInput,
  origin: ValueOrigin,
): Readonly<Record<string, MetadataValue>> | undefined {
  switch (origin) {
    case "source":
      return input.source;
    case "configuration":
      return input.configured;
    case "derived":
      return input.derived;
    case "defaulted":
    case "generated":
      return undefined;
  }
}

function derivationTrace<T>(
  field: string,
  selected: Candidate<T>,
  candidates: readonly Candidate<T>[],
  origins: readonly ValueOrigin[],
): readonly DerivationStep[] {
  const ordered = [...candidates].sort((left, right) => {
    const originOrder =
      origins.indexOf(left.origin) - origins.indexOf(right.origin);
    return originOrder !== 0
      ? originOrder
      : compareCodePoints(left.key, right.key);
  });

  return ordered.map((candidate, index) => ({
    rule: `metadata.${field}.${candidate.origin}`,
    evidence: [candidate.evidence],
    result:
      typeof candidate.value === "string"
        ? candidate.value
        : JSON.stringify(candidate.value),
    precedence: index,
    overriddenAlternatives: ordered
      .filter((alternative) => alternative !== candidate)
      .map((alternative) => `${alternative.origin}:${alternative.key}`),
    validationOutcome: candidate === selected ? "accepted" : "rejected",
  }));
}

function resolveField<T>(
  field: string,
  fields: readonly string[],
  input: MetadataResolutionInput,
  policy: MetadataPolicy,
  parse: (value: MetadataValue) => T | undefined,
  fallbacks: readonly Candidate<T>[],
  diagnostics: Diagnostic[],
): Resolution<T> {
  const origins = orderedOrigins(policy);
  const candidates: Candidate<T>[] = [];

  for (const origin of origins) {
    const values = sourceMapForOrigin(input, origin);
    if (values === undefined) {
      continue;
    }

    for (const key of fields) {
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        continue;
      }

      const rawValue = values[key];
      if (rawValue === undefined) {
        continue;
      }

      const value = parse(rawValue);
      if (value === undefined) {
        diagnostics.push({
          code: "METADATA_FIELD_TYPE_INVALID",
          severity: policy.strictTypes ? "error" : "warning",
          message: `Metadata field '${key}' cannot be used as ${field}.`,
          phase: "metadata",
          sourceId: input.sourceId,
          remediation: `Provide a value matching the configured ${field} field type.`,
        });
        continue;
      }

      candidates.push({
        value,
        origin,
        key,
        evidence: `${origin} metadata key '${key}' in ${input.normalizedPath}`,
      });
    }
  }

  candidates.push(...fallbacks);
  candidates.sort((left, right) => {
    const originOrder =
      origins.indexOf(left.origin) - origins.indexOf(right.origin);
    if (originOrder !== 0) {
      return originOrder;
    }

    const leftFieldOrder = fields.indexOf(left.key);
    const rightFieldOrder = fields.indexOf(right.key);
    const normalizedLeftOrder =
      leftFieldOrder === -1 ? fields.length : leftFieldOrder;
    const normalizedRightOrder =
      rightFieldOrder === -1 ? fields.length : rightFieldOrder;
    return normalizedLeftOrder !== normalizedRightOrder
      ? normalizedLeftOrder - normalizedRightOrder
      : compareCodePoints(left.key, right.key);
  });

  const selected = candidates[0];
  if (selected === undefined) {
    return { candidates };
  }

  const conflicting = candidates.filter(
    (candidate) =>
      !candidate.key.startsWith("$") &&
      JSON.stringify(candidate.value) !== JSON.stringify(selected.value),
  );
  if (conflicting.length > 0) {
    diagnostics.push({
      code: "METADATA_FIELD_CONFLICT",
      severity: "warning",
      message: `Multiple candidates define ${field}; '${selected.key}' from ${selected.origin} wins by configured precedence.`,
      phase: "metadata",
      sourceId: input.sourceId,
      remediation:
        "Remove the conflicting value or adjust metadata precedence explicitly.",
    });
  }

  return {
    selected,
    candidates,
    resolved: {
      value: selected.value,
      origin: selected.origin,
      derivationTrace: derivationTrace(field, selected, candidates, origins),
    },
  };
}

function parseNonEmptyString(value: MetadataValue): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function parseOrder(value: MetadataValue): string | number | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseAliases(value: MetadataValue): readonly string[] | undefined {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    return value as readonly string[];
  }

  return undefined;
}

function generatedPathTitle(normalizedPath: string, sourceId: string): string {
  const segments = normalizedPath.replaceAll("\\", "/").split("/");
  const filename = segments.at(-1) ?? "";
  const extensionIndex = filename.lastIndexOf(".");
  const stem =
    extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  return stem.length > 0 ? stem : sourceId;
}

function safeCopy(
  values: Readonly<Record<string, MetadataValue>> | undefined,
  origin: ValueOrigin,
  sourceId: string,
  diagnostics: Diagnostic[],
): Readonly<Record<string, MetadataValue>> {
  const result: Record<string, MetadataValue> = Object.create(null) as Record<
    string,
    MetadataValue
  >;

  for (const key of Object.keys(values ?? {}).sort(compareCodePoints)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      diagnostics.push({
        code: "METADATA_KEY_FORBIDDEN",
        severity: "error",
        message: `Metadata key '${key}' is forbidden because it can mutate object prototypes.`,
        phase: "metadata",
        sourceId,
        remediation: `Rename the ${origin} metadata key.`,
      });
      continue;
    }

    const value = values?.[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function mergeEffectiveMetadata(
  input: MetadataResolutionInput,
  policy: MetadataPolicy,
  source: Readonly<Record<string, MetadataValue>>,
  configured: Readonly<Record<string, MetadataValue>>,
  derived: Readonly<Record<string, MetadataValue>>,
): {
  readonly effective: Readonly<Record<string, MetadataValue>>;
  readonly conflicts: readonly MetadataConflict[];
  readonly keyOrder: readonly string[];
} {
  const maps: Readonly<
    Record<ValueOrigin, Readonly<Record<string, MetadataValue>>>
  > = {
    source,
    configuration: configured,
    derived,
    defaulted: Object.create(null) as Readonly<Record<string, MetadataValue>>,
    generated: Object.create(null) as Readonly<Record<string, MetadataValue>>,
  };
  const origins = orderedOrigins(policy);
  const sourceOrder = input.sourceEntries?.map((entry) => entry.key) ?? [];
  const allKeys = new Set<string>(sourceOrder);
  const remainingKeys = [
    ...Object.keys(source),
    ...Object.keys(configured),
    ...Object.keys(derived),
  ]
    .filter((key) => !allKeys.has(key))
    .sort(compareCodePoints);
  for (const key of remainingKeys) {
    allKeys.add(key);
  }

  const effective: Record<string, MetadataValue> = Object.create(
    null,
  ) as Record<string, MetadataValue>;
  const conflicts: MetadataConflict[] = [];

  for (const key of allKeys) {
    const definitions = origins.flatMap((origin) => {
      const values = maps[origin];
      const value = values[key];
      return Object.prototype.hasOwnProperty.call(values, key) &&
        value !== undefined
        ? [{ origin, value }]
        : [];
    });
    const selected = definitions[0];
    if (selected === undefined) {
      continue;
    }

    effective[key] = selected.value;
    const differentDefinitions = definitions.filter(
      (definition) => !valuesEqual(definition.value, selected.value),
    );
    if (differentDefinitions.length > 0) {
      conflicts.push({
        key,
        origins: definitions.map((definition) => definition.origin),
        resolution: selected.origin,
        message: `The ${selected.origin} value wins according to metadata precedence.`,
      });
    }
  }

  return { effective, conflicts, keyOrder: [...allKeys] };
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

export function resolveDocumentMetadata(
  input: MetadataResolutionInput,
  policy: MetadataPolicy,
): CompilerResult<ResolvedDocumentMetadata> {
  const diagnostics: Diagnostic[] = [];
  const duplicateOrigins = policy.precedence.filter(
    (origin, index) => policy.precedence.indexOf(origin) !== index,
  );
  if (duplicateOrigins.length > 0) {
    diagnostics.push({
      code: "METADATA_PRECEDENCE_DUPLICATE",
      severity: "error",
      message: `Metadata precedence repeats: ${[...new Set(duplicateOrigins)].join(", ")}.`,
      phase: "metadata",
      remediation: "List each metadata origin at most once.",
    });
  }

  const source = safeCopy(input.source, "source", input.sourceId, diagnostics);
  const configured = safeCopy(
    input.configured,
    "configuration",
    input.sourceId,
    diagnostics,
  );
  const derived = safeCopy(
    input.derived,
    "derived",
    input.sourceId,
    diagnostics,
  );
  const merged = mergeEffectiveMetadata(
    input,
    policy,
    source,
    configured,
    derived,
  );

  const titleFallbacks: Candidate<string>[] = [];
  if (input.firstHeading !== undefined && input.firstHeading.length > 0) {
    titleFallbacks.push({
      value: input.firstHeading,
      origin: "derived",
      key: "$first-heading",
      evidence: `first parsed heading in ${input.normalizedPath}`,
    });
  }
  titleFallbacks.push({
    value: generatedPathTitle(input.normalizedPath, input.sourceId),
    origin: "generated",
    key: "$path-stem",
    evidence: `unmodified filename stem from ${input.normalizedPath}`,
  });

  const title = resolveField(
    "title",
    policy.titleFields,
    input,
    policy,
    parseNonEmptyString,
    titleFallbacks,
    diagnostics,
  );
  const documentId = resolveField(
    "document identifier",
    policy.idFields,
    input,
    policy,
    parseNonEmptyString,
    [
      {
        value: input.sourceId,
        origin: "generated",
        key: "$source-id",
        evidence: `stable discovery source identifier '${input.sourceId}'`,
      },
    ],
    diagnostics,
  );
  const parentId = resolveField(
    "parent identifier",
    policy.parentFields,
    input,
    policy,
    parseNonEmptyString,
    [],
    diagnostics,
  );
  const order = resolveField(
    "order",
    policy.orderFields,
    input,
    policy,
    parseOrder,
    [],
    diagnostics,
  );
  const route = resolveField(
    "route",
    policy.routeFields,
    input,
    policy,
    parseNonEmptyString,
    [],
    diagnostics,
  );
  const slug = resolveField(
    "slug",
    policy.slugFields,
    input,
    policy,
    parseNonEmptyString,
    [],
    diagnostics,
  );
  const aliases = resolveField(
    "aliases",
    policy.aliasFields,
    input,
    policy,
    parseAliases,
    [
      {
        value: [],
        origin: "defaulted",
        key: "$empty-aliases",
        evidence: "no aliases were authored or configured",
      },
    ],
    diagnostics,
  );

  if (
    hasErrors(diagnostics) ||
    title.resolved === undefined ||
    documentId.resolved === undefined ||
    aliases.resolved === undefined
  ) {
    return { ok: false, diagnostics };
  }

  const metadataBase = {
    source,
    sourceEntries: input.sourceEntries ?? [],
    keyOrder: merged.keyOrder,
    configured,
    derived,
    effective: merged.effective,
    conflicts: merged.conflicts,
  };
  const metadata: MetadataRecord =
    input.rawFrontMatter === undefined
      ? metadataBase
      : { ...metadataBase, rawFrontMatter: input.rawFrontMatter };
  const value: ResolvedDocumentMetadata = {
    metadata,
    title: title.resolved,
    documentId: documentId.resolved,
    aliases: aliases.resolved,
    ...(parentId.resolved === undefined ? {} : { parentId: parentId.resolved }),
    ...(order.resolved === undefined ? {} : { order: order.resolved }),
    ...(route.resolved === undefined ? {} : { route: route.resolved }),
    ...(slug.resolved === undefined ? {} : { slug: slug.resolved }),
  };

  return { ok: true, value, diagnostics };
}
