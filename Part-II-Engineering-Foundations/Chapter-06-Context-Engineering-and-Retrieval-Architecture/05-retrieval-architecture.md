# Topic 5 — Retrieval Architecture: Lexical, Dense, Hybrid, Graph, Metadata-Filtered, and Tool-Mediated Retrieval

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The Acquire stage's most consequential source (Topic 3): how evidence is found. Six architectures, characterized by what each *fails* at — because the failure profile, not the mechanism, is what should drive the choice.

**Prerequisites.** Topic 1 (density, not recall, is the objective); Topic 3 (retrieval is one stage's source, not the system); Topic 4 (retrieved context has a one-turn lifetime); Chapter 5, Topic 9 (retrieval as a tool family with untrusted output).

**Terminology.** *Lexical*: term-matching (BM25). *Dense*: embedding-similarity. *Hybrid*: both, fused. *Graph*: traversal over typed relations. *Metadata-filtered*: structured predicates narrowing the candidate set. *Tool-mediated / agentic search*: the model issues queries against live systems rather than a precomputed index [ECE].

**Boundaries.** Inside: the architectures, their failure profiles, and the selection rule. Outside: chunking (Topic 6); query transformation and reranking (Topic 7); the poisoning of retrieved content (Topic 8); the stores themselves (Chapter 7).

**Exclusions.** No vector-database product comparison. No embedding-model benchmark.

**Outcomes.** The reader can pick a retrieval architecture from a failure profile rather than from fashion, and can state the specific queries on which their choice will fail.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Retrieval is usually selected by default — "we'll use embeddings" — and then debugged forever. The architectures have *systematically different failure modes*, and the failures are predictable from the mechanism: dense retrieval fails on exact identifiers, lexical fails on paraphrase, graph fails without a maintained schema, and agentic search fails by exploring badly.

**Bottleneck.** The objective is usually stated as **recall**, and recall is the wrong objective under Topic 1. A retriever that returns 20 documents of which 2 are relevant has good recall and terrible *density*, and it degrades the model by flooding the window with 18 documents of noise ($\partial P/\partial n|_s<0$). **Retrieval that optimizes recall optimizes context rot.**

**Objective.** Choose the architecture whose failure profile does not intersect your query distribution, and optimize for **signal density in the window**, not recall in the result set.

**Assumptions.** The corpus is known; the query distribution is knowable from traces.

**Constraints.** Precomputed indexes go stale. Live queries are slow — [ECE]: "Runtime exploration is slower than retrieving pre-computed data."

**Success criteria.** Measured recall *and* density *and* latency (Topic 13), with the failure classes of §3.3 explicitly tested.

## 3. Intuition first, then formalization

### 3.1 Intuition: retrieval's job changed

Classical RAG assumes the model is a *reader*: fetch the passages, put them in the window, let it answer. That framing made sense when the model could not act.

An agent can act. It can issue a query, look at the result, and issue a better one. [ECE] documents the consequence as a strategic shift: from "embedding-based pre-inference time retrieval" toward "just in time" strategies where agents "maintain lightweight identifiers (file paths, stored queries, web links, etc.) and use these references to dynamically load data into context at runtime using tools."

The worked example is the argument: Claude Code performs "complex data analysis over large databases" by writing "targeted queries, stor[ing] results, and leverag[ing] Bash commands like `head` and `tail` to analyze large volumes of data without ever loading the full data objects into context" [ECE]. **No embedding index exists. No chunking happened. The agent used the data system's own query language.**

This is the topic's central reframe: **retrieval is not necessarily a separate subsystem you build — it is often a tool you expose** (Chapter 5). Where the underlying system already has a good query interface (SQL, `grep`, an API), building an embedding index over it is often *strictly worse*: it adds staleness, loses exactness, and costs an ingestion pipeline. The question to ask before building any retrieval system: **does this corpus already have a query language the model could use?**

### 3.2 Formalization: density, not recall

Let the retriever return a set $R$ for query $q$, with $R^\star\subseteq R$ the truly relevant subset. Then

$$
\text{recall}=\frac{|R^\star|}{|\text{relevant in corpus}|},
\qquad
\text{precision}=\frac{|R^\star|}{|R|},
\qquad
\boxed{\ \text{density}=\frac{\sum_{r\in R^\star}\mathrm{tok}(r)}{\sum_{r\in R}\mathrm{tok}(r)}\ }
$$

**[derived]** Density is the quantity Topic 1 cares about, and it differs from precision because **documents have different sizes**: retrieving one relevant 200-token passage and one irrelevant 5,000-token passage is 50% precision and 4% density. The window sees tokens, not documents.

The context-aware retrieval objective is therefore

$$
\max_{R}\ \ \operatorname{value}(R^\star)\ -\ \lambda\cdot\underbrace{\sum_{r\in R\setminus R^\star}\mathrm{tok}(r)}_{\text{noise tokens: strictly harmful (Topic 1, }\partial P/\partial n|_s<0)} ,
$$

which is **not** maximized by maximizing recall. Adding a marginal document with a 30% chance of relevance adds $0.3$ of expected value and $0.7\cdot\mathrm{tok}$ of certain dilution. **There is a $k$ beyond which retrieving more is negative**, and it is usually far smaller than the $k$ people ship. This is Chapter 5, Topic 15's saturation argument, arriving at retrieval.

### 3.3 The failure profiles — the actual selection criterion

**[synthesis — the profiles are assembled from the mechanisms; each is a deterministic consequence of how the method works.]**

| Architecture | Mechanism | **Fails on** | Density | Staleness |
|---|---|---|---|---|
| **Lexical** (BM25) | Term overlap | **Paraphrase**; synonymy; "the thing that broke checkout" | High (exact terms) | Index-dependent |
| **Dense** (embeddings) | Vector similarity | **Exact identifiers** (`user_9182`, error codes, UUIDs, function names); negation; numeric ranges | Medium | **Re-embed on change** |
| **Hybrid** | Fusion of both | The fusion weights; still fails where *both* fail | Medium–high | Both |
| **Graph** | Typed relation traversal | **Missing/incorrect edges**; requires a maintained schema | High (structured) | Schema drift |
| **Metadata-filtered** | Structured predicates | Anything not in the metadata | **Highest** (narrows first) | Metadata drift |
| **Tool-mediated / agentic** [ECE] | Model queries the live system | **Bad exploration**; latency; the model must know the query language | **Highest** (the system filters) | **None — live** |

The two rows that decide most real systems:

**Dense retrieval fails on exact identifiers, and agent queries are full of them.** "Why was customer 9182 charged three times" — the discriminating token is `9182`, and embedding similarity is nearly blind to it. This is not a tuning problem; it is what the mechanism does. Chapter 5, Topic 3's finding rhymes: opaque identifiers are hostile to models *and* to embeddings, for related reasons.

**Tool-mediated retrieval has no staleness and maximal density, and pays in latency and exploration risk.** [ECE] is explicit about both sides: it enables progressive disclosure and exact filtering at the source, but "runtime exploration is slower than retrieving pre-computed data" and demands "opinionated and thoughtful engineering" to prevent agents "wasting context by misusing tools, chasing dead-ends, or failing to identify key information."

## 4. Architecture

```
                            ┌──────── query q ────────┐
                            │                          │
        ┌───────────────────┴──────────┐    ┌──────────┴─────────────────┐
        │  PRECOMPUTED INDEX PATH       │    │  TOOL-MEDIATED PATH [ECE]  │
        │                               │    │                            │
        │  metadata filter (narrow 1st) │    │  model writes a query in    │
        │        │                      │    │  the SYSTEM's own language: │
        │  ┌─────┴─────┐                │    │    SQL · grep · glob · API  │
        │  │ lexical   │  dense         │    │        │                    │
        │  │ (exact)   │  (semantic)    │    │  system filters at source   │
        │  └─────┬─────┘     │          │    │        │                    │
        │        └── fuse ───┘          │    │  head/tail to bound result  │
        │             │                 │    │        │                    │
        │        rerank (Topic 7)       │    │  NO index · NO chunking     │
        └─────────────┼─────────────────┘    │  NO staleness               │
                      │                      └──────────┬─────────────────┘
                      └──────────┬──────────────────────┘
                                 ▼
                    top-k by DENSITY, not recall (§3.2)
                                 │
                                 ▼
              Topic 3's pipeline: Normalize → Rank → Compress
                                 │
                    Topic 4: RETRIEVED type, L ≈ 1 turn, evict when answered
```

**Metadata filtering goes first, and this is the most underused lever in retrieval.** A structured predicate (`project = 'Q3', date > '2026-06-01', type = 'error'`) can shrink the candidate set by orders of magnitude *before* any semantic scoring — improving density, latency, and cost simultaneously, with no model involvement. It fails only on what the metadata does not capture. **Most teams reach for a better embedding model when they should reach for a `WHERE` clause.**

**The hybrid that matters most.** [ECE] documents Claude Code's actual strategy as a *source-level* hybrid, not a scoring-level one: "`CLAUDE.md` files are naively dropped into context up front, while primitives like `glob` and `grep` allow it to navigate its environment and retrieve files just-in-time." Small, stable, always-relevant → eager. Large, conditional → tool-mediated. **This is a better default than any fusion weighting**, because it decides per *source* rather than per *query*.

## 5. Grounding

- **The strategic shift:** from "embedding-based pre-inference time retrieval" toward "just in time" context strategies with "lightweight identifiers (file paths, stored queries, web links, etc.)" loaded "at runtime using tools" [ECE].
- **The worked tool-mediated example:** Claude Code doing "complex data analysis over large databases" by writing "targeted queries, stor[ing] results, and leverag[ing] Bash commands like `head` and `tail` to analyze large volumes of data without ever loading the full data objects into context" [ECE].
- **Progressive disclosure:** runtime exploration lets "agents… incrementally discover relevant context through exploration," and organizational metadata — "folder hierarchies, naming conventions, timestamps" — provides "important signals that help both humans and agents understand how and when to utilize information" [ECE]. **Structure in the corpus is retrieval signal**, and it is free.
- **The honest cost of tool-mediated retrieval:** "Runtime exploration is slower than retrieving pre-computed data," requiring "opinionated and thoughtful engineering" to prevent "wasting context by misusing tools, chasing dead-ends, or failing to identify key information" [ECE].
- **The hybrid, as shipped:** eager `CLAUDE.md` + JIT `glob`/`grep` [ECE].
- **Retrieval is a memory-system concern:** the memory survey [MEM] supplies the taxonomy of retrieval over agent memory that Chapter 7 develops; retrieval architecture and memory architecture are the same question asked of different stores.
- **Retrieval is a tool, with a tool's hazards:** Chapter 5, Topic 9 classifies retrieval as a family whose output is **untrusted when the corpus is user-writable** — corpus poisoning is a real path (Topic 8).
- **The harness view:** retrieval strategy is a revisable harness component; the survey lists "retrieval strategies" among the harness dimensions an Evolution Agent may edit [CAH §3.5].

**Evidence gap, and it is a large one.** **No source in this chapter's ledger provides comparative retrieval benchmarks** — no recall, precision, density, or latency figures across lexical/dense/hybrid/graph/agentic on agent workloads. [ECE] argues *directionally* for just-in-time and reports one worked example; it publishes no numbers. The failure profiles in §3.3 are **derived from the mechanisms** (dense retrieval's blindness to exact identifiers is a property of embedding similarity, not a measured claim), and they are reliable as *mechanisms*, not as *effect sizes*. Everything quantitative here must come from §8.

