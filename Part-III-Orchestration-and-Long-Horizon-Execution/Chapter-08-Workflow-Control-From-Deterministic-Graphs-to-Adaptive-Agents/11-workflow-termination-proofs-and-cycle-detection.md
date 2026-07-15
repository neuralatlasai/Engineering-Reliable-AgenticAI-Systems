# Topic 11 — Workflow Termination Proofs and Cycle Detection

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Proving that a workflow *stops*. Every loop this chapter introduced — the agent loop (Topic 1), evaluator–optimizer (Topic 2), replanning (Topic 9), blackboard waits (Topic 4) — can fail to terminate, and the discipline that prevents it is a *termination argument*, not a timeout.

**Prerequisites.** Chapter 3, Topic 8 (termination predicates and budgets — the single-loop treatment this topic generalizes); Topic 9 (replanning's progress guarantee, RP-3); Topic 4 (blackboard wait cycles, A-3).

**Terminology.** *Termination argument*: a proof that the loop stops. *Well-founded measure* (variant): a quantity that strictly decreases and cannot decrease forever. *Livelock*: the system is active but makes no progress. *Deadlock*: the system is blocked waiting on itself.

**Boundaries.** Inside: termination arguments, the measures that support them, and cycle detection. Outside: what to *do* when a budget is exhausted (Chapter 3, Topic 8's $\kappa$); the durable execution that lets a long loop survive (Topic 10).

**Exclusions.** No formal-methods or program-verification tutorial; the "proofs" here are engineering arguments, not machine-checked ones.

**Outcomes.** The reader can state a termination argument for every loop in their system, distinguish deadlock from livelock, and detect cycles before they hang production.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** This chapter has introduced at least five loops: the agent loop, the evaluator–optimizer, the replanning loop, blackboard wait-dependencies, and the retry loop. **Each can run forever.** And the failure is expensive in a specific, insidious way: **a non-terminating agent looks *busy*.** It generates plausible activity, burns budget, and produces no result — and to an observer it is indistinguishable from an agent doing hard work.

**Bottleneck.** The universal mitigation is a **timeout or a step budget**, and it is necessary but *not sufficient*. A budget **bounds the damage** without **preventing the pathology**: the agent still thrashes for $N$ steps and then fails. **A budget is a backstop, not a termination argument** — and a system whose only termination guarantee is "we cap it at 50 steps" has no idea *why* it terminates, only that it eventually stops trying. **The bottleneck is that teams substitute a budget for an argument, and so never notice that their loop has no reason to converge.**

**Objective.** For every loop: a **termination argument** based on a well-founded measure that strictly decreases — plus a budget as a backstop, plus cycle detection for the wait-graph.

**Assumptions.** Model-directed loops can fail to converge (Chapter 2 — the model may propose the same action indefinitely). Wait-dependencies can form cycles emergently.

**Constraints.** For a model-directed loop, you generally *cannot* prove termination from the model's behavior — so the measure must be enforced by the *harness*, not hoped for from the model.

**Success criteria.** Every loop has a stated termination argument; the measure is enforced by code; cycles are detected, not hung on; livelock is distinguished from slow progress.

## 3. Intuition first, then formalization

### 3.1 Intuition: a budget is not a reason

The distinction that organizes the topic:

- **A budget** says: "this loop will stop after 50 iterations." **True, and it tells you nothing about whether the loop was going to succeed.** A loop that would have thrashed forever thrashes 50 times instead. You have bounded the cost and not fixed the defect.
- **A termination argument** says: "this loop stops *because* each iteration strictly reduces $\mu$, and $\mu$ cannot decrease below zero." **This is a reason.** It tells you the loop *converges*, not merely that it is *capped*.

The classical mechanism is a **well-founded measure** (a *variant*): a quantity $\mu$ that (i) strictly decreases on every iteration, and (ii) is bounded below. Such a loop *must* terminate, because you cannot decrease a bounded quantity forever.

The problem specific to agent loops: **the model does not guarantee to decrease anything.** A model asked to "keep working until done" may propose the same action forever (Topic 9's thrashing). So the measure must be something **the harness enforces**, not something the model promises. This is the same principle as Chapter 3, Topic 8 (the harness owns termination, not the model) and it is why:

$$
\textbf{Every agent loop's termination argument is a \emph{harness} property, never a \emph{model} property.}
$$

The practical measures available to a harness **[synthesis]**:

- **Budget** ($\mu$ = steps remaining). Always available, always decreasing. **Guarantees termination, guarantees nothing about success.** This is the backstop.
- **Novelty** ($\mu$ = untried approaches remaining). Decreases when the agent tries something new; **does not decrease when it repeats itself** — which is exactly Topic 9's thrashing detector. **A repeat means $\mu$ did not decrease, so the loop is not progressing, so terminate.**
- **Goal distance** ($\mu$ = unresolved subgoals). Decreases as subgoals are discharged. Requires a decomposition (Topic 7's typed state).
- **Verifier score** ($\mu$ = distance from acceptance). For evaluator–optimizer: each round should move *toward* acceptance. **If it does not — if the score plateaus or oscillates — the loop is not converging**, and iterating further is wasted (Topic 2's P-2).

### 3.2 Formalization: the termination obligation

For every loop $L$ in the system, the obligation **[derived]**:

$$
\textbf{TE-1 (every loop carries a termination argument):}\quad
\exists\, \mu: \mathrm{State} \to W\ \ (W\ \text{well-founded})\ \ \text{s.t.}\ \ \mu(s_{i+1}) < \mu(s_i)\ \ \text{on every iteration.}
$$

If no such $\mu$ exists, **the loop does not have a termination argument** — and a budget must be *declared as the only guarantee*, which is a design decision to be made consciously rather than by omission.

$$
\textbf{TE-2 (the measure is harness-enforced, not model-promised):}\quad
\mu\ \text{is computed and checked by CODE;}\ \text{the model's belief that it is progressing is irrelevant.}
$$

TE-2 is Chapter 3, Topic 8, generalized. **The model saying "I'm making progress" is a proposal**, and — per [FSC §6.3.5]'s unsupported-completion propensity — an unreliable one. The harness computes $\mu$ from observable state.

$$
\textbf{TE-3 (no strict decrease ⇒ terminate):}\quad
\mu(s_{i+1}) \ge \mu(s_i)\ \Longrightarrow\ \text{the loop is not progressing:}\ \text{terminate with } \kappa \ne \mathrm{success}\ \text{(escalate — Topic 8).}
$$

TE-3 is the **livelock detector**, and it is the topic's most useful practical rule. **A loop iteration that did not decrease the measure did nothing.** Rather than waiting for the budget to expire, detect the non-decrease *immediately* and stop. **This turns a 50-iteration thrash into a 2-iteration detection**, and — more valuably — it reports *why* it stopped ("no progress") rather than *that* it stopped ("budget exhausted"), which are very different diagnostics.

### 3.3 Deadlock versus livelock — and why cycles are the agent-specific hazard

Two non-termination modes, with different detectors **[synthesis; grounded in Topic 4's A-3]**:

- **Deadlock:** the system is *blocked*. Component A waits for state that component B will write; B waits for state A will write. **Nothing happens.** The system consumes no resources and produces nothing — it *hangs*. Detector: **a cycle in the wait-for graph** (Topic 4, A-3).
- **Livelock:** the system is *active* but not progressing. The agent replans, retries, generates, and evaluates — burning budget and tokens — and $\mu$ never decreases. **This is the expensive one**, because it *looks* like work. Detector: **TE-3** — the measure did not decrease.

**The agent-specific hazard is that both arise *emergently*.** Nobody designs a wait cycle; it emerges from what each component decided to wait for (Topic 4's blackboard). Nobody designs a livelock; it emerges from a model that keeps proposing the same thing (Topic 9's thrashing). **Neither is visible in the code — they are properties of the *runtime graph*, and they must be detected at runtime.**

The cycle-detection obligation:

$$
\textbf{TE-4 (the wait-for graph is checked for cycles):}\quad
\text{before blocking on a dependency, check that the wait-for relation remains acyclic.}
$$

**A cycle detected is an error; a cycle undetected is a hang** — and a hung agent workflow, especially a durable one (Topic 10), can hang *indefinitely*, holding a checkpoint and waiting for an event that will never arrive.

## 4. Architecture

```
   EVERY LOOP CARRIES A TERMINATION ARGUMENT (TE-1)
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ LOOP                    │ MEASURE μ (harness-enforced — TE-2)             │
   ├─────────────────────────┼─────────────────────────────────────────────────┤
   │ agent loop (Topic 1)    │ budget (steps remaining)  ← backstop            │
   │                         │ + goal distance (unresolved subgoals)           │
   │ evaluator-optimizer (T2)│ verifier score → acceptance; PLATEAU ⇒ stop     │
   │ replanning (Topic 9)    │ NOVELTY (untried approaches); repeat ⇒ no       │
   │                         │   decrease ⇒ TE-3 fires ⇒ escalate              │
   │ retry (Ch.5 T11)        │ attempts remaining                              │
   │ blackboard wait (T4)    │ (no measure — needs CYCLE DETECTION, TE-4)      │
   └─────────────────────────┴─────────────────────────────────────────────────┘

   TE-3: μ(s_{i+1}) ≥ μ(s_i)  ⇒  the iteration DID NOTHING  ⇒  terminate NOW
         ┌──────────────────────────────────────────────────────────────┐
         │ Detects LIVELOCK in 2 iterations instead of burning 50.       │
         │ And reports WHY ("no progress"), not just THAT ("budget").    │
         └──────────────────────────────────────────────────────────────┘

   TWO NON-TERMINATION MODES (§3.3):
   ┌────────────┬─────────────────────────────┬───────────────────────────────┐
   │ DEADLOCK   │ blocked; consumes nothing    │ detector: CYCLE in wait-graph │
   │            │ HANGS (esp. bad w/ durable   │            (TE-4)             │
   │            │ execution — waits forever)   │                               │
   ├────────────┼─────────────────────────────┼───────────────────────────────┤
   │ LIVELOCK   │ ACTIVE; burns budget/tokens  │ detector: μ NOT DECREASING    │
   │            │ LOOKS LIKE WORK ← expensive  │            (TE-3)             │
   └────────────┴─────────────────────────────┴───────────────────────────────┘

   BUDGET is a BACKSTOP, not an argument. It bounds damage; it does not
   explain why the loop converges. (§3.1)
```

**The architecture's core discipline: every loop must *declare* its measure.** Writing a loop without stating what decreases is writing a loop with no reason to stop. **If you cannot name the measure, the loop's only guarantee is its budget** — and you should say so explicitly, because a loop whose sole termination guarantee is a cap is a loop that may thrash for its entire budget on every run.

## 5. Grounding

- **Termination predicates and budgets are the harness's job:** Chapter 3, Topic 8 — the harness owns termination; the model's "done" is a *proposal* ($\kappa$: `model_stop` ≠ `success`). **TE-2's basis.**
- **The model's completion claims are unreliable:** unsupported completion claims are a **measured** propensity [FSC §6.3.5]; premature stopping is documented [FSC §6.4.1.4] — **the model cannot be trusted to know it is progressing**, which is why $\mu$ is harness-computed.
- **Budgets are a documented control:** `max_turns` / step budgets in the SDKs (Chapter 4, Topic 3; Chapter 3, Topic 8); task-budget beta headers [ANT-API] — the backstop, as shipped.
- **Iterative patterns need a bound:** [BEA]'s evaluator-optimizer is "a loop," and its precondition requires that "iterative refinement provides measurable value" — **a loop whose refinement is not measurably improving is not converging** (Topic 2's P-2).
- **The verifier is the measure for PEV:** [CAH §3.4]'s Plan–Execute–Verify uses "deterministic sensors" for verification — a deterministic verifier gives a *real* $\mu$ (distance from acceptance), unlike a model judge whose score may not correlate with quality (Topic 2, P-2).
- **Search-based planning bounds exploration:** [CAH §3.1]'s search-based planning "expanded through explicit search over multiple candidate trajectories" — a systematic novelty measure.
- **The evolver's pathologies include non-convergence:** [HX §4.2]'s harness-evolution pathologies and the "seesaw" constraint — evolution loops that oscillate rather than converge. **A documented instance of livelock in an agentic loop.**
- **Wait cycles are the blackboard hazard:** Topic 4, A-3 — TE-4's basis.

**Evidence gap.** Termination as a harness obligation is **well-grounded** (Chapter 3, Topic 8; the $\kappa$ discipline), and the model's unreliability as a progress judge is **measured** [FSC §6.3.5, §6.4.1.4]. **TE-1..TE-4 are [derived]** — TE-1/TE-3 from standard well-founded-measure reasoning applied to agent loops; TE-4 from deadlock detection. **No source measures livelock rates, thrashing frequency, or the effectiveness of novelty measures in agent workflows.** [HX §4.2]'s evolver pathologies are the closest documented instance of agentic non-convergence. §8 measures locally.

## 6. Implementation

**Declare the measure — every loop, no exceptions (TE-1):**

```python
class TerminationArgument(Protocol):
    """TE-1: every loop declares WHY it stops. If you cannot name μ, the loop's only
    guarantee is its budget — and you must say so explicitly (§4)."""
    def measure(self, state) -> int | float: ...
    def is_well_founded(self) -> bool: ...          # bounded below

@dataclass
class BudgetOnly(TerminationArgument):
    """The honest 'I have no convergence argument' declaration. Bounds damage only."""
    max_steps: int
    def measure(self, state): return self.max_steps - state.step_count
    def is_well_founded(self): return True

@dataclass
class Novelty(TerminationArgument):
    """Topic 9's thrashing detector, as a MEASURE. A repeat ⇒ μ did not decrease ⇒ TE-3."""
    def measure(self, state): return len(state.untried_approaches)
    def is_well_founded(self): return True
```

**TE-3: the livelock detector — the topic's most useful rule:**

```python
def run_loop(initial, step_fn, termination: TerminationArgument, budget, ctx):
    """TE-3: an iteration that does not DECREASE μ did nothing. Terminate NOW —
    do not burn the remaining budget thrashing. And report WHY."""
    state = initial
    mu_prev = termination.measure(state)

    for i in range(budget.max_steps):                       # BACKSTOP (not the argument)
        state = step_fn(state, ctx)
        mu = termination.measure(state)                     # TE-2: CODE computes it,
                                                            # not the model's self-report
        if mu >= mu_prev:
            # LIVELOCK. The iteration made no progress. Detected in 2 iterations,
            # not 50. And the diagnostic is "no progress", not "budget exhausted".
            return state, "no_progress"                     # → escalate (Topic 8)

        if terminal(state):
            return state, "success"
        mu_prev = mu

    return state, "budget"                                  # κ = budget, NOT success
```

**TE-4: cycle detection in the wait-for graph (Topic 4's A-3):**

```python
def acquire_dependency(component, key, ctx) -> None:
    """TE-4: before BLOCKING on a dependency, check the wait-for graph stays acyclic.
    A cycle detected is an ERROR; a cycle undetected is a HANG — and with durable
    execution (Topic 10), it hangs FOREVER, holding a checkpoint."""
    owner = ctx.state.owner_of(key)
    ctx.wait_graph.add_edge(component.id, owner)

    if cycle := ctx.wait_graph.find_cycle():
        ctx.wait_graph.remove_edge(component.id, owner)     # do not enter the deadlock
        raise DeadlockDetected(
            f"wait cycle: {' → '.join(cycle)}. {component.id} would block forever. "
            f"Escalating rather than hanging."
        )
    ctx.wait_graph.block(component.id, on=key)
```

**The evaluator-optimizer's measure — a plateau means stop (Topic 2's P-2):**

```python
def evaluator_optimizer_with_termination(x, generate, verify, budget):
    """μ = distance from acceptance. A PLATEAU (score not improving) means the loop is
    NOT converging — [BEA]'s precondition ('iterative refinement provides measurable
    value') has failed. Iterating further is waste."""
    y = generate(x)
    prev_score = verify(y).score                            # prefer a DETERMINISTIC verifier

    for round in range(budget.max_rounds):
        y = generate(x, feedback=verify(y).feedback)
        score = verify(y).score
        if score >= ACCEPT:
            return y, "success"
        if score <= prev_score:                             # TE-3: no improvement
            return y, "no_progress"                         # the loop is not converging
        prev_score = score
    return y, "budget"
```

## 7. Trade-offs

| Mechanism | Guarantees | Costs / limits |
|---|---|---|
| **Budget only** | Termination | **No convergence reason**; thrashes for the full budget |
| **Well-founded measure (TE-1)** | Termination **and** convergence | Must define $\mu$ — sometimes hard |
| **TE-3 (no-decrease ⇒ stop)** | **Livelock detected in 2 iterations** | Requires $\mu$; a legitimate plateau is cut short |
| **Novelty measure** | Detects Topic 9's thrashing | Requires plan-equivalence checking |
| **Cycle detection (TE-4)** | Deadlock becomes an error, not a hang | A wait-graph to maintain |
| Model-reported progress | Cheap | **Unreliable** [FSC §6.3.5] — the model over-reports success |

**The trade that matters: a budget bounds the damage; a measure explains the convergence.** Teams universally implement the budget and rarely the measure — and so their systems terminate without ever converging. **The cost of adding a measure is defining $\mu$; the benefit is that TE-3 detects livelock in two iterations instead of fifty, and tells you *why*.** For an agent loop burning tokens on every iteration, the difference is a large, recurring cost.

**The one real risk of TE-3: cutting short a legitimate plateau.** Some genuine progress is *non-monotonic* — an evaluator-optimizer might get slightly worse before it gets much better; an agent might explore an unpromising branch before finding the right one. **A strict "any non-decrease ⇒ stop" is too aggressive for these.** The mitigation is a *patience* parameter: allow $k$ consecutive non-decreasing iterations before declaring no-progress. **But the default should be small** — a loop that plateaus for five iterations is usually not about to converge, and the burden of proof is on the loop.

## 8. Experiments

**The termination audit (TE-1) — the prerequisite.** Enumerate every loop in the system. For each, **write down its measure $\mu$.** **Any loop whose only answer is "a budget" has no convergence argument** — flag it, and either find a measure or accept (explicitly) that it may thrash for its whole budget. **This audit typically finds that most loops have no argument**, which is the finding.

**The livelock test (TE-3) — the expensive failure.** Construct a task the agent *cannot* solve (a refuted assumption it cannot work around — Topic 9). Run it.

- **With budget only:** the agent thrashes for the full budget, burning tokens, and reports `budget`.
- **With TE-3:** the agent detects non-decrease within a couple of iterations and reports `no_progress`.
- **Measure: iterations wasted, tokens burned, and diagnostic quality.** The difference is the value of a measure over a budget.

**The deadlock test (TE-4).** Construct a wait cycle (Topic 4). **Does the system detect it or hang?** With durable execution (Topic 10), a hang is *permanent* — the workflow holds a checkpoint forever waiting for an event nobody will send. **A hang here is a resource leak with no timeout.**

**The plateau-patience sweep.** Vary the patience parameter (how many non-decreasing iterations before stopping). **Measure: false-stop rate (cut short a loop that would have converged) vs wasted iterations.** This calibrates §7's risk.

**Statistics.** Zero-failure bound on undetected deadlocks (target zero); Wilson on livelock-detection rate; compare tokens-wasted distributions (budget-only vs TE-3) with a paired design; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Budget substituted for an argument.** The loop terminates and never converges; it thrashes for its full budget on every failing run. **The default failure.** Mitigation: TE-1 — declare the measure.
- **Livelock.** The agent is active, burning tokens, making no progress — **and it looks like work.** Mitigation: TE-3 — detect the non-decrease immediately.
- **Deadlock.** A wait cycle; the system hangs. **With durable execution, it hangs forever** (Topic 10). Mitigation: TE-4 — cycle detection before blocking.
- **Model-reported progress trusted.** "I'm making progress" from a model with a measured over-completion propensity [FSC §6.3.5]. Mitigation: TE-2 — $\mu$ is computed by code from observable state.
- **Model decides termination.** Chapter 3, Topic 8's core error. Mitigation: the harness decides; `model_stop` ≠ `success`.
- **Non-monotonic progress cut short.** A legitimate temporary plateau triggers TE-3. Mitigation: a small patience parameter — but keep it small; the burden is on the loop.
- **The measure that does not measure.** A $\mu$ that decreases without real progress (e.g., "steps taken" as a goal-distance proxy). **This is a budget wearing a measure's clothes.** Mitigation: $\mu$ must reflect *task* progress, not *effort*.
- **Nested loops, no composite argument.** Each loop is bounded; their composition is not (an outer loop that restarts an inner one). Mitigation: a composite measure, or a global budget across the nesting.
- **Edge case — the loop that legitimately cannot bound its work.** Some tasks genuinely have unbounded step counts ([BEA]: "impossible to predict the required number of steps"). **Here the budget is the honest guarantee** — but it must be *declared as such*, and the loop should still detect livelock (TE-3) so it does not burn the budget on a plateau.
- **Open limitation.** **Termination as a harness obligation is well-grounded** (Chapter 3, Topic 8) and the model's progress-unreliability is **measured** [FSC §6.3.5]. But **TE-1..TE-4 are [derived]** from standard well-founded-measure and deadlock reasoning, and **no source measures livelock rates or novelty-measure effectiveness in agent workflows.** [HX §4.2]'s evolver pathologies are the closest documented instance. §8 measures locally.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Termination is the harness's decision, not the model's; `model_stop` ≠ `success` (Chapter 3, Topic 8; Chapter 1, Topic 12).
2. **The model's completion claims are measurably unreliable** [FSC §6.3.5], and premature stopping is documented [FSC §6.4.1.4] — it cannot be trusted to judge its own progress.
3. Step budgets ship as platform controls (`max_turns`, task budgets) — the backstop.
4. [BEA]'s evaluator-optimizer requires that "iterative refinement provides measurable value" — a loop that is not measurably improving has failed its precondition.
5. Deterministic verifiers give a real progress measure [CAH §3.4]; model judges may not (Topic 2, P-2).
6. Agentic loops exhibit documented non-convergence pathologies (evolver oscillation, the seesaw constraint) [HX §4.2].
7. **No source measures livelock rates in agent workflows.**

**Decision rules.**
- **Every loop declares a measure** (TE-1). If you cannot name one, say so — the budget is then your *only* guarantee, and the loop may thrash for all of it.
- **The measure is computed by code, never reported by the model** (TE-2).
- **No strict decrease ⇒ terminate now** (TE-3) — do not wait for the budget; report `no_progress`, not `budget`.
- **Check the wait-for graph for cycles before blocking** (TE-4) — a hang under durable execution is permanent.
- **A budget is a backstop, not an argument.**
- **$\mu$ must measure task progress, not effort** — "steps taken" is not a measure.

**Production implications.**
1. Run the termination audit; most loops will have no measure, and that finding is the point.
2. Add TE-3 to your agent loop and evaluator-optimizer; it converts a full-budget thrash into a two-iteration detection with a *useful* diagnostic.
3. Add cycle detection to any wait-dependency (Topic 4); with durable execution a deadlock hangs forever and holds resources.
4. Never let the model's self-reported progress drive termination — it is measurably unreliable.

**Connections.** This topic generalizes Chapter 3, Topic 8 (single-loop termination) to every loop the chapter introduced: Topic 1's agent loop, Topic 2's evaluator-optimizer (P-2's bound), Topic 9's replanning (RP-3's progress guarantee *is* TE-1 with a novelty measure), Topic 4's blackboard waits (A-3 *is* TE-4). It depends on Topic 7's typed state to compute $\mu$, escalates via Topic 8, and matters most under Topic 10's durable execution (where a hang is permanent). Topic 14 property-tests these guarantees.

## Sources

[BEA] Anthropic, "Building effective agents" — evaluator-optimizer as "a loop," requiring that "iterative refinement provides measurable value"; agents for problems where it is "difficult or impossible to predict the required number of steps" (the honest unbounded case) — https://www.anthropic.com/engineering/building-effective-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 (unsupported completion claims — the model cannot be trusted to judge its own progress), §6.4.1.4 (premature stopping with budget remaining) — `Knowledge_source/`
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1 (search-based planning over "multiple candidate trajectories" — a systematic novelty measure), §3.4 (PEV verification through "deterministic sensors" — a real progress measure, unlike a model judge)
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §4.2 — harness-evolution pathologies and the "seesaw" constraint: documented non-convergence (oscillation) in an agentic optimization loop
[ANT-API] Anthropic Claude API reference — task budgets and step limits as shipped backstops — platform.claude.com docs (cache 2026-06)
