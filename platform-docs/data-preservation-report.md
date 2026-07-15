# Data-preservation report

## Result summary

| Property | Status |
| --- | --- |
| Original bytes retained during compilation | Implemented |
| Internal byte-for-byte source copies for this repository configuration | Implemented when compilation succeeds |
| Typed-tree loss detection and build failure | Implemented |
| Independent IR-to-source serializer round trip | Not implemented |
| Latest release-candidate corpus preservation report | 156/156 exact; zero violations |
| Full golden-fixture matrix required by the production specification | Partial |

The latest local release-candidate artifact set has corpus hash `2a46b1dad12af6f0972f8c5c4374b207be33638b86b3e366cda8e0840f5e76dd`. It contains 156 document reports, all labelled `exact`, with zero preservation violations and zero removed nodes. Five `PARSER_MATH_RENDER_FAILED` warnings retain the authored equation source as the safe fallback. The independent-serializer limitation below still applies to every `exact` label.

## Preservation mechanisms

### Discovery

Every selected `SourceRecord` retains:

- original `Uint8Array` bytes and SHA-256 content hash;
- configured/detected encoding and decoded text for documents;
- UTF-8/UTF-16 BOM where supported and exact LF/CRLF/CR/mixed newline classification;
- absolute, relative, and normalized paths, extension, media type, root/source identity, byte length, trust level, and physical-path hash.

The decoder rejects invalid sequences and verifies that decoded text re-encodes to the original payload. UTF-32 BOMs are recognized but rejected because the source model does not support them. Reads are bounded and fail if a file changes during materialization.

### Parser and IR

The typed IR retains raw source slices and byte/line/column spans wherever the parser derives a location. In particular:

- root `rawSource` retains the decoded source text;
- front matter retains the complete raw block, delimiters, key order, duplicate entries, unknown fields, values, and entry spans;
- headings retain authored/display text, explicit/effective IDs, and spans;
- code retains raw code separately from display code, fence delimiter, information string, language, and optional highlighting annotation;
- HTML retains original value separately from its escaped/sanitized/rejected disposition;
- equations and diagrams retain authored source separately from rendered annotations;
- links/images retain authored target/identifier separately from resolved/rewritten records;
- list start/check/spread, table alignment, definitions, footnotes, directives, MDX, and unsupported syntax have typed or opaque representations;
- unsupported nodes retain original type, raw source, safe opaque data, children, and a diagnostic;
- metadata source/configured/derived/effective maps remain separate, with conflicts and origin traces.

The parser masks front matter with equal-length whitespace before Markdown parsing so downstream offsets remain aligned to the original text.

### Output

With the repository's `emitSourceCopies: true`, every source is written from the bounded, discovered `rawBytes` to `build/sources/<hash-of-source-id>.bin`. `build/source-manifest.json` records the source hash and source-copy path. Original assets are written from the same retained bytes to `public/_book/assets`; staged publication rehashes source copies and assets before the atomic rename. The asset manifest retains source/output identity and emits no replacement variant.

Document IR, manifests, diagnostics, and reports use versioned envelopes with configuration/corpus hashes and a reproducible timestamp. The browser does not receive `build/sources` through the application by default.

## Loss detector behavior

`verifyPreservation` creates before/after snapshots in iterative linear passes. It compares:

- total, block, inline, and per-node-type counts;
- ordered channels for text, raw code, raw HTML, link targets, image references, footnotes, headings, definitions, directives, equations, Mermaid diagram source, and unsupported nodes;
- stable node fingerprints and relative order for IDs present in both trees;
- exact, newline-normalized, or semantic source equivalence when source and serialized text are supplied.

A reduced count emits `PRESERVATION_COUNT_REDUCTION`; a changed/reordered semantic channel emits `PRESERVATION_CONTENT_CHANGED`; changed retained-node order emits `PRESERVATION_NODE_ORDER_CHANGED`. `compileBook` converts every violation into an error-level output diagnostic, so the repository's `failOn: "error"` policy stops publication.

The algorithm uses maps/sets and ordered scans rather than pairwise node comparison. It is approximately `O(N + C)` time and space for nodes `N` and protected channel content `C`.

## Exact scope of the current result

The production pipeline passes `state.parse.document` as the before tree and `state.document.root` as the after tree. Those roots currently reference the same parsed/enriched immutable tree; links, asset records, metadata, routes, and search records are added outside the root. It also passes the root's retained `rawSource` as both `sourceText` and `serializedText`.

