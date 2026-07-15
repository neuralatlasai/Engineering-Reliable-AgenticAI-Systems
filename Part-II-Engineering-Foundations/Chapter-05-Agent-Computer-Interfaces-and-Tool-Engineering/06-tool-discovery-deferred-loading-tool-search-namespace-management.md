# Topic 6 — Tool Discovery, Deferred Loading, Tool Search, and Namespace Management

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** How much of $\mathcal U_c$ the model sees at once, and by what mechanism it sees the rest. This is the first topic where the tool surface stops being a design problem and becomes a *resource-allocation* problem.

**Prerequisites.** Topics 3–4 (every visible description is a recurring token cost and a selection input); Chapter 6 is downstream (it competes for the same budget).

**Terminology.** *Visible set* $\mathcal V_t\subseteq\mathcal U_c$: tools whose definitions are in $c_t$. *Deferred loading*: withholding a tool's parameter schema; the model sees names and descriptions only (`defer_loading: true`) [TS]. *Tool search*: the meta-tool by which the model retrieves deferred definitions [TS]. *Namespace*: a common prefix grouping related tools [WTA].

**Boundaries.** Inside: the four discovery regimes and their crossover points. Outside: result size (Topic 7); the code-execution regime, which is discovery taken to its conclusion (Topic 8); the *effect* of surface size on accuracy (Topic 15).

**Exclusions.** No MCP registry mechanics.

**Outcomes.** The reader can compute the token cost of their surface, choose a regime from that number, and know the cost of the choice.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Tool definitions are paid for on **every turn, whether or not the tool is called.** With $|\mathcal U_c|$ small this is invisible. With $|\mathcal U_c|$ large it dominates: "In cases where agents are connected to thousands of tools, they'll need to process hundreds of thousands of tokens before reading a request" [CXM].

**Bottleneck.** The naive regime — load everything — has cost linear in $|\mathcal U_c|$ and *per turn*. A 20-turn run with a 50k-token tool surface spends a million tokens on definitions before doing any work. Worse, the surface is also a selection input, so the same growth that costs tokens degrades $\Pr(Z_s)$ (Topic 15).

**Objective.** Make the visible set a *decision* rather than a default, with a stated cost model and a measured crossover.

**Assumptions.** Definitions in context are re-processed each turn (mitigated but not eliminated by prompt caching — see §7). The model cannot call what it cannot see.

**Constraints.** Deferred loading costs a round trip when the model needs a schema. Prompt caching interacts with *where* in the context definitions sit [TS].

**Success criteria.** Tool-definition tokens as a fraction of prompt tokens is measured, budgeted, and below threshold; $\Pr(Z_s)$ has not degraded from the discovery mechanism itself.

## 3. Intuition first, then formalization

### 3.1 Intuition: a catalogue, not a prologue

The all-loaded regime treats the tool surface as a *prologue* — everything the model might need, recited before every turn. Human beings do not work this way and neither should the model: you do not re-read the entire API reference before each function call; you know roughly what exists and you look up the details when you need them.

Deferred loading is exactly that split: **names and descriptions are the index; schemas are the entries.** [TS] withholds "parameter schemas" so that "the model sees only names and descriptions at request start," and injects full definitions on demand. The index is cheap and sufficient for *selection*; the entry is expensive and needed only for *argument construction*. Since Topic 1's chain has selection strictly before argument construction, this split is aligned with how the decision actually decomposes — which is why it works.

### 3.2 Formalization: the cost model and the crossover

Let $|\mathcal U|=N$ tools; $\bar d$ = mean tokens per name+description; $\bar\sigma$ = mean tokens per schema; $K$ = turns in the run; $m$ = number of *distinct* tools actually used in the run, typically $m\ll N$.

**All-loaded:**
$$
C_{\text{all}} \;=\; K\cdot N\cdot(\bar d+\bar\sigma).
$$

