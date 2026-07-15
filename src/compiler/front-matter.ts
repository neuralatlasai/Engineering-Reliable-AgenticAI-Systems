import { parse as parseToml } from "smol-toml";
import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node as YamlNode,
} from "yaml";

import type { ByteOffsetIndex } from "./byte-offsets";
import type {
  Diagnostic,
  FrontMatterNode,
  MetadataEntry,
  MetadataValue,
  ParserPolicy,
  SourceSpan,
} from "./model";

export interface FrontMatterRange {
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface FrontMatterExtraction {
  readonly frontMatter?: FrontMatterNode;
  readonly maskRange?: FrontMatterRange;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ExtractFrontMatterOptions {
  readonly sourceId: string;
  readonly text: string;
  readonly definitions: ParserPolicy["frontMatter"];
  readonly byteOffsets: ByteOffsetIndex;
}

interface LineRange {
  readonly start: number;
  readonly contentEnd: number;
  readonly end: number;
  readonly content: string;
}

interface ParsedEntries {
  readonly entries: readonly MetadataEntry[];
  readonly keyOrder: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
}

interface ValueConversionContext {
  readonly sourceId: string;
  readonly diagnostics: Diagnostic[];
  readonly sourceSpan?: SourceSpan;
}

interface JsonEntryRange {
  readonly key: string;
  readonly keyStart: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

interface TomlAssignment {
  readonly path: readonly string[];
  readonly start: number;
  readonly end: number;
  readonly rawValue: string;
}

const MAX_METADATA_DEPTH = 100;

function diagnostic(
  sourceId: string,
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  sourceSpan?: SourceSpan,
): Diagnostic {
  return sourceSpan === undefined
    ? { code, severity, message, phase: "metadata", sourceId }
    : { code, severity, message, phase: "metadata", sourceId, sourceSpan };
}

function readLine(text: string, start: number): LineRange {
  let contentEnd = start;
  while (contentEnd < text.length) {
    const codeUnit = text.charCodeAt(contentEnd);
    if (codeUnit === 0x0a || codeUnit === 0x0d) break;
    contentEnd += 1;
  }

  let end = contentEnd;
  if (text.charCodeAt(end) === 0x0d && text.charCodeAt(end + 1) === 0x0a)
    end += 2;
  else if (text.charCodeAt(end) === 0x0d || text.charCodeAt(end) === 0x0a)
    end += 1;

  return { start, contentEnd, end, content: text.slice(start, contentEnd) };
}

function markerMatches(line: string, marker: string): boolean {
  return line === marker || line.trimEnd() === marker;
}

function findClosingMarker(
  text: string,
  start: number,
  closeMarker: string,
): LineRange | undefined {
  let cursor = start;
  while (cursor <= text.length) {
    const line = readLine(text, cursor);
    if (markerMatches(line.content, closeMarker)) return line;
    if (line.end <= cursor || line.end >= text.length) return undefined;
    cursor = line.end;
  }
  return undefined;
}

function metadataSpan(
  byteOffsets: ByteOffsetIndex,
  bodyStart: number,
  relativeStart: number,
  relativeEnd: number,
): SourceSpan | undefined {
  return byteOffsets.spanFromOffsets(
    bodyStart + relativeStart,
    bodyStart + relativeEnd,
  );
}

function convertMetadataValue(
  input: unknown,
  context: ValueConversionContext,
  depth = 0,
): MetadataValue {
  if (depth > MAX_METADATA_DEPTH) {
    context.diagnostics.push(
      diagnostic(
        context.sourceId,
        "FRONT_MATTER_MAX_DEPTH",
        "error",
        `Metadata nesting exceeds the supported depth of ${MAX_METADATA_DEPTH}.`,
        context.sourceSpan,
      ),
    );
    return "[metadata-depth-exceeded]";
  }

  if (input === null || typeof input === "string" || typeof input === "boolean")
    return input;
  if (typeof input === "number") {
    if (Number.isFinite(input)) return input;
    context.diagnostics.push(
      diagnostic(
        context.sourceId,
        "FRONT_MATTER_NON_FINITE_NUMBER",
        "error",
        "Metadata contains a non-finite number; its source remains available in raw front matter.",
        context.sourceSpan,
      ),
    );
    return String(input);
  }
  if (typeof input === "bigint") {
    context.diagnostics.push(
      diagnostic(
        context.sourceId,
        "FRONT_MATTER_BIGINT_STRINGIFIED",
        "warning",
        "A metadata integer outside the JSON-safe representation was retained as a decimal string.",
        context.sourceSpan,
      ),
    );
    return input.toString(10);
  }
  if (input instanceof Date) return input.toISOString();
  if (Array.isArray(input)) {
    return input.map((value) =>
      convertMetadataValue(value, context, depth + 1),
    );
  }
  if (typeof input === "object") {
    const value: Record<string, MetadataValue> = Object.create(null) as Record<
      string,
      MetadataValue
    >;
    for (const [key, child] of Object.entries(input)) {
      value[key] = convertMetadataValue(child, context, depth + 1);
    }
    return value;
  }

  context.diagnostics.push(
    diagnostic(
      context.sourceId,
      "FRONT_MATTER_UNSUPPORTED_VALUE",
      "error",
      `Metadata value of type ${typeof input} is unsupported and was retained as text.`,
      context.sourceSpan,
    ),
  );
  return String(input);
}

function yamlKey(node: unknown): string {
  if (isScalar(node)) return String(node.value);
  if (node === null || node === undefined) return "";
  return String(node);
}

function yamlValue(
  node: YamlNode | null,
  context: ValueConversionContext,
  depth = 0,
): MetadataValue {
  if (node === null) return null;
  if (depth > MAX_METADATA_DEPTH) {
    return convertMetadataValue(
      { nested: "[metadata-depth-exceeded]" },
      context,
      depth + 1,
    );
  }
  if (isScalar(node)) return convertMetadataValue(node.value, context, depth);
  if (isSeq(node)) {
    return node.items.map((item) =>
      yamlValue(item as YamlNode | null, context, depth + 1),
    );
  }
  if (isMap(node)) {
    const result: Record<string, MetadataValue> = Object.create(null) as Record<
      string,
      MetadataValue
    >;
    const seen = new Set<string>();
    for (const pair of node.items) {
      const key = yamlKey(pair.key);
      if (seen.has(key)) {
        context.diagnostics.push(
          diagnostic(
            context.sourceId,
            "FRONT_MATTER_DUPLICATE_NESTED_KEY",
            "warning",
            `Duplicate nested YAML metadata key ${JSON.stringify(key)} was retained in raw source.`,
            context.sourceSpan,
          ),
        );
      }
      seen.add(key);
      result[key] = yamlValue(
        pair.value as YamlNode | null,
        context,
        depth + 1,
      );
    }
    return result;
  }
  if (isAlias(node)) {
    context.diagnostics.push(
      diagnostic(
        context.sourceId,
        "FRONT_MATTER_ALIAS_PRESERVED",
        "warning",
        "A YAML alias was not expanded into trusted metadata; the alias remains in raw source.",
        context.sourceSpan,
      ),
    );
    return `*${node.source}`;
  }
  return convertMetadataValue(String(node), context, depth);
}

function parseYamlEntries(
  sourceId: string,
  body: string,
  bodyStart: number,
  byteOffsets: ByteOffsetIndex,
): ParsedEntries {
  const diagnostics: Diagnostic[] = [];
  const document = parseDocument(body, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: false,
  });
  const bodySpan = metadataSpan(byteOffsets, bodyStart, 0, body.length);

  for (const error of document.errors) {
    diagnostics.push(
      diagnostic(
        sourceId,
        "FRONT_MATTER_PARSE_ERROR",
        "error",
        error.message,
        bodySpan,
      ),
    );
  }
  for (const warning of document.warnings) {
    diagnostics.push(
      diagnostic(
        sourceId,
        "FRONT_MATTER_PARSE_WARNING",
        "warning",
        warning.message,
        bodySpan,
      ),
    );
  }

  if (!isMap(document.contents)) {
    if (document.contents !== null) {
      diagnostics.push(
        diagnostic(
          sourceId,
          "FRONT_MATTER_ROOT_TYPE",
          "error",
          "YAML front matter must contain a mapping at its root.",
          bodySpan,
        ),
      );
    }
    return { entries: [], keyOrder: [], diagnostics };
  }

  const entries: MetadataEntry[] = [];
  const keyOrder: string[] = [];
  const seen = new Set<string>();
  for (const pair of document.contents.items) {
    const key = yamlKey(pair.key);
    const range = isScalar(pair.key) ? pair.key.range : undefined;
    const span = range
      ? metadataSpan(
          byteOffsets,
          bodyStart,
          range[0],
          pair.value?.range?.[2] ?? range[2],
        )
      : bodySpan;
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(
          sourceId,
          "FRONT_MATTER_DUPLICATE_KEY",
          "warning",
          `Duplicate metadata key ${JSON.stringify(key)} is retained in source order.`,
          span,
        ),
      );
    }
    seen.add(key);
    keyOrder.push(key);
    const value = yamlValue(pair.value, {
      sourceId,
      diagnostics,
      ...(span ? { sourceSpan: span } : {}),
    });
    entries.push(span ? { key, value, sourceSpan: span } : { key, value });
  }

