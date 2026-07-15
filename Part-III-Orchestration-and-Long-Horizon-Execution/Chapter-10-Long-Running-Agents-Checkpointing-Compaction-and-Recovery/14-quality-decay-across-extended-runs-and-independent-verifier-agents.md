# Topic 14 — Quality Decay Across Extended Runs and Independent Verifier Agents

## 1. Scope, prerequisites, terminology, boundaries, outcomes

This topic confronts pressure **P3** from Topic 1 head-on: **quality decays as a run extends**, and the model *cannot be trusted to notice its own decay*. The remedy is an **independent verifier agent** — a separate agent (or deterministic check) that judges the work, because the working agent, asked to evaluate itself, "confidently prais[es] the work — even when... obviously mediocre" [HDA]. This topic characterizes decay, explains why self-evaluation fails, and builds the independent verifier that catches what the worker misses.

**Prerequisites.** P3 (decay) and "context anxiety"/reset (Topic 1, [HDA]); false completion and the self-report unreliability (Topic 2, [FSC]); the `done`(claimed) vs `verified`(tested) distinction and independent predicates (Topic 4); the verified-state stop and "never self-verify" (Topic 12); the three-agent planner/generator/evaluator architecture (Topic 3, [HDA]); the fluent-generator laundering (Chapter 8 O-3); LLM-as-judge (Chapter 9 [MAR]).

**Terminology.**
- **Quality decay** — the tendency of per-step or per-unit output *quality* to fall as a run extends (later work worse than early work), from accumulated context, drift, fatigue, or "context anxiety." Distinct from *progress* (Topic 10 stall is *no progress*; decay is *progress at falling quality*).
- **Independent verifier** — a separate agent or deterministic check that judges work quality/correctness, *not* the agent that produced it. [HDA]'s evaluator.
- **Self-evaluation** — the working agent judging its own output. Unreliable (leniency, self-praise); the failure this topic fixes.
- **Skeptical evaluator** — a verifier tuned to be adversarial/critical rather than lenient, applying hard thresholds ([HDA]).

**Boundary.** This topic covers *quality* (is the work good?), complementing Topic 10 (*liveness* — is it progressing?) and Topic 12 (*doneness* — is it complete per predicates?). The verifier here *runs the predicates* Topic 4 defined and *judges the residual* (quality dimensions no deterministic test covers). It does not re-derive the three-agent architecture (Topic 3) but explains *why* the evaluator role exists and when it earns its place.

**Outcome.** You will be able to detect and measure quality decay, explain why self-evaluation fails and independent verification works, design a skeptical verifier with hard thresholds, and decide when the verifier earns its cost versus when a deterministic predicate suffices.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** Two compounding facts. **(1) Quality decays over long runs.** Late-run output is often worse — the model, saturated with context, drifted, or "anxious" ([HDA]), produces sloppier work than it did early. **(2) The model cannot self-assess this.** Asked "is this good?", the working agent praises its own work regardless of quality ([HDA]: "confidently praising the work — even when, to a human observer, the quality is obviously mediocre"). So the natural fix ("have the agent check its work") fails: the decayed agent is *also* the one judging, and it approves the decayed work. The result is a run that produces progressively worse output while confidently reporting success — Topic 12's false completion, but about *quality* rather than *completion*.

**Objective.** (i) Detect decay: measure quality as a function of run length, not just at the end. (ii) Explain and confirm why self-evaluation fails. (iii) Build an *independent* verifier — separate from the worker — that judges quality with hard thresholds and skepticism, catching what the worker misses. (iv) Decide when the verifier earns its cost (hard-relative-to-model tasks) versus when a deterministic predicate (Topic 4) suffices (and the verifier is overhead).

**Assumptions.** (a) Decay is real but *model-dependent* and *changing* — [HDA]: severe in Sonnet 4.5 (required resets), "largely eliminated" in Opus 4.5. So the *magnitude* of decay, and the *value* of decay-mitigation, must be measured per-model, not assumed. (b) Independent verification is a *strong lever* ([HDA]) but not free — it costs a separate agent's tokens and can itself be lenient if not tuned.

**Constraints.** The verifier must be *independent* — a different agent, ideally a different context (and, where it matters, a different model), never the working agent judging itself. It must be *skeptical* — [HDA] found initial evaluators "exhibited leniency" and required "multiple prompt iterations" to become critical. It must apply *hard thresholds* — pass/fail per criterion, not a graded opinion that gets rationalized away.

