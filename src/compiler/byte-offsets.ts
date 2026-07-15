import { encodingExists, getEncoder } from "iconv-lite";

import type { SourceSpan } from "./model";

export interface SourcePointLike {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

export interface SourcePositionLike {
  readonly start: SourcePointLike;
  readonly end: SourcePointLike;
}

export type ByteOffsetLookup =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false;
      readonly reason: "non-integer" | "out-of-range";
      readonly offset: number;
      readonly maximumOffset: number;
    };

export interface ByteOffsetIndex {
  readonly encoding: string;
  readonly utf16Length: number;
  readonly byteOffsetBase: number;
  readonly byteLength: number;
  byteOffsetAt(utf16Offset: number): ByteOffsetLookup;
  utf16OffsetAt(line: number, column: number): number | undefined;
  pointAt(utf16Offset: number): SourcePointLike | undefined;
  sourceSpan(position: SourcePositionLike): SourceSpan | undefined;
  spanFromOffsets(
    startOffset: number,
    endOffset: number,
  ): SourceSpan | undefined;
}

export interface CreateByteOffsetIndexOptions {
  readonly encoding?: string;
  readonly byteOffsetBase?: number;
}

const UTF8_ENCODINGS = new Set(["utf8", "utf-8"]);
const UTF16_LE_ENCODINGS = new Set(["utf16le", "utf-16le", "ucs2", "ucs-2"]);
const UTF16_BE_ENCODINGS = new Set(["utf16be", "utf-16be"]);

function normalizeEncoding(encoding: string): string {
  return encoding.trim().toLowerCase().replaceAll("_", "-");
}

function isTrailingSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function isLeadingSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function utf8ScalarByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function buildUtf8Offsets(text: string, byteOffsetBase: number): Float64Array {
  const offsets = new Float64Array(text.length + 1);
  let byteOffset = byteOffsetBase;
  offsets[0] = byteOffset;

  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    offsets[index] = byteOffset;

    if (
      isLeadingSurrogate(first) &&
      index + 1 < text.length &&
      isTrailingSurrogate(text.charCodeAt(index + 1))
    ) {
      // UTF-8 has no byte boundary inside a surrogate pair. Mapping that
      // otherwise-invalid UTF-16 boundary to the scalar start is monotonic and
      // keeps every valid Unicode boundary exact.
      offsets[index + 1] = byteOffset;
      byteOffset += 4;
      index += 1;
      offsets[index + 1] = byteOffset;
      continue;
    }

    // WHATWG UTF-8 encoders replace each unpaired surrogate with U+FFFD.
    const codePoint =
      isLeadingSurrogate(first) || isTrailingSurrogate(first) ? 0xfffd : first;
    byteOffset += utf8ScalarByteLength(codePoint);
    offsets[index + 1] = byteOffset;
  }

  return offsets;
}

function buildUtf16Offsets(text: string, byteOffsetBase: number): Float64Array {
  const offsets = new Float64Array(text.length + 1);
  for (let index = 0; index <= text.length; index += 1) {
    offsets[index] = byteOffsetBase + index * 2;
  }
  return offsets;
}

function buildEncodedOffsets(
  text: string,
  encoding: string,
  byteOffsetBase: number,
): Float64Array {
  if (!encodingExists(encoding)) {
    // The caller supplies a validated source encoding. Keeping this as a
    // boundary error (instead of silently assuming UTF-8) prevents corrupt
    // source maps for legacy encodings.
    throw new RangeError(`Unsupported source encoding: ${encoding}`);
  }

  const offsets = new Float64Array(text.length + 1);
  const encoder = getEncoder(encoding, { addBOM: false });
  let byteOffset = byteOffsetBase;
  offsets[0] = byteOffset;

  for (let index = 0; index < text.length; index += 1) {
    const first = text.charCodeAt(index);
    const scalarWidth =
      isLeadingSurrogate(first) &&
      index + 1 < text.length &&
      isTrailingSurrogate(text.charCodeAt(index + 1))
        ? 2
        : 1;

    offsets[index] = byteOffset;
    if (scalarWidth === 2) offsets[index + 1] = byteOffset;

    // The streaming encoder preserves state for multibyte encodings. This is
    // O(n); the allocation-heavy fallback is used only outside UTF-8/UTF-16.
    byteOffset += encoder.write(
      text.slice(index, index + scalarWidth),
    ).byteLength;
    index += scalarWidth - 1;
    offsets[index + 1] = byteOffset;
  }

  byteOffset += encoder.end()?.byteLength ?? 0;
  offsets[text.length] = byteOffset;
  return offsets;
}

