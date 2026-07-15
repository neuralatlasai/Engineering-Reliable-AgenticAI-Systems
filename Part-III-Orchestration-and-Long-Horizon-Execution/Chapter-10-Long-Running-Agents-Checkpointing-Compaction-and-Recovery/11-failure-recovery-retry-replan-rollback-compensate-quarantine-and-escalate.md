# Topic 11 — Failure Recovery: Retry, Replan, Rollback, Compensate, Quarantine, and Escalate

## 1. Scope, prerequisites, terminology, boundaries, outcomes

Topics 8–10 got a failed run *back to a running state*: a checkpoint to resume from (8), restart-safe actions (9), and a fresh worker holding the lease (10). This topic answers the next question: **once resumed, what recovery action does the agent take?** A failure is not one thing, and neither is its remedy. This topic gives the six-way recovery taxonomy — **retry, replan, rollback, compensate, quarantine, escalate** — and, more importantly, the *classifier* that maps a failure to the correct action. Choosing the wrong recovery (retrying a refuted plan, rolling back an irreversible effect) is itself a failure mode.

**Prerequisites.** The three failure classes for replanning — transient/refutation/terminal — and RP-1 ("replan on refutation, not error"), RP-3 (novelty check: a replan equal to the failed plan ⇒ escalate) from Chapter 8 Topic 9; compensation and "exactly-once is an illusion" from Chapter 8 Topic 10; effect classes and reversibility (Chapter 5); restart-safe resume (Topic 9); the recovery-loading path (Topics 8, 10); horizon failures (Topic 2).

**Terminology (the six recovery actions).**
- **Retry** — re-attempt the same action, expecting a *transient* cause to have cleared (network blip, rate limit, timeout). Requires restart-safety (Topic 9).
- **Replan** — discard the current plan and generate a new one, because the plan was *refuted* by evidence (an assumption proved false). Chapter 8 Topic 9.
- **Rollback** — restore a prior known-good state (checkpoint/artifact version), undoing *reversible* work since then. Requires reversibility (Chapter 5 $W_{\text{rev}}$).
- **Compensate** — for *irreversible* work that cannot be rolled back, perform a *compensating action* that offsets its effect (refund a charge, send a correction). Chapter 8 Topic 10 / saga pattern.
- **Quarantine** — isolate a failing unit/component so the rest of the run proceeds, deferring the failure rather than letting it block or corrupt everything.
- **Escalate** — hand the failure to a human (or a higher authority), because it is *terminal* for the agent: unrecoverable automatically, ambiguous, or repeating.

**Boundary.** This topic *classifies failures and selects recovery*. It relies on Topic 9 for retry's correctness, Topic 8/6 for rollback's checkpoints/versions, Chapter 8 for replan's discipline and compensation's mechanics, and Topic 12 for the *stop* decision (escalate/quarantine feed it). It is not the detection of failure (Topics 2, 10) but the response to it.

**Outcome.** You will be able to classify a failure by cause and reversibility, select the correct recovery action, avoid the classic mis-selections, and know when recovery must yield to escalation.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** "The agent failed" is not actionable. A rate-limit timeout, a wrong assumption, a corrupted file, a sent-but-wrong email, a poisoned tool result, and an impossible requirement are *all* "failures," and each demands a *different* response. Retrying a wrong assumption loops forever (it will fail identically). Rolling back an irreversible effect is impossible (the email is sent). Escalating a transient blip wastes a human. The problem is that recovery is only as good as the *classification* that precedes it, and agents (and naive harnesses) tend to apply one hammer — usually retry — to every failure.

**Objective.** Build a *classifier* that maps each failure to (a) its *cause class* (transient / refuted-assumption / corrupted-state / bad-irreversible-effect / isolable-defect / terminal) and (b) the reversibility of the work involved, and from those selects the correct recovery action. Ensure the selection respects hard constraints (never rollback an irreversible effect; never blind-retry an irreversible effect — Topic 9; never retry a refuted plan — Chapter 8).

**Assumptions.** (a) The failure is *observable and classifiable* — the harness has enough signal (error type, predicate result, evidence) to classify. Where it cannot classify, the safe default is escalate. (b) The durable state (Topics 5–6) supports rollback (versioned) and the effect journal (Topic 8) supports compensation (knows what irreversible effects happened).

