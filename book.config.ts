import { defineBookConfig } from "./src/compiler/config";

const sourceDateEpoch = process.env["SOURCE_DATE_EPOCH"];
const reproducibleTimestamp = sourceDateEpoch
  ? new Date(Number.parseInt(sourceDateEpoch, 10) * 1_000).toISOString()
  : "1970-01-01T00:00:00.000Z";

export default defineBookConfig({
  corpusId: "engineering-reliable-agentic-ai-systems",
  contentRoots: [
    {
      id: "book",
      path: ".",
      trustLevel: "reviewed",
    },
  ],
  include: [
    "README.md",
    "Part-*/**/*.md",
    "Knowledge_source/**/*.md",
    "Knowledge_source/**/*.pdf",
  ],
  exclude: [
    ".book-cache/**",
    ".git/**",
    ".github/**",
    ".next/**",
    "build/**",
    "node_modules/**",
    "out/**",
    "platform-docs/**",
    "public/_book/**",
    "tests/**",
  ],
  discoveryPolicy: {
    symbolicLinks: "ignore",
    hiddenFiles: "exclude",
    caseSensitivity: "sensitive",
    sourceIdStrategy: "path",
  },
  parserPolicy: {
    defaultAdapter: "markdown-gfm-math",
    extensionAdapters: {
      ".md": "markdown-gfm-math",
      ".mdx": "mdx",
    },
    defaultEncoding: "utf8",
    encodingOverrides: {},
    dialects: {
      "markdown-gfm-math": {
        gfm: true,
        math: true,
        directives: true,
        mdx: false,
      },
      mdx: {
        gfm: true,
        math: true,
        directives: true,
        mdx: true,
      },
    },
    frontMatter: [
      { type: "yaml", open: "---", close: "---" },
      { type: "toml", open: "+++", close: "+++" },
      { type: "json", open: ";;;", close: ";;;" },
    ],
  },
  metadataPolicy: {
    precedence: [
      "source",
      "configuration",
      "derived",
      "defaulted",
      "generated",
    ],
    titleFields: ["title", "name"],
    idFields: ["id", "documentId"],
    parentFields: ["parent", "parentId"],
    orderFields: ["order", "weight"],
    routeFields: ["route", "permalink"],
    slugFields: ["slug"],
    aliasFields: ["aliases", "redirectsFrom"],
    strictTypes: true,
  },
  hierarchyPolicy: {
    strategies: ["explicit-parent", "configuration", "filesystem"],
    indexDocuments: ["README.md"],
    explicitParents: {},
    manifestPaths: [],
    orphanPolicy: "root",
  },
  orderingPolicy: {
    comparators: ["explicit-order", "natural-path", "lexical-path"],
    numeric: true,
    caseSensitivity: "sensitive",
    missingValuePolicy: "last",
    tiePolicy: "path",
  },
  routePolicy: {
    routePrefix: "/read",
    explicitRoutes: {
      "README.md": "/",
    },
    lowercase: true,
    trailingSlash: false,
    reservedRoutes: [
      "/404",
      "/_next",
      "/api",
      "/book-manifest.json",
      "/search",
    ],
  },
  assetPolicy: {
    extensions: {
      ".avif": "image/avif",
      ".csv": "text/csv",
      ".gif": "image/gif",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".json": "application/json",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webm": "video/webm",
      ".webp": "image/webp",
    },
    required: false,
    outputPrefix: "/_book/assets",
    copyOriginals: true,
  },
  linkPolicy: {
    validateInternal: true,
    failOnBroken: true,
    caseSensitivity: "sensitive",
    allowedProtocols: ["http", "https", "mailto"],
    invalidTraversal: "error",
  },
  renderingPolicy: {
    rawHtml: "sanitize",
    unknownNodes: "quarantine",
    syntaxHighlighting: true,
    lightCodeTheme: "github-light",
    darkCodeTheme: "github-dark",
    math: true,
    diagrams: "source",
  },
  searchPolicy: {
    enabled: true,
    fields: ["title", "heading", "body", "code", "metadata"],
    chunkRecordLimit: 500,
    minimumTokenLength: 2,
  },
  validationPolicy: {
    failOn: "error",
    duplicateExplicitHeadingId: "error",
    unsupportedSyntax: "warning",
    allowRemoveTransforms: false,
    // The largest tracked PDF is ~26 MiB; 64 MiB keeps reads explicitly bounded.
    maxSourceBytes: 64 * 1_024 * 1_024,
  },
  outputPolicy: {
    directory: "build",
    publicDirectory: "public/_book",
    reproducibleTimestamp,
    emitSourceCopies: true,
    emitPrettyJson: true,
  },
});
