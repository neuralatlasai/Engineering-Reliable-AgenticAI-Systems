# Diagnostics and observability

## Diagnostic contract

Compiler diagnostics are structured values, not free-form log lines. Every diagnostic contains a code, severity, message, and phase, and may include source/node identity, an exact source span, related locations, and remediation.

```text
severity: info | warning | error | fatal
phase:    source | parse | metadata | ast | graph | route
          | link | asset | render | search | output
```

Diagnostics are sorted by phase, source ID, code, descending severity, then message. That makes report ordering independent of traversal completion timing.

`validationPolicy.failOn` selects the compilation threshold:

- `error` fails on `error` or `fatal` and is the repository setting;
- `fatal` permits ordinary non-fatal errors to remain in a successful artifact report and should only be used by a corpus with an explicit release exception policy. Duplicate explicit heading IDs, preservation/data-loss diagnostics, and unauthorized `remove` provenance remain unconditional failures at every threshold.

Warnings are allowed by the current corpus configuration. The CI workflow does not independently reject warnings, so release reviewers must inspect the warning count.

## Output channels

| Channel | Availability | Content and limitation |
| --- | --- | --- |
| Standard error | Failed compiler result or uncaught CLI exception | One line per structured diagnostic for ordinary compilation failures; stack/message only for exceptions outside the result path. |
| Standard output | Successful compile | Document/source count and warning count. |
| `.book-cache/last-run.json` | Written after `compileBook` returns success/failure | Canonical JSON status, total compiler duration in nanoseconds, summary, and diagnostics/counts. Success duration excludes artifact serialization/publication. A configuration-import or artifact-write exception can leave an older file in place. |
| `build/diagnostics.json` | Successful artifact publication only | Versioned envelope with global summary, sorted diagnostics, and per-document diagnostics. A failed build deliberately leaves the prior successful `build/` intact. |
| `build/preservation-report.json` | Successful artifact publication | Per-document structural/content preservation results. |
| `build/transformation-report.json` | Successful artifact publication | Transformation provenance emitted by parsed documents. |
| `build/source-manifest.json` | Successful artifact publication | Source identity, hash, encoding, byte size, BOM/newline metadata, and internal source-copy path. |
| `build/artifact-index.json` | Successful artifact publication | SHA-256 values for every regular file in the managed internal/public trees except the self-referential index file; `compile:verify` also compares the index. |

The internal `build/` reports can reveal authored paths, metadata, targets, and validation messages. They are operational artifacts, not public web assets. Only the intentionally selected files under `public/_book/` should be deployed.

## Stable code registry

`src/compiler/diagnostics.ts` defines an append-only stable public registry for configuration and discovery codes:

| Code | Meaning | Default severity |
| --- | --- | --- |
| `CFG001` | Configuration does not satisfy the strict schema | fatal |
| `CFG002` | Duplicate logical root ID | fatal |
| `CFG003` | Duplicate configured root path | fatal |
| `CFG004` | Prototype-pollution-sensitive record key | fatal |
| `CFG005` | Extension registered as both document and asset | fatal |
| `CFG006` | Invalid include/exclude/encoding glob | fatal |
| `SRC001` | Content root not found | fatal |
| `SRC002` | Content root is not a directory | fatal |
| `SRC003` | Content root cannot be inspected | fatal |
| `SRC004` | Filesystem entry cannot be inspected | fatal |
| `SRC005` | Followed symlink would form a cycle | warning |
| `SRC006` | Symlink excluded by policy | info |
| `SRC007` | Source exceeds the configured byte bound | fatal |
| `SRC008` | Source changed between inspection and bounded read | fatal |
| `SRC009` | Source could not be read completely | fatal |
| `SRC010` | Configured encoding is unsupported | fatal |
| `SRC011` | Bytes are invalid/non-round-trippable in selected encoding | fatal |
| `SRC012` | BOM overrides a conflicting configured encoding | warning |
| `SRC013` | Recognized BOM is unsupported by the source model | fatal |
| `SRC014` | Duplicate physical filesystem object | fatal |
| `SRC015` | Duplicate normalized logical path | fatal |
| `SRC016` | Duplicate source ID | fatal |
| `SRC017` | Case-insensitive logical-path collision | fatal |