**Success criteria.** Decay is *measured* (a quality-vs-length curve exists), not assumed; the independent verifier catches quality failures the worker approved (measured gap between self-eval and independent-eval); the verifier is skeptical enough to fail genuinely-mediocre work; and the verifier is *removed* when a model no longer decays enough to justify it (Chapter 15's harness GC).

## 3. Intuition first, then formalization

**Intuition.** Decay is the model getting *tired*, in effect: as the run extends, accumulated context, drift, and (on some models) "anxiety" degrade output quality. You saw this in Topic 1 (P3) and Topic 7 (reset fixes it). The new problem here is *detection*: decay is invisible to the decayed agent, because the same degradation that lowers its output quality also lowers its *judgment* quality. A tired author is a poor proofreader of their own tired writing — and worse, is inclined to think it is fine. This is why "ask the agent to check its work" fails: you are asking the impaired party to assess its own impairment.

The fix is the *independent* judge — the building-inspector intuition from Topic 12, now applied to *quality* rather than *completion*. A separate agent, with fresh context and no ego investment in the work, judges it against explicit criteria. [HDA] found this to be "a strong lever": separating "the agent doing the work from the agent judging it" catches the mediocre work the worker praised. The independence matters on two axes: *fresh context* (the verifier is not saturated/drifted like the worker) and *no self-interest* (the verifier is not motivated to approve its own effort). [HDA]'s evaluator further *runs the application* (Playwright) rather than reading a description — judging the real artifact (Topic 6 fidelity), not the worker's fluent account of it.

The *skepticism* requirement is subtle and grounded: [HDA] found evaluators default to *leniency* — an untuned LLM-judge also tends to praise. So the verifier must be *deliberately* adversarial, applying *hard thresholds* ("if any criterion falls below its bar, it fails") rather than a soft aggregate score that a borderline result slides past. A lenient verifier is barely better than self-evaluation; the value is in the skepticism.

The final intuition is *economic and temporal*: the verifier's value depends on *task difficulty relative to the model*. On a task the model does easily, the worker rarely produces mediocre work, so the verifier mostly rubber-stamps (pure overhead). On a task hard relative to the model, the worker often produces subtle failures (stubs, half-implementations — [HDA]'s "audio recording, clip editing" stubs), and the verifier earns its cost by catching them. And because decay is model-dependent and shrinking ([HDA]: Opus 4.5 "largely eliminated" it), the verifier's value *decreases as models improve* — [HDA]'s explicit lesson that harness components "encode an assumption about what the model can't do" and "go stale as models improve." So the verifier is not permanent scaffolding; it is a measured, removable component.

**Formalization.** Let $q(k)$ be output quality at run-length $k$ (units or steps). Decay is $q'(k) < 0$ — quality decreasing in run length. Model the worker's self-assessment $\hat q_{\text{self}}(k)$ and an independent verifier's assessment $\hat q_{\text{ind}}(k)$ against true quality $q(k)$:

- **Self-evaluation bias:** $\hat q_{\text{self}}(k) \approx q(k) + \beta_{\text{self}}$ with $\beta_{\text{self}} > 0$ *and roughly constant or growing* — the worker over-rates by a positive bias that does not shrink as quality falls (it praises mediocre work). So $\hat q_{\text{self}}$ stays high even as $q$ decays — the detection failure.
- **Independent evaluation:** $\hat q_{\text{ind}}(k) \approx q(k) + \beta_{\text{ind}}$ with $\beta_{\text{ind}} \to 0$ *if tuned skeptical* (untuned, $\beta_{\text{ind}} > 0$ too — leniency). A skeptical verifier tracks $q(k)$; a lenient one does not.

**The self-evaluation theorem [synthesis].** Self-evaluation cannot detect decay because the evaluator's competence decays *with* the work: $\hat q_{\text{self}}(k) - q(k) = \beta_{\text{self}}$ does not fall as $q$ falls, so a decaying $q$ is reported as constant-high. Independent verification breaks the coupling: $\hat q_{\text{ind}}$ is produced by an agent whose competence is *not* decayed (fresh context) and not self-interested (no $\beta_{\text{self}}$), so $\hat q_{\text{ind}}$ tracks $q$ — *if* tuned skeptical to drive $\beta_{\text{ind}} \to 0$. This is the formal case for independence + skepticism.

