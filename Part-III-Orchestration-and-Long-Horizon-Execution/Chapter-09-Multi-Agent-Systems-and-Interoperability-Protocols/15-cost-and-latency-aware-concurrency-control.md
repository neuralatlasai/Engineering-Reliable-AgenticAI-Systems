# Topic 15 — Cost- and Latency-Aware Concurrency Control

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The chapter's closing engineering discipline: **bounding how many agents run at once, given that each one costs tokens (15×, Topic 1) and the system blocks on the slowest (Topic 4).** Concurrency control is where the multi-agent architecture meets its budget.

**Prerequisites.** Topic 1 (the 15× token cost); Topic 2 (the coordination tax; the straggler); Topic 4 (the synchronous bottleneck; `max_concurrent_subagents`); Topic 14 (marginal contribution — which agents are worth running).

**Terminology.** *Concurrency*: agents running simultaneously. *Straggler*: the slowest subagent, which the synchronous system waits on. *Concurrency budget*: the cap on simultaneous agents. *Effort budget*: the per-query agent/tool-call allocation ([MAR]'s scaling rules).

**Boundaries.** Inside: concurrency limits, cost/latency management, and effort budgeting. Outside: the topology (Topic 4); the justification (Topics 1–2); async execution's coordination costs (Topic 4's frontier).

**Exclusions.** No queueing-theory tutorial.

**Outcomes.** The reader can set a concurrency budget from cost and latency constraints, allocate effort per query complexity, and manage the straggler that the synchronous architecture makes load-bearing.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Multi-agent's benefits — parallelism, coverage — come from running agents concurrently. **But each concurrent agent costs 15× the tokens (Topic 1), the system blocks on the slowest (Topic 4's synchronous bottleneck), and past a point, more agents stop paying (Topic 2's MT-1, Topic 14's marginal contribution).** **Unbounded concurrency is unbounded cost and unbounded straggler risk.**

**Bottleneck.** Two limits bind. **Cost:** at 15× tokens, concurrency multiplies spend directly — [MAR]'s early failure "spawning 50 subagents for simple queries" [MAR] is unbounded concurrency, and it is expensive. **Latency:** the synchronous architecture means **wall-clock time is set by the *slowest* subagent, not the mean** (Topic 4) — so adding a slow subagent to a fast batch makes the *whole batch* slow. **The concurrency budget must respect both, and they pull differently: more concurrency spends more (cost) but finishes sooner (latency, if no straggler).**

