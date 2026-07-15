import type {
  CompilerResult,
  ContentNode,
  Diagnostic,
  HierarchyPolicy,
  MetadataRecord,
  NavigationManifest,
  NavigationNode,
  OrderKey,
  OrderingPolicy,
  ResolvedValue,
  ValueOrigin,
} from "./model";
import { buildOrderKey, sortOrderedNodes } from "./ordering";

export interface ContentGraphDocumentInput {
  readonly documentId: string;
  readonly sourceId: string;
  readonly rootId: string;
  readonly normalizedPath: string;
  readonly title: ResolvedValue<string>;
  readonly metadata: MetadataRecord;
  readonly canonicalRoute?: string;
  readonly explicitParentId?: ResolvedValue<string>;
  readonly manifestParentId?: string;
  readonly crossParentIds?: readonly string[];
  readonly explicitOrder?: ResolvedValue<string | number>;
  readonly manifestOrder?: string | number;
  readonly chapterSection?: string | number;
  readonly chapterSectionOrigin?: ValueOrigin;
  readonly sourceDiscoveryOrder?: number;
}

export interface ContentGraphBuildInput {
  readonly corpusId: string;
  readonly documents: readonly ContentGraphDocumentInput[];
  readonly hierarchyPolicy: HierarchyPolicy;
  readonly orderingPolicy: OrderingPolicy;
}

export interface ContentGraphCompilation {
  readonly nodes: Readonly<Record<string, ContentNode>>;
  readonly navigation: NavigationManifest;
}

interface MutableContentNode {
  readonly nodeId: string;
  readonly documentId?: string;
  readonly nodeKind: "corpus" | "group" | "document";
  readonly title: ResolvedValue<string>;
  readonly canonicalRoute?: string;
  readonly parentIds: string[];
  readonly childIds: string[];
  navigationParentId?: string;
  readonly orderKey: OrderKey;
  readonly sourceReferences: ContentNode["sourceReferences"];
  readonly metadata: MetadataRecord;
}

interface ParentCandidate {
  readonly id: string;
  readonly origin: ValueOrigin;
  readonly strategy: HierarchyPolicy["strategies"][number];
  readonly evidence: string;
}

const EMPTY_METADATA: MetadataRecord = {
  source: Object.freeze(Object.create(null) as Record<string, never>),
  sourceEntries: [],
  keyOrder: [],
  configured: Object.freeze(Object.create(null) as Record<string, never>),
  derived: Object.freeze(Object.create(null) as Record<string, never>),
  effective: Object.freeze(Object.create(null) as Record<string, never>),
  conflicts: [],
};

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(
    (diagnostic) =>
      diagnostic.severity === "error" || diagnostic.severity === "fatal",
  );
}

function normalizedDirectory(normalizedPath: string): string {
  const slashPath = normalizedPath.replaceAll("\\", "/");
  const separator = slashPath.lastIndexOf("/");
  return separator === -1 ? "" : slashPath.slice(0, separator);
}

function directoryPrefixes(directory: string): readonly string[] {
  if (directory.length === 0) {
    return [""];
  }

  const segments = directory.split("/").filter((segment) => segment.length > 0);
  return [
    "",
    ...segments.map((_, index) => segments.slice(0, index + 1).join("/")),
  ];
}

function groupNodeId(rootId: string, directory: string): string {
  const encodedRoot = encodeURIComponent(rootId);
  const encodedDirectory =
    directory.length === 0
      ? "."
      : directory.split("/").map(encodeURIComponent).join("/");
  return `group:${encodedRoot}:${encodedDirectory}`;
}

function resolvedSyntheticTitle(
  value: string,
  rule: string,
  evidence: string,
): ResolvedValue<string> {
  return {
    value,
    origin: "derived",
    derivationTrace: [
      {
        rule,
        evidence: [evidence],
        result: value,
        precedence: 0,
        overriddenAlternatives: [],
        validationOutcome: "accepted",
      },
    ],
  };
}

