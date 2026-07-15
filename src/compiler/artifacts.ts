import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import type { BigIntStats, Dirent } from "node:fs";
import path from "node:path";

import {
  ArtifactIndexDataSchema,
  ArtifactEnvelopeSchema,
  DiagnosticReportDataSchema,
  DocumentManifestDataSchema,
  RouteManifestDataSchema,
  SearchIndexDataSchema,
  artifactJsonSchemas,
} from "./artifact-schemas";
import { assetOutputLocation } from "./asset-path";
import {
  canonicalizeJson,
  compareCanonicalStrings,
  sha256Hex,
} from "./canonical";
import {
  ARTIFACT_SCHEMA_VERSION,
  COMPILER_VERSION,
  IR_VERSION,
  type ArtifactEnvelope,
  type CompilationArtifacts,
  type CompiledDocument,
  type Diagnostic,
  type SourceRecord,
} from "./model";
import type {
  DocumentManifestData,
  DocumentManifestEntry,
  RouteManifestData,
} from "../runtime/types";

const OUTPUT_MARKER = ".book-compiler-output";

interface ArtifactWriteResult {
  readonly outputDirectory: string;
  readonly publicDirectory: string;
  readonly artifactHashes: Readonly<Record<string, string>>;
}

export interface OutputTreeRoot {
  readonly absolutePath: string;
  readonly manifestPath: string;
}

interface ResolvedOutputRoot extends OutputTreeRoot {
  readonly configuredPath: string;
}

const FILE_HASH_BUFFER_BYTES = 256 * 1024;

function envelope<T>(
  artifacts: CompilationArtifacts,
  data: T,
): ArtifactEnvelope<T> {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    compilerVersion: COMPILER_VERSION,
    configurationHash: artifacts.configHash,
    inputCorpusHash: artifacts.corpusHash,
    generatedAt: artifacts.config.outputPolicy.reproducibleTimestamp,
    compatibility: {
      minimumCompilerVersion: COMPILER_VERSION,
      irVersion: IR_VERSION,
    },
    data,
  };
}

function serializeCanonical(value: unknown, pretty: boolean): string {
  const canonical = canonicalizeJson(value);
  return pretty
    ? `${JSON.stringify(JSON.parse(canonical) as unknown, undefined, 2)}\n`
    : canonical;
}

function safeSegment(identifier: string): string {
  return sha256Hex(identifier).slice(0, 32);
}

function wordCount(document: CompiledDocument): number {
  const text = document.root.rawSource;
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)].length;
}

function countDiagnostics(
  diagnostics: readonly Diagnostic[],
): Record<Diagnostic["severity"], number> {
  const counts = { info: 0, warning: 0, error: 0, fatal: 0 };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
  }
  return counts;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isSameOrDescendant(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function resolveOutputRoot(
  projectRoot: string,
  configuredPath: string,
): ResolvedOutputRoot {
  const resolvedProjectRoot = path.resolve(projectRoot);
  const absolutePath = path.resolve(resolvedProjectRoot, configuredPath);
  const relativePath = path.relative(resolvedProjectRoot, absolutePath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Managed output path must be a proper descendant of the project root: ${configuredPath}`,
    );
  }

  const manifestPath = relativePath.split(path.sep).join("/");
  return { absolutePath, configuredPath, manifestPath };
}

function assertIndependentOutputRoots(
  internal: ResolvedOutputRoot,
  publicOutput: ResolvedOutputRoot,
): void {
  const internalLifecyclePaths = [
    internal.absolutePath,
    `${internal.absolutePath}.staging`,
    `${internal.absolutePath}.previous`,
  ];
  const publicLifecyclePaths = [
    publicOutput.absolutePath,
    `${publicOutput.absolutePath}.staging`,
    `${publicOutput.absolutePath}.previous`,
  ];

  for (const internalPath of internalLifecyclePaths) {
    for (const publicPath of publicLifecyclePaths) {
      if (
        isSameOrDescendant(internalPath, publicPath) ||
        isSameOrDescendant(publicPath, internalPath)
      ) {
        throw new Error(
          `Managed internal and public output lifecycles must not overlap: ${internal.configuredPath}, ${publicOutput.configuredPath}`,
        );
      }
    }
  }
}

function fileFingerprintMatches(
  left: BigIntStats,
  right: BigIntStats,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function hashStableFile(absolutePath: string): Promise<string> {
  const handle = await open(absolutePath, "r");
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) {
      throw new Error(
        `Generated output entry is not a regular file: ${absolutePath}`,
      );
    }
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `Generated output file is too large to verify safely: ${absolutePath}`,
      );
    }

    const expectedBytes = Number(before.size);
    const buffer = Buffer.allocUnsafe(FILE_HASH_BUFFER_BYTES);
    const hash = createHash("sha256");
    let offset = 0;
    while (offset < expectedBytes) {
      const length = Math.min(buffer.byteLength, expectedBytes - offset);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead === 0) {
        break;
      }
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }

    const after = await handle.stat({ bigint: true });
    if (offset !== expectedBytes || !fileFingerprintMatches(before, after)) {
      throw new Error(
        `Generated output changed while it was being hashed: ${absolutePath}`,
      );
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

async function listGeneratedFiles(
  absoluteRoot: string,
  relativeDirectory = "",
): Promise<readonly string[]> {
  const absoluteDirectory =
    relativeDirectory.length === 0
      ? absoluteRoot
      : path.join(absoluteRoot, ...relativeDirectory.split("/"));
  const entries: Dirent[] = await readdir(absoluteDirectory, {
    withFileTypes: true,
  });
  entries.sort((left, right) => compareCanonicalStrings(left.name, right.name));

  const files: string[] = [];
  for (const entry of entries) {
    const relativePath =
      relativeDirectory.length === 0
        ? entry.name
        : `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listGeneratedFiles(absoluteRoot, relativePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `Generated output trees may contain only regular files and directories: ${path.join(absoluteRoot, ...relativePath.split("/"))}`,
      );
    }
    files.push(relativePath);
  }
  return files;
}

