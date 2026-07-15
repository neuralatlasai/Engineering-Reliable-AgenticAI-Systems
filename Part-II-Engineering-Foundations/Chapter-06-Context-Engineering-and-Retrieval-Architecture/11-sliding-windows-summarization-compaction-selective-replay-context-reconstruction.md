# Topic 11 — Sliding Windows, Summarization, Compaction, Selective Replay, and Context Reconstruction

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The context-lifecycle operations that reclaim budget when a long run exhausts it: dropping old turns, summarizing them, compacting the whole window, replaying selectively, and reconstructing context after a reset. This is the Compress stage (Topic 3) at its heaviest, and the mechanism that makes long-horizon agents possible.

**Prerequisites.** Topic 1 (the budget that runs out); Topic 4 (the context types, which compact differently); Topic 10 (caching, which compaction interacts with); Chapter 4, Topic 11 (provider compaction APIs); Chapter 3, Topic 4 (event-sourcing and the compaction risk).

**Terminology.** *Sliding window*: retain the last $w$ turns. *Summarization*: replace turns with a summary. *Compaction*: summarize the whole context and reinitialize [ECE; OCP]. *Selective replay*: reconstruct only the needed subset. *Reconstruction*: rebuild context after a reset from durable sources.

**Boundaries.** Inside: the operations, their fidelity/cost trade, and the invariants that keep them safe. Outside: the durable stores that survive compaction (Chapter 7); the provider API mechanics (Chapter 4).

**Exclusions.** No summarization-model tutorial.

**Outcomes.** The reader can choose a compaction strategy, preserve what must survive it, and reconstruct context after a reset without losing the run.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A long-running agent generates context faster than it consumes budget: "an agent running in a loop generates more and more data that could be relevant" [ECE]. Eventually the accumulated history exceeds $B_{\mathrm{eff}}$ (or the API limit), and the run cannot continue without reclaiming space. Every reclamation loses information; the question is *which* information and *how much*.

**Bottleneck.** Compaction is the most powerful reclamation, and it has a **documented, catastrophic, silent failure**: it can lose specific early instructions [CAL] (Chapter 3, Topic 4). The bottleneck is that the operation which keeps long agents alive is the same operation that can quietly delete their safety instructions, their task definition, or the fact they already tried an approach that failed.

**Objective.** Reclaim budget with a strategy matched to each context type (Topic 4), preserving what must survive (durable instructions; exact-fidelity artifacts) and accepting fidelity loss only where it is safe.

**Assumptions.** Long runs exhaust the budget. Compaction loses information. Some information must not be lost.

**Constraints.** Compaction is itself a model call (cost, latency). It interacts with caching (Topic 10 — a rewritten prefix is a cache miss). Some content cannot be summarized without corruption (Chapter 5, Topic 7).

**Success criteria.** Runs of arbitrary length continue; durable instructions provably survive (Topic 3, V-3); compaction cadence preserves the cache; reconstruction after a reset loses nothing that matters.

## 3. Intuition first, then formalization

### 3.1 Intuition: four operations on a spectrum of aggressiveness

The reclamation operations form a spectrum from surgical to wholesale:

