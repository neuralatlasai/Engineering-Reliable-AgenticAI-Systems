# Topic 12 — Stop Conditions Based on Verified Task State Rather Than Model Declarations

## 1. Scope, prerequisites, terminology, boundaries, outcomes

This is the single highest-leverage reliability fix in the chapter, and it is almost embarrassingly simple to state: **do not let the model decide when the task is done.** The stop condition — the predicate that ends the run and declares success — must be evaluated against **verified task state** (the ledger of `verified` units, Topics 4–5), not against the model's declaration ("The task is complete"). False completion (Topic 2) is the most dangerous horizon failure precisely because it *ends the run* — no later step catches it — and because it is *fluent and confident*. The remedy is to make "done" a fact your code establishes, not a claim the model emits.

**Prerequisites.** False completion and the "treat done as a claim" rule (Topic 2); verifiable task units, predicates, and the `done`(claimed) vs `verified`(tested) distinction (Topic 4); progress $\mu$ = count of verified units and the durable ledger (Topics 3, 5); the fluent-generator laundering result and code-held final-answer authority O-3 (Chapter 8 Topic 6); termination arguments TE-1..TE-4 and "budget ≠ termination argument" (Chapter 8 Topic 11); [FSC]'s measured premature-stop behavior (Chapter 2).

**Terminology.**
- **Stop condition** — the predicate the harness evaluates to decide the run is finished. Two flavors: **success stop** (task genuinely done) and **halt stop** (give up / escalate).
- **Verified task state** — the durable ledger's record of which units are `verified` (predicate-passed, Topic 4), with evidence (Topic 5). The *only* legitimate basis for a success stop.
- **Model declaration** — the model's textual claim of completion. Evidence of nothing; a claim to be checked, never the stop condition.
- **Acceptance predicate** — the whole-requirement success predicate (Topic 4 coverage): all units verified *and* the integration/acceptance test passes.

**Boundary.** This topic defines *when to stop and on what basis*. It relies on Topic 4 for the unit predicates the stop reads, Topic 5 for the verified ledger, Topic 11 for the escalate/quarantine paths that feed a halt stop, and Topic 14 for the independent verifier that runs predicates the working model cannot self-check. It is the long-horizon specialization of Chapter 8's termination proofs (Topic 11 there).

**Outcome.** You will be able to define a stop condition over verified state, refuse model declarations as a stop basis, distinguish success-stop from halt-stop, and guarantee termination (a run always stops — success, halt, or escalate — never loops or false-completes).

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** Two symmetric failures sit at the end of a run. **False completion (stop too early):** the model declares "done" when the requirement is unmet — measured behavior, including stopping "with 2.43M tokens left" from unverbalized fatigue [FSC §6.4.1.4]. Because the declaration *ends the run*, nothing downstream catches it; the run ships an incomplete result with a confident summary. **Non-termination (stop too late / never):** the run loops, thrashes, or continues past the point of useful progress, burning budget with no convergence. Both stem from the *wrong stop authority*: letting the model's opinion — that it is done, or that it should keep going — drive termination. The model is an unreliable narrator of its own completion.

**Objective.** Make the stop condition a *deterministic function of verified task state*, not of model text. Specifically: (i) success-stop iff the acceptance predicate holds (all units verified + integration test passes), evaluated by code/verifier, never by the model's say-so; (ii) halt-stop when recovery is exhausted / a hard budget backstop is hit / a terminal failure escalates (Topic 11); (iii) guarantee *some* stop always fires (termination), so the run never loops forever and never ships on a false declaration.

**Assumptions.** (a) The requirement is decomposed into verifiable units with predicates (Topic 4) — without this, there is no verified state to stop on, and you are back to trusting the model. (b) The acceptance predicate exists (Topic 4 coverage) — "all units verified" is necessary but a coverage gap means it is not sufficient, so a whole-requirement acceptance test backstops it.

**Constraints.** The stop condition must not read the model's completion claim as evidence (O-3: code holds final-answer authority). A budget cap is a *backstop*, not a termination *argument* (Chapter 8 TE: "budget ≠ argument") — hitting the budget is a halt (incomplete), not a success. Termination must be *guaranteed*: the run stops on success, halt, or escalation in bounded steps.

