# Topic 10 — Liveness Monitoring, Heartbeats, Leases, Stalled-Agent Detection, and Takeover

## 1. Scope, prerequisites, terminology, boundaries, outcomes

Topics 8–9 handled *crashes* — clean process death, detected by absence, recovered by restart. This topic handles the harder failure: the agent that is **still running but not making progress** — stuck in a loop, blocked on a hung tool, waiting forever, or thrashing. A crashed process is easy to detect (it is gone); a *stalled* agent looks alive (the process exists, tokens may even be flowing) while accomplishing nothing. Detecting stall, and safely handing the work to a fresh session (**takeover**) *without* letting two agents run at once, is this topic's job.

The mechanisms are the classic distributed-systems primitives — heartbeats, leases, fencing — specialized to agents, where "liveness" must mean *progress*, not mere *process existence*, because an agent can be pathologically alive.

**Prerequisites.** The single-active-worker requirement and the launcher (Topic 3); the resumability invariant RI (Topic 3); restart-safe execution and idempotency (Topic 9); the durable ledger/journal and progress $\mu$ (Topics 5, 3); livelock detection "μ not decreasing ⇒ terminate" (Chapter 8 Topic 11, TE-3); the effect bracket (Topic 8).

**Terminology.**
- **Liveness** — here, *progress liveness*: the run is advancing $\mu$ (verified units) or at least changing durable state meaningfully. Distinct from *process liveness* (the process exists).
- **Heartbeat** — a periodic durable signal ("I am alive and here is my progress") a healthy worker emits; its absence or staleness signals death or stall.
- **Lease** — a time-bounded, exclusive right to be the active worker on a task, held by one session, renewed via heartbeat, expiring if not renewed. Ensures single-writer.
- **Fencing token** — a monotonically increasing token attached to the lease, used to reject writes from a superseded (stale-lease) worker so a "resurrected" old worker cannot corrupt state.
- **Stalled agent** — a process that is alive but not advancing $\mu$ / not changing state within a bound (livelock, hang, infinite loop, waiting).
- **Takeover** — a fresh session acquiring the lease of a dead/stalled worker and resuming the task (Topics 8–9 recovery).

**Boundary.** This topic *detects* stall and *safely transfers* the work. What the takeover session then *does* (retry/replan/rollback) is Topic 11; *whether to stop entirely* is Topic 12. The mechanisms here assume the durable state (Topics 5–6) and restart-safety (Topic 9) that make takeover correct.

**Outcome.** You will be able to define progress-based liveness, implement heartbeats + leases + fencing to guarantee single-writer takeover, distinguish a stalled agent from a slow-but-working one, and hand work to a fresh session without double-execution.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** Two distinct failures wear the same disguise. (1) A worker's process is *gone* but its lease/state suggests it might still be active — if a new worker starts, you now have zero *or* two workers, both bad. (2) A worker is *running* but stuck — looping over the same failing action, blocked on a hung API, or "thinking" without advancing. Neither is caught by "is the process alive?": (1) needs *detecting death without false-positiving a slow worker*, and (2) needs *detecting non-progress in a live process*. And the fix — start a fresh worker — is dangerous: if the old worker is not truly dead, two workers writing the same durable state corrupt it and double-execute effects (violating Topic 9's single-intent guarantee).

**Objective.** (i) Define liveness as *progress*, measured against the durable state, not process existence. (ii) Detect death and stall via heartbeats with a progress payload. (iii) Guarantee *at most one active worker* via leases + fencing, so takeover is safe even when the old worker is not provably dead. (iv) Make takeover resume correctly (Topics 8–9).

**Assumptions.** (a) Clocks are imperfect and networks partition — you cannot *know* a worker is dead, only that its lease *expired*; the design must be correct under "the old worker might still be running." (b) The durable state supports fencing (rejecting writes below the current fencing token). (c) Restart-safety (Topic 9) holds, so a takeover that re-attempts the in-flight step is safe.

**Constraints.** *Single-writer* is a hard safety invariant: at most one worker may write the durable state at a time. Violating it corrupts the ledger (Topic 5) and double-executes effects (Topic 9). The lease + fencing must enforce single-writer *without* relying on the old worker cooperating (it may be partitioned, not dead).

