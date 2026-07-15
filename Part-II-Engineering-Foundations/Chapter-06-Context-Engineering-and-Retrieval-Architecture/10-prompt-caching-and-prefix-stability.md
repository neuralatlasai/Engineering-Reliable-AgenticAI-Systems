# Topic 10 — Prompt Caching and Prefix Stability

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The economic layer of context engineering: prompt caching makes a stable context prefix cheap to reprocess, and a single early byte-change throws the entire cache away. This topic is where the assembly decisions of Topics 2–9 acquire a *cost function* that rewards stability and punishes churn.

**Prerequisites.** Topic 2 (instructions as the stable prefix); Topic 3 (Assemble, which decides byte order); Chapter 4, Topic 10 (execution modes) and Topic 13 (version-pinning — cache behavior is provider-specific).

**Terminology.** *Prefix caching*: reusing the computation for a context prefix identical to a prior request's. *Cache breakpoint*: the boundary up to which caching applies. *Prefix stability*: the property that the cached region is byte-identical across turns. *Cache hit / miss*: whether the prefix was reused.

**Boundaries.** Inside: how caching shapes assembly, the stability discipline, and its cost model. Outside: the compaction that rewrites the prefix (Topic 11); provider-specific cache TTLs and pricing (Chapter 4; the claude-api reference).

**Exclusions.** No provider pricing table — figures move; the discipline does not.

**Outcomes.** The reader can structure assembly so the prefix is stable and cacheable, and can identify the assembly mistakes that silently destroy the cache.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** An agent reprocesses a large, mostly-unchanging context on *every* turn: the system prompt, tool definitions, durable instructions, and accumulated history are nearly identical from turn to turn, differing only in the newest tokens. Without caching, the model recomputes attention over all of it every time — the dominant cost in a long agent run, and it grows with the run.

**Bottleneck.** Caching solves this *only if the prefix is byte-stable*, and the assembly disciplines of Topics 2–9 are in tension with stability: reranking reorders blocks, compaction rewrites history, a timestamp in the system prompt changes every second, and any of these — placed before the cache breakpoint — invalidates the entire cached region. **A single early byte-change turns a cache hit into a full recompute**, and the failure is silent: the request succeeds, just expensively.

**Objective.** Structure the context so the prefix is stable and cacheable, isolate all variability in the suffix, and make cache behavior *observable* so a stability regression is caught.

**Assumptions.** Caching keys on an exact prefix match (byte-identical). [GCA] and provider docs (Chapter 4) establish prefix caching as the mechanism.

**Constraints.** Some content that *wants* to be early (the most-critical dynamic fact, A-1 from Topic 9) also *wants* to vary — a genuine tension (§3.3).

**Success criteria.** Cache-hit rate measured and high; a prefix change is a logged, deliberate event, never an accident of assembly.

## 3. Intuition first, then formalization

### 3.1 Intuition: the prefix is a shared, cached prologue

The mental model: your context is a *prologue* (system prompt, tools, durable instructions — the same every turn) followed by a *story* (the conversation — growing). Caching means the model does not re-read the prologue each turn; it resumes from where the cache left off.

[GCA] states the architecture directly: divide context into "stable prefixes (instructions, identity, summaries) and variable suffixes (latest turns, new outputs)," and treat "cache-friendliness as an architectural constraint using `static instruction` primitives." The word **constraint** is the point — cache-friendliness is not an optimization you apply afterward; it is a *shape* the assembly must have from the start, because a prefix that was not designed to be stable will not be.

The failure this prevents is subtle because it is silent. Put a timestamp in the system prompt "for context," and every turn's prefix differs by those few tokens, and the cache never hits — you pay full price on every turn and the only symptom is a cost line nobody attributes to a timestamp. Reorder tool definitions by a `set` that hashes differently each process start, and same result. **The cache is destroyed by things that look harmless**, which is why stability must be a checked invariant, not a hope.

### 3.2 Formalization: the stability invariant and the cost model

Let the context be a prefix $c^{\mathrm{pre}}$ and a suffix $c^{\mathrm{suf}}$, split at the cache breakpoint. A cache hit requires:

$$
\textbf{S-1 (prefix stability):}\qquad
c^{\mathrm{pre}}_t\ =\ c^{\mathrm{pre}}_{t-1}\quad\text{(byte-identical).}
$$

**Byte-identical**, not "semantically the same." A reordered-but-equivalent prefix is a cache miss. The cost model, with cached-token cost $\gamma\ll1$ times the uncached cost **[derived; the ratio is provider-specific]**:

$$
\text{cost}_t\ \approx\ \underbrace{\gamma\cdot\mathrm{tok}(c^{\mathrm{pre}})}_{\text{cached prefix}}\ +\ \underbrace{\mathrm{tok}(c^{\mathrm{suf}})}_{\text{new suffix, full price}}
\qquad\text{on a hit,}
$$
$$
\text{cost}_t\ \approx\ \mathrm{tok}(c^{\mathrm{pre}})+\mathrm{tok}(c^{\mathrm{suf}})
\qquad\text{on a miss (full recompute).}
$$