**Constraints.** Recovery must respect: reversibility (rollback only $W_{\text{rev}}$; compensate $W_{\text{irr}}$); restart-safety (retry only restart-safe actions); the novelty rule (a replan identical to the failed plan ⇒ escalate, RP-3); and progress (a recovery that does not change the situation ⇒ escalate, not loop — Chapter 8 TE-3).

**Success criteria.** Each failure gets the recovery that *can actually work*: transients retried (and succeeding), refutations replanned (with a genuinely different plan), corruptions rolled back to good state, bad irreversible effects compensated, isolable defects quarantined so the run proceeds, and truly-stuck failures escalated rather than looped. No irreversible effect is "rolled back"; no refuted plan is retried; no transient wastes a human.

## 3. Intuition first, then formalization

**Intuition.** The six actions form a rough ladder of *cost and finality*, and you want the cheapest one that can actually fix the failure:

- **Retry** is cheapest and works only for *transient* causes — the action would succeed if simply repeated (the API was briefly down). If the cause is not transient, retry loops. So: retry iff the cause is transient *and* the action is restart-safe.
- **Replan** is the fix when the *plan* was wrong — an assumption it rested on proved false (Chapter 8 RP-1: "replan on refutation, not error"). Retrying a refuted plan is the classic error: it fails identically because the world, not the execution, invalidated it. So: replan iff an assumption was refuted — and the new plan must be *genuinely different* (RP-3), else escalate.
- **Rollback** fixes *corrupted or bad reversible state*: return to the last known-good checkpoint/version (Topic 8, 6) and proceed. It works only because the work was reversible ([LRH]'s "revert bad changes, recover working base states"). You cannot roll back what cannot be undone.
- **Compensate** is rollback's counterpart for the *irreversible*: you cannot un-send the email, but you can send a correction; you cannot un-charge the card, but you can refund. Compensation *offsets* rather than *undoes* (Chapter 8's saga). It is more expensive and less clean than rollback (the world saw the original effect), so you prefer designing effects to be reversible (Topic 9) precisely to avoid needing compensation.
- **Quarantine** is for a *localized, isolable* defect: one task unit is broken in a way that need not block the rest. Mark it failed, isolate it, and let the run proceed on the other units — deferring the broken one rather than halting everything. This preserves progress on the recoverable majority.
- **Escalate** is the terminal action: the failure is unrecoverable automatically (impossible requirement, ambiguous state, missing authority), *or* recovery has been tried and did not change the situation (a replan that equals the failed plan; a retry that keeps failing; repeated takeovers, Topic 10). Escalation is not defeat — it is the correct action when automation cannot help, and *failing to escalate* (looping instead) is the real failure.

The deepest intuition: **the classification is the hard part; the actions are mechanical.** Once you know "transient" or "refuted" or "irreversible-and-wrong," the action follows. The failures happen when the harness *skips classification* and defaults to retry — which fixes only the transient case and loops on everything else. This is Chapter 8 RP-1 generalized: match the recovery to the *cause*, not to the *symptom*.

**Formalization.** Let a failure $f$ have cause class $\text{cause}(f) \in \{\text{transient}, \text{refutation}, \text{corruption}, \text{bad-irreversible}, \text{isolable}, \text{terminal}\}$ and let $\text{rev}(f)$ indicate whether the affected work is reversible. The recovery selector $\rho$:

$$
\rho(f) = \begin{cases}
\text{retry} & \text{transient} \wedge \text{restart-safe} \\
\text{replan} & \text{refutation} \wedge \text{new-plan} \ne \text{failed-plan} \quad (\text{else escalate, RP-3}) \\
\text{rollback} & \text{corruption} \wedge \text{rev}(f) \\
\text{compensate} & \text{bad-irreversible} \wedge \neg\text{rev}(f) \\
\text{quarantine} & \text{isolable} \wedge \text{rest-of-run-independent} \\
\text{escalate} & \text{terminal} \vee \text{unclassifiable} \vee \text{recovery-exhausted}
\end{cases}
$$

**The progress guard (TE-3, load-bearing).** Every recovery action must *change the situation*. A retry that reproduces the identical failure, a replan that yields the identical plan, a rollback to a state that re-fails identically — these do not recover; they loop. Formally: if a recovery action leaves the relevant state unchanged (same failure reproducible), escalate. This is Chapter 8's "μ not decreasing ⇒ terminate" applied to recovery: **recovery that does not progress is escalation in disguise; make the escalation explicit rather than looping.**

