# Topic 4 — Semantic Affordance

## 1. Problem and objective

Semantic affordance is the extent to which a tool's model-visible contract makes the correct operation, argument meanings, preconditions, and result interpretation inferable from task context. It is created by the tool's name, namespace, description, parameter names, parameter descriptions, examples, result fields, and error semantics.

The objective is to raise correct selection and argument construction without confusing model guidance with enforcement. Semantic affordance influences the proposal distribution; schema validation, authorization, execution controls, and postcondition verification remain deterministic runtime responsibilities.

## 2. Intuition

An interface designed for a human developer can still be hostile to an agent. `get`, `run`, or `execute` may be familiar inside one codebase but carry little meaning when dozens of tools compete in context. Cryptic resource IDs, overloaded parameters, and raw backend payloads force the model to spend reasoning capacity reconstructing semantics that the tool author already knows.

A useful tool tells the model what operation it performs, when it should and should not be used, what each argument means, what it returns, and how failures should guide the next decision. It does not claim authority through prose. The executor must still reject a beautifully described but unauthorized call.

## 3. Formalization and evaluation

Let $q$ be a task context, $D=\{d_u:u\in\mathcal U_c\}$ the visible descriptions, and $\hat u$ the model-selected tool. A direct empirical selection metric is

$$
S_{\mathrm{sel}}(D) = \Pr(\hat u=u^*\mid q,D),
$$

where $u^*$ is the unique task-appropriate tool for this evaluation subset. Tasks permitting no call, several equivalent tools, tool sets, or valid orderings require set- or trace-level oracles instead. A description intervention $D\rightarrow D'$ has estimated effect