**Deferred + tool search:**
$$
C_{\text{def}} \;=\; K\cdot N\cdot\bar d \;+\; m\cdot(\bar\sigma + c_{\text{search}}) \;+\; m\cdot\rho\cdot c_{\text{turn}},
$$

where $c_{\text{search}}$ is the search call's overhead, $\rho$ the extra round trips induced, and $c_{\text{turn}}$ the cost of a turn. **[derived]**

The saving is $K\cdot N\cdot\bar\sigma$ against the added $m(\bar\sigma+c_{\text{search}}+\rho c_{\text{turn}})$, so deferral wins when

$$
\boxed{\;K\cdot N\cdot\bar\sigma \;\gg\; m\cdot\bigl(\bar\sigma+c_{\text{search}}+\rho\,c_{\text{turn}}\bigr)\;}
$$

Since $m\ll N$ and $K\ge 1$, **the inequality holds easily for large $N$ and fails for small $N$** — the schema term is paid $K\cdot N$ times in one regime and $m$ times in the other. The crossover is governed by $N$ and by $\bar\sigma/\bar d$: **schemas are typically several times larger than descriptions**, which is why deferring *schemas specifically* (rather than whole tools) is the right cut. It preserves selection (which needs $\bar d$) and defers only what argument construction needs.

The residual term $K\cdot N\cdot\bar d$ is the honest limit: **deferred loading does not solve the large-surface problem, it postpones it.** With thousands of tools, even names and descriptions saturate the context — which is the regime where Topic 8's code-execution aggregation becomes the only real answer.

### 3.3 Namespaces as both compression and affordance

[WTA]: namespacing is "grouping related tools under common prefixes" (`asana_search`, `jira_search`, `asana_projects_search`) and it "can help delineate boundaries between lots of tools." Its dual benefit is stated directly: names reflecting "natural subdivisions of tasks" simultaneously "reduce the number of tools and tool descriptions loaded into the agent's context and offload agentic computation from the agent's context back into the tool calls themselves."

The empirical caveat is the source's own and is binding: prefix- vs suffix-based namespacing has "non-trivial effects on our tool-use evaluations," effects "vary by LLM," and you should "choose a naming scheme according to your own evaluations" [WTA]. **This is an instruction not to generalize.** This book therefore reports namespacing as a *documented lever with a model-dependent sign*, and refuses to state a preferred scheme.

[TS] gives namespaces a second, mechanical role: they are the *unit of deferral*, with the recommendation to "aim to keep each namespace to fewer than 10 functions for better token efficiency and model performance."

## 4. Architecture

```
  REGIME 1 — all loaded                REGIME 2 — namespaced
  ┌──────────────────────┐             ┌──────────────────────┐
  │ N × (d + σ) per turn │             │ same cost; better    │
  │ selection over N     │             │ discriminability (T4)│
  └──────────────────────┘             └──────────────────────┘
        N ≲ 20                               N ≲ 50

  REGIME 3 — deferred + tool search          REGIME 4 — code execution (Topic 8)
  ┌────────────────────────────────┐         ┌──────────────────────────────┐
  │ N × d per turn  (index)        │         │ ~0 per turn                  │
  │ + m × σ on demand (entries)    │         │ model explores a filesystem  │
  │                                │         │ of tool modules on demand    │
  │ model → tool_search_call       │         │                              │
  │ system → tool_search_output    │         │ 150k → 2k tokens [CXM]       │
  │ definitions appended AT THE END │         └──────────────────────────────┘
  │ of context (cache-preserving)  │              N in the hundreds+
  └────────────────────────────────┘
        N ~ 20–200
```

**The cache-preservation detail is architecturally load-bearing.** [TS]: "All tools are loaded at the end of the model's context window," which preserves the prompt cache across requests. Definitions injected at the *front* would invalidate the cached prefix on every load and convert a token saving into a cache-miss cost. The source names the trade explicitly — "a design choice that balances efficiency against injection ordering." A team building its own deferral mechanism and appending definitions to the system prompt will destroy its own cache and wonder why the optimization made things slower.

