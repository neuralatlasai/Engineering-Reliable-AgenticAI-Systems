# Topic 9 — Lost-in-the-Middle, Attention Dilution, Irrelevant-Context Interference, and Tool-Schema Saturation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The failures of *assembled* context — not wrong content (Topic 8) but correctly-selected content that the model nonetheless fails to use, because of *where* it sits, *how much* surrounds it, and *what* competes with it. This is Topic 1's context rot, made specific and actionable.

**Prerequisites.** Topic 1 (the attention budget and $\partial P/\partial n|_s<0$); Topic 3 (the Assemble stage, where position is decided); Chapter 5, Topic 15 (tool-schema saturation — one of this topic's four failures).

**Terminology.** *Lost-in-the-middle*: degraded use of information positioned in the middle of a long context. *Attention dilution*: reduced attention per token as token count grows. *Interference*: irrelevant content degrading use of relevant content. *Tool-schema saturation*: tool definitions crowding and confusing (Chapter 5, Topic 15).

**Boundaries.** Inside: the four attention-side failures and the assembly decisions that mitigate them. Outside: the resource model itself (Topic 1); the compaction that reclaims budget (Topic 11).

**Exclusions.** No attention-mechanism internals beyond the $n^2$ fact.

**Outcomes.** The reader can make *position* and *quantity* explicit assembly decisions, and can detect each of the four failures with a targeted probe.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Topics 5–7 worked to get the *right* content into the window. This topic is about the content being right and the model *still failing to use it* — because it landed in the middle of 100k tokens, or because 50 low-signal documents surround it, or because 80 tool definitions dilute the attention it needs. The content is correct; the assembly wasted it.

**Bottleneck.** Assembly (Topic 3) is usually treated as concatenation — join the blocks in whatever order they arrived. But **position is a performance variable** and **quantity is a performance variable**, and a pipeline that ignores both leaves measurable capability on the table. The specific, sourced mechanism is context rot: recall "decreases" as tokens increase, from $n^2$ attention producing "reduced precision for information retrieval and long-range reasoning" [ECE].

**Objective.** Make position and quantity explicit, measured assembly decisions: put high-signal content where attention is strongest, keep total tokens near $B_{\mathrm{eff}}$, and remove interfering content even when it "might help."

**Assumptions.** Attention degrades with length and is unevenly distributed by position [ECE, directionally].

**Constraints.** The exact position-sensitivity and degradation curves are model-specific and unpublished [ECE].

**Success criteria.** Position and quantity are chosen deliberately and measured (Topic 13); each of the four failures is probed and bounded.

## 3. Intuition first, then formalization

### 3.1 Intuition: not everything in the window is used equally

The storage model (Topic 1) assumes the window is uniform — a token is a token, wherever it sits. It is not. Two independent non-uniformities, both consequences of the attention mechanism [ECE]:

**Position matters.** Information in the *middle* of a long context is used less reliably than information at the start or end. The colloquial name is "lost-in-the-middle," and while [ECE] does not use that phrase, its mechanism — $n^2$ attention, "reduced precision for information retrieval… at longer contexts" — is exactly what produces it. The engineering consequence: **the critical fact should not be buried in the middle of the history.**

**Quantity matters, even for signal.** Every added token dilutes attention to every other token (Topic 1, $\partial P/\partial n|_s<0$). This means *interference* is real: 50 marginally-relevant documents do not just waste budget, they **actively degrade** the model's use of the 3 relevant ones, by competing for attention. [ECE]'s rule — "the smallest set of high-signal tokens" — is a direct instruction to *remove* content that is not clearly helping, because neutral content is not neutral; it interferes.

The fourth failure, **tool-schema saturation**, is the same mechanism applied to a specific content type: tool definitions are tokens too, and 80 of them dilute attention and confuse selection (Chapter 5, Topic 15). This topic is where that chapter's saturation result rejoins context engineering: **the tool surface is part of the context budget, and it saturates the same way retrieved documents do.**

### 3.2 Formalization: position weight and interference

Model the model's effective use of a block as a product of its intrinsic signal, a **position weight**, and an **interference discount** **[derived — a schematic capturing [ECE]'s two stated non-uniformities; not a claim about internals]**:

