import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ArtifactEnvelope } from "../../src/compiler/model";
import { normalizeBookBasePath } from "../../src/shared/base-path";
import type { RouteManifestData } from "../../src/runtime/types";

const basePath = normalizeBookBasePath(process.env["BOOK_BASE_PATH"]);
const homePath = `${basePath}/`;
const heroAlt =
  "A layered agentic AI system with observable execution paths and guarded boundaries";
const heroAssetPathPrefix = `${basePath}/images/home/engineering-reliable-agentic-ai-systems-hero-`;

interface AssetManifestEntry {
  readonly mediaType: string;
  readonly referencingDocumentIds: readonly string[];
}

interface AssetManifestData {
  readonly assets: readonly AssetManifestEntry[];
}

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location().url;
      errors.push(
        location === "" ? message.text() : `${message.text()} (${location})`,
      );
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    errors.push(
      `Request failed: ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
    );
  });
  return errors;
}

async function findCompiledImageRoute(): Promise<string | undefined> {
  const [assetManifestSource, routeManifestSource] = await Promise.all([
    readFile(
      path.resolve(process.cwd(), "build", "asset-manifest.json"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "build", "route-manifest.json"),
      "utf8",
    ),
  ]);
  const assetManifest = JSON.parse(
    assetManifestSource,
  ) as ArtifactEnvelope<AssetManifestData>;
  const routeManifest = JSON.parse(
    routeManifestSource,
  ) as ArtifactEnvelope<RouteManifestData>;
  const routeByDocumentId = new Map(
    routeManifest.data.routes.map(({ canonicalRoute, documentId }) => [
      documentId,
      canonicalRoute,
    ]),
  );

  for (const asset of assetManifest.data.assets) {
    if (!asset.mediaType.startsWith("image/")) {
      continue;
    }
    for (const documentId of asset.referencingDocumentIds) {
      const route = routeByDocumentId.get(documentId);
      if (route !== undefined) {
        return route;
      }
    }
  }
  return undefined;
}

test("renders source-compiled content with navigable landmarks", async ({
  page,
  isMobile,
}) => {
  await page.goto(homePath);

  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("article h1").first()).toBeVisible();
  if (!isMobile) {
    await expect(
      page.getByRole("navigation", { name: "Book contents" }),
    ).toBeVisible();
  }
  await expect(page).toHaveTitle(/Engineering Reliable Agentic AI Systems/u);

  const horizontalOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("renders the optimized home hero without loading errors or overflow", async ({
  page,
}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto(homePath);

  const hero = page.locator("img.home-hero-image");
  await expect(hero).toBeVisible();
  await expect(hero).toHaveAttribute("alt", heroAlt);
  await expect(hero).toHaveAttribute("width", "1536");
  await expect(hero).toHaveAttribute("height", "864");
  await expect
    .poll(() =>
      hero.evaluate(
        (image) =>
          (image as HTMLImageElement).complete &&
          (image as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);

  const metrics = await hero.evaluate((image) => {
    const element = image as HTMLImageElement;
    const bounds = element.getBoundingClientRect();
    return {
      currentSourcePath: new URL(element.currentSrc).pathname,
      left: bounds.left,
      naturalWidth: element.naturalWidth,
      right: bounds.right,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(metrics.naturalWidth).toBeGreaterThan(0);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.currentSourcePath.startsWith(heroAssetPathPrefix)).toBe(true);
  expect(metrics.currentSourcePath).toMatch(/-(640|1024|1536)\.(avif|webp)$/u);
  expect(runtimeErrors).toEqual([]);
});

test("loads a compiled content image without horizontal overflow when available", async ({
  page,
}) => {
  const imageRoute = await findCompiledImageRoute();
  if (imageRoute === undefined) {
    test.skip(true, "The compiled corpus contains no referenced image assets.");
    return;
  }

  await page.goto(`${basePath}${imageRoute}`);
  await page.waitForLoadState("networkidle");
  const image = page
    .locator("article figure img:not(.home-hero-image)")
    .first();
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          (element as HTMLImageElement).complete &&
          (element as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);

  const metrics = await image.evaluate((element) => {
    const imageElement = element as HTMLImageElement;
    const bounds = imageElement.getBoundingClientRect();
    return {
      left: bounds.left,
      naturalWidth: imageElement.naturalWidth,
      right: bounds.right,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  expect(metrics.naturalWidth).toBeGreaterThan(0);
  expect(metrics.left).toBeGreaterThanOrEqual(-1);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

test("supports keyboard-first search and source-provenant results", async ({
  page,
}) => {
  await page.goto(homePath);
  await expect(
    page.locator('html[data-search-shortcut-ready="true"]'),
  ).toBeAttached();
  await page.keyboard.press("Control+k");

  const searchInput = page.getByRole("searchbox", { name: "Search query" });
  await expect(searchInput).toBeFocused();
  await searchInput.fill("context engineering");
  const firstResult = page.locator(".search-result").first();
  await expect(firstResult).toBeVisible();
  await firstResult.click();
  await expect(page).toHaveURL((url) =>
    url.pathname.startsWith(`${basePath}/read/`),
  );
  await expect(page.locator("article h1").first()).toBeVisible();
});

test("exposes no automatically detectable WCAG A or AA violations", async ({
  page,
}) => {
  await page.goto(homePath);
  await expect(page.locator("article h1").first()).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("mobile navigation uses a focus-managed drawer", async ({
  page,
  isMobile,
}) => {
  test.skip(
    !isMobile,
    "Mobile navigation is only exposed below the adaptive breakpoint.",
  );
  await page.goto(homePath);
  await expect(
    page.locator('html[data-search-shortcut-ready="true"]'),
  ).toBeAttached();

  await page.getByRole("button", { name: "Open book navigation" }).click();
  await expect(
    page.getByRole("dialog", { name: "Book navigation" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Book navigation" }),
  ).toBeHidden();
});
