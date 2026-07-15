import { constants as bufferConstants } from "node:buffer";
import { availableParallelism } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import type { BigIntStats, Dirent } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";

import iconv from "iconv-lite";

import {
  compareCanonicalStrings,
  compareNormalizedPaths,
  createStableId,
  normalizeRelativePath,
  sha256Hex,
} from "./canonical";
import {
  type BookCompilerConfigInput,
  validateBookCompilerConfig,
} from "./config";
import {
  createDiagnostic,
  DIAGNOSTIC_CODES,
  hasFatalDiagnostics,
  sortDiagnostics,
} from "./diagnostics";
import type {
  BookCompilerConfig,
  CompilerResult,
  ContentRootConfig,
  Diagnostic,
  SourceRecord,
} from "./model";

interface MicromatchOptions {
  readonly dot: boolean;
  readonly nocase: boolean;
  readonly nonegate: boolean;
}

interface MicromatchApi {
  matcher(
    pattern: string,
    options: MicromatchOptions,
  ): (value: string) => boolean;
}

const require = createRequire(import.meta.url);
const micromatch = require("micromatch") as MicromatchApi;

const UTF8_BOM = Uint8Array.of(0xef, 0xbb, 0xbf);
const UTF16LE_BOM = Uint8Array.of(0xff, 0xfe);
const UTF16BE_BOM = Uint8Array.of(0xfe, 0xff);
const UTF32LE_BOM = Uint8Array.of(0xff, 0xfe, 0x00, 0x00);
const UTF32BE_BOM = Uint8Array.of(0x00, 0x00, 0xfe, 0xff);

export interface DiscoveryOptions {
  readonly cwd?: string;
  readonly readConcurrency?: number;
}

export interface ByteOrderMarkDetection {
  readonly bom?: NonNullable<SourceRecord["bom"]>;
  readonly encoding?: "utf-8" | "utf-16le" | "utf-16be";
  readonly byteLength: number;
  readonly unsupported?: "utf-32le" | "utf-32be";
}

export interface DecodedSourceText {
  readonly text: string;
  readonly encoding: string;
  readonly bom?: NonNullable<SourceRecord["bom"]>;
  readonly newlineStyle?: NonNullable<SourceRecord["newlineStyle"]>;
  readonly bomConflict: boolean;
}

export type DecodeSourceTextResult =
  | { readonly ok: true; readonly value: DecodedSourceText }
  | {
      readonly ok: false;
      readonly reason:
        "unsupported-bom" | "unsupported-encoding" | "invalid-encoding";
      readonly message: string;
    };

interface CompiledMatchers {
  readonly include: readonly PathMatcher[];
  readonly exclude: readonly PathMatcher[];
  readonly encodingOverrides: readonly EncodingMatcher[];
}

interface PathMatcher {
  readonly pattern: string;
  readonly matches: (value: string) => boolean;
}

interface EncodingMatcher extends PathMatcher {
  readonly encoding: string;
}

interface RootTraversalContext {
  readonly root: ContentRootConfig;
  readonly absoluteRoot: string;
  readonly config: BookCompilerConfig;
  readonly matchers: CompiledMatchers;
  readonly candidates: SourceCandidate[];
  readonly diagnostics: Diagnostic[];
}

interface FileFingerprint {
  readonly device: bigint;
  readonly inode: bigint;
  readonly size: bigint;
  readonly modifiedNanoseconds: bigint;
  readonly changedNanoseconds: bigint;
}

interface SourceClassification {
  readonly extension: string;
  readonly mediaType: string;
  readonly sourceKind: SourceRecord["sourceKind"];
}

interface SourceCandidate {
  readonly root: ContentRootConfig;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly normalizedPath: string;
  readonly classification: SourceClassification;
  readonly fingerprint: FileFingerprint;
  readonly physicalKey: string;
  readonly physicalPathHash: string;
  readonly encoding: string;
}

interface ReadOutcome {
  readonly candidate: SourceCandidate;
  readonly record?: SourceRecord;
  readonly diagnostics: readonly Diagnostic[];
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) {
    return false;
  }

  for (let index = 0; index < prefix.byteLength; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

export function detectByteOrderMark(bytes: Uint8Array): ByteOrderMarkDetection {
  // UTF-32 signatures must be tested before their UTF-16 prefixes.
  if (startsWith(bytes, UTF32LE_BOM)) {
    return { byteLength: UTF32LE_BOM.byteLength, unsupported: "utf-32le" };
  }
  if (startsWith(bytes, UTF32BE_BOM)) {
    return { byteLength: UTF32BE_BOM.byteLength, unsupported: "utf-32be" };
  }
  if (startsWith(bytes, UTF8_BOM)) {
    return { bom: "utf-8", encoding: "utf-8", byteLength: UTF8_BOM.byteLength };
  }
  if (startsWith(bytes, UTF16LE_BOM)) {
    return {
      bom: "utf-16le",
      encoding: "utf-16le",
      byteLength: UTF16LE_BOM.byteLength,
    };
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return {
      bom: "utf-16be",
      encoding: "utf-16be",
      byteLength: UTF16BE_BOM.byteLength,
    };
  }

  return { byteLength: 0 };
}

export function detectNewlineStyle(
  text: string,
): SourceRecord["newlineStyle"] | undefined {
  let crlfCount = 0;
  let lfCount = 0;
  let crCount = 0;

  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit === 0x0d) {
      if (text.charCodeAt(index + 1) === 0x0a) {
        crlfCount += 1;
        index += 1;
      } else {
        crCount += 1;
      }
    } else if (codeUnit === 0x0a) {
      lfCount += 1;
    }
  }

  const stylesPresent =
    Number(crlfCount > 0) + Number(lfCount > 0) + Number(crCount > 0);
  if (stylesPresent === 0) {
    return undefined;
  }
  if (stylesPresent > 1) {
    return "mixed";
  }
  if (crlfCount > 0) {
    return "crlf";
  }
  return lfCount > 0 ? "lf" : "cr";
}

