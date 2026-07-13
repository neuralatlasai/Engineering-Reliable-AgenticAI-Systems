# Topic 11 — Retry, Idempotency, Duplicate Actions, Partial Success, and Compensation

## 1. Problem and objective

A timeout does not reveal whether a remote effect occurred. A request may have been dropped, may still be running, may have committed before its response was lost, or may have completed only some sub-operations. Interpreting “no response” as “nothing happened” can duplicate a payment, message, reservation, or deletion.

The objective is to move an ambiguous operation toward a known state without assuming exactly-once transport. The tool contract must state which failures are retryable, how attempts express the same intent, how duplicates are recognized under concurrency and late arrival, how partial success is represented, and which effects admit compensation.

Idempotency concerns the intended effect, not byte-identical responses. Compensation is a new forward action, not transactional rollback.

## 2. Intuition: intent, attempt, and effect

One logical operation can produce several transport attempts. Let $o$ be an operation identifier, $k$ an idempotency key scoped to a principal and tool, $x$ the canonical request, and $j$ an attempt number. Retries of the same intent reuse $(o,k,x)$ but receive distinct attempt identifiers $(o,j)$.

The operation record must distinguish:

$$
Q_o
\in
\{\text{not-started},\text{in-progress},\text{succeeded},
\text{failed-final},\text{partially-succeeded},\text{outcome-unknown},
\text{compensating},\text{compensated}\}.
$$

`outcome-unknown` is a first-class state. Converting it directly to failure discards the information needed to prevent a duplicate effect.

RFC 9110 defines an HTTP method as idempotent when repeated identical requests have the same intended server effect as one request. Logging may still occur per request, and a retry response may differ from the original [RFC9110, §9.2.2]. Tool contracts require the same semantic distinction even when the transport is not HTTP.

## 3. Rigorous semantics

### 3.1 Effect idempotence and intent keys

Let $F_u(s,x)$ be the transition requested from tool $u$. Define $s\equiv_u s'$ when $s$ and $s'$ have the same user-requested effect under tool $u$; the equivalence deliberately projects away permitted differences such as audit rows and request metrics. The request is effect-idempotent on admissible states $\mathcal S_u$ when:

$$
F_u(F_u(s,x),x)
\mathrel{\equiv_u}
F_u(s,x)
\qquad
\text{for every }s\in\mathcal S_u.
$$

Audit rows, metrics, timestamps, and response bodies can change while the user-requested effect remains the same.

For an operation that is not naturally idempotent, expose an idempotent *intent protocol* keyed by $(p,u,k)$, where $p$ is the authenticated principal. Define the canonical fingerprint:

$$
h
\mathrel{=}
H\!\left(\operatorname{canon}(u,x,\text{authority-scope})\right).
$$

Store $(p,u,k,h,Q_o,r)$, where $r$ is the stable semantic result. A repeated key with the same fingerprint resumes or returns the recorded operation. The same key with a different fingerprint is rejected as conflicting intent. Argument equality alone cannot identify a duplicate because a caller may intentionally request two identical resources; a caller-provided key expresses intent explicitly [AWS-IDEMP, “Reducing client complexity”].

### 3.2 Concurrency and retention

Concurrent first attempts must not both pass “key absent.” The implementation needs one linearization point:

$$
\operatorname{reserve}(p,u,k,h)
\in
\{\text{owner},\text{existing-same},\text{existing-conflict}\}.
$$

The reservation and mutation must share a transaction, or be joined by a durable outbox/inbox protocol with uniqueness and reconciliation. A cache lookup followed by an unguarded mutation is not idempotency.

The retention window must exceed credible client retry, queue, and clock-uncertainty bounds:

$$
T_{\mathrm{dedup}}
\mathrel{>}
T_{\mathrm{client-retry}}^{\max}
+T_{\mathrm{queue}}^{\max}
+T_{\mathrm{skew}}^{\max}.
$$

If those bounds are unavailable, associate the key with the resource lifetime or document that late retries require reconciliation. AWS treats late arrivals and finite token retention as API-semantic decisions [AWS-IDEMP, “Late arriving requests”].

### 3.3 Retry probabilities without independence

For at most $N$ attempts, let $R_j$ be the event that attempt $j$ ends in a retryable, reconciled state, and $S_j$ success on attempt $j$. Define:

$$
q_j
\mathrel{=}
\Pr(R_j\mid R_1,\ldots,R_{j-1}),
\qquad
s_j
\mathrel{=}
\Pr(S_j\mid R_1,\ldots,R_{j-1}).
$$

Then:

$$
\Pr(\text{success by }N)
\mathrel{=}
\sum_{j=1}^{N}
s_j
\prod_{\ell=1}^{j-1}q_\ell.
$$

The empty product is one. No stationary or independent-attempt assumption is made. A geometric expression is justified only after establishing $q_j=q$, $s_j=s$, and conditionally fresh retry behavior.

If a request crosses $L$ layers and layer $\ell$ can issue $r_\ell$ retries, the worst-case leaf-attempt bound is:

$$
A_{\max}
\mathrel{=}
\prod_{\ell=1}^{L}(r_\ell+1).
$$

This deterministic bound explains why retry ownership should normally reside at one layer, with a shared deadline, retry budget, capped exponential backoff, and jitter [AWS-RETRY].

### 3.4 Partial success

For a batch of $m$ components, return a status vector:

$$
\boldsymbol\sigma
\mathrel{=}
(\sigma_1,\ldots,\sigma_m),
\qquad
\sigma_i\in
\{\text{committed},\text{not-applied},\text{unknown},\text{failed-final}\}.
$$

