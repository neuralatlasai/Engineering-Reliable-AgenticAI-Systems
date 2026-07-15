import { describe, expect, it } from "vitest";

import { createByteOffsetIndex } from "../../src/compiler/byte-offsets";
import type {
  BookCompilerConfig,
  SourceRecord,
} from "../../src/compiler/model";
import { ParserRegistry, RemarkParserAdapter } from "../../src/compiler/parser";

function config(): BookCompilerConfig {
  return {
    corpusId: "test-book",
    contentRoots: [{ id: "book", path: ".", trustLevel: "untrusted" }],
    include: ["**/*.md", "**/*.mdx"],
    exclude: [],
    discoveryPolicy: {
      symbolicLinks: "ignore",
      hiddenFiles: "exclude",
      caseSensitivity: "sensitive",
      sourceIdStrategy: "path",
    },
    parserPolicy: {
      defaultAdapter: "markdown",
      extensionAdapters: { ".md": "markdown", ".mdx": "mdx" },
      defaultEncoding: "utf8",
      encodingOverrides: {},
      dialects: {
        markdown: { gfm: true, math: true, directives: true, mdx: false },
        mdx: { gfm: true, math: true, directives: true, mdx: true },
      },
      frontMatter: [
        { type: "yaml", open: "---", close: "---" },
        { type: "toml", open: "+++", close: "+++" },
        { type: "json", open: ";;;", close: ";;;" },
      ],
    },
    metadataPolicy: {
      precedence: [
        "source",
        "configuration",
        "derived",
        "defaulted",
        "generated",
      ],
      titleFields: ["title"],
      idFields: ["id"],
      parentFields: ["parent"],
      orderFields: ["order"],
      routeFields: ["route"],
      slugFields: ["slug"],
      aliasFields: ["aliases"],
      strictTypes: true,
    },
    hierarchyPolicy: {
      strategies: ["flat"],
      indexDocuments: [],
      explicitParents: {},
      manifestPaths: [],
      orphanPolicy: "root",
    },
    orderingPolicy: {
      comparators: ["natural-path"],
      numeric: true,
      caseSensitivity: "sensitive",
      missingValuePolicy: "last",
      tiePolicy: "path",
    },
    routePolicy: {
      routePrefix: "/",
      explicitRoutes: {},
      lowercase: true,
      trailingSlash: false,
      reservedRoutes: [],
    },
    assetPolicy: {
      extensions: {},
      required: false,
      outputPrefix: "/assets",
      copyOriginals: true,
    },
    linkPolicy: {
      validateInternal: true,
      failOnBroken: true,
      caseSensitivity: "sensitive",
      allowedProtocols: ["http", "https", "mailto"],
      invalidTraversal: "error",
    },
    renderingPolicy: {
      rawHtml: "sanitize",
      unknownNodes: "quarantine",
      syntaxHighlighting: false,
      lightCodeTheme: "github-light",
      darkCodeTheme: "github-dark",
      math: true,
      diagrams: "source",
    },
    searchPolicy: {
      enabled: true,
      fields: ["title", "body"],
      chunkRecordLimit: 100,
      minimumTokenLength: 2,
    },
    validationPolicy: {
      failOn: "error",
      duplicateExplicitHeadingId: "error",
      unsupportedSyntax: "warning",
      allowRemoveTransforms: false,
      maxSourceBytes: 1_000_000,
    },
    outputPolicy: {
      directory: "build",
      publicDirectory: "public",
      reproducibleTimestamp: "1970-01-01T00:00:00.000Z",
      emitSourceCopies: true,
      emitPrettyJson: false,
    },
  };
}

function source(
  text: string,
  extension = ".md",
  rawBytes = new TextEncoder().encode(text),
): SourceRecord {
  return {
    sourceId: `book:test${extension}`,
    rootId: "book",
    absolutePath: `C:/book/test${extension}`,
    relativePath: `test${extension}`,
    normalizedPath: `test${extension}`,
    extension,
    mediaType: "text/markdown",
    encoding: "utf8",
    byteLength: rawBytes.byteLength,
    contentHash: "source-hash",
    rawBytes,
    rawText: text,
    newlineStyle: text.includes("\r\n") ? "crlf" : "lf",
    discoveredAtBuildPhase: "corpus-discovery",
    sourceKind: "document",
    trustLevel: "untrusted",
    physicalPathHash: "path-hash",
  };
}

function registry(): ParserRegistry {
  return new ParserRegistry([
    new RemarkParserAdapter({
      id: "markdown",
      directives: { note: { securityLevel: "safe" } },
    }),
    new RemarkParserAdapter({ id: "mdx" }),
  ]);
}