  return { entries, keyOrder, diagnostics };
}

function skipWhitespace(text: string, cursor: number): number {
  while (cursor < text.length && /\s/u.test(text[cursor] ?? "")) cursor += 1;
  return cursor;
}

function jsonStringEnd(text: string, start: number): number | undefined {
  if (text[start] !== '"') return undefined;
  let escaped = false;
  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return cursor + 1;
  }
  return undefined;
}

function jsonValueEnd(text: string, start: number): number | undefined {
  if (text[start] === '"') return jsonStringEnd(text, start);
  const opening = text[start];
  if (opening !== "{" && opening !== "[") {
    let cursor = start;
    while (cursor < text.length && !/[\s,}\]]/u.test(text[cursor] ?? ""))
      cursor += 1;
    return cursor > start ? cursor : undefined;
  }

  const closingStack: string[] = [];
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (character === '"') {
      const end = jsonStringEnd(text, cursor);
      if (end === undefined) return undefined;
      cursor = end - 1;
    } else if (character === "{") closingStack.push("}");
    else if (character === "[") closingStack.push("]");
    else if (character === "}" || character === "]") {
      if (closingStack.pop() !== character) return undefined;
      if (closingStack.length === 0) return cursor + 1;
    }
  }
  return undefined;
}

function scanJsonEntries(body: string): readonly JsonEntryRange[] {
  const entries: JsonEntryRange[] = [];
  let cursor = skipWhitespace(body, 0);
  if (body[cursor] !== "{") return entries;
  cursor += 1;

  while (cursor < body.length) {
    cursor = skipWhitespace(body, cursor);
    if (body[cursor] === "}") return entries;
    const keyStart = cursor;
    const keyEnd = jsonStringEnd(body, keyStart);
    if (keyEnd === undefined) return entries;
    let key: string;
    try {
      key = JSON.parse(body.slice(keyStart, keyEnd)) as string;
    } catch {
      return entries;
    }
    cursor = skipWhitespace(body, keyEnd);
    if (body[cursor] !== ":") return entries;
    cursor = skipWhitespace(body, cursor + 1);
    const valueStart = cursor;
    const valueEnd = jsonValueEnd(body, valueStart);
    if (valueEnd === undefined) return entries;
    entries.push({ key, keyStart, valueStart, valueEnd });
    cursor = skipWhitespace(body, valueEnd);
    if (body[cursor] === ",") cursor += 1;
    else if (body[cursor] === "}") return entries;
    else return entries;
  }

  return entries;
}