function configuredParentCandidates(
  document: ContentGraphDocumentInput,
  policy: HierarchyPolicy,
): readonly ParentCandidate[] {
  const keys = [
    document.documentId,
    document.sourceId,
    document.normalizedPath,
  ];
  const seen = new Set<string>();
  const result: ParentCandidate[] = [];
  for (const key of keys) {
    const parentId = policy.explicitParents[key];
    if (parentId !== undefined && !seen.has(parentId)) {
      seen.add(parentId);
      result.push({
        id: parentId,
        origin: "configuration",
        strategy: "configuration",
        evidence: `hierarchyPolicy.explicitParents['${key}']`,
      });
    }
  }
  return result;
}

function chooseNavigationParent(
  document: ContentGraphDocumentInput,
  corpusNodeId: string,
  policy: HierarchyPolicy,
  diagnostics: Diagnostic[],
): ParentCandidate | undefined {
  const configured = configuredParentCandidates(document, policy);
  if (configured.length > 1) {
    diagnostics.push({
      code: "GRAPH_CONFIGURED_PARENT_CONFLICT",
      severity: "error",
      message: `Document '${document.documentId}' has conflicting configured parents: ${configured
        .map((candidate) => candidate.id)
        .join(", ")}.`,
      phase: "graph",
      sourceId: document.sourceId,
      nodeId: document.documentId,
      remediation: "Configure one parent for every equivalent document key.",
    });
  }

  const available = new Map<
    HierarchyPolicy["strategies"][number],
    ParentCandidate
  >();
  if (document.explicitParentId !== undefined) {
    available.set("explicit-parent", {
      id: document.explicitParentId.value,
      origin: document.explicitParentId.origin,
      strategy: "explicit-parent",
      evidence: "resolved document parent metadata",
    });
  }
  if (configured[0] !== undefined) {
    available.set("configuration", configured[0]);
  }
  if (document.manifestParentId !== undefined) {
    available.set("manifest", {
      id: document.manifestParentId,
      origin: "configuration",
      strategy: "manifest",
      evidence: "configured hierarchy manifest",
    });
  }
  available.set("filesystem", {
    id: groupNodeId(
      document.rootId,
      normalizedDirectory(document.normalizedPath),
    ),
    origin: "derived",
    strategy: "filesystem",
    evidence: `source directory of '${document.normalizedPath}'`,
  });
  available.set("flat", {
    id: corpusNodeId,
    origin: "defaulted",
    strategy: "flat",
    evidence: "configured flat hierarchy fallback",
  });

  let selected: ParentCandidate | undefined;
  for (const strategy of policy.strategies) {
    const candidate = available.get(strategy);
    if (candidate !== undefined) {
      selected = candidate;
      break;
    }
  }

  if (selected === undefined) {
    if (policy.orphanPolicy === "error") {
      diagnostics.push({
        code: "GRAPH_DOCUMENT_ORPHAN",
        severity: "error",
        message: `No configured hierarchy strategy can place '${document.documentId}'.`,
        phase: "graph",
        sourceId: document.sourceId,
        nodeId: document.documentId,
        remediation:
          "Add a matching hierarchy strategy or configure an explicit parent.",
      });
      return undefined;
    }

    selected = {
      id: corpusNodeId,
      origin: "defaulted",
      strategy: "flat",
      evidence: "orphanPolicy=root",
    };
  }

  const selectedIndex = policy.strategies.indexOf(selected.strategy);
  const overridden = policy.strategies
    .slice(selectedIndex + 1)
    .map((strategy) => available.get(strategy))
    .filter(
      (candidate): candidate is ParentCandidate => candidate !== undefined,
    )
    .filter((candidate) => candidate.id !== selected.id);
  if (overridden.length > 0) {
    diagnostics.push({
      code: "GRAPH_PARENT_ALTERNATIVE_OVERRIDDEN",
      severity: "info",
      message: `Parent '${selected.id}' for '${document.documentId}' wins by strategy precedence over ${overridden
        .map((candidate) => `'${candidate.id}'`)
        .join(", ")}.`,
      phase: "graph",
      sourceId: document.sourceId,
      nodeId: document.documentId,
    });
  }

  return selected;
}

