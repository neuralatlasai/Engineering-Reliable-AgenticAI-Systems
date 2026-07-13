# Topic 5 — Read, Write, Reversible, and Irreversible Actions

## 1. Problem and objective

Every tool-mediated action must be classified by effect, reversibility, idempotency, resource ownership, and consequence. Read versus write and reversible versus irreversible are separate axes. A write may be readily reversible, such as updating a draft under version control, or effectively irreversible, such as sending an external message. A read may still disclose sensitive data, incur cost, consume a one-time token, or alter operational state through audit logs.

The objective is to replace vague labels with state-transition definitions and bind each action class to deterministic controls. The model may propose or describe an action; trusted runtime logic decides its class, verifies authority, obtains any required approval, executes it, and verifies the outcome.

## 2. Intuition

"Read-only" is not synonymous with "safe," and "undo" is not synonymous with "no harm." Reading payroll data can violate confidentiality. Deleting a file may be reversible from a snapshot, while emailing its contents cannot be made unseen by recalling the message. A compensation that creates a counteracting transaction may restore a balance but still leave fees, notifications, market exposure, and audit history.

Risk controls should attach to the real state transition and externalities, not to the tool's verb or an advisory annotation.

## 3. Formal action semantics

Let $s\in\mathcal S$ be authoritative pre-state, $x$ canonical arguments, $\omega$ environmental randomness, and

$$
s' = T_u(s,x,\omega)
$$

the transition induced by tool $u$. Let $P_D$ project domain resources of interest and $P_O$ project operational state such as logs, counters, billing, or caches.

### 3.1 Domain read and write

A tool is **domain-read-only** over scope $D$ if, for every admitted invocation and possible execution outcome,

$$
P_D(T_u(s,x,\omega)) = P_D(s).
$$

It is a **domain write** if some admitted input and reachable execution changes that projection. The qualifier matters: a domain read can still change $P_O$, emit network traffic, consume quota, or expose data. Strict global read-only behavior would require both domain and operational projections to remain equivalent, which few production reads satisfy.

### 3.2 Reversibility

Let $\simeq_D$ be an explicitly chosen equivalence relation over protected domain state and externalities. An effect is reversible within horizon $H$ if there exists an admissible compensation $c$ such that

$$
T_c(T_u(s,x,\omega),x_c,\omega_c) \simeq_D s
$$

within $H$, for all states and outcomes in the declared operating envelope. Reversibility is therefore relative to scope, equivalence, time, permissions, and retained evidence. If the compensator merely creates an offsetting effect while irreversible externalities remain, describe the action as **compensatable**, not reversible.

### 3.3 Idempotency

For an equivalence relation $\simeq_I$, an operation is idempotent when repeating the same logical request does not create an additional distinct effect:

$$
T_u(T_u(s,x,\omega_1),x,\omega_2) \simeq_I T_u(s,x,\omega_1).
$$

In distributed systems, this property is usually implemented for a bounded retention window using an idempotency key and stored outcome. It must not be inferred from HTTP method, tool name, or desired business behavior.

### 3.4 Approval binding

An approval should authorize one canonical proposed transition, not a vague task. Let

$$
h = H(u\,\|\,v_u^{\mathrm{contract}}\,\|\,\operatorname{canon}(x)\,\|\,r\,\|\,s_{\mathrm{ver}}\,\|\,p\,\|\,t_{\mathrm{exp}}),
$$

where $v_u^{\mathrm{contract}}$ is the contract version, $r$ the target-resource scope, $s_{\mathrm{ver}}$ the observed resource version, $p$ the principal, and $t_{\mathrm{exp}}$ expiry. A trusted approval artifact signs or otherwise authenticates $h$. Any change to amount, recipient, resource version, principal, or expiry invalidates the approval.

## 4. Detailed concept analysis

### 4.1 Effect classes are multidimensional

Use the chapter field $\chi_u$ as a structured effect/risk class rather than a single ordinal label:

$$
\chi_u = (w_u,\nu_u,\jmath_u,\delta_u,\eta_u,L_u^{\max}),
$$

where $w_u$ is domain read/write scope, $\nu_u$ reversibility or compensatability, $\jmath_u$ idempotency semantics, $\delta_u$ data-disclosure class, $\eta_u$ external-facing impact, and $L_u^{\max}$ a quantitative consequence bound.