**Success criteria.** A run stops *successfully* only when verified state satisfies the acceptance predicate; it *never* stops successfully on a model declaration with unmet predicates (false-completion rate → 0); it *always* stops (no infinite loop); and a budget exhaustion is reported as an incomplete halt, not laundered into success.

## 3. Intuition first, then formalization

**Intuition.** Ask the right question. The wrong question is "Model, are you done?" — to which a fatigued, drifted, or fluent model will happily answer "Yes" whether or not it is true (Topic 2; [FSC]). The right question is "Does the verified ledger satisfy the acceptance predicate?" — which *code* answers by reading `verified` unit statuses and running the acceptance test. The model *does the work*; the *predicate decides doneness*. This is exactly Topic 4's `done`(claimed) vs `verified`(tested) distinction, now governing the *run's* termination rather than a unit's.

The analogy is a contractor and a building inspector. The contractor (the model) says "it's finished." The inspector (the harness's acceptance predicate) does not take their word — it checks the punch list (every unit verified) and runs the final inspection (acceptance test). The building is done when the *inspection passes*, not when the contractor *says so*. A contractor who is tired, or who has drifted into building the wrong thing, still says "done" — which is precisely why you have an inspector. Removing the inspector (trusting the model's declaration) is how you ship an unfinished building with a confident sign-off.

The symmetric intuition guards *non-termination*: the run must also stop when it *cannot* finish — recovery exhausted (Topic 11), no progress (TE-3), or a hard backstop reached. Here the danger is the opposite: an agent that never admits it is stuck and loops forever. The stop condition therefore has *two* triggers — the success predicate (verified state satisfies acceptance) and the halt predicate (recovery exhausted / no progress / backstop) — and *at least one always fires*, guaranteeing termination. A run that can neither verify success nor detect a halt condition would loop; the halt triggers exist precisely to prevent that.

The deepest point, connecting to Chapter 8's laundering (Topic 6, O-3): **the model's completion claim and the model's final summary are the same fluent output, and both must be stripped of authority.** The synthesizer that writes "I have completed a thorough analysis of all requirements" is the same mechanism that launders partial failures into a coherent success (Chapter 8 O-2/O-3). Code holds final-answer authority; code reads the verified ledger; the model's prose is a *report*, checked against the ledger, never the ledger itself.

**Formalization.** Let $L$ be the verified ledger (Topic 5), $U$ the unit set (Topic 4), $A$ the acceptance predicate. Define:

$$
\text{Success-stop} \;\equiv\; \Big(\forall u \in U:\ \text{status}_u = \text{verified}\Big) \;\wedge\; A(\text{state}) = \text{pass}.
$$

Crucially, $\text{Success-stop}$ is a function of $L$ and $A$ — *not* of the model's declaration $d$. The model's $d$ appears nowhere in the success condition. (It may *trigger* an evaluation — "the model thinks it's done, so run the acceptance check" — but it is never *evidence* of success.)

$$
\text{Halt-stop} \;\equiv\; \text{recovery-exhausted} \;\vee\; \text{no-progress (TE-3)} \;\vee\; \text{hard-backstop (budget/time)}.
$$

**The termination guarantee [derived].** Define the run's potential $\mu(L)$ = verified units. Each healthy step either increases $\mu$ (progress) or triggers recovery (Topic 11). If $\mu$ reaches $|U|$ and $A$ passes → Success-stop. If $\mu$ stalls (no increase for a bound) → no-progress → Halt-stop (TE-3). If recovery exhausts → Halt-stop. Since $\mu$ is bounded above by $|U|$ and cannot increase forever, and stall/exhaustion are detected in bounded steps, **some stop fires in bounded steps** — termination is guaranteed. This is Chapter 8's termination argument (TE-1..TE-4) instantiated: a decreasing/bounded measure ($|U| - \mu$) plus stall detection, *not* a budget, provides the argument. The budget is only a backstop for when the argument's assumptions are violated.