function finalizeNodes(
  drafts: ReadonlyMap<string, MutableContentNode>,
): Readonly<Record<string, ContentNode>> {
  const result: Record<string, ContentNode> = Object.create(null) as Record<
    string,
    ContentNode
  >;
  for (const nodeId of [...drafts.keys()].sort(compareCodePoints)) {
    const draft = drafts.get(nodeId);
    if (draft === undefined) {
      continue;
    }

    const base = {
      nodeId: draft.nodeId,
      nodeKind: draft.nodeKind,
      title: draft.title,
      parentIds: [...draft.parentIds].sort(compareCodePoints),
      childIds: [...draft.childIds].sort(compareCodePoints),
      orderKey: draft.orderKey,
      sourceReferences: draft.sourceReferences,
      metadata: draft.metadata,
    };
    result[nodeId] = {
      ...base,
      ...(draft.documentId === undefined
        ? {}
        : { documentId: draft.documentId }),
      ...(draft.canonicalRoute === undefined
        ? {}
        : { canonicalRoute: draft.canonicalRoute }),
      ...(draft.navigationParentId === undefined
        ? {}
        : { navigationParentId: draft.navigationParentId }),
    };
  }
  return result;
}

function addRelationship(
  drafts: ReadonlyMap<string, MutableContentNode>,
  parentId: string,
  childId: string,
): void {
  const parent = drafts.get(parentId);
  const child = drafts.get(childId);
  if (parent === undefined || child === undefined) {
    return;
  }

  if (!parent.childIds.includes(childId)) {
    parent.childIds.push(childId);
  }
  if (!child.parentIds.includes(parentId)) {
    child.parentIds.push(parentId);
  }
}

function hierarchyDiagnostics(policy: HierarchyPolicy): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (policy.strategies.length === 0) {
    diagnostics.push({
      code: "GRAPH_HIERARCHY_STRATEGIES_EMPTY",
      severity: "error",
      message: "Hierarchy strategy precedence cannot be empty.",
      phase: "graph",
      remediation: "Configure at least one explicit hierarchy strategy.",
    });
  }

  const duplicateStrategies = policy.strategies.filter(
    (strategy, index) => policy.strategies.indexOf(strategy) !== index,
  );
  if (duplicateStrategies.length > 0) {
    diagnostics.push({
      code: "GRAPH_HIERARCHY_STRATEGY_DUPLICATE",
      severity: "error",
      message: `Hierarchy strategy precedence repeats: ${[
        ...new Set(duplicateStrategies),
      ].join(", ")}.`,
      phase: "graph",
      remediation: "List each hierarchy strategy at most once.",
    });
  }
  return diagnostics;
}

