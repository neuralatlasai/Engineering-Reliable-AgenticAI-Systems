# Topic 6 — Shared Context versus Private Context

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The context-sharing decision, which is **the multi-agent architecture's load-bearing choice** — because private context *is* the mechanism (Topic 1), and every byte you share erodes it. This topic covers what must be shared, what must not, and the one thing that flows *up* rather than *down*.

**Prerequisites.** Topic 1 (context isolation is the mechanism); Topic 3 (RA-2: subagent context strictly smaller); Chapter 6, Topic 1 (context rot — why one window cannot hold everything); Chapter 6, Topic 11 (sub-agent distillation).

**Terminology.** *Private context*: an agent's own window, unseen by others. *Shared context*: content propagated to multiple agents. *Distillation*: the compressed summary a subagent returns upward [ECE; MAR].

**Boundaries.** Inside: the sharing decision, its cost model, and the up/down asymmetry. Outside: authority (Topic 3); communication mechanics (Topic 7); the persistence behind shared state (Chapter 7).

**Exclusions.** No distributed-cache design.

**Outcomes.** The reader can decide what to share, knows that the default (`fork_turns` propagating everything) destroys the architecture's value, and understands why information flows *down as tasks* and *up as distillations*.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Topic 1 established the mechanism: **subagents "operat[e] in parallel with their own context windows, exploring different aspects… before condensing the most important tokens for the lead"** [MAR]. **The benefit is that each agent's window is small and focused.** But agents need *some* shared understanding — the task, the constraints, what the others are doing (Topic 5's boundaries) — and every byte of that shared context is a byte in *every* agent's window.

**Bottleneck.** The default is catastrophic and invisible. **[OMA]'s `fork_turns` "controls how much context you want to propagate to your sub-agents"** [OMA] — and if it propagates the full conversation, **every subagent carries the lead's entire window.** You then have $n$ agents each holding the context a single agent would have held, at $n\times$ the cost, **with the context-rot problem (Chapter 6, Topic 1) *unchanged* in each of them.** **You have paid 15× for nothing.**

**And this is exactly [MAR]'s second disqualifier**: multi-agent is a poor fit for "domains that require all agents to share the same context" [MAR] — because in that case, **there is no benefit to extract.**

**Objective.** Share the minimum that coordination requires; keep exploration private; and structure information flow so that **tasks flow down and distillations flow up** — never raw context in either direction.

**Assumptions.** Context is finite and rots (Chapter 6, Topic 1). Sharing is transitive: shared context is in *every* recipient's window.

**Constraints.** Some sharing is mandatory (the task, the boundaries). Too little and subagents duplicate or misinterpret (Topic 5).

**Success criteria.** Subagent context is strictly and substantially smaller than the lead's; the multi-agent benefit is measurable (not just assumed); no raw exploration context crosses an agent boundary in either direction.

## 3. Intuition first, then formalization

### 3.1 Intuition: sharing is multiplied, distillation is compressed

**The asymmetry that organizes everything:** shared context is paid **$n$ times** (once per agent); a distillation is paid **once**.

- **Downward (lead → subagents):** anything you share goes into *every* subagent's window. A 5,000-token shared brief across 10 subagents costs 50,000 tokens — **and, worse, it consumes 5,000 tokens of each subagent's *effective budget* (Chapter 6, Topic 1's $B_{\mathrm{eff}}$), which is the scarce resource the architecture exists to multiply.** **Sharing downward is expensive in the currency you are trying to save.**

- **Upward (subagents → lead):** each subagent explores in a large private window and returns a *small* summary. [ECE] quantifies this: a subagent "might explore extensively, using **tens of thousands of tokens** or more, but returns only a condensed, distilled summary of its work (often **1,000-2,000 tokens**)" [ECE]. **The compression ratio is roughly 10–20×, and it is the architecture's engine.**

**So the design rule writes itself: minimize what flows down; compress what flows up; and let *nothing* raw cross a boundary.**

The failure this prevents is the one [MAR] names as a disqualifier: if all agents need the same context, **the downward sharing dominates and the upward compression has nothing to compress** — each agent is just a copy of the lead with extra steps. **Multi-agent's benefit is *asymmetric information*, and a system that equalizes information has thrown it away.**

### 3.2 Formalization: the sharing cost model and the flow invariants

Let $S$ be the shared context (tokens), $P_i$ agent $i$'s private exploration, and $D_i$ its distillation. **[synthesis; the distillation ratio grounded in [ECE]]**

**Total context cost:**

$$
C \;=\; \underbrace{n \cdot |S|}_{\text{shared: paid } n \text{ times}} \;+\; \underbrace{\sum_i |P_i|}_{\text{private exploration}} \;+\; \underbrace{\sum_i |D_i|}_{\text{distillations, paid once each}} .
$$

**The lead's window holds only $|S| + \sum_i |D_i|$ — not $\sum_i |P_i|$.** That is the whole point: **the lead sees $n$ summaries of 1–2k tokens, not $n$ explorations of tens of thousands** [ECE].

Two invariants **[derived]**:

$$
\textbf{SC-1 (minimize the shared prefix — it is multiplied):}\quad
\frac{\partial C}{\partial |S|} = n \quad\Longrightarrow\quad \text{every shared token costs } n\times.
$$

SC-1 is the counterintuitive part: **a token in the shared brief is $n$ times more expensive than a token in one agent's private context.** So the shared context should be *ruthlessly* minimal — the task, the boundaries (Topic 5), and nothing else. **The instinct to "give everyone the full picture so they can coordinate" is exactly backwards: it is the most expensive possible choice, and it destroys the isolation benefit.**

$$
\textbf{SC-2 (raw context never crosses a boundary):}\quad
\text{downward: TASKS (small, specific);}\quad
\text{upward: DISTILLATIONS (compressed);}\quad
\text{never: raw exploration context.}
$$

SC-2 is the flow rule. **A subagent that returns its raw exploration blows up the lead's window** (Chapter 8, Topic 4's supervisor bottleneck — "workers returning raw output defeats the architecture"). **A lead that forwards its raw history blows up every subagent's window.** Both are the same error in opposite directions, and both are the default in naive implementations.

### 3.3 What must be shared — the irreducible minimum

If sharing is $n$-times expensive (SC-1), what *must* be shared? A short list **[synthesis; grounded in [MAR]'s delegation contract]**:

1. **The objective** — what the overall task is, enough for the subagent to interpret its slice. **Not the full conversation.**
2. **The subagent's own task** — objective, output format, tool guidance [MAR].
3. **The boundaries** — what the *other* subagents are covering, so this one does not duplicate (Topic 5's PE-1). **This is the only "what others are doing" information that needs to be shared**, and it is a few lines, not a transcript.
4. **Constraints and policy** — anything that governs *how* the work is done (Chapter 6, Topic 2's durable instructions).

**That is roughly it.** Everything else — the lead's reasoning, the conversation history, the other subagents' findings-in-progress — is either unnecessary or actively harmful (it biases the subagent's exploration toward what has already been found, reducing diversity — Topic 5).

**The last point deserves emphasis: sharing *other subagents' findings* with a subagent reduces diversity.** If subagent 3 sees what subagents 1 and 2 found, it will anchor on them. **Independence is the value** ([OMA]: "comparing independent findings improves coverage"), and **premature sharing destroys independence.** **The findings should meet for the first time at synthesis (Topic 5), not during exploration.**

## 4. Architecture

```
   THE ASYMMETRY: shared context is MULTIPLIED (×n); distillation is COMPRESSED (÷10-20)

                       ┌──────────────────────────────────┐
                       │           LEAD                    │
                       │  window: S + Σ Dᵢ                 │
                       │  ← sees n SUMMARIES (1-2k each),  │
                       │    NOT n EXPLORATIONS (10s of k)  │
                       └───────┬──────────────────▲────────┘
                               │                  │
          DOWNWARD: TASKS      │                  │  UPWARD: DISTILLATIONS
          (small, specific)    │                  │  [ECE]: explores with "tens of
          SC-1: each shared    │                  │  thousands of tokens", returns
          token costs n×       │                  │  "1,000-2,000 tokens" — 10-20×
                               │                  │  compression = THE ENGINE
          THE IRREDUCIBLE      │                  │
          MINIMUM (§3.3):      │                  │
            · the objective    │                  │
            · this subagent's  │                  │
              task             │                  │
            · BOUNDARIES (what │                  │
              others cover)    │                  │
            · constraints      │                  │
          ← NOT the conversation                  │
          ← NOT other subagents' findings         │
            (that would ANCHOR them and           │
             DESTROY diversity — Topic 5)         │
                               │                  │
        ┌──────────────────────┼──────────────────┼──────────────────┐
        ▼                      ▼                  ▼                  ▼
   ┌─────────┐           ┌─────────┐        ┌─────────┐        ┌─────────┐
   │ sub 1   │           │ sub 2   │        │ sub 3   │        │ sub 4   │
   │ PRIVATE │           │ PRIVATE │        │ PRIVATE │        │ PRIVATE │
   │ window  │           │ window  │        │ window  │        │ window  │
   │ (10s of │           │         │        │         │        │         │
   │  1000s) │           │         │        │         │        │         │
   └─────────┘           └─────────┘        └─────────┘        └─────────┘
   ★ [OMA]: "Root and subagents maintain separate contexts. Automatic
     server-side compaction applies independently per agent."

   ⚠ THE DEFAULT KILLS THE ARCHITECTURE:
     `fork_turns` propagating EVERYTHING ⇒ every subagent carries the lead's full
     window ⇒ n copies of the same context, n× the cost, context rot UNCHANGED
     in each ⇒ you paid 15× for NOTHING.
     ← this is [MAR]'s disqualifier #2: "domains that require all agents to share
       the same context"
```

## 5. Grounding

- **The mechanism is private windows:** "Subagents facilitate compression by **operating in parallel with their own context windows**, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent" [MAR].
- **Separate contexts are the design, and compaction is per-agent:** "**Root and subagents maintain separate contexts. Automatic server-side compaction applies independently per agent**" [OMA].
- **Context propagation is an explicit parameter:** **`fork_turns` controls "how much context you want to propagate to your sub-agents"** [OMA] — **the control that determines whether you get the benefit.**
- **The distillation ratio:** a subagent "might explore extensively, using **tens of thousands of tokens** or more, but returns only a condensed, distilled summary of its work (often **1,000-2,000 tokens**)," achieving "clear separation of concerns—the detailed search context remains isolated within sub-agents, while the lead agent focuses on synthesizing and analyzing the results" [ECE].
- **Shared-context domains are a disqualifier:** multi-agent is a poor fit for "domains that require all agents to share the same context" [MAR] — **because the benefit's mechanism is absent.**
- **Independence is the value:** use multi-agent when "**separate context improves focus**" and "**comparing independent findings improves coverage**" [OMA].
- **Artifacts bypass the context entirely:** [MAR]'s appendix pattern — "implement artifact systems where specialized agents can create outputs that persist independently. Subagents call tools to store their work in external systems, then **pass lightweight references back to the coordinator**. This prevents information loss during multi-stage processing and **reduces token overhead**" [MAR]. **This is Chapter 6, Topic 4's handle pattern and Chapter 7, Topic 10's artifact lifecycle, at the agent boundary** — and it is the strongest form of SC-2.
- **Context rot makes the private window valuable:** Chapter 6, Topic 1 (recall degrades as tokens grow) — **the reason a fresh, small window outperforms a shared, large one.**
- **The supervisor bottleneck is the upward failure:** Chapter 8, Topic 4, §3.3 — workers returning raw output saturate the lead's context.

**Evidence gap.** The mechanism (private windows), the parameter (`fork_turns`), the distillation ratio (10–20×), and the disqualifier (shared-context domains) are **all documented** [MAR; OMA; ECE]. **SC-1 and SC-2 are [derived]** — the $n\times$ multiplication of shared context is arithmetic, and the flow rule follows from it. **What is unmeasured: the actual cost of over-sharing.** No source reports what happens to the multi-agent benefit as `fork_turns` increases — **§8's ablation is the measurement, and it is the one that would prove SC-1 empirically.** Also unmeasured: the diversity cost of sharing other subagents' findings (§3.3's anchoring claim is **[synthesis]**).

## 6. Implementation

**The minimal shared brief — every token costs $n\times$ (SC-1):**

```python
def build_subagent_context(lead_ctx, task: SubagentTask, siblings: list[SubagentTask]) -> Context:
    """SC-1: every shared token is paid n TIMES and consumes each subagent's effective
    budget (Ch.6 T1's B_eff) — the scarce resource this architecture exists to MULTIPLY.
    So the shared brief is RUTHLESSLY minimal (§3.3's irreducible list)."""
    return Context(
        objective=lead_ctx.task_objective,          # 1. what the overall task is
        my_task=task,                                # 2. this subagent's slice [MAR]
        boundaries=(                                 # 3. what the OTHERS cover (Topic 5)
            f"Other subagents are covering: {'; '.join(s.objective for s in siblings)}. "
            f"Do NOT investigate those."
        ),
        constraints=lead_ctx.policy,                 # 4. how the work must be done

        # ✗ NOT the conversation history
        # ✗ NOT the lead's reasoning
        # ✗ NOT other subagents' findings-in-progress — that would ANCHOR this subagent
        #   and destroy the DIVERSITY that is the whole point (Topic 5, §3.3)
    )
```

**`fork_turns` — the parameter that decides whether the architecture works [OMA]:**

```python
def configure_forking(lead_ctx, n_subagents: int) -> int:
    """[OMA]'s `fork_turns` 'controls how much context you want to propagate to your
    sub-agents'. The DEFAULT (propagate everything) DESTROYS the architecture:
    n copies of the lead's window, n× cost, context rot unchanged in each."""
    full_context_tokens = count_tokens(lead_ctx.full_history)
    if full_context_tokens * n_subagents > SHARED_BUDGET:
        log.warning(
            f"propagating full context to {n_subagents} subagents = "
            f"{full_context_tokens * n_subagents} tokens of PURE MULTIPLICATION. "
            f"This is [MAR]'s disqualifier #2 ('domains that require all agents to share "
            f"the same context') — you are paying 15× for NO isolation benefit."
        )
    return 0        # propagate NOTHING by default; the brief (above) is what they need
```

**Distillation on the way up (SC-2) — the engine [ECE]:**

```python
async def run_subagent(spec, task, ctx) -> Distillation:
    """SC-2 upward: the subagent explores in tens of thousands of tokens and returns
    1-2k [ECE]. Raw output would saturate the lead's window (Ch.8 T4's supervisor
    bottleneck) and defeat the architecture."""
    raw = await subagent.run(spec, task)             # explores widely — PRIVATE window

    distilled = await subagent.distill(              # 10-20× compression [ECE]
        raw,
        max_tokens=DISTILL_BUDGET,                   # ~1000-2000 [ECE]
        must_include=["findings", "sources", "contradictions", "kappa"],   # Ch.8 T6's O-2
    )
    assert count_tokens(distilled) <= DISTILL_BUDGET, \
        "SC-2 VIOLATED: raw context crossing the boundary saturates the lead"
    return distilled
```

**Artifacts — the strongest form of SC-2 ([MAR]'s appendix pattern):**

```python
async def subagent_with_artifacts(spec, task, ctx) -> Handle:
    """[MAR]: 'Subagents call tools to store their work in external systems, then pass
    lightweight references back to the coordinator. This prevents information loss during
    multi-stage processing and reduces token overhead.'

    This is Ch.6 T4's handle pattern + Ch.7 T10's artifact lifecycle, at the AGENT boundary.
    The full work persists; only a REFERENCE crosses. No information loss AND no token cost."""
    result = await subagent.run(spec, task)
    artifact = await ctx.artifacts.store(result)     # persists independently
    return Handle(id=artifact.id, summary=result.summary(max_tokens=200))   # ~200 tokens up
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| **Minimal shared brief** (SC-1) | **The isolation benefit**; low $n\times$ cost | Subagents may need to ask; risk of misinterpretation |
| Full context propagation | Subagents "have the full picture" | **Destroys the architecture**: $n$ copies, $n\times$ cost, rot unchanged |
| **Distillation upward** (SC-2) | Lead's window stays synthesizable | Information loss in compression |
| Raw output upward | No compression loss | **Saturates the lead** (Chapter 8, Topic 4's bottleneck) |
| **Artifacts + handles** [MAR] | **No loss AND no token cost** | An artifact store; the lead must fetch if needed |
| Sharing findings between subagents | "Coordination" | **Anchoring → destroys diversity** (Topic 5) |

**The trade that is not really a trade: sharing downward.** The instinct — "give every subagent the full context so it can coordinate intelligently" — **is the single most expensive possible choice** (SC-1: $n\times$) **and it destroys the benefit** (each window is now as full as the lead's, so context rot is unchanged). **There is no version of this that is correct.** The subagent needs its task and its boundaries, not the conversation.

**The artifact pattern is the strongest answer and the most underused.** [MAR]'s appendix note — subagents store work externally and pass **lightweight references** — **avoids the distillation trade-off entirely**: no information is lost (the full work persists), and no tokens are spent (only a handle crosses). **This is Chapter 6, Topic 4's external-state type at the agent boundary**, and it should be the default for any subagent output that might be needed in full.

**The genuine trade is minimal-brief vs misinterpretation.** Give too little and the subagent misreads its task (Topic 5's failure). **[MAR]'s four-field delegation contract is the calibration point**: objective, output format, tool guidance, boundaries — **specific enough to prevent misinterpretation, small enough to be affordable $n$ times.**

## 8. Experiments

**The `fork_turns` ablation — the experiment that proves SC-1.** Vary context propagation from **none** (just the brief) to **full** (the lead's entire history). Measure: **total tokens, per-subagent context size, task completion, and — the point — whether the multi-agent benefit survives.**

- **Prediction (SC-1):** at full propagation, **the multi-agent system's advantage over single-agent collapses** — each subagent now carries the lead's window, so there is no fresh-context gain, and you are paying $n\times$ for it.
- **This is the measurement that would prove [MAR]'s disqualifier #2 empirically**, and no source runs it.

**The distillation-ratio sweep.** Vary the distillation budget (200 / 1,000 / 2,000 / 10,000 tokens; [ECE] uses 1–2k). Measure: lead's context size, synthesis quality, and information loss (do the distillations preserve the findings?). **Find the compression point where synthesis quality starts to degrade.**

**The anchoring test (§3.3) — the diversity cost of sharing.** Share subagents 1 and 2's findings with subagent 3 vs keep it independent. **Measure: subagent 3's finding diversity relative to 1 and 2.** **Prediction: sharing anchors it — it will explore adjacent ground rather than new ground**, destroying the independence that is the value [OMA].

**The artifact-vs-distillation comparison.** Subagents return distillations vs artifacts+handles [MAR]. Measure: lead's tokens, information available on demand, and whether the lead ever *fetches* the full artifact. **If the lead rarely fetches, the handle is pure win** (Chapter 6, Topic 4's $\Pr(\text{needed})<1$).

**Statistics.** Paired across `fork_turns` settings; report tokens as a first-class outcome; task-clustered bootstrap on completion; Wilson on diversity metrics (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Full context propagation to subagents.** $n$ copies of the lead's window; $n\times$ cost; context rot unchanged in each; **the architecture's benefit is zero.** **The default failure, and it is invisible** — the system works, it just costs 15× for nothing. Mitigation: SC-1; set `fork_turns` deliberately.
- **Raw output flowing upward.** The lead's window saturates; synthesis degrades (Chapter 8, Topic 4's bottleneck). Mitigation: SC-2 — distill (1–2k [ECE]) or use artifacts+handles [MAR].
- **Sharing findings between subagents mid-exploration.** Anchoring; diversity destroyed; the independence that is the value [OMA] is gone. Mitigation: findings meet at synthesis, not during exploration.
- **Too-minimal brief.** The subagent misinterprets its task (Topic 5's failure). Mitigation: [MAR]'s four-field contract is the calibration.
- **Applying multi-agent to a shared-context domain.** [MAR]'s disqualifier #2 — there is no benefit to extract. Mitigation: Topic 1's disqualifier gate.
- **Distillation losing the contradiction.** The subagent's summary smooths away its own dissenting finding (Topic 5's PE-2, one level down). Mitigation: `must_include=["contradictions"]` in the distillation contract (§6).
- **Distillation losing $\kappa$.** The subagent's terminal status does not survive compression; the lead cannot compute $\kappa_{\text{agg}}$ (Chapter 8, Topic 6's O-2). Mitigation: $\kappa$ is a required distillation field (§6).
- **Edge case — the subagent that genuinely needs deep shared context.** Some tasks require the full history (a subagent asked to critique the conversation). **Then multi-agent may be the wrong architecture for that subtask** — or that subagent is not a subagent but a second pass by the lead.
- **Edge case — artifacts the lead never fetches.** If the handle's summary is enough, the full artifact is dead storage. **That is fine** — it is cheap insurance, and it preserves information for audit (Chapter 7, Topic 10).
- **Open limitation.** **The cost of over-sharing is unmeasured.** No source reports the multi-agent benefit as a function of `fork_turns`. **SC-1 is arithmetic; its empirical consequence is not measured.** The anchoring claim (§3.3) is **[synthesis]** — reasoned from how models condition on context, not measured. §8's ablations are the local measurement.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. The mechanism is **private context windows**: subagents explore "in parallel with their own context windows" and condense for the lead [MAR].
2. **"Root and subagents maintain separate contexts. Automatic server-side compaction applies independently per agent"** [OMA].
3. **`fork_turns` controls context propagation to subagents** [OMA] — the parameter that decides whether the benefit exists.
4. The distillation ratio is **~10–20×**: "tens of thousands of tokens" explored, "1,000-2,000 tokens" returned [ECE].
5. **Shared-context domains are a multi-agent disqualifier** [MAR] — the mechanism is absent.
6. Multi-agent is warranted when "**separate context improves focus**" and "comparing independent findings improves coverage" [OMA].
7. **[MAR]'s artifact pattern:** subagents "store their work in external systems, then pass lightweight references back to the coordinator… reduces token overhead."
8. **The cost of over-sharing is unmeasured.**

**Decision rules.**
- **Every shared token costs $n\times$** (SC-1) — the shared brief is ruthlessly minimal: objective, task, boundaries, constraints. **Nothing else.**
- **Set `fork_turns` deliberately; the default probably destroys your architecture.**
- **Tasks flow down; distillations flow up; raw context crosses nothing** (SC-2).
- **Do not share findings between subagents mid-exploration** — it anchors them and destroys the diversity that is the value.
- **Prefer artifacts + handles** [MAR] — no information loss, no token cost.
- **Distillations must carry $\kappa$ and contradictions**, or Chapter 8, Topic 6's aggregation and Topic 5's dissent-preservation both break.

**Production implications.**
1. Check your `fork_turns` / context-propagation setting today; if it propagates the full conversation, you are paying 15× for an architecture whose benefit you have configured away.
2. Run the `fork_turns` ablation (§8); it proves SC-1 and shows exactly where the benefit dies.
3. Adopt [MAR]'s artifact pattern for subagent outputs; it is the strongest form of the flow rule.
4. Require $\kappa$ and contradictions in every distillation; they are what the lead needs and what compression silently drops.

**Connections.** This topic is Topic 1's mechanism, made operational, and Topic 3's RA-2, made concrete. The upward-distillation rule is Chapter 6, Topic 11 and Chapter 8, Topic 4's supervisor-bottleneck fix. The artifact pattern is Chapter 6, Topic 4's external state and Chapter 7, Topic 10's artifact lifecycle. The anchoring hazard is Topic 5's diversity problem. Topic 7 details the communication that carries these flows; Topic 15 prices the concurrency.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — "Subagents facilitate compression by **operating in parallel with their own context windows**, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent"; the disqualifier "domains that require all agents to share the same context"; the **artifact pattern** ("implement artifact systems where specialized agents can create outputs that persist independently. Subagents call tools to store their work in external systems, then **pass lightweight references back to the coordinator**. This prevents information loss during multi-stage processing and **reduces token overhead**") — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — **`fork_turns` controls "how much context you want to propagate to your sub-agents"**; "**Root and subagents maintain separate contexts. Automatic server-side compaction applies independently per agent**"; use multi-agent when "**separate context improves focus**" and "comparing independent findings improves coverage" — https://developers.openai.com/api/docs/guides/responses-multi-agent
[ECE] Anthropic, "Effective context engineering for AI agents" — sub-agent distillation: each subagent "might explore extensively, using **tens of thousands of tokens** or more, but returns only a condensed, distilled summary of its work (often **1,000-2,000 tokens**)"; "the detailed search context remains isolated within sub-agents, while the lead agent focuses on synthesizing and analyzing the results" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
