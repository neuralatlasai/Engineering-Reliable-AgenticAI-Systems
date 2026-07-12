# Topic 4 — Event-Sourced versus Request–Response Runtime Architectures

## 1. Problem and objective

Topic 3's mapping table exposed an architectural split among production harnesses: some treat execution as a stream of *committed, typed events* from which all state derives; others treat it as *accumulated conversation* punctuated by API round trips. The split determines what the system can do after things go wrong — resume, replay, rewind, audit — and what it costs to do anything at all. The objective is a precise account of both architectures as the sources document them, the recovery/audit/cost trade space, and the decision rules — including the honest observation that the split is a spectrum, and the reference systems each occupy deliberate points on it.

## 2. Intuition first

The difference is a bank ledger versus a checking-account balance. Request–response keeps the balance: current history in, next response out; the past exists only as whatever the running state retained. Event-sourcing keeps the ledger: every change is an appended, immutable record, and the balance is *derived* — recomputable from the ledger at any point, auditable line by line, rewindable to any moment. Ledgers cost more to maintain and are the only structure that answers "how did we get here?" after a crash, a dispute, or an incident. For agents — systems whose most important component confabulates how it got here — the value of the ledger should be obvious.

## 3. The two architectures, as shipped

### 3.1 Event-sourced: the ADK Runner

The documented mechanics [ADK]:

- **Everything is an event.** Execution logic "constructs an Event containing content and actions, then yields back to Runner"; events are "atomic message[s] carrying content and side-effects (`actions`)."
- **State is a derived view.** Changes travel as `event.actions.state_delta` / `artifact_delta`; the Runner "uses configured Services to commit changes" (`SessionService.append_event()`); the Session holds "complete event history, enabling state reconstruction, session rewinding, and observability."
- **Commit-before-continue.** Execution pauses at each yield; "only after the Runner processes and commits the event does execution continue," so resumed code "can reliably assume that the state changes signaled in the yielded event have been committed."
- **The documented caveat:** within an invocation, "dirty reads" of uncommitted local state are possible — enabling multi-step coordination before a yield, at the risk that "the invocation fails before state-carrying events are processed" [ADK].
- **Streaming is layered on, not confused with, commitment:** partial events (`partial=True`) are forwarded for UI but skip actions processing; only final events commit [ADK] — display and durability as separate channels.

### 3.2 Request–response with a typed stream: the Claude Agent SDK

The SDK yields a typed message stream — `SystemMessage(init)`, `AssistantMessage`, `UserMessage` (tool results), `StreamEvent`, `ResultMessage` with cost/usage/session ID [CAL] — which *looks* event-like, and the session is resumable and forkable by ID, with "full context from previous turns... restored" [CAL]. But the architecture differs at the state layer: conversation history *is* the primary state, growing until compaction *summarizes it in place* — a lossy, in-band mutation of the record ("compaction replaces older messages with a summary, so specific instructions from early in the conversation may not be preserved" [CAL]). The stream reports; it does not constitute. Recovery is resume-from-retained-state, not recompute-from-ledger.

### 3.3 The spectrum, honestly

Neither system is a pure pole. ADK permits dirty reads inside invocations (a request–response island within the ledger); the SDK's hooks can archive full transcripts pre-compaction (`PreCompact` [CAL]) — a builder-supplied ledger bolted to the balance architecture. And the evaluation literature's demand sits above both: the transcript as "complete record including outputs, tool calls, reasoning, intermediate results" [DEM], and deep telemetry recording "prompts and retrieved context, token usage and cost... sandbox snapshots, command outputs... branch decisions, rejected alternatives, human interventions" [CAH §3.5.1]. That demand is an event-sourcing requirement *whatever the runtime architecture* — if the loop doesn't ledger natively, the telemetry layer must.

## 4. The trade space

| Property | Event-sourced | Request–response |
|---|---|---|
| Crash recovery | Recompute from committed log; resume from last commit [ADK] | Resume from retained session state; anything uncommitted is gone |
| Replay/debugging | Native: re-derive any intermediate state | Requires separately archived transcripts [CAL PreCompact] |
| Audit | The log *is* the audit record | Reconstructed from telemetry, if built [CAH §3.5.1] |
| Rewind/fork | "Session rewinding" native [ADK] | Fork-from-session supported [CAL]; rewind limited by compaction loss |
| Long-run state fidelity | Log grows; views stay exact | Compaction trades fidelity for context budget [CAL] |
| Write amplification / latency | Commit per yield — every step pays persistence | Persistence at session boundaries; cheaper per step |
| Implementation weight | Runner + services + event schema | Thin loop over the model API |
| Failure-atomicity clarity | Explicit (committed vs. not; dirty-read window named) [ADK] | Implicit; the hazard exists unnamed |

**[derived — table ours; cells sourced]**

## 5. The decision rules

**Choose event-sourced (or retrofit its properties) when any of these hold** **[derived — rules ours; anchors cited]**:

