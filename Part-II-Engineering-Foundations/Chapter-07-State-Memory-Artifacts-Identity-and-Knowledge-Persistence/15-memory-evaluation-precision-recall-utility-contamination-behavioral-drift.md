# Topic 15 — Memory Evaluation: Precision, Recall, Utility, Contamination, and Behavioral Drift

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Measuring the memory system. Five metrics that must be measured *separately* — precision, recall, utility, contamination, behavioral drift — because a memory system can be good on one and catastrophic on another, and an aggregate hides which. This is the chapter's measurement discipline, the analogue of Chapter 5, Topic 13 (tools) and Chapter 6, Topic 13 (context) for persistence.

**Prerequisites.** Chapter 1, Topic 12 (the statistics contract); Chapter 6, Topic 13 (the same separate-the-factors argument, for context); every topic in this chapter (each ends in a claim this topic tests).

**Terminology.** *Precision*: are retrieved memories relevant/correct? *Recall*: are relevant memories retrieved? *Utility*: does memory improve task outcomes? *Contamination*: is the store polluted with wrong/poisoned memory? *Behavioral drift*: does accumulating memory change the agent's behavior over time — for better or worse?

**Boundaries.** Inside: the metric set and experimental designs. Outside: the operations being measured (Topics 5–14); the statistics (Chapter 1, Topic 12).

**Exclusions.** No memory-benchmark leaderboard.

**Outcomes.** The reader can localize a memory failure to a specific metric — and therefore to a specific topic's fix — with intervals, and can detect the slow, dangerous failure (behavioral drift) that point-in-time metrics miss.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A memory system has many levers — types (Topic 5), write/read policies (Topics 6–7), consolidation and forgetting (Topic 8), temporal validity (Topic 9) — and a team with only "did the task succeed" cannot tell which lever to pull. Worse, memory has a failure mode no single-turn metric catches: **behavioral drift** — the agent's behavior changing *over time* as memory accumulates, because memory is the one system that makes the agent's future depend on its past. A memory system can look fine on every point-in-time metric and slowly poison itself.

**Bottleneck.** The chapter has repeatedly flagged that its central quantities are **unmeasured in the sources**: per-type memory value (Topic 5), consolidation error rate (Topic 8), confidence calibration (Topic 9), scope-error incidence (Topic 2). [MEM] is a survey that maps the space and, in general, does not supply effect sizes. **This topic is where those gaps get filled locally** — and it adds the temporal dimension (drift) that the other measurement topics (tools, context) did not need, because only memory persists across runs.

**Objective.** A metric set that localizes memory failures to a factor, plus a *longitudinal* design that catches drift — the slow failure unique to memory.

**Assumptions.** Memory operations are configuration; changing them carries Chapter 3, Topic 14's evidentiary burden. Memory persists across runs, so its failures compound over time.

**Constraints.** Utility and contamination need labeled data; drift needs *longitudinal* measurement (across many runs over time), which is more expensive than point-in-time.

**Success criteria.** Every memory-system change is accepted/rejected on the vector with intervals; failures are attributed to a factor; drift is detected before it degrades production.

## 3. Intuition first, then formalization

### 3.1 Intuition: five ways memory fails, and one of them is slow

A memory system can fail in five independent places **[synthesis; grounded in [MEM] and Chapter 6, Topic 13]**:

1. **Precision failure** — retrieved memories are irrelevant or wrong. Fix: read policy (Topic 7), consolidation quality (Topic 8), confidence (Topic 9).
2. **Recall failure** — relevant memories are not retrieved. Fix: retrieval (Chapter 6, Topic 5), read scope (Topic 7), extraction (Topic 6 — was it even stored?).
3. **Utility failure** — memory is precise and recalled but does not *help* the task. Fix: memory type relevance (Topic 5), or the memory is not decision-relevant.
4. **Contamination** — the store is polluted with wrong, poisoned, or over-generalized memory. Fix: write policy (Topic 6 W-2), consolidation verification (Topic 8 L-1), conflict resolution (Topic 8 L-3).
5. **Behavioral drift** — the agent's behavior changes *over time* as memory accumulates. **The slow, dangerous one**, unique to memory.

