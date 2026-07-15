# Compiler configuration

## Configuration boundary

The CLI loads a TypeScript module, using `book.config.ts` by default:

```powershell
npm run compile:content
npx --no-install tsx src/compiler/cli.ts --config path/to/book.config.ts
```

The module's default export is treated as untrusted input and validated against the strict `BookCompilerConfigSchema`. `defineBookConfig` supplies defaults and TypeScript inference; it does not replace runtime validation.

All paths are resolved from the project working directory used to invoke the compiler. Content matching uses normalized root-relative paths with `/` separators.

## Merge semantics

`defineBookConfig` performs a shallow merge at each top-level policy. Supplying a nested record or array replaces that default member; it is not recursively merged. For example, a supplied `parserPolicy.extensionAdapters` replaces the complete default extension map.

For each content root:

- `contentRoots[].include`, when present, replaces the global `include` list for that root;
- `contentRoots[].exclude` is appended to the global `exclude` list;
- excludes win over includes;
- patterns use micromatch semantics and are evaluated against the normalized path relative to that root.

An explicitly included extension registered in `parserPolicy.extensionAdapters` is a document. A registered asset extension is an asset. An explicitly included but otherwise unregistered extension is treated as a `text/plain` document and sent to `parserPolicy.defaultAdapter`; it is not inferred to be an asset.

## Policy reference

| Policy | Purpose | Important behavior |
| --- | --- | --- |
| `contentRoots`, `include`, `exclude` | Corpus selection | Supports multiple roots and root overrides; root IDs participate in deterministic identity and ordering. |
| `discoveryPolicy` | Filesystem semantics | Configures symbolic links, hidden entries, path case comparison, and path- or content-addressed source IDs. Content-addressed identical files collide by design and fail. |
| `parserPolicy` | Adapter/dialect/encoding selection | Maps extensions to adapter IDs, declares GFM/math/directive/MDX capabilities, encoding overrides, and exact front-matter delimiters. |
| `metadataPolicy` | Authored and derived metadata | Configures field aliases, deterministic precedence, and strict type diagnostics without overwriting the source record. |
| `hierarchyPolicy` | Primary navigation parents | Applies the ordered strategy chain and orphan policy. Configured explicit parents and filesystem/flat placement execute today. Manifest paths and index-document semantics are schema fields but are not yet consumed by the production orchestration path. |
| `orderingPolicy` | Stable child order | Applies an explicit comparator chain, numeric/case behavior, missing-value policy, and deterministic/error tie handling. Manifest and chapter-section comparators only act when those values are supplied by a caller; the current CLI does not ingest them. |
| `routePolicy` | Canonical URL generation | Supports configured paths, metadata routes/slugs, optional locale/volume/version prefixes, case/trailing-slash normalization, and reserved-route/collision failure. |
| `assetPolicy` | Asset classification and publication | Maps extensions to media types and optionally copies originals. `required` is validated but is not currently used as a separate missing-asset gate; link policy controls broken-reference failure. |
| `linkPolicy` | Link validation | Controls internal validation, broken-link severity, case rules, allowed protocols, and invalid traversal handling. |
| `renderingPolicy` | Safe render annotations | Controls raw HTML disposition, unsupported-node severity/disposition, highlighting, themes, and math. `diagrams` is validated but is not consulted by the current compiler/renderer; Mermaid remains source code. Security decisions are global; `trustLevel` does not yet select a different policy. |
| `searchPolicy` | Static search generation | Enables per-field records, deterministic tokenization, minimum token length, and records per public chunk. |
| `validationPolicy` | Build failure policy | Chooses error/fatal threshold, duplicate heading behavior, unsupported syntax severity, and maximum source bytes. `allowRemoveTransforms` is reserved by the schema and is not currently consulted because the compiler emits no remove transform. |
| `outputPolicy` | Artifact publication | Sets managed internal/public directories, canonical timestamp, source-copy emission, and JSON formatting. |

## Validation invariants

The runtime schema enforces these boundary rules before discovery:

- unknown object keys are rejected;
- corpus/root/adapter identifiers use a portable ASCII identifier grammar;
- extension keys begin with `.` and use portable characters;
- paths and globs are non-empty, NUL-free, and have no leading/trailing whitespace;
- record keys `__proto__`, `constructor`, and `prototype` are prohibited;
- duplicate policy entries, root IDs, and root paths are rejected;
- an extension cannot be both a document extension and asset extension under the configured case policy;
- route prefixes are absolute forward-slash paths without duplicate slashes;
- counts and byte limits are positive safe integers;
- `outputPolicy.reproducibleTimestamp` is a canonical ISO-8601 UTC timestamp.

Glob syntax is additionally compiled before traversal. An invalid pattern produces `CFG006` and stops discovery.

## Repository profile

The checked-in `book.config.ts` is the source of truth for this corpus. Its effective profile is:

- one reviewed root at the repository root;
- `README.md`, `Part-*/**/*.md`, selected Knowledge Source Markdown, and PDFs included;
- generated, dependency, test, documentation, and VCS paths excluded;
- symbolic links and hidden files excluded; case-sensitive path semantics; path-derived source IDs;
- GFM, math, and directives enabled for `.md`; MDX parsing enabled only for `.mdx`;
- YAML, TOML, and explicitly delimited JSON front matter;
- source metadata precedence followed by configuration, derived, defaulted, and generated values;
- explicit-parent, configuration, then filesystem hierarchy;
- explicit order, natural path, then lexical path ordering with path tie-breaks;
- `/read` path-derived routes and an explicit `/` route for `README.md`;
- internal link validation with broken links failing the build;
- sanitized raw HTML, quarantined unknown nodes, build-time highlighting/math, and source-only diagrams;
- 500 search records per chunk;
- error-level build failure, warning-level unsupported syntax, 64 MiB per-source bound;
- internal source copies and copied original assets enabled.

PDF files in the current include set are classified as assets, not parsed documents.

## Environment variables

| Variable | Consumer | Semantics |
| --- | --- | --- |
| `SOURCE_DATE_EPOCH` | `book.config.ts` | Integer seconds since Unix epoch used to construct the canonical artifact timestamp. Omit for the fixed epoch default. Use a valid base-10 integer; invalid input fails while importing configuration. |
| `BOOK_DEPLOYMENT=static` | `next.config.ts` | Selects Next.js static export and trailing-slash routing. Any other value selects standalone output. This does not alter compiler semantics. |
| `CI` | Playwright | Forbids focused tests, enables retries, and prevents reuse of an existing development server. |

The quality workflow fixes `SOURCE_DATE_EPOCH=0` and disables Next telemetry. No secrets are required by the current compiler or reader.

## Safe configuration change procedure

1. Modify only explicit policy values; do not rely on filesystem traversal order or locale defaults.
2. Run `npm run typecheck` and the configuration/compiler tests.
3. Run `npm run compile:content` and inspect `.book-cache/last-run.json` plus `build/diagnostics.json`.
4. Review route, redirect, source, asset, and preservation manifests for the affected corpus.
5. Run `npm run compile:verify` in the same environment used for release.
6. Run both the selected application build and end-to-end suite before promotion.

Changing source-ID strategy, route normalization, metadata ID fields, hierarchy, or ordering can invalidate external URLs or reader state. Treat those changes as schema/data migrations even when they pass validation.
