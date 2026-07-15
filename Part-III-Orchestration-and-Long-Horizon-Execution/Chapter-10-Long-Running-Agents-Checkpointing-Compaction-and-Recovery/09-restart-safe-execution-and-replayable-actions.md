# Topic 9 — Restart-Safe Execution and Replayable Actions

## 1. Scope, prerequisites, terminology, boundaries, outcomes

Topic 8 decided *when* to checkpoint. This topic makes the execution itself **restart-safe**: after a crash, a fresh session resuming from a checkpoint must produce a *correct* result, never a corrupted or double-executed one. The central problem is that resumption inevitably *re-attempts* the step that was in flight when the crash happened — so every action must be designed to tolerate being replayed. This is the generalization of Chapter 8's durable execution ("exactly-once is an illusion," "effectively once") from a single workflow to a multi-session agent, and it is where the "effectively once" guarantee is actually earned.

**Prerequisites.** Durable execution, the D-2 rule ("the in-flight step WILL be re-attempted on resume"), and "effectively once = at-least-once + target-honored idempotency" (Chapter 8 Topic 10); the effect bracket and idempotency key = fn(intent) (Topic 8, Chapter 5); effect classes $\chi \in \{R, W_{\text{rev}}, W_{\text{irr}}\}$ and the invariants E1–E4 (Chapter 5); the authoritative journal and its replay/projection (Topic 5).

**Terminology.**
- **Restart-safe** — an execution is restart-safe if resuming it from a checkpoint (thereby re-attempting the in-flight step) yields the same correct outcome as if no crash occurred.
- **Replayable action** — an action that can be re-executed (or its re-execution safely short-circuited) without changing the outcome beyond the first execution.
- **Idempotency key** — a stable identifier derived from an action's *intent* (not its attempt number), used to detect and suppress duplicate execution. $\text{key} = \text{fn(intent)}$ (Chapter 5).
- **Replay** — reconstructing state by re-applying journal events after a checkpoint (Topic 5); distinct from *re-executing* external effects.

**Boundary.** This topic makes *actions* restart-safe. It relies on Topic 8 for checkpoint placement and the effect bracket, Topic 5 for the journal being replayed, and Topic 11 for the higher-level recovery *decisions* (retry/replan/rollback). It does not cover distributed consensus or exactly-once messaging infrastructure (Chapter 14); it covers the agent-level discipline that makes resumption correct.

