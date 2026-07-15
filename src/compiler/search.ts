import type {
  CompiledDocument,
  CompilerResult,
  Diagnostic,
  DocumentNode,
  MetadataValue,
  RouteRecord,
  SearchPolicy,
  SearchRecord,
  SourceSpan,
} from "./model";

export interface SearchRecordProvenance {
  readonly sourceId: string;
  readonly sourceNodeId?: string;
  readonly sourceSpan?: SourceSpan;
  readonly transformIds: readonly string[];
}

export interface ProvenancedSearchRecord extends SearchRecord {
  readonly provenance: SearchRecordProvenance;
}

const FIELD_WEIGHTS: Readonly<Record<SearchRecord["field"], number>> = {
  title: 4,
  heading: 3,
  metadata: 2,
  body: 1,
  code: 0.75,
};

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableMetadataValue(value: MetadataValue): string {
  if (value === null || typeof value !== "object") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return value.map(stableMetadataValue).join(" ");
  }
  const objectValue = value as { readonly [key: string]: MetadataValue };
  return Object.keys(objectValue)
    .sort(compareCodePoints)
    .map((key) => `${key} ${stableMetadataValue(objectValue[key] ?? null)}`)
    .join(" ");
}

function tokenize(text: string, minimumTokenLength: number): readonly string[] {
  const matches =
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}_]+/gu) ?? [];
  return matches.filter((token) => [...token].length >= minimumTokenLength);
}

function childrenOf(node: DocumentNode): readonly DocumentNode[] {
  return "children" in node ? node.children : [];
}

function plainText(node: DocumentNode): string {
  const fragments: string[] = [];
  const stack: DocumentNode[] = [node];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    switch (current.type) {
      case "text":
        fragments.push(current.value);
        break;
      case "inlineCode":
        fragments.push(current.value);
        break;
      case "inlineMath":
      case "math":
        fragments.push(current.source);
        break;
      case "image":
      case "imageReference":
        if (current.alt !== undefined) {
          fragments.push(current.alt);
        }
        break;
      case "break":
        fragments.push(" ");
        break;
      default:
        break;
    }
    const children = childrenOf(current);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return fragments.join(" ").replace(/\s+/gu, " ").trim();
}

function transformIds(document: CompiledDocument): readonly string[] {
  return [
    ...new Set(document.provenance.map((record) => record.transformId)),
  ].sort(compareCodePoints);
}

function provenance(
  document: CompiledDocument,
  node?: DocumentNode,
  sourceSpan?: SourceSpan,
): SearchRecordProvenance {
  return {
    sourceId: document.source.sourceId,
    transformIds: transformIds(document),
    ...(node === undefined ? {} : { sourceNodeId: node.nodeId }),
    ...(sourceSpan === undefined && node?.sourceSpan === undefined
      ? {}
      : { sourceSpan: sourceSpan ?? (node?.sourceSpan as SourceSpan) }),
  };
}

function record(
  document: CompiledDocument,
  route: string,
  field: SearchRecord["field"],
  identity: string,
  text: string,
  policy: SearchPolicy,
  node?: DocumentNode,
  headingId?: string,
  sourceSpan?: SourceSpan,
): ProvenancedSearchRecord {
  const location = sourceSpan ?? node?.sourceSpan;
  return {
    recordId: `search:${encodeURIComponent(document.documentId)}:${field}:${encodeURIComponent(identity)}`,
    documentId: document.documentId,
    route,
    field,
    text,
    tokens: tokenize(text, policy.minimumTokenLength),
    weight: FIELD_WEIGHTS[field],
    provenance: provenance(document, node, sourceSpan),
    ...(headingId === undefined ? {} : { headingId }),
    ...(location === undefined ? {} : { sourceSpan: location }),
  };
}

function bodyText(node: DocumentNode): string | undefined {
  switch (node.type) {
    case "paragraph":
    case "tableCell":
      return plainText(node);
    case "math":
    case "inlineMath":
      return node.source;
    case "html":
      return node.rawSource;
    case "leafDirective":
    case "textDirective":
      return node.rawSource;
    case "unsupported":
      return node.rawSource;
    case "image":
    case "imageReference":
      return node.alt;
    default:
      return undefined;
  }
}

