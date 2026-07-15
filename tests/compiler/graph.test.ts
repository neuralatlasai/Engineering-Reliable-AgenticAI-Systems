import { describe, expect, it } from "vitest";

import { buildContentGraph } from "../../src/compiler/graph";
import type {
  HierarchyPolicy,
  MetadataRecord,
  OrderingPolicy,
  ResolvedValue,
} from "../../src/compiler/model";

const metadata: MetadataRecord = {
  source: {},
  sourceEntries: [],
  keyOrder: [],
  configured: {},
  derived: {},
  effective: {},
  conflicts: [],
};

const orderingPolicy: OrderingPolicy = {
  comparators: ["natural-path", "lexical-path"],
  numeric: true,
  caseSensitivity: "sensitive",
  missingValuePolicy: "last",
  tiePolicy: "path",
};

function title(value: string): ResolvedValue<string> {
  return {
    value,
    origin: "source",
    derivationTrace: [],
  };
}

function hierarchy(strategies: HierarchyPolicy["strategies"]): HierarchyPolicy {
  return {
    strategies,
    indexDocuments: [],
    explicitParents: {},
    manifestPaths: [],
    orphanPolicy: "error",
  };
}

describe("buildContentGraph", () => {
  it("builds a deterministic flat navigation tree with configured natural ordering", () => {
    const result = buildContentGraph({
      corpusId: "book",
      hierarchyPolicy: hierarchy(["flat"]),
      orderingPolicy,
      documents: [
        {
          documentId: "topic-10",
          sourceId: "source-10",
          rootId: "root",
          normalizedPath: "topics/topic-10.md",
          title: title("Topic 10"),
          metadata,
        },
        {
          documentId: "topic-2",
          sourceId: "source-2",
          rootId: "root",
          normalizedPath: "topics/topic-2.md",
          title: title("Topic 2"),
          metadata,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const corpusId = "corpus:book";
    expect(result.value.navigation.roots).toEqual([corpusId]);
    expect(result.value.navigation.nodes[corpusId]?.childIds).toEqual([
      "topic-2",
      "topic-10",
    ]);
  });

  it("materializes only configured filesystem hierarchy groups", () => {
    const result = buildContentGraph({
      corpusId: "book",
      hierarchyPolicy: hierarchy(["filesystem"]),
      orderingPolicy,
      documents: [
        {
          documentId: "document",
          sourceId: "source",
          rootId: "primary",
          normalizedPath: "part/chapter/document.md",
          title: title("Document"),
          metadata,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.nodes["document"]?.navigationParentId).toBe(
      "group:primary:part/chapter",
    );
    expect(
      result.value.navigation.nodes["group:primary:part"]?.childIds,
    ).toEqual(["group:primary:part/chapter"]);
  });

  it("rejects cyclic explicit parent relationships in O(V + E) validation", () => {
    const result = buildContentGraph({
      corpusId: "book",
      hierarchyPolicy: hierarchy(["explicit-parent", "flat"]),
      orderingPolicy,
      documents: [
        {
          documentId: "a",
          sourceId: "source-a",
          rootId: "root",
          normalizedPath: "a.md",
          title: title("A"),
          metadata,
          explicitParentId: title("b"),
        },
        {
          documentId: "b",
          sourceId: "source-b",
          rootId: "root",
          normalizedPath: "b.md",
          title: title("B"),
          metadata,
          explicitParentId: title("a"),
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "GRAPH_CYCLE_DETECTED",
    );
  });

  it("rejects duplicate logical document identifiers", () => {
    const result = buildContentGraph({
      corpusId: "book",
      hierarchyPolicy: hierarchy(["flat"]),
      orderingPolicy,
      documents: [
        {
          documentId: "duplicate",
          sourceId: "source-a",
          rootId: "root",
          normalizedPath: "a.md",
          title: title("A"),
          metadata,
        },
        {
          documentId: "duplicate",
          sourceId: "source-b",
          rootId: "root",
          normalizedPath: "b.md",
          title: title("B"),
          metadata,
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "GRAPH_DOCUMENT_ID_DUPLICATE",
    );
  });
});
