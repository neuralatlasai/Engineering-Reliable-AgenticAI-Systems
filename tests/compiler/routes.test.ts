import { describe, expect, it } from "vitest";

import type { RoutePolicy } from "../../src/compiler/model";
import { compileRoutes } from "../../src/compiler/routes";

function routePolicy(overrides: Partial<RoutePolicy> = {}): RoutePolicy {
  return {
    routePrefix: "/book",
    explicitRoutes: {},
    lowercase: true,
    trailingSlash: false,
    reservedRoutes: ["api"],
    ...overrides,
  };
}

describe("compileRoutes", () => {
  it("keeps duplicate numeric prefixes and titles collision-free by using full paths", () => {
    const result = compileRoutes(
      [
        {
          documentId: "topic-8-long",
          sourceId: "source-long",
          normalizedPath:
            "Chapter-06/08-context-poisoning-prompt-injection-stale-data-authority-confusion-conflicting-evidence.md",
        },
        {
          documentId: "topic-8-short",
          sourceId: "source-short",
          normalizedPath:
            "Chapter-06/08-context-poisoning-injection-stale-data-authority-confusion-conflicting-evidence.md",
        },
      ],
      routePolicy(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.map((route) => route.canonicalRoute)).toEqual([
      "/book/chapter-06/08-context-poisoning-prompt-injection-stale-data-authority-confusion-conflicting-evidence",
      "/book/chapter-06/08-context-poisoning-injection-stale-data-authority-confusion-conflicting-evidence",
    ]);
    expect(result.value[0]?.derivationTrace[0]?.evidence[0]).toContain(
      "source path",
    );
  });

  it("does not strip or reinterpret numeric filename prefixes", () => {
    const result = compileRoutes(
      [
        {
          documentId: "topic",
          sourceId: "source",
          normalizedPath: "08-topic.md",
        },
      ],
      routePolicy(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.canonicalRoute).toBe("/book/08-topic");
    }
  });

  it("lets explicit absolute routes bypass the prefix while path routes remain prefixed", () => {
    const result = compileRoutes(
      [
        {
          documentId: "readme",
          sourceId: "source-readme",
          normalizedPath: "README.md",
          aliases: {
            value: ["/legacy-home", "home"],
            origin: "configuration",
            derivationTrace: [],
          },
          redirectsFrom: ["/old-home", "previous-home"],
        },
        {
          documentId: "topic",
          sourceId: "source-topic",
          normalizedPath: "topics/topic.md",
        },
      ],
      routePolicy({
        routePrefix: "/read",
        explicitRoutes: { readme: "/" },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: "readme",
          canonicalRoute: "/",
          aliases: ["/legacy-home", "/read/home"],
          redirectsFrom: ["/old-home", "/read/previous-home"],
          origin: "configuration",
        }),
        expect.objectContaining({
          documentId: "topic",
          canonicalRoute: "/read/topics/topic",
        }),
      ]),
    );
  });

  it("treats a leading slash in resolved metadata routes as absolute", () => {
    const result = compileRoutes(
      [
        {
          documentId: "custom",
          sourceId: "source-custom",
          normalizedPath: "custom.md",
          explicitRoute: {
            value: "/Custom-Landing",
            origin: "source",
            derivationTrace: [],
          },
        },
      ],
      routePolicy({ routePrefix: "/read" }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.canonicalRoute).toBe("/custom-landing");
    }
  });

  it("rejects collisions across canonical and alias claims", () => {
    const result = compileRoutes(
      [
        {
          documentId: "a",
          sourceId: "source-a",
          normalizedPath: "a.md",
          aliases: { value: ["shared"], origin: "source", derivationTrace: [] },
        },
        {
          documentId: "b",
          sourceId: "source-b",
          normalizedPath: "shared.md",
        },
      ],
      routePolicy(),
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "ROUTE_COLLISION",
    );
  });

  it("rejects configured reserved routes after prefix normalization", () => {
    const result = compileRoutes(
      [{ documentId: "api", sourceId: "source", normalizedPath: "api.md" }],
      routePolicy(),
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "ROUTE_RESERVED",
    );
  });

  it("applies locale, volume, version, case, and trailing-slash policy explicitly", () => {
    const result = compileRoutes(
      [
        {
          documentId: "intro",
          sourceId: "source",
          normalizedPath: "Part/Intro.md",
        },
      ],
      routePolicy({
        localePrefix: "EN",
        volumePrefix: "Volume-A",
        versionPrefix: "V1",
        trailingSlash: true,
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.canonicalRoute).toBe(
        "/book/en/volume-a/v1/part/intro/",
      );
    }
  });
});