**Success criteria.** A stalled or dead worker is detected within a bounded time; a fresh worker takes over; the old worker, if it resurrects, is *fenced out* (its writes rejected); no double-execution; the run resumes and advances $\mu$. A slow-but-progressing worker is *not* falsely taken over.

## 3. Intuition first, then formalization

**Intuition.** The core insight is that **you cannot ask "is the worker alive?" — you can only ask "has it made progress recently?"** A worker melting a CPU in an infinite loop is maximally "alive" and completely useless. So liveness must be defined against the *durable state*: a live worker advances $\mu$ (or at least writes meaningful journal events); a stalled worker does not. This is Chapter 8's TE-3 ("μ not decreasing ⇒ terminate") turned into a *monitoring* signal.

The heartbeat carries this progress signal. A healthy worker periodically writes "I am here, my lease is L, and $\mu$ is now 47." A monitor watches: if the heartbeat *stops* (death) or *keeps arriving but $\mu$ never moves* (stall), it acts. The two signals — heartbeat presence and progress advance — separate the two failures: no heartbeat = dead; heartbeat but flat progress = stalled.

The lease is the safety mechanism for the dangerous part — *takeover*. Because you can never be *sure* the old worker is dead (it might be partitioned and about to reconnect), you cannot just start a new worker and hope. Instead, the right to be the active worker is a *lease*: a time-bounded token that expires unless renewed. The old worker renews it via heartbeat; if it stops renewing, the lease expires, and a new worker may claim it. The genius is the **fencing token**: each lease carries an increasing number, and the durable store *rejects writes carrying an old lease number*. So even if the old worker resurrects mid-takeover and tries to write, its writes carry the stale token and are rejected — the store enforces single-writer *mechanically*, without the two workers needing to coordinate. This is the standard fix for the "two leaders" problem (a partitioned old leader that thinks it is still in charge), and it is exactly what agents need for safe takeover.

The intuition for *false positives*: a worker doing a legitimately long operation (a 10-minute build, a slow research fetch) is not stalled — it just has not advanced $\mu$ yet. So the stall bound must be generous enough to not kill honest slow work, and the heartbeat should carry *sub-unit* progress signals (journal events, not just $\mu$) so "slow but working" is distinguishable from "stuck." Killing a slow-but-working worker wastes its work and, worse, can thrash (kill, restart, kill again).

**Formalization.** Let each worker hold a lease $\ell = (\text{token}, \text{expiry})$ with $\text{token} \in \mathbb{N}$ monotonically increasing across grants. Define:

- **Heartbeat:** at interval $\tau_{\text{hb}}$, the worker writes $(\text{token}, t_{\text{now}}, \mu, \text{last\_event\_seq})$ durably and renews $\text{expiry} \leftarrow t_{\text{now}} + \text{TTL}$.
- **Death detection:** a monitor declares the worker *possibly dead* if $t_{\text{now}} > \text{expiry}$ (lease not renewed within TTL).
- **Stall detection:** the worker is *stalled* if heartbeats continue but $\mu$ and $\text{last\_event\_seq}$ have not advanced for a bound $\tau_{\text{stall}} \gg \tau_{\text{hb}}$ (no progress, no meaningful state change). (TE-3 realized as monitoring.)
- **Fencing invariant:** the durable store accepts a write iff its lease token $\ge$ the highest token ever seen; a write with a stale token is rejected.

**The single-writer theorem [synthesis].** Under the fencing invariant, at most one worker's writes are ever accepted at a time, *regardless* of how many workers believe they hold the lease. Proof sketch: takeover grants a strictly higher token; the store then rejects the old token; so a resurrected old worker cannot write. Single-writer is enforced by the *store*, not by the workers' agreement — which is essential because the workers cannot agree under partition. This is the property that makes takeover safe without knowing the old worker is dead.