export function validateContentGraph(
  nodes: Readonly<Record<string, ContentNode>>,
): CompilerResult<Readonly<Record<string, ContentNode>>> {
  const diagnostics: Diagnostic[] = [];
  const nodeIds = Object.keys(nodes);
  const indegree = new Map<string, number>(
    nodeIds.map((nodeId) => [nodeId, 0]),
  );

  for (const nodeId of nodeIds) {
    const node = nodes[nodeId];
    if (node === undefined) {
      continue;
    }
    if (node.nodeId !== nodeId) {
      diagnostics.push({
        code: "GRAPH_NODE_KEY_MISMATCH",
        severity: "error",
        message: `Graph key '${nodeId}' contains node '${node.nodeId}'.`,
        phase: "graph",
        nodeId,
      });
    }

    const duplicateParents = node.parentIds.filter(
      (parentId, index) => node.parentIds.indexOf(parentId) !== index,
    );
    const duplicateChildren = node.childIds.filter(
      (childId, index) => node.childIds.indexOf(childId) !== index,
    );
    if (duplicateParents.length > 0 || duplicateChildren.length > 0) {
      diagnostics.push({
        code: "GRAPH_EDGE_DUPLICATE",
        severity: "error",
        message: `Node '${nodeId}' contains duplicate graph edges.`,
        phase: "graph",
        nodeId,
        remediation: "Emit each parent-child relationship exactly once.",
      });
    }

    for (const parentId of node.parentIds) {
      const parent = nodes[parentId];
      if (parentId === nodeId) {
        diagnostics.push({
          code: "GRAPH_SELF_REFERENCE",
          severity: "error",
          message: `Node '${nodeId}' references itself as a parent.`,
          phase: "graph",
          nodeId,
        });
      } else if (parent === undefined) {
        diagnostics.push({
          code: "GRAPH_PARENT_MISSING",
          severity: "error",
          message: `Parent '${parentId}' referenced by '${nodeId}' does not exist.`,
          phase: "graph",
          nodeId,
        });
      } else if (!parent.childIds.includes(nodeId)) {
        diagnostics.push({
          code: "GRAPH_EDGE_NOT_RECIPROCAL",
          severity: "error",
          message: `Parent '${parentId}' does not contain reciprocal child '${nodeId}'.`,
          phase: "graph",
          nodeId,
        });
      }
    }

    if (
      node.navigationParentId !== undefined &&
      !node.parentIds.includes(node.navigationParentId)
    ) {
      diagnostics.push({
        code: "GRAPH_NAVIGATION_PARENT_NOT_EDGE",
        severity: "error",
        message: `Navigation parent '${node.navigationParentId}' is not a graph parent of '${nodeId}'.`,
        phase: "graph",
        nodeId,
      });
    }

    for (const childId of node.childIds) {
      const child = nodes[childId];
      if (childId === nodeId) {
        diagnostics.push({
          code: "GRAPH_SELF_REFERENCE",
          severity: "error",
          message: `Node '${nodeId}' references itself as a child.`,
          phase: "graph",
          nodeId,
        });
      } else if (child === undefined) {
        diagnostics.push({
          code: "GRAPH_CHILD_MISSING",
          severity: "error",
          message: `Child '${childId}' referenced by '${nodeId}' does not exist.`,
          phase: "graph",
          nodeId,
        });
      } else {
        indegree.set(childId, (indegree.get(childId) ?? 0) + 1);
        if (!child.parentIds.includes(nodeId)) {
          diagnostics.push({
            code: "GRAPH_EDGE_NOT_RECIPROCAL",
            severity: "error",
            message: `Child '${childId}' does not contain reciprocal parent '${nodeId}'.`,
            phase: "graph",
            nodeId,
          });
        }
      }
    }
  }

  // Kahn's pass is O(V + E), iterative, and safe for adversarially deep corpora.
  const queue: string[] = [];
  for (const [nodeId, degree] of indegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }
  let head = 0;
  let visited = 0;
  while (head < queue.length) {
    const nodeId = queue[head];
    head += 1;
    if (nodeId === undefined) {
      continue;
    }
    visited += 1;
    for (const childId of nodes[nodeId]?.childIds ?? []) {
      const nextDegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextDegree);
      if (nextDegree === 0) {
        queue.push(childId);
      }
    }
  }

  if (visited !== nodeIds.length) {
    const cyclicNodeIds = [...indegree]
      .filter(([, degree]) => degree > 0)
      .map(([nodeId]) => nodeId)
      .sort(compareCodePoints);
    diagnostics.push({
      code: "GRAPH_CYCLE_DETECTED",
      severity: "error",
      message: `Content graph contains a cycle involving: ${cyclicNodeIds.join(", ")}.`,
      phase: "graph",
      ...(cyclicNodeIds[0] === undefined ? {} : { nodeId: cyclicNodeIds[0] }),
      remediation:
        "Remove at least one parent relationship from every reported cycle.",
    });
  }

  return hasErrors(diagnostics)
    ? { ok: false, diagnostics }
    : { ok: true, value: nodes, diagnostics };
}

