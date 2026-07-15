import "server-only";

import { cache } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ArtifactEnvelope,
  CompiledDocument,
  NavigationManifest,
} from "@/compiler/model";
import type {
  DocumentManifestData,
  LoadedBookDocument,
  RouteManifestData,
  RuntimeBookData,
} from "@/runtime/types";

const ARTIFACT_ROOT = path.resolve(process.cwd(), "build");

async function readArtifact<T>(relativePath: string): Promise<T> {
  const absolutePath = path.resolve(ARTIFACT_ROOT, relativePath);
  const rootPrefix = `${ARTIFACT_ROOT}${path.sep}`;

  if (absolutePath !== ARTIFACT_ROOT && !absolutePath.startsWith(rootPrefix)) {
    throw new Error(
      `Artifact path escapes the configured build directory: ${relativePath}`,
    );
  }

  const source = await readFile(absolutePath, "utf8");
  const parsed: unknown = JSON.parse(source);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("data" in parsed) ||
    !("schemaVersion" in parsed)
  ) {
    throw new Error(`Artifact is not a versioned envelope: ${relativePath}`);
  }

  return (parsed as ArtifactEnvelope<T>).data;
}

export const getRuntimeBookData = cache(async (): Promise<RuntimeBookData> => {
  const [documents, navigation, routes] = await Promise.all([
    readArtifact<DocumentManifestData>("document-manifest.json"),
    readArtifact<NavigationManifest>("navigation-manifest.json"),
    readArtifact<RouteManifestData>("route-manifest.json"),
  ]);

  return { documents, navigation, routes };
});

export const getAllCanonicalRoutes = cache(
  async (): Promise<readonly string[]> => {
    const { routes } = await getRuntimeBookData();
    return routes.routes.map((route) => route.canonicalRoute);
  },
);

export const getDocumentByRoute = cache(
  async (canonicalRoute: string): Promise<LoadedBookDocument | undefined> => {
    const book = await getRuntimeBookData();
    const documentId = book.routes.byAnyRoute[canonicalRoute];
    if (documentId === undefined) {
      return undefined;
    }

    const summary = book.documents.byDocumentId[documentId];
    if (summary === undefined) {
      throw new Error(
        `Route manifest references missing document: ${documentId}`,
      );
    }

    const document = await readArtifact<CompiledDocument>(summary.artifactPath);
    const navigationNode = Object.values(book.navigation.nodes).find(
      (node) => node.documentId === documentId,
    );

    if (navigationNode === undefined) {
      return { document, summary };
    }

    const previousNodeId =
      book.navigation.previousByNode[navigationNode.nodeId];
    const nextNodeId = book.navigation.nextByNode[navigationNode.nodeId];
    const previousDocumentId = previousNodeId
      ? book.navigation.nodes[previousNodeId]?.documentId
      : undefined;
    const nextDocumentId = nextNodeId
      ? book.navigation.nodes[nextNodeId]?.documentId
      : undefined;
    const previous = previousDocumentId
      ? book.documents.byDocumentId[previousDocumentId]
      : undefined;
    const next = nextDocumentId
      ? book.documents.byDocumentId[nextDocumentId]
      : undefined;

    return {
      document,
      summary,
      ...(previous === undefined ? {} : { previous }),
      ...(next === undefined ? {} : { next }),
    };
  },
);
