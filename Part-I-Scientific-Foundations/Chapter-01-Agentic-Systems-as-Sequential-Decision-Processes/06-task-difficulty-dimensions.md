# Topic 6 — Task Horizon, Branching Factor, Observability, Reversibility, and Failure Cost

## 1. Problem and objective

Topic 5 gave coordinates for the *system*; this topic gives coordinates for the *task*. Reliability is a property of the match between the two. The five task axes here — horizon, branching factor, observability, reversibility, failure cost — are the ones for which the sources provide either direct measurements or explicit design machinery. The objective: for each axis, state what it is, how it moves the failure probability or the failure *consequence*, and what evidence pins the direction and rough magnitude of the effect.

## 2. Intuition first

Why can a frontier agent configuration score 82% on Terminal-Bench and under 10% on the hardest tier of Agents' Last Exam [ALE §1]? Not because the underlying skills vanish. Because the second benchmark's tasks are *longer* (more sequential steps that must all go right), *wider* (GUI + CLI + domain software rather than a terminal alone), *murkier* (state spread across applications the agent must actively probe), and scored against *deliverables* rather than intermediate progress. Task difficulty for agents is not one number; it is a shape. Systems fail when their agency shape (Topic 5) is mismatched to the task shape.

## 3. The five axes

### 3.1 Horizon — how many decisions must compose

The number of dependent decision steps between start and verified completion. The controlling evidence is the chapter's founding result: prompted LLM agents at **94.0%** on base MiniWoB tasks fall to **24.9%** on 50 compositional CompWoB tasks; finetuned models from **85.4%** to **54.8%**; degradation worsens when instruction *order* changes [CompWoB]. ALE extends the point to economically real work: tasks are admitted only if they constitute "an end-to-end deliverable that would take an expert substantial time, rather than only a few UI operations" — the distinction "between a workflow and an action" [ALE §2.1] — and at that granularity average full pass rates fall **below 1%** [ALE abstract]. Horizon is the axis along which capability claims die; Topic 8 gives it its mathematics.

### 3.2 Branching factor — how many actions are available per step

The effective size of the admissible action set at each decision point. LLM-agent action spaces are heterogeneous by construction — language, tool calls, planning, environment control, communication [MEM §2.1] — and every added tool or interface widens the per-step choice. ALE's task surface is "by construction, a superset of GUI-only benchmarks like OSWorld and CLI-only benchmarks like Terminal-Bench," demanding GUI interaction interleaved with shell scripting, code execution, and file manipulation — "the union of capabilities that existing benchmarks test in isolation" [ALE §1]. Branching interacts multiplicatively with horizon: the trajectory space grows roughly as (branching)^(horizon) **[derived — combinatorial statement, assumptions: independent per-step choice sets]**, which is why "add more tools" is not a free capability upgrade (Chapter 5 documents when it is a downgrade).

### 3.3 Observability — how much relevant state is visible per observation

Topic 3's axis, viewed from the task side: how much of the success-relevant state s_t the interface exposes per o_t, and at what cost. Tasks range from fully-inspectable (a repo with a test suite — code is an "executable, inspectable, and stateful medium" [CAH §1]) to probe-expensive (multi-application GUI state, where each look costs a screenshot-parse cycle). Harness-Bench operationalizes the difference between *checkable* and *unchecked*: tasks are admitted only under **Oracle-checkability** — success verifiable "by deterministic checks or a specified rubric" [HB §3.2]; low task observability without an oracle forces rubric/judge grading, which imports grader noise into the measurement itself.

### 3.4 Reversibility — whether wrong actions can be undone

The axis with the sharpest engineering encoding. The reference runtime *types actions by it*: "read-only tools (like Read, Glob, Grep...) can run concurrently. Tools that modify state (like Edit, Write, and Bash) run sequentially" [CAL]; the permission ladder auto-approves edits before arbitrary commands [CAL]. Reversibility is also what sandboxing manufactures: Harness-Bench's offline sandboxes ensure "each model–harness pair starts from the same initial state" [HB §3.2] — every action reversible by environment reset. Production reversibility is bought with mechanisms: version control for edits, idempotency for API calls, staged deploys for releases. Where it cannot be bought (sent emails, external financial actions), the axis is pinned at zero and everything must move to approval gates.

### 3.5 Failure cost — what a wrong outcome costs

Independent of failure *probability*: the loss when it happens. The sources encode it two ways. Harness-Bench makes one class of failure lexically dominant — Security ∈ {0,1} multiplies the whole score, so "unauthorized access, secret exposure, or forbidden actions" cost everything regardless of completion quality [HB §3.4]. The system cards scale controls by consequence class: high-consequence domains (cyber, bio) get capability classifiers and gated release tiers rather than mere monitoring [FSC Exec. Summary; G56 §1]. The general rule both encode: as failure cost rises, controls move from *statistical* (accept x% error) to *structural* (make the error impossible or non-executable).

## 4. Formalization: the risk functional

For a task with horizon n, per-step success probabilities p_i, per-step detect-and-recover probability d_i, and consequence C for undetected failure:

```
E[loss] ≈ C · P(undetected failure)
P(task success, no verification)     = ∏ᵢ pᵢ                        (multiplicative decay)
P(undetected failure, with checks)   = ∏ᵢ pᵢ terms replaced by
                                       per-step (1 − pᵢ)(1 − dᵢ) leakage
```

