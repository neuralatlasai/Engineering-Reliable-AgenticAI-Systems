import type {
  DocumentNode,
  PreservationReport,
  PreservationViolation,
  RootNode,
} from "./model";

export interface PreservationSnapshot {
  readonly totalNodeCount: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly nodeOrder: readonly string[];
  readonly fingerprints: Readonly<Record<string, string>>;
  readonly channels: Readonly<Record<string, readonly string[]>>;
}

export interface VerifyPreservationOptions {
  readonly documentId: string;
  readonly sourceHash: string;
  readonly before: RootNode;
  readonly after: RootNode;
  readonly sourceText?: string;
  readonly serializedText?: string;
}

const BLOCK_TYPES = new Set<DocumentNode["type"]>([
  "paragraph",
  "blockquote",
  "heading",
  "list",
  "listItem",
  "thematicBreak",
  "code",
  "html",
  "math",
  "table",
  "tableRow",
  "tableCell",
  "definition",
  "footnoteDefinition",
  "containerDirective",
  "leafDirective",
  "mdxFlowExpression",
  "mdxJsxFlowElement",
  "mdxjsEsm",
]);

const INLINE_TYPES = new Set<DocumentNode["type"]>([
  "text",
  "strong",
  "emphasis",
  "delete",
  "break",
  "inlineCode",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "inlineMath",
  "footnoteReference",
  "textDirective",
  "mdxTextExpression",
  "mdxJsxTextElement",
]);

function childNodes(node: DocumentNode): readonly DocumentNode[] {
  switch (node.type) {
    case "root":
    case "paragraph":
    case "blockquote":
    case "strong":
    case "emphasis":
    case "delete":
    case "table":
    case "tableRow":
    case "tableCell":
    case "footnoteDefinition":
    case "heading":
    case "list":
    case "listItem":
    case "link":
    case "linkReference":
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
    case "mdxjsEsm":
    case "unsupported":
      return node.children;
    case "text":
    case "break":
    case "thematicBreak":
    case "inlineCode":
    case "code":
    case "image":
    case "imageReference":
    case "definition":
    case "html":
    case "math":
    case "inlineMath":
    case "footnoteReference":
      return [];
  }
}

function encodePart(
  value: string | number | boolean | null | undefined,
): string {
  if (value === undefined) return "u";
  if (value === null) return "n";
  const text = String(value);
  return `${typeof value}:${text.length}:${text}`;
}