## 6. Implementation

**Filter first, then score — the highest-leverage ordering:**

```python
def retrieve(q: Query, budget_tokens: int) -> list[Chunk]:
    # 1. METADATA FILTER FIRST. Orders of magnitude, for free, no model involved.
    candidates = index.filter(
        project=q.project, after=q.since, doc_type=q.type,
        acl=q.principal,                        # ← authorization at retrieval (Ch.5 T10)
    )

    # 2. Hybrid scoring — because dense alone is blind to identifiers (§3.3).
    lex   = bm25(q.text, candidates)            # catches `user_9182`, error codes, symbols
    dense = ann(embed(q.text), candidates)      # catches paraphrase, synonymy
    fused = rrf(lex, dense)                     # reciprocal rank fusion

    # 3. Rerank (Topic 7), then cut by DENSITY not by k (§3.2).
    ranked = rerank(q.text, fused[:RERANK_K])
    return cut_by_density(ranked, budget_tokens)
```

`acl=q.principal` is not optional. **A retriever that ignores the acting principal is a confused deputy** (Chapter 5, Topic 10) that will happily return documents the user may not see. Retrieval is an access-control boundary, and it is one of the most commonly missed ones.

**Density-based cut, replacing top-$k$:**

```python
def cut_by_density(ranked: list[Chunk], budget: int) -> list[Chunk]:
    """Stop when the MARGINAL document's expected value no longer covers its dilution.
    Top-k is arbitrary; this is the §3.2 objective, implemented."""
    kept, used = [], 0
    for c in ranked:
        if c.score < RELEVANCE_FLOOR:           # below this, it is noise (Topic 1)
            break
        if used + c.tokens > budget:
            break
        kept.append(c); used += c.tokens
    return kept
```

