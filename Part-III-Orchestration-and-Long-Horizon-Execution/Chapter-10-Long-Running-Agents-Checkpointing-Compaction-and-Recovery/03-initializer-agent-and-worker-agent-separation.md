# Topic 3 — Initializer-Agent and Worker-Agent Separation

## 1. Scope, prerequisites, terminology, boundaries, outcomes

This topic introduces the foundational architectural move of the chapter: **splitting a long-running agent into a first-run *initializer* and a repeated *worker*.** It is the concrete answer to "how does a task span many sessions" — the initializer builds the durable scaffolding *once*, and every worker session makes bounded incremental progress against that scaffolding, starting cold.

This is the pattern [LRH] is built around, and it is the smallest structure that makes the durable-record-first loop of Topic 1 actually operate across sessions. Everything in Topics 4–15 either builds the scaffolding the initializer creates or defines the discipline a worker follows.

**Prerequisites.** The durable-record-first inversion and Rule CL-1 (Topic 1); the four horizon failures and the re-anchoring read (Topic 2); handoffs vs agents-as-tools and supervisor–worker context isolation (Chapter 8 Topics 4–5); the multi-agent economics — this is a *degenerate* multi-agent system, one role replicated across time (Chapter 9).

**Terminology.**
- **Initializer agent** — the session that runs *once*, on first launch, to set up the environment and the durable scaffolding (ledger, task decomposition, feature registry, repo state). [LRH]
- **Worker agent** (a.k.a. *coding agent* in [LRH]) — the session that runs *every time thereafter*, tasked with "making incremental progress in every session." Many worker sessions per run.
- **Handoff artifact** — the durable state that carries the run forward from one session to the next; the worker reads it at start and updates it at end. [HDA] "structured handoff."
- **Cold start** — a worker session beginning with a fresh, empty context window, reconstructing everything it needs from the durable scaffolding.

**Boundary.** This topic establishes the *split* and the *invariants* that make a worker resumable from cold. The *contents* of the scaffolding are Topics 4–6 (task units, ledger, artifacts); the *reset-vs-compaction* choice within a worker session is Topic 7; *liveness/takeover* between worker sessions is Topic 10. Here we define the roles and their contract.