Every `unknown` component needs a reconciliation query. Retrying the whole batch is safe only when every committed component is independently deduplicated. Otherwise retry only the unresolved subset with stable component keys. An aggregate success flag is meaningful only after the contract defines $A(\boldsymbol\sigma)$, its acceptance predicate.

### 3.5 Compensation and sagas

For forward actions $F_1,\ldots,F_m$, a saga associates compensations $C_i$ with selected committed actions. If $F_j$ fails after earlier actions commit, compensation runs in reverse dependency order:

$$
C_{j-1},C_{j-2},\ldots,C_1.
$$

The requirement is not $C_i=F_i^{-1}$, which may not exist. Instead, specify an acceptable compensated-state predicate:

$$
K_i\!\left(C_i(F_i(s))\right)=1.
$$

A refund does not erase a captured payment; a cancellation does not erase a booking’s history. Compensation can fail and creates a new effect, so it needs its own authorization, idempotency key, retry policy, and reconciliation. Sagas coordinate forward and compensating transactions; they do not recreate a global ACID transaction [SAGA].

## 4. Admission and execution algorithm

```text
ALGORITHM ExecuteWithIdempotency(tool, principal, key, arguments, deadline):
    PRECONDITIONS:
        key is non-empty and scoped to (principal, tool)
        arguments satisfy schema and policy
        current_time < deadline

    fingerprint <- Hash(Canonicalize(tool, arguments, authority_scope))
    reservation <- AtomicReserve(principal, tool, key, fingerprint)

    MATCH reservation:
        ExistingConflict(_): RETURN FinalError(KEY_REUSE_DIFFERENT_INTENT)
        ExistingTerminal(record): RETURN ReconstructSemanticResult(record)
        ExistingInProgress(operation_id): RETURN PollOrJoin(operation_id, deadline)
        Owner(operation_id): CONTINUE

    FOR attempt FROM 1 TO tool.max_attempts:
        IF current_time >= deadline:
            RecordFinalFailure(operation_id, DEADLINE_NOT_APPLIED)
            RETURN FinalError(DEADLINE_NOT_APPLIED)

        result <- InvokeBounded(tool, operation_id, key, arguments)

        MATCH result:
            Applied(output, component_statuses):
                ValidateOutput(output)
                AtomicallyRecordTerminal(operation_id, output, component_statuses)
                RETURN output
            RejectedPermanent(error):
                RecordFinalFailure(operation_id, error)
                RETURN error
            RetryableNotApplied(error):
                IF attempt = tool.max_attempts:
                    RETURN RecordAndReturn(RETRY_EXHAUSTED)
                timer <- ScheduleNonBlockingBackoffWithJitter(attempt, deadline)
                AWAIT timer without occupying an executor thread
            AmbiguousOrPartial(evidence):
                state <- Reconcile(operation_id, key, evidence)
                IF state is terminal: RETURN PersistAndReturn(state)
                MarkUnknown(operation_id, evidence)
                RETURN OutcomeUnknown(operation_id, reconciliation_query)
```

With a balanced-tree index, reservation has deterministic $O(\log n)$ lookup cost. A bounded, denial-of-service-resistant hash index offers expected or amortized $O(1)$ lookup under its documented load and collision assumptions; it does not provide a universal worst-case constant bound. Executor cost normally dominates. Storage is $O(n_k)$ for retained keys plus component outcomes. The algorithm does not retry an ambiguous write until reconciliation proves re-execution safe.

## 5. Failure modes

- **Fresh key per retry:** each attempt appears to be new intent.
- **Key without fingerprint:** different intent can receive a historical result.
- **Non-atomic check-then-act:** concurrent duplicates both execute.
- **Early deduplication expiry:** a late request is accepted as new work.
- **Retrying permanent rejection:** authorization or validation errors amplify load.
- **Whole-batch retry after partial success:** committed components are duplicated.
- **Compensation described as rollback:** operators assume the original effect disappeared.
- **Nested retries:** attempt counts multiply during an outage.

## 6. Limitations

No application protocol guarantees exactly-once physical execution across arbitrary failures. It can provide at-most-one accepted intent within a declared scope, durable state evidence, and deterministic reconciliation. External systems without keys, status queries, or stable identifiers limit what the harness can prove.

Compensation cannot restore time, confidentiality, human decisions, market prices, or observations already made by third parties. Prevention and approval dominate recovery for irreversible effects.

## 7. Production implications

1. Put idempotency fields in the typed contract, not prompt prose.
2. Persist operation ID, component IDs, fingerprint, attempts, and reconciliation evidence.
3. Classify errors as `permanent`, `retryable-not-applied`, or `ambiguous`.
4. Assign retry ownership to one layer with a shared deadline and budget.
5. Test key races, response loss after commit, late arrival, expiry, partial batches, and compensation failure.
6. Preserve `outcome_unknown`; do not collapse it into a generic error.

## 8. Connections

- Topic 5 supplies effect and reversibility classes.
- Topic 10 defines authorization and deterministic preconditions.
- Topic 12 attaches provenance to attempts and compensation.
- Topic 13 scores duplicate effects and partial success.
- Chapter 3 governs deadline, cancellation, checkpoint, and resume.

## Sources

[RFC9110] IETF, *RFC 9110: HTTP Semantics*, §9.2.2, p. 73 — https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2

[AWS-IDEMP] Malcolm Featonby, AWS Builders’ Library, *Making retries safe with idempotent APIs*, “Reducing client complexity,” “Retries and semantic equivalence,” “Late arriving requests,” and “Same client request ID, different intent” — https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/

[AWS-RETRY] Marc Brooker, AWS Builders’ Library, *Timeouts, retries, and backoff with jitter*, “Retries and backoff” — https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

[SAGA] García-Molina and Salem, “Sagas,” *SIGMOD 1987*, pp. 249–259 — https://doi.org/10.1145/38713.38742
