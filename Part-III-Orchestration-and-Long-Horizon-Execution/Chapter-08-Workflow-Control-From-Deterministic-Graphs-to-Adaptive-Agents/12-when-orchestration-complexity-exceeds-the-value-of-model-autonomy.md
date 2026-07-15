# Topic 12 — When Orchestration Complexity Exceeds the Value of Model Autonomy

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The chapter's central decision procedure, and the one it has been building toward: **how much orchestration to build, and when to stop.** Both directions have a failure — too little orchestration (an unreliable agent) and too much (a brittle machine that has engineered away the autonomy it was paying for).

**Prerequisites.** Topic 1 (the autonomy axis; W-1 minimize $K_M$; W-2 autonomy is a feasibility purchase); Topic 2 (each pattern's precondition); Topic 5 ([OAO]'s "start with one agent"); Chapter 1, Topics 8–9 (error accumulation; workflows dominate).

**Terminology.** *Orchestration complexity*: the deterministic control structure surrounding the model. *Model autonomy*: the decisions left to the model ($K_M$, Topic 1). *Over-orchestration*: control structure that constrains the model without a reliability gain.

**Boundaries.** Inside: the decision procedure, its measurement, and the two failure directions. Outside: the individual structures (Topics 1–11 — this topic decides among them); multi-agent justification (Chapter 9).

**Exclusions.** No cost-modeling framework.

**Outcomes.** The reader can decide how much orchestration a task warrants, measure whether their current level is right, and recognize both under- and over-orchestration.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** This chapter has offered a large toolkit: six control structures (Topic 1), six patterns (Topic 2), six routing dimensions (Topic 3), four architectures (Topic 4), two delegation primitives (Topic 5), typed state, gates, replanning, durable execution, termination proofs. **A reader could apply all of it, and produce a system so orchestrated that the model has no decisions left to make** — at which point they have built a brittle deterministic pipeline with an LLM-shaped hole in it, having paid for a model's flexibility and engineered it away.

**Bottleneck.** Both failure directions are real and they are *asymmetric in visibility*. **Under-orchestration is visible**: the agent fails, thrashes, takes unauthorized actions — you *see* it. **Over-orchestration is invisible**: the system works, it is just *rigid, expensive to maintain, and fails on anything you did not anticipate*. Nobody files a bug titled "our workflow is too deterministic." **So the pressure is always toward more orchestration, and the counter-pressure must be deliberate.**

**Objective.** A decision procedure that starts from the simplest structure, adds orchestration only against a measured failure, and **recognizes when the orchestration has consumed the autonomy it was protecting.**

**Assumptions.** Autonomy compounds error (Topic 1, W-1) and buys unpredictable-task capability (W-2). Orchestration reduces error and reduces flexibility.

**Constraints.** The crossover — where orchestration stops paying — is workload-specific and **unmeasured in the sources**.

**Success criteria.** The orchestration level is a measured, defended choice; every control structure in the system is justified by a failure it prevents; the system still handles tasks the designers did not anticipate.

## 3. Intuition first, then formalization

### 3.1 Intuition: the two failure directions, and why only one is visible

**Under-orchestration** produces the failures this chapter has catalogued: compounding error over autonomous steps (Topic 1), unauthorized actions (no gates), thrashing (no termination argument), laundered failures (no status aggregation). **These are loud.** The agent visibly fails, and the response — add a control — is obvious.

**Over-orchestration** produces a different failure, and it is *quiet*:

- The workflow handles every case you anticipated and **fails on the first one you did not** — because the model has no latitude to adapt. You bought a flexible model and built a rigid machine around it.
- Every new case requires **a code change** — a new branch, a new state, a new pattern. The system's adaptability now lives in your sprint velocity rather than in the model.
- The orchestration itself becomes the source of bugs: a router that misroutes, a state machine missing a transition, a gate that fires wrongly. **You have traded model errors for orchestration errors**, and it is not obvious you came out ahead.

**Nobody notices this.** The system *works* — on the distribution it was built for. Its rigidity is only visible as a *slow* cost: rising maintenance, brittleness on novel inputs, and a growing suspicion that the LLM is not earning its keep. **This is why the vendors state the simplicity default so insistently** ([BEA]: "find the simplest solution possible"; [OAO]: "start with one agent whenever you can") — the pressure is structurally toward more orchestration, and the guidance has to push back.

