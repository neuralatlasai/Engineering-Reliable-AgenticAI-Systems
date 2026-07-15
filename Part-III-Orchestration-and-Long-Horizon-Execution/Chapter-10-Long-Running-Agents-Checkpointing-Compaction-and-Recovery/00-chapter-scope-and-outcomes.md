# Chapter 10 — Long-Running Agents: Checkpointing, Compaction, and Recovery

## Chapter scope and outcomes

### What this chapter is about

The previous two chapters built the machinery of a *single bounded run*: a workflow graph (Chapter 8) or a set of collaborating agents (Chapter 9) that starts, does work, and terminates. This chapter asks the question that breaks all of that machinery: **what happens when the work does not fit in one run?**

A "long-running agent" here is not an agent that is merely slow. It is an agent whose task **exceeds the resources of a single model invocation, a single context window, or a single process lifetime** — and therefore must survive across *resets, restarts, and crashes* while still converging on a correct result. The horizon $K$ (the number of model-directed steps, in the sense of Chapter 8's $\alpha = K_M/K$) is large enough that three things that were negligible in a short run now dominate:

1. **The context window fills** before the task is done, so the agent must lose information and keep going.
2. **The process dies** (deploy, crash, timeout, cost cap) before the task is done, so the agent must resume from durable state, not memory.
3. **Quality decays** as the run extends, so late work is worse than early work unless something actively resists the decay.

This chapter is about the harness disciplines that make progress **monotone and recoverable** under those three pressures: checkpointing (so a crash costs bounded work), compaction (so a full context does not end the run), and recovery (so a failure resumes rather than restarts). The organizing claim, which every topic returns to, is:

> **[synthesis] Long-horizon reliability is not a model capability you wait for — it is a harness property you construct.** The model supplies capability per step; the harness supplies the durable state, the verification, and the resumption logic that turn a sequence of capable-but-fallible steps into a task that actually finishes. A bigger context window shifts pressure (1) but does nothing for (2) or (3).

### Prerequisites

This chapter assumes the following constructs from earlier chapters and does **not** re-derive them:

- **The typed harness loop and terminal-control status** $\kappa_t \in \{\text{continue}, \text{success}, \text{model\_stop}, \text{budget}, \text{timeout}, \text{execution\_error}, \text{policy\_block}\}$ (Chapter 3). Long-running execution is what happens when the loop's outer boundary is crossed and re-entered.
- **The event log as the authoritative execution record; state as a projection over it** (Chapter 3 Topic 4, Chapter 7 Topic 3). This is the single most important prerequisite for the whole chapter — checkpointing and recovery are *operations on an event log*.
- **Durable execution, retries, compensation, and the "exactly-once is an illusion" result** (Chapter 8 Topic 10). This chapter generalizes durable execution from a single workflow to a multi-session agent.
- **Context as a finite resource; compaction as "maximize recall, then precision"; the durable-instruction re-injection rule (V-3 / T-1)** (Chapter 6 Topics 1, 11). Topic 7 here builds directly on that.
- **Memory as claim-with-receipt; artifacts as handle-in-context; independent artifact versioning** (Chapter 7 Topics 9, 10, 11). Continuity across sessions is carried by artifacts and memory.
- **The multi-agent economics and the token-spend confound** (Chapter 9). The initializer/worker split here is a *degenerate* multi-agent system (one role, many sessions), and the same honesty about measured-vs-unmeasured applies.
- **Statistical protocol** (Chapter 1 Topic 12): Kaplan–Meier survival estimation [KM], censoring, Wilson intervals [WILSON], the zero-failure bound. Topic 15 leans on survival analysis heavily.

If you have not internalized "the event log is the truth and state is a projection," read Chapter 3 Topic 4 and Chapter 7 Topic 3 before this chapter. Everything here is a corollary of it.

### Terminology used throughout the chapter

| Term | Meaning in this chapter |
|------|-------------------------|
| **Session** | One process lifetime of the agent: a fresh context window, from launch to termination or death. A long task spans many sessions. |
| **Run** | The entire multi-session effort to complete one task. A run contains one or more sessions. (Note: this widens Chapter 3's "run" from one loop to one task.) |
| **Reset** | Deliberately ending a session with a clean context and starting a new one, carrying state through a **handoff artifact**. Distinguished from a *crash*. [HDA] |
| **Compaction** | Summarizing earlier conversation *in place* so the **same** session continues on a shortened history. [OCP][HDA] Contrast with reset. |
| **Checkpoint** | A durable, restart-safe snapshot of task state (ledger + artifacts + event-log offset) from which a new session can resume with bounded lost work. |
| **RPO (Recovery Point Objective)** | The maximum amount of work you are willing to lose to a crash — measured in *steps* or *committed effects*, not seconds. |
| **RTO (Recovery Time Objective)** | The maximum time (or token cost) to get a new session productive again after a failure. |
| **Ledger / progress file / journal** | The durable record of what has been done, what remains, and the evidence for each — the artifact a resuming session reads first. [LRH] calls the concrete instance `claude-progress.txt`. |
| **Horizon failure** | A failure mode that only appears at large $K$: goal drift, forgotten constraint, repeated work, false completion. Absent or invisible in short runs. |
| **Survival** | The probability that a run has *not yet* hit its first unrecoverable error by step $k$. The chapter's top-line reliability metric. |

### The ten-section structure (binding for every topic in this chapter)

Every topic file in this chapter follows the same fixed ten-section skeleton, one section per governing instruction, in order:

1. **Scope, prerequisites, terminology, boundaries, exclusions, outcomes**
2. **Problem, bottleneck, objective, assumptions, constraints, success criteria**
3. **Intuition first, then formalization**
4. **Architecture: components, interfaces, data flow, control flow**
5. **Grounding: primary sources and reproducible evidence**
6. **Implementation: APIs, schemas, data structures, configuration**
7. **Trade-offs: complexity, latency, throughput, scalability, reliability, security, cost**
8. **Experiments: baselines, ablations, metrics, statistical tests, thresholds**
9. **Failure modes, edge cases, hazards, mitigations, limitations**
10. **Verified observations, decision rules, production implications, connections, and Sources**

### The fifteen topics and the through-line

The chapter is built in five movements:

**Why the naive answers fail (Topics 1–2).** Topic 1 dismantles the most common misconception — that a longer context window solves long-horizon execution. Topic 2 catalogs the *horizon failures* that appear only at large $K$ and are therefore invisible in the short-run evals that most teams have.

**The decomposition and the durable record (Topics 3–6).** Topic 3 introduces the **initializer/worker separation** [LRH] — the foundational architectural move. Topic 4 decomposes the requirement into **verifiable task units** (the unit that makes progress measurable). Topic 5 builds the **durable ledger / journal / evidence record**. Topic 6 shows how **artifacts carry continuity across sessions** when context cannot.

**Surviving the boundary (Topics 7–9).** Topic 7 is the central distinction of the chapter: **context compaction versus semantic state preservation** — why you cannot summarize your way to durability. Topic 8 sets **checkpoint frequency against a recovery-point objective**. Topic 9 makes execution **restart-safe and replayable**, generalizing Chapter 8's durable execution.

**Detecting and recovering from failure (Topics 10–12).** Topic 10 covers **liveness** — heartbeats, leases, stalled-agent detection, takeover. Topic 11 is the **recovery taxonomy** (retry, replan, rollback, compensate, quarantine, escalate). Topic 12 fixes the most dangerous long-run failure: **stop conditions based on verified task state, not model declarations of "done."**

**Managing extended work and measuring it (Topics 13–15).** Topic 13 handles **long-running code work** — branches, worktrees, merge discipline. Topic 14 confronts **quality decay** and the **independent verifier agent** [HDA]. Topic 15 defines the **measurement framework**: long-horizon benchmarks, **survival curves**, and **time-to-first-unrecoverable-error**.

### Grounding boundary and honesty commitments

The chapter's ground truth is three primary sources, tagged and used as follows:

- **[LRH]** — Anthropic, *"Effective harnesses for long-running agents."* The concrete initializer/coding-agent pattern, the `claude-progress.txt` ledger, the feature-list registry (200+ features, "unacceptable to remove or edit tests"), git checkpointing, health checks, and end-to-end verification tools. **This source describes an architecture and its failure modes; it publishes no benchmark numbers.**
- **[HDA]** — Anthropic, *"Harness design for long-running apps."* The three-agent (planner / generator / evaluator) architecture, sprint contracts, the reset-vs-compaction distinction, "context anxiety" in Sonnet 4.5 vs Opus 4.5, the self-evaluation problem, and **the chapter's only quantified head-to-head results** (solo 20 min / \$9 with broken output vs full harness 6 hr / \$200 fully playable; a DAW at ~4 hr / \$125). These are **illustrative single-build anecdotes on a demo domain (app generation), not a controlled benchmark** — the chapter states that scope every time it cites a number.
- **[OCP]** — OpenAI, *compaction guide.* The server-side `compact_threshold`, the opaque encrypted compaction item, the "pass it as-is" rule, and `store=false` for ZDR.

Beyond these, the chapter reuses **[MAR]** (Chapter 9) for the one place it speaks to long horizons — resume-from-error, memory persisting beyond the context window, and "the last mile is most of the journey" — and the earlier-chapter constructs listed under Prerequisites.

The honesty discipline established from Chapter 5 onward holds without exception:

- **Every claim is source-tagged.** Syntheses across sources or beyond them are flagged **[synthesis]**; derivations with stated assumptions are flagged **[derived]**.
- **Unmeasured quantities are stated as unmeasured.** The critical honest admission of this chapter: **the sources describe long-running architectures but publish almost no survival curves, no RPO/RTO measurements, no quality-decay slopes, and no controlled compaction-vs-reset comparison.** The mechanisms are grounded; the magnitudes are not. Where a number would be invented, the chapter instead specifies the *experiment that would produce it* — the survival study, the checkpoint-frequency sweep, the decay-slope regression — and says plainly that the sources did not run it.
- **The [HDA] cost/time figures are reported with their scope every time.** \$200 for one game build is not a reliability metric; it is one anecdote that establishes the *shape* of the cost, not its distribution.

### Learning outcomes

After this chapter you should be able to:

1. **Explain why context length is orthogonal to long-horizon reliability**, and name the two pressures (crash-recovery, quality-decay) that a bigger window does not touch.
2. **Recognize the four horizon failures** — goal drift, forgotten constraint, repeated work, false completion — and explain why short-run evals cannot detect them.
3. **Design an initializer/worker split** with a durable handoff artifact, and state the invariant that makes a worker session *resumable from cold context*.
4. **Decompose a requirement into verifiable task units**, each with an independent success predicate, and explain why the predicate — not the model's opinion — defines "done."
5. **Build a durable ledger/journal** that is authoritative, append-only, and readable by a fresh session, and connect it to the event-log-as-truth model.
6. **Distinguish compaction from semantic state preservation**, and state precisely what compaction is *allowed* to lose and what must survive it via the durable record.
7. **Set a checkpoint frequency from an explicit RPO**, and reason about the checkpoint-cost / lost-work trade-off.
8. **Make actions restart-safe and replayable**, applying the "effectively once" guarantee (at-least-once + idempotency) from Chapter 8 across session boundaries.
9. **Detect a stalled agent** with heartbeats and leases and hand its work to a takeover session without double-execution.
10. **Choose the correct recovery action** — retry / replan / rollback / compensate / quarantine / escalate — from the failure's class.
11. **Replace "the model said it's done" with a verified stop condition**, and explain why this is the single highest-leverage fix in the chapter.
12. **Manage long-running code work** with branches and worktrees and a merge discipline that keeps the main line always-green.
13. **Detect and resist quality decay** with an independent verifier agent, and explain why self-evaluation fails.
14. **Measure a long-running agent** with a survival curve, a time-to-first-unrecoverable-error, and a proper handling of censored runs.

### What this chapter deliberately excludes

- **The production serving substrate** — queues, backpressure, event-sourced recovery infrastructure, capacity planning, disaster recovery across regions — is Chapter 14. This chapter is about the *agent-level* disciplines; Chapter 14 is about the *platform* that runs them.
- **Coding-agent specifics** — repository discovery, the plan/edit/compile/test loop, patch semantics — are Chapter 11. Topic 13 here covers only the *long-running branch-management* slice that intersects checkpointing.
- **General evaluation science** — graders, trace grading, statistical power — is Chapter 13. Topic 15 here specializes to the *survival / time-to-failure* metrics unique to long horizons.
- **Security of the long-running agent** — persistent-credential handling, the expanded attack surface of a multi-day run — is Chapter 12. This chapter notes the security *implications* of durable state (Topic 5's tamper concern, Topic 10's lease-fencing) but does not develop the threat model.

### Sources

- **[LRH]** Anthropic Engineering — *Effective harnesses for long-running agents.* https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- **[HDA]** Anthropic Engineering — *Harness design for long-running apps.* https://www.anthropic.com/engineering/harness-design-long-running-apps
- **[OCP]** OpenAI — *Compaction* (API guide). https://developers.openai.com/api/docs/guides/compaction
- **[MAR]** Anthropic Engineering — *How we built our multi-agent research system.* https://www.anthropic.com/engineering/multi-agent-research-system (reused from Chapter 9)
- Earlier-chapter constructs (not re-cited per claim): Chapter 3 (harness loop, event log), Chapter 6 [ECE][OCP] (context, compaction), Chapter 7 [MEM][ADK-S] (memory, artifacts, state), Chapter 8 [BEA][OAO] (durable execution, termination), Chapter 9 [MAR][OMA][A2A] (multi-agent economics).
- Statistical methods: [KM] Kaplan–Meier; [WILSON] Wilson score interval; see Chapter 1 Topic 12.
