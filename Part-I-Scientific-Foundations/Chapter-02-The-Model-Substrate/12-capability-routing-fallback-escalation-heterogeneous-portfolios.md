# Topic 12 — Capability Routing, Fallback, Escalation, and Heterogeneous Model Portfolios

## 1. Problem and objective

Topic 11 built an offline selection table. A production router turns that table into a sequential decision system: it chooses a qualified model–harness configuration, observes incomplete and sometimes delayed feedback, updates its evidence, and decides when to fall back or escalate.

This is a contextual-bandit problem only under specific feedback assumptions. In ordinary operation the router observes the outcome of the selected model, not the counterfactual outcomes of every unselected model. Consequently, per-task oracle regret is an evaluation construct, not a directly observable production metric. The objective is to make those assumptions explicit and to add safe exploration, transactional fallback, nonstationarity and statistically valid policy evaluation.

## 2. Intuition first

A dispatcher learns only from the specialist it assigned. If the specialist succeeds, the dispatcher does not know whether a cheaper specialist would also have succeeded. If the specialist fails, the dispatcher does not know whether every alternative would have failed. This missing-counterfactual problem is the core of online routing.

The router therefore needs more than a clever classifier. It needs qualified choices, measured priors, exploration discipline, external verification, versioned memory and a recovery protocol that knows which effects already occurred. Routing quality is an evidence-system property.

## 3. Formalization: full information versus bandit feedback

Let $\mathcal{M}=\{m_1,\ldots,m_M\}$ be the qualified configuration pool and let $\mathbf f_i$ be the routing-feature vector for decision instance $i$. Each candidate has a potential utility

$$
r_i(m)=U_{\mathrm{route}}\!\left(
Y_i(m),\mathsf{Cost}_i(m),L_i(m),R_i(m)
\right),
$$

where $Y$ is task outcome, $\mathsf{Cost}$ monetary or compute cost, $L$ latency, $R$ consequence-weighted risk, and $U_{\mathrm{route}}$ a declared unit-consistent utility mapping. At decision $i$, the router selects configuration random variable $M_i^{\mathrm{sel}}$:

$$
M_i^{\mathrm{sel}}
\sim\pi(\cdot\mid \mathbf f_i,\mathcal{H}_{i-1}),
$$

then normally observes only $r_i(M_i^{\mathrm{sel}})$ after verification. The history $\mathcal{H}_{i-1}$ contains prior routing features, selection propensities, outcomes, versions, and timestamps.

With full counterfactual outcomes, cumulative regret against the per-task oracle is

$$
\operatorname{Regret}_N
=\sum_{i=1}^{N}
\left[
\max_{m\in\mathcal{M}}r_i(m)-r_i(M_i^{\mathrm{sel}})
\right].
$$

That quantity is exactly computable only when every candidate is evaluated on each task or when the environment reveals all potential outcomes. Under bandit feedback it is latent. Online dashboards should report observed verified utility, constraint violations and calibrated off-policy estimates—not label an unknowable oracle difference as measured regret.

### 3.1 Off-policy evaluation

If a logging policy selected $M_i^{\mathrm{sel}}$ with known propensity $p_i=\pi_0(M_i^{\mathrm{sel}}\mid\mathbf f_i,\mathcal H_{i-1})$, the inverse-propensity estimator for a target history-dependent policy $\pi$ is

$$
\widehat V_{\mathrm{IPS}}(\pi)
=\frac{1}{N}\sum_{i=1}^{N}
\frac{\pi(M_i^{\mathrm{sel}}\mid\mathbf f_i,\mathcal H_{i-1})}{p_i}
r_i(M_i^{\mathrm{sel}}).
$$