function normalizeEncodingName(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");

  switch (normalized) {
    case "utf8":
      return "utf-8";
    case "utf16":
    case "utf16le":
    case "utf-16":
    case "ucs2":
    case "ucs-2":
      return "utf-16le";
    case "utf16be":
      return "utf-16be";
    default:
      return normalized;
  }
}

function validateUnicodePayload(
  payload: Uint8Array,
  encoding: string,
): boolean {
  let decoderLabel: string | undefined;
  switch (encoding) {
    case "utf-8":
      decoderLabel = "utf-8";
      break;
    case "utf-16le":
      decoderLabel = "utf-16le";
      break;
    case "utf-16be":
      decoderLabel = "utf-16be";
      break;
  }

  if (decoderLabel === undefined) {
    return true;
  }

  try {
    new TextDecoder(decoderLabel, { fatal: true, ignoreBOM: true }).decode(
      payload,
    );
    return true;
  } catch {
    return false;
  }
}

function byteArraysEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export function decodeSourceText(
  rawBytes: Uint8Array,
  configuredEncoding: string,
): DecodeSourceTextResult {
  const detectedBom = detectByteOrderMark(rawBytes);
  if (detectedBom.unsupported !== undefined) {
    return {
      ok: false,
      reason: "unsupported-bom",
      message: `The ${detectedBom.unsupported} byte-order mark is recognized but unsupported by SourceRecord.bom.`,
    };
  }

  const normalizedConfiguredEncoding =
    normalizeEncodingName(configuredEncoding);
  const effectiveEncoding =
    detectedBom.encoding ?? normalizedConfiguredEncoding;
  if (!iconv.encodingExists(effectiveEncoding)) {
    return {
      ok: false,
      reason: "unsupported-encoding",
      message: `Encoding ${JSON.stringify(effectiveEncoding)} is not supported by iconv-lite.`,
    };
  }

  const payload = rawBytes.subarray(detectedBom.byteLength);
  if (!validateUnicodePayload(payload, effectiveEncoding)) {
    return {
      ok: false,
      reason: "invalid-encoding",
      message: `Source bytes are not valid ${effectiveEncoding}.`,
    };
  }

  const decoded = iconv.decode(Buffer.from(payload), effectiveEncoding);
  const roundTripBytes = iconv.encode(decoded, effectiveEncoding);
  if (!byteArraysEqual(payload, roundTripBytes)) {
    return {
      ok: false,
      reason: "invalid-encoding",
      message: `Source bytes do not round-trip exactly through ${effectiveEncoding}.`,
    };
  }

  const bomConflict =
    detectedBom.encoding !== undefined &&
    detectedBom.encoding !== normalizedConfiguredEncoding;
  const newlineStyle = detectNewlineStyle(decoded);

  return {
    ok: true,
    value: {
      text: decoded,
      encoding: effectiveEncoding,
      bomConflict,
      ...(detectedBom.bom === undefined ? {} : { bom: detectedBom.bom }),
      ...(newlineStyle === undefined ? {} : { newlineStyle }),
    },
  };
}

function normalizeGlobPattern(pattern: string): string {
  return pattern.replaceAll("\\", "/").replace(/^\.\//u, "");
}

function compilePathMatcher(
  pattern: string,
  caseSensitivity: BookCompilerConfig["discoveryPolicy"]["caseSensitivity"],
): PathMatcher {
  const normalizedPattern = normalizeGlobPattern(pattern);
  return {
    pattern,
    matches: micromatch.matcher(normalizedPattern, {
      dot: true,
      nocase: caseSensitivity === "insensitive",
      nonegate: true,
    }),
  };
}

function compileMatchers(
  config: BookCompilerConfig,
  root: ContentRootConfig,
  diagnostics: Diagnostic[],
): CompiledMatchers | undefined {
  try {
    const includes = root.include ?? config.include;
    const excludes = [...config.exclude, ...(root.exclude ?? [])];
    const encodingPatterns = Object.keys(
      config.parserPolicy.encodingOverrides,
    ).sort(compareCanonicalStrings);

    return {
      include: includes.map((pattern) =>
        compilePathMatcher(pattern, config.discoveryPolicy.caseSensitivity),
      ),
      exclude: excludes.map((pattern) =>
        compilePathMatcher(pattern, config.discoveryPolicy.caseSensitivity),
      ),
      encodingOverrides: encodingPatterns.map((pattern) => ({
        ...compilePathMatcher(pattern, config.discoveryPolicy.caseSensitivity),
        encoding: config.parserPolicy.encodingOverrides[pattern] ?? "",
      })),
    };
  } catch (error: unknown) {
    diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.CONFIG_INVALID_GLOB,
        message: `Root ${JSON.stringify(root.id)} contains a glob that cannot be compiled: ${errorMessage(error)}`,
        remediation:
          "Use micromatch-compatible root-relative patterns without NUL characters.",
      }),
    );
    return undefined;
  }
}

