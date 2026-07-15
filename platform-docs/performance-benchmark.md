# Performance benchmark report

## Result status

No controlled multi-sample release benchmark is recorded for this revision. The repository-corpus observations below are one local release-candidate sample; medium, large, adversarial, Web Vitals, and latency distribution cells remain pending.

A locally generated artifact set records corpus hash `2a46b1dad12af6f0972f8c5c4374b207be33638b86b3e366cda8e0840f5e76dd`, 156 documents, 164 sources, 8 assets, 21,384 search records in 43 chunks, and a 5.018-second aggregate `compileBook` duration. The recorded environment is Node 24.12.0 on Windows x64. This is a single sample rather than a statistically controlled baseline.

The same output occupies 248,346,691 bytes under `build/`, 128,835,905 bytes under `public/_book/`, 403,223,794 bytes under `out/`, and 41,126,243 bytes for the public search index. Because the current browser provider eagerly loads all 43 chunks, the search transfer/memory design requires remediation or an explicitly accepted budget before a large-corpus claim.

The current CI runs formatting, type/lint correctness, 29 tests with whole-compiler coverage floors, complete-tree deterministic compilation, static build, dependency audit, and browser accessibility tests against the packaged static export. It does not yet enforce Web Vitals or regression-based performance budgets.

## Implemented performance architecture

- Markdown parsing, syntax highlighting, KaTeX rendering, graph construction, link validation, and search indexing occur at build time.
- The browser receives typed rendered output and static search records, not parser/highlighter packages or raw source bytes.
- Discovery bounds per-file memory and parallelizes reads with a default worker count capped at 32.
- Candidate, diagnostic, route, graph, and search ordering is deterministic rather than dependent on asynchronous completion.
- Static generation and route-level Next.js chunks are available in both release products.
- Search output is split at a configurable record count, and assets load independently; images use native lazy loading.
- Only interaction surfaces are client components; the document renderer and artifact loading stay server-side/build-time.

## Complexity audit

Let `F` be selected files, `B` selected source bytes, `D` documents, `N` IR/navigation nodes, `R` search records, and `M` matching search records.

| Path | Current bound | Scale implication |
| --- | --- | --- |
| Discovery | Approximately `O(B + F log F)` time and bounded per-file buffers | Total corpus bytes are not globally bounded. |
| Parse/compiler | Documents are parsed sequentially; approximately linear syntax work plus highlighting/math costs | Large code-heavy corpora can dominate wall time; no AST/cache reuse exists. |
| Graph validation/order | Intended near `O(N + E + N log N)` for ordinary trees | Some duplicate checks use array searches; high-degree adversarial graphs require profiling before a strict linear claim. |
| Search compilation | One IR traversal plus deterministic document ordering/token creation | Index size grows with indexed nodes and metadata. |
| Static rendering | At least `O(D)` pages plus serialized content size | No incremental compilation/regeneration path is implemented. |
| Browser search initialization | `O(R)` memory and transfer; all chunks requested in parallel | Chunking controls file size, not total downloaded records. |
| Browser query | `O(R * Q + M log M)` for query token checks and full match sorting | This is not suitable for unbounded indexes; a postings index/top-k selection or hosted provider is required above measured thresholds. |
| Navigation render | `O(N)` DOM/component work | No virtualization or progressive subtree loading is implemented. |

No code path should be advertised for arbitrary 10,000-document production use until the large tier passes and browser search/navigation stay within budget.

## Workload matrix

Benchmark immutable generated fixtures in addition to the live corpus. Every tier must define exact byte count, document/asset/node/search-record counts, content-shape distribution, and seed/hash so results are reproducible.

| Tier | Required shape | Purpose |
| --- | --- | --- |
| Repository | The checked-in configured corpus | Release regression and real-content rendering |
| Medium | At least 1,000 documents with deep/flat hierarchy, code, tables, math, links, and assets | Compiler concurrency, output growth, browser search/navigation |
| Large | At least 10,000 documents and a deliberately high search-record count | Acceptance of the production scale claim and identification of virtualization/provider thresholds |
| Adversarial | Maximum-size documents, wide/high-degree graph, long code, large metadata, duplicate-like paths, and no cache | Worst-case memory/algorithm behavior and failure-budget enforcement |

Generated fixtures are not currently checked into this repository, so medium/large/adversarial results are pending.

## Measurement protocol

Use the exact CI Node/npm version, a clean locked install, fixed `SOURCE_DATE_EPOCH`, local immutable storage, and no concurrent workload. Record CPU model/count, RAM, operating system/filesystem, Node/npm versions, commit, configuration hash, corpus hash, and power mode.

For each workload:

1. Delete only compiler-managed outputs/cache from an isolated benchmark checkout.
2. Run five cold compiler samples and at least ten warm samples; report median, p95, minimum, maximum, standard deviation, peak RSS, CPU time, and bytes read/written.
3. Run `npm run compile:verify` and confirm covered artifact identity.
4. Run both production builds and measure application-build wall/CPU time, peak RSS, output bytes, route count, and per-route/client chunk sizes.
5. Serve the production artifact through the intended deployment stack, not `next dev`.
6. Collect LCP, CLS, INP, hydration/main-thread time, transferred/compressed bytes, navigation latency, search initialization/query latency, and browser memory on throttled desktop and mobile profiles.
7. Repeat searches for empty, no-match, common, and worst-case terms at p50/p95/p99.
8. Capture profiler/flame-graph evidence before changing algorithms; retain raw results with the release artifacts.

The compiler writes `.book-cache/last-run.json.durationNanoseconds`, which measures `compileBook` as one aggregate and excludes artifact writing. It does not provide the required phase timings or peak memory, so an external process profiler is required for the final report.

Example local timing commands:

```powershell
$env:SOURCE_DATE_EPOCH = "0"
Measure-Command { npm run compile:content }
Measure-Command { npm run build:static }
Get-ChildItem -LiteralPath build,out -Recurse -File |
  Measure-Object -Property Length -Sum
```

On Linux, `/usr/bin/time -v npm run compile:content` records wall/CPU time and maximum resident set size. Build logs and profiler output must be stored outside `public/`.

## Initial release budgets

These are explicit initial gates, not measured results. They require product-owner approval and CI implementation before they become enforceable release policy.

| Metric | Initial gate | Status |
| --- | --- | --- |
| Preservation/determinism | Zero preservation violations; complete managed output trees byte-identical across consecutive builds | Passed: zero violations and 441 byte-identical files |
| Compiler failures | Zero error/fatal diagnostics | Passed: 0 errors, 0 fatals, 5 retained-source math warnings |
| LCP | p75 <= 2.5 s on the agreed mobile profile | Not measured/enforced |
| CLS | p75 <= 0.10 | Not measured/enforced |
| INP | p75 <= 200 ms | Not measured/enforced |
| Client navigation | p95 <= 100 ms after route assets are available | Not measured/enforced |
| Search query | p95 <= 100 ms at the approved maximum index tier | Not measured/enforced |
| Search initialization | Must not eagerly transfer the complete large-tier index if it exceeds the approved page-weight budget | Current provider eagerly loads all chunks |
| Initial-route JavaScript | <= 250 KiB gzip, excluding content/assets | Observed 205,327 bytes gzip; CI budget enforcement pending |
| Page horizontal overflow | <= 1 CSS px outside intentional code/table/math scrollers | Passed on desktop and Pixel 7 profiles |
| Compiler memory/time | Baseline plus <= 10% regression on fixed hardware/workload | No baseline or gate yet |
| Static output overhead | Baseline plus <= 10% regression excluding authored original assets | No baseline or gate yet |

## Pending result table

| Metric | Repository | Medium | Large | Adversarial |
| --- | --- | --- | --- | --- |
| Discovery/parse/transform/validation phase time | Pending; no phase telemetry | Pending | Pending | Pending |
| Aggregate compiler wall time and peak RSS | 5.018 s; RSS pending | Pending | Pending | Pending |
| Static build time and peak RSS | 43.0 s command wall time; RSS pending | Pending | Pending | Pending |
| Internal/public/static output bytes | 248,346,691 / 128,835,905 / 403,223,794 | Pending | Pending | Pending |
| Initial-route JavaScript gzip | 205,327 bytes across 10 scripts | Pending | Pending | Pending |
| LCP / CLS / INP | Pending | Pending | Pending | Pending |
| Navigation p50/p95/p99 | Pending | Pending | Pending | Pending |
| Search initialization bytes/time/memory | 41,126,243 uncompressed artifact bytes; time/memory pending | Pending | Pending | Pending |
| Search query p50/p95/p99 | Pending | Pending | Pending | Pending |

## Optimization decision points

- Add phase timers and allocation/RSS sampling before optimizing compiler stages.
- Add content-addressed AST/highlight/search caches only with invalidation and deterministic cache-key tests.
- Replace full-result browser sorting with an indexed provider and bounded top-k selection before the large tier.
- Load search chunks by postings/prefix partition rather than fetching all chunks when the transfer budget is crossed.
- Virtualize or progressively render navigation only after DOM/node and interaction profiling establishes a threshold.
- Generate additive optimized asset variants while retaining originals; do not claim asset optimization from original-copy behavior.
- Add production Web Vitals and route/search timings with privacy-safe aggregation and no source/query capture.
