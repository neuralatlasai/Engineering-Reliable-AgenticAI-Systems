# Topic 1 — The Agent-Computer Interface as a First-Class Design Object

## 1. Problem and objective

An agent-computer interface (ACI) is the typed, governed boundary through which a model proposes computer-mediated operations and receives evidence about their effects. It is not merely a list of function signatures. It includes discovery, model-visible semantics, data contracts, admission policy, executor placement, effect classification, identity and authority, retry behavior, result provenance, and verification.

The engineering objective is to make every transition from model intent to environmental effect explicit and independently observable. For a proposed action at step $t$, this chapter retains the book-level path

$$
Y_t \longrightarrow \Xi_t \longrightarrow \widetilde A_t \longrightarrow A_t,
$$

where $Y_t$ is model output, $\Xi_t$ is the typed candidate-action set recovered from that output, $\widetilde A_t$ is the deterministically admitted set, and $A_t$ is the set actually executed. A well-designed ACI prevents parser success or admission from being misreported as a successful real-world operation.

## 2. Intuition

Conventional APIs assume that a program selects an endpoint deliberately and supplies arguments under programmer control. An ACI serves a probabilistic caller. The caller may select the wrong operation, construct a schema-valid but nonsensical argument, misunderstand authorization, or interpret an error as success. The interface must therefore help the model choose correctly while ensuring that correctness and safety never depend on the model's interpretation alone.

The useful analogy is an aircraft control surface, not a bag of utilities. The model can propose control inputs; an independent system defines the flight envelope, checks admissibility, actuates hardware, and measures the resulting state. Clear language improves proposal quality. Deterministic gates bound what proposals can become effects.

## 3. Formal contract and reliability decomposition

For tool $u \in \mathcal U_c$, use the chapter contract

$$
u = \bigl(n_u,d_u,\Sigma_u^{\mathrm{in}},\Sigma_u^{\mathrm{out}},e_u,\chi_u,\iota_u,\alpha_u,\phi_u\bigr).
$$

The fields denote name, description, input schema, output schema, executor placement, effect/risk class, retry and idempotency contract, authorization and ownership policy, and provenance/freshness contract. This tuple is a synthesis: no single provider surface necessarily exposes every field [OFC; MCP; ADK-T]. Missing fields still exist operationally; they have merely become implicit.

Let $x$ be the parsed arguments, $p$ the authenticated principal, $s$ the authoritative pre-state, and $q$ the request context. Define six distinct predicates or outcomes:

$$
V_{\mathrm{syn}}(x,\Sigma_u^{\mathrm{in}}),\quad
V_{\mathrm{sem}}(u,x,s),\quad
G_{\mathrm{auth}}(p,u,x,s,q),\quad
E_u(x,s),\quad
O_u,\quad
V_{\mathrm{post}}(u,s,O_u).
$$

- $V_{\mathrm{syn}}$ checks structural conformance: required fields, types, bounds, and supported schema keywords.
- $V_{\mathrm{sem}}$ checks domain meaning: the account exists, the date interval is coherent, and the transition is legal in the current state.
- $G_{\mathrm{auth}}$ decides whether principal $p$ may perform this exact operation on these exact resources.
- $E_u$ is the executor's attempt, which can fail before, during, or after an external side effect.
- $O_u$ is the typed outcome evidence, not a free-form declaration of success.
- $V_{\mathrm{post}}$ verifies the claimed postcondition against authoritative evidence.

For events $Z_s,Z_a,Z_m,Z_e,Z_r,Z_v$ defined in the scope, end-to-end success follows the exact chain rule:

$$
\Pr\!\left(\bigcap_{j \in \{s,a,m,e,r,v\}} Z_j\right)
\mathrel{=}
\Pr(Z_s)\Pr(Z_a\mid Z_s)\Pr(Z_m\mid Z_s,Z_a)\Pr(Z_e\mid Z_s,Z_a,Z_m)\Pr(Z_r\mid Z_s,Z_a,Z_m,Z_e)\Pr(Z_v\mid Z_s,Z_a,Z_m,Z_e,Z_r).
$$

This factorization assumes no independence. It prevents a high schema-conformance score from concealing poor tool selection, policy compliance, state-transition correctness, or verification.

## 4. Detailed concept analysis