The `RELEVANCE_FLOOR` break is the important line. **A fixed `k` retrieves the 8th-best document even when it is irrelevant**, paying certain dilution for near-zero expected value. A floor stops when the results stop being good — which is what you actually want, and it is one line.

**Tool-mediated retrieval, per [ECE]** — often the right answer, and it requires no index:

```python
# The corpus already has a query language. Use it. (§3.1)
search_logs = ToolContract(
    name="logs_search",
    description=(
        "Search application logs. Supports exact match on IDs and structured filters.\n"
        "  Prefer NARROW queries: many small targeted searches beat one broad scan.\n"  # [WTA]
        "  Returns matching lines with context, newest first, paginated."
    ),
    input_schema={...},                          # Chapter 5, Topic 3
    output=OutputContract(budget_tokens=15_000), # Chapter 5, Topic 7
    trust=Trust.UNTRUSTED,                       # corpus may be user-writable (Topic 8)
    ...)
```

No chunking. No embedding. No staleness. The system's own index does the work, and the model composes queries — which is precisely [ECE]'s Claude Code example.

## 7. Trade-offs

| Architecture | Latency | Cost | Density | Exactness | Staleness | Build cost |
|---|---|---|---|---|---|---|
| Lexical | Low | Low | High | **Exact** | Index refresh | Low |
| Dense | Low | Embedding + storage | Medium | **Poor on IDs** | **Re-embed on change** | Medium |
| Hybrid | Low | Both | Medium–high | Good | Both | Medium–high |
| Graph | Medium | Schema maintenance | High | Structured | Schema drift | **High** |
| Metadata filter | **Lowest** | Trivial | **Highest** | Exact | Metadata drift | **Lowest** |
| Tool-mediated [ECE] | **High** (round trips) | Model turns | **Highest** | **Exact** | **None** | Low (a tool) |