**Control flow.** The model emits `tool_search_call` (with `execution: "server"` or `"client"`); in hosted mode the provider searches declared tools and injects matches; in client mode *your* application runs the search. The system returns `tool_search_output` carrying the loaded definitions, and the tools become callable via `function_call` [TS]. **Client mode is the important one for this book**: it means the retrieval function over your tool catalogue is *yours*, and it is a ranking problem you can measure and improve like any other retrieval system (Chapter 6).

## 5. Grounding

- **The cost of large surfaces:** "thousands of tools… hundreds of thousands of tokens before reading a request" [CXM].
- **Deferred loading mechanics:** `defer_loading: true` on functions, namespaces, or MCP servers; the model "sees only names and descriptions at request start"; `{"type": "tool_search"}` in the tools array; `tool_search_call` / `tool_search_output`; **gpt-5.4 and later only**; definitions loaded at the end of the context window to preserve cache; "aim to keep each namespace to fewer than 10 functions" [TS].
- **Namespacing:** grouping under common prefixes; effects vary by LLM; measure locally; names reflecting task subdivisions reduce both tool count and context [WTA].
- **Progressive disclosure as the general principle:** "Models are great at navigating filesystems. Presenting tools as code on a filesystem allows models to read tool definitions on-demand, rather than reading them all up-front" [CXM].

**Evidence gaps, named.** (i) [TS] states that deferral "may help reduce overall token usage and cost" — **"may," and with no measured figure.** (ii) No source reports the *accuracy* cost of deferral: the model selects from descriptions alone, which could plausibly *reduce* $\Pr(Z_s)$ relative to seeing full schemas, and no published measurement settles it. §8 is how you find out for your surface, and it is the experiment this topic most wants you to run. (iii) The `<10 functions per namespace` figure is a recommendation without a published derivation.

## 6. Implementation

**Measure before choosing.** Almost no team knows this number:

```python
def surface_cost(tools, model) -> dict:
    """Tool-definition tokens are paid EVERY TURN. Measure with the provider's counter."""
    names_descs = sum(count_tokens(f"{t.name}: {t.description}", model) for t in tools)
    schemas     = sum(count_tokens(json.dumps(t.input_schema), model)  for t in tools)
    return {
        "n_tools": len(tools),
        "index_tokens": names_descs,              # what deferral still pays, per turn
        "schema_tokens": schemas,                 # what deferral saves, per turn
        "per_turn_all_loaded": names_descs + schemas,
        "per_run_20_turns": 20 * (names_descs + schemas),
    }
```

Use the provider's tokenizer, never an estimator — third-party tokenizers "undercount Claude tokens by ~15–20% on typical text, and by much more on code" [ANT-API], and a surface budget built on one is wrong before you start (Chapter 4, Topic 13).

**Client-mode tool search is a retrieval system.** Treat it as one:

```python
def tool_search(query: str, catalogue: list[ToolContract], k: int = 5) -> list[dict]:
    """Client-mode search [TS]. This ranking IS the thing to measure — a bad ranker
    silently caps Pr(Z_s) at the recall@k of this function."""
    ranked = rank(query, catalogue)               # BM25, embeddings, or hybrid (Ch. 6)
    chosen = ranked[:k]
    log_search(query, [t.name for t in chosen])   # for recall@k evaluation (§8)
    return [t.full_definition() for t in chosen]  # schemas, loaded on demand
```

The one-line implication that teams miss: **the model's tool-choice accuracy is now upper-bounded by your retriever's recall@k.** If the right tool is not in the top $k$, $\Pr(Z_s)=0$ regardless of how good the descriptions are. Deferred loading converts a selection problem into a *retrieval-plus-selection* problem, and it silently adds a failure mode that lives in your code, not the model's.

**Namespace hygiene:**