1. **Runs outlive processes.** Long-horizon, multi-session work (Chapter 10) needs recovery points that don't depend on a process staying alive; commit-before-continue is the mechanical form of Chapter 10's checkpointing.
2. **Audit is a requirement, not a nicety.** Regulated actions, Chapter 12's incident forensics, Chapter 1 Topic 12 §3.2's four-evidence rule — all consume the ledger; reconstructing it from a balance architecture after the fact is somewhere between expensive and impossible.
3. **The harness itself is under evolution.** Trace-driven harness improvement runs on structured trajectories — AEGIS's entire loop consumes "the trace store, a structured record of execution events, verifier-scored outcomes, regression signals, and shipped or rejected edits" [HX §4.3]; Evolution-Agent diagnosis attributes failures "to specific harness components" from deep telemetry [CAH §3.5.2]. No ledger, no evolution.
4. **Multiple consumers need the record:** UI, evaluator, telemetry, and future replays all reading one committed stream beats each tapping the loop ad hoc.

**Request–response earns its keep when:** runs are short-lived and disposable; the deliverable is the artifact, not the process; latency and implementation weight dominate; and a telemetry layer covers the audit demand independently. Interactive coding sessions — the SDK's home workload [CAL] — are exactly this shape, which is why the architecture is not a mistake but a fit.

**The hybrid rule that usually wins:** run the loop however the substrate prefers; **ledger the evidence regardless.** The [DEM]/[CAH §3.5.1] telemetry demand is architecture-independent, and meeting it converts most of the event-sourced column's benefits into properties of your observability layer rather than your runtime. What the hybrid cannot recover is commit-before-continue's *resumption guarantee* — that remains a runtime property, and workloads needing it (rule 1) need the real thing.

## 6. Failure modes

- **Ledger without discipline:** an event stream where side effects escape the events (tools writing state that no event records) — the ledger lies, which is worse than no ledger; the environment-facing effects need capture (sandbox snapshots, workspace diffs [CAH §3.5.1]) or the reconstruction is fiction.
- **Dirty-read windows treated as safe:** the documented ADK caveat [ADK] — coordination-before-yield state lost on mid-invocation failure; keep the windows short and the deltas early.
- **Compaction as silent evidence destruction:** the balance architecture's known loss [CAL] hitting *audit* rather than just belief — archive before compaction (`PreCompact` [CAL]) or accept that early-run evidence is unrecoverable.
- **Replay without environment replay:** re-deriving *agent* state against an environment that has moved on; replay needs the sandbox's reproducibility ("replay the same patch, command, seed, dependency lockfile" [CAH §3.4.3]) or it replays a counterfactual.
- **Log unboundedness:** ledgers grow; a per-iteration GAIA run generates ~10M tokens of raw traces [HX §4.3's Digester exists because of this] — the ledger needs its own compression strategy (structured summaries *plus* retained originals), distinct from the model-facing context compression.
- **Two-ledger drift:** telemetry-layer ledger and runtime state diverging (the hybrid's tax); reconcile with periodic consistency checks or nominate one as authoritative.

## 7. Limitations

- The comparison rests on two documented runtimes plus telemetry literature; performance numbers (commit overhead, replay cost) are absent from all sources — the trade table's cost rows are architectural reasoning, not measurements.
- "Event-sourced" here is the runtime-architecture sense; the term's full CQRS/ES apparatus (projections, sagas) goes beyond what any agent source documents, and importing it wholesale would be [derived] beyond the evidence.
- Codex's runtime architecture is not documented at this level in the accessible sources [CDX covers sandbox/approval semantics]; Topic 13 says so explicitly rather than guessing.

## 8. Production implications

1. **Decide with the four rules (§5), then write the decision down** — including which properties you gave up and what compensates (the hybrid's telemetry ledger, the archive-before-compaction hook).
2. **Whatever the architecture, meet the evidence floor:** four evidence streams per run [HB §3.3], transcript completeness [DEM], deep-telemetry fields [CAH §3.5.1]. This is the non-negotiable that architecture choice merely makes cheap or expensive.
3. **Name your atomicity windows.** If the substrate has dirty-read semantics, document where; if it has none stated, assume the windows are everywhere and checkpoint accordingly.
4. **Budget the ledger:** retention, compression (Digester-style structured summaries [HX §4.3]), and the storage line item — an unbudgeted ledger gets deleted by the first cost review, taking the audit trail with it.
5. **Test recovery, not just operation:** kill the process mid-run and measure what resumes; the architecture's real properties are only visible there.

## 9. Connections

- Topic 5 names the units the events carry; Topic 9 builds cancellation/resumption/replay on this topic's foundations; Topic 14's ablations consume the trace store this topic argued into existence.
- Chapter 10's checkpointing is §5-rule-1 at horizon scale; Chapter 13's trace grading and Chapter 14's event-sourced recovery are the ledger's downstream customers.

## Sources

[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.3, §3.5.1–3.5.2
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §4.3
[DEM] Anthropic, Demystifying evals for AI agents — https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.3
[CDX] OpenAI Codex documentation — https://learn.chatgpt.com/docs/sandboxing
