# Topic 3 — Tool-Schema Design

## 1. Problem and objective

A tool schema maps an open-ended model output into a bounded data structure that an executor can validate and interpret. Good schemas reduce malformed arguments and ambiguity. They do not establish domain correctness, authorization, successful execution, or outcome correctness.

The objective is to design $\Sigma_u^{\mathrm{in}}$ and $\Sigma_u^{\mathrm{out}}$ so that:

- the model can construct the intended value with low ambiguity;
- a validator can reject structurally invalid values deterministically;
- semantic and policy checks receive canonical, typed inputs;
- executors return exhaustive, machine-actionable outcomes;
- schema evolution is explicit and testable.

## 2. Intuition

A schema is a grammar for data, not a proof about the world. The object

```json
{"source_account": "A", "destination_account": "A", "amount_minor": 5000}
```

can be perfectly well typed while violating a business rule. It can also be semantically meaningful but unauthorized for the current principal. If the executor times out, neither property reveals whether the transfer committed.

Schema design should therefore make illegal representations difficult, then pass every accepted representation through independent semantic, authorization, execution, outcome, and verification stages.

## 3. Relevant equations and invariants

Let $\mathcal X_u$ be the universe of parsed JSON-like inputs and let

$$
L(\Sigma_u^{\mathrm{in}}) = \{x \in \mathcal X_u : V_{\mathrm{syn}}(x,\Sigma_u^{\mathrm{in}})=1\}
$$

be the language admitted by the input schema. The semantically valid set in state $s$ is

$$
M_u(s) = \{x \in L(\Sigma_u^{\mathrm{in}}) : V_{\mathrm{sem}}(u,x,s)=1\}.
$$

The authorized set for principal $p$ and context $q$ is

$$
A_u(p,s,q) = \{x \in M_u(s) : G_{\mathrm{auth}}(p,u,x,s,q)=\mathrm{ALLOW}\}.
$$

Thus $A_u(p,s,q) \subseteq M_u(s) \subseteq L(\Sigma_u^{\mathrm{in}})$. Grammar-constrained generation aims to keep generated inputs inside $L(\Sigma_u^{\mathrm{in}})$; it cannot prove membership in $M_u(s)$ or $A_u(p,s,q)$ without trusted state and policy.

For the illustrative subset of a test corpus in which each task has one reference tool, let $D=\{(q_i,u_i^*,x_i^*)\}_{i=1}^N$ and report selection and argument validity separately:

$$
\widehat P_{\mathrm{select}} = \frac{1}{N}\sum_{i=1}^N \mathbf 1[\hat u_i=u_i^*],
$$

$$
\widehat P_{\mathrm{syn}\mid\mathrm{select}} =
\frac{\sum_{i=1}^N \mathbf 1[\hat u_i=u_i^*]V_{\mathrm{syn}}(\hat x_i,\Sigma_{u_i^*}^{\mathrm{in}})}
{\max\!\left(1,\sum_{i=1}^N \mathbf 1[\hat u_i=u_i^*]\right)}.
$$

The guarded denominator makes the metric defined when the model never selects the reference tool; the accompanying selection score exposes that pathological case. Full evaluation must also admit no-call tasks, multiple valid tools, equivalent tool sets, and multiple valid orderings rather than forcing every task into this single-reference subset.

## 4. Detailed concept analysis

### 4.1 Input schema responsibilities

An input schema should encode all stable structural invariants supported by the target runtime:

- exact primitive types rather than stringly typed values;
- `enum` or tagged unions for closed alternatives;
- required fields with explicit null semantics;
- minimum and maximum bounds for numbers and collection sizes;
- `additionalProperties: false` when silent keys are unsafe;
- canonical units in field names, such as `amount_minor` or `timeout_ms`;
- stable resource identifiers distinct from display names;
- explicit pagination, filtering, and result limits;
- a version or discriminant when multiple payload variants coexist.

Do not encode mutable business facts as static enums. A schema containing today's project identifiers will become stale, inflate context, and require frequent recompilation. Use discovery or a validated resource reference instead.

### 4.2 Make illegal states less representable

Prefer a discriminated union to a bag of conditionally meaningful optional fields. For example, a notification target should be one of `{kind: "email", address: ...}` or `{kind: "webhook", url_ref: ...}`, not an object in which both fields are nullable and prose explains which combination is legal.

