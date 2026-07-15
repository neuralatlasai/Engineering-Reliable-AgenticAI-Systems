import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { normalizeBookBasePath } from "../../src/shared/base-path";

const basePath = normalizeBookBasePath(process.env["BOOK_BASE_PATH"]);
const homePath = `${basePath}/`;

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