The intuition that resolves it: **orchestration should be added *against a specific, measured failure* — never preemptively, and never because "it seems more robust."** Each control structure must name the failure it prevents, and that failure must be one you have *observed*, not one you imagine.

### 3.2 Formalization: the marginal-orchestration decision

Let a system's orchestration level be a set $C$ of control structures. Adding a control $c$ has a cost and a benefit **[synthesis]**:

$$
\Delta(c) \;=\; \underbrace{\mathrm{gain}(c)}_{\text{failures prevented}} \;-\; \underbrace{\mathrm{rigidity}(c)}_{\text{tasks now unhandleable}} \;-\; \underbrace{\mathrm{maint}(c)}_{\text{code, bugs, latency}} .
$$

Add $c$ iff $\Delta(c) > 0$. Two invariants make this operational **[derived]**:

$$
\textbf{C-1 (every control names an observed failure):}\quad
\text{add } c\ \text{only if}\ \exists\ \text{a MEASURED failure } f\ \text{that } c\ \text{prevents.}
$$

C-1 is the discipline that stops preemptive orchestration. **A control added because it "seems safer" has an unmeasured gain and a certain cost.** The rule: **observe the failure first, then add the control, then verify it prevented the failure.** This is the same evidentiary standard the whole book applies to model changes (Chapter 3, Topic 14) — a control structure is part of $D_c$ (Chapter 1's configuration), so adding one is a configuration change with an evidentiary burden.

$$
\textbf{C-2 (the rigidity cost is real and must be measured):}\quad
\mathrm{rigidity}(c)\ \text{is measured as the drop in performance on \emph{held-out, unanticipated} tasks.}
$$

C-2 is the counter-measurement almost nobody runs. **Orchestration's gain is measured on the tasks you designed for; its rigidity cost is only visible on the tasks you did not.** So the evaluation must include an **out-of-distribution task set** — cases the orchestration was not built for. **A control that improves in-distribution performance and destroys out-of-distribution performance has traded generality for a local gain, and you will only see it if you look.**

### 3.3 The two questions that decide the level

The decision procedure collapses to two questions, applied per decision point **[synthesis; grounded in [BEA]'s and [OAO]'s defaults]**:

**Question 1 (Topic 1's W-2 — the feasibility test): *Can code determine this step?***
- **Yes** → make it deterministic. Autonomy here is reliability spent for nothing.
- **No** → the model must decide. **Grant the autonomy, and pay for it with a guardrail** (a gate, a validator, a termination argument), not by trying to eliminate it.

**Question 2 (the value test): *Does this control prevent a failure I have actually observed?***
- **Yes** → add it, then verify the failure stops.
- **No** → **do not add it.** It is rigidity and maintenance for an imagined benefit.

**The combination is the whole chapter's discipline.** Question 1 places you on the autonomy axis (as far left as feasibility permits). Question 2 stops you from over-building at that position. **And the default, when both are uncertain, is [BEA]/[OAO]'s: the simpler structure**, because under-orchestration's failures are visible and fixable while over-orchestration's are invisible and accumulate.

**The signal that you have over-orchestrated:** *the model has no decisions left, and yet you are still paying for a model.* If every branch is coded, every state enumerated, every transition determined — **you have built a deterministic program, and the LLM in it is an expensive string formatter.** At that point either the task genuinely was deterministic (in which case, good — but do not pay for a model) or you have engineered away the flexibility you needed.

## 4. Architecture

```
                     THE DECISION PROCEDURE (§3.3)

   For each decision point in the task:
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Q1 (W-2, feasibility):  Can CODE determine this step?               │
   │                                                                     │
   │   YES → DETERMINISTIC.  Autonomy here = reliability spent for       │
   │         nothing (Topic 1, W-1: geometric decay in K_M).             │
   │                                                                     │
   │   NO  → MODEL DECIDES.  Grant it — and GUARD it (gate, validator,   │
   │         termination argument). Do NOT try to eliminate it.          │
   └────────────────────────────┬────────────────────────────────────────┘
                                │
   ┌────────────────────────────▼────────────────────────────────────────┐
   │ Q2 (C-1, value):  Does this control prevent an OBSERVED failure?    │
   │                                                                     │
   │   YES → add it. Then VERIFY the failure stopped.                    │
   │   NO  → DO NOT ADD IT. Rigidity + maintenance for an imagined gain. │
   └─────────────────────────────────────────────────────────────────────┘

   THE TWO FAILURE DIRECTIONS — and only one is visible:

   UNDER-ORCHESTRATED            │  OVER-ORCHESTRATED
   ──────────────────────────────┼──────────────────────────────────────
   compounding error (T1)        │  fails on the first unanticipated case
   unauthorized actions          │  every new case = a CODE CHANGE
   thrashing (T9, T11)           │  orchestration itself has bugs
   laundered failures (T6)       │  the model has no decisions left
   ──────────────────────────────┼──────────────────────────────────────
   ★ LOUD — the agent visibly    │  ★ QUIET — the system "works";
     fails; you SEE it            │    nobody files "too deterministic"
   ──────────────────────────────┴──────────────────────────────────────
   ⇒ The pressure is STRUCTURALLY toward more orchestration.
     The counter-pressure must be DELIBERATE. That is why the vendors
     state the default so insistently: "find the simplest solution
     possible" [BEA]; "start with one agent whenever you can" [OAO].

   THE OVER-ORCHESTRATION SIGNAL:
     the model has no decisions left — and you are still paying for a model.
```

## 5. Grounding

- **The simplicity default, stated twice, by two vendors:** "When building applications with LLMs, we recommend **finding the simplest solution possible, and only increasing complexity when needed**" [BEA]; "**Start with one agent whenever you can.** Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility" [OAO]. **The default is the simpler structure, and the burden of proof is on complexity.**
- **Complexity must be justified, and prematurity is named as a failure:** "Splitting prematurely creates complexity without proportional benefit" [OAO]; and [BEA]'s repeated emphasis on "measuring performance before adding complexity."
- **The single-call baseline:** "Optimizing single LLM calls with retrieval and in-context examples is usually enough" [BEA] — **the baseline that most orchestration must beat and often does not.**
- **The autonomy trade is explicit:** "Agentic systems often trade latency and cost for better task performance" — suggesting they are "inappropriate when these trade-offs don't yield measurable improvements" [BEA]. **The trade must yield *measurable* improvement.**
- **Agents' costs are named:** "higher costs, and the potential for compounding errors" [BEA] — the under-orchestration side (Topic 1's W-1; Chapter 1, Topic 8).
- **Agents are warranted only under a feasibility failure:** "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path" [BEA] — **Q1's basis (Topic 1's W-2).**
- **Workflows dominate:** Chapter 1, Topic 9's empirical result — most reliable systems are mostly deterministic with autonomy at controlled points. **The chapter's empirical foundation.**
- **The four specialist justifications:** capability isolation, policy isolation, prompt clarity, trace legibility [OAO] — the only sourced list of what *does* justify added structure.
- **Harness complexity has documented pathologies:** [HX §4.2]'s evolver pathologies and the "seesaw" constraint — adding harness machinery can *degrade* the system; more is not monotone. **Independent corroboration of the over-orchestration direction, in the harness-optimization setting.**

