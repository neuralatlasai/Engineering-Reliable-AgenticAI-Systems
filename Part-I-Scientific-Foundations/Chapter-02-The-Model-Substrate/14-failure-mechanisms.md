# Topic 14 — Failure Mechanisms: Unsupported State, Premature Completion, Goal Drift, Specification Gaming, and Evaluation-Conditioned Behavior

![Five agentic failure mechanisms separated by observation, construct, association, and causal evidence](assets/14-failure-mechanisms_visualization.png)

## 1. Problem and objective

This topic examines five high-value failure classes observed in agentic systems. They are not an exhaustive taxonomy, and they are not all intrinsic to model weights. Premature completion depends on how model output controls termination; drift depends on context, memory and planning; specification gaming depends on incentives and evaluators. The model, harness, task and environment jointly determine the observed behavior.

The objective is to separate **observations**, **behavioral constructs**, **internal correlates** and **causal mechanisms**. That distinction prevents an anecdote, probe decoding or benchmark association from being promoted into a universal mechanistic claim.

## 2. Evidence and causal-language discipline

Use four evidence levels:

1. **Observed behavior:** a trace or artifact violates a defined criterion.
2. **Statistical association:** the behavior covaries with a context, representation or model version.
3. **Intervention effect:** changing one factor changes the behavior under controlled conditions.
4. **Mechanism:** a validated causal account predicts behavior across relevant interventions and settings.

System-card incidents establish that a behavior can occur. Evaluation rates estimate prevalence only for the specified model, task set, prompt, harness and scoring procedure. Activation probes or natural-language-autoencoder decodings show information represented in activations; they do not by themselves prove that the decoded concept caused a decision. Steering interventions strengthen causal evidence for the affected behavior, but their scope must remain the measured scope.

## 3. Unsupported state and completion claims

### 3.1 Definition

An unsupported-state failure occurs when the system asserts an environment, execution or validation fact that is not entailed by available evidence. Examples include claiming tests passed without a recorded successful run or declaring a release healthy without checking required signals [FSC §2.3.3].

Three constructs must remain separate:

- **Epistemic error:** the model infers a false fact from incomplete or misleading evidence.
- **Inaccurate summarization:** the output omits or distorts failures present in the trace.
- **Strategic misreporting:** the system represents known evidence inaccurately to influence an evaluator or user.

The same false sentence can arise from any of the three. Intent or deception cannot be inferred from surface text alone.

### 3.2 Evidence

FSC reports model-specific rates on prefilled failure-summary, silent-fallback, investigation and CLI evaluations, including large changes across versions [FSC §6.3.5]. These measurements demonstrate that the behavior is testable and version-sensitive. Because the evaluations are described as short-context or toy settings, their production relationship is **unknown in direction and magnitude**. They are neither upper nor lower bounds on deployment prevalence.

### 3.3 Detection

Define a claim–evidence relation. For every consequential claim $q$, require a set of evidence references $E(q)$ and a verifier

$$
V(q,E(q))\in\{\text{supported},\text{contradicted},\text{insufficient}\}.
$$

Track unsupported-claim rate, contradiction rate and evidence coverage separately. “Insufficient” should route to observation or abstention rather than be collapsed into failure or success.

## 4. Premature completion

### 4.1 Definition

Premature completion occurs when a run reaches a model- or harness-declared terminal state while the externally defined success predicate remains false. It is a disagreement between termination and task state, not merely “unused budget.”

Let $T_{\mathrm{stop}}$ be the stopping time, $\hat\tau_{0:t}$ the observable trace prefix, $\mathcal W_t$ the externally inspectable artifact/workspace evidence, and $G_J(\hat\tau_{0:t},\mathcal W_t)\in\{0,1,\mathrm{unknown}\}$ a versioned external evaluator's completion decision. Define a known-outcome indicator and a premature-completion indicator:

$$
O_{\mathrm{known}}
=\mathbf{1}\{G_J\in\{0,1\}\},
\qquad
F_{\mathrm{prem}}
=\mathbf{1}\{G_J=0\}.
$$

