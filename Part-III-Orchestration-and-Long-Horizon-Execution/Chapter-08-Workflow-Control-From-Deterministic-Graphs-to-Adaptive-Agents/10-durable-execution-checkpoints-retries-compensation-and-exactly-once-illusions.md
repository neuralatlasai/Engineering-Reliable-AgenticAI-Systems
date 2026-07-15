# Topic 10 — Durable Execution, Checkpoints, Retries, Compensation, and Exactly-Once Illusions

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Making a workflow survive the death of the process running it — and being honest about what "exactly-once" can and cannot mean. The title's word *illusions* is deliberate: exactly-once execution of external effects is not achievable, and systems that claim it have redefined the term.

**Prerequisites.** Chapter 5, Topic 11 (retry, idempotency, ambiguous failure, compensation — the *action*-level treatment this topic composes); Chapter 7, Topic 3 (the event log as the authoritative record); Chapter 3, Topic 9 (cancellation, resumption, replay); Topic 8 (HITL suspension — the same mechanism).

**Terminology.** *Durable execution*: a workflow whose progress survives process death. *Checkpoint*: a persisted point from which execution can resume. *Exactly-once*: each effect happens precisely once — **an illusion for external effects** (§3.3). *At-least-once + idempotency*: the achievable substitute.

**Boundaries.** Inside: workflow-level durability, checkpointing, and the honest semantics of "exactly-once." Outside: single-action idempotency mechanics (Chapter 5, Topic 11 — assumed); long-horizon recovery as a survival discipline (Chapter 10); the event log's design (Chapter 7, Topic 3).

**Exclusions.** No workflow-engine product survey.

**Outcomes.** The reader can build a workflow that resumes correctly after process death, and can state precisely what execution guarantee their system provides — without claiming one it does not.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A workflow with a human gate (Topic 8) may pause for days. A long agent run may take hours. Processes die: deploys, crashes, preemptions, OOMs. **If the workflow's state lives only in a process's memory, the process's death is the workflow's death** — and everything it had done is lost, or worse, *partially* done with no record of what.

**Bottleneck.** The naive workflow is a Python function whose state is its call stack. It cannot be suspended, cannot be resumed, and cannot be moved to another machine. **Every discipline this chapter has built — HITL gates (Topic 8), replanning (Topic 9), long workflows — requires the workflow to outlive its process**, and an in-memory workflow cannot. The bottleneck is that durability is not a feature you add later; it is a property of how the workflow's state is represented.

**Objective.** A workflow whose progress is durable (survives process death), whose retries are safe (do not duplicate effects), whose partial failures are compensable, and whose execution semantics are **stated honestly**.

**Assumptions.** Processes die. Effects on external systems cannot be un-done by a rollback. Ambiguous failures (Chapter 5, Topic 11) are unavoidable.

**Constraints.** **True exactly-once for external effects is impossible** (§3.3) — Chapter 5, Topic 11 established that a timeout does not tell you whether the effect landed.

**Success criteria.** A workflow resumes correctly after a kill at any point; no effect is duplicated; partial failures compensate or escalate; the execution guarantee is documented accurately.

## 3. Intuition first, then formalization

### 3.1 Intuition: the workflow is a state machine over an event log, not a call stack

The reframe that makes durability tractable: **stop thinking of the workflow as a *function* and start thinking of it as a *state machine whose transitions are events*.**

A function's state is its call stack — ephemeral, process-bound, unrecoverable. A state machine's state is *data* — persistable, resumable, movable. **This is Chapter 7, Topic 3's event log, applied to the workflow**: the workflow's progress is the fold of its events, so a workflow can be resumed by replaying its log.

The consequence is architectural: **each workflow step must be a *recorded transition*, not a stack frame.** Step 3 completed → an event. Step 4 started → an event. A gate is pending → an event. **The workflow's position is always reconstructible from the log**, so a process that dies mid-workflow loses nothing except the in-flight step (which is exactly the step the recovery must handle carefully — §3.3).

This is *why* Topic 8's HITL gate and this topic are the same mechanism: a gate is a workflow that has recorded "awaiting approval" and released its process. **A system with durable execution gets HITL gates nearly for free; a system without it cannot have them at all.**

### 3.2 Formalization: the durability invariants