The lever is stark: over a $K$-turn run with a stable prefix, you pay the prefix's full cost roughly *once* and $\gamma$ of it $K-1$ times, instead of $K$ times. For a large prefix (system prompt + tool definitions + durable instructions can be many thousands of tokens) and a long run, **this is the single largest cost lever in the chapter** — and it is entirely destroyed by one early byte-change.

The design rule follows immediately **[derived]**:

$$
\textbf{S-2 (variability in the suffix):}\qquad
\text{all per-turn-varying content is placed after the cache breakpoint.}
$$

### 3.3 The tension with A-1, resolved

Topic 9's A-1 says the most-critical content should be at the *edges*, including the start. S-2 says varying content must be at the *end*. Do these collide for the *dynamic critical fact*?

No, and the resolution is the same as Topic 9, §4, now with the cost reason attached. Partition critical content by *volatility*:

- **Durable-critical** (instructions, identity, policy): start, in the prefix, **cached**. Stable by nature.
- **Dynamic-critical** (this turn's key retrieved fact): end, in the suffix, **not cached**, near the generation point (A-1's recency edge).

The only genuine casualty is content that is *both* critical *and* changing *and* would benefit from the start position — and that content is rare, because "changing" and "belongs in the permanent prefix" are nearly contradictory. **The prefix is for what does not change; if it changes, it was never a prefix.** [GCA]'s "summaries" belonging in the stable prefix is the interesting case: a compaction summary is *periodically* rewritten (Topic 11), so it breaks the cache *when compaction runs* — which is acceptable precisely because compaction is infrequent, and it is why compaction should be batched, not continuous (Topic 11).

## 4. Architecture

```
   ┌──── CACHE PREFIX (stable, byte-identical each turn — S-1) ────────┐
   │  system prompt        ← no timestamps, no per-turn variability     │
   │  tool definitions     ← STABLE ORDER (sort deterministically)      │
   │  durable instructions ← Topic 2's Category A                       │
   │  compaction summary   ← stable BETWEEN compactions (Topic 11)      │
   └──────────────────────── cache breakpoint ─────────────────────────┘
   ┌──── SUFFIX (varies every turn — S-2) ────────────────────────────┐
   │  retrieved evidence (this query)                                  │
   │  recent turns                                                     │
   │  dynamic-critical fact  ← A-1's recency edge (Topic 9)            │
   │  current task                                                     │
   └──────────────────────────────────────────────────────────────────┘

   SILENT CACHE KILLERS (all live in the prefix by mistake):
     · timestamp / turn counter in system prompt
     · non-deterministic tool-definition order (a set, a dict pre-3.7)
     · reranked blocks reordered into the prefix
     · compaction rewriting the prefix EVERY turn (batch it — Topic 11)
     · a personalization token injected before the breakpoint
```

**Google's `static instruction` primitive** [GCA] is the architectural answer: a declared-stable region the framework guarantees will not vary, so the cache boundary is explicit rather than emergent. The lesson for a home-grown pipeline: **make the prefix a distinct, frozen object** — assembled once per session, hashed, and asserted unchanged (Topic 3's V-4) — rather than reassembled from parts every turn where a reordering can slip in.

## 5. Grounding

- **The stable-prefix / variable-suffix architecture:** context divided into "stable prefixes (instructions, identity, summaries)" and "variable suffixes (latest turns, new outputs)," leveraging "model prefix caching" [GCA].
- **Cache-friendliness as a constraint:** "treat cache-friendliness as an architectural constraint using `static instruction` primitives" [GCA] — not an afterthought.
- **Instructions are the prefix:** Topic 2; [GCA] places "instructions, identity, summaries" in the stable region.
- **Deferred tool loading loads at the context *end* to preserve cache:** OpenAI's tool-search loads definitions "at the end of the model's context window," an explicit "design choice that balances efficiency against injection ordering" to preserve the prompt cache across requests [TS] (Chapter 5, Topic 6). **This is S-2 applied to tool definitions**, and it is documented provider behavior, not a home-grown trick.
- **Compaction's opaque items are designed to carry forward:** OpenAI's compaction items are "opaque and not intended to be human-interpretable" and the returned window should be passed "as-is" [OCP] — the compacted prefix is meant to be a stable, reusable object between compactions.
- **Provider cache mechanics** (breakpoints, TTLs, pricing) are Chapter 4's subject and the claude-api reference's; this topic uses the *existence* of prefix caching, not its parameters, because the parameters move and the discipline does not.