**Verifier value [derived].** The verifier's expected value = (rate of worker quality-failures) × (catch rate) × (cost of an uncaught failure) − (verifier cost per check). On easy-for-model tasks, worker failure rate ≈ 0 → value negative (overhead). On hard-for-model tasks, failure rate high → value positive. And as models improve, worker failure rate falls → verifier value falls → remove it (harness GC). The verifier is warranted iff worker-failure-rate × failure-cost > verifier-cost — a measurable condition, not a default.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Quality monitor.** Measures $\hat q_{\text{ind}}(k)$ across run length — the decay curve. Distinct from progress ($\mu$, Topic 10) and completion (predicates, Topic 12); this tracks *quality of verified work over time*.
2. **Independent verifier (the evaluator, [HDA]).** Separate agent, fresh context. Runs Topic 4's deterministic predicates *and* judges the residual quality dimensions no test covers. Applies hard thresholds. Exercises the real artifact (Topic 6), not a description. Tuned skeptical.
3. **Decay mitigator.** On detected decay, triggers *reset* (Topic 7 — clean context, the grounded decay fix) rather than continuing the decayed session; or escalates if reset does not restore quality.
4. **Verifier-value tracker.** Measures worker-failure-rate and verifier-catch-rate to decide whether the verifier still earns its cost (Chapter 15 GC input).

**Interface: the verifier is independent and skeptical.** It never shares the worker's context (independence) and applies pass/fail thresholds (skepticism). Its judgment feeds the verified-state stop (Topic 12) for the residual quality dimensions and feeds the decay monitor.

**Control flow:**

```
worker produces unit u's output on branch b (Topic 13):
    deterministic predicates run (Topic 4)            # objective completion
    independent_verifier.judge(u):                     # SEPARATE agent, fresh context
        run predicates + exercise real artifact (Topic 6)
        score residual quality dims vs HARD thresholds
        return pass/fail + specific findings
    if fail:  recover (Topic 11) — worker fixes, RE-verify   # do not trust worker's fix either
    quality_monitor.record(k, verifier_score)          # decay curve
    if decay_detected(quality_monitor):
        reset session (Topic 7)                        # grounded decay fix
```

**Data flow.** Worker output → independent verifier (predicates + skeptical judgment on the real artifact) → pass/fail + findings → recovery (on fail) or verified (on pass) → quality monitor (decay curve) → decay mitigation (reset) + verifier-value tracking. The worker's self-assessment is *not* in this flow — it is neither trusted nor consulted for the verdict.

**Why this is the three-agent architecture (Topic 3).** This is the *reason* [HDA]'s planner/generator/**evaluator** split exists: the evaluator is the independent verifier, and it exists because the generator (worker) cannot judge itself. Topic 3 introduced the split structurally; this topic explains its *purpose* and when it earns its cost.

## 5. Grounding: primary sources and reproducible evidence

**Self-evaluation fails — the core grounding.** [HDA] is direct and quotable: "Agents tend to respond by confidently praising the work — even when, to a human observer, the quality is obviously mediocre... Separating the agent doing the work from the agent judging it proves to be a strong lever to address this issue." This grounds both the failure (self-praise) and the fix (independent judge as a "strong lever").

**The verifier must be skeptical and use hard thresholds.** [HDA]: the evaluator applied "hard thresholds for each criterion; if any one fell below it, the sprint failed," and required tuning — "initial evaluators exhibited leniency; multiple prompt iterations [were] necessary to achieve skeptical assessment." This grounds the skepticism requirement and the leniency-by-default hazard.

**The verifier exercises the real artifact.** [HDA]: the evaluator "exercises running applications directly rather than scoring static artifacts," using Playwright to "interact with running applications," catching "routing bugs, missing event handlers, and API endpoint ordering issues" and "feature stubs (audio recording, clip editing, effect visualizations)." This grounds judging the real thing (Topic 6 fidelity), and gives concrete examples of the subtle failures the worker approved but the verifier caught.

**Decay is real, model-dependent, and shrinking.** [HDA]: "context anxiety" in Sonnet 4.5 "requiring resets"; Opus 4.5 "largely eliminated this." This grounds decay as a measured phenomenon *and* its model-dependence — the basis for "measure decay per-model" and "the verifier's value shrinks as models improve."

**The verifier is a removable, staleness-prone component.** [HDA]: "every component in a harness encodes an assumption about what the model can't do on its own, and those assumptions... can quickly go stale as models improve," and "the sprint construct [became] removable with Opus 4.6; evaluator value depends on task difficulty relative to model capability." This grounds the economic/temporal framing — verifier value depends on task-difficulty-relative-to-model and falls as models improve.