**Outcome.** You will be able to design an initializer/worker split, state the single invariant that makes any worker session resumable, and decide whether one worker role suffices or a specialized planner/generator/evaluator split ([HDA]) is warranted.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** A single long-lived agent process cannot be the unit of a multi-day task: it dies (P2), its window fills (P1), its quality decays (P3). But the *setup work* — clone the repo, install dependencies, generate the initial plan and the feature list, create the ledger — is expensive, must happen *once*, and must *not* be repeated by every session (that would be Topic 2's repeated-work failure at the largest scale). So there are two structurally different jobs: **set up once** and **advance repeatedly.** Trying to make one agent role do both means every session either redundantly re-initializes or skips setup it actually needed.

**Objective.** Define two roles with a clean contract such that: (i) the initializer runs exactly once and leaves a *complete, self-describing* durable state; (ii) any number of worker sessions can each start cold, make bounded progress, and hand off — with no worker needing to know *which* session number it is or what any previous session held in its window.

**Assumptions.** (a) The environment can be reconstructed deterministically from a setup script the initializer produces (an assumption the initializer's job is to *make true*). (b) Worker sessions are interchangeable — no worker holds unique in-window state that a successor cannot reconstruct from the durable record. This is the assumption the design must *enforce*, not merely hope for.

**Constraints.** The worker must be resumable from *only* the durable record — never from a prior worker's live memory. If any worker leaves state solely in its window, its successor cannot recover it, and the split is broken.

**Success criteria.** Kill any worker session at any point; a fresh worker, reading only the durable record, resumes with bounded lost work and never redoes verified work. The initializer, run twice by mistake, is detectably idempotent (it sees the scaffolding exists and does not clobber it).

## 3. Intuition first, then formalization

**Intuition.** The split mirrors how a well-run engineering team handles a long project across many people's shifts. The *first* person sets up the repo, writes the README, files the tickets, and gets the build green — that is the initializer, and it happens once. Every subsequent shift-worker reads the tickets and the README, picks the next open ticket, does it, updates the ticket, commits, and leaves clean notes — that is the worker, and it happens every shift. Crucially, **no shift-worker needs to have met the previous one.** All coordination is through the durable artifacts (tickets, README, commit history), not through anyone's memory. That property — coordination through artifacts, not memory — is exactly what makes the team survive people leaving mid-project. It is what makes the agent survive sessions ending mid-task.

[LRH] makes this literal: initializer and worker "use identical system prompts and tools but differ only in initial user prompts." The *only* difference is the opening instruction — "set up the environment" vs "make incremental progress on the existing work." Everything else, including the durable-record disciplines, is shared. This is a deliberately minimal split.

**Formalization.** Let the run be a sequence of sessions $\sigma_0, \sigma_1, \sigma_2, \dots$ operating on durable state $D$.

- The **initializer** $\sigma_0$ is a function $\sigma_0: E_0 \mapsto D_0$, taking a bare environment $E_0$ to an initial durable state $D_0$ (scaffolding: setup script, decomposition, ledger, initial commit). It runs once.
- Each **worker** $\sigma_i$ ($i \ge 1$) is a function $\sigma_i: D_{i-1} \mapsto D_i$, taking the durable state left by its predecessor to an advanced durable state, with $D_i$ representing *strictly more verified progress* (or equal, if the session failed to advance).

The run is the composition $D_n = \sigma_n \circ \cdots \circ \sigma_1 \circ \sigma_0(E_0)$, and it succeeds when $D_n$ satisfies the verified stop condition (Topic 12).

**The resumability invariant (RI) — the load-bearing property.**
$$
\forall i:\quad \sigma_{i+1} \text{ depends on } \sigma_i \text{ only through } D_i .
$$
No worker's output depends on any predecessor's *in-window* state — only on the durable $D_i$. Under RI, sessions are a **Markov chain on durable state**: the future depends on the present durable state, not on the history of who computed it. This is what makes the run restartable at any boundary and what makes a killed worker replaceable by a fresh one (Topic 10's takeover). **RI is the formal statement of "coordination through artifacts, not memory."** Violating RI — leaving a needed fact only in the window — breaks resumption exactly as Rule CL-1 (Topic 1) warned.

**Monotonicity.** Define a progress measure $\mu(D_i)$ = number of *verified* task units. The design goal is $\mu(D_{i+1}) \ge \mu(D_i)$ (progress never goes backward) and, on a healthy session, $\mu(D_{i+1}) > \mu(D_i)$. Monotonicity is what turns a sequence of fallible sessions into convergence; Topic 12's verified stop reads $\mu$, and Topic 15's survival curve is the trajectory of $\mu$ over sessions.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Launcher / supervisor** (deterministic code, not a model). Decides whether to run the initializer or a worker: "if scaffolding absent → initializer; else → worker." Enforces idempotency of initialization. Manages leases (Topic 10) so two workers do not run at once.
2. **Initializer agent.** One session. Produces $D_0$: setup script, requirement decomposition (Topic 4), ledger/progress file (Topic 5), feature/test registry, initial artifacts, initial commit. [LRH]: creates a JSON file documenting 200+ features marked "failing," and a `claude-progress.txt`.
3. **Worker agent.** Repeated sessions. Each: reads $D_{i-1}$ (re-anchoring read, Topic 2), runs a **health check** ([LRH]: "a basic test on the development server to catch any undocumented bugs"), selects the next unit, does it, *verifies end-to-end*, updates the ledger, commits, hands off.
4. **Durable state $D$.** Ledger + artifacts + repo (git) + event-log offset. The seat of truth (Topic 5).

**Interface: the shared prompt, the differing opener.** Per [LRH], both agents share system prompt and tools; only the first user message differs. The shared disciplines (read the ledger first, verify end-to-end, leave a clean state, update progress, commit with a descriptive message) live in the shared system prompt so *every* worker inherits them.

**Control flow (one run).**

```
launcher:
  if not scaffolding_exists(D):
      run initializer -> D0            # once
  loop:
      acquire lease                    # Topic 10: single active worker
      run worker(D)  ->  D'            # cold start; read D, advance, hand off
      release lease
      if verified_done(D'): break      # Topic 12
      if unrecoverable(D'): escalate   # Topic 11
```

**Data flow.** All inter-session data flows *through $D$*. A worker never receives another worker's window. This is the concrete enforcement of RI and the reason the launcher, not a long-lived process, is the run's backbone.

**When to specialize the worker role — [HDA]'s three-agent architecture.** [LRH] uses *one* worker role. [HDA] splits the worker into **planner** (expands the prompt into a full spec, avoids over-specifying implementation), **generator** (works feature-by-feature, self-evaluates), and **evaluator** (drives the running app via Playwright MCP, tests against an agreed *sprint contract*, gives skeptical feedback). This is the supervisor–worker / evaluator–optimizer pattern (Chapter 8) realized across a long run. The split's *reason* is Chapter 9's isolation logic and Chapter 8's "separate the doer from the judge": [HDA] found "agents tend to... confidently prais[e] the work — even when... obviously mediocre," and "separating the agent doing the work from the agent judging it proves to be a strong lever." **The specialization is warranted when the task needs an independent quality gate (Topic 14); it is over-engineering when a single worker with a verified stop suffices** — and [HDA] itself notes the sprint/evaluator constructs became *removable* as models improved. Default to one worker role; add the split when you measure a self-evaluation problem.

## 5. Grounding: primary sources and reproducible evidence

**The split itself.** [LRH] states the pattern directly: "an **initializer agent** that sets up the environment on the first run, and a **coding agent** that is tasked with making incremental progress in every session," which "use identical system prompts and tools but differ only in initial user prompts." This is the primary grounding for the two-role design and for the minimal (prompt-only) difference between them.

**The cold-start / re-anchoring necessity.** [LRH]: the progress file lets agents "quickly understand the state of work when starting with a fresh context window" — direct evidence that workers start cold and reconstruct from durable state (RI). The health-check-at-start ("run a basic test on the development server to catch any undocumented bugs") grounds the worker's opening move.

**The specialized three-agent variant.** [HDA] grounds the planner/generator/evaluator split, the sprint contract ("agreeing on what 'done' looked like for that chunk of work before any code was written"), the file-mediated handoff ("one agent would write a file, another agent would read it and respond... with a new file"), and the self-evaluation problem and its remedy (separating doer from judge). It also grounds the *deprecation* of the extra structure as models improve ("Sprint construct removable with Opus 4.6").

**Measured (anecdotal) outcome of having the harness at all.** [HDA]'s single-build comparisons: a solo agent produced a broken game in 20 min / \$9; the full harness produced a fully-playable 16-feature game in 6 hr / \$200; a DAW build ran ~4 hr / \$125 with "2+ hours uninterrupted generation." **Scope, stated every time: these are individual demo-domain builds illustrating that the harness changes the *outcome class* (broken → working), not a controlled benchmark with a distribution.** They ground the *direction* of the split's value, not its effect size.

**Reproducible evidence.** The RI invariant is directly testable: kill a worker at a random step, start a fresh worker, and verify it resumes without redo (E1 below). The idempotent-initializer property is testable by running the initializer twice.

## 6. Implementation: schemas and the shared discipline

**The launcher decision (deterministic).**

```python
def launch(task_id, store):
    D = store.load(task_id)
    if D is None or not D.scaffolding_complete:
        return run_initializer(task_id, store)     # once; writes D0
    return run_worker(task_id, store)              # every subsequent launch
```

**The initializer's output contract ($D_0$).** The initializer is not "done" until $D_0$ is *self-describing* — a cold worker can operate from it alone:

```json
{
  "task_id": "build-daw",
  "objective": "<verbatim assigned objective>",
  "constraints": ["never edit or remove tests", "..."],
  "setup_script": "scripts/init_env.sh",
  "decomposition": [ {"unit_id": "u1", "spec": "...", "predicate": "test:t_u1", "status": "pending"}, ... ],
  "ledger_path": "claude-progress.txt",
  "repo_commit": "<initial commit sha>",
  "scaffolding_complete": true
}
```

[LRH]'s concrete instances: the `claude-progress.txt` progress file and the 200+-feature JSON registry with each feature marked "failing," carrying the hard rule "**It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality.**" (That rule is a *hard constraint* in the sense of Topic 2 — it must survive every re-anchoring read.)

**The worker's fixed opening sequence (in the shared system prompt).**

```
1. Read the ledger / progress file and the decomposition.        # re-anchor (Topic 2)
2. Run the health check / setup script; confirm green baseline.  # [LRH]
3. Select the next pending unit (skip done/verified).            # anti-repeat (Topic 2)
4. Do the unit. Verify it end-to-end against its predicate.      # anti-false-completion
5. Update the ledger; commit with a descriptive message.         # durable, per-step
6. Leave the environment in a clean state; hand off.             # RI
```

[LRH] emphasizes steps 4 and 6 explicitly: without prompting, agents "would fail to recognize that the feature didn't work end-to-end," and "it's still essential that the model leaves the environment in a clean state after making a code change."

**Idempotent initialization.** The launcher's `scaffolding_complete` flag plus the initializer checking for existing scaffolding before writing prevents a re-run from clobbering $D_0$ — the initializer-level version of Topic 9's restart-safety.

## 7. Trade-offs

- **One worker role vs specialized roles.** One role (minimal, [LRH]) is simpler, cheaper, and easier to reason about; it relies on a strong *verified stop* (Topic 12) to catch quality problems. Specialized roles (planner/generator/evaluator, [HDA]) add an independent quality gate that catches what self-evaluation misses, at the cost of more sessions, more tokens, and more coordination (Chapter 9's coordination tax). **Default to one; specialize when you measure a self-evaluation failure.** Re-evaluate as models improve — [HDA] retired constructs that newer models made redundant.
- **Prompt-only difference vs distinct agents.** [LRH]'s "same prompt, different opener" is elegant and keeps the disciplines uniform, but it means the initializer inherits worker instructions it does not need (mild context waste) and the worker inherits nothing initializer-specific (fine). The alternative — fully distinct prompts — risks the two roles drifting apart in their disciplines. The shared-prompt approach is the more maintainable default.
- **Cold start cost vs resumability.** Reconstructing context every worker session (the re-anchoring read + health check) costs tokens and time *every session*. This is the price of RI. Against it: without cold-start discipline you cannot survive a crash at all. The cost is bounded (a few thousand tokens) and buys unlimited restartability.
- **Initializer as single point of failure.** If the initializer produces a *bad* decomposition or a wrong constraint, every worker inherits it (Topic 2's "re-anchoring the wrong thing"). The initializer's output deserves review — human or an independent check — because its errors are *maximally amplified*. This is the strongest argument for a human gate at the initialize→work boundary.

## 8. Experiments: baselines, ablations, metrics

**E1 — RI / resumability test (the core correctness experiment).** Run to mid-task; `kill -9` the worker at a random step; launch a fresh worker; measure (a) whether it resumes (RI holds) or stalls/asks for lost context (RI violated), and (b) redo rate (verified units re-executed — should be zero). Baseline: an agent with no durable ledger (expect resumption failure / high redo). Metric: resume-success rate, redo rate. This directly tests the chapter's central invariant.
**E2 — One-role vs three-role ablation ([LRH] vs [HDA]).** Same task, same total budget; compare single-worker vs planner/generator/evaluator. Metric: end-state task success (Topic 15), quality score, cost, wall-clock. **Prediction from [HDA]:** the evaluator split raises quality on tasks hard relative to the model (catches stubs, e.g. [HDA]'s "audio recording, clip editing" feature stubs) and is *neutral-to-negative* on tasks easy for the model (pure overhead). Stratify by task difficulty relative to model capability — that stratification *is* the finding.
**E3 — Health-check ablation.** Toggle the worker's opening health check. **Prediction ([LRH]):** without it, workers build on undetected broken baselines and waste sessions; with it, they catch "undocumented bugs" at session start. Metric: wasted-session rate (sessions that made no verified progress because the baseline was broken).

**Honest status.** [HDA]'s cost/time anecdotes (E2-adjacent) exist but are single builds; the *controlled* stratified comparison is unpublished. E1's resumability is the most important and most reproducible; the sources describe the design that makes it pass but publish no resume-rate numbers. Report mechanisms as grounded, magnitudes as your own measurements.

## 9. Failure modes, edge cases, hazards, limitations

- **RI violation (the cardinal failure).** A worker leaves a needed decision only in its window ("I chose approach X for reasons I didn't write down"). The successor cannot reconstruct it and either stalls or re-derives differently, causing inconsistency. Mitigation: the handoff artifact must capture *decisions and rationale*, not just state (Topic 5); enforce with a handoff-completeness check.
- **Initializer non-idempotency.** A re-run initializer clobbers $D_0$ (e.g., regenerates the decomposition, orphaning completed work). Mitigation: the `scaffolding_complete` guard and launcher logic; treat re-initialization as requiring explicit human intent.
- **Two workers at once.** Without a lease (Topic 10), a stalled-worker takeover can produce two concurrent workers writing $D$, corrupting the ledger and duplicating effects. Mitigation: single-active-worker lease with fencing (Topic 10).
- **Over-specialization drift.** Adopting the three-role split on a task that does not need it adds coordination tax (Chapter 9) and can *reduce* throughput without quality gain — and worse, the extra roles become stale as models improve. Mitigation: measure the self-evaluation gap before splitting; garbage-collect roles that no longer earn their place (Chapter 15).
- **Edge case: the initializer's decomposition is wrong.** If units are mis-scoped (too coarse to verify, Topic 4), every worker inherits an unmeasurable plan. Mitigation: Topic 4's verifiable-unit discipline, applied *by the initializer* and reviewed before work starts.
- **Limitation.** The split is grounded in a *coding/app-building* context ([LRH], [HDA]). Its transfer to non-code long-horizon tasks (research, ops) is a **[synthesis]** — the *structure* (setup-once, advance-repeatedly, artifact-mediated handoff, RI) is domain-general, but the concrete instances (git commits, feature-test registry) are code-specific and must be re-instantiated (an event journal and evidence records for research; Topic 5).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- The initializer/worker split with identical prompts differing only in the opener is the grounded, shipped design for long-running agents [LRH].
- Workers start cold and reconstruct from a durable progress file; the file exists specifically to make cold start work [LRH].
- Separating the doer from an independent judge is a "strong lever" against confident self-praise [HDA]; the extra structure is *removable* as models improve [HDA].
- Having the harness at all changes the *outcome class* (broken → working) in demo builds [HDA] — direction grounded, effect size anecdotal.

**Decision rules.**
- **DR-1.** Split any task whose $K$ exceeds a session into initialize-once + advance-repeatedly. Do not make one agent role do both.
- **DR-2.** Enforce RI: no worker may depend on a predecessor's window. If a fact matters to the successor, it goes in the durable record *now* (Rule CL-1). Test with E1's kill-and-resume.
- **DR-3.** Start with one worker role + a verified stop (Topic 12). Add planner/generator/evaluator only when you *measure* a self-evaluation gap (Topic 14). Re-check that added roles still earn their place after model upgrades.
- **DR-4.** Review the initializer's output. Its errors are amplified across every worker; it is the highest-leverage place for a human gate.

**Production implications.** The initializer/worker split is what converts "an agent that works for a while" into "a run that finishes across restarts." The launcher — deterministic, not a model — is the run's backbone; the model does the steps, the code decides initialize-vs-work and enforces the lease. This is the minimal-agent principle (Chapter 8) applied to the *orchestration* of a long run: put the durable, safety-critical control (which role, single-writer, resume point) in code, and the capability (the actual work) in the model.

**Connections.** RI is the operational form of Topic 1's Rule CL-1 and Chapter 7's state-as-projection. The worker's opening re-anchoring read is Topic 2's anti-drift/forgotten/repeat mechanism. The three-role variant is Chapter 8's evaluator–optimizer and Chapter 9's isolation across a long run; its self-evaluation motivation is Topic 14. The scaffolding the initializer builds is Topics 4 (units), 5 (ledger), 6 (artifacts). The lease that keeps one worker active is Topic 10. Convergence of $\mu$ over sessions is measured in Topic 15.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (initializer + coding agent; identical prompts, different openers; `claude-progress.txt`; 200+-feature registry; "unacceptable to remove or edit tests"; health check; end-to-end verification; clean-state requirement).
- **[HDA]** Anthropic — *Harness design for long-running apps* (planner/generator/evaluator; sprint contract; file-mediated handoff; self-evaluation problem and doer/judge separation; removable structure as models improve; solo 20 min/\$9 vs harness 6 hr/\$200; DAW ~4 hr/\$125).
- Internal: Chapter 8 Topics 4–5 (supervisor–worker, handoffs, evaluator–optimizer, minimal-agent), Chapter 9 (multi-agent economics, coordination tax, isolation), Chapter 7 Topic 3 (state as projection), this chapter Topics 1 (RI/CL-1), 2 (re-anchoring), 4–6 (scaffolding), 10 (lease), 12 (verified stop), 14 (verifier), 15 (survival).