**Evidence gap.** **No source in this chapter's ledger publishes cache-hit-rate impact on end-to-end cost or latency for an agent workload**, nor the cached-token cost ratio $\gamma$ (that is provider pricing, Chapter 4). [GCA] establishes the *architecture* and its rationale; it reports "no measured metrics." The cost model in §3.2 is a derivation from how prefix caching works, and its *magnitude* for your system depends on your prefix size, run length, and provider pricing — measurable via §8, not available from these sources.

## 6. Implementation

**Freeze the prefix as an object; assert it never drifts:**

```python
class SessionPrefix:
    """[GCA]'s static-instruction region, made explicit. Assembled ONCE per session,
    frozen, hashed. Everything per-turn goes in the suffix (S-2)."""
    def __init__(self, system_prompt, tools, durable_instructions):
        self.text = "\n\n".join([
            system_prompt,                                    # NO timestamps (§4)
            *[t.definition for t in sorted(tools, key=lambda t: t.name)],  # STABLE order
            *[d.content for d in durable_instructions],
        ])
        self.hash = sha256(self.text)

    def assert_stable(self, prior_hash: str) -> None:
        # Topic 3's V-4. A drift here is a full cache miss, silent unless asserted.
        if self.hash != prior_hash:
            log.warning(f"CACHE MISS: prefix changed {prior_hash[:8]} → {self.hash[:8]}")
```

**The cache-killer linter — catch the silent ones before they ship:**

```python
CACHE_KILLERS = [
    (r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", "timestamp in prefix"),      # per-turn variation
    (r"turn[_ ]?\d+", "turn counter in prefix"),
    (r"\b(now|today|current time)\b", "relative time reference"),
]

def lint_prefix(prefix_text: str) -> list[str]:
    """These look harmless and silently destroy the cache (§3.1)."""
    return [msg for pat, msg in CACHE_KILLERS if re.search(pat, prefix_text)]

def check_tool_order_determinism(tools) -> None:
    # A set or a pre-3.7 dict gives a different order each process → cache miss every restart.
    assert list(tools) == sorted(tools, key=lambda t: t.name), \
        "tool definitions not in deterministic order — cache will miss across restarts"
```

**Observe the cache — it is invisible until you look:**