function parseJsonEntries(
  sourceId: string,
  body: string,
  bodyStart: number,
  byteOffsets: ByteOffsetIndex,
): ParsedEntries {
  const diagnostics: Diagnostic[] = [];
  const bodySpan = metadataSpan(byteOffsets, bodyStart, 0, body.length);
  let parsedRoot: unknown;
  try {
    parsedRoot = JSON.parse(body) as unknown;
  } catch (error: unknown) {
    diagnostics.push(
      diagnostic(
        sourceId,
        "FRONT_MATTER_PARSE_ERROR",
        "error",
        error instanceof Error ? error.message : "Invalid JSON front matter.",
        bodySpan,
      ),
    );
  }
  if (
    parsedRoot !== undefined &&
    (parsedRoot === null ||
      Array.isArray(parsedRoot) ||
      typeof parsedRoot !== "object")
  ) {
    diagnostics.push(
      diagnostic(
        sourceId,
        "FRONT_MATTER_ROOT_TYPE",
        "error",
        "JSON front matter must contain an object at its root.",
        bodySpan,
      ),
    );
  }

  const entries: MetadataEntry[] = [];
  const keyOrder: string[] = [];
  const seen = new Set<string>();
  for (const range of scanJsonEntries(body)) {
    const span = metadataSpan(
      byteOffsets,
      bodyStart,
      range.keyStart,
      range.valueEnd,
    );
    let rawValue: unknown;
    try {
      rawValue = JSON.parse(
        body.slice(range.valueStart, range.valueEnd),
      ) as unknown;
    } catch {
      continue;
    }
    if (seen.has(range.key)) {
      diagnostics.push(
        diagnostic(
          sourceId,
          "FRONT_MATTER_DUPLICATE_KEY",
          "warning",
          `Duplicate metadata key ${JSON.stringify(range.key)} is retained in source order.`,
          span,
        ),
      );
    }
    seen.add(range.key);
    keyOrder.push(range.key);
    const value = convertMetadataValue(rawValue, {
      sourceId,
      diagnostics,
      ...(span ? { sourceSpan: span } : {}),
    });
    entries.push(
      span
        ? { key: range.key, value, sourceSpan: span }
        : { key: range.key, value },
    );
  }

  return { entries, keyOrder, diagnostics };
}