**Bounded retry with backoff.** Retry is not unbounded: transient causes clear within a bound, so retry $\le N$ times with exponential backoff, then reclassify (persistent "transient" is actually terminal or refutation). An unbounded retry loop is the most common recovery anti-pattern.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Failure classifier.** Maps the failure signal (error type, predicate result, evidence, retry history) to $\text{cause}(f)$ and $\text{rev}(f)$. The hard, high-leverage component. Uses deterministic signals where possible (error codes, effect-class metadata) and the model only for genuinely semantic classification (was an *assumption* refuted?).
2. **Recovery selector.** Applies $\rho$ to choose the action, enforcing the constraints (no rollback of irreversible; novelty check; progress guard).
3. **Recovery executors.** One per action: retry (Topic 9 restart-safe re-attempt with backoff), replan (Chapter 8 replanner), rollback (Topic 8 checkpoint / Topic 6 version restore), compensate (Chapter 8 saga / compensating action registry), quarantine (mark unit failed + isolate), escalate (Topic 12 / HITL).
4. **Recovery journal.** Records each failure, its classification, the recovery taken, and its outcome — so repeated failures are detected (progress guard) and recovery itself is auditable.

**Interface: recovery is a first-class step in the loop.** After any step that fails a predicate or throws, the loop routes through classify → select → execute-recovery before continuing. The recovery journal makes recovery attempts durable (a recovery that itself crashes is resumable, Topic 9).

**Control flow:**

```
on failure f:
    cause, rev = classify(f, history)
    log(f, cause, rev)                                  # recovery journal
    if recovery_exhausted(f, history):  return escalate(f)   # progress guard / TE-3
    action = select(cause, rev)                          # rho
    match action:
        retry:      if restart_safe(f.action): backoff(); reattempt(f.action)   # Topic 9
                    else: escalate(f)
        replan:     new = replan(...);  if new == failed_plan: escalate(f)       # RP-3
        rollback:   assert rev;  restore(last_good_checkpoint_or_version)         # Topic 8/6
        compensate: assert not rev; run_compensation(f.effect)                    # Ch.8 saga
        quarantine: mark_failed(f.unit); isolate(f.unit); continue_other_units
        escalate:   handoff_to_human(f, context)                                  # Topic 12
```

**Data flow.** The failure signal + effect-class metadata (Chapter 5) + retry history (recovery journal) feed the classifier; the durable checkpoints/versions (Topics 8, 6) feed rollback; the effect journal (Topic 8) feeds compensation (it knows what irreversible effects occurred). Escalation carries the full context (Topic 5 records) to the human.

**Relation to Chapter 8.** Chapter 8 Topic 9 gave replanning (the transient/refutation/terminal classes, RP-1/RP-3) and Topic 10 gave compensation and durable retry. This topic *unifies* them into a single recovery taxonomy and adds rollback (state), quarantine (isolation), and escalate (terminal) — the full set a *long* run needs, where any of the six can be the right call.

## 5. Grounding: primary sources and reproducible evidence

**Rollback / recover working state.** [LRH] grounds rollback directly: git checkpointing "enable[s] reverting bad changes and recovering working base states." A `git revert`/`checkout` to a known-good commit *is* rollback of reversible work — the [LRH] mechanism. This is the most concretely grounded of the six actions.

**Retry / resume-from-error.** [LRH]'s health-check-at-start and incremental retry across sessions, and [MAR]'s "resume-from-error," ground the retry/resume path — a fresh session re-attempting after a failure (Topic 9 makes it safe). [HDA]'s evaluator→generator feedback loop (evaluator finds a failure, generator fixes it next round) is a *replan/retry* cycle grounded in a shipped harness.

**Replan on refutation.** Chapter 8 Topic 9 grounds the replanning discipline (RP-1: replan on refutation not error; three classes transient/refutation/terminal; RP-3: novelty check). [HDA]'s iterative generator-evaluator rounds ("scores improved over iterations before plateauing") are replanning cycles: the evaluator's feedback refutes the current implementation's adequacy, the generator replans. That the scores *plateau with headroom remaining* grounds the escalation case — at some point replanning stops helping and a human is needed.