The first four are point-in-time (measurable on a snapshot). The fifth is *longitudinal* and is the intuition that makes memory evaluation different from tool or context evaluation: **memory is the only system that makes the agent's future a function of its past, so it is the only system that can drift.** An agent with a poisoned memory (Topic 6), an over-generalized fact (Topic 8), or an accumulating bias gets *worse over time* even as every point-in-time metric looks stable — because the harm is in the *trajectory*, not the snapshot.

The two most-often-conflated, and the bug each hides:

- **Precision vs utility.** A memory can be *precise* (relevant, correct) and *useless* (does not change the outcome). Measuring precision and calling it "memory works" misses that the memory, while correct, is not *decision-relevant*. **High precision, low utility = the memory system is accurate about things that do not matter.**
- **Contamination vs precision (point-in-time) vs drift (longitudinal).** Contamination is *store pollution* (wrong memory present); precision is *retrieval accuracy* (is what I retrieved right); drift is *behavioral change* (am I getting worse). A store can have low contamination now, good precision now, and still be drifting — because the drift is in how accumulating memory *shapes behavior*, which neither point-in-time metric sees.

### 3.2 Formalization: the five metrics

For a task set $\mathcal T$ with labeled relevant/correct memory **[synthesis; standard metrics composed for memory, grounded in [MEM] and Chapter 6, Topic 13]**:

$$
\textbf{Precision} = \frac{|\text{retrieved} \cap \text{relevant-and-correct}|}{|\text{retrieved}|},
\qquad
\textbf{Recall} = \frac{|\text{retrieved} \cap \text{relevant}|}{|\text{relevant}|}.
$$

$$
\textbf{Utility} = \Pr(\text{task success} \mid \text{memory}) - \Pr(\text{task success} \mid \text{no memory})
\quad\text{— the memory's causal effect on outcomes.}
$$

$$
\textbf{Contamination} = \frac{|\text{wrong / poisoned / over-generalized memories in the store}|}{|\text{store}|}
\quad\text{— store pollution (Topics 6, 8).}
$$

$$
\textbf{Drift} = \frac{d}{dt}\bigl[\text{behavioral metric}\bigr]
\quad\text{— the RATE of behavioral change as memory accumulates (longitudinal).}
$$

The relationships that make separation diagnostic **[derived]**:

- **Utility is the causal metric, and it is measured by ablation** — memory-on vs memory-off, exactly like Chapter 6, Topic 14's attribution-by-ablation. **Precision and recall are necessary but not sufficient for utility**: a memory system can retrieve perfectly and still not help, if what it retrieves does not change decisions. Measure utility directly; do not infer it from precision/recall.
- **Contamination bounds precision over time.** A contaminated store *will* eventually retrieve wrong memory (precision falls) — so contamination is a *leading indicator* of a precision failure. Measuring contamination catches the problem before it manifests as bad retrieval.
- **Drift is the derivative none of the others capture.** Precision, recall, utility, contamination are *levels* (measured at a time). Drift is a *rate* (measured across time). **A system can have good levels and bad drift** — stable-looking metrics with a worsening trajectory, which is the failure that ships and then slowly degrades.

### 3.3 Behavioral drift is memory's unique failure — and it cuts both ways

Drift is the topic's most important concept because it is *unique to memory* and *invisible to snapshot metrics* **[synthesis; grounded in [MEM]'s adaptation dynamics and the propensity findings]**.

Memory makes the agent *adaptive* — [MEM] frames memory as enabling "continual adaptation" and "adaptability" [MEM]. Adaptation is drift *by design*: the agent's behavior changes as it learns. **The question is not whether the agent drifts (it must, to adapt) but whether the drift is toward better or worse behavior.**

Two directions **[synthesis]**:

- **Beneficial drift:** the agent accumulates correct preferences, useful procedures, and true facts, and gets *better* at the user's tasks over time. This is the point of memory — the personalization and learning that memory exists to provide.
- **Harmful drift:** the agent accumulates poisoned memory (Topic 6), over-generalized facts (Topic 8), spurious correlations, or a self-reinforcing bias, and gets *worse* over time. **A poisoned memory acts on every future run (Topic 6); an over-generalized fact ("deploys always fail") shapes every future decision; a consolidation error compounds.** And it connects to Chapter 2's measured propensities — an agent whose memory reinforces a bad pattern (false completion, verification-skipping) drifts toward it.