export async function snapshotOutputTrees(
  roots: readonly OutputTreeRoot[],
  excludedPaths: ReadonlySet<string> = new Set<string>(),
): Promise<Readonly<Record<string, string>>> {
  const sortedRoots = [...roots].sort((left, right) =>
    compareCanonicalStrings(left.manifestPath, right.manifestPath),
  );
  const hashes: Record<string, string> = {};

  for (const root of sortedRoots) {
    const files = await listGeneratedFiles(root.absolutePath);
    for (const relativePath of files) {
      const manifestPath = path.posix.join(root.manifestPath, relativePath);
      if (excludedPaths.has(manifestPath)) {
        continue;
      }
      if (Object.hasOwn(hashes, manifestPath)) {
        throw new Error(
          `Generated output path appears more than once: ${manifestPath}`,
        );
      }
      hashes[manifestPath] = await hashStableFile(
        path.join(root.absolutePath, ...relativePath.split("/")),
      );
    }
  }

  return Object.fromEntries(
    Object.entries(hashes).sort(([left], [right]) =>
      compareCanonicalStrings(left, right),
    ),
  );
}

function assertExpectedOutputHashes(
  actual: Readonly<Record<string, string>>,
  expected: ReadonlyMap<string, string>,
): void {
  for (const [manifestPath, expectedHash] of expected) {
    const actualHash = actual[manifestPath];
    if (actualHash !== expectedHash) {
      throw new Error(
        `Generated source copy does not match its discovered content hash: ${manifestPath}`,
      );
    }
  }
}

function assertArtifactIndexCoverage(
  indexed: Readonly<Record<string, string>>,
  complete: Readonly<Record<string, string>>,
  selfPath: string,
): void {
  const completeWithoutSelf = Object.fromEntries(
    Object.entries(complete).filter(
      ([manifestPath]) => manifestPath !== selfPath,
    ),
  );
  if (canonicalizeJson(indexed) !== canonicalizeJson(completeWithoutSelf)) {
    throw new Error(
      "Artifact index does not exactly cover the generated internal and public output trees.",
    );
  }
}

async function assertManagedDirectory(directory: string): Promise<void> {
  if (!(await exists(directory))) {
    return;
  }
  const marker = path.join(directory, OUTPUT_MARKER);
  if (!(await exists(marker))) {
    throw new Error(`Refusing to replace an unmarked directory: ${directory}`);
  }
}

async function removeManagedDirectory(directory: string): Promise<void> {
  if (!(await exists(directory))) {
    return;
  }
  await assertManagedDirectory(directory);
  await rm(directory, { recursive: true, force: false });
}

async function prepareStagingDirectory(directory: string): Promise<void> {
  await removeManagedDirectory(directory);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, OUTPUT_MARKER),
    `${COMPILER_VERSION}\n`,
    "utf8",
  );
}

async function publishAtomically(
  staging: string,
  output: string,
): Promise<void> {
  const previous = `${output}.previous`;
  await assertManagedDirectory(output);
  await removeManagedDirectory(previous);

  if (await exists(output)) {
    await rename(output, previous);
  }

  try {
    await rename(staging, output);
    await removeManagedDirectory(previous);
  } catch (error) {
    if ((await exists(previous)) && !(await exists(output))) {
      await rename(previous, output);
    }
    throw error;
  }
}