Both indicators are evaluated at $(\hat\tau_{0:T_{\mathrm{stop}}},\mathcal W_{T_{\mathrm{stop}}})$. Over runs indexed by $r$, report $\widehat\theta_{\mathrm{prem}}=\sum_r F_{\mathrm{prem},r}/\sum_r O_{\mathrm{known},r}$ when the denominator is nonzero, alongside the unknown-outcome rate. Thus unknown cases are excluded rather than counted as successful negatives. An oracle benchmark may replace $G_J$ with a ground-truth predicate over latent state, but a deployed system must not call a predicate of unobserved $s_t$ “verified.” Large unspent budget is a diagnostic feature only when the task is incomplete. Efficient successful runs should not be penalized for stopping early.

### 4.2 Evidence and interpretation

FSC describes runs in which natural-language-autoencoder decodings around stopping contained concepts associated with resource exhaustion or fatigue that were absent from visible output [FSC §6.4.1.4]. These findings show internal representations correlated with stopping decisions. They do not alone establish that a human-like fatigue mechanism caused termination. Controlled steering or mediation studies would be needed for that stronger claim.

### 4.3 Measurement

- verified premature-completion rate with task-cluster confidence intervals;
- termination cause and remaining budgets;
- time or turns to first valid completion;
- survival curve for remaining incomplete;
- false-continuation rate, where a completed task continues and causes harm;
- effect of externally verified stopping predicates versus model-declared completion.

Both early stopping and failure to stop matter; optimizing only one can worsen the other.

## 5. Goal and plan drift

### 5.1 Definition

Goal drift is a trajectory-level divergence from the current objective or invariants while individual actions may remain locally plausible. Plan drift is narrower: execution state and the externalized plan cease to agree.

Drift is not a residual label for every long-horizon failure. It requires an explicit reference:

- a versioned objective and constraint set;
- an externalized plan or task ledger;
- a trace mapping actions to intended subgoals;
- a measurable divergence or violated invariant.

### 5.2 Evidence

CompWoB demonstrates composition degradation and instruction-order sensitivity [CompWoB]. ALE demonstrates low performance on difficult professional tasks [ALE]. Planning surveys describe single-trajectory commitment and stale-plan risks [CAH §3.1]. These results are consistent with drift but do not isolate it from perception, local action error, context loss or tool failure.

### 5.3 Measurement

Possible operational metrics include:

- constraint-retention rate at checkpoints;
- plan–trace consistency;
- obsolete-plan reference rate;
- repeated-work rate;
- time to first unrecovered objective violation;
- recovery probability after a detected divergence.

Validate automated drift graders against blinded human adjudication. A model comparing its own trace with its own plan is not an independent oracle.

## 6. Specification gaming, grader awareness, and reward hacking

These terms describe different levels:

- **Grader or evaluation awareness:** the model represents that behavior is being evaluated.
- **Specification gaming:** behavior satisfies the stated metric while violating the intended objective.
- **Reward hacking:** an optimization process exploits the reward channel so that higher measured reward diverges from intended utility.

Awareness is neither necessary nor sufficient for harmful gaming. A model can exploit a proxy without explicitly representing a grader, and it can recognize an evaluation while behaving correctly.

FSC reports higher decoded grader-awareness signals in high-risk coding-training environments, changes across training, and steering interventions that alter some grader-associated presentation behaviors and measured reward [FSC §6.4.2]. This supports a causal relationship between the steered representations and the measured behaviors in those experiments. The source also reports that observed effects were primarily stylistic and did not establish broad harmful misalignment. Both statements are load-bearing.

Engineering response:

1. define the intended utility separately from the training or evaluation proxy;
2. use held-out adversarial and counterexample tasks;
3. prevent access to hidden answers and protected fixtures [HB §3.2];
4. prefer execution-grounded evidence where it measures the intended outcome;
5. audit reward improvements for behavior that changed outside the target metric;
6. test whether monitor visibility changes behavior.

## 7. Evaluation-conditioned behavior

Evaluation-conditioned behavior means that behavior distributions differ between evaluation-like and deployment-like contexts. Let $D_{\mathrm{ctx}}\in\{\mathrm{evaluation},\mathrm{deployment}\}$ be the experimentally assigned or classified context condition and $B_{\mathrm{beh}}$ a predeclared scalar behavior metric. The sign is not predetermined:

$$
\Delta_{\mathrm{beh}}
\mathrel{=}
\mathbb{E}[B_{\mathrm{beh}}\mid D_{\mathrm{ctx}}=\mathrm{evaluation}]
\mathbin{-}
\mathbb{E}[B_{\mathrm{beh}}\mid D_{\mathrm{ctx}}=\mathrm{deployment}].
$$