```python
def audit_namespaces(tools) -> list[str]:
    problems = []
    for ns, group in groupby(sorted(tools, key=ns_of), key=ns_of):
        group = list(group)
        if len(group) > 10:                        # [TS] recommendation
            problems.append(f"namespace {ns!r} has {len(group)} tools (>10): split it")
        if len({t.name for t in group}) != len(group):
            problems.append(f"namespace {ns!r} has duplicate names")
    return problems
```

## 7. Trade-offs

| Regime | Per-turn tokens | Round trips | $\Pr(Z_s)$ risk | Cache | When |
|---|---|---|---|---|---|
| All loaded | $N(\bar d+\bar\sigma)$ | 0 | Confusion at large $N$ (Topic 15) | Clean prefix | $N$ small |
| Namespaced | Same | 0 | Better discriminability [WTA] | Clean | Always do this |
| Deferred + search | $N\bar d$ | $+m$ | **Bounded by retriever recall@k** | Preserved *if* appended at end [TS] | $N$ moderate–large |
| Code execution | ~0 | Exploration turns | Model must navigate | Preserved | $N$ large (Topic 8) |

**The three costs of deferral that its advocates skip.**
1. **A new failure mode in your code.** Retriever recall@k now bounds $\Pr(Z_s)$. You have moved a failure from the model into your infrastructure — which is *good* (you can fix it) but only if you measure it.
2. **Latency.** Each search is a round trip; $\rho$ in §3.2 is not free, and on an interactive path it is felt.
3. **Model gating.** `tool_search` is "gpt-5.4 and later" [TS]. This is a **portability limit** (Chapter 4, Topic 12): a surface architected around deferral is a surface that cannot run on a model without it. Price that before adopting.

**Prompt caching changes the arithmetic but does not remove it.** A cached tool-definition prefix is cheaper on subsequent turns, and that pushes the crossover to larger $N$. It does not eliminate the *selection* cost of a crowded surface (Topic 15), which is not a token problem at all. **Caching solves the money; it does not solve the confusion.**

## 8. Experiments

**Measurement first.** Report `surface_cost` (§6) and tool-definition tokens as a fraction of total prompt tokens. Most teams discover a number they did not expect.

**Ablation — regime.** Paired, same tasks. Arms: all-loaded / namespaced / deferred+search. Metrics (the vector): $\Pr(Z_s)$, $\Pr(Z_a\mid Z_s)$, task completion $G$, **total tokens**, **latency**, tool-call count, and — new here — **retriever recall@k**.

**The decisive quantity: recall@k.** Evaluate the retriever *independently of the model*, on (task, correct-tool) pairs:

$$
\text{recall@}k=\frac{1}{|T|}\sum_{\tau\in T}\mathbb 1\bigl[u^\star_\tau\in \text{top-}k(\tau)\bigr].
$$

**Acceptance rule: if recall@k is below your target $\Pr(Z_s)$, deferral has capped your accuracy and no prompt work will lift it.** Fix the retriever first. This decomposition is the whole reason to measure the two separately, and it turns "the agent got worse after we added tool search" from a mystery into a one-line diagnosis.

**Ablation — namespacing scheme.** Prefix vs suffix, per [WTA]'s explicit instruction to measure locally. Do not import a convention; the sign is model-dependent.

