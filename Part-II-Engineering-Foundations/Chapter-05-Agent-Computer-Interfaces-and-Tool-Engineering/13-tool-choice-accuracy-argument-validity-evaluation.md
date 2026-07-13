# Topic 13 — Tool-Choice Accuracy and Argument-Validity Evaluation

## 1. Problem and objective

“Tool accuracy” is not one measurement. An agent can correctly decide that a tool is needed but choose the wrong tool, choose the correct tool with schema-invalid arguments, issue a schema-valid call with semantically wrong values, execute valid calls in the wrong order, violate policy, or reach the wrong state despite locally plausible calls.

The objective is a configuration-indexed, clustered evaluation that separates those surfaces while preserving end-to-end outcome measurement. It must cover no-call cases, single and parallel calls, multi-turn clarification, stateful execution, alternative valid strategies, policy correctness, repeated-run reliability, and uncertainty without treating correlated calls or runs as independent.

## 2. Intuition: score the failure boundaries separately

One end-to-end score answers whether the system completed the task; it does not say where reliability was lost. The evaluation therefore follows the execution chain: whether to call, which tool to call, whether arguments are structurally and semantically valid, whether the state transition is admissible, whether the sequence respects dependencies and policy, and whether the terminal outcome is correct. Local metrics diagnose; sequence success decides operational utility.

## 3. Rigorous analysis: evaluation unit and configuration

Let the frozen configuration be:

$$
c
\mathrel{=}
(m,p,\mathcal U,o,\Sigma,d,\delta,h,v,e),
$$

where $m$ is model snapshot, $p$ prompts, $\mathcal U$ tool set, $o$ presentation order, $\Sigma$ schemas, $d$ descriptions, $\delta$ decoding, $h$ harness policy, $v$ provider/SDK versions, and $e$ executor/environment version. A score without $c$ is not reproducible.

For task cluster $i\in\{1,\ldots,N\}$ and run $r\in\{1,\ldots,R_i\}$, record:

$$
\tau_{ir}^{(c)}
\mathrel{=}
(x_{ir,0},a_{ir,0},y_{ir,0},\ldots,x_{ir,T_{ir}}),
$$

including proposals, admitted and rejected calls, results, state transitions, clarifications, and terminal cause. The task—not an individual call—is the primary statistical cluster because calls within a trajectory share prompt, state, and failure causes.

Each task supplies an acceptability relation rather than one overfitted trace:

$$
\mathcal A_i(\tau,s_0,s_T)
\in
\{0,1\}.
$$

It can accept multiple tool choices, argument canonicalizations, partial orders, and final messages while rejecting prohibited effects.

## 4. Metric decomposition

### 4.1 Whether to call

Let $Y_i^{\mathrm{use}}=1$ when the task requires a tool and $\widehat Y_{ir}^{\mathrm{use}}=1$ when the run proposes at least one admitted call. Report the confusion matrix and:

$$
P_{\mathrm{use}}
\mathrel{=}
\frac{TP}{TP+FP},
\qquad
R_{\mathrm{use}}
\mathrel{=}
\frac{TP}{TP+FN},
$$

$$
S_{\mathrm{no\mbox{-}call}}
\mathrel{=}
\frac{TN}{TN+FP}.
$$

If a denominator is zero, the metric is undefined and its counts must be reported. Setting it to zero confounds “no evidence” with “all wrong.” No-call cases test abstention and relevance detection and cannot be omitted.

### 4.2 Tool selection

For call opportunity $j$, let $G_{ij}(H_{ij})\subseteq\mathcal U$ be acceptable tools given history $H_{ij}$. Then:

$$
Z_{ijr}^{\mathrm{sel}}
\mathrel{=}
\mathbb I\!\left[\widehat u_{ijr}\in G_{ij}(H_{ijr})\right].
$$

History indexing avoids penalizing valid alternative strategies. Report opportunity-weighted and task-weighted results. A task-weighted estimator is:

$$
\widehat A_{\mathrm{sel}}^{\mathrm{task}}
\mathrel{=}
\frac{1}{N}
\sum_{i=1}^{N}
\frac{1}{R_i}
\sum_{r=1}^{R_i}
\frac{1}{J_{ir}}
\sum_{j=1}^{J_{ir}}Z_{ijr}^{\mathrm{sel}}.
$$

Runs with $J_{ir}=0$ are excluded from this conditional metric and retained in no-call metrics.

### 4.3 Argument validity

Argument correctness has three nested layers:

$$
Z^{\mathrm{state}}
\subseteq
Z^{\mathrm{semantic}}
\subseteq
Z^{\mathrm{schema}}.
$$

- $Z^{\mathrm{schema}}$: serialization validates against the schema.
- $Z^{\mathrm{semantic}}$: values express acceptable intent after declared canonicalization.
- $Z^{\mathrm{state}}$: execution in current state satisfies preconditions and produces an admissible transition.

