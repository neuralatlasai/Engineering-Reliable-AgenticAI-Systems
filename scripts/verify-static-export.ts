import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ArtifactEnvelope } from "../src/compiler/model";
import type { RouteManifestData } from "../src/runtime/types";
import { normalizeBookBasePath } from "../src/shared/base-path";

const outputRoot = path.resolve(process.cwd(), "out");
const basePath = normalizeBookBasePath(process.env["BOOK_BASE_PATH"]);
const heroAssetStem = "engineering-reliable-agentic-ai-systems-hero";
const heroAssetWidths = [640, 1024, 1536] as const;
const heroAssetFormats = [
  { extension: "avif", maximumBytes: 200 * 1024 },
  { extension: "webp", maximumBytes: 300 * 1024 },
] as const;
const heroFamilyMaximumBytes = 1024 * 1024;

const heroAssets = heroAssetWidths.flatMap((width) =>
  heroAssetFormats.map(({ extension, maximumBytes }) => ({
    fileName: `${heroAssetStem}-${width}.${extension}`,
    maximumBytes,
  })),
);

function confinedOutputPath(...segments: readonly string[]): string {
  const candidate = path.resolve(outputRoot, ...segments);
  const relative = path.relative(outputRoot, candidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Static verification path escaped out/: ${candidate}`);
  }
  return candidate;
}

async function requireFile(
  absolutePath: string,
  description: string,
): Promise<number> {
  const metadata = await stat(absolutePath);
  if (!metadata.isFile()) {
    throw new Error(`${description} is not a regular file: ${absolutePath}`);
  }
  return metadata.size;
}

async function verifyHeroAssets(): Promise<void> {
  const sizes = await Promise.all(
    heroAssets.map(async ({ fileName, maximumBytes }) => {
      const size = await requireFile(
        confinedOutputPath("images", "home", fileName),
        `Responsive home hero asset '${fileName}'`,
      );
      if (size > maximumBytes) {
        throw new Error(
          `Responsive home hero asset '${fileName}' is ${size} bytes; its budget is ${maximumBytes} bytes.`,
        );
      }
      return size;
    }),
  );
  const familyBytes = sizes.reduce((total, size) => total + size, 0);
  if (familyBytes > heroFamilyMaximumBytes) {
    throw new Error(
      `Responsive home hero family is ${familyBytes} bytes; its aggregate budget is ${heroFamilyMaximumBytes} bytes.`,
    );
  }
}

function routeOutputPath(route: string): string {
  if (!/^\/read\/[A-Za-z0-9._~/-]+$/u.test(route)) {
    throw new Error(`Cannot safely verify generated route: ${route}`);
  }
  return confinedOutputPath(...route.slice(1).split("/"), "index.html");
}

function scriptOutputPath(source: string): string {
  const pathOnly = source.split(/[?#]/u, 1)[0] ?? "";
  const logicalPath =
    basePath === ""
      ? pathOnly
      : pathOnly.startsWith(`${basePath}/`)
        ? pathOnly.slice(basePath.length)
        : "";
  if (!logicalPath.startsWith("/_next/") || logicalPath.includes("..")) {
    throw new Error(`Unexpected framework script URL: ${source}`);
  }
  return confinedOutputPath(...logicalPath.slice(1).split("/"));
}

async function main(): Promise<void> {
  const rootHtmlPath = confinedOutputPath("index.html");
  const searchManifestPath = confinedOutputPath(
    "_book",
    "search-index",
    "index.json",
  );
  const routeManifestPath = path.resolve(
    process.cwd(),
    "build",
    "route-manifest.json",
  );
  await Promise.all([
    requireFile(rootHtmlPath, "Root static page"),
    requireFile(searchManifestPath, "Search manifest"),
    requireFile(routeManifestPath, "Compiled route manifest"),
    verifyHeroAssets(),
  ]);

  const [rootHtml, routeManifestSource] = await Promise.all([
    readFile(rootHtmlPath, "utf8"),
    readFile(routeManifestPath, "utf8"),
  ]);
  const frameworkPrefix = `${basePath}/_next/`;
  const internalRoutePrefix = `href="${basePath}/read/`;
  if (!rootHtml.includes(frameworkPrefix)) {
    throw new Error(
      `Root page does not reference the expected framework prefix '${frameworkPrefix}'.`,
    );
  }
  if (!rootHtml.includes(internalRoutePrefix)) {
    throw new Error(
      `Root page does not reference the expected route prefix '${internalRoutePrefix}'.`,
    );
  }
  for (const { fileName } of heroAssets) {
    const expectedHeroReference = `${basePath}/images/home/${fileName}`;
    if (!rootHtml.includes(expectedHeroReference)) {
      throw new Error(
        `Root page does not reference the expected base-prefixed hero asset '${expectedHeroReference}'.`,
      );
    }
  }

  const routeManifest = JSON.parse(
    routeManifestSource,
  ) as ArtifactEnvelope<RouteManifestData>;
  const deepRoute = routeManifest.data.routes.find((route) =>
    /^\/read\/[A-Za-z0-9._~/-]+$/u.test(route.canonicalRoute),
  )?.canonicalRoute;
  if (deepRoute === undefined) {
    throw new Error(
      "Compiled route manifest contains no verifiable deep route.",
    );
  }

  const deepHtmlPath = routeOutputPath(deepRoute);
  await requireFile(deepHtmlPath, "Deep static page");
  const deepHtml = await readFile(deepHtmlPath, "utf8");
  const expectedCanonical = `${basePath}${deepRoute}`;
  if (!deepHtml.includes(expectedCanonical)) {
    throw new Error(
      `Deep page does not contain its base-prefixed canonical path '${expectedCanonical}'.`,
    );
  }

  const scriptSources = [
    ...rootHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
  const scripts = await Promise.all(
    [...new Set(scriptSources)].map(async (source) =>
      readFile(scriptOutputPath(source), "utf8"),
    ),
  );
  const searchTarget = "/_book/search-index/index.json";
  if (!scripts.some((script) => script.includes(searchTarget))) {
    throw new Error(
      `Client scripts do not contain the expected search target '${searchTarget}'.`,
    );
  }
  if (basePath !== "" && !scripts.some((script) => script.includes(basePath))) {
    throw new Error(
      `Client scripts do not contain the deployment base path '${basePath}'.`,
    );
  }

  process.stdout.write(
    `Static export verification passed for '${basePath || "/"}' using deep route '${deepRoute}'.\n`,
  );
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