$$
\operatorname{use}(\upsilon\mid c_t)\ \approx\ \operatorname{signal}(\upsilon)\ \cdot\ \underbrace{w\bigl(\operatorname{pos}(\upsilon),\,n\bigr)}_{\text{position weight}}\ \cdot\ \underbrace{\frac{1}{1+\delta\,(n-\mathrm{tok}(\upsilon))}}_{\text{interference}} ,
$$

with two sourced properties:

$$
\textbf{A-1 (position):}\quad w(\text{start},n),\ w(\text{end},n)\ >\ w(\text{middle},n),\ \text{and the gap widens with } n .
$$
$$
\textbf{A-2 (dilution):}\quad \frac{\partial\,\operatorname{use}(\upsilon)}{\partial n}<0\quad\text{even holding } \operatorname{signal}(\upsilon)\ \text{fixed (Topic 1).}
$$

A-1 says **placement is a lever**: the same block is worth more at the edges than in the middle. A-2 says **removal is a lever**: cutting interfering content raises the use of what remains, so *less context can mean better performance*. Both are counterintuitive under the storage model and both follow directly from [ECE]'s stated mechanism.

The design consequences **[derived]**:

- **Put durable instructions and the current task at the edges** (start: the stable prefix, Topic 2/10; end: recency), not buried mid-history.
- **Put the single most critical retrieved fact near the end**, where recency weight is high and it is closest to the generation point.
- **Remove interfering content aggressively** — the interference term means a marginal document's *net* effect can be negative even if its signal is positive.

### 3.3 The four failures, unified

| Failure | Mechanism | Lever |
|---|---|---|
| **Lost-in-the-middle** | A-1: middle positions under-attended | *Placement*: critical content to the edges |
| **Attention dilution** | A-2: per-token attention falls with $n$ | *Quantity*: keep $n$ near $B_{\mathrm{eff}}$ |
| **Interference** | A-2 applied to noise: irrelevant tokens degrade relevant ones | *Removal*: cut marginal content even if it "might help" |
| **Tool-schema saturation** | A-2 + selection ambiguity on tool defs (Ch.5 T15) | *Deferral/consolidation* (Ch.5 T6, T15) |

**All four are one phenomenon** — finite attention, non-uniformly distributed — with three levers: **placement, quantity, removal.** That unification is the topic's contribution: teams treat these as four separate problems and reach for four separate hacks, when the discipline is one (spend the attention budget deliberately) and the measurement is one (Topic 13's utilization metric).

## 4. Architecture

```
   ASSEMBLE stage (Topic 3) — position is a DECISION, not an accident
   ┌──────────────────────────────────────────────────────────────────┐
   │  [START — high attention weight (A-1)]                            │
   │    durable instructions (stable prefix, Topic 2/10)               │
   │    ── most-critical retrieved fact can also anchor here ──         │
   │                                                                    │
   │  [MIDDLE — lowest weight; put the LEAST critical bulk here]        │
   │    older history (summarized), supporting evidence                 │
   │                                                                    │
   │  [END — high weight, closest to generation (A-1)]                 │
   │    current task · most-relevant retrieved fact · recent turns     │
   └──────────────────────────────────────────────────────────────────┘
        │
        │  and keep total n near B_eff (A-2) — REMOVAL is a lever:
        │    tool defs:  defer/consolidate  (Ch.5 T6/T15)
        │    evidence:   density floor      (Topic 5)
        │    history:    compact            (Topic 11)
        ▼
   VALIDATE: signal density ≥ threshold (Topic 3, V-5)
```

**The placement tension with the cache.** There is a real conflict here, and it must be named: A-1 wants the *most critical dynamic fact* near the end, but prompt caching (Topic 10) wants the *prefix* stable. These do not actually collide — the stable prefix holds *durable* content (instructions, identity), and the dynamic critical fact goes in the *variable suffix* near the end. **Durable-and-critical goes at the start (and is cached); dynamic-and-critical goes at the end (and is not).** The failure is putting dynamic critical content in the *middle*, which loses on both axes: low attention weight *and* no cache benefit.