**Composed with restart-safety (Topic 9).** Takeover = fence out the old worker (higher token) + resume from the last checkpoint (Topic 8) + restart-safe re-attempt of the in-flight action (Topic 9). Fencing guarantees no *concurrent* writer; restart-safety guarantees the *sequential* re-attempt is correct. Together: safe takeover.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Lease manager (in the durable store / launcher, Topic 3).** Grants leases with monotonic tokens, tracks expiry, enforces fencing on writes. The single-writer authority. Deterministic code, not a model.
2. **Heartbeat emitter (in the worker).** Periodically writes the progress-bearing heartbeat and renews the lease. Cheap.
3. **Liveness monitor.** Watches heartbeats: detects death (expiry passed) and stall (heartbeats present but $\mu$/events flat past $\tau_{\text{stall}}$). Triggers takeover.
4. **Takeover controller.** On death/stall: revoke/expire the old lease, grant a new lease with a higher token to a fresh worker, which resumes (Topics 8–9).

**Interface: writes are lease-gated.** Every durable write (journal append, ledger update, effect bracket) carries the worker's lease token; the store rejects stale tokens (fencing). This makes the safety invariant *automatic* on the write path, not a thing workers must remember.

**Control flow:**

```
worker:
    lease = lease_manager.acquire(task)           # token T
    while working:
        do_step()
        journal.append(event, lease_token=T)       # fenced write; rejected if T is stale
        if elapsed(tau_hb): heartbeat(T, mu, last_seq); lease.renew()

monitor:
    if now > lease.expiry:                          # no renewal -> possibly dead
        takeover()
    elif heartbeats_present and no_progress(mu, last_seq, tau_stall):   # alive but stuck
        revoke(lease); takeover()

takeover:
    new_lease = lease_manager.grant(task)           # token T' > T  (fences out old worker)
    fresh_worker.resume(checkpoint, new_lease)      # Topics 8-9: restart-safe resume
```

**Data flow.** Heartbeats (progress payload) flow worker → monitor via the durable store. The lease token flows into *every* write, gating it. Takeover grants a higher token, mechanically fencing the old worker. Nothing depends on the old worker cooperating.

**Relation to the launcher (Topic 3).** The launcher's "single active worker" requirement is *implemented* by the lease manager here. Topic 3 asserted it; Topic 10 builds it, correctly, under partition.

## 5. Grounding: primary sources and reproducible evidence

**Honest grounding boundary — this topic is the most [synthesis]-heavy in the chapter.** The agent-harness sources ([LRH], [HDA]) describe *sequential* session management (initializer then workers, one at a time, launched by an outer controller) but **do not detail heartbeat/lease/fencing mechanisms** — their setting is a single controller launching sessions in sequence, where the "single writer" is guaranteed by the controller running one session at a time, not by leases under partition. So:

- **Grounded in the agent sources:** the *need* for single-active-worker sequencing (Topic 3's launcher; [LRH]'s one-session-at-a-time incremental progress) and the *takeover-and-resume* pattern (a fresh session resuming from durable state — [LRH]'s core loop; [MAR]'s "resume-from-error").
- **Grounded in distributed-systems practice (not the agent sources), applied here as [synthesis]:** heartbeats, leases with TTL, and **fencing tokens** are the standard solution to the "is it dead or just slow, and how do I take over safely" problem (the classic lease-with-fencing pattern for avoiding two-writer corruption under partition). This topic imports that discipline for agents that run in a *distributed* setting (cloud workers, where the launcher and worker are separate processes that can partition), which is exactly Chapter 14's production substrate.
- **Grounded in Chapter 8:** stall = livelock; TE-3 ("μ not decreasing ⇒ terminate") is the progress-liveness definition, here used as a *detection* signal rather than only a termination one.

**Why the agent sources under-specify this.** [LRH]/[HDA]'s demos run a controller that launches one session, waits for it to finish, then launches the next — a setting with no concurrency and thus no need for leases. The lease/fencing machinery becomes necessary the moment the agent runs as a *distributed* long-lived service with automatic takeover (Chapter 14), where a monitor and a worker are separate and can disagree about liveness. This topic is honest that it is *extending* the grounded sequential pattern to the distributed case using standard primitives, not reporting a shipped agent-specific mechanism.

