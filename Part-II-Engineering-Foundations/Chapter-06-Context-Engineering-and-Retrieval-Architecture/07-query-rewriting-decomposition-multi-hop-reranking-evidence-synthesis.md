# Topic 7 — Query Rewriting, Decomposition, Multi-Hop Retrieval, Reranking, and Evidence Synthesis

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The gap between the query the user asked and the queries the retriever can answer. Four operations close it — rewriting, decomposition, multi-hop traversal, reranking — plus the synthesis step that turns retrieved evidence into a grounded answer.

**Prerequisites.** Topic 5 (retrieval architectures and their failure profiles); Topic 6 (the chunks being ranked); Topic 1 (density is the objective); Chapter 2, Topic 2 (test-time compute — these operations *are* test-time compute spent on retrieval).

**Terminology.** *Rewriting*: transforming a query into one the retriever can serve. *Decomposition*: splitting a compound query into independent sub-queries. *Multi-hop*: retrieval whose second query depends on the first's result. *Reranking*: rescoring a candidate set with a more expensive, more accurate model. *Synthesis*: composing an answer from evidence, with attribution.

**Boundaries.** Inside: the query-side and post-retrieval operations of the Rank stage (Topic 3). Outside: the retrieval mechanism itself (Topic 5); citation enforcement at output (Topic 14); the agent loop that these operations sometimes replace (§3.1).

**Exclusions.** No reranker-model benchmark.

**Outcomes.** The reader can diagnose whether their retrieval failures are query-side or index-side, and can choose between a retrieval *pipeline* and an *agentic search loop* on evidence rather than fashion.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Users and tasks do not speak retrieval. The query that arrives is underspecified ("what broke?"), compound ("compare our EU and US refund policies and tell me which customers were affected"), or multi-hop ("who approved the change that caused the outage" — you cannot find the approver until you find the change). A single-shot retriever answers none of these, no matter how good its index.

**Bottleneck.** Teams respond to retrieval failure by tuning the *retriever* — a better embedding model, a bigger $k$ — when the failure is on the *query side*. The distinction is diagnosable and almost never diagnosed: **if the relevant document is in the corpus and the retriever cannot find it from the user's literal words, that is a query problem, and no index change will fix it.**