The critical property: **harmful drift is slow, compounding, and invisible to point-in-time metrics.** Each run looks fine; the trajectory is downward. This is why drift must be measured *longitudinally* — across many runs over time — and why a memory system that passes every snapshot test can still fail. **The discipline: measure the derivative, not just the level.** A memory system's health is a trajectory, and only a longitudinal design reveals it.

## 4. Architecture

```
   TASK SET (labeled relevant/correct memory; longitudinal run schedule)
        │
        ▼
   RUN under memory config c (versioned — Topic 13; memory-store hash recorded)
        │
        ▼
   TRACE τ̂ — retrieved memories, provenance, outcomes, over TIME
        │
        ▼
   ┌── GRADERS, one per FAILURE MODE (§3.1) ────────────────────────────┐
   │  PRECISION:      retrieved ∩ correct         (read policy T7, T8/T9) │
   │  RECALL:         relevant ∩ retrieved        (retrieval, extraction) │
   │  UTILITY:        ablation: memory-on − off   (type relevance T5)     │
   │  CONTAMINATION:  wrong/poisoned in store      (write W-2, consol L-1) │
   │  DRIFT:          d/dt[behavior] over runs     (LONGITUDINAL — unique) │
   └───────────────────────────┬────────────────────────────────────────┘
        │
        ▼
   REPORT: the VECTOR + intervals + memory-store version
           (NEVER a single "memory helps" scalar)

   POINT-IN-TIME (levels): precision, recall, utility, contamination
   LONGITUDINAL (rate):    DRIFT — the failure snapshots miss
```

**Utility is measured by ablation, like context attribution.** The memory system's value is not its precision or recall — it is its *causal effect on task outcomes* (Chapter 6, Topic 14's ablation attribution, at the memory layer). Run with memory and without; the difference is utility. **A memory system with perfect precision and zero utility is retrieving correct-but-irrelevant memory**, and only the ablation reveals it. This is the same lesson as every measurement topic: measure the causal effect, not the proxy.

## 5. Grounding

- **Memory enables adaptation — drift by design:** [MEM] frames memory as underpinning "long-horizon reasoning, continual adaptation, and effective interaction," and consolidation ensuring "adaptability" [MEM] — the beneficial-drift basis, and the reason drift is intrinsic to memory.
- **The metric set is Chapter 6, Topic 13's, adapted:** precision, recall, utility (ablation), plus the memory-specific contamination and drift. [WTA]'s vector-instrumentation model (accuracy, tokens, errors — measure a vector, not a scalar) [WTA] applies.
- **Utility by ablation is Chapter 6, Topic 14's attribution:** memory-on vs memory-off is the causal-effect measurement.
- **Contamination sources are Topics 6 and 8:** poisoned memory (Topic 6 W-2), over-generalized consolidation (Topic 8 L-1), unresolved conflict (Topic 8 L-3) — what contamination measures.
- **Drift connects to measured propensities:** Chapter 2's findings that propensities (false completion, verification-skipping) can *regress across versions* [FSC §6.3.5; G56 §1] — a memory that reinforces a bad pattern is a drift toward it; behavioral drift is these propensities, accumulated through memory.
- **Held-out sets and the statistics contract:** [WTA] ("held-out test sets to ensure we did not overfit"); Chapter 1, Topic 12 (Wilson, task-clustered bootstrap, paired designs, Holm).
- **Self-report is unreliable:** "LLMs don't always say what they mean" [WTA; FSC §6.4.1.4] — utility and contamination must be measured objectively, not by asking the agent whether memory helped.
- **[MEM]'s benchmarks:** the survey "compile[s] a comprehensive summary of representative benchmarks" [MEM] — memory evaluation is an active area, and the survey points to benchmarks (though this chapter's grounding does not extract specific numbers from them).

**Evidence gap — this topic's reason for existing.** As with Chapter 6, Topic 13, **the literature provides the metrics and the discipline but almost none of the values for a specific system.** [MEM] surveys benchmarks but the effect sizes are benchmark-specific and not transferable; **no source measures behavioral drift rates, contamination incidence, or per-type utility for a given deployment.** The five-metric decomposition and the drift concept are **[synthesis]** — standard metrics plus the longitudinal dimension memory uniquely needs. This topic is the mechanism to fill the chapter's unmeasured-quantity gaps *locally*; its honest claim is that the numbers do not exist externally and here is how to produce yours.