$$
\widehat\Delta_{\mathrm{sel}} = \widehat S_{\mathrm{sel}}(D')-\widehat S_{\mathrm{sel}}(D).
$$

The difference is causal only under an experiment that holds model snapshot, task distribution, tool availability, ordering, decoding configuration, and executor behavior constant while randomizing or counterbalancing the description variant.

A broader score may be defined as a book-level synthesis:

$$
S_{\mathrm{aff}} = w_s S_{\mathrm{sel}} + w_a S_{\mathrm{arg}} + w_r S_{\mathrm{result}} - w_h H_{\mathrm{hall}} - w_c C_{\mathrm{ctx}},
$$

where the nonnegative weights sum to one over normalized components. $S_{\mathrm{arg}}$ measures semantic argument correctness, $S_{\mathrm{result}}$ correct result use, $H_{\mathrm{hall}}$ nonexistent-tool or field hallucination, and $C_{\mathrm{ctx}}$ context cost. This is an evaluation design, not a universal standard; weights must reflect deployment consequences.

Semantic similarity between tools is not itself an error, but high overlap can create selection ambiguity. On cases with a unique reference tool in the pair $(u,v)$, track the empirical confusion rate

$$
C_{u,v} = \frac{N(\hat u=v,u^*=u)+N(\hat u=u,u^*=v)}{N(u^*=u)+N(u^*=v)}.
$$

The denominator requires at least one labeled case for either tool; otherwise the pair is not evaluated.

## 4. Detailed concept analysis

### 4.1 Names express stable semantic boundaries

A name should encode the resource and action at the level the model must distinguish. `jira_issues_search` and `asana_tasks_search` expose service, resource, and action more clearly than two tools called `search`. Anthropic reports that namespacing and the choice of prefix versus suffix can materially affect its tool-use evaluations, with effects varying by model [ATE]. This is empirical guidance to test, not a guarantee that one naming convention dominates.

Names should remain stable across implementation refactors. Do not encode a transient hostname, framework class, or internal database table unless it changes user-visible semantics. Avoid near-synonyms such as `fetch_user`, `get_user`, and `read_user` unless their contracts differ in a way the description can make operationally clear.

### 4.2 Descriptions define decision boundaries

A decision-useful description answers:

- **Purpose:** what state or information the tool produces.
- **Use boundary:** when this tool is appropriate and which neighboring tool is not.
- **Required context:** identifiers, units, freshness, and preconditions.
- **Effect:** whether it reads, writes, triggers external communication, or delegates.
- **Result semantics:** what counts as success, absence, partial completion, and uncertainty.

Descriptions should not reproduce implementation details that do not affect model decisions. Nor should they contain mutable authorization policy that belongs in the policy engine. A sentence such as "use only for administrators" can guide selection, but `G_{\mathrm{auth}}$ must derive the principal's role from authenticated context and enforce it.

### 4.3 Parameter names carry semantic type information

`amount_minor`, `expected_resource_version`, and `max_results` are stronger affordances than `amount`, `version`, and `limit`. Parameter descriptions should state units, canonical forms, inclusivity of ranges, null meaning, and whether a value comes from user input or prior tool evidence.

Do not ask the model to supply fields the runtime already knows. Tenant, authenticated user, current trace ID, and ambient locale usually belong in trusted invocation context. Removing these fields reduces both ambiguity and confused-deputy risk.

### 4.4 Examples teach shape and policy-relevant distinctions

Examples are useful when they disambiguate a non-obvious union, identifier format, time boundary, or neighboring tool. They can also overfit the model toward literal values or mask an incomplete description. Every example should be schema valid, semantically coherent, free of secrets or personal data, and paired with boundary tests.

Negative examples can clarify "do not use for..." boundaries, but long catalogs consume context and can introduce prompt injection-like text into a high-trust location. Keep examples minimal and version controlled.

### 4.5 Result affordance controls the next decision

The result is part of the interface. Raw API payloads often contain cryptic IDs, irrelevant metadata, and large nested objects. Anthropic reports better agent behavior when tools return high-signal context and resolve arbitrary identifiers into semantically meaningful representations [ATE].

Return enough evidence for the next decision, not the entire backend response. Preserve stable machine identifiers alongside human-readable labels when later calls require exact identity. Distinguish `not_found`, `empty_result`, `denied`, `rate_limited`, `partial`, and `indeterminate`; flattening them into text such as "no data" creates incorrect recovery behavior.

### 4.6 Affordance is not syntactic validity

A description can lead the model to the correct fields while the resulting JSON remains malformed. Conversely, constrained decoding can guarantee a valid shape while the selected resource is wrong. Measure these events separately:

1. correct tool selected;
2. arguments syntactically valid;
3. arguments semantically valid;
4. action authorized;
5. executor completed with a typed outcome;
6. result correctly interpreted;
7. claimed effect verified.

### 4.7 Affordance is not authority

MCP annotations such as read-only or destructive hints are advisory and must be treated as untrusted unless the server is trusted [MCP]. Even trusted metadata should feed a local admission decision rather than bypass it. A model-visible description, annotation, or tool name cannot prove user consent, resource ownership, or current policy.

## 5. Methodology: affordance optimization as an experiment

1. **Construct a representative task set.** Include common cases, rare boundaries, abstention cases, adversarial instructions, and pairs of confusable tools.
2. **Define stage-specific labels.** Label the correct tool, canonical arguments, valid alternatives, forbidden actions, and expected result use.
3. **Establish a frozen baseline.** Pin model snapshot, prompt, tool order, decoding settings, schemas, and executor fixtures.
4. **Diagnose traces.** Separate selection, argument, policy, execution, and interpretation errors before editing text.
5. **Change one semantic factor.** Test a name, namespace, decision-boundary sentence, parameter name, example, or result field independently where possible.
6. **Counterbalance ordering.** Rotate tool order and description variants to avoid positional confounds.
7. **Measure utility and cost.** Report task success, confusion matrix, syntax and semantic validity, hallucinated tools, calls per task, tokens, latency, and uncertainty intervals.
8. **Run regression and adversarial suites.** A change that improves common selection may worsen abstention or high-impact cases.
9. **Promote with a semantic version.** Update declarations, executor expectations, tests, and documentation atomically.

## 6. Reference affordance-review algorithm

```text
PROCEDURE ReviewToolSurface(tools, labeled_tasks, frozen_runtime):
    ASSERT EveryToolHasDistinctResourceActionName(tools)
    ASSERT NoToolAcceptsAuthenticatedIdentityAsModelArgument(tools)
    ASSERT EveryParameterStatesUnitsAndNullMeaning(tools)
    ASSERT EveryWriteToolStatesEffectWithoutClaimingAuthorization(tools)
    ASSERT EveryOutcomeHasTypedStatusAndRetryMeaning(tools)

    baseline <- EvaluateByStage(tools, labeled_tasks, frozen_runtime)
    confusions <- BuildToolConfusionMatrix(baseline)

    FOR each high-impact confusion pair (u, v):
        hypothesis <- IdentifyMissingDecisionBoundary(u, v)
        candidate <- ChangeOneAffordance(tools, hypothesis)
        result <- CounterbalancedEvaluation(candidate, labeled_tasks,
                                            frozen_runtime)
        IF result improves preregistered utility
           AND result passes safety regressions:
            tools <- candidate

    RETURN tools, EvaluationReport()
```

For $E$ total recorded events or calls across $N$ trials, collecting stage metrics is $O(E)$; this reduces to $O(N)$ only when each trial has a fixed bounded horizon. A dense confusion matrix occupies $O(K^2)$ space for $K$ tools, while a sparse map occupies $O(M)$ for $M$ observed confusion pairs. Model inference and tool execution dominate wall-clock cost. Evaluate with bounded task inputs and deterministic fixtures where causal attribution is the goal.

## 7. Limitations and assumptions

- Description effects are model-, language-, prompt-, and task-distribution-dependent.
- Natural-language semantics cannot eliminate pragmatic ambiguity or distribution shift.
- Offline fixtures may omit latency, permissions, stale data, and partial failure present in production.
- A single weighted affordance score can conceal severe regressions; always retain disaggregated metrics and high-impact strata.
- Longer descriptions may improve one decision while increasing context cost and competition among tools.

## 8. Failure modes

| Failure | Mechanism | Control |
|---|---|---|
| Vague names | Multiple tools appear interchangeable | Resource-action names and pairwise confusion tests |
| Overlapping mega-tools | Same request matches several broad descriptions | Split along stable semantic and policy boundaries |
| Prose as authorization | Model instruction is mistaken for a gate | Independent authenticated policy engine |
| Cryptic identifiers | Model copies or invents wrong resource IDs | Label plus stable ID and validated discovery flow |
| Raw backend result | Model misses the relevant field or error | High-signal typed result envelope |
| Example overfitting | Literal example values leak into calls | Diverse boundary tests and minimal examples |
| Description drift | Model sees semantics executor no longer implements | Versioned declaration generated with conformance tests |

## 9. Production implications

- Maintain a tool confusion matrix segmented by model snapshot, language, tenant policy, and task family.
- Log declaration version and schema digest with every invocation so regressions can be attributed.
- Review tool text as production code: ownership, tests, change history, canarying, and rollback.
- Keep high-impact tools semantically distinct and unavailable by default when irrelevant to the current task.
- Treat executor errors as part of the model-facing API; stable typed errors enable safe repair and abstention.

## 10. Connections

- Topic 1 defines the deterministic boundary that semantic affordance must never replace.
- Topic 3 constrains argument shape; this topic improves selection and semantic construction within that shape.
- Topic 5 supplies effect vocabulary that descriptions should communicate and policy must enforce.
- Topic 6 will reduce ambiguity through discovery, deferred loading, and namespaces.
- Topics 13-15 will evaluate affordance, fuzz descriptions, and analyze tool-surface saturation.

## Primary sources

- [Anthropic, Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) [ATE].
- [Anthropic, Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).
- [OpenAI, Function calling](https://developers.openai.com/api/docs/guides/function-calling) [OFC].
- [Model Context Protocol, Tools specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP].
- [Berkeley Function-Calling Leaderboard V4](https://gorilla.cs.berkeley.edu/leaderboard) [BFCL].
