# Topic 10 — Deterministic Preconditions, Postconditions, Authorization, and Resource Ownership

## 1. Problem and objective

A model can propose a syntactically valid call that is unauthorized, stale, unsafe in the current state, or directed at a resource the user does not control. Tool descriptions can guide proposals, but prose cannot enforce these constraints. Enforcement belongs to a deterministic admission boundary operating on authenticated identity, trusted state, current policy, and exact arguments.

The objective is to guarantee that every executed action satisfied explicit preconditions at the point of effect, was authorized for the acting principal and target resource, respected ownership or delegated authority, and produced a verified postcondition. When any condition fails, the system returns a typed denial or indeterminate outcome without pretending that model intent changed reality.

## 2. Intuition: the model proposes; the control plane decides

An agent asking to delete `project/17` is analogous to an untrusted client submitting an API request. The proposal may be useful, but it is not proof of identity, authority, ownership, current resource version, budget, or consent. The control plane derives those facts from trusted systems and binds them to the exact operation.

The action path is

$$
Y_t
\longrightarrow \Xi_t
\longrightarrow \text{candidate invocation }x_t
\xrightarrow{\text{deterministic admission}}
\widetilde A_t
\longrightarrow A_t
\longrightarrow \text{postcondition verification}.
$$

Denial is a valid control-plane result. It should explain which condition failed without leaking sensitive policy or resource existence beyond the caller's disclosure rights.

## 3. Formal admission model

Let the model-originated candidate invocation be

$$
x_t=(u_t,\theta_t).
$$

Here $u_t$ is the tool and $\theta_t$ its proposed arguments. The control plane derives the acting principal and target resources from trusted context and normalized arguments:

$$
p_t=\operatorname{Principal}(c_t),
\qquad
r_t=\operatorname{ResolveResources}(\theta_t,c_t).
$$

The model cannot set either value. Let $c_t$ be trusted request context and $s_t$ an authoritative state snapshot.

Define boolean predicates:

- $V_{\Sigma}$: input conforms to $\Sigma_{u_t}^{\mathrm{in}}$ and boundary invariants;
- $V_{\mathrm{id}}$: authentication and session binding are valid;
- $V_{\mathrm{authz}}$: policy permits principal, operation, resource, and conditions;
- $V_{\mathrm{own}}$: ownership, tenancy, delegation, or custodial constraints hold;
- $V_{\mathrm{pre}}$: domain preconditions hold in $s_t$;
- $V_{\mathrm{budget}}$: rate, cost, time, and blast-radius budgets permit execution;
- $V_{\mathrm{consent}}$: any required approval is valid for this exact action;
- $V_{\mathrm{fresh}}$: policy, credentials, approval, and state snapshot are sufficiently fresh.

The gate is

$$
G(x_t,c_t,s_t;v_{\mathrm{policy}})
\mathrel{=}
V_{\Sigma}
\land V_{\mathrm{id}}
\land V_{\mathrm{authz}}
\land V_{\mathrm{own}}
\land V_{\mathrm{pre}}
\land V_{\mathrm{budget}}
\land V_{\mathrm{consent}}
\land V_{\mathrm{fresh}}.
$$

Return a separate discriminated admission result rather than overloading the book's admitted-action-set variable $\widetilde A_t$:

$$
\mathsf{AdmResult}_t
\mathrel{=}
\begin{cases}
\operatorname{Admitted}(x_t,\eta_t), & G=1,\\
\operatorname{Denied}(e_t), & G=0,
\end{cases}
$$

where $\eta_t$ is an admission receipt binding the normalized arguments, principal, resources, policy version, relevant state version, approval, expiry, nonce, and logical-operation or idempotency key. The executor accepts only an unexpired matching receipt. A receipt is single-use for a new logical operation; an authorized retry is tied idempotently to the same logical-operation key and deduplication record rather than spending the receipt on a second effect.

### 3.1 Determinism and policy versioning

For fixed normalized inputs and trusted snapshots, the gate should be extensionally deterministic:

