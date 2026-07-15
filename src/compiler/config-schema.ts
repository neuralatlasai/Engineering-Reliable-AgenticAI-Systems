import { z } from "zod";

import { normalizeRelativePath } from "./canonical";
import { DIAGNOSTIC_CODES } from "./diagnostics";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u;
const EXTENSION_PATTERN = /^\.[A-Za-z0-9][A-Za-z0-9+._-]*$/u;
const PROTOCOL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:?$/u;
const UNSAFE_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const nonEmptyText = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\0"), {
    message: "Values must not contain NUL characters.",
  });

const pathText = nonEmptyText.refine((value) => value.trim() === value, {
  message: "Filesystem paths must not have leading or trailing whitespace.",
});

const globText = nonEmptyText.refine((value) => value.trim() === value, {
  message: "Glob patterns must not have leading or trailing whitespace.",
});

const identifier = nonEmptyText.regex(
  IDENTIFIER_PATTERN,
  "Identifiers must use ASCII letters, digits, dots, underscores, or hyphens.",
);

const extension = nonEmptyText.regex(
  EXTENSION_PATTERN,
  "Extensions must begin with a dot and contain only portable extension characters.",
);

function safeStringRecord(valueSchema: z.ZodType<string>) {
  return z.record(z.string(), valueSchema).superRefine((record, context) => {
    for (const key of Object.keys(record)) {
      if (UNSAFE_RECORD_KEYS.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Record key ${JSON.stringify(key)} is prohibited.`,
          path: [key],
          params: { diagnosticCode: DIAGNOSTIC_CODES.CONFIG_UNSAFE_RECORD_KEY },
        });
      }
    }
  });
}

function safeExtensionRecord(valueSchema: z.ZodType<string>) {
  return z.record(extension, valueSchema).superRefine((record, context) => {
    for (const key of Object.keys(record)) {
      if (UNSAFE_RECORD_KEYS.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Extension-map key ${JSON.stringify(key)} is prohibited.`,
          path: [key],
          params: { diagnosticCode: DIAGNOSTIC_CODES.CONFIG_UNSAFE_RECORD_KEY },
        });
      }
    }
  });
}

function addDuplicateIssues(
  values: readonly string[],
  context: z.RefinementCtx,
  label: string,
): void {
  const firstIndexByValue = new Map<string, number>();

  values.forEach((value, index) => {
    const firstIndex = firstIndexByValue.get(value);
    if (firstIndex === undefined) {
      firstIndexByValue.set(value, index);
      return;
    }

    context.addIssue({
      code: "custom",
      message: `${label} contains duplicate value ${JSON.stringify(value)} (first declared at index ${firstIndex}).`,
      path: [index],
    });
  });
}

const contentRootSchema = z
  .object({
    id: identifier,
    path: pathText,
    include: z.array(globText).optional(),
    exclude: z.array(globText).optional(),
    trustLevel: z.enum(["trusted-static", "reviewed", "untrusted"]),
  })
  .strict()
  .superRefine((root, context) => {
    if (root.include !== undefined) {
      addDuplicateIssues(root.include, context, "Root include list");
    }
    if (root.exclude !== undefined) {
      addDuplicateIssues(root.exclude, context, "Root exclude list");
    }
  });

const dialectSchema = z
  .object({
    gfm: z.boolean(),
    math: z.boolean(),
    directives: z.boolean(),
    mdx: z.boolean(),
  })
  .strict();

const parserPolicySchema = z
  .object({
    defaultAdapter: identifier,
    extensionAdapters: safeExtensionRecord(identifier),
    defaultEncoding: nonEmptyText,
    encodingOverrides: safeStringRecord(nonEmptyText),
    dialects: z.record(identifier, dialectSchema),
    frontMatter: z.array(
      z
        .object({
          type: z.enum(["yaml", "toml", "json"]),
          open: nonEmptyText,
          close: nonEmptyText,
        })
        .strict()
        .refine(
          (value) => value.open !== value.close || value.open.length > 1,
          {
            message:
              "A one-character front-matter marker cannot open and close the block.",
          },
        ),
    ),
  })
  .strict()
  .superRefine((policy, context) => {
    const declarations = policy.frontMatter.map(
      (entry) => `${entry.type}\0${entry.open}\0${entry.close}`,
    );
    addDuplicateIssues(declarations, context, "Front-matter declarations");

    for (const pattern of Object.keys(policy.encodingOverrides)) {
      if (pattern.trim().length === 0 || pattern.includes("\0")) {
        context.addIssue({
          code: "custom",
          message:
            "Encoding override keys must be non-empty, NUL-free glob patterns.",
          path: ["encodingOverrides", pattern],
        });
      }
    }
  });