**Outcome.** You will be able to classify actions by replay-safety, make each class restart-safe (naturally-idempotent reads; versioned reversible writes; key-guarded irreversible writes), and reason about the exact resume point so a crash costs a redo, never a corruption.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** A crash at step $d$ leaves the world in an *ambiguous* state: did the in-flight action complete before the crash, or not? The journal may show `intent` but not `done` (Topic 8's bracket) — meaning the action *might* have executed, its effect *might* have landed, but the confirmation was lost. On resume, the naive move (re-run the step) is catastrophic for irreversible effects (double-charge) and merely wasteful for reversible ones. The problem is to make resumption *correct under this ambiguity*: the resuming session must reach the right state whether or not the in-flight action actually completed.

**Objective.** Design execution so that: (i) reads are freely replayable (no external effect); (ii) reversible writes are replayable via versioning or overwrite-to-known-state; (iii) irreversible writes are guarded by idempotency keys so a replay *detects* prior execution and does not repeat it; and (iv) the resume point is precisely defined so replay reconstructs internal state deterministically from the journal.

**Assumptions.** (a) D-2 holds: resumption re-attempts the in-flight step — you cannot prevent this, you must tolerate it. (b) External targets *may or may not* offer idempotency; where they do, use it; where they do not, you must build a check (query-before-act) or accept the effect is unsafe to automate (Chapter 5 E4). (c) The journal is authoritative and replayable (Topic 5).

**Constraints.** Internal state reconstruction must be *deterministic* given the journal — a replay that produces different internal state than the original run breaks correctness (e.g., if a step's behavior depended on a random seed or wall-clock not captured in the journal). Non-determinism must be *captured* in the journal (record the seed, the timestamp, the model output) so replay reproduces it.

**Success criteria.** Crash at any point; resume; the final state is correct and no irreversible effect executed twice. Reads and reversible writes may be redone harmlessly; irreversible writes are executed exactly as many times as intended (once per intent), verified by E3-style crash-injection (Topic 8).

## 3. Intuition first, then formalization

**Intuition.** Restart-safety is the discipline of assuming *every action might be done twice* and making that harmless. Databases solved this long ago with idempotency and write-ahead logging; agents inherit the same solution with one twist — many agent actions touch the *external world* (send email, call an API, deploy), where you cannot simply "roll back the transaction."

The key mental model is **three kinds of action, three levels of danger on replay:**

- A **read** (fetch a page, run a query, list files) has no external effect. Replaying it is *free* — you just get the data again (perhaps different data if the world changed, but no harm done). Reads are naturally restart-safe. (Chapter 5's $R$ class.)
- A **reversible write** (edit a file, update a scratch record) can be redone by *overwriting to the intended state*. If the intended state is captured (the new content is in the journal or the artifact version, Topic 6), replay re-applies it and the result is the same. Reversible writes are restart-safe *if the target is captured*. (Chapter 5's $W_{\text{rev}}$.)
- An **irreversible write** (send email, charge card, deploy, delete) *cannot be undone*, so replay must not *repeat* it. The only defense is to *detect* that it already happened — via an idempotency key the target honors, or a query ("was this email sent?") before acting. Irreversible writes are restart-safe *only if guarded by a duplicate-detection mechanism*. (Chapter 5's $W_{\text{irr}}$.)

The intuition for the *resume point*: the journal (Topic 5) is a recipe. To rebuild the kitchen after a fire, you replay the recipe from the last checkpoint. Reads and reversible writes in the recipe are just re-followed. But an irreversible step ("mailed the cake to the customer") must check "did I already mail it?" before mailing again. The journal's `intent`/`done` bracket (Topic 8) is exactly that check: `intent` without `done` means "maybe mailed — go verify before mailing."

**Formalization.** Let an action $a$ have effect class $\chi(a) \in \{R, W_{\text{rev}}, W_{\text{irr}}\}$. Define restart-safety per class:

- **$R$:** always replayable. $\text{replay}(a) $ produces data, no world change. Safe unconditionally.
- **$W_{\text{rev}}$:** replayable iff the *target state* is captured durably (in the journal or as an artifact version, Topic 6). Then $\text{replay}(a)$ = re-apply target state (overwrite), idempotent by construction. Safe if captured.
- **$W_{\text{irr}}$:** replayable iff guarded by a duplicate-suppression predicate $\text{done}(\text{key}(a))$:
$$
\text{replay}(a) = \begin{cases} \text{skip} & \text{if } \text{done}(\text{key}(a)) \text{ (already executed)} \\ \text{execute}(a, \text{key}(a)) & \text{otherwise} \end{cases}
$$
where $\text{key}(a) = \text{fn(intent}(a))$ is stable across attempts (Chapter 5) and $\text{done}$ is checked against the target (via target idempotency or a query). Safe iff $\text{done}$ is reliably checkable.

**The restart-safety theorem [synthesis].** A run is restart-safe iff every action is restart-safe *for its class*: reads unconditionally, reversible writes with captured target state, irreversible writes with a reliable duplicate-suppression predicate. This decomposes the hard global property ("resumption is correct") into per-action local properties ("this action tolerates replay"), each enforceable at the action's implementation. This is the Chapter 5 invariant E2 (irreversible ⇒ idempotency key) + E4 (no blind retry on irreversible write) applied across the session boundary.

**Determinism of internal replay.** State reconstruction $\text{replay}(\text{snapshot}, \text{events})$ (Topic 5) must be deterministic. If an action's outcome depended on non-determinism (model sampling, wall-clock, RNG), that outcome is *recorded in the journal* (the actual model output, the actual timestamp) and replay *reads the record* rather than re-invoking the non-deterministic source. This is standard durable-execution practice (record-and-replay): the journal captures the *results* of non-deterministic operations so replay reproduces the exact history.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Action classifier.** Tags each action $R / W_{\text{rev}} / W_{\text{irr}}$ (Chapter 5, decided *first*). Determines the restart-safety mechanism applied.
2. **Idempotency store.** Maps idempotency keys → outcome, durable. On replay, `done(key)` queries it (and/or the external target). This is the journal's `effect_done` records (Topic 8) plus, ideally, the target's own idempotency.
3. **Record-and-replay journal (Topic 5).** Captures non-deterministic outcomes (model outputs, timestamps, fetched data if determinism requires it) so internal-state replay is exact.
4. **Resume controller (Topic 11).** On restart: load checkpoint, replay journal to reconstruct state, identify the in-flight action, apply its class's restart-safe resume.

**Interface: the effect bracket is the restart-safety boundary.** Topic 8's `intent`/`done` bracket around irreversible effects is where restart-safety is enforced: `intent` present + `done` absent = "verify before repeating." Reversible writes are re-applied from captured state; reads are re-run.

**Control flow (resume of an in-flight action):**

```
on restart, for the in-flight action a (intent journaled, done maybe absent):
    if chi(a) == R:
        re-run a                                  # free
    elif chi(a) == W_rev:
        re-apply captured target state of a        # idempotent overwrite (Topic 6 version)
    elif chi(a) == W_irr:
        if done(key(a)):                           # check target/idempotency store
            record done; skip                      # already executed; DO NOT repeat
        else:
            execute a with key(a)                  # target honors key => "effectively once"
            journal done(key(a))
```

**Data flow.** The journal (Topic 5) drives replay; the idempotency store / target drives duplicate suppression; artifact versions (Topic 6) supply captured target state for reversible writes. Everything the resume needs is durable — nothing depends on the crashed session's window (RI, Topic 3).

**Connection to durable-execution frameworks.** Chapter 8 Topic 10 noted durable-execution engines (record-and-replay workflows). This topic is the agent-level realization: the journal is the workflow history, replay reconstructs state, and the effect bracket is the "activity" boundary where side effects are made idempotent. The agent twist is that "activities" are tool calls with real-world effects, and the model's outputs are non-deterministic operations that must be recorded.

## 5. Grounding: primary sources and reproducible evidence

**Resume-from-error and recovery of working states.** [LRH]: git checkpointing enables "reverting bad changes and recovering working base states" — the reversible-write restart-safety mechanism (re-apply a captured, versioned state). A git checkout to a known commit is exactly "re-apply captured target state," idempotent by construction. [MAR] grounds "resume-from-error" as a real capability, which *requires* restart-safe execution underneath.

**Clean-state discipline enables safe replay.** [LRH]: "leaves the environment in a clean state after making a code change." A clean state is a well-defined resume point; replaying to it is deterministic. Checkpointing broken intermediate states (Topic 8) would make replay resume into ambiguity — the clean-state rule is what makes the git-checkpoint resume restart-safe.

**Durable-execution guarantees.** Chapter 8 Topic 10 grounds the load-bearing results: "the in-flight step WILL be re-attempted on resume" (D-2) and "exactly-once is an illusion for external effects; the honest guarantee is at-least-once + target-honored idempotency = effectively once." This topic *is* the application of those results across sessions. Chapter 5 grounds the effect classes and E2/E4 (irreversible ⇒ idempotency key; no blind retry).

**Idempotency key = fn(intent).** Chapter 5's rule that the key derives from *intent*, not attempt number, is what makes the key *stable across a crash* — the resuming session, re-forming the same intent, computes the same key and thus recognizes the prior execution. A key derived from attempt number would differ on retry and fail to suppress the duplicate.

**Honest grounding boundary.** The agent sources ([LRH], [MAR]) ground the *reversible-write* restart-safety (git checkout, resume-from-error) concretely. The *irreversible-write* discipline (key-guarded suppression, query-before-act) is grounded in Chapter 5/8's durable-execution results and standard distributed-systems practice, applied here — a **[synthesis]** for the agent case, not a fresh source claim. The sources' domain (code/app building) has *few* irreversible external effects (git is reversible), so they under-exercise the $W_{\text{irr}}$ path; a payments or deployment agent exercises it heavily, and there the Chapter 5 discipline is load-bearing.

**Reproducible evidence.** Restart-safety is directly testable per class: crash between an action and its `done` record and verify correct resume (Topic 8 E3 for irreversible; analogous for reversible). Determinism of replay is testable by replaying a journal and diffing reconstructed state against the original.

## 6. Implementation: per-class mechanisms

**Reads — nothing to do (naturally safe):**

```python
# chi == R: replay is free. Just re-run. Record the result if determinism needs it.
def do_read(action, journal):
    result = action.execute()
    journal.append({"type": "read", "action": action.id, "result_hash": hash(result)})
    return result     # on replay: re-run, or read journal if the world may have changed
```

**Reversible writes — capture the target state, re-apply on replay:**

```python
# chi == W_rev: idempotent by re-applying the intended end state.
def do_reversible_write(action, artifacts, journal):
    new_version = write_artifact(action.target, action.new_content, artifacts, journal)  # Topic 6
    journal.append({"type": "rev_write", "target": action.target, "version": new_version})
    # on replay: checkout/re-apply `version` -> same state. Idempotent.
```

**Irreversible writes — the key-guarded bracket (the critical mechanism):**

```python
# chi == W_irr: E2 + E4 (Chapter 5). Never blind-retry; detect-and-suppress.
def do_irreversible_write(action, journal, target):
    key = idempotency_key(action.intent)              # fn(intent), stable across attempts
    if journal.has_done(key) or target.already_done(key):   # check BOTH: local + remote
        return journal.get_outcome(key)                # already executed; suppress duplicate
    journal.append({"type": "effect_intent", "key": key}); journal.flush()
    try:
        outcome = target.execute(action, idempotency_key=key)   # target honors key if it can
    except Ambiguous:                                  # timeout: did it land? query, don't retry
        outcome = target.query_result(key)             # E4: no blind retry on irreversible
    journal.append({"type": "effect_done", "key": key, "outcome": outcome}); journal.flush()
    return outcome
```

The `Ambiguous` branch is the heart of $W_{\text{irr}}$ restart-safety: a timeout does not tell you whether the effect landed, and E4 forbids blind retry — so you *query* the target for the key's result rather than re-executing. If the target offers neither idempotency keys nor a result query, the effect *cannot be made restart-safe automatically* and requires a human gate (Chapter 8 HITL) or must be treated as unsafe to replay (accept at-most-once with possible loss, and alarm).

**Deterministic internal replay — record non-determinism:**

```python
# Model output is non-deterministic; record it so replay reproduces the exact history.
def do_model_step(ctx, journal):
    output = model.generate(ctx)                       # non-deterministic
    journal.append({"type": "model_step", "output": output, "ts": now()})  # RECORD it
    return output     # on replay: read `output` from journal, do NOT re-generate
```

Re-generating on replay would produce a *different* output (different sampling) and diverge from the recorded history — replay must read the journal's recorded output, exactly as durable-execution engines replay recorded activity results.

## 7. Trade-offs

- **Recording non-determinism vs cost.** Recording every model output, timestamp, and (where determinism needs it) fetched data makes replay exact but grows the journal and costs storage. The alternative — re-generating on replay — is cheaper in storage but *breaks determinism* (replay diverges). For correctness, record; prune old journals via snapshots (Topic 8). The trade favors recording: storage is cheap, divergence is a correctness bug.
- **Target idempotency vs query-before-act.** If the external target honors idempotency keys, restart-safety is clean (pass the key, target dedupes). If not, you must query-before-act (an extra round-trip per effect) or maintain a local idempotency store (which can disagree with the target after a crash). Prefer targets with native idempotency; where absent, query-before-act is safer than a local store alone (the local store may not reflect an effect that landed but whose `done` was lost).
- **Reversible-by-construction vs irreversible.** Designing actions to be *reversible* (write to a staging area, deploy via a revertible mechanism) makes restart-safety trivial (re-apply captured state) and is almost always worth the design effort — it converts a dangerous $W_{\text{irr}}$ into a safe $W_{\text{rev}}$. This is the deferred-approval / outbox pattern (Chapter 8: convert $W_{\text{irr}} \to W_{\text{rev}}$). The cost is architectural; the payoff is that crashes never double-execute.
- **Fine-grained journaling vs replay speed.** Recording every action makes replay faithful but slow for very long runs. Mitigation: snapshots (Topic 8) bound replay to events-since-snapshot. The trade is the same RPO/RTO split as Topic 8.
- **Strictness vs automation reach.** The strict rule (no irreversible effect without a reliable duplicate-suppression mechanism) means some effects *cannot* be automated in a long-running, crash-prone agent — they need a human gate. This *reduces* what the agent can autonomously do, which is the correct trade: an un-restart-safe irreversible effect is a double-execution waiting to happen. Chapter 5's E4 and Chapter 12's authority levels govern where this line sits.

## 8. Experiments: baselines, ablations, metrics

**E1 — Per-class crash-injection.** For each class, crash between the action and its `done` record; resume; verify correctness. **Predictions:** $R$ → always correct (re-run harmless); $W_{\text{rev}}$ → correct iff target state captured (test the "not captured" failure too); $W_{\text{irr}}$ → correct (no double-exec) iff key-guarded, double-execution iff blind-retry. Metric: double-execution rate ($W_{\text{irr}}$, must be zero), state-correctness rate.
**E2 — Idempotency-key-source ablation.** Compare key = fn(intent) vs key = fn(attempt). **Prediction:** fn(attempt) fails to suppress duplicates (each retry a new key → double-exec); fn(intent) suppresses correctly. This validates Chapter 5's key rule under crash.
**E3 — Determinism of replay.** Replay a journal with recorded model outputs vs re-generating on replay. **Prediction:** recorded → reconstructed state matches original; re-generate → divergence (different outputs → different trajectory). Metric: state-diff rate between original and replayed runs.
**E4 — Ambiguous-outcome handling.** Inject a timeout on an irreversible effect (landed-but-unconfirmed); test query-before-act vs blind-retry. **Prediction:** query → correct (detects it landed); blind-retry → double-exec. Metric: double-execution rate under ambiguity.

**Honest status.** [LRH]/[MAR] ground the reversible-write / resume-from-error path *qualitatively* (git recovery works; resume-from-error exists). The irreversible-write experiments (E1 $W_{\text{irr}}$, E2, E4) rest on Chapter 5/8's durable-execution results and standard practice; **the agent sources do not publish crash-injection studies or double-execution rates** (their domain has few irreversible effects). The mechanisms are grounded; the per-class correctness numbers are yours to measure. This is the honest state: restart-safety of *reversible* agent work is demonstrated in the sources; restart-safety of *irreversible* agent effects is a discipline imported from durable-execution theory, unmeasured in the agent literature.

## 9. Failure modes, edge cases, hazards, limitations

- **Blind retry of an irreversible effect (the cardinal failure).** Resume re-runs a $W_{\text{irr}}$ action without checking `done` → double-charge/duplicate-email/double-deploy. Mitigation: mandatory key-guard + E4 (no blind retry; query on ambiguity). This is *the* reason restart-safety exists.
- **Key derived from attempt, not intent.** The idempotency key changes on retry, so duplicate suppression fails silently. Mitigation: key = fn(intent) (Chapter 5), stable across crashes.
- **Local idempotency store disagrees with target.** The effect landed but the local `done` record was lost in the crash; the local store says "not done," so resume re-executes. Mitigation: check the *target* (query-before-act / target idempotency), not only the local store — the target is the ground truth for whether the effect landed.
- **Non-deterministic replay divergence.** Replay re-generates model output or re-reads changed world state, producing a different trajectory than the original, so reconstructed state is wrong. Mitigation: record non-deterministic outcomes in the journal; replay reads them.
- **Checkpoint of an inconsistent state.** Resuming from a snapshot taken mid-write (Topic 8) leaves the target partially written and the journal ambiguous. Mitigation: clean-state checkpoints ([LRH]); atomic write of the `done` record with the effect where possible.
- **Edge case: effects with no idempotency and no query.** Some external actions offer neither a key nor a "did it happen?" query (a fire-and-forget webhook to a third party). These *cannot* be made restart-safe. Mitigation: wrap in a reversible proxy (an outbox you control, Chapter 8), gate with a human (Chapter 8 HITL), or accept at-most-once-with-loss and alarm — but do not pretend they are safe to replay.
- **Limitation.** Restart-safety is *local per action* but assumes actions are *independent* on replay. Cross-action invariants (action B assumed action A's effect, and replay redoes A differently) can break even when each action is individually safe. This is the domain of transactional/saga patterns (Chapter 8 compensation, Topic 11 rollback) — restart-safety of individual actions is necessary but not sufficient for *transactional* correctness across a multi-action unit.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Reversible recovery (checkout to a known-good versioned state) is grounded and works [LRH]; resume-from-error is a real capability [MAR].
- Clean-state checkpoints make replay deterministic and safe [LRH].
- The in-flight step is re-attempted on resume (D-2); exactly-once is an illusion for external effects; "effectively once" = at-least-once + target idempotency (Chapter 8).
- Idempotency key must derive from intent, not attempt, to survive a crash (Chapter 5).

**Decision rules.**
- **DR-1.** Classify every action $R/W_{\text{rev}}/W_{\text{irr}}$ first (Chapter 5). Apply the class's restart-safe mechanism: reads free, reversible writes re-apply captured state, irreversible writes key-guard + query-on-ambiguity.
- **DR-2.** Never blind-retry an irreversible effect. On ambiguity (timeout), query the target for the key's result; do not re-execute (E4).
- **DR-3.** Key = fn(intent), stable across attempts. Check both the local journal *and* the target for prior execution.
- **DR-4.** Record non-deterministic outcomes (model outputs, timestamps) in the journal so replay is exact; on replay, read recorded outcomes, do not re-generate.
- **DR-5.** Prefer converting irreversible effects to reversible ones (staging/outbox, Chapter 8). An effect that offers no idempotency and no result-query cannot be made restart-safe — gate it with a human or alarm.

**Production implications.** Restart-safety is what makes checkpointing *worth having*: a checkpoint you cannot safely resume from is a false comfort. The reversible path is well-trodden and cheap (git-style versioned recovery); the irreversible path is where production agents actually get hurt — a payments or deployment agent that is not restart-safe will double-execute on its first crash-during-effect, and that is a customer-visible incident, not a wasted token. Teams building agents with real-world irreversible effects must implement the key-guarded bracket and query-before-act, or restrict irreversible effects to human-gated, reversible-proxied paths. The design goal is simple to state and hard to skip: **a crash should cost a redo, never a corruption or a duplicate.**

**Connections.** This topic realizes Chapter 8 Topic 10's durable execution and Chapter 5's effect classes/E2/E4/idempotency-key across the session boundary. The effect bracket is Topic 8's; the journal replayed is Topic 5's; captured reversible state is Topic 6's artifact versions. The *decisions* built on restart-safe actions (retry/rollback/compensate) are Topic 11. Cross-action transactional correctness is Chapter 8's compensation/saga. Verifying restart-safety is Topic 8 E3 and this topic's E1; the survival benefit (crashes become recoverable, not fatal) is Topic 15.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (git recovery of working base states = reversible restart-safety; clean-state-after-change discipline).
- **[MAR]** Anthropic — *Multi-agent research system* (resume-from-error capability). Via Chapter 9.
- Internal (load-bearing): Chapter 5 (effect classes $\chi$; E2 irreversible⇒idempotency key; E4 no blind retry on irreversible write; key = fn(intent)), Chapter 8 Topic 10 (durable execution; D-2 in-flight step re-attempted; exactly-once illusion; "effectively once"; convert $W_{\text{irr}}\to W_{\text{rev}}$), this chapter Topics 5 (journal replay, record-and-replay), 6 (artifact versions as captured state), 8 (checkpoint placement, effect bracket, clean states), 11 (recovery decisions), 15 (survival).