## 5. Grounding

- **Context rot, the parent mechanism:** recall "decreases" as tokens increase; "emerges across all models"; caused by $n^2$ attention; produces "reduced precision for information retrieval and long-range reasoning compared to their performance on shorter contexts" [ECE]. **A-1 and A-2 are this claim, decomposed into position and quantity.**
- **The removal lever, stated as the core rule:** "the smallest set of high-signal tokens that maximize the likelihood of your desired outcome"; "minimal does not necessarily mean short" [ECE]. The instruction to *minimize* is the instruction to remove interfering content.
- **Tool-schema saturation, sourced twice:** [ECE] names "bloated tool sets that cover too much functionality or lead to ambiguous decision points about which tool to use" as a failure; Chapter 5, Topic 15 is the full treatment ("More tools don't always lead to better outcomes" [WTA]; the single-peaked curve). **This topic and Chapter 5, Topic 15 are the same result from two directions** — the tool surface is context, and context saturates.
- **The attention-budget frame:** finite "working memory," an "attention budget" that "depletes with each token" [ECE] — the resource whose non-uniform distribution produces all four failures.
- **The compaction motivation:** compaction exists precisely because unbounded context triggers these failures — it "distills the contents of a context window in a high-fidelity manner, enabling the agent to continue with minimal performance degradation" [ECE] (Topic 11).
- **Sub-agents as an interference control:** isolating detailed search context "within sub-agents, while the lead agent focuses on synthesizing" [ECE] is *interference removal by architecture* — the lead agent never sees the tens of thousands of exploration tokens, only the 1,000–2,000-token summary (Topic 11; Chapter 8).

**Evidence gap, and it is the same one as Topic 1.** **[ECE] gives direction and mechanism, not magnitude.** It does not publish a position-sensitivity curve, a lost-in-the-middle effect size, an interference coefficient, or a saturation threshold — and it explicitly notes degradation rates "vary" across models. **Every specific number about position or dilution in circulation is either measured on one system or invented.** A-1 and A-2 are reliable as *directions*; their *sizes* for your model are knowable only through §8. This is stated plainly because the surrounding engineering is confident and the evidence underneath it is directional.

## 6. Implementation

**Position-aware assembly:**

```python
def assemble(blocks: list[TypedBlock], task: str, budget: int) -> str:
    """A-1: edges are high-attention; the middle is where content goes to be ignored.
    Place deliberately."""
    durable   = [b for b in blocks if b.ctype is ContextType.DURABLE]
    critical  = [b for b in blocks if b.is_critical]          # the answer-bearing evidence
    supporting = [b for b in blocks if b not in durable and b not in critical]

    # START: durable (also the cache prefix — Topic 10). END: task + critical fact.
    return "\n\n".join([
        *[b.render() for b in durable],                       # start — cached, high weight
        *[b.render() for b in sorted(supporting, key=age)],   # middle — least critical bulk
        most_critical_fact(critical).render(),                # end — high weight, near gen
        f"<current_task>\n{task}\n</current_task>",            # end — recency
    ])
```

**Interference removal — the counterintuitive lever:**

```python
def remove_interference(blocks, budget, floor=RELEVANCE_FLOOR) -> list:
    """A-2: a marginal block's NET effect can be negative (its dilution exceeds its signal).
    Removing 'might help' content RAISES use of what remains. Less can be more."""
    scored = [(b, b.signal / b.tokens) for b in blocks]       # density (Topic 1)
    kept, used = [], 0
    for b, density in sorted(scored, key=lambda x: -x[1]):
        if density < floor:
            break            # below the floor, this block INTERFERES more than it informs
        if used + b.tokens > budget:
            break
        kept.append(b); used += b.tokens
    return kept              # deliberately smaller than "everything that fit"
```

**Tool-schema saturation control (Chapter 5, Topics 6, 15) — because tool defs are context:**

