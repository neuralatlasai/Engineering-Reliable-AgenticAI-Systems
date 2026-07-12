# Topic 9 — Cancellation, Interruption, Resumption, Replay, and Idempotency

## 1. Problem and objective

Topic 8 handled runs that end by decision; this topic handles runs that end — or pause, or restart — by *force*: operator cancellation, process death, provider outage, host shutdown, mid-run redirection. These lifecycle operations are where a harness's real architecture shows, because they cannot be handled by the happy path's machinery: they require knowing, at an arbitrary cut point, what has been durably done, what is safely repeatable, and what state a re-entrant execution may trust. The objective is the five operations as a coherent discipline, grounded in the commit semantics, session machinery, and reproducibility infrastructure the sources document.

## 2. Intuition first

Every operation in this topic reduces to one question asked at a cut point: **what is true?** Cancellation asks it prospectively (what will stop, what half-done effects remain?); resumption asks it retrospectively (what may the re-entering execution assume?); replay asks it counterfactually (can we make it true *again*, identically?); idempotency is the property that makes the question's hardest case — "did that effect happen once or twice?" — not matter. A harness that can answer "what is true?" at any cut point is recoverable; one that can only answer it at run boundaries is a batch job with extra steps.

## 3. The five operations

### 3.1 Cancellation

Deliberate external termination. The clean form is a *typed* terminal event — the run record closes with an explicit cause, consistent with the censoring discipline (a cancelled run is censored, not deleted — Ch. 1, Topic 12 §7, §12). The hard part is not stopping the loop but bounding the blast radius of in-flight effects: mutations already dispatched to the environment do not un-happen. The mitigation inventory is the same as interruption's (§3.2): short commit distance, serialized mutations [CAL], and compensation knowledge per tool contract (Chapter 5). Graceful-shutdown signaling exists in the reference runtime (`worker_shutting_down`: "the loop will end after the current turn" [CAL]) — cancellation with a turn boundary's worth of warning, which is exactly enough to reach a checkpoint.

### 3.2 Interruption

Unplanned suspension (Topic 5 §3.6). The exposure algebra is fixed by the state architecture: under commit-before-continue, loss is bounded by the current dirty-read window — "risk if the invocation fails before state-carrying events are processed" [ADK]; under history-as-state, loss is bounded by what the session retains at its last persistence point [CAL]. Two sourced disciplines: keep state-carrying events *early and small* (the window is a design variable, not a constant [ADK]); and treat interruption at termination boundaries as its own test case — the documented message-loss defect at max-turns boundaries [CAL] shows the corners are where the handling breaks.

### 3.3 Resumption

Re-entering a run with restored state. The session machinery is explicit: capture the session ID, resume with "full context from previous turns... restored: files that were read, analysis that was performed, and actions that were taken," or *fork* "to branch into a different approach without modifying the original" [CAL]. Event-sourced runtimes add reconstruction: state re-derived from committed history, with "session rewinding" as the generalization [ADK]. The correctness condition the sources imply but the builder must enforce **[synthesis]**: resumption restores *agent-side* state; the *environment* may have moved (external drift, other actors, the interrupted run's own uncommitted effects). Safe resumption therefore begins with re-observation — a divergence probe between restored belief and current workspace (Ch. 1, Topic 3 §6) — before any mutation. Resuming into an unexamined workspace is acting on a belief state whose staleness is *known*.

### 3.4 Replay

Re-executing a recorded run for debugging, regression, or audit. Replay has two distinct referents, and conflating them produces fiction:

- **Trace replay** re-reads $\hat\tau$ — always available if the record meets the evidence floor [HB §3.3], sufficient for audit and post-hoc analysis, incapable of answering counterfactuals.
- **Execution replay** re-runs the computation, and is valid only under environment reproducibility: "sandboxes improve reproducibility" precisely because one can "replay the same patch, command, seed, dependency lockfile" [CAH §3.4.3]; evaluation protocols manufacture the same property via clean-environment trials [DEM] and fixed initial sandbox states [HB §3.2]. Outside a sandbox, execution replay against a drifted environment replays a counterfactual — useful, but only if labeled as such (Topic 4 §6).

The model's stochasticity adds the final caveat: even with seeds, "provider-side sampling may remain nondeterministic" (Ch. 1, Topic 12 §8.2), so exact-trajectory replay is not generally promisable; *distributional* replay (same configuration, repeated runs, compared populations) is the honest substitute and is exactly Topic 14's methodology.

### 3.5 Idempotency

The property that makes re-execution safe: applying an effect twice equals applying it once. It is a *tool-contract* property (Chapter 5 owns the catalog: idempotency keys, compare-and-swap semantics, upserts), consumed here as the enabler for everything above — retry after ambiguous failure, resumption past a possibly-executed step, at-least-once delivery from queues. The harness's contribution is bookkeeping: recording dispatched-but-unconfirmed effects in $\hat\tau$ so that re-entry knows which calls are in the ambiguous state, and preferring idempotent tool forms on any path that can be re-entered. **[synthesis — role assignment ours; mechanisms are standard systems engineering consumed by Chapter 5's contracts]**