**Why the budget is not the argument (TE, load-bearing).** Stopping at the budget cap means "we ran out of money," not "the task is done" or "the task is impossible." A run that only stops at the budget has *no termination argument* — it would run forever if the budget were infinite. The real argument is the bounded measure. The budget catches the cases where the measure fails to progress *and* stall detection missed it — a backstop, honestly reported as an incomplete halt.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Acceptance evaluator (code + verifier, not the model).** Reads $L$; checks all-units-verified; runs the acceptance predicate $A$ (integration/end-to-end test, Topic 4). Holds final-answer authority (O-3). The verifier for predicates the working model cannot self-check is Topic 14.
2. **Halt monitor.** Watches recovery-exhaustion (Topic 11), no-progress (TE-3, Topic 10's stall signal at the run level), and the hard backstop (budget/time). Fires Halt-stop.
3. **Declaration interceptor.** When the model says "done," this does *not* stop the run — it *triggers* an acceptance evaluation. If the acceptance predicate fails, the run *continues* (the declaration was false completion), and the model is told which units remain unverified.
4. **Terminator.** Enforces that exactly one stop fires and the run ends cleanly (final checkpoint, Topic 8; escalation packet if halt, Topic 11).

**Interface: the model's "done" is an input to evaluation, never the stop.** This is the pivotal design. A model declaration routes to the acceptance evaluator; the evaluator's result (over verified state) decides. The model can *request* a stop; only verified state can *grant* a success stop.

**Control flow:**

```
each step:
    do work; update verified ledger L (via predicates, Topic 4)
    if model_declares_done:
        if acceptance_passes(L, A):   return SUCCESS_STOP       # verified, not claimed
        else:  tell_model(unverified_units(L)); continue         # false completion caught
    if all_verified(L) and acceptance_passes(L, A):              # code notices, even w/o claim
        return SUCCESS_STOP
    if halt_monitor.fires():                                      # recovery-exhausted / no-progress / backstop
        return HALT_STOP(reason, escalation_packet)              # honest incomplete
    # else continue
```

Note two entry points to success: the model *claims* done (→ verify) *and* the code *independently notices* all units verified (→ stop even if the model never claims). The latter guards the *opposite* of false completion — a model that finished but does not realize it and keeps working (over-running). Both are governed by the same verified-state predicate.

**Data flow.** Verified ledger $L$ (Topic 5) → acceptance evaluator → stop decision. Model declaration → interceptor → trigger evaluation (not stop). Halt signals (Topics 10, 11) + budget → halt monitor. The stop decision is a pure function of durable, verified state + halt signals — the model's prose is nowhere in it.

## 5. Grounding: primary sources and reproducible evidence

**Verified completion, not self-report — the core grounding.** [LRH] grounds this directly and forcefully: without prompting, agents "would fail to recognize that the feature didn't work end-to-end," and providing testing tools "dramatically improved performance." The feature registry tracks *pass/fail per feature* (Topic 4) — the run's completion is "all features pass," a verified-state condition, *not* the agent's declaration. The "unacceptable to remove or edit tests" rule protects the stop condition from the agent making "done" cheaper. The premature-completion failure mode is named explicitly in [LRH]'s table ("Premature project completion" → mitigated by "Feature list with pass/fail tracking").

**Hard-threshold acceptance.** [HDA] grounds the acceptance predicate: the evaluator applied "hard thresholds for each criterion; if any one fell below it, the sprint failed" — a deterministic pass/fail gate, and it "exercises running applications directly rather than scoring static artifacts" (the acceptance test runs the real thing). The evaluator, *separate from the generator*, is what decides done — not the generator's self-assessment. [HDA]'s whole finding that "agents tend to confidently prais[e] the work — even when obviously mediocre" is the empirical case *for* not trusting model declarations.

**False completion is measured.** [FSC §6.4.1.4] (Chapter 2): the model stopped "with 2.43M tokens left" from "unverbalized fatigue" — false completion, measured, with budget to spare. This is the grounded evidence that model declarations of doneness are unreliable and that a budget is not the binding constraint (the model stopped *before* the budget, wrongly).

**Code-held final-answer authority.** Chapter 8 Topic 6 (O-2/O-3) grounds that the synthesizer launders partial failures into a fluent complete answer, and that *code* must hold final-answer authority. This topic applies O-3 to termination: code, reading verified state, decides done — the model's fluent "complete" is exactly the laundering O-3 guards against.

**Budget ≠ termination argument.** Chapter 8 Topic 11 (TE) grounds that a budget is a backstop, not a termination argument, and that livelock is detected by a non-progressing measure, not by exhausting the budget.

**Reproducible evidence.** The value is directly measurable: false-completion rate with verified-state stop vs model-declaration stop (E1). [LRH]'s premature-completion mitigation is reproducible (toggle the pass/fail gate). The termination guarantee is testable (E3). Sources ground the mechanism (pass/fail gates, separate evaluator, measured false completion); the false-completion-rate delta is the experiment.

## 6. Implementation: the verified-state stop and the declaration interceptor

**The stop condition (a pure function of verified state):**

```python
def success_stop(ledger, acceptance_predicate):
    all_verified = all(ledger.status(u) == "verified" for u in ledger.units
                       if ledger.status(u) != "quarantined")   # Topic 11: quarantined surfaced separately
    if not all_verified:
        return False
    return acceptance_predicate.run() == "pass"    # whole-requirement test, exercises the real system
    # NOTE: nowhere does this read the model's "done" claim.
```

**The declaration interceptor (model "done" → verify, not stop):**

```python
def on_model_declares_done(ledger, acceptance_predicate, model):
    if success_stop(ledger, acceptance_predicate):
        return "SUCCESS"                            # claim happened to be true; verified
    unmet = [u for u in ledger.units if ledger.status(u) != "verified"]
    quarantined = [u for u in ledger.units if ledger.status(u) == "quarantined"]
    model.inform(f"Not done. Unverified: {unmet}. Quarantined (need resolution): {quarantined}.")
    return "CONTINUE"                               # false completion caught; run continues
```

This is the mechanism that reduces false-completion to near zero: the model *cannot* end the run by claiming done; it can only trigger a check that, if it fails, hands back the specific unmet units. The model's fatigue/drift/fluency is neutralized because the *predicate*, not the claim, holds the authority.

**The halt monitor (guarantees termination + honest incompletes):**

```python
def halt_stop(run):
    if run.recovery_exhausted():   return ("HALT", "recovery_exhausted", run.escalation_packet())  # Topic 11
    if run.no_progress(TE3_bound): return ("HALT", "no_progress", run.escalation_packet())          # TE-3
    if run.tokens >= HARD_BUDGET:  return ("HALT", "budget_backstop_INCOMPLETE", run.state())        # NOT success
    return None
```

The budget branch is explicitly labeled `INCOMPLETE` — hitting the budget is never laundered into success. A halt carries an escalation packet (Topic 11): the verified state, the unmet units, the reason — a human resolves or accepts it.

**Quarantine interaction (Topic 11).** A run with quarantined units cannot claim unqualified success — the quarantined units are surfaced as "resolved-by-deferral, needs human sign-off." Success-stop over *non-quarantined* units + explicit quarantine disclosure is the honest terminal state; it does not silently count quarantined work as done.

## 7. Trade-offs

- **Verified-state stop vs model-declaration stop.** Verified-state is dramatically more reliable (false completion → 0) but *requires* the Topic 4 decomposition + predicates + Topic 14 verifier — real upfront cost. Model-declaration is free and *worthless* as a stop (Topic 2, [FSC]). There is no real trade here for any run where correctness matters: the cost of building predicates is the price of a trustworthy stop, and a run without a trustworthy stop cannot be trusted to be done at all.
- **Acceptance-test cost vs confidence.** Running a full acceptance predicate (integration/end-to-end test, [HDA]'s running-app evaluator) at each candidate-done point costs tokens/time. Cheaper proxies (all-units-verified without an integration test) risk coverage gaps (Topic 4/9 — units pass but the whole requirement is unmet). The trade: pay for a real acceptance test to catch coverage gaps, or accept residual gap risk. For anything shipped, pay.
- **Strict success vs quarantine-tolerant success.** Requiring *all* units verified is strictest but may block a "good enough" stop when one non-critical unit is stuck. Quarantine-tolerant success (all critical units verified, non-critical quarantined + disclosed) is more flexible but risks calling incomplete work done. Resolution: quarantine is *disclosed*, not hidden — a quarantine-tolerant stop is an *honest partial success requiring sign-off*, never a silent full success.
- **Halt sensitivity vs premature giving-up.** Aggressive halt (short no-progress bound) stops stuck runs fast but may abandon a run that would have progressed. Lenient halt wastes budget on truly-stuck runs. Resolution: the no-progress bound is set above the longest legitimate no-verified-progress stretch (a hard unit); the budget backstop catches the rest. Halt is honest incompleteness, so erring toward halting + escalating is safer than looping.

## 8. Experiments: baselines, ablations, metrics

**E1 — Verified-state stop vs model-declaration stop (the headline).** Run long tasks; stop condition (a) = model declares done, (b) = acceptance predicate over verified state. Measure false-completion rate (stopped ∧ requirement unmet) at large $K$. **Prediction:** (a) high false completion ([FSC], [HDA] "confidently praise mediocre work"); (b) near zero (predicate gates it). This is the experiment that quantifies the chapter's highest-leverage fix. Metric: false-completion rate; Wilson intervals [WILSON].
**E2 — Declaration-interceptor ablation.** With verified-state stop, compare: model "done" *ends* the run vs model "done" *triggers a check that can continue*. **Prediction:** the interceptor recovers runs the model wrongly declared done (turns false completions into continued, eventually-verified runs). Metric: fraction of "done" declarations that were premature (acceptance failed) — a direct measure of how often the model lies about doneness.
**E3 — Termination guarantee.** Run pathological cases (impossible requirement, livelock, budget-bound); verify a stop *always* fires and budget-exhaustion is reported INCOMPLETE, never SUCCESS. **Prediction:** every run terminates (success/halt/escalate); no infinite loops; no budget→success laundering. Metric: non-termination rate (must be zero); budget-as-success rate (must be zero).
**E4 — Coverage-gap catch.** Construct a decomposition with a deliberate coverage gap (all units verified, requirement unmet); run with all-units-verified stop vs +acceptance test. **Prediction:** all-units-only stops falsely; +acceptance catches the gap. Metric: gap-caught rate.

**Honest status.** [LRH] grounds the pass/fail-gate stop and names premature completion as a mitigated failure *qualitatively* ("dramatically improved performance," no rate). [HDA] grounds hard-threshold acceptance and the confidently-praising-mediocre-work observation. [FSC] gives *point* evidence of false completion (2.43M tokens left). **No source publishes the E1 false-completion-rate delta** — the number that would quantify the fix. The mechanism (verified-state stop) is firmly grounded; its measured effect is the experiment. This is the honest state, and it is a strong one: the fix is grounded and cheap; only its magnitude is unmeasured.

## 9. Failure modes, edge cases, hazards, limitations

- **Trusting the declaration (the failure this whole topic prevents).** Stopping on "The task is complete." Result: false completion ships. Mitigation: verified-state stop; the declaration only triggers a check. This is the cardinal fix.
- **Coverage gap (verified but incomplete).** All units pass but the requirement is unmet (Topic 4/9). The all-units-verified stop fires falsely. Mitigation: a whole-requirement acceptance predicate that exercises the real system ([HDA]) backstops unit verification.
- **Predicate erosion inflates verified state.** The model weakened predicates (Topic 4) so units "verify" cheaply → the stop fires on hollow verification. Mitigation: predicate immutability (Topic 4 hook); the verified state is only as trustworthy as the predicates behind it — protect them.
- **Self-verification (the verifier is the worker).** If the "acceptance predicate" is the working model judging its own output, false completion returns via the back door ([HDA]: self-praise). Mitigation: independent verifier (Topic 14); deterministic predicates where possible.
- **Budget laundered into success.** Reporting a budget-exhausted run as "done." Mitigation: budget branch is explicitly INCOMPLETE; success requires the acceptance predicate, never budget exhaustion (TE).
- **Never stopping (non-termination).** No halt trigger fires and success is unreachable → infinite loop. Mitigation: the termination guarantee — bounded measure ($|U|-\mu$) + stall detection (TE-3) + budget backstop ensures *some* stop fires. A run that can neither verify nor detect a halt is a design bug in the halt monitor.
- **Over-running (finished but not stopping).** The model keeps working after all units are verified because it never "declares" done. Mitigation: code independently notices all-verified + acceptance-pass and stops, regardless of the model's silence.
- **Limitation.** The verified-state stop is only as good as the *predicates* (Topic 4) and the *acceptance test's coverage*. A perfectly-evaluated stop over a bad decomposition (missing requirements) still ships a gap — the stop faithfully certifies "all *specified* units done," which is not "requirement met" if the specification was incomplete. This pushes the reliability burden onto the decomposition (Topic 4) and coverage (Topic 9). The stop condition cannot verify what the decomposition never specified.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Completion certified by *tests passing* (verified state), not self-report, "dramatically improved performance"; premature completion is a named, mitigated failure [LRH].
- A *separate* evaluator with *hard thresholds* deciding done — because agents "confidently praise mediocre work" — is grounded [HDA].
- False completion is measured: stopping with 2.43M tokens left from unverbalized fatigue [FSC].
- Code must hold final-answer authority; the fluent "complete" is the laundering mechanism (Chapter 8 O-3). Budget ≠ termination argument (Chapter 8 TE).

**Decision rules.**
- **DR-1.** The success stop is a function of *verified task state* (all units verified + acceptance predicate passes), never of the model's declaration. Code holds the authority (O-3).
- **DR-2.** A model "done" *triggers a verification*, not a stop. If verification fails, continue and return the specific unmet units. This alone drives false completion toward zero.
- **DR-3.** Back unit-verification with a whole-requirement acceptance test that exercises the real system — to catch coverage gaps. Protect predicates from erosion (Topic 4).
- **DR-4.** Guarantee termination: bounded measure ($|U|-\mu$) + no-progress detection (TE-3) + budget *backstop*. Report budget-exhaustion as INCOMPLETE, never success. Use an *independent* verifier, never self-verification (Topic 14).

**Production implications.** This is the fix that most cheaply separates a demo from a trustworthy system. A long-running agent that stops on its own say-so will, at scale, ship confidently-summarized incomplete work — and because the summary is fluent, humans reviewing it may not notice (Chapter 8 laundering; [HDA] mediocre-work-praised). Replacing the model's "done" with a verified-state acceptance predicate is a small amount of code (read the ledger, run the acceptance test) that eliminates the most dangerous horizon failure. If a team does *one* thing from this chapter, it should be this: **never let the model decide it is done.** Everything else (checkpointing, compaction, recovery) makes the run *survive*; this makes the run's *end* trustworthy.

**Connections.** This is the run-level application of Topic 4's `done`(claimed) vs `verified`(tested) and Topic 2's "treat done as a claim." It reads Topic 5's verified ledger. It applies Chapter 8's O-3 (code-held authority), the laundering result (Topic 6 there), and TE (termination arguments, budget ≠ argument). The independent verifier it requires is Topic 14. Halt-stops feed from Topic 11 (recovery exhausted) and Topic 10 (no-progress/stall). A false-completion caught here is a run that *did not* fail (Topic 15's survival); the stop's correctness is what makes the survival metric meaningful.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (completion = tests pass, not self-report; "would fail to recognize the feature didn't work end-to-end"; "dramatically improved performance"; premature-completion named + mitigated by pass/fail tracking; "unacceptable to remove or edit tests").
- **[HDA]** Anthropic — *Harness design for long-running apps* (separate evaluator with hard thresholds; "exercises running applications directly"; agents "confidently praise the work even when obviously mediocre").
- **[FSC]** Fable5/Mythos5 system card — premature stop with 2.43M tokens left, unverbalized fatigue (§6.4.1.4). Via Chapter 2.
- Internal: Chapter 8 Topic 6 (O-2/O-3 code-held final-answer authority, laundering) + Topic 11 (termination arguments TE-1..TE-4, budget ≠ argument, TE-3 no-progress), this chapter Topics 2 (false completion, treat-done-as-claim), 3 ($\mu$), 4 (units, predicates, done-vs-verified, coverage), 5 (verified ledger), 10 (no-progress/stall), 11 (recovery-exhausted/escalate/quarantine), 14 (independent verifier), 15 (survival).