function sourceCopyRelativePath(
  source: Pick<SourceRecord, "sourceId">,
): string {
  return `sources/${safeSegment(source.sourceId)}.bin`;
}

function withSourceCopy(document: CompiledDocument): CompiledDocument {
  return {
    ...document,
    source: {
      ...document.source,
      sourceCopyPath: sourceCopyRelativePath(document.source),
    },
  };
}

function buildDocumentManifest(
  artifacts: CompilationArtifacts,
  documentArtifactPaths: ReadonlyMap<string, string>,
): DocumentManifestData {
  const routeByDocument = new Map(
    artifacts.routes.map((route) => [route.documentId, route.canonicalRoute]),
  );
  const documents: DocumentManifestEntry[] = artifacts.documents.map(
    (document) => {
      const canonicalRoute = routeByDocument.get(document.documentId);
      const artifactPath = documentArtifactPaths.get(document.documentId);
      if (canonicalRoute === undefined || artifactPath === undefined) {
        throw new Error(
          `Document is missing a route or artifact path: ${document.documentId}`,
        );
      }
      return {
        documentId: document.documentId,
        sourceId: document.source.sourceId,
        relativePath: document.source.relativePath,
        title: document.title.value,
        canonicalRoute,
        artifactPath,
        headingCount: document.headings.length,
        wordCount: wordCount(document),
        diagnosticCounts: countDiagnostics(document.diagnostics),
      };
    },
  );
  const byRoute: Record<string, string> = {};
  const byDocumentId: Record<string, DocumentManifestEntry> = {};
  for (const document of documents) {
    byRoute[document.canonicalRoute] = document.documentId;
    byDocumentId[document.documentId] = document;
  }
  return {
    corpusId: artifacts.config.corpusId,
    corpusVersion: artifacts.corpusHash,
    documents,
    byRoute,
    byDocumentId,
  };
}

function buildRouteManifest(
  artifacts: CompilationArtifacts,
): RouteManifestData {
  const byCanonicalRoute: Record<string, string> = {};
  const byAnyRoute: Record<string, string> = {};
  for (const route of artifacts.routes) {
    byCanonicalRoute[route.canonicalRoute] = route.documentId;
    byAnyRoute[route.canonicalRoute] = route.documentId;
    for (const alias of [...route.aliases, ...route.redirectsFrom]) {
      byAnyRoute[alias] = route.documentId;
    }
  }
  return { routes: artifacts.routes, byCanonicalRoute, byAnyRoute };
}

async function readPackageVersions(
  projectRoot: string,
): Promise<Readonly<Record<string, string>>> {
  const packageSource = await readFile(
    path.join(projectRoot, "package.json"),
    "utf8",
  );
  const packageJson = JSON.parse(packageSource) as {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  };
  const versions: Record<string, string> = {};
  for (const [name, version] of Object.entries({
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  }).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
    versions[name] = version;
  }
  return versions;
}

