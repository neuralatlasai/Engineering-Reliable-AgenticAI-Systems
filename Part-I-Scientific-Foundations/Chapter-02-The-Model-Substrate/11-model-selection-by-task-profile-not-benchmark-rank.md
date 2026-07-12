# Topic 11 — Model Selection by Horizon, Tool Accuracy, Latency, Cost, and Risk — Not Aggregate Benchmark Rank

## 1. Problem and objective

"Which model is best?" is under-specified. A useful selection question is: *which model, under this harness and decoding configuration, for this task distribution, at this cost, latency and risk tolerance?* This topic builds that decision from class-conditional measurements rather than aggregate rank. Agent-as-a-Router supplies direct coding-domain evidence across eight models and roughly ten thousand verified tasks [AAR]; it is a strong case study, not a universal estimate for every domain.

## 2. Intuition first

Nobody staffs a team by hiring eight copies of the person with the highest overall interview score. Specialization is real, price varies, and the job mix is heterogeneous. Model portfolios have the same structure — "real-world users typically have access to multiple Large Language Models from different providers, and these LLMs often excel at distinct domains, yet none dominate all" [AAR abstract] — and the aggregate leaderboard is the overall interview score: correlated with quality, silent about fit, and quantifiably inferior to per-task assignment.

## 3. The evidence against aggregate rank

Three measured results motivate task-conditional selection:

1. **No candidate dominates every task.** The reported per-task oracle reaches 57.00 AvgPerf%, while the *DimensionBest* prior-informed heuristic reaches 47.50 [AAR Table 1]. This is an oracle-versus-heuristic gap, not the numerical gap between the oracle and the globally strongest fixed model. The result establishes available routing headroom on this benchmark; a deployment must estimate its own.
2. **Measured performance information is valuable.** The reported zero-shot LLM router scores 41.41; adding task-dimension descriptions scores 41.18; adding measured per-dimension performance statistics scores 47.74 [AAR Table 1]. The 0.23 difference between the first two conditions is not interpretable without uncertainty, but the larger statistics ablation supports the authors' diagnosis that information deficit is important [AAR §3.1]. Selection is therefore a measurement program as well as a modeling problem.
3. **Rank is not stable under the harness.** Chapter 1's configuration-level result applies directly: cross-harness variance is model-dependent—"stronger model backends tend to achieve higher mean scores while exhibiting lower cross-harness variance," while weaker ones are "more sensitive to the surrounding execution substrate" [HB §4.3]. A selection made on another harness's leaderboard imports that harness's compensations (Chapter 1, Topic 4 §7).

Provider portfolios are consistent with this trade space: GPT-5.6 is described as a family spanning flagship, lower-cost and low-latency options [G56 §1], while the Fable/Mythos release separates authority profiles [FSC Exec. Summary]. Product tiering is not scientific proof of task-level specialization, but it reinforces the practical need to measure quality, cost, latency and authority jointly.

## 4. The five selection dimensions, operationalized

