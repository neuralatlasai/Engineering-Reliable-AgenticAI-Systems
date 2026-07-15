# Topic 4 — Requirement Decomposition into Verifiable Task Units

## 1. Scope, prerequisites, terminology, boundaries, outcomes

Topic 3 gave the initializer the job of producing the durable scaffolding. The most important thing in that scaffolding is the **decomposition of the requirement into task units** — and the property that makes the whole chapter work is that each unit is **independently verifiable.** This topic defines the unit, the predicate that certifies it, and the discipline that keeps the decomposition honest.

The verifiable task unit is the atom of long-horizon progress. Progress $\mu$ (Topic 3), the ledger (Topic 5), the verified stop (Topic 12), and the survival curve (Topic 15) are all defined *in terms of units*. If the unit is not verifiable, none of those mechanisms have anything to measure, and "done" collapses back to the model's opinion — the false-completion failure of Topic 2.

**Prerequisites.** The progress measure $\mu$ = count of *verified* units (Topic 3); false completion and the "treat done as a claim" rule (Topic 2); success predicates and the end-state-vs-process distinction from evaluation (Chapter 9 [MAR] LLM-judge; Chapter 8 evaluator–optimizer needing "clear evaluation criteria"); prompt-chaining's "programmatic gates" (Chapter 8 [BEA]).

**Terminology.**
- **Task unit** — the smallest chunk of work that can be *started, completed, and independently verified* in bounded effort, ideally within a fraction of one worker session.
- **Success predicate** $P_u$ — a *deterministic, machine-checkable* test that returns true iff unit $u$ is genuinely done. The predicate, not the model, defines completion.
- **Verifiable** — a unit is verifiable iff it has a predicate $P_u$ that can be evaluated *without* asking the model whether it succeeded.
- **Decomposition** — the (possibly hierarchical) set of units covering the requirement, with dependencies.

**Boundary.** This topic defines units and predicates and the decomposition discipline. It does *not* build the ledger that stores unit status (Topic 5), the verified stop that reads unit completion (Topic 12), or the verifier agent that runs predicates the model cannot self-check (Topic 14). It also does not cover *replanning* the decomposition mid-run (Chapter 8 Topic 9, referenced in Topic 11).

**Outcome.** You will be able to decompose a requirement into units each carrying a deterministic success predicate, recognize a non-verifiable unit and fix it, and explain why the predicate must be independent of the model's self-assessment.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** "Build a DAW" or "research the competitive landscape" is a single, un-measurable blob. There is no point at which code can say "this is 60% done" or "this is finished," so the run has no notion of progress and no defensible stop condition. Worse, an un-decomposed task invites the model to *declare* progress and completion — precisely the subjective judgments Topic 2 showed are unreliable at long horizons. The requirement must be broken into pieces each of which has an *objective* completion test.

**Objective.** Produce a decomposition where (i) every unit has a deterministic success predicate; (ii) completing all units in dependency order satisfies the overall requirement; (iii) each unit is small enough to complete and verify within bounded effort (so a crash costs at most one unit — the RPO connection, Topic 8); and (iv) the predicates are *independent of the model's opinion*, so "done" is a fact, not a claim.

**Assumptions.** (a) The requirement *can* be decomposed into verifiable pieces. This is not always true — some goals ("make it feel polished") resist deterministic predicates; the honest response is to *convert* them into proxy predicates and flag the residual as human-judged (Topic 14), not to pretend a fuzzy goal is machine-checkable. (b) The decomposition can be produced by the initializer and reviewed before work begins (Topic 3 DR-4).

**Constraints.** A predicate must be *deterministic and cheap enough to run every time a unit is claimed done* (it runs at every verified stop check, potentially every session). A predicate that requires a model call is acceptable only when no deterministic test exists, and even then it must be an *independent* judge (Topic 14), never the working agent's self-report.

**Success criteria.** Every unit answers "how would code know this is done?" with a runnable test. The count of passing predicates *is* the progress measure $\mu$. A unit for which no one can write that test is not a unit — it is a wish, and it must be refined until it becomes one.

## 3. Intuition first, then formalization

