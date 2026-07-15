# Topic 12 — Context Budgeting Across Instructions, History, Tool Definitions, Evidence, and Generated Reasoning

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The allocation itself. Topic 1 established that the window is a budget; this topic partitions that budget across its five competing consumers and makes the allocation an explicit, enforced, measured decision rather than a first-come-first-served accident.

**Prerequisites.** Topic 1 ($B_{\mathrm{eff}}$, the binding constraint); Topic 2 (instructions as rent); Topic 4 (the context types); Topic 9 (dilution — why the total matters); Topic 11 (compaction — the tool that enforces the history budget).

**Terminology.** *Consumer*: a category competing for window tokens. *Allocation*: the token budget assigned to each consumer. *Reserved budget*: tokens held for a consumer regardless of demand. *Generated reasoning*: the model's own output tokens (thinking, tool-call construction), which also consume the window.

**Boundaries.** Inside: partitioning $B_{\mathrm{eff}}$, enforcing the partition, and reallocating under pressure. Outside: how each consumer's content is produced (Topics 2, 5, 11) or measured (Topic 13).

**Exclusions.** No recommended split — there is no grounded universal one, and inventing it would violate the chapter's rule.

**Outcomes.** The reader can write down their budget partition, enforce it in the pipeline, and defend the split with measurement.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Five consumers compete for one finite budget: **instructions** (Topic 2), **history** (Topic 4's episodic), **tool definitions** ($\mathcal U_c$, Chapter 5), **retrieved evidence** (Topic 5), and **generated reasoning** (the model's own output). Left unmanaged, they compete by *arrival order*: whoever writes to the window first wins, and the last consumer — often the evidence that answers the question — gets whatever is left, which on a long turn is nothing.

**Bottleneck.** There is no single owner of the budget. Instructions are set by one team, tool definitions by another, retrieval by a third, and history just accumulates. Each optimizes its own consumer locally, and the *sum* exceeds $B_{\mathrm{eff}}$ — at which point either the request fails (hard limit) or, worse, quality silently degrades (context rot, Topic 1). **The failure is the tragedy of the commons: every consumer's inclusion is locally justified and the aggregate is over budget.** This is Chapter 5, Topic 15's accretion and Topic 9's interference, at the level of the whole window.