**Reproducible evidence.** The single-writer / fencing guarantee is directly testable: partition an old worker, take over, resurrect the old worker, and verify its writes are rejected and no double-execution occurs (E1). Stall detection is testable by inducing a livelock and measuring detection time (E2). These are standard, reproducible; the agent sources publish no such study.

## 6. Implementation: leases, fencing, and progress-aware heartbeats

**Lease with fencing token:**

```python
class LeaseManager:                     # in the durable store; the single-writer authority
    def acquire(self, task):
        self._token[task] += 1          # monotonic; higher token supersedes
        self._expiry[task] = now() + TTL
        return Lease(task, token=self._token[task], expiry=self._expiry[task])

    def accept_write(self, task, write_token):
        return write_token >= self._token[task]   # FENCING: reject stale-token writes
```

**Fenced write (every durable write goes through this):**

```python
def durable_write(store, task, lease, event):
    if not store.lease_manager.accept_write(task, lease.token):
        raise Fenced("superseded by a newer worker")   # old worker cannot corrupt state
    store.append(task, event)
```

A resurrected old worker calling `durable_write` with its stale token hits `Fenced` and cannot write — single-writer enforced mechanically.

**Progress-aware heartbeat (distinguishes stall from slow):**

```python
def heartbeat(worker, lease):
    payload = {
        "token": lease.token, "ts": now(),
        "mu": worker.ledger.mu(),                 # verified progress (coarse)
        "last_event_seq": worker.journal.last_seq(),  # sub-unit activity (fine)
        "current_action": worker.current_action_id,   # what it's doing
    }
    store.write_heartbeat(worker.task, payload)
    lease.renew()                                  # expiry := now + TTL
```

Carrying both $\mu$ (coarse progress) *and* `last_event_seq` (fine activity) lets the monitor tell "slow but working" (events advancing, $\mu$ not yet) from "stalled" (neither advancing).

**Stall detection (TE-3 as monitoring):**

```python
def is_stalled(history, tau_stall):
    recent = history.since(now() - tau_stall)
    mu_flat    = all(h.mu == recent[0].mu for h in recent)
    seq_flat   = all(h.last_event_seq == recent[0].last_event_seq for h in recent)
    return mu_flat and seq_flat and len(recent) > 1   # alive (heartbeating) but no progress
```

Note it requires *both* $\mu$ and event-seq flat: a worker producing journal events but not verifying units might be legitimately mid-unit (not stalled); a worker producing *nothing* durable for $\tau_{\text{stall}}$ despite heartbeating is stuck. Tune $\tau_{\text{stall}}$ above the longest legitimate single operation (a long build/fetch) to avoid false positives.

**Takeover (composes with Topics 8–9):**

```python
def takeover(task, store):
    new_lease = store.lease_manager.acquire(task)     # higher token; fences old worker
    checkpoint = store.latest_snapshot(task)           # Topic 8
    fresh_worker = spawn_worker(task, new_lease)
    fresh_worker.resume(checkpoint)                     # Topic 9: restart-safe re-attempt
```

## 7. Trade-offs

