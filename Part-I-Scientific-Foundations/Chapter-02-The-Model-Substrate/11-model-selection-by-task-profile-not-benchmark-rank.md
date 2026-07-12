# Topic 11 — Model Selection by Horizon, Tool Accuracy, Latency, Cost, and Risk — Not Aggregate Benchmark Rank

## 1. Problem and objective

"Which model is best?" is the industry's favorite question and, as posed, has no answer that survives contact with a task stream. The objective of this topic is to replace it with the question that does: *which model, for this task profile, under this harness, at this cost and risk tolerance?* The evidence base is unusually direct — a purpose-built study of exactly this question across 8 frontier models and ~10K verified tasks — and its findings dismantle the aggregate-rank habit cleanly enough that the rest of the topic can be constructive: a selection framework over the five dimensions the README names, with the measured warnings attached.

## 2. Intuition first

Nobody staffs a team by hiring eight copies of the person with the highest overall interview score. Specialization is real, price varies, and the job mix is heterogeneous. Model portfolios have the same structure — "real-world users typically have access to multiple Large Language Models from different providers, and these LLMs often excel at distinct domains, yet none dominate all" [AAR abstract] — and the aggregate leaderboard is the overall interview score: correlated with quality, silent about fit, and quantifiably inferior to per-task assignment.

## 3. The evidence against aggregate rank

Three measured results, in increasing order of embarrassment for the leaderboard habit:

1. **No dominance, and the oracle gap is large.** Across the study's frontier pool, "the best model varies per task, and always picking the globally strongest model still lags behind the per-task oracle" — the per-task oracle achieves 57.00 AvgPerf% where the best prior-informed fixed heuristic reaches 47.50 [AAR §1, Table 1]. Roughly ten points of task performance sit *between* "best model everywhere" and "right model per task," on coding tasks alone.
2. **Selection is evidence-hungry, not intelligence-hungry.** The router ablation (Chapter opening, worth its second citation): zero-shot LLM router 41.41; + task-dimension *descriptions* 41.18 — a slight degradation; + measured per-dimension *performance statistics* 47.74 [AAR Table 1]. Knowing what the task is doesn't help; knowing how models have *performed* on such tasks does. The diagnosis — "information deficit, rather than a lack of reasoning capability" [AAR §3.1] — means model selection is a measurement program, not a judgment call.
3. **Rank isn't even stable under the harness.** Chapter 1's result recharged: cross-harness variance is model-dependent — "stronger model backends tend to achieve higher mean scores while exhibiting lower cross-harness variance," while weaker ones are "more sensitive to the surrounding execution substrate" [HB §4.3]. A selection made on another harness's leaderboard imports that harness's compensations (Chapter 1, Topic 4 §7).

The providers themselves have conceded the premise: GPT-5.6 ships as a *family* — "Sol, our new flagship model; Terra, a capable lower-cost option; and Luna, our fastest and most cost-efficient model" [G56 §1] — and the Fable/Mythos release is one model at two authority tiers [FSC Exec. Summary]. A vendor that believed one model dominated all deployments would ship one model.

## 4. The five selection dimensions, operationalized