**The trade [ECE] names and this book will not soften.** Tool-mediated retrieval is slower and riskier — "runtime exploration is slower than retrieving pre-computed data," and agents can waste context "chasing dead-ends." It buys exactness, zero staleness, maximal density, and no ingestion pipeline. **For corpora that already have a good query interface, that trade is usually correct; for unstructured document corpora with no query language, it is usually not.** That is the whole selection rule, and it is about the *corpus*, not the fashion.

**The staleness cost nobody budgets.** A dense index over changing data is a *derived artifact that must be maintained*: every document change requires re-embedding, and an index that lags is a retriever that confidently returns yesterday's truth. Tool-mediated retrieval has no such artifact — which is often the strongest argument for it, and it never appears in the benchmark comparisons that drive the decision.

## 8. Experiments

**Retrieval evaluation, unbundled from the agent.** Evaluate the retriever *as a retriever* on (query, relevant-set) pairs before you evaluate the agent. Otherwise a retrieval failure and a model failure are indistinguishable (Topic 13's whole argument, previewed).

**Metrics — the vector, and note density is the one nobody reports:**

- **recall@k** with Wilson intervals — did the relevant document come back?
- **density** (§3.2) — what fraction of retrieved *tokens* were relevant? **This is the context-cost metric.**
- **latency** p50/p95.
- **staleness rate** — retrieved content that no longer matches the source of truth.

**The failure-class suite — the experiment that makes §3.3 actionable.** Build query sets that target each architecture's predicted failure:

| Query class | Example | Predicted to fail |
|---|---|---|
| Exact identifier | "logs for customer 9182" | **Dense** |
| Paraphrase | "the thing that broke checkout" | **Lexical** |
| Negation | "orders *without* a refund" | Dense; most retrievers |
| Numeric range | "charges over $500 last week" | Dense; use metadata |
| Multi-hop | "who approved the change that caused the outage" | All single-shot (Topic 7) |
| Recency | "what changed today" | Any stale index |

**Run every architecture against every class.** The output is a failure matrix, and it is the artifact that should drive your choice — not a leaderboard. **If your query distribution is 40% exact-identifier and you shipped pure dense retrieval, this experiment tells you why the agent is bad, in an afternoon.**

**Ablation — $k$ and the density floor.** Sweep $k$; measure agent completion $G$ and tokens. **Prediction from §3.2: $G$ peaks at a $k$ well below the one you shipped, then declines** as noise dilutes. This is Chapter 5, Topic 15's saturation curve for retrieved documents, and it is cheap to run.

**Ablation — precomputed vs tool-mediated.** [ECE]'s trade, measured: tokens, $G$, latency, turns, staleness. Include a **stale-index arm** (index one day behind) — this is where tool-mediated retrieval wins invisibly in production and is never given credit in benchmarks.

**Statistics.** Wilson on recall; task-clustered bootstrap on agent-level contrasts; Holm across architectures; predeclare the primary endpoint (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Optimizing recall.** Floods the window; degrades the model (Topic 1). Mitigation: optimize density; use a relevance floor, not a fixed $k$.
- **Dense-only retrieval with identifier-heavy queries.** The dominant real-world retrieval failure in agent systems. Mitigation: hybrid, or lexical, or metadata.
- **No metadata filter.** Semantic scoring over the whole corpus when a `WHERE` clause would have cut it 1000×. Mitigation: filter first (§6).
- **Retrieval without ACL.** A confused deputy at the corpus (Chapter 5, Topic 10) — the retriever returns what the *agent* can see, not what the *user* can. Mitigation: `acl=principal` in the filter; **this is a live vulnerability in most RAG systems**.
- **Stale index.** Confidently returns yesterday's truth; no error fires. Mitigation: measure staleness rate; consider tool-mediated retrieval, which cannot be stale.
- **Retrieved content never evicted.** Topic 4's T-2 violation; the bloat compounds. Mitigation: evict on query resolution.
- **Corpus poisoning.** If users can write to the corpus, retrieval is an *untrusted* channel wearing a trusted label (Topic 8; Chapter 5, Topic 9). Mitigation: trust by *document provenance*, not by store.
- **Agentic search that explores badly.** [ECE]'s named risk: "wasting context by misusing tools, chasing dead-ends, or failing to identify key information." Mitigation: bound exploration turns; steer toward narrow queries in $d_u$ [WTA]; measure turns.
- **Chunk boundaries that destroy the answer.** Topic 6's problem, arriving here: the relevant fact was split across two chunks and neither scores. Mitigation: Topic 6.
- **Edge case — the corpus with no query language.** Unstructured documents, no metadata, no search API. This is where a built index genuinely earns its keep, and it is a narrower case than the industry's enthusiasm implies.
- **Open limitation.** **No comparative retrieval benchmarks for agent workloads exist in this chapter's sources.** The failure profiles are mechanistic and reliable; the effect sizes are unmeasured. §8's failure matrix is how you get yours, and there is no published shortcut.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Practice is shifting from embedding-based pre-inference retrieval toward just-in-time, tool-mediated context loading [ECE].
2. A production coding agent analyzes large databases by writing targeted queries and using `head`/`tail`, "without ever loading the full data objects into context" [ECE].
3. Corpus structure — "folder hierarchies, naming conventions, timestamps" — is retrieval signal [ECE].
4. Runtime exploration is slower than precomputed retrieval and risks wasted context [ECE].
5. The shipped default is a **source-level hybrid**: eager for small stable files, JIT for the rest [ECE].
6. **No source benchmarks retrieval architectures on agent workloads** — the profiles here are mechanistic.

**Decision rules.**
- **Ask first: does this corpus already have a query language?** If yes, expose it as a tool (Chapter 5) before building an index.
- **Never ship dense-only if your queries contain identifiers.** They will fail, by mechanism.
- **Filter on metadata before scoring.** Cheapest, largest lever.
- **Use a relevance floor, not a fixed $k$.** Retrieving the 8th-best irrelevant document is a certain cost for near-zero value.
- **Scope retrieval by the acting principal.** Otherwise it is a confused deputy.
- **Optimize density, not recall.**

**Production implications.**
1. Run the failure matrix (§8) against your real query distribution — it usually explains your agent's retrieval problems in one afternoon.
2. Add the ACL filter to your retriever today if it is missing; it is a live access-control hole.
3. Sweep $k$ and find the peak; it is lower than what you shipped.
4. Measure staleness. A dense index over changing data is a maintained artifact, and its lag is invisible until it is embarrassing.

**Connections.** Topic 6 (chunking) determines what units this retriever can even return; Topic 7 (query transformation, reranking, multi-hop) is what turns a single-shot retriever into one that can answer real questions; Topic 8 is what happens when the corpus is hostile; Topic 13 measures recall, utilization, and faithfulness separately. Chapter 5, Topic 9's retrieval family and Topic 7's result budgets are the tool-side of tool-mediated retrieval; Chapter 7 owns the memory stores this retriever reads.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — the shift from "embedding-based pre-inference time retrieval" to "just in time" strategies; "lightweight identifiers (file paths, stored queries, web links, etc.)"; the Claude Code database-analysis example ("targeted queries, store results, and leverage Bash commands like `head` and `tail`… without ever loading the full data objects into context"); progressive disclosure and incremental discovery through exploration; metadata from "folder hierarchies, naming conventions, timestamps" as signal; "Runtime exploration is slower than retrieving pre-computed data" and the risk of "wasting context by misusing tools, chasing dead-ends, or failing to identify key information"; the hybrid ("CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep allow it to navigate its environment and retrieve files just-in-time") — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — reactive (`load_memory_tool`) vs proactive memory recall; artifact handles loaded on demand — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[WTA] Anthropic, "Writing effective tools for agents" — steering agents toward "many small and targeted searches instead of a single, broad search"; `search_logs` over `read_logs` — https://www.anthropic.com/engineering/writing-tools-for-agents
[MEM] Memory in AI agents survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — retrieval over agent memory; taxonomy developed in Chapter 7
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.5 — retrieval strategies as a revisable harness component; missing repository context as a documented failure mechanism
