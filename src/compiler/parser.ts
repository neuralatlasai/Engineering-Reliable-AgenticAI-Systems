import { createHash } from "node:crypto";

import { decode, encodingExists } from "iconv-lite";
import katex from "katex";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import sanitizeHtml from "sanitize-html";
import type { BundledLanguage, BundledTheme } from "shiki";
import { unified } from "unified";

import {
  createByteOffsetIndex,
  type ByteOffsetIndex,
  type SourcePositionLike,
} from "./byte-offsets";
import { extractFrontMatter, maskFrontMatter } from "./front-matter";
import type {
  BookCompilerConfig,
  CodeNode,
  CompilerResult,
  Diagnostic,
  DirectiveNode,
  DocumentNode,
  HeadingNode,
  HighlightedCode,
  HighlightedToken,
  HtmlNode,
  MathNode,
  MdxNode,
  ParseContext,
  ParseResult,
  ParserAdapter,
  ParserPolicy,
  ProvenanceRecord,
  RootNode,
  SourceRecord,
  SourceSpan,
  UnsupportedNode,
} from "./model";

export interface DirectiveRegistration {
  readonly securityLevel: DirectiveNode["securityLevel"];
}

export interface RemarkParserAdapterOptions {
  readonly id?: string;
  readonly version?: string;
  readonly directives?: Readonly<Record<string, DirectiveRegistration>>;
}

export interface ResolvedParser {
  readonly adapter: ParserAdapter;
  readonly context: ParseContext;
}

interface MdastNodeLike {
  readonly type: string;
  readonly position?: SourcePositionLike;
  readonly children?: readonly MdastNodeLike[];
  readonly value?: unknown;
  readonly depth?: unknown;
  readonly ordered?: unknown;
  readonly start?: unknown;
  readonly spread?: unknown;
  readonly checked?: unknown;
  readonly lang?: unknown;
  readonly meta?: unknown;
  readonly url?: unknown;
  readonly title?: unknown;
  readonly identifier?: unknown;
  readonly label?: unknown;
  readonly referenceType?: unknown;
  readonly alt?: unknown;
  readonly align?: unknown;
  readonly name?: unknown;
  readonly attributes?: unknown;
  readonly data?: unknown;
  readonly [key: string]: unknown;
}

interface DecodedSource {
  readonly text: string;
  readonly byteOffsetBase: number;
  readonly diagnostics: readonly Diagnostic[];
}

interface NodeLocation {
  readonly sourceSpan?: SourceSpan;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly rawSource: string;
}

interface CodeSource {
  readonly rawCode: string;
  readonly infoString?: string;
  readonly fenceDelimiter?: string;
}

interface ConversionState {
  readonly source: SourceRecord;
  readonly text: string;
  readonly byteOffsets: ByteOffsetIndex;
  readonly context: ParseContext;
  readonly directives: Readonly<Record<string, DirectiveRegistration>>;
  readonly diagnostics: Diagnostic[];
  readonly definitions: Record<
    string,
    Extract<DocumentNode, { readonly type: "definition" }>
  >;
  readonly references: string[];
  readonly usedNodeIds: Map<string, number>;
  readonly provenance: ProvenanceRecord[];
}

const PARSER_VERSION = "1.0.0";
const DEFAULT_ADAPTER_ID = "remark-markdown";
const EXPLICIT_HEADING_ID_PATTERN = /(?:^|\s)\{#([^{}\s]+)\}\s*$/u;

function createDiagnostic(
  sourceId: string,
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  phase: Diagnostic["phase"] = "parse",
  sourceSpan?: SourceSpan,
  nodeId?: string,
): Diagnostic {
  return {
    code,
    severity,
    message,
    phase,
    sourceId,
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
    ...(nodeId === undefined ? {} : { nodeId }),
  };
}

function normalizeEncoding(encoding: string): string {
  return encoding.trim().toLowerCase().replaceAll("_", "-");
}

function bomLength(rawBytes: Uint8Array): number {
  if (rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf)
    return 3;
  if (
    (rawBytes[0] === 0xff && rawBytes[1] === 0xfe) ||
    (rawBytes[0] === 0xfe && rawBytes[1] === 0xff)
  ) {
    return 2;
  }
  return 0;
}

function textDecoderLabel(encoding: string): string | undefined {
  switch (normalizeEncoding(encoding)) {
    case "utf8":
    case "utf-8":
      return "utf-8";
    case "utf16le":
    case "utf-16le":
    case "ucs2":
    case "ucs-2":
      return "utf-16le";
    case "utf16be":
    case "utf-16be":
      return "utf-16be";
    default:
      return undefined;
  }
}

function decodeSource(source: SourceRecord): CompilerResult<DecodedSource> {
  const diagnostics: Diagnostic[] = [];
  const encoding = normalizeEncoding(source.encoding);
  const strictLabel = textDecoderLabel(encoding);
  let text: string;

  try {
    if (strictLabel !== undefined) {
      text = new TextDecoder(strictLabel, {
        fatal: true,
        ignoreBOM: false,
      }).decode(source.rawBytes);
    } else if (encodingExists(encoding)) {
      text = decode(Buffer.from(source.rawBytes), encoding, { stripBOM: true });
    } else {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_UNSUPPORTED_ENCODING",
            "fatal",
            `The configured source encoding ${JSON.stringify(source.encoding)} is unsupported.`,
            "source",
          ),
        ],
      };
    }
  } catch (error: unknown) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          source.sourceId,
          "PARSER_INVALID_ENCODING_SEQUENCE",
          "fatal",
          error instanceof Error
            ? `Source bytes are not valid ${source.encoding}: ${error.message}`
            : `Source bytes are not valid ${source.encoding}.`,
          "source",
        ),
      ],
    };
  }

  const declaredText = source.rawText?.replace(/^\uFEFF/u, "");
  if (declaredText !== undefined && declaredText !== text) {
    diagnostics.push(
      createDiagnostic(
        source.sourceId,
        "PARSER_SOURCE_TEXT_MISMATCH",
        "error",
        "SourceRecord.rawText does not decode to SourceRecord.rawBytes; raw bytes are authoritative.",
        "source",
      ),
    );
  }

  return {
    ok: true,
    value: { text, byteOffsetBase: bomLength(source.rawBytes), diagnostics },
    diagnostics,
  };
}

