# Topic 14 — Workflow Conformance and Property-Based Testing

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Proving the workflow does what the chapter's disciplines require. Every topic ended in an invariant; this topic turns those invariants into **executable properties** and tests them against adversarial inputs — because an invariant nobody tests is a comment.

**Prerequisites.** Chapter 4, Topic 14 (conformance tests for provider interfaces — the same discipline, one layer up); Chapter 1, Topic 12 (the statistics contract); every topic in this chapter (each supplies a property).

**Terminology.** *Conformance test*: asserts a specific interface fact still holds. *Property-based test*: asserts an invariant holds over *generated* inputs, rather than over hand-picked examples. *Property*: a universally-quantified claim about the workflow.

**Boundaries.** Inside: the property catalogue, the generators, and the fault injection. Outside: the disciplines being tested (Topics 1–13); agent evaluation science (Chapter 13).

**Exclusions.** No property-testing-library tutorial.

**Outcomes.** The reader can convert this chapter's invariants into executable properties, generate adversarial workflow inputs, and catch the failures the chapter catalogued before production does.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** This chapter has stated roughly twenty invariants — W-1/W-2 (autonomy), P-1/P-2/P-3 (patterns), R-1/R-2 (routing), A-1/A-2/A-3 (architectures), H-1/H-2/H-3 (delegation), O-1/O-2/O-3 (aggregation), T-1/T-2/T-3 (typed state), G-1/G-2/G-3 (gates), RP-1/RP-2/RP-3 (replanning), D-1/D-2/D-3 (durability), TE-1..TE-4 (termination), C-1/C-2 (complexity). **An invariant that is not tested is a comment**, and every one of these describes a failure that is silent when it occurs.

**Bottleneck.** Example-based tests are the wrong tool. A workflow's failures — laundered statuses (O-2), write races (A-2), thrashing (RP-3), crash-window duplication (D-2), deadlock (TE-4) — arise from **specific combinations of failure timing, concurrency, and input** that a human will not think to write as examples. **You cannot hand-pick the test case that catches a race.** The bottleneck is that these are *properties over a space*, and testing them requires *generating* the space.

**Objective.** A property suite that (i) encodes each invariant as an executable, universally-quantified assertion, (ii) generates adversarial inputs — including failure timings and interleavings — and (iii) runs in CI.

**Assumptions.** The workflow is deterministic *given* its inputs and the model's outputs (so the model can be stubbed for the structural properties). Failures can be injected.

**Constraints.** Model calls are expensive and non-deterministic — so **structural properties must be testable with a stubbed model**, or the suite is too slow and too flaky to run.

**Success criteria.** Every invariant has a property test; the generators cover failure timings and interleavings; the suite gates every workflow change.

## 3. Intuition first, then formalization

### 3.1 Intuition: stub the model, test the structure

The insight that makes this tractable: **most of this chapter's invariants are properties of the *control structure*, not of the model.**

- Does the aggregator compute $\kappa_{\text{agg}}$ pessimistically (O-2)? **That is a property of your aggregation code**, and it holds or fails regardless of what the model said.
- Do parallel branches with overlapping writes get rejected (P-1)? **A property of the dispatcher.**
- Does the resume path re-execute a completed step (D-1)? **A property of the event log's fold.**
- Does a wait cycle get detected (TE-4)? **A property of the wait-graph checker.**

**So: stub the model, and test the structure exhaustively.** Replace the model with a *controllable* stub that returns whatever the test needs — a `budget` termination, a refuted plan, an identical replan, an empty result — and then assert the workflow's structural invariants over *generated* combinations of those stub behaviors.

This is the key to a fast, deterministic, exhaustive suite: **the expensive, non-deterministic part (the model) is exactly the part these properties do not depend on.** You are not testing whether the model is good; you are testing whether **your workflow handles every way the model can be bad** — and that is a finite, generable space.