$$
\left(\operatorname{Norm}(x),c,s,v_p\right)
\mathrel{=}
\left(\operatorname{Norm}(x'),c',s',v_p'\right)
\Longrightarrow
G(x,c,s;v_p)=G(x',c',s';v_p').
$$

The equality is intentionally simple: nondeterministic model behavior must not enter the policy decision. External policy calls, risk services, and clocks should be represented by recorded inputs or explicit snapshot versions. A later decision may differ because $s$, $c$, or $v_p$ changed; that is state evolution, not policy randomness.

### 3.2 Authorization is relational

Authorization is not a property of a tool name. It is a relation over principal, operation, resource, and conditions:

$$
\operatorname{Permit}(p,o,r,\omega;v_p)\in\{0,1\},
$$

where $\omega$ can include tenant, purpose, time, network, data classification, and approval context. A principal authorized to read one customer record is not authorized to enumerate all customers; a principal authorized to draft a message is not necessarily authorized to send it.

Use deny-by-default and least privilege. If policies compose, define precedence and test conflicts explicitly. “No matching rule” must not silently become allow.

### 3.3 Ownership and delegated authority

Authentication answers who the caller is. Authorization answers whether an operation is permitted. Ownership records a relationship to the resource. They are related but non-equivalent.

Let $\mathcal R(p)$ be resources owned by $p$, $\mathcal D(p)$ resources delegated to $p$ under valid grants, and $\mathcal C(p)$ resources managed in a custodial role. An ownership predicate can require

$$
r_t \subseteq \mathcal R(p_t)\cup\mathcal D(p_t)\cup\mathcal C(p_t),
$$

plus operation-specific constraints on each relation. A support engineer may be a custodian with read access but no right to transfer ownership. A user may own a file but lack permission to publish it under an organization's compliance policy.

Never accept an `owner_id`, `tenant_id`, or principal supplied by the model as authoritative. Derive identity and tenancy from authenticated context; treat resource identifiers as lookup keys that still require policy evaluation.

### 3.4 Preconditions and time-of-check/time-of-use

Preconditions include lifecycle state, expected version, account status, quotas, dependency health, uniqueness, and absence of conflicting operations. If the resource can change after admission, a separate check followed by execution creates a time-of-check/time-of-use race.

For optimistic concurrency, require

$$
v(r_t)=v_{\mathrm{expected}}
$$

inside the same atomic mutation or transaction that applies the effect. For filesystem operations, use descriptor-relative access and atomic replacement where supported. For remote APIs, use conditional requests, idempotency keys, or service-native compare-and-swap semantics. If the executor cannot bind check and effect atomically, document the residual race and verify afterward.

### 3.5 Postconditions and outcome states

Let execution return observation $y_t$ and state advance from $s_t$ to $s_{t+1}$. Define

$$
Q(s_t,x_t,y_t,s_{t+1})\in\{0,1,\bot\},
$$

where $1$ means the required outcome is verified, $0$ means contradicted, and $\bot$ means unverifiable or indeterminate. Transport success and postcondition success remain separate.

The recorded outcome should be exhaustive:

$$
O_t\in
\{\text{denied},\text{not\_executed},\text{verified\_success},
\text{verified\_failure},\text{partial},\text{indeterminate}\}.
$$

A failed postcondition does not imply that no side effect occurred. Retry is unsafe until Topic 11's idempotency, duplicate, and compensation analysis establishes what can be repeated or repaired.

## 4. Deterministic enforcement methodology

### 4.1 Compile policy into an admission plan

For each tool operation, maintain a machine-readable policy mapping:

1. normalized resource extraction;
2. required authentication assurance;
3. allowed verbs and effect classes;
4. ownership or delegation relations;
5. domain preconditions and version fields;
6. cost, count, and blast-radius budgets;
7. approval class and required approver;
8. postcondition query and success predicate;
9. policy and schema version compatibility.

Descriptions can explain these rules to the model, but the executor consumes the machine-readable plan.

### 4.2 Admit, execute, and verify

```text
INPUT: candidate invocation x, authenticated context c, policy version vp
OUTPUT: exhaustive outcome O and evidence record E

1. Parse and schema-validate x; reject unknown fields and checked-arithmetic failures.
2. Normalize identifiers and derive target resources from x and trusted context c.
3. Authenticate the principal; bind tenant, session, and assurance level.
4. Load current resource metadata and policy snapshot.
5. Evaluate authorization, ownership/delegation, domain preconditions, and budgets.
6. If point-of-risk approval is required:
   a. present normalized operation, resources, payload, consequence, and audience;
   b. bind approval to their hash, policy version, expiry, and approver;
   c. re-run mutable checks immediately before execution.
7. Create a short-lived receipt bound to a single logical-operation key; deny
   on any failed predicate. Replays with a new key fail, while an authorized
   retry with the same key resolves through the executor's deduplication ledger.
8. Execute through a capability-scoped adapter using atomic state/version checks.
9. Query authoritative poststate independently where practical.
10. Evaluate the tri-state postcondition Q and classify O exhaustively.
11. Persist proposal, denial/admission, receipt, executor result, and verification evidence.
12. Return a typed result; never collapse denied, failed, partial, and indeterminate.
```

Let the policy store contain $m$ rules and an indexed lookup return $k$ potentially applicable rules. If one index comparison costs $C_{\mathrm{cmp}}$, lookup costs $O(\log m\,C_{\mathrm{cmp}})$ for a balanced index, followed by $O(\sum_{j=1}^{k}C_{\mathrm{pred},j})$ predicate evaluation. If precedence is not precompiled, resolving $k$ matches by comparison sorting adds $O(k\log k\,C_{\mathrm{cmp}})$. An unbounded linear scan over all $m$ rules is prohibited; compile or index the policy, or enforce a proven finite bound. The dominant cost is often remote identity, policy, and authoritative-state I/O. Cache only decisions whose key includes principal, tenant, resource, operation, policy version, relevant state version, and expiry.

### 4.3 Point-of-risk approval

Approval should occur immediately before the action that changes the risk state, after safe preparatory work has made the exact target and payload known. The approval object should not authorize an open-ended future class of actions unless that delegation is explicit and bounded.

OpenAI's current MCP interface can require approval for all calls or selected tools, and approval responses bind to a particular approval request [OMCP]. Its computer-use guidance calls for confirmation immediately before high-impact actions and treats typing sensitive information as transmission [OCU]. Google ADK also documents action confirmation mechanisms and current limitations [ADK-C]. These interfaces are implementation examples; the application remains responsible for mapping its own consequences to approval policy.

### 4.4 Verification independence

Prefer a verification path that does not merely echo the executor's success flag. Examples include reading the committed database version, fetching the message by provider ID and recipient, hashing the resulting file, or capturing a fresh UI observation. Full independence is not always possible, but the evidence source should be named.

### 4.5 Test the policy boundary

Construct a matrix over principals, tenants, operations, resource ownership, lifecycle states, versions, approval states, and policy versions. Include:

- same resource ID in different tenants;
- revoked delegation and expired approval;
- stale expected versions and concurrent mutation;
- resource enumeration through error differences;
- model-supplied principal or owner fields;
- batch containing both allowed and denied items;
- partial executor success and verification timeout;
- policy update between proposal and execution.

Use property tests for invariants such as “no denied action reaches the executor” and “changing only model-visible prose cannot grant authority.”

## 5. Failure modes

| Failure | Mechanism | Control |
|---|---|---|
| Prompt-only policy | Model is told not to perform an action | Deterministic server-side gate |
| Tool-level allowlist only | Authorization ignores resource and arguments | Principal-operation-resource-condition policy |
| Model-controlled identity | `tenant_id` or `owner_id` trusted from arguments | Derive from authenticated context |
| Confused deputy | Powerful service acts for weak principal | Propagate principal and purpose; capability-scoped adapter |
| Stale approval | Payload changes after consent | Hash-bound, expiring approval and revalidation |
| TOCTOU race | Resource changes between check and effect | Transactional check-and-set or conditional request |
| Batch privilege escalation | One approval covers hidden extra items | Per-item normalization, bounded batch, complete preview |
| Postcondition confusion | HTTP success treated as domain success | Independent authoritative verification |
| Information leak on denial | Error reveals another tenant's resource | Disclosure-aware typed errors |
| Fail-open dependency | Policy service timeout becomes allow | Deny or bounded safe degradation by explicit policy |
| Receipt replay | Valid admission reused later or elsewhere | Nonce, expiry, resource/state binding, single-use ledger |
| Annotation trust | Advisory effect metadata accepted as enforcement | Trusted registry and actual policy; MCP annotations are untrusted by default [MCP] |

## 6. Limitations and residual risk

Deterministic gates are only as correct as their policy, identity, and resource models. A consistently wrong policy is deterministic but unsafe. Ownership is especially domain-specific: shared folders, organizational records, delegated mailboxes, joint financial accounts, and legal holds cannot be reduced to a single owner field.

Some external services cannot provide atomic precondition-plus-effect operations or authoritative postcondition reads. In those cases, the system must report weaker guarantees and design compensation or reconciliation. Network partitions can leave outcomes indeterminate even when local logic is correct.

Human approval is also fallible. Repetitive, vague, or premature prompts produce habituation. Confirmation is one control among least privilege, safe defaults, bounded effects, and verification; it is not a substitute for them.

## 7. Production implications

- Centralize policy decisions but keep executor adapters responsible for resource-native atomic checks.
- Version schemas, policy bundles, ownership resolvers, and postcondition predicates; record all versions per call.
- Align audit retention with the sensitivity of arguments, results, and approvals; logs themselves require access control.
- Emit separate metrics for denial reason, admission latency, executor outcome, verification outcome, stale-version conflict, and indeterminate state.
- Redact sensitive denial details from the model while retaining full internal diagnostics under authorized access.
- Re-authorize nested and programmatic tool calls individually; parent admission does not confer ambient authority.

## 8. Connections

This topic realizes Chapter 3's deterministic invariant floor at the tool boundary and refines Chapter 1's distinction between proposed and executed action. Topic 5 supplies effect and reversibility classes. Topic 6 separates discovery from admission, Topic 8 shows why generated code cannot bypass per-call checks, Topic 11 handles retries after uncertain outcomes, and Chapter 12 expands authorization into credential and sandbox architecture.

## 9. Page-level sources

- [Model Context Protocol, *Tools specification (2025-06-18)*](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP]
- [OpenAI, *MCP and Connectors*](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) [OMCP]
- [OpenAI, *Computer use*](https://developers.openai.com/api/docs/guides/tools-computer-use) [OCU]
- [Google ADK, *Action confirmations*](https://adk.dev/tools/confirmation/) [ADK-C]
- [OpenAI, *Shell*](https://developers.openai.com/api/docs/guides/tools-shell) [OSH]