```python
def bound_tool_context(tools, visible_budget, model) -> list:
    tool_tokens = sum(count_tokens(t.definition, model) for t in tools)
    if tool_tokens > visible_budget:
        # Tool defs are diluting task attention (A-2). Defer schemas (Ch.5 T6) or
        # consolidate (Ch.5 T15). This is the SAME budget as retrieved evidence.
        return defer_tool_schemas(tools)
    return tools
```

## 7. Trade-offs

| Lever | Buys | Costs |
|---|---|---|
| Edge placement (A-1) | Higher use of critical content | Assembly complexity; interacts with cache (Topic 10) |
| Quantity near $B_{\mathrm{eff}}$ (A-2) | Less dilution; higher use of what remains | Risk of cutting something needed — measure it |
| Interference removal | Higher use of relevant content | **Feels wrong** — you are removing content that "might help" |
| Tool deferral (Ch.5 T6) | Reclaims budget from tool defs | Retriever-recall ceiling; model gating |
| Sub-agent isolation [ECE] | Detailed context never dilutes the lead | Coordination overhead; summary fidelity loss |

**The trade that requires the most discipline.** Interference removal means **deleting correct, relevant-ish content to improve performance** — and it feels like sabotage. The engineer's instinct is that more information cannot hurt; A-2 says it can and does. The only way to hold this line is measurement: the §8 interference ablation *shows* that removing marginal content raises completion, and without that evidence the content creeps back in, one "might help" document at a time. **This is Chapter 5, Topic 15's accretion, at the evidence layer.**

## 8. Experiments

**Lost-in-the-middle probe (A-1) — the position experiment.** Plant one critical fact; vary its *position* (start / middle / end) at fixed total length; measure recall. **Prediction: a middle dip that deepens with total length.** The output is your model's position-sensitivity curve — the thing [ECE] describes and no source quantifies. If the dip is large, mid-context placement of critical facts is costing you, and Assemble should move them.

**Dilution probe (A-2) — the quantity experiment.** Fix the signal (one critical fact); vary the amount of *irrelevant* surrounding content; measure recall of the fact. **Prediction: monotonic decline** — the same fact, harder to use, purely because of surrounding noise. This is the cleanest possible demonstration that "it fits" is not "it helps," and it is the experiment that justifies interference removal to a skeptical team.

**Interference ablation — the one that changes behavior.** Same tasks, two arms: (a) include all retrieved documents above a low relevance bar; (b) include only high-density documents (aggressive floor). Metrics: completion $G$, tokens. **Prediction: (b) matches or beats (a)'s completion at far fewer tokens.** If it does, you have proven that *less context is better context* on your workload — and you have the evidence to keep marginal content out.

**Tool-schema saturation curve.** This is Chapter 5, Topic 15's experiment, run here as a context experiment: vary the number of visible tool definitions; measure task $\Pr(Z_s)$ and completion on tasks *unrelated* to the added tools. **The single-peaked curve appears in context terms.**

**Metrics: utilization, the metric this topic is really about.** Beyond completion, measure **context utilization** (Topic 13): of the content placed in the window, what fraction did the model actually use (via attribution, Topic 14)? Low utilization at high token count is dilution, quantified.