export function buildNavigationManifest(
  nodes: Readonly<Record<string, ContentNode>>,
  orderingPolicy: OrderingPolicy,
): CompilerResult<NavigationManifest> {
  const diagnostics: Diagnostic[] = [];
  const navigationNodes: Record<string, NavigationNode> = Object.create(
    null,
  ) as Record<string, NavigationNode>;
  const childrenByParent = new Map<string, ContentNode[]>();
  const roots: ContentNode[] = [];

  for (const nodeId of Object.keys(nodes).sort(compareCodePoints)) {
    const node = nodes[nodeId];
    if (node === undefined) {
      continue;
    }
    if (node.navigationParentId === undefined) {
      roots.push(node);
    } else {
      const siblings = childrenByParent.get(node.navigationParentId) ?? [];
      siblings.push(node);
      childrenByParent.set(node.navigationParentId, siblings);
    }
  }

  const sortedRoots = sortOrderedNodes(roots, orderingPolicy);
  diagnostics.push(...sortedRoots.diagnostics);
  if (!sortedRoots.ok) {
    return { ok: false, diagnostics };
  }

  const sortedChildren = new Map<string, readonly ContentNode[]>();
  for (const [parentId, children] of childrenByParent) {
    if (nodes[parentId] === undefined) {
      diagnostics.push({
        code: "GRAPH_NAVIGATION_PARENT_MISSING",
        severity: "error",
        message: `Navigation parent '${parentId}' does not exist.`,
        phase: "graph",
      });
      continue;
    }
    const result = sortOrderedNodes(children, orderingPolicy);
    diagnostics.push(...result.diagnostics);
    if (result.ok) {
      sortedChildren.set(parentId, result.value);
    }
  }
  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }

  const stack = [...sortedRoots.value]
    .reverse()
    .map((node) => ({ node, depth: 0 }));
  const traversal: string[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      continue;
    }
    const children = sortedChildren.get(current.node.nodeId) ?? [];
    const base = {
      nodeId: current.node.nodeId,
      title: current.node.title.value,
      childIds: children.map((child) => child.nodeId),
      depth: current.depth,
    };
    navigationNodes[current.node.nodeId] = {
      ...base,
      ...(current.node.documentId === undefined
        ? {}
        : { documentId: current.node.documentId }),
      ...(current.node.canonicalRoute === undefined
        ? {}
        : { route: current.node.canonicalRoute }),
      ...(current.node.navigationParentId === undefined
        ? {}
        : { parentId: current.node.navigationParentId }),
    };
    traversal.push(current.node.nodeId);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }

  if (traversal.length !== Object.keys(nodes).length) {
    const unreachable = Object.keys(nodes)
      .filter((nodeId) => navigationNodes[nodeId] === undefined)
      .sort(compareCodePoints);
    diagnostics.push({
      code: "GRAPH_NAVIGATION_UNREACHABLE",
      severity: "error",
      message: `Primary navigation cannot reach: ${unreachable.join(", ")}.`,
      phase: "graph",
      ...(unreachable[0] === undefined ? {} : { nodeId: unreachable[0] }),
      remediation: "Ensure navigation-parent relationships form a rooted tree.",
    });
    return { ok: false, diagnostics };
  }

  const previousByNode: Record<string, string | null> = Object.create(
    null,
  ) as Record<string, string | null>;
  const nextByNode: Record<string, string | null> = Object.create(
    null,
  ) as Record<string, string | null>;
  for (let index = 0; index < traversal.length; index += 1) {
    const nodeId = traversal[index];
    if (nodeId !== undefined) {
      previousByNode[nodeId] = traversal[index - 1] ?? null;
      nextByNode[nodeId] = traversal[index + 1] ?? null;
    }
  }

  return {
    ok: true,
    value: {
      roots: sortedRoots.value.map((node) => node.nodeId),
      nodes: navigationNodes,
      previousByNode,
      nextByNode,
    },
    diagnostics,
  };
}

