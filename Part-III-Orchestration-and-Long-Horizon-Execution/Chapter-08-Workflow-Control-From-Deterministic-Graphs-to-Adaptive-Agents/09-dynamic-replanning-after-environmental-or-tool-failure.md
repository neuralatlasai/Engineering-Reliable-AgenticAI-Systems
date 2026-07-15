# Topic 9 — Dynamic Replanning After Environmental or Tool Failure

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** What happens when the plan meets a world that refuses it: a tool fails, an assumption is refuted, the environment is not what the planner believed. Replanning is the control-flow response, and its discipline is what separates an adaptive agent from one that thrashes.

**Prerequisites.** Topic 4 (A-1: a plan is valid only while its assumptions hold); Topic 7 (typed state — failure must be a *field* to trigger on); Chapter 3, Topic 10 (the exception taxonomy — what kinds of failure exist); Chapter 5, Topic 11 (retry, idempotency, compensation — the *action*-level response).

**Terminology.** *Replanning*: revising the plan in response to new information. *Refutation*: an observation that contradicts a plan assumption. *Thrashing*: repeated replanning that makes no progress. *Progress*: a measurable reduction in distance to the goal.

**Boundaries.** Inside: when to replan, how much to replan, and how to guarantee progress. Outside: the retry/compensation of a *single action* (Chapter 5, Topic 11); termination proofs (Topic 11); durable recovery (Topic 10).

**Exclusions.** No planning-algorithm survey.