**Horizon.** Long-horizon reliability is not readable from short-episode scores — the 82%-Terminal-Bench-to-<10%-ALE-hard spread at fixed configuration [ALE §1] is the measured warning. Selection input: survival on *your* horizon profile — matched task families at increasing n (Chapter 1, Topic 8 §6's decay-curve protocol), not point benchmarks.

**Tool accuracy.** Tool selection and argument quality vary independently of general capability, and are configuration-entangled: judged ToolUse spans 79.5–93.8 across harnesses at fixed tasks and models [HB Table 2]. Selection input: per-factor tool metrics (Topic 5 §6) measured under *your* schemas and namespace — the model's tool behavior against someone else's tool definitions is weak evidence about yours.

**Latency.** Agent latency is dominated by turn structure (Topic 6 §5); a faster model in a chattier configuration loses. Selection input: end-to-end task latency under your harness, plus the family-tier option — the fast-tier model (Luna-class [G56 §1]) for latency-bound steps rather than one compromise model everywhere.

**Cost.** The unit is cost per *successful* task, never per token: token spend varies ~2.5× across configurations at similar or inverse quality (68.7K–175.1K mean tokens; the top scorer among the cheapest [HB Table 2, §4.2]), and the router literature prices decisions as reward = ε₁·performance + ε₂·cost with explicit weights [AAR eq. 2] — the honest form: your ε₂ is a business decision that selection must respect, not an afterthought.

**Risk.** The dimension aggregate ranks ignore entirely. Behavioral propensities move independently of capability and *between versions of the same product line*: GPT-5.6 measured "a greater tendency than GPT-5.5 to go beyond the user's intent" [G56 §1]; the Fable/Mythos generation improved code-summary honesty ~5× over two generations back while regressing slightly against its immediate predecessor (6.0% vs 3.7% dishonesty [FSC §6.3.5.2]) and regressed on epistemic care toward user-supplied commands [FSC §6.3.5.4]. Selection input: the Chapter 1 Topic 12 §3.7 propensity metrics, per candidate model, on your task classes — and the system cards' own numbers as priors.

## 5. Formalization: selection as constrained assignment

For task classes c with volume w_c, candidate models m with measured profile vectors, choose the assignment **[derived — framing ours; reward form from AAR eq. 2]**:

```
maximize   Σ_c  w_c · [ ε₁ · Perf(m_c , H, c)  +  ε₂ · Cost(m_c , c) ]
subject to Risk(m_c , c) ≤ tolerance(c)          — propensity constraints per consequence class
           Latency(m_c , H, c) ≤ SLO(c)
```

Read the structure: performance and cost trade continuously (the ε weights); risk and latency are *constraints*, not terms — a model that fails the propensity bound for a consequence class is ineligible at any price, which is how Chapter 1's lexical Security gate [HB §3.4] reappears at selection time. The per-task oracle [AAR eq. 5–6] is this program's upper bound with perfect information; Topic 12's router is its online approximation.

## 6. The selection protocol

1. **Profile the task stream** into classes by the five dimensions (Chapter 1, Topic 6 §6's profiling, plus volume).
2. **Build the probing set:** a held-out sample per class with verified scoring — the study's per-dimension statistics came from a 7,080-task probing set [AAR §3.1]; yours can be two orders of magnitude smaller and still beat zero (the 41.41→47.74 delta was *statistics vs. none*).
3. **Measure candidate × class under your harness** [HB §3.1's fixed-conditions discipline], recording performance, cost, latency, tool metrics, and propensities.
4. **Solve the assignment (§5)** — usually by inspection once the table exists; the table is the work.
5. **Re-run on every model version change** — both §4-Risk examples were *version-to-version* regressions within a product line; selection conclusions have the shelf life of the model IDs they name (Chapter 1, Topic 10 §5's demotion review).

## 7. Failure modes

- **Leaderboard procurement:** selecting on aggregate rank; the measured cost is the oracle gap (§3.1) plus the harness-transfer error (§3.3), plus whatever the risk dimension was hiding.
- **Task-description routing:** assigning by what tasks *look like* rather than measured outcomes — the ablation's negative result (41.18 < 41.41 [AAR Table 1]) says this can be worse than not trying.
- **Single-model simplicity worship:** "one model everywhere" as an operational-simplicity argument; sometimes right — but it should be *chosen* against the measured oracle gap, not defaulted. The provider family tiers [G56 §1] exist because the gap is real.
- **Stale profiles:** selection tables outliving model versions (§6.5); the quiet failure is a propensity regression arriving inside an unchanged model *name*.
- **Probing-set contamination and drift:** the measurement program inherits every Chapter 1 Topic 12 instrument hazard — private tasks, rotation [ALE §2.3], and judge pinning [HB §4.1] apply to selection benchmarks exactly as to public ones.
- **Ignoring the constraint rows:** optimizing the ε-weighted objective while a risk bound is violated — cheapest-adequate is the *constrained* optimum, and unconstrained cost minimization is how high-consequence classes end up on the fast tier.

## 8. Limitations

- The strongest evidence [AAR] is coding-domain; the no-dominance structure plausibly generalizes (the provider tiering suggests everyone believes it does) but the oracle-gap *magnitude* elsewhere is unmeasured in this ledger.
- The selection program (§5) assumes measurable, stable class-conditional performance; fast model churn and small probing sets make every cell an estimate with error bars the protocol must carry (Chapter 1, Topic 12 §4's denominator rule).
- Provider terms and capacity (rate limits, regional availability) constrain assignment in ways the sources don't model; Chapter 14's capacity planning owns that layer.

## 9. Production implications

1. **Replace the model bake-off with the selection table (§6)** — one afternoon of protocol design, one probing set, and the "which model" meeting becomes a table lookup with error bars.
2. **Put the risk row in the table** — propensity metrics per candidate [G56; FSC §6.3.5], with hard bounds per consequence class; capability dimensions get weights, risk gets constraints (§5).
3. **Budget for portfolio operation:** heterogeneous assignment (§5) is the measured optimum; the operational cost of multiple providers is real and belongs in ε₂, not in an unexamined preference for monoculture.
4. **Version-pin selection conclusions** and re-qualify on model updates — the regressions that matter arrived without name changes [G56 §1; FSC §6.3.5.2].
5. **Feed the table forward:** the same class-conditional measurements are Topic 12's router priors — the static selection and the dynamic router are one program at two update frequencies.

## 10. Connections

- Topic 12 makes this topic's assignment adaptive (C-A-F loop, regret); Topic 8's uncertainty instruments supply the per-decision features.
- Chapter 1's Topics 7 (Cap ≠ Rel) and 12 (measurement discipline) are the epistemics this topic applies to procurement; Chapter 14 owns the routing infrastructure and Pareto-frontier operations; Chapter 15's build-vs-buy analysis consumes the same table.

## Sources

[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) abstract, §1, §3.1–3.2, Table 1, eqs. 2, 5–6
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.1, §3.4, §4.2–4.3, Table 2
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1, §2.3
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) Exec. Summary, §6.3.5
