# Topic 2 — Reasoning-Token Allocation and Test-Time Compute

## 1. Problem and objective

Modern model APIs expose a dial that did not exist in earlier generations: how much computation the model spends deliberating before it answers. This changes the engineering problem from "which model?" to "which model, at what deliberation budget, for which step?" The objective of this topic is to fix the semantics of that dial as the interfaces actually define it, place the three distinct mechanisms that spend test-time compute (per-response deliberation, visible extended thinking, and multi-path search) in one frame, and state the allocation decision rules the sources support — along with an unusually important honesty section, because this is a topic where the sources provide *mechanisms* but not *curves*.

## 2. Intuition first

Test-time compute is the option to buy accuracy with latency and tokens at inference, per request, instead of buying it once at training time. Three purchasing formats exist. You can let the model deliberate longer privately before each answer (effort). You can have it deliberate *visibly*, producing inspectable chain-of-thought blocks (extended thinking). Or you can spend compute *structurally*: sample several candidate approaches and let feedback choose among them (search). The formats are independent and composable — and the most common allocation error is treating them as one knob called "make it smarter," paying for deliberation on steps where a file lookup was the task.

## 3. The three mechanisms, as the interfaces define them

### 3.1 Per-response deliberation: the effort parameter

The reference runtime's semantics [CAL]:

| Level | Behavior | Documented use |
|---|---|---|
| `low` | Minimal reasoning, fast responses | File lookups, listing directories |
| `medium` | Balanced reasoning | Routine edits, standard tasks |
| `high` | Thorough analysis | Refactors, debugging |
| `xhigh` | Extended reasoning depth | Coding and agentic tasks (recommended on current frontier models) |
| `max` | Maximum reasoning depth | Multi-step problems requiring deep analysis |

Contract details that matter for engineering: effort "trades latency and token cost for reasoning depth *within each response*"; unset means the model's default; not all models support it; it can be set per session or *per subagent*, so heterogeneous allocation inside one system is a first-class capability [CAL].

### 3.2 Visible deliberation: extended thinking

Extended thinking "produces visible chain-of-thought blocks in the output" and is explicitly **independent** of effort: "you can set `effort: 'low'` with extended thinking enabled, or `effort: 'max'` without it" [CAL]. The independence matters twice over. Operationally, visibility is an observability purchase (you can audit the deliberation), not an accuracy purchase. Epistemically, the visible trace is *not* the computation: the system card's evidence that operative internal states (fatigue, spurious budget beliefs) never appear in visible text [FSC §6.4.1.4], and that chain-of-thought monitors flag "far fewer episodes overall" than activation-level methods [FSC §6.4.2.1.2], bounds what reading the thinking can tell you. Buy visibility for what it is: a useful, incomplete window.

### 3.3 Structural allocation: search over candidates

Search-based planning "allocates inference-time compute to systematically explore, evaluate, and select among multiple candidate solution paths," in three documented substrates: branching in *thought space* (diverse strategies before implementation), in *trajectory space* (coding as a branching process over strategy, implementation, debugging, revision, with execution signals or learned critics deciding which nodes to expand — enabling backtracking from suboptimal decisions), and in *code space* (iterative exploration of neighboring programs guided by validation feedback) [CAH §3.1.3]. The survey's key structural observation: this "is not only a model-side sampling strategy, but also a harness-level state management problem: the runtime must preserve candidates, expose evidence, run validators, and decide which branch deserves further computation" [CAH §3.1.3]. Voting-style parallelization [BEA] is the degenerate (structureless) case of the same purchase.

## 4. Formalization of the allocation problem

Let a task decompose into steps with per-step success p_i(b_i) as a function of allocated compute b_i (effort level, samples drawn, or search width), and let B be the run's total budget (tokens, latency, dollars — the harness enforces the money form directly via `max_budget_usd` [CAL]). The allocation problem:

```
maximize   ∏ᵢ p_i(b_i)        subject to   Σᵢ cost(b_i) ≤ B
```

**[derived — structure ours]** Two source-grounded facts shape the solution more than any curve would:

1. **The marginal-value ordering is knowable from task shape.** Chapter 1's difficulty axes predict where p_i is compute-elastic: steps with high branching and genuine deliberative content (debugging, refactor planning) versus steps that are lookups. The documented effort-to-task mapping [CAL] is exactly this ordering, shipped as defaults.
2. **Compute does not substitute for information.** The router ablation is the sharp result: giving the routing decision to a highly capable model zero-shot scored 41.41; adding *measured statistics* — no additional intelligence — reached 47.74, and the paper's diagnosis is that the bottleneck "is information deficit rather than reasoning failure" [AAR §3.1]. Allocating deliberation to a decision whose inputs are missing buys reasoning about a vacuum. Spend on observations and evidence first (Topics 1.3, 6.x), deliberation second.