function ownFingerprint(node: DocumentNode): string {
  const parts: (string | number | boolean | null | undefined)[] = [
    node.type,
    node.rawSource,
    node.sourceSpan?.startByte,
    node.sourceSpan?.endByte,
  ];

  switch (node.type) {
    case "root":
      break;
    case "text":
      parts.push(node.value);
      break;
    case "paragraph":
    case "blockquote":
    case "strong":
    case "emphasis":
    case "delete":
    case "tableRow":
    case "tableCell":
      break;
    case "table":
      parts.push(...(node.align ?? []).map((alignment) => alignment));
      break;
    case "footnoteDefinition":
      parts.push(node.identifier, node.label);
      break;
    case "heading":
      parts.push(
        node.depth,
        node.authoredText,
        node.displayText,
        node.explicitId,
        node.effectiveId,
      );
      break;
    case "list":
      parts.push(node.ordered, node.start, node.spread);
      break;
    case "listItem":
      parts.push(node.checked, node.spread);
      break;
    case "break":
    case "thematicBreak":
      break;
    case "inlineCode":
      parts.push(node.value);
      break;
    case "code":
      parts.push(
        node.rawCode,
        node.displayCode,
        node.language,
        node.meta,
        node.infoString,
        node.fenceDelimiter,
        node.highlightedRepresentation === undefined
          ? undefined
          : JSON.stringify(node.highlightedRepresentation),
      );
      break;
    case "link":
    case "linkReference":
      parts.push(
        node.url,
        node.title,
        node.identifier,
        node.label,
        node.referenceType,
      );
      break;
    case "image":
    case "imageReference":
      parts.push(
        node.url,
        node.alt,
        node.title,
        node.identifier,
        node.label,
        node.referenceType,
      );
      break;
    case "definition":
      parts.push(node.identifier, node.label, node.url, node.title);
      break;
    case "html":
      parts.push(node.value, node.disposition, node.sanitizedValue);
      break;
    case "math":
    case "inlineMath":
      parts.push(node.source, node.renderedHtml, node.renderError);
      break;
    case "footnoteReference":
      parts.push(node.identifier, node.label);
      break;
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
      parts.push(
        node.name,
        node.known,
        node.securityLevel,
        JSON.stringify(Object.entries(node.attributes)),
      );
      break;
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
    case "mdxjsEsm":
      parts.push(node.value, node.name, node.quarantined);
      break;
    case "unsupported":
      parts.push(node.originalType, JSON.stringify(node.opaqueData));
      break;
  }

  return parts.map(encodePart).join("|");
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function append(
  channels: Record<string, string[]>,
  channel: string,
  value: string,
): void {
  (channels[channel] ??= []).push(value);
}

function targetForLink(node: DocumentNode): string | undefined {
  switch (node.type) {
    case "link":
    case "image":
      return node.url;
    case "linkReference":
    case "imageReference":
      return node.identifier;
    default:
      return undefined;
  }
}

export function createPreservationSnapshot(
  root: RootNode,
): PreservationSnapshot {
  const counts: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;
  const channels: Record<string, string[]> = Object.create(null) as Record<
    string,
    string[]
  >;
  const fingerprints: Record<string, string> = Object.create(null) as Record<
    string,
    string
  >;
  const nodeOrder: string[] = [];
  const stack: DocumentNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    increment(counts, "node");
    increment(counts, node.type);
    if (BLOCK_TYPES.has(node.type)) increment(counts, "block");
    if (INLINE_TYPES.has(node.type)) increment(counts, "inline");

    nodeOrder.push(node.nodeId);
    fingerprints[node.nodeId] = ownFingerprint(node);

    switch (node.type) {
      case "text":
        append(channels, "text", node.value);
        break;
      case "code":
        append(channels, "code", node.rawCode);
        if (node.language?.toLowerCase() === "mermaid") {
          increment(counts, "diagram");
          append(channels, "diagram", node.rawCode);
        }
        break;
      case "html":
        append(channels, "html", node.value);
        break;
      case "link":
      case "linkReference":
        increment(counts, "linkTarget");
        append(channels, "linkTarget", targetForLink(node) ?? "");
        break;
      case "image":
      case "imageReference":
        increment(counts, "imageReference");
        append(channels, "imageReference", targetForLink(node) ?? "");
        break;
      case "footnoteDefinition":
      case "footnoteReference":
        increment(counts, "footnote");
        append(channels, "footnote", node.identifier ?? "");
        break;
      case "heading":
        increment(counts, "headingRecord");
        append(
          channels,
          "heading",
          `${node.depth}:${node.authoredText}:${node.effectiveId}`,
        );
        break;
      case "definition":
        increment(counts, "definitionRecord");
        append(
          channels,
          "definition",
          `${node.identifier}:${node.url}:${node.title ?? ""}`,
        );
        break;
      case "containerDirective":
      case "leafDirective":
      case "textDirective":
        increment(counts, "directive");
        append(channels, "directive", node.rawSource);
        break;
      case "math":
      case "inlineMath":
        increment(counts, "equation");
        append(channels, "equation", node.source);
        break;
      case "unsupported":
        increment(counts, "unsupportedRecord");
        append(
          channels,
          "unsupported",
          `${node.originalType}:${node.rawSource}`,
        );
        break;
      default:
        break;
    }

    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) stack.push(child);
    }
  }

  return {
    totalNodeCount: counts["node"] ?? 0,
    counts,
    nodeOrder,
    fingerprints,
    channels,
  };
}

