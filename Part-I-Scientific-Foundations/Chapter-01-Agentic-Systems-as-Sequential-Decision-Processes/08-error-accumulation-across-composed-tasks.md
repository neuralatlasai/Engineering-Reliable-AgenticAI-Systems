# Topic 8 — Error Accumulation Across Composed Tasks

## 1. Problem and objective

Topic 7 established that composition destroys local competence; this topic supplies the calculus. The objective is a quantitative model of how per-step errors aggregate over a trajectory, calibrated against the one controlled composition experiment in our ledger (CompWoB), and then — the constructive half — the mathematics of what verification, checkpointing, and recovery do to the decay curve. The punchline is worth stating first: **the naive multiplicative model is the *optimistic* bound for unverified execution, and the entire engineering discipline of Parts II–III is a set of devices for beating it.**

## 2. Intuition first

A relay race with 20 handoffs, each 99% clean, finishes clean 82 times in 100. At 95% per handoff, 36 times. At 90%, 12. Nothing about any single runner changed — length alone did the damage. Now add the agentic twist the relay metaphor misses: a fumbled baton in an agent run is not always *dropped visibly*. Often it is carried forward — a wrong file edit, a misremembered constraint, a false "tests passed" — and every subsequent step executes correctly *relative to a corrupted state*. Composed error in agents is less like dropping batons and more like grabbing the wrong baton and running hard.

## 3. The baseline model and its empirical violation

**Independence baseline.** With per-step success p_i over n dependent steps and no detection/recovery:

```
P(success) = ∏ᵢ₌₁ⁿ pᵢ  =  p̄ⁿ (identical steps)
p̄ = 0.99: n=10 → 0.904   n=50 → 0.605   n=200 → 0.134
p̄ = 0.95: n=10 → 0.599   n=50 → 0.077   n=200 → ~3·10⁻⁵
```

**[derived — assumptions: step independence, binary outcomes, no recovery]**

**The violation.** CompWoB provides the calibration point: base-task success 94.0% for prompted agents predicts, under independence, roughly 0.94² ≈ 88% for two-task compositions and ~83% for three. Observed: **24.9%** [CompWoB]. The independence model errs *optimistically* by a factor of ~3.5 at n as small as 2–3. Finetuned models (85.4% base) predict ~73% at n=2 against an observed 54.8% — better, still optimistic. And success degrades further under instruction reordering [CompWoB], which independence says should not matter at all.

**Why super-multiplicative degradation.** The mechanisms, each traceable to chapter machinery:

1. **State contamination:** step k's error alters s or b̂ for all later steps (Topic 3's mechanisms 2 and 4); errors are not independent events but persistent environment features. Code's statefulness makes this explicit — artifacts "persist... within the task execution loop" [CAH §1], carrying mistakes with them.
2. **Context interference:** composed tasks share one h_t; earlier-task content dilutes and distracts later-task decisions — the reordering sensitivity [CompWoB] is direct evidence, since reordering changes only context layout, not skills.
3. **Per-step p is not constant:** p_i falls as context fills and the belief state degrades over long runs; the per-step number measured on short episodes overestimates the tail of long ones. (Chapter 10 treats quality decay across extended runs.)

So the honest inequality: **P(success) ≤ ∏ pᵢ for unverified composed execution, with the gap growing in shared-state coupling.** [CompWoB-calibrated; mechanism attribution derived]

## 4. The constructive half: what verification does to the curve

Model each step with three outcomes: correct (p), *detected* error (probability (1−p)·d), undetected error ((1−p)·(1−d)), where d is detection power. Detected errors trigger retry at cost but not failure; undetected errors absorb.

```
P(eventual step success | retries allowed) = p / (p + (1−p)(1−d))     per step
P(task success) = [ p / (p + (1−p)(1−d)) ]ⁿ
d = 0:    reduces to pⁿ                     (no verification)
d = 1:    → 1 per step                      (perfect detection: only cost grows, not failure)
p=0.95, d=0.9, n=50:  per-step 0.9948 → task ≈ 0.77   (vs 0.077 unverified: a 10× improvement)
```

**[derived — assumptions: detection independent of error type, unlimited retries, retry draws fresh; real detectors are correlated with error causes, so treat as directional, not predictive]**

The lever is d, and d is *engineered*, not hoped for:

- **Oracles:** tests, type checkers, deterministic validators — code environments ship native high-d instruments; execution traces and tests "check and refine reasoning" [CAH §1–2]. This is the quantitative reason coding agents lead the reliability league (Chapter 11).
- **Judged process checks:** Harness-Bench's Robustness score measures "whether the agent handles tool or environment failures" [HB §3.4] — detection-and-recovery behavior, scored.
- **What self-report contributes to d: approximately zero.** The false-completion catalog [FSC §2.3.3.1–.2] means the model's own "done, verified" is policy output (Topic 2, I4), not a detector. Counting it as d is how teams arrive at production incidents with green dashboards.

