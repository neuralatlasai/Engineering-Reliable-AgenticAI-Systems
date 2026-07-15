# Topic 13 — Retrieval and Context Ablations: Recall, Utilization, Faithfulness, Latency, and Token Cost

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Measuring the context system. Five metrics that must be measured *separately* — recall, utilization, faithfulness, latency, token cost — because they fail independently and an aggregate number hides which one broke. This is the chapter's measurement discipline, the analogue of Chapter 5, Topic 13 for the tool surface.

**Prerequisites.** Chapter 1, Topic 12 (the statistics contract — binding); Chapter 5, Topic 13 (the same separate-the-factors argument, for tools); Chapter 3, Topic 14 (ablation methodology). Every topic in this chapter ends in a claim this topic tests.

**Terminology.** *Recall*: did the relevant content reach the window? *Utilization*: did the model *use* what was in the window? *Faithfulness*: is the answer grounded in the context rather than invented? *Latency / token cost*: the operational price.

**Boundaries.** Inside: the metric set, the experimental designs, and the statistics. Outside: attribution mechanics (Topic 14 — utilization's instrument); the operations being measured (Topics 5–11).

**Exclusions.** No benchmark leaderboard.

**Outcomes.** The reader can localize a context failure to a specific metric — and therefore to a specific topic's fix — with intervals, on a design that survives review.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Context engineering is full of levers — chunk size, retrieval architecture, reranking, compaction cadence, budget partition — and a team with only an end-to-end accuracy number cannot tell which lever to pull. Every failure looks the same: "the agent got the answer wrong." Was the evidence not retrieved (recall)? Retrieved but ignored (utilization)? Used but contradicted (faithfulness)? The fixes are in five different topics.

**Bottleneck.** The chapter has been unusually explicit that its central quantities are **unmeasured in the literature**: the context-rot curve (Topic 1), chunking parameters (Topic 6), retrieval effect sizes (Topics 5, 7), the decay curve (Topic 4), position sensitivity (Topic 9), compaction degradation (Topic 11), the budget partition (Topic 12). **This topic is where those gaps get filled — locally.** It is not optional polish; it is the only source of the numbers the rest of the chapter needs.

**Objective.** A metric set that localizes failures to a factor, and experimental designs — with the correct statistics — that turn each of the chapter's unmeasured claims into a local measurement.

**Assumptions.** Context operations are configuration ($\operatorname{Assemble}$'s interior); changing them is a configuration change with Chapter 3, Topic 14's evidentiary burden.

**Constraints.** Real evals cost model calls and labeled data. Utilization and faithfulness need instrumentation (Topic 14) beyond a correctness check.

**Success criteria.** Every context-system change is accepted or rejected on the vector of five metrics with intervals, and every failure is attributed to a factor.

## 3. Intuition first, then formalization

### 3.1 Intuition: five ways to be wrong, five different fixes

A context system can fail in five independent places, and they demand different repairs:

1. **Recall failure** — the answer-bearing content never reached the window. Fix: retrieval (Topics 5, 7), chunking (Topic 6).
2. **Utilization failure** — the content was in the window and the model did not use it. Fix: placement (Topic 9), dilution reduction (Topics 1, 12), budget (Topic 12).
3. **Faithfulness failure** — the model answered from priors or invented content despite (or against) the context. Fix: grounding instructions (Topic 2), citation (Topic 14), conflict surfacing (Topic 8).
4. **Latency failure** — the answer is right but too slow. Fix: caching (Topic 10), eager-vs-JIT (Topic 3).
5. **Cost failure** — right and fast but too expensive. Fix: budget (Topic 12), caching (Topic 10), compression (Topic 11).

**An aggregate accuracy number collapses the first three into "wrong" and ignores the last two.** The whole point of the metric set is that these are *separately measurable*, and once separated, the fix is obvious. Utilization is the one teams never measure and it is the one that most often explains a puzzling failure: **recall was fine, the evidence was right there, and the model — buried in 80k tokens — did not attend to it** (Topic 9).

### 3.2 Formalization: the five metrics

For a task set $\mathcal T$ with labeled relevant content $R^\star_\tau$ **[synthesis — the decomposition is ours; each metric is standard, composed here to localize context failures]**:

$$
\textbf{Recall} = \frac{1}{|\mathcal T|}\sum_\tau \frac{|R^\star_\tau \cap \text{window}_\tau|}{|R^\star_\tau|}
\quad\text{— did the relevant content reach the window?}
$$
$$
\textbf{Utilization} = \frac{1}{|\mathcal T|}\sum_\tau \frac{|\{r\in \text{window}_\tau : r\ \text{influenced the output}\}|}{|\text{window}_\tau|}
\quad\text{— did the model USE it? (Topic 14's instrument)}
$$
$$
\textbf{Faithfulness} = \Pr(\text{every output claim is supported by context})
\quad\text{— grounded, or invented?}
$$
$$
\textbf{Latency},\ \textbf{Token cost} = \text{operational vector (p50/p95, per-consumer — Topic 12).}
$$

The relationships that make separation diagnostic **[derived]**:

$$
\text{correct answer}\ \Longrightarrow\ \text{recall} \wedge \text{utilization} \wedge \text{faithfulness (roughly)},
$$

so a wrong answer is a failure of *at least one*, and measuring them separately tells you *which*. Two independent quantities are especially diagnostic:

- **High recall, low utilization** = the content was there and unused. **This is context rot / dilution / bad placement** (Topics 1, 9), and it is invisible to any recall-only retrieval eval. A team that measures only retrieval recall and sees it high will conclude "retrieval is fine" while the agent fails — because the failure moved downstream to utilization.
- **High utilization, low faithfulness** = the model used the context and *still* invented claims. This is a grounding failure (Topic 2) or a conflict mishandled (Topic 8), not a retrieval problem — and no amount of better retrieval fixes it.

### 3.3 The context change is a configuration change

Every context operation is the interior of $\operatorname{Assemble}_{H_c}$, so a change to it changes $c_t$ and therefore the policy (Chapter 1). This has a hard consequence: **a context-system change carries the same evidentiary burden as a harness edit or a model swap** (Chapter 3, Topic 14). The paired, clustered, corrected discipline of Chapter 1, Topic 12 is not optional rigor here — it is the definition of what counts as evidence that a chunking change or a compaction-cadence change helped.

And the reproducibility requirement: **record the pipeline hash** (Topic 3, §6) with every result. A chunking change and a model change are indistinguishable in the metrics without it — the same discipline Chapter 5, Topic 1 imposed via the surface hash.

## 4. Architecture

```
   TASK SET (with labeled R*_τ and, for negatives, "no retrieval needed")
        │
        ▼
   RUN under context config c (model pinned, PIPELINE HASH recorded — Topic 3)
        │
        ▼
   TRACE  τ̂  — window contents, per-source (Topic 14), output, citations, κ
        │
        ▼
   ┌── GRADERS, one per FAILURE MODE (§3.1) ──────────────────────────┐
   │  RECALL:        R*_τ ∩ window          (retrieval/chunking)      │
   │  UTILIZATION:   attribution (Topic 14) (placement/dilution)      │
   │  FAITHFULNESS:  claims ⊆ context        (grounding/conflict)     │
   │  LATENCY:       p50/p95                 (caching/JIT)            │
   │  COST:          per-consumer tokens     (budget/compression)     │
   └──────────────────────────────────────────────────────────────────┘
        │
        ▼
   REPORT: the VECTOR + Wilson/bootstrap intervals + pipeline hash
           (NEVER a single accuracy scalar)
```

**Unbundle retrieval from the agent.** As in Chapter 5, Topic 13 and Topic 5 of this chapter: evaluate the *retriever* on recall independently, *before* the agent, so a recall failure and a utilization failure do not get blamed on each other. The retriever's recall@k **upper-bounds** everything downstream — if recall is 0.6, no reranking, placement, or grounding work can push end-to-end above 0.6, and you should fix retrieval before touching anything else.

## 5. Grounding

- **The instrumentation set, sourced:** [WTA]'s evaluation metrics — "top-level accuracy," "total runtime of individual tool calls and tasks," "total number of tool calls," "total token consumption," "tool errors" — are the latency/cost half of this vector, and the model for measuring a context/tool system by a *vector*, not a scalar.
- **Task construction:** agent-generated tasks, "inspired by real-world uses and based on realistic data sources," avoiding "overly simplistic or superficial 'sandbox' environments," with strong tasks requiring "multiple tool calls—potentially dozens" [WTA] (Chapter 5, Topic 13; this chapter's Topic 7).
- **Held-out sets:** "held-out test sets to ensure we did not overfit to our 'training' evaluations" [WTA] — a context pipeline tuned against its own eval has memorized it.
- **The recall-first tuning discipline** for compaction — "maximize recall… then iterate to improve precision" [ECE] — is the *procedure* this topic measures the outcome of (Topic 11, R-2).
- **The self-report caution:** "What agents omit… can often be more important than what they include. LLMs don't always say what they mean" [WTA], corroborated by measured unverbalized behavior [FSC §6.4.1.4] — so **utilization must be measured by attribution (Topic 14), not by asking the model what it used.**
- **The statistics contract** is Chapter 1, Topic 12 in full; **the ablation methodology** is Chapter 3, Topic 14 (paired, clustered, vector outcomes, predeclared endpoint).
- **Deep telemetry as the substrate:** the trace store linking "model decisions, harness actions, environment states, and outcomes" [CAH §3.5.1] is what these graders consume; Topic 14 builds the attribution on it.

**Evidence gap — and it is this topic's reason for existing.** **The literature provides the *metrics* and the *discipline* but almost none of the *values*.** No source publishes a context-rot curve, a utilization baseline, a faithfulness rate, chunking parameters, or a budget partition for agent workloads. Every unmeasured quantity flagged across Topics 1–12 is unmeasured *in the sources* precisely because it is workload-specific. **This topic is the mechanism by which those gaps are filled locally**, and its honest claim is: the numbers do not exist externally, and here is how to produce yours.

## 6. Implementation

**The factored grader — one grader per failure mode:**

```python
def grade_context(trace, task) -> dict:
    window = trace.window_contents
    output = trace.output

    # RECALL — did relevant content reach the window? (retrieval/chunking)
    recall = len(task.relevant & retrieved_ids(window)) / max(len(task.relevant), 1)

    # UTILIZATION — did the model USE it? Via ATTRIBUTION (Topic 14), NOT self-report.
    used = attribution_analysis(trace)            # which sources influenced the output
    utilization = len(used & retrieved_ids(window)) / max(len(window.sources), 1)

    # FAITHFULNESS — is every claim supported by context? (grounding/conflict)
    claims = extract_claims(output)
    faithfulness = mean(claim_supported_by(c, window) for c in claims)

    return {
        "recall": recall,
        "utilization": utilization,               # the metric nobody measures
        "faithfulness": faithfulness,
        "latency_ms": trace.latency_ms,
        "tokens_by_consumer": trace.tokens_by_consumer,   # Topic 12's partition
        "correct": task.check(output),
        "pipeline_hash": trace.pipeline_hash,             # reproducibility (Topic 3)
    }
```

**The diagnostic that directs work — the high-recall/low-utilization split:**

```python
def diagnose(results) -> str:
    recall = mean(r["recall"] for r in results)
    util   = mean(r["utilization"] for r in results)
    faith  = mean(r["faithfulness"] for r in results)

    if recall < 0.8:
        return "RECALL failure → fix retrieval (T5,T7) / chunking (T6). Nothing downstream can exceed this."
    if util < 0.5:
        return "UTILIZATION failure → content is there, unused. Fix placement (T9), dilution (T1,T12)."
    if faith < 0.9:
        return "FAITHFULNESS failure → model invents despite context. Fix grounding (T2), conflict (T8)."
    return "Context system healthy; failures are elsewhere (model, tools)."
```

This function is the topic in a nutshell: **the metric that is low tells you the topic to open.** No other diagnostic in the chapter is this direct.

**Reporting with intervals (Chapter 1, Topic 12):**

```python
def report(results) -> dict:
    return {
        "recall":       wilson_mean([r["recall"] for r in results]),
        "utilization":  wilson_mean([r["utilization"] for r in results]),
        "faithfulness": wilson_mean([r["faithfulness"] for r in results]),
        "latency":      quantiles([r["latency_ms"] for r in results], [50, 95]),
        "cost":         cost_by_consumer(results),        # Topic 12
        # Task-clustered bootstrap for any CONTRAST between configs.
        "pipeline_hash": results[0]["pipeline_hash"],
    }
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Factored metrics | **Localized diagnosis** | Labeled relevant-content per task; attribution instrument (Topic 14) |
| Single accuracy scalar | Cheap | Diagnosis-free; five failures collapsed to "wrong" |
| Unbundled retrieval eval | Recall failures caught early | A separate eval to maintain |
| Utilization measurement | The metric that explains puzzling failures | Needs attribution (Topic 14), not just correctness |
| Held-out sets [WTA] | No overfitting the pipeline | Fewer tasks for tuning |
| Many repeats $N_R$ | Tight intervals | Linear cost |

**The trade this topic exists to win.** A factored context eval is genuinely more work than "run 50 tasks, look at accuracy": it needs labeled relevant content, an attribution instrument, and per-consumer token accounting. But **without it, every one of this chapter's levers is pulled blind** — you cannot tell whether your reranker helped (utilization), whether your chunking is losing facts (recall), or whether your grounding is working (faithfulness). The minimum viable version that still supports a claim (Chapter 3, Topic 14, §8): a paired design, recall + utilization + faithfulness with Wilson intervals, on held-out tasks, labeled exploratory if $N_R$ is small. **A single accuracy scalar is not acceptable evidence that a context change helped.**

## 8. Experiments

**This topic's experiments are the chapter's unmeasured quantities, made local.** Each named gap gets a design:

| Chapter gap | Experiment | Primary metric |
|---|---|---|
| Context-rot curve (T1) | Plant a fact; sweep total length | Recall vs $n$ → $B_{\mathrm{eff}}$ |
| Chunking (T6) | Boundary-adjacent vs mid-chunk facts | Recall gap |
| Retrieval architecture (T5) | Failure-class matrix | Recall by query class |
| Query ops (T7) | Oracle-query diagnostic | Query-side vs index-side recall |
| Position (T9) | Sweep fact position | Recall vs position (the LITM curve) |
| Dilution (T9) | Fix signal, add noise | Utilization vs noise |
| Compaction (T11) | Compactions-survived | Early-fact recall vs #compactions |
| Budget (T12) | Allocation sweep | Completion vs partition |

**The utilization ablation — the chapter's most under-run experiment.** Take a config with high recall and mediocre completion. Measure utilization. **If utilization is low, the fix is not more retrieval — it is placement and dilution (Topic 9)**, and this experiment redirects the team from optimizing the layer that was already working. This is the context analogue of Chapter 5, Topic 13's "measure $\Pr(Z_s)$ and $\Pr(Z_a\mid Z_s)$ separately," and it is just as consequential.

**Faithfulness under conflict (ties to Topic 8).** Retrieve contradictory evidence; measure whether the answer (a) surfaces the conflict, (b) picks one silently, (c) invents a resolution. **Low faithfulness here is a grounding/conflict problem**, unfixable by retrieval.

**The full context-config ablation.** Any change to chunking, retrieval, reranking, compaction cadence, or budget is a configuration change (Chapter 3, Topic 14). Paired, same tasks, pipeline hash recorded, vector outcome, predeclared primary endpoint.

**Statistics.** Wilson on recall/utilization/faithfulness; task-clustered bootstrap for contrasts (calls/chunks within a task are correlated); Holm across arms; predeclare the endpoint; report $N_R$ (Chapter 1, Topic 12). Re-run per model — every curve here is model-specific.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **The scalar accuracy report.** Five failures collapsed to "wrong"; no fix indicated. Mitigation: factor it (§3.2).
- **Measuring recall only.** Retrieval looks fine; the agent fails; the failure moved to utilization and nobody looked. **The most common measurement blind spot in RAG systems.** Mitigation: measure utilization.
- **Utilization by self-report.** Asking the model what it used — "LLMs don't always say what they mean" [WTA]. Mitigation: attribution (Topic 14), not introspection.
- **Faithfulness ignored.** High utilization, invented claims; a grounding failure mistaken for a retrieval one. Mitigation: faithfulness grader; citation (Topic 14).
- **Aggregate token cost.** One number hides which consumer dominates. Mitigation: per-consumer accounting (Topic 12).
- **Unrecorded pipeline hash.** A chunking change and a model change look identical in the metrics. Mitigation: hash in every result (Topic 3).
- **Overfitting the pipeline to its eval.** Tuning chunk size, reranker, and budget against the same 50 tasks. Mitigation: held-out sets [WTA].
- **Uncorrected multiplicity.** A context change moves a dozen metrics; the improved one gets reported. Mitigation: predeclare the endpoint; Holm.
- **Edge case — no ground-truth relevant set.** For open-ended tasks, $R^\star$ is undefinable, so recall is not computable. Then utilization and faithfulness carry the load, and recall is replaced by an oracle-query upper bound (Topic 7).
- **Open limitation.** **The external literature provides the metrics and the discipline but not the values** — every quantity this chapter flagged as unmeasured is unmeasured *because it is workload-specific*. This topic does not close that gap in general; it closes it *for your system*. Anyone quoting a universal context-rot threshold, utilization baseline, or budget split is citing folklore, and this topic is the reason you do not have to.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Serious agent systems instrument a *vector* — accuracy, runtime, tool calls, tokens, errors — not a scalar [WTA].
2. Tasks should be realistic, multi-step, and held out to avoid overfitting [WTA].
3. Agent self-report is an unreliable window onto what was used — "LLMs don't always say what they mean" [WTA; FSC §6.4.1.4].
4. Compaction is tuned recall-first, then precision [ECE] — a procedure whose outcome this topic measures.
5. **The literature supplies the metrics and discipline but not the values** — every central quantity in this chapter is unmeasured externally and must be measured locally.

**Decision rules.**
- **Never report a single accuracy number for a context system.** Report the five-metric vector.
- **Measure utilization, not just recall.** High recall with low utilization is context rot, and it is the failure retrieval-only evals cannot see.
- **Measure utilization by attribution, never by self-report.**
- **Unbundle retrieval:** recall@k upper-bounds everything; fix it first if it is low.
- **Record the pipeline hash**, or a context change and a model change are indistinguishable.
- **A context change is a configuration change** — paired, clustered, corrected, predeclared (Chapter 3, Topic 14; Chapter 1, Topic 12).

**Production implications.**
1. Build the factored grader (§6); the `diagnose` function alone tells you which topic to open on any failure.
2. Add utilization to your context dashboards — it is the metric that explains the failures recall says shouldn't happen.
3. Run the chapter's unmeasured-quantity experiments (§8) locally; the numbers do not exist externally and your system needs them.
4. Record the pipeline hash in every trace and eval result; without it your metrics are not comparable across time.

**Connections.** This topic tests every claim in the chapter: Topic 1's $B_{\mathrm{eff}}$, Topic 5's recall, Topic 6's chunk boundaries, Topic 7's oracle diagnostic, Topic 9's position/dilution (utilization), Topic 11's compaction degradation, Topic 12's budget. **Topic 14 builds the attribution that utilization and faithfulness depend on** — this topic defines the metrics, Topic 14 supplies the instrument. Chapter 1, Topic 12 is the statistics; Chapter 3, Topic 14 is the ablation protocol; Chapter 5, Topic 13 is the same discipline for tools.

## Sources

[WTA] Anthropic, "Writing effective tools for agents — with agents" — the evaluation metric set (accuracy, runtime, tool-call count, token consumption, tool errors); agent-generated realistic multi-step tasks; "held-out test sets to ensure we did not overfit to our 'training' evaluations"; "What agents omit in their feedback and responses can often be more important than what they include. LLMs don't always say what they mean" — https://www.anthropic.com/engineering/writing-tools-for-agents
[ECE] Anthropic, "Effective context engineering for AI agents" — recall-then-precision compaction tuning; context as the measured resource — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.4.1.4 — unverbalized behavior; self-report as an unreliable window — `Knowledge_source/`
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.5.1 — deep telemetry linking model decisions, harness actions, environment states, and outcomes; the trace substrate these graders consume