export async function writeArtifacts(
  artifacts: CompilationArtifacts,
  projectRoot: string,
): Promise<ArtifactWriteResult> {
  const internalRoot = resolveOutputRoot(
    projectRoot,
    artifacts.config.outputPolicy.directory,
  );
  const publicRoot = resolveOutputRoot(
    projectRoot,
    artifacts.config.outputPolicy.publicDirectory,
  );
  assertIndependentOutputRoots(internalRoot, publicRoot);

  const output = internalRoot.absolutePath;
  const publicOutput = publicRoot.absolutePath;
  const staging = `${output}.staging`;
  const publicStaging = `${publicOutput}.staging`;
  const pretty = artifacts.config.outputPolicy.emitPrettyJson;
  const expectedSourceHashes = new Map<string, string>();
  const stagingRoots: readonly OutputTreeRoot[] = [
    { absolutePath: staging, manifestPath: internalRoot.manifestPath },
    { absolutePath: publicStaging, manifestPath: publicRoot.manifestPath },
  ];

  await Promise.all([
    prepareStagingDirectory(staging),
    prepareStagingDirectory(publicStaging),
  ]);

  const writeJson = async (
    relativePath: string,
    data: unknown,
    destination = staging,
  ): Promise<void> => {
    const value = envelope(artifacts, data);
    ArtifactEnvelopeSchema.parse(value);
    const source = serializeCanonical(value, pretty);
    const absolutePath = path.join(destination, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source, "utf8");
  };

  const writeDiscoveredBytes = async (
    source: SourceRecord,
    relativePath: string,
    destination: string,
    manifestRoot: string,
  ): Promise<void> => {
    const observedHash = sha256Hex(source.rawBytes);
    if (
      source.rawBytes.byteLength !== source.byteLength ||
      observedHash !== source.contentHash
    ) {
      throw new Error(
        `Discovered source bytes no longer match their immutable registry record: ${source.sourceId}`,
      );
    }

    const manifestPath = path.posix.join(manifestRoot, relativePath);
    const existingExpectedHash = expectedSourceHashes.get(manifestPath);
    if (
      existingExpectedHash !== undefined &&
      existingExpectedHash !== source.contentHash
    ) {
      throw new Error(
        `Multiple source records map different bytes to one generated path: ${manifestPath}`,
      );
    }
    expectedSourceHashes.set(manifestPath, source.contentHash);

    const absolutePath = path.join(destination, ...relativePath.split("/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source.rawBytes);
  };

  const documentArtifactPaths = new Map<string, string>();
  for (const document of artifacts.documents) {
    const relativePath = `documents/${safeSegment(document.documentId)}.json`;
    documentArtifactPaths.set(document.documentId, relativePath);
    await writeJson(relativePath, withSourceCopy(document));
  }

  const documentManifest = buildDocumentManifest(
    artifacts,
    documentArtifactPaths,
  );
  const routeManifest = buildRouteManifest(artifacts);
  DocumentManifestDataSchema.parse(documentManifest);
  RouteManifestDataSchema.parse(routeManifest);

  const diagnosticsByDocumentId: Record<string, readonly Diagnostic[]> = {};
  for (const document of artifacts.documents) {
    diagnosticsByDocumentId[document.documentId] = document.diagnostics;
  }
  const diagnosticReport = {
    summary: countDiagnostics(artifacts.diagnostics),
    diagnostics: artifacts.diagnostics,
    byDocumentId: diagnosticsByDocumentId,
  };
  DiagnosticReportDataSchema.parse(diagnosticReport);

  const assetSources = artifacts.sources.filter(
    (source) => source.sourceKind === "asset",
  );
  const assetManifest = assetSources.map((source) => {
    const publicPaths = assetOutputLocation(
      source,
      artifacts.config.assetPolicy,
    );
    return {
      sourceId: source.sourceId,
      rootId: source.rootId,
      originalPath: source.relativePath,
      contentHash: source.contentHash,
      mediaType: source.mediaType,
      byteLength: source.byteLength,
      outputPath: publicPaths.publicUrl,
      variants: [],
      referencingDocumentIds: artifacts.assets
        .filter((reference) => reference.resolvedSourceId === source.sourceId)
        .map((reference) => reference.sourceDocumentId),
    };
  });

  const sourceManifest = artifacts.sources.map((source) => ({
    sourceId: source.sourceId,
    rootId: source.rootId,
    relativePath: source.relativePath,
    normalizedPath: source.normalizedPath,
    extension: source.extension,
    mediaType: source.mediaType,
    encoding: source.encoding,
    byteLength: source.byteLength,
    contentHash: source.contentHash,
    sourceKind: source.sourceKind,
    ...(source.newlineStyle === undefined
      ? {}
      : { newlineStyle: source.newlineStyle }),
    ...(source.bom === undefined ? {} : { bom: source.bom }),
    ...(artifacts.config.outputPolicy.emitSourceCopies
      ? { sourceCopyPath: sourceCopyRelativePath(source) }
      : {}),
  }));

  const redirectManifest = artifacts.routes.flatMap((route) =>
    route.redirectsFrom.map((source) => ({
      source,
      destination: route.canonicalRoute,
    })),
  );
  const headingIndex = artifacts.documents.flatMap(
    (document) => document.headings,
  );
  const citationRecords = artifacts.documents.flatMap(
    (document) => document.citations,
  );
  const citationGraph = {
    citations: citationRecords,
    references: [],
    backlinks: {},
    unresolved: citationRecords.filter(
      (citation) => citation.status === "unresolved",
    ),
  };

  const chunkSize = artifacts.config.searchPolicy.chunkRecordLimit;
  const searchChunks: { path: string; recordCount: number }[] = [];
  for (
    let offset = 0, index = 0;
    offset < artifacts.searchRecords.length;
    offset += chunkSize, index += 1
  ) {
    const records = artifacts.searchRecords.slice(offset, offset + chunkSize);
    const chunkPath = `chunk-${index.toString().padStart(4, "0")}.json`;
    searchChunks.push({ path: chunkPath, recordCount: records.length });
    await Promise.all([
      writeJson(`search-index/${chunkPath}`, { records }),
      writeJson(`search-index/${chunkPath}`, { records }, publicStaging),
    ]);
  }
  const searchIndex = {
    recordCount: artifacts.searchRecords.length,
    chunks: searchChunks,
  };
  SearchIndexDataSchema.parse(searchIndex);

  const packageVersions = await readPackageVersions(projectRoot);
  const commonArtifacts: readonly [string, unknown][] = [
    [
      "corpus-manifest.json",
      {
        corpusId: artifacts.config.corpusId,
        corpusVersion: artifacts.corpusHash,
        sourceCount: artifacts.sources.length,
        documentCount: artifacts.documents.length,
        assetCount: assetSources.length,
        contentRoots: artifacts.config.contentRoots.map(
          ({ id, path: rootPath, trustLevel }) => ({
            id,
            configuredPath: rootPath,
            trustLevel,
          }),
        ),
      },
    ],
    ["source-manifest.json", { sources: sourceManifest }],
    ["document-manifest.json", documentManifest],
    ["content-graph.json", { nodes: artifacts.contentNodes }],
    ["navigation-manifest.json", artifacts.navigation],
    ["route-manifest.json", routeManifest],
    ["redirect-manifest.json", { redirects: redirectManifest }],
    ["heading-index.json", { headings: headingIndex }],
    ["link-graph.json", { links: artifacts.links }],
    ["citation-graph.json", citationGraph],
    [
      "asset-manifest.json",
      { assets: assetManifest, references: artifacts.assets },
    ],
    ["search-index/index.json", searchIndex],
    ["diagnostics.json", diagnosticReport],
    ["preservation-report.json", { documents: artifacts.preservation }],
    [
      "transformation-report.json",
      {
        transforms: artifacts.documents.flatMap(
          (document) => document.provenance,
        ),
      },
    ],
    [
      "build-metadata.json",
      {
        compilerVersion: COMPILER_VERSION,
        irVersion: IR_VERSION,
        nodeVersion: process.versions.node,
        platform: process.platform,
        architecture: process.arch,
        dependencyVersions: packageVersions,
        reproducible: true,
      },
    ],
  ];

  for (const [relativePath, data] of commonArtifacts) {
    await writeJson(relativePath, data);
  }
  await writeJson("search-index/index.json", searchIndex, publicStaging);
  await writeJson("book-manifest.json", documentManifest, publicStaging);

  for (const [fileName, schema] of Object.entries(artifactJsonSchemas()).sort(
    ([left], [right]) => (left < right ? -1 : left > right ? 1 : 0),
  )) {
    const source = serializeCanonical(schema, pretty);
    const absolutePath = path.join(staging, "schemas", fileName);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source, "utf8");
  }

  if (artifacts.config.outputPolicy.emitSourceCopies) {
    for (const source of artifacts.sources) {
      await writeDiscoveredBytes(
        source,
        sourceCopyRelativePath(source),
        staging,
        internalRoot.manifestPath,
      );
    }
  }

  if (artifacts.config.assetPolicy.copyOriginals) {
    for (const source of assetSources) {
      const publicPaths = assetOutputLocation(
        source,
        artifacts.config.assetPolicy,
      );
      await writeDiscoveredBytes(
        source,
        publicPaths.relativeFilePath,
        publicStaging,
        publicRoot.manifestPath,
      );
    }
  }

  const artifactIndexPath = path.posix.join(
    internalRoot.manifestPath,
    "artifact-index.json",
  );
  const indexedHashes = await snapshotOutputTrees(
    stagingRoots,
    new Set([artifactIndexPath]),
  );
  assertExpectedOutputHashes(indexedHashes, expectedSourceHashes);
  const artifactIndex = {
    hashAlgorithm: "sha256",
    pathBase: "project-root",
    roots: {
      internal: internalRoot.manifestPath,
      public: publicRoot.manifestPath,
    },
    unindexedSelfPath: artifactIndexPath,
    artifacts: indexedHashes,
  };
  ArtifactIndexDataSchema.parse(artifactIndex);
  await writeJson("artifact-index.json", artifactIndex);

  const completeHashes = await snapshotOutputTrees(stagingRoots);
  assertExpectedOutputHashes(completeHashes, expectedSourceHashes);
  assertArtifactIndexCoverage(indexedHashes, completeHashes, artifactIndexPath);

  await Promise.all([
    publishAtomically(staging, output),
    publishAtomically(publicStaging, publicOutput),
  ]);

  return {
    outputDirectory: output,
    publicDirectory: publicOutput,
    artifactHashes: completeHashes,
  };
}