### 4.1 Two coupled interfaces

An ACI has a **model-facing interface** and an **executor-facing interface**.

| Model-facing concern | Executor-facing concern |
|---|---|
| Discoverability and tool selection | Registry identity and version resolution |
| Names, descriptions, examples | Input parsing and canonicalization |
| Argument construction | Semantic validation and policy admission |
| Result interpretation | Execution, evidence capture, and error typing |

The first side raises the probability of a good proposal. The second side decides whether a proposal is allowed to affect the environment. A description such as "requires manager approval" is useful model context, but it is not an approval mechanism.

### 4.2 Placement and abstraction are orthogonal

Executor placement $e_u$ answers **where the operation runs and whose credentials it uses**. Abstraction level $\ell_u$ answers **what unit of work the model sees**. They are independent dimensions.

| Abstraction exposed to the model | Possible executor placements |
|---|---|
| Primitive function, such as `read_object` | Application process, local host, remote service, or provider |
| Protocol tool, such as an MCP tool | Local or remote MCP server |
| Hosted capability, such as web search | Model provider infrastructure |
| Composite workflow, such as `close_incident` | Application service, workflow engine, or remote platform |
| Agent-as-a-tool | Same process, isolated worker, or remote agent service |

Calling an operation "remote" says nothing about whether it is primitive or composite. Calling it a "function" says nothing about where it executes. Conflating these axes obscures authority, latency, failure ownership, and evidence location.

### 4.3 Results are observations, not truth

A tool result is an observation emitted by an executor. It can be stale, incomplete, forged by an untrusted server, inconsistent with external state, or ambiguous about partial success. MCP permits structured and unstructured results and explicitly requires clients to treat annotations as untrusted unless the server is trusted [MCP]. Consequently, result schemas and provenance improve interpretability but do not prove correctness.

A production result envelope should distinguish at least:

```text
status: succeeded | failed | partial | indeterminate
effect_committed: true | false | unknown
data: typed payload or absence
error: typed failure or absence
evidence: resource version, receipt, query basis, and timestamp
retry: safe | unsafe | conditional
```

`indeterminate` is essential. A timeout after dispatch does not establish that no effect occurred.

### 4.4 The interface is part of the policy surface

The exposed tool set $\mathcal U_c$ is a configuration-indexed capability boundary. Least privilege begins by withholding irrelevant tools, not merely by asking the model not to use them. Per-call admission must then bind principal, operation, arguments, target resource, current state, and approval evidence. This remains true when a provider offers strict schema generation: schema validity concerns syntax, not authorization or effect safety [OFC].

## 5. Methodology: specifying and reviewing an ACI

1. **Identify state transitions.** Start from authoritative resources and desired transitions, not from convenient SDK methods.
2. **Choose semantic granularity.** Expose the smallest operation that is independently understandable, enforceable, and verifiable; avoid both byte-level primitives and opaque mega-tools.
3. **Assign executor placement.** Record process, network boundary, credentials, trust domain, and resource ownership.
4. **Define input and output contracts.** Use bounded schemas, stable identifiers, units, null semantics, explicit error variants, and provenance fields.
5. **Classify effects.** Record read/write scope, reversibility, idempotency, externalities, maximum impact, and required approvals.
6. **Implement deterministic admission.** Validate syntax, semantics, authorization, quotas, freshness, and approval binding before dispatch.
7. **Specify outcome evidence.** Define what the executor can prove and what requires an independent read-back.
8. **Test each boundary separately.** Measure selection, argument conformance, semantic validity, policy decisions, execution outcomes, interpretation, and verification.
9. **Version the contract.** Pin schema and semantic versions; reject silent drift between model-visible declarations and executor behavior.

## 6. Reference admission and execution algorithm

