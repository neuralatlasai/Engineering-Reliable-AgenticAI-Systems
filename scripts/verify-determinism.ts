import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import bookConfig from "../book.config";
import {
  ArtifactEnvelopeSchema,
  ArtifactIndexDataSchema,
} from "../src/compiler/artifact-schemas";
import {
  snapshotOutputTrees,
  type OutputTreeRoot,
} from "../src/compiler/artifacts";
import { canonicalizeJson } from "../src/compiler/canonical";
import { validateBookCompilerConfig } from "../src/compiler/config";
import type { BookCompilerConfig } from "../src/compiler/model";

const require = createRequire(import.meta.url);

function runCompiler(projectRoot: string): void {
  const tsxExecutable = require.resolve("tsx/cli");
  const result = spawnSync(
    process.execPath,
    [tsxExecutable, "src/compiler/cli.ts", "--config", "book.config.ts"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
      stdio: "pipe",
    },
  );
  if (result.error !== undefined) {
    throw new Error(
      `Content compiler process could not start during determinism verification: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Content compiler failed during determinism verification.\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
}

function requireConfiguration(): BookCompilerConfig {
  const result = validateBookCompilerConfig(bookConfig);
  if (result.ok) {
    return result.value;
  }
  throw new Error(
    `Compiler configuration is invalid:\n${result.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join("\n")}`,
  );
}

function resolveTreeRoot(
  projectRoot: string,
  configuredPath: string,
): OutputTreeRoot {
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
      `Determinism verification rejects output paths outside the project root: ${configuredPath}`,
    );
  }
  return {
    absolutePath,
    manifestPath: relativePath.split(path.sep).join("/"),
  };
}

function withoutPath(
  snapshot: Readonly<Record<string, string>>,
  excludedPath: string,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(snapshot).filter(
      ([manifestPath]) => manifestPath !== excludedPath,
    ),
  );
}

async function captureCompleteOutputSnapshot(
  projectRoot: string,
  config: BookCompilerConfig,
): Promise<Readonly<Record<string, string>>> {
  const internalRoot = resolveTreeRoot(
    projectRoot,
    config.outputPolicy.directory,
  );
  const publicRoot = resolveTreeRoot(
    projectRoot,
    config.outputPolicy.publicDirectory,
  );
  const artifactIndexPath = path.posix.join(
    internalRoot.manifestPath,
    "artifact-index.json",
  );
  const artifactIndexSource = await readFile(
    path.join(internalRoot.absolutePath, "artifact-index.json"),
    "utf8",
  );
  const envelope = ArtifactEnvelopeSchema.parse(
    JSON.parse(artifactIndexSource) as unknown,
  );
  const index = ArtifactIndexDataSchema.parse(envelope.data);
  if (
    index.roots.internal !== internalRoot.manifestPath ||
    index.roots.public !== publicRoot.manifestPath ||
    index.unindexedSelfPath !== artifactIndexPath
  ) {
    throw new Error(
      "Artifact index output roots do not match the validated compiler configuration.",
    );
  }

  const complete = await snapshotOutputTrees([internalRoot, publicRoot]);
  const indexedFiles = withoutPath(complete, artifactIndexPath);
  if (canonicalizeJson(index.artifacts) !== canonicalizeJson(indexedFiles)) {
    throw new Error(
      "Artifact index omits, adds, or mis-hashes a generated internal/public output file.",
    );
  }
  return complete;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const config = requireConfiguration();

  runCompiler(projectRoot);
  const first = await captureCompleteOutputSnapshot(projectRoot, config);
  runCompiler(projectRoot);
  const second = await captureCompleteOutputSnapshot(projectRoot, config);

  if (canonicalizeJson(first) !== canonicalizeJson(second)) {
    const paths = new Set([...Object.keys(first), ...Object.keys(second)]);
    const changedPaths = [...paths]
      .filter((manifestPath) => first[manifestPath] !== second[manifestPath])
      .sort();
    throw new Error(
      `Generated output trees changed between identical consecutive builds:\n${changedPaths.join("\n")}`,
    );
  }
  process.stdout.write(
    `Determinism verification passed: ${Object.keys(second).length} generated files are byte-identical across both complete output trees.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