## 6. Implementation

**The factored memory grader (§3.2):**

```python
def grade_memory(trace, task) -> dict:
    retrieved = trace.retrieved_memories
    # PRECISION — retrieved memories relevant AND correct (T7, T8, T9)
    precision = len([m for m in retrieved if is_relevant(m, task) and is_correct(m)]) \
                / max(len(retrieved), 1)
    # RECALL — relevant memories that were retrieved
    recall = len([m for m in retrieved if is_relevant(m, task)]) / max(len(task.relevant), 1)
    return {
        "precision": precision, "recall": recall,
        "memory_store_version": trace.store_version,     # Topic 13 — reproducibility
        # UTILITY, CONTAMINATION, DRIFT are measured across runs, not per-trace (below).
    }

def measure_utility(tasks, memory_system) -> float:
    """UTILITY by ablation (Ch.6 T14) — the CAUSAL effect. Not inferred from precision."""
    with_mem = mean(task_success(t, memory=memory_system) for t in tasks)
    no_mem   = mean(task_success(t, memory=None) for t in tasks)
    return with_mem - no_mem              # the memory's actual contribution to outcomes

def measure_contamination(store) -> float:
    """CONTAMINATION — store pollution (T6 W-2, T8 L-1). A leading indicator of precision loss."""
    wrong = sum(1 for m in store.sample() if is_poisoned(m) or is_over_generalized(m)
                or is_unresolved_conflict(m))
    return wrong / store.sample_size
```

**The drift measurement — longitudinal, the unique one (§3.3):**

```python
def measure_drift(memory_system, task_suite, n_runs: int, interval) -> dict:
    """DRIFT — d/dt[behavior] as memory accumulates. LONGITUDINAL: run over time,
    let memory grow, measure the TRAJECTORY. The failure snapshots miss (§3.3)."""
    trajectory = []
    for run in range(n_runs):
        # Behavioral metrics (Ch.2's propensities): false-completion, verification-skipping,
        # beyond-intent — the patterns memory could reinforce (FSC, G56).
        b = {
            "task_success": run_suite(memory_system, task_suite),
            "false_completion_rate": measure_propensity(memory_system, "false_completion"),
            "contamination": measure_contamination(memory_system.store),
        }
        trajectory.append((run, b))
        accumulate_memory(memory_system, run)          # memory grows between measurements
    return {
        "trajectory": trajectory,
        "drift_rates": {k: linear_slope([b[k] for _, b in trajectory]) for k in b},
        # POSITIVE slope on task_success = beneficial drift; on false_completion = HARMFUL.
    }
```

**Reporting with intervals (Chapter 1, Topic 12):**

```python
def report_memory(results, drift) -> dict:
    return {
        "precision":     wilson_mean([r["precision"] for r in results]),
        "recall":        wilson_mean([r["recall"] for r in results]),
        "utility":       bootstrap_ci([measure_utility(t, ms) for t, ms in results]),
        "contamination": wilson_mean([r["contamination"] for r in results]),
        "drift_rates":   drift["drift_rates"],          # with trajectory + CIs on the slope
        "store_version": results[0]["memory_store_version"],
    }
```

## 7. Trade-offs

| Metric | Cost | What it uniquely catches |
|---|---|---|
| Precision | Labeled relevant/correct | Wrong retrieval (T7/T8/T9 failures) |
| Recall | Labeled relevant set | Missed retrieval (retrieval/extraction failures) |
| Utility (ablation) | 2× runs (on/off) | **Memory that is correct but useless** |
| Contamination | Store sampling + labels | Store pollution (leading indicator of precision loss) |
| **Drift (longitudinal)** | **Many runs over time** | **The slow failure snapshots miss** |
| Single "memory helps" scalar | Cheap | Nothing actionable — five failures collapsed |

**The trade this topic exists to win, plus one memory-specific cost.** As with every measurement topic, a factored eval costs labeled data and more runs but buys *localized diagnosis* — you learn which of five things failed and therefore which topic to open. **The memory-specific addition is drift, and it is genuinely more expensive** because it requires *longitudinal* measurement (many runs over time, letting memory accumulate) rather than a point-in-time snapshot. **But drift is the failure that ships** — a memory system passes every snapshot test and then slowly poisons itself — so the longitudinal cost is not optional for any memory system that persists and accumulates. The minimum viable version: periodic re-measurement of the point-in-time metrics *plus contamination* over the system's life, watching for a worsening trajectory — cheaper than a controlled longitudinal study, and enough to catch gross drift.