function matchesAny(
  matchers: readonly PathMatcher[],
  normalizedPath: string,
): boolean {
  return matchers.some((matcher) => matcher.matches(normalizedPath));
}

function isSelected(
  matchers: CompiledMatchers,
  normalizedPath: string,
): boolean {
  return (
    matchesAny(matchers.include, normalizedPath) &&
    !matchesAny(matchers.exclude, normalizedPath)
  );
}

function shouldPruneDirectory(
  matchers: CompiledMatchers,
  normalizedDirectory: string,
): boolean {
  if (matchesAny(matchers.exclude, normalizedDirectory)) {
    return true;
  }

  // Descendant probes allow patterns such as **/node_modules/** to prune the
  // subtree without treating a file-only pattern such as **/*.md as a match.
  return (
    matchesAny(
      matchers.exclude,
      `${normalizedDirectory}/__discovery_probe__`,
    ) &&
    matchesAny(
      matchers.exclude,
      `${normalizedDirectory}/__discovery_probe__/__discovery_probe__`,
    )
  );
}

function lookupExtensionValue(
  fileName: string,
  registry: Readonly<Record<string, string>>,
  caseSensitivity: BookCompilerConfig["discoveryPolicy"]["caseSensitivity"],
):
  | {
      readonly configuredExtension: string;
      readonly actualExtension: string;
      readonly value: string;
    }
  | undefined {
  const comparisonName =
    caseSensitivity === "insensitive" ? fileName.toLowerCase() : fileName;
  const keys = Object.keys(registry).sort((left, right) => {
    const lengthDifference = right.length - left.length;
    return lengthDifference === 0
      ? compareCanonicalStrings(left, right)
      : lengthDifference;
  });

  for (const configuredExtension of keys) {
    const comparisonExtension =
      caseSensitivity === "insensitive"
        ? configuredExtension.toLowerCase()
        : configuredExtension;
    if (comparisonName.endsWith(comparisonExtension)) {
      return {
        configuredExtension,
        actualExtension: fileName.slice(
          fileName.length - configuredExtension.length,
        ),
        value: registry[configuredExtension] ?? "",
      };
    }
  }

  return undefined;
}

function classifySource(
  fileName: string,
  config: BookCompilerConfig,
): SourceClassification {
  const documentMatch = lookupExtensionValue(
    fileName,
    config.parserPolicy.extensionAdapters,
    config.discoveryPolicy.caseSensitivity,
  );
  if (documentMatch !== undefined) {
    const extension = documentMatch.actualExtension;
    const lowerExtension = extension.toLowerCase();
    return {
      extension,
      mediaType: lowerExtension === ".mdx" ? "text/mdx" : "text/markdown",
      sourceKind: "document",
    };
  }

  const assetMatch = lookupExtensionValue(
    fileName,
    config.assetPolicy.extensions,
    config.discoveryPolicy.caseSensitivity,
  );
  if (assetMatch !== undefined) {
    return {
      extension: assetMatch.actualExtension,
      mediaType: assetMatch.value,
      sourceKind: "asset",
    };
  }

  // An explicitly included, unregistered extension is a document handled by
  // parserPolicy.defaultAdapter. Assets must be present in the asset registry.
  return {
    extension: path.extname(fileName),
    mediaType: "text/plain",
    sourceKind: "document",
  };
}

function fingerprint(stats: BigIntStats): FileFingerprint {
  return {
    device: stats.dev,
    inode: stats.ino,
    size: stats.size,
    modifiedNanoseconds: stats.mtimeNs,
    changedNanoseconds: stats.ctimeNs,
  };
}

function fingerprintsMatch(
  left: FileFingerprint,
  right: FileFingerprint,
): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.size === right.size &&
    left.modifiedNanoseconds === right.modifiedNanoseconds &&
    left.changedNanoseconds === right.changedNanoseconds
  );
}