function nodeOffsets(
  node: MdastNodeLike,
  byteOffsets: ByteOffsetIndex,
): { readonly start: number; readonly end: number } | undefined {
  const { position } = node;
  if (position === undefined) return undefined;
  const start =
    position.start.offset ??
    byteOffsets.utf16OffsetAt(position.start.line, position.start.column);
  const end =
    position.end.offset ??
    byteOffsets.utf16OffsetAt(position.end.line, position.end.column);
  if (start === undefined || end === undefined || start > end) return undefined;
  return { start, end };
}

function locateNode(node: MdastNodeLike, state: ConversionState): NodeLocation {
  const offsets = nodeOffsets(node, state.byteOffsets);
  if (offsets === undefined) return { rawSource: "" };
  const sourceSpan = state.byteOffsets.sourceSpan(
    node.position as SourcePositionLike,
  );
  return {
    rawSource: state.text.slice(offsets.start, offsets.end),
    startOffset: offsets.start,
    endOffset: offsets.end,
    ...(sourceSpan === undefined ? {} : { sourceSpan }),
  };
}

function allocateNodeId(
  state: ConversionState,
  originalType: string,
  location: NodeLocation,
): string {
  const base =
    location.sourceSpan === undefined
      ? `${state.source.sourceId}:generated:${originalType}`
      : `${state.source.sourceId}:${location.sourceSpan.startByte}-${location.sourceSpan.endByte}:${originalType}`;
  const occurrence = state.usedNodeIds.get(base) ?? 0;
  state.usedNodeIds.set(base, occurrence + 1);
  return occurrence === 0 ? base : `${base}:${occurrence + 1}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function referenceType(
  value: unknown,
): "shortcut" | "collapsed" | "full" | undefined {
  return value === "shortcut" || value === "collapsed" || value === "full"
    ? value
    : undefined;
}

function baseNode(
  state: ConversionState,
  originalType: string,
  location: NodeLocation,
): {
  readonly nodeId: string;
  readonly rawSource: string;
  readonly sourceSpan?: SourceSpan;
} {
  const nodeId = allocateNodeId(state, originalType, location);
  return {
    nodeId,
    rawSource: location.rawSource,
    ...(location.sourceSpan === undefined
      ? {}
      : { sourceSpan: location.sourceSpan }),
  };
}

function lineAt(
  text: string,
  start: number,
): {
  readonly content: string;
  readonly start: number;
  readonly contentEnd: number;
  readonly end: number;
} {
  let contentEnd = start;
  while (contentEnd < text.length) {
    const codeUnit = text.charCodeAt(contentEnd);
    if (codeUnit === 0x0a || codeUnit === 0x0d) break;
    contentEnd += 1;
  }
  let end = contentEnd;
  if (text.charCodeAt(end) === 0x0d && text.charCodeAt(end + 1) === 0x0a)
    end += 2;
  else if (text.charCodeAt(end) === 0x0a || text.charCodeAt(end) === 0x0d)
    end += 1;
  return { content: text.slice(start, contentEnd), start, contentEnd, end };
}

function codeSource(rawSource: string): CodeSource {
  const opening = lineAt(rawSource, 0);
  const openingMatch = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)$/u.exec(
    opening.content,
  );
  if (openingMatch === null) return { rawCode: rawSource };

  const fenceDelimiter = openingMatch[2] ?? "";
  const infoString = (openingMatch[3] ?? "").trim();
  let cursor = opening.end;
  let closingStart: number | undefined;
  while (cursor <= rawSource.length) {
    const line = lineAt(rawSource, cursor);
    const trimmed = line.content.trimStart();
    const indentation = line.content.length - trimmed.length;
    let delimiterLength = 0;
    while (trimmed[delimiterLength] === fenceDelimiter[0]) delimiterLength += 1;
    if (
      indentation <= 3 &&
      delimiterLength >= fenceDelimiter.length &&
      trimmed.slice(delimiterLength).trim().length === 0
    ) {
      closingStart = line.start;
      break;
    }
    if (line.end <= cursor || line.end >= rawSource.length) break;
    cursor = line.end;
  }

  return {
    rawCode: rawSource.slice(opening.end, closingStart ?? rawSource.length),
    fenceDelimiter,
    ...(infoString.length === 0 ? {} : { infoString }),
  };
}

function removeOneTrailingNewline(value: string): string {
  if (value.endsWith("\r\n")) return value.slice(0, -2);
  if (value.endsWith("\r") || value.endsWith("\n")) return value.slice(0, -1);
  return value;
}

function mathSource(
  rawSource: string,
  displayMode: boolean,
  fallback: string,
): string {
  if (!displayMode) {
    return rawSource.startsWith("$") &&
      rawSource.endsWith("$") &&
      rawSource.length >= 2
      ? rawSource.slice(1, -1)
      : fallback;
  }
  if (rawSource.startsWith("$$") && rawSource.endsWith("$$")) {
    if (
      !rawSource.slice(2).includes("\n") &&
      !rawSource.slice(2).includes("\r")
    ) {
      return rawSource.slice(2, -2);
    }
    const opening = lineAt(rawSource, 0);
    let cursor = opening.end;
    let closingStart: number | undefined;
    while (cursor <= rawSource.length) {
      const line = lineAt(rawSource, cursor);
      if (line.content.trim() === "$$") {
        closingStart = line.start;
        break;
      }
      if (line.end <= cursor || line.end >= rawSource.length) break;
      cursor = line.end;
    }
    if (closingStart !== undefined) {
      return removeOneTrailingNewline(
        rawSource.slice(opening.end, closingStart),
      );
    }
  }
  return fallback;
}

function renderMath(
  source: string,
  displayMode: boolean,
  state: ConversionState,
  sourceSpan: SourceSpan | undefined,
  nodeId: string,
): Pick<MathNode, "renderedHtml" | "renderError"> {
  if (!state.context.config.renderingPolicy.math) return {};
  try {
    return {
      renderedHtml: katex.renderToString(source, {
        displayMode,
        output: "htmlAndMathml",
        strict: "error",
        throwOnError: true,
        trust: false,
      }),
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "KaTeX could not render this equation.";
    state.diagnostics.push(
      createDiagnostic(
        state.source.sourceId,
        "PARSER_MATH_RENDER_FAILED",
        "warning",
        `${message} The original equation source is preserved as the safe fallback.`,
        "render",
        sourceSpan,
        nodeId,
      ),
    );
    return { renderError: message };
  }
}

function htmlDisposition(state: ConversionState): HtmlNode["disposition"] {
  const policy = state.context.config.renderingPolicy.rawHtml;
  if (policy === "reject") return "rejected";
  if (policy === "escape") return "escaped";
  return "sanitized";
}

function sanitizeRawHtml(value: string, config: BookCompilerConfig): string {
  return sanitizeHtml(value, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "details",
      "summary",
      "figure",
      "figcaption",
      "picture",
      "source",
    ]),
    allowedAttributes: {
      "*": ["class", "id", "title", "dir", "lang", "role", "aria-*", "data-*"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading"],
      source: ["src", "srcset", "type", "media", "sizes"],
    },
    allowedSchemes: [...config.linkPolicy.allowedProtocols],
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
  });
}

function extractPlainText(nodes: readonly DocumentNode[]): string {
  const fragments: string[] = [];
  const stack = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    switch (node.type) {
      case "text":
        fragments.push(node.value);
        break;
      case "inlineCode":
        fragments.push(node.value);
        break;
      case "image":
      case "imageReference":
        if (node.alt !== undefined) fragments.push(node.alt);
        break;
      case "math":
      case "inlineMath":
        fragments.push(node.source);
        break;
      case "break":
        fragments.push(" ");
        break;
      default: {
        const children = childrenOf(node);
        for (let index = children.length - 1; index >= 0; index -= 1) {
          const child = children[index];
          if (child !== undefined) stack.push(child);
        }
      }
    }
  }
  return fragments.join("");
}

function childrenOf(node: DocumentNode): readonly DocumentNode[] {
  if ("children" in node) return node.children;
  return [];
}

function stripExplicitIdFromChildren(
  children: readonly DocumentNode[],
): readonly DocumentNode[] {
  if (children.length === 0) return children;
  const last = children[children.length - 1];
  if (last?.type !== "text") return children;
  const match = EXPLICIT_HEADING_ID_PATTERN.exec(last.value);
  if (match === null) return children;
  const replacement = last.value.slice(0, match.index).trimEnd();
  return [...children.slice(0, -1), { ...last, value: replacement }];
}

function explicitIdFromData(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const properties = (data as Record<string, unknown>)["hProperties"];
  if (typeof properties !== "object" || properties === null) return undefined;
  return stringValue((properties as Record<string, unknown>)["id"]);
}

function safeOpaqueValue(value: unknown, depth = 0): unknown {
  if (depth >= 8) return "[opaque-depth-limit]";
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value))
    return value.map((item) => safeOpaqueValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const key of Object.keys(value).sort()) {
      if (key === "children" || key === "position" || key === "type") continue;
      result[key] = safeOpaqueValue(
        (value as Record<string, unknown>)[key],
        depth + 1,
      );
    }
    return result;
  }
  return String(value);
}

function opaqueData(node: MdastNodeLike): Readonly<Record<string, unknown>> {
  return safeOpaqueValue(node) as Readonly<Record<string, unknown>>;
}

function unsupportedSeverity(state: ConversionState): Diagnostic["severity"] {
  if (state.context.config.renderingPolicy.unknownNodes === "reject")
    return "error";
  return state.context.config.validationPolicy.unsupportedSyntax;
}

function convertChildren(
  node: MdastNodeLike,
  state: ConversionState,
): readonly DocumentNode[] {
  return (node.children ?? []).map((child) => convertMdastNode(child, state));
}

function convertUnsupported(
  node: MdastNodeLike,
  state: ConversionState,
): UnsupportedNode {
  const location = locateNode(node, state);
  const base = baseNode(state, node.type, location);
  const converted: UnsupportedNode = {
    ...base,
    type: "unsupported",
    originalType: node.type,
    opaqueData: opaqueData(node),
    children: convertChildren(node, state),
  };
  state.diagnostics.push(
    createDiagnostic(
      state.source.sourceId,
      "PARSER_UNSUPPORTED_NODE",
      unsupportedSeverity(state),
      `MDAST node type ${JSON.stringify(node.type)} is preserved as an unsupported node.`,
      "ast",
      location.sourceSpan,
      converted.nodeId,
    ),
  );
  return converted;
}

function parentNode(
  node: MdastNodeLike,
  state: ConversionState,
  type:
    | "paragraph"
    | "blockquote"
    | "strong"
    | "emphasis"
    | "delete"
    | "tableRow"
    | "tableCell",
): DocumentNode {
  const location = locateNode(node, state);
  return {
    ...baseNode(state, node.type, location),
    type,
    children: convertChildren(node, state),
  };
}

function directiveAttributes(value: unknown): Readonly<Record<string, string>> {
  const result: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return result;
  for (const [key, attributeValue] of Object.entries(value)) {
    if (attributeValue === null || attributeValue === undefined)
      result[key] = "";
    else result[key] = String(attributeValue);
  }
  return result;
}

function convertDirective(
  node: MdastNodeLike,
  state: ConversionState,
  type: DirectiveNode["type"],
): DirectiveNode {
  const location = locateNode(node, state);
  const name = stringValue(node.name) ?? "";
  const registration = state.directives[name];
  return {
    ...baseNode(state, node.type, location),
    type,
    name,
    attributes: directiveAttributes(node.attributes),
    children: convertChildren(node, state),
    known: registration !== undefined,
    securityLevel: registration?.securityLevel ?? "restricted",
  };
}

function convertMdx(
  node: MdastNodeLike,
  state: ConversionState,
  type: MdxNode["type"],
): MdxNode {
  const location = locateNode(node, state);
  const value = stringValue(node.value);
  const name = stringValue(node.name);
  return {
    ...baseNode(state, node.type, location),
    type,
    ...(value === undefined ? {} : { value }),
    ...(name === undefined ? {} : { name }),
    children: convertChildren(node, state),
    quarantined: true,
  };
}

function convertMdastNode(
  node: MdastNodeLike,
  state: ConversionState,
): DocumentNode {
  switch (node.type) {
    case "root": {
      const location = locateNode(node, state);
      return {
        ...baseNode(state, node.type, location),
        type: "root",
        children: convertChildren(node, state),
      };
    }
    case "text": {
      const location = locateNode(node, state);
      return {
        ...baseNode(state, node.type, location),
        type: "text",
        value: stringValue(node.value) ?? "",
      };
    }
    case "paragraph":
    case "blockquote":
    case "strong":
    case "emphasis":
    case "delete":
    case "tableRow":
    case "tableCell":
      return parentNode(node, state, node.type);
    case "table": {
      const location = locateNode(node, state);
      const rawAlign = Array.isArray(node.align) ? node.align : [];
      const align = rawAlign.map((value) =>
        value === "left" || value === "right" || value === "center"
          ? value
          : null,
      );
      return {
        ...baseNode(state, node.type, location),
        type: "table",
        children: convertChildren(node, state),
        align,
      };
    }
    case "footnoteDefinition": {
      const location = locateNode(node, state);
      const identifier = stringValue(node.identifier) ?? "";
      const label = stringValue(node.label);
      return {
        ...baseNode(state, node.type, location),
        type: "footnoteDefinition",
        children: convertChildren(node, state),
        identifier,
        ...(label === undefined ? {} : { label }),
      };
    }
    case "heading": {
      const depth = finiteNumber(node.depth);
      if (
        depth === undefined ||
        depth < 1 ||
        depth > 6 ||
        !Number.isInteger(depth)
      ) {
        return convertUnsupported(node, state);
      }
      const location = locateNode(node, state);
      const children = convertChildren(node, state);
      const text = extractPlainText(children);
      const explicitMatch = EXPLICIT_HEADING_ID_PATTERN.exec(text);
      const explicitId = explicitIdFromData(node.data) ?? explicitMatch?.[1];
      const displayText =
        explicitMatch === null
          ? text
          : text.slice(0, explicitMatch.index).trimEnd();
      const base = baseNode(state, node.type, location);
      if (explicitMatch !== null) {
        state.provenance.push({
          transformId: "parser:explicit-heading-id",
          transformVersion: PARSER_VERSION,
          inputNodeIds: [base.nodeId],
          outputNodeIds: [base.nodeId],
          mutationType: "normalize",
          justification:
            "Separate authored heading-ID syntax from display text while retaining rawSource.",
          reversible: true,
        });
      }
      return {
        ...base,
        type: "heading",
        depth: depth as HeadingNode["depth"],
        children:
          explicitMatch === null
            ? children
            : stripExplicitIdFromChildren(children),
        authoredText: text,
        displayText,
        ...(explicitId === undefined ? {} : { explicitId }),
        effectiveId: "",
      };
    }
    case "list": {
      const location = locateNode(node, state);
      const ordered = booleanValue(node.ordered) ?? false;
      const start = finiteNumber(node.start);
      return {
        ...baseNode(state, node.type, location),
        type: "list",
        children: convertChildren(node, state),
        ordered,
        ...(start === undefined ? {} : { start }),
        spread: booleanValue(node.spread) ?? false,
      };
    }
    case "listItem": {
      const location = locateNode(node, state);
      const checked = booleanValue(node.checked);
      return {
        ...baseNode(state, node.type, location),
        type: "listItem",
        children: convertChildren(node, state),
        ...(checked === undefined ? {} : { checked }),
        spread: booleanValue(node.spread) ?? false,
      };
    }
    case "break":
    case "thematicBreak": {
      const location = locateNode(node, state);
      return { ...baseNode(state, node.type, location), type: node.type };
    }
    case "inlineCode": {
      const location = locateNode(node, state);
      return {
        ...baseNode(state, node.type, location),
        type: "inlineCode",
        value: stringValue(node.value) ?? "",
      };
    }
    case "code": {
      const location = locateNode(node, state);
      const literal = codeSource(location.rawSource);
      const language = stringValue(node.lang);
      const meta = stringValue(node.meta);
      return {
        ...baseNode(state, node.type, location),
        type: "code",
        rawCode: literal.rawCode,
        displayCode: stringValue(node.value) ?? "",
        ...(language === undefined ? {} : { language }),
        ...(meta === undefined ? {} : { meta }),
        ...(literal.infoString === undefined
          ? {}
          : { infoString: literal.infoString }),
        ...(literal.fenceDelimiter === undefined
          ? {}
          : { fenceDelimiter: literal.fenceDelimiter }),
      };
    }
    case "link":
    case "linkReference": {
      const location = locateNode(node, state);
      const url = stringValue(node.url);
      const title = stringValue(node.title);
      const identifier = stringValue(node.identifier);
      const label = stringValue(node.label);
      const authoredReferenceType = referenceType(node.referenceType);
      if (identifier !== undefined) state.references.push(identifier);
      return {
        ...baseNode(state, node.type, location),
        type: node.type,
        children: convertChildren(node, state),
        ...(url === undefined ? {} : { url }),
        ...(title === undefined ? {} : { title }),
        ...(identifier === undefined ? {} : { identifier }),
        ...(label === undefined ? {} : { label }),
        ...(authoredReferenceType === undefined
          ? {}
          : { referenceType: authoredReferenceType }),
      };
    }
    case "image":
    case "imageReference": {
      const location = locateNode(node, state);
      const url = stringValue(node.url);
      const alt = stringValue(node.alt);
      const title = stringValue(node.title);
      const identifier = stringValue(node.identifier);
      const label = stringValue(node.label);
      const authoredReferenceType = referenceType(node.referenceType);
      if (identifier !== undefined) state.references.push(identifier);
      return {
        ...baseNode(state, node.type, location),
        type: node.type,
        ...(url === undefined ? {} : { url }),
        ...(alt === undefined ? {} : { alt }),
        ...(title === undefined ? {} : { title }),
        ...(identifier === undefined ? {} : { identifier }),
        ...(label === undefined ? {} : { label }),
        ...(authoredReferenceType === undefined
          ? {}
          : { referenceType: authoredReferenceType }),
      };
    }
    case "definition": {
      const location = locateNode(node, state);
      const identifier = stringValue(node.identifier) ?? "";
      const label = stringValue(node.label);
      const title = stringValue(node.title);
      const definition = {
        ...baseNode(state, node.type, location),
        type: "definition" as const,
        identifier,
        ...(label === undefined ? {} : { label }),
        url: stringValue(node.url) ?? "",
        ...(title === undefined ? {} : { title }),
      };
      const normalizedIdentifier = identifier.toLowerCase();
      const existing = state.definitions[normalizedIdentifier];
      if (existing === undefined)
        state.definitions[normalizedIdentifier] = definition;
      else {
        state.diagnostics.push(
          createDiagnostic(
            state.source.sourceId,
            "PARSER_DUPLICATE_DEFINITION",
            "warning",
            `Duplicate reference definition ${JSON.stringify(identifier)} is preserved; the first definition is canonical.`,
            "ast",
            location.sourceSpan,
            definition.nodeId,
          ),
        );
      }
      return definition;
    }
    case "html": {
      const location = locateNode(node, state);
      const value = location.rawSource || stringValue(node.value) || "";
      const disposition = htmlDisposition(state);
      const base = baseNode(state, node.type, location);
      if (disposition === "rejected") {
        state.diagnostics.push(
          createDiagnostic(
            state.source.sourceId,
            "PARSER_RAW_HTML_REJECTED",
            "error",
            "Raw HTML is retained in the IR but rejected by rendering policy.",
            "ast",
            location.sourceSpan,
            base.nodeId,
          ),
        );
      }
      return {
        ...base,
        type: "html",
        value,
        disposition,
        ...(disposition === "sanitized"
          ? { sanitizedValue: sanitizeRawHtml(value, state.context.config) }
          : {}),
      };
    }
    case "math":
    case "inlineMath": {
      const location = locateNode(node, state);
      const base = baseNode(state, node.type, location);
      const source = mathSource(
        location.rawSource,
        node.type === "math",
        stringValue(node.value) ?? "",
      );
      return {
        ...base,
        type: node.type,
        source,
        ...renderMath(
          source,
          node.type === "math",
          state,
          location.sourceSpan,
          base.nodeId,
        ),
      };
    }
    case "footnoteReference": {
      const location = locateNode(node, state);
      const identifier = stringValue(node.identifier) ?? "";
      const label = stringValue(node.label);
      state.references.push(identifier);
      return {
        ...baseNode(state, node.type, location),
        type: "footnoteReference",
        identifier,
        ...(label === undefined ? {} : { label }),
      };
    }
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
      return convertDirective(node, state, node.type);
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
    case "mdxjsEsm":
      return convertMdx(node, state, node.type);
    default:
      return convertUnsupported(node, state);
  }
}

function collectNodes(root: RootNode): readonly DocumentNode[] {
  const result: DocumentNode[] = [];
  const stack: DocumentNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    result.push(node);
    const children = childrenOf(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) stack.push(child);
    }
  }
  return result;
}

function slugifyHeading(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replaceAll(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[^\p{Letter}\p{Number}_-]+/gu, "-")
    .replaceAll(/-{2,}/gu, "-")
    .replaceAll(/^-|-$/gu, "");
  return slug.length === 0 ? "section" : slug;
}

function collisionHash(node: HeadingNode): string {
  return createHash("sha256")
    .update(node.nodeId, "utf8")
    .digest("hex")
    .slice(0, 10);
}

function allocateGeneratedHeadingId(
  base: string,
  used: ReadonlySet<string>,
): string {
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function finalizeHeadingIds(
  root: RootNode,
  state: ConversionState,
): ReadonlyMap<string, string> {
  const headings = collectNodes(root).filter(
    (node): node is HeadingNode => node.type === "heading",
  );
  const reservedExplicitIds = new Set(
    headings.flatMap((heading) =>
      heading.explicitId === undefined ? [] : [heading.explicitId],
    ),
  );
  const used = new Set<string>();
  const occurrences = new Map<string, number>();
  const effectiveIds = new Map<string, string>();

  for (const heading of headings) {
    if (heading.explicitId === undefined) continue;
    const occurrence = occurrences.get(heading.explicitId) ?? 0;
    occurrences.set(heading.explicitId, occurrence + 1);
    let effectiveId = heading.explicitId;
    if (occurrence > 0) {
      if (
        state.context.config.validationPolicy.duplicateExplicitHeadingId ===
        "error"
      ) {
        state.diagnostics.push(
          createDiagnostic(
            state.source.sourceId,
            "PARSER_DUPLICATE_EXPLICIT_HEADING_ID",
            "error",
            `Explicit heading identifier ${JSON.stringify(heading.explicitId)} is duplicated.`,
            "ast",
            heading.sourceSpan,
            heading.nodeId,
          ),
        );
      } else {
        const hashBase = `${heading.explicitId}-${collisionHash(heading)}`;
        effectiveId = allocateGeneratedHeadingId(hashBase, used);
        state.diagnostics.push(
          createDiagnostic(
            state.source.sourceId,
            "PARSER_DUPLICATE_EXPLICIT_HEADING_ID_SUFFIXED",
            "warning",
            `Duplicate explicit heading identifier ${JSON.stringify(heading.explicitId)} received a deterministic hash suffix.`,
            "ast",
            heading.sourceSpan,
            heading.nodeId,
          ),
        );
      }
    }
    effectiveIds.set(heading.nodeId, effectiveId);
    used.add(effectiveId);
  }

  for (const heading of headings) {
    if (heading.explicitId !== undefined) continue;
    const base = slugifyHeading(heading.displayText);
    const occupied = new Set([...used, ...reservedExplicitIds]);
    const effectiveId = allocateGeneratedHeadingId(base, occupied);
    effectiveIds.set(heading.nodeId, effectiveId);
    used.add(effectiveId);
  }

  return effectiveIds;
}

function highlightedTokens(
  rows: readonly (readonly {
    readonly content: string;
    readonly color?: string;
    readonly fontStyle?: number;
  }[])[],
): readonly (readonly HighlightedToken[])[] {
  return rows.map((row) =>
    row.map((token) => ({
      content: token.content,
      ...(token.color === undefined ? {} : { color: token.color }),
      ...(token.fontStyle === undefined ? {} : { fontStyle: token.fontStyle }),
    })),
  );
}

async function buildHighlights(
  root: RootNode,
  state: ConversionState,
): Promise<ReadonlyMap<string, HighlightedCode>> {
  const result = new Map<string, HighlightedCode>();
  if (!state.context.config.renderingPolicy.syntaxHighlighting) return result;
  const codeNodes = collectNodes(root).filter(
    (node): node is CodeNode => node.type === "code",
  );
  if (codeNodes.every((node) => node.language === undefined)) return result;

  const shiki = await import("shiki");
  const lightTheme = state.context.config.renderingPolicy.lightCodeTheme;
  const darkTheme = state.context.config.renderingPolicy.darkCodeTheme;
  if (
    !(lightTheme in shiki.bundledThemes) ||
    !(darkTheme in shiki.bundledThemes)
  ) {
    state.diagnostics.push(
      createDiagnostic(
        state.source.sourceId,
        "PARSER_UNKNOWN_SHIKI_THEME",
        "error",
        `Configured Shiki themes ${JSON.stringify(lightTheme)} and ${JSON.stringify(darkTheme)} must both be bundled themes.`,
        "render",
      ),
    );
    return result;
  }

  for (const node of codeNodes) {
    const language = node.language;
    if (language === undefined) continue;
    const normalizedLanguage = language.toLowerCase();
    if (
      normalizedLanguage === "text" ||
      normalizedLanguage === "txt" ||
      normalizedLanguage === "plain" ||
      normalizedLanguage === "plaintext"
    ) {
      continue;
    }
    const canonicalLanguage =
      normalizedLanguage in shiki.bundledLanguages
        ? normalizedLanguage
        : undefined;
    if (canonicalLanguage === undefined) {
      state.diagnostics.push(
        createDiagnostic(
          state.source.sourceId,
          "PARSER_UNKNOWN_CODE_LANGUAGE",
          "warning",
          `Code language ${JSON.stringify(language)} is not bundled by Shiki; plain code is preserved.`,
          "render",
          node.sourceSpan,
          node.nodeId,
        ),
      );
      continue;
    }

    try {
      // Sequential tokenization bounds peak memory for books with many large
      // code blocks. Shiki's singleton internally caches loaded grammars.
      const light = await shiki.codeToTokens(node.displayCode, {
        lang: canonicalLanguage as BundledLanguage,
        theme: lightTheme as BundledTheme,
      });
      const dark = await shiki.codeToTokens(node.displayCode, {
        lang: canonicalLanguage as BundledLanguage,
        theme: darkTheme as BundledTheme,
      });
      result.set(node.nodeId, {
        language,
        light: highlightedTokens(light.tokens),
        dark: highlightedTokens(dark.tokens),
      });
    } catch (error: unknown) {
      state.diagnostics.push(
        createDiagnostic(
          state.source.sourceId,
          "PARSER_CODE_HIGHLIGHT_FAILED",
          "warning",
          error instanceof Error
            ? `Shiki failed to highlight ${JSON.stringify(language)}: ${error.message}`
            : `Shiki failed to highlight ${JSON.stringify(language)}.`,
          "render",
          node.sourceSpan,
          node.nodeId,
        ),
      );
    }
  }
  return result;
}

function enrichTree(
  node: DocumentNode,
  headingIds: ReadonlyMap<string, string>,
  highlights: ReadonlyMap<string, HighlightedCode>,
): DocumentNode {
  let enriched: DocumentNode = node;
  const children = childrenOf(node);
  if (children.length > 0) {
    enriched = {
      ...node,
      children: children.map((child) =>
        enrichTree(child, headingIds, highlights),
      ),
    } as DocumentNode;
  }
  if (enriched.type === "heading") {
    return {
      ...enriched,
      effectiveId: headingIds.get(enriched.nodeId) ?? "section",
    };
  }
  if (enriched.type === "code") {
    const highlightedRepresentation = highlights.get(enriched.nodeId);
    return highlightedRepresentation === undefined
      ? enriched
      : { ...enriched, highlightedRepresentation };
  }
  return enriched;
}

function sourceMapFor(root: RootNode): Readonly<Record<string, SourceSpan>> {
  const sourceMap: Record<string, SourceSpan> = Object.create(null) as Record<
    string,
    SourceSpan
  >;
  for (const node of collectNodes(root)) {
    if (node.sourceSpan !== undefined) sourceMap[node.nodeId] = node.sourceSpan;
  }
  return sourceMap;
}

function rootSourceSpan(
  text: string,
  source: SourceRecord,
  byteOffsets: ByteOffsetIndex,
): SourceSpan {
  const end = byteOffsets.pointAt(text.length);
  return {
    startByte: 0,
    endByte: source.rawBytes.byteLength,
    startLine: 1,
    startColumn: 1,
    endLine: end?.line ?? 1,
    endColumn: end?.column ?? 1,
  };
}

function parseDialect(
  context: ParseContext,
): ParserPolicy["dialects"][string] | undefined {
  return context.config.parserPolicy.dialects[context.adapterId];
}

export class RemarkParserAdapter implements ParserAdapter {
  readonly id: string;
  readonly version: string;
  readonly #directives: Readonly<Record<string, DirectiveRegistration>>;

  constructor(options: RemarkParserAdapterOptions = {}) {
    this.id = options.id ?? DEFAULT_ADAPTER_ID;
    this.version = options.version ?? PARSER_VERSION;
    this.#directives = options.directives ?? Object.create(null);
  }

  supports(source: SourceRecord, context: ParseContext): boolean {
    return source.sourceKind === "document" && context.adapterId === this.id;
  }

  async parse(
    source: SourceRecord,
    context: ParseContext,
  ): Promise<CompilerResult<ParseResult>> {
    if (!this.supports(source, context)) {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_ADAPTER_MISMATCH",
            "fatal",
            `Adapter ${JSON.stringify(this.id)} cannot parse context adapter ${JSON.stringify(context.adapterId)}.`,
          ),
        ],
      };
    }
    if (
      source.rawBytes.byteLength >
        context.config.validationPolicy.maxSourceBytes ||
      source.byteLength > context.config.validationPolicy.maxSourceBytes
    ) {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_SOURCE_TOO_LARGE",
            "fatal",
            `Source exceeds the configured ${context.config.validationPolicy.maxSourceBytes}-byte limit.`,
            "source",
          ),
        ],
      };
    }
    if (source.byteLength !== source.rawBytes.byteLength) {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_BYTE_LENGTH_MISMATCH",
            "fatal",
            "SourceRecord.byteLength does not equal rawBytes.byteLength.",
            "source",
          ),
        ],
      };
    }

    const decoded = decodeSource(source);
    if (!decoded.ok) return decoded;
    const { text, byteOffsetBase } = decoded.value;
    let byteOffsets: ByteOffsetIndex;
    try {
      byteOffsets = createByteOffsetIndex(text, {
        encoding: source.encoding,
        byteOffsetBase,
      });
    } catch (error: unknown) {
      return {
        ok: false,
        diagnostics: [
          ...decoded.diagnostics,
          createDiagnostic(
            source.sourceId,
            "PARSER_BYTE_INDEX_FAILED",
            "fatal",
            error instanceof Error
              ? error.message
              : "Byte-offset indexing failed.",
            "source",
          ),
        ],
      };
    }
    if (byteOffsets.byteLength !== source.rawBytes.byteLength) {
      return {
        ok: false,
        diagnostics: [
          ...decoded.diagnostics,
          createDiagnostic(
            source.sourceId,
            "PARSER_BYTE_MAPPING_MISMATCH",
            "fatal",
            `Decoded text maps to ${byteOffsets.byteLength} bytes, but the source contains ${source.rawBytes.byteLength} bytes.`,
            "source",
          ),
        ],
      };
    }

    const frontMatter = extractFrontMatter({
      sourceId: source.sourceId,
      text,
      definitions: context.config.parserPolicy.frontMatter,
      byteOffsets,
    });
    const dialect = parseDialect(context);
    const diagnostics: Diagnostic[] = [
      ...decoded.diagnostics,
      ...frontMatter.diagnostics,
      ...(dialect === undefined
        ? [
            createDiagnostic(
              source.sourceId,
              "PARSER_DIALECT_NOT_CONFIGURED",
              "fatal",
              `No syntax capability matrix exists for adapter ${JSON.stringify(context.adapterId)}.`,
            ),
          ]
        : []),
    ];
    if (diagnostics.some(({ severity }) => severity === "fatal")) {
      return { ok: false, diagnostics };
    }

    const processor = unified().use(remarkParse);
    if (dialect?.gfm) processor.use(remarkGfm);
    if (dialect?.math) processor.use(remarkMath);
    if (dialect?.directives) processor.use(remarkDirective);
    if (dialect?.mdx) processor.use(remarkMdx);

    let mdastRoot: MdastNodeLike;
    try {
      const maskedText = maskFrontMatter(text, frontMatter.maskRange);
      // Masking changes neither UTF-16 length nor line terminators, so every
      // Unified position remains valid against the original byte-preserved text.
      if (maskedText.length !== text.length) {
        return {
          ok: false,
          diagnostics: [
            ...diagnostics,
            createDiagnostic(
              source.sourceId,
              "PARSER_FRONT_MATTER_MASK_INVARIANT",
              "fatal",
              "Front-matter masking changed the source length.",
            ),
          ],
        };
      }
      mdastRoot = processor.parse(maskedText) as unknown as MdastNodeLike;
    } catch (error: unknown) {
      return {
        ok: false,
        diagnostics: [
          ...diagnostics,
          createDiagnostic(
            source.sourceId,
            "PARSER_UNRECOVERABLE_PARSE_ERROR",
            "fatal",
            error instanceof Error
              ? error.message
              : "Unified failed to parse the document.",
          ),
        ],
      };
    }

    const state: ConversionState = {
      source,
      text,
      byteOffsets,
      context,
      directives: this.#directives,
      diagnostics,
      definitions: Object.create(null) as ConversionState["definitions"],
      references: [],
      usedNodeIds: new Map(),
      provenance: [],
    };
    const converted = convertMdastNode(mdastRoot, state);
    if (converted.type !== "root") {
      return {
        ok: false,
        diagnostics: [
          ...diagnostics,
          createDiagnostic(
            source.sourceId,
            "PARSER_ROOT_NODE_INVALID",
            "fatal",
            "Unified did not return an MDAST root node.",
          ),
        ],
      };
    }
    const sourceRoot: RootNode = {
      ...converted,
      rawSource: text,
      sourceSpan: rootSourceSpan(text, source, byteOffsets),
    };
    const headingIds = finalizeHeadingIds(sourceRoot, state);
    const highlights = await buildHighlights(sourceRoot, state);
    const enriched = enrichTree(sourceRoot, headingIds, highlights);
    if (enriched.type !== "root") {
      return {
        ok: false,
        diagnostics: [
          ...diagnostics,
          createDiagnostic(
            source.sourceId,
            "PARSER_ROOT_ENRICHMENT_INVALID",
            "fatal",
            "Parser enrichment did not preserve the root-node type.",
          ),
        ],
      };
    }
    const nodes = collectNodes(enriched);
    state.provenance.unshift({
      transformId: "parser:mdast-to-lossless-ir",
      transformVersion: this.version,
      inputNodeIds: [enriched.nodeId],
      outputNodeIds: nodes.map(({ nodeId }) => nodeId),
      mutationType: "preserve",
      justification:
        "Convert every MDAST node into typed IR while retaining original source slices.",
      reversible: true,
    });
    if (highlights.size > 0) {
      state.provenance.push({
        transformId: "parser:shiki-build-time-highlighting",
        transformVersion: this.version,
        inputNodeIds: [...highlights.keys()],
        outputNodeIds: [...highlights.keys()],
        mutationType: "annotate",
        justification:
          "Attach build-time tokens without changing raw or display code.",
        reversible: true,
      });
    }

    const unsupportedNodes = nodes.filter(
      (node): node is UnsupportedNode => node.type === "unsupported",
    );
    const parseResult: ParseResult = {
      sourceId: source.sourceId,
      parserId: this.id,
      parserVersion: this.version,
      document: enriched,
      ...(frontMatter.frontMatter === undefined
        ? {}
        : { frontMatter: frontMatter.frontMatter }),
      definitions: state.definitions,
      references: state.references,
      diagnostics,
      sourceMap: sourceMapFor(enriched),
      unsupportedNodes,
      provenance: state.provenance,
    };
    return { ok: true, value: parseResult, diagnostics };
  }
}

export function createRemarkParserAdapter(
  options: RemarkParserAdapterOptions = {},
): RemarkParserAdapter {
  return new RemarkParserAdapter(options);
}

function normalizeExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase();
  return normalized.startsWith(".") ? normalized : `.${normalized}`;
}

export function configuredAdapterId(
  source: SourceRecord,
  parserPolicy: ParserPolicy,
): CompilerResult<string> {
  const normalizedExtension = normalizeExtension(source.extension);
  const matchingIds = new Set<string>();
  for (const [extension, adapterId] of Object.entries(
    parserPolicy.extensionAdapters,
  )) {
    if (normalizeExtension(extension) === normalizedExtension)
      matchingIds.add(adapterId);
  }
  if (matchingIds.size > 1) {
    return {
      ok: false,
      diagnostics: [
        createDiagnostic(
          source.sourceId,
          "PARSER_AMBIGUOUS_EXTENSION_ADAPTER",
          "fatal",
          `Extension ${JSON.stringify(normalizedExtension)} maps to multiple parser adapters.`,
          "source",
        ),
      ],
    };
  }
  return {
    ok: true,
    value: matchingIds.values().next().value ?? parserPolicy.defaultAdapter,
    diagnostics: [],
  };
}

export class ParserRegistry {
  readonly #adapters = new Map<string, ParserAdapter>();
  readonly #duplicateIds = new Set<string>();

  constructor(adapters: readonly ParserAdapter[]) {
    for (const adapter of adapters) {
      if (this.#adapters.has(adapter.id)) this.#duplicateIds.add(adapter.id);
      else this.#adapters.set(adapter.id, adapter);
    }
  }

  resolve(
    source: SourceRecord,
    config: BookCompilerConfig,
  ): CompilerResult<ResolvedParser> {
    if (this.#duplicateIds.size > 0) {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_DUPLICATE_ADAPTER_ID",
            "fatal",
            `Parser registry contains duplicate IDs: ${[...this.#duplicateIds].sort().join(", ")}.`,
            "source",
          ),
        ],
      };
    }
    const selected = configuredAdapterId(source, config.parserPolicy);
    if (!selected.ok) return selected;
    const adapter = this.#adapters.get(selected.value);
    if (adapter === undefined) {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_ADAPTER_NOT_REGISTERED",
            "fatal",
            `Configured parser adapter ${JSON.stringify(selected.value)} is not registered.`,
            "source",
          ),
        ],
      };
    }
    const context: ParseContext = { config, adapterId: selected.value };
    if (!adapter.supports(source, context)) {
      return {
        ok: false,
        diagnostics: [
          createDiagnostic(
            source.sourceId,
            "PARSER_ADAPTER_UNSUPPORTED_SOURCE",
            "fatal",
            `Parser adapter ${JSON.stringify(adapter.id)} does not support this source.`,
            "source",
          ),
        ],
      };
    }
    return { ok: true, value: { adapter, context }, diagnostics: [] };
  }

  async parse(
    source: SourceRecord,
    config: BookCompilerConfig,
  ): Promise<CompilerResult<ParseResult>> {
    const resolved = this.resolve(source, config);
    return resolved.ok
      ? resolved.value.adapter.parse(source, resolved.value.context)
      : resolved;
  }
}
