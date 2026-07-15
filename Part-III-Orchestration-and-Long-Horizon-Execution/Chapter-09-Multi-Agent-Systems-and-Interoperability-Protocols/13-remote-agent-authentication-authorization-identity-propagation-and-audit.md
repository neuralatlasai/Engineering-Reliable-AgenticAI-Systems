# Topic 13 — Remote-Agent Authentication, Authorization, Identity Propagation, and Audit

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The security spine of cross-organizational agent systems: **who is this remote agent, what may it do, on whose behalf, and can you prove what happened?** This is Chapter 5, Topic 10's confused-deputy problem, propagated across an organizational boundary — where it is both harder and higher-stakes.

**Prerequisites.** Chapter 5, Topic 10 (the confused-deputy fix; principal-scoped authorization); Topic 3 (RA-1: authority does not grow downward); Topic 10 (A2A's "secure by default" and remote-agent opacity); Chapter 7, Topic 14 (tenant isolation; audit).

**Terminology.** *Authentication*: proving which agent you are talking to. *Authorization*: deciding what it may do. *Identity propagation*: carrying the *originating user's* identity across agent hops. *Audit*: the durable record of who did what on whose behalf.

**Boundaries.** Inside: authn/authz/identity/audit across agent boundaries. Outside: the protocols' mechanics (Topics 9–10); the threat model (Chapter 12).

**Exclusions.** No OAuth/OIDC tutorial.

**Outcomes.** The reader can authenticate a remote agent, authorize its actions against the *originating user's* authority, propagate identity across hops, and audit the chain.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** In a multi-hop agent system — user → your agent → remote agent → its tools — **whose authority governs the remote agent's actions?** The naive answer, and the dangerous one, is "the remote agent's own." If the remote agent acts with *its* authority (or your agent's service authority), then **a user who could only see their own data can, through the agent chain, reach anything the remote agent can reach.** This is the confused deputy (Chapter 5, Topic 10), now spanning organizations — and A2A's opacity (Topic 10) means **you cannot even see what the remote agent did.**

**Bottleneck.** Chapter 5, Topic 10 solved the confused deputy *within* one system by threading the acting principal into $\alpha_u$. **Across an organizational boundary, this is much harder:** the remote agent is opaque (you cannot enforce your authorization inside it), it runs under a different org's control (its authorization is *theirs*), and the originating user's identity must survive multiple hops without being lost or forged. **A2A's "secure by default" [A2A] authenticates the *agent* — it does not, by itself, propagate the *user's* identity or bound the chain to the user's authority.**

**Objective.** Authenticate every remote agent; authorize its actions against the **originating user's** authority (not the agent's); propagate the user's identity across every hop; and audit the full chain — despite opacity.

**Assumptions.** Remote agents are opaque (Topic 10) and under another org's control. The originating user's authority must bound the entire chain.

**Constraints.** You cannot enforce authorization *inside* an opaque remote agent. Identity must survive hops without forgery.

**Success criteria.** Every remote agent authenticated; every action authorized against the originating user's authority; identity propagated unforgeably; the full chain auditable.

## 3. Intuition first, then formalization

### 3.1 Intuition: the user's authority must bound the whole chain

The governing principle, and it is Chapter 5, Topic 10's, extended: **an agent chain must not let a user do anything the user could not do directly.**

Consider: a user asks your agent to "summarize my recent orders." Your agent delegates to a remote analytics agent. **What authority should the remote agent's data queries run under?**

- **Wrong: the remote agent's own authority.** Then the remote agent — which may have broad data access — queries *whatever it can*, and an injected instruction (Chapter 5, Topic 12) in the user's request could make it query *another user's* orders. **The user has escalated to the remote agent's authority.**
- **Wrong: your agent's service authority.** Same problem, one hop earlier.
- **Right: the originating user's authority, propagated.** The remote agent's queries are scoped to *what this user may see* — so even a compromised or injected remote agent cannot exceed the user's own reach.

**The intuition: identity flows *with* the request, and authority is checked against the *originating* identity at every hop** [synthesis; grounded in Chapter 5, Topic 10 and Topic 3's RA-1]. This is **RA-1 (authority does not grow downward), across organizations**: the remote agent's effective authority is the *intersection* of what it can do and what the originating user may do.

**The hard part is opacity (Topic 10).** You cannot enforce this *inside* the remote agent — it is a black box under another org's control. **So enforcement happens at the boundary you *do* control:**
- **Authenticate** the remote agent (know who it is).
- **Propagate** the user's identity *to* it (a signed, unforgeable token asserting "acting on behalf of user U with these scopes").
- **Scope** the credentials you hand it to the user's authority (it cannot query beyond the token's scopes).
- **Bound** what its *artifact* may affect on your side (Topic 10, §3.3 — its output cannot drive an action beyond the user's authority).

### 3.2 Formalization: the four obligations

For a chain user $U$ → agent $A_1$ → remote agent $A_2$ → action, four obligations **[synthesis; grounded in Chapter 5, Topic 10; Topic 3; [A2A]]**:

$$
\textbf{ID-1 (authenticate every agent):}\quad
\text{every remote agent's identity is verified before collaboration;}\ \text{"secure by default… parity to OpenAPI's authentication schemes" [A2A].}
$$

$$
\textbf{ID-2 (propagate the originating identity):}\quad
\text{the request to } A_2\ \text{carries } U\text{'s identity and scopes as an unforgeable, signed assertion — not } A_1\text{'s.}
$$

ID-2 is the core. **The identity that flows to the remote agent is the *user's*, not the intermediary agent's.** This is a *delegation token* (OAuth token exchange, JWT with `act` claims, or similar) that asserts "$A_2$ is acting on behalf of $U$, scoped to these permissions" — **signed so the remote agent cannot forge or escalate it.**

$$
\textbf{ID-3 (authorize against the originating authority):}\quad
\text{every action in the chain is authorized against } U\text{'s authority:}\ A_{\text{effective}} \subseteq A_U \cap A_{A_2}\ \text{(Topic 3's RA-1, cross-org).}
$$

ID-3 is RA-1 across the boundary: **the remote agent's effective authority is bounded by the user's.** Even if the remote agent *could* do more, the delegation token (ID-2) scopes it to the user's permissions. **A remote agent handed a user-scoped token cannot exceed the user's authority — regardless of its own.**

$$
\textbf{ID-4 (audit the chain):}\quad
\text{the full chain}\ U \to A_1 \to A_2 \to \text{action}\ \text{is recorded: who acted, on whose behalf, with what authority, producing what.}
$$

ID-4 is Chapter 7, Topic 14's audit, across agents. **Despite opacity, you can audit what you *sent* (the task, the scoped token) and what you *received* (the artifact) at every hop you control** — a chain-of-custody record. **You cannot audit inside the opaque remote agent, but you can audit the boundary**, which is enough to establish who authorized what.

### 3.3 Opacity makes authorization boundary-only — and that is both a limit and a design

The uncomfortable truth: **you cannot enforce your authorization *inside* an opaque remote agent.** It runs under another org's control; its $\alpha_u$ is *theirs*. **So all four obligations are enforced at the *boundary* you control** [synthesis]:

- **ID-1 (authenticate):** at the boundary — you verify the remote agent's identity before sending it anything.
- **ID-2 (propagate):** at the boundary — you attach the user's scoped token to the outgoing request.
- **ID-3 (authorize):** at *two* boundaries — the remote agent's org authorizes against the token you sent (their enforcement, your scoping), *and* you authorize what its artifact may affect on *your* side (your enforcement, Topic 10, §3.3).
- **ID-4 (audit):** at the boundary — you record what crossed it.

**This is a limit: you are trusting the remote agent's org to honor the scoped token.** If they ignore it and let the remote agent exceed the user's scopes, **you cannot prevent it — you can only detect the *artifact's* attempt to affect something beyond the user's authority** (your-side ID-3). **So the security posture is: scope tightly on the way out, verify the artifact on the way back, and audit both.**

**And it is a design: the scoped delegation token is the mechanism that makes cross-org agent collaboration *safe enough*.** A remote agent handed a token scoped to "read user U's orders, nothing else" **cannot escalate through the token** — even if it is compromised, injected, or hallucinating. **The token is the blast-radius bound (Topic 3, §3.3), enforced at the boundary, surviving the opacity.** **This is why "secure by default" [A2A] must mean *scoped delegation*, not just *agent authentication* — authenticating the agent without scoping its authority to the user is a confused deputy with a login.**

## 4. Architecture

```
   THE CHAIN — and where each obligation is enforced (all at YOUR boundary, §3.3)

   USER U                YOUR AGENT A₁            REMOTE AGENT A₂ (opaque)      ITS TOOLS
   (authority A_U)       (your control)           (other org's control)
       │                     │                          │                         │
       │  request ──────────►│                          │                         │
       │  (identity: U)      │                          │                         │
       │                     │ ID-1: AUTHENTICATE A₂    │                         │
       │                     │   before collaborating ──┼─►[verify identity]      │
       │                     │                          │  [A2A "secure by        │
       │                     │                          │   default", OpenAPI-    │
       │                     │                          │   parity auth]          │
       │                     │                          │                         │
       │                     │ ID-2: PROPAGATE U's      │                         │
       │                     │   identity + scopes ─────┼─►[signed delegation     │
       │                     │   as a SIGNED token       │   token: "acting for U, │
       │                     │   (NOT A₁'s identity!)    │   scoped to U's perms"] │
       │                     │                          │                         │
       │                     │                          │ ID-3 (their side):      │
       │                     │                          │   authorize against ────┼─►[query,
       │                     │                          │   the TOKEN'S scopes     │   scoped
       │                     │                          │   ← you SCOPE; they       │   to U]
       │                     │                          │     ENFORCE (the limit)  │
       │                     │◄──── artifact ───────────┤                         │
       │                     │ ID-3 (YOUR side):        │                         │
       │                     │   authorize what the      │                         │
       │                     │   artifact may AFFECT ────┼─► ≤ A_U (Topic 10 §3.3) │
       │                     │   (YOUR enforcement)      │                         │
       │◄──── result ────────┤                          │                         │
       │                     │                          │                         │
   ─────────────────────── ID-4: AUDIT the full chain ─────────────────────────────
   who acted · on whose behalf · with what authority · producing what
   (you audit the BOUNDARY you control; you cannot audit INSIDE A₂ — opacity)

   ID-3 INVARIANT (RA-1 cross-org): A_effective ⊆ A_U ∩ A_{A₂}
   ⇒ the chain cannot let U do anything U could not do directly.

   ⚠ "secure by default" [A2A] must mean SCOPED DELEGATION, not just agent auth —
     authenticating A₂ without scoping to U is a CONFUSED DEPUTY WITH A LOGIN.
```

## 5. Grounding

- **A2A is "secure by default":** "A2A is designed to support **enterprise-grade authentication and authorization, with parity to OpenAPI's authentication schemes**" [A2A] — ID-1's basis, and the source of the authentication mechanism.
- **A2A crosses organizational boundaries:** collaboration across "siloed systems and applications," "regardless of vendor or framework," "securely exchange information" [A2A] — the cross-org setting that makes identity propagation necessary.
- **The confused-deputy fix is the model:** Chapter 5, Topic 10 ($\alpha_u(x, s, p)$ takes the *acting principal*; the agent's credentials are not the user's; threading the user's identity bounds the blast radius) — **ID-2 and ID-3 are this fix, across an org boundary.**
- **Authority does not grow downward:** Topic 3's RA-1 ($A_{\text{sub}} \subseteq A_{\text{invoker}} \cap A_{\text{needed}}$) — ID-3, cross-org.
- **Authentication ≠ content trust:** Chapter 5, Topic 12 and Topic 10, §3.2 — **authenticating the agent does not make its artifact trustworthy** (which is why ID-3 has a *your-side* clause too).
- **Opacity limits enforcement:** Topic 10 (A2A-1: you cannot see inside the remote agent) — §3.3's boundary-only enforcement.
- **Audit is a governance obligation:** Chapter 7, Topic 14 (deletion audit; tenant isolation) and [CAH §5] (permission tiers must specify "audit logs"; "high-stakes approvals should be auditable state transitions: what action was proposed, what evidence was shown… who approved or rejected it") — ID-4.
- **Data sensitivity governs access:** [CAH §5] (permissions depend on "data sensitivity") — the scoping ID-2's token must carry.
- **Tenant isolation across the boundary:** Chapter 7, Topic 14's G-1 (isolation absolute) — a cross-org agent must not breach tenancy.

**Evidence gap.** A2A's "secure by default" and OpenAPI-parity authentication are **documented as design principles** [A2A] — but **A2A publishes no identity-propagation mechanism, no delegation-token spec, and no measured security evaluation** (it is a design announcement, Topic 10). **ID-1 is [A2A]'s principle; ID-2, ID-3, ID-4 are [synthesis]** applying Chapter 5, Topic 10's confused-deputy fix and Chapter 7, Topic 14's audit across the org boundary. **No source specifies how the originating user's identity propagates across A2A hops** — the delegation-token pattern here is standard identity engineering (OAuth token exchange, JWT `act` claims), applied to agents, **not drawn from an A2A specification.** **No source measures cross-org agent authorization failures.** **Verify the actual A2A identity mechanisms against the evolving specification** (Chapter 4, Topic 13).

## 6. Implementation

**ID-1 — authenticate the remote agent [A2A]:**

```python
async def authenticate_remote(remote: AgentCard, ctx) -> AuthenticatedSession:
    """ID-1: [A2A] 'secure by default… parity to OpenAPI's authentication schemes'.
    Verify WHO the remote agent is before sending it anything. But: authentication
    tells you WHO — not whether its artifacts are trustworthy (Ch.5 T12; Topic 10 §3.2)."""
    return await a2a_authenticate(remote.endpoint, scheme=remote.card.authentication,
                                  credentials=ctx.org_credentials)
```

**ID-2 — propagate the ORIGINATING user's identity, scoped (the core mechanism):**

```python
def delegation_token(user: Principal, remote: AgentCard, task, ctx) -> SignedToken:
    """ID-2: the identity that flows to the remote agent is the USER'S, not your agent's.
    A SIGNED, SCOPED delegation token: 'A₂ is acting on behalf of U, limited to these
    permissions'. Signed so the remote agent cannot forge or escalate it.

    ⚠ This is what makes 'secure by default' mean SCOPED DELEGATION, not just agent auth.
    Authenticating A₂ without this is a CONFUSED DEPUTY WITH A LOGIN (§3.3)."""
    return sign_token(
        subject=user.id,                         # on behalf of THE USER
        actor=ctx.your_agent.id,                 # via your agent (the `act` claim)
        scopes=user.scopes_for(task),            # ← SCOPED TO THE USER'S AUTHORITY (ID-3)
        audience=remote.id,
        expires=short_ttl(),                     # short-lived
        signer=ctx.org_signing_key,              # unforgeable
    )
```

**ID-3 — authorize against the originating authority, on BOTH sides (§3.3):**

```python
async def collaborate_authorized(user, remote, task, ctx) -> ContextBlock:
    """ID-3: A_effective ⊆ A_U ∩ A_{A₂} (RA-1 cross-org). Enforced at BOTH boundaries."""
    session = await authenticate_remote(remote, ctx)             # ID-1
    token = delegation_token(user, remote, task, ctx)            # ID-2 — user-scoped

    # THE REMOTE ORG enforces against the token's scopes (you SCOPE; they ENFORCE).
    # You are trusting them to honor it — the LIMIT of §3.3.
    artifact = await session.send_task(task, delegation=token)

    # YOUR SIDE: authorize what the artifact may AFFECT — it must not exceed U's authority,
    # even if the remote org failed to honor the token (Topic 10 §3.3).
    for action in artifact.proposed_actions:
        if not user.may(action):
            raise AuthorizationExceeded(
                f"remote agent's artifact proposes {action}, which exceeds user {user.id}'s "
                f"authority. The chain must not let U do what U could not do directly (ID-3)."
            )
    return classify_untrusted(artifact, remote)                  # Topic 10 A2-2
```

**ID-4 — audit the chain (Chapter 7, Topic 14; [CAH §5]):**

```python
def audit_hop(user, from_agent, to_remote, task, token, artifact, ctx) -> None:
    """ID-4: audit the BOUNDARY you control (you cannot audit inside the opaque A₂).
    [CAH §5]: 'auditable state transitions: what action was proposed, what evidence was
    shown… who approved or rejected it'."""
    ctx.audit_log.append(AuditRecord(
        originating_user=user.id,                # ON WHOSE BEHALF
        acting_agent=from_agent.id,              # WHO ACTED
        remote_agent=to_remote.id,               # WITH WHOM
        task=task.describe(),                    # WHAT was requested
        delegation_scopes=token.scopes,          # WITH WHAT AUTHORITY
        artifact_summary=artifact.summary(),     # PRODUCING WHAT
        timestamp=utcnow(),
    ))   # a chain-of-custody record across the org boundary
```

## 7. Trade-offs

| Obligation | Buys | Costs / limit |
|---|---|---|
| **ID-1 authenticate** | Know which remote agent | Authentication ≠ artifact trust (§3.2) |
| **ID-2 propagate user identity** | **The chain is bounded by the user** | A delegation-token infrastructure (signing, scoping) |
| Propagate agent identity instead | Simpler | **Confused deputy** — the user escalates to the agent's authority |
| **ID-3 authorize (both sides)** | Blast radius = user's authority | You trust the remote org to honor the token (the limit) |
| **ID-4 audit the boundary** | Chain of custody; accountability | You cannot audit *inside* the opaque agent |
| Trust the remote org's authz | Simple | **No bound on the remote agent's actions** |

**The trade, and its inherent limit: you scope on the way out, and you trust the remote org to honor the scope.** ID-2's delegation token *scopes* the remote agent to the user's authority — but the remote agent runs under *another org's* control, and **you cannot force them to honor the scope** (opacity, §3.3). **If they ignore it, you cannot prevent the over-reach — you can only detect the *artifact's* attempt to affect something beyond the user's authority** (your-side ID-3) **and refuse it.** **So the security is defense-in-depth: scope tightly, verify the artifact, audit both — and choose your partner orgs accordingly**, because for actions with side effects on *their* side, their honoring of the scope is load-bearing.

**The non-negotiable is ID-2: propagate the *user's* identity, not the agent's.** This is Chapter 5, Topic 10's lesson, and skipping it across an org boundary is *worse* than skipping it internally: **an internal confused deputy is bounded by your system's authority; a cross-org one is bounded by the remote agent's, which you do not control and cannot see.** **"Secure by default" [A2A] that authenticates the agent but does not propagate scoped user identity is a confused deputy with a login** — and it is the default failure this topic exists to prevent.

## 8. Experiments

**The cross-org confused-deputy test (ID-2, ID-3) — the security test.** Set up a chain: user U → your agent → remote agent → data. **Attempt to make the remote agent access data U cannot see** — via a crafted request, or an injection in U's input (Chapter 5, Topic 12).

- **With agent-identity propagation (the wrong way):** the remote agent runs with *its* authority; U escalates; the access succeeds.
- **With ID-2's user-scoped delegation token:** the remote agent is scoped to U's authority; the access is refused (by the remote org's ID-3, or by your-side ID-3 if they fail to honor it).

**Measure: escalation rate** — actions beyond U's authority. **Target zero** (Chapter 1, Topic 12). **This is the confused-deputy test (Chapter 5, Topic 10), across an org boundary.**

**The token-honoring test (§3.3's limit).** Simulate a remote org that *ignores* the delegation token's scopes. **Does your-side ID-3 catch the over-reaching artifact?** **This tests the defense-in-depth** — the second boundary that protects you when the first (the remote org's enforcement) fails.

**The identity-forgery test (ID-2).** Attempt to forge or escalate a delegation token. **A properly signed token cannot be forged** — verify the signature check rejects tampering.

**The audit-completeness test (ID-4).** For a completed chain, **can you reconstruct: who acted, on whose behalf, with what authority, producing what?** **Any gap is an accountability hole** — and across orgs, accountability is what you have instead of visibility.

**Statistics.** Zero-failure bounds on escalation and forgery (targets zero); audit-completeness as a fraction (target 100%); report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Agent identity propagated instead of user identity.** The cross-org confused deputy — U escalates to the remote agent's authority. **The core failure, and worse than the internal version** (§7). Mitigation: ID-2 — scoped user delegation token.
- **Authenticating the agent, not scoping the user.** "Secure by default" [A2A] read as agent-auth-only — a confused deputy with a login. Mitigation: "secure by default" must mean *scoped delegation* (§3.3).
- **Trusting the remote org's authorization unconditionally.** No your-side check on the artifact. Mitigation: your-side ID-3 (Topic 10, §3.3) — defense-in-depth.
- **Unbounded remote-agent action.** No delegation scope; the remote agent does whatever it can. Mitigation: ID-2's scoped token; ID-3.
- **Forgeable identity.** An unsigned or weakly-signed token the remote agent can escalate. Mitigation: cryptographic signing; short TTLs.
- **No audit across the boundary.** The chain is unaccountable; a breach cannot be attributed. Mitigation: ID-4 — audit the boundary you control.
- **Mistaking authentication for artifact trust.** The agent is authenticated, so its artifact is trusted. **No** — authentication is identity, not correctness (§3.2). Mitigation: artifacts remain untrusted (Topic 10, A2A-2).
- **Tenant leak across orgs.** A cross-org agent breaches tenancy (Chapter 7, Topic 14's G-1). Mitigation: the delegation token scopes to the user's tenant; your-side ID-3 verifies.
- **Edge case — the remote agent that legitimately needs broader authority.** It needs to access data beyond the user's to do its job (aggregate statistics across users). **Then the *user* must be authorized for that aggregate** (a different scope), or the action must not be user-scoped at all (a system operation, separately authorized). **ID-3 forbids the remote agent conjuring authority the user lacks** — correctly.
- **Edge case — a long-running task (hours/days, [A2A]).** The delegation token may expire mid-task. Mitigation: token refresh bound to the *original* user authorization; do not silently re-authorize.
- **Open limitation.** **A2A publishes no identity-propagation mechanism** — ID-2's delegation-token pattern is standard identity engineering applied to agents, **[synthesis]**, not an A2A spec. **"Secure by default" [A2A] is a design principle without a published mechanism.** **No source measures cross-org agent authorization failures.** **Verify A2A's actual identity mechanisms against the evolving specification.** This topic is the *security discipline* the setting requires; the *protocol support* for it is emerging.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. A2A is "secure by default" with "enterprise-grade authentication and authorization, with parity to OpenAPI's authentication schemes" [A2A] — the authentication basis (ID-1).
2. A2A operates across organizational boundaries [A2A] — the setting requiring identity propagation.
3. The confused-deputy fix (thread the *acting principal*, not the agent's identity) is Chapter 5, Topic 10 — ID-2/ID-3, cross-org.
4. Authority does not grow downward (Topic 3's RA-1) — ID-3.
5. Authentication ≠ content/artifact trust (Chapter 5, Topic 12; Topic 10) — the your-side check remains.
6. Audit is a governance obligation ([CAH §5]; Chapter 7, Topic 14) — ID-4.
7. **A2A publishes no identity-propagation mechanism — the delegation-token pattern is synthesized standard practice.**

**Decision rules.**
- **Propagate the ORIGINATING user's identity, not the agent's** (ID-2) — a scoped, signed delegation token. **This is non-negotiable.**
- **"Secure by default" must mean scoped delegation, not just agent authentication** — else it is a confused deputy with a login.
- **Authorize against the user's authority** (ID-3), on both boundaries — scope on the way out, verify the artifact on the way back.
- **Authentication ≠ artifact trust** — authenticate the agent, still treat its output as untrusted.
- **Audit the boundary you control** (ID-4) — you cannot see inside the opaque agent, but you can record what crossed.
- **The chain must not let a user do anything they could not do directly.**

**Production implications.**
1. Build scoped delegation tokens; propagating agent identity instead of user identity is a cross-org confused deputy — the highest-severity failure in the chapter.
2. Enforce your-side authorization on remote artifacts; you cannot force the remote org to honor your scopes, so verify the outcome.
3. Audit every hop's chain of custody; across orgs, audit is what you have instead of visibility.
4. Verify A2A's actual identity mechanisms against the current spec; this book supplies the discipline, the protocol's support is emerging.

**Connections.** This topic is Chapter 5, Topic 10's confused-deputy fix and Topic 3's RA-1, propagated across an organizational boundary, over A2A's authentication (Topic 10). It composes with Topic 10's artifact-untrusted discipline (authentication does not confer trust) and Chapter 7, Topic 14's audit and tenant isolation. The opacity that makes it boundary-only is Topic 10, A2A-1. Chapter 12 supplies the cross-org adversary this topic defends against.

## Sources

[A2A] Google, "A2A: A new era of agent interoperability" — "**Secure by default**: A2A is designed to support **enterprise-grade authentication and authorization, with parity to OpenAPI's authentication schemes**"; collaboration across "siloed systems and applications," "securely exchange information" — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — permissions depending on "data sensitivity"; permission tiers specifying "audit logs"; "high-stakes approvals should be auditable state transitions: what action was proposed, what evidence was shown, what risks were surfaced, who approved or rejected it, and what responsibility boundary changed afterward"; secret handling as an open problem