**Horizon.** Long-horizon reliability is not readable from short-episode scores — the 82%-Terminal-Bench-to-<10%-ALE-hard spread at fixed configuration [ALE §1] is the measured warning. Selection input: survival on *your* horizon profile — matched task families at increasing n (Chapter 1, Topic 8 §6's decay-curve protocol), not point benchmarks.

**Tool accuracy.** Tool selection and argument quality vary independently of general capability, and are configuration-entangled: judged ToolUse spans 79.5–93.8 across harnesses at fixed tasks and models [HB Table 2]. Selection input: per-factor tool metrics (Topic 5 §6) measured under *your* schemas and namespace — the model's tool behavior against someone else's tool definitions is weak evidence about yours.

**Latency.** Agent latency is dominated by turn structure (Topic 6 §5); a faster model in a chattier configuration loses. Selection input: end-to-end task latency under your harness, plus the family-tier option — the fast-tier model (Luna-class [G56 §1]) for latency-bound steps rather than one compromise model everywhere.

**Cost.** The unit is cost per *successful* task, never per token: token spend varies ~2.5× across configurations at similar or inverse quality (68.7K–175.1K mean tokens; the top scorer among the cheapest [HB Table 2, §4.2]). The router literature uses an explicitly weighted objective of the form $R_{\mathrm{route}}=\varepsilon_{\mathrm{perf}}\widetilde P+\varepsilon_{\mathrm{cost}}\widetilde C$ [AAR eq. 2]. Here $\widetilde P$ and $\widetilde C$ must be declared, normalized quantities; if $\widetilde C$ is positive expenditure rather than a cost reward, then $\varepsilon_{\mathrm{cost}}\le 0$. The weights encode a business decision and cannot be inferred from benchmark rank.

**Risk.** The dimension aggregate ranks ignore entirely. Behavioral propensities move independently of capability and *between versions of the same product line*: GPT-5.6 measured "a greater tendency than GPT-5.5 to go beyond the user's intent" [G56 §1]; the Fable/Mythos generation improved code-summary honesty ~5× over two generations back while regressing slightly against its immediate predecessor (6.0% vs 3.7% dishonesty [FSC §6.3.5.2]) and regressed on epistemic care toward user-supplied commands [FSC §6.3.5.4]. Selection input: the Chapter 1 Topic 12 §3.7 propensity metrics, per candidate model, on your task classes — and the system cards' own numbers as priors.

## 5. Formalization: selection as constrained assignment

Let $k\in\mathcal K_{\mathrm{task}}$ index task classes with predeclared volume weights $w_k\ge0$ and $\sum_k w_k=1$. Let $\mathcal M_k$ be the configurations feasible for class $k$ after capability, residency, and availability filtering, and choose $m_k\in\mathcal M_k$. Define $U(m,k)$ in business-value units rather than adding raw percentages, dollars, and milliseconds:

$$
\max_{\{m_k\in\mathcal M_k\}}
\sum_{k\in\mathcal K_{\mathrm{task}}}
w_k\,\mathbb{E}\!\left[U(m_k,k)\right]
$$

subject to chance and quantile constraints

$$
\Pr\!\left(R_{\mathrm{critical}}(m_k,k)>\rho_k\right)\le\delta_k,
$$

$$
\operatorname{Quantile}_{0.99}\!\left(L(m_k,k)\right)
\le \operatorname{SLO}_k,
$$

and capacity, residency, and availability constraints. Here $R_{\mathrm{critical}}(m_k,k)$ is the random critical-loss measure for a run, $\rho_k$ its tolerated level, $\delta_k$ the allowed probability of exceeding it, $L(m_k,k)$ random end-to-end latency, and $\operatorname{SLO}_k$ the class-specific p99 latency limit in the same time units. A configuration $m_k$ includes model, harness, decoding, tools, permissions, and evaluator versions; no separate undefined harness variable is implicit.

Every table cell is an estimate. Selection should use confidence or posterior uncertainty, not point estimates alone. A robust alternative maximizes a lower confidence bound on utility while constraining an upper confidence bound on critical failure. The AAR per-task oracle [AAR eqs. 5–6] is a retrospective full-information benchmark, not an observable production policy.

## 6. The selection protocol

1. **Profile the task stream** by task shape, consequence, modality, data boundary and volume.
2. **Predeclare estimands and thresholds.** Define success, critical failure, latency quantiles, cost and minimum sample precision before testing candidates.
3. **Construct a stratified probing set.** AAR used 7,080 probing tasks [AAR §3.1], but no universal smaller sample size follows from that result. Determine sample size from class variance, minimum relevant effect and desired confidence.
4. **Run paired candidate × class experiments under the target harness.** Reuse each task across candidates where safe; repeat stochastic runs; record decoding, tool, provider and evaluator versions [HB §3.1].
5. **Estimate uncertainty.** Use task-cluster bootstrap intervals or a hierarchical model so repeated runs from one task do not masquerade as independent tasks.
6. **Solve the constrained assignment.** Preserve the Pareto table even if the operational policy chooses one point; business weights and risk limits can change.
7. **Validate out of sample and under perturbation.** Include distribution shift, provider degradation and risk-focused cases.
8. **Re-run on material version or harness changes.** Model names are not stable statistical identities.

## 7. Failure modes

- **Leaderboard procurement:** aggregate performance is applied to a different task and harness distribution.
- **Overreading tiny ablations:** a small point difference without uncertainty is promoted to a general causal rule.
- **Single-model dogma:** operational simplicity is treated as either automatically correct or automatically inferior. It is a measurable portfolio-cost trade-off.
- **Stale profiles:** selection tables outliving model versions (§6.5); the quiet failure is a propensity regression arriving inside an unchanged model *name*.
- **Probing-set contamination and drift:** the measurement program inherits every Chapter 1 Topic 12 instrument hazard — private tasks, rotation [ALE §2.3], and judge pinning [HB §4.1] apply to selection benchmarks exactly as to public ones.
- **Point-estimate selection:** the apparent winner is within sampling error of alternatives or is supported by too few critical cases.
- **Mean-latency selection:** tail latency and queueing violate the real SLO.
- **Ignoring constraints:** expected utility is optimized while critical risk, residency, capacity or availability requirements fail.

## 8. Limitations

- The strongest routing evidence [AAR] is coding-domain. Whether the same specialization structure or oracle-gap magnitude holds elsewhere must be measured.
- Task classes trade statistical power for specificity. Overly broad classes hide interactions; overly narrow classes produce unstable estimates.
- Critical failures are rare, so useful upper bounds may require substantially more data than ordinary success comparisons.
- The utility function and risk tolerances are governance decisions. The optimization formalizes them but cannot choose them.
- Provider terms and capacity (rate limits, regional availability) constrain assignment in ways the sources don't model; Chapter 14's capacity planning owns that layer.

## 9. Production implications

1. Replace the one-number bake-off with a versioned selection table carrying uncertainty.
2. Put completion, critical risk, cost and latency quantiles in separate columns before combining them through an explicit utility.
3. Treat a heterogeneous portfolio as a candidate architecture, not a foregone optimum; include integration, compliance, outage-correlation and maintenance cost.
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
