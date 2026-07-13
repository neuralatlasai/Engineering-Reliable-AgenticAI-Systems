# Topic 15 — Why Adding Tools Can Reduce Performance

## 1. Problem and objective

Adding a tool expands the set of actions an agent could take. It does not follow that the deployed agent becomes more reliable. A new tool can consume context, overlap with existing tools, enlarge selection ambiguity, add arguments and failures, expose authority, and create opportunities for unnecessary calls.

The objective is to replace “more tools means more capability” with configuration-indexed marginal-utility analysis. There is no universal maximum tool count or context threshold. The right portfolio depends on task distribution, model, descriptions, schemas, discovery, prompt budget, runtime policy, and consequence model.

Anthropic reports that too many or overlapping tools can distract agents and that namespacing effects vary by model [ATE, “Choosing the right tools” and “Namespacing your tools”]. OpenAI documents deferred loading and tool search for large ecosystems [OTS]. These are design signals, not universal laws.

## 2. Intuition: capability coverage and decision quality trade off

A larger toolbox can make more tasks solvable while making the correct action harder to identify. The added tool is valuable only when its new coverage outweighs the context, confusion, execution, and risk it introduces across the full workload—including tasks that should never use it.

## 3. Rigorous analysis: net utility of a tool surface

For task distribution $\mathcal D$ and configuration $c$, define:

$$
J(\mathcal U;c)
\mathrel{=}
\mathbb E_{\xi\sim\mathcal D}
\left[
V(\tau;\xi)
-\lambda_T T(\tau)
-\lambda_L L(\tau)
-\lambda_C C(\tau)
-\lambda_R R(\tau)
\right],
$$

where $V$ is task value, $T$ token consumption, $L$ latency, $C$ compute or money, and $R$ consequence-weighted risk. Candidate $u$ is beneficial only when:

$$
\Delta_u J
\mathrel{=}
J(\mathcal U\cup\{u\};c_u)
-J(\mathcal U;c_0)
\mathrel{>}0
$$

under a controlled comparison. The marginal effect can be negative even when $u$ solves previously impossible tasks.

### 3.1 Coverage–execution decomposition

Let $K(\mathcal U)$ be the probability that an admissible strategy exists for a sampled task. Let $P_{\mathrm{exec}}(\mathcal U)$ be the conditional probability that the agent executes an acceptable strategy when one exists. By conditioning:

$$
\Pr(\text{success}\mid\mathcal U)
\mathrel{=}
K(\mathcal U)P_{\mathrm{exec}}(\mathcal U).
$$

Adding a tool cannot reduce set-theoretic strategy coverage if prior tools remain usable, so $K$ may rise or stay fixed. Yet $P_{\mathrm{exec}}$ can fall through ambiguity, interference, malformed arguments, unsafe paths, or changed planning. The product can decrease. No independence is assumed.

For a successful path, the exact chain rule remains:

$$
\Pr(Z_s\cap Z_a\cap Z_m\cap Z_e\cap Z_r\cap Z_v)
\mathrel{=}
\Pr(Z_s)
\Pr(Z_a\mid Z_s)
\Pr(Z_m\mid Z_s,Z_a)
\Pr(Z_e\mid Z_s,Z_a,Z_m)
\Pr(Z_r\mid Z_s,Z_a,Z_m,Z_e)
\Pr(Z_v\mid Z_s,Z_a,Z_m,Z_e,Z_r).
$$

A new tool can change every conditional factor. Single-tool accuracy does not identify portfolio reliability.

## 4. Mechanisms of degradation

### 4.1 Context cost

If directly exposed tool $u$ contributes $b_u$ tokens of name, description, schema, examples, and policy, explicit definition load is:

$$
B(\mathcal U)
\mathrel{=}
\sum_{u\in\mathcal U}b_u+b_{\mathrm{namespace}}.
$$

This is serialized size, not a linear performance model. Similar descriptions can interfere more than unrelated text; equal token counts need not impose equal difficulty. Tool results add trajectory-dependent context beyond $B$.

Deferred discovery replaces the full set with $D(x,H)\subseteq\mathcal U$. Its recall is:

$$
R_D
\mathrel{=}
\Pr\!\left[
G(x,H)\cap D(x,H)\neq\varnothing
\mid G(x,H)\neq\varnothing
\right],
$$