**Objective.** Close the query-intent gap with the *cheapest* operation that works, and know when the right answer is not a retrieval pipeline at all but an agent loop (Topic 5's tool-mediated retrieval).

**Assumptions.** The model can rewrite and decompose (Chapter 2). Each operation costs a model call, latency, and tokens.

**Constraints.** Every operation here is test-time compute spent *before* the task begins. A four-stage retrieval pipeline can cost more than the answer is worth.

**Success criteria.** Query-side and index-side failures separated in measurement; multi-hop tasks solvable; reranking justified by a measured density gain.

## 3. Intuition first, then formalization

### 3.1 Intuition: the retrieval pipeline and the agent loop are the same thing

The four operations — rewrite, decompose, hop, rerank — are a *hardcoded* version of what an agent does naturally when given a search tool: try a query, look at the results, refine, try again, stop when satisfied.

This is the topic's most important observation, and it reframes the build/skip decision. [ECE]'s just-in-time strategy is exactly this: the agent "incrementally discover[s] relevant context through exploration," writing "targeted queries" and using `head`/`tail` to bound results, rather than executing a fixed retrieval DAG.

So there are two ways to close the query-intent gap:

- **The pipeline:** you write rewrite → decompose → retrieve → hop → rerank as code. Deterministic, measurable, fast, and **it can only do what you programmed.**
- **The agent loop:** you give the model a search tool and let it iterate. Flexible, handles queries you did not anticipate, and **it can explore badly** — [ECE]'s named risk of "wasting context by misusing tools, chasing dead-ends, or failing to identify key information."

**The pipeline is a compiled query plan; the agent loop is an interpreter.** Neither dominates. The pipeline wins when the query distribution is known and latency matters. The loop wins when queries are open-ended and the corpus has a good query language (Topic 5, §3.1). Most production systems should be a hybrid: **a pipeline for the queries you can predict, a search tool for the ones you cannot.**

### 3.2 Formalization: where the failure lives

Decompose retrieval failure. For query $q$ with relevant document $d^\star$:

$$
\Pr(\text{retrieved } d^\star)
=\underbrace{\Pr(d^\star\in\text{corpus})}_{\text{coverage}}
\cdot\underbrace{\Pr(q'\ \text{expresses the intent}\mid q)}_{\text{query-side}}
\cdot\underbrace{\Pr(d^\star\in\text{top-}k\mid q')}_{\text{index-side}} .
$$

**[derived]** Three independent factors, three different fixes, and **almost every team measures only the product.** The middle term is what this topic addresses:

- **Coverage failure** → your corpus lacks the document. Retrieval work is wasted; go get the document.
- **Query-side failure** → the document is there, and the user's literal words do not reach it. **Rewriting/decomposition fixes this. A better embedding model does not.**
- **Index-side failure** → the rewritten query is right and the retriever still misses. Topic 5's architecture is wrong (dense on an identifier query, say).

The diagnostic is cheap: **run the retriever with an oracle query** (a hand-written ideal query for each task). If recall jumps, the failure is query-side. If it does not, the failure is index-side. This one experiment (§8) redirects most retrieval effort correctly, and it takes an afternoon.

### 3.3 Multi-hop, and why it cannot be parallelized

Decomposition and multi-hop look similar and are structurally different:

$$
\textbf{Decomposition (independent):}\quad q\to\{q_1,\ldots,q_m\},\qquad q_i\perp q_j .
$$
$$
\textbf{Multi-hop (dependent):}\quad q\to q_1\to \underbrace{q_2(r_1)}_{\text{depends on } r_1}\to\cdots
$$

**[derived]** Decomposed sub-queries are **independent** and therefore parallelizable — "compare EU and US refund policies" is two retrievals that can run at once. Multi-hop queries are **sequential by construction** — "who approved the change that caused the outage" cannot issue hop 2 until hop 1 returns the change ID.

Two consequences follow. **Latency:** decomposition is nearly free (parallel); multi-hop costs $H$ round trips for $H$ hops, and it is the reason multi-hop questions are slow. **Error compounding:** multi-hop inherits Chapter 1's error-accumulation model exactly —

$$
\Pr(\text{all hops correct})=\prod_{h=1}^{H}\Pr(\text{hop } h\ \text{correct}\mid \text{hops } <h\ \text{correct}),
$$

so a 3-hop query at 0.9 per hop succeeds ~73% of the time. **A wrong hop-1 result does not produce a wrong hop-2 answer — it produces a *confidently* wrong one**, because hop 2 faithfully retrieves evidence about the wrong entity. This is why multi-hop needs *verification between hops*, not just at the end, and why the model must be able to say "hop 1 returned nothing usable" and stop.

## 4. Architecture

```
                          user query q
                               │
              ┌────────────────┴─────────────────┐
              │  CLASSIFY (cheap, often a rule)  │
              └────────┬───────────┬─────────────┘
                       │           │
            simple ────┘           └──── compound / multi-hop / open-ended
              │                                    │
              ▼                                    ▼
       ┌──────────────┐              ┌─────────────────────────────────┐
       │  REWRITE     │              │  DECOMPOSE (independent)  ──┐   │
       │  (expand,    │              │     q₁ ∥ q₂ ∥ q₃            │   │
       │   normalize, │              │                              │   │
       │   add terms) │              │  MULTI-HOP (dependent)      │   │
       └──────┬───────┘              │     q₁ → r₁ → q₂(r₁) → ...  │   │
              │                      │     SEQUENTIAL. Verify each. │   │
              │                      └──────────────┬───────────────┘   │
              │                                     │                   │
              │              ── OR ──  agentic search loop [ECE]: give  │
              │                        the model the tool and let it    │
              │                        iterate (§3.1)                   │
              └──────────────┬──────────────────────┘                   │
                             ▼                                          │
                     RETRIEVE (Topic 5)  ◄───────────────────────────────┘
                             │  candidates (k' ≫ k)
                             ▼
                     ┌───────────────┐
                     │   RERANK      │  expensive model, small set
                     │   cross-      │  ← this is where DENSITY is won
                     │   encoder     │
                     └───────┬───────┘
                             ▼
                     cut by density floor (Topic 5, §6)
                             │
                             ▼
                     ┌───────────────┐
                     │  SYNTHESIZE   │  answer + CITATIONS (Topic 6's offsets)
                     │               │  conflicts SURFACED, not silently resolved
                     └───────────────┘
```

**Reranking is where density is actually won.** The retriever's job is *recall over a big candidate set* — cast a wide net cheaply ($k'\approx100$). The reranker's job is *precision over a small set* — an expensive cross-encoder that actually reads the query against each candidate, producing an ordering good enough that Topic 5's density floor can cut aggressively. **Retrieve wide, rerank hard, cut narrow.** A system without a reranker must choose between low recall (small $k$) and low density (large $k$); the reranker is what dissolves that dilemma.

## 5. Grounding

- **Agentic search as the alternative to a pipeline:** "just in time" retrieval where agents "incrementally discover relevant context through exploration," writing "targeted queries" against live systems [ECE]. Claude Code's database analysis — "targeted queries, store results, and leverage Bash commands like `head` and `tail`" — is a multi-hop retrieval *loop*, executed by the model rather than by a DAG [ECE].
- **The cost of the loop:** "Runtime exploration is slower than retrieving pre-computed data," and it risks "wasting context by misusing tools, chasing dead-ends, or failing to identify key information" [ECE] — the honest counterweight to §3.1's flexibility argument.
- **Narrow queries beat broad ones, and the tool should say so:** steer agents toward "many small and targeted searches instead of a single, broad search for a knowledge retrieval task" [WTA]. **This is decomposition, delivered as a tool description** (Chapter 5, Topic 4) rather than as a pipeline stage.
- **Strong tasks require multi-step retrieval:** evaluation tasks "might require multiple tool calls—potentially dozens," and the strong-task exemplar — "Customer ID 9182 reported that they were charged three times… Find all relevant log entries and determine if any other customers were affected" — is explicitly a multi-hop question [WTA].
- **Test-time compute is the resource being spent:** Chapter 2, Topic 2 — every rewrite, hop, and rerank is inference spent before the task starts, and it trades against the compute available for the task itself.
- **Error accumulation across hops** is Chapter 1, Topic 8's model, applied to a retrieval chain.
- **Evidence synthesis must cite:** unsupported completion claims are a measured propensity [FSC §6.3.5]; citation is the detector (Chapter 5, Topic 12, §3.3).

**Evidence gap, and it is total.** **No source in this chapter's ledger measures query rewriting, decomposition, reranking, or multi-hop retrieval on agent workloads.** [ECE] argues for the agentic-loop alternative and names its risks; [WTA] recommends narrow queries. **There is no published effect size for any operation in this topic.** The mechanisms (§3.2's factorization, §3.3's compounding) are derivations; every number must come from §8. This is the third consecutive topic in this chapter where the practice is mature in industry and the evidence is absent from the literature, and it is worth saying plainly rather than letting the confident tone of the surrounding engineering imply otherwise.

## 6. Implementation

**Diagnose before you build — the oracle-query test:**

```python
def diagnose_retrieval(tasks, retriever) -> dict:
    """Separate query-side from index-side failure (§3.2). Run this BEFORE building
    any of the machinery below — it tells you whether you need it at all."""
    literal = mean(recall_at_k(retriever, t.user_query, t.relevant) for t in tasks)
    oracle  = mean(recall_at_k(retriever, t.oracle_query, t.relevant) for t in tasks)
    return {
        "literal_recall": literal,
        "oracle_recall":  oracle,
        "query_side_gap": oracle - literal,     # ← rewriting/decomposition fixes THIS
        "index_side_gap": 1.0 - oracle,         # ← a better retriever fixes THIS
    }
    # Large query_side_gap  → build this topic's machinery.
    # Large index_side_gap  → go back to Topic 5; your architecture is wrong.
```

**Decomposition (parallel) vs multi-hop (sequential, verified):**

```python
async def resolve(q: Query, ctx) -> Evidence:
    plan = await classify_and_plan(q)                 # cheap model call, or a rule

    if plan.kind == "decompose":
        # Independent ⇒ PARALLEL. Nearly free in latency (§3.3).
        results = await asyncio.gather(*[retrieve(sq) for sq in plan.subqueries])
        return merge(results)

    if plan.kind == "multihop":
        # Dependent ⇒ SEQUENTIAL, and verify BETWEEN hops (§3.3).
        evidence, bindings = [], {}
        for hop in plan.hops:
            sq = hop.render(bindings)                 # depends on prior results
            r = await retrieve(sq)
            if not sufficient(r, hop.expects):
                # A bad hop-1 makes hop-2 CONFIDENTLY wrong. Stop; do not proceed.
                return Evidence.insufficient(
                    f"Hop {hop.i} ({sq!r}) returned nothing usable. "
                    f"Cannot resolve subsequent hops. Do not guess."
                )
            bindings.update(extract(r, hop.binds))    # e.g. change_id → next hop
            evidence.append(r)
        return merge(evidence)

    return await retrieve(rewrite(q))                 # simple path
```

The `sufficient(...)` check is the load-bearing line. **Without it, hop 2 retrieves excellent evidence about the wrong entity**, and the synthesized answer is well-cited, internally coherent, and wrong.

**Rerank, then cut on density:**

```python
def rank_stage(q: str, candidates: list[Chunk], budget: int) -> list[Chunk]:
    # Retrieve WIDE (cheap), rerank HARD (expensive, small set), cut NARROW.
    scored = cross_encoder.score(q, candidates[:RERANK_K])   # e.g. 100 → scored
    ranked = sorted(scored, key=lambda c: -c.score)
    return cut_by_density(ranked, budget)                    # Topic 5's floor
```

**Synthesis that cites and surfaces conflict:**

```python
SYNTHESIS_INSTRUCTION = """
Answer using ONLY the evidence below. Every claim must cite [source:offset].
If the evidence CONFLICTS, say so explicitly and cite both sides — do not silently
pick one. If the evidence is INSUFFICIENT, say that instead of inferring.
"""
```

Surfacing conflict rather than resolving it is a deliberate design choice and the right one: **a retriever that returns contradictory evidence has found something important**, and a model that silently picks one has destroyed the signal (Topic 8's authority-confusion failure).

## 7. Trade-offs

| Operation | Buys | Costs |
|---|---|---|
| Rewriting | Closes the query-side gap | A model call per query; can *drift* from user intent |
| Decomposition | Compound queries; **parallel** | A planning call; over-decomposition fragments the answer |
| Multi-hop | Otherwise-impossible queries | **$H$ sequential round trips**; error compounds (§3.3) |
| Reranking | **Where density is won**; enables aggressive cuts | An expensive model over $k'$ candidates; latency |
| Agentic loop [ECE] | Handles unanticipated queries; no DAG to maintain | Slower; can explore badly; unbounded turns |
| Pipeline | Fast, deterministic, measurable | **Only does what you programmed** |

**The trade that decides the architecture.** Every operation here is **test-time compute spent before the task begins** (Chapter 2, Topic 2). A four-stage pipeline — rewrite, decompose, retrieve, rerank — can cost more model calls than answering the question. For simple queries this is pure waste; for multi-hop queries it is the only way. **Classify first, and route simple queries down a short path.** A system that runs its full retrieval pipeline on "what's our refund policy" is paying for machinery it does not need on the majority of its traffic.

## 8. Experiments

**The oracle-query diagnostic (§6) comes first, always.** It tells you whether to build anything in this topic. A large query-side gap justifies the machinery; a large index-side gap means you are about to optimize the wrong layer.

**Reranking ablation — the clearest win to verify.** With/without a cross-encoder reranker at fixed $k$. Metrics: **density** (Topic 5, §3.2), recall@k, end-to-end $G$, latency, cost. **Prediction: substantially higher density at equal recall**, which then lets you cut $k$ and *save* tokens. If density does not move, your reranker is not better than your retriever and it is pure latency.

**Multi-hop compounding measurement.** For $H$-hop tasks, measure per-hop accuracy and end-to-end accuracy. **Verify the product**: does end-to-end match $\prod_h \Pr(\text{hop}_h)$? If end-to-end is *worse* than the product, hops are correlated in failure (a bad hop-1 poisons everything after). This is Chapter 1's error-accumulation model, tested on a retrieval chain, and it tells you where to put verification.

**Pipeline vs agentic loop.** [ECE]'s trade, measured directly. Arms: fixed pipeline / agentic search tool / hybrid (route by query class). Metrics: $G$, tokens, **turns**, latency, and — critically — **$G$ on out-of-distribution queries** (ones the pipeline was not designed for). **The pipeline should win on anticipated queries and lose badly on novel ones; that gap is the price of compiling your query plan**, and it is the number that should drive the architecture choice.

**Rewriting drift check.** Measure how often the rewritten query changes the *user's intent* rather than clarifying it. A rewriter that "helpfully" broadens "EU refund policy" to "refund policy" has silently answered a different question — and the citation will look perfect.

**Statistics.** Wilson on recall and per-hop accuracy; task-clustered bootstrap on $G$; Holm across arms; predeclare the primary endpoint (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Tuning the retriever when the failure is query-side.** Months spent on embeddings for a problem a rewrite would fix. Mitigation: the oracle-query diagnostic (§6), first.
- **Multi-hop poisoning.** Hop 1 returns the wrong entity; hops 2..H retrieve excellent evidence about it; the answer is confidently wrong **and well-cited**. **The nastiest failure in the topic.** Mitigation: verify *between* hops; allow "insufficient" as a terminal.
- **Query rewriting that drifts.** The rewrite answers a subtly different question. Mitigation: measure intent preservation; keep the original query in the synthesis context so the model can notice the mismatch.
- **Over-decomposition.** "Compare X and Y" split into six sub-queries whose answers cannot be recomposed. Mitigation: decompose only on genuine independence.
- **Unbounded agentic search.** [ECE]'s "chasing dead-ends"; the loop explores until the budget dies. Mitigation: bound exploration turns; make turns a first-class metric; steer toward narrow queries in the tool description [WTA].
- **Reranking a bad candidate set.** The reranker cannot promote what retrieval never returned. **Recall@k′ upper-bounds everything downstream.** Mitigation: measure recall at the *pre-rerank* $k'$; if it is low, fix Topic 5 first.
- **Silent conflict resolution.** Two documents disagree; the model picks one; the disagreement — which was the actual finding — is destroyed. Mitigation: surface conflicts explicitly (§6, Topic 8).
- **Pipeline cost on simple queries.** Four model calls to answer "what's our refund policy." Mitigation: classify and route.
- **Edge case — the query with no good decomposition.** Genuinely holistic questions ("summarize this quarter") resist both decomposition and hopping; they need a different retrieval strategy (broad + aggressive compression) or a different architecture entirely.
- **Open limitation.** **Nothing in this topic is measured in this chapter's sources.** Rewriting, decomposition, reranking, and multi-hop are industry-standard practice with no published effect sizes on agent workloads here. The mechanisms are derivations; the numbers are yours. Treat every rule in §10 as a hypothesis you owe a measurement.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Agents can perform multi-step retrieval as an *exploration loop* rather than a fixed pipeline, writing targeted queries against live systems [ECE].
2. Runtime exploration is slower than pre-computed retrieval and risks dead-ends and wasted context [ECE].
3. Many small, targeted searches are preferable to one broad search, and the tool description is where you say so [WTA].
4. Realistic agent tasks require multiple tool calls, "potentially dozens," and are frequently multi-hop [WTA].
5. **No source measures any operation in this topic on agent workloads.** The evidence base is absent, not thin.

**Decision rules.**
- **Run the oracle-query diagnostic before building anything here.** It tells you if the failure is even query-side.
- **Verify between hops.** A bad hop makes every subsequent hop confidently wrong.
- **Retrieve wide, rerank hard, cut narrow.** That is where density comes from.
- **Decompose only on true independence** — then parallelize.
- **Classify and route.** Do not pay a four-stage pipeline on a one-stage query.
- **Surface conflicts; never resolve them silently.**
- **Choose pipeline vs agentic loop on query predictability**, not on fashion: compile what you can predict, interpret what you cannot.

**Production implications.**
1. Run the oracle diagnostic this week; it redirects most misplaced retrieval effort in an afternoon.
2. Add a reranker if you have none — it is usually the largest single density win available, and density is what Topic 1 says you are short of.
3. Instrument per-hop accuracy on multi-hop tasks; end-to-end accuracy hides where the chain breaks.
4. Bound agentic search turns and put "turns" on the dashboard — [ECE]'s dead-end risk is real and it is invisible in token counts.

**Connections.** This topic sits inside Topic 3's Rank stage and depends on Topic 5's architecture and Topic 6's chunks. Its conflict-surfacing feeds Topic 8's authority-confusion problem; its citations depend on Topic 6's offsets and feed Topic 14's attribution. Chapter 2, Topic 2's test-time compute is the resource it spends; Chapter 1, Topic 8's error accumulation is the multi-hop compounding law; Chapter 5's tool contracts are what the agentic-loop alternative is built from.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — just-in-time retrieval and progressive disclosure ("incrementally discover relevant context through exploration"); the Claude Code database-analysis loop ("targeted queries, store results, and leverage Bash commands like `head` and `tail`"); "Runtime exploration is slower than retrieving pre-computed data"; the risk of "wasting context by misusing tools, chasing dead-ends, or failing to identify key information" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[WTA] Anthropic, "Writing effective tools for agents" — steering toward "many small and targeted searches instead of a single, broad search for a knowledge retrieval task"; strong evaluation tasks requiring "multiple tool calls—potentially dozens"; the multi-hop exemplar ("Customer ID 9182 reported that they were charged three times for a single purchase attempt. Find all relevant log entries and determine if any other customers were affected") — https://www.anthropic.com/engineering/writing-tools-for-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — unsupported completion claims; the propensity that citation enforcement detects — `Knowledge_source/`
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1, §3.5 — planning loci and retrieval strategies as revisable harness components; missing repository context as a documented failure mechanism