Use one representation for one concept. Accepting a timestamp as integer seconds, integer milliseconds, ISO text, or natural language multiplies canonicalization and test cases. If human input is unavoidable, isolate parsing in a separate read-only normalization step and require confirmation of the canonical value before an effectful action.

### 4.3 Strict generation and boundary validation

As checked on 2026-07-13, OpenAI's `strict: true` function mode requires `additionalProperties: false` on every object and all properties to appear in `required`; optional values are represented using a nullable type. Responses requests attempt schema normalization when possible and otherwise expose a non-strict fallback, while Chat Completions remains non-strict by default. The same documentation notes a current fine-tuned-model caveat for multiple parallel calls [OFC]. These are dated provider semantics, not general JSON Schema rules.

Anthropic documents `strict: true` as grammar-constrained sampling that keeps tool names and inputs inside its supported JSON Schema subset in [Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use). MCP defines `inputSchema` and an optional `outputSchema`, but the protocol does not require model-side constrained decoding [MCP].

Even when a provider guarantees conformance to its supported schema subset, validate again at the executor boundary. This detects version mismatch, transport corruption, unsupported-keyword assumptions, malicious non-model callers, and disagreement between the declaration used for decoding and the deployed executor.

### 4.4 Semantic validation is state dependent

Structural constraints cannot reliably express that an object version is current, a date range is available, a transition is legal, or a target belongs to the principal. Perform these checks after canonicalization against authoritative state. Return typed rejections such as `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, or `PRECONDITION_FAILED`, not an overloaded string.

Semantic validation still precedes authorization conceptually. In implementation, information-disclosure constraints may require a combined check that does not reveal whether an unauthorized resource exists. The external error can remain uniform while internal telemetry records the exact stage.

### 4.5 Authorization is not a schema field

Do not accept `user_id`, `tenant_id`, `role`, or `approved: true` from the model as evidence of authority. Derive principal and tenant from authenticated context. Approval must be a trusted artifact bound to a canonical action digest, resource version, approver, scope, and expiry.

MCP tool annotations are explicitly untrusted unless their server is trusted [MCP]. Even from a trusted server, an effect hint is classification input, not a substitute for the application's authorization decision.

### 4.6 Output schemas and exhaustive outcomes

An output schema should separate domain data from control status. A robust algebraic outcome is conceptually

```text
Succeeded(data, receipt, observed_at, resource_version)
Rejected(stage, code, safe_detail)
Failed(code, retry_class, effect_committed)
Partial(completed, failed, compensation_state)
Indeterminate(attempt_id, reconciliation_hint)
```

MCP states that when an output schema is provided, servers must return conforming structured results and clients should validate them [MCP]. Conformance does not prove that fields are truthful or fresh; provenance and independent verification remain necessary.

### 4.7 Schema complexity and model usability

More constraints are not always better. Deep nesting, large enums, many optional branches, overloaded scalar types, and similar property names increase model construction difficulty and human review cost. Split tools when variants have materially different semantics or policies. Keep them unified when separate names would create selection ambiguity for one atomic concept. The decision should be evaluated empirically rather than derived from schema size alone [ATE].

## 5. Methodology: schema engineering workflow

1. **Write domain types first.** Define canonical identifiers, units, absence, and error variants independently of a provider SDK.
2. **List invariants by stage.** Assign each rule to syntax, semantic state, authorization, executor, outcome, or verification.
3. **Choose the supported schema subset.** Pin provider, API surface, model snapshot, JSON Schema dialect or subset, and strictness configuration.
4. **Minimize representations.** Use bounded collections, discriminated unions, canonical units, and explicit nullability.
5. **Generate or review both directions.** Ensure the runtime type and model-visible schema cannot drift; hash the normalized schema in deployment metadata.
6. **Create boundary tests.** Cover minimum/maximum values, empty collections, unknown fields, Unicode confusables, invalid combinations, and oversized payloads.
7. **Create semantic and policy tests separately.** A syntactically valid corpus must include domain-invalid and unauthorized examples.
8. **Test model behavior.** Measure correct selection, exact argument semantics, repair frequency, token cost, and latency under realistic tool sets.
9. **Test evolution.** Replay recorded calls against old and new schemas and verify explicit migration or rejection.

## 6. Reference validation algorithm

```text
PROCEDURE ValidateToolCall(call, authenticated_context, registry):
    contract <- registry.Resolve(call.name, call.schema_version)
    IF contract is absent:
        RETURN Rejected("selection", "UNKNOWN_CONTRACT")

    syntax <- ValidateSupportedSchema(call.arguments, contract.input_schema)
    IF syntax is invalid:
        RETURN Rejected("syntax", syntax.code)

    canonical <- CanonicalizeChecked(call.arguments, contract.canonical_types)
    IF canonical is invalid:
        RETURN Rejected("syntax", canonical.code)

    state <- ReadStateWithoutDisclosingUnauthorizedDetails(canonical)
    semantics <- contract.ValidateSemantics(canonical, state)
    authorization <- contract.Authorize(authenticated_context,
                                        canonical, state)

    IF semantics is invalid OR authorization is not ALLOW:
        RETURN UniformExternalRejection(semantics, authorization)

    RETURN Admitted(contract, canonical, state.version,
                    authorization.capability)