function buildLineStarts(text: string): Uint32Array {
  const starts: number[] = [0];

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) index += 1;
      starts.push(index + 1);
    } else if (codeUnit === 0x0a) {
      starts.push(index + 1);
    }
  }

  return Uint32Array.from(starts);
}

function findLineIndex(lineStarts: Uint32Array, offset: number): number {
  let low = 0;
  let high = lineStarts.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const lineStart = lineStarts[middle];
    if (lineStart !== undefined && lineStart <= offset) low = middle + 1;
    else high = middle;
  }

  return low - 1;
}

export function createByteOffsetIndex(
  text: string,
  options: CreateByteOffsetIndexOptions = {},
): ByteOffsetIndex {
  const encoding = normalizeEncoding(options.encoding ?? "utf-8");
  const byteOffsetBase = options.byteOffsetBase ?? 0;
  if (!Number.isSafeInteger(byteOffsetBase) || byteOffsetBase < 0) {
    throw new RangeError("byteOffsetBase must be a non-negative safe integer");
  }

  const byteOffsets = UTF8_ENCODINGS.has(encoding)
    ? buildUtf8Offsets(text, byteOffsetBase)
    : UTF16_LE_ENCODINGS.has(encoding) || UTF16_BE_ENCODINGS.has(encoding)
      ? buildUtf16Offsets(text, byteOffsetBase)
      : buildEncodedOffsets(text, encoding, byteOffsetBase);
  const lineStarts = buildLineStarts(text);

  const byteOffsetAt = (utf16Offset: number): ByteOffsetLookup => {
    if (!Number.isSafeInteger(utf16Offset)) {
      return {
        ok: false,
        reason: "non-integer",
        offset: utf16Offset,
        maximumOffset: text.length,
      };
    }
    if (utf16Offset < 0 || utf16Offset > text.length) {
      return {
        ok: false,
        reason: "out-of-range",
        offset: utf16Offset,
        maximumOffset: text.length,
      };
    }

    const value = byteOffsets[utf16Offset];
    return value === undefined
      ? {
          ok: false,
          reason: "out-of-range",
          offset: utf16Offset,
          maximumOffset: text.length,
        }
      : { ok: true, value };
  };

  const utf16OffsetAt = (line: number, column: number): number | undefined => {
    if (
      !Number.isSafeInteger(line) ||
      !Number.isSafeInteger(column) ||
      line < 1 ||
      column < 1
    ) {
      return undefined;
    }
    const lineStart = lineStarts[line - 1];
    if (lineStart === undefined) return undefined;

    const offset = lineStart + column - 1;
    const nextLineStart = lineStarts[line];
    const lineEnd = nextLineStart ?? text.length + 1;
    return offset <= text.length && offset < lineEnd ? offset : undefined;
  };

  const pointAt = (utf16Offset: number): SourcePointLike | undefined => {
    if (
      !Number.isSafeInteger(utf16Offset) ||
      utf16Offset < 0 ||
      utf16Offset > text.length
    ) {
      return undefined;
    }
    const lineIndex = findLineIndex(lineStarts, utf16Offset);
    const lineStart = lineStarts[lineIndex];
    if (lineStart === undefined) return undefined;
    return {
      line: lineIndex + 1,
      column: utf16Offset - lineStart + 1,
      offset: utf16Offset,
    };
  };

  const resolvePointOffset = (point: SourcePointLike): number | undefined =>
    point.offset === undefined
      ? utf16OffsetAt(point.line, point.column)
      : point.offset;

  const spanFromOffsets = (
    startOffset: number,
    endOffset: number,
  ): SourceSpan | undefined => {
    if (startOffset > endOffset) return undefined;
    const startByte = byteOffsetAt(startOffset);
    const endByte = byteOffsetAt(endOffset);
    const startPoint = pointAt(startOffset);
    const endPoint = pointAt(endOffset);
    if (
      !startByte.ok ||
      !endByte.ok ||
      startPoint === undefined ||
      endPoint === undefined
    ) {
      return undefined;
    }

    return {
      startByte: startByte.value,
      endByte: endByte.value,
      startLine: startPoint.line,
      startColumn: startPoint.column,
      endLine: endPoint.line,
      endColumn: endPoint.column,
    };
  };

  const sourceSpan = (position: SourcePositionLike): SourceSpan | undefined => {
    const startOffset = resolvePointOffset(position.start);
    const endOffset = resolvePointOffset(position.end);
    return startOffset === undefined || endOffset === undefined
      ? undefined
      : spanFromOffsets(startOffset, endOffset);
  };

  return {
    encoding,
    utf16Length: text.length,
    byteOffsetBase,
    byteLength: byteOffsets[text.length] ?? byteOffsetBase,
    byteOffsetAt,
    utf16OffsetAt,
    pointAt,
    sourceSpan,
    spanFromOffsets,
  };
}