**Outcomes.** The reader can trigger replanning on the right signals, replan incrementally rather than from scratch, and guarantee the replanning loop makes progress rather than thrashing.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Every plan is a prediction (Topic 4, A-1), and predictions about a real environment are wrong in ways that only execution reveals: the file is not there, the API returns an error, the test fails, the repository's structure is not what the planner assumed. **The agent must respond — and the naive responses are all bad.** *Ignore it* (execute the refuted plan faithfully — Topic 4's failure). *Retry blindly* (Chapter 5, Topic 11's catastrophe, at the plan level). *Replan from scratch every time* (discard all completed work; thrash).

**Bottleneck.** Replanning is a **loop**, and loops without a progress guarantee do not terminate (Topic 11). An agent that replans on every failure, and whose new plan fails the same way, will replan forever — burning budget, making no progress, and looking busy. **The bottleneck is that replanning is easy to trigger and hard to bound**: the trigger is a failure signal (common), and the bound requires a notion of *progress* (which most systems do not define).

**Objective.** Replan on the right signal (a *refutation*, not merely an error), replan *incrementally* (retain valid completed work), and guarantee *progress* (each replan must reduce something, or terminate).

**Assumptions.** The environment surprises the plan. Some failures are transient (retry) and some are refutations (replan) — and telling them apart is the first decision.

**Constraints.** Replanning costs a model call ($K_M$, Topic 1) and discards work. Unbounded replanning does not terminate.

**Success criteria.** Refutations trigger replanning; transient failures trigger retry; completed valid work is retained; the replanning loop provably progresses or terminates.

## 3. Intuition first, then formalization

### 3.1 Intuition: not every failure is a replanning signal

The first and most consequential decision is **what kind of failure this is**, because the correct responses are different and mutually exclusive **[synthesis; grounded in Chapter 3, Topic 10 and Chapter 5, Topic 11]**:

- **Transient failure** — the action failed for a reason that may not recur (a timeout, a rate limit, a flaky network). **Response: retry** (Chapter 5, Topic 11 — with idempotency, because the effect may have landed). **Replanning here is wrong**: the plan was fine; the world hiccuped.
- **Refutation** — the observation *contradicts a plan assumption*. The file the plan assumed exists does not. The API the plan assumed supports an operation does not. **Response: replan.** **Retrying here is wrong**: the action will fail identically, forever, because the plan is based on a false premise.
- **Terminal failure** — the action failed for a reason no plan can overcome (permission denied permanently, resource does not exist and cannot be created). **Response: escalate** (Topic 8) or fail honestly. **Both retry and replan are wrong**: nothing the agent can do will help.

**Misclassifying these is the source of the classic agent pathologies.** Retrying a refutation → an infinite loop of identical failures. Replanning a transient → thrashing (the plan was fine; the new plan will hit the same hiccup). Retrying or replanning a terminal → burning the entire budget on an impossible task, then reporting failure at the end instead of at the start.

**The signal that distinguishes them is in the failure, and it must be typed** (Topic 7): a `timeout` is transient; an `assumption_refuted` is a refutation; a `policy_block` is terminal. **This is why Topic 7's typed `StepResult` with $\kappa$ is a prerequisite: you cannot branch on a failure class you did not capture.**

### 3.2 Formalization: the replanning trigger, incrementality, and the progress guarantee

**The trigger.** Replan iff an observation refutes a plan assumption **[derived from Topic 4's A-1]**:

$$
\textbf{RP-1 (replan on refutation, not on error):}\quad
\text{replan} \iff \exists\, a \in \mathrm{assumptions}(P):\ \neg a(\mathrm{observed}(s)) .
$$

RP-1 is Topic 4's A-1 turned into a control action. **An error that does not refute an assumption is not a replanning signal** — it is a retry (transient) or an escalation (terminal). This single distinction eliminates the two most common replanning pathologies.

**Incrementality.** A refutation invalidates *part* of the plan, not necessarily all of it **[derived]**:

$$
\textbf{RP-2 (replan incrementally):}\quad
P' = \operatorname{replan}\bigl(\underbrace{\text{goal}}_{\text{unchanged}},\ \underbrace{\text{completed}(P)}_{\text{RETAINED if still valid}},\ \underbrace{\text{observed}(s)}_{\text{new information}},\ \underbrace{\text{refuted}}_{\text{what broke}}\bigr).
$$

RP-2 says: **do not throw away completed, still-valid work.** If steps 1–4 succeeded and step 5's assumption was refuted, the new plan starts from the state *after* step 4 — it does not redo them. Replanning from scratch on every failure is how an agent spends its budget re-doing work it already did. **The completed steps' validity must itself be checked** (did the refutation invalidate them retroactively?) — but the default is retention.

**The progress guarantee — the invariant that prevents thrashing.** A replanning loop is a loop; loops need a termination argument (Topic 11) **[derived]**:

$$
\textbf{RP-3 (progress or terminate):}\quad
\text{each replan must strictly reduce a well-founded measure } \mu\ \text{— or the loop terminates.}
$$

$\mu$ can be: the number of unresolved subgoals, the set of untried approaches, or simply a **replan budget** (a counter). **Without RP-3, an agent whose new plan fails the same way replans forever.** The cheapest and most robust $\mu$ is a bounded counter — *replan at most $N$ times* — but a better one is **novelty**: the new plan must differ from the failed one in a way that addresses the refutation. **A replan that produces the same plan is not a replan; it is a retry wearing a costume**, and it must be detected (§6).

### 3.3 The thrashing pathology, and why novelty is the real guarantee

The failure mode this topic most needs to prevent, stated concretely:

An agent's plan assumes a file exists. It does not. The agent replans — and the new plan *also* assumes the file exists (because the model, given the same goal and the same context, produces a similar plan). It fails identically. The agent replans again. **The loop runs until the budget dies, having made zero progress, while generating a great deal of plausible-looking activity.**

**This is not a hypothetical; it is the characteristic failure of naive replanning**, and it happens because the replan was not *informed by the refutation*. The fix has two parts **[synthesis]**:

1. **The refutation must be in the replanner's context.** The new plan must know *what was refuted and why* — not just "the previous attempt failed." Passing "step 5 failed" produces a similar plan; passing "the assumption `config.yaml exists` was refuted: the file is not in the repository" produces a different one.
2. **Novelty must be checked.** If the new plan is semantically identical to the failed one, replanning is not progressing (RP-3's $\mu$ is not decreasing). **Detect it and escalate** rather than looping — the agent has exhausted its ideas, and a human (Topic 8) or a different approach is needed.

**Novelty checking is the practical form of the progress guarantee**, and it is the thing most replanning implementations lack. A replan counter bounds the damage; a novelty check *detects the pathology* and lets you respond to it.

## 4. Architecture

```
   EXECUTING plan P
        │
        ▼  step fails → typed StepResult with κ (Topic 7 — you cannot branch on
        │                                          a failure class you didn't capture)
   ┌── CLASSIFY THE FAILURE (§3.1) — the first and most consequential decision ─────┐
   │                                                                                │
   │  TRANSIENT (timeout, rate-limit, flaky)   →  RETRY (Ch.5 T11: w/ idempotency!) │
   │       ↑ replanning here = THRASHING (the plan was fine)                        │
   │                                                                                │
   │  REFUTATION (assumption contradicted)     →  REPLAN (RP-1)                     │
   │       ↑ retrying here = INFINITE identical failures                            │
   │                                                                                │
   │  TERMINAL (permission denied, impossible) →  ESCALATE (Topic 8) / fail honestly│
   │       ↑ retry OR replan here = burn the whole budget on an impossible task     │
   └───────────────────────────────┬────────────────────────────────────────────────┘
                                    │ REFUTATION
                                    ▼
   ┌── RP-2: INCREMENTAL REPLAN — retain completed valid work ─────────────────────┐
   │    replan(goal, completed_steps, observed_state, WHAT WAS REFUTED AND WHY)     │
   │                                              ↑ §3.3: without this, the new plan │
   │                                                repeats the same assumption      │
   └───────────────────────────────┬────────────────────────────────────────────────┘
                                    ▼
   ┌── RP-3: PROGRESS GUARANTEE ──────────────────────────────────────────────────┐
   │    NOVELTY CHECK: is P' meaningfully different from P?                        │
   │       NO  → the agent is out of ideas. ESCALATE (Topic 8). Do NOT loop.       │
   │       YES → μ decreased. Execute P'.                                          │
   │    + a replan BUDGET (bounded counter) as the backstop (Topic 11)             │
   └──────────────────────────────────────────────────────────────────────────────┘
```

**The classification step is the architecture's load-bearing element**, and it is usually absent. Most agents have a single "on error → try again" path, which conflates all three failure classes and therefore exhibits all three pathologies. **Separating them requires typed failures (Topic 7) and costs almost nothing** — a `match` on $\kappa$ — and it eliminates the majority of replanning pathologies.

## 5. Grounding

- **Planning must be a harness-level control mechanism, not a one-shot scaffold:** planning "evolved from a simple pre-generation scaffold into a richer harness-level control mechanism"; without it agents "may commit too early to brittle solution paths, overlook latent dependencies, or fail to coordinate reasoning, retrieval, execution, and revision into a stable workflow" [CAH §3.1]. **Replanning is the "revision" in that list, and the source names its absence as a failure.**
- **The PEV loop is the replanning structure:** Plan–Execute–Verify — "the harness first externalizes an intended change and its validation criteria, then executes the change inside a sandboxed and permissioned environment, and finally verifies the resulting state through deterministic sensors and human-review gates" [CAH §3.4]. **The verify stage is where a refutation is detected**, and the loop back to plan is replanning.
- **The harness decides the response, and the options are enumerated:** the cybernetic governor decides "whether to continue execution, **revise a patch**, request more context, route the task to another module, reduce permissions, or escalate to a human reviewer" [CAH §3.4.1]. **This is §3.1's classification, sourced: the responses are distinct and the harness chooses among them.**
- **Agents use environmental ground truth:** agents "leverage ground truth from the environment at each step" [BEA] — the observation that refutes the plan.
- **Poor retry policies are a documented failure mechanism:** "poor retry policies" among the recurring non-model failures [CAH §3.5] — the transient/refutation misclassification.
- **The exception taxonomy:** Chapter 3, Topic 10 (seven failure classes) — the typed failure signal replanning branches on.
- **Retry vs replan at the action level:** Chapter 5, Topic 11 (retry with idempotency; ambiguous failure; compensation) — the *action*-level response this topic's *plan*-level response sits above.
- **Search-based planning explores alternatives:** [CAH §3.1]'s search-based planning — "expanded through explicit search over multiple candidate trajectories to improve robustness" — a *systematic* form of the novelty requirement (§3.3).

**Evidence gap.** The *need* for replanning and the *enumeration of harness responses* are sourced [CAH §3.1, §3.4.1]. What is **unmeasured**: replanning frequency, thrashing rates, the effect of incremental vs from-scratch replanning, and the value of novelty checking. **RP-1..RP-3 are [derived]** (RP-1 from Topic 4's A-1; RP-2 from efficiency reasoning; RP-3 from termination requirements — Topic 11). **The thrashing pathology (§3.3) is [synthesis]** — reasoned from the model's tendency to produce similar plans given similar context (Chapter 2), not measured. §8 measures locally.

## 6. Implementation

**Classify the failure — the load-bearing step (§3.1):**

```python
TRANSIENT = {"timeout", "rate_limited", "connection_error"}
TERMINAL  = {"policy_block", "permission_denied", "not_found_permanent"}

def handle_failure(result: StepResult, plan, state, ctx) -> Response:
    """§3.1: three failure classes, three RESPONSES. Conflating them produces all three
    pathologies. This match is cheap and eliminates most replanning failures."""
    if result.kappa in TRANSIENT:
        return Response.retry(result.step, idempotency_key=key_for(result.step))   # Ch.5 T11

    if result.kappa in TERMINAL:
        return Response.escalate(reason=result.note)                # Topic 8 — no plan helps

    refuted = [a for a in plan.assumptions if not a.holds(observe(state))]   # RP-1
    if refuted:
        return Response.replan(refuted=refuted)

    # An error that refutes nothing and is not transient/terminal: an execution error.
    return Response.retry_once_then_escalate(result.step)
```

**Incremental replanning with the refutation in context (RP-2, §3.3):**

```python
def replan(plan, refuted, state, completed, planner, ctx) -> Plan:
    """RP-2: RETAIN completed valid work. §3.3: the replanner MUST see WHAT was refuted
    and WHY — otherwise it produces the same plan and the loop thrashes."""
    still_valid = [s for s in completed if not invalidated_by(s, refuted)]

    new_plan = planner.plan(
        goal=plan.goal,
        already_done=still_valid,                  # do NOT redo completed work
        observed=observe(state),
        refuted_assumptions=[                      # ← the critical input (§3.3)
            {"assumption": a.describe(),
             "observation": a.contradicting_observation(state),
             "implication": a.why_it_matters()}
            for a in refuted
        ],
        failed_plan=plan,                          # so it can differ from it
    )
    return new_plan
```

**The novelty check — the practical progress guarantee (RP-3, §3.3):**

```python
def check_progress(new_plan, failed_plans: list[Plan], ctx) -> None:
    """RP-3: a replan that produces the SAME plan is a retry wearing a costume.
    Detect it and ESCALATE — the agent is out of ideas. Do not loop. (§3.3)"""
    for old in failed_plans:
        if semantically_equivalent(new_plan, old):
            raise NoProgress(
                f"replan produced a plan equivalent to a failed one — the agent has "
                f"exhausted its approaches. Escalating (Topic 8) rather than thrashing."
            )
    if ctx.replan_count >= ctx.budget.max_replans:          # bounded backstop (Topic 11)
        raise NoProgress(f"replan budget exhausted ({ctx.budget.max_replans})")
```

**The replanning loop, assembled:**

```python
def execute_with_replanning(goal, planner, executor, env, budget) -> tuple[object, str]:
    plan = planner.plan(goal, observe(env))
    completed, failed_plans = [], []

    while True:
        result = executor.run_next(plan, env)               # typed StepResult (Topic 7)
        if result.succeeded:
            completed.append(result.step)
            if plan.is_complete(completed):
                return result.content, "success"
            continue

        response = handle_failure(result, plan, env, budget)     # §3.1's classification
        match response.kind:
            case "retry":    continue                             # transient
            case "escalate": return None, "escalation_required"   # terminal
            case "replan":
                failed_plans.append(plan)
                plan = replan(plan, response.refuted, env, completed, planner, budget)
                check_progress(plan, failed_plans, budget)        # RP-3 — or NoProgress
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Classify failures (§3.1) | Right response per class; eliminates 3 pathologies | A typed failure signal (Topic 7) — nearly free |
| Retry everything | Simple | **Infinite identical failures** on refutations |
| Replan everything | "Adaptive" | **Thrashing** on transients; discards valid work |
| Incremental replan (RP-2) | Retains completed work; cheaper | Must check whether completed work is still valid |
| From-scratch replan | Simple; no validity check | Re-does everything; burns budget |
| **Novelty check (RP-3)** | **Detects thrashing**; escalates instead of looping | A plan-equivalence check |
| Replan budget only | Bounds the damage | Does not *detect* the pathology — just times out on it |

**The trade that matters most is not a trade — it is a missing distinction.** Most systems have one error path. **Adding the three-way classification (§3.1) costs a `match` statement and eliminates the majority of replanning pathologies.** There is no downside; the only reason it is missing is that the failure signal was never typed (Topic 7).

**The novelty-vs-budget trade is real.** A replan budget (max $N$ replans) is trivially implementable and **bounds the damage without diagnosing it** — the agent thrashes $N$ times, then gives up. A novelty check **detects the thrashing on the first repetition** and escalates immediately, saving $N-1$ wasted replans and — more valuably — **telling you that the agent is out of ideas**, which is actionable information a timeout does not give. **Implement both: novelty as the detector, budget as the backstop.**

## 8. Experiments

**The failure-classification test (§3.1) — the highest-value experiment.** Inject each failure class (transient, refutation, terminal) and measure the agent's response. **Prediction for an unclassified system: it retries all three** — looping forever on refutations, thrashing on nothing, and burning the budget on terminals. **Measure: response-correctness rate per failure class.** This test finds the pathology directly.

**The thrashing test (§3.3) — the pathology this topic exists to prevent.** Construct a task with a *false plan assumption* the environment refutes (a file the agent expects does not exist). **Measure: how many times does the agent replan, and does the new plan repeat the refuted assumption?**

- **Without the refutation in the replanner's context:** the plan repeats; the agent loops until budget.
- **With it (§6):** the plan differs; the agent adapts.
- **With the novelty check:** the repetition is *detected* on the second occurrence and escalated.

**Report: replans-to-progress, and thrash rate (fraction of replans producing an equivalent plan).**

**The incrementality ablation (RP-2).** Incremental replanning (retain completed work) vs from-scratch. Metrics: total steps, cost, latency, completion. **Prediction: incremental replanning completes with substantially fewer steps** — the from-scratch version re-does everything after every failure.

**The retry-vs-replan misclassification cost.** Deliberately misclassify (replan on transients; retry on refutations) and measure the cost. **This quantifies what the classification buys** and is a persuasive demonstration for teams that think one error path is enough.

**Statistics.** Wilson on classification-correctness and thrash rates; task-clustered bootstrap on steps-to-completion; zero-failure bound on infinite-loop occurrences (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Thrashing: replanning to the same plan.** The refutation is not in the replanner's context; the new plan repeats the false assumption; the loop runs until budget. **The characteristic replanning failure.** Mitigation: refutation in context (§6); novelty check (RP-3).
- **Retrying a refutation.** The action fails identically, forever. Mitigation: §3.1's classification.
- **Replanning a transient.** The plan was fine; the world hiccuped; the agent discards a good plan. Mitigation: classification.
- **Retry/replan on a terminal.** The whole budget burned on an impossible task; failure reported at the end instead of the start. Mitigation: classification → escalate (Topic 8).
- **From-scratch replanning.** Completed work discarded; budget burned re-doing it. Mitigation: RP-2 incrementality.
- **Retained work that was invalidated.** The refutation retroactively invalidated a completed step (the file the agent "created" was written to the wrong place). Mitigation: check `invalidated_by(step, refuted)` (§6) — retention is the default, not a blind assumption.
- **Unbounded replanning.** No budget, no novelty check; the loop does not terminate (Topic 11). Mitigation: both.
- **Replanning that ignores completed side effects.** The new plan assumes a clean slate, but the failed plan already *wrote* things (Chapter 5, Topic 11's compensation). Mitigation: the new plan must account for effects already applied — or compensate them first.
- **Edge case — a refutation with no alternative plan.** The assumption is refuted and *no* plan can achieve the goal (the required API simply does not exist). This is a *terminal* failure discovered late. Mitigation: the novelty check catches it (the replanner cannot produce a different plan) and escalates — **which is exactly the right outcome, and it is why the novelty check is more valuable than a bare budget.**
- **Open limitation.** Replanning's *necessity* is sourced [CAH §3.1, §3.4.1] and the response taxonomy is enumerated in the sources — but **replanning frequency, thrashing rates, and the effect of incrementality/novelty are unmeasured.** RP-1..RP-3 are **[derived]**; the thrashing pathology is **[synthesis]** reasoned from the model's tendency to produce similar plans given similar context. §8 measures locally.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Planning is "a richer harness-level control mechanism," not a pre-generation scaffold; without it agents "commit too early to brittle solution paths… or fail to coordinate reasoning, retrieval, execution, and **revision** into a stable workflow" [CAH §3.1].
2. The PEV loop's verify stage detects refutation through "deterministic sensors and human-review gates" [CAH §3.4].
3. The harness chooses among distinct responses: "continue execution, **revise a patch**, request more context, route the task to another module, reduce permissions, or escalate to a human reviewer" [CAH §3.4.1] — the failure-classification decision, sourced.
4. Agents "leverage ground truth from the environment at each step" [BEA] — the source of refutation.
5. "Poor retry policies" are a documented non-model failure mechanism [CAH §3.5].
6. **Replanning rates, thrashing, and incrementality effects are unmeasured.**

**Decision rules.**
- **Classify the failure before responding** (§3.1): transient → retry (with idempotency); refutation → replan; terminal → escalate. **Three classes, three responses, mutually exclusive.**
- **Replan on refutation, not on error** (RP-1) — an error that refutes nothing is not a replanning signal.
- **Put the refutation in the replanner's context** (§3.3) — "step 5 failed" produces the same plan; "the assumption X was refuted because Y" produces a different one.
- **Replan incrementally** (RP-2) — retain completed valid work; check it was not retroactively invalidated.
- **Check novelty** (RP-3) — a replan equivalent to a failed plan means the agent is out of ideas: **escalate, do not loop.**
- **Bound the replan count** as a backstop (Topic 11).

**Production implications.**
1. Type your failures (Topic 7) and add the three-way classification; it costs a `match` and eliminates most replanning pathologies.
2. Run the thrashing test (§8); an agent that replans to the same plan is burning your budget while looking busy.
3. Pass the refutation — not just "it failed" — into the replanner; this single change is what makes replanning actually adaptive.
4. Implement novelty detection *and* a replan budget; the first diagnoses, the second bounds.

**Connections.** This topic operationalizes Topic 4's A-1 (a plan is valid only while its assumptions hold) as a control action. It requires Topic 7's typed failures to branch on, escalates via Topic 8, and must terminate per Topic 11. The action-level retry/idempotency/compensation it sits above is Chapter 5, Topic 11; the failure taxonomy is Chapter 3, Topic 10; the PEV loop it realizes is [CAH §3.4] (Chapter 3). Topic 10's durable execution is what lets a replanned run survive the failures that triggered it.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1 (planning as "a richer harness-level control mechanism"; agents that "commit too early to brittle solution paths, overlook latent dependencies, or fail to coordinate reasoning, retrieval, execution, and **revision** into a stable workflow"; search-based planning "expanded through explicit search over multiple candidate trajectories to improve robustness"), §3.4 (the Plan–Execute–Verify loop; verification "through deterministic sensors and human-review gates"), §3.4.1 (the harness deciding "whether to continue execution, **revise a patch**, request more context, route the task to another module, reduce permissions, or escalate to a human reviewer"), §3.5 ("poor retry policies" among recurring non-model failure mechanisms)
[BEA] Anthropic, "Building effective agents" — agents "leverage ground truth from the environment at each step"; agents for problems where "you can't hardcode a fixed path" — https://www.anthropic.com/engineering/building-effective-agents