describe("lossless remark parser", () => {
  it("maps UTF-16 offsets to original UTF-8 bytes in O(1) lookups", () => {
    const index = createByteOffsetIndex("a😀é\r\nβ");
    expect(index.byteOffsetAt(0)).toEqual({ ok: true, value: 0 });
    expect(index.byteOffsetAt(1)).toEqual({ ok: true, value: 1 });
    expect(index.byteOffsetAt(2)).toEqual({ ok: true, value: 1 });
    expect(index.byteOffsetAt(3)).toEqual({ ok: true, value: 5 });
    expect(index.byteOffsetAt("a😀é\r\nβ".length)).toEqual({
      ok: true,
      value: 11,
    });
  });

  it("retains duplicate metadata, raw syntax, references, and byte-accurate heading spans", async () => {
    const markdown = [
      "---",
      "title: First",
      "title: Second",
      "unknown: true",
      "---",
      "# 😀 Heading {#stable}",
      "",
      "[reference][target]",
      "",
      '[target]: ./target.md "Target"',
      "",
      "<script>alert(1)</script>",
      "",
      ":::note{kind=important}",
      "body",
      ":::",
      "",
      "```ts title=example.ts",
      'const value = "😀";',
      "```",
      "",
      "$$",
      "E = mc^2",
      "$$",
      "",
    ].join("\r\n");
    const result = await registry().parse(source(markdown), config());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.frontMatter?.keyOrder).toEqual([
      "title",
      "title",
      "unknown",
    ]);
    expect(result.value.frontMatter?.entries.map(({ key }) => key)).toEqual([
      "title",
      "title",
      "unknown",
    ]);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "FRONT_MATTER_DUPLICATE_KEY",
    );
    const heading = result.value.document.children.find(
      (node) => node.type === "heading",
    );
    expect(heading?.type).toBe("heading");
    if (heading?.type !== "heading" || heading.sourceSpan === undefined) return;
    expect(heading.explicitId).toBe("stable");
    expect(heading.effectiveId).toBe("stable");
    expect(heading.displayText).toBe("😀 Heading");
    expect(heading.sourceSpan.startByte).toBe(
      Buffer.byteLength(markdown.slice(0, markdown.indexOf("# 😀")), "utf8"),
    );
    expect(result.value.references).toContain("target");
    expect(result.value.definitions["target"]?.url).toBe("./target.md");
    const html = result.value.document.children.find(
      (node) => node.type === "html",
    );
    expect(html?.type === "html" ? html.disposition : undefined).toBe(
      "sanitized",
    );
    expect(html?.type === "html" ? html.value : undefined).toBe(
      "<script>alert(1)</script>",
    );
    expect(html?.type === "html" ? html.sanitizedValue : undefined).toBe("");
    const directive = result.value.document.children.find(
      (node) => node.type === "containerDirective",
    );
    expect(
      directive?.type === "containerDirective" ? directive.known : undefined,
    ).toBe(true);
    const code = result.value.document.children.find(
      (node) => node.type === "code",
    );
    expect(code?.type === "code" ? code.rawCode : undefined).toBe(
      'const value = "😀";\r\n',
    );
    expect(code?.type === "code" ? code.infoString : undefined).toBe(
      "ts title=example.ts",
    );
    const equation = result.value.document.children.find(
      (node) => node.type === "math",
    );
    expect(equation?.type === "math" ? equation.source : undefined).toBe(
      "E = mc^2",
    );
  });

  it("parses MDX only through an adapter whose configured dialect enables it", async () => {
    const text = "# Component\n\n<Card answer={42}>hello</Card>\n";
    const markdownResult = await registry().parse(
      source(text, ".md"),
      config(),
    );
    const mdxResult = await registry().parse(source(text, ".mdx"), config());
    expect(markdownResult.ok).toBe(true);
    expect(mdxResult.ok).toBe(true);
    if (!markdownResult.ok || !mdxResult.ok) return;
    expect(
      markdownResult.value.document.children.some((node) =>
        node.type.startsWith("mdx"),
      ),
    ).toBe(false);
    expect(JSON.stringify(mdxResult.value.document)).toContain(
      '"type":"mdxJsxTextElement"',
    );
  });

  it("rejects invalid UTF-8 without replacement-character data loss", async () => {
    const bytes = Uint8Array.from([0x23, 0x20, 0xc3, 0x28]);
    const result = await registry().parse(
      source("# �(", ".md", bytes),
      config(),
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "PARSER_INVALID_ENCODING_SEQUENCE",
    );
  });
});
