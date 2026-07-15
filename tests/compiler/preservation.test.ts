import { describe, expect, it } from "vitest";

import type { CodeNode, RootNode, TextNode } from "../../src/compiler/model";
import { verifyPreservation } from "../../src/compiler/preservation";

const textNode: TextNode = {
  nodeId: "text:1",
  type: "text",
  rawSource: "unchanged",
  value: "unchanged",
};

const codeNode: CodeNode = {
  nodeId: "code:1",
  type: "code",
  rawSource: "```ts\r\nconst value = 1;\r\n```",
  rawCode: "const value = 1;\r\n",
  displayCode: "const value = 1;",
  language: "ts",
  infoString: "ts",
  fenceDelimiter: "```",
};

const root: RootNode = {
  nodeId: "root:1",
  type: "root",
  rawSource: "unchanged\n\n```ts\r\nconst value = 1;\r\n```",
  children: [
    {
      nodeId: "paragraph:1",
      type: "paragraph",
      rawSource: "unchanged",
      children: [textNode],
    },
    codeNode,
  ],
};

describe("preservation verifier", () => {
  it("reports exact byte and structural preservation", () => {
    const report = verifyPreservation({
      documentId: "document",
      sourceHash: "hash",
      before: root,
      after: root,
      sourceText: root.rawSource,
      serializedText: root.rawSource,
    });
    expect(report.byteRoundTripStatus).toBe("exact");
    expect(report.preservedNodeCount).toBe(4);
    expect(report.removedNodeCount).toBe(0);
    expect(report.violations).toEqual([]);
  });

  it("detects removed code and rewritten text without quadratic comparison", () => {
    const rewritten: RootNode = {
      ...root,
      children: [
        {
          nodeId: "paragraph:1",
          type: "paragraph",
          rawSource: "unchanged",
          children: [{ ...textNode, value: "rewritten" }],
        },
      ],
    };
    const report = verifyPreservation({
      documentId: "document",
      sourceHash: "hash",
      before: root,
      after: rewritten,
    });
    expect(report.removedNodeCount).toBe(1);
    expect(report.violations.map(({ code }) => code)).toContain(
      "PRESERVATION_COUNT_REDUCTION",
    );
    expect(report.violations.map(({ code }) => code)).toContain(
      "PRESERVATION_CONTENT_CHANGED",
    );
  });

  it("treats newline-only serialization changes as normalized-equivalent", () => {
    const report = verifyPreservation({
      documentId: "document",
      sourceHash: "hash",
      before: root,
      after: root,
      sourceText: "a\r\nb\r\n",
      serializedText: "a\nb\n",
    });
    expect(report.byteRoundTripStatus).toBe("normalized-equivalent");
  });
});