**Evidence gap, and it is the chapter's central one.** The *simplicity default* is stated by both vendors with a stated rationale (cost, latency, compounding errors) — **but the crossover point is unmeasured.** No source publishes: a curve of performance vs orchestration level, a measured comparison of pipeline vs agent on a task suite, or an effect size for any of the four specialist justifications [OAO]. **C-1 and C-2 are [derived]** — C-1 from the book's evidentiary standard (Chapter 3, Topic 14: a control structure is part of $D_c$, so adding one is a configuration change); C-2 from the rigidity mechanism (reasoned, not measured). **The out-of-distribution rigidity cost (C-2) is, to this book's knowledge, unmeasured anywhere** — and §8's experiment is the one this topic most wants run.

## 6. Implementation

**The control-justification register — C-1 made operational:**

```python
@dataclass(frozen=True)
class Control:
    """C-1: every control names the OBSERVED failure it prevents.
    A control added because it 'seems safer' has an unmeasured gain and a certain cost."""
    name: str
    kind: str                          # router | gate | state_machine | validator | ...
    prevents: str                      # the failure — MUST reference an observed incident
    evidence: str                      # the trace/incident ID where the failure was OBSERVED
    added_at: date
    verified: bool                     # did the failure actually STOP after adding this?

def audit_controls(controls: list[Control]) -> list[str]:
    problems = []
    for c in controls:
        if not c.evidence:
            problems.append(
                f"{c.name}: no observed failure cited. This is PREEMPTIVE orchestration — "
                f"certain rigidity + maintenance cost for an IMAGINED gain (C-1). "
                f"Remove it, or cite the incident it prevents."
            )
        if not c.verified:
            problems.append(f"{c.name}: never verified that it stopped the failure it claims")
    return problems
```