**Compensation.** Chapter 8 Topic 10 grounds compensation and the saga pattern ("exactly-once is an illusion"; compensating actions for irreversible effects). The agent sources ([LRH]/[HDA], code/app domains) have *few* irreversible effects (git is reversible), so they under-exercise compensation — its grounding is Chapter 8 and standard saga practice, a **[synthesis]** for the agent case.

**Quarantine and escalate.** Quarantine (isolate a failing unit, proceed on others) is grounded in the verifiable-unit independence (Topic 4): units with satisfied deps can proceed while a failed unit is deferred. Escalate is grounded in Chapter 8's terminal class and HITL (Topic 8 there), and [HDA]'s "plateau with headroom" — the recognition that some quality is beyond the current automated loop.

**Reproducible evidence.** The classifier's value is testable: compare recovery-with-classification vs retry-everything, measuring loop rate and recovery success (E1). Rollback correctness is testable (E2). The novelty guard is testable (E3). Sources ground the individual actions; the *unified classifier* is a **[synthesis]** the sources do not present as one taxonomy.

## 6. Implementation: the classifier and the six executors

**Failure classifier (the high-leverage component):**

```python
def classify(f, history):
    # Deterministic signals first (cheap, reliable).
    if f.error_type in (RateLimit, Timeout, TransientNetwork):
        return ("transient", None)
    if f.type == "predicate_fail" and assumption_refuted(f):     # world != plan's assumption
        return ("refutation", None)
    if f.type == "state_corruption":
        return ("corruption", is_reversible(f.affected))
    if f.type == "bad_effect" and f.effect.chi == "W_irr":       # sent-but-wrong
        return ("bad-irreversible", False)
    if f.unit and independent_of_rest(f.unit):
        return ("isolable", None)
    # Recovery-exhausted or unclassifiable -> terminal.
    if repeated(f, history) or unclassifiable(f):
        return ("terminal", None)
    return ("terminal", None)   # safe default: escalate rather than guess
```

Note the *safe default*: unclassifiable → terminal → escalate. Guessing a recovery for an unclassified failure risks the mis-selections (§9); escalating is the conservative correct move.

**The progress guard (prevents recovery loops):**

```python
def recovery_exhausted(f, history):
    prior = history.recoveries_for(f.signature)
    if len(prior) >= MAX_RECOVERY_ATTEMPTS:  return True        # bounded
    if prior and prior[-1].left_state_unchanged():  return True # TE-3: no progress -> stop
    return False
```

**Executors (each enforces its precondition):**

```python
def do_rollback(f, store):
    assert is_reversible(f.affected), "cannot rollback irreversible work"   # hard constraint
    good = store.last_good_checkpoint(f.affected)
    store.restore(good)                       # Topic 8 checkpoint / Topic 6 artifact version

def do_compensate(f, saga):
    assert f.effect.chi == "W_irr"
    comp = saga.compensating_action(f.effect)  # e.g., refund for charge, correction for email
    comp.execute()                             # offsets; does not undo (Ch.8)

def do_quarantine(f, ledger):
    ledger.mark(f.unit, "quarantined")         # excluded from mu; run proceeds on others
    ledger.record_deferred(f.unit, reason=f)   # surfaced at stop (Topic 12) for human review

def do_retry(f):
    assert restart_safe(f.action)              # Topic 9
    backoff()
    return reattempt(f.action)                 # bounded N; then reclassify
```