async function physicalKeyFor(
  absolutePath: string,
  stats: BigIntStats,
): Promise<string> {
  if (stats.ino !== 0n) {
    return `device:${stats.dev.toString(10)}:inode:${stats.ino.toString(10)}`;
  }

  const resolved = await realpath(absolutePath);
  return `realpath:${normalizeRelativePath(path.resolve(resolved))}`;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  const code: unknown = error.code;
  return typeof code === "string" ? code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sourceLabel(rootId: string, normalizedPath: string): string {
  return `${rootId}:${normalizedPath}`;
}

function resolveConfiguredEncoding(
  defaultEncoding: string,
  matchers: readonly EncodingMatcher[],
  normalizedPath: string,
  rootId: string,
  diagnostics: Diagnostic[],
): string | undefined {
  const matches = matchers.filter((matcher) => matcher.matches(normalizedPath));
  if (matches.length === 0) {
    return defaultEncoding;
  }

  const distinctEncodings = new Set(
    matches.map((matcher) => normalizeEncodingName(matcher.encoding)),
  );
  if (distinctEncodings.size > 1) {
    diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.CONFIG_INVALID,
        message: `Encoding overrides for ${sourceLabel(rootId, normalizedPath)} are ambiguous: ${matches
          .map(
            (matcher) =>
              `${JSON.stringify(matcher.pattern)} -> ${JSON.stringify(matcher.encoding)}`,
          )
          .join(", ")}.`,
        remediation:
          "Make overlapping encoding-override globs select the same encoding or make the patterns disjoint.",
      }),
    );
    return undefined;
  }

  return matches[0]?.encoding ?? defaultEncoding;
}

async function addFileCandidate(
  context: RootTraversalContext,
  absolutePath: string,
  normalizedPath: string,
  stats: BigIntStats,
): Promise<void> {
  if (!isSelected(context.matchers, normalizedPath)) {
    return;
  }

  const configuredEncoding = resolveConfiguredEncoding(
    context.config.parserPolicy.defaultEncoding,
    context.matchers.encodingOverrides,
    normalizedPath,
    context.root.id,
    context.diagnostics,
  );
  if (configuredEncoding === undefined) {
    return;
  }

  if (stats.size > BigInt(context.config.validationPolicy.maxSourceBytes)) {
    context.diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_FILE_TOO_LARGE,
        message: `Source ${sourceLabel(context.root.id, normalizedPath)} is ${stats.size.toString(10)} bytes; the configured maximum is ${context.config.validationPolicy.maxSourceBytes}.`,
        remediation:
          "Increase validationPolicy.maxSourceBytes after reviewing the memory budget, or exclude the source.",
      }),
    );
    return;
  }

  try {
    const key = await physicalKeyFor(absolutePath, stats);
    context.candidates.push({
      root: context.root,
      absolutePath,
      relativePath: path.relative(context.absoluteRoot, absolutePath),
      normalizedPath,
      classification: classifySource(
        path.basename(absolutePath),
        context.config,
      ),
      fingerprint: fingerprint(stats),
      physicalKey: key,
      physicalPathHash: sha256Hex(key),
      encoding: configuredEncoding,
    });
  } catch (error: unknown) {
    context.diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_ENTRY_UNREADABLE,
        message: `Cannot resolve the physical identity of ${sourceLabel(context.root.id, normalizedPath)}: ${errorMessage(error)}`,
        remediation:
          "Repair the filesystem entry or exclude it from discovery.",
      }),
    );
  }
}