Consequently, an `exact` `byteRoundTripStatus` currently proves that the original decoded root source field remained unchanged through post-parse compilation. It does **not** prove that an independent serializer reconstructed those bytes from the typed node fields. A full `source -> parse -> IR -> serialize -> compare` implementation remains required before claiming general round-trip reconstruction.

Additional current report limitations:

- front matter and metadata live outside the root snapshot and are not compared by the preservation verifier;
- citation records are not a dedicated snapshot channel;
- the artifact index cannot contain its own digest; `compile:verify` separately includes the index in its complete-tree comparison;
- application build output under `.next/` or `out/` is outside the content compiler's complete-tree determinism comparison and is verified by its own production/static build gates;
- not every syntax form in the requested parser/preservation/rendering matrix has a checked-in golden fixture;
- semantic rendering equivalence between IR and browser DOM is not computed;
- unsupported-node preservation starts after configured Unified parsing; disabled or unrecognized dialect syntax can be accepted as ordinary text without an unsupported-node diagnostic;
- normalized convenience fields are not always authored byte slices: code information strings are trimmed and block-math extraction removes one trailing newline, while the containing node's `rawSource` remains available;
- Git canonicalizes repository text files to LF before compilation; the compiler preserves the exact checked-out bytes and records original newline metadata at that boundary;
- security sanitization can intentionally produce an empty rendered HTML annotation while preserving original HTML in the IR; reviewers must distinguish render disposition from source retention.

## Existing automated evidence

The unit suite currently covers:

- exact structural/raw-code preservation, removal/text-change detection, and newline-normalized comparison;
- multi-root stable discovery with original bytes, UTF-8 BOM, mixed newlines, and assets;
- duplicate content-addressed IDs, hard-linked physical duplicates, and invalid UTF-8 rejection;
- duplicate/unknown front matter, raw HTML preservation plus sanitized annotation, reference definitions, directives, code information strings, equations, explicit heading IDs, and byte spans;
- MDX adapter selection/quarantine and stable route/graph behavior in their respective suites.

This is meaningful implementation evidence but not the complete golden suite requested for empty/large/adversarial documents, every extension, all reference forms, full metadata reconstruction, and every renderer node.

## Final verification protocol

Run from a clean immutable checkout with the release Node/npm versions:

```powershell
$env:SOURCE_DATE_EPOCH = "0"
npm ci
npm run typecheck
npm run test
npm run compile:content
npm run compile:verify
```

Then record and verify:

1. the commit, configuration hash, corpus hash, source/document/asset counts, and warning count;
2. zero error/fatal diagnostics in `build/diagnostics.json`;
3. one preservation report per document, zero violations, and zero unauthorized removed nodes;
4. each `build/sources/*.bin` SHA-256 against its corresponding source-manifest `contentHash` and byte length;
5. original copied asset SHA-256/length against the asset/source manifests;
6. every unsupported/quarantined node against the authored source and policy exception register;
7. front-matter raw block/key-order/duplicate/unknown-value retention on representative documents;
8. raw/display separation for code, HTML, equations, and diagrams;
9. the complete recursive byte comparison reported by `compile:verify`, including its generated-file count;
10. representative browser DOM/source traceability and safe fallback rendering.

### Final verification record

| Field | Result |
| --- | --- |
| Revision | Pre-push release candidate, 2026-07-15 |
| Configuration hash | `f0d79a27e96cce39cc737c9a00045cfc9bbb93b1947683f0fdae1d4ce27befb2` |
| Corpus hash | `2a46b1dad12af6f0972f8c5c4374b207be33638b86b3e366cda8e0840f5e76dd` |
| Sources / documents / assets | 164 / 156 / 8 |
| Preservation reports reviewed | 156; all `exact` |
| Total violations / removed nodes | 0 / 0 |
| Source-copy hash comparison | Passed for all 164 staged source copies |
| Asset-copy hash comparison | Passed for all 8 staged public assets |
| Consecutive full-output comparison | Passed; 441 files byte-identical |
| Reviewer and date | Automated release gates, 2026-07-15 |

Until this record is complete, the defensible guarantee is that the implementation contains explicit source-retention and loss-detection mechanisms. It is not a claim that the current corpus or every supported syntax has completed final preservation verification.