const metadataPolicySchema = z
  .object({
    precedence: z.array(
      z.enum(["source", "configuration", "derived", "defaulted", "generated"]),
    ),
    titleFields: z.array(nonEmptyText),
    idFields: z.array(nonEmptyText),
    parentFields: z.array(nonEmptyText),
    orderFields: z.array(nonEmptyText),
    routeFields: z.array(nonEmptyText),
    slugFields: z.array(nonEmptyText),
    aliasFields: z.array(nonEmptyText),
    strictTypes: z.boolean(),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(policy.precedence, context, "Metadata precedence");
    addDuplicateIssues(policy.titleFields, context, "Title fields");
    addDuplicateIssues(policy.idFields, context, "Identifier fields");
    addDuplicateIssues(policy.parentFields, context, "Parent fields");
    addDuplicateIssues(policy.orderFields, context, "Order fields");
    addDuplicateIssues(policy.routeFields, context, "Route fields");
    addDuplicateIssues(policy.slugFields, context, "Slug fields");
    addDuplicateIssues(policy.aliasFields, context, "Alias fields");
  });

const hierarchyPolicySchema = z
  .object({
    strategies: z.array(
      z.enum([
        "explicit-parent",
        "configuration",
        "manifest",
        "filesystem",
        "flat",
      ]),
    ),
    indexDocuments: z.array(nonEmptyText),
    explicitParents: safeStringRecord(nonEmptyText),
    manifestPaths: z.array(pathText),
    orphanPolicy: z.enum(["root", "error"]),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(policy.strategies, context, "Hierarchy strategies");
    addDuplicateIssues(policy.indexDocuments, context, "Index documents");
    addDuplicateIssues(policy.manifestPaths, context, "Manifest paths");
  });

const orderingPolicySchema = z
  .object({
    comparators: z.array(
      z.enum([
        "explicit-order",
        "manifest-order",
        "chapter-section",
        "natural-path",
        "lexical-path",
        "source-discovery-order",
      ]),
    ),
    locale: nonEmptyText.optional(),
    numeric: z.boolean(),
    caseSensitivity: z.enum(["sensitive", "insensitive"]),
    missingValuePolicy: z.enum(["first", "last", "error"]),
    tiePolicy: z.enum(["path", "source-id", "error"]),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(policy.comparators, context, "Ordering comparators");
  });

const routePrefix = nonEmptyText
  .startsWith("/", "Route prefixes must be absolute URL paths.")
  .refine((value) => !value.includes("\\") && !value.includes("//"), {
    message: "Route prefixes must use single forward slashes.",
  });

const routePolicySchema = z
  .object({
    routePrefix,
    explicitRoutes: safeStringRecord(routePrefix),
    localePrefix: nonEmptyText.optional(),
    volumePrefix: nonEmptyText.optional(),
    versionPrefix: nonEmptyText.optional(),
    lowercase: z.boolean(),
    trailingSlash: z.boolean(),
    reservedRoutes: z.array(routePrefix),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(policy.reservedRoutes, context, "Reserved routes");
  });

const assetPolicySchema = z
  .object({
    extensions: safeExtensionRecord(nonEmptyText),
    required: z.boolean(),
    outputPrefix: routePrefix,
    copyOriginals: z.boolean(),
  })
  .strict();

const linkPolicySchema = z
  .object({
    validateInternal: z.boolean(),
    failOnBroken: z.boolean(),
    caseSensitivity: z.enum(["sensitive", "insensitive"]),
    allowedProtocols: z.array(nonEmptyText.regex(PROTOCOL_PATTERN)),
    invalidTraversal: z.enum(["error", "preserve"]),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(policy.allowedProtocols, context, "Allowed protocols");
  });

const renderingPolicySchema = z
  .object({
    rawHtml: z.enum(["escape", "sanitize", "reject"]),
    unknownNodes: z.enum(["source", "quarantine", "reject"]),
    syntaxHighlighting: z.boolean(),
    lightCodeTheme: nonEmptyText,
    darkCodeTheme: nonEmptyText,
    math: z.boolean(),
    diagrams: z.enum(["source", "isolated", "disabled"]),
  })
  .strict();

const searchPolicySchema = z
  .object({
    enabled: z.boolean(),
    fields: z.array(z.enum(["title", "heading", "body", "code", "metadata"])),
    chunkRecordLimit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    minimumTokenLength: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  })
  .strict()
  .superRefine((policy, context) => {
    addDuplicateIssues(policy.fields, context, "Search fields");
  });