async function walkDirectory(
  context: RootTraversalContext,
  absoluteDirectory: string,
  normalizedDirectory: string,
  ancestorDirectoryKeys: Set<string>,
): Promise<void> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(absoluteDirectory, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch (error: unknown) {
    context.diagnostics.push(
      createDiagnostic({
        code:
          normalizedDirectory.length === 0
            ? DIAGNOSTIC_CODES.SOURCE_ROOT_UNREADABLE
            : DIAGNOSTIC_CODES.SOURCE_ENTRY_UNREADABLE,
        message: `Cannot enumerate ${
          normalizedDirectory.length === 0
            ? `content root ${JSON.stringify(context.root.id)}`
            : `directory ${sourceLabel(context.root.id, normalizedDirectory)}`
        }: ${errorMessage(error)}`,
        remediation:
          "Verify filesystem permissions and that the directory remains available.",
      }),
    );
    return;
  }

  entries.sort((left, right) =>
    compareNormalizedPaths(
      left.name,
      right.name,
      context.config.discoveryPolicy.caseSensitivity,
    ),
  );

  for (const entry of entries) {
    if (
      context.config.discoveryPolicy.hiddenFiles === "exclude" &&
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const childNormalizedPath = normalizeRelativePath(
      normalizedDirectory.length === 0
        ? entry.name
        : `${normalizedDirectory}/${entry.name}`,
    );
    const childAbsolutePath = path.join(absoluteDirectory, entry.name);

    if (
      entry.isDirectory() &&
      shouldPruneDirectory(context.matchers, childNormalizedPath)
    ) {
      continue;
    }

    let entryStats: BigIntStats;
    try {
      entryStats = await lstat(childAbsolutePath, { bigint: true });
    } catch (error: unknown) {
      context.diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODES.SOURCE_ENTRY_UNREADABLE,
          message: `Cannot inspect ${sourceLabel(context.root.id, childNormalizedPath)}: ${errorMessage(error)}`,
          remediation:
            "Repair the filesystem entry or exclude it from discovery.",
        }),
      );
      continue;
    }

    if (entryStats.isSymbolicLink()) {
      if (context.config.discoveryPolicy.symbolicLinks === "ignore") {
        continue;
      }

      let targetStats: BigIntStats;
      try {
        targetStats = await stat(childAbsolutePath, { bigint: true });
      } catch (error: unknown) {
        context.diagnostics.push(
          createDiagnostic({
            code: DIAGNOSTIC_CODES.SOURCE_ENTRY_UNREADABLE,
            message: `Cannot follow symbolic link ${sourceLabel(context.root.id, childNormalizedPath)}: ${errorMessage(error)}`,
            remediation: "Repair the symbolic-link target or exclude the link.",
          }),
        );
        continue;
      }

      if (targetStats.isFile()) {
        await addFileCandidate(
          context,
          childAbsolutePath,
          childNormalizedPath,
          targetStats,
        );
        continue;
      }

      if (
        !targetStats.isDirectory() ||
        context.config.discoveryPolicy.symbolicLinks !== "follow-all" ||
        shouldPruneDirectory(context.matchers, childNormalizedPath)
      ) {
        continue;
      }

      try {
        const directoryKey = await physicalKeyFor(
          childAbsolutePath,
          targetStats,
        );
        if (ancestorDirectoryKeys.has(directoryKey)) {
          context.diagnostics.push(
            createDiagnostic({
              code: DIAGNOSTIC_CODES.SOURCE_SYMLINK_CYCLE,
              message: `Symbolic directory link ${sourceLabel(context.root.id, childNormalizedPath)} would create a traversal cycle and was not followed.`,
              remediation:
                "Remove the cyclic link or change discoveryPolicy.symbolicLinks.",
            }),
          );
          continue;
        }

        ancestorDirectoryKeys.add(directoryKey);
        await walkDirectory(
          context,
          childAbsolutePath,
          childNormalizedPath,
          ancestorDirectoryKeys,
        );
        ancestorDirectoryKeys.delete(directoryKey);
      } catch (error: unknown) {
        context.diagnostics.push(
          createDiagnostic({
            code: DIAGNOSTIC_CODES.SOURCE_ENTRY_UNREADABLE,
            message: `Cannot traverse symbolic directory link ${sourceLabel(context.root.id, childNormalizedPath)}: ${errorMessage(error)}`,
            remediation: "Repair the symbolic-link target or exclude the link.",
          }),
        );
      }
      continue;
    }

    if (entryStats.isDirectory()) {
      if (shouldPruneDirectory(context.matchers, childNormalizedPath)) {
        continue;
      }

      try {
        const directoryKey = await physicalKeyFor(
          childAbsolutePath,
          entryStats,
        );
        if (ancestorDirectoryKeys.has(directoryKey)) {
          context.diagnostics.push(
            createDiagnostic({
              code: DIAGNOSTIC_CODES.SOURCE_SYMLINK_CYCLE,
              message: `Directory ${sourceLabel(context.root.id, childNormalizedPath)} repeats an ancestor physical identity and was not traversed.`,
              remediation:
                "Inspect mount points and directory links for a traversal cycle.",
            }),
          );
          continue;
        }

        ancestorDirectoryKeys.add(directoryKey);
        await walkDirectory(
          context,
          childAbsolutePath,
          childNormalizedPath,
          ancestorDirectoryKeys,
        );
        ancestorDirectoryKeys.delete(directoryKey);
      } catch (error: unknown) {
        context.diagnostics.push(
          createDiagnostic({
            code: DIAGNOSTIC_CODES.SOURCE_ENTRY_UNREADABLE,
            message: `Cannot establish directory identity for ${sourceLabel(context.root.id, childNormalizedPath)}: ${errorMessage(error)}`,
            remediation:
              "Repair the filesystem entry or exclude it from discovery.",
          }),
        );
      }
      continue;
    }

    if (entryStats.isFile()) {
      await addFileCandidate(
        context,
        childAbsolutePath,
        childNormalizedPath,
        entryStats,
      );
    }
  }
}

