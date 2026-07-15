import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { writeArtifacts } from "./artifacts";
import { canonicalizeJson } from "./canonical";
import { compileBook } from "./compiler";
import { validateBookCompilerConfig } from "./config";
import type { BookCompilerConfig, Diagnostic } from "./model";

interface CliArguments {
  readonly configPath: string;
}

function parseArguments(arguments_: readonly string[]): CliArguments {
  let configPath = "book.config.ts";
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--config") {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error("--config requires a path argument.");
      }
      configPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown compiler argument: ${argument ?? ""}`);
  }
  return { configPath };
}

async function loadConfiguration(
  projectRoot: string,
  configPath: string,
): Promise<BookCompilerConfig> {
  const absolutePath = path.resolve(projectRoot, configPath);
  const importedConfiguration: unknown = await import(
    pathToFileURL(absolutePath).href
  );
  const candidate =
    typeof importedConfiguration === "object" &&
    importedConfiguration !== null &&
    "default" in importedConfiguration
      ? (importedConfiguration as { readonly default: unknown }).default
      : importedConfiguration;
  const validation = validateBookCompilerConfig(candidate);
  if (!validation.ok) {
    const message = validation.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join("\n");
    throw new Error(`Compiler configuration is invalid:\n${message}`);
  }
  return validation.value;
}

function diagnosticSummary(
  diagnostics: readonly Diagnostic[],
): Record<string, number> {
  const summary: Record<string, number> = {
    info: 0,
    warning: 0,
    error: 0,
    fatal: 0,
  };
  for (const diagnostic of diagnostics) {
    summary[diagnostic.severity] = (summary[diagnostic.severity] ?? 0) + 1;
  }
  return summary;
}

async function writeRunReport(
  projectRoot: string,
  data: Readonly<Record<string, unknown>>,
): Promise<void> {
  const cacheDirectory = path.join(projectRoot, ".book-cache");
  await mkdir(cacheDirectory, { recursive: true });
  await writeFile(
    path.join(cacheDirectory, "last-run.json"),
    `${canonicalizeJson(data)}\n`,
    "utf8",
  );
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const started = process.hrtime.bigint();
  const arguments_ = parseArguments(process.argv.slice(2));
  const config = await loadConfiguration(projectRoot, arguments_.configPath);
  const compilation = await compileBook(config, projectRoot);
  const durationNanoseconds = process.hrtime.bigint() - started;

  if (!compilation.ok) {
    const summary = diagnosticSummary(compilation.diagnostics);
    await writeRunReport(projectRoot, {
      status: "failed",
      durationNanoseconds: durationNanoseconds.toString(),
      summary,
      diagnostics: compilation.diagnostics,
    });
    for (const diagnostic of compilation.diagnostics) {
      const location =
        diagnostic.sourceId === undefined ? "" : ` [${diagnostic.sourceId}]`;
      process.stderr.write(
        `${diagnostic.severity.toUpperCase()} ${diagnostic.code}${location}: ${diagnostic.message}\n`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const written = await writeArtifacts(compilation.value, projectRoot);
  const summary = diagnosticSummary(compilation.diagnostics);
  await writeRunReport(projectRoot, {
    status: "succeeded",
    durationNanoseconds: durationNanoseconds.toString(),
    corpusHash: compilation.value.corpusHash,
    sourceCount: compilation.value.sources.length,
    documentCount: compilation.value.documents.length,
    routeCount: compilation.value.routes.length,
    searchRecordCount: compilation.value.searchRecords.length,
    artifactCount: Object.keys(written.artifactHashes).length,
    summary,
  });
  process.stdout.write(
    `Compiled ${compilation.value.documents.length} documents and ${compilation.value.sources.length} total sources (${summary["warning"] ?? 0} warnings).\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