| Domain effect | Reversibility | Example | Typical control |
|---|---|---|---|
| Read | Not applicable to domain state | Read public documentation | Egress and provenance checks |
| Read | Disclosure is irreversible | Read and transmit a private record | Purpose, field-level authorization, confirmation before transmission |
| Write | Reversible | Edit a versioned draft | Version precondition, snapshot, postcondition read |
| Write | Compensatable | Post an accounting adjustment | Idempotency key, approval, reconciliation, compensation workflow |
| Write | Irreversible | Send email or publish externally | Just-in-time confirmation and exact preview |
| Write | Destructive with recovery window | Soft-delete an object | Retention guarantee, restore test, ownership check |

### 4.2 Classification belongs to trusted configuration

Inferencing effect class from names such as `get_`, `update_`, or `preview_` is unsafe. A `get_download_url` operation may mint a bearer capability; a `preview_order` operation may reserve inventory. MCP defines behavior annotations but requires clients to treat them as untrusted unless the server is trusted [MCP]. Even trusted annotations should be reconciled with local policy and tested executor behavior.

Class can be argument dependent. `post_message(channel="draft")` and `post_message(channel="public")` may need different gates. The trusted classifier should evaluate canonical arguments, resource metadata, principal, and current state.

### 4.3 Read controls focus on confidentiality and egress

For reads, validate row-, field-, tenant-, and purpose-level authorization before retrieval. Bound queries and output size. Label provenance and freshness. Treat returned content as untrusted data, especially when it can contain instructions. A read that feeds another tool creates an egress path; authorization to read does not imply authorization to transmit.

### 4.4 Reversible writes require tested restoration

Reversibility requires more than an `undo` endpoint. Verify that the system retains the pre-state, the caller can still restore it, concurrent writes are not overwritten, dependent resources are handled, and the recovery horizon is longer than detection latency. A restore should use compare-and-swap or an expected version to avoid erasing intervening legitimate changes.

### 4.5 Irreversible actions need a point-of-no-return gate

Complete safe preparatory work first, then pause immediately before the irreversible boundary. Present the exact recipient, resource, data, amount, and consequence. OpenAI's computer-use guide recommends confirmation at the point of risk and treats typing sensitive data as transmission; it also recommends human involvement for purchases, authenticated flows, destructive actions, and hard-to-reverse actions [OCU].

Google ADK's action-confirmation mechanism can pause a tool and collect Boolean or structured confirmation, but its documentation marks the feature experimental and records language-specific limitations as of the evidence date [ADK-C]. A framework pause is transport for an approval decision, not proof that the approval is correctly scoped.

### 4.6 Execution and outcome remain separate

After admission, the executor may return:

- **not started:** no downstream dispatch occurred;
- **failed before commit:** safe retry may be possible;
- **committed:** an authoritative receipt identifies the effect;
- **partial:** only a subset committed;
- **indeterminate:** dispatch occurred but completion is unknown.

A timeout must not be mapped automatically to `failed`. Reconcile using idempotency key, operation ID, or authoritative state before retrying an irreversible write.

### 4.7 Verification depends on effect type

For a versioned write, verify the new resource version and intended fields. For a message, verify a provider receipt and destination, recognizing that delivery and human interpretation remain outside the system's proof. For deletion, verify tombstone, retention deadline, and restoration path. Verification evidence should be independent of the model's prose summary.

## 5. Methodology: effect-class design review

1. **Identify authoritative resources and externalities.** Include data stores, people, financial systems, notifications, quotas, and downstream automations.
2. **Define projections and equivalence.** State exactly which changes make an operation a write and what restoration would mean.
3. **Classify per argument region.** Split or gate calls when amount, destination, data sensitivity, or publication scope changes consequence.
4. **Define ownership and authority.** Bind authenticated principal to each resource and field; exclude model-supplied identity.
5. **Specify idempotency.** Define logical-request identity, retention window, conflict behavior, and stored response.
6. **Specify approval policy.** Record who can approve, the exact canonical action digest, expiry, and resource-version binding.
7. **Define outcome algebra.** Include partial and indeterminate outcomes and safe retry classifications.
8. **Design verification and reconciliation.** Prefer authoritative read-back or receipts; set bounded reconciliation deadlines.
9. **Test compensation.** Exercise concurrent changes, expired recovery windows, dependent resources, and compensation failure.
10. **Measure residual risk.** Track denied, approved, committed, duplicated, partial, indeterminate, compensated, and verification-failed actions separately.

## 6. Reference algorithm for a high-impact write