- **Detection latency vs false positives.** Short TTL / short $\tau_{\text{stall}}$ → fast detection of real failures but risk of killing slow-but-working workers (false positive → wasted work, thrash). Long bounds → no false positives but slow to recover from real stalls. Resolution: set TTL above the heartbeat interval with margin; set $\tau_{\text{stall}}$ above the longest legitimate no-progress operation; use the fine-grained event-seq signal to avoid killing workers that are producing *something*.
- **Heartbeat cost vs monitoring granularity.** Frequent heartbeats give fast detection and fine progress tracking but cost writes. Heartbeats are cheap (small durable writes, like journaling, Topic 8) so this trade is mild; err toward frequent enough that TTL can be short without false death-detection.
- **Fencing strictness vs recovery of partitioned work.** Fencing *rejects* a resurrected old worker's writes — which is correct for safety but *discards* any work the old worker did after the partition. If that work was expensive, it is lost. The trade favors safety absolutely: accepting the old worker's writes risks two-writer corruption and double-execution, which is worse than lost work. (The old worker's *reversible* work may be recoverable via reconciliation, but never by accepting stale-token writes.)
- **Automatic takeover vs human gate.** Automatic takeover maximizes availability but can thrash (repeatedly kill and restart a worker that keeps stalling for the same reason). A repeated-takeover count should escalate to a human (Topic 12/Chapter 8: a replan that equals the failed plan ⇒ escalate). The trade: automation for the common transient stall, escalation for the persistent one.
- **Distributed complexity vs sequential simplicity.** In a *sequential* single-controller setting ([LRH]'s demos), leases/fencing are unnecessary — the controller runs one session at a time. Adopting the full lease/fencing machinery there is over-engineering. It becomes *necessary* only in the distributed setting (separate monitor and worker that can partition, Chapter 14). Apply per the deployment: sequential controller → simple; distributed service → leases + fencing.

## 8. Experiments: baselines, ablations, metrics

**E1 — Fencing correctness (the safety experiment).** Partition an old worker (make it think it still holds the lease); take over with a fresh worker; resurrect the old worker and have it attempt writes and an irreversible effect. **Prediction:** old worker's writes are `Fenced` (rejected); no double-execution; state uncorrupted. Baseline: no fencing (accept any write) → two-writer corruption, double-execution. Metric: corruption rate, double-execution rate (both must be zero with fencing). This validates the single-writer theorem.
**E2 — Stall detection.** Induce a livelock (worker loops a failing action, heartbeating but not advancing $\mu$/events); measure time-to-detect. **Prediction:** detected at $\tau_{\text{stall}}$; without progress-aware heartbeats (process-liveness only), never detected (process is alive). Metric: detection latency; false-negative rate for process-only monitoring.
**E3 — False-positive avoidance.** Run a worker doing a legitimately long operation (long build/fetch, no $\mu$ advance but events flowing); verify it is *not* taken over. **Prediction:** with the event-seq signal, no false takeover; with $\mu$-only detection, false takeover of honest slow work. Metric: false-takeover rate; wasted work from false takeovers.
**E4 — Takeover resume correctness.** Combine takeover with an in-flight irreversible effect (Topic 9 E1). **Prediction:** fenced old worker + restart-safe resume → correct, no double-exec. Metric: end-state correctness, double-execution rate.

**Honest status.** Fencing/lease correctness (E1, E4) rests on standard distributed-systems results and Chapter 9's restart-safety — **not** on the agent sources, which run sequentially and do not exercise it. Stall = livelock detection (E2) is grounded in Chapter 8's TE-3. The agent sources publish *no* liveness/lease/fencing study. This is a **[synthesis]** topic: the mechanisms are standard and reproducible, their application to distributed long-running agents is the author's extension of the grounded sequential pattern, and no agent-specific magnitudes exist. State this plainly.

## 9. Failure modes, edge cases, hazards, limitations

- **Two-writer corruption (the failure fencing prevents).** A partitioned old worker resurrects and writes concurrently with the takeover worker → corrupted ledger, double-executed effects. Mitigation: fencing tokens; the store rejects stale-token writes. Never rely on the old worker "knowing" it was replaced.
- **Process-liveness false negative.** Monitoring only "is the process alive?" misses the stalled-but-alive worker entirely (the most common long-run pathology). Mitigation: progress-liveness (heartbeat carries $\mu$ + event-seq); TE-3 detection.
- **False-positive takeover (thrash).** Aggressive bounds kill slow-but-working workers, wasting work and potentially looping (kill → restart → kill). Mitigation: generous $\tau_{\text{stall}}$ above the longest legitimate operation; fine-grained activity signal; escalate repeated takeovers to a human (do not thrash).
- **Clock skew.** Lease expiry depends on clocks; skew between worker and monitor can expire a lease early (false death) or late (delayed detection). Mitigation: use the store's clock as the single reference for lease timing; add margin to TTL; do not compare across unsynchronized clocks.
- **Heartbeat succeeds but work is wrong.** A worker can heartbeat healthily while producing *bad* work (advancing $\mu$ with false verifications — Topic 4 predicate erosion). Liveness monitoring detects *stall*, not *quality*; quality is Topic 14's verifier. Do not conflate "making progress" with "making correct progress."
- **Edge case: legitimate long-running tool.** A `LongRunningFunctionTool` (Chapter 5 [ADK-T]) that genuinely takes hours (a big training job) looks stalled by $\mu$/event flatness. Mitigation: such tools emit their own progress heartbeats (sub-task events) so the worker's heartbeat reflects real activity; $\tau_{\text{stall}}$ accounts for the tool's expected duration.
- **Limitation.** This is the chapter's least source-grounded topic. The primitives (heartbeat, lease, fencing) are battle-tested in distributed systems but the agent sources run sequentially and do not exercise them; the transfer is sound but unmeasured *in the agent context*. In a purely sequential single-controller deployment, most of this topic is unnecessary — the controller's one-at-a-time launching *is* the single-writer guarantee. Adopt the full machinery only for distributed, auto-takeover deployments.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- The agent sources run sessions *sequentially* under a controller ([LRH]) — single-writer by construction, no concurrency — and support takeover-and-resume from durable state ([LRH], [MAR] resume-from-error).
- Stall = livelock; "μ not decreasing ⇒ terminate/act" is grounded (Chapter 8 TE-3).
- Heartbeats/leases/fencing are the standard, reproducible solution to safe takeover under partition (distributed-systems practice; **[synthesis]** for agents).

**Decision rules.**
- **DR-1.** Define liveness as *progress* (advancing $\mu$ / durable events), never as process existence. Monitor progress-liveness; a live-but-stalled worker is the failure to catch.
- **DR-2.** In any *distributed* deployment (separate monitor and worker), guarantee single-writer with leases + fencing tokens. Never assume the old worker is dead; fence it out mechanically.
- **DR-3.** Make heartbeats carry both coarse ($\mu$) and fine (event-seq) progress so "slow but working" is distinguishable from "stalled." Set $\tau_{\text{stall}}$ above the longest legitimate no-progress operation.
- **DR-4.** Takeover = fence (higher token) + resume from checkpoint (Topic 8) + restart-safe re-attempt (Topic 9). Escalate repeated takeovers to a human; do not thrash.
- **DR-5.** In a *sequential* single-controller deployment, skip the lease machinery — the controller's one-at-a-time launching is the single-writer guarantee. Do not over-engineer.

**Production implications.** The stalled-but-alive agent is the failure that most often turns a long run into a silent money-burner: the process is up, tokens flow, dashboards look green, and nothing gets done. Progress-liveness monitoring is what surfaces it. And when you *do* run agents as distributed services with automatic takeover (Chapter 14), fencing is not optional — the first time a network partition makes an old worker resurrect during a takeover, an unfenced system double-executes effects and corrupts state, which is a production incident. The honest engineering call: sequential controllers get simple single-writer for free; distributed auto-takeover buys availability at the cost of needing the full lease/fencing discipline, and there is no safe middle ground that skips fencing.

**Connections.** Single-writer implements Topic 3's launcher requirement, correctly under partition. Stall detection is Chapter 8 TE-3 as monitoring. Takeover composes Topic 8 (checkpoint) + Topic 9 (restart-safe resume) — fencing gives no-concurrent-writer, restart-safety gives correct sequential re-attempt. What the takeover worker *does* is Topic 11; whether to *stop* after repeated stalls is Topic 12. Quality (vs mere progress) is Topic 14. The distributed substrate is Chapter 14.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (sequential controller launching one session at a time; takeover-and-resume from durable progress file).
- **[MAR]** Anthropic — *Multi-agent research system* (resume-from-error). Via Chapter 9.
- **[ADK-T]** Google ADK — `LongRunningFunctionTool` (genuinely long operations). Via Chapter 5.
- Distributed-systems practice (**[synthesis]**, not agent-source): heartbeats, leases with TTL, fencing tokens (the standard safe-takeover-under-partition pattern).
- Internal: Chapter 8 Topic 11 (TE-3 livelock, "μ not decreasing ⇒ terminate"), this chapter Topics 3 (launcher, single-writer, RI), 5 (ledger/journal, $\mu$), 8 (checkpoint, effect bracket), 9 (restart-safe resume, idempotency), 11 (recovery actions), 12 (stop), 14 (quality vs progress), Chapter 14 (distributed substrate).
