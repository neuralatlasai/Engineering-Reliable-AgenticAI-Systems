# Topic 3 — Event Logs as the Authoritative Execution Record

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The claim that the *event log* — not the current state snapshot — is the authoritative record of what happened, and that state is a *projection* of it. This is Chapter 3, Topic 4's event-sourcing argument, made the foundation of the persistence layer.

**Prerequisites.** Chapter 3, Topic 4 (event-sourced vs request–response; the formal recovery condition); Topic 2 (state changes are events, per [ADK-S]); Chapter 1, Topic 12 (the observable trace $\hat\tau$).

**Terminology.** *Event*: an immutable, ordered record of one thing that happened. *Event log*: the append-only sequence of them. *Projection*: a state view computed by folding the log. *Authoritative record*: the source of truth from which all state derives.

**Boundaries.** Inside: why the log is authoritative, what it must contain, and how state derives from it. Outside: the runtime loop that produces events (Chapter 3); the durable-store mechanics (Topic 4); replay/recovery at horizon scale (Chapter 10).

**Exclusions.** No event-store product survey; no full CQRS apparatus (Chapter 3, Topic 4's limitation carries).

**Outcomes.** The reader can make their event log the source of truth, reconstruct any state from it, and answer "what happened and why" from the record rather than from a mutable snapshot.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Two things can claim to be "the truth" about an agent run: the **current state** (a snapshot: task status, variables, position) and the **event log** (the sequence of everything that happened). If the snapshot is authoritative, then *how* the state got there is lost — you know the balance but not the transactions. And a mutable snapshot has no answer to "why did the agent believe X at turn 40," because the belief that produced X was overwritten.

**Bottleneck.** Debugging, auditing, evaluation (Chapter 5, Topic 13), and recovery (Chapter 10) all require the *history*, not just the endpoint. A system whose truth is a mutable snapshot cannot serve any of them: it cannot replay, cannot attribute, cannot audit, and cannot recover to an intermediate point. The bottleneck is that state-as-truth discards exactly the information every downstream consumer needs.

**Objective.** Make the append-only event log authoritative and derive every state view from it by projection — so history is never lost, state is always reconstructible, and "what happened" is always answerable.

**Assumptions.** Events are immutable and ordered. State is a pure function of the events (Chapter 3, Topic 4's fold).

**Constraints.** The log grows without bound (Chapter 3, Topic 4's log-unboundedness); it needs its own compression strategy (Topic 8; Chapter 6, Topic 11), distinct from the model-facing one.

**Success criteria.** Any state view is reconstructible from the log; every state change is an event; the log is complete enough to answer audit and recovery queries.

## 3. Intuition first, then formalization

### 3.1 Intuition: keep the transactions, not just the balance

The banking analogy from Chapter 3, Topic 4 is the whole intuition, and it is exact. A bank does not store your balance as the truth and update it; it stores the *ledger of transactions* and computes the balance by summing them. The ledger is authoritative because it can answer everything: the current balance (sum), the balance last Tuesday (sum up to Tuesday), how you got here (read the entries), and whether an error occurred (audit the entries). A balance-only system can answer only the first.

Agent state is the same. [GCA] states the architecture directly: the Session is "the durable log of the interaction," capturing "every user message, agent reply, tool call, result, control signal, and error as structured Event objects" [GCA]. And [ADK-S] makes state a *consequence* of events: every state change travels as a `state_delta` in an event processed by `append_event`, which "Adds the event to session history" and "Applies `state_delta` changes correctly" [ADK-S] — the state is the fold of the deltas.

The payoff is the four capabilities a snapshot cannot provide **[synthesis]**:

- **Reconstruction** — recompute state at any point (Chapter 10's recovery).
- **Audit** — "what happened, who approved it, what changed" (Chapter 5, Topic 10's durable approvals; Topic 14's deletion audit).
- **Attribution** — which events produced this output (Chapter 6, Topic 14).
- **Time-travel** — the state as of turn 20, for debugging or rewind [ADK-S's session rewinding].

**A mutable snapshot forfeits all four to save some storage.** That is the trade, and it is almost always the wrong one for an agent, because agents are exactly the systems whose *process* — not just outcome — must be inspectable (Chapter 1's whole measurement argument).

### 3.2 Formalization: state as a projection

Let $e_1, e_2, \ldots, e_n$ be the ordered event log and $z_0$ the initial state. State at step $k$ is the fold (Chapter 3, Topic 4):

$$
z_k\ =\ \operatorname{fold}(F,\ z_0,\ e_{1:k})\ =\ F(F(\cdots F(z_0, e_1)\cdots, e_{k-1}), e_k),
$$

where $F$ is the reducer (in [ADK-S], applying `state_delta`). Two invariants make the log authoritative **[derived from Chapter 3, Topic 4]**:

$$
\textbf{E-1 (state is derived):}\quad
\text{every state view } z \text{ is } \operatorname{fold}(F, z_0, e_{1:k})\ \text{for some } k;\ \text{there is no state not so derivable.}
$$
$$
\textbf{E-2 (events are immutable and append-only):}\quad
\text{events are never modified or deleted}^\dagger;\ \text{corrections are new events.}
$$

E-1 is what makes reconstruction possible: if *all* state is a fold of events, then any state — current, past, or post-recovery — is recomputable. E-2 is what makes audit trustworthy: an immutable log cannot be rewritten to hide what happened. Together they are the authoritative-record property.

$^\dagger$ The dagger is Topic 14's exception: **deletion for privacy is the one sanctioned mutation of the log**, and it is a governed, audited exception (right-to-erasure), not a normal operation. This tension — immutability for audit vs deletion for privacy — is real and is resolved in Topic 14, not wished away here.

The recovery condition (Chapter 3, Topic 4, restated): $\widehat z_n = z_n$ holds only if the log is *complete and ordered* for the projection, the reducer $F$ matches the version that produced the events, and external effects are reconciled separately. **Reconstruction rebuilds observable state $\hat\tau$; it does not rerun the stochastic $\pi_M$ nor recover the latent trajectory $\tau^\star$** (Chapter 1, Topic 12). The log is authoritative about *what was recorded*, which is exactly $\hat\tau$ and no more.

### 3.3 What the log must contain to be authoritative

A log is authoritative only if it is *complete for the questions it must answer*. [GCA]'s enumeration is the completeness target: "every user message, agent reply, tool call, result, control signal, and error" [GCA]. Mapping to Chapter 1, Topic 12's $\hat\tau$, the log must capture **[synthesis]**:

$$
\hat\tau\ \supseteq\ \{\text{requests},\ \text{proposals } y_t,\ \text{candidate/admitted/executed actions},\ \text{tool results},\ \kappa\text{ history},\ \text{usage},\ \text{state deltas},\ \text{validator outputs}\}.
$$

The failure this prevents: a log that records *state changes* but not the *decisions that caused them* can reconstruct the state but not explain it. **Audit and attribution need the causes, not just the effects** — the tool call *and* the model proposal that requested it, the state delta *and* the event that carried it. A log missing the causes is authoritative about *what* but useless about *why*, which is half of what a log is for.

## 4. Architecture

```
   AGENT LOOP (Chapter 3, Topic 3) produces events
        │
        ▼
   ┌──── EVENT LOG (append-only, immutable, ordered) — THE SOURCE OF TRUTH ──────┐
   │  e1: user_message                                                           │
   │  e2: model_proposal y_t          ← the CAUSE (§3.3)                          │
   │  e3: tool_call (admitted a_t)                                                │
   │  e4: tool_result + state_delta{step: 2}   ← the EFFECT                       │
   │  e5: control_signal (κ = continue)                                           │
   │  ...                                                                         │
   └───────────────────────────────┬───────────────────────────────────────────┘
                                    │  fold(F, z0, e_1:k)  (E-1)
                ┌───────────────────┼───────────────────┬────────────────┐
                ▼                   ▼                   ▼                ▼
        current state z_n     state @ turn 20      audit view       recovery
        (task position)       (time-travel)        (who/what/why)   (Chapter 10)
                                    │
                                    ▼
                     PROJECTIONS are derived, disposable, rebuildable.
                     The LOG is authoritative. (Topic 1: log = memory,
                                                 projection = cache.)
```

**The Topic 1 connection, sharpened.** In the taxonomy, **the event log is authoritative memory (K-2: not evictable for budget) and every projection is a cache (K-1: rebuildable from the log).** This is why a state snapshot may be discarded and recomputed but the log may not be dropped for space — dropping the log is deleting the truth. Log *compression* (Topic 8) is not deletion: it summarizes while retaining the ability to answer the queries that matter, and it retains originals or a lossless-enough digest (Chapter 3, Topic 4's Digester; HarnessX's ~10M-token-per-run trace compression [HX §4.3]).

**Commit-before-continue [ADK; Chapter 3, Topic 4].** The event is committed *before* execution proceeds, so resumed logic can "reliably assume that the state changes signaled in the yielded event have been committed" [ADK]. The log is not a passive record written after the fact — it is written *on the critical path*, which is what makes it authoritative rather than a lossy trailing copy.

## 5. Grounding

- **Session as the durable log:** "the durable log of the interaction," capturing "every user message, agent reply, tool call, result, control signal, and error as structured Event objects" [GCA] — the completeness target of §3.3.
- **State derives from events:** state changes travel as `state_delta` in events; `append_event` "Adds the event to session history" and "Applies `state_delta` changes correctly" [ADK-S] — E-1, shipped.
- **Direct mutation breaks the record:** bypassing events "loses auditability" and "breaks persistence" [ADK-S] — the negative case that proves events must be the channel.
- **Commit-before-continue:** execution resumes only after the Runner processes and commits the yielded event [ADK] (Chapter 3, Topic 4) — the log is on the critical path.
- **Sessions enable reconstruction and rewind:** sessions hold "complete event history, enabling state reconstruction, session rewinding, and observability" [ADK] (Chapter 3, Topic 1) — E-1 and time-travel, named.
- **The formal recovery condition and its limits** are Chapter 3, Topic 4: reconstruction needs a complete, ordered log and a version-matched reducer, and rebuilds $\hat\tau$, not $\tau^\star$.
- **Deep telemetry is the log's analytic form:** structured traces linking "model decisions, harness actions, environment states, and outcomes" [CAH §3.5.1]; the trace store is "a structured record of execution events" [HX §4.3] — the log is what deep telemetry and trace-driven harness improvement consume.
- **The log-unboundedness constraint:** a per-iteration run can generate ~10M tokens of raw traces [HX §4.3], which is why the log needs its own compression (Topic 8).

**Evidence gap.** The event-sourcing *architecture* is documented [GCA; ADK; ADK-S] and its *properties* are derived (Chapter 3, Topic 4). **No source measures the cost of event-sourcing vs snapshot state** for agents (storage overhead, reconstruction latency) — Chapter 3, Topic 4 noted this gap and it persists. The claim that the log's four capabilities justify its cost is a **reasoned trade** (the capabilities are real; their value is workload-dependent), not a measured one. §8 is how you price it locally.

## 6. Implementation

**The append-only log with derived state:**

```python
@dataclass(frozen=True)
class Event:
    """Immutable (E-2). Records CAUSE and EFFECT (§3.3)."""
    seq: int
    kind: str                      # user_message | model_proposal | tool_call | tool_result | control
    payload: dict
    state_delta: dict              # the EFFECT on state (Topic 2)
    timestamp: datetime
    # cause fields — what produced this (for audit/attribution, §3.3)
    caused_by: int | None = None   # seq of the event that led here

class EventLog:
    """The authoritative record. Append-only. State is a projection (E-1)."""
    def __init__(self, z0: dict):
        self._events: list[Event] = []
        self._z0 = z0

    def append(self, event: Event) -> None:
        assert event.seq == len(self._events), "gap or reorder — log must be contiguous"
        self._events.append(event)             # never modify; corrections are new events (E-2)

    def project(self, upto: int | None = None) -> dict:
        """fold(F, z0, e_1:k). State at any point — current, past, or recovery. (E-1)"""
        z = dict(self._z0)
        for e in self._events[:upto]:
            z.update(e.state_delta)             # F: apply the delta (Topic 2)
        return z

    def audit(self, key: str) -> list[Event]:
        """WHY does state[key] have its value? The events that set it. (§3.3)"""
        return [e for e in self._events if key in e.state_delta]
```

**Time-travel and recovery fall out for free:**

```python
def state_at_turn(log: EventLog, turn: int) -> dict:
    return log.project(upto=turn_boundary(log, turn))   # debugging, rewind [ADK]

def recover(log: EventLog) -> dict:
    """Chapter 10's recovery: rebuild from the log. Reconstructs τ̂, NOT τ* (Ch.1 T12)."""
    z = log.project()
    reconcile_external_effects(z, log)     # external effects reconciled separately (Ch.3 T4)
    return z
```

**Log compression that is not deletion (Topic 8):**

```python
def compress_log(log: EventLog, keep_recent: int) -> EventLog:
    """Distinct from model-facing compaction (Ch.6 T11). Summarize OLD events while
    RETAINING the ability to answer audit/recovery. Never drop the log for space (K-2)."""
    old = log._events[:-keep_recent]
    digest = summarize_events(old)          # Chapter 3, Topic 4's Digester [HX §4.3]
    archive(old)                            # originals archived, not destroyed
    return EventLog.from_digest(digest, log._events[-keep_recent:])
```

## 7. Trade-offs

| Property | Event log (authoritative) | State snapshot (authoritative) |
|---|---|---|
| Reconstruction | Any point, by fold (E-1) | Current only |
| Audit / "why" | Full — causes retained (§3.3) | None — overwritten |
| Attribution (Ch.6 T14) | Native | Impossible |
| Time-travel / rewind | Native [ADK] | None |
| Recovery (Ch.10) | Replay from log | Restore last snapshot only |
| Storage | **Grows unbounded** [HX §4.3] | Bounded |
| Read latency | Fold cost (mitigated by projections/snapshots) | O(1) |
| Write | Append + commit (Ch.3 T4) | In-place update |

**The trade, honestly.** The log costs *storage* (it grows) and *read latency* (state is a fold, not a lookup). It buys *reconstruction, audit, attribution, time-travel, and recovery* — the five capabilities that a snapshot cannot provide at any price. **For an agent, the process must be inspectable (Chapter 1), so the log's capabilities are not optional extras — they are requirements, and the snapshot's cheapness buys a system that cannot be debugged, audited, or recovered.** The storage/latency costs are mitigable (snapshot the projection periodically, compress old events — §6); the snapshot's missing capabilities are not recoverable at all. This asymmetry is why event-sourcing is the default for serious agents, not because it is cheaper.

**The mitigation for read latency:** cache projections. A projection is a cache (Topic 1, K-1) — derived from the log, rebuildable, evictable. So you may keep a materialized snapshot for O(1) reads *and* the log for authority, with the snapshot as a disposable cache of the fold. **This is not a compromise of the architecture; it is the architecture — authoritative log, cached projection.**

## 8. Experiments

**Reconstruction fidelity — the core test.** Take a run; discard the state snapshot; reconstruct from the log alone. **Does the reconstructed state match the live state?** Any divergence means the log is *incomplete* — some state change did not travel as an event (an E-1 violation, likely a direct mutation, Topic 2). Report the divergence rate; the target is zero.

**The recovery test (ties to Chapter 10).** Kill the process mid-run; recover from the log; measure what resumes correctly. **This is Chapter 3, Topic 9's kill-and-resume, at the persistence layer** — and the only way to know your log is complete enough to recover is to actually recover from it.

**The audit-completeness test (§3.3).** For a sample of outputs, ask "why" — can the log explain the decision (the proposal, the tool call, the state delta) and not just the state? **A log that records effects but not causes fails this**, and it fails silently until an incident needs the "why."

**Cost measurement.** Storage growth per run; reconstruction latency vs snapshot-read latency; compression ratio of the log digest (§6). **This prices the trade for your workload** — the number no source provides.

**Statistics.** Zero-failure bound on reconstruction divergence and recovery failures; report storage/latency distributions (p50/p95); $n$ always (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **State-as-truth.** A mutable snapshot is authoritative; history is lost; nothing can be reconstructed, audited, or recovered. **The default failure.** Mitigation: make the log authoritative; state is a projection (E-1).
- **Incomplete log.** State changes that bypass events (direct mutation, Topic 2) leave the log unable to reconstruct. Mitigation: event-only mutation; the reconstruction-fidelity test.
- **Effects without causes.** The log records state deltas but not the decisions that caused them; reconstruction works, audit does not. Mitigation: §3.3 completeness; record proposals, tool calls, and $\kappa$, not just deltas.
- **Log dropped for space.** Treating the authoritative log as evictable (a Topic 1 category error, K-2). Mitigation: compress (§6), never delete; retain a digest that answers audit/recovery.
- **Reducer version drift.** The reducer $F$ changes; old events fold differently; reconstruction diverges (Chapter 3, Topic 4; Chapter 4, Topic 13). Mitigation: version the reducer; migrate (Topic 13).
- **External-effect divergence.** Reconstructed agent state assumes a world that has moved on (an email was sent, a row written). Mitigation: reconcile external effects separately (Chapter 3, Topic 4); the log rebuilds $\hat\tau$, not the world.
- **Unbounded growth ignored.** The log fills storage; ~10M tokens/run [HX §4.3]. Mitigation: log-specific compression (Topic 8), distinct from model-facing compaction.
- **Edge case — the privacy-deletion tension (E-2 dagger).** An immutable log and a right-to-erasure are in direct conflict. Mitigation: Topic 14's governed, audited deletion — the one sanctioned mutation, not a normal write. This is a real architectural tension, resolved there, not here.
- **Open limitation.** **No source measures event-sourcing's cost vs snapshots for agents** (Chapter 3, Topic 4's gap persists). The five-capability justification is a reasoned trade; its value is workload-dependent and priced locally (§8). Reconstruction rebuilds $\hat\tau$ only — the latent trajectory and the moved-on world are out of reach (Chapter 1, Topic 12).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. The Session is "the durable log of the interaction" — every message, tool call, result, signal, and error as Event objects [GCA].
2. State changes travel as `state_delta` in events; `append_event` applies them and appends to history [ADK-S] — state is derived (E-1).
3. Direct mutation "loses auditability" and "breaks persistence" [ADK-S] — events must be the channel.
4. Sessions holding "complete event history" enable "state reconstruction, session rewinding, and observability" [ADK].
5. Commit-before-continue puts the log on the critical path [ADK].
6. The trace store is "a structured record of execution events" driving harness improvement [HX §4.3; CAH §3.5.1].
7. **No source prices event-sourcing vs snapshots for agents.**

**Decision rules.**
- **The event log is authoritative; state is a projection.** Never the reverse.
- **Every state change is an event** (Topic 2) — or reconstruction breaks.
- **Record causes, not just effects** — proposals and tool calls, not only state deltas (§3.3).
- **The log is memory (K-2), not a cache** — compress it, never drop it for space.
- **Keep a materialized projection as a cache** for O(1) reads; rebuild it from the log.

**Production implications.**
1. Make the log the source of truth and run the reconstruction-fidelity test; a divergence means a state change is escaping the log.
2. Ensure the log records the *why* (proposals, tool calls, $\kappa$), or your audit trail explains nothing when it matters.
3. Run the recovery test by killing the process (Chapter 3, Topic 9); an untested recovery is not a recovery.
4. Compress the log separately from the model-facing context (Topic 8); it grows fast [HX §4.3].
5. Resolve the immutability-vs-deletion tension deliberately in Topic 14, not by accident.

**Connections.** This topic is Chapter 3, Topic 4's event-sourcing made the persistence foundation, and it realizes Topic 2's "state changes are events." The log is Topic 1's authoritative memory; projections are its caches. It is the substrate for Topic 4 (replay vs server-managed), Topic 8 (log compression/consolidation), Topic 9 (temporal validity — events are timestamped facts), and Chapter 6, Topic 14's attribution. Chapter 10 makes the log the recovery substrate for long-running agents; Topic 14 governs its one sanctioned mutation.

## Sources

[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — Session as "the durable log of the interaction," capturing "every user message, agent reply, tool call, result, control signal, and error as structured Event objects"; the compiler thesis (state/projections derived from the durable log) — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[ADK-S] Google ADK session/state — state changes via `state_delta` and `append_event` (adds to history, applies deltas); direct mutation "loses auditability" and "breaks persistence" — https://adk.dev/sessions/state/
[ADK] Google ADK runtime event-loop — sessions holding "complete event history, enabling state reconstruction, session rewinding, and observability"; commit-before-continue — https://adk.dev/runtime/event-loop/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.5.1 — deep telemetry as structured traces linking model decisions, harness actions, environment states, and outcomes
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §4.3 — the trace store as "a structured record of execution events"; ~10M-token-per-run raw traces motivating log compression