**Self-report unreliability (converging evidence).** [FSC] (Chapter 2): premature stop from unverbalized fatigue — the model's self-assessment of its own state is unreliable. Chapter 8 O-3: the fluent synthesizer launders failures — the same mechanism as self-praise. Chapter 9 [MAR]: LLM-as-judge as a *separate* call/prompt — independent judging is the grounded pattern.

**Reproducible evidence.** The self-eval-vs-independent gap is directly measurable (E1); the decay curve is measurable (E2); the skepticism-tuning effect is measurable (E3). [HDA] grounds all the mechanisms qualitatively and gives concrete caught-failure examples; the *curves and gaps* are the experiments.

## 6. Implementation: the skeptical independent verifier

**Independence (separate agent, fresh context, ideally different model):**

```python
def verify_independently(unit, artifact, verifier_model):
    # NOT the worker. Fresh context. No access to the worker's rationalizations.
    ctx = build_verifier_context(unit.spec, unit.acceptance_criteria)   # criteria, not worker's notes
    result = verifier_model.judge(ctx, exercise=artifact)   # runs the REAL artifact (Topic 6)
    return result   # pass/fail per criterion + specific findings
```

**Skepticism via hard thresholds ([HDA]):**

```python
SKEPTICAL_RUBRIC = """
You are a skeptical reviewer. Assume the work is flawed until proven otherwise.
For each criterion, assign pass/fail against its HARD threshold. Do NOT average.
If ANY criterion fails, the whole unit fails. Praise nothing; report specific defects.
Exercise the running artifact; do not trust descriptions of it.
"""
def judge_with_hard_thresholds(criteria, artifact, verifier):
    scores = {c: verifier.evaluate(c, artifact, SKEPTICAL_RUBRIC) for c in criteria}
    failed = [c for c, s in scores.items() if s < c.threshold]     # hard per-criterion
    return ("FAIL", failed) if failed else ("PASS", [])            # any fail => fail
```