Parser, metadata, ordering, graph, route, link, search, and preservation modules also emit descriptive code families such as `PARSER_*`, `GRAPH_*`, `ROUTE_*`, `LINK_*`, `SEARCH_*`, and `PRESERVATION_*`. Those strings are machine-readable and tested in selected paths, but they are not yet consolidated into the append-only documentation registry. Until that migration occurs, consumers must not assume the same formal compatibility guarantee as `CFG*` and `SRC*` codes.

## Failure visibility by stage

The compiler stops publication for these implemented failure classes:

- invalid configuration, glob syntax, roots, encodings, bounded reads, duplicate sources, and source mutation;
- missing/ambiguous parser adapters or unrecoverable parse/byte-map failures;
- invalid typed metadata and duplicate document identifiers;
- invalid comparator policies, graph edges, missing parents, or graph cycles;
- invalid/reserved/colliding canonical, alias, or redirect routes;
- broken, ambiguous, disallowed, or traversal-invalid links according to policy;
- search route/record inconsistencies;
- preservation count reductions, protected content changes, or retained-node reordering.

Artifact shape validation currently covers envelopes and selected route/document/diagnostic/search structures. It is not a complete runtime schema parse of every field in every artifact, so a successful write must not be represented as proof that all future consumer versions can read it.

## Triage procedure

1. Reproduce from a clean working directory with the release Node version and `SOURCE_DATE_EPOCH`.
2. Run `npm run compile:content` directly so compiler output is not hidden by a Next.js build wrapper.
3. If `.book-cache/last-run.json` has `status: "failed"`, sort first by fatal/error severity, then address the earliest pipeline phase. Later-stage messages may be consequences.
4. Use `sourceId`, `nodeId`, and byte/line/column spans rather than searching only by a human title.
5. Follow `related` locations for collisions; never resolve collisions by deleting the final diagnostic or using last-write-wins.
6. Rerun compilation and require a new corpus hash/report. Do not inspect a stale `build/diagnostics.json` after a failed compile.
7. Run `npm run compile:verify`, unit tests, and the selected production build before closing the incident.

Common remediation boundaries:

| Symptom | Correct first action |
| --- | --- |
| `SRC008` source changed during read | Stop concurrent writers and compile from an immutable snapshot. |
| Duplicate path/source/route/heading ID | Rename or configure an explicit unique identity; do not auto-select a winner. |
| Broken internal link | Correct the authored target or add an explicit route/redirect; preserve authored link text. |
| Unsupported syntax warning | Confirm the quarantined source is visible and lossless, then register/implement support or make unsupported syntax an error. |
| Preservation violation | Disable or repair the transform; never lower the failure threshold as a data-loss workaround. |
| Unmarked output directory | Correct `outputPolicy`; move unrelated data outside managed output rather than adding the marker manually. |

## Observability coverage

Implemented compiler observability is deliberately low-content: total compilation duration, corpus/source/document/route/search/artifact counts, corpus hash, severity summary, and detailed structured diagnostics. No source body is sent to a remote telemetry service.

The following production-spec signals are **not implemented** and remain release observability work:

- duration and allocation by compiler phase;
- cache hit rate and incremental rebuild duration;
- heap fragmentation/peak RSS inside the compiler report;
- runtime route/search latency, client exceptions, asset failures, reader-state persistence failures, and Web Vitals;
- a health endpoint, metrics exporter, trace correlation, or alert rules.

Deployment telemetry must not capture source content, search query text, local filesystem paths, or reader annotations without a separately reviewed data policy.
