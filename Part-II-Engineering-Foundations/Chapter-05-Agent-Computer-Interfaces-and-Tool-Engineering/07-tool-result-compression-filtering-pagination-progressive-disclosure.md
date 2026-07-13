# Topic 7 — Tool-Result Compression, Filtering, Pagination, and Progressive Disclosure

## 1. Problem and objective

A tool can execute correctly and still degrade the agent by returning too much, too little, or the wrong representation of its result. Large outputs consume context and attention; aggressive summaries can remove the evidence needed for a later decision. Silent truncation is worse: it makes an incomplete view look complete.

The objective is to transform a raw result into a bounded, typed, provenance-bearing observation that preserves task-relevant evidence and gives the agent an explicit path to retrieve more. Result shaping is therefore part of the tool contract $\Sigma_u^{\mathrm{out}}$, not a presentation cleanup performed after the fact.

## 2. Intuition: return a navigable evidence view

Suppose a log query matches one million lines. Returning all lines is unusable; returning “several errors occurred” destroys the evidence. The useful interface returns a ranked, bounded slice, the surrounding context needed to interpret it, a count or lower bound, a stable cursor, and instructions for the next refinement.

The desired path is

$$
R_{\mathrm{raw}}
\longrightarrow \text{filter and rank}
\longrightarrow \text{bounded evidence page}
\longrightarrow \text{targeted expansion}.
$$

The agent sees a view, not the underlying collection. A correct view declares its scope and incompleteness.

## 3. Formal model and rigorous analysis

Let $R=\{x_1,\ldots,x_N\}$ be the raw result collection and $q$ the task-conditioned information need. A result shaper $F$ produces an envelope

$$
E
\mathrel{=}
F(R,q,b,p)
\mathrel{=}
(I,\zeta,\nu,\gamma,\sigma_E,\epsilon),
$$

where $b$ is a context budget, $p$ is a paging policy, $I=(i_1,\ldots,i_k)$ is the ordered returned-item sequence, $\zeta$ a continuation cursor, $\nu$ a completeness descriptor, $\gamma$ provenance and freshness metadata, $\sigma_E$ envelope/schema metadata, and $\epsilon$ typed warnings or errors.

The hard budget invariant is

$$
B(E) \le b,
$$

where $B$ measures the actual serialized token or byte footprint at the model boundary. Byte limits alone are insufficient when the constrained resource is model context.

### 3.1 Evidence coverage and compression

Let $G(q,R)$ be the set of evidence items required to answer $q$ correctly. The evidence recall of a returned view is

$$
\operatorname{Recall}_{E}
\mathrel{=}
\frac{|\operatorname{set}(I)\cap G(q,R)|}{|G(q,R)|},
$$

when $G$ is observable in an evaluation dataset. The compression ratio is

$$
\operatorname{CR}
\mathrel{=}
\frac{B(R)}{\max(1,B(E))}.
$$

A large $\operatorname{CR}$ is not intrinsically good: an empty response compresses perfectly and answers nothing. The design problem is constrained evidence preservation:

$$
\max_F\;
\mathbb E\!\left[U(I,q)-\lambda_H H(F,R,q)\right]
\quad
\text{subject to}
\quad
B(E)\le b,
$$

where $U$ measures downstream utility and $H$ penalizes unsupported, distorted, or unverifiable transformations. For extractive filtering, $H$ can often be made zero with respect to item content; for generative summaries, it must be measured because the transform can introduce claims.

### 3.2 Filtering, range selection, and ranking

Filtering removes items that violate explicit predicates such as time range, tenant, severity, resource type, or access scope. It should occur as close to the authoritative data source as practical:

$$
R_f
\mathrel{=}
\{x\in R : P_{\mathrm{auth}}(x,c)=1 \land P_q(x)=1\}.
$$

Authorization filtering precedes relevance filtering. Otherwise, even counts, ranks, or summaries can leak the existence of unauthorized records.

Ranking then orders authorized candidates by a documented score $s(x,q)$. If the score is learned or approximate, the interface should not imply exhaustive correctness. Range selection is preferable to free-form truncation for ordered data because it states exactly which interval was observed.