The `if ANY criterion fails, the whole unit fails` rule ([HDA]'s "if any one fell below it, the sprint failed") is what prevents a mediocre result from sliding past on a good *average* — it is the skepticism made mechanical.

**Decay monitoring and the reset trigger:**

```python
def monitor_decay(quality_history, window):
    recent = quality_history[-window:]
    slope = linreg_slope([h.score for h in recent])   # quality vs run-length
    return slope < DECAY_THRESHOLD                      # significantly falling quality
    # On decay: reset the session (Topic 7) — the GROUNDED fix — not "try harder".
```

**Verifier-value tracking (is it still worth it?):**

```python
def verifier_earns_its_place(stats):
    worker_failure_rate = stats.units_failed_by_verifier / stats.units_total
    catch_value = worker_failure_rate * stats.avg_failure_cost
    return catch_value > stats.verifier_cost_per_unit    # if false: GC the verifier (Ch.15)
```

This operationalizes [HDA]'s lesson: measure whether the verifier still catches enough to justify its cost, and remove it when the model improves past needing it.

**Re-verify the fix (do not trust the worker's correction).** When the verifier fails a unit and the worker fixes it, the fix is *re-verified* independently (Topic 12) — the worker's "fixed it now" is another self-report, equally untrustworthy.

## 7. Trade-offs

- **Independent verifier vs deterministic predicate.** Where a deterministic test exists (Topic 4), it is *stronger and cheaper* than an LLM verifier (model-independent, no leniency, no per-call cost). The LLM verifier is for the *residual* — quality dimensions no test captures (design quality, UX, subtle completeness). Prefer deterministic predicates; use the LLM verifier only for what they cannot cover. Do not use an LLM judge where a test would do.
- **Verifier cost vs catch value.** A separate verifier agent doubles (roughly) the per-unit token cost. It earns this only when worker-failure-rate × failure-cost exceeds it — i.e., on tasks hard relative to the model. On easy tasks it is overhead (rubber-stamping). Measure and gate (verifier-value tracker); do not run a verifier reflexively.
- **Skepticism vs false rejections.** A verifier tuned very skeptical catches more real defects but also *rejects good work* (false fails), causing wasted rework. Too lenient and it misses defects (barely better than self-eval). [HDA]'s "multiple prompt iterations" is the tuning to find the point where it catches real defects without excessive false rejects. This is a real, task-specific tuning cost.
- **Reset (decay fix) vs continue.** On detected decay, reset (Topic 7) restores quality but costs context reconstruction and momentum. Continuing is cheaper but ships decaying work. The trade favors reset when decay is real; and its *necessity shrinks* on better models ([HDA]) — so the reset-on-decay policy, like the verifier, is measured and model-dependent.
- **Permanent vs removable verifier.** Treating the verifier as permanent scaffolding is a maintenance and cost burden that becomes *unjustified* as models improve ([HDA]: components go stale). Treating it as measured and removable (GC when worker-failure-rate drops) keeps the harness lean. The trade is between the comfort of always-on verification and the cost of over-scaffolding a capable model.

## 8. Experiments: baselines, ablations, metrics

**E1 — Self-eval vs independent-eval gap (the headline).** For the same worker outputs, collect the worker's self-assessment and an independent verifier's assessment; compare both to ground truth (human or deterministic). **Prediction ([HDA]):** self-eval over-rates (praises mediocre work); independent-skeptical tracks truth. Metric: bias $\beta_{\text{self}}$ vs $\beta_{\text{ind}}$; rate of mediocre work approved by self-eval but caught by the verifier. This quantifies the "strong lever."
**E2 — Decay curve.** Measure independent-verifier quality vs run-length $k$, per model. **Prediction ([HDA]):** negative slope on decay-prone models (Sonnet 4.5-like); flat on decay-resistant models (Opus 4.5-like). Stratify by model — the stratification is the finding. Metric: quality-vs-$k$ slope; reset-recovery (does quality rebound after a reset, Topic 7?).
**E3 — Skepticism tuning.** Vary verifier skepticism (lenient → hard-threshold); measure catch rate and false-reject rate. **Prediction ([HDA]):** lenient → low catch (≈ self-eval); over-skeptical → high false-reject; a tuned point maximizes true catches. Metric: catch rate, false-reject rate, ROC.
**E4 — Verifier value vs task difficulty / model.** Run the verifier on tasks easy vs hard relative to the model, across model generations. **Prediction:** value positive on hard-relative tasks, negative (overhead) on easy ones; value falls as models improve. Metric: worker-failure-rate × failure-cost vs verifier-cost. This validates the GC decision.

**Honest status.** [HDA] grounds *all* the mechanisms — self-praise, independent-judge-as-strong-lever, skepticism/hard-thresholds, leniency-default, real-artifact evaluation, decay-and-reset, model-dependence, removability — and gives concrete caught-failure examples (feature stubs, routing bugs). But it publishes these *qualitatively*: no self-eval-vs-independent gap number, no decay slope, no catch/false-reject ROC. **The curves and gaps (E1–E4) are unmeasured in the sources.** This is the best-grounded *mechanism* story in the back half of the chapter and an *unmeasured-magnitude* story like the rest. Mechanism firmly grounded; numbers yours.

## 9. Failure modes, edge cases, hazards, limitations

- **Self-evaluation (the failure this topic exists to fix).** The worker judges its own decayed work and approves it. Mitigation: independent verifier, never self-eval (Topic 12 DR-4).
- **Lenient verifier (self-eval by the back door).** An untuned LLM judge also praises, so an "independent" but lenient verifier barely helps. Mitigation: skepticism + hard thresholds + tuning ([HDA]); measure catch rate (E3).
- **Verifier judges a description, not the artifact.** The verifier reads the worker's account of the work rather than exercising it, and is fooled by a fluent-but-false description (laundering). Mitigation: the verifier exercises the *real* artifact (Topic 6, [HDA] Playwright), not a summary.
- **Trusting the worker's fix.** The verifier fails a unit, the worker "fixes" it and says done — trusted without re-check. Mitigation: re-verify fixes (Topic 12).
- **Rubber-stamping (verifier not earning its cost).** On easy-for-model tasks the verifier passes everything, adding cost without catches. Mitigation: verifier-value tracking; GC it when worker-failure-rate drops (Chapter 15).
- **Decay unmeasured / assumed.** Assuming decay (and paying for resets/verification) when the current model does not decay, or *not* measuring it and shipping decayed work. Mitigation: measure the decay curve per-model (E2); make reset/verifier policies model-dependent, not constant.
- **Verifier is itself decayed or biased.** If the verifier runs long or shares failure modes with the worker (same model, same training biases), its independence is partial — it may share a blind spot. Mitigation: fresh context per verification; where feasible, a *different* model as verifier; deterministic predicates where they exist (fully independent).
- **Limitation.** Independence is never perfect: an LLM verifier shares the *class* of failure modes of LLMs generally (both may miss the same subtle error). It reduces the correlated-error problem (fresh context, no self-interest, skepticism) but does not eliminate it — which is why [HDA] notes humans still catch things evals miss ([MAR] too: humans catch "hallucinated answers evals miss"). The verifier is a strong lever, not a guarantee; deterministic predicates (Topic 4) remain the strongest check, and human review the backstop for the residual.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Self-evaluation fails: agents "confidently prais[e] the work — even when... obviously mediocre"; separating doer from judge is "a strong lever" [HDA].
- The verifier must be *skeptical* with *hard thresholds*; leniency is the default and requires tuning to overcome [HDA].
- The verifier *exercises the real artifact* and catches concrete subtle failures (stubs, routing bugs, endpoint ordering) [HDA].
- Decay is real, model-dependent, mitigated by *reset*, and shrinking across model generations; harness components go stale as models improve [HDA].

**Decision rules.**
- **DR-1.** Never self-evaluate. Use an *independent* verifier (separate agent, fresh context, ideally different model) for quality judgment; the working agent cannot assess its own decayed work.
- **DR-2.** Make the verifier *skeptical* with *hard per-criterion thresholds* (any criterion fails ⇒ unit fails), and have it *exercise the real artifact*, not a description. Tune it out of default leniency; re-verify worker fixes.
- **DR-3.** Prefer deterministic predicates (Topic 4) over LLM verification; use the LLM verifier only for the residual quality dimensions no test covers.
- **DR-4.** Measure decay per-model; on detected decay, *reset* (Topic 7). Measure whether the verifier earns its cost (worker-failure-rate × failure-cost vs verifier-cost); remove it when the model improves past needing it (Chapter 15 GC).

**Production implications.** Quality decay + self-praise is how a long run ships work that gets quietly worse while reporting success — the quality analogue of false completion, and just as invisible without an independent check. The independent verifier is [HDA]'s grounded "strong lever," and it is the reason the evaluator role exists in the three-agent architecture. But it is *scaffolding around a model limitation*, and the honest engineering posture is to *measure* whether the limitation still exists on your current model: run the decay curve, run the self-eval-vs-independent gap, and keep the verifier only while it earns its cost. Teams that add a permanent evaluator and never re-measure end up paying for scaffolding a capable model no longer needs; teams that skip it ship decaying, self-praised work. The discipline is measure-and-gate, not assume-and-permanent.

**Connections.** This is P3 (Topic 1) confronted with the grounded fix. Self-eval failure is the quality form of Topic 2's false completion and Chapter 8's O-3 laundering; the independent verifier is Topic 12's "never self-verify" and the *purpose* of Topic 3's evaluator role. The verifier runs Topic 4's predicates + judges the residual, exercises Topic 6's real artifacts, feeds Topic 12's stop, and routes failures to Topic 11's recovery. Decay's fix is Topic 7's reset. The removability is Chapter 15's harness GC. Decay measurement is Topic 15's quality-vs-length curve. LLM-judge design is Chapter 9 [MAR]; human-catches-residual is [MAR]/[HDA].

### Sources
- **[HDA]** Anthropic — *Harness design for long-running apps* (agents "confidently prais[e]... obviously mediocre" work; separating doer from judge = "strong lever"; hard thresholds "if any one fell below it, the sprint failed"; evaluators "exhibited leniency," needed "multiple prompt iterations" for "skeptical assessment"; "exercises running applications directly"; caught stubs/routing/endpoint bugs; context anxiety Sonnet 4.5 → Opus 4.5; components "go stale as models improve"; evaluator value "depends on task difficulty relative to model capability").
- **[FSC]** Fable5/Mythos5 system card — unverbalized fatigue / unreliable self-assessment (§6.4.1.4). Via Chapter 2.
- **[MAR]** Anthropic — *Multi-agent research system* (LLM-as-judge as separate call; humans catch hallucinations evals miss). Via Chapter 9.
- Internal: Chapter 8 Topic 6 (O-3, fluent laundering), Chapter 9 (LLM-judge), Chapter 15 (harness GC), this chapter Topics 1 (P3 decay), 2 (false completion, self-report), 3 (planner/generator/evaluator — this is the evaluator's purpose), 4 (predicates vs residual), 6 (exercise real artifact), 7 (reset as decay fix), 11 (recovery), 12 (never self-verify, verified stop), 15 (decay curve).