function normalizedSource(text: string): string {
  const withoutBom = text.startsWith("\uFEFF") ? text.slice(1) : text;
  return withoutBom.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function semanticChannelsEqual(
  before: PreservationSnapshot,
  after: PreservationSnapshot,
): boolean {
  const countNames = new Set([
    ...Object.keys(before.counts),
    ...Object.keys(after.counts),
  ]);
  for (const name of countNames) {
    if ((before.counts[name] ?? 0) !== (after.counts[name] ?? 0)) return false;
  }
  const names = new Set([
    ...Object.keys(before.channels),
    ...Object.keys(after.channels),
  ]);
  for (const name of names) {
    if (!arraysEqual(before.channels[name] ?? [], after.channels[name] ?? []))
      return false;
  }
  return true;
}

function commonNodeOrder(
  order: readonly string[],
  commonIds: ReadonlySet<string>,
): readonly string[] {
  return order.filter((nodeId) => commonIds.has(nodeId));
}

export function verifyPreservation(
  options: VerifyPreservationOptions,
): PreservationReport {
  const before = createPreservationSnapshot(options.before);
  const after = createPreservationSnapshot(options.after);
  const violations: PreservationViolation[] = [];
  const countNames = new Set([
    ...Object.keys(before.counts),
    ...Object.keys(after.counts),
  ]);
  const counts: Record<
    string,
    { readonly before: number; readonly after: number }
  > = Object.create(null) as Record<
    string,
    { readonly before: number; readonly after: number }
  >;

  for (const name of [...countNames].sort()) {
    const beforeCount = before.counts[name] ?? 0;
    const afterCount = after.counts[name] ?? 0;
    counts[name] = { before: beforeCount, after: afterCount };
    if (afterCount < beforeCount) {
      violations.push({
        code: "PRESERVATION_COUNT_REDUCTION",
        nodeType: name,
        before: beforeCount,
        after: afterCount,
        message: `${name} count decreased from ${beforeCount} to ${afterCount}.`,
      });
    }
  }

  const channelNames = new Set([
    ...Object.keys(before.channels),
    ...Object.keys(after.channels),
  ]);
  for (const name of [...channelNames].sort()) {
    const beforeValues = before.channels[name] ?? [];
    const afterValues = after.channels[name] ?? [];
    if (!arraysEqual(beforeValues, afterValues)) {
      violations.push({
        code: "PRESERVATION_CONTENT_CHANGED",
        nodeType: name,
        before: beforeValues.length,
        after: afterValues.length,
        message: `${name} content or source order changed during transformation.`,
      });
    }
  }

  const beforeIds = new Set(before.nodeOrder);
  const afterIds = new Set(after.nodeOrder);
  const commonIds = new Set(
    [...beforeIds].filter((nodeId) => afterIds.has(nodeId)),
  );
  if (
    !arraysEqual(
      commonNodeOrder(before.nodeOrder, commonIds),
      commonNodeOrder(after.nodeOrder, commonIds),
    )
  ) {
    violations.push({
      code: "PRESERVATION_NODE_ORDER_CHANGED",
      nodeType: "node",
      before: before.nodeOrder.length,
      after: after.nodeOrder.length,
      message: "The relative order of preserved node identifiers changed.",
    });
  }

  let preservedNodeCount = 0;
  for (const nodeId of commonIds) {
    if (before.fingerprints[nodeId] === after.fingerprints[nodeId])
      preservedNodeCount += 1;
  }
  const removedNodeCount = before.nodeOrder.length - commonIds.size;
  const transformedNodeCount = after.nodeOrder.length - preservedNodeCount;

  let byteRoundTripStatus: PreservationReport["byteRoundTripStatus"] =
    "not-verifiable";
  if (
    options.sourceText !== undefined &&
    options.serializedText !== undefined
  ) {
    if (options.sourceText === options.serializedText)
      byteRoundTripStatus = "exact";
    else if (
      normalizedSource(options.sourceText) ===
      normalizedSource(options.serializedText)
    ) {
      byteRoundTripStatus = "normalized-equivalent";
    } else if (semanticChannelsEqual(before, after)) {
      byteRoundTripStatus = "semantic-equivalent";
    }
  }

  return {
    documentId: options.documentId,
    sourceHash: options.sourceHash,
    preservedNodeCount,
    transformedNodeCount,
    removedNodeCount,
    unsupportedNodeCount: after.counts["unsupportedRecord"] ?? 0,
    byteRoundTripStatus,
    counts,
    violations,
  };
}

export const createPreservationReport = verifyPreservation;
