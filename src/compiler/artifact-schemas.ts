import { z } from "zod";

export const ArtifactEnvelopeSchema = z.object({
  schemaVersion: z.string().min(1),
  compilerVersion: z.string().min(1),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/u),
  inputCorpusHash: z.string().regex(/^[a-f0-9]{64}$/u),
  generatedAt: z.iso.datetime({ offset: true }),
  compatibility: z.object({
    minimumCompilerVersion: z.string().min(1),
    irVersion: z.string().min(1),
  }),
  data: z.unknown(),
});

export const RouteManifestDataSchema = z.object({
  routes: z.array(
    z.object({
      documentId: z.string().min(1),
      canonicalRoute: z.string().startsWith("/"),
      aliases: z.array(z.string().startsWith("/")),
      redirectsFrom: z.array(z.string().startsWith("/")),
      origin: z.enum([
        "source",
        "configuration",
        "derived",
        "defaulted",
        "generated",
      ]),
      derivationTrace: z.array(z.unknown()),
    }),
  ),
  byCanonicalRoute: z.record(z.string(), z.string()),
  byAnyRoute: z.record(z.string(), z.string()),
});

export const DocumentManifestDataSchema = z.object({
  corpusId: z.string().min(1),
  corpusVersion: z.string().regex(/^[a-f0-9]{64}$/u),
  documents: z.array(z.unknown()),
  byRoute: z.record(z.string(), z.string()),
  byDocumentId: z.record(z.string(), z.unknown()),
});

export const DiagnosticReportDataSchema = z.object({
  summary: z.object({
    info: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    fatal: z.number().int().nonnegative(),
  }),
  diagnostics: z.array(z.unknown()),
  byDocumentId: z.record(z.string(), z.array(z.unknown())),
});

export const SearchIndexDataSchema = z.object({
  recordCount: z.number().int().nonnegative(),
  chunks: z.array(
    z.object({
      path: z.string().min(1),
      recordCount: z.number().int().nonnegative(),
    }),
  ),
});

const projectRelativeArtifactPath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value
        .split("/")
        .some(
          (segment) => segment === "" || segment === "." || segment === "..",
        ),
    "Artifact paths must be normalized, project-relative POSIX paths.",
  );

export const ArtifactIndexDataSchema = z
  .object({
    hashAlgorithm: z.literal("sha256"),
    pathBase: z.literal("project-root"),
    roots: z
      .object({
        internal: projectRelativeArtifactPath,
        public: projectRelativeArtifactPath,
      })
      .strict(),
    unindexedSelfPath: projectRelativeArtifactPath,
    artifacts: z.record(
      projectRelativeArtifactPath,
      z.string().regex(/^[a-f0-9]{64}$/u),
    ),
  })
  .strict();

export function artifactJsonSchemas(): Readonly<Record<string, object>> {
  return {
    "artifact-index.schema.json": z.toJSONSchema(ArtifactIndexDataSchema),
    "artifact-envelope.schema.json": z.toJSONSchema(ArtifactEnvelopeSchema),
    "diagnostics.schema.json": z.toJSONSchema(DiagnosticReportDataSchema),
    "document-manifest.schema.json": z.toJSONSchema(DocumentManifestDataSchema),
    "route-manifest.schema.json": z.toJSONSchema(RouteManifestDataSchema),
    "search-index.schema.json": z.toJSONSchema(SearchIndexDataSchema),
  };
}