**C-2: measure the rigidity cost — the counter-measurement nobody runs:**

```python
def measure_orchestration(system, in_dist_tasks, ood_tasks) -> dict:
    """C-2: orchestration's GAIN shows on the tasks you designed for.
    Its RIGIDITY COST shows only on the tasks you did NOT. Measure both."""
    return {
        "in_distribution": {
            "completion": run(system, in_dist_tasks),        # the gain — always measured
        },
        "out_of_distribution": {
            "completion": run(system, ood_tasks),            # the COST — almost never measured
        },
        # A control that helps in-dist and destroys OOD has traded generality for a local gain.
        "rigidity_signal": run(system, ood_tasks) - run(simpler_baseline, ood_tasks),
    }
```

**The over-orchestration detector (§3.3's signal):**

```python
def over_orchestration_check(system, traces) -> dict:
    """The signal: the model has NO DECISIONS LEFT — and you are still paying for a model."""
    k_m = mean(sum(1 for s in t.steps if s.control_locus == "model") for t in traces)
    k_total = mean(len(t.steps) for t in traces)
    alpha = k_m / max(k_total, 1)                            # Topic 1's autonomy fraction

    return {
        "autonomy_fraction": alpha,
        "verdict": (
            "OVER-ORCHESTRATED: the model makes almost no decisions. You have built a "
            "deterministic program with an expensive string formatter in it. Either the "
            "task IS deterministic (drop the model) or you engineered away the flexibility "
            "you were paying for." if alpha < 0.05 else
            "UNDER-ORCHESTRATED: nearly every step is model-directed. Error compounds "
            "geometrically (Topic 1, W-1). Check W-2: which of these could code decide?"
            if alpha > 0.8 else "in range — justify each control (C-1)"
        ),
    }
```

**The decision procedure (§3.3), as a gate on adding structure:**

```python
def should_add_control(candidate: Control, observed_failures, system) -> Decision:
    # Q1 (W-2): is this replacing model autonomy that code COULD have determined?
    if candidate.replaces_autonomy and code_could_decide(candidate.decision_point):
        return Decision.add("deterministic step: autonomy here was reliability for nothing")

    # Q2 (C-1): does it prevent an OBSERVED failure?
    if not any(f.prevented_by(candidate) for f in observed_failures):
        return Decision.reject(
            "No observed failure. This is preemptive orchestration: certain rigidity "
            "and maintenance for an imagined gain. [BEA]: 'find the simplest solution "
            "possible, and only increase complexity when needed.'"
        )
    return Decision.add("prevents an observed failure — verify it stops after adding")
```

## 7. Trade-offs

| Orchestration level | Buys | Costs |
|---|---|---|
| **Minimal** (single call [BEA]) | Simplicity; full model flexibility | Compounding error on multi-step tasks; no guardrails |
| **Moderate** (deterministic structure + guarded autonomy) | Reliability *and* adaptability | Design effort; a control per observed failure |
| **Heavy** (every branch coded) | Predictability on the anticipated distribution | **Fails on the unanticipated; every new case is a code change; the model is vestigial** |

**The trade is genuinely two-sided, and the asymmetry in *visibility* is what makes it hard.** Under-orchestration's cost is loud (the agent fails); over-orchestration's is quiet (the system is rigid). **So the observed pressure is always toward more structure, and a team that simply responds to observed failures will over-orchestrate over time** — each individual control is justified by a real failure, and the *aggregate* rigidity is never anyone's problem.

**The counter-discipline is C-2: measure out-of-distribution performance.** It is the only signal that makes the rigidity cost visible, and it should be a standing metric. **A system whose in-distribution performance rises while its out-of-distribution performance falls is over-orchestrating**, one justified control at a time.

**The over-orchestration end-state is worth naming plainly:** if the model has no decisions left, you have built a deterministic program and are paying LLM inference for it. **That may be the right system** — deterministic programs are excellent — but then **remove the model** and enjoy a faster, cheaper, more reliable service. **What you must not do is pay for a model's flexibility and then engineer it away**, keeping the cost and losing the benefit. That is the worst cell in the table and it is where over-orchestrated systems land.

## 8. Experiments

**The orchestration-level curve — the measurement no source publishes.** Build the same task at several orchestration levels (single call → pipeline → state machine → guarded agent → free agent). Measure, on **two task sets**:

- **In-distribution** (the tasks you designed for): completion, cost, latency, $K_M$.
- **Out-of-distribution** (tasks the orchestration was *not* built for — the C-2 measurement).

**Prediction (§3.1): in-distribution completion rises with orchestration and then plateaus; out-of-distribution completion rises, peaks, and then *falls* as rigidity sets in.** The peak of the OOD curve is your orchestration level. **This is the experiment that operationalizes the whole chapter, and it is the one nobody runs — because the OOD arm requires admitting that you cannot anticipate everything.**

**The control-justification audit (C-1).** For every control, cite the observed failure it prevents and verify it stopped. **Controls with no cited incident are preemptive orchestration** — remove them and measure whether anything breaks. **Expect some to be removable with no cost**, which is the finding.

**The single-call baseline** [BEA]. The baseline everything must beat: "Optimizing single LLM calls with retrieval and in-context examples is usually enough." **Run it.** A surprising fraction of orchestration does not beat it, and knowing that is worth more than any of the machinery.

**The autonomy-fraction check (§6).** Compute $\alpha$. **Near zero → over-orchestrated** (the model is vestigial). **Near one → under-orchestrated** (error compounds). **The value itself is diagnostic** and most teams have never computed it.

**Statistics.** Paired designs across orchestration levels; McNemar on completion; **report in-distribution and out-of-distribution separately — pooling them hides the entire effect**; task-clustered bootstrap; Holm across levels (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Preemptive orchestration.** A control added because it "seems robust," with no observed failure. Certain cost, imagined benefit. Mitigation: C-1 — cite the incident.
- **Over-orchestration by accretion.** Each control individually justified by a real failure; the *aggregate* rigidity is nobody's problem. **The characteristic path to a brittle system.** Mitigation: C-2 — measure OOD performance as a standing metric.
- **The vestigial model.** Every branch coded; the model has no decisions; you pay LLM inference for a deterministic program. Mitigation: the $\alpha$ check (§6) — and if the task really is deterministic, **remove the model.**
- **Under-orchestration.** Everything model-directed; error compounds geometrically (Topic 1, W-1); no gates, no termination argument. Mitigation: Q1 — which steps could code decide?
- **Trading model errors for orchestration errors.** The router misroutes; the state machine lacks a transition; the gate fires wrongly. **You did not necessarily come out ahead.** Mitigation: measure — the control must reduce *total* failures, not just move them.
- **Optimizing only in-distribution.** The system gets better at what you built it for and worse at everything else — invisibly. Mitigation: the OOD task set (C-2).
- **Never running the single-call baseline.** The entire orchestration may not be beating a well-prompted single call [BEA]. Mitigation: run it.
- **Edge case — the genuinely deterministic task.** Some tasks *are* fully specifiable, and heavy orchestration is correct. **The right response is to notice this and drop the model** — not to keep paying for autonomy you have eliminated.
- **Edge case — the genuinely open-ended task.** [BEA]: "impossible to predict the required number of steps." Here autonomy is mandatory, and orchestration's job is **guardrails, not structure**: gates (Topic 8), termination arguments (Topic 11), typed status (Topic 7). **Guard the autonomy; do not try to replace it.**
- **Open limitation.** **The crossover point is unmeasured.** [BEA] and [OAO] state the simplicity default with a rationale; neither publishes a performance-vs-orchestration curve, and no source measures the four specialist justifications' effect. **The out-of-distribution rigidity cost (C-2) is unmeasured anywhere in the sources.** C-1/C-2 are **[derived]**; §8's curve is the local measurement, and it is the chapter's most important unrun experiment.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **"Find the simplest solution possible, and only increasing complexity when needed"** [BEA]; **"Start with one agent whenever you can"** [OAO]. **The default is simplicity, from both vendors.**
2. "Splitting prematurely creates complexity without proportional benefit" [OAO].
3. "Optimizing single LLM calls with retrieval and in-context examples is usually enough" [BEA] — the baseline.
4. Agentic systems "trade latency and cost for better task performance," and are inappropriate when the trade does not yield "measurable improvements" [BEA].
5. Agents cost "higher costs, and the potential for compounding errors" [BEA]; agents are warranted only when you "can't hardcode a fixed path" [BEA].
6. Specialists are justified by capability isolation, policy isolation, prompt clarity, or trace legibility [OAO] — the only sourced list.
7. Added harness machinery can *degrade* the system (evolver pathologies; the seesaw constraint) [HX §4.2] — **more is not monotone.**
8. **The crossover point is unmeasured in every source.**

**Decision rules.**
- **Q1 (feasibility, W-2):** can code determine this step? **Yes → deterministic. No → grant autonomy and *guard* it.**
- **Q2 (value, C-1):** does this control prevent an **observed** failure? **No → do not add it.**
- **Measure out-of-distribution performance** (C-2) — it is the only signal that makes rigidity visible.
- **Run the single-call baseline** [BEA]. Much orchestration does not beat it.
- **Compute $\alpha$** — near zero means the model is vestigial; near one means error compounds.
- **If the model has no decisions left, remove the model** — do not pay for flexibility you engineered away.
- **For genuinely open-ended tasks: guard the autonomy, do not replace it.**

**Production implications.**
1. Run the orchestration-level curve with an **out-of-distribution arm** (§8); it is the chapter's most important experiment and almost nobody runs it.
2. Audit every control for a cited, observed failure (C-1); remove the preemptive ones and measure whether anything breaks.
3. Put out-of-distribution completion on a standing dashboard; over-orchestration is invisible without it.
4. Compute your autonomy fraction; it is diagnostic and free.

**Connections.** This topic is the decision procedure for everything in Chapters 1–11: it decides *which* structure (Topic 1), *which* pattern (Topic 2), *whether* to route (Topic 3), *whether* to add a specialist (Topic 5's [OAO] criteria), *whether* a gate is warranted (Topic 8). It rests on Chapter 1, Topic 9 (workflows dominate) and Topic 8 (error accumulation), and it applies Chapter 3, Topic 14's evidentiary standard to control structures (a control is part of $D_c$). **Chapter 9 asks the same question one level up: when is a *multi-agent* system justified?** — and the answer will have the same shape.

## Sources

[BEA] Anthropic, "Building effective agents" — **"When building applications with LLMs, we recommend finding the simplest solution possible, and only increasing complexity when needed"**; "Optimizing single LLM calls with retrieval and in-context examples is usually enough"; "Agentic systems often trade latency and cost for better task performance" (inappropriate when the trade does not yield "measurable improvements"); agents' "higher costs, and the potential for compounding errors"; agents warranted for "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path"; the emphasis on "measuring performance before adding complexity" — https://www.anthropic.com/engineering/building-effective-agents
[OAO] OpenAI, agent-orchestration guide — **"Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"**; **"Splitting prematurely creates complexity without proportional benefit"** — https://developers.openai.com/api/docs/guides/agents/orchestration
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §4.2 — harness-evolution pathologies and the "seesaw" constraint: added harness machinery can degrade the system; **more is not monotone** — independent corroboration of the over-orchestration direction