Strict structured generation can improve schema adherence, but it does not prove semantic or state validity. OpenAI documents strict-mode JSON Schema requirements such as required properties and `additionalProperties: false`; these concern structure, not value correctness [OFC, “Strict mode”].

Report semantic argument accuracy conditional on acceptable selection:

$$
\widehat A_{\mathrm{arg}\mid\mathrm{sel}}
\mathrel{=}
\frac{\sum Z^{\mathrm{sel}}Z^{\mathrm{semantic}}}
{\sum Z^{\mathrm{sel}}}.
$$

Also report unconditional joint-call accuracy:

$$
\widehat A_{\mathrm{joint-call}}
\mathrel{=}
\frac{\sum Z^{\mathrm{sel}}Z^{\mathrm{semantic}}Z^{\mathrm{state}}}
{N_{\mathrm{opportunities}}}.
$$

The conditional metric diagnoses argument construction; the joint metric preserves operational composition.

### 4.4 Multiple and parallel calls

Let $\mathfrak G$ be the family of acceptable gold call multisets for the turn and $P$ the predicted admitted multiset. For each $G\in\mathfrak G$, match calls by tool and semantic argument equivalence; choose the reference and maximum bipartite matching jointly:

$$
(G^*,M^*)
\mathrel{\in}
\arg\max_{G\in\mathfrak G,\,M\in\operatorname{Match}(G,P)}|M|.
$$

Then:

$$
P_{\mathrm{call-set}}
\mathrel{=}
\frac{|M^*|}{|P|},
\qquad
R_{\mathrm{call-set}}
\mathrel{=}
\frac{|M^*|}{|G^*|}.
$$

If $|P|=0$, precision is undefined; if $|G^*|=0$, recall is not applicable and the turn is a no-call case. Exact-set success requires $|M^*|=|P|=|G^*|$. Duplicates count separately. Parallel execution is correct only when dependencies permit it; ToolSandbox deliberately surfaces races when dependent tools run in parallel [TSB, §2.2].

### 4.5 Multi-turn sequence success

Let milestone DAG $D_i=(V_i,E_i)$ define required events and $B_i$ forbidden minefields. A trajectory succeeds when milestone matching respects a topological order, terminal predicates hold, and no minefield occurs:

$$
S_{ir}
\mathrel{=}
\mathbb I\!\left[
\operatorname{match}(D_i,\tau_{ir})=1
\land
\operatorname{goal}(s_{ir,T})=1
\land
\operatorname{minefield}(B_i,\tau_{ir})=0
\right].
$$

ToolSandbox provides trajectory-flexible milestone/minefield grading [TSB, §§2.2–2.3]. $\tau$-bench emphasizes interactive user-agent-tool conversations, policy adherence, and final database state [TAU, §§2–3]. Both complement AST matching.

### 4.6 Repeated-run reliability

For a fixed batch of $k$ runs per task:

$$
\widehat{\mathrm{pass}}^{,k}
\mathrel{=}
\frac{1}{N}\sum_{i=1}^{N}\prod_{r=1}^{k}S_{ir},
$$

$$
\widehat{\mathrm{pass@}}k
\mathrel{=}
\frac{1}{N}\sum_{i=1}^{N}
\mathbb I\!\left[\sum_{r=1}^{k}S_{ir}\geq1\right].
$$

The first measures tasks passed on all $k$ observed runs; the second, at least one. Neither scores calls as independent.

If $R>k$ exchangeable runs are available and subsets are sampled without replacement, finite-sample subset estimators are:

$$
\widehat p_i^{\mathrm{all},k}
\mathrel{=}
\frac{\binom{s_i}{k}}{\binom{R}{k}},
\qquad
\widehat p_i^{\mathrm{any},k}
\mathrel{=}
1-\frac{\binom{R-s_i}{k}}{\binom{R}{k}},
$$

where $s_i=\sum_{r=1}^{R}S_{ir}$ and $k\leq R$. Exchangeability must be justified by controlled seeds/order and a stable environment. $\tau$-bench introduced $\mathrm{pass}^{k}$ to expose inconsistency [TAU, §3.2].

## 5. Experimental methodology

1. Sample realistic task clusters, including no-call, missing-tool, missing-information, ambiguity, multi-tool, parallel-safe, parallel-unsafe, and policy-constrained cases.
2. Prefer final-state and invariant oracles; encode equivalence classes for valid paths.
3. Freeze and hash configuration $c$.
4. Repeat within task and restore exact environment snapshots between runs.
5. Aggregate within task, then across tasks. Bootstrap tasks—not calls—to obtain confidence intervals.
6. Compare $c_0$ and $c_1$ on matched tasks and seeds using paired task-level differences.
7. Stratify by no-call, tool family, effect class, call/turn count, parallelism, ambiguity, and policy.
8. Retain every terminal category, including timeout, partial success, outcome unknown, and evaluator error.