Let the workflow have steps $s_1, \ldots, s_n$ and an event log $E$ (Chapter 7, Topic 3). **[derived from Chapter 7, Topic 3; Chapter 5, Topic 11]**

$$
\textbf{D-1 (progress is in the log, not the process):}\quad
\text{the workflow's position} = \operatorname{fold}(F, \text{init}, E);\ \text{no progress exists only in memory.}
$$

D-1 is the durability property. **A step whose completion was not recorded did not happen, as far as recovery is concerned** — and, symmetrically, a step recorded as complete must not be re-executed on resume. **This forces a discipline: record the completion *after* the effect, and make the effect idempotent**, because the window between "effect landed" and "completion recorded" is exactly where a crash produces ambiguity (Chapter 5, Topic 11's three-state store).

$$
\textbf{D-2 (every step is idempotent or gated by a recorded key):}\quad
\text{on resume, re-executing a step must be safe — either it is idempotent, or its key marks it done.}
$$

D-2 is Chapter 5, Topic 11's idempotency, hoisted to the workflow level. **Resume *will* re-attempt the in-flight step** (it was not recorded complete), so that step must be safe to re-attempt. **A workflow with a non-idempotent step and no key is a workflow that duplicates effects on every crash-resume.**

$$
\textbf{D-3 (compensation is best-effort and must be planned):}\quad
\text{partial failure leaves the world in neither the before nor the after state;}\ \text{compensators are best-effort (Ch.5 T11).}
$$

D-3 imports Chapter 5, Topic 11's honesty: a multi-step workflow that fails midway has applied some effects and not others. **There is no rollback** — these are separate systems with no shared transaction. Compensation (undo what was done, in reverse) is *best-effort*, can itself fail, and cannot undo effects that left your domain (an email sent).

### 3.3 The exactly-once illusion — stated plainly

The topic's central honesty, and the reason *illusions* is in the title.

**"Exactly-once execution" of an external effect is not achievable.** The argument is Chapter 5, Topic 11's, and it is airtight:

1. You dispatch an effect (charge a card, send an email) to an external system.
2. The connection times out. **You do not know whether the effect landed.**
3. You have two choices: **retry** (risking a *double* effect) or **do not retry** (risking *no* effect).
4. **There is no third option**, because the information you need — did it land? — is not available to you.

So the honest guarantees are:

- **At-most-once:** never retry. Effects may be *lost*.
- **At-least-once:** always retry. Effects may be *duplicated*.
- **At-least-once + idempotency = "effectively once":** retry, but with an idempotency key the *target system* honors, so the duplicate is a no-op. **This is what systems mean when they say "exactly-once," and it is only as strong as the target's idempotency support.**

**The critical qualifier: "effectively once" requires the *target system* to support idempotency keys.** If it does not — and many do not — you cannot achieve it, and your only honest options are at-most-once, at-least-once, or **verify-then-act** (query the target to determine what happened — Chapter 5, Topic 11's §3.3) or **escalate**.

**A workflow engine that advertises "exactly-once" is describing *its own* internal step execution** (it will not run your step function twice) **— not the external effects your step performs.** Conflating these is the illusion, and it is how teams end up double-charging customers with a system they believed was exactly-once. **State your actual guarantee, per effect, and know that it depends on the target.**

## 4. Architecture

```
   WORKFLOW = a STATE MACHINE over an EVENT LOG (§3.1) — not a call stack
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ EVENT LOG (Ch.7 T3 — authoritative)                                       │
   │   e1: step_1_started    e2: step_1_completed(result)                      │
   │   e3: step_2_started    e4: gate_pending(approval_id)   ← process RELEASED│
   │   ... hours pass ...                                                      │
   │   e5: approval_granted  e6: step_2_completed            ← RESUMED         │
   └───────────────────────────┬──────────────────────────────────────────────┘
                                │  D-1: position = fold(F, init, E)
                                ▼        no progress lives only in memory
                     RESUME on a NEW process, hours later, possibly elsewhere

   THE CRASH WINDOW (the hard part):
        effect dispatched ──┐
                            │  ← CRASH HERE: effect may or may not have landed
        completion recorded ┘     (Ch.5 T11's ambiguous failure — UNAVOIDABLE)
   D-2: on resume, the in-flight step IS re-attempted ⇒ it MUST be idempotent
        or gated by a recorded key.

   EXECUTION GUARANTEES — state yours honestly (§3.3):
   ┌────────────────────┬──────────────────────────────────────────────────────┐
   │ at-most-once       │ never retry. Effects may be LOST.                     │
   │ at-least-once      │ always retry. Effects may be DUPLICATED.              │
   │ "effectively once" │ at-least-once + idempotency key THE TARGET HONORS.    │
   │                    │ ← this is what "exactly-once" ACTUALLY means           │
   │ EXACTLY-ONCE       │ ✗ NOT ACHIEVABLE for external effects. The illusion.  │
   └────────────────────┴──────────────────────────────────────────────────────┘
   If the target has no idempotency support: verify-then-act, or ESCALATE (Ch.5 T11).
```

**The workflow engine's "exactly-once" is about *its* steps, not *your* effects.** This distinction is the architecture's honesty requirement: the engine guarantees it will not invoke your step function twice for the same logical step. **It cannot guarantee that the HTTP request your step made was not received twice** — that depends entirely on what your step did and what the target system supports.

## 5. Grounding

- **The event log is the authoritative record and enables reconstruction:** sessions hold "complete event history, enabling state reconstruction, session rewinding, and observability" [ADK]; the Session is "the durable log of the interaction" [GCA] — D-1's basis (Chapter 7, Topic 3).
- **Commit-before-continue:** execution pauses at each yield, and "only after the Runner processes and commits the event does execution continue," so resumed code "can reliably assume that the state changes signaled in the yielded event have been committed" [ADK]. **This is D-1, shipped** — the log is on the critical path, not a trailing copy.
- **The documented dirty-read window:** within an invocation, "dirty reads" of uncommitted local state are possible, at the risk that "the invocation fails before state-carrying events are processed" [ADK] — **the crash window, documented by a vendor.**
- **Ambiguous failure makes exactly-once impossible:** Chapter 5, Topic 11 — a timeout does not tell you whether the effect landed; the responses are retry-with-key, verify, or escalate. **§3.3's argument, established.**
- **Idempotency keys must be a function of intent, and the store needs three states:** Chapter 5, Topic 11's §3.2 (a per-attempt UUID protects nothing; the `in_flight` state is what makes the crash window survivable) — D-2's mechanics.
- **Compensation is best-effort, not transactional:** Chapter 5, Topic 11's §3.4 (sagas; compensators can fail; effects outside your domain cannot be undone) — D-3.
- **Rollback is a permission-tier obligation:** tiers must specify "audit logs, **rollback mechanisms**, and human-in-the-loop gates" [CAH §5, §3.4.4] — compensation as governance.
- **Reversible execution is an open problem:** [CAH §5] lists "reversible execution" and "side-effect prediction" among open problems — **the sources do not claim this is solved**, and neither does this book.
- **Replay requires environment reproducibility:** "replay the same patch, command, seed, dependency lockfile" [CAH §3.4.3] — resuming a workflow into a *changed* environment replays a counterfactual (Chapter 3, Topic 4).

**Evidence gap.** The event-sourcing mechanics are **documented** [ADK; GCA] and the impossibility of exactly-once follows from the **established** ambiguous-failure analysis (Chapter 5, Topic 11). D-1..D-3 are **[derived]** by composing Chapter 7, Topic 3 (durability) with Chapter 5, Topic 11 (idempotency/compensation) at the workflow level. **No source measures durable-execution overhead, crash-window duplication rates, or compensation success rates for agent workflows** — Chapter 3, Topic 4's cost gap persists. **Reversible execution is explicitly open** [CAH §5]. §8 measures locally.

## 6. Implementation

**The workflow as a resumable state machine over an event log (D-1):**

```python
class DurableWorkflow:
    """§3.1: the workflow's position is the FOLD of its events (Ch.7 T3), not a call stack.
    A process death loses nothing except the in-flight step — which D-2 makes safe."""

    async def run(self, workflow_id: str, steps: list[Step], ctx) -> StepResult:
        log = await ctx.event_log.load(workflow_id)
        position = fold_position(log)                       # D-1: where are we?

        for i, step in enumerate(steps):
            if position.completed(i):
                continue                                    # already done — do NOT re-execute

            await ctx.event_log.append(StepStarted(i, step.name))   # BEFORE the effect

            result = await self.execute_idempotent(step, i, workflow_id, ctx)   # D-2

            if result.kappa == "pending_approval":          # Topic 8 — the gate
                await ctx.event_log.append(GatePending(i, result.approval_id))
                raise SuspendWorkflow(resume_on=f"approval:{result.approval_id}")
                # process RELEASED. Resumed hours later, possibly on another machine.

            if not result.succeeded:
                return await self.handle_failure(result, i, steps, workflow_id, ctx)

            await ctx.event_log.append(StepCompleted(i, result))    # AFTER the effect
            # ↑ the window between the effect and THIS is the crash window (§3.3)

        return StepResult(content=position.result, kappa="success", ...)
```

**D-2: the in-flight step WILL be re-attempted on resume — make it safe:**

```python
async def execute_idempotent(self, step, i, workflow_id, ctx) -> StepResult:
    """D-2: resume re-attempts the in-flight step (it was not recorded complete).
    So it MUST be idempotent or key-gated. Ch.5 T11's THREE-state store handles the
    crash window: absent / in_flight / committed."""
    key = idempotency_key(workflow_id, i, step.name, step.args)    # fn of INTENT (Ch.5 T11)

    state = await ctx.keys.get(key)
    if state and state.status == "committed":
        return state.result                              # true no-op — replay the result

    if state and state.status == "in_flight":
        # We crashed mid-flight. We DO NOT KNOW if the effect landed. (Ch.5 T11 §3.3)
        if step.postcondition:
            if await step.postcondition_holds(ctx):
                await ctx.keys.commit(key, Result.ok("verified: already applied"))
                return Result.ok("already applied (verified)")
        # No sensor. DO NOT GUESS. This is the honest branch.
        return StepResult(content=None, kappa="execution_error",
                          note="prior attempt interrupted; outcome indeterminate. Escalating.")

    await ctx.keys.put(key, status="in_flight")          # BEFORE the effect
    result = await step.execute(ctx, idempotency_key=key)   # target honors the key (if it can)
    await ctx.keys.commit(key, result)                   # AFTER the effect
    return result
```

**State the guarantee honestly (§3.3) — per effect, not per system:**

```python
class ExecutionGuarantee(Enum):
    AT_MOST_ONCE   = "at_most_once"      # never retry — effects may be LOST
    AT_LEAST_ONCE  = "at_least_once"     # always retry — effects may be DUPLICATED
    EFFECTIVELY_ONCE = "effectively_once"  # at-least-once + TARGET-HONORED idempotency key
    # EXACTLY_ONCE does not exist for external effects. (§3.3)

@dataclass
class Step:
    guarantee: ExecutionGuarantee
    target_honors_idempotency_key: bool

    def __post_init__(self):
        if self.guarantee is ExecutionGuarantee.EFFECTIVELY_ONCE \
           and not self.target_honors_idempotency_key:
            raise ValueError(
                f"{self.name}: claims 'effectively once' but the TARGET does not honor "
                f"idempotency keys. You cannot achieve it. Your real options are: "
                f"at-least-once (may duplicate), at-most-once (may lose), "
                f"verify-then-act, or escalate. (§3.3)"
            )
```

**Compensation, honestly best-effort (D-3):**

```python
async def compensate(applied: list[Step], ctx) -> list[str]:
    """D-3 / Ch.5 T11: BEST-EFFORT. Compensators can fail. Effects outside your domain
    (an email sent) cannot be undone. Report what could NOT be undone."""
    failures = []
    for step in reversed(applied):                       # reverse order
        c = step.compensator
        if c is None or not c.tested:                    # untested ⇒ does not exist (Ch.5 T11)
            failures.append(f"{step.name}: NO TESTED COMPENSATOR — effect stands")
            continue
        try:
            await c.run(ctx)
        except Exception as e:
            failures.append(f"{step.name}: compensation FAILED: {e}")
    if failures:
        await ctx.escalate("partial failure with incomplete compensation", failures)
    return failures
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| **Durable execution (D-1)** | Survives process death; **enables HITL gates (Topic 8)** and long runs | An event log; every step is a recorded transition |
| In-memory workflow | Simple | **Cannot pause, resume, or survive a deploy** |
| Idempotent steps (D-2) | Safe resume; safe retry | The target must support keys — **often it does not** |
| Three-state key store | Crash-window correctness | An extra write per step |
| Compensation (D-3) | Recovery from partial failure | **Best-effort**; compensators must be *tested* |
| Claiming exactly-once | Sounds good | **A lie that ends in double-charged customers** |
| Stating the real guarantee | Honest; actionable | Requires admitting the limit |

**The trade that is not optional: durability is a prerequisite, not a feature.** Every capability this chapter built on top of long-running control — HITL gates (Topic 8), replanning across failures (Topic 9), workflows that outlive a deploy — **requires D-1**. A team that builds these on an in-memory workflow will find that none of them survive contact with production, and the fix is not a patch but a rearchitecture. **Build the durability first.**

**The honesty trade (§3.3) has an asymmetric cost.** Claiming exactly-once is free and pleasant *until* the day an ambiguous failure duplicates a payment — at which point the claim is revealed as a fiction that a team relied on. **Stating "at-least-once with idempotency where the target supports it, at-least-once otherwise" is less impressive and is *true*** — and it directs engineering attention to the targets that do not support keys, which is where the real risk lives. **The honest statement is the one that makes the system safer, because it names what must be fixed.**

## 8. Experiments

**The kill-and-resume test — the fundamental durability test.** Kill the process at *every* step boundary and *inside* each step (the crash window). Resume. **Measure: does the workflow complete correctly, and — critically — are any effects duplicated or lost?**

- **Kill between steps:** should resume cleanly (D-1).
- **Kill inside a step, after the effect but before the completion record:** **this is the crash window.** With D-2's key + three-state store, the resume detects `in_flight` and verifies or escalates. **Without it, the effect duplicates.**

**Report duplicate-effect count with the zero-failure bound** $p_{\max}=1-(1-\gamma)^{1/n}$ over $n$ injected crashes (Chapter 1, Topic 12). **"We killed it a few times and it seemed fine" is not a claim.**

**The guarantee audit (§3.3).** For every step that performs an external effect: **does the target honor idempotency keys?** Enumerate them. **Every step whose target does not is a step where your real guarantee is at-least-once (may duplicate) or at-most-once (may lose)** — and you must choose which, and say so. **This audit typically finds several steps claiming a guarantee they cannot deliver.**

**The compensation test.** Fail a multi-step workflow midway; run compensation. **Measure: what fraction of applied effects were successfully undone?** Untested compensators fail here — and Chapter 5, Topic 11's rule applies: an untested compensator does not exist, so the step is irreversible.

**The suspension test (ties to Topic 8).** Suspend at a gate; kill the process; deliver the approval hours later; resume. **This is the test that proves HITL is real** — and it fails immediately on an in-memory workflow.

**Statistics.** Zero-failure bounds on duplicate effects and lost effects (targets zero); Wilson on compensation success rate; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **In-memory workflow.** Process death loses everything; HITL gates and long runs are impossible. **The architectural failure.** Mitigation: D-1 — the workflow is a state machine over an event log.
- **The crash window duplicates an effect.** Crash between the effect and its completion record; resume re-executes. **The hardest and most expensive failure.** Mitigation: D-2 — idempotency key + three-state store (Chapter 5, Topic 11); verify-or-escalate when there is no key.
- **Claiming exactly-once.** A guarantee that does not exist for external effects (§3.3); relied on; a payment is duplicated. Mitigation: state the real guarantee per effect; audit the targets.
- **Per-attempt idempotency key.** A UUID minted per attempt protects nothing — every retry gets a new key (Chapter 5, Topic 11). Mitigation: the key is a function of *intent*.
- **Two-state key store.** No `in_flight`; the crash window produces either duplication (if re-executed) or **silent loss** (if suppressed). Mitigation: three states.
- **Untested compensator.** Fails when finally invoked, during an incident. Mitigation: test compensators in CI; untested ⇒ the step is irreversible (Chapter 5, Topic 11).
- **Resume into a changed environment.** The workflow resumes hours later; the world has moved; the plan's assumptions are stale (Topic 9's refutation; Chapter 6, Topic 8's staleness). Mitigation: **re-validate assumptions on resume** — a resumed workflow is not a paused one, it is a *restarted* one in a possibly-different world.
- **Replay without environment reproducibility.** Re-deriving state against an environment that has moved on — "replay the same patch, command, seed, dependency lockfile" [CAH §3.4.3] or it replays a counterfactual. Mitigation: pin what you can; accept that external state cannot be replayed.
- **Edge case — the effect that cannot be verified.** No idempotency key, no query API. You cannot know whether it landed. Mitigation: **this is the escalate branch** (Chapter 5, Topic 11) — and it is honest. A system that guesses here will be wrong at a rate set by its infrastructure.
- **Open limitation.** **Exactly-once for external effects is impossible** (§3.3), and **reversible execution is an explicitly open problem** [CAH §5]. **No source measures durable-execution overhead, crash-window duplication rates, or compensation success rates** for agent workflows. D-1..D-3 are **[derived]** compositions of Chapter 7, Topic 3 and Chapter 5, Topic 11. §8 measures locally.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. The event log is authoritative and enables "state reconstruction, session rewinding, and observability" [ADK]; the Session is "the durable log of the interaction" [GCA].
2. **Commit-before-continue** puts the log on the critical path: resumed code "can reliably assume that the state changes signaled in the yielded event have been committed" [ADK].
3. A **dirty-read window** exists within an invocation, risking loss if "the invocation fails before state-carrying events are processed" [ADK] — the crash window, documented.
4. Ambiguous failure makes exactly-once impossible: a timeout does not tell you whether the effect landed (Chapter 5, Topic 11).
5. Compensation is **best-effort**, not transactional (Chapter 5, Topic 11); rollback is a permission-tier obligation [CAH §5].
6. **Reversible execution is an open problem** [CAH §5].
7. **No source measures durable-execution overhead or duplication rates.**

**Decision rules.**
- **The workflow is a state machine over an event log, not a call stack** (D-1) — build durability first; every long-running capability depends on it.
- **The in-flight step WILL be re-attempted on resume** (D-2) — it must be idempotent or key-gated, with a three-state store.
- **Exactly-once does not exist for external effects** (§3.3) — say "at-least-once with idempotency where the target supports it," and audit which targets do.
- **The idempotency key is a function of intent**, not of the attempt.
- **Compensation is best-effort and must be tested** — untested ⇒ the step is irreversible.
- **Re-validate assumptions on resume** — a resumed workflow restarts into a world that may have changed.
- **When you cannot verify and have no key: escalate.** Do not guess.

**Production implications.**
1. Build durable execution before HITL gates or long workflows; they are impossible without it, and retrofitting is a rearchitecture.
2. Run the kill-and-resume test *inside* the crash window and report duplicate effects with the zero-failure bound; this is the test that finds the expensive bug.
3. Audit every external-effect step for target idempotency support; the ones without it are where your guarantee is weaker than you think.
4. Replace any "exactly-once" claim in your documentation with the true guarantee; the honest statement is what directs attention to the real risk.

**Connections.** This topic composes Chapter 7, Topic 3 (the authoritative event log) with Chapter 5, Topic 11 (idempotency, ambiguous failure, compensation) at the workflow level, and it is the mechanism behind Topic 8's HITL suspension (they are the same thing). Topic 9's replanning survives failures because of it; Topic 7's typed state is what gets persisted; Topic 11 proves the resumable workflow terminates. **Chapter 10 takes this and makes it the survival discipline for long-horizon agents** — checkpointing, compaction, and recovery at horizon scale.

## Sources

[ADK] Google ADK runtime event loop — sessions holding "complete event history, enabling state reconstruction, session rewinding, and observability"; **commit-before-continue** ("only after the Runner processes and commits the event does execution continue"; resumed code "can reliably assume that the state changes signaled in the yielded event have been committed"); the documented **dirty-read window** ("the invocation fails before state-carrying events are processed") — https://adk.dev/runtime/event-loop/
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — Session as "the durable log of the interaction," capturing every message, tool call, result, control signal, and error as structured Event objects — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.3 (replay requiring environment reproducibility: "replay the same patch, command, seed, dependency lockfile"), §3.4.4 and §5 (permission tiers specifying "audit logs, **rollback mechanisms**, and human-in-the-loop gates"; **"reversible execution"** and "side-effect prediction" as **open problems**), §3.5 ("poor retry policies" among recurring non-model failure mechanisms)