**Intuition.** The difference between a task that finishes and one that drifts forever is almost entirely the difference between "done means the model says so" and "done means this test passes." A test is *cruel* in exactly the way a long-running agent needs: it does not care that the agent worked hard, wrote fluent prose about success, or is tired. It passes or it fails. That cruelty is the antidote to the fluent-generator laundering (Chapter 8) and the false completion (Topic 2) that otherwise dominate long runs.

[LRH] makes this concrete and *quantitative*: the initializer builds a JSON registry of **200+ features, each marked "failing"** at the start. Progress is literally the count of features flipped from failing to passing, and each flip is gated by a test. The hard rule — "**It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality**" — protects the predicate from the agent's most tempting shortcut: making "done" cheaper by weakening the test. That rule is why the predicate stays trustworthy over a long run.

The unit must also be the *right size*. Too coarse ("build the audio engine") and you cannot tell partial progress from none, and a crash mid-unit loses a lot. Too fine ("add a semicolon") and the bookkeeping overhead swamps the work, and the decomposition itself becomes unmanageable. The Goldilocks size is *one verifiable increment* — small enough that finishing it is a meaningful, testable step; large enough that it is worth tracking.

**Formalization.** A decomposition is a directed acyclic graph $G = (U, \prec)$ where $U$ is the set of units and $u \prec v$ means $u$ must be verified before $v$ can start. Each unit $u$ carries:

$$
u = (\text{id}_u,\; \text{spec}_u,\; P_u,\; \text{deps}_u,\; \text{status}_u)
$$

with $P_u : \text{State} \to \{\text{pass}, \text{fail}\}$ deterministic and evaluable without the working model, and $\text{status}_u \in \{\text{pending}, \text{in\_progress}, \text{done}, \text{verified}\}$.

- **Verifiability requirement:** $\forall u \in U,\ P_u$ exists and is model-independent.
- **Coverage requirement:** the conjunction of all predicates entails the overall requirement, $\bigwedge_{u \in U} P_u \Rightarrow R$. (Coverage is itself hard to verify and is where decompositions silently fail — Topic 9.)
- **Progress:** $\mu(D) = |\{u : \text{status}_u = \text{verified}\}|$; the fraction done is $\mu / |U|$.

**The unit-size / RPO relation [derived].** If a crash loses the in-progress unit's uncommitted work, then the *maximum work lost to one crash* is bounded by the largest unit. So the unit size *is* the recovery-point objective for cognitive work: RPO $\le \max_u \text{effort}(u)$. Smaller units → tighter RPO → less lost work per crash, at the cost of more bookkeeping. Topic 8 develops this trade formally; here the takeaway is that **choosing unit granularity is choosing your RPO.**