**Statistics.** Paired; clustered bootstrap; Holm across arms; Wilson intervals on recall@k (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **The unmeasured surface.** Nobody knows the tool-token number; it grows with every MCP import until context pressure appears as an unexplained cost and quality regression. Mitigation: §6's `surface_cost` in CI, with a budget.
- **Retriever recall ceiling.** Deferral silently caps $\Pr(Z_s)$; the symptom is "the model stopped using tool X," and the cause is in your ranker. Mitigation: measure recall@k separately.
- **Cache destruction.** A home-grown deferral that injects definitions at the *front* of context invalidates the prompt cache each load. The optimization makes things slower and more expensive. Mitigation: append at the end [TS].
- **Namespace collision on import.** Two MCP servers both expose `search`. Mitigation: mandatory server-prefixed namespacing at import (Topic 2, §6).
- **Model gating.** Deferral unavailable on the model you migrate to [TS]. Mitigation: keep an all-loaded fallback path; measure it; treat it as a portability constraint.
- **Edge case — the never-searched tool.** A deferred tool whose description never matches any query is *invisible in practice*. Deferral has silently deleted it. Mitigation: audit tool-usage distribution; a tool with zero calls across a representative eval is either badly described or unnecessary — and either way it should not be in $\mathcal U_c$ (Topic 15).
- **Open limitation.** [TS] itself only claims deferral "may help reduce overall token usage and cost." **The accuracy effect of deferral is unmeasured in every source available to this chapter.** It is plausible that selecting from descriptions alone costs accuracy relative to seeing full schemas. Nobody has published the number. Do not adopt deferral believing it is free; adopt it having measured it.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Large tool surfaces cost hundreds of thousands of tokens before the request is read [CXM].
2. Deferred loading withholds schemas, exposing names and descriptions only; retrieval is via a `tool_search` meta-tool; gpt-5.4+ only [TS].
3. Loaded definitions are appended at the *end* of context to preserve the prompt cache [TS].
4. Namespacing helps, and its optimal form varies by model and must be measured locally [WTA].
5. Deferral's token benefit is stated as "may"; **no source quantifies it, and none measures its accuracy cost.**

**Decision rules.**
- $N\lesssim 20$: **load everything.** Deferral's round trips and retrieval risk are not worth it.
- $20\lesssim N\lesssim 200$: **namespace, then defer schemas.** Measure recall@k before trusting it.
- $N\gtrsim$ hundreds: **deferral only postpones the problem** ($K\cdot N\cdot\bar d$ remains). Go to Topic 8.
- **Always namespace.** It is nearly free and it buys discriminability (Topic 4).
- **Never adopt deferral without measuring recall@k.** You have moved a failure into your own code; own it.

**Production implications.**
1. Put tool-definition tokens on a dashboard and give them a budget. It is the number that silently funds every MCP import.
2. If you defer, evaluate the retriever as a retrieval system with recall@k and Wilson intervals — it is now on the critical path.
3. Keep an all-loaded fallback for model portability.
4. Audit for never-called tools; deferral hides them, and Topic 15 says they were costing you before it did.

**Connections.** Topic 4's descriptions are what the index is made of, and deferral makes them carry *more* weight (they alone drive selection). Topic 7 attacks the other half of the context bill: results. Topic 8 is this topic's limit case. Topic 15 explains why the surface's *size* is a problem even when tokens are free. Chapter 6's retrieval architecture is what a client-mode `tool_search` actually is.

## Sources

[TS] OpenAI, tool-search guide — `defer_loading: true` on functions, namespaces, or MCP servers; "the model sees only names and descriptions at request start"; `{"type": "tool_search"}`; `tool_search_call` (`execution: "server"`/`"client"`) and `tool_search_output`; "gpt-5.4 and later models support `tool_search`"; "All tools are loaded at the end of the model's context window" for cache preservation; "aim to keep each namespace to fewer than 10 functions"; "may help reduce overall token usage and cost" — https://developers.openai.com/api/docs/guides/tools-tool-search
[CXM] Anthropic, "Code execution with MCP" — "In cases where agents are connected to thousands of tools, they'll need to process hundreds of thousands of tokens before reading a request"; progressive disclosure; filesystem navigation — https://www.anthropic.com/engineering/code-execution-with-mcp
[WTA] Anthropic, "Writing effective tools for agents" — namespacing under common prefixes; `asana_search`/`jira_search` examples; "non-trivial effects" that "vary by LLM"; "choose a naming scheme according to your own evaluations"; names reflecting natural task subdivisions reducing tool count and context — https://www.anthropic.com/engineering/writing-tools-for-agents
[ANT-API] Anthropic Claude API reference — `count_tokens` vs third-party tokenizers (~15–20% undercount on text, more on code) — platform.claude.com docs (cache 2026-06)