1. **Tool-result clearing** (surgical). Drop resolved retrieved content (Topic 4's T-2). [ECE]: "one of the safest lightest touch forms of compaction." Reclaims a lot, loses almost nothing, because the content was already dead.
2. **Sliding window** (blunt). Keep the last $w$ turns, drop the rest. Simple, and **type-blind** — it will drop the task statement before a recent tool result, which is exactly backwards (Topic 4).
3. **Summarization** (lossy but selective). Replace old turns with a summary. Keeps the gist, loses the detail — and loses it *silently*.
4. **Compaction** (wholesale). Summarize the *entire* window and reinitialize. [ECE]: "summarizing its contents, and reinitiating a new context window with the summary." The heaviest reclamation and the riskiest.

The intuition that orders them: **reclaim the cheapest-to-lose content first.** Tool-result clearing before summarization before compaction. A system that jumps straight to compaction when a `tool_result` clear would have sufficed has taken a catastrophic-risk operation to solve a surgical problem. [ECE]'s framing — start with the "lightest touch" — is the whole discipline.

### 3.2 Formalization: the reclamation objective and the survival invariant

Let context have blocks with signal $\operatorname{signal}(\upsilon)$ and token cost $\mathrm{tok}(\upsilon)$, and let a reclamation operation $\Omega$ produce $\Omega(c)$ with $\mathrm{tok}(\Omega(c))<\mathrm{tok}(c)$. The objective is to lose the least signal per token reclaimed:

$$
\min_{\Omega}\ \frac{\operatorname{signal}(c)-\operatorname{signal}(\Omega(c))}{\mathrm{tok}(c)-\mathrm{tok}(\Omega(c))}
\qquad\text{s.t.}\qquad
\mathrm{tok}(\Omega(c))\le B_{\mathrm{eff}} .
$$

**[derived]** This ranks the operations of §3.1: tool-result clearing has near-zero numerator (dead content) and large denominator — best ratio. Type-blind sliding windows have a bad ratio because they discard high-signal old content (the task) alongside low-signal old content.

The safety invariant, and it is non-negotiable:

$$
\textbf{R-1 (durable survival):}\qquad
\forall\,\Omega,\ \forall\,\upsilon\in\text{DURABLE}:\quad \upsilon\in\Omega(c).
$$

**[derived; enforcement per Topic 4's T-1.]** Compaction is documented to violate R-1 [CAL], so R-1 must be enforced by **re-injection after compaction**, not by trusting the summarizer — Topic 4's `after_compaction` and Topic 3's V-3. This is the single most important line in the topic: **the summarizer will eventually drop your safety instruction, and only explicit re-injection guarantees it comes back.**

The compaction quality objective, from [ECE]:

$$
\textbf{R-2 (recall then precision):}\qquad
\text{maximize recall first (capture every relevant item), then improve precision.}
$$

[ECE] states the tuning order exactly: "start by maximizing recall to ensure your compaction prompt captures every relevant piece of information from the trace, then iterate to improve precision by eliminating superfluous content." **Recall first because a compaction that drops a needed fact is unrecoverable; precision second because superfluous content is merely wasteful.** The asymmetry of the two errors dictates the order.

### 3.3 Reconstruction: compaction is not the only reset

A context reset is not always compaction. An agent process can crash, a session can resume days later, a sub-agent can spawn with a clean window [ECE]. In all these, context must be *reconstructed* from durable sources — and this is where [GCA]'s compiler thesis (Topic 3) pays off: **if context is a compiled view over durable sources, reconstruction is just recompilation.** The session store, memory, and artifacts survive the reset; the pipeline rebuilds the window from them.

The alternative to compaction, and often superior: **structured note-taking.** [ECE] documents the agent "regularly writes notes persisted to memory outside of the context window," which "get pulled back into the context window at later times," providing "persistent memory with minimal overhead." The Claude-plays-Pokémon example is the proof: the agent "maintains precise tallies across thousands of game steps" and, "after context resets, the agent reads its own notes and continues multi-hour training sequences." **Note-taking is compaction the agent does deliberately, in its own words, before the budget forces it** — and because the agent chose what to write, the recall/precision trade was made with task knowledge rather than by a generic summarizer.

## 4. Architecture

```
   budget pressure (n → B_eff)
        │
        ▼  reclaim CHEAPEST-TO-LOSE first (§3.1, R-2's ratio)
   ┌────────────────────────────────────────────────────────────────┐
   │ 1. TOOL-RESULT CLEARING   dead retrieved content (T-2)          │
   │    [ECE]: "safest lightest touch"                               │
   ├────────────────────────────────────────────────────────────────┤
   │ 2. SLIDING WINDOW         drop oldest — but TYPE-AWARE           │
   │    (never drop DURABLE or the task; Topic 4)                    │
   ├────────────────────────────────────────────────────────────────┤
   │ 3. SUMMARIZE OLD TURNS    recall-first (R-2); write summary      │
   │    BACK as a new event [GCA]; retain originals in the store      │
   ├────────────────────────────────────────────────────────────────┤
   │ 4. COMPACTION             whole window → summary + reinit        │
   │    [ECE; OCP].  THEN re-inject durables (R-1).  Batch it (T10).  │
   └────────────────────────────────────────────────────────────────┘
        │
        ▼
   RECONSTRUCTION (crash / resume / sub-agent):
     recompile from durable sources (session, memory, artifacts) [GCA]
     + agent's own NOTES [ECE]

   PARALLEL PATH — note-taking (proactive, agent-chosen):
     agent writes notes → memory (outside window) → pulled back later [ECE]
```

**Provider compaction, as shipped** [OCP]: server-side compaction triggers "automatically when rendered token count crosses `compact_threshold`," embedding "an encrypted compaction item" in the response stream; or a standalone `/responses/compact` endpoint accepts the full window and returns a compacted one. Critically: the compaction item is "opaque and not intended to be human-interpretable," and the returned window "should not be pruned; pass returned window as-is." **The provider handles the mechanics; it does not handle R-1** — durable-instruction survival is still your responsibility, because the provider's summarizer has no way to know which of your instructions are load-bearing.

**Sub-agents as compaction by architecture** [ECE]. A sub-agent "might explore extensively, using tens of thousands of tokens or more, but returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)." This is compaction *without the risk to the main agent's context* — the detailed exploration never entered the lead agent's window, so there is nothing to lose there. It is the cleanest reclamation strategy available and it is why Chapter 8's orchestration patterns are also context patterns.

## 5. Grounding

- **Compaction, defined:** "taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window with the summary"; it "distills the contents of a context window in a high-fidelity manner, enabling the agent to continue with minimal performance degradation" [ECE].
- **Recall-then-precision tuning:** "start by maximizing recall to ensure your compaction prompt captures every relevant piece of information from the trace, then iterate to improve precision by eliminating superfluous content" [ECE] — R-2, verbatim.
- **Tool-result clearing as lightest touch:** "one of the safest lightest touch forms of compaction" [ECE].
- **Structured note-taking:** the agent "regularly writes notes persisted to memory outside of the context window"; "persistent memory with minimal overhead"; the Pokémon example ("precise tallies across thousands of game steps"; "after context resets, the agent reads its own notes and continues multi-hour training sequences") [ECE].
- **Sub-agent distillation:** "tens of thousands of tokens or more" explored, "1,000-2,000 tokens" returned; "the detailed search context remains isolated within sub-agents" [ECE].
- **Provider compaction mechanics:** `compact_threshold`, server-side auto-trigger, standalone `/responses/compact`, opaque carry-forward items, "pass returned window as-is," `store=false` ZDR [OCP].
- **Summaries written back as events:** [GCA] compaction "summarize[s] older events over a sliding window" and "writes summaries back as new Session events," pruning raw events — the compiler thesis upheld (the summary is a new source, not a window mutation).
- **The documented catastrophic risk:** compaction can lose specific early instructions [CAL] (Chapter 3, Topic 4) — R-1's entire justification.
- **Reconstruction from durable sources:** [GCA]'s four-tier model makes the session/memory/artifacts durable and the window recompilable (Topic 3).

**Evidence gap.** [ECE] claims compaction proceeds "with minimal performance degradation" but **publishes no measurement** of the degradation, no fidelity curve, and no comparison of strategies. [OCP] gives an *example* threshold (200,000 tokens) with no derivation. **No source quantifies how much a run degrades per compaction, or how many compactions a run survives before quality collapses.** The recall/precision trade (R-2) is stated as a tuning procedure, not a measured result. §8 is how you get the degradation curve for your system; no source provides it.

## 6. Implementation

**Escalating reclamation — cheapest-to-lose first (§3.1):**

```python
def reclaim(ctx, budget) -> Context:
    """Escalate only as far as needed. Jumping to compaction for a tool-result-clear
    problem takes a catastrophic-risk operation to a surgical job."""
    if ctx.tokens <= budget.eff:
        return ctx

    ctx = clear_resolved_tool_results(ctx)          # 1. T-2 — [ECE] "lightest touch"
    if ctx.tokens <= budget.eff:
        return ctx

    ctx = summarize_old_turns(ctx, keep_recent=RECENT_W)   # 3. recall-first (R-2)
    if ctx.tokens <= budget.eff:
        return ctx

    return compact(ctx, budget)                     # 4. wholesale — then R-1 (below)

def summarize_old_turns(ctx, keep_recent) -> Context:
    old = ctx.turns[:-keep_recent]
    summary = model.summarize(old, prompt=RECALL_FIRST_PROMPT)   # R-2
    ctx.store.append_event(SummaryEvent(summary, replaces=old))  # write BACK [GCA]
    # Originals retained in the store — never summarize a summary (Topic 4).
    return ctx.with_turns([summary_block(summary)] + ctx.turns[-keep_recent:])
```

**Compaction with R-1 enforcement — the non-negotiable step:**

```python
def compact(ctx, budget) -> Context:
    summary = model.summarize(ctx.window, prompt=RECALL_FIRST_PROMPT)   # R-2
    new_ctx = Context(prefix=ctx.prefix, body=[summary_block(summary)])

    # R-1: compaction is DOCUMENTED to lose early instructions [CAL].
    # Re-inject durables explicitly. Do NOT trust the summary to have kept them.
    for d in ctx.durable_instructions:
        if d.content not in new_ctx.text:
            new_ctx = new_ctx.prepend(d)
    assert all(d.content in new_ctx.text for d in ctx.durable_instructions), \
        "R-1 VIOLATED: durable instruction lost to compaction"     # Topic 3, V-3

    return new_ctx
```

**Structured note-taking — proactive, agent-chosen compaction [ECE]:**

```python
NOTE_TOOL = ToolContract(
    name="write_note",
    description=(
        "Record durable progress, decisions, and findings to your persistent notes. "
        "Notes survive context compaction and resets. Write down: what you've tried, "
        "what worked, what failed, and key facts you'll need later. "
        "Do this BEFORE the context fills — you choose what matters, not a summarizer."
    ),
    effect=Effect.WRITE_REVERSIBLE, ...)

def reconstruct_after_reset(session_id, budget) -> Context:
    """A reset is recompilation from durable sources (Topic 3's thesis) + notes [ECE]."""
    sources = load_durable_sources(session_id)      # session, memory, artifacts [GCA]
    notes = load_agent_notes(session_id)            # the agent's own words [ECE]
    return pipeline.build(sources.with_notes(notes), budget)   # Topic 3
```

## 7. Trade-offs

| Operation | Reclaim | Fidelity loss | Risk | Cache impact (Topic 10) |
|---|---|---|---|---|
| Tool-result clearing | High | ~None (dead content) | Low | Suffix change — cache safe |
| Sliding window | Medium | High if type-blind | Drops the task | Suffix — safe |
| Summarization | High | Medium (silent) | Detail loss | Prefix if summary is early — care |
| Compaction | **Highest** | High | **R-1 loss [CAL]** | **Rewrites prefix — batch it** |
| Note-taking [ECE] | Proactive | Agent-chosen | Low (agent picks) | Notes in suffix — safe |
| Sub-agent isolation [ECE] | **Highest, safe** | None to lead | Summary fidelity | Lead context untouched |

**The two trades that matter most.**

**Compaction cadence vs caching.** Compaction rewrites the prefix, and a rewritten prefix is a full cache miss (Topic 10). **Continuous compaction and prompt caching are mutually exclusive.** Batch compaction — run it infrequently, at a threshold, so the prefix is stable *between* compactions and the cache amortizes. This is why Topics 10 and 11 must be co-designed, and why [OCP]'s threshold-triggered model (compact at `compact_threshold`, not every turn) is the right shape.

**Note-taking vs compaction.** Compaction is *reactive* (the budget forced it) and *generic* (a summarizer that does not know the task chose what to keep). Note-taking is *proactive* (before the crunch) and *informed* (the agent, mid-task, chose what mattered). [ECE]'s Pokémon result suggests note-taking can carry a run across *thousands* of steps and multiple resets — further than reactive compaction, because the recall/precision trade was made by something that understood the task. **Prefer note-taking where the agent can be taught to use it; fall back to compaction when it cannot.**

## 8. Experiments

**The degradation curve — the measurement [ECE] asserts and does not publish.** Run a long task requiring information from early turns; force compaction at intervals; measure task completion as a function of *number of compactions survived*. **Output: how many compactions your run tolerates before quality collapses** — the number behind [ECE]'s "minimal performance degradation" claim, which no source quantifies.

**R-1 test — the safety one.** Force compaction; assert every durable instruction survives (§6). **Detection rate must be 100%.** [CAL] documents the loss is real; a system that has never run this test does not know whether its safety instruction is in the window at compaction number 5. This is Topic 3's V-3, exercised.

**Strategy ablation.** Arms: sliding window / summarization / compaction / note-taking. Same long task. Metrics: completion $G$, tokens, cost (including the summarization calls), and **early-fact recall** (can the agent still answer a question about turn 2 at turn 200?). **Prediction: note-taking and sub-agent isolation dominate on early-fact recall**, because they never lost the fact in the first place.

**Cadence ablation (co-designed with Topic 10).** Continuous vs threshold-batched compaction. Metrics: cache-hit rate, cost, completion. **Prediction: continuous compaction tanks cache-hit rate** (Topic 10); batched preserves it at similar completion.

**Reconstruction test.** Kill the process mid-run; reconstruct from durable sources + notes (§6); measure how much the run loses. **This is Chapter 3, Topic 9's recovery test at the context layer** — and the only way to know your reconstruction works is to break the process and watch.

**Statistics.** Task-clustered bootstrap on completion; Wilson on early-fact recall; report cost including summarization overhead; non-inferiority margins for "note-taking is no worse than full history" (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Durable instruction lost to compaction.** Documented [CAL], silent, catastrophic — the agent forgets its safety rule or its task at compaction number 4. **The defining hazard of the topic.** Mitigation: R-1 re-injection + V-3 assertion. Never trust the summarizer.
- **Type-blind sliding window.** Drops the task statement before a stale tool result (Topic 4). Mitigation: type-aware reclamation.
- **Compaction when a tool-result-clear would do.** Catastrophic-risk operation for a surgical job. Mitigation: escalate cheapest-first (§6).
- **Continuous compaction.** Destroys the cache (Topic 10). Mitigation: batch at a threshold.
- **Summarizing a summary.** Compounding fidelity loss across repeated compactions (Topic 4). Mitigation: retain originals in the store; summarize from originals, not from prior summaries.
- **Summarizing exact-fidelity content.** A patch, a config, an ID list corrupted by lossy compression (Chapter 5, Topic 7). Mitigation: mark EXTERNAL and handle-ize (Topic 4); never summarize.
- **Precision-first compaction.** Tuning for brevity before recall; drops a needed fact unrecoverably. Mitigation: R-2 — recall first, always.
- **Notes the agent never writes.** Note-taking offered but not used because the tool description did not make it habitual. Mitigation: strong affordance in $d_u$ (Chapter 5, Topic 4); the Pokémon result depended on the agent actually noting.
- **Reconstruction that loses the run.** A reset from durable sources that were never durable enough. Mitigation: the reconstruction test (§8); ensure notes and session capture what the window held.
- **Edge case — the un-summarizable run.** A task whose every detail matters (a precise multi-step calculation). Compaction corrupts it; the answer is decomposition (Topic 7) or sub-agent isolation, not summarization.
- **Open limitation.** **No source quantifies compaction's performance degradation, fidelity loss, or how many compactions a run survives.** [ECE]'s "minimal degradation" is an unquantified claim. The strategy choice is guided by mechanism and by §8's local measurement, not by published effect sizes — the same honest limit as every measurement topic in this chapter.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Compaction summarizes a full window and reinitializes, "with minimal performance degradation" [ECE] — degradation unquantified.
2. Compaction tuning is recall-first, then precision [ECE] — R-2.
3. Tool-result clearing is "one of the safest lightest touch forms of compaction" [ECE].
4. Structured note-taking gives "persistent memory with minimal overhead" and carried a run across "thousands of game steps" and multiple resets [ECE].
5. Sub-agents return 1,000–2,000-token summaries from tens of thousands explored, isolating detail from the lead [ECE].
6. Provider compaction is threshold-triggered, produces opaque carry-forward items, and must be passed "as-is" [OCP].
7. Summaries are written back as new events, not window mutations [GCA].
8. **Compaction can lose specific early instructions** [CAL] — the R-1 hazard.
9. **No source quantifies degradation, fidelity, or compaction survivability.**

**Decision rules.**
- **Re-inject durable instructions after every compaction and assert their survival.** Never trust the summarizer (R-1).
- **Escalate cheapest-to-lose first:** tool-result clearing → sliding window → summarize → compact.
- **Recall before precision** in every compaction prompt (R-2).
- **Batch compaction; never continuous.** It is mutually exclusive with caching.
- **Never summarize a summary, or exact-fidelity content.**
- **Prefer note-taking where the agent can be taught it** — proactive, informed, and it carries runs further.

**Production implications.**
1. Add R-1 re-injection and V-3 assertion today — [CAL] says the loss is real and silent, and this is the assertion that catches it.
2. Run the degradation curve (§8); "minimal degradation" is unquantified and your run's survivable-compaction count is a real operating limit.
3. Co-design cadence with caching (Topic 10); continuous compaction throws away the chapter's largest cost lever.
4. Ship note-taking with a strong tool affordance; it is [ECE]'s most durable long-horizon result.
5. Run the reconstruction test by killing the process; recovery you have not tested is recovery you do not have (Chapter 3, Topic 9).

**Connections.** This is Topic 3's Compress stage at full weight and Topic 4's type taxonomy in action (each type reclaims differently). It is co-designed with Topic 10 (cadence vs cache) and enforces Topic 3's V-3. Note-taking and reconstruction lead into **Chapter 7** (memory as the durable substrate) and **Chapter 10** (long-running agents, checkpointing, recovery — where this topic's operations become the survival mechanism). Sub-agent isolation is **Chapter 8**. Chapter 4, Topic 11's provider compaction APIs are the mechanics this topic drives.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — compaction ("taking a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window with the summary"; "distills the contents… in a high-fidelity manner, enabling the agent to continue with minimal performance degradation"); recall-then-precision tuning ("start by maximizing recall… then iterate to improve precision by eliminating superfluous content"); "tool result clearing" as "one of the safest lightest touch forms of compaction"; structured note-taking ("regularly writes notes persisted to memory outside of the context window"; "persistent memory with minimal overhead"; Claude plays Pokémon — "precise tallies across thousands of game steps," "after context resets, the agent reads its own notes and continues multi-hour training sequences"); sub-agent architectures ("tens of thousands of tokens or more"; "1,000-2,000 tokens"; "the detailed search context remains isolated within sub-agents") — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[OCP] OpenAI, compaction guide — `compact_threshold`; server-side auto-triggered compaction; standalone `/responses/compact`; "opaque and not intended to be human-interpretable" compaction items; "should not be pruned; pass returned window as-is"; example 200,000-token threshold; `store=false` ZDR — https://developers.openai.com/api/docs/guides/compaction
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — compaction "summarize[s] older events over a sliding window," "writes summaries back as new Session events," prunes raw events; reconstruction from durable Session/Memory/Artifacts — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CAL] Claude Agent SDK — compaction replacing older model-visible history with a summary; the documented loss of specific early instructions — https://code.claude.com/docs/en/agent-sdk/agent-loop