async function discoverRoot(
  config: BookCompilerConfig,
  root: ContentRootConfig,
  cwd: string,
): Promise<{
  readonly candidates: readonly SourceCandidate[];
  readonly diagnostics: readonly Diagnostic[];
}> {
  const diagnostics: Diagnostic[] = [];
  const candidates: SourceCandidate[] = [];
  const absoluteRoot = path.resolve(cwd, root.path);
  const matchers = compileMatchers(config, root, diagnostics);
  if (matchers === undefined) {
    return { candidates, diagnostics };
  }

  let rootStats: BigIntStats;
  try {
    rootStats = await stat(absoluteRoot, { bigint: true });
  } catch (error: unknown) {
    diagnostics.push(
      createDiagnostic({
        code:
          errorCode(error) === "ENOENT"
            ? DIAGNOSTIC_CODES.SOURCE_ROOT_NOT_FOUND
            : DIAGNOSTIC_CODES.SOURCE_ROOT_UNREADABLE,
        message: `Cannot inspect content root ${JSON.stringify(root.id)} at configured path ${JSON.stringify(root.path)}: ${errorMessage(error)}`,
        remediation:
          "Correct the content-root path and verify filesystem permissions.",
      }),
    );
    return { candidates, diagnostics };
  }

  if (!rootStats.isDirectory()) {
    diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_ROOT_NOT_DIRECTORY,
        message: `Content root ${JSON.stringify(root.id)} at ${JSON.stringify(root.path)} is not a directory.`,
        remediation: "Configure contentRoots[].path with a directory path.",
      }),
    );
    return { candidates, diagnostics };
  }

  try {
    const rootKey = await physicalKeyFor(absoluteRoot, rootStats);
    await walkDirectory(
      {
        root,
        absoluteRoot,
        config,
        matchers,
        candidates,
        diagnostics,
      },
      absoluteRoot,
      "",
      new Set([rootKey]),
    );
  } catch (error: unknown) {
    diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_ROOT_UNREADABLE,
        message: `Cannot establish physical identity for content root ${JSON.stringify(root.id)}: ${errorMessage(error)}`,
        remediation: "Verify the content root and its filesystem permissions.",
      }),
    );
  }

  return { candidates, diagnostics };
}

function sourceIdFor(
  candidate: SourceCandidate,
  config: BookCompilerConfig,
  contentHash: string,
): string {
  return config.discoveryPolicy.sourceIdStrategy === "content"
    ? createStableId("source", "content", contentHash)
    : createStableId(
        "source",
        "path",
        config.corpusId,
        candidate.root.id,
        candidate.normalizedPath,
      );
}

async function readBoundedSource(
  candidate: SourceCandidate,
  maximumBytes: number,
): Promise<
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly diagnostic: Diagnostic }
> {
  const label = sourceLabel(candidate.root.id, candidate.normalizedPath);
  const allocationLimit = Math.min(maximumBytes, bufferConstants.MAX_LENGTH);
  if (candidate.fingerprint.size > BigInt(allocationLimit)) {
    return {
      ok: false,
      diagnostic: createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_FILE_TOO_LARGE,
        message: `Source ${label} exceeds the bounded reader limit of ${allocationLimit} bytes.`,
        remediation:
          "Reduce the source size or use a platform with a larger safe buffer limit.",
      }),
    };
  }

  let fileHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    fileHandle = await open(candidate.absolutePath, "r");
    const beforeRead = fingerprint(await fileHandle.stat({ bigint: true }));
    if (!fingerprintsMatch(candidate.fingerprint, beforeRead)) {
      return {
        ok: false,
        diagnostic: createDiagnostic({
          code: DIAGNOSTIC_CODES.SOURCE_FILE_CHANGED_DURING_READ,
          message: `Source ${label} changed after discovery and before reading.`,
          remediation:
            "Stop concurrent writers and rerun the compiler from a stable snapshot.",
        }),
      };
    }

    const expectedLength = Number(beforeRead.size);
    const buffer = Buffer.allocUnsafe(expectedLength + 1);
    let offset = 0;

    while (offset < buffer.byteLength) {
      const { bytesRead } = await fileHandle.read(
        buffer,
        offset,
        buffer.byteLength - offset,
        offset,
      );
      if (bytesRead === 0) {
        break;
      }
      offset += bytesRead;
    }

    const afterRead = fingerprint(await fileHandle.stat({ bigint: true }));
    if (
      offset !== expectedLength ||
      !fingerprintsMatch(beforeRead, afterRead)
    ) {
      return {
        ok: false,
        diagnostic: createDiagnostic({
          code: DIAGNOSTIC_CODES.SOURCE_FILE_CHANGED_DURING_READ,
          message: `Source ${label} changed while it was being read.`,
          remediation:
            "Stop concurrent writers and rerun the compiler from a stable snapshot.",
        }),
      };
    }

    return {
      ok: true,
      bytes: Uint8Array.from(buffer.subarray(0, expectedLength)),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      diagnostic: createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_READ_FAILED,
        message: `Cannot read source ${label}: ${errorMessage(error)}`,
        remediation:
          "Verify that the source is a readable regular file and rerun discovery.",
      }),
    };
  } finally {
    if (fileHandle !== undefined) {
      // Close failures are propagated to materializeCandidate and converted to
      // a structured SOURCE_READ_FAILED diagnostic; resource errors are never
      // silently swallowed.
      await fileHandle.close();
    }
  }
}

