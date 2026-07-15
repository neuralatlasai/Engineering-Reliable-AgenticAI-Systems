import { link, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defineBookConfig } from "../../src/compiler/config";
import { DIAGNOSTIC_CODES } from "../../src/compiler/diagnostics";
import { discoverSources } from "../../src/compiler/discovery";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "book-discovery-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("corpus discovery", () => {
  it("discovers multiple roots in stable order while preserving bytes, BOM, and newlines", async () => {
    const workspace = await temporaryDirectory();
    const rootA = path.join(workspace, "root-a");
    const rootB = path.join(workspace, "root-b");
    await mkdir(path.join(rootA, "nested"), { recursive: true });
    await mkdir(path.join(rootA, "skip"), { recursive: true });
    await mkdir(rootB, { recursive: true });

    const bomDocument = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("alpha\r\nbeta\n", "utf8"),
    ]);
    await Promise.all([
      writeFile(path.join(rootA, "z.md"), "z\r\n"),
      writeFile(path.join(rootA, "nested", "a.md"), bomDocument),
      writeFile(path.join(rootA, "skip", "draft.md"), "excluded\n"),
      writeFile(path.join(rootA, ".hidden.md"), "hidden\n"),
      writeFile(path.join(rootB, "b.md"), "b\n"),
      writeFile(
        path.join(rootB, "image.png"),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      ),
    ]);

    const config = defineBookConfig({
      corpusId: "multi-root",
      contentRoots: [
        { id: "b", path: rootB, trustLevel: "untrusted" },
        {
          id: "a",
          path: rootA,
          exclude: ["skip/**"],
          trustLevel: "reviewed",
        },
      ],
    });
    const result = await discoverSources(config, { readConcurrency: 2 });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(
      result.value.map((source) => `${source.rootId}:${source.normalizedPath}`),
    ).toEqual(["a:nested/a.md", "a:z.md", "b:b.md", "b:image.png"]);

    const preserved = result.value[0];
    expect(preserved?.bom).toBe("utf-8");
    expect(preserved?.newlineStyle).toBe("mixed");
    expect(preserved?.rawText).toBe("alpha\r\nbeta\n");
    expect(Buffer.from(preserved?.rawBytes ?? [])).toEqual(bomDocument);

    const asset = result.value.at(-1);
    expect(asset?.sourceKind).toBe("asset");
    expect(asset?.encoding).toBe("binary");
    expect(asset?.rawText).toBeUndefined();
  });

  it("fails deterministically when content addressing produces duplicate source IDs", async () => {
    const root = await temporaryDirectory();
    await Promise.all([
      writeFile(path.join(root, "first.md"), "identical\n"),
      writeFile(path.join(root, "second.md"), "identical\n"),
    ]);
    const config = defineBookConfig({
      corpusId: "content-addressed",
      contentRoots: [{ id: "main", path: root, trustLevel: "reviewed" }],
      discoveryPolicy: { sourceIdStrategy: "content" },
    });

    const result = await discoverSources(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DIAGNOSTIC_CODES.SOURCE_DUPLICATE_ID,
      );
    }
  });

  it("detects hard-linked physical duplicates and rejects invalid UTF-8", async () => {
    const duplicateRoot = await temporaryDirectory();
    const original = path.join(duplicateRoot, "original.md");
    await writeFile(original, "linked\n");
    await link(original, path.join(duplicateRoot, "alias.md"));

    const duplicateResult = await discoverSources(
      defineBookConfig({
        corpusId: "physical-duplicate",
        contentRoots: [
          { id: "main", path: duplicateRoot, trustLevel: "reviewed" },
        ],
      }),
    );
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) {
      expect(
        duplicateResult.diagnostics.map((diagnostic) => diagnostic.code),
      ).toContain(DIAGNOSTIC_CODES.SOURCE_DUPLICATE_PHYSICAL_FILE);
    }

    const invalidRoot = await temporaryDirectory();
    await writeFile(
      path.join(invalidRoot, "invalid.md"),
      Buffer.from([0xc3, 0x28]),
    );
    const invalidResult = await discoverSources(
      defineBookConfig({
        corpusId: "invalid-encoding",
        contentRoots: [
          { id: "main", path: invalidRoot, trustLevel: "untrusted" },
        ],
      }),
    );
    expect(invalidResult.ok).toBe(false);
    if (!invalidResult.ok) {
      expect(
        invalidResult.diagnostics.map((diagnostic) => diagnostic.code),
      ).toContain(DIAGNOSTIC_CODES.SOURCE_INVALID_ENCODING);
    }
  });
});
