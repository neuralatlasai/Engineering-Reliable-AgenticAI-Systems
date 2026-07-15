export const COMPILER_VERSION = "0.1.0";
export const IR_VERSION = "1.0.0";
export const ARTIFACT_SCHEMA_VERSION = "1.0.0";

export type ValueOrigin =
  "source" | "configuration" | "derived" | "defaulted" | "generated";

export type ContentTrustLevel = "trusted-static" | "reviewed" | "untrusted";

export interface SourceSpan {
  readonly startByte: number;
  readonly endByte: number;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface DiagnosticLocation {
  readonly sourceId: string;
  readonly sourceSpan?: SourceSpan;
  readonly message?: string;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: "info" | "warning" | "error" | "fatal";
  readonly message: string;
  readonly phase:
    | "source"
    | "parse"
    | "metadata"
    | "ast"
    | "graph"
    | "route"
    | "link"
    | "asset"
    | "render"
    | "search"
    | "output";
  readonly sourceId?: string;
  readonly sourceSpan?: SourceSpan;
  readonly nodeId?: string;
  readonly related?: readonly DiagnosticLocation[];
  readonly remediation?: string;
}

export type CompilerResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export interface ContentRootConfig {
  readonly id: string;
  readonly path: string;
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly trustLevel: ContentTrustLevel;
}

export interface ParserPolicy {
  readonly defaultAdapter: string;
  readonly extensionAdapters: Readonly<Record<string, string>>;
  readonly defaultEncoding: string;
  readonly encodingOverrides: Readonly<Record<string, string>>;
  readonly dialects: Readonly<
    Record<
      string,
      {
        readonly gfm: boolean;
        readonly math: boolean;
        readonly directives: boolean;
        readonly mdx: boolean;
      }
    >
  >;
  readonly frontMatter: readonly {
    readonly type: "yaml" | "toml" | "json";
    readonly open: string;
    readonly close: string;
  }[];
}

export interface MetadataPolicy {
  readonly precedence: readonly ValueOrigin[];
  readonly titleFields: readonly string[];
  readonly idFields: readonly string[];
  readonly parentFields: readonly string[];
  readonly orderFields: readonly string[];
  readonly routeFields: readonly string[];
  readonly slugFields: readonly string[];
  readonly aliasFields: readonly string[];
  readonly strictTypes: boolean;
}

export interface HierarchyPolicy {
  readonly strategies: readonly (
    "explicit-parent" | "configuration" | "manifest" | "filesystem" | "flat"
  )[];
  readonly indexDocuments: readonly string[];
  readonly explicitParents: Readonly<Record<string, string>>;
  readonly manifestPaths: readonly string[];
  readonly orphanPolicy: "root" | "error";
}

export type OrderingComparator =
  | "explicit-order"
  | "manifest-order"
  | "chapter-section"
  | "natural-path"
  | "lexical-path"
  | "source-discovery-order";

export interface OrderingPolicy {
  readonly comparators: readonly OrderingComparator[];
  readonly locale?: string;
  readonly numeric: boolean;
  readonly caseSensitivity: "sensitive" | "insensitive";
  readonly missingValuePolicy: "first" | "last" | "error";
  readonly tiePolicy: "path" | "source-id" | "error";
}

export interface RoutePolicy {
  readonly routePrefix: string;
  readonly explicitRoutes: Readonly<Record<string, string>>;
  readonly localePrefix?: string;
  readonly volumePrefix?: string;
  readonly versionPrefix?: string;
  readonly lowercase: boolean;
  readonly trailingSlash: boolean;
  readonly reservedRoutes: readonly string[];
}

export interface AssetPolicy {
  readonly extensions: Readonly<Record<string, string>>;
  readonly required: boolean;
  readonly outputPrefix: string;
  readonly copyOriginals: boolean;
}

export interface LinkPolicy {
  readonly validateInternal: boolean;
  readonly failOnBroken: boolean;
  readonly caseSensitivity: "sensitive" | "insensitive";
  readonly allowedProtocols: readonly string[];
  readonly invalidTraversal: "error" | "preserve";
}

export interface RenderingPolicy {
  readonly rawHtml: "escape" | "sanitize" | "reject";
  readonly unknownNodes: "source" | "quarantine" | "reject";
  readonly syntaxHighlighting: boolean;
  readonly lightCodeTheme: string;
  readonly darkCodeTheme: string;
  readonly math: boolean;
  readonly diagrams: "source" | "isolated" | "disabled";
}

export interface SearchPolicy {
  readonly enabled: boolean;
  readonly fields: readonly (
    "title" | "heading" | "body" | "code" | "metadata"
  )[];
  readonly chunkRecordLimit: number;
  readonly minimumTokenLength: number;
}

export interface ValidationPolicy {
  readonly failOn: "error" | "fatal";
  readonly duplicateExplicitHeadingId: "error" | "hash-suffix";
  readonly unsupportedSyntax: "warning" | "error";
  readonly allowRemoveTransforms: boolean;
  readonly maxSourceBytes: number;
}

export interface OutputPolicy {
  readonly directory: string;
  readonly publicDirectory: string;
  readonly reproducibleTimestamp: string;
  readonly emitSourceCopies: boolean;
  readonly emitPrettyJson: boolean;
}

export interface DiscoveryPolicy {
  readonly symbolicLinks: "ignore" | "follow-files" | "follow-all";
  readonly hiddenFiles: "exclude" | "include";
  readonly caseSensitivity: "sensitive" | "insensitive";
  readonly sourceIdStrategy: "path" | "content";
}

export interface BookCompilerConfig {
  readonly corpusId: string;
  readonly contentRoots: readonly ContentRootConfig[];
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly discoveryPolicy: DiscoveryPolicy;
  readonly parserPolicy: ParserPolicy;
  readonly metadataPolicy: MetadataPolicy;
  readonly hierarchyPolicy: HierarchyPolicy;
  readonly orderingPolicy: OrderingPolicy;
  readonly routePolicy: RoutePolicy;
  readonly assetPolicy: AssetPolicy;
  readonly linkPolicy: LinkPolicy;
  readonly renderingPolicy: RenderingPolicy;
  readonly searchPolicy: SearchPolicy;
  readonly validationPolicy: ValidationPolicy;
  readonly outputPolicy: OutputPolicy;
}

export interface SourceRecord {
  readonly sourceId: string;
  readonly rootId: string;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly normalizedPath: string;
  readonly extension: string;
  readonly mediaType: string;
  readonly encoding: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly rawBytes: Uint8Array;
  readonly rawText?: string;
  readonly newlineStyle?: "lf" | "crlf" | "cr" | "mixed";
  readonly bom?: "utf-8" | "utf-16le" | "utf-16be";
  readonly discoveredAtBuildPhase: "corpus-discovery";
  readonly sourceKind: "document" | "asset";
  readonly trustLevel: ContentTrustLevel;
  readonly physicalPathHash: string;
}

export interface SourceRecordReference {
  readonly sourceId: string;
  readonly rootId: string;
  readonly relativePath: string;
  readonly normalizedPath: string;
  readonly extension: string;
  readonly mediaType: string;
  readonly encoding: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly newlineStyle?: "lf" | "crlf" | "cr" | "mixed";
  readonly bom?: "utf-8" | "utf-16le" | "utf-16be";
  readonly sourceCopyPath?: string;
  readonly trustLevel: ContentTrustLevel;
}

export type MetadataScalar = string | number | boolean | null;
export type MetadataValue =
  | MetadataScalar
  | readonly MetadataValue[]
  | { readonly [key: string]: MetadataValue };

export interface MetadataEntry {
  readonly key: string;
  readonly value: MetadataValue;
  readonly sourceSpan?: SourceSpan;
}

export interface FrontMatterNode {
  readonly format: "yaml" | "toml" | "json";
  readonly raw: string;
  readonly openMarker: string;
  readonly closeMarker: string;
  readonly keyOrder: readonly string[];
  readonly entries: readonly MetadataEntry[];
  readonly sourceSpan: SourceSpan;
}

export interface MetadataConflict {
  readonly key: string;
  readonly origins: readonly ValueOrigin[];
  readonly resolution: ValueOrigin;
  readonly message: string;
}

export interface MetadataRecord {
  readonly source: Readonly<Record<string, MetadataValue>>;
  readonly sourceEntries: readonly MetadataEntry[];
  readonly keyOrder: readonly string[];
  readonly configured: Readonly<Record<string, MetadataValue>>;
  readonly derived: Readonly<Record<string, MetadataValue>>;
  readonly effective: Readonly<Record<string, MetadataValue>>;
  readonly conflicts: readonly MetadataConflict[];
  readonly rawFrontMatter?: string;
}

export interface ProvenanceRecord {
  readonly transformId: string;
  readonly transformVersion: string;
  readonly inputNodeIds: readonly string[];
  readonly outputNodeIds: readonly string[];
  readonly mutationType:
    "preserve" | "annotate" | "normalize" | "rewrite" | "expand" | "remove";
  readonly justification: string;
  readonly reversible: boolean;
}

export interface NodeBase {
  readonly nodeId: string;
  readonly type: string;
  readonly sourceSpan?: SourceSpan;
  readonly rawSource: string;
}

export interface RootNode extends NodeBase {
  readonly type: "root";
  readonly children: readonly DocumentNode[];
}

export interface TextNode extends NodeBase {
  readonly type: "text";
  readonly value: string;
}

export interface ParentNode extends NodeBase {
  readonly type:
    | "paragraph"
    | "blockquote"
    | "strong"
    | "emphasis"
    | "delete"
    | "table"
    | "tableRow"
    | "tableCell"
    | "footnoteDefinition";
  readonly children: readonly DocumentNode[];
  readonly identifier?: string;
  readonly label?: string;
  readonly align?: readonly ("left" | "right" | "center" | null)[];
}

export interface HeadingNode extends NodeBase {
  readonly type: "heading";
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
  readonly children: readonly DocumentNode[];
  readonly authoredText: string;
  readonly displayText: string;
  readonly explicitId?: string;
  readonly effectiveId: string;
}

export interface ListNode extends NodeBase {
  readonly type: "list";
  readonly children: readonly DocumentNode[];
  readonly ordered: boolean;
  readonly start?: number;
  readonly spread: boolean;
}

export interface ListItemNode extends NodeBase {
  readonly type: "listItem";
  readonly children: readonly DocumentNode[];
  readonly checked?: boolean;
  readonly spread: boolean;
}

export interface LeafNode extends NodeBase {
  readonly type: "break" | "thematicBreak";
}

export interface InlineCodeNode extends NodeBase {
  readonly type: "inlineCode";
  readonly value: string;
}

export interface HighlightedToken {
  readonly content: string;
  readonly color?: string;
  readonly fontStyle?: number;
}

export interface HighlightedCode {
  readonly language: string;
  readonly light: readonly (readonly HighlightedToken[])[];
  readonly dark: readonly (readonly HighlightedToken[])[];
}

export interface CodeNode extends NodeBase {
  readonly type: "code";
  readonly rawCode: string;
  readonly displayCode: string;
  readonly language?: string;
  readonly meta?: string;
  readonly infoString?: string;
  readonly fenceDelimiter?: string;
  readonly highlightedRepresentation?: HighlightedCode;
}

export interface LinkNode extends NodeBase {
  readonly type: "link" | "linkReference";
  readonly children: readonly DocumentNode[];
  readonly url?: string;
  readonly title?: string;
  readonly identifier?: string;
  readonly label?: string;
  readonly referenceType?: "shortcut" | "collapsed" | "full";
}

export interface ImageNode extends NodeBase {
  readonly type: "image" | "imageReference";
  readonly url?: string;
  readonly alt?: string;
  readonly title?: string;
  readonly identifier?: string;
  readonly label?: string;
  readonly referenceType?: "shortcut" | "collapsed" | "full";
}

export interface DefinitionNode extends NodeBase {
  readonly type: "definition";
  readonly identifier: string;
  readonly label?: string;
  readonly url: string;
  readonly title?: string;
}

export interface HtmlNode extends NodeBase {
  readonly type: "html";
  readonly value: string;
  readonly disposition: "escaped" | "sanitized" | "rejected";
  readonly sanitizedValue?: string;
}

export interface MathNode extends NodeBase {
  readonly type: "math" | "inlineMath";
  readonly source: string;
  readonly renderedHtml?: string;
  readonly renderError?: string;
}

export interface FootnoteReferenceNode extends NodeBase {
  readonly type: "footnoteReference";
  readonly identifier: string;
  readonly label?: string;
}

export interface DirectiveNode extends NodeBase {
  readonly type: "containerDirective" | "leafDirective" | "textDirective";
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly DocumentNode[];
  readonly known: boolean;
  readonly securityLevel: "safe" | "restricted" | "executable";
}

export interface MdxNode extends NodeBase {
  readonly type:
    | "mdxFlowExpression"
    | "mdxTextExpression"
    | "mdxJsxFlowElement"
    | "mdxJsxTextElement"
    | "mdxjsEsm";
  readonly value?: string;
  readonly name?: string;
  readonly children: readonly DocumentNode[];
  readonly quarantined: true;
}

export interface UnsupportedNode extends NodeBase {
  readonly type: "unsupported";
  readonly originalType: string;
  readonly opaqueData: Readonly<Record<string, unknown>>;
  readonly children: readonly DocumentNode[];
}

export type DocumentNode =
  | RootNode
  | TextNode
  | ParentNode
  | HeadingNode
  | ListNode
  | ListItemNode
  | LeafNode
  | InlineCodeNode
  | CodeNode
  | LinkNode
  | ImageNode
  | DefinitionNode
  | HtmlNode
  | MathNode
  | FootnoteReferenceNode
  | DirectiveNode
  | MdxNode
  | UnsupportedNode;

export interface HeadingRecord {
  readonly headingId: string;
  readonly documentId: string;
  readonly depth: number;
  readonly authoredText: string;
  readonly plainText: string;
  readonly explicitId?: string;
  readonly generatedId?: string;
  readonly effectiveId: string;
  readonly parentHeadingId?: string;
  readonly sourceSpan: SourceSpan;
}

export type LinkKind =
  | "internal-document"
  | "internal-heading"
  | "asset"
  | "external"
  | "reference-definition"
  | "citation"
  | "email"
  | "protocol-specific"
  | "unresolved";

export interface LinkRecord {
  readonly linkId: string;
  readonly sourceDocumentId: string;
  readonly sourceNodeId: string;
  readonly originalTarget: string;
  readonly resolvedTarget?: string;
  readonly rewrittenTarget?: string;
  readonly targetDocumentId?: string;
  readonly linkKind: LinkKind;
  readonly sourceSpan: SourceSpan;
  readonly status: "valid" | "broken" | "ambiguous" | "unsupported";
}

export interface AssetReference {
  readonly assetId: string;
  readonly sourceDocumentId: string;
  readonly sourceNodeId: string;
  readonly originalTarget: string;
  readonly resolvedSourceId?: string;
  readonly outputPath?: string;
  readonly status: "valid" | "broken" | "ambiguous" | "unsupported";
  readonly sourceSpan: SourceSpan;
}

export interface CodeBlockRecord {
  readonly nodeId: string;
  readonly rawCode: string;
  readonly displayCode: string;
  readonly language?: string;
  readonly infoString?: string;
  readonly metadata: Readonly<Record<string, MetadataValue>>;
  readonly sourceSpan: SourceSpan;
  readonly highlightedRepresentation?: HighlightedCode;
}

export interface EquationRecord {
  readonly equationId: string;
  readonly source: string;
  readonly displayMode: "inline" | "block";
  readonly label?: string;
  readonly sourceSpan: SourceSpan;
  readonly renderedHtml?: string;
}

export interface DiagramRecord {
  readonly diagramId: string;
  readonly language: string;
  readonly source: string;
  readonly sourceSpan: SourceSpan;
  readonly renderedArtifact?: string;
  readonly renderDiagnostics: readonly Diagnostic[];
}

export interface CitationRecord {
  readonly citationId: string;
  readonly authoredIdentifier: string;
  readonly sourceSpan: SourceSpan;
  readonly status: "resolved" | "unresolved";
}

export interface FootnoteRecord {
  readonly footnoteId: string;
  readonly authoredIdentifier: string;
  readonly definitionNodeId?: string;
  readonly referenceNodeIds: readonly string[];
}

export interface CustomNodeRecord {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly sourceSpan?: SourceSpan;
  readonly supported: boolean;
}

export interface ParseResult {
  readonly sourceId: string;
  readonly parserId: string;
  readonly parserVersion: string;
  readonly document: RootNode;
  readonly frontMatter?: FrontMatterNode;
  readonly definitions: Readonly<Record<string, DefinitionNode>>;
  readonly references: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly sourceMap: Readonly<Record<string, SourceSpan>>;
  readonly unsupportedNodes: readonly UnsupportedNode[];
  readonly provenance: readonly ProvenanceRecord[];
}

export interface ParserAdapter {
  readonly id: string;
  readonly version: string;
  supports(source: SourceRecord, context: ParseContext): boolean;
  parse(
    source: SourceRecord,
    context: ParseContext,
  ): Promise<CompilerResult<ParseResult>>;
}

export interface ParseContext {
  readonly config: BookCompilerConfig;
  readonly adapterId: string;
}

export interface CompiledDocument {
  readonly irVersion: string;
  readonly documentId: string;
  readonly source: SourceRecordReference;
  readonly metadata: MetadataRecord;
  readonly root: RootNode;
  readonly title: ResolvedValue<string>;
  readonly headings: readonly HeadingRecord[];
  readonly links: readonly LinkRecord[];
  readonly assets: readonly AssetReference[];
  readonly citations: readonly CitationRecord[];
  readonly footnotes: readonly FootnoteRecord[];
  readonly codeBlocks: readonly CodeBlockRecord[];
  readonly equations: readonly EquationRecord[];
  readonly diagrams: readonly DiagramRecord[];
  readonly customNodes: readonly CustomNodeRecord[];
  readonly diagnostics: readonly Diagnostic[];
  readonly provenance: readonly ProvenanceRecord[];
}

export interface DerivationStep {
  readonly rule: string;
  readonly evidence: readonly string[];
  readonly result: string;
  readonly precedence: number;
  readonly overriddenAlternatives: readonly string[];
  readonly validationOutcome: "accepted" | "rejected";
}

export interface ResolvedValue<T> {
  readonly value: T;
  readonly origin: ValueOrigin;
  readonly derivationTrace: readonly DerivationStep[];
}

export interface OrderKey {
  readonly components: readonly {
    readonly comparator: OrderingComparator;
    readonly value: string | number;
    readonly origin: ValueOrigin;
  }[];
  readonly tieBreaker: string;
}

export interface SourceReference {
  readonly sourceId: string;
  readonly sourceSpan?: SourceSpan;
}

export interface ContentNode {
  readonly nodeId: string;
  readonly documentId?: string;
  readonly nodeKind: "corpus" | "group" | "document";
  readonly title: ResolvedValue<string>;
  readonly canonicalRoute?: string;
  readonly parentIds: readonly string[];
  readonly childIds: readonly string[];
  readonly navigationParentId?: string;
  readonly orderKey: OrderKey;
  readonly sourceReferences: readonly SourceReference[];
  readonly metadata: MetadataRecord;
}

export interface RouteRecord {
  readonly documentId: string;
  readonly canonicalRoute: string;
  readonly aliases: readonly string[];
  readonly redirectsFrom: readonly string[];
  readonly origin: ValueOrigin;
  readonly derivationTrace: readonly DerivationStep[];
}

export interface NavigationNode {
  readonly nodeId: string;
  readonly documentId?: string;
  readonly title: string;
  readonly route?: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly depth: number;
}

export interface NavigationManifest {
  readonly roots: readonly string[];
  readonly nodes: Readonly<Record<string, NavigationNode>>;
  readonly previousByNode: Readonly<Record<string, string | null>>;
  readonly nextByNode: Readonly<Record<string, string | null>>;
}

export interface SearchRecord {
  readonly recordId: string;
  readonly documentId: string;
  readonly route: string;
  readonly headingId?: string;
  readonly field: "title" | "heading" | "body" | "code" | "metadata";
  readonly text: string;
  readonly tokens?: readonly string[];
  readonly sourceSpan?: SourceSpan;
  readonly weight: number;
}

export interface PreservationViolation {
  readonly code: string;
  readonly nodeType: string;
  readonly before: number;
  readonly after: number;
  readonly message: string;
}

export interface PreservationReport {
  readonly documentId: string;
  readonly sourceHash: string;
  readonly preservedNodeCount: number;
  readonly transformedNodeCount: number;
  readonly removedNodeCount: number;
  readonly unsupportedNodeCount: number;
  readonly byteRoundTripStatus:
    | "exact"
    | "normalized-equivalent"
    | "semantic-equivalent"
    | "not-verifiable";
  readonly counts: Readonly<
    Record<string, { readonly before: number; readonly after: number }>
  >;
  readonly violations: readonly PreservationViolation[];
}

export interface ArtifactEnvelope<T> {
  readonly schemaVersion: string;
  readonly compilerVersion: string;
  readonly configurationHash: string;
  readonly inputCorpusHash: string;
  readonly generatedAt: string;
  readonly compatibility: {
    readonly minimumCompilerVersion: string;
    readonly irVersion: string;
  };
  readonly data: T;
}

export interface CompilationArtifacts {
  readonly config: BookCompilerConfig;
  readonly configHash: string;
  readonly corpusHash: string;
  readonly sources: readonly SourceRecord[];
  readonly documents: readonly CompiledDocument[];
  readonly contentNodes: Readonly<Record<string, ContentNode>>;
  readonly routes: readonly RouteRecord[];
  readonly navigation: NavigationManifest;
  readonly links: readonly LinkRecord[];
  readonly assets: readonly AssetReference[];
  readonly searchRecords: readonly SearchRecord[];
  readonly preservation: readonly PreservationReport[];
  readonly diagnostics: readonly Diagnostic[];
}