function findTomlEquals(line: string): number | undefined {
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let cursor = 0; cursor < line.length; cursor += 1) {
    const character = line[cursor];
    if (quote !== undefined) {
      if (quote === '"' && escaped) escaped = false;
      else if (quote === '"' && character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === "=") return cursor;
    else if (character === "#") return undefined;
  }
  return undefined;
}

function splitTomlKey(rawKey: string): readonly string[] {
  const path: string[] = [];
  let cursor = 0;
  while (cursor < rawKey.length) {
    while (/\s/u.test(rawKey[cursor] ?? "")) cursor += 1;
    const quote = rawKey[cursor];
    if (quote === '"' || quote === "'") {
      const start = cursor;
      cursor += 1;
      let escaped = false;
      while (cursor < rawKey.length) {
        const character = rawKey[cursor];
        if (quote === '"' && escaped) escaped = false;
        else if (quote === '"' && character === "\\") escaped = true;
        else if (character === quote) break;
        cursor += 1;
      }
      const literal = rawKey.slice(start, cursor + 1);
      path.push(
        quote === '"' ? (JSON.parse(literal) as string) : literal.slice(1, -1),
      );
      cursor += 1;
    } else {
      const start = cursor;
      while (cursor < rawKey.length && !/[.\s]/u.test(rawKey[cursor] ?? ""))
        cursor += 1;
      if (cursor > start) path.push(rawKey.slice(start, cursor));
    }
    while (/\s/u.test(rawKey[cursor] ?? "")) cursor += 1;
    if (rawKey[cursor] === ".") cursor += 1;
    else break;
  }
  return path;
}

function scanTomlAssignments(body: string): readonly TomlAssignment[] {
  const assignments: TomlAssignment[] = [];
  let cursor = 0;
  while (cursor < body.length) {
    const line = readLine(body, cursor);
    const equals = findTomlEquals(line.content);
    if (equals !== undefined) {
      const path = splitTomlKey(line.content.slice(0, equals));
      if (path.length > 0) {
        assignments.push({
          path,
          start: line.start,
          end: line.contentEnd,
          rawValue: line.content.slice(equals + 1).trim(),
        });
      }
    }
    if (line.end <= cursor) break;
    cursor = line.end;
  }
  return assignments;
}

