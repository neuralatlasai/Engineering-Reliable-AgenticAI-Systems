# Topic 3 — Plan Generation, Execution, Reflection, Replanning, and Verification

## 1. Problem and objective

A plan is the model's most consequential output that is not an action: it constrains every action that follows. This topic treats the plan lifecycle — generate, execute, reflect, replan, verify — as an engineering object, using the strongest available framing from the sources: planning is not merely an internal reasoning capability of the model but **a form of harness control** [CAH §3.1]. The objective is to establish why explicit planning exists (what failure it prevents), the four loci where plan control can be realized, what turns a plan from a prompt artifact into a durable control object, and where the lifecycle's own failure modes live.

## 2. Intuition first

Watch an unplanned agent attack a large task and you see the failure the planning literature exists to prevent: it starts typing immediately, commits to the first plausible approach, discovers a blocking dependency at step eleven, and has no representation of what it has done, what remains, or what its earlier self intended. The Code-as-Agent-Harness survey names the tension precisely: real tasks pose a conflict "between the complexity of the target task and the limited reliability of unconstrained agent execution: without an explicit planning mechanism as harness control, the agent may commit too early to brittle solution paths, overlook latent dependencies, or fail to coordinate reasoning, retrieval, execution, and revision into a stable workflow" [CAH §3.1]. A plan is scaffolding for a policy that cannot hold the whole task in working memory — which, per Chapter 1's Topic 3, no agent can.

## 3. Formalization: the plan in the formal model

In Chapter 1's terms, a planning action is action type 3: an output that "explicitly... decompose[s] tasks, [produces] execution plans, or subgoal specifications *to guide later behavior*" [MEM §2.1]. Formally, a plan P is a constraint on the policy's future choices: after emitting P, the effective policy becomes π(a_t | o_t, m_t, 𝒬, P) — the plan enters the conditioning context. Three consequences **[derived — framing ours; components sourced]**:

1. **A plan is only as binding as its persistence.** If P lives solely in conversational history, compaction can delete it [CAL]; the constraint silently lapses.
2. **A plan is a belief-state artifact.** It encodes assumptions about the environment made at generation time; environment drift or discovery invalidates it, which is why *replanning* is a first-class operation, not an exception path.
3. **Plan quality is verifiable separately from execution quality.** A run can fail from a bad plan executed well or a good plan executed badly — different fixes, distinguishable only if the plan is an inspectable object.

## 4. The lifecycle, stage by stage

**Generate.** The model produces a decomposition. The documented spectrum runs from a natural-language outline translated to steps (Self-Planning: "decompose the intent into concise, high-level numbered steps, then generate code step by step under the guidance of this plan" [CAH §3.1.1]) to graph-structured plans derived from dependency analysis (CodePlan "constructs a plan graph over edit obligations and derives new steps through dependency analysis and change-impact propagation" [CAH §3.1.2]).

**Execute.** Steps become actions through the ordinary loop (Chapter 1, Topic 2). The plan's role during execution is *admission control on relevance*: the current subgoal narrows the action space — the mechanism by which planning raises per-step p (Chapter 1, Topic 6's branching axis).