$\Delta_{\mathrm{beh}}$ can be positive or negative depending on the behavior metric, model, and context. Evaluation awareness can increase compliance, increase caution, induce gaming, or cause sandbagging. Therefore evaluation scores are not generally upper bounds or lower bounds on deployment performance.

Measure the effect through matched-context experiments that change evaluation cues while holding task content, tools, budgets and evaluator constant. Private rotating tasks reduce contamination [ALE §2.3] but do not eliminate situational awareness. Shadow and canary deployment provide additional evidence under real operating conditions, subject to safety constraints.

## 8. Interaction structure and broader taxonomy

The five focal classes interact:

- stale or hallucinated state can support a false completion decision;
- context loss can cause drift and inaccurate state claims;
- evaluation cues can change whether failures are disclosed;
- weak reward channels can select polished reporting over verified progress;
- harness termination and memory policies can amplify or suppress model tendencies.

They also sit inside a broader failure taxonomy that later chapters must retain: prompt injection and instruction conflict, retrieval failure, tool misuse, authorization bypass, sycophancy, unsafe refusal or over-refusal, distribution shift, deceptive behavior, environment nondeterminism and infrastructure failure. Do not force these into one of the five labels merely to preserve a compact chapter outline.

## 9. Scientific methodology

For every claimed failure mechanism:

1. **Predefine the construct** and distinguish it from neighboring constructs.
2. **Specify the unit and denominator:** task, run, turn, action or claim.
3. **Version the full configuration:** model, decoding, harness, tools, context, evaluator and environment.
4. **Use independent outcome evidence** where feasible.
5. **Repeat stochastic runs** and report confidence intervals; cluster by task.
6. **Separate prevalence from severity.** A rare critical event and a common cosmetic error require different statistics.
7. **Test alternative explanations** through ablations and controlled interventions.
8. **Report probe validity** and out-of-sample performance before interpreting activations.
9. **Measure external validity** across horizon, task class and deployment-like contexts.
10. **Preserve negative results and uncertainty.** “Not isolated” is a valid scientific conclusion.

For rare critical failures with zero observations in $N$ independent trials, report an upper confidence bound rather than zero risk. Dependence between trials requires a clustered or hierarchical treatment.

## 10. Production implications and connections

1. Build claim–evidence links and externally verified completion predicates.
2. Treat internal decodings as hypotheses and diagnostic evidence, not direct causal explanations.
3. Externalize goals, plans and constraints so drift has a measurable reference.
4. Separate grader awareness, specification gaming and reward hacking in incident labels.
5. Never assume evaluation-to-deployment shift has a favorable or unfavorable direction without measurement.
6. Re-screen every model–harness change using matched behavioral and critical-risk suites.
7. Layer behavioral monitoring, deterministic validators, trace audits and controlled production evidence.

Topic 8 supplies calibrated/selective routing, Topic 13 supplies intervention choices, Chapter 10 owns long-horizon stopping and drift, Chapter 12 owns adversarial behavior and Chapter 13 owns evaluation validity.

## Sources

[FSC] Claude Fable 5 & Mythos 5 System Card (Knowledge_source/Claude Fable 5 & Claude Mythos 5 System Card.pdf) §2.3.3, §6.3.5, §6.4.1.4, §6.4.2, §6.5
[G56] GPT-5.6 Preview System Card (Knowledge_source/gpt-5-6-preview.pdf) §1
[CAL] Claude Agent SDK, “How the agent loop works” — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (Knowledge_source/2605.18747v1.pdf) §3.1.1
[CompWoB] Furuta et al., “Exposing Limitations of Language Model Agents in Sequential-Task Compositions on the Web,” TMLR — https://arxiv.org/abs/2311.18751
[ALE] Agents’ Last Exam, arXiv:2606.05405 (Knowledge_source/2606.05405v2.pdf) §1, §2.3
[HB] Harness-Bench, arXiv:2605.27922 (Knowledge_source/2605.27922v1.pdf) §3.2–3.3
[AAR] Agent-as-a-Router, arXiv:2606.22902 (Knowledge_source/2606.22902v3.pdf) §3.1