function lookupPath(root: unknown, path: readonly string[]): unknown {
  let value = root;
  for (const segment of path) {
    if (
      typeof value !== "object" ||
      value === null ||
      !Object.hasOwn(value, segment)
    ) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function parseIsolatedTomlValue(
  path: readonly string[],
  rawValue: string,
): unknown {
  const syntheticKey = JSON.stringify(path.join("."));
  try {
    return lookupPath(parseToml(`${syntheticKey} = ${rawValue}`), [
      path.join("."),
    ]);
  } catch {
    return rawValue;
  }
}

function parseTomlEntries(
  sourceId: string,
  body: string,
  bodyStart: number,
  byteOffsets: ByteOffsetIndex,
): ParsedEntries {
  const diagnostics: Diagnostic[] = [];
  const bodySpan = metadataSpan(byteOffsets, bodyStart, 0, body.length);
  let parsedRoot: unknown;
  try {
    parsedRoot = parseToml(body);
  } catch (error: unknown) {
    diagnostics.push(
      diagnostic(
        sourceId,
        "FRONT_MATTER_PARSE_ERROR",
        "error",
        error instanceof Error ? error.message : "Invalid TOML front matter.",
        bodySpan,
      ),
    );
  }

  const entries: MetadataEntry[] = [];
  const keyOrder: string[] = [];
  const seen = new Set<string>();
  for (const assignment of scanTomlAssignments(body)) {
    const key = assignment.path[0];
    if (key === undefined) continue;
    const span = metadataSpan(
      byteOffsets,
      bodyStart,
      assignment.start,
      assignment.end,
    );
    if (seen.has(key)) {
      diagnostics.push(
        diagnostic(
          sourceId,
          "FRONT_MATTER_DUPLICATE_KEY",
          "warning",
          `Duplicate metadata key ${JSON.stringify(key)} is retained in source order.`,
          span,
        ),
      );
    }
    seen.add(key);
    keyOrder.push(key);
    const parsedValue =
      parsedRoot === undefined
        ? parseIsolatedTomlValue(assignment.path, assignment.rawValue)
        : lookupPath(parsedRoot, assignment.path);
    const value = convertMetadataValue(parsedValue, {
      sourceId,
      diagnostics,
      ...(span ? { sourceSpan: span } : {}),
    });
    entries.push(span ? { key, value, sourceSpan: span } : { key, value });
  }

  return { entries, keyOrder, diagnostics };
}

function parseEntries(
  format: FrontMatterNode["format"],
  sourceId: string,
  body: string,
  bodyStart: number,
  byteOffsets: ByteOffsetIndex,
): ParsedEntries {
  switch (format) {
    case "yaml":
      return parseYamlEntries(sourceId, body, bodyStart, byteOffsets);
    case "toml":
      return parseTomlEntries(sourceId, body, bodyStart, byteOffsets);
    case "json":
      return parseJsonEntries(sourceId, body, bodyStart, byteOffsets);
  }
}

export function extractFrontMatter(
  options: ExtractFrontMatterOptions,
): FrontMatterExtraction {
  const { sourceId, text, definitions, byteOffsets } = options;
  const openingLine = readLine(text, 0);
  const definition = definitions.find(({ open }) =>
    markerMatches(openingLine.content, open),
  );
  if (definition === undefined) return { diagnostics: [] };

  const closingLine = findClosingMarker(
    text,
    openingLine.end,
    definition.close,
  );
  if (closingLine === undefined) {
    return {
      diagnostics: [
        diagnostic(
          sourceId,
          "FRONT_MATTER_UNCLOSED",
          "error",
          `Front matter opened with ${JSON.stringify(definition.open)} but has no closing ${JSON.stringify(definition.close)} marker.`,
          byteOffsets.spanFromOffsets(0, openingLine.contentEnd),
        ),
      ],
    };
  }

  const bodyStart = openingLine.end;
  const bodyEnd = closingLine.start;
  const parsed = parseEntries(
    definition.type,
    sourceId,
    text.slice(bodyStart, bodyEnd),
    bodyStart,
    byteOffsets,
  );
  const sourceSpan = byteOffsets.spanFromOffsets(0, closingLine.contentEnd);
  if (sourceSpan === undefined) {
    return {
      diagnostics: [
        diagnostic(
          sourceId,
          "FRONT_MATTER_SOURCE_SPAN",
          "fatal",
          "Front-matter offsets could not be mapped to source bytes.",
        ),
        ...parsed.diagnostics,
      ],
    };
  }

  return {
    frontMatter: {
      format: definition.type,
      raw: text.slice(0, closingLine.contentEnd),
      openMarker: definition.open,
      closeMarker: definition.close,
      keyOrder: parsed.keyOrder,
      entries: parsed.entries,
      sourceSpan,
    },
    maskRange: { startOffset: 0, endOffset: closingLine.end },
    diagnostics: parsed.diagnostics,
  };
}

export function maskFrontMatter(
  text: string,
  range: FrontMatterRange | undefined,
): string {
  if (range === undefined) return text;
  const masked = text
    .slice(range.startOffset, range.endOffset)
    .replaceAll(/[^\r\n]/gu, " ");
  return (
    text.slice(0, range.startOffset) + masked + text.slice(range.endOffset)
  );
}
