# Topic 4 — ReAct-Style Interleaving versus Explicit Planner–Executor Separation

## 1. Problem and objective

Topic 3 established the plan lifecycle; this topic settles the architectural question inside it: should reasoning and acting be *interleaved* in one serial trajectory (the ReAct pattern), or should a *planner* produce structure that a separate *executor* follows? The two designs distribute the same work differently across the policy stack, and they fail differently. The objective is a precise account of each mechanism as the sources describe it, the trade space between them, and decision rules keyed to Chapter 1's task-shape axes — plus the observation that production systems have quietly converged on a hybrid whose properties are worth stating explicitly.

## 2. Intuition first

Interleaving is thinking out loud while working: decide, act, look, decide again. Every decision is maximally informed by the latest observation — and minimally informed by global structure, because no one ever stepped back to draw the map. Planner–executor is the architect/builder split: the map is drawn first and followed; global structure is explicit — and every map is wrong somewhere, so the question becomes how the builder discovers this and how expensively. Neither is the grown-up version of the other. They sit at two ends of a dial labeled *when is structure decided*, and the right setting depends on how much of the task's structure is knowable before acting — which is Chapter 1, Topic 6's observability and horizon axes wearing different clothes.

## 3. The two mechanisms, as documented

### 3.1 ReAct-style interleaving

The survey's characterization is unusually precise about *why* interleaving is itself a control mechanism: ReAct "interleaves thoughts, actions, and observations in a serial trajectory. In this framework, **each reasoning step externalizes the current subgoal and constrains the next action, turning the trajectory itself into a stepwise harness for control**" [CAH §3.1.1]. The formal model already covers it: ReAct is the N=1 base case of the agent formalization [MEM §2.1], and the reference runtime's loop — evaluate, act, observe results, repeat until a response with no tool calls [CAL] — is interleaving as shipped infrastructure.

Properties: decisions condition on the freshest possible o_t (maximal adaptivity); the "plan" exists only as the rolling emitted-subgoal stream (no global object to verify against, no persistence beyond history); horizon discipline comes only from the model's own coherence plus harness budgets.

### 3.2 Planner–executor separation

The documented pattern: Self-Planning ("the model first decomposes the intent into concise, high-level numbered steps, and then generates code step by step under the guidance of this plan") and, one step further, Plan-And-Act, which "makes this harness explicit by separating a planner, which produces structured high-level plans," from execution, with the planner "repeatedly refresh[ing] the linear scaffold as new observations arrive, allowing the planning strategy to preserve task-level control while adapting to environmental feedback" [CAH §3.1.1]. The formal model names planner–executor as a standard multi-agent configuration [MEM §2.1] — the separation can be two roles for one model, two calls, or two models.