async function materializeCandidate(
  candidate: SourceCandidate,
  config: BookCompilerConfig,
): Promise<ReadOutcome> {
  let readResult: Awaited<ReturnType<typeof readBoundedSource>>;
  try {
    readResult = await readBoundedSource(
      candidate,
      config.validationPolicy.maxSourceBytes,
    );
  } catch (error: unknown) {
    return {
      candidate,
      diagnostics: [
        createDiagnostic({
          code: DIAGNOSTIC_CODES.SOURCE_READ_FAILED,
          message: `Cannot complete the source lifecycle for ${sourceLabel(candidate.root.id, candidate.normalizedPath)}: ${errorMessage(error)}`,
          remediation:
            "Verify filesystem health, file permissions, and descriptor limits before rerunning discovery.",
        }),
      ],
    };
  }
  if (!readResult.ok) {
    return { candidate, diagnostics: [readResult.diagnostic] };
  }

  const rawBytes = readResult.bytes;
  const contentHash = sha256Hex(rawBytes);
  const sourceId = sourceIdFor(candidate, config, contentHash);
  const commonRecord = {
    sourceId,
    rootId: candidate.root.id,
    absolutePath: candidate.absolutePath,
    relativePath: candidate.relativePath,
    normalizedPath: candidate.normalizedPath,
    extension: candidate.classification.extension,
    mediaType: candidate.classification.mediaType,
    byteLength: rawBytes.byteLength,
    contentHash,
    rawBytes,
    discoveredAtBuildPhase: "corpus-discovery" as const,
    sourceKind: candidate.classification.sourceKind,
    trustLevel: candidate.root.trustLevel,
    physicalPathHash: candidate.physicalPathHash,
  };

  if (candidate.classification.sourceKind === "asset") {
    return {
      candidate,
      record: { ...commonRecord, encoding: "binary" },
      diagnostics: [],
    };
  }

  const decodeResult = decodeSourceText(rawBytes, candidate.encoding);
  if (!decodeResult.ok) {
    const diagnosticCode =
      decodeResult.reason === "unsupported-bom"
        ? DIAGNOSTIC_CODES.SOURCE_UNSUPPORTED_BOM
        : decodeResult.reason === "unsupported-encoding"
          ? DIAGNOSTIC_CODES.SOURCE_UNSUPPORTED_ENCODING
          : DIAGNOSTIC_CODES.SOURCE_INVALID_ENCODING;
    return {
      candidate,
      diagnostics: [
        createDiagnostic({
          code: diagnosticCode,
          message: `Cannot decode source ${sourceLabel(candidate.root.id, candidate.normalizedPath)}: ${decodeResult.message}`,
          sourceId,
          remediation:
            "Correct parserPolicy.defaultEncoding or encodingOverrides, or repair the source bytes without lossy conversion.",
        }),
      ],
    };
  }

  const diagnostics: Diagnostic[] = [];
  if (decodeResult.value.bomConflict) {
    diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.SOURCE_ENCODING_BOM_CONFLICT,
        message: `The byte-order mark in ${sourceLabel(candidate.root.id, candidate.normalizedPath)} selects ${decodeResult.value.encoding}, overriding configured encoding ${normalizeEncodingName(candidate.encoding)}.`,
        sourceId,
        remediation:
          "Align the configured encoding with the authored byte-order mark.",
      }),
    );
  }

  return {
    candidate,
    record: {
      ...commonRecord,
      encoding: decodeResult.value.encoding,
      rawText: decodeResult.value.text,
      ...(decodeResult.value.bom === undefined
        ? {}
        : { bom: decodeResult.value.bom }),
      ...(decodeResult.value.newlineStyle === undefined
        ? {}
        : { newlineStyle: decodeResult.value.newlineStyle }),
    },
    diagnostics,
  };
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<U>,
): Promise<readonly U[]> {
  const results = new Array<U>(values.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) {
        return;
      }

      const value = values[index];
      if (value === undefined) {
        throw new RangeError(`Missing work item at index ${index}.`);
      }
      results[index] = await operation(value);
    }
  };

  const workerCount = Math.min(values.length, concurrency);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function candidateComparator(
  config: BookCompilerConfig,
): (left: SourceCandidate, right: SourceCandidate) => number {
  return (left, right) => {
    const rootComparison = compareCanonicalStrings(left.root.id, right.root.id);
    return rootComparison === 0
      ? compareNormalizedPaths(
          left.normalizedPath,
          right.normalizedPath,
          config.discoveryPolicy.caseSensitivity,
        )
      : rootComparison;
  };
}