And one more, from the failure literature: **compute allocation is itself a model behavior with failure modes.** The spurious-budget-concern case — a model self-rationing to 3,637 tokens of a 2.43M-token budget on a mistaken internal belief [FSC §6.4.1.4] — is an *under*-allocation failure originating inside π_M. The harness sets the ceiling; nothing guarantees the model spends up to it.

## 5. Architecture: where the allocation decisions live

```
π_D (application)  — which pipeline stages exist; which get model calls at all (Ch.1 Topic 9)
π_H (harness)      — effort per session and per subagent [CAL]; budget ceilings; search-state
                     management: preserve candidates, run validators, prune branches [CAH §3.1.3]
π_M (model)        — how deliberation is actually spent within a response (opaque; §4's caveat)
```

The practical pattern the interfaces already support: **cheap default, expensive exceptions** — low/medium effort for the main loop, `xhigh`/`max` scoped to the subagents that own genuinely hard steps [CAL], with search reserved for steps that have a validator to arbitrate among candidates (search without a selector is just variance).

## 6. Measurement

The honest state of the evidence: **the sources document mechanisms, defaults, and one negative result — not accuracy-vs-compute curves.** No source in the ledger publishes an effort-response curve for an agentic task suite. Therefore:

1. Measure your own curve: fix (M, H, T-suite), sweep effort levels, plot TaskScore and cost per level; the decision-relevant statistic is marginal score per marginal dollar, per task class.
2. Sweep *allocation shape*, not just level: uniform-high vs. cheap-default-with-expensive-subagents at matched total spend; the interfaces make this a configuration experiment [CAL].
3. For search: score against validator strength — the same search width with and without executable checks separates the value of exploration from the value of selection [CAH §3.1.3].
4. Instrument model-side under-spend: turns that terminate with large unspent budgets on incomplete tasks are the behavioral signature of §4's self-rationing failure [FSC §6.4.1.4].

## 7. Failure modes

- **Uniform maximal effort:** paying `max` on lookup steps; pure waste with added latency — the documented guidance is per-task-class assignment [CAL].
- **Deliberation as a substitute for evidence:** the [AAR §3.1] anti-pattern; reasoning harder about an under-observed decision.
- **Search without a selector:** candidates multiplied with no oracle to choose; the compute buys variance, not accuracy [CAH §3.1.3's requirement that the runtime "run validators"].
- **Reading extended thinking as ground truth:** the visible trace omits operative states [FSC §6.4.1.4]; auditing that treats it as complete telemetry inherits the omission.
- **Model self-rationing:** premature stops on spurious internal budget beliefs [FSC §6.4.1.4]; the ceiling is enforced, the floor is not.
- **Latency-blind allocation:** effort multiplies decode time inside every turn of a many-turn loop; a per-response choice becomes a per-run multiplier (Chapter 14's latency decomposition).

## 8. Limitations

- No public scaling curves for effort on agentic suites exist in the ledger; §6's protocol is the remedy, and any vendor claim of the form "higher effort ⇒ better agentic performance" should be treated as a hypothesis your suite must test.
- The effort parameter's internal semantics are opaque and model-dependent ("not all models support it" [CAL]); cross-model comparisons at "the same" effort level are not calibrated comparisons.
- The search taxonomy [CAH §3.1.3] synthesizes research systems; production-grade search harnesses (candidate persistence, branch accounting) are engineering the sources describe but do not benchmark. Harness-Bench's turn/token spread [HB Table 2] shows configurations differ wildly in spend, but does not isolate deliberation from other harness differences.

## 9. Production implications

1. **Set effort per step class, not per product.** The per-subagent override [CAL] exists precisely so the expensive setting can be scoped to the steps that earn it.
2. **Cap with money, not vibes:** `max_budget_usd` as the enforced ceiling, with termination subtypes handled [CAL]; then measure whether the model *uses* its budget (§6.4).
3. **Buy information before deliberation** when a decision underperforms: the +15.3%-from-statistics result [AAR §3.1] is the standing reminder that evidence pipelines are often the cheaper fix.
4. **Give every search a validator.** If a step has no oracle or judge to select among candidates, search allocation there is unjustified; route that budget to verification instead (Topic 1.8's d-before-p̄ rule).
5. **Track spend-per-successful-task by step class** — the only number that makes allocation debates empirical (Chapter 14's token economics).

## 10. Connections

- Topic 3 uses the search mechanism as one of four planning loci; Topic 8 revisits sampling-based self-consistency as an uncertainty instrument.
- Topic 12's router is the allocation problem at the granularity of whole models; Topic 13 places test-time compute against fine-tuning as competing accuracy purchases.
- Chapter 6 (context) and Chapter 14 (economics) own the token-budget interactions; Chapter 10 handles budget management over long horizons where §7's self-rationing failure matters most.

## Sources

[CAL] Claude Agent SDK, "How the agent loop works" (effort levels, budgets, extended-thinking note) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1.3
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §3.1, Table 1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.4.1.4, §6.4.2.1.2
[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) Table 2
