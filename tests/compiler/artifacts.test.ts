import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ArtifactEnvelopeSchema,
  ArtifactIndexDataSchema,
} from "../../src/compiler/artifact-schemas";
import { assetOutputLocation } from "../../src/compiler/asset-path";
import { writeArtifacts } from "../../src/compiler/artifacts";
import { sha256Hex } from "../../src/compiler/canonical";
import {
  defineBookConfig,
  hashBookCompilerConfig,
} from "../../src/compiler/config";
import type {
  CompilationArtifacts,
  SourceRecord,
} from "../../src/compiler/model";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("artifact publication integrity", () => {
  it("publishes source and asset bytes from discovery memory and indexes both output trees", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "book-artifacts-"));
    temporaryDirectories.push(projectRoot);
    await writeFile(
      path.join(projectRoot, "package.json"),
      '{"dependencies":{},"devDependencies":{}}\n',
      "utf8",
    );

    const rawBytes = Uint8Array.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
    ]);
    const contentHash = sha256Hex(rawBytes);
    const source: SourceRecord = {
      sourceId: "source:asset",
      rootId: "content",
      absolutePath: path.join(projectRoot, "original-was-removed.pdf"),
      relativePath: "references/source.pdf",
      normalizedPath: "references/source.pdf",
      extension: ".pdf",
      mediaType: "application/pdf",
      encoding: "binary",
      byteLength: rawBytes.byteLength,
      contentHash,
      rawBytes,
      discoveredAtBuildPhase: "corpus-discovery",
      sourceKind: "asset",
      trustLevel: "reviewed",
      physicalPathHash: sha256Hex("deleted-original"),
    };
    const config = defineBookConfig({
      corpusId: "artifact-integrity-test",
      contentRoots: [
        { id: "content", path: "content", trustLevel: "reviewed" },
      ],
      assetPolicy: { copyOriginals: true },
      outputPolicy: {
        directory: "generated/internal",
        publicDirectory: "generated/public",
        emitSourceCopies: true,
      },
    });
    const artifacts: CompilationArtifacts = {
      config,
      configHash: hashBookCompilerConfig(config),
      corpusHash: sha256Hex("test-corpus"),
      sources: [source],
      documents: [],
      contentNodes: {},
      routes: [],
      navigation: {
        roots: [],
        nodes: {},
        previousByNode: {},
        nextByNode: {},
      },
      links: [],
      assets: [],
      searchRecords: [],
      preservation: [],
      diagnostics: [],
    };

    const written = await writeArtifacts(artifacts, projectRoot);
    const sourceManifestEnvelope = ArtifactEnvelopeSchema.parse(
      JSON.parse(
        await readFile(
          path.join(written.outputDirectory, "source-manifest.json"),
          "utf8",
        ),
      ) as unknown,
    );
    const sourceManifest = sourceManifestEnvelope.data as {
      readonly sources: readonly { readonly sourceCopyPath?: string }[];
    };
    const sourceCopyPath = sourceManifest.sources[0]?.sourceCopyPath;
    expect(sourceCopyPath).toBeDefined();
    if (sourceCopyPath === undefined) {
      throw new Error(
        "Source manifest omitted the configured source copy path.",
      );
    }

    const assetLocation = assetOutputLocation(source, config.assetPolicy);
    await expect(
      readFile(
        path.join(written.outputDirectory, ...sourceCopyPath.split("/")),
      ),
    ).resolves.toEqual(Buffer.from(rawBytes));
    await expect(
      readFile(
        path.join(
          written.publicDirectory,
          ...assetLocation.relativeFilePath.split("/"),
        ),
      ),
    ).resolves.toEqual(Buffer.from(rawBytes));

    const artifactIndexEnvelope = ArtifactEnvelopeSchema.parse(
      JSON.parse(
        await readFile(
          path.join(written.outputDirectory, "artifact-index.json"),
          "utf8",
        ),
      ) as unknown,
    );
    const artifactIndex = ArtifactIndexDataSchema.parse(
      artifactIndexEnvelope.data,
    );
    const sourceCopyManifestPath = path.posix.join(
      "generated/internal",
      sourceCopyPath,
    );
    const assetManifestPath = path.posix.join(
      "generated/public",
      assetLocation.relativeFilePath,
    );
    expect(artifactIndex.artifacts[sourceCopyManifestPath]).toBe(contentHash);
    expect(artifactIndex.artifacts[assetManifestPath]).toBe(contentHash);
    expect(
      artifactIndex.artifacts["generated/internal/.book-compiler-output"],
    ).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      artifactIndex.artifacts["generated/public/.book-compiler-output"],
    ).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      artifactIndex.artifacts[artifactIndex.unindexedSelfPath],
    ).toBeUndefined();
    expect(written.artifactHashes[artifactIndex.unindexedSelfPath]).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(Object.keys(written.artifactHashes)).toHaveLength(
      Object.keys(artifactIndex.artifacts).length + 1,
    );
  });
});