Properties: global structure is explicit, inspectable, verifiable, persistable ([CAH §3.1.1]'s `PLAN.md` lift — Topic 3 §5); execution decisions are constrained by a possibly-stale artifact; adaptivity is mediated by a refresh loop whose frequency is a design parameter; the known limitation is single-trajectory commitment [CAH §3.1.1].

### 3.3 The rest of the dial

The four-way planning taxonomy [CAH §3.1] locates both patterns and the two beyond them, organized by "the primary locus where harness control is realized": linear decomposition (both of the above — ReAct as its "lightweight precursor"), structure-grounded (the plan derived from dependency/repository graphs rather than free generation), search-based (multiple candidate trajectories with backtracking — separation plus exploration), and orchestration-based (planning "not an up-front artifact, but an emergent property of how failures are detected, interpreted, and routed back into subsequent actions" [CAH §3.1.4] — interleaving's philosophy at system scale).

## 4. The trade space

| Property | Interleaved (ReAct) | Planner–executor |
|---|---|---|
| Information at decision time | Freshest o_t, always | Plan-time beliefs + executor's local view |
| Global coherence | Emergent, unguaranteed | Explicit, verifiable |
| Adaptivity to surprise | Immediate, free | Mediated by replan/refresh loop |
| Failure signature | Myopia: locally sensible steps, global drift | Commitment: faithful execution of a wrong map [CAH §3.1.1] |
| Auditability | Trajectory only | Plan object + trajectory (separable diagnosis: bad plan vs. bad execution — Topic 3 §3.3) |
| Compaction/session robustness | Poor — control state lives in history [CAL] | Good, if plan persisted [CAH §3.1.1] |
| Cost shape | Per-step deliberation throughout | Plan cost up front + cheaper constrained steps |
| n_stoch (Ch.1 Topic 8) | Every step is an unconstrained choice | Choices narrowed per step; plan itself is one large stochastic act |

The last row deserves expansion, because it is the reliability heart of the comparison **[derived — composition of Ch.1 Topic 8 with the sourced mechanisms]**. Interleaving spreads stochastic choice across all n steps: n draws, each moderately constrained. Separation concentrates stochasticity: one large draw (the plan) plus n *narrowed* draws. If plan verification is available — a human review, a dependency check, acceptance criteria [CAH §3.1.1–3.1.2] — the concentrated draw can be checked *once, before execution spends anything*, which is the cheapest possible placement of a verifier. If plan verification is not available, separation merely front-loads an unverifiable bet. That is the whole decision rule in one sentence: **separate when the plan can be checked; interleave when only actions can be checked.**

## 5. Decision rules by task shape

Keyed to Chapter 1, Topic 6's axes:

- **Structure discoverable only by acting** (A1/A3 tasks: debugging, incident diagnosis, exploratory research) → interleave. A plan drawn before the first observation encodes ignorance as constraint. The environment's feedback *is* the specification [CAL loop; Ch.1 Topic 9].
- **Structure knowable in advance** (repository edits with a dependency graph, migrations, multi-file refactors) → planner–executor, ideally structure-grounded: derive the plan from the dependency graph rather than free-form generation — "improves coherence, dependency awareness, and long-horizon consistency" [CAH §3.1.2].
- **Long horizon, either way** → separation's persistence wins mechanically: interleaved control state is a compaction hostage [CAL], while a filesystem-backed plan survives context resets and multi-session execution [CAH §3.1.1]. Chapter 10 builds on exactly this.
- **High-stakes plans, verifiable** → separation, because the plan-level review gate (human or deterministic [CAH §3.4]) has no interleaved equivalent — you cannot pre-approve a map that is drawn one step at a time.
- **Cheap steps, fast feedback, short horizon** → interleave; the coordination overhead of separation buys nothing that the next observation doesn't provide for free.

## 6. The production hybrid

The shipped systems in the sources are neither pole. The reference runtime is an interleaved loop *plus* plan-shaped controls: a dedicated plan permission mode ("Claude explores and plans without editing your source files" [CAL]), persistent instruction files re-injected every request [CAL], and the `PLAN.md` practice layered on top [CAH §3.1.1]. The resulting architecture — **plan as persistent constraint, interleaved execution within it, scheduled plan refresh** — takes separation's auditability and persistence and interleaving's per-step adaptivity, at the cost of the consistency obligation Topic 3 §5 named (the plan must be updated as part of step completion, or it certifies fiction). This hybrid is what "planner–executor" should be taken to mean in production discussions; the pure separated form survives mainly where regulation or risk demands pre-approved plans.

## 7. Failure modes

- **Interleaved drift:** each step locally coherent with the last, globally divergent from the goal — no object exists against which drift is measurable. CompWoB's composition collapse [CompWoB] and the instruction-order sensitivity are this signature at benchmark scale; Chapter 10's goal-drift treatment inherits it.
- **Executor fidelity to a dead plan:** the single-trajectory commitment [CAH §3.1.1]; the executor's very obedience becomes the failure amplifier. Mitigation: refresh triggers wired to failure signals (Topic 3 §7).
- **Refresh thrash:** replan on every surprise; structure never stabilizes (Topic 3 §7's damping).
- **Role confusion in one context:** planner and executor as the same model in the same context window bleed into each other — the "executor" silently re-plans, the "planner" silently executes. The mitigation is mechanical isolation: separate calls, subagents with scoped tools [CAL], or the plan file as the only shared channel.
- **Myopic tool spam:** interleaving's pathological form — act-look-act loops that substitute observation for thought; rising turn counts at flat progress ([HB Table 2]'s turn accounting is the instrument; Ch.1 Topic 9 §6 noted the top-scoring harness used *fewer* turns).

## 8. Limitations

- No controlled head-to-head trial of interleaved vs. separated control on matched tasks exists in the ledger; §4's table synthesizes documented mechanisms and known limitations, not experimental deltas. Harness-Bench measures whole configurations, in which the planning locus is one confounded ingredient [HB §3.1].
- The n_stoch argument (§4) inherits Topic 1.8's independence caveats; plan narrowing helps only to the extent the plan is *right*, and the sources do not quantify plan-accuracy distributions.
- "ReAct" in the literature spans everything from the original pattern to any tool loop; claims imported from outside this ledger about "ReAct performance" should be checked for which sense they measure.

## 9. Production implications

1. **Default to the hybrid (§6):** persistent plan object, interleaved execution inside it, refresh on failure signals — it is what the reference infrastructure already supports [CAL; CAH §3.1.1].
2. **Choose the pure forms deliberately:** pure interleaving for discovery-shaped tasks; pure separation where plans must be pre-approved (Chapter 12's approval gates attach to plan objects, not to token streams).
3. **Place a verifier at the plan boundary whenever separation is chosen** — the one-check-before-all-spend placement (§4) is the pattern's entire economic advantage; skipping it keeps the cost and discards the benefit.
4. **Isolate roles mechanically, not rhetorically** (§7.4): separate calls or subagents, scoped tools, plan file as interface.
5. **Instrument the signatures:** turns-per-milestone (myopia), plan-refresh rate (thrash/theater), plan–trace consistency (dead-plan execution) — all computable from the Chapter 1, Topic 12 run record.

## 10. Connections

- Topic 3 supplied the lifecycle this topic's architectures implement; Topic 2's search is the escape hatch from single-trajectory commitment.
- Chapter 8 generalizes the planner–executor split into orchestration patterns (supervisor–worker and beyond); Chapter 9 treats the multi-agent version, where the plan file becomes shared state with concurrency semantics.
- Chapter 10 depends on the persistence argument (§5): long-horizon continuity is planner–executor separation stretched across sessions.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1, §3.1.1–3.1.4, §3.4
[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1
[CAL] Claude Agent SDK, "How the agent loop works" (loop, plan mode, persistent context, compaction) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.1, Table 2