For paired task difference $D_i$:

$$
\widehat\Delta
\mathrel{=}
\frac{1}{N}\sum_{i=1}^{N}D_i.
$$

A cluster bootstrap resamples tasks with replacement while retaining every run and call within each sampled task. Report interval, task count, repeat count, and distribution of $D_i$.

## 6. Evaluation algorithm

```text
ALGORITHM EvaluateToolConfiguration(config, task_clusters, repeats):
    FreezeAndHash(config)
    records <- []

    FOR task IN task_clusters:
        oracle <- CompileAcceptabilityRelation(task)
        FOR repeat FROM 1 TO repeats:
            environment <- RestoreAndVerify(task.initial_snapshot)
            trajectory <- RunAgent(config, task.prompt, environment)
            calls <- ScoreSelectionArgumentsAndState(trajectory, oracle)
            terminal <- ScoreFinalStatePolicyMinefields(
                trajectory, environment, oracle)
            records.append((task.id, repeat, trajectory, calls, terminal))

    summaries <- AggregateWithinTask(records)
    estimates <- AggregateAcrossTasks(summaries)
    intervals <- ClusterBootstrap(summaries, resample_unit = TASK)
    RETURN estimates, intervals, records, HashesOfAllArtifacts()
```

Scoring is $O(C+M)$ for $C$ calls and $M$ indexed state/milestone checks. Bipartite matching is $O(n^3)$ for $n$ calls in a turn; bound $n$. Full-trace storage is $O(|\tau|)$ and is required for attribution.

## 7. Benchmark comparison

| Evaluation | Primary unit | Strength | Does not isolate by itself |
|---|---|---|---|
| BFCL V4 | single-turn, multi-turn, agentic categories | AST/executable calls, relevance, parallel/multiple calls, format sensitivity | deployment-specific policy and consequence |
| ToolSandbox | stateful interactive trajectory | state dependencies, user simulation, milestones/minefields | arbitrary live services |
| $\tau$-bench | user-agent-tool conversation | policy, final database state, $\mathrm{pass}^{k}$ | schema fuzzing and security adversaries |
| AgentDojo | adversarial stateful trajectory | benign utility, utility under attack, attack success | general ergonomics without attacks |
| Production suite | local deployment contract | exact tools, effects, policies, costs | external comparability without released artifacts |

BFCL V4 publishes category-level scores and a reproducible code/data checkpoint [BFCL]. Rankings remain model-, date-, prompt-, and harness-specific.

## 8. Failure modes

- Call-level pseudo-replication produces unjustifiably narrow intervals.
- A single gold path penalizes correct alternatives.
- Schema validity is mistaken for semantic correctness.
- Omitting no-call tasks rewards always-calling policies.
- Set flattening hides duplicate parallel calls.
- Final-answer-only grading hides duplicate writes and policy violations.
- Environment reset leakage correlates later runs.
- A model judge shares agent errors or follows injected output.
- Timeouts and evaluator errors disappear from denominators.

## 9. Limitations

Benchmark success transports only to deployments matching the task, state, tool, policy, and failure distributions. Updates require a new configuration identity.

## 10. Production implications

1. Keep selection, schema, semantic arguments, state, policy, and outcome metrics separate.
2. Gate writes on no-call specificity, duplicate-effect rate, minefields, and sequence success.
3. Preserve task clusters in uncertainty and use paired release comparisons.
4. Retain every terminal category and denominator.
5. Version data, oracles, executors, and reset snapshots with the model configuration.

## 11. Connections

- Topics 3–4 define the contracts measured here.
- Topic 11 adds duplicates, partial success, and compensation outcomes.
- Topic 12 supplies evidence provenance.
- Topic 14 generates adversarial cases.
- Topic 15 treats the tool set as an experimental factor.
- Chapter 13 generalizes release-gating methodology.

## Sources

[BFCL] Berkeley Function-Calling Leaderboard V4, methodology and category definitions — https://gorilla.cs.berkeley.edu/leaderboard

[TSB] Lu et al., “ToolSandbox,” §§2.2–2.3 and Appendix A.6 — https://arxiv.org/abs/2408.04682

[TAU] Yao et al., “$\tau$-bench,” §§2–3, especially §3.2 — https://arxiv.org/abs/2406.12045

[ADO] Debenedetti et al., “AgentDojo,” §§3.1 and 3.4 — https://arxiv.org/abs/2406.13352

[OFC] OpenAI, *Function calling*, “Parallel function calling” and “Strict mode” — https://developers.openai.com/api/docs/guides/function-calling