**[derived — assumptions: step independence and binary step outcomes; CompWoB shows real composition degrades *worse* than this bound (Topic 8), so treat ∏pᵢ as optimistic.]** The functional makes the axes' roles explicit: horizon sets n; branching and observability move p_i (more choices, less visibility → lower per-step correctness); reversibility moves d_i's *usefulness* (detection without undo is a smaller consolation); failure cost sets C. Agency configuration (Topic 5) must be chosen so that E[loss] stays under the task's tolerance — that is the whole matching problem in one line.

## 5. The matching matrix

| Task shape | Appropriate response (with mechanism) |
|---|---|
| Long horizon, verifiable subgoals | Decompose; verify per-milestone (ALE's "milestone-based checks" [ALE §3]); checkpoint state (Ch. 10) |
| Long horizon, no intermediate checks | Redesign the task before deploying an agent — this shape is where <1% pass rates live [ALE] |
| High branching | Constrain the action set per phase (minimal tool enablement [HB Table 1]); route/plan explicitly (Ch. 8) |
| Low observability | Buy observations (probe tools) or instruments (tests as oracles [CAH]); refuse rubric-only success criteria where a deterministic check is constructible [HB §3.2] |
| Low reversibility | Approval gates on the irreversible subset (permission rules, `PreToolUse` hooks blocking calls [CAL]); sandbox rehearsal first [HB §3.2] |
| High failure cost | Structural controls: binary gates [HB §3.4], authority tiering [FSC], barrier chains [G56 §1] |

## 6. Measurement: profiling a task before building for it

A task profile is five numbers/labels obtainable *before* any agent is built:

1. **Horizon estimate:** expert count of dependent steps to deliverable (ALE's expert task-sourcing pipeline does precisely this via advisory-committee workflow mapping [ALE §2.2–2.3]).
2. **Branching estimate:** size of the minimal tool/action set that covers the workflow (not the maximal one available).
3. **Observability label:** oracle-checkable / rubric-checkable / human-judgment-only — Harness-Bench's admission criterion applied as triage [HB §3.2].
4. **Reversibility inventory:** the exact list of irreversible action types the task requires; each list item is a future approval gate.
5. **Failure cost class:** consequence tier per failure type, with the security-class failures flagged for lexical (not weighted) treatment [HB §3.4].

Benchmarks that skip this profiling produce the pathology ALE documents: a field where "benchmark victories have accumulated faster than measurable transformation in core industries" [ALE §1] because the measured tasks and the valuable tasks have different shapes.

## 7. Failure modes

- **Horizon underestimation:** the demo is three steps; the deployment is thirty. CompWoB's 94→24.9 [CompWoB] is the canonical measurement of what that mistake costs.
- **Branching bloat:** enabling every available tool "to be safe" — widening the denominator of every step decision. Harness-Bench's minimal-enablement protocol [HB Table 1] is the countermeasure stated as method.
- **Observability theater:** an agent that *reports* progress in fluent prose on a task whose true state it cannot check — mechanism 4 of Topic 3, weaponized by low task observability. The false-completion examples [FSC §2.3.3] are this failure at frontier capability.
- **Reversibility assumptions crossing environments:** rehearsed-in-sandbox behavior shipped to production, where reset does not exist [HB §3.2 is explicit that sandbox reversibility is a benchmark construction].
- **Cost-blind optimization:** tuning aggregate success while the rare expensive failure dominates E[loss]; the multiplicative Security gate [HB §3.4] exists because averaging hides exactly this.

## 8. Limitations

- The five axes are not independent (low observability usually lowers reversibility in practice: you can't undo what you didn't notice), and the risk functional's independence assumptions are known-optimistic [CompWoB].
- Horizon and branching estimates from experts are noisy; ALE's multi-gate review pipeline (first-pass review, engineer dry-runs, final QC committee [ALE §2.3]) is what serious estimation costs — most teams will run a cheaper, rougher version and should say so in their reports.
- Failure cost is organization-relative; no source offers a portable scale, and we do not invent one.

## 9. Production implications

1. **Profile the task before selecting the architecture.** The five-number profile (§6) is an afternoon of work and determines the entire control stack; skipping it means discovering the profile in production.
2. **Shorten the effective horizon by design:** verifiable milestones convert one n-step task into k tasks of length n/k with detection between them — the single highest-leverage reliability move this chapter offers (formal treatment in Topic 8).
3. **Spend branching budget deliberately:** per-phase tool scoping, not global enablement [HB Table 1; CAL's per-agent tool restriction].
4. **Let reversibility set the approval topology:** gates go exactly on the irreversible inventory items, nowhere else — gates everywhere is how approval fatigue defeats the control.
5. **Report the profile with the result.** A success rate without (horizon, branching, observability, reversibility, cost) context is not interpretable; ALE vs Terminal-Bench (82% vs <50%/<10% for the *same configuration* [ALE §1]) is the field-scale proof.

## 10. Connections

- Topic 5 × Topic 6 is the matching problem; Topic 10 solves it in the minimal-agency direction.
- Topic 8 develops axis 1 (horizon) into the error-accumulation calculus; Topic 3 developed axis 3.
- Chapter 5 engineers axis 2 (tool surfaces); Chapter 10 engineers axis 1 (checkpointing); Chapter 12 owns axes 4–5 (approval policy by consequence and reversibility); Chapter 13 builds task specifications that carry this profile explicitly.

## Sources

[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) abstract, §1, §2.1–2.3, §3
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.2, §3.4, Table 1
[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) Exec. Summary, §2.3.3
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