**Checkpointing bounds loss, not failure probability.** Segmenting n steps into k verified milestones (ALE's "milestone-based checks" [ALE §3]) converts one length-n bet into k bets of length n/k with recovery points between; failure cost shrinks from restart-everything to restart-one-segment **[derived]**. Chapter 10 implements this.

## 5. Architecture: the accumulation-aware execution loop

The canonical loop already contains the hooks; the design question is whether they are used:

```
per turn:   act → observe result → (verify?) → update state
            └ tool errors surface in results — the model reacts to failures [CAL]
            └ hooks (PostToolUse) audit outputs deterministically [CAL]
per phase:  milestone check against oracle/rubric → checkpoint or rollback
per run:    budget backstops (max_turns, max_budget_usd) bound the cost of
            a failure spiral even when detection fails [CAL]
```

Sequencing matters: state-mutating tools already run serialized [CAL], which means each mutation *could* be followed by a verification read before the next — the runtime permits per-step d > 0; harness policy decides whether to pay for it.

## 6. Measurement

1. **Estimate p̄ from short-horizon evals, then test the *decay*, not the point.** Run matched task families at n ∈ {1, 2, 4, 8, …} (the CompWoB construction: compose tasks you already measure at base [CompWoB]); plot log P(success) vs n. Slope steeper than n·log p̄ quantifies your coupling penalty.
2. **Measure d directly:** inject known faults (failing tool responses, corrupted files) and count detections — Harness-Bench's robustness rubric formalizes the scoring side [HB §3.4].
3. **Separate detected-and-recovered from undetected-and-lucky** in traces; the two look identical in outcome metrics and mean opposite things about your system. Trace-level evidence collection (final workspace, execution trace, usage statistics, validator outputs [HB §3.3]) exists precisely to make this distinction observable.
4. **Track turn counts per task** [HB Table 2 reports turns per harness]; rising median turns at flat success is early warning of accumulating inefficiency — retries eating the gains of detection.

## 7. Failure modes

- **Verification theater:** checks that share the failure mode of the step they check (the model re-reading its own summary; a judge grading fluency). d measured against injected faults, not assumed from check *count*.
- **Recovery that contaminates:** a "retry" that acts on the already-corrupted state repeats the error deterministically. Recovery must restore a known-good checkpoint, not re-prompt over the wreckage (Chapter 10's restart-safe execution).
- **Error laundering across milestones:** a milestone check that passes on partial truth converts an accumulating error into a *certified* one; downstream trust in the certificate makes it worse than no check. Milestone oracles need the same integrity screening as task oracles [HB §3.2].
- **Compounding via memory:** an undetected error consolidated into 𝓜_t by the evolution operator E [MEM §2.2] outlives even the run — cross-task accumulation, Chapter 7's contamination problem.
- **The long-tail spiral:** repeated failed retries burning budget; the backstop subtypes (`error_max_turns`, `error_max_budget_usd` [CAL]) are the harness admitting detection failed — instrument how often they fire; each firing is an accumulation event that beat your detectors.

## 8. Limitations

- All closed-form results here are **[derived]** with stated assumptions the data already violate in the optimistic direction (§3); use them for design *direction* and back-of-envelope bounds, never as predicted success rates.
- CompWoB is one environment (web automation) at small n with 2023–24-era models; it is our only controlled composition measurement, which is itself a statement about the field's evaluation gaps. ALE's <1% at long horizon [ALE] is consistent with severe accumulation but confounds horizon with domain difficulty — it cannot separate the two.
- The verification model assumes retry independence; agentic retries condition on the same context and weights, so effective d and retry freshness are both lower than the formulas assume. Measured decay curves (§6) trump the algebra.

## 9. Production implications

1. **Every added step is a reliability tax; price it.** The first question for any workflow extension: what does this do to n, and what oracle covers it?
2. **Buy detection before capability.** Moving p̄ 0.95→0.97 at n=50 yields ~0.22; adding d=0.9 at p̄=0.95 yields ~0.77 **[derived, §4]**. Verification engineering dominates model upgrades on long tasks — and it is cheaper.
3. **Never accept self-reported completion as a stop condition** on tasks with n > a handful; require verified task state [FSC §2.3.3; Chapter 10's stop-condition rule].
4. **Checkpoint at the milestones you can oracle**, and only there — un-oracled checkpoints are laundering points (§7).
5. **Watch the backstop-firing rate** as a standing SLO input: it is the count of accumulation events your detection layer missed.

## 10. Connections

- Supplies the mechanism for Topic 7's §5.2 and the mathematics for Topic 6's horizon axis.
- Topic 9's case for deterministic workflows is this topic's algebra applied: deterministic steps have p ≈ 1 and d irrelevant, so every step moved from π_M to π_D shortens the *stochastic* horizon.
- Chapter 10 (checkpointing, recovery, verified stop conditions) implements §4; Chapter 11's verifier stack is the d-engineering catalog; Chapter 13's pass^k and survival-curve metrics are §6 industrialized.

## Sources

[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.2–3.4, Table 2
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1–2
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.2
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1, §3
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §2.3.3