export function buildContentGraph(
  input: ContentGraphBuildInput,
): CompilerResult<ContentGraphCompilation> {
  const diagnostics = [...hierarchyDiagnostics(input.hierarchyPolicy)];
  const drafts = new Map<string, MutableContentNode>();
  const corpusNodeId = `corpus:${encodeURIComponent(input.corpusId)}`;
  const corpusOrder = buildOrderKey(
    {
      nodeId: corpusNodeId,
      normalizedPath: "",
      sourceId: corpusNodeId,
      sourceDiscoveryOrder: 0,
    },
    input.orderingPolicy,
  );
  diagnostics.push(...corpusOrder.diagnostics);
  if (!corpusOrder.ok) {
    return { ok: false, diagnostics };
  }
  drafts.set(corpusNodeId, {
    nodeId: corpusNodeId,
    nodeKind: "corpus",
    title: resolvedSyntheticTitle(
      input.corpusId,
      "graph.corpus-title",
      input.corpusId,
    ),
    parentIds: [],
    childIds: [],
    orderKey: corpusOrder.value,
    sourceReferences: [],
    metadata: EMPTY_METADATA,
  });

  const sortedDocuments = [...input.documents].sort((left, right) => {
    const idOrder = compareCodePoints(left.documentId, right.documentId);
    return idOrder !== 0
      ? idOrder
      : compareCodePoints(left.sourceId, right.sourceId);
  });
  const selectedParents = new Map<string, ParentCandidate>();
  const seenDocumentIds = new Set<string>();
  for (const document of sortedDocuments) {
    if (
      seenDocumentIds.has(document.documentId) ||
      drafts.has(document.documentId)
    ) {
      diagnostics.push({
        code: "GRAPH_DOCUMENT_ID_DUPLICATE",
        severity: "error",
        message: `Document identifier '${document.documentId}' is not unique.`,
        phase: "graph",
        sourceId: document.sourceId,
        nodeId: document.documentId,
        remediation:
          "Configure a unique, stable logical identifier for every document.",
      });
      continue;
    }
    seenDocumentIds.add(document.documentId);

    if (
      document.normalizedPath
        .replaceAll("\\", "/")
        .split("/")
        .some((segment) => segment === "..")
    ) {
      diagnostics.push({
        code: "GRAPH_SOURCE_PATH_TRAVERSAL",
        severity: "error",
        message: `Document '${document.documentId}' has a non-normalized traversal path.`,
        phase: "graph",
        sourceId: document.sourceId,
        nodeId: document.documentId,
      });
      continue;
    }

    const order = buildOrderKey(
      {
        nodeId: document.documentId,
        normalizedPath: document.normalizedPath,
        sourceId: document.sourceId,
        ...(document.explicitOrder === undefined
          ? {}
          : { explicitOrder: document.explicitOrder }),
        ...(document.manifestOrder === undefined
          ? {}
          : { manifestOrder: document.manifestOrder }),
        ...(document.chapterSection === undefined
          ? {}
          : { chapterSection: document.chapterSection }),
        ...(document.chapterSectionOrigin === undefined
          ? {}
          : { chapterSectionOrigin: document.chapterSectionOrigin }),
        ...(document.sourceDiscoveryOrder === undefined
          ? {}
          : { sourceDiscoveryOrder: document.sourceDiscoveryOrder }),
      },
      input.orderingPolicy,
    );
    diagnostics.push(...order.diagnostics);
    if (!order.ok) {
      continue;
    }

    const parent = chooseNavigationParent(
      document,
      corpusNodeId,
      input.hierarchyPolicy,
      diagnostics,
    );
    if (parent !== undefined) {
      selectedParents.set(document.documentId, parent);
    }
    drafts.set(document.documentId, {
      nodeId: document.documentId,
      documentId: document.documentId,
      nodeKind: "document",
      title: document.title,
      ...(document.canonicalRoute === undefined
        ? {}
        : { canonicalRoute: document.canonicalRoute }),
      parentIds: [],
      childIds: [],
      orderKey: order.value,
      sourceReferences: [{ sourceId: document.sourceId }],
      metadata: document.metadata,
    });
  }

  const filesystemDocuments = sortedDocuments.filter(
    (document) =>
      selectedParents.get(document.documentId)?.strategy === "filesystem",
  );
  for (const document of filesystemDocuments) {
    const directory = normalizedDirectory(document.normalizedPath);
    const prefixes = directoryPrefixes(directory);
    for (const prefix of prefixes) {
      const nodeId = groupNodeId(document.rootId, prefix);
      if (!drafts.has(nodeId)) {
        const title =
          prefix.length === 0
            ? document.rootId
            : (prefix.split("/").at(-1) ?? prefix);
        const order = buildOrderKey(
          {
            nodeId,
            normalizedPath: `${document.rootId}/${prefix}`,
            sourceId: nodeId,
          },
          input.orderingPolicy,
        );
        diagnostics.push(...order.diagnostics);
        if (!order.ok) {
          continue;
        }
        drafts.set(nodeId, {
          nodeId,
          nodeKind: "group",
          title: resolvedSyntheticTitle(
            title,
            "graph.filesystem-group-title",
            `${document.rootId}/${prefix}`,
          ),
          parentIds: [],
          childIds: [],
          orderKey: order.value,
          sourceReferences: [],
          metadata: EMPTY_METADATA,
        });
      }
    }
  }

  for (const document of filesystemDocuments) {
    const prefixes = directoryPrefixes(
      normalizedDirectory(document.normalizedPath),
    );
    for (let index = 0; index < prefixes.length; index += 1) {
      const prefix = prefixes[index];
      if (prefix === undefined) {
        continue;
      }
      const currentId = groupNodeId(document.rootId, prefix);
      const parentId =
        index === 0
          ? corpusNodeId
          : groupNodeId(document.rootId, prefixes[index - 1] ?? "");
      addRelationship(drafts, parentId, currentId);
      const current = drafts.get(currentId);
      if (current !== undefined && current.navigationParentId === undefined) {
        current.navigationParentId = parentId;
      }
    }
  }

  for (const document of sortedDocuments) {
    const draft = drafts.get(document.documentId);
    const selectedParent = selectedParents.get(document.documentId);
    if (draft === undefined || selectedParent === undefined) {
      continue;
    }
    if (!drafts.has(selectedParent.id)) {
      diagnostics.push({
        code: "GRAPH_PARENT_REFERENCE_MISSING",
        severity: "error",
        message: `Parent '${selectedParent.id}' selected for '${document.documentId}' does not exist.`,
        phase: "graph",
        sourceId: document.sourceId,
        nodeId: document.documentId,
        remediation:
          "Reference an existing document or select a generated hierarchy strategy.",
      });
      continue;
    }
    addRelationship(drafts, selectedParent.id, document.documentId);
    draft.navigationParentId = selectedParent.id;

    const crossParents = [...new Set(document.crossParentIds ?? [])].sort(
      compareCodePoints,
    );
    for (const crossParentId of crossParents) {
      if (!drafts.has(crossParentId)) {
        diagnostics.push({
          code: "GRAPH_CROSS_PARENT_MISSING",
          severity: "error",
          message: `Cross-parent '${crossParentId}' for '${document.documentId}' does not exist.`,
          phase: "graph",
          sourceId: document.sourceId,
          nodeId: document.documentId,
        });
      } else {
        addRelationship(drafts, crossParentId, document.documentId);
      }
    }
  }

  const nodes = finalizeNodes(drafts);
  const validation = validateContentGraph(nodes);
  diagnostics.push(...validation.diagnostics);
  if (!validation.ok || hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }

  const navigation = buildNavigationManifest(nodes, input.orderingPolicy);
  diagnostics.push(...navigation.diagnostics);
  if (!navigation.ok || hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    value: { nodes, navigation: navigation.value },
    diagnostics,
  };
}