## 4. The discipline, unified

The five operations compose into one architecture requirement **[synthesis]**:

$$
\text{recoverability} \;=\; \underbrace{\text{committed record}}_{\hat\tau,\ \text{commit-before-continue}}
\;+\; \underbrace{\text{bounded ambiguity}}_{\text{short dirty windows, mutation serialization}}
\;+\; \underbrace{\text{re-entry protocol}}_{\text{re-observe, then act}}
\;+\; \underbrace{\text{repeatable effects}}_{\text{idempotent contracts}}
$$

Each term is independently sourced (ADK's commit discipline; CAL's serialization; the belief-state re-observation rule; standard idempotent contract design), and each missing term produces a characteristic incident: no record → unrecoverable; long ambiguity windows → duplicate or lost effects; no re-entry protocol → stale-belief mutations; no idempotency → retry becomes double-execution.

## 5. Failure modes

- **Resume-into-drift:** restored context treated as current truth; the workspace changed during the gap. Mitigation is §3.3's re-observation gate — cheap, and skipped by default in every runtime.
- **Double-execution on retry:** the interrupted mutation re-issued without idempotency or dispatch bookkeeping; the classic at-least-once hazard, now with a stochastic proposer deciding whether to retry.
- **Replay contamination:** execution replay against shared or stale state — the evaluation literature's documented version is agents "examining git history from previous trials" and gaining unfair advantage [DEM]; the production version corrupts debugging conclusions instead of scores.
- **Fork aliasing:** two forks of one session mutating one workspace; fork semantics isolate *conversation* state [CAL], not environment state — workspace isolation (worktrees, sandboxes) is a separate, mandatory step (Chapter 9's shared-state discipline).
- **Cancellation as data loss:** cancelled runs deleted rather than closed-with-cause; the censoring rules (Ch. 1, Topic 12 §12) apply to operations, not just benchmarks.
- **Recovery paths untested:** the kill-and-resume drill run for the first time during the incident; Topic 5 §8.4's acceptance-test rule exists because recovery code that has never executed has the reliability of any other never-executed code.

## 6. Limitations

- The ledger documents mechanisms (sessions, commits, sandbox replay) but no quantitative recovery benchmarks — no source measures resumption correctness rates or replay fidelity distributions; §4's composition is architecture, validated locally by the drills it prescribes.
- Idempotency's treatment here is deliberately thin: the mechanism catalog belongs to Chapter 5's tool contracts, and importing the full distributed-systems literature would exceed the sources.
- Cross-provider resumption (a run started on one runtime resumed on another) is nowhere addressed in the sources and should be presumed unsupported.

## 7. Production implications

1. **Define the cut-point contract:** for every unit in Topic 5's hierarchy, document what "what is true?" returns at an arbitrary cut — committed state, ambiguous dispatches, environment assumptions. Blank cells are the recovery backlog.
2. **Gate every resumption on re-observation** (§3.3): a divergence probe before the first post-resume mutation, budgeted as the price of the pause.
3. **Prefer idempotent tool forms on re-entrant paths**, and record dispatch-unconfirmed effects explicitly in the run record (§3.5).
4. **Label replays** as trace / sandboxed-execution / drifted-execution; conclusions inherit the label's epistemic strength (§3.4).
5. **Drill the operations:** scheduled kill-resume, cancel-mid-mutation, and replay-verify exercises, with the same seriousness as backup restoration — because that is what they are.

## 8. Connections

- Builds directly on Topic 4's architectures (the ledger is what makes §4's first term cheap) and Topic 5's checkpoint/interruption types; Topic 8 supplied the typed terminal causes cancellation extends.
- Chapter 5 owns idempotent contract design; Chapter 9 the multi-writer version of fork aliasing; Chapter 10 stretches resumption across sessions and days; Chapter 14 runs the drills at fleet scale.

## Sources

[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[CAL] Claude Agent SDK, "How the agent loop works" (sessions, forking, worker_shutting_down, serialization, boundary defect note) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.3
[DEM] Anthropic, Demystifying evals for AI agents — https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.2–3.3
