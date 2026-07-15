import { describe, expect, it } from "vitest";

import {
  normalizeBookBasePath,
  prefixBookBasePath,
} from "../../src/shared/base-path";

describe("normalizeBookBasePath", () => {
  it("normalizes root and trailing separators", () => {
    expect(normalizeBookBasePath(undefined)).toBe("");
    expect(normalizeBookBasePath("/")).toBe("");
    expect(
      normalizeBookBasePath(" /Engineering-Reliable-AgenticAI-Systems/ "),
    ).toBe("/Engineering-Reliable-AgenticAI-Systems");
  });

  it.each([
    "relative",
    "//external.example",
    "/repo//nested",
    "/repo/../nested",
    "/repo?query",
    "/repo#fragment",
    "/repo/%2Fescape",
  ])("rejects unsafe input %s", (input) => {
    expect(() => normalizeBookBasePath(input)).toThrow(
      /safe absolute path segments/u,
    );
  });
});

describe("prefixBookBasePath", () => {
  it("prefixes only origin-relative application URLs", () => {
    const basePath = "/Engineering-Reliable-AgenticAI-Systems";

    expect(prefixBookBasePath("/", basePath)).toBe(`${basePath}/`);
    expect(prefixBookBasePath("/_book/index.json", basePath)).toBe(
      `${basePath}/_book/index.json`,
    );
    expect(prefixBookBasePath("#section", basePath)).toBe("#section");
    expect(prefixBookBasePath("asset.png", basePath)).toBe("asset.png");
    expect(prefixBookBasePath("https://example.com", basePath)).toBe(
      "https://example.com",
    );
    expect(prefixBookBasePath("//cdn.example.com/asset.png", basePath)).toBe(
      "//cdn.example.com/asset.png",
    );
    expect(prefixBookBasePath(`${basePath}/read/chapter`, basePath)).toBe(
      `${basePath}/read/chapter`,
    );
  });

  it("is an identity operation for root-hosted deployments", () => {
    expect(prefixBookBasePath("/_book/index.json", "")).toBe(
      "/_book/index.json",
    );
  });
});
