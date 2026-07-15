import type {
  CompiledDocument,
  Diagnostic,
  NavigationManifest,
  RouteRecord,
} from "@/compiler/model";

export interface DocumentManifestEntry {
  readonly documentId: string;
  readonly sourceId: string;
  readonly relativePath: string;
  readonly title: string;
  readonly canonicalRoute: string;
  readonly artifactPath: string;
  readonly headingCount: number;
  readonly wordCount: number;
  readonly diagnosticCounts: Readonly<Record<Diagnostic["severity"], number>>;
}

export interface DocumentManifestData {
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly documents: readonly DocumentManifestEntry[];
  readonly byRoute: Readonly<Record<string, string>>;
  readonly byDocumentId: Readonly<Record<string, DocumentManifestEntry>>;
}

export interface RouteManifestData {
  readonly routes: readonly RouteRecord[];
  readonly byCanonicalRoute: Readonly<Record<string, string>>;
  readonly byAnyRoute: Readonly<Record<string, string>>;
}

export interface RuntimeBookData {
  readonly documents: DocumentManifestData;
  readonly navigation: NavigationManifest;
  readonly routes: RouteManifestData;
}

export interface LoadedBookDocument {
  readonly document: CompiledDocument;
  readonly summary: DocumentManifestEntry;
  readonly previous?: DocumentManifestEntry;
  readonly next?: DocumentManifestEntry;
}
