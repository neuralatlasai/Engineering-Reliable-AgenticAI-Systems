import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { compileBook } from "../../src/compiler/compiler";
import { defineBookConfig } from "../../src/compiler/config";
import type {
  BookCompilerConfig,
  ParseContext,
  ProvenanceRecord,
  SourceRecord,
} from "../../src/compiler/model";
import { RemarkParserAdapter } from "../../src/compiler/parser";

const preservationMockState = vi.hoisted(() => ({
  injectViolation: false,
}));

vi.mock("../../src/compiler/preservation", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/compiler/preservation")>();

  return {
    ...actual,
    verifyPreservation(
      options: Parameters<typeof actual.verifyPreservation>[0],
    ) {
      const report = actual.verifyPreservation(options);
      if (!preservationMockState.injectViolation) {
        return report;
      }

      return {
        ...report,
        violations: [
          ...report.violations,
          {
            code: "VERIFIER_DETECTED_DATA_LOSS",
            nodeType: "test-node",
            before: 1,
            after: 0,
            message: "The preservation verifier detected synthetic data loss.",
          },
        ],
      };
    },
  };
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  preservationMockState.injectViolation = false;
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function compilerConfig(
  validationPolicy: Partial<BookCompilerConfig["validationPolicy"]>,
): BookCompilerConfig {
  return defineBookConfig({
    corpusId: "compiler-policy-test",
    contentRoots: [{ id: "book", path: ".", trustLevel: "reviewed" }],
    include: ["**/*.md"],
    exclude: [],
    hierarchyPolicy: { strategies: ["flat"] },
    renderingPolicy: { syntaxHighlighting: false },
    searchPolicy: { enabled: false },
    validationPolicy,
  });
}

async function compileMarkdown(
  markdown: string,
  validationPolicy: Partial<BookCompilerConfig["validationPolicy"]>,
) {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "book-compiler-policy-"),
  );
  temporaryDirectories.push(projectRoot);
  await writeFile(path.join(projectRoot, "document.md"), markdown, "utf8");
  return compileBook(compilerConfig(validationPolicy), projectRoot);
}

function injectProvenance(records: readonly ProvenanceRecord[]): void {
  const originalParse = RemarkParserAdapter.prototype.parse;
  vi.spyOn(RemarkParserAdapter.prototype, "parse").mockImplementation(
    async function (
      this: RemarkParserAdapter,
      source: SourceRecord,
      context: ParseContext,
    ) {
      const result = await originalParse.call(this, source, context);
      if (!result.ok) {
        return result;
      }

      return {
        ...result,
        value: {
          ...result.value,
          provenance: [...result.value.provenance, ...records],
        },
      };
    },
  );
}

function removeTransform(
  transformId: string,
  inputNodeId: string,
): ProvenanceRecord {
  return {
    transformId,
    transformVersion: "1.0.0",
    inputNodeIds: [inputNodeId],
    outputNodeIds: [],
    mutationType: "remove",
    justification: "Synthetic policy-boundary test transform.",
    reversible: false,
  };
}

describe("mandatory compiler failure policy", () => {
  it("rejects duplicate explicit heading IDs even when ordinary errors are tolerated", async () => {
    const result = await compileMarkdown(
      "# First {#stable}\n\n## Second {#stable}\n",
      {
        failOn: "fatal",
        duplicateExplicitHeadingId: "error",
      },
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "PARSER_DUPLICATE_EXPLICIT_HEADING_ID",
    );
  });

  it("rejects every remove provenance record unless removal is explicitly allowed", async () => {
    injectProvenance([
      removeTransform("test:remove-first", "node:first"),
      removeTransform("test:remove-second", "node:second"),
    ]);

    const result = await compileMarkdown("# Document\n", {
      allowRemoveTransforms: false,
      failOn: "fatal",
    });

    expect(result.ok).toBe(false);
    const removalDiagnostics = result.diagnostics.filter(
      ({ code }) => code === "VALIDATION_REMOVE_TRANSFORM_NOT_ALLOWED",
    );
    expect(removalDiagnostics).toHaveLength(2);
    expect(removalDiagnostics.map(({ nodeId }) => nodeId)).toEqual([
      "node:first",
      "node:second",
    ]);
    expect(removalDiagnostics.map(({ message }) => message)).toEqual([
      expect.stringContaining('"test:remove-first"'),
      expect.stringContaining('"test:remove-second"'),
    ]);
  });

  it("accepts declared remove provenance when the policy explicitly allows it", async () => {
    injectProvenance([
      removeTransform("test:reviewed-removal", "node:reviewed"),
    ]);

    const result = await compileMarkdown("# Document\n", {
      allowRemoveTransforms: true,
      failOn: "fatal",
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.map(({ code }) => code)).not.toContain(
      "VALIDATION_REMOVE_TRANSFORM_NOT_ALLOWED",
    );
  });

  it("rejects every preservation report violation independently of its diagnostic code", async () => {
    preservationMockState.injectViolation = true;

    const result = await compileMarkdown("# Document\n", {
      failOn: "fatal",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "VERIFIER_DETECTED_DATA_LOSS",
    );
  });
});