**Objective.** A concurrency budget set from cost and latency constraints, effort allocated by query complexity ([MAR]'s scaling rules), and straggler management (timeouts) for the synchronous bottleneck.

**Assumptions.** Each agent costs 15× (Topic 1). The system is synchronous (Topic 4) — it blocks on the slowest. Marginal contribution saturates (Topic 14).

**Constraints.** [OMA]'s `max_concurrent_subagents` defaults to 3. The synchronous architecture makes stragglers load-bearing.

**Success criteria.** Concurrency is bounded by cost and latency; effort scales with complexity (no 50 subagents for a simple query); stragglers are bounded by timeouts.

## 3. Intuition first, then formalization

### 3.1 Intuition: concurrency is a budget, and the slowest agent sets the clock

Two facts make concurrency a control problem, not a free speedup:

**Fact 1: each concurrent agent costs 15× (Topic 1).** So concurrency $c$ costs roughly $c \times 15\times$ the tokens of a chat. **[MAR]'s "50 subagents for a simple query" is $50 \times 15\times = 750\times$ a chat's tokens for a query that needed one agent.** **Concurrency is a spend multiplier, and it must be budgeted.** [OMA] bounds it: `max_concurrent_subagents` "limits the number of active subagent turns across the entire tree," default **3** [OMA] — **a low default, deliberately.**

**Fact 2: the synchronous architecture waits on the slowest (Topic 4).** [MAR]: "lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding" [MAR]. **So wall-clock latency = max(subagent durations), not mean.** **One slow subagent makes the whole batch slow** — the straggler dominates. This is the opposite of the intuition that "more parallel = faster": more parallel is faster *only if no subagent straggles*, and the more subagents you run, the higher the chance one straggles.

**The intuition that combines them: concurrency trades cost for latency, but the synchronous bottleneck means the latency benefit is capped by the straggler.** Running 10 subagents instead of 5 doubles the cost and does *not* halve the latency if the 10th subagent is slow — the batch waits for it. **So the concurrency budget is set by cost (a hard multiplier) and bounded in benefit by the straggler (a soft cap on the latency gain).**

**The effort-budget lesson from [MAR] is the practical control:** scale the agent/tool-call allocation to query complexity. **"Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents… and complex research might use more than 10 subagents"** [MAR] — **embedded in the lead's prompt "to prevent overinvestment in simple queries"** [MAR]. **The lead decides concurrency per query, and it must be told how** — or it spawns 50.

### 3.2 Formalization: the concurrency budget and the straggler bound

**[synthesis; grounded in Topics 1, 4; [MAR]; [OMA]]**

**Cost as a function of concurrency:**

$$
\mathrm{Cost}(c) \;=\; c \cdot 15\times \cdot (\text{tokens per agent}) \quad\text{— LINEAR in concurrency.}
$$

**Latency under the synchronous bottleneck (Topic 4):**

$$
\mathrm{Latency}(c) \;=\; \max_{i \le c} \ell_i \quad\text{— the STRAGGLER, not the mean.}
$$

Two invariants **[derived]**:

$$
\textbf{CC-1 (concurrency is budgeted by cost AND latency):}\quad
c^\star = \operatorname*{arg\,max}_c\ \bigl[\text{value}(c) - \mathrm{Cost}(c)\bigr]\ \text{s.t.}\ \mathrm{Latency}(c) \le \text{SLA}.
$$

CC-1 sets concurrency at the point where marginal value (Topic 14's $\mathrm{MC}$) still exceeds marginal cost ($15\times$ per agent), *subject to* the straggler-bounded latency meeting the SLA. **Since value saturates (Topic 14's MT-1) and cost is linear, $c^\star$ is finite** — this is Topic 2's MT-1 and Chapter 5, Topic 15's saturation, at the concurrency layer.

$$
\textbf{CC-2 (bound the straggler):}\quad
\text{each subagent has a timeout } T;\ \text{a subagent exceeding } T\ \text{is cut, so } \mathrm{Latency} \le T,\ \text{not } \max_i \ell_i.
$$

CC-2 is the straggler fix. **Without a timeout, the synchronous system waits for the slowest subagent however long it takes** ([MAR]: "scouring the web endlessly"). **A timeout caps the latency at $T$** — the batch proceeds with whatever the timed-out subagent produced (or nothing), rather than blocking forever. **This converts the straggler from an unbounded latency risk into a bounded one**, at the cost of possibly losing the straggler's contribution (which, per Topic 14, may have been marginal anyway).

**The effort budget — [MAR]'s scaling rules as a per-query concurrency allocation:**

$$
c(\text{query}) = \begin{cases} 1 & \text{simple fact-finding (3-10 tool calls)}\\ 2\text{-}4 & \text{direct comparison (10-15 calls each)}\\ 10+ & \text{complex research}\end{cases} \quad\text{[MAR]}
$$

**This is CC-1, pre-computed as heuristics and embedded in the lead's prompt** — because the lead decides concurrency per query, and without the rules it "overinvest[s] in simple queries" [MAR].

### 3.3 The async frontier — [MAR]'s honest open problem

The synchronous bottleneck (CC-2's premise) is the current state, and [MAR] names the alternative and its cost honestly.

**Synchronous** [MAR]: "lead agents execute subagents synchronously… This simplifies coordination, but creates bottlenecks in the information flow between agents" — the lead "cannot steer subagents mid-task," and the system blocks on the slowest.

**Asynchronous** [MAR]: "Asynchronous execution would enable additional parallelism: agents working concurrently and creating new subagents when needed. **But this asynchronicity adds challenges in result coordination, state consistency, and error propagation**" [MAR].

**So async would relax CC-2's straggler bound (agents proceed without waiting) — at the cost of three hard problems [MAR]:**
- **Result coordination** — how does the lead assemble results that arrive at different times?
- **State consistency** — how is shared state kept coherent when agents run concurrently and unsynchronized (Topic 8's conflicting edits, Chapter 8, Topic 4's A-2)?
- **Error propagation** — how does an error in one async agent reach the others (Topic 8's cascade, without the synchronous checkpoint)?

**[MAR]'s framing is the honest one and this book adopts it: async buys concurrency and pays in coordination complexity — the same trade as the whole chapter (Topic 4's topology spectrum).** **The synchronous bottleneck is a *feature* (it "simplifies coordination") as much as a limitation**, and moving to async is not a free speedup — it is trading the straggler problem for the harder problems of unsynchronized coordination. **For most systems, synchronous with straggler timeouts (CC-2) is the right engineering point today**, and async is a frontier with named, unsolved costs.

## 4. Architecture

```
   CONCURRENCY IS A BUDGET (§3.1) — two binding limits, pulling differently

   ┌── COST (Topic 1: 15× per agent) — LINEAR in concurrency ─────────────────┐
   │   Cost(c) = c · 15× · tokens/agent                                        │
   │   [MAR]'s "50 subagents for a simple query" = 50 × 15× = 750× a chat      │
   │   [OMA]: max_concurrent_subagents, default 3 (deliberately low)           │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌── LATENCY (Topic 4: synchronous) — the STRAGGLER, not the mean ──────────┐
   │   Latency(c) = max_i ℓ_i   ← the SLOWEST subagent sets the clock          │
   │   ⚠ more parallel ≠ faster: the more subagents, the higher the chance     │
   │     one straggles, and the batch WAITS for it                            │
   │   CC-2: TIMEOUT T ⇒ Latency ≤ T (cut the straggler; proceed)              │
   └──────────────────────────────────────────────────────────────────────────┘

   CC-1: c* = argmax [value(c) − Cost(c)]  s.t.  Latency(c) ≤ SLA
         value saturates (Topic 14 MT-1), cost is linear ⇒ c* is FINITE
         (Ch.5 T15's saturation, at the concurrency layer)

   EFFORT BUDGET [MAR] — CC-1 pre-computed, embedded in the lead's prompt:
   ┌──────────────────────┬────────────────────┬───────────────────────────┐
   │ simple fact-finding   │ 1 agent            │ 3-10 tool calls           │
   │ direct comparison     │ 2-4 subagents      │ 10-15 calls each          │
   │ complex research      │ 10+ subagents      │                           │
   └──────────────────────┴────────────────────┴───────────────────────────┘
   "to prevent overinvestment in simple queries" [MAR]
   ← the lead decides concurrency per query; without the rules it spawns 50

   THE ASYNC FRONTIER (§3.3) — [MAR]'s honest open problem:
     SYNC:  blocks on slowest, but "simplifies coordination"
     ASYNC: relaxes the straggler bound, BUT "adds challenges in result
            coordination, state consistency, and error propagation"
     ⇒ async is NOT a free speedup — it trades the straggler for harder problems.
       Synchronous + timeouts (CC-2) is the right point for most systems today.
```

## 5. Grounding

- **The 15× cost:** multi-agent systems "use about 15× more tokens than chats" [MAR] — the linear cost of concurrency.
- **Bounded concurrency ships as a primitive:** `max_concurrent_subagents` "limits the number of active subagent turns across the entire tree, including children and deeper descendants" but excludes root; **default 3 (recommended)** [OMA] — **a deliberately low default.**
- **The scaling rules (effort budget):** "**Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents**" — embedded in the prompt "**to prevent overinvestment in simple queries**" [MAR].
- **Unbounded concurrency is a documented failure:** "spawning 50 subagents for simple queries" [MAR].
- **The synchronous bottleneck:** "lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks" — the lead "cannot steer subagents mid-task," the system blocks on the slowest [MAR].
- **The straggler failure:** "scouring the web endlessly for nonexistent sources" [MAR] — a subagent that never terminates, which under synchronous execution blocks the batch.
- **The async frontier, priced:** "Asynchronous execution would enable additional parallelism… **But this asynchronicity adds challenges in result coordination, state consistency, and error propagation**" [MAR].
- **Parallel tool calling's benefit:** "cut research time by up to 90% for complex queries" [MAR] — the latency win when there is no straggler.
- **Saturation is the general principle:** Chapter 5, Topic 15 (more tools can hurt); Chapter 8, Topic 12 (more orchestration); Topic 2's MT-1 (more agents) — CC-1's finite $c^\star$.
- **Termination bounds the straggler:** Chapter 8, Topic 11 (termination arguments; budgets) — CC-2's timeout.

**Evidence gap.** This topic is **well-grounded**: the 15× cost, the concurrency default (3), the scaling rules, the synchronous bottleneck, and the async costs are **all documented** [MAR; OMA]. **CC-1 and CC-2 are [synthesis]** — CC-1 composes the documented cost (15×) and the saturation principle (Topic 14's MT-1); CC-2 applies Chapter 8, Topic 11's termination bound to the straggler. **What is unmeasured: [MAR] does not report a cost/latency curve as a function of concurrency**, nor the optimal $c^\star$ for a given task — the scaling rules are heuristics, not measured optima. **No source measures the straggler-timeout trade** (how often the timed-out subagent's contribution mattered). §8 is the local measurement.

## 6. Implementation

**The effort budget — [MAR]'s scaling rules ([MAR]):**

```python
def concurrency_for(query) -> tuple[int, tuple[int, int]]:
    """[MAR]'s scaling rules, embedded in the lead's prompt 'to prevent overinvestment
    in simple queries'. WITHOUT these, the lead spawns 50 subagents for a simple query
    (a documented failure) — at 50 × 15× = 750× a chat's tokens."""
    match classify_complexity(query):
        case "simple_fact_finding":  return 1,  (3, 10)     # [MAR]
        case "direct_comparison":    return 3,  (10, 15)    # [MAR]: 2-4 subagents
        case "complex_research":     return 10, (15, 30)    # [MAR]: 10+
```

**The concurrency budget — cost and latency bounded (CC-1):**

```python
async def run_bounded_concurrency(subtasks, ctx) -> list[Result]:
    """CC-1: concurrency bounded by COST (15× per agent) AND LATENCY (SLA).
    [OMA]'s max_concurrent_subagents (default 3) is the platform bound; here we also
    apply the straggler timeout (CC-2)."""
    semaphore = asyncio.Semaphore(min(ctx.max_concurrent, MAX_CONCURRENT_SUBAGENTS))  # [OMA]

    async def run_one(st):
        async with semaphore:
            try:
                # CC-2: bound the straggler. Synchronous execution waits on the SLOWEST
                # (Topic 4); a timeout caps latency at T rather than max_i ℓ_i.
                return await asyncio.wait_for(run_subagent(st, ctx), timeout=ctx.subagent_timeout)
            except asyncio.TimeoutError:
                # The straggler is cut. Proceed with the batch. Its contribution may have
                # been marginal anyway (Topic 14). Record it (Ch.8 T6's κ).
                return Result(content=None, kappa="timeout",
                              note=f"subagent {st.id} exceeded {ctx.subagent_timeout}s — cut "
                                   f"to bound batch latency (CC-2)")
    return await asyncio.gather(*[run_one(st) for st in subtasks])
```

**Cost projection before spawning (CC-1):**

```python
def project_cost(query, n_agents: int) -> dict:
    """CC-1: at 15× per agent (Topic 1), concurrency is a linear spend multiplier.
    Project it BEFORE spawning — [MAR]'s 50-subagent failure was 750× a chat."""
    chat_tokens = estimate_chat_tokens(query)
    return {
        "projected_tokens": n_agents * 15 * chat_tokens,        # linear in concurrency
        "vs_single_agent": n_agents * 15 / 4,                   # single-agent research is 4×
        "warning": (f"{n_agents} agents = {n_agents * 15}× chat tokens. For a simple query "
                    f"this is overinvestment (Topic 14: marginal contribution saturates)."
                    if n_agents > scaling_rule_max(query) else None),
    }
```

**The synchronous-vs-async decision (§3.3):**

```python
def execution_mode(system_requirements) -> str:
    """§3.3 [MAR]: async relaxes the straggler bound but 'adds challenges in result
    coordination, state consistency, and error propagation'. Not a free speedup."""
    if system_requirements.straggler_latency_unacceptable and \
       system_requirements.can_handle_async_coordination:
        return "async"       # you accept the three hard problems [MAR] for the parallelism
    return "synchronous"     # blocks on slowest, but "simplifies coordination" — the
                             # right point for MOST systems today, with straggler timeouts
```

## 7. Trade-offs

| Lever | Buys | Costs |
|---|---|---|
| **Higher concurrency** | More parallelism, coverage | **Linear 15× spend** (Topic 1); higher straggler probability |
| **Lower concurrency** | Lower cost | Less parallelism |
| **Effort budget** [MAR] | Right concurrency per query | Must classify complexity; heuristics not optima |
| **Straggler timeout** (CC-2) | **Bounded latency** | May lose the straggler's contribution |
| No timeout | Never lose a subagent | **Blocks on the slowest forever** ([MAR]: "scouring endlessly") |
| **Synchronous** | "Simplifies coordination" [MAR] | Blocks on slowest |
| **Asynchronous** | Relaxes the straggler bound | **Result coordination, state consistency, error propagation** [MAR] |

**The trade at the heart of concurrency: cost is linear, latency benefit is straggler-capped.** More concurrency spends linearly more (15× per agent) and — because the synchronous system waits on the slowest — the *latency* benefit is capped by the straggler, not the mean. **So the naive "more parallel = faster and the cost is worth it" is wrong twice: the cost is a hard linear multiplier, and the latency benefit hits a straggler wall.** CC-1 sets concurrency where marginal value still exceeds the 15× marginal cost *and* the straggler-bounded latency meets the SLA — a finite point (saturation, Topic 14).

**The straggler timeout (CC-2) is the highest-value control, and it has a clean justification.** Without it, the synchronous system waits for the slowest subagent indefinitely ([MAR]: "scouring the web endlessly"). **With it, latency is bounded at $T$, and the lost contribution is — per Topic 14's marginal-contribution analysis — often the *least* valuable one** (a subagent slow enough to time out was often struggling to contribute). **So the timeout typically loses little and bounds a lot.**

**And the async frontier: this book adopts [MAR]'s honest framing.** Async is not a free speedup — it trades the straggler problem for result coordination, state consistency, and error propagation [MAR], **all of which are harder** (they are Topic 8's conflicting-edits and cascade problems, without the synchronous checkpoint). **For most systems, synchronous with straggler timeouts is the right engineering point**, and async is a frontier to approach deliberately, with its three named costs understood.

## 8. Experiments

**The concurrency cost/latency curve (CC-1) — the measurement [MAR] does not publish.** Sweep concurrency (1, 2, 4, 8, 16 subagents). Measure: **total tokens (should be linear), wall-clock latency (should be straggler-dominated), completion, and marginal contribution per agent (Topic 14).**

- **Prediction: cost is linear; completion saturates (Topic 14's MT-1); latency is set by the straggler, not the mean.**
- **Find $c^\star$: the concurrency where marginal value stops exceeding the 15× marginal cost.** **Compare to [MAR]'s scaling rules** (1 / 2–4 / 10+) — if yours differ, the rules do not transfer to your task.

**The straggler-timeout ablation (CC-2).** Vary the subagent timeout $T$. Measure: **batch latency (should be ≤ $T$), completion, and how often the timed-out subagent's contribution mattered.** **Prediction: latency drops sharply with a timeout, and the lost contribution is usually marginal (Topic 14)** — validating that the timeout loses little.

**The overinvestment test.** Run a *simple* query without the effort budget. **Does the lead over-spawn** ([MAR]'s 50 subagents)? **With the scaling rules embedded?** **This validates that the effort budget prevents the documented failure.**

**The synchronous-vs-async comparison (§3.3).** Where feasible, compare synchronous (straggler-bounded) with async (straggler-relaxed). Measure: **latency, cost, and — the point — coordination correctness (result coordination, state consistency, error propagation).** **Prediction: async wins latency and introduces the three coordination problems [MAR] names** — quantifying the trade [MAR] describes qualitatively.

**Statistics.** Report cost (linear) and latency (p50/p95 — the straggler is in the tail) as first-class; marginal contribution with clustered-bootstrap intervals; task-clustered on completion (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Unbounded concurrency.** "50 subagents for a simple query" [MAR] = 750× a chat's tokens. **The documented cost failure.** Mitigation: `max_concurrent_subagents` [OMA]; the effort budget [MAR].
- **No effort budget.** The lead over-invests in simple queries. Mitigation: [MAR]'s scaling rules embedded in the prompt.
- **No straggler timeout.** The synchronous system waits on the slowest forever ([MAR]: "scouring endlessly"). Mitigation: CC-2 — per-subagent timeout.
- **Assuming more parallel = faster.** The straggler caps the latency benefit; more subagents = higher straggler probability. Mitigation: measure latency as max, not mean; bound with timeouts.
- **Ignoring the linear cost.** Concurrency treated as free parallelism. Mitigation: project cost before spawning (§6); 15× per agent is a hard multiplier.
- **Running non-contributing agents concurrently.** Concurrency spent on agents with $\mathrm{MC}_i \le 0$ (Topic 14). Mitigation: marginal-contribution ablation (Topic 14); remove them.
- **Async without the coordination machinery.** Moving to async for the latency and hitting result-coordination, state-consistency, and error-propagation problems [MAR] unprepared. Mitigation: async is a frontier with named costs; approach it deliberately.
- **Edge case — the query where latency is the value.** A user waiting; the 15× token cost is worth it for the "up to 90%" latency cut [MAR]. **Then higher concurrency (with timeouts) is justified by latency, not quality** (Topic 1's value-is-latency edge case).
- **Edge case — the straggler that was the key contributor.** Occasionally the slow subagent was doing the important work (a deep, slow investigation). **A timeout loses it.** Mitigation: for high-stakes tasks, a longer timeout or a retry for a timed-out *high-priority* subtask — but the default should still bound latency.
- **Open limitation.** [MAR] documents the cost (15×), the concurrency default (3), the scaling rules, and the async costs — **but publishes no cost/latency-vs-concurrency curve and no measured $c^\star$.** **CC-1 and CC-2 are [synthesis]** of the documented cost and the saturation/termination principles. **No source measures the straggler-timeout trade.** §8 is the local measurement.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Multi-agent costs **~15× chat tokens** [MAR] — concurrency is a linear spend multiplier.
2. **`max_concurrent_subagents` defaults to 3** [OMA] — a deliberately low platform bound.
3. **Scaling rules:** 1 agent (simple), 2–4 (comparison), 10+ (complex), embedded "to prevent overinvestment in simple queries" [MAR].
4. **Unbounded concurrency is a documented failure:** "50 subagents for simple queries" [MAR].
5. **The system is synchronous:** it "blocks on the slowest" and the lead "cannot steer subagents mid-task" [MAR] — latency is the straggler.
6. **Async's costs are named:** "result coordination, state consistency, and error propagation" [MAR] — not a free speedup.
7. Parallel tool calling cut research time "up to 90%" [MAR] — the latency win absent a straggler.
8. **No source publishes a cost/latency-vs-concurrency curve or a measured $c^\star$.**

**Decision rules.**
- **Concurrency is a budget** — bounded by cost (linear 15× per agent) and latency (straggler-capped SLA), at a finite $c^\star$ (CC-1).
- **Embed [MAR]'s scaling rules** — the lead over-spawns without them.
- **Bound the straggler with a timeout** (CC-2) — the synchronous system waits on the slowest otherwise, and the lost contribution is usually marginal.
- **Latency = max, not mean** — more subagents raise the straggler probability; do not assume more parallel is faster.
- **Project cost before spawning** — 15× per agent is a hard multiplier.
- **Async is a frontier, not a free speedup** — it trades the straggler for coordination, consistency, and error-propagation problems [MAR].

**Production implications.**
1. Set `max_concurrent_subagents` and a per-subagent timeout; unbounded concurrency is [MAR]'s 750×-a-chat failure.
2. Embed [MAR]'s scaling rules in the lead's prompt; without them it over-invests in simple queries.
3. Measure latency as the straggler (p95), not the mean; the synchronous bottleneck makes the tail the story.
4. Treat async as a deliberate frontier with three named costs — synchronous + timeouts is the right point for most systems today.

**Connections.** This topic prices the concurrency that Topic 1's benefit and Topic 2's tax are computed over. CC-1's finite $c^\star$ is Topic 2's MT-1, Topic 14's marginal contribution, and Chapter 5, Topic 15's saturation, at the concurrency layer. The straggler is Topic 4's synchronous bottleneck; CC-2's timeout is Chapter 8, Topic 11's termination bound. The async frontier is Topic 4's topology-coordination trade. The effort budget is [MAR]'s scaling rules (Topic 2).

**Chapter close.** Chapter 9 established that multi-agent systems are an economic and structural decision, not an architectural preference: the 90.2%/15× trade and its four disqualifiers (Topic 1); the gain-vs-tax calculus with its unresolved decomposition-vs-spend question (Topic 2); the three axes of specialization — role, information, authority — with authority the one that makes it a security architecture (Topic 3); the topologies ordered by coordination burden, with the shipped systems all using the least (Topic 4); parallel exploration and the synthesis that destroys the diversity it was purchased for (Topic 5); the context-sharing decision where the default destroys the benefit (Topic 6); the message layer and its missing causal ordering (Topic 7); the five coordination failures, four classical and one — cascading hallucination — categorically new (Topic 8); MCP's and A2A's trust boundaries (Topics 9–11); cross-framework composition where the protocol carries the word but not the meaning (Topic 12); identity propagation as the cross-org confused-deputy fix (Topic 13); the evaluation that must measure marginal contribution and keep humans in the loop (Topic 14); and — here — the concurrency control that prices it all. **Chapter 10 takes the long-horizon execution these systems require and makes checkpointing, compaction, and recovery the survival discipline.**

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — multi-agent "use about 15× more tokens than chats"; the **scaling rules** ("Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents… to prevent overinvestment in simple queries"); the **overinvestment failure** ("spawning 50 subagents for simple queries"); the **synchronous bottleneck** ("lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks"; the lead "cannot steer subagents mid-task"); the **straggler failure** ("scouring the web endlessly for nonexistent sources"); the **async frontier** ("Asynchronous execution would enable additional parallelism… But this asynchronicity adds challenges in result coordination, state consistency, and error propagation"); parallel tool calling cutting research time "up to 90%" — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — **`max_concurrent_subagents`** "limits the number of active subagent turns across the entire tree, including children and deeper descendants" but excludes root; **default 3 (recommended)**; "No upper bound imposed by API" — https://developers.openai.com/api/docs/guides/responses-multi-agent
