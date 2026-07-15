import Link from "next/link";

import type { NavigationManifest, NavigationNode } from "@/compiler/model";

interface BookNavigationProperties {
  readonly activeDocumentId: string;
  readonly manifest: NavigationManifest;
}

function collectActiveAncestors(
  manifest: NavigationManifest,
  activeDocumentId: string,
): ReadonlySet<string> {
  const activeNode = Object.values(manifest.nodes).find(
    (node) => node.documentId === activeDocumentId,
  );
  const ancestors = new Set<string>();
  let cursor = activeNode;

  while (cursor !== undefined && !ancestors.has(cursor.nodeId)) {
    ancestors.add(cursor.nodeId);
    cursor =
      cursor.parentId === undefined
        ? undefined
        : manifest.nodes[cursor.parentId];
  }

  return ancestors;
}

interface BranchProperties extends BookNavigationProperties {
  readonly activeAncestors: ReadonlySet<string>;
  readonly node: NavigationNode;
  readonly visited: ReadonlySet<string>;
}

function NavigationBranch({
  activeAncestors,
  activeDocumentId,
  manifest,
  node,
  visited,
}: BranchProperties) {
  if (visited.has(node.nodeId)) {
    return <li>Invalid cyclic navigation node: {node.nodeId}</li>;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(node.nodeId);
  const children = node.childIds
    .map((childId) => manifest.nodes[childId])
    .filter((child): child is NavigationNode => child !== undefined);

  if (children.length > 0) {
    return (
      <li>
        <details
          className="book-nav-group"
          open={activeAncestors.has(node.nodeId)}
        >
          <summary>{node.title}</summary>
          <ul className="book-nav-list">
            {node.route === undefined ? (
              <></>
            ) : (
              <li>
                <Link
                  aria-current={
                    node.documentId === activeDocumentId ? "page" : undefined
                  }
                  className="book-nav-link"
                  href={node.route}
                >
                  Overview
                </Link>
              </li>
            )}
            {children.map((child) => (
              <NavigationBranch
                activeAncestors={activeAncestors}
                activeDocumentId={activeDocumentId}
                key={child.nodeId}
                manifest={manifest}
                node={child}
                visited={nextVisited}
              />
            ))}
          </ul>
        </details>
      </li>
    );
  }

  if (node.route === undefined) {
    return <></>;
  }

  return (
    <li>
      <Link
        aria-current={node.documentId === activeDocumentId ? "page" : undefined}
        className="book-nav-link"
        href={node.route}
      >
        {node.title}
      </Link>
    </li>
  );
}

export function BookNavigation({
  activeDocumentId,
  manifest,
}: BookNavigationProperties) {
  const activeAncestors = collectActiveAncestors(manifest, activeDocumentId);

  return (
    <nav aria-label="Book contents">
      <h2 className="book-nav-title">Contents</h2>
      <ul className="book-nav-list">
        {manifest.roots.map((rootId) => {
          const node = manifest.nodes[rootId];
          return node === undefined ? (
            <li key={rootId}>Missing navigation node: {rootId}</li>
          ) : (
            <NavigationBranch
              activeAncestors={activeAncestors}
              activeDocumentId={activeDocumentId}
              key={node.nodeId}
              manifest={manifest}
              node={node}
              visited={new Set<string>()}
            />
          );
        })}
      </ul>
    </nav>
  );
}
