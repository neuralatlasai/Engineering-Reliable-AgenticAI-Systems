# Topic 8 — Checkpoint Frequency and Recovery-Point Objectives

## 1. Scope, prerequisites, terminology, boundaries, outcomes

Topics 5–7 built the durable state and managed the window. This topic makes the durability *quantitative*: **how often do you checkpoint, and how much work are you willing to lose to a crash?** The answer is governed by a **recovery-point objective (RPO)** — the maximum acceptable lost work — traded against the *cost* of checkpointing. This is where the chapter's durability story acquires a dial with numbers on it.

The framing borrows directly from disaster-recovery engineering (RPO/RTO) and specializes it to agents, where the unit of loss is not seconds of data but **steps and committed effects**, and where checkpointing has an unusual cost: it competes with the model's context budget and can interrupt momentum.

**Prerequisites.** The durable record and its journal snapshots (Topic 5); per-step persistence and CL-1 (Topics 1, 5); the unit-size/RPO relation (Topic 4: unit size *is* cognitive RPO); restart-safe writing (Topic 9, referenced); durable execution and "effectively once" (Chapter 8 Topic 10); event-log snapshots (Chapter 3, Chapter 7).

**Terminology.**
- **Checkpoint** — a durable, restart-safe snapshot of task state (ledger projection + artifact versions + journal offset) from which a fresh session resumes. Distinct from a *journal event* (every step is journaled; not every step needs a full snapshot).
- **RPO (Recovery Point Objective)** — the maximum work you accept losing to a crash, measured in *steps* or *committed effects* since the last durable point.
- **RTO (Recovery Time Objective)** — the maximum time/cost to make a fresh session productive after a failure (dominated by the re-anchoring read + context reconstruction).
- **Checkpoint interval** $\Delta$ — steps (or effects, or wall-clock) between checkpoints. Smaller $\Delta$ → tighter RPO, higher overhead.

**Boundary.** This topic sets *frequency* against *RPO*. It does not build the *mechanism* that makes a checkpoint restart-safe (Topic 9 — atomicity, idempotency across the boundary) nor the *recovery actions* taken after a crash (Topic 11). It relies on Topic 5's journal/snapshot design as the thing being checkpointed.

**Outcome.** You will be able to set an RPO from the cost of lost work, derive a checkpoint interval from it, reason about the checkpoint-cost/lost-work trade, and distinguish per-step journaling (cheap, always-on) from full snapshots (costlier, periodic).

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** A crash (deploy, OOM, timeout, cost cap — P2) happens at an unpredictable step $d$. Everything *not durably captured* before $d$ is lost, and the resuming session redoes it (wasted budget) or, worse, cannot reconstruct it (RI violation → stall). Checkpoint too rarely and a crash costs a lot of work; checkpoint too often and you pay overhead on every step and interrupt the agent's momentum. There is a frequency that minimizes total cost, and it depends on how likely crashes are and how expensive lost work is — quantities most teams never estimate.

**Objective.** (i) Define RPO for agents in the right units (steps/effects, not seconds). (ii) Relate checkpoint interval $\Delta$ to expected lost work. (iii) Find the interval that minimizes total cost = checkpoint overhead + expected lost work. (iv) Separate the two durability mechanisms with different frequencies: *per-step journaling* (always) vs *full snapshots* (periodic), and place effects (irreversible external actions) on the tightest frequency of all (checkpoint *before* every irreversible effect).

**Assumptions.** (a) Crashes arrive at some rate $\lambda$ per step (or per unit time) — estimable from ops history; often modeled as roughly memoryless (Poisson) for planning, though deploys and cost caps are *scheduled*, not random (a nuance §9). (b) The cost of redoing a step is roughly its original cost (tokens + latency); the cost of an *unrecoverable* loss (RI violation) is the whole run.

