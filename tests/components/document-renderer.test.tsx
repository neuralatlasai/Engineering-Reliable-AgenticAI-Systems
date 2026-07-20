import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/reader/copy-button", () => ({
  CopyButton: () => null,
}));

vi.mock("@/runtime/base-path", async () => {
  const { prefixBookBasePath } = await import("../../src/shared/base-path");
  return {
    withBookBasePath: (target: string) =>
      prefixBookBasePath(target, "/Engineering-Reliable-AgenticAI-Systems"),
  };
});

import { DocumentRenderer } from "../../src/components/reader/document-renderer";
import type {
  AssetReference,
  CompiledDocument,
  DocumentNode,
  ImageNode,
  ParentNode,
  TextNode,
} from "../../src/compiler/model";

const DEPLOYMENT_BASE_PATH = "/Engineering-Reliable-AgenticAI-Systems";

function textNode(nodeId: string, value: string): TextNode {
  return {
    nodeId,
    type: "text",
    rawSource: value,
    value,
  };
}

function imageNode(
  nodeId: string,
  options: Readonly<{ alt?: string; title?: string; url: string }>,
): ImageNode {
  return {
    nodeId,
    type: "image",
    rawSource: `![${options.alt ?? ""}](${options.url})`,
    url: options.url,
    ...(options.alt === undefined ? {} : { alt: options.alt }),
    ...(options.title === undefined ? {} : { title: options.title }),
  };
}

function paragraphNode(
  nodeId: string,
  children: readonly DocumentNode[],
): ParentNode {
  return {
    nodeId,
    type: "paragraph",
    rawSource: "",
    children,
  };
}

function assetReference(
  sourceNodeId: string,
  outputPath: string,
): AssetReference {
  return {
    assetId: `asset:${sourceNodeId}`,
    sourceDocumentId: "document:fixture",
    sourceNodeId,
    originalTarget: "./authored-image.png",
    resolvedSourceId: `source:${sourceNodeId}`,
    outputPath,
    status: "valid",
    sourceSpan: {
      startByte: 0,
      endByte: 1,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 2,
    },
  };
}

function compiledDocument(
  children: readonly DocumentNode[],
  assets: readonly AssetReference[] = [],
): CompiledDocument {
  return {
    irVersion: "1.0.0",
    documentId: "document:fixture",
    source: {
      sourceId: "source:fixture",
      rootId: "book",
      relativePath: "fixture.md",
      normalizedPath: "fixture.md",
      extension: ".md",
      mediaType: "text/markdown",
      encoding: "utf8",
      byteLength: 0,
      contentHash: "fixture",
      trustLevel: "trusted-static",
    },
    metadata: {
      source: {},
      sourceEntries: [],
      keyOrder: [],
      configured: {},
      derived: {},
      effective: {},
      conflicts: [],
    },
    root: {
      nodeId: "root",
      type: "root",
      rawSource: "",
      children,
    },
    title: {
      value: "Renderer fixture",
      origin: "source",
      derivationTrace: [],
    },
    headings: [],
    links: [],
    assets,
    citations: [],
    footnotes: [],
    codeBlocks: [],
    equations: [],
    diagrams: [],
    customNodes: [],
    diagnostics: [],
    provenance: [],
  };
}

describe("DocumentRenderer image semantics", () => {
  it("renders an image-only paragraph as a figure outside paragraph markup", () => {
    const image = imageNode("image:standalone", {
      alt: "Layered reliable-agent architecture",
      title: "System layers",
      url: "./authored-image.png",
    });
    const document = compiledDocument(
      [paragraphNode("paragraph:standalone", [image])],
      [assetReference(image.nodeId, "/_book/assets/architecture.png")],
    );

    const markup = renderToStaticMarkup(
      <DocumentRenderer document={document} />,
    );

    expect(markup).toContain('<div class="prose" dir="auto"><figure');
    expect(markup).not.toContain("<p>");
    expect(markup).toContain('alt="Layered reliable-agent architecture"');
    expect(markup).toContain(
      `src="${DEPLOYMENT_BASE_PATH}/_book/assets/architecture.png"`,
    );
    expect(markup).not.toContain("authored-image.png");
    expect(markup).toContain("<figcaption>System layers</figcaption>");
  });

  it("keeps an image inline when its paragraph also contains text", () => {
    const image = imageNode("image:inline", {
      alt: "Agent execution loop",
      title: "Inline system view",
      url: "/illustrations/execution-loop.png",
    });
    const document = compiledDocument([
      paragraphNode("paragraph:mixed", [
        textNode("text:before", "Before "),
        image,
        textNode("text:after", " after."),
      ]),
    ]);

    const markup = renderToStaticMarkup(
      <DocumentRenderer document={document} />,
    );

    expect(markup).toContain("<p>Before <img");
    expect(markup).toContain(" after.</p>");
    expect(markup).not.toContain("<p><figure");
    expect(markup).not.toContain("<figure");
    expect(markup).toContain('alt="Agent execution loop"');
    expect(markup).toContain('title="Inline system view"');
    expect(markup).toContain(
      `src="${DEPLOYMENT_BASE_PATH}/illustrations/execution-loop.png"`,
    );
  });

  it("falls back to the authored source and an empty alt attribute", () => {
    const document = compiledDocument([
      paragraphNode("paragraph:fallback", [
        imageNode("image:fallback", {
          url: "/illustrations/fallback.png",
        }),
      ]),
    ]);

    const markup = renderToStaticMarkup(
      <DocumentRenderer document={document} />,
    );

    expect(markup).toContain('alt=""');
    expect(markup).toContain(
      `src="${DEPLOYMENT_BASE_PATH}/illustrations/fallback.png"`,
    );
    expect(markup).not.toContain("<figcaption>");
  });
});