**Reflect.** Execution feedback — runtime exceptions, test results, critiques [CAH Table 4's feedback column] — is compared against the plan's expectations. Reflection without externalized expectations degenerates into the model re-reading its own prose; the comparison needs the plan to have stated *what success at each step looks like* (acceptance criteria).

**Replan.** Plan-And-Act's mechanism is the documented pattern: a separated planner "repeatedly refreshes the linear scaffold as new observations arrive, allowing the planning strategy to preserve task-level control while adapting to environmental feedback" [CAH §3.1.1]. Replanning is where the linear paradigm's known weakness bites: these methods "typically commit to a single decomposition trajectory: when the initial plan is incomplete or misaligned, the harness can improve persistence and auditability, but it still provides limited exploration beyond the chosen path" [CAH §3.1.1]. Escaping the committed path requires search (multiple candidate trajectories, backtracking [CAH §3.1.3]) or orchestration (failure-driven re-routing [CAH §3.1.4]).

**Verify.** Two distinct verifications, frequently conflated: *step verification* (did this step achieve its acceptance criterion — deterministic sensors where possible [CAH §3.4.4]) and *plan verification* (does the remaining plan still lead to the goal given what execution revealed). The survey's control-loop framing places both inside a Plan–Execute–Verify cycle where "plans form contracts over intended changes, execution applies them inside sandboxed and permissioned environments, and verification uses deterministic sensors and human-review gates to decide whether the state should be accepted, revised, escalated, or rolled back" [CAH §3, §3.4].

## 5. The plan as a persistent harness object

The most consequential engineering development the survey records: lifting the plan "from an ephemeral prompt artifact to a persistent harness object." In long-horizon workflows, "files such as `PLAN.md`, `Implement.md`, and status logs record milestones, acceptance criteria, validation commands, and recovery rules, allowing the agent to reload, update, verify, and document progress across context resets or multi-session execution... planning is no longer merely an internal reasoning trace, but a filesystem-backed control object: it can be reviewed by humans, versioned with Git, consumed by subagents, and used as the source of truth for implementation" [CAH §3.1.1].

This single move solves three problems at once, all established in Chapter 1: compaction loss (the plan is re-readable, not remembered — Topic 1.3's belief prosthesis), multi-agent divergence (subagents consume one source of truth), and auditability (humans review the constraint, not just the actions). Its cost is a consistency obligation: a persistent plan that execution has silently departed from is *worse* than no plan, because downstream consumers trust it (the certified-error hazard of Topic 1.8 §7).

**What a production plan object minimally contains**, per the documented pattern [CAH §3.1.1]: milestones; acceptance criteria per milestone; validation commands (the executable form of "how we'll know"); recovery rules (what to do when a milestone fails). Note what this list is: Chapter 1's Topic 8 verification algebra, serialized.

## 6. Evidence that the lifecycle earns its cost

- The tension it addresses is measured, not hypothesized: unconstrained long-horizon execution is what produces CompWoB's composition collapse [CompWoB] and ALE's near-zero hard-tier pass rates [ALE §1] (Chapter 1, Topics 7–8).
- Structure-grounded planning "improves coherence, dependency awareness, and long-horizon consistency by turning project or domain knowledge into explicit and inspectable harness objects that guide the agent's behavior over time" [CAH §3.1.2].
- The premature-stopping evidence gives the verification stage its sharpest justification: a model that ends an exhaustive search after one tool call on a false internal budget belief [FSC §6.4.1.4] is exactly the agent whose "done" must be checked against the plan's acceptance criteria rather than accepted as a stop condition (Chapter 10's verified-stop rule).
- Honest counterweight: no source in the ledger reports a controlled plan/no-plan ablation on matched tasks. The survey's synthesis is extensive but observational; Chapter 13's ablation methodology is how a team makes the case quantitative for its own workload.

## 7. Failure modes

- **Plan-as-theater:** a generated plan that execution never consults; all cost, no constraint. Detection: no references to plan steps in the trace; plan file never re-read after creation.
- **Single-trajectory commitment:** the documented linear-paradigm limitation [CAH §3.1.1]; the initial decomposition is wrong and every subsequent step is faithful to the wrong thing. Mitigations: search-based exploration before commitment; replanning triggers wired to failure signals, not just to step completion.
- **Stale-plan certification:** persistent plan diverges from actual state; subagents and humans consume fiction (§5). Mitigation: plan updates as part of the step-completion transaction, verified by the validation commands the plan itself carries.
- **Reflection without expectations:** "reflection" that re-narrates the transcript instead of diffing against acceptance criteria; fluent, useless, and vulnerable to the self-report failures of [FSC §2.3.3].
- **Replanning thrash:** every minor surprise triggers full replan; the agent spends its budget redrawing maps. The planner/executor separation with *scheduled* refresh [CAH §3.1.1] is the standard damping mechanism.
- **Verification asymmetry:** step checks pass while plan-level verification is never run; locally green, globally lost — the agent completes milestones toward a goal the environment has already invalidated.

## 8. Limitations

- The four-stage lifecycle is a rational reconstruction; real traces interleave stages, and the sources' systems differ on where stages live (model, harness, or both). The load-bearing distinction — plan as inspectable object vs. internal trace — survives the blur.
- Plan-quality metrics are underdeveloped in the sources: Table 4 records interfaces and feedback types [CAH §3.1], not plan-accuracy measurements. Proxy metrics (replan frequency, milestone-failure rate, plan-trace consistency) are **[derived]** suggestions, not sourced standards.
- Everything here presumes the task *admits* decomposition with checkable milestones; Chapter 1 Topic 6's "long horizon, no intermediate checks" row remains the shape where planning helps least and redesign helps most.

## 9. Production implications

1. **Make the plan a file, not a prompt.** `PLAN.md`-style persistent objects with milestones, acceptance criteria, validation commands, recovery rules [CAH §3.1.1] — reviewed like code, versioned like code.
2. **Wire acceptance criteria to executable checks** at plan-generation time; a milestone without a validation command is a hope, not a milestone.
3. **Separate the stop condition from the model's satisfaction:** task ends when plan-level verification passes, not when the model declares completion [FSC §6.4.1.4; Chapter 10].
4. **Budget for one replan, monitor for many:** replan frequency is a leading indicator — zero suggests plan-as-theater; high suggests a bad initial decomposition or a drifting environment.
5. **Choose the planning locus by task shape** (next topic's decision table): linear for known structure, graph-grounded for dependency-heavy repositories, search where validators can arbitrate, orchestration where failure-routing is the real control problem.

## 10. Connections

- Topic 4 compares the two ends of the plan-control spectrum (interleaved vs. separated); Topic 2 supplied the search machinery this lifecycle invokes at the replan stage.
- Chapter 1's Topics 3 (belief), 8 (verification algebra), and 10 (minimal agency) are the theory this lifecycle operationalizes.
- Chapter 8 implements plan structures as workflow graphs; Chapter 10 owns plan persistence across sessions; Chapter 11 shows the lifecycle at home in coding agents, where validation commands are native.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3, §3.1.1–3.1.4, §3.4, Table 4
[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §2.3.3, §6.4.1.4
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1