Both policies must condition on the same logged information set; equivalently, the full history may be absorbed into an augmented feature vector. This per-decision IPS estimator targets action substitution averaged over the logged history distribution. It does **not** identify the value of deploying $\pi$ when its earlier selections would change later histories, task availability, or feedback; that sequential estimand requires trajectory-level importance ratios or another longitudinal causal design, plus substantially stronger overlap assumptions. Small propensities create high variance and lack of overlap makes evaluation impossible. Doubly robust estimators combine propensity weighting with an outcome model and remain consistent if either component is correct under the corresponding contextual-bandit identification assumptions [DR]. Report task-cluster confidence intervals and effective sample size.

## 4. What ACRouter establishes

Agent-as-a-Router formalizes a Context→Action→Feedback loop and evaluates a router across a coding-domain model pool [AAR §3]. Its architecture combines:

- measured per-dimension priors;
- retrieved historical neighbors;
- a small routing model plus rules;
- execution-grounded verification;
- memory of verified outcomes.

The reported ablations support two scoped conclusions: execution-grounded performance information improves routing on CodeRouterBench, and accumulated feedback can outperform static baselines on the evaluated streams [AAR Table 1]. The study does not establish that one router architecture, neighbor count, model size or regret magnitude transfers unchanged to other domains.

## 5. A production routing architecture

~~~text
INPUT:
    task context and consequence class
    qualified candidate set
    versioned performance priors
    current capacity, price and availability

1. Remove candidates that fail authorization, residency, capability or risk constraints.
2. Retrieve relevant, version-matched historical evidence.
3. Estimate utility and uncertainty for each remaining candidate.
4. Choose exploitation or bounded exploration under the safe policy.
5. Record selection probability before execution.
6. Execute with an effect ledger and global budget.
7. Verify the outcome; retain delayed/censored status when final truth is unavailable.
8. Update evidence only with provenance-preserving observations.
9. Trigger fallback or escalation according to typed failure and committed effects.

OUTPUT:
    verified outcome, routing evidence, propensity, costs and terminal state
~~~

The reference components are:

- **Admission gate:** deterministic constraints and qualified-risk classes.
- **Router:** estimates class-conditional utility and uncertainty.
- **Verifier:** produces execution-grounded or adjudicated feedback.
- **Experience store:** versioned task features, propensities, outcomes and provenance.
- **Recovery coordinator:** owns idempotency, committed effects, fallback and escalation.
- **Monitor:** detects performance drift, constraint violations and feedback delay.

For exact nearest-neighbor retrieval over $N$ experiences, query cost is $O(Nd)$ for embedding dimension $d$; approximate indexes reduce expected latency at the cost of recall and operational complexity. Which component dominates total cost—retrieval, model inference, tool execution, or verification—is workload- and implementation-dependent and must be measured.

## 6. Exploration, nonstationarity, and safe learning

Pure exploitation preserves blind spots. Unconstrained exploration can expose high-consequence tasks to unqualified models. A safe router explores only inside a set that already satisfies hard authority and risk requirements.

Standard contextual-bandit strategies include upper-confidence methods and Thompson sampling [LINUCB]. Their textbook guarantees assume reward and context conditions that production agent streams often violate. Important deviations include:

- **Cold start:** new models or task classes lack representative outcomes.
- **Delayed feedback:** correctness may be known minutes or days later.
- **Censoring:** humans repair an output before its untreated outcome is observed.
- **Nonstationarity:** model versions, prices, tools and task distributions drift.
- **Selection bias:** easy tasks accumulate abundant labels while escalated tasks remain sparse.
- **Adversarial context:** task metadata or retrieved history can manipulate the router.

Mitigations include exploration caps, shadow evaluation, randomized traffic only within qualified strata, time-decayed evidence, change-point alarms, version-specific priors and explicit “insufficient evidence” states.

## 7. Fallback and escalation as transactional control

**Fallback** substitutes a peer configuration after a typed failure such as provider unavailability, transport error or schema exhaustion. **Escalation** deliberately moves to a more capable, more expensive or human-controlled resource because uncertainty or consequence exceeds a threshold.

Before either transition, reconcile state:

1. assign an idempotency/effect identifier to every effectful action;
2. record proposed, admitted, started, committed and compensated states;
3. determine whether a timeout occurred before or after effect;
4. provide the successor with verified committed state, not the predecessor’s narrative;
5. prohibit replay of non-idempotent effects without reconciliation;
6. carry forward remaining global token, cost and time budgets.

Availability fallback is safe only among configurations qualified for the same task and risk class. If no such candidate exists, fail closed or escalate. Human escalation also has latency and error; reviewers should receive primary evidence—diffs, traces, validator results—not only a generated summary.

## 8. Measurement methodology

Report portfolio behavior by task and consequence stratum:

- verified utility and success;
- critical-failure upper confidence bound;
- cost per verified success;
- p50/p95/p99 latency;
- routing distribution and candidate coverage;
- exploration rate and constraint-violation rate;
- fallback frequency, duplicate-effect rate and reconciliation success;
- human-escalation rate, latency and adjudication outcome;
- feedback delay and censored-outcome fraction;
- off-policy value estimate with overlap diagnostics;
- drift by model, harness, tool and task version.

For offline full-information tests, run each candidate on matched tasks and report oracle regret with paired confidence intervals. For production bandit logs, retain selection propensities and use off-policy estimators. Never compare a deterministic old policy with a newly explored policy without accounting for selection bias.

## 9. Failure modes and limitations

- **Counterfactual blindness:** observed success is treated as proof of optimal routing.
- **Static-router rot:** task or model distributions drift while priors remain fixed.
- **Unsafe exploration:** a new model receives high-consequence tasks before qualification.
- **Propensity loss:** selection probabilities are not logged, preventing valid policy evaluation.
- **Feedback leakage:** model self-assessment replaces external outcome evidence.
- **Delayed-label corruption:** pending cases are counted as failures or omitted selectively.
- **Memory poisoning:** untrusted task content or stale versions contaminate experience.
- **Routing-share deletion:** a low current share is treated as proof that a model has no resilience or future-distribution value.
- **Fallback after partial effect:** work is duplicated because the router knows only request status.
- **Monoculture correlation:** apparent portfolio diversity relies on providers or models with shared failure modes.
- **Gateway centralization:** router outage or latency affects every task.

Quantitative AAR evidence is coding-specific. Verification is the hidden cost and may be weak outside executable domains. Bandit assumptions, business utility and human-escalation quality must be validated locally.

## 10. Production implications and connections

1. Build qualification, verification and provenance before optimizing the routing model.
2. Log selection propensities and delayed outcomes from the first production decision.
3. Explore only within a pre-qualified safe set; use shadow evaluation for candidates that are not yet qualified.
4. Treat oracle regret as a full-information evaluation metric, not a directly observed production KPI.
5. Version every experience by model, harness, tool, evaluator and policy.
6. Make fallback state-aware and effect-ledgered.
7. Retain a qualified default path, but measure its opportunity cost and correlated-failure behavior.

Topic 11 supplies offline priors; Topic 8 supplies calibrated risk features. Chapters 12 and 14 own human approval, gateway resilience and provider failover.

## Sources

[AAR] Agent-as-a-Router, arXiv:2606.22902 (Knowledge_source/2606.22902v3.pdf) §1, §3.1–3.3, eqs. 1–8
[CAL] Claude Agent SDK, “How the agent loop works” — https://code.claude.com/docs/en/agent-sdk/agent-loop
[FSC] Claude Fable 5 & Mythos 5 System Card (Knowledge_source/Claude Fable 5 & Claude Mythos 5 System Card.pdf)
[G56] GPT-5.6 Preview System Card (Knowledge_source/gpt-5-6-preview.pdf)
[BEA] Anthropic, “Building Effective Agents” — https://www.anthropic.com/engineering/building-effective-agents
[LINUCB] Li et al., “A Contextual-Bandit Approach to Personalized News Article Recommendation,” WWW 2010 — https://arxiv.org/abs/1003.0146
[DR] Dudík, Langford, and Li, “Doubly Robust Policy Evaluation and Learning,” ICML 2011 — https://arxiv.org/abs/1103.4601