```

For input encoding length $B$, schema size $S$, maximum array length $L$, combinator-search cost $C_{\mathrm{comb}}$, uniqueness-check cost $C_{\mathrm{uniq}}(L)$, and regular-expression cost $C_{\mathrm{regex}}$, a more honest bound is $O(B+S+C_{\mathrm{comb}}+C_{\mathrm{uniq}}(L)+C_{\mathrm{regex}})$. Space is at least $O(B+D)$ for a materializing validator with nesting depth $D$. The simplified $O(B+S)$ case holds only when aggregate keyword work is linear, uniqueness is implemented and bounded appropriately, combinator branching is bounded, and patterns use a linear-time engine. Schemas must be deployment-controlled and all inputs bounded.

## 7. Limitations and assumptions

- Provider strict modes implement documented subsets, not every JSON Schema keyword or dialect.
- JSON numbers do not by themselves preserve money precision; use integer minor units or an explicitly validated decimal representation.
- `format` annotations may not be assertions in every validator or dialect; do not assume an email, URI, or timestamp was validated without checking implementation behavior.
- A schema cannot express most cross-resource, temporal, or authorization invariants.
- An output schema constrains shape, not truthfulness, freshness, or completeness.

## 8. Failure modes

| Failure | Example | Control |
|---|---|---|
| Stringly typed scalar | `"two"`, `"2"`, and `2` accepted for quantity | One numeric type and bounds |
| Ambiguous optional fields | Both `email` and `webhook` absent | Discriminated union |
| Unit confusion | Seconds interpreted as milliseconds | Unit-bearing field name and bounded range |
| Silent unknown key | `dryrun` ignored instead of `dry_run` | Reject additional properties |
| Schema drift | Decoder uses v2 while executor expects v1 | Version pin and normalized-schema digest |
| Trusted identity from arguments | Model supplies another tenant's ID | Derive identity from authenticated context |
| Success-only output | Timeout indistinguishable from failure-before-send | Exhaustive outcome union with indeterminate state |

## 9. Production implications

- Cache compiled schemas only under a stable content digest and account for provider-specific retention implications.
- Enforce byte, depth, collection, numeric, and string limits before allocating large structures.
- Canonicalize once and authorize the canonical representation; log its digest rather than mutable raw text where appropriate.
- Report syntax rejection separately from semantic rejection, policy denial, execution failure, partial effect, and verification failure.
- Maintain a provider-neutral domain type plus provider adapters; portability tests should compare accepted languages, not just similar-looking JSON.

## 10. Connections

- Topic 1 places schemas inside the larger ACI contract and reliability chain.
- Topic 4 explains how names and descriptions help the model select and fill these schemas.
- Topic 5 adds effect classification, which determines which semantic fields and approvals are required.
- Topic 14 will fuzz schemas, descriptions, and metamorphic variants against these invariants.
- Chapter 4 provides the provider-specific transport semantics whose supported subsets must be pinned.

## Primary sources

- [OpenAI, Function calling](https://developers.openai.com/api/docs/guides/function-calling) [OFC].
- [Anthropic, Strict tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use).
- [Anthropic, Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools).
- [Model Context Protocol, Tools specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP].
- [JSON Schema, Draft 2020-12 Core specification](https://json-schema.org/draft/2020-12/json-schema-core).
- [Anthropic, Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) [ATE].