```python
def record_cache_metrics(response, ctx) -> None:
    # Providers report cached vs uncached token counts. Put them on a dashboard.
    ctx.metrics.emit({
        "cached_prefix_tokens": response.usage.cache_read_tokens,
        "uncached_tokens": response.usage.uncached_tokens,
        "cache_hit": response.usage.cache_read_tokens > 0,
        "prefix_hash": ctx.prefix.hash,        # a changed hash on a hit-expected turn = bug
    })
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Stable prefix (S-1) | **The largest cost lever in the chapter** | Prefix cannot carry per-turn content |
| Variability in suffix (S-2) | Cache survives | Dynamic-critical content loses the *start* position (but keeps the end — A-1) |
| Frozen prefix object | Drift becomes a caught error | A little assembly discipline |
| Deferred tools at context end [TS] | Tool defs do not break the cache | Retriever-recall ceiling (Chapter 5, Topic 6) |
| Continuous compaction | Fresh summaries | **Rewrites the prefix every turn → cache miss every turn.** Batch it (Topic 11) |
| Personalization in prefix | Per-user tailoring | Per-user prefix → cache fragmented across users |

**The trade that hides the largest mistake.** Continuous compaction and per-turn personalization both *feel* like improvements and both **silently convert every turn into a cache miss** by rewriting the prefix. The cost does not show up as an error; it shows up as a bill that is several times higher than it should be, with no obvious cause. **Compaction must be batched (infrequent, so the prefix is stable between runs — Topic 11); personalization must live in the suffix or in a per-user cache namespace.** The general rule: *anything that varies faster than the cache can amortize does not belong before the breakpoint.*

## 8. Experiments

**Cache-hit-rate measurement — the observability baseline.** Instrument cached vs uncached tokens per turn (§6). Report hit rate over a run. **A well-structured agent should hit the cache on nearly every turn after the first; a hit rate near zero means the prefix is churning**, and the linter (§6) will usually tell you why in one line.

**Prefix-stability ablation.** Two arms on identical tasks: (a) prefix with a cache-killer (a timestamp in the system prompt); (b) clean prefix. Metrics: cost, latency, cache-hit rate. **The gap is the price of one careless line** — and it is usually large enough to end the "is caching worth the discipline" debate permanently.

**Compaction-cadence ablation.** Continuous vs batched compaction (Topic 11). Metrics: cache-hit rate, cost, and completion. **Prediction: continuous compaction tanks the hit rate** because it rewrites the prefix constantly; batched compaction preserves it. This experiment is where Topics 10 and 11 must be co-designed.

**Cost model validation.** Measure $\gamma$ (cached / uncached cost) for your provider, and validate the §3.2 model against measured run cost. This grounds the "largest cost lever" claim in your actual numbers rather than in the derivation.

**Statistics.** Report cost and latency distributions (p50/p95), not just means — cache misses are bimodal (hit or full recompute), so the mean hides the tail. Task-clustered where tasks vary in length (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Timestamp in the system prompt.** The canonical silent cache killer. Every turn misses; the only symptom is the bill. Mitigation: the linter (§6); relative time goes in the suffix if needed at all.
- **Non-deterministic tool order.** A `set` or old `dict` orders differently per process; cache misses across restarts. Mitigation: deterministic sort; the order check (§6).
- **Reranked blocks in the prefix.** A ranker that reorders content before the breakpoint invalidates the cache each turn. Mitigation: ranking operates on the *suffix*; the prefix is frozen (§6).
- **Continuous compaction.** Rewrites the prefix every turn; cache never hits. Mitigation: batch compaction (Topic 11); the cadence ablation to prove it.
- **Per-user personalization in the prefix.** Fragments the cache across users; each user pays full price. Mitigation: suffix, or per-user cache namespace.
- **Prefix drift unnoticed.** No cache observability; the hit rate silently drops after a refactor. Mitigation: V-4 assertion; cache metrics on a dashboard.
- **Over-caching stale content.** A cached prefix outlives the correctness of its content (a durable instruction that should have changed). Mitigation: prefix is versioned; a deliberate instruction change is a deliberate cache reset, logged.
- **Edge case — provider cache TTL expiry.** The cache expires between turns if the run is slow (Chapter 4's TTL); a hit becomes a miss through no assembly fault. Mitigation: know your provider's TTL (Chapter 4); for slow interactive runs, this is a real and unavoidable cost.
- **Open limitation.** **Cache pricing and TTLs are provider-specific and move** (Chapter 4, Topic 13's version discipline); this topic's cost *ratios* are not portable. And **no source publishes the end-to-end cost impact** for an agent workload — the magnitude is yours to measure (§8). The *discipline* (stable prefix, variable suffix) is durable; the numbers are not.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Production architecture divides context into "stable prefixes (instructions, identity, summaries)" and "variable suffixes (latest turns, new outputs)" to leverage prefix caching [GCA].
2. Cache-friendliness is "an architectural constraint," supported by `static instruction` primitives [GCA].
3. Deferred tool definitions are loaded at the *context end* specifically to preserve the cache [TS].
4. Compaction items are opaque, carry-forward objects meant to be passed as-is [OCP].
5. **No source publishes cache cost-impact magnitudes; pricing and TTLs are provider-specific** (Chapter 4).

**Decision rules.**
- **The prefix is byte-stable or the cache does not exist.** S-1 is binary.
- **Everything that varies per turn goes in the suffix.** S-2, no exceptions.
- **No timestamps, no turn counters, no relative time, no non-deterministic ordering in the prefix.**
- **Batch compaction; never continuous.** Continuous compaction and caching are mutually exclusive.
- **Personalization lives in the suffix or a per-user namespace**, never the shared prefix.
- **Observe the cache.** A silent hit-rate drop is a silent cost multiplier.

**Production implications.**
1. Instrument cache-hit rate this week; most teams have never looked and are surprised.
2. Run the linter (§6) over your prefix; a single timestamp is a several-fold cost multiplier.
3. Freeze the prefix as an object and assert its hash (Topic 3, V-4); drift becomes a caught error instead of a silent bill.
4. Co-design compaction cadence with caching (Topic 11); continuous compaction throws the lever away.

**Connections.** This topic gives Topic 2's instruction hierarchy its cost rationale (instructions are the cached prefix), constrains Topic 9's placement (dynamic-critical → suffix, not middle), and must be co-designed with Topic 11's compaction (which rewrites the prefix). Topic 3's V-4 asserts prefix stability; Topic 12 budgets the prefix; Chapter 4, Topic 13's version discipline governs the provider-specific cache parameters this topic depends on but does not fix.

## Sources

[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — context caching by "dividing context into stable prefixes (instructions, identity, summaries) and variable suffixes (latest turns, new outputs)"; leveraging "model prefix caching"; "treat cache-friendliness as an architectural constraint using `static instruction` primitives"; **no measured metrics reported** — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[TS] OpenAI, tool-search guide — deferred tool definitions "loaded at the end of the model's context window" as "a design choice that balances efficiency against injection ordering," preserving the prompt cache across requests — https://developers.openai.com/api/docs/guides/tools-tool-search
[OCP] OpenAI, compaction guide — compaction items "opaque and not intended to be human-interpretable"; the returned window passed "as-is"; carry-forward encrypted compaction item — https://developers.openai.com/api/docs/guides/compaction
[ECE] Anthropic, "Effective context engineering for AI agents" — instructions and durable content as the stable region of context — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