function orderedMetadataKeys(document: CompiledDocument): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of document.metadata.keyOrder) {
    if (
      Object.prototype.hasOwnProperty.call(document.metadata.effective, key) &&
      !seen.has(key)
    ) {
      seen.add(key);
      result.push(key);
    }
  }
  for (const key of Object.keys(document.metadata.effective).sort(
    compareCodePoints,
  )) {
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

function hasField(policy: SearchPolicy, field: SearchRecord["field"]): boolean {
  return policy.fields.includes(field);
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

export function chunkSearchRecords<TRecord extends SearchRecord>(
  records: readonly TRecord[],
  recordLimit: number,
): readonly (readonly TRecord[])[] {
  if (!Number.isSafeInteger(recordLimit) || recordLimit <= 0) {
    return [];
  }
  const chunks: TRecord[][] = [];
  for (let offset = 0; offset < records.length; offset += recordLimit) {
    chunks.push(records.slice(offset, offset + recordLimit));
  }
  return chunks;
}

export function compileSearchRecords(
  documents: readonly CompiledDocument[],
  routes: readonly RouteRecord[],
  policy: SearchPolicy,
): CompilerResult<readonly ProvenancedSearchRecord[]> {
  const diagnostics: Diagnostic[] = [];
  if (
    !Number.isSafeInteger(policy.chunkRecordLimit) ||
    policy.chunkRecordLimit <= 0
  ) {
    diagnostics.push({
      code: "SEARCH_CHUNK_LIMIT_INVALID",
      severity: "error",
      message: "Search chunkRecordLimit must be a positive safe integer.",
      phase: "search",
      remediation:
        "Configure a positive deterministic record count per search chunk.",
    });
  }
  if (
    !Number.isSafeInteger(policy.minimumTokenLength) ||
    policy.minimumTokenLength <= 0
  ) {
    diagnostics.push({
      code: "SEARCH_TOKEN_LENGTH_INVALID",
      severity: "error",
      message: "Search minimumTokenLength must be a positive safe integer.",
      phase: "search",
    });
  }
  if (new Set(policy.fields).size !== policy.fields.length) {
    diagnostics.push({
      code: "SEARCH_FIELD_DUPLICATE",
      severity: "error",
      message: "Search field configuration contains duplicates.",
      phase: "search",
      remediation: "List every indexed field at most once.",
    });
  }
  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }
  if (!policy.enabled) {
    return { ok: true, value: [], diagnostics };
  }

  const routeByDocument = new Map<string, string>();
  for (const route of routes) {
    if (routeByDocument.has(route.documentId)) {
      diagnostics.push({
        code: "SEARCH_ROUTE_DUPLICATE",
        severity: "error",
        message: `Search input contains multiple routes for '${route.documentId}'.`,
        phase: "search",
        nodeId: route.documentId,
      });
    } else {
      routeByDocument.set(route.documentId, route.canonicalRoute);
    }
  }

  const records: ProvenancedSearchRecord[] = [];
  const recordIds = new Set<string>();
  const sortedDocuments = [...documents].sort((left, right) =>
    compareCodePoints(left.documentId, right.documentId),
  );
  for (const document of sortedDocuments) {
    const route = routeByDocument.get(document.documentId);
    if (route === undefined) {
      diagnostics.push({
        code: "SEARCH_ROUTE_MISSING",
        severity: "error",
        message: `Search document '${document.documentId}' has no canonical route.`,
        phase: "search",
        sourceId: document.source.sourceId,
        nodeId: document.documentId,
      });
      continue;
    }

    const documentRecords: ProvenancedSearchRecord[] = [];
    if (hasField(policy, "title")) {
      documentRecords.push(
        record(
          document,
          route,
          "title",
          "$document-title",
          document.title.value,
          policy,
        ),
      );
    }

    const headingsByEffectiveId = new Map(
      document.headings.map(
        (heading) => [heading.effectiveId, heading] as const,
      ),
    );
    const stack: DocumentNode[] = [...document.root.children].reverse();
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) {
        continue;
      }
      if (node.type === "heading" && hasField(policy, "heading")) {
        const heading = headingsByEffectiveId.get(node.effectiveId);
        const headingText = heading?.plainText ?? node.authoredText;
        documentRecords.push(
          record(
            document,
            route,
            "heading",
            node.nodeId,
            headingText,
            policy,
            node,
            node.effectiveId,
            heading?.sourceSpan,
          ),
        );
      } else if (node.type === "code" && hasField(policy, "code")) {
        documentRecords.push(
          record(
            document,
            route,
            "code",
            node.nodeId,
            node.rawCode,
            policy,
            node,
          ),
        );
      } else if (hasField(policy, "body")) {
        const text = bodyText(node);
        if (text !== undefined && text.length > 0) {
          documentRecords.push(
            record(document, route, "body", node.nodeId, text, policy, node),
          );
        }
      }

      const children = childrenOf(node);
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child !== undefined) {
          stack.push(child);
        }
      }
    }

    if (hasField(policy, "metadata")) {
      for (const key of orderedMetadataKeys(document)) {
        const value = document.metadata.effective[key];
        if (value === undefined) {
          continue;
        }
        const sourceSpan = document.metadata.sourceEntries.find(
          (entry) => entry.key === key,
        )?.sourceSpan;
        documentRecords.push(
          record(
            document,
            route,
            "metadata",
            `$metadata:${key}`,
            `${key} ${stableMetadataValue(value)}`,
            policy,
            undefined,
            undefined,
            sourceSpan,
          ),
        );
      }
    }

    for (const searchRecord of documentRecords) {
      if (recordIds.has(searchRecord.recordId)) {
        diagnostics.push({
          code: "SEARCH_RECORD_ID_COLLISION",
          severity: "error",
          message: `Search record identifier '${searchRecord.recordId}' is not unique.`,
          phase: "search",
          sourceId: document.source.sourceId,
          ...(searchRecord.sourceSpan === undefined
            ? {}
            : { sourceSpan: searchRecord.sourceSpan }),
          ...(searchRecord.provenance.sourceNodeId === undefined
            ? {}
            : { nodeId: searchRecord.provenance.sourceNodeId }),
          remediation:
            "Ensure IR node identifiers are unique within each document.",
        });
      } else {
        recordIds.add(searchRecord.recordId);
        records.push(searchRecord);
      }
    }
  }

  return hasErrors(diagnostics)
    ? { ok: false, diagnostics }
    : { ok: true, value: records, diagnostics };
}
