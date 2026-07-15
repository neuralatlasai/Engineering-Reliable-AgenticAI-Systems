import type { z } from "zod";

import { canonicalJsonHash } from "./canonical";
import { BookCompilerConfigSchema } from "./config-schema";
import {
  createDiagnostic,
  DIAGNOSTIC_CODES,
  sortDiagnostics,
  type DiagnosticCode,
} from "./diagnostics";
import type {
  AssetPolicy,
  BookCompilerConfig,
  CompilerResult,
  ContentRootConfig,
  DiscoveryPolicy,
  HierarchyPolicy,
  LinkPolicy,
  MetadataPolicy,
  OrderingPolicy,
  OutputPolicy,
  ParserPolicy,
  RenderingPolicy,
  RoutePolicy,
  SearchPolicy,
  ValidationPolicy,
} from "./model";

export const DEFAULT_INCLUDE = [
  "**/*.{avif,css,gif,jpeg,jpg,json,markdown,md,mdx,pdf,png,svg,webp,woff,woff2}",
] as const;
export const DEFAULT_EXCLUDE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.book-cache/**",
  "**/build/**",
  "**/out/**",
] as const;

export const DEFAULT_DISCOVERY_POLICY: DiscoveryPolicy = {
  symbolicLinks: "ignore",
  hiddenFiles: "exclude",
  caseSensitivity: "sensitive",
  sourceIdStrategy: "path",
};

export const DEFAULT_PARSER_POLICY: ParserPolicy = {
  defaultAdapter: "commonmark",
  extensionAdapters: {
    ".markdown": "commonmark",
    ".md": "commonmark",
    ".mdx": "mdx",
  },
  defaultEncoding: "utf-8",
  encodingOverrides: {},
  dialects: {
    commonmark: { gfm: false, math: false, directives: false, mdx: false },
    gfm: { gfm: true, math: false, directives: false, mdx: false },
    mdx: { gfm: true, math: true, directives: true, mdx: true },
  },
  frontMatter: [
    { type: "yaml", open: "---", close: "---" },
    { type: "toml", open: "+++", close: "+++" },
  ],
};

export const DEFAULT_METADATA_POLICY: MetadataPolicy = {
  precedence: ["source", "configuration", "derived", "defaulted", "generated"],
  titleFields: ["title", "name"],
  idFields: ["id", "documentId"],
  parentFields: ["parent", "parentId"],
  orderFields: ["order", "weight"],
  routeFields: ["route", "permalink"],
  slugFields: ["slug"],
  aliasFields: ["aliases", "redirects"],
  strictTypes: true,
};

export const DEFAULT_HIERARCHY_POLICY: HierarchyPolicy = {
  strategies: ["explicit-parent", "configuration", "manifest", "filesystem"],
  indexDocuments: ["index.md", "README.md"],
  explicitParents: {},
  manifestPaths: [],
  orphanPolicy: "root",
};

export const DEFAULT_ORDERING_POLICY: OrderingPolicy = {
  comparators: [
    "explicit-order",
    "manifest-order",
    "natural-path",
    "lexical-path",
  ],
  numeric: true,
  caseSensitivity: "sensitive",
  missingValuePolicy: "last",
  tiePolicy: "source-id",
};

export const DEFAULT_ROUTE_POLICY: RoutePolicy = {
  routePrefix: "/",
  explicitRoutes: {},
  lowercase: true,
  trailingSlash: false,
  reservedRoutes: ["/404", "/api", "/_next"],
};

export const DEFAULT_ASSET_POLICY: AssetPolicy = {
  extensions: {
    ".avif": "image/avif",
    ".css": "text/css",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  },
  required: false,
  outputPrefix: "/assets",
  copyOriginals: true,
};

export const DEFAULT_LINK_POLICY: LinkPolicy = {
  validateInternal: true,
  failOnBroken: true,
  caseSensitivity: "sensitive",
  allowedProtocols: ["http:", "https:", "mailto:"],
  invalidTraversal: "error",
};

export const DEFAULT_RENDERING_POLICY: RenderingPolicy = {
  rawHtml: "sanitize",
  unknownNodes: "quarantine",
  syntaxHighlighting: true,
  lightCodeTheme: "github-light",
  darkCodeTheme: "github-dark",
  math: true,
  diagrams: "isolated",
};

export const DEFAULT_SEARCH_POLICY: SearchPolicy = {
  enabled: true,
  fields: ["title", "heading", "body", "code", "metadata"],
  chunkRecordLimit: 2_000,
  minimumTokenLength: 2,
};

export const DEFAULT_VALIDATION_POLICY: ValidationPolicy = {
  failOn: "error",
  duplicateExplicitHeadingId: "error",
  unsupportedSyntax: "error",
  allowRemoveTransforms: false,
  maxSourceBytes: 32 * 1024 * 1024,
};

export const DEFAULT_OUTPUT_POLICY: OutputPolicy = {
  directory: "build",
  publicDirectory: "public/_book",
  reproducibleTimestamp: "1970-01-01T00:00:00.000Z",
  emitSourceCopies: false,
  emitPrettyJson: true,
};

export interface BookCompilerConfigDefinition {
  readonly corpusId: string;
  readonly contentRoots: readonly ContentRootConfig[];
  readonly include?: readonly string[];
  readonly exclude?: readonly string[];
  readonly discoveryPolicy?: Partial<DiscoveryPolicy>;
  readonly parserPolicy?: Partial<ParserPolicy>;
  readonly metadataPolicy?: Partial<MetadataPolicy>;
  readonly hierarchyPolicy?: Partial<HierarchyPolicy>;
  readonly orderingPolicy?: Partial<OrderingPolicy>;
  readonly routePolicy?: Partial<RoutePolicy>;
  readonly assetPolicy?: Partial<AssetPolicy>;
  readonly linkPolicy?: Partial<LinkPolicy>;
  readonly renderingPolicy?: Partial<RenderingPolicy>;
  readonly searchPolicy?: Partial<SearchPolicy>;
  readonly validationPolicy?: Partial<ValidationPolicy>;
  readonly outputPolicy?: Partial<OutputPolicy>;
}

// defineBookConfig supplies documented, deterministic defaults and preserves a
// conventional config-file API. Runtime consumers must still call
// validateBookCompilerConfig at the untrusted module boundary.
export function defineBookConfig(
  definition: BookCompilerConfigDefinition,
): BookCompilerConfig {
  return {
    corpusId: definition.corpusId,
    contentRoots: definition.contentRoots,
    include: definition.include ?? DEFAULT_INCLUDE,
    exclude: definition.exclude ?? DEFAULT_EXCLUDE,
    discoveryPolicy: {
      ...DEFAULT_DISCOVERY_POLICY,
      ...definition.discoveryPolicy,
    },
    parserPolicy: {
      ...DEFAULT_PARSER_POLICY,
      ...definition.parserPolicy,
    },
    metadataPolicy: {
      ...DEFAULT_METADATA_POLICY,
      ...definition.metadataPolicy,
    },
    hierarchyPolicy: {
      ...DEFAULT_HIERARCHY_POLICY,
      ...definition.hierarchyPolicy,
    },
    orderingPolicy: {
      ...DEFAULT_ORDERING_POLICY,
      ...definition.orderingPolicy,
    },
    routePolicy: {
      ...DEFAULT_ROUTE_POLICY,
      ...definition.routePolicy,
    },
    assetPolicy: {
      ...DEFAULT_ASSET_POLICY,
      ...definition.assetPolicy,
    },
    linkPolicy: {
      ...DEFAULT_LINK_POLICY,
      ...definition.linkPolicy,
    },
    renderingPolicy: {
      ...DEFAULT_RENDERING_POLICY,
      ...definition.renderingPolicy,
    },
    searchPolicy: {
      ...DEFAULT_SEARCH_POLICY,
      ...definition.searchPolicy,
    },
    validationPolicy: {
      ...DEFAULT_VALIDATION_POLICY,
      ...definition.validationPolicy,
    },
    outputPolicy: {
      ...DEFAULT_OUTPUT_POLICY,
      ...definition.outputPolicy,
    },
  };
}

function issueDiagnosticCode(issue: z.core.$ZodIssue): DiagnosticCode {
  if (issue.code !== "custom") {
    return DIAGNOSTIC_CODES.CONFIG_INVALID;
  }

  const configuredCode: unknown = issue.params?.["diagnosticCode"];
  return typeof configuredCode === "string" &&
    Object.values(DIAGNOSTIC_CODES).some((code) => code === configuredCode)
    ? (configuredCode as DiagnosticCode)
    : DIAGNOSTIC_CODES.CONFIG_INVALID;
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "/";
  }

  return `/${path
    .map((segment) =>
      String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
    )
    .join("/")}`;
}

export function validateBookCompilerConfig(
  input: unknown,
): CompilerResult<BookCompilerConfig> {
  const parsed = BookCompilerConfigSchema.safeParse(input);
  if (parsed.success) {
    return {
      ok: true,
      value: parsed.data as BookCompilerConfig,
      diagnostics: [],
    };
  }

  const diagnostics = parsed.error.issues.map((issue) =>
    createDiagnostic({
      code: issueDiagnosticCode(issue),
      message: `Invalid compiler configuration at ${formatIssuePath(issue.path)}: ${issue.message}`,
      remediation:
        "Correct the configuration value at the reported JSON Pointer and rerun validation.",
    }),
  );

  return { ok: false, diagnostics: sortDiagnostics(diagnostics) };
}

export const resolveBookCompilerConfig = validateBookCompilerConfig;

export function hashBookCompilerConfig(config: BookCompilerConfig): string {
  return canonicalJsonHash(config);
}

export type BookCompilerConfigInput = z.input<typeof BookCompilerConfigSchema>;
