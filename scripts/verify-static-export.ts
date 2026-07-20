import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ArtifactEnvelope, AssetReference } from "../src/compiler/model";
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

interface AssetManifestEntry {
  readonly byteLength: number;
  readonly contentHash: string;
  readonly mediaType: string;
  readonly outputPath: string;
}

interface AssetManifestData {
  readonly assets: readonly AssetManifestEntry[];
  readonly references: readonly AssetReference[];
}

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
  if (route === "/") return confinedOutputPath("index.html");
  if (!/^\/read\/[A-Za-z0-9._~/-]+$/u.test(route)) {
    throw new Error(`Cannot safely verify generated route: ${route}`);
  }
  return confinedOutputPath(...route.slice(1).split("/"), "index.html");
}

function assetOutputPath(publicUrl: string): string {
  if (
    !publicUrl.startsWith("/_book/assets/") ||
    publicUrl.includes("?") ||
    publicUrl.includes("#")
  ) {
    throw new Error(`Unexpected compiled asset URL: ${publicUrl}`);
  }

  const segments = publicUrl
    .slice(1)
    .split("/")
    .map((segment) => {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        throw new Error(`Compiled asset URL is not valid UTF-8: ${publicUrl}`);
      }
      if (
        decoded === "" ||
        decoded === "." ||
        decoded === ".." ||
        /[\\/\0]/u.test(decoded)
      ) {
        throw new Error(
          `Compiled asset URL has an unsafe segment: ${publicUrl}`,
        );
      }
      return decoded;
    });
  return confinedOutputPath(...segments);
}

async function sha256File(absolutePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(absolutePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function verifyCompiledAssets(
  assetManifest: ArtifactEnvelope<AssetManifestData>,
  routeManifest: ArtifactEnvelope<RouteManifestData>,
): Promise<{ publishedAssetCount: number; referencedImageCount: number }> {
  const assetsByOutputPath = new Map<string, AssetManifestEntry>();
  for (const asset of assetManifest.data.assets) {
    if (assetsByOutputPath.has(asset.outputPath)) {
      throw new Error(`Duplicate compiled asset URL: ${asset.outputPath}`);
    }
    assetsByOutputPath.set(asset.outputPath, asset);

    const absolutePath = assetOutputPath(asset.outputPath);
    const byteLength = await requireFile(
      absolutePath,
      `Compiled asset '${asset.outputPath}'`,
    );
    if (byteLength !== asset.byteLength) {
      throw new Error(
        `Compiled asset '${asset.outputPath}' is ${byteLength} bytes; its manifest declares ${asset.byteLength} bytes.`,
      );
    }
    const contentHash = await sha256File(absolutePath);
    if (contentHash !== asset.contentHash) {
      throw new Error(
        `Compiled asset '${asset.outputPath}' has SHA-256 ${contentHash}; expected ${asset.contentHash}.`,
      );
    }
  }

  const routeByDocumentId = new Map(
    routeManifest.data.routes.map(({ canonicalRoute, documentId }) => [
      documentId,
      canonicalRoute,
    ]),
  );
  const expectedImagesByRoute = new Map<string, Set<string>>();
  let referencedImageCount = 0;

  for (const reference of assetManifest.data.references) {
    if (reference.status !== "valid") continue;
    if (reference.outputPath === undefined) {
      throw new Error(
        `Valid asset reference '${reference.assetId}' has no output path.`,
      );
    }
    const asset = assetsByOutputPath.get(reference.outputPath);
    if (asset === undefined) {
      throw new Error(
        `Asset reference '${reference.assetId}' targets an unpublished asset '${reference.outputPath}'.`,
      );
    }
    if (!asset.mediaType.startsWith("image/")) {
      throw new Error(
        `Image reference '${reference.assetId}' resolved to non-image media type '${asset.mediaType}'.`,
      );
    }

    const route = routeByDocumentId.get(reference.sourceDocumentId);
    if (route === undefined) {
      throw new Error(
        `Image reference '${reference.assetId}' belongs to a document without a route.`,
      );
    }
    const expectedSource = `${basePath}${reference.outputPath}`;
    const sources = expectedImagesByRoute.get(route) ?? new Set<string>();
    sources.add(expectedSource);
    expectedImagesByRoute.set(route, sources);
    referencedImageCount += 1;
  }

  for (const [route, expectedSources] of expectedImagesByRoute) {
    const html = await readFile(routeOutputPath(route), "utf8");
    for (const expectedSource of expectedSources) {
      if (!html.includes(`src="${expectedSource}"`)) {
        throw new Error(
          `Static page '${route}' does not render its base-prefixed image '${expectedSource}'.`,
        );
      }
    }
  }

  return {
    publishedAssetCount: assetsByOutputPath.size,
    referencedImageCount,
  };
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
  const assetManifestPath = path.resolve(
    process.cwd(),
    "build",
    "asset-manifest.json",
  );
  await Promise.all([
    requireFile(rootHtmlPath, "Root static page"),
    requireFile(searchManifestPath, "Search manifest"),
    requireFile(routeManifestPath, "Compiled route manifest"),
    requireFile(assetManifestPath, "Compiled asset manifest"),
    verifyHeroAssets(),
  ]);

  const [rootHtml, routeManifestSource, assetManifestSource] =
    await Promise.all([
      readFile(rootHtmlPath, "utf8"),
      readFile(routeManifestPath, "utf8"),
      readFile(assetManifestPath, "utf8"),
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
  const assetManifest = JSON.parse(
    assetManifestSource,
  ) as ArtifactEnvelope<AssetManifestData>;
  const assetSummary = await verifyCompiledAssets(assetManifest, routeManifest);
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
    `Static export verification passed for '${basePath || "/"}' using deep route '${deepRoute}', ${assetSummary.publishedAssetCount} published assets, and ${assetSummary.referencedImageCount} rendered content images.\n`,
  );
}

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