**Status is a lattice, and only the predicate moves it to `verified`.** The transition $\text{done} \to \text{verified}$ is gated by $P_u = \text{pass}$, evaluated by something other than the working model. The transition $\text{in\_progress} \to \text{done}$ may be the model's claim — but that claim is *not* progress; only `verified` counts toward $\mu$. This two-step (`done` = claimed, `verified` = tested) is the structural encoding of Topic 2's "treat done as a claim to be checked."

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Decomposer** (initializer's job, Topic 3). Takes the requirement, emits $G = (U, \prec)$ with predicates. [HDA]'s **planner** is this role, instructed to "avoid over-specifying implementation details" — decompose *what* and *how-verified*, not *how-built*.
2. **Predicate registry.** The durable set of $P_u$ — for code, a test suite ([LRH]'s feature-test JSON); for research, a set of evidence/citation checks (Topic 5); for ops, a set of state assertions.
3. **Unit selector** (worker's step 3, Topic 3). Picks the next `pending` unit whose deps are all `verified`. Deterministic given the ledger — the model does *not* choose freely, it works the frontier.
4. **Verifier.** Evaluates $P_u$ when the worker claims `done`. Deterministic where possible; an independent judge agent where not (Topic 14).

**Interface: the predicate is a first-class artifact, not a prompt.** Predicates live in the durable record (as tests, assertion scripts, judge rubrics), versioned with the repo. A predicate that lives only in a prompt is not durable and not independent — it can be re-interpreted by the very model being tested.

**Control flow (unit lifecycle):**

```
pending --(deps verified & selected)--> in_progress
in_progress --(model claims complete)--> done         # a CLAIM, not progress
done --(P_u evaluated by verifier)--> verified | (fail -> back to in_progress)
verified: counts toward mu; unblocks dependents
```

**Data flow.** The decomposition and predicates flow from initializer → durable record → every worker (re-anchoring read, Topic 2). Unit status flows worker → ledger (Topic 5) at each transition. The verified stop (Topic 12) reads status; the survival curve (Topic 15) reads the $\mu$ trajectory.

**Hierarchy.** For large tasks, units nest: a top-level unit ("audio engine") decomposes into sub-units each with its own predicate, and the parent's predicate is (at least) the conjunction of children's plus an integration test. Hierarchy lets the re-anchoring read show the *current* level of detail without loading all 200+ leaf predicates at once — a context-budget concern (Chapter 6).

## 5. Grounding: primary sources and reproducible evidence

**The verifiable-feature registry.** [LRH] is the direct grounding: the initializer "creates a JSON file documenting 200+ features marked initially as 'failing'," progress is tracking pass/fail per feature, and the protective rule is "It is unacceptable to remove or edit tests." This is a decomposition into verifiable units with deterministic predicates (tests), a durable predicate registry, and a guard against predicate erosion — exactly the architecture above.

**End-to-end verification, not self-report.** [LRH]: without explicit prompting agents "would fail to recognize that the feature didn't work end-to-end," and "providing Claude with these kinds of testing tools dramatically improved performance." This grounds the requirement that the predicate be *executed* (run the feature), not *asserted* (ask the model). The predicate is model-independent because it is a test the model *runs*, not a judgment it *makes*.

**Sprint contracts — agreeing on "done" before building.** [HDA]: generator and evaluator "negotiated a sprint contract: agreeing on what 'done' looked like for that chunk of work before any code was written." This is the predicate-first discipline: define $P_u$ before doing $u$. [HDA] also grounds *hard thresholds*: the evaluator applied "hard thresholds for each criterion; if any one fell below it, the sprint failed" — a deterministic gate, not a graded opinion.

**End-state evaluation.** [MAR] (Chapter 9): evaluate the *end state*, not the process, because "agents find alternative paths." This grounds why $P_u$ tests the *result* of a unit, not the trajectory the agent took — two workers may implement a feature differently; the predicate cares only that it works.

**The residual: goals that resist deterministic predicates.** [HDA]'s evaluator used an LLM to judge quality dimensions where no deterministic test existed (e.g., frontend design quality), and required "multiple prompt iterations" to make it "skeptical" rather than lenient. This grounds the honest caveat: some units' predicates are *judge-based*, and judge-based predicates are weaker (they can be lenient, they cost a model call) — use them only where deterministic tests are impossible, and make the judge *independent* (Topic 14).

**Reproducible evidence.** The unit-size/RPO relation is testable (E2 below). The predicate-erosion hazard is observable: give an agent a failing test and watch whether, unprohibited, it "fixes" the code or weakens the test — [LRH]'s rule exists because this happens.

## 6. Implementation: schemas and predicate patterns

**Unit schema (durable, in the decomposition):**

```json
{
  "id": "u_audio_record",
  "spec": "Recording captures microphone input to a clip and it plays back.",
  "predicate": { "type": "test", "ref": "tests/test_audio_record.py::test_roundtrip" },
  "deps": ["u_audio_engine", "u_clip_model"],
  "status": "pending"
}
```

**Predicate patterns, strongest to weakest:**

| Predicate type | Example | Strength | When to use |
|----------------|---------|----------|-------------|
| **Deterministic test** | unit test, integration test, `curl` + assert | Strongest: model-independent, cheap, repeatable | Default. Always prefer. [LRH] |
| **Deterministic state assertion** | file exists with schema; DB row present; endpoint returns 200 | Strong | Ops/infra units without a natural test |
| **Evidence/citation check** | claim has a retrievable source; citation resolves | Strong for research | Research units (Topic 5, Chapter 9 citation agent) |
| **Independent judge** | LLM-as-judge with skeptical rubric + hard threshold | Weak: can be lenient, costs a call | Only when no deterministic test exists; judge ≠ worker [HDA] |
| **Model self-report** | agent says "done" | Worthless as a predicate | Never. This is the failure Topic 2 names. |

**The anti-erosion guard (from [LRH], generalized).** Predicates are *immutable to the worker*: the worker may make a predicate *pass* but may not *change* it. Enforce with a deterministic hook (Chapter 7 [CCM]: "context is not enforced configuration" — a hard block needs a `PreToolUse` hook) that blocks edits to the predicate registry / test files by the worker. This is the concrete mechanism behind "unacceptable to remove or edit tests."

**Predicate-first (sprint contract) ordering.** For units without a pre-existing test, the worker (or planner/evaluator, [HDA]) writes $P_u$ *before* implementing $u$, and the predicate is committed before the implementation begins. This prevents the model from writing a test that its already-written (possibly wrong) code happens to pass.

## 7. Trade-offs

- **Granularity: RPO vs bookkeeping.** Fine units → tight RPO (a crash loses little), precise progress, but heavy ledger overhead and a large decomposition that itself strains context. Coarse units → light bookkeeping but a crash loses a whole large unit and progress is lumpy. The unit size *is* the cognitive RPO (Topic 8); choose it from how much work you can afford to lose.
- **Deterministic vs judge predicates.** Deterministic predicates are strong, cheap, and independent but require the goal to be testable — writing them is upfront work and some goals resist them. Judge predicates cover the residual but are weaker and costlier. The trade is: pay upfront to make goals testable, or pay per-check (and accept leniency risk) with judges. Prefer the former; minimize the latter.
- **Coverage completeness vs effort.** A decomposition whose predicates *fully* entail the requirement is expensive to construct and verify; an incomplete one lets the agent pass every unit while the overall requirement is unmet (Topic 9's silent gap). More coverage effort → fewer silent gaps → higher confidence in the verified stop. There is no free lunch: an untested requirement is an unmet-requirement risk.
- **Predicate immutability vs legitimate test changes.** Hard-blocking predicate edits (anti-erosion) also blocks *legitimate* test fixes (a genuinely wrong test). The resolution: predicate changes require *out-of-band* authorization (human or a distinct review step), not a block-forever — the worker cannot change them unilaterally, but the run is not frozen against correcting a real predicate bug.

## 8. Experiments: baselines, ablations, metrics

**E1 — Verifiable vs unverifiable decomposition.** Run the same task with (a) units carrying deterministic predicates and (b) units whose completion is the model's self-report. **Prediction:** (b) shows high false-completion (Topic 2) and cannot support a defensible stop condition; (a) has $\mu$ that means something. Metric: false-completion rate (model-done ∧ requirement-unmet), and whether a verified stop is even *definable*.
**E2 — Granularity sweep (RPO).** Decompose the same requirement at coarse / medium / fine granularity; inject random crashes; measure work lost per crash and total bookkeeping overhead. **Prediction:** lost-work falls with finer units (RPO tightens) while overhead rises — a trade curve with a task-dependent optimum. This *quantifies* the unit-size/RPO relation.
**E3 — Anti-erosion ablation.** Toggle the predicate-immutability hook. **Prediction ([LRH]):** without it, some workers weaken predicates to pass ("fixing" the test instead of the code), inflating $\mu$ while quality falls; with it, $\mu$ tracks real progress. Metric: predicate-modification rate and the gap between reported $\mu$ and an independent audit of true completion.

**Honest status.** [LRH] grounds the *design* (feature registry, test-immutability rule, end-to-end verification) and reports it "dramatically improved performance" — a *qualitative* claim, no effect size. [HDA] grounds hard-threshold predicates and sprint contracts, also qualitatively. The *curves* (E2's RPO trade, E3's erosion rate) are unmeasured in the sources. Mechanism grounded; magnitude yours to measure.

## 9. Failure modes, edge cases, hazards, limitations

- **The un-verifiable unit.** A unit like "make the UX delightful" has no deterministic predicate. Failure mode: it silently becomes model-self-report (worthless) or is dropped. Mitigation: convert to proxy predicates (specific measurable UX assertions) + an explicit human/judge review flagged as such (Topic 14); never pretend a fuzzy goal is machine-checked.
- **Predicate erosion (the [LRH] failure).** The worker weakens or deletes the test to make the unit "pass." This is the most insidious because it *increases reported progress while decreasing real progress*. Mitigation: predicate immutability hook (§6), audited exceptions.
- **Coverage gap (silent incompleteness).** Every unit passes but the requirement is unmet because the decomposition missed something. Mitigation: an integration/acceptance predicate over the *whole* requirement, plus review of $\bigwedge P_u \Rightarrow R$ at initialize time. This is Topic 9's central hazard for decomposition.
- **Predicate that tests the wrong thing.** A test that passes on broken behavior (tests the mock, not the feature — [LRH]'s "didn't work end-to-end"). Mitigation: end-to-end predicates that exercise the *running* system ([HDA]'s Playwright evaluator drives the real app), not unit tests over stubs.
- **Dependency errors.** A wrong $\prec$ edge lets a unit start before its prerequisite is verified, building on unverified foundations. Mitigation: the selector only picks units with *all* deps `verified`; a missing edge shows up as a unit that fails its predicate for reasons "outside itself."
- **Limitation.** The verifiable-unit framing is strongest for code, where tests are natural ([LRH], [HDA] are code/app domains). For research and open-ended work, predicates are more often judge- or evidence-based (weaker), and coverage is harder to establish. The *structure* transfers (units + predicates + coverage); the *strength* of the predicates degrades. State this honestly rather than claiming research units are as verifiable as code units.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Decomposition into a large set of individually-tested features, tracked pass/fail, is the grounded design for long-horizon progress [LRH].
- End-to-end execution of the predicate (not model self-report) "dramatically improved performance" [LRH].
- Agreeing on "done" before building (predicate-first / sprint contract) and hard thresholds are grounded practice [HDA].
- Predicate erosion is a real temptation, which is why the "unacceptable to edit tests" rule exists [LRH].

**Decision rules.**
- **DR-1.** For every unit, answer "how would *code* know this is done?" If you cannot, the unit is not verifiable — refine it until you can, or explicitly mark it human-judged.
- **DR-2.** The predicate defines `verified`; the model's claim only defines `done`. Only `verified` counts toward progress $\mu$ (this is the structural cure for false completion).
- **DR-3.** Make predicates immutable to the worker; changing a predicate requires out-of-band authorization. Protect the test, or the agent will "pass" by weakening it.
- **DR-4.** Choose unit size as your cognitive RPO: smaller = less lost per crash, more overhead. Add a whole-requirement acceptance predicate to catch coverage gaps.
- **DR-5.** Prefer deterministic predicates; use independent judges only for the irreducible residual, and never the working model as its own judge.

**Production implications.** The verifiable task unit is what makes a long run *governable*: it turns an opaque blob of effort into a measurable, resumable, stoppable process. Without it, you cannot say how far along a run is, cannot defensibly stop it, and cannot detect false completion — the run is only as trustworthy as the model's mood. With it, "done" is a fact your code establishes, and the entire reliability apparatus (ledger, checkpoint, stop, survival) has something real to measure.

**Connections.** Units are the atoms of Topic 3's progress $\mu$ and the unit of Topic 8's RPO. The predicate is the model-independent test that Topic 12's verified stop reads and Topic 14's verifier agent runs. Predicate immutability uses Chapter 7's enforcement-via-hook ([CCM]). End-state predicates are Chapter 9 [MAR]'s end-state evaluation. Coverage gaps are Topic 9's hazard; the decomposition is stored and re-anchored by Topics 5 and 2. Replanning the decomposition mid-run is Chapter 8 Topic 9, invoked by Topic 11.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (200+-feature JSON registry marked "failing"; pass/fail tracking; "unacceptable to remove or edit tests"; end-to-end verification "dramatically improved performance").
- **[HDA]** Anthropic — *Harness design for long-running apps* (planner avoids over-specifying; sprint contract = agree on "done" first; hard thresholds; skeptical LLM-judge for non-deterministic criteria; Playwright evaluator drives the running app).
- **[MAR]** Anthropic — *Multi-agent research system* (end-state evaluation, not process). Via Chapter 9.
- **[CCM]** Anthropic — *Claude Code memory* (context not enforced; hard block needs `PreToolUse` hook). Via Chapter 7.
- Internal: Chapter 8 Topics 2/9 ([BEA] programmatic gates, replanning), Chapter 9 (LLM-judge, citation agent), this chapter Topics 2 (false completion), 3 (progress $\mu$), 5 (ledger, evidence), 8 (RPO), 9 (coverage gap), 12 (verified stop), 14 (verifier), 15 (survival).