### 3.3 Pagination semantics

Offset pagination is simple but unstable under concurrent insertions and deletions. Cursor pagination should bind the continuation to an ordering key, filters, access scope, and preferably a snapshot version:

$$
\zeta
\mathrel{=}
\operatorname{MAC}_{K}
(\text{last key},\text{query hash},\text{scope hash},\text{snapshot},\text{expiry}).
$$

The message authentication code makes client-side cursor tampering detectable; it does not encrypt sensitive cursor contents. Use an opaque server-side handle or authenticated encryption when disclosure itself is a risk.

For a fixed snapshot and total order, pages should be disjoint and composable:

$$
\operatorname{set}(I_i) \cap \operatorname{set}(I_j) = \varnothing \quad (i\ne j),
\qquad
\bigcup_{i=1}^{m}\operatorname{set}(I_i) = R_f
$$

after all $m$ pages are consumed. If the backend cannot provide a stable snapshot, the contract must state weaker semantics such as “best-effort continuation over a changing collection.”

### 3.4 Progressive disclosure

Progressive disclosure exposes increasing detail through explicit levels:

$$
E^{(0)} \subseteq_{\mathrm{info}} E^{(1)} \subseteq_{\mathrm{info}} \cdots \subseteq_{\mathrm{info}} E^{(K)}.
$$

The relation $\subseteq_{\mathrm{info}}$ means later levels preserve identifiers and claims needed to relate them to earlier levels; it does not require literal set inclusion. A practical sequence is:

1. counts, facets, and high-signal snippets;
2. selected records with semantic identifiers;
3. full fields or surrounding ranges;
4. raw artifact or resource link.

MCP supports structured content, resource links, embedded resources, and optional output schemas [MCP]. These mechanisms can represent progressive views, but the application still owns relevance, authorization, and completeness semantics.

## 4. Design methodology

### 4.1 Define the evidence contract before the format

For each operation, specify:

- which fields are required for interpretation and downstream calls;
- which fields are optional detail;
- the ordering and snapshot semantics;
- maximum page size and maximum serialized budget;
- how truncation, filtering, and partial failure are represented;
- how the next page, item detail, or raw artifact is retrieved;
- which provenance and freshness fields accompany every result.

Anthropic recommends pagination, range selection, filtering, or truncation with sensible defaults for potentially large tool outputs [ATE]. The same source's concise-versus-detailed example is useful evidence that result format can materially change token use, but its measured ratios are example-specific rather than universal.

### 4.2 Shape a bounded page

```text
INPUT: authenticated context c, query q, page request p, budget b
OUTPUT: typed result envelope E

1. Validate q, p, b, and the requested response format.
2. Compile authorization predicates from c; never accept them from the model.
3. Decode and verify the cursor, or create a new snapshot descriptor.
4. Push authorization and exact filters into the data source.
5. Fetch at most page_size + 1 ordered records.
6. Project required fields and compute evidence-preserving snippets.
7. Project each record and compute its serialized size before appending it.
8. If one record exceeds the per-item budget, return a typed oversize stub with
   semantic identifier, size, and an authorized resource/range handle, or reject
   when no safe drill-down representation exists.
9. Append only complete items while the envelope remains within b.
10. If more authorized data exists, issue an opaque continuation cursor.
11. Set completeness to complete, paginated, truncated, or partial_failure.
12. Attach source, snapshot/freshness, schema version, and actionable warnings.
13. Validate E against the output schema before returning it.
```

Let $C_p$, $C_h$, $C_z$, $C_s$, and $C_{\mathrm{cmp}}$ denote per-record projection, snippet construction, serialization, score, and comparison costs. With an indexed predicate and cursor seek, one page is commonly $O(\log N+k(C_p+C_h+C_z))$ for $k$ returned records. Offset pagination may require $O(o+k(C_p+C_h+C_z))$ work at offset $o$, depending on the storage engine. Top-$k$ ranking over $N$ candidates with a bounded heap costs $O(NC_s+N\log k\,C_{\mathrm{cmp}}+k(C_p+C_h+C_z))$. Network transfer and storage-engine work may still dominate; measure them directly.