**Constraints.** Checkpoint overhead competes with the context budget (a checkpoint that re-summarizes state costs tokens) and with momentum (a checkpoint that forces a reset interrupts the session). Irreversible effects (Chapter 5's $W_{\text{irr}}$) impose a *hard* constraint: you must checkpoint *before* them, regardless of $\Delta$, because you cannot redo-or-undo them safely on resume (Topic 9).

**Success criteria.** A stated RPO ("lose at most one task unit" or "lose at most $N$ steps"); a checkpoint policy that guarantees it; irreversible effects always preceded by a durable checkpoint; and a total-cost that is near the minimum of the overhead/lost-work trade rather than at either extreme.

## 3. Intuition first, then formalization

**Intuition.** RPO is the answer to "if the process died *right now*, how much work would I have to redo, and is that acceptable?" In database terms it is "how much data can we lose" — here it is "how many steps can we lose." The dial is checkpoint frequency: checkpoint after every step and you lose almost nothing but pay constant overhead; checkpoint once an hour and a crash at minute 59 costs an hour.

But agents have a twist databases do not: **not all steps are equal.** A pure-reasoning step that produced only in-window thinking is *cheap to redo* — losing it costs a little recomputation. An *irreversible external effect* (sent an email, charged a card, deployed to prod — Chapter 5 $W_{\text{irr}}$) is *impossible to redo safely* — if you lose the record that it happened, the resuming session does it *again*. So the checkpoint frequency is not uniform: **cheap-to-redo work can tolerate a loose RPO; irreversible effects demand an RPO of zero — checkpoint the *intent* to act durably before you act, and the *fact* you acted durably after.** This is the durable-execution discipline (Chapter 8 Topic 10) expressed as a checkpoint requirement.

The second intuition is the **two-tier mechanism.** Journaling every step (append one event to disk — Topic 5) is *cheap*: it is a small write, no summarization, no context cost. Do it always; it is what gives fine-grained RPO. A *full snapshot* (project the ledger, record all artifact versions, produce a resumable state) is *costlier* — do it periodically, to bound *replay time* (RTO), not to bound lost work. So: **journal every step (RPO), snapshot periodically (RTO), checkpoint before every irreversible effect (correctness).** Three frequencies, three purposes.

**Formalization.** Let crashes arrive at rate $\lambda$ (per step). With checkpoint interval $\Delta$ (steps between durable points), a crash loses, in expectation, the work since the last durable point. For crashes uniform within an interval, expected lost steps per crash $\approx \Delta/2$. Over a run of $K$ steps, expected number of crashes $\approx \lambda K$, so:

$$
\mathbb{E}[\text{lost work}] \;\approx\; \lambda K \cdot \frac{\Delta}{2} \cdot c_{\text{redo}},
\qquad
\text{checkpoint cost} \;\approx\; \frac{K}{\Delta} \cdot c_{\text{ckpt}},
$$

where $c_{\text{redo}}$ is the cost to redo one step and $c_{\text{ckpt}}$ is the cost of one checkpoint. Total cost $T(\Delta) = \frac{K}{\Delta} c_{\text{ckpt}} + \lambda K \frac{\Delta}{2} c_{\text{redo}}$. Minimizing over $\Delta$:

$$
\frac{dT}{d\Delta} = -\frac{K c_{\text{ckpt}}}{\Delta^2} + \frac{\lambda K c_{\text{redo}}}{2} = 0
\;\;\Rightarrow\;\;
\boxed{\;\Delta^\star = \sqrt{\dfrac{2\, c_{\text{ckpt}}}{\lambda\, c_{\text{redo}}}}\;}
$$

**[derived]** This is the classic square-root checkpoint-interval result (the same form as the optimal-checkpointing result in HPC and databases). It says the optimal interval grows with checkpoint cost and *shrinks* as crashes get more frequent or redo gets more expensive. It is a planning heuristic, not a precise prescription — the assumptions (uniform crashes, constant per-step cost) are approximations (§9) — but it captures the shape: **cheaper checkpoints → checkpoint more often; rarer crashes → checkpoint less often.**

**RPO as a hard cap overrides the optimum.** If your RPO is "lose at most $R$ steps," then $\Delta \le 2R$ regardless of $\Delta^\star$ (so that expected loss $\Delta/2 \le R$; for a *worst-case* guarantee, $\Delta \le R$). The cost-optimal $\Delta^\star$ applies only *within* the RPO ceiling — you take the cheaper of "optimal" and "RPO-mandated."

**Irreversible effects: RPO = 0.** For a step with an irreversible effect, no loss is tolerable (redo = double-charge). The requirement is a *synchronous* durable checkpoint bracketing the effect: journal `intent(effect)` → perform effect → journal `done(effect)`, each durably flushed. This is $\Delta = 0$ around effects, independent of the run-wide $\Delta$. Topic 9 details the atomicity; here it is the correctness constraint on frequency.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Journaler (per-step, always-on).** Appends every step's event to the durable journal (Topic 5). Cheap. Provides fine-grained RPO. Runs unconditionally.
2. **Snapshotter (periodic).** Every $\Delta_{\text{snap}}$ steps (or on a size trigger), materializes a full resumable checkpoint: ledger = project(journal since last snapshot) + artifact version manifest + journal offset. Bounds RTO (replay from last snapshot, not from step 0).
3. **Effect bracketer (per-effect).** Around every irreversible effect, forces a synchronous intent/done journal pair with a durable flush. Guarantees RPO=0 for effects.
4. **Recovery loader (on restart).** Reads the latest snapshot, replays journal events after it, reconstructs state, resumes (Topic 11).

**Interface: three frequencies, one journal.** All three write to the same authoritative journal (Topic 5); they differ in *when* and *what*. The journaler writes small events often; the snapshotter writes a checkpoint marker periodically; the bracketer writes intent/done synchronously around effects. Recovery reads snapshot + subsequent events.

**Control flow:**

```
each step:
    do work
    journal.append(step_event)                 # per-step: RPO granularity, cheap
    if step_has_irreversible_effect:
        journal.append(intent(effect)); flush   # RPO=0 bracket (Topic 9)
        perform_effect()
        journal.append(done(effect));  flush
    if steps_since_snapshot >= DELTA_snap:
        snapshot(project(journal), artifact_manifest(), journal.offset())  # RTO bound
        steps_since_snapshot = 0

on restart:
    snap = latest_snapshot()
    state = replay(snap, journal.events_after(snap.offset))   # RTO = replay cost
    resume(state)
```

**Data flow.** Journal (authoritative) → snapshot (projection + manifest) → recovery (snapshot + replay). Artifacts (Topic 6) are versioned independently; a snapshot records the *versions* that were current, so recovery pins the exact artifact state.

**The RTO/RPO split in the architecture.** RPO is set by the *journaler's* granularity (per-step → RPO ≈ 1 step of cheap work). RTO is set by the *snapshotter's* interval (replay cost = events since last snapshot). These are *independent knobs*: you can have tight RPO (journal every step) with relaxed RTO (snapshot rarely, accept longer replay) or vice versa. Conflating them — thinking one frequency governs both — is a common design error.

## 5. Grounding: primary sources and reproducible evidence

**Git commits as checkpoints.** [LRH] grounds the checkpoint mechanism concretely: the system "leverages git commits with descriptive commit messages to enable reverting bad changes and recovering working base states." A git commit *is* a checkpoint (a durable, restart-safe snapshot of the code artifact + a journal entry). The frequency in [LRH] is per-meaningful-change ("leaves the environment in a clean state after making a code change") — i.e., checkpoint at unit boundaries, which ties RPO to unit size (Topic 4).

**Checkpoint at clean states.** [LRH]: "it's still essential that the model leaves the environment in a clean state after making a code change." This grounds the discipline of checkpointing at *consistent* points (a green build), not mid-edit — a checkpoint of a broken intermediate state is not a useful recovery point. The clean-state requirement is what makes a checkpoint restart-safe (Topic 9).

**Compaction thresholds as a frequency dial.** [OCP]'s `compact_threshold` is a *window*-management frequency, distinct from *durability* checkpointing — but it grounds the general pattern of a configurable threshold triggering a periodic operation. This chapter separates the two (compaction manages P1; checkpointing manages P2) precisely because they are often conflated.

**Durable execution and effect bracketing.** Chapter 8 Topic 10 grounds the "effectively once" guarantee (at-least-once + idempotency) and the fact that "the in-flight step WILL be re-attempted on resume" (D-2). This is the basis for the RPO=0 requirement around irreversible effects: because the in-flight step *will* be redone, you must bracket effects durably so redo is safe. [MAR] (Chapter 9) grounds "resume-from-error" as a real capability of long-running agent systems.

**The RPO/RTO framework itself** is standard disaster-recovery engineering (databases, HPC checkpointing); the square-root interval is the classic Young/Daly checkpoint-optimization result. These are **[derived]** applications to agents, not agent-source claims — flagged as such. The *agent-specific* insight (units of steps/effects not seconds; irreversible effects force RPO=0) is the [synthesis].

**Reproducible evidence.** The cost/lost-work trade (E1) is directly measurable by sweeping $\Delta$ under injected crashes. The effect-bracketing correctness (E3) is testable by crashing between an effect and its `done` record and checking for double-execution. Sources ground the mechanisms (git checkpoints, clean states, resume-from-error); the trade curves are unmeasured.

## 6. Implementation: policies and the effect bracket

**Setting RPO → interval.**

```python
# 1. State the RPO in the right units.
RPO_steps = 1            # "lose at most one unit of cheap work" (unit-size RPO, Topic 4)

# 2. Journal every step (always) -> RPO granularity is 1 step of cheap work.
def step_loop(...):
    result = do_step()
    journal.append(result)            # cheap; per-step; this IS the RPO mechanism
    ...

# 3. Snapshot periodically for RTO (bound replay), NOT for RPO.
DELTA_snap = 50          # replay at most ~50 events on recovery
```

**The irreversible-effect bracket (RPO=0, the correctness-critical part).**

```python
def perform_irreversible(effect):
    key = idempotency_key(effect.intent)          # Chapter 5: key = fn(intent), not fn(attempt)
    if journal.has_done(key):
        return                                     # already performed; do NOT repeat (Topic 9)
    journal.append({"type": "effect_intent", "key": key, "effect": effect}); journal.flush()
    outcome = effect.execute(idempotency_key=key)  # target-honored idempotency ("effectively once")
    journal.append({"type": "effect_done", "key": key, "outcome": outcome}); journal.flush()
```

This is the concrete encoding of "checkpoint before every irreversible effect." If the process dies after `effect_intent` but before `effect_done`, recovery sees the intent, checks the target's idempotency (was it actually performed?), and either completes or safely retries — never blindly re-executes. Topic 9 develops the recovery semantics; here the point is the *bracket is a mandatory checkpoint pair* regardless of $\Delta$.

**Snapshot with artifact pinning.**

```python
def snapshot(journal, artifacts):
    return {
        "ledger":   project(journal),                 # Topic 5 projection
        "artifacts": {name: h.version for name, h in artifacts.items()},  # Topic 6 pins
        "offset":   journal.offset(),                 # replay resumes here
        "mu":       count_verified(project(journal)), # progress at checkpoint
    }
```

Pinning artifact *versions* (Topic 6's two-clock model) means recovery restores the exact artifact state that matched the ledger — no drift between "the ledger says unit X done" and "the artifact for X is at the version that made it pass."

## 7. Trade-offs

- **Checkpoint frequency: overhead vs lost work.** The core trade, captured by $\Delta^\star = \sqrt{2 c_{\text{ckpt}} / (\lambda c_{\text{redo}})}$. Frequent full snapshots bound lost work but cost tokens/time/latency and can interrupt momentum; rare snapshots are cheap but risk large loss. **Resolution: split the frequencies** — journal every step (cheap, tight RPO) and snapshot rarely (bounded RTO). This dodges the worst of the trade: you get fine RPO without frequent expensive snapshots.
- **Snapshot cost vs replay cost (RPO vs RTO).** Snapshot often → short replay on recovery (low RTO) but high steady-state cost. Snapshot rarely → cheap steady state but long replay (high RTO). For agents, replay is usually cheap (re-project a journal, not re-run the work), so lean toward *rare* snapshots + *complete* journaling. The exception: if journal replay is expensive (e.g., replay requires re-deriving large state), snapshot more often.
- **Effect-bracket cost vs correctness.** Bracketing every irreversible effect with synchronous flushes adds latency per effect (two durable writes). This is non-negotiable — the alternative is double-execution on crash (double-charge, duplicate email), which is a correctness failure, not a performance one. The cost is bounded (effects are rarer than steps) and buys "effectively once."
- **Clean-state checkpoints vs frequency.** Checkpointing only at clean states ([LRH]: green build) makes each checkpoint *useful* (restart-safe) but couples frequency to when clean states occur — you cannot checkpoint mid-edit. If clean states are far apart (a long, indivisible change), RPO suffers. Mitigation: decompose into smaller units (Topic 4) so clean states are frequent — again, unit size *is* RPO.
- **Model-scheduled vs random crashes.** The square-root result assumes random (Poisson) crashes. But deploys and cost caps are *scheduled/predictable* — you can checkpoint *right before* a known deploy window, achieving near-zero loss cheaply. Exploit predictable failures: checkpoint on the schedule of the thing that kills you, not just on a fixed interval.

## 8. Experiments: baselines, ablations, metrics

**E1 — Interval sweep (the trade curve).** Sweep $\Delta_{\text{snap}} \in \{1, 10, 50, 200\}$ under injected crashes at rate $\lambda$; measure total cost = checkpoint overhead + redo cost. **Prediction:** U-shaped total cost with a minimum near $\Delta^\star = \sqrt{2 c_{\text{ckpt}}/(\lambda c_{\text{redo}})}$. This *measures* the derived optimum. Also measure with the split design (journal-every-step + rare snapshot) — prediction: it dominates any single-frequency design (better RPO at lower cost).
**E2 — RPO verification.** Set an RPO ("lose ≤ 1 unit"); inject crashes at random steps; measure actual lost work. **Prediction:** with per-step journaling, lost work ≤ 1 unit as promised; with interval-only checkpointing at $\Delta$, lost work ≈ $\Delta/2$. Metric: distribution of lost steps per crash vs the RPO cap.
**E3 — Effect-bracket correctness (the critical one).** Crash the process *between* an irreversible effect and its `effect_done` record; run recovery; check for double-execution. **Prediction:** with the bracket + target idempotency, no double-execution; without it, duplicate effects. Metric: double-execution rate (must be zero). This tests the RPO=0 requirement.
**E4 — Predictable-failure exploitation.** Compare fixed-interval checkpointing vs checkpoint-before-scheduled-deploy. **Prediction:** for scheduled failures, targeted checkpointing achieves lower loss at lower cost than any fixed interval. Metric: lost work per deploy, checkpoint count.

**Honest status.** The RPO/RTO framework and the square-root interval are **[derived]** from standard reliability engineering, not from the agent sources. [LRH] grounds git-commit checkpoints and clean-state discipline *qualitatively* — no interval numbers, no lost-work curves. The effect-bracket correctness rests on Chapter 8's durable-execution result. **No agent source publishes a checkpoint-interval study, an RPO measurement, or the E1 trade curve.** The mechanisms (checkpoint, journal, bracket) are grounded; the frequencies and curves are engineering derivations to be measured, not source claims. Report accordingly.

## 9. Failure modes, edge cases, hazards, limitations

- **Checkpointing a broken state.** A snapshot taken mid-edit (broken build) is a recovery point that resumes into a broken state. Mitigation: checkpoint at clean/consistent states only ([LRH]); a snapshot should represent a *valid* ledger + a *green* artifact set. Decompose to make clean states frequent (Topic 4).
- **The unbracketed irreversible effect (correctness failure).** An effect performed without the intent/done bracket, crashed between execution and recording → resume redoes it → double-charge. This is the single most dangerous checkpoint-frequency failure. Mitigation: mandatory effect bracket (§6); Chapter 5 $W_{\text{irr}}$ classification decides which steps need it.
- **RPO/RTO conflation.** Setting one frequency for both, then being surprised that tight RPO forced expensive frequent snapshots (or that rare snapshots gave both loose RPO *and* slow recovery). Mitigation: split — journal for RPO, snapshot for RTO.
- **Crash-rate misestimate.** $\lambda$ is guessed wrong, so $\Delta^\star$ is wrong. Mitigation: the split design is robust to $\lambda$ (per-step journaling gives tight RPO regardless); $\Delta^\star$ only tunes *snapshot* frequency, whose stakes (RTO) are lower. Also: measure $\lambda$ from ops history rather than guessing.
- **Non-random failures break the model.** Deploys, cost caps, and OOMs are not Poisson — they are scheduled or load-correlated. The square-root result *underserves* these; a fixed interval wastes checkpoints when no crash is near and misses the scheduled one. Mitigation: exploit predictability (checkpoint before known deploys, before approaching cost caps).
- **Snapshot storage growth.** Frequent full snapshots consume storage. Mitigation: retain a bounded window of snapshots + tagged known-good ones; the journal (small events) is the real durable history, snapshots are an RTO optimization that can be pruned.
- **Limitation.** The quantitative model (square-root interval) is a planning heuristic with idealized assumptions (uniform crashes, constant per-step cost, independent redo). Real agent runs violate all three (crashes are bursty, steps vary wildly in cost, redo of a drifted state may be *more* expensive than the original). Use the model for *shape and defaults*, measure the real trade (E1), and let irreversible-effect correctness (RPO=0) and RPO caps override the cost optimum.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Git commits serve as restart-safe checkpoints enabling rollback and recovery of working base states [LRH].
- Checkpointing at *clean states* (green build, after a completed change) is grounded discipline [LRH].
- The in-flight step is re-attempted on resume (Chapter 8 D-2), forcing durable brackets around irreversible effects; "effectively once" = at-least-once + idempotency.
- Resume-from-error is a real long-running-agent capability [MAR].

**Decision rules.**
- **DR-1.** State an RPO in steps/effects, not seconds. Journal *every* step (cheap) to make RPO ≈ one unit of cheap work. Do not rely on periodic snapshots for RPO.
- **DR-2.** Snapshot periodically to bound RTO (replay cost), independently of RPO. Split the two frequencies.
- **DR-3.** For every irreversible effect, RPO = 0: bracket it (journal intent → act with target idempotency → journal done, each flushed). Never perform an irreversible effect that a crash could cause to repeat.
- **DR-4.** Checkpoint only at clean/consistent states; decompose (Topic 4) so clean states are frequent. Use $\Delta^\star = \sqrt{2 c_{\text{ckpt}}/(\lambda c_{\text{redo}})}$ as a *default* snapshot interval, capped by RPO, and exploit predictable failures (checkpoint before known deploys/caps).

**Production implications.** Checkpoint frequency is where "durable in principle" becomes "loses at most N steps in practice." The highest-leverage, lowest-cost move is *per-step journaling* — it gives tight RPO almost for free and is what [LRH]'s commit-per-change discipline approximates. The correctness-critical move is the *effect bracket* — the difference between a crash costing a redo and a crash costing a double-charge. Teams that set an explicit RPO, journal every step, snapshot for RTO, and bracket effects have a long-running agent that loses bounded work to any crash; teams that "commit occasionally" discover their RPO only when a crash reveals it.

**Connections.** RPO in step-units ties to Topic 4 (unit size = cognitive RPO) and Topic 5 (per-step journaling). Snapshots are Topic 5's ledger projections + Topic 6's artifact pins. The effect bracket is Chapter 5's $W_{\text{irr}}$/idempotency-key and Chapter 8 Topic 10's durable execution, applied across the session boundary — and its recovery semantics are Topic 9. Recovery *actions* after loading a checkpoint are Topic 11. RTO's re-anchoring cost is Topic 2. The whole apparatus is measured by Topic 15's survival curves (a crash the checkpoint recovers from is *not* an unrecoverable error).

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (git commits as checkpoints to "revert bad changes and recover working base states"; "leaves the environment in a clean state after making a code change"; commit-per-change discipline).
- **[OCP]** OpenAI — *Compaction* (`compact_threshold` as a configurable periodic-operation trigger — window management, distinct from durability checkpointing).
- **[MAR]** Anthropic — *Multi-agent research system* (resume-from-error). Via Chapter 9.
- Standard reliability engineering: RPO/RTO (disaster recovery); Young/Daly optimal-checkpoint-interval (square-root law) — **[derived]** applications, not agent-source claims.
- Internal: Chapter 3 (event-log snapshots), Chapter 5 ($W_{\text{irr}}$, idempotency key = fn(intent)), Chapter 7 (state projection), Chapter 8 Topic 10 (durable execution, D-2, "effectively once"), this chapter Topics 1 (P2, CL-1), 2 (re-anchoring/RTO), 4 (unit size = RPO), 5 (journal/snapshots), 6 (artifact version pinning), 9 (restart-safe brackets), 11 (recovery), 15 (survival).