where $G(x,H)$ is the acceptable set. Discovery reduces direct context but introduces a new failure: the correct tool may never load. OpenAI’s tool-search guide provides the mechanism, not a guarantee of recall [OTS].

### 4.2 Selection ambiguity

Let $p(u\mid x,H,c)$ be a normalized distribution over callable tools and no-call. Selection entropy is:

$$
\mathcal H_U(x,H;c)
\mathrel{=}
-\sum_{u\in\mathcal U\cup\{\varnothing\}}
p(u\mid x,H,c)\log p(u\mid x,H,c).
$$

If log probabilities are unavailable, estimate frequencies from repeated runs and report uncertainty. High entropy can be legitimate when multiple tools are valid. A targeted diagnostic is the acceptable-to-best-invalid margin:

$$
M(x,H;c)
\mathrel{=}
\max_{u\in G(x,H)}p(u\mid x,H,c)
-\max_{v\notin G(x,H)}p(v\mid x,H,c).
$$

A small or negative margin identifies a confused boundary. Pairwise confusion should be stratified by overlapping purpose, namespace, effect class, and argument similarity.

The margin is defined only when $G(x,H)\neq\varnothing$ and at least one invalid alternative exists. No-call tasks require the specificity and false-call metrics from Topic 13 instead.

### 4.3 Namespace and semantic collision

Namespacing can separate services, but cannot repair indistinguishable purposes. Common collisions include:

- a high-level workflow tool overlapping low-level primitives;
- read and write tools separated by a weak verb;
- identical leaf names from different servers;
- migration aliases retained with replacements;
- similar schemas acting on different resource domains;
- a narrow local tool and a broad remote tool with different authority.

ToolSandbox includes distraction tools, scrambled names, and removed descriptions, enabling controlled tests of tool-surface dependence [TSB, §2.1].

### 4.4 Execution and risk surface

Every tool adds executor failures, schema evolution, authorization rules, result parsing, provenance, rate limits, and monitoring. Marginal risk is not proportional to count: one broadly authorized shell can dominate many narrow read-only tools. Conversely, one constrained task-level tool can reduce risk by replacing a fragile multi-call workflow. Evaluate consequences and state transitions, not endpoints.

### 4.5 A scoped empirical counterexample

Hasan et al. examined 856 tools across 103 MCP servers in arXiv v3. Their description augmentation improved median task success by 5.85 percentage points and partial goal completion by 15.12%, but increased execution steps by 67.46% and regressed performance in 16.67% of evaluated cases [MCP-SMELL, Abstract]. This is a workload- and version-specific result. It supports the narrower claim that adding description information can trade accuracy against execution cost and can harm some cases; it does not establish a universal optimum or threshold.

## 5. Experimental methodology

### 5.1 Matched portfolio ablation

Evaluate $\mathcal U$ and $\mathcal U\cup\{u\}$ on identical task clusters, states, seeds, budgets, and policy. Include:

1. tasks requiring $u$;
2. tasks served by an overlapping existing tool;
3. tasks unrelated to $u$;
4. tasks requiring no tool.

The first estimates coverage benefit; the others estimate interference and unnecessary-call cost. Randomize tool order within declared blocks and repeat runs. Report paired task-level changes in outcome, selection, semantic arguments, duplicates, policy violations, tokens, latency, and cost with cluster-bootstrap intervals.

### 5.2 Separate length from overlap

Use a factorial design crossing:

- short versus long descriptions;
- low versus high semantic overlap;
- direct exposure versus deferred discovery;
- namespaced versus collision-prone names.

Filler text is not a perfect length control because its semantics and token distribution differ from schemas. Interpret length effects only within carefully matched variants and report residual confounding.

### 5.3 Interaction effects

For tools $u$ and $v$, define:

$$
I_{u,v}
\mathrel{=}
J(\mathcal U\cup\{u,v\})
-J(\mathcal U\cup\{u\})
-J(\mathcal U\cup\{v\})
+J(\mathcal U).
$$

$I_{u,v}<0$ can reveal competition; $I_{u,v}>0$ can reveal complementarity. Portfolio utility is not generally submodular, so greedy addition has no universal optimality guarantee.

## 6. Portfolio-selection algorithm

