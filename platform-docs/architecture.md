# Platform architecture

## Status and scope

This document describes the implementation in this repository. It uses the following status terms:

- **Implemented** means a code path and automated test or build contract exists in the repository.
- **Host responsibility** means the compiler or application emits enough information for a deployment system, but does not perform the deployment action.
- **Pending verification** means the capability or result must not be treated as a release guarantee until the stated check is executed in the release environment.
- **Not implemented** means the configuration type or production specification names a capability that the current execution path does not yet provide.

The system is a build-time Markdown corpus compiler plus a Next.js reader. The compiler is independent of React and browser APIs. The reader consumes versioned JSON artifacts; it does not parse Markdown in the browser or on each request.

## System context

```text
configured local content roots
        |
        v
strict configuration validation
        |
        v
bounded recursive discovery -> byte-preserving SourceRecord registry
        |
        v
configured Remark parser adapters -> typed, versioned IR + source spans
        |
        +-> metadata resolution + derivation traces
        +-> deterministic routes
        +-> content graph + primary navigation
        +-> source-relative link and asset resolution
        +-> provenance-bearing search records
        +-> preservation checks + structured diagnostics
        |
        v
atomically published build/ and public/_book/ artifacts
        |
        +-> Next.js server/static generation reads build/ artifacts
        +-> browser fetches public search chunks and copied assets
        +-> browser stores non-source reader preferences in localStorage
```

## Compiler pipeline

| Stage | Implementation | Enforced behavior |
| --- | --- | --- |
| Configuration | `src/compiler/config.ts`, `config-schema.ts` | Applies deterministic defaults, validates a strict Zod schema, rejects unknown keys and unsafe record keys, and hashes canonical JSON. |
| Discovery | `src/compiler/discovery.ts` | Traverses one or more roots, applies root-relative glob policies, bounds reads, detects source changes and duplicate physical/logical sources, records bytes/BOM/encoding/newlines, and returns canonical root/path order. |
| Parsing | `src/compiler/parser.ts`, `front-matter.ts`, `byte-offsets.ts` | Selects an adapter from configured extension/dialect policy, constructs typed nodes with raw source slices and byte spans, preserves unknown nodes, quarantines MDX, and adds build-time math/highlighting annotations. |
| Metadata | `src/compiler/metadata.ts` | Keeps authored metadata separate from derived/effective values and records origin, conflicts, and derivation evidence. |
| Routes | `src/compiler/routes.ts` | Produces normalized canonical routes, aliases, redirects, and derivation traces; collisions and reserved routes fail instead of using last-write-wins. |
| Graph and ordering | `src/compiler/graph.ts`, `ordering.ts` | Constructs deterministic graph/navigation records, validates parent/child consistency and cycles, and applies an explicit comparator chain and tie policy. |
| Links and assets | `src/compiler/links.ts`, `asset-path.ts` | Resolves source-relative internal references, validates protocols/fragments/traversal, retains authored targets, and records copied-original asset locations. |
| Search | `src/compiler/search.ts` | Emits per-field, per-node records with source provenance and deterministic IDs; output is split into record-count-bounded chunks. |
| Preservation | `src/compiler/preservation.ts` | Compares typed-tree counts, semantic channels, fingerprints, and retained-node order; reductions or changed protected channels become build errors. |
| Output | `src/compiler/artifacts.ts` | Wraps JSON in versioned envelopes, validates selected artifact shapes, writes staging directories, then publishes managed directories by rename with per-directory rollback. |

The orchestrator in `src/compiler/compiler.ts` returns a discriminated `CompilerResult`. It stops at failed stages, sorts diagnostics deterministically, and does not publish new artifacts after a compilation failure.

## Intermediate representation and provenance

`src/compiler/model.ts` defines the public compiler contract:

- `SourceRecord` retains original bytes and source identity during compilation.
- `CompiledDocument` is versioned by `IR_VERSION` and uses a discriminated `DocumentNode` union.
- Every parseable node carries `rawSource`; every derivable location carries a byte/line/column `SourceSpan`.
- Front matter retains raw text, key order, duplicate entries, unknown values, and entry spans.
- Raw and rendered forms are separate for code, HTML, and mathematics.
- `ResolvedValue` records `source`, `configuration`, `derived`, `defaulted`, or `generated` origin and a derivation trace.
- `ProvenanceRecord` describes parser annotations without mutating the authored raw representation.

The current renderer is an exhaustive switch over the discriminated union. This gives compile-time exhaustiveness, but it is not yet a separately injectable renderer registry. Parser adapters have a registry abstraction; the production compiler currently instantiates the built-in Remark adapter for configured dialect identifiers.

## Artifact boundary

The compiler publishes the following internal artifacts under `build/`:

- corpus, source, document, graph, navigation, route, redirect, heading, link, citation, and asset manifests;
- chunked search index and its manifest;
- diagnostics, preservation, and transformation reports;
- build metadata, selected JSON Schemas, per-document IR artifacts, optional original source copies, and an artifact hash index.