### 4.3 Treat summaries as derived artifacts

A generative summary should contain links or identifiers back to source items, a declared coverage range, and a transform version. Keep high-risk values such as monetary amounts, timestamps, permission changes, and error codes extractive where possible. Never let a summary erase a partial-failure marker.

### 4.4 Evaluate the information frontier

Sweep page size, field projection, ranking depth, and summary mode. Measure task success, evidence recall, citation correctness, result tokens, total turns, latency, repeated-fetch rate, and unsupported-claim rate. Plot task success against total result tokens; choose a configuration on the Pareto frontier rather than minimizing tokens alone.

OpenAI's current file-search guide explicitly describes a quality trade-off when lowering the maximum number of retrieved results and supports metadata filters plus optional inclusion of raw search results [OFS]. This is implementation evidence for the general recall–latency–context trade-off, not proof of an optimal result count.

## 5. Failure modes

| Failure | Consequence | Required signal or control |
|---|---|---|
| Silent truncation | Agent infers completeness from a prefix | Explicit `completeness`, omitted-count estimate, and continuation |
| Unstable offset paging | Duplicates or omissions under concurrent writes | Snapshot-bound cursor and total ordering |
| Overcompression | Critical exception or qualifier disappears | Evidence-recall tests and drill-down path |
| Generative distortion | Summary adds or changes facts | Source-linked claims; extractive mode for critical fields |
| Unauthorized aggregation | Count or summary leaks restricted records | Authorization predicate before aggregation |
| Cursor replay or tampering | Cross-query or cross-tenant access | Scope-bound, expiring authenticated cursor |
| Context oscillation | Agent repeatedly alternates concise and detailed calls | Clear response modes, semantic identifiers, trace-based tuning |
| Partial-success erasure | Successful items hide failed shards | Per-partition status and top-level partial-failure state |
| Stale continuation | Later page belongs to a different state | Snapshot/version declaration or explicit weak consistency |

## 6. Limitations and evidence boundaries

Task relevance is not always knowable before the model interprets intermediate evidence. A filter that looks safe can remove a rare but decisive item. Progressive disclosure can also increase latency and model turns for tasks that ultimately require most of the corpus.

Exact pagination semantics depend on the data store. A remote SaaS API may expose only offsets or short-lived cursors; the wrapper must report those limitations instead of promising snapshot isolation. Likewise, model-token budgets vary by tokenizer and serialization, so a fixed character cap is only an approximation.

## 7. Production implications

- Put result-budget enforcement in the executor boundary, not in descriptive instructions.
- Return semantic identifiers needed for follow-up calls, but avoid irrelevant internal IDs that encourage hallucinated joins.
- Preserve raw artifacts outside the model context and return authorized, expiring resource references where practical.
- Instrument raw bytes, serialized tokens, returned items, omitted items, pages fetched, and downstream success.
- Version result-shaping logic; a new summarizer, projection, or ranker changes the observation distribution seen by the policy.
- Test empty sets, one-past-page boundaries, expired cursors, concurrent mutation, malformed backend rows, and mixed success/failure shards.

## 8. Connections

Topic 3 supplies the output schema that makes completeness and continuation machine-checkable. Topic 4 governs whether returned fields have usable semantic affordance. Topic 8 can aggregate and filter results inside code before model ingestion, while Topic 12 adds provenance and freshness requirements. Chapter 6 generalizes the same allocation problem from tool results to the full model context.

## 9. Page-level sources

- [Anthropic, *Writing effective tools for agents*](https://www.anthropic.com/engineering/writing-tools-for-agents) [ATE]
- [Model Context Protocol, *Tools specification (2025-06-18)*](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP]
- [OpenAI, *File search*](https://developers.openai.com/api/docs/guides/tools-file-search) [OFS]
- [OpenAI, *Retrieval*](https://developers.openai.com/api/docs/guides/retrieval)