**The utility ablation is the memory-specific version of the chapter's recurring lesson.** Precision and recall are *proxies*; utility is the *causal effect*. A memory system optimized for precision/recall can be optimized for the wrong thing (retrieving correct-but-irrelevant memory). **Measure utility by ablation, or risk a memory system that is measurably accurate and practically useless** — the same trap as Chapter 6, Topic 13's high-recall-low-utilization.

## 8. Experiments

**This topic's experiments fill the chapter's unmeasured-quantity gaps, locally.** Each named gap gets a design:

| Chapter gap | Experiment | Primary metric |
|---|---|---|
| Per-type value (T5) | Ablate each memory type | Utility by type |
| Consolidation error (T8) | Entailment-verify consolidated facts | Contamination (over-generalization rate) |
| Confidence calibration (T9) | $\Pr(\text{correct}\mid\gamma)$ vs $\gamma$ | Calibration error |
| Scope/leak (T2, T7) | Cross-tenant/user retrieval | Isolation (zero target) |
| Write poisoning (T6) | Inject-then-retrieve | Contamination (authoritative-persistence) |

**The drift experiment — the one unique to this chapter.** Run the agent over many sessions, letting memory accumulate; measure behavioral metrics (task success, and Chapter 2's propensities — false completion, verification-skipping) at intervals; **compute the trajectory slope.** A positive slope on task success is beneficial drift (memory helping); a positive slope on false-completion is *harmful drift* (memory reinforcing a bad pattern). **This is the experiment no snapshot catches, and it is the one that reveals whether your memory system is getting better or slowly poisoning itself.** Include a *poisoned-memory* arm (inject a bad memory early, watch it compound) to measure how fast harmful drift propagates.

**The utility ablation.** Memory-on vs memory-off, same tasks. **The difference is the memory system's actual value** — and if it is near zero, the memory system is cost without benefit (Chapter 5, Topic 15's saturation, at the memory layer), no matter how good its precision.

**The contamination-vs-precision lead test.** Inject contamination (poisoned/over-generalized memory) into the store; measure how contamination level predicts *future* precision loss. **This validates contamination as a leading indicator** — catch the problem in the store before it manifests as bad retrieval.