**Statistics.** Wilson on recall probes; task-clustered bootstrap on completion; non-inferiority margins for the interference ablation (you are claiming "smaller is no worse"); Holm across position/quantity conditions (Chapter 1, Topic 12). Re-run per model — these curves are model-specific [ECE].

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Critical fact in the middle.** Correctly retrieved, poorly placed, under-used. Mitigation: edge placement (A-1); the position probe to find your model's dip.
- **The packed window.** Everything relevant-ish included; attention diluted across all of it; the answer-bearing fact under-attended. Mitigation: quantity near $B_{\mathrm{eff}}$; interference removal.
- **Interference creep.** Marginal documents added one at a time, each "might help," collectively degrading performance. **The accretion failure at the evidence layer.** Mitigation: the interference ablation as standing evidence; a density floor with an owner.
- **Tool-schema saturation.** 80 tool defs diluting task attention and confusing selection. Mitigation: deferral, consolidation (Chapter 5, Topics 6, 15).
- **Placement vs cache conflict, mishandled.** Putting the dynamic critical fact in the prefix (breaks cache) or in the middle (loses attention). Mitigation: durable→start/cached, dynamic-critical→end/uncached, never middle (§4).
- **Utilization unmeasured.** Completion looks fine; utilization is low; the system is one context-length increase away from a silent regression. Mitigation: measure utilization (Topic 13/14).
- **Edge case — genuinely large necessary context.** Whole-document reasoning where everything is somewhat relevant. Here removal has limits; the answer is often *decomposition* (process in chunks, Topic 7) or *sub-agent isolation* [ECE] rather than cramming.
- **Open limitation.** **Position sensitivity, dilution rate, and saturation thresholds are unmeasured in this chapter's sources and vary by model** [ECE]. A-1 and A-2 are directional laws with no published magnitudes. Every number is local (§8) and moves on model change. This is the same honest limit as Topic 1, and it is the reason this topic measures rather than prescribes.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Recall decreases with token count, across all models, from $n^2$ attention — "reduced precision for information retrieval and long-range reasoning" at longer contexts [ECE].
2. The rule is "the smallest set of high-signal tokens," and "minimal does not necessarily mean short" [ECE].
3. "Bloated tool sets" that create "ambiguous decision points" are a named failure [ECE], fully treated in Chapter 5, Topic 15.
4. Sub-agent isolation keeps detailed context out of the lead agent, returning only a 1,000–2,000-token summary from tens of thousands explored [ECE].
5. **The four failures are one phenomenon** — finite, non-uniform attention — with three levers: placement, quantity, removal **[synthesis]**.
6. **No source publishes position or dilution magnitudes; they vary by model** [ECE].

**Decision rules.**
- **Place critical content at the edges, never the middle.** The middle is where content goes to be ignored.
- **Keep total tokens near $B_{\mathrm{eff}}$.** Dilution is real even for signal.
- **Remove marginal content even when it "might help."** Its net effect can be negative.
- **Tool definitions are part of the context budget** and saturate like everything else.
- **Durable-critical → start (cached); dynamic-critical → end (recency); never middle.**
- **Measure utilization, not just completion.** Low utilization is a silent regression waiting for a longer context.

**Production implications.**
1. Run the position probe (§8); it gives you the lost-in-the-middle curve [ECE] describes and no source quantifies, and it tells Assemble where to put the answer.
2. Run the interference ablation; it produces the evidence that lets you *keep marginal content out* against the instinct to include everything.
3. Make position an explicit field in your assembly, not an accident of arrival order.
4. Put tool-definition tokens on the same budget dashboard as retrieved evidence — they are the same resource (Chapter 5, Topic 6).

**Connections.** This topic is Topic 1's context rot made specific and Topic 3's Assemble stage made deliberate. Its removal lever is Topic 5's density objective and Topic 11's compaction trigger. Tool-schema saturation is Chapter 5, Topic 15, rejoining context engineering. Topic 10's cache constrains where placement can go; Topics 13–14 measure utilization, which is this topic's true metric. Chapter 8's sub-agent patterns are interference removal by architecture.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — context rot ("as token count increases, the model's ability to accurately recall information from that context decreases"; "emerges across all models"); the $n^2$ attention mechanism and "reduced precision for information retrieval and long-range reasoning compared to their performance on shorter contexts"; the attention budget and working-memory analogy; "the smallest set of high-signal tokens"; "minimal does not necessarily mean short"; "bloated tool sets that cover too much functionality or lead to ambiguous decision points about which tool to use"; compaction "with minimal performance degradation"; sub-agent isolation returning "1,000-2,000 tokens" summaries from "tens of thousands of tokens" explored — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[WTA] Anthropic, "Writing effective tools for agents" — "More tools don't always lead to better outcomes"; tool-schema saturation (full treatment in Chapter 5, Topic 15) — https://www.anthropic.com/engineering/writing-tools-for-agents
