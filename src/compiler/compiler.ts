import { assetOutputLocation } from "./asset-path";
import { canonicalJsonHash, sha256Hex } from "./canonical";
import { sortDiagnostics } from "./diagnostics";
import { discoverSources } from "./discovery";
import { buildContentGraph } from "./graph";
import {
  resolveLinks,
  type LinkResolutionDocumentInput,
  type UnresolvedLinkInput,
} from "./links";
import {
  resolveDocumentMetadata,
  type ResolvedDocumentMetadata,
} from "./metadata";
import {
  IR_VERSION,
  type AssetReference,
  type BookCompilerConfig,
  type CitationRecord,
  type CodeBlockRecord,
  type CompilationArtifacts,
  type CompiledDocument,
  type CompilerResult,
  type CustomNodeRecord,
  type Diagnostic,
  type DiagramRecord,
  type DocumentNode,
  type EquationRecord,
  type FootnoteRecord,
  type FrontMatterNode,
  type HeadingRecord,
  type LinkRecord,
  type MetadataValue,
  type ParseResult,
  type ProvenanceRecord,
  type RootNode,
  type SourceRecord,
  type SourceRecordReference,
  type SourceSpan,
} from "./model";
import { createRemarkParserAdapter, ParserRegistry } from "./parser";
import { verifyPreservation } from "./preservation";
import { compileRoutes } from "./routes";
import { compileSearchRecords } from "./search";

interface ParsedDocumentState {
  readonly source: SourceRecord;
  readonly parse: ParseResult;
  readonly metadata: ResolvedDocumentMetadata;
  readonly unresolvedLinks: readonly UnresolvedLinkInput[];
  readonly document: CompiledDocument;
}

function childNodes(node: DocumentNode): readonly DocumentNode[] {
  switch (node.type) {
    case "root":
    case "paragraph":
    case "blockquote":
    case "strong":
    case "emphasis":
    case "delete":
    case "heading":
    case "list":
    case "listItem":
    case "link":
    case "linkReference":
    case "table":
    case "tableRow":
    case "tableCell":
    case "footnoteDefinition":
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
    case "mdxFlowExpression":
    case "mdxTextExpression":
    case "mdxJsxFlowElement":
    case "mdxJsxTextElement":
    case "mdxjsEsm":
    case "unsupported":
      return node.children;
    case "text":
    case "break":
    case "thematicBreak":
    case "inlineCode":
    case "code":
    case "image":
    case "imageReference":
    case "definition":
    case "html":
    case "math":
    case "inlineMath":
    case "footnoteReference":
      return [];
  }
}