```text
PROCEDURE ExecuteGovernedWrite(proposal, authenticated_context):
    contract, args <- ParseValidateAndCanonicalize(proposal)
    pre_state <- ReadAuthoritativeState(args.resource)

    semantics <- ValidateTransition(contract, args, pre_state)
    IF semantics is invalid:
        RETURN Rejected("semantics", semantics.code)

    effect <- TrustedEffectClassifier(contract, args, pre_state)
    policy <- Authorize(authenticated_context, contract, args,
                        pre_state, effect)
    IF policy is not ALLOW:
        RETURN Rejected("authorization", policy.code)

    preview <- BuildExactHumanReadablePreview(args, effect, pre_state.version)
    action_digest <- Digest(contract.version, args, pre_state.version,
                            authenticated_context.principal, policy.expiry)

    IF policy.requires_approval:
        approval <- ObtainTrustedApproval(preview, action_digest)
        IF approval is absent OR NOT VerifyApproval(approval, action_digest):
            RETURN Rejected("approval", "NOT_APPROVED")

    current <- ReadAuthoritativeState(args.resource)
    IF current.version != pre_state.version:
        RETURN Rejected("semantics", "VERSION_CONFLICT")

    outcome <- ExecuteWithIdempotencyKey(contract, args,
                                         policy.idempotency_key)
    IF outcome is indeterminate:
        outcome <- ReconcileBeforeAnyRetry(outcome.operation_id)

    verification <- VerifyAuthoritativePostcondition(outcome, args, current)
    RETURN InvocationRecord(effect, policy, outcome, verification)
```

With indexed state and policy lookups, local computation is linear in bounded argument and preview size. External reads, approval delay, execution, and reconciliation dominate wall-clock latency. The algorithm is not a distributed transaction: state can still change between checks unless the executor enforces the expected version atomically.

## 7. Limitations and assumptions

- No finite taxonomy captures every social, legal, financial, or informational externality.
- Compensation may restore selected state while leaving notifications, fees, exposure, or audit history.
- Eventual consistency can make postcondition checks temporarily inconclusive.
- Approval can be uninformed, coerced, stale, or presented through a compromised interface; cryptographic binding solves scope drift, not human judgment.
- A check-then-act sequence needs executor-side atomic preconditions to prevent time-of-check/time-of-use races.

## 8. Failure modes

| Failure | Consequence | Required control |
|---|---|---|
| Read labeled safe | Sensitive data disclosed or transmitted | Field-level authorization and egress policy |
| Undo assumed complete | External recipients or fees remain | Explicit compensatability and residual-effect ledger |
| Approval obtained too early | Final recipient or amount differs | Just-in-time action-digest binding |
| Approval from tool content | Prompt injection grants permission | Only trusted principal or supervisor artifacts |
| Retry after timeout | Duplicate irreversible effect | Idempotency key and reconciliation before retry |
| Stale precondition | Concurrent update overwritten | Atomic expected-version check |
| Advisory effect hint trusted | Destructive tool auto-approved | Trusted local classification and tests |
| Executor says success | State transition never occurred | Authoritative receipt or postcondition read-back |

## 9. Production implications

- Maintain a machine-enforced effect registry with owner, classifier version, consequence bounds, approval policy, idempotency window, and verification procedure.
- Make irreversible tools unavailable until the workflow reaches a state where exact parameters and user intent are known.
- Persist approval artifact, canonical action digest, pre-state version, idempotency key, receipt, and verification evidence in one immutable trace.
- Alert on indeterminate outcomes and expired reconciliation deadlines; these are operational incidents, not ordinary model errors.
- Regularly restore backups and execute compensators in staging. An untested rollback path is a hypothesis, not a guarantee.

## 10. Connections

- Topic 1 supplies the syntax-to-verification stages used by the governed write algorithm.
- Topic 2 shows why effect class cannot be inferred from local, remote, hosted, MCP, or agent placement.
- Topics 3-4 ensure the model can express and understand an action; this topic determines whether it may execute.
- Topics 10-12 will extend preconditions, retries, compensation, provenance, and untrusted-content boundaries.
- Chapter 12 will develop the full security treatment for prompt injection, credentials, exfiltration, and sandboxing.

## Primary sources

- [OpenAI, Computer use](https://developers.openai.com/api/docs/guides/tools-computer-use) [OCU].
- [Google ADK, Action confirmations](https://adk.dev/tools/confirmation/) [ADK-C].
- [Model Context Protocol, Tools specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP].
- [OpenAI, Function calling](https://developers.openai.com/api/docs/guides/function-calling) [OFC].