const validationPolicySchema = z
  .object({
    failOn: z.enum(["error", "fatal"]),
    duplicateExplicitHeadingId: z.enum(["error", "hash-suffix"]),
    unsupportedSyntax: z.enum(["warning", "error"]),
    allowRemoveTransforms: z.boolean(),
    maxSourceBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const canonicalTimestamp = nonEmptyText.refine((value) => {
  const milliseconds = Date.parse(value);
  return (
    Number.isFinite(milliseconds) &&
    new Date(milliseconds).toISOString() === value
  );
}, "Reproducible timestamps must use canonical ISO-8601 UTC form.");

const outputPolicySchema = z
  .object({
    directory: pathText,
    publicDirectory: pathText,
    reproducibleTimestamp: canonicalTimestamp,
    emitSourceCopies: z.boolean(),
    emitPrettyJson: z.boolean(),
  })
  .strict();

const discoveryPolicySchema = z
  .object({
    symbolicLinks: z.enum(["ignore", "follow-files", "follow-all"]),
    hiddenFiles: z.enum(["exclude", "include"]),
    caseSensitivity: z.enum(["sensitive", "insensitive"]),
    sourceIdStrategy: z.enum(["path", "content"]),
  })
  .strict();

export const BookCompilerConfigSchema = z
  .object({
    corpusId: identifier,
    contentRoots: z.array(contentRootSchema).min(1),
    include: z.array(globText),
    exclude: z.array(globText),
    discoveryPolicy: discoveryPolicySchema,
    parserPolicy: parserPolicySchema,
    metadataPolicy: metadataPolicySchema,
    hierarchyPolicy: hierarchyPolicySchema,
    orderingPolicy: orderingPolicySchema,
    routePolicy: routePolicySchema,
    assetPolicy: assetPolicySchema,
    linkPolicy: linkPolicySchema,
    renderingPolicy: renderingPolicySchema,
    searchPolicy: searchPolicySchema,
    validationPolicy: validationPolicySchema,
    outputPolicy: outputPolicySchema,
  })
  .strict()
  .superRefine((config, context) => {
    addDuplicateIssues(config.include, context, "Global include list");
    addDuplicateIssues(config.exclude, context, "Global exclude list");

    const rootIdIndex = new Map<string, number>();
    const rootPathIndex = new Map<string, number>();

    config.contentRoots.forEach((root, index) => {
      const comparableId =
        config.discoveryPolicy.caseSensitivity === "insensitive"
          ? root.id.toLowerCase()
          : root.id;
      const firstIdIndex = rootIdIndex.get(comparableId);
      if (firstIdIndex !== undefined) {
        context.addIssue({
          code: "custom",
          message: `Content-root identifier ${JSON.stringify(root.id)} collides with root index ${firstIdIndex}.`,
          path: ["contentRoots", index, "id"],
          params: { diagnosticCode: DIAGNOSTIC_CODES.CONFIG_DUPLICATE_ROOT_ID },
        });
      } else {
        rootIdIndex.set(comparableId, index);
      }

      const normalizedPath = normalizeRelativePath(root.path);
      const comparablePath =
        config.discoveryPolicy.caseSensitivity === "insensitive"
          ? normalizedPath.toLowerCase()
          : normalizedPath;
      const firstPathIndex = rootPathIndex.get(comparablePath);
      if (firstPathIndex !== undefined) {
        context.addIssue({
          code: "custom",
          message: `Content-root path ${JSON.stringify(root.path)} duplicates root index ${firstPathIndex}.`,
          path: ["contentRoots", index, "path"],
          params: {
            diagnosticCode: DIAGNOSTIC_CODES.CONFIG_DUPLICATE_ROOT_PATH,
          },
        });
      } else {
        rootPathIndex.set(comparablePath, index);
      }
    });

    const documentExtensions = new Map<string, string>();
    for (const extensionKey of Object.keys(
      config.parserPolicy.extensionAdapters,
    )) {
      const comparable =
        config.discoveryPolicy.caseSensitivity === "insensitive"
          ? extensionKey.toLowerCase()
          : extensionKey;
      documentExtensions.set(comparable, extensionKey);
    }

    for (const assetExtension of Object.keys(config.assetPolicy.extensions)) {
      const comparable =
        config.discoveryPolicy.caseSensitivity === "insensitive"
          ? assetExtension.toLowerCase()
          : assetExtension;
      const documentExtension = documentExtensions.get(comparable);
      if (documentExtension !== undefined) {
        context.addIssue({
          code: "custom",
          message: `Extension ${JSON.stringify(assetExtension)} is ambiguous because it is also registered as document extension ${JSON.stringify(documentExtension)}.`,
          path: ["assetPolicy", "extensions", assetExtension],
          params: {
            diagnosticCode: DIAGNOSTIC_CODES.CONFIG_AMBIGUOUS_EXTENSION,
          },
        });
      }
    }
  });

export type BookCompilerConfigSchemaInput = z.input<
  typeof BookCompilerConfigSchema
>;
export type BookCompilerConfigSchemaOutput = z.output<
  typeof BookCompilerConfigSchema
>;

// Zod models an optional key as `key?: T | undefined`; the public contract uses
// exact optional properties (`key?: T`). Runtime parsing strips absent keys, so
// config.ts performs the single audited boundary cast after successful parsing.
const CONFIG_SCHEMA_TARGET_CHECK: z.ZodType = BookCompilerConfigSchema;
void CONFIG_SCHEMA_TARGET_CHECK;