**Objective.** An explicit partition of $B_{\mathrm{eff}}$ across the five consumers, enforced at assembly (Topic 3's Compress), with a reallocation policy for when demand exceeds supply.

**Assumptions.** $B_{\mathrm{eff}}<B^{\max}_{\mathrm{ctx}}$ (Topic 1). Generated reasoning consumes budget too, and its size is *not known in advance*.

**Constraints.** Some consumers have hard floors (durable instructions cannot be cut — Topic 4's R-1). Generated reasoning is unpredictable, so its budget must be *reserved*, not allocated after the fact.

**Success criteria.** The partition is written down, enforced, and measured; no consumer starves another silently; the reserved reasoning budget is never consumed by input.

## 3. Intuition first, then formalization

### 3.1 Intuition: five tenants, one apartment, a fixed lease

The window is an apartment with a fixed square footage ($B_{\mathrm{eff}}$), and five tenants want space. Without a lease, they fill it by who moves in first: instructions and tool definitions arrive at setup and take what they want; history grows into whatever remains; and evidence — the tenant you actually invited to answer today's question — arrives last and finds no room.

The lease is the budget partition: each tenant gets a declared allocation, and when one wants more, it comes out of a declared source, not out of whoever happens to be smallest. Two tenants need special terms:

- **Durable instructions have a non-negotiable floor** (Topic 4's R-1): they cannot be evicted, so their allocation is *reserved first*.
- **Generated reasoning is a tenant whose size you cannot predict.** The model's thinking and tool-call construction consume window tokens, and a hard reasoning task can consume a lot. **If you allocate the whole budget to input, the model runs out of room to think** — and the failure looks like the model being bad, when it was starved. Reasoning budget must be *reserved up front*, before input allocation.

The intuition teams miss: **generated reasoning competes with input for the same budget.** Every token of retrieved evidence is a token the model cannot use for thinking. This is the trade at the heart of the partition, and it is why "just retrieve more" degrades hard reasoning tasks even when the evidence is relevant (Topic 9's dilution, now with a specific victim: the reasoning budget).

### 3.2 Formalization: the partition and its constraints

Partition $B_{\mathrm{eff}}$ across consumers $\{I, H, U, E, G\}$ (instructions, history, tool defs, evidence, generated reasoning):

$$
B_{\mathrm{eff}}\ \ge\ b_I + b_H + b_U + b_E + b_G,
$$

subject to **[synthesis — the constraint structure is ours; each floor/property is sourced]**:

$$
\textbf{B-1 (durable floor):}\quad b_I \ge \mathrm{tok}(\text{durable instructions})\quad\text{(R-1, Topic 4 — cannot be cut).}
$$
$$
\textbf{B-2 (reasoning reserve):}\quad b_G \ge G_{\min}\quad\text{reserved BEFORE input allocation.}
$$
$$
\textbf{B-3 (input fills the remainder):}\quad b_H + b_U + b_E \ \le\ B_{\mathrm{eff}} - b_I - b_G .
$$

**[derived]** The ordering of allocation is forced by the constraints: reserve the durable-instruction floor (B-1) and the reasoning reserve (B-2) *first*, then partition what remains among the three flexible input consumers (B-3). A pipeline that allocates input first and lets reasoning take "what's left" has inverted the priority — it will starve reasoning on exactly the hard tasks where reasoning matters most.

The reallocation policy, when a flexible consumer wants more than its share:

$$
\textbf{B-4 (borrow, don't overflow):}\quad
\Delta b_E > 0\ \Longrightarrow\ \text{take } \Delta b_E \text{ from } b_H \text{ (compact history — Topic 11), not from } b_G .
$$

**[derived]** When today's query needs more evidence budget, the tokens come from *history* (which compaction can reclaim — Topic 11) — **not from the reasoning reserve** (which would silently degrade the answer) and **not by overflowing $B_{\mathrm{eff}}$** (which triggers context rot — Topic 1). This is the single most important budgeting rule: **evidence borrows from history, never from reasoning.**

### 3.3 The generated-reasoning subtlety

$b_G$ is unlike the others: it is the model's *output*, not your input, so you cannot cap it at assembly — you can only *reserve room for it*. The reservation is against $B_{\mathrm{eff}}$: if the model's context limit is $L$ and you assemble input up to $L$, there is no room for output and the call fails or truncates.

Two consequences **[derived]**:

- **Reserve $b_G$ against the model's *output* limit, and account for it in the *input* budget.** Input tokens + reasoning tokens ≤ context window. This is elementary and constantly violated: teams fill the input to the context limit and are surprised when a reasoning-heavy task truncates mid-thought.
- **Reasoning-heavy tasks need a *larger* reserve.** Chapter 2, Topic 2's test-time compute: harder tasks spend more reasoning tokens. A budget partition tuned on easy tasks will starve reasoning on hard ones. **The reserve should scale with expected task difficulty**, which means the partition is not static — it is task-conditional.

## 4. Architecture

```
   B_eff  (Topic 1 — measured, NOT the API maximum)
   │
   ├─ RESERVE FIRST (B-1, B-2) ──────────────────────────────────┐
   │    b_I  durable instructions   ← floor, cannot be cut (R-1)  │
   │    b_G  generated reasoning     ← reserved, scales w/ task    │
   │         difficulty (Ch.2 T2). NEVER borrowed from.           │
   └──────────────────────────────────────────────────────────────┘
   │
   ├─ PARTITION THE REMAINDER (B-3) ──────────────────────────────┐
   │    b_U  tool definitions   ← defer/consolidate (Ch.5 T6/15)  │
   │    b_H  history            ← the BORROW source (B-4)         │
   │    b_E  evidence           ← borrows from b_H when a query   │
   │                              needs more                      │
   └──────────────────────────────────────────────────────────────┘
   │
   ▼  ENFORCE at Compress (Topic 3): each consumer capped at its b_x
      VALIDATE (V-1): Σ b_x ≤ B_eff, and b_G room actually remains
```

**The dashboard this implies.** The budget partition is a set of numbers — $b_I, b_H, b_U, b_E, b_G$ — that should be *visible*, per turn, on a dashboard. Most teams cannot state these numbers for their own system, which is the same as saying they do not control their context. Chapter 5, Topic 6 built the tool-definition half of this ($b_U$); this topic completes it. **Instructions + tool definitions is the permanent rent (Topic 2's H-2); history + evidence is the working spend; reasoning is the reserve — and if you cannot print all five, you are not budgeting, you are hoping.**

## 5. Grounding

- **The budget framing:** context is "a finite resource" with an "attention budget" that "depletes with each token"; the goal is "the smallest set of high-signal tokens" [ECE] (Topic 1). This topic is that budget, partitioned.
- **Tool definitions are a budgeted consumer:** their token cost is real and per-turn ("hundreds of thousands of tokens" at scale) [CXM]; deferral and consolidation manage $b_U$ (Chapter 5, Topics 6, 15).
- **History is the compressible consumer:** compaction and tool-result clearing reclaim $b_H$ [ECE; OCP; GCA] (Topic 11) — which is *why* B-4 borrows from history and not from reasoning.
- **Instructions are the floored consumer:** durable instructions must survive (R-1, Topic 4; [CAL]), setting $b_I$'s floor.
- **Scope by default:** "scope context by default; agents must explicitly reach for additional information" [GCA] — the architectural stance that keeps $b_E$ and $b_H$ from expanding uninvited.
- **Reasoning consumes budget:** Chapter 2, Topic 2 (test-time compute) — thinking tokens are real and scale with difficulty; the model's output shares the window with the input.
- **The five-consumer set is the union of prior chapters' concerns:** instructions (Topic 2), history/evidence (Topic 4), tool definitions (Chapter 5), reasoning (Chapter 2) — this topic is where they meet in one budget.

**Evidence gap, and it is the chapter's recurring one.** **No source publishes a recommended budget partition, per-consumer allocations, or the reasoning reserve size.** [ECE] argues for minimalism directionally; it gives no split. The constraint structure (B-1..B-4) is a derivation from the sourced properties (durable floors, compressible history, reasoning-consumes-budget); the *numbers* are entirely local. **This topic therefore refuses to print a recommended split** — there is no grounding for one — and gives the allocation *method* and the experiment (§8) instead. Any "40% instructions, 30% history…" rule you encounter is invented.

## 6. Implementation

**The budget as an explicit, enforced object:**

```python
@dataclass
class ContextBudget:
    total_eff: int                    # B_eff — MEASURED (Topic 1), not the API max
    reasoning_reserve: int            # b_G — reserved FIRST (B-2), scales w/ difficulty
    instruction_floor: int            # b_I — cannot be cut (B-1, R-1)

    def partition(self, task_difficulty: float) -> dict:
        # B-2: reasoning reserve scales with difficulty (Ch.2 T2). Reserve BEFORE input.
        b_g = int(self.reasoning_reserve * (1 + task_difficulty))
        b_i = self.instruction_floor

        remainder = self.total_eff - b_g - b_i        # B-3: input fills what's left
        if remainder <= 0:
            raise BudgetError("reasoning + instructions exceed B_eff — no room for input")
        return {
            "instructions": b_i,
            "reasoning":    b_g,                       # RESERVED — never borrowed (B-4)
            "tool_defs":    int(remainder * 0.15),     # b_U — LOCAL split, MEASURE it (§8)
            "history":      int(remainder * 0.45),     # b_H — the borrow source
            "evidence":     int(remainder * 0.40),     # b_E — borrows from history
        }
```

The `0.15 / 0.45 / 0.40` split is **flagged as local and unvalidated** — it is a starting point to be measured (§8), not a recommendation, because no source grounds one.

**Enforcement at Compress, with B-4 borrowing:**

```python
def enforce_budget(consumers: dict[str, list], budget: dict) -> dict:
    out = {}
    for name, blocks in consumers.items():
        cap = budget[name]
        kept, used = [], 0
        for b in rank_by_density(blocks):             # Topic 5 — density order
            if used + b.tokens <= cap:
                kept.append(b); used += b.tokens
        out[name] = kept

    # B-4: if evidence wanted more than its cap, BORROW FROM HISTORY (compactible),
    # never from reasoning (would silently degrade the answer).
    evidence_pressure = tokens_wanted(consumers["evidence"]) - budget["evidence"]
    if evidence_pressure > 0:
        reclaimed = compact_history(out["history"], evidence_pressure)   # Topic 11
        out["evidence"] += fit_more(consumers["evidence"], reclaimed)
    return out
```

**Validate the reserve actually survives (Topic 3, V-1):**

```python
def validate_budget(window, budget) -> None:
    input_tokens = window.tokens
    context_limit = budget.total_eff + budget["reasoning"]   # input + output room
    assert input_tokens + budget["reasoning"] <= MODEL_CONTEXT_LIMIT, \
        f"V-1: no room for {budget['reasoning']} reasoning tokens — model will truncate"
```

## 7. Trade-offs

| Allocation choice | Buys | Costs |
|---|---|---|
| Large instruction budget | Consistent behavior | **Permanent rent** (Topic 2); less room for evidence/reasoning |
| Large history budget | Long memory in-window | Dilution (Topic 9); less evidence room |
| Large evidence budget | More grounding | Dilution; **starves reasoning if it eats $b_G$** |
| Large reasoning reserve | Hard tasks can think | Less input room; wasteful on easy tasks |
| Large tool-def budget | Many tools visible | Saturation (Chapter 5, Topic 15); defer instead |
| Static partition | Simple | Wrong for tasks that differ in difficulty |
| Task-conditional partition | Reserve scales with need | Complexity; a difficulty estimate |

**The trade that decides answer quality on hard tasks.** Evidence and reasoning compete for the same budget, and the instinct — "retrieve more, ground the answer better" — *starves the reasoning the hard answer needs*. On an easy task, more evidence and little reasoning is right. On a hard task, the reverse. **A static partition is wrong for one of them**, and since the same agent serves both, the partition should be task-conditional: reserve more reasoning for harder tasks (B-2 scaling), and let evidence borrow from history, never from the reserve (B-4). This is why the reserve is the one allocation that is never negotiable.

## 8. Experiments

**The allocation sweep — because no source gives you the split.** Vary the partition (instruction / history / tool-def / evidence / reasoning shares) and measure task completion. **The output is your system's budget partition**, and it is workload-specific by construction — which is exactly why no source can hand it to you. Run it once per major workload.

**The reasoning-starvation experiment — the one that reveals the hidden victim.** On reasoning-heavy tasks, sweep the evidence budget *up* (crowding reasoning) and measure completion. **Prediction: completion rises with evidence, then falls as evidence crowds out reasoning** — a single-peaked curve (Chapter 5, Topic 15's shape again), and the peak is where evidence and reasoning are balanced. **A team that only measures "does more evidence help" on easy tasks will miss the fall and over-allocate evidence**, silently degrading hard tasks.

**Reserve-scaling validation (B-2).** Compare a static reasoning reserve against one that scales with task difficulty. Metrics: completion on easy vs hard tasks, truncation rate. **Prediction: the static reserve either wastes budget on easy tasks or truncates hard ones; the scaled reserve does neither.**

**Borrow-policy ablation (B-4).** When evidence needs more: (a) borrow from history (compact); (b) borrow from reasoning; (c) overflow $B_{\mathrm{eff}}$. Metrics: completion, truncation, context-rot indicators. **Prediction: (a) wins, (b) silently degrades reasoning-heavy tasks, (c) triggers context rot (Topic 1).** This experiment justifies B-4's specific choice.

**Budget observability baseline.** Instrument per-consumer token counts per turn. **Most teams cannot produce these numbers**, and the instrumentation alone usually reveals a consumer (often history, or tool definitions) silently dominating.

**Statistics.** Task-clustered bootstrap on completion; separate easy/hard task strata (the partition's effect is opposite across them — pooling hides it); Holm across allocation arms (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **No explicit budget.** Consumers compete by arrival order; evidence starves. **The default failure.** Mitigation: the explicit partition (§6).
- **Reasoning not reserved.** Input fills the window; the model truncates mid-thought on hard tasks; looks like model failure, is budget starvation. Mitigation: B-2, reserve first.
- **Evidence borrowing from reasoning.** "Retrieve more" silently degrades the hard answer. Mitigation: B-4, borrow from history only.
- **Overflow past $B_{\mathrm{eff}}$.** A consumer wants more, so the total exceeds the effective budget; context rot (Topic 1). Mitigation: B-4, compact instead of overflow.
- **Static partition across varying difficulty.** Wrong for easy or hard tasks (one of them). Mitigation: task-conditional reserve (B-2 scaling).
- **Permanent-rent creep.** Instructions and tool definitions grow, squeezing the flexible consumers (Topic 2's H-2; Chapter 5, Topic 15). Mitigation: audit $b_I + b_U$; defer tools; the budget dashboard.
- **Unmeasured budget.** Nobody knows the per-consumer numbers; a consumer silently dominates. Mitigation: instrument per-consumer tokens (§8).
- **Edge case — the genuinely oversized task.** Instructions + reasoning floor already exceed $B_{\mathrm{eff}}$, leaving no room for input. This is a real limit: the task needs a bigger model, decomposition (Topic 7), or sub-agent partitioning (Chapter 8) — not a cleverer partition.
- **Open limitation.** **No source publishes a budget partition or reserve size.** The B-1..B-4 constraints are derivations; the numbers are wholly local and workload-specific (§8). This topic gives the method and refuses to invent the split — the honest position, and the same one Topics 1, 6, 7, and 9 took on their unmeasured quantities.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Context is a finite budget with a depleting attention allowance; the goal is "the smallest set of high-signal tokens" [ECE].
2. Tool definitions are a real, per-turn, large consumer [CXM] (Chapter 5, Topic 6).
3. History is the compressible consumer — compaction and tool-result clearing reclaim it [ECE; OCP; GCA].
4. Durable instructions have a floor that must survive compaction [CAL; Topic 4].
5. Generated reasoning consumes the window and scales with task difficulty [Chapter 2, Topic 2].
6. "Scope context by default" [GCA] — consumers must justify their space.
7. **No source publishes a budget partition or reserve size** — the numbers are local.

**Decision rules.**
- **Reserve the reasoning budget first, before any input.** It scales with task difficulty.
- **Evidence borrows from history, never from reasoning, never by overflow** (B-4).
- **Durable instructions are a floor, not a variable** (B-1).
- **The partition is task-conditional** — a static split is wrong for tasks that differ in difficulty.
- **If you cannot print $b_I, b_H, b_U, b_E, b_G$ per turn, you are not budgeting.**
- **There is no universal split; measure yours** (§8).

**Production implications.**
1. Instrument per-consumer token counts today; the numbers usually reveal a silent dominator.
2. Reserve reasoning budget explicitly and scale it with task difficulty; reasoning-heavy truncations are budget starvation misdiagnosed as model failure.
3. Run the reasoning-starvation experiment (§8); "more evidence" has a peak, and past it you are degrading hard tasks.
4. Make evidence borrow from history via compaction (Topic 11), never from the reserve.
5. Audit permanent rent ($b_I + b_U$); it creeps, and it squeezes the consumers that answer the question.

**Connections.** This topic is where the whole chapter's consumers meet: Topic 2's instructions ($b_I$), Topic 4's history and evidence ($b_H, b_E$), Chapter 5's tool definitions ($b_U$), and Chapter 2's reasoning ($b_G$). It is enforced at Topic 3's Compress and validated at V-1; it triggers Topic 11's compaction (the B-4 borrow); it is constrained by Topic 1's $B_{\mathrm{eff}}$ and measured by Topic 13. Chapter 5, Topic 15's saturation and Topic 9's dilution are what over-allocation causes.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — context as "a finite resource"; the "attention budget" that "depletes with each token"; "the smallest set of high-signal tokens that maximize the likelihood of your desired outcome"; "minimal does not necessarily mean short" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — "scope context by default; agents must explicitly reach for additional information"; the four-tier model separating the budgeted consumers; compaction reclaiming history — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CXM] Anthropic, "Code execution with MCP" — tool definitions as a large per-turn context consumer ("hundreds of thousands of tokens" at scale) — https://www.anthropic.com/engineering/code-execution-with-mcp
[OCP] OpenAI, compaction guide — history reclamation via compaction at a token threshold — https://developers.openai.com/api/docs/guides/compaction
[CAL] Claude Agent SDK — durable instructions lost to compaction; the floor $b_I$ must protect — https://code.claude.com/docs/en/agent-sdk/agent-loop