```text
PROCEDURE InvokeTool(proposal, principal, request_context):
    parsed <- ParseStructuredProposal(proposal)
    IF parsed is invalid:
        RETURN Rejected(stage="syntax", reason=parsed.error)

    contract <- Registry.Resolve(parsed.tool_name, parsed.contract_version)
    IF contract is absent:
        RETURN Rejected(stage="selection", reason="unknown tool or version")

    syntax <- ValidateSchema(parsed.arguments, contract.input_schema)
    IF syntax is invalid:
        RETURN Rejected(stage="syntax", reason=syntax.error)

    canonical_args <- Canonicalize(parsed.arguments, contract.canonicalization)
    pre_state <- ReadAuthoritativePreState(contract, canonical_args)

    semantics <- ValidateSemantics(contract, canonical_args, pre_state)
    IF semantics is invalid:
        RETURN Rejected(stage="semantics", reason=semantics.error)

    decision <- Authorize(principal, contract, canonical_args,
                          pre_state, request_context)
    IF decision is not ALLOW:
        RETURN Rejected(stage="authorization", reason=decision)

    attempt <- ExecuteOnce(contract, canonical_args, decision.capability)
    outcome <- NormalizeTypedOutcome(attempt, contract.output_schema)

    verification <- VerifyPostcondition(contract, pre_state, outcome)
    RETURN InvocationRecord(contract, canonical_args, decision,
                            outcome, verification)
```

For a fixed schema, bounded inputs, linear-time parsing and canonicalization, schema keywords with linear aggregate cost, and $R$ indexed authorization checks, local control-path time is $O(B+R)$ for $B$ input bytes, excluding external I/O. Space is $O(B)$ unless validation streams. General validators can be superlinear because of `uniqueItems`, combinators, or backtracking regular expressions; production schemas must bound those costs explicitly. Remote latency and executor work usually dominate wall-clock cost. Revalidation after retries is mandatory because authorization and pre-state may have changed.

## 7. Limitations and assumptions

- The contract tuple cannot eliminate incorrect or adversarial implementations behind the interface.
- Postcondition verification may be delayed, expensive, eventually consistent, or impossible for irreversible externalities.
- A single effect class can be too coarse when arguments change impact; `transfer(amount=1)` and `transfer(amount=1000000)` need parameter-sensitive policy.
- Provider-side tools may not expose enough executor evidence to reproduce every internal decision.
- Formal predicates require an authoritative source of identity, state, time, and policy; weak sources weaken the guarantee.

## 8. Failure modes

| Failure | Why it survives superficial validation | Required control |
|---|---|---|
| Correct schema, wrong tool | Arguments conform to the selected tool | Selection evaluation and semantic preconditions |
| Correct tool, wrong resource | Resource identifier is syntactically valid | Ownership and authorization check on canonical identity |
| Description treated as policy | The model usually follows the prose | Deterministic gate outside the model |
| Timeout replay duplicates an effect | Caller did not observe completion | Idempotency key, receipt lookup, and indeterminate state |
| Executor claims success without effect | Result object is well formed | Independent postcondition or authoritative receipt |
| Tool version drifts silently | Name remains unchanged | Version pin, schema digest, and conformance tests |
| Untrusted result redirects the agent | Tool output contains instructions | Provenance label and untrusted-content isolation |

## 9. Production implications

- Log one immutable invocation record containing contract version, canonical argument digest, principal, policy decision, executor attempt, typed outcome, and verification status.
- Emit separate service-level indicators for rejection rate, semantic invalidity, authorization denial, executor failure, indeterminate completion, and postcondition failure.
- Store secrets and ambient credentials outside model-visible arguments. Mint attenuated, short-lived capabilities after authorization.
- Default deny on unknown contract versions, malformed outcomes, absent ownership evidence, and stale approvals.
- Treat tool-definition changes like API changes: code review, migration tests, canary deployment, and rollback.

## 10. Connections

- **Chapter 1:** the ACI operationalizes the proposal-to-action distinction and exposes the conditional factors in end-to-end reliability.
- **Chapter 2:** structured prediction produces $\Xi_t$; it does not establish semantic validity or execution success.
- **Chapter 3:** the harness owns admission, lifecycle, telemetry, and deterministic invariants around the ACI.
- **Chapter 4:** provider APIs transport tool declarations and call/result items; the application still owns semantics not guaranteed by the provider.
- **Later in Chapter 5:** Topics 3-5 refine schemas, semantic affordance, and effect classification; Topics 10-12 refine enforcement and evidence.

## Primary sources

- [OpenAI, Function calling](https://developers.openai.com/api/docs/guides/function-calling) [OFC].
- [Anthropic, How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works).
- [Model Context Protocol, Tools specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP].
- [Google ADK, Custom tools](https://adk.dev/tools-custom/) [ADK-T].