Each JSON artifact is an envelope containing schema/compiler/IR compatibility versions, configuration hash, corpus hash, and configured reproducible timestamp. `artifact-index.json` hashes every regular file in the managed internal and public output trees, including markers, JSON, schemas, source copies, copied assets, and public search files. It excludes only `artifact-index.json` itself because embedding that file's own digest would be self-referential. The complete-tree verifier independently hashes and compares the index file as well.

`public/_book/` contains only browser-facing material: the book/search manifests, search chunks, and copied original assets. Raw source copies remain under `build/` and are not published by Next.js unless a deployment operator separately exposes that directory.

The two managed output directories are individually staged and renamed. The operation is not a single transaction across both directories; a filesystem or process failure between the two publications can leave their versions mismatched. Production deployment must build from an immutable workspace and publish the complete application output atomically.

## Runtime architecture

Server components in `src/runtime/artifacts.ts` read `build/` artifacts through a path-confined loader. React caching avoids repeated reads within the server render lifecycle. Next.js generates only canonical content routes, with `dynamicParams = false`; the root route is explicitly configured.

The application route implementation is currently hard-coded to `/read/[...slug]` and filters static parameters to `/read/` routes. A configuration that selects another route prefix or an explicit canonical route outside `/` and `/read/**` can compile successfully but will not automatically gain a Next.js page. General route-policy serving is therefore not an implemented guarantee.

Client components are limited to interaction state:

- search loads static chunks through the `SearchProvider` interface;
- dialogs use Radix primitives for focus management;
- theme preference is delegated to `next-themes`;
- bookmark/completion state uses a versioned, corpus-scoped `localStorage` envelope.

Reader state never writes into source files or compiled artifacts. Alias and redirect records are emitted, but static hosts must materialize redirect rules; aliases are not independently generated as static pages.

## Determinism model

Implemented determinism controls include canonical source ordering, explicit comparator chains, stable content/path-derived identifiers, canonical JSON hashing, a configured timestamp, exact dependency versions, a lockfile, and a Next.js build ID derived from `artifact-index.json`.

`npm run compile:verify` compiles twice, recursively hashes both managed output trees after each compile, verifies the index has neither omitted nor added a generated file, and compares every output digest, including the index file itself. Cross-operating-system byte identity is not claimed because `build-metadata.json` intentionally records Node, platform, and architecture; the invariant is identical inputs in an identical build environment. `.gitattributes` supplies a canonical LF repository boundary for text and binary treatment for media so Git checkout behavior is explicit.

## Complexity and scale characteristics

- Discovery reads each selected byte once, uses bounded parallel file reads, and sorts candidates, giving approximately `O(B + F log F)` work for selected bytes `B` and files `F`.
- Parsing is currently sequential by document and is approximately linear in authored syntax size plus syntax-highlighting cost.
- Compiler search construction walks IR nodes once and sorts documents deterministically.
- Browser search currently loads all records and sorts every matching result, requiring `O(R)` memory and `O(R + M log M)` query work for records `R` and matches `M`.
- Navigation currently renders the complete navigation tree; virtualization and incremental compiler/cache layers are not implemented.

The last two points prevent an evidence-backed claim of usability for arbitrary thousands-of-document corpora until the workload matrix in `performance-benchmark.md` passes.

## Responsibility and gap matrix

| Capability | Current status | Boundary |
| --- | --- | --- |
| Recursive multi-root discovery and stable ordering | Implemented | Compiler |
| Original-byte retention and optional internal source copies | Implemented | Compiler; host must keep `build/` private |
| Full typed-IR-to-source serializer round trip | Not implemented | Current preservation result verifies retained raw source and tree invariants, not independent reconstruction |
| Route/link/graph/search validation | Implemented for the current pipeline | Compiler |
| Arbitrary configured route-prefix serving | Not implemented | Reader currently serves `/` and `/read/**` only |
| Manifest-file hierarchy ingestion | Not implemented | `manifestPaths` validates as configuration but is not loaded by `compileBook` |
| Trust-level-specific policy enforcement | Not implemented | Trust level is recorded; global rendering/link policy is enforced |
| Original asset copying | Implemented | Compiler |
| Asset variants/optimization | Not implemented | Asset manifest currently emits an empty variants array |
| Citation bibliography/backlink resolution | Partial | Citation records are emitted; references/backlinks are placeholders |
| Complete artifact runtime schemas | Partial | Envelope and selected manifests are validated; several nested payloads remain `unknown` |
| End-to-end rendered-node source-map artifact | Partial | Parse nodes retain spans and `ParseResult` has a map; `CompiledDocument` does not publish that map as a separate chain |
| Directive schema/renderer/child-policy registry | Not implemented in production path | Parser records directive shape/security label; the current compiler registers no directive definitions |
| Server/static Next.js packaging | Implemented | Application build |
| Edge, incremental, and offline-package adapters | Pending/not implemented | Deployment packaging |
| TLS, HSTS, WAF, CDN, redirects, immutable release/rollback | Host responsibility | Deployment platform |
| Runtime telemetry and phase-level compiler metrics | Not implemented | Release observability |
| Accessibility/performance conformance | Pending verification | See dedicated audit reports |