The residual properties that *do* need a real model (does the router route correctly? does the evaluator's score correlate with quality?) are **behavioral** and belong in the measured evaluations of the individual topics (Topic 3, §8; Topic 2, §8), not in the property suite. **Separate them: structure is property-tested with a stub; behavior is measured with the real model.**

### 3.2 Formalization: the property catalogue

Each invariant becomes a universally-quantified property **[synthesis; each invariant sourced in its topic]**:

$$
\textbf{Structural properties (stubbed model — fast, deterministic, exhaustive):}
$$

| Property | Invariant | Generator |
|---|---|---|
| **PROP-AGG** | $\kappa_{\text{agg}}$ = success $\iff$ every required constituent succeeded (O-2) | All $\kappa$ combinations × required/optional markings |
| **PROP-LAUNDER** | No run with a failed required constituent reports `success` (O-2/O-3) | As above |
| **PROP-KAPPA** | Every sub-agent's $\kappa$ crosses the delegation boundary (H-2) | All child terminal statuses |
| **PROP-PAR** | Parallel branches with overlapping writes are rejected (P-1) | Random write-set overlaps |
| **PROP-OWNER** | Only the owner writes a shared item (A-2, single writer) | Random component/item write attempts |
| **PROP-CYCLE** | Any wait cycle is detected, never hung on (A-3, TE-4) | Random wait-graphs, including cyclic |
| **PROP-RESUME** | Resume never re-executes a *completed* step (D-1) | Crash at every step boundary |
| **PROP-DUP** | Crash *inside* a step never duplicates the effect (D-2) | Crash inside the crash window |
| **PROP-TERM** | Every loop terminates; no-decrease in $\mu$ ⇒ terminate (TE-1, TE-3) | Stub models that never progress |
| **PROP-NOVEL** | A replan equivalent to a failed plan escalates, never loops (RP-3) | Stub planner returning identical plans |
| **PROP-CLASS** | Transient → retry; refutation → replan; terminal → escalate (§Topic 9) | All failure classes |
| **PROP-GATE** | Every irreversible write passes a gate (G-1) | Random calls across effect classes |
| **PROP-TYPE** | `κ=success` ⟹ content ≠ ⊥ (T-3: failure ≠ empty) | Random StepResults |

$$
\textbf{Behavioral properties (real model — measured, not property-tested):}
$$

Router accuracy (Topic 3), evaluator-score/quality correlation (Topic 2, P-2), specialist justification (Topic 5), orchestration level (Topic 12). **These are *evaluations*, with intervals (Chapter 1, Topic 12) — not properties.**

**The separation is the topic's central design decision.** Structural properties are **cheap, deterministic, exhaustive, and CI-gating**. Behavioral evaluations are **expensive, noisy, statistical, and periodic**. **Conflating them produces a suite that is too slow to run and too flaky to trust** — which is why most teams have neither.

### 3.3 The failure-timing generator is what catches the expensive bugs

The properties that catch this chapter's *worst* failures — D-2's crash-window duplication, A-2's write races, TE-4's deadlock — all depend on **timing**: *when* the crash happens, *how* the concurrent writes interleave, *what order* the components block in.

**A human will not hand-write these test cases.** Nobody writes "crash after the HTTP request is sent but before the completion event is appended" as a test — and that is precisely the case that double-charges a customer (Topic 10, D-2).

**So the generator must enumerate the timings.** For durability:

$$
\text{generate: crash at every point } p \in \{\text{before-effect},\ \text{after-effect-before-record},\ \text{after-record}\} \times \text{every step } i .
$$

The middle point — **after the effect, before the record** — is the crash window, and it is the one that matters. **A durability suite that crashes only *between* steps is testing the easy case and missing the expensive one.**

Similarly for concurrency: generate interleavings, not just concurrent execution. **Running two writers "at the same time" and observing no corruption proves nothing** — the race is timing-dependent, and the generator must *force* the adverse interleaving.

**This is the difference between a suite that passes and a suite that finds bugs.**

## 4. Architecture

```
   THE SUITE — two halves, deliberately separated (§3.1)

   ┌── STRUCTURAL PROPERTIES — STUBBED MODEL ─────────────────────────────────┐
   │  fast · deterministic · exhaustive · CI-GATING                            │
   │                                                                          │
   │  STUB MODEL returns whatever the test needs:                              │
   │    κ=budget · refuted plan · identical replan · empty result · error      │
   │         │                                                                │
   │         ▼                                                                │
   │  GENERATORS enumerate the adversarial space (§3.3):                      │
   │    · all κ combinations × required/optional      → PROP-AGG, PROP-LAUNDER│
   │    · CRASH AT EVERY POINT, incl. the CRASH WINDOW → PROP-DUP  ★          │
   │    · forced write interleavings                  → PROP-PAR, PROP-OWNER  │
   │    · random wait-graphs incl. cyclic             → PROP-CYCLE            │
   │    · stub planners that never progress           → PROP-TERM, PROP-NOVEL │
   │         │                                                                │
   │         ▼                                                                │
   │  ASSERT the chapter's invariants (O-2, P-1, A-2, D-2, TE-3, ...)          │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌── BEHAVIORAL EVALUATIONS — REAL MODEL ───────────────────────────────────┐
   │  expensive · noisy · STATISTICAL · periodic (NOT CI-gating)               │
   │  router accuracy (T3) · evaluator/quality correlation (T2) ·              │
   │  specialist justification (T5) · orchestration level + OOD (T12)          │
   │  → measured with INTERVALS (Ch.1 T12), not asserted as properties         │
   └──────────────────────────────────────────────────────────────────────────┘

   ★ THE CRASH WINDOW is the generator that catches the expensive bug.
     A suite that crashes only BETWEEN steps tests the easy case.
```

## 5. Grounding

- **Conformance testing as a discipline:** Chapter 4, Topic 14 — assert the interface facts your code depends on; a mocked suite tests your mocks; assertions on observable facts, not on the absence of exceptions. **This topic is that discipline, one layer up: from provider interfaces to workflow structure.**
- **Every invariant in this chapter is sourced or derived in its own topic** — the property catalogue (§3.2) is the chapter's invariants, made executable.
- **Deterministic verification is the harness's job:** the harness verifies "through deterministic sensors" [CAH §3.4.1]; verification-driven tools "provide deterministic feedback" [CAH §3.3] — **the structural properties are deterministic sensors on the workflow itself.**
- **Reproducible traces are a future-harness requirement:** [CAH §3.3] — the suite consumes and asserts over traces.
- **Replay requires environment reproducibility:** "replay the same patch, command, seed, dependency lockfile" [CAH §3.4.3] — the stub model is what makes the structural suite reproducible.
- **The statistics contract:** Chapter 1, Topic 12 — the behavioral half reports intervals; the structural half reports pass/fail with zero-failure targets where the invariant is a safety property.
- **Held-out sets and overfitting:** [WTA] — the behavioral evaluations must not be tuned against.
- **Evaluation tasks should be realistic and multi-step:** [WTA]'s task-construction guidance (Chapter 5, Topic 13) — for the behavioral half.

**Evidence gap.** The *conformance discipline* is established (Chapter 4, Topic 14) and the invariants are each grounded in their topics. **The property catalogue and the structural/behavioral split are [synthesis]** — standard property-based-testing practice applied to agent workflows. **No source describes property-based testing of agent workflows**, and none measures its bug-detection rate. **The claim that the failure-timing generator catches the expensive bugs (§3.3) is reasoned from the failure mechanisms** (D-2's crash window is a *documented* hazard — [ADK]'s dirty-read window; Chapter 5, Topic 11's ambiguous failure), **not measured.** §8 is the local validation.

## 6. Implementation

**The stub model — controllable badness (§3.1):**

```python
class StubModel:
    """§3.1: the structural properties do NOT depend on the model being good.
    They depend on the workflow handling every way the model can be BAD.
    Stub it, and that space becomes finite and generable."""
    def __init__(self, script: list[StubBehavior]):
        self.script = iter(script)

    def run(self, *_):
        b = next(self.script)
        match b.kind:
            case "success":         return StepResult(b.content, "success", ...)
            case "budget":           return StepResult(None, "budget", ...)
            case "refuted":          return StepResult(None, "execution_error", note=b.refutation)
            case "identical_replan": return b.same_plan_as_before      # → PROP-NOVEL
            case "empty":            return StepResult([], "success", ...)   # → PROP-TYPE (T-3)
```

**PROP-LAUNDER — the most valuable property in the suite (O-2):**

```python
@given(constituents=lists(step_results(), min_size=1))
def test_no_failure_laundering(constituents):
    """PROP-LAUNDER (O-2/O-3): a run with a FAILED REQUIRED constituent must NEVER
    report success — no matter how fluent the synthesis. This is Topic 6's core
    invariant, and every SDK's happy path violates it (Topic 13, §3.3)."""
    result, kappa = finalize(constituents, StubSynthesizer(always_fluent=True), task, ctx)

    any_required_failed = any(c.required and c.kappa != "success" for c in constituents)
    if any_required_failed:
        assert kappa != "success", (
            f"LAUNDERED: {kappa}=success despite a failed required constituent. "
            f"The synthesizer produced a fluent answer over partial failure (T6, §3.3)."
        )
```

**PROP-DUP — the crash-window generator that catches the expensive bug (§3.3, D-2):**

```python
@given(crash_point=sampled_from(["before_effect", "IN_CRASH_WINDOW", "after_record"]),
       step_index=integers(min_value=0, max_value=N_STEPS - 1))
def test_no_duplicate_effects(crash_point, step_index):
    """PROP-DUP (D-2): a crash INSIDE the crash window — after the effect, before the
    completion record — must not duplicate the effect on resume.
    ★ A suite that crashes only BETWEEN steps tests the easy case and misses this one."""
    effects = EffectRecorder()
    wf = DurableWorkflow(steps=make_steps(effects))

    with crash_at(crash_point, step_index):
        try: run(wf)
        except SimulatedCrash: pass

    run(wf)                                        # RESUME

    assert effects.count_per_key() == {k: 1 for k in effects.keys()}, (
        f"DUPLICATE EFFECT after crash at {crash_point} in step {step_index}. "
        f"D-2 violated: the in-flight step was re-executed without an idempotency key "
        f"or a three-state store (Ch.5 T11)."
    )
```

**PROP-CYCLE and PROP-OWNER — the concurrency properties (A-2, A-3/TE-4):**

```python
@given(graph=wait_graphs(allow_cycles=True))
def test_cycles_detected_never_hung(graph):
    """PROP-CYCLE (A-3/TE-4): a wait cycle must be DETECTED, never hung on.
    Under durable execution (Topic 10), a hang is PERMANENT."""
    if graph.has_cycle():
        with pytest.raises(DeadlockDetected):
            run_components(graph)                  # must raise, not hang
    else:
        assert run_components(graph).completed

@given(writes=lists(tuples(component_ids(), item_keys(), values())))
def test_single_writer_enforced(writes):
    """PROP-OWNER (A-2): only the owner writes. A non-owner write is REFUSED (loud),
    never silently lost (Ch.5 T5 E3 — lost updates are SILENT)."""
    state = OwnedSharedState(ownership=OWNERSHIP_MAP)
    for comp, key, val in writes:
        if OWNERSHIP_MAP.get(key) != comp:
            with pytest.raises(OwnershipViolation):
                state.write(key, val, comp)
        else:
            state.write(key, val, comp)
```

**PROP-TERM / PROP-NOVEL — the loop properties (TE-1, TE-3, RP-3):**

```python
@given(n_iterations=integers(min_value=1, max_value=100))
def test_loop_terminates_on_no_progress(n_iterations):
    """PROP-TERM (TE-3): a stub model that NEVER progresses must cause the loop to
    terminate with `no_progress` — NOT to burn the entire budget."""
    stub = StubModel([StubBehavior("identical_replan")] * n_iterations)
    _, kappa = run_loop(initial, stub, termination=Novelty(), budget=Budget(max_steps=100))

    assert kappa == "no_progress", (
        f"Loop reported {kappa}, not no_progress. TE-3 violated: it thrashed for the "
        f"full budget instead of detecting non-decrease in 2 iterations."
    )
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| **Structural properties + stub model** | Fast, deterministic, exhaustive, **CI-gating** | Does not test model behavior (correctly — that is not its job) |
| Example-based tests | Easy to write | **Will not find races, crash-window bugs, or deadlocks** |
| Real-model property tests | "Realistic" | **Slow, flaky, non-deterministic** — the suite gets disabled |
| **Failure-timing generators** | **Catches the expensive bugs** (§3.3) | A crash-injection harness |
| Behavioral evaluations (real model) | Measures what the stub cannot | Expensive, statistical, periodic — **not CI-gating** |

**The trade that makes the suite viable: separate structure from behavior.** A suite that runs the real model on every property is slow and flaky, and **a flaky suite gets disabled** — at which point you have none. **The stub-model structural suite is fast enough to gate every commit and deterministic enough to trust**, and it covers the invariants that matter most (aggregation, durability, concurrency, termination). **The behavioral questions are measured separately, periodically, with intervals** — as evaluations, not assertions.

**The failure-timing generator is where the value is.** Example-based tests find the bugs you thought of. **The generator finds the crash-window duplication, the adverse interleaving, the emergent deadlock — the bugs that are expensive precisely because nobody thought of them.** If you build one thing from this topic, build the crash-window generator (§6).

## 8. Experiments

**The suite *is* the experiment**, but three validations are worth running:

**Mutation testing — does the suite actually catch the failures?** Deliberately break each invariant in the implementation (make aggregation optimistic; remove the idempotency key; disable cycle detection) and **verify the corresponding property fails.** **A property that does not fail when its invariant is violated is not testing anything** — and this is a common and embarrassing state for a test suite.

**The coverage audit.** Map §3.2's property catalogue against the chapter's invariant list. **Every invariant should have a property; every property should have a generator that exercises the adverse case.** Gaps are untested invariants — which are comments.

**The crash-window validation (§3.3).** Confirm the generator actually crashes *inside* the window (after effect, before record) and not just between steps. **Instrument it:** count how many generated crashes land in the window. **If none do, the generator is testing the easy case and PROP-DUP is passing vacuously** — which is worse than not having it, because it manufactures confidence.

**The behavioral/structural split validation.** Confirm the structural suite runs fast and deterministically (it should be seconds and never flake). **If it is slow or flaky, a real model has leaked into it** — find it and stub it.

**Statistics.** Structural properties are pass/fail with zero-failure targets (a violation is a bug, not a rate). Behavioral evaluations carry intervals (Chapter 1, Topic 12). **Report them separately — never pool a deterministic property with a statistical evaluation.**

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Untested invariants.** Twenty invariants, no properties — they are comments. **The default state.** Mitigation: the property catalogue (§3.2).
- **Example-based tests only.** They find the bugs you thought of; they will never find a race or a crash-window duplication. Mitigation: generators (§3.3).
- **Vacuous properties.** PROP-DUP passes because the generator never crashes inside the window. **Worse than no test — it manufactures confidence.** Mitigation: instrument the generator; validate it hits the adverse case (§8).
- **Real model in the structural suite.** The suite becomes slow and flaky; it gets disabled. Mitigation: stub the model — the structural properties do not need it.
- **Property suite that does not gate.** Written, never run in CI. Mitigation: gate every workflow change on it.
- **Behavioral questions asserted as properties.** "The router routes correctly" as a pass/fail assertion — it is a *statistical* claim and will flake. Mitigation: measure it with intervals (Topic 3, §8), do not assert it.
- **Mutation-untested suite.** The properties pass and would also pass on a broken implementation. Mitigation: mutation testing (§8).
- **Edge case — properties that need a real environment.** Durability against a *real* external system (does the payment API honor the idempotency key? — Topic 10, §3.3) cannot be stubbed. **These are integration tests**, run against a sandbox, and they are the ones that validate your *actual* execution guarantee.
- **Open limitation.** **No source describes property-based testing of agent workflows**, and none measures its bug-detection rate. The property catalogue and the structural/behavioral split are **[synthesis]** — standard practice applied here. The claim that failure-timing generators catch the expensive bugs (§3.3) is **reasoned from documented failure mechanisms** ([ADK]'s dirty-read window; Chapter 5, Topic 11's ambiguous failure), **not measured.**

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Conformance testing asserts the facts your code depends on; a mocked suite tests your mocks; assert on observable facts, not the absence of exceptions (Chapter 4, Topic 14).
2. The harness verifies through **deterministic sensors** [CAH §3.4.1]; verification-driven tools give "deterministic feedback" [CAH §3.3].
3. Reproducible traces are a future-harness requirement [CAH §3.3]; replay needs environment reproducibility [CAH §3.4.3].
4. **The crash window is a documented hazard** — [ADK]'s dirty-read window; Chapter 5, Topic 11's ambiguous failure — and it is exactly what the timing generator targets.
5. **This chapter's ~20 invariants are each grounded in their topic** — the catalogue is their executable form.
6. **No source describes property-based testing of agent workflows.**

**Decision rules.**
- **Stub the model; test the structure** (§3.1) — the structural invariants do not depend on the model being good, only on the workflow handling it being bad.
- **Separate structural properties (CI-gating, deterministic) from behavioral evaluations (periodic, statistical).** Conflating them yields a suite too slow and flaky to keep.
- **Generate the failure timings** (§3.3) — especially the crash window; a suite that crashes only between steps tests the easy case.
- **Mutation-test the suite** — a property that does not fail on a broken implementation is testing nothing.
- **Every invariant gets a property**; an untested invariant is a comment.
- **Never assert a statistical claim as a property** — measure it with intervals.

**Production implications.**
1. Build PROP-LAUNDER first (§6); it tests the chapter's most consequential silent failure, and every SDK's happy path violates it (Topic 13).
2. Build the crash-window generator; it is what catches the duplicate-effect bug that costs real money (Topic 10, D-2).
3. Gate every workflow change on the structural suite; it runs in seconds and never flakes.
4. Mutation-test the suite before trusting it — a vacuously-passing property is worse than none.

**Connections.** This topic makes executable every invariant in Chapters 1–13 of this chapter, and it is Chapter 4, Topic 14's conformance discipline one layer up (from provider interfaces to workflow structure). Its behavioral half feeds Chapter 13's evaluation science. The properties it tests are the disciplines that Topic 13 showed no SDK provides — which is why they must be tested in *your* code.

**Chapter close.** Chapter 8 established that orchestration is a cost to be justified, not a capability to be maximized: the autonomy axis and the geometric price of model-directed steps (Topic 1); the composable patterns and their preconditions (Topic 2); routing that constrains deterministically and lets the model choose within (Topic 3); the plan/state architectures and their invariants (Topic 4); delegation's one question — who owns the reply (Topics 5–6) — and the failure-laundering that aggregation invites; typed state as the substrate that makes the disciplines mechanical (Topic 7); gates that suspend rather than block (Topic 8); replanning that classifies failures and proves progress (Topic 9); durable execution and the honest death of exactly-once (Topic 10); termination arguments rather than budgets (Topic 11); the decision procedure for how much to build, with the invisible cost of over-orchestration named (Topic 12); the SDK comparison and the three gaps none of them fill (Topic 13); and — here — the properties that make all of it testable. **Chapter 9 asks the same question one level up: when are multiple *independent* agents justified, and what does coordinating them cost?**

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3 (future harnesses requiring "reproducible traces"; verification-driven tools providing "deterministic feedback"), §3.4.1 (the harness verifying through "deterministic sensors"), §3.4.3 (replay requiring environment reproducibility: "replay the same patch, command, seed, dependency lockfile")
[ADK] Google ADK runtime event loop — the documented **dirty-read window** ("the invocation fails before state-carrying events are processed") — the crash-window hazard the timing generator targets — https://adk.dev/runtime/event-loop/
[WTA] Anthropic, "Writing effective tools for agents" — realistic multi-step evaluation tasks; held-out test sets to avoid overfitting (for the behavioral half) — https://www.anthropic.com/engineering/writing-tools-for-agents
[BEA] Anthropic, "Building effective agents" — "sandboxed testing and guardrails" for agentic systems; measuring performance before adding complexity — https://www.anthropic.com/engineering/building-effective-agents