**Statistics.** Wilson on precision/recall/contamination; bootstrap CIs on utility; **linear-slope CIs on drift trajectories** (drift is a rate, so its uncertainty is the slope's CI); paired designs; Holm across arms; report $n$ and the memory-store version (Chapter 1, Topic 12). Re-run over time — drift is only visible longitudinally.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Single "memory helps" scalar.** Five failures collapsed; no fix indicated. Mitigation: the factored vector (§3.2).
- **Measuring precision, calling it utility.** Correct-but-useless memory looks like success. Mitigation: utility by ablation (§6).
- **Ignoring drift.** Every snapshot passes; the trajectory worsens; the system slowly poisons itself. **The failure that ships.** Mitigation: longitudinal drift measurement — the derivative, not the level.
- **Contamination unmeasured.** Store pollution accumulates until precision visibly falls; the lead time is wasted. Mitigation: contamination as a leading indicator; sample the store.
- **Utility by self-report.** Asking the agent whether memory helped — unreliable [WTA; FSC §6.4.1.4]. Mitigation: ablation, not introspection.
- **Unversioned memory store.** A memory change and a model change indistinguishable in metrics. Mitigation: memory-store version in every result (Topic 13).
- **Overfitting memory to its eval.** Tuning consolidation/retrieval against the same tasks. Mitigation: held-out sets [WTA].
- **Point-in-time drift illusion.** Measuring "drift" at one time (which is just a level). Mitigation: drift is a *trajectory* — many measurements over time, slope with CI.
- **Edge case — beneficial drift mistaken for a problem.** The agent's behavior changing *is the point* of memory (adaptation, [MEM]). Not all drift is bad. Mitigation: measure the *direction* — drift toward task success is beneficial; drift toward bad propensities is harmful. The metric is signed.
- **Edge case — the memory that helps some users, harms others.** Aggregate utility hides per-user variance; a personalization that helps average and harms a subgroup. Mitigation: stratify utility by user segment; aggregate utility is not enough.
- **Open limitation.** **The literature provides metrics and benchmarks [MEM] but not the values for a specific deployment.** Behavioral drift, contamination incidence, and per-type utility are unmeasured for any given system; the drift concept and five-metric decomposition are **[synthesis]** adding memory's longitudinal dimension to standard metrics. This topic closes the gap *for your system*, not in general. Anyone quoting a universal memory-utility or drift number is citing folklore.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Memory enables "continual adaptation" and "adaptability" [MEM] — drift is intrinsic to memory, by design.
2. Serious systems instrument a vector, not a scalar [WTA]; self-report is unreliable [WTA; FSC §6.4.1.4].
3. Utility is a causal effect, measured by ablation (Chapter 6, Topic 14).
4. Contamination sources are documented (poisoning Topic 6; over-generalization Topic 8).
5. Behavioral propensities can regress across versions [FSC §6.3.5; G56 §1] — the harmful-drift connection.
6. **The literature provides metrics/benchmarks but not per-deployment values; drift and the decomposition are this book's synthesis.**

**Decision rules.**
- **Never report a single "memory helps" scalar** — report precision, recall, utility, contamination, drift.
- **Measure utility by ablation** — precision/recall are proxies; utility is the causal effect.
- **Measure drift longitudinally** — the derivative, over many runs; it is the failure snapshots miss.
- **Measure contamination as a leading indicator** — catch store pollution before precision falls.
- **Drift is signed** — toward task success is beneficial, toward bad propensities is harmful.
- **Version the memory store** — or a memory change and a model change are indistinguishable.

**Production implications.**
1. Build the factored grader; the metric that is low tells you which topic to open.
2. Add utility ablation; a memory system with near-zero utility is cost without benefit, however precise.
3. **Measure drift longitudinally in production** — periodic re-measurement of the point-in-time metrics plus contamination, watching the trajectory. This catches the slow poisoning no snapshot sees.
4. Track contamination as an early warning; it leads precision loss.
5. Run the chapter's unmeasured-quantity experiments (§8) locally; the numbers do not exist externally.

**Connections.** This topic tests every claim in the chapter: precision/recall test Topics 5–9's retrieval and quality; utility tests Topic 5's type relevance; contamination tests Topics 6 (write) and 8 (consolidation); drift tests the whole system's trajectory and connects to Chapter 2's propensities. It is Chapter 6, Topic 13's measurement discipline plus memory's longitudinal dimension, using Chapter 6, Topic 14's ablation for utility. Chapter 1, Topic 12 is the statistics; Chapter 3, Topic 14 is the ablation protocol; Topic 13's versioning makes results comparable.

**Chapter close.** Chapter 7 built the persistence layer the whole book assumes: the six-way taxonomy separating context/state/memory/knowledge/cache/artifacts (Topic 1); state scopes and the authoritative event log (Topics 2–4); the memory system — types, write/read policies, lifecycle, temporal validity (Topics 5–9); artifacts versioned independently (Topics 10–11); repository knowledge (Topic 12); migration (Topic 13); governance (Topic 14); and — here — the measurement that proves it works, including the drift that only memory can suffer. Part II is complete: Chapters 4–7 built the engineering foundations — APIs, tools, context, and persistence — on Part I's scientific foundations. Chapter 8 opens Part III, composing these single-agent foundations into multi-agent orchestration and long-horizon execution.

## Sources

[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — memory underpinning "long-horizon reasoning, continual adaptation, and effective interaction"; consolidation ensuring "adaptability"; a "comprehensive summary of representative benchmarks" for memory evaluation
[WTA] Anthropic, "Writing effective tools for agents — with agents" — vector instrumentation (accuracy, tokens, errors); held-out test sets; "What agents omit… can often be more important than what they include. LLMs don't always say what they mean" — the warrant for objective over self-report memory evaluation — https://www.anthropic.com/engineering/writing-tools-for-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 (unsupported completion claims — a propensity harmful drift can reinforce), §6.4.1.4 (unverbalized behavior — why self-report fails) — `Knowledge_source/`
[G56] GPT-5.6 Preview System Card §1 — beyond-intent propensity regressing across a version step — the drift-connection to measured propensities — `Knowledge_source/gpt-5-6-preview.pdf`