function flattenNodes(root: RootNode): readonly DocumentNode[] {
  const result: DocumentNode[] = [];
  const stack: DocumentNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    result.push(node);
    const children = childNodes(node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return result;
}

function sourceReference(source: SourceRecord): SourceRecordReference {
  return {
    sourceId: source.sourceId,
    rootId: source.rootId,
    relativePath: source.relativePath,
    normalizedPath: source.normalizedPath,
    extension: source.extension,
    mediaType: source.mediaType,
    encoding: source.encoding,
    byteLength: source.byteLength,
    contentHash: source.contentHash,
    trustLevel: source.trustLevel,
    ...(source.newlineStyle === undefined
      ? {}
      : { newlineStyle: source.newlineStyle }),
    ...(source.bom === undefined ? {} : { bom: source.bom }),
  };
}

function sourceMetadata(
  frontMatter: FrontMatterNode | undefined,
): Readonly<Record<string, MetadataValue>> {
  const source = Object.create(null) as Record<string, MetadataValue>;
  for (const entry of frontMatter?.entries ?? []) {
    source[entry.key] = entry.value;
  }
  return source;
}

function requireSpan(
  node: DocumentNode,
  sourceId: string,
  diagnostics: Diagnostic[],
): SourceSpan | undefined {
  if (node.sourceSpan !== undefined) {
    return node.sourceSpan;
  }
  diagnostics.push({
    code: "IR_SOURCE_SPAN_MISSING",
    severity: "error",
    message: `Parsed node '${node.nodeId}' has no derivable source position.`,
    phase: "ast",
    sourceId,
    nodeId: node.nodeId,
    remediation:
      "Preserve the construct as an opaque positioned node or reject its parser adapter.",
  });
  return undefined;
}

interface ExtractedDocumentRecords {
  readonly headings: readonly HeadingRecord[];
  readonly links: readonly UnresolvedLinkInput[];
  readonly codeBlocks: readonly CodeBlockRecord[];
  readonly equations: readonly EquationRecord[];
  readonly diagrams: readonly DiagramRecord[];
  readonly citations: readonly CitationRecord[];
  readonly footnotes: readonly FootnoteRecord[];
  readonly customNodes: readonly CustomNodeRecord[];
  readonly diagnostics: readonly Diagnostic[];
}

function extractDocumentRecords(
  documentId: string,
  sourceId: string,
  parse: ParseResult,
): ExtractedDocumentRecords {
  const diagnostics: Diagnostic[] = [];
  const headings: HeadingRecord[] = [];
  const links: UnresolvedLinkInput[] = [];
  const codeBlocks: CodeBlockRecord[] = [];
  const equations: EquationRecord[] = [];
  const diagrams: DiagramRecord[] = [];
  const citations: CitationRecord[] = [];
  const customNodes: CustomNodeRecord[] = [];
  const footnoteDefinitions = new Map<string, string>();
  const footnoteReferences = new Map<string, string[]>();
  const headingStack: HeadingRecord[] = [];

  for (const node of flattenNodes(parse.document)) {
    const span = requireSpan(node, sourceId, diagnostics);
    switch (node.type) {
      case "heading": {
        if (span === undefined) {
          break;
        }
        while ((headingStack.at(-1)?.depth ?? 0) >= node.depth) {
          headingStack.pop();
        }
        const parent = headingStack.at(-1);
        const record: HeadingRecord = {
          headingId: node.nodeId,
          documentId,
          depth: node.depth,
          authoredText: node.authoredText,
          plainText: node.displayText,
          effectiveId: node.effectiveId,
          sourceSpan: span,
          ...(node.explicitId === undefined
            ? { generatedId: node.effectiveId }
            : { explicitId: node.explicitId }),
          ...(parent === undefined
            ? {}
            : { parentHeadingId: parent.headingId }),
        };
        headings.push(record);
        headingStack.push(record);
        break;
      }
      case "link":
      case "linkReference": {
        if (span === undefined) {
          break;
        }
        const definition =
          node.identifier === undefined
            ? undefined
            : parse.definitions[node.identifier];
        links.push({
          linkId: node.nodeId,
          sourceNodeId: node.nodeId,
          originalTarget: node.url ?? node.identifier ?? node.rawSource,
          sourceSpan: span,
          ...(definition === undefined
            ? {}
            : { definitionTarget: definition.url }),
          ...(node.type === "linkReference"
            ? { kindHint: "reference-definition" }
            : {}),
        });
        break;
      }
      case "image":
      case "imageReference": {
        if (span === undefined) {
          break;
        }
        const definition =
          node.identifier === undefined
            ? undefined
            : parse.definitions[node.identifier];
        links.push({
          linkId: node.nodeId,
          sourceNodeId: node.nodeId,
          originalTarget: node.url ?? node.identifier ?? node.rawSource,
          sourceSpan: span,
          isAsset: true,
          ...(definition === undefined
            ? {}
            : { definitionTarget: definition.url }),
          ...(node.type === "imageReference"
            ? { kindHint: "reference-definition" }
            : {}),
        });
        break;
      }
      case "code":
        if (span !== undefined) {
          codeBlocks.push({
            nodeId: node.nodeId,
            rawCode: node.rawCode,
            displayCode: node.displayCode,
            metadata: {},
            sourceSpan: span,
            ...(node.language === undefined ? {} : { language: node.language }),
            ...(node.infoString === undefined
              ? {}
              : { infoString: node.infoString }),
            ...(node.highlightedRepresentation === undefined
              ? {}
              : { highlightedRepresentation: node.highlightedRepresentation }),
          });
          if (node.language?.toLocaleLowerCase("en-US") === "mermaid") {
            diagrams.push({
              diagramId: node.nodeId,
              language: node.language,
              source: node.rawCode,
              sourceSpan: span,
              renderDiagnostics: [],
            });
          }
        }
        break;
      case "math":
      case "inlineMath":
        if (span !== undefined) {
          equations.push({
            equationId: node.nodeId,
            source: node.source,
            displayMode: node.type === "math" ? "block" : "inline",
            sourceSpan: span,
            ...(node.renderedHtml === undefined
              ? {}
              : { renderedHtml: node.renderedHtml }),
          });
        }
        break;
      case "footnoteDefinition":
        if (node.identifier !== undefined) {
          footnoteDefinitions.set(node.identifier, node.nodeId);
        }
        break;
      case "footnoteReference": {
        const references = footnoteReferences.get(node.identifier) ?? [];
        references.push(node.nodeId);
        footnoteReferences.set(node.identifier, references);
        break;
      }
      case "containerDirective":
      case "leafDirective":
      case "textDirective":
      case "mdxFlowExpression":
      case "mdxTextExpression":
      case "mdxJsxFlowElement":
      case "mdxJsxTextElement":
      case "mdxjsEsm":
      case "unsupported":
        customNodes.push({
          nodeId: node.nodeId,
          nodeType: node.type === "unsupported" ? node.originalType : node.type,
          supported:
            node.type !== "unsupported" && !node.type.startsWith("mdx"),
          ...(span === undefined ? {} : { sourceSpan: span }),
        });
        break;
      default:
        break;
    }
  }

  const footnoteIds = new Set([
    ...footnoteDefinitions.keys(),
    ...footnoteReferences.keys(),
  ]);
  const footnotes: FootnoteRecord[] = [...footnoteIds]
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((identifier) => {
      const definitionNodeId = footnoteDefinitions.get(identifier);
      return {
        footnoteId: `${documentId}:footnote:${encodeURIComponent(identifier)}`,
        authoredIdentifier: identifier,
        referenceNodeIds: footnoteReferences.get(identifier) ?? [],
        ...(definitionNodeId === undefined ? {} : { definitionNodeId }),
      };
    });

  return {
    headings,
    links,
    codeBlocks,
    equations,
    diagrams,
    citations,
    footnotes,
    customNodes,
    diagnostics,
  };
}

function corpusHash(sources: readonly SourceRecord[]): string {
  return sha256Hex(
    sources
      .map(
        (source) =>
          `${source.rootId}\0${source.normalizedPath}\0${source.contentHash}`,
      )
      .join("\n"),
  );
}

function fail<T>(diagnostics: readonly Diagnostic[]): CompilerResult<T> {
  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

const MANDATORY_FAILURE_CODES: ReadonlySet<string> = new Set([
  "PARSER_DUPLICATE_EXPLICIT_HEADING_ID",
  "VALIDATION_REMOVE_TRANSFORM_NOT_ALLOWED",
]);

function isMandatoryFailureDiagnostic(diagnostic: Diagnostic): boolean {
  return (
    MANDATORY_FAILURE_CODES.has(diagnostic.code) ||
    diagnostic.code.startsWith("PRESERVATION_") ||
    diagnostic.code.startsWith("DATA_LOSS_")
  );
}

function hasBuildFailure(
  config: BookCompilerConfig,
  diagnostics: readonly Diagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => {
    if (isMandatoryFailureDiagnostic(diagnostic)) {
      return true;
    }

    return config.validationPolicy.failOn === "fatal"
      ? diagnostic.severity === "fatal"
      : diagnostic.severity === "error" || diagnostic.severity === "fatal";
  });
}

function removeTransformPolicyDiagnostics(
  sourceId: string,
  provenance: readonly ProvenanceRecord[],
  allowRemoveTransforms: boolean,
): readonly Diagnostic[] {
  if (allowRemoveTransforms) {
    return [];
  }

  return provenance.flatMap((record): readonly Diagnostic[] => {
    if (record.mutationType !== "remove") {
      return [];
    }

    const inputNodeIds = JSON.stringify(record.inputNodeIds);
    const outputNodeIds = JSON.stringify(record.outputNodeIds);
    const nodeId = record.inputNodeIds[0] ?? record.outputNodeIds[0];
    return [
      {
        code: "VALIDATION_REMOVE_TRANSFORM_NOT_ALLOWED",
        severity: "error",
        message: `Transform ${JSON.stringify(record.transformId)} version ${JSON.stringify(record.transformVersion)} declares a remove mutation from input nodes ${inputNodeIds} to output nodes ${outputNodeIds}.`,
        phase: "output",
        sourceId,
        ...(nodeId === undefined ? {} : { nodeId }),
        remediation:
          "Replace the transform with a lossless representation, or explicitly set validationPolicy.allowRemoveTransforms to true after reviewing the data-loss boundary.",
      },
    ];
  });
}

function firstHeading(root: RootNode): string | undefined {
  return flattenNodes(root).find((node) => node.type === "heading")
    ?.authoredText;
}

function diagnosticsForSource(
  diagnostics: readonly Diagnostic[],
  sourceId: string,
): readonly Diagnostic[] {
  return diagnostics.filter((diagnostic) => diagnostic.sourceId === sourceId);
}

export async function compileBook(
  config: BookCompilerConfig,
  projectRoot: string,
): Promise<CompilerResult<CompilationArtifacts>> {
  const diagnostics: Diagnostic[] = [];
  const discovered = await discoverSources(config, { cwd: projectRoot });
  diagnostics.push(...discovered.diagnostics);
  if (!discovered.ok) {
    return fail(diagnostics);
  }

  const sources = discovered.value;
  const documentSources = sources.filter(
    (source) => source.sourceKind === "document",
  );
  const assetSources = sources.filter(
    (source) => source.sourceKind === "asset",
  );
  const adapters = Object.keys(config.parserPolicy.dialects)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((id) => createRemarkParserAdapter({ id }));
  const registry = new ParserRegistry(adapters);
  const parsedStates: ParsedDocumentState[] = [];

  for (const source of documentSources) {
    const parsed = await registry.parse(source, config);
    diagnostics.push(...parsed.diagnostics);
    if (!parsed.ok) {
      continue;
    }
    diagnostics.push(
      ...removeTransformPolicyDiagnostics(
        source.sourceId,
        parsed.value.provenance,
        config.validationPolicy.allowRemoveTransforms,
      ),
    );

    const sourceValues = sourceMetadata(parsed.value.frontMatter);
    const authoredFirstHeading = firstHeading(parsed.value.document);
    const metadata = resolveDocumentMetadata(
      {
        sourceId: source.sourceId,
        normalizedPath: source.normalizedPath,
        source: sourceValues,
        sourceEntries: parsed.value.frontMatter?.entries ?? [],
        derived: { sourcePath: source.normalizedPath },
        ...(parsed.value.frontMatter === undefined
          ? {}
          : { rawFrontMatter: parsed.value.frontMatter.raw }),
        ...(authoredFirstHeading === undefined
          ? {}
          : { firstHeading: authoredFirstHeading }),
      },
      config.metadataPolicy,
    );
    diagnostics.push(...metadata.diagnostics);
    if (!metadata.ok) {
      continue;
    }

    const records = extractDocumentRecords(
      metadata.value.documentId.value,
      source.sourceId,
      parsed.value,
    );
    diagnostics.push(...records.diagnostics);
    const document: CompiledDocument = {
      irVersion: IR_VERSION,
      documentId: metadata.value.documentId.value,
      source: sourceReference(source),
      metadata: metadata.value.metadata,
      root: parsed.value.document,
      title: metadata.value.title,
      headings: records.headings,
      links: [],
      assets: [],
      citations: records.citations,
      footnotes: records.footnotes,
      codeBlocks: records.codeBlocks,
      equations: records.equations,
      diagrams: records.diagrams,
      customNodes: records.customNodes,
      diagnostics: sortDiagnostics([
        ...parsed.value.diagnostics,
        ...metadata.diagnostics,
        ...records.diagnostics,
      ]),
      provenance: parsed.value.provenance,
    };
    parsedStates.push({
      source,
      parse: parsed.value,
      metadata: metadata.value,
      unresolvedLinks: records.links,
      document,
    });
  }

  if (
    parsedStates.length !== documentSources.length ||
    hasBuildFailure(config, diagnostics)
  ) {
    return fail(diagnostics);
  }

  const routesResult = compileRoutes(
    parsedStates.map((state) => ({
      documentId: state.document.documentId,
      sourceId: state.source.sourceId,
      normalizedPath: state.source.normalizedPath,
      aliases: state.metadata.aliases,
      ...(state.metadata.route === undefined
        ? {}
        : { explicitRoute: state.metadata.route }),
      ...(state.metadata.slug === undefined
        ? {}
        : { slug: state.metadata.slug }),
    })),
    config.routePolicy,
  );
  diagnostics.push(...routesResult.diagnostics);
  if (!routesResult.ok) {
    return fail(diagnostics);
  }
  const routeByDocument = new Map(
    routesResult.value.map((route) => [route.documentId, route.canonicalRoute]),
  );

  const graph = buildContentGraph({
    corpusId: config.corpusId,
    documents: parsedStates.map((state, sourceDiscoveryOrder) => {
      const canonicalRoute = routeByDocument.get(state.document.documentId);
      return {
        documentId: state.document.documentId,
        sourceId: state.source.sourceId,
        rootId: state.source.rootId,
        normalizedPath: state.source.normalizedPath,
        title: state.document.title,
        metadata: state.document.metadata,
        sourceDiscoveryOrder,
        ...(canonicalRoute === undefined ? {} : { canonicalRoute }),
        ...(state.metadata.parentId === undefined
          ? {}
          : { explicitParentId: state.metadata.parentId }),
        ...(state.metadata.order === undefined
          ? {}
          : { explicitOrder: state.metadata.order }),
      };
    }),
    hierarchyPolicy: config.hierarchyPolicy,
    orderingPolicy: config.orderingPolicy,
  });
  diagnostics.push(...graph.diagnostics);
  if (!graph.ok) {
    return fail(diagnostics);
  }

  const linkInputs: LinkResolutionDocumentInput[] = parsedStates.map(
    (state) => {
      const route = routeByDocument.get(state.document.documentId);
      if (route === undefined) {
        throw new Error(
          `Validated route missing for document '${state.document.documentId}'.`,
        );
      }
      return {
        documentId: state.document.documentId,
        sourceId: state.source.sourceId,
        rootId: state.source.rootId,
        normalizedPath: state.source.normalizedPath,
        route,
        headings: state.document.headings,
        links: state.unresolvedLinks,
      };
    },
  );
  const resolvedLinks = resolveLinks(
    linkInputs,
    assetSources.map((source) => ({
      assetId: source.sourceId,
      sourceId: source.sourceId,
      rootId: source.rootId,
      normalizedPath: source.normalizedPath,
      outputPath: assetOutputLocation(source, config.assetPolicy).publicUrl,
    })),
    config.linkPolicy,
  );
  diagnostics.push(...resolvedLinks.diagnostics);
  if (!resolvedLinks.ok) {
    return fail(diagnostics);
  }

  const linksByDocument = new Map<string, LinkRecord[]>();
  for (const link of resolvedLinks.value.links) {
    const records = linksByDocument.get(link.sourceDocumentId) ?? [];
    records.push(link);
    linksByDocument.set(link.sourceDocumentId, records);
  }
  const assetsByDocument = new Map<string, AssetReference[]>();
  for (const asset of resolvedLinks.value.assets) {
    const records = assetsByDocument.get(asset.sourceDocumentId) ?? [];
    records.push(asset);
    assetsByDocument.set(asset.sourceDocumentId, records);
  }
  const documents = parsedStates.map((state) => ({
    ...state.document,
    links: linksByDocument.get(state.document.documentId) ?? [],
    assets: assetsByDocument.get(state.document.documentId) ?? [],
    diagnostics: sortDiagnostics([
      ...state.document.diagnostics,
      ...diagnosticsForSource(resolvedLinks.diagnostics, state.source.sourceId),
    ]),
  }));

  const search = compileSearchRecords(
    documents,
    routesResult.value,
    config.searchPolicy,
  );
  diagnostics.push(...search.diagnostics);
  if (!search.ok) {
    return fail(diagnostics);
  }

  const preservation = parsedStates.map((state) =>
    verifyPreservation({
      documentId: state.document.documentId,
      sourceHash: state.source.contentHash,
      before: state.parse.document,
      after: state.document.root,
      sourceText: state.parse.document.rawSource,
      serializedText: state.document.root.rawSource,
    }),
  );
  for (const report of preservation) {
    for (const violation of report.violations) {
      diagnostics.push({
        code: violation.code,
        severity: "error",
        message: violation.message,
        phase: "output",
        nodeId: report.documentId,
        remediation:
          "Disable the lossy transformation or implement a reversible representation.",
      });
    }
  }

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const hasPreservationViolation = preservation.some(
    (report) => report.violations.length > 0,
  );
  if (hasPreservationViolation || hasBuildFailure(config, sortedDiagnostics)) {
    return fail(sortedDiagnostics);
  }

  return {
    ok: true,
    value: {
      config,
      configHash: canonicalJsonHash(config),
      corpusHash: corpusHash(sources),
      sources,
      documents,
      contentNodes: graph.value.nodes,
      routes: routesResult.value,
      navigation: graph.value.navigation,
      links: resolvedLinks.value.links,
      assets: resolvedLinks.value.assets,
      searchRecords: search.value,
      preservation,
      diagnostics: sortedDiagnostics,
    },
    diagnostics: sortedDiagnostics,
  };
}