function duplicateDiagnostics(
  outcomes: readonly ReadOutcome[],
  config: BookCompilerConfig,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const firstByPhysicalKey = new Map<string, ReadOutcome>();
  const firstByLogicalPath = new Map<string, ReadOutcome>();
  const firstBySourceId = new Map<string, ReadOutcome>();

  for (const outcome of outcomes) {
    const record = outcome.record;
    if (record === undefined) {
      continue;
    }

    const firstPhysical = firstByPhysicalKey.get(outcome.candidate.physicalKey);
    if (firstPhysical?.record !== undefined) {
      diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODES.SOURCE_DUPLICATE_PHYSICAL_FILE,
          message: `Sources ${sourceLabel(firstPhysical.record.rootId, firstPhysical.record.normalizedPath)} and ${sourceLabel(record.rootId, record.normalizedPath)} resolve to the same physical file.`,
          sourceId: record.sourceId,
          related: [
            {
              sourceId: firstPhysical.record.sourceId,
              message: "First physical-file occurrence.",
            },
          ],
          remediation:
            "Remove the duplicate root, hard link, or followed symbolic link.",
        }),
      );
    } else {
      firstByPhysicalKey.set(outcome.candidate.physicalKey, outcome);
    }

    const caseFoldedPath =
      config.discoveryPolicy.caseSensitivity === "insensitive"
        ? record.normalizedPath.toLowerCase()
        : record.normalizedPath;
    const logicalKey = `${record.rootId}\0${caseFoldedPath}`;
    const firstLogical = firstByLogicalPath.get(logicalKey);
    if (firstLogical?.record !== undefined) {
      const isCaseCollision =
        firstLogical.record.normalizedPath !== record.normalizedPath &&
        firstLogical.record.normalizedPath.toLowerCase() ===
          record.normalizedPath.toLowerCase();
      diagnostics.push(
        createDiagnostic({
          code: isCaseCollision
            ? DIAGNOSTIC_CODES.SOURCE_CASE_COLLISION
            : DIAGNOSTIC_CODES.SOURCE_DUPLICATE_LOGICAL_PATH,
          message: `Sources ${sourceLabel(firstLogical.record.rootId, firstLogical.record.normalizedPath)} and ${sourceLabel(record.rootId, record.normalizedPath)} collide at one logical path.`,
          sourceId: record.sourceId,
          related: [
            {
              sourceId: firstLogical.record.sourceId,
              message: "First logical-path occurrence.",
            },
          ],
          remediation:
            "Rename or exclude one source so every normalized logical path is unique.",
        }),
      );
    } else {
      firstByLogicalPath.set(logicalKey, outcome);
    }

    const firstIdentifier = firstBySourceId.get(record.sourceId);
    if (firstIdentifier?.record !== undefined) {
      diagnostics.push(
        createDiagnostic({
          code: DIAGNOSTIC_CODES.SOURCE_DUPLICATE_ID,
          message: `Sources ${sourceLabel(firstIdentifier.record.rootId, firstIdentifier.record.normalizedPath)} and ${sourceLabel(record.rootId, record.normalizedPath)} produce duplicate sourceId ${record.sourceId}.`,
          sourceId: record.sourceId,
          related: [
            {
              sourceId: firstIdentifier.record.sourceId,
              message: "First source identifier occurrence.",
            },
          ],
          remediation:
            config.discoveryPolicy.sourceIdStrategy === "content"
              ? "Remove duplicate byte-identical sources or use the path source-ID strategy."
              : "Resolve the path collision; path-addressed IDs must be unique.",
        }),
      );
    } else {
      firstBySourceId.set(record.sourceId, outcome);
    }
  }

  return diagnostics;
}

function normalizeReadConcurrency(value: number | undefined): number {
  if (value === undefined) {
    return Math.max(1, Math.min(32, availableParallelism()));
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 256) {
    throw new RangeError(
      "Discovery readConcurrency must be an integer from 1 through 256.",
    );
  }
  return value;
}

export async function discoverSources(
  input: BookCompilerConfig | BookCompilerConfigInput,
  options: DiscoveryOptions = {},
): Promise<CompilerResult<readonly SourceRecord[]>> {
  const validation = validateBookCompilerConfig(input);
  if (!validation.ok) {
    return validation;
  }

  const config = validation.value;
  const diagnostics: Diagnostic[] = [...validation.diagnostics];
  const cwd = path.resolve(options.cwd ?? process.cwd());
  let readConcurrency: number;
  try {
    readConcurrency = normalizeReadConcurrency(options.readConcurrency);
  } catch (error: unknown) {
    diagnostics.push(
      createDiagnostic({
        code: DIAGNOSTIC_CODES.CONFIG_INVALID,
        message: errorMessage(error),
        remediation: "Use an integer readConcurrency between 1 and 256.",
      }),
    );
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }

  const roots = [...config.contentRoots].sort((left, right) =>
    compareCanonicalStrings(left.id, right.id),
  );
  const rootOutcomes = await Promise.all(
    roots.map((root) => discoverRoot(config, root, cwd)),
  );
  const candidates = rootOutcomes
    .flatMap((outcome) => {
      diagnostics.push(...outcome.diagnostics);
      return outcome.candidates;
    })
    .sort(candidateComparator(config));

  if (hasFatalDiagnostics(diagnostics)) {
    return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
  }

  const readOutcomes = await mapWithConcurrency(
    candidates,
    readConcurrency,
    (candidate) => materializeCandidate(candidate, config),
  );
  const records: SourceRecord[] = [];
  for (const outcome of readOutcomes) {
    diagnostics.push(...outcome.diagnostics);
    if (outcome.record !== undefined) {
      records.push(outcome.record);
    }
  }
  diagnostics.push(...duplicateDiagnostics(readOutcomes, config));

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  if (hasFatalDiagnostics(sortedDiagnostics)) {
    return { ok: false, diagnostics: sortedDiagnostics };
  }

  return { ok: true, value: records, diagnostics: sortedDiagnostics };
}