**Escalation carries context.** `escalate(f)` hands the human the failure, its classification, the recovery attempts, and the durable-record context (Topic 5) — not a bare "it failed." A good escalation is resumable: the human resolves it and the run continues (Topic 12's deferred approval / HITL).

## 7. Trade-offs

- **Classification effort vs mis-recovery.** A rich classifier (deterministic signals + semantic refutation detection) costs engineering and some model calls but prevents the expensive mis-selections (retry loops, impossible rollbacks). A trivial "always retry" classifier is cheap and *fixes only transients*, looping on everything else. The trade strongly favors classification — the loops it prevents are unbounded cost.
- **Automatic recovery vs escalation latency.** Automatic recovery maximizes autonomy and throughput but risks compounding a mis-classified failure. Early escalation is safe but spends human time and adds latency. Resolution: automate the *confidently-classified, cheap, reversible* recoveries (transient retry, reversible rollback); escalate the *ambiguous, irreversible, or repeating* ones. The progress guard bounds how long automation tries before escalating.
- **Rollback vs compensate (design choice upstream).** Rollback is clean (state returns to good) but requires reversibility; compensation is messy (the world saw the effect) but handles the irreversible. This trade is largely *decided upstream* (Topic 9: design effects to be reversible — staging/outbox — so you can rollback instead of compensate). Prefer building reversibility so recovery is rollback, not compensation.
- **Quarantine vs halt.** Quarantine preserves progress on the recoverable majority but risks proceeding on a foundation that the quarantined unit was supposed to provide (a dependent unit inherits the gap). Halt is safe but throws away recoverable work. Resolution: quarantine only *independent* units (Topic 4 deps); a failed unit that others depend on cannot be quarantined — it blocks or escalates.
- **Bounded vs unbounded retry.** Bounded retry (N + backoff, then reclassify) prevents loops but may give up on a transient that would have cleared with one more try. Unbounded retry never gives up but loops forever on non-transients. Bounded is correct: a "transient" that persists past N is not transient — reclassify it.

## 8. Experiments: baselines, ablations, metrics

**E1 — Classifier vs retry-everything (the headline).** Inject a mix of failures (transient, refutation, corruption, bad-irreversible, isolable, terminal); compare recovery-with-classification vs always-retry. **Prediction:** always-retry fixes transients and *loops or fails* on the rest (high loop rate, low recovery success); classification recovers each class appropriately. Metric: per-class recovery success, loop rate, human-escalation appropriateness (transients not escalated, terminals escalated).
**E2 — Rollback correctness.** Corrupt reversible state; roll back to last-good checkpoint/version. **Prediction:** exact restoration (Topic 8/6). Also test the *forbidden* case: attempt rollback of an irreversible effect → the assertion fires, routes to compensate. Metric: restoration correctness; mis-rollback-of-irreversible rate (must be zero).
**E3 — Novelty guard (RP-3).** Induce a refutation where the replanner would regenerate the same plan; verify escalation instead of loop. **Prediction:** with the guard, escalate after the first identical replan; without it, infinite replan loop. Metric: replan-loop rate.
**E4 — Progress guard.** Induce a retry that keeps reproducing the identical failure; verify bounded retry → reclassify → escalate. **Prediction:** bounded; without the guard, unbounded loop. Metric: max recovery attempts before escalation.

**Honest status.** [LRH] grounds rollback (git revert) and [HDA] grounds the replan/retry loop (evaluator→generator, scores plateauing) *qualitatively*. Chapter 8 grounds replanning discipline and compensation. **The unified six-way classifier is a [synthesis]** — the sources present individual recovery mechanisms, not one taxonomy with a selector; and no source publishes recovery-success-by-class or loop-rate numbers. The mechanisms are grounded; the classifier and its measured value are the author's construction. State this.

## 9. Failure modes, edge cases, hazards, limitations

- **Retry-everything (the dominant anti-pattern).** Defaulting to retry for all failures: fixes transients, loops on refutations/corruptions, and *repeats bad irreversible effects* (retry a wrong email = two wrong emails). Mitigation: classify first; retry only transient + restart-safe.
- **Rollback of the irreversible (impossible recovery).** Attempting to "undo" a sent email / charge / deploy — the rollback silently does nothing useful or corrupts (a git revert does not un-send the email the code sent). Mitigation: the reversibility assertion in `do_rollback`; irreversible failures route to compensate.
- **Replan loop (no novelty).** Replanning produces the same refuted plan repeatedly. Mitigation: RP-3 novelty guard → escalate.
- **Recovery loop (no progress).** Any recovery that leaves the situation unchanged, repeated. Mitigation: progress guard (TE-3) + bounded attempts → escalate. This is the meta-failure: *recovery itself must progress.*
- **Quarantining a depended-on unit.** Isolating a failed unit that others need, so dependents silently build on a gap. Mitigation: quarantine only independent units; a depended-on failure blocks or escalates.
- **Compensation that itself fails or is incomplete.** The refund fails; the correction email bounces. Compensation is itself an action that can fail (recurse into recovery) and may not fully offset (the customer already saw the wrong charge). Mitigation: treat compensation as a first-class action with its own recovery; accept that compensation *offsets*, not *erases* — some irreversible effects have residual cost that only escalation/human-handling addresses.
- **Mis-classification cascade.** A wrongly-classified failure gets the wrong recovery, which fails, generating a new failure. Mitigation: safe default (unclassifiable → escalate); the recovery journal detects the cascade (repeated related failures) and escalates.
- **Limitation.** Classification is imperfect — especially "was an assumption *refuted* (replan) vs was execution *wrong* (retry/rollback)," which is genuinely semantic and where the model itself judges (and can be wrong). The safe defaults (unclassifiable → escalate; bounded everything) contain the damage but do not eliminate mis-classification. The taxonomy is a **[synthesis]** organizing the grounded individual mechanisms; real failures can span classes (a corruption *caused by* a refuted plan needs both rollback and replan).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Rollback via versioned checkpoints ("revert bad changes, recover working base states") is grounded and works [LRH].
- The replan/retry feedback loop (evaluator refutes → generator replans) is grounded, and its *scores plateau with headroom* — grounding the escalation boundary [HDA].
- Replan-on-refutation, the novelty guard (RP-3), and compensation for irreversible effects are grounded (Chapter 8).
- Resume-from-error (retry across sessions) is a real capability [MAR].

**Decision rules.**
- **DR-1.** Classify before recovering. Match the recovery to the *cause* (transient/refutation/corruption/bad-irreversible/isolable/terminal), never default to retry.
- **DR-2.** Retry only transient + restart-safe failures, bounded with backoff. A "transient" that persists past N is not transient — reclassify.
- **DR-3.** Rollback only reversible work; compensate the irreversible (and prefer designing effects reversible so you can rollback instead, Topic 9). Never "rollback" a sent effect.
- **DR-4.** Replan only on refutation, and only if the new plan differs (RP-3); a replan equal to the failed plan ⇒ escalate.
- **DR-5.** Every recovery must change the situation; recovery that does not progress ⇒ escalate (TE-3). Quarantine only independent units. Unclassifiable ⇒ escalate (safe default). Escalation carries full context and is resumable.

**Production implications.** Recovery is where a long-running agent either self-heals or silently burns budget in a loop. The single highest-leverage move is *replacing "retry" as the universal default with a real classifier* — because in a long run, most failures are *not* transient (they are refuted assumptions, corrupted state, or terminal impossibilities), and retrying those is pure waste at best and repeated-bad-effects at worst. The second is the *progress guard*: an agent that escalates a genuinely stuck failure after bounded attempts is behaving correctly; one that loops "recovering" forever is the failure. Teams that build the classifier + progress guard + reversibility-by-design get agents that recover the recoverable and cleanly escalate the rest; teams that retry-everything get agents that loop.

**Connections.** This topic unifies Chapter 8 Topic 9 (replanning classes, RP-1/RP-3) and Topic 10 (compensation, durable retry) into one taxonomy, adding rollback (Topics 8/6), quarantine (Topic 4 unit independence), and escalate (Topic 12). Retry's correctness is Topic 9 (restart-safe). Rollback's substrate is Topic 8 (checkpoints) + Topic 6 (versions). The progress guard is Chapter 8 TE-3. Escalation and quarantine feed the stop decision (Topic 12). Failures being recovered were detected by Topics 2 (horizon) and 10 (stall). Whether the run is *done* despite quarantined units is Topic 12; how recovery affects survival is Topic 15.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (git rollback: "revert bad changes, recover working base states"; retry/resume across sessions; health check).
- **[HDA]** Anthropic — *Harness design for long-running apps* (evaluator→generator replan/retry loop; scores "improved over iterations before plateauing, with headroom still remaining" — grounds the escalation boundary).
- **[MAR]** Anthropic — *Multi-agent research system* (resume-from-error). Via Chapter 9.
- Internal: Chapter 5 (effect classes, reversibility), Chapter 8 Topic 9 (replan classes, RP-1/RP-3, novelty guard) + Topic 10 (compensation/saga, durable retry, "exactly-once illusion", TE-3), this chapter Topics 2 (failure detection), 4 (unit independence for quarantine), 6 (artifact versions for rollback), 8 (checkpoints for rollback), 9 (restart-safe retry), 10 (stall detection, repeated-takeover escalation), 12 (stop/escalate), 15 (survival).
