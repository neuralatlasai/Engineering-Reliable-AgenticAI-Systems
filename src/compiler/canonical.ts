import { createHash } from "node:crypto";

export type CanonicalJsonFailureCode =
  | "unsupported-type"
  | "non-finite-number"
  | "cyclic-reference"
  | "sparse-array"
  | "non-plain-object";

export interface CanonicalJsonFailure {
  readonly code: CanonicalJsonFailureCode;
  readonly message: string;
  readonly path: string;
}

export type CanonicalJsonResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: CanonicalJsonFailure };

type JsonPrimitive = null | boolean | number | string;

// RFC 8785 orders object member names by UTF-16 code units. An explicit
// comparator avoids host locale, ICU version, and process-locale behavior.
export function compareCanonicalStrings(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftUnit = left.charCodeAt(index);
    const rightUnit = right.charCodeAt(index);

    if (leftUnit !== rightUnit) {
      return leftUnit < rightUnit ? -1 : 1;
    }
  }

  if (left.length === right.length) {
    return 0;
  }

  return left.length < right.length ? -1 : 1;
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function failure(
  code: CanonicalJsonFailureCode,
  path: string,
  message: string,
): CanonicalJsonResult {
  return { ok: false, error: { code, message, path } };
}

function serializePrimitive(value: JsonPrimitive): CanonicalJsonResult {
  if (typeof value === "number" && !Number.isFinite(value)) {
    return failure(
      "non-finite-number",
      "",
      "Canonical JSON cannot represent NaN or infinite numbers.",
    );
  }

  // JSON.stringify canonicalizes negative zero to zero and implements the
  // ECMAScript number/string serialization required by RFC 8785.
  return { ok: true, value: JSON.stringify(value) };
}

function serializeValue(
  value: unknown,
  path: string,
  ancestors: ReadonlySet<object>,
): CanonicalJsonResult {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    const result = serializePrimitive(value);
    return result.ok ? result : { ...result, error: { ...result.error, path } };
  }

  if (typeof value !== "object") {
    return failure(
      "unsupported-type",
      path,
      `Canonical JSON cannot represent values of type ${typeof value}.`,
    );
  }

  if (ancestors.has(value)) {
    return failure(
      "cyclic-reference",
      path,
      "Canonical JSON cannot represent cyclic object graphs.",
    );
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    const serializedItems = new Array<string>(value.length);

    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        return failure(
          "sparse-array",
          `${path}/${index}`,
          "Canonical JSON rejects sparse arrays instead of silently inserting null.",
        );
      }

      const itemResult = serializeValue(
        value[index],
        `${path}/${index}`,
        nextAncestors,
      );
      if (!itemResult.ok) {
        return itemResult;
      }

      serializedItems[index] = itemResult.value;
    }

    return { ok: true, value: `[${serializedItems.join(",")}]` };
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return failure(
      "non-plain-object",
      path,
      "Canonical JSON accepts only arrays, primitives, and plain objects.",
    );
  }

  const symbolKeys = Object.getOwnPropertySymbols(value).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(value, symbol),
  );
  if (symbolKeys.length > 0) {
    return failure(
      "unsupported-type",
      path,
      "Canonical JSON cannot represent enumerable symbol keys.",
    );
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareCanonicalStrings);
  const members = new Array<string>(keys.length);

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === undefined) {
      return failure(
        "unsupported-type",
        path,
        "Object key enumeration was inconsistent.",
      );
    }

    const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
    const childResult = serializeValue(record[key], childPath, nextAncestors);
    if (!childResult.ok) {
      return childResult;
    }

    members[index] = `${JSON.stringify(key)}:${childResult.value}`;
  }

  return { ok: true, value: `{${members.join(",")}}` };
}

export function tryCanonicalizeJson(value: unknown): CanonicalJsonResult {
  return serializeValue(value, "", new Set<object>());
}

export function canonicalizeJson(value: unknown): string {
  const result = tryCanonicalizeJson(value);
  if (result.ok) {
    return result.value;
  }

  // This wrapper is for already-validated compiler data. Untrusted boundaries
  // must call tryCanonicalizeJson and handle its exhaustive failure result.
  throw new TypeError(
    `${result.error.message} Path: ${result.error.path || "/"}.`,
  );
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJsonHash(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

export function normalizeRelativePath(value: string): string {
  const normalizedSeparators = value.replaceAll("\\", "/");
  const segments: string[] = [];

  for (const segment of normalizedSeparators.split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (segments.length > 0 && segments.at(-1) !== "..") {
        segments.pop();
      } else {
        segments.push(segment);
      }
      continue;
    }

    segments.push(segment);
  }

  return segments.join("/");
}

export function compareNormalizedPaths(
  left: string,
  right: string,
  caseSensitivity: "sensitive" | "insensitive" = "sensitive",
): number {
  const normalizedLeft = normalizeRelativePath(left);
  const normalizedRight = normalizeRelativePath(right);
  const comparisonLeft =
    caseSensitivity === "insensitive"
      ? normalizedLeft.toLowerCase()
      : normalizedLeft;
  const comparisonRight =
    caseSensitivity === "insensitive"
      ? normalizedRight.toLowerCase()
      : normalizedRight;
  const primary = compareCanonicalStrings(comparisonLeft, comparisonRight);

  // A byte-stable, case-sensitive tie breaker makes ordering total even when
  // the configured logical comparison is case-insensitive.
  return primary === 0
    ? compareCanonicalStrings(normalizedLeft, normalizedRight)
    : primary;
}

export function createStableId(
  namespace: string,
  ...parts: readonly unknown[]
): string {
  if (!/^[a-z][a-z0-9._-]*$/u.test(namespace)) {
    throw new TypeError(
      "Stable identifier namespaces must start with a lowercase ASCII letter and contain only lowercase ASCII letters, digits, dots, underscores, or hyphens.",
    );
  }

  return `${namespace}:${canonicalJsonHash(parts)}`;
}
