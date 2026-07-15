# Topic 14 — Multi-Agent Evaluation: Marginal Contribution, Redundancy, Diversity, and Coordination Overhead

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Measuring a multi-agent system — which requires metrics a single-agent evaluation does not have: **each agent's marginal contribution, the redundancy between agents, the diversity of their outputs, and the coordination overhead.** The sources ship a concrete, unusually well-documented evaluation methodology, and it corrects several instincts.

**Prerequisites.** Chapter 8, Topic 14 (workflow conformance testing); Chapter 1, Topic 12 (the statistics contract); Topic 2 (the coordination tax's five components — the overhead this topic measures).

**Terminology.** *Marginal contribution*: an agent's causal effect on the outcome. *Redundancy*: overlap between agents' work. *Diversity*: how different their outputs are (Topic 5). *Coordination overhead*: the tax (Topic 2), measured.

**Boundaries.** Inside: the multi-agent-specific evaluation metrics and methodology. Outside: single-agent evaluation (Chapters 5, 6, 7's measurement topics); the failures being measured (Topic 8).

**Exclusions.** No benchmark leaderboard.

**Outcomes.** The reader can measure each agent's marginal contribution, detect redundant agents, and evaluate a stateful multi-agent system on end-state rather than process — using [MAR]'s documented methodology.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A multi-agent system's aggregate performance (the 90.2%, Topic 1) does not tell you *which agents earned it*. Is the fifth subagent contributing, or duplicating the fourth? Is the coordination overhead eating the decomposition gain (Topic 2)? **A single-agent eval measures "did the task succeed"; a multi-agent eval must also measure "did each agent, and the coordination, pay for itself."**

**Bottleneck.** Multi-agent systems are *stateful and non-deterministic* in ways that break naive evaluation. [MAR] states both problems: **"Agents are non-deterministic between runs, even with identical prompts"** [MAR], and they are stateful — "maintaining state across many tool calls" [MAR]. **You cannot evaluate a stateful, non-deterministic multi-agent system by checking that it followed the right steps** — it will take different valid paths each run. **The evaluation must be outcome-based, not process-based** — and this is a methodological shift [MAR] makes explicit.

**Objective.** Measure marginal contribution (per-agent value), redundancy (wasted parallelism), diversity (Topic 5), and coordination overhead (Topic 2) — with an outcome-based methodology suited to stateful, non-deterministic systems.

**Assumptions.** Agents are non-deterministic and stateful [MAR]. Aggregate metrics hide per-agent contribution.

**Constraints.** Non-determinism means process-based evaluation fails; you must evaluate end-states.

**Success criteria.** Each agent's marginal contribution is measured; redundant agents are detected; coordination overhead is quantified; the evaluation is outcome-based and statistically sound.

## 3. Intuition first, then formalization

### 3.1 Intuition: measure the end-state, and measure each agent's marginal value

**The first methodological shift [MAR]: evaluate the outcome, not the process.** For stateful agents, [MAR] is explicit: **"evaluate whether it achieved the correct final state" rather than validating every intermediate step**, acknowledging that **"agents may find alternative paths to the same goal"** [MAR].

This is not a compromise; it is correct. **A non-deterministic multi-agent system takes different valid paths each run** — checking that it followed *the* path is testing determinism a stochastic system does not have. **Check that it reached the right *place*, not that it took the right *route*.** This mirrors Chapter 8, Topic 14's structural-vs-behavioral split: the *structure* (aggregation, termination) is property-tested deterministically; the *outcome* (did it solve the task) is measured statistically.

**The second shift: measure each agent's *marginal contribution*, not just the aggregate.** The aggregate (90.2%) is the *sum*; the marginal contribution is *what each agent added*. The tool is **ablation** (Chapter 6, Topic 14): remove agent $i$, and measure the drop. **An agent whose removal does not lower the outcome is not contributing** — it is coordination overhead and redundancy (Topic 2's tax) for no gain, and it should be removed (Topic 2's MT-1).

**The third: [MAR]'s eval methodology is small, fast, and honest about its limits.** [MAR] started with **"about 20 queries representing real usage patterns"** and found that **"effect sizes this large" (30%→80% success rates) "you can spot changes with just a few test cases"** [MAR]. **When the effect is large, you do not need a huge eval.** And they pair it with human evaluation, because **"People testing agents find edge cases that evals miss"** [MAR] — including the hallucinated answers (Topic 8) and source biases automated evals do not catch.

### 3.2 Formalization: the four multi-agent metrics

**[synthesis; each metric grounded in [MAR] and Chapter 6, Topic 14]**

$$
\textbf{Marginal contribution of agent } i: \quad
\mathrm{MC}_i = P(\text{full system}) - P(\text{system} \setminus \{i\}) \quad\text{(ablation — Chapter 6, Topic 14)}.
$$

$$
\textbf{Redundancy: } \quad \mathrm{Red} = \frac{\text{overlapping work across agents}}{\text{total work}} \quad\text{(Topic 5's duplication).}
$$

$$
\textbf{Diversity: } \quad \mathrm{Div} = 1 - \text{mean pairwise overlap} \quad\text{(Topic 5's PE-1).}
$$

$$
\textbf{Coordination overhead: } \quad \mathrm{CO} = \text{tokens/latency spent on coordination vs task work} \quad\text{(Topic 2's tax).}
$$

Three invariants **[derived]**:

$$
\textbf{ME-1 (evaluate the end-state, not the process):}\quad
\text{score } P(\text{correct final state}),\ \text{not adherence to a path — agents "find alternative paths" [MAR].}
$$

$$
\textbf{ME-2 (measure marginal contribution by ablation):}\quad
\mathrm{MC}_i \le 0 \Rightarrow \text{agent } i\ \text{does not pay — it is redundancy + overhead (Topic 2's MT-1).}
$$

**ME-2 is the multi-agent form of Topic 2's marginal-agent condition, made measurable.** An agent with $\mathrm{MC}_i \le 0$ is *cost without value* — and the ablation finds it. **This is how you discover that your fifth subagent duplicates your fourth** (Topic 5's redundancy) rather than adding coverage.

$$
\textbf{ME-3 (automated evals miss what humans catch):}\quad
\text{automated metrics miss "hallucinated answers on unusual queries, system failures, or subtle source selection biases" [MAR] — human eval is required.}
$$

**ME-3 is [MAR]'s explicit warning**, and it is especially important for multi-agent systems because of cascading hallucination (Topic 8): **a cascaded fabrication is internally consistent and well-cited (citing agents)**, so an automated eval that checks consistency will *pass* it. **Only a human (or a deterministic check against a real source — Topic 8's CF-5) catches it.**

### 3.3 The LLM-judge, its rubric, and its calibration

[MAR] ships a concrete LLM-as-judge design worth adopting, and its findings are instructive **[all from [MAR]]**:

- **A single LLM call, a single prompt, scoring 0.0–1.0 plus pass/fail**, was "the most consistent and aligned with human judgements" [MAR]. **Simplicity beat elaborate multi-judge schemes.**
- **Five dimensions:** **factual accuracy, citation accuracy, completeness, source quality, tool efficiency** [MAR]. **Citation accuracy is a first-class dimension** — which, per Topic 8, is the defense against cascading hallucination made measurable.
- **Human evaluation catches the rest:** "People testing agents find edge cases that evals miss" [MAR].

**The calibration lesson [MAR]:** the LLM-judge must be validated against human judgment — [MAR] chose the single-prompt design *because* it "aligned with human judgements" [MAR]. **An LLM-judge is a model, so it has the same failure modes as the system it judges** (Chapter 8, Topic 6, §3.3; [FSC §6.3.5]) — including the ability to be fooled by a fluent, consistent, cascaded fabrication. **So the judge must be calibrated against humans, and humans must remain in the loop for the failures the judge shares** (ME-3).

**This is Chapter 6, Topic 14's "attribution by ablation, not self-report" and Chapter 5, Topic 13's "measure separately, with intervals," applied to multi-agent** — with the added multi-agent twist that the judge, being an LLM, cannot be trusted to catch the LLM-specific failures (hallucination) without human backup.

## 4. Architecture

```
   MULTI-AGENT EVALUATION — metrics a single-agent eval does not have

   ┌── ME-1: EVALUATE THE END-STATE, NOT THE PROCESS ─────────────────────────┐
   │  [MAR]: "evaluate whether it achieved the correct final state" — "agents  │
   │  may find alternative paths to the same goal". Non-deterministic systems  │
   │  take different VALID routes each run. Check the PLACE, not the ROUTE.    │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌── ME-2: MARGINAL CONTRIBUTION BY ABLATION (Ch.6 T14) ────────────────────┐
   │  MC_i = P(full) − P(full \ {agent i})                                     │
   │    MC_i ≤ 0  ⇒  agent i is REDUNDANCY + OVERHEAD, not value (Topic 2 MT-1)│
   │    ← this is how you find that subagent 5 DUPLICATES subagent 4           │
   │                                                                          │
   │  + REDUNDANCY (overlap, Topic 5) · DIVERSITY (1−overlap) · COORD OVERHEAD │
   │    (Topic 2's tax: tokens/latency on coordination vs task work)           │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌── THE LLM-JUDGE [MAR] — simple beat elaborate ──────────────────────────┐
   │  ONE call, ONE prompt, 0.0-1.0 + pass/fail — "most consistent and         │
   │  aligned with human judgements"                                          │
   │  5 dimensions: FACTUAL ACCURACY · CITATION ACCURACY · COMPLETENESS ·      │
   │                SOURCE QUALITY · TOOL EFFICIENCY                           │
   │                ↑ citation accuracy = Topic 8's CF-5 defense, MEASURED     │
   │  ⚠ the judge is an LLM — it shares the system's failure modes and can be  │
   │    fooled by a CASCADED fabrication (consistent + well-cited). CALIBRATE  │
   │    against humans.                                                        │
   └──────────────────────────────────────────────────────────────────────────┘

   ┌── ME-3: HUMANS CATCH WHAT AUTOMATED EVALS MISS ─────────────────────────┐
   │  [MAR]: "hallucinated answers on unusual queries, system failures, or     │
   │  subtle source selection biases" — the automated eval PASSES a cascaded   │
   │  fabrication (it's consistent). Only humans (or a deterministic source    │
   │  check, Topic 8 CF-5) catch it.                                          │
   └──────────────────────────────────────────────────────────────────────────┘

   ★ START SMALL: [MAR] used ~20 queries; large effects (30%→80%) are visible
     "with just a few test cases". Big effects don't need big evals.
```

## 5. Grounding

- **End-state over process:** for stateful agents, "evaluate whether it achieved the correct final state" rather than "validating every intermediate step," because "**agents may find alternative paths to the same goal**" [MAR] — ME-1.
- **Non-determinism:** "**Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts**" [MAR] — why process-based evaluation fails.
- **Start small, iterate fast:** "We started with a set of about **20 queries** representing real usage patterns"; large effect sizes (30%→80% success) mean "you can spot changes with just a few test cases" [MAR] — the eval-size lesson.
- **The LLM-judge design:** "A single LLM call with a single prompt outputting scores from **0.0-1.0** and a **pass-fail grade** was the most consistent and aligned with human judgements" [MAR].
- **The five rubric dimensions:** "**factual accuracy, citation accuracy, completeness, source quality, tool efficiency**" [MAR] — citation accuracy as the cascading-hallucination defense (Topic 8), measured.
- **Human evaluation catches blind spots:** "**People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases**" [MAR] — ME-3.
- **The variance decomposition informs what to measure:** token usage explains 80% of variance, tool calls secondary, model choice tertiary [MAR] (Topic 2) — **the coordination-overhead metric (CO) should track tokens, the dominant factor.**
- **Marginal contribution by ablation is Chapter 6, Topic 14:** attribution by removing a component — ME-2.
- **Redundancy and diversity are Topic 5's metrics:** duplicate-work rate and coverage overlap.
- **Observability for evaluation:** [MAR]'s "full production tracing let us diagnose why agents failed"; monitoring "agent decision patterns and interaction structures" [MAR] — the trace substrate the evaluation consumes (Chapter 6, Topic 14; Chapter 8, Topic 13's tracing gap [OMA]).
- **The statistics contract:** Chapter 1, Topic 12 — intervals, paired designs, clustering.

**Evidence gap.** This topic is **unusually well-grounded** — [MAR] documents the evaluation methodology in detail (end-state, small evals, the LLM-judge design, the five dimensions, human eval). **The four metrics are [synthesis]** composing [MAR]'s methodology with Chapter 6, Topic 14's ablation and Topic 5's diversity — **but each component is documented.** **What is unmeasured: [MAR] does not report per-agent marginal contributions** (they report the aggregate 90.2%, not each subagent's $\mathrm{MC}_i$), so **ME-2's ablation is a method they imply but do not publish results for.** **No source measures redundancy or coordination-overhead distributions.** §8 is the local measurement.

## 6. Implementation

**Marginal contribution by ablation (ME-2) — find the agents that do not pay:**

```python
def marginal_contribution(system, tasks) -> dict:
    """ME-2 (Ch.6 T14): MC_i = P(full) − P(full \ {agent i}).
    MC_i ≤ 0 ⇒ agent i is redundancy + overhead, not value (Topic 2's MT-1).
    This finds that subagent 5 DUPLICATES subagent 4."""
    full = mean(task_success(system, t) for t in tasks)
    contributions = {}
    for agent in system.agents:
        ablated = system.without(agent)
        contributions[agent.id] = full - mean(task_success(ablated, t) for t in tasks)
    return {
        "marginal_contributions": contributions,
        "non_contributing": [a for a, mc in contributions.items() if mc <= NOISE_FLOOR],
        # ↑ these agents cost coordination + tokens for no gain — REMOVE them (Topic 2 MT-1)
    }
```

**End-state evaluation (ME-1) — not process:**

```python
def evaluate_end_state(system, task) -> dict:
    """ME-1 [MAR]: 'evaluate whether it achieved the correct final state' — NOT the path.
    Agents 'find alternative paths to the same goal'. Checking the route tests a
    determinism a stochastic system does not have."""
    result = run(system, task)
    return {
        "correct_final_state": task.check_end_state(result),   # the PLACE, not the ROUTE
        # do NOT assert on intermediate steps — they vary validly across runs
    }
```

**The LLM-judge (ME-3, [MAR]'s design):**

```python
JUDGE_PROMPT = """Score this research answer 0.0-1.0 on each dimension, plus pass/fail:
- factual_accuracy    - citation_accuracy    - completeness
- source_quality      - tool_efficiency
[MAR]: a single call, single prompt, was 'most consistent and aligned with human judgements'.
"""

def llm_judge(answer, task) -> dict:
    """[MAR]'s design: ONE call, ONE prompt, 0.0-1.0 + pass/fail. Simple beat elaborate.
    ⚠ The judge is an LLM — it can be fooled by a CASCADED fabrication (consistent +
    well-cited, Topic 8). It MUST be calibrated against humans, and humans stay in the
    loop for the failures it shares (ME-3)."""
    scores = model.judge(answer, task, prompt=JUDGE_PROMPT)     # 5 dimensions
    return scores

def evaluate(system, tasks, humans) -> dict:
    return {
        "llm_judge": [llm_judge(run(system, t), t) for t in tasks],
        # ME-3: humans catch 'hallucinated answers, system failures, subtle source biases'
        # that the automated judge MISSES — especially cascaded fabrications (Topic 8).
        "human_eval": humans.review(sample(tasks)),
        "judge_human_agreement": calibrate(llm_judge, humans),  # the judge is only as good
                                                                # as its human alignment
    }
```

**Coordination overhead (Topic 2's tax, measured):**

```python
def coordination_overhead(traces) -> dict:
    """CO — Topic 2's tax. Token usage explains 80% of variance [MAR], so track tokens."""
    return {
        "coordination_tokens_fraction": mean(t.coordination_tokens / t.total_tokens
                                             for t in traces),
        "duplicate_work_rate": mean(overlap_across_agents(t) for t in traces),   # Topic 5
        "straggler_latency": mean(max_subagent_duration(t) - mean_subagent_duration(t)
                                  for t in traces),   # Topic 4's synchronous bottleneck
    }
```

## 7. Trade-offs

| Metric / method | Buys | Costs |
|---|---|---|
| **End-state eval (ME-1)** | Works for non-deterministic systems [MAR] | Cannot diagnose *where* it went wrong (only *that* it did) |
| Process eval | Diagnostic | **Fails for non-deterministic agents** — they take valid different paths |
| **Marginal contribution (ME-2)** | Finds non-contributing agents | $n$ ablation runs (expensive) |
| Aggregate-only eval | Cheap | **Hides which agents earned the gain** |
| **LLM-judge (simple)** [MAR] | Consistent, human-aligned, cheap | **Shares the system's failure modes** — fooled by cascades |
| Elaborate multi-judge | Seems rigorous | [MAR] found simple was *more* consistent |
| **Human eval (ME-3)** | Catches what automated misses [MAR] | Slow, expensive; sampled |
| Small eval [MAR] | Fast; big effects visible in ~20 queries | Misses small effects; needs scaling for fine differences |

**The trade [MAR] resolves counterintuitively: simple and small beat elaborate and large — when the effect is big.** [MAR] used ~20 queries and a single-prompt judge, and found large effects "with just a few test cases" [MAR]. **The instinct toward a huge eval and an elaborate judge is wrong for early iteration** — when you are making 30%→80% changes, a few queries show it. **Scale the eval only when you are chasing small differences**, which is later.

**The non-negotiable is ME-3: humans catch what automated evals miss, and for multi-agent this is critical.** A cascaded fabrication (Topic 8) is *internally consistent and well-cited* — so an automated consistency check *passes* it, and the LLM-judge, being an LLM, may be *fooled* by it. **Only a human, or a deterministic check against a real source (Topic 8's CF-5), catches the cascade.** **A multi-agent evaluation that is fully automated will systematically miss its most dangerous failure mode.**

**And ME-2 (marginal contribution) is the metric that pays for itself:** it finds the agents that cost coordination and tokens for no gain (Topic 2's MT-1), and removing them is pure savings. **Most multi-agent systems have at least one such agent** — the fifth subagent duplicating the fourth (Topic 5) — and the ablation is how you find it.

## 8. Experiments

**The marginal-contribution ablation (ME-2) — the highest-value experiment.** Remove each agent in turn; measure the outcome drop. **Prediction: at least one agent has $\mathrm{MC}_i \le 0$** — it duplicates another or adds only overhead (Topic 2, Topic 5). **Remove it and re-measure; the outcome should hold at lower cost.** This is Topic 2's MT-1, made empirical, and it typically finds removable agents.

**The end-state-vs-process comparison (ME-1).** Evaluate the same runs by (a) process adherence (did it follow the expected steps) and (b) end-state (did it reach the goal). **Prediction: process eval fails valid runs** that took different paths [MAR] — demonstrating why ME-1 is necessary.

**The judge-calibration measurement (ME-3).** Compare LLM-judge scores to human judgments. **[MAR] chose their design because it "aligned with human judgements"** — measure your alignment. **And specifically: feed the judge a cascaded fabrication (Topic 8) and see if it passes it.** **Prediction: it does** (the fabrication is consistent and cited) — demonstrating why humans are required.

**The eval-size sweep.** Measure effect detectability at 5, 20, 100 queries. **Prediction from [MAR]: large effects are visible at ~20; small effects need more.** This calibrates how big your eval needs to be for the changes you are making.

**The coordination-overhead measurement (Topic 2).** Fraction of tokens on coordination, duplicate-work rate, straggler latency. **These quantify the tax the marginal contribution must exceed.**

**Statistics.** Ablation contributions with clustered-bootstrap intervals; judge-human agreement (correlation, with a cascade-detection check); Wilson on end-state success; **report token cost as a first-class outcome** (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Process-based evaluation of a non-deterministic system.** Fails valid runs that took different paths [MAR]. Mitigation: ME-1 — evaluate the end-state.
- **Aggregate-only evaluation.** Hides which agents contribute; you cannot find the redundant one. Mitigation: ME-2 — marginal contribution by ablation.
- **Fully-automated evaluation.** Misses cascaded fabrications (consistent + cited, so the check passes) and the hallucinated answers [MAR] names. **The most dangerous evaluation gap for multi-agent.** Mitigation: ME-3 — humans in the loop; deterministic source checks (Topic 8, CF-5).
- **Trusting the LLM-judge unconditionally.** It shares the system's failure modes; a cascade fools it. Mitigation: calibrate against humans; keep humans for the shared failures.
- **Elaborate judge schemes.** [MAR] found simple *more* consistent. Mitigation: single call, single prompt, 0.0–1.0 + pass/fail.
- **Over-large early eval.** Chasing statistical rigor when a few queries show the effect. Mitigation: start small [MAR]; scale for small effects only.
- **Ignoring coordination overhead.** The marginal gain is measured but the coordination tax (Topic 2) is not; the net may be negative. Mitigation: measure CO; net = gain − overhead.
- **Non-contributing agents retained.** $\mathrm{MC}_i \le 0$ agents kept because nobody ablated them. Mitigation: the ablation; remove them (Topic 2's MT-1).
- **Edge case — an agent that contributes only on rare tasks.** Its average $\mathrm{MC}_i$ is near zero but it is essential for a minority of tasks. Mitigation: stratify the ablation by task type; average $\mathrm{MC}$ hides task-specific value (as Topic 5's PE-3 hides minority findings).
- **Edge case — the judge that is better than the humans.** On some dimensions (citation-checking at scale), the LLM-judge may be more consistent than human reviewers. **Then use it — but still sample humans for the cascade/hallucination failures it shares** (ME-3).
- **Open limitation.** [MAR] documents the *methodology* thoroughly but **does not publish per-agent marginal contributions** — ME-2's ablation is implied, not reported with results. **No source measures redundancy or coordination-overhead distributions.** The four metrics are **[synthesis]** of documented components. §8 is the local measurement.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **Evaluate the end-state, not the process:** "evaluate whether it achieved the correct final state" — "agents may find alternative paths to the same goal" [MAR].
2. **Agents are non-deterministic between runs, even with identical prompts** [MAR] — process evaluation fails.
3. **Start small:** ~20 queries; large effects (30%→80%) visible "with just a few test cases" [MAR].
4. **The LLM-judge:** a single call, single prompt, 0.0–1.0 + pass/fail was "most consistent and aligned with human judgements" [MAR] — simple beat elaborate.
5. **Five rubric dimensions:** factual accuracy, citation accuracy, completeness, source quality, tool efficiency [MAR].
6. **Humans catch what automated evals miss:** "hallucinated answers on unusual queries, system failures, or subtle source selection biases" [MAR].
7. Token usage explains 80% of variance [MAR] — track it in coordination overhead.
8. **[MAR] does not publish per-agent marginal contributions** — the ablation is implied, not reported.

**Decision rules.**
- **Evaluate the end-state, not the process** (ME-1) — non-deterministic agents take valid different paths.
- **Measure marginal contribution by ablation** (ME-2) — an agent with $\mathrm{MC}_i \le 0$ is overhead; remove it (Topic 2's MT-1).
- **Keep humans in the loop** (ME-3) — automated evals miss cascaded fabrications and the hallucinations [MAR] names.
- **Use a simple LLM-judge** (single call, five dimensions) and **calibrate it against humans** — it shares the system's failure modes.
- **Start with ~20 real queries** — big effects don't need big evals.
- **Measure coordination overhead** — the marginal gain must exceed it.

**Production implications.**
1. Run the marginal-contribution ablation; it finds the redundant agents (Topic 5) that cost tokens for no gain, and removing them is pure savings.
2. Switch to end-state evaluation; process evaluation is failing your valid non-deterministic runs.
3. Keep humans reviewing a sample — the automated eval passes cascaded fabrications, your most dangerous failure (Topic 8).
4. Adopt [MAR]'s simple LLM-judge and calibrate it; elaborate judges were *less* consistent.

**Connections.** This topic measures the multi-agent system Topics 1–8 built. Marginal contribution (ME-2) is Chapter 6, Topic 14's ablation and Topic 2's MT-1; redundancy and diversity are Topic 5; coordination overhead is Topic 2's tax. The citation-accuracy dimension is Topic 8's CF-5 defense, measured. The judge's limitations are Chapter 8, Topic 6, §3.3 and [FSC §6.3.5]. The tracing substrate is Chapter 6, Topic 14 and Chapter 8, Topic 13's tracing gap. Topic 15 uses these measurements to control concurrency.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — **end-state evaluation** ("evaluate whether it achieved the correct final state" rather than "validating every intermediate step"; "**agents may find alternative paths to the same goal**"); **"Agents make dynamic decisions and are non-deterministic between runs, even with identical prompts"**; **"We started with a set of about 20 queries representing real usage patterns"** and large effects visible "with just a few test cases" (30%→80%); the **LLM-judge** ("A single LLM call with a single prompt outputting scores from 0.0-1.0 and a pass-fail grade was the most consistent and aligned with human judgements"); the **five rubric dimensions** ("factual accuracy, citation accuracy, completeness, source quality, tool efficiency"); **human evaluation** ("People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases"); token usage explaining 80% of variance; full production tracing for diagnosis — https://www.anthropic.com/engineering/multi-agent-research-system
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — the unsupported-completion propensity the LLM-judge shares (why it can be fooled by a cascade) — `Knowledge_source/`