```text
ALGORITHM SelectToolPortfolio(base_tools, candidate_tools, task_suite, budget):
    portfolio <- base_tools
    evidence <- EvaluateClustered(portfolio, task_suite)

    WHILE budget.allows_experiment:
        candidates <- []
        FOR tool IN candidate_tools - portfolio:
            delta <- PairedClusteredAblation(
                control = portfolio,
                treatment = portfolio UNION {tool},
                strata = [requires_tool, overlap, unrelated, no_call])
            candidates.append((tool, delta))

        admissible <- FilterBySafetyAndMinimumCoverage(candidates)
        best <- ArgMaxLowerConfidenceBound(admissible, objective = J)

        IF best lacks a deployment-relevant positive margin: BREAK

        portfolio <- portfolio UNION {best.tool}
        candidate_tools <- candidate_tools - {best.tool}

        FOR prior IN HighOverlapNeighbors(best.tool, portfolio):
            MeasurePairwiseInteraction(prior, best.tool, task_suite)

        evidence <- ReevaluateClustered(portfolio, task_suite)

    RETURN portfolio, evidence, DeferredDiscoveryPlan(portfolio)
```

For $m$ candidates, exhaustive subset selection needs $O(2^m)$ evaluations. Sequential add-one evaluation is $O(m^2)$ in the worst case plus selected interactions, but is heuristic because higher-order combinations can be missed. Model/executor runs dominate cost.

## 7. Failure modes

- Capability-only acceptance ignores regressions on unrelated and no-call tasks.
- An arbitrary tool-count limit replaces measurement.
- Averages hide critical failures or broad small regressions.
- Model or prompt drift is attributed to the tool addition.
- Every backend endpoint is exposed without agent-level affordance design.
- Deprecated aliases remain callable with replacements.
- Deferred loading is credited without measuring recall.
- Namespaces mask semantic overlap and incompatible effects.
- Greedy selection ignores higher-order interactions.

## 8. Limitations

Entropy and margins are diagnostics, not causal explanations. Providers may not expose selection probabilities, making repeated sampling costly. Context effects vary across snapshots and layouts. Production tasks drift, so a previously beneficial portfolio can become harmful.

No benchmark identifies one globally optimal tool set. The target is a versioned portfolio that is Pareto-acceptable for a declared workload, authority model, and cost envelope.

## 9. Production implications

1. Treat the callable tool surface as a versioned release artifact.
2. Require matched evidence for additions, removals, aliases, namespace changes, description rewrites, and discovery changes.
3. Prefer semantically distinct task-level tools when they preserve control and observability.
4. Use allowed subsets, routing, namespaces, or discovery to reduce active candidates, then measure the router boundary.
5. Remove obsolete tools after migration telemetry rather than retaining permanent aliases.
6. Monitor no-call specificity, confusion, discovery recall, context tokens, redundant calls, and consequence-weighted failures.

## 10. Connections

- Topics 3–4 determine schema size and semantic separability.
- Topic 6 provides namespace and discovery controls.
- Topic 7 controls result-side context growth.
- Topic 13 supplies clustered metrics.
- Topic 14 supplies insertion, collision, order, and description tests.
- Chapter 6 treats context allocation; Chapter 13 governs releases.

## Sources

[ATE] Anthropic, *Writing effective tools for agents — using AI agents*, “Choosing the right tools,” “Namespacing your tools,” and “Running an evaluation” — https://www.anthropic.com/engineering/writing-tools-for-agents

[OTS] OpenAI, *Tool search*, deferred loading and namespaces — https://developers.openai.com/api/docs/guides/tools-tool-search

[OFC] OpenAI, *Function calling*, “Tool search,” “Tool choice,” and “Allowed tools” — https://developers.openai.com/api/docs/guides/function-calling

[TSB] Lu et al., “ToolSandbox,” §2.1 and Appendix A.2.1 — https://arxiv.org/abs/2408.04682

[BFCL] Berkeley Function-Calling Leaderboard V4, relevance, parallel/multiple, multi-turn, and format categories — https://gorilla.cs.berkeley.edu/leaderboard

[MCP-SMELL] Hasan et al., “Model Context Protocol (MCP) Tool Descriptions Are Smelly!,” arXiv:2602.14878v3, Abstract — https://arxiv.org/abs/2602.14878v3
