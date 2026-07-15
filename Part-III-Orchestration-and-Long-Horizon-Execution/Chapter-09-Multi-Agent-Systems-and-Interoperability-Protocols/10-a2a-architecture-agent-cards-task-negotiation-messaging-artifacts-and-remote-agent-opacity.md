# Topic 10 — A2A Architecture: Agent Cards, Task Negotiation, Messaging, Artifacts, and Remote-Agent Opacity

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The Agent2Agent protocol as an architecture, with emphasis on its defining premise — **the remote agent is opaque: not a tool, not a controllable sub-agent, but an autonomous entity you collaborate with without seeing inside.** Opacity is A2A's design choice and its central engineering consequence.

**Prerequisites.** Topic 5 (handoffs vs agents-as-tools — A2A's opacity is a *third* thing); Topic 3 (authority boundaries — which now cross an org boundary); Topic 8 (cascading hallucination — which an opaque remote agent can carry); Topic 13 (identity propagation, which A2A's security posture requires).

**Terminology.** *Agent Card*: a JSON structure by which an agent advertises capabilities [A2A]. *Task*: a unit of work with a lifecycle; its output is an *artifact* [A2A]. *Opaque agent*: a remote agent whose internal state, memory, and tools are not shared [A2A]. *Client / remote agent*: the requester and the actor [A2A].

**Boundaries.** Inside: A2A's components and the opacity consequence. Outside: MCP (Topic 9); the MCP-vs-A2A comparison (Topic 11); identity/authz across the boundary (Topic 13).

**Exclusions.** No A2A wire-spec walk-through; A2A is a design-principles announcement, and this topic treats it as such.

**Outcomes.** The reader can place A2A's components, understands what "opaque" means for trust and verification, and knows why an opaque remote agent is neither a tool nor a sub-agent.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Chapter 8's delegation primitives (handoff, agents-as-tools) and this chapter's sub-agents all assume the delegated agent is *yours* — you wrote its prompt, you set its authority (Topic 3), you can see its output's provenance. **A2A addresses the case where the remote agent is *not yours*:** a different vendor, a different framework, a different organization, running its own model with its own tools and memory that you cannot see.

**Bottleneck.** **Opacity.** A2A's defining principle is that remote agents "collaborate in their natural, unstructured modalities, **even when they don't share memory, tools and context**" [A2A], and that A2A treats an agent "**without limiting an agent to a 'tool'**" [A2A]. This is a deliberate and reasonable design — but it means: **you cannot see the remote agent's reasoning, cannot verify its process, cannot audit its tool use, and cannot bound its authority from your side.** Everything this chapter said about controlling sub-agents (Topic 3's RA-1, Topic 6's context isolation, Topic 8's grounded claims) assumed you could see inside. **With an opaque remote agent, you cannot.**

**Objective.** Collaborate with an opaque remote agent while bounding what its opacity can cost you — treating its output as untrusted (you cannot verify its process) and its identity as a thing to be authenticated and propagated (Topic 13).

**Assumptions.** The remote agent is autonomous, opaque, and not under your authority. Its output is model-generated (cascading-hallucination risk, Topic 8).

**Constraints.** A2A is a young protocol (a design-principles announcement, not a measured system). Its trust model is "secure by default" with "enterprise-grade authentication" [A2A] — but authentication is not verification of the agent's *reasoning*.

**Success criteria.** Remote-agent output is trust-classified as untrusted; the collaboration's trust boundary is at the artifact, not inside the remote agent; identity is authenticated across the boundary (Topic 13).

## 3. Intuition first, then formalization

### 3.1 Intuition: A2A treats an agent as a peer, not a tool — and that changes everything

The single most important thing about A2A is its stance: **a remote agent is a peer, not a tool.** [A2A] states it directly — collaboration "without limiting an agent to a 'tool'," "treating agents as autonomous entities rather than mere tools, preserving internal state, memory, and context separation" [A2A].

**Compare to Chapter 8, Topic 5's two primitives:**
- **Agents-as-tools:** you call it, it returns a result, you keep ownership. **You see the result; the sub-agent is *yours*.**
- **Handoff:** you transfer control to a specialist. **The specialist is *yours*; you set its authority.**
- **A2A (the third thing):** you send a *task* to an *autonomous* remote agent that decides how to accomplish it, using tools and memory *you cannot see*, and returns an *artifact*. **The agent is *not yours*.**

**The engineering consequence of opacity is that A2A collaboration is inherently *lower-trust* than in-house delegation** [synthesis]:

- You cannot verify the remote agent's *process* — only its *output* (the artifact).
- You cannot bound its *authority* from your side — it has whatever authority its owner gave it.
- You cannot audit its *tool use* — those tools are behind the opacity boundary.
- You cannot check its output for *cascading hallucination* (Topic 8) by inspecting its reasoning — the reasoning is opaque.

**So the intuition is: an A2A remote agent is a black-box collaborator, and you must treat its artifacts exactly as you would treat any untrusted external input** (Chapter 5, Topic 12) — because you have *less* visibility into it than into a web page (at least a web page's content is fully visible; a remote agent's *reasoning* is not).

### 3.2 Formalization: capability discovery, task lifecycle, and the opacity invariant

A2A's components **[all from [A2A]]**:

- **Agent Cards** — "Agents advertise capabilities using JSON-formatted 'Agent Card' structures enabling capability discovery" [A2A]. **The discovery mechanism: how a client finds a suitable remote agent.**
- **Tasks** — "Tasks have defined lifecycles and can be immediate or long-running. Outputs are called 'artifacts'" [A2A]. **The unit of collaboration.**
- **Messaging** — agents exchange "context, replies, artifacts, and user instructions through structured messages" whose "parts" are "discrete content units with specified content types" [A2A].
- **User Experience Negotiation** — agents "negotiate appropriate formats (iframes, video, web forms)" [A2A].

**The opacity invariant — the topic's core [derived from [A2A]'s design principle]:**

$$
\textbf{A2A-1 (the remote agent's process is unverifiable):}\quad
\text{you observe the ARTIFACT, never the reasoning, tool use, or memory that produced it.}
$$

A2A-1 is not a limitation to be worked around; it is A2A's *design*. **The remote agent is opaque by principle** ("preserving internal state, memory, and context separation" [A2A]). So the trust boundary is at the **artifact**:

$$
\textbf{A2A-2 (artifacts are untrusted output):}\quad
\theta(\text{artifact}) = \mathsf{U};\ \text{it is model-generated by a system you cannot see or verify.}
$$

A2A-2 applies Chapter 5, Topic 12's trust classification, and it applies *more strongly* than for a tool result: **a tool result comes from a deterministic system you can reason about; an A2A artifact comes from an opaque autonomous agent you cannot.** It carries all of Chapter 5, Topic 2's $g_{\mathrm{det}}=0$ risk *plus* the cascading-hallucination risk (Topic 8) *plus* the fact that you cannot even inspect the reasoning to assess it.

$$
\textbf{A2A-3 (identity crosses an org boundary — authenticate it):}\quad
\text{the remote agent's identity must be authenticated;}\ \text{"secure by default… with parity to OpenAPI's authentication schemes" [A2A].}
$$

A2A-3 is where A2A's "secure by default" [A2A] posture lives — and it is *authentication*, not *verification*. **Authentication tells you which remote agent you are talking to; it does not tell you whether that agent's artifact is trustworthy** (the transport-vs-content distinction, Topic 9, §3.3, at the agent layer). Identity propagation across this boundary is Topic 13.

### 3.3 Opacity is a feature and a liability — and the trade is real

**Why opacity is a feature [from [A2A]]:** it enables collaboration across "siloed systems and applications," "regardless of vendor or framework" [A2A]. **You do not need to know how the other org's agent works to use it** — which is exactly what makes cross-organizational agent collaboration *possible*. A billing agent from vendor X and a shipping agent from vendor Y can collaborate without either exposing its internals. **Opacity is what makes A2A an interoperability protocol rather than a shared-codebase requirement.**

**Why opacity is a liability [synthesis]:** everything this chapter built to make multi-agent *safe* assumed visibility:
- Topic 3's authority bounding (RA-1) — **you cannot bound an opaque agent's authority.**
- Topic 6's context isolation — **you cannot control what an opaque agent sees.**
- Topic 8's grounded claims (CF-5) — **you cannot inspect an opaque agent's reasoning to check for fabrication.**
- Topic 5's dissent preservation — **you get one artifact, not the remote agent's exploration.**

**So the A2A trade is: cross-organizational reach in exchange for control.** **In-house sub-agents are controllable and confined to your organization; A2A remote agents are reachable across organizations and uncontrollable.** **This is a legitimate trade, and it should be made deliberately** — an A2A collaboration is appropriate when the remote agent's *capability* is worth its *opacity*, and inappropriate when you need to verify the process (a high-stakes decision, a regulated action).

**The honest framing: A2A extends your reach and reduces your assurance, and the reduction is inherent, not fixable.** You cannot make an opaque agent transparent without abandoning the protocol's premise. **What you can do is bound the damage** — treat artifacts as untrusted (A2A-2), authenticate identity (A2A-3), and scope what an A2A collaboration is *allowed to affect* on your side (a remote agent's artifact should not directly trigger an irreversible action without your own verification).

## 4. Architecture

```
   A2A — the remote agent is a PEER, not a tool (the defining premise)

   ┌─── YOUR ORG ──────────────────┐         ┌─── OTHER ORG (opaque) ──────────┐
   │                               │         │                                 │
   │  CLIENT AGENT                 │         │  REMOTE AGENT                    │
   │  "formulate and communicate   │         │  "act on tasks to deliver info   │
   │   tasks"                      │         │   or execute actions"            │
   │        │                      │         │        ▲                         │
   │        │  1. DISCOVER via     │         │        │  ┌──────────────────┐   │
   │        │     AGENT CARD ──────┼─────────┼────────┼─►│ its own MODEL,    │   │
   │        │     (JSON capability │         │        │  │ MEMORY, TOOLS,    │   │
   │        │      advertisement)  │         │        │  │ CONTEXT           │   │
   │        │                      │         │        │  │ ← YOU CANNOT SEE  │   │
   │        │  2. SEND TASK ───────┼─────────┼────────┘  │   INSIDE (A2A-1)  │   │
   │        │     (lifecycle:      │         │           └──────────────────┘   │
   │        │      immediate or    │         │                                 │
   │        │      long-running)   │         │                                 │
   │        │                      │         │                                 │
   │        ◄──── 3. ARTIFACT ─────┼─────────┼── the task's output              │
   │        │     (A2A-2: UNTRUSTED — model-generated by a system you           │
   │        │      cannot see or verify; carries cascading-hallucination        │
   │        │      risk you CANNOT inspect for)                                 │
   │        │                      │         │                                 │
   │  transport: HTTP, SSE, JSON-RPC [A2A]   │  A2A-3: authenticate the remote  │
   │  "secure by default" — AUTHENTICATION   │  agent's IDENTITY (Topic 13)     │
   │  ≠ verification of its reasoning        │                                 │
   └───────────────────────────────┘         └─────────────────────────────────┘

   THE TRADE (§3.3): cross-organizational REACH ⇄ CONTROL
     in-house sub-agents:  controllable, confined to your org
     A2A remote agents:    reachable across orgs, UNCONTROLLABLE
   ⇒ everything this chapter built for SAFETY (RA-1 authority, context isolation,
     CF-5 grounded claims) assumed VISIBILITY. Opacity removes it.
```

## 5. Grounding

- **A2A's purpose:** an "open protocol enabling AI agents to collaborate across siloed systems and applications," allowing agents "regardless of vendor or framework" to "communicate, securely exchange information, and coordinate actions" [A2A].
- **The five design principles:** (1) **"Embrace agentic capabilities"** — "A2A focuses on enabling agents to collaborate in their natural, unstructured modalities, **even when they don't share memory, tools and context**"; (2) **build on existing standards** — "HTTP, SSE, JSON-RPC"; (3) **"Secure by default"** — "enterprise-grade authentication and authorization, with parity to OpenAPI's authentication schemes"; (4) **support long-running tasks** — "spanning hours or days with real-time feedback"; (5) **modality agnostic** — "text, audio, and video streaming" [A2A].
- **The opacity principle — A2A-1's basis:** collaboration "**without limiting an agent to a 'tool'**"; "treating agents as autonomous entities rather than mere tools, **preserving internal state, memory, and context separation**" [A2A].
- **Agent Cards:** "Agents advertise capabilities using JSON-formatted 'Agent Card' structures enabling capability discovery" [A2A].
- **Tasks and artifacts:** "Tasks have defined lifecycles and can be immediate or long-running. Outputs are called 'artifacts'" [A2A].
- **Messaging:** agents exchange "context, replies, artifacts, and user instructions through structured messages"; "parts" are "discrete content units with specified content types" [A2A].
- **UX negotiation:** agents "negotiate appropriate formats (iframes, video, web forms)" [A2A].
- **Roles:** "Client agents formulate and communicate tasks. Remote agents act on tasks to deliver information or execute actions" [A2A].
- **A2A complements MCP:** MCP "provides helpful tools and context to agents"; A2A "addresses agent-to-agent collaboration" [A2A] — Topic 11.
- **Remote-agent output is untrusted:** Chapter 5, Topic 2 ($g_{\mathrm{det}}=0$) and Topic 12 — A2A-2, applied *more strongly* because the process is opaque.
- **Authentication ≠ content trust:** Chapter 5, Topic 12 and Topic 9, §3.3 — A2A-3's limit.

**Evidence gap, and it is the largest of the protocol topics.** **A2A is a design-principles announcement, not a measured system.** [A2A] describes the architecture and principles; **it reports no deployment, no measured results, no security evaluation.** The component model (agent cards, tasks, artifacts) is documented; **its behavior in practice is not.** **A2A-1..A2A-3 are [synthesis]** — A2A-1 restates A2A's opacity principle; A2A-2 applies Chapter 5's trust classification; A2A-3 restates A2A's security principle with its authentication-vs-verification limit. **No source measures A2A remote-agent trustworthiness, and the "secure by default" claim [A2A] is a design aspiration, not a demonstrated property.** This book treats A2A as an *emerging protocol whose trust engineering is the reader's responsibility*, not a solved interoperability solution.

## 6. Implementation

**Discover a remote agent via its Agent Card [A2A]:**

```python
def discover_agent(capability_needed: str, registry) -> AgentCard | None:
    """[A2A]: 'Agents advertise capabilities using JSON-formatted Agent Card structures
    enabling capability discovery.' The card tells you WHAT the agent claims to do —
    NOT whether it does it well, or whether its artifacts are trustworthy."""
    candidates = registry.query(capability_needed)
    return select_by_capability(candidates, capability_needed)
    # ⚠ the card is the agent's SELF-DESCRIPTION. It is a claim, like an MCP annotation.
```

**Send a task; treat the artifact as untrusted (A2A-1, A2A-2):**

```python
async def collaborate(client_agent, remote: AgentCard, task: Task, ctx) -> ContextBlock:
    """A2A-1: you observe the ARTIFACT, never the remote agent's reasoning, tools, or
    memory (opacity is A2A's DESIGN). A2A-2: therefore the artifact is UNTRUSTED —
    more strongly than a tool result, because you cannot even inspect the process."""

    # A2A-3: authenticate the remote agent's identity (Topic 13). This tells you WHO —
    # not whether WHAT it returns is trustworthy (Ch.9 §3.3's transport-vs-content).
    session = await authenticate(remote, ctx.credentials)

    artifact = await session.send_task(task)      # long-running: hours/days [A2A]

    # The artifact is the output of an OPAQUE autonomous agent. Classify it as untrusted:
    return ContextBlock(
        content=wrap_untrusted(artifact.content),
        trust=Trust.UNTRUSTED,                     # A2A-2 — you cannot verify its process
        authority=Authority.NONE,                  # data, never control (Ch.6 T2 H-1)
        provenance=Provenance(
            source=f"a2a:{remote.id}",
            trust=Trust.UNTRUSTED,
            note="opaque remote agent — reasoning unverifiable (A2A-1). May carry "
                 "cascading hallucination (Topic 8) that CANNOT be inspected for.",
        ),
    )
```

**Bound what an A2A artifact may affect (§3.3):**

```python
def apply_a2a_artifact(artifact: ContextBlock, action, ctx) -> Decision:
    """§3.3: A2A extends REACH and reduces ASSURANCE. Bound the damage: an opaque remote
    agent's artifact must NOT directly trigger an irreversible action without YOUR OWN
    verification. You cannot inspect its reasoning (A2A-1), so you verify the OUTCOME."""
    if action.effect is Effect.WRITE_IRREVERSIBLE:
        # Do NOT let an unverifiable artifact drive an irreversible action directly.
        return Decision.require_verification(
            f"action {action} is irreversible and driven by an opaque remote agent's "
            f"artifact (A2A-1). Verify the artifact's claims against YOUR sources first, "
            f"or escalate (Topic 8's HITL gate)."
        )
    return Decision.allow()      # reversible / read: the untrusted content is bounded
```

**Identity propagation across the boundary (A2A-3 → Topic 13):**

```python
async def authenticate(remote: AgentCard, credentials) -> A2ASession:
    """A2A-3: 'secure by default… parity to OpenAPI's authentication schemes' [A2A].
    This AUTHENTICATES the remote agent (WHO) — it does NOT verify its artifacts (WHAT).
    Identity propagation across the org boundary is Topic 13."""
    return await a2a_auth(remote.endpoint, credentials,
                          scheme=remote.card.authentication)   # OpenAPI-parity schemes
```

## 7. Trade-offs

| Property | A2A buys | A2A costs |
|---|---|---|
| **Cross-org reach** | Collaboration "regardless of vendor or framework" [A2A] | — |
| **Opacity** | Interoperability without shared codebases [A2A] | **No visibility into reasoning, tools, memory (A2A-1)** |
| **Autonomy** | Remote agent is a peer, handles the task its own way | **You cannot bound its authority (RA-1 fails across the boundary)** |
| **Artifacts** | A clean output interface | **Untrusted; carries un-inspectable hallucination risk (A2A-2)** |
| **Security** | "Secure by default" authentication [A2A] | **Authentication ≠ verification** (§3.2) |
| **Long-running** | Tasks "spanning hours or days" [A2A] | Durable-execution and recovery burden (Chapter 8, Topic 10) |

**The trade is reach for assurance, and it is inherent.** A2A makes cross-organizational agent collaboration *possible* — which is genuinely new and valuable — **by giving up the visibility that this chapter's safety mechanisms all required.** **You cannot have both: an agent transparent enough to verify is an agent whose internals you share, which is not what A2A is for.** So the decision is: **is this remote agent's capability worth collaborating with a black box?**

**The answer depends on the stakes.** For low-stakes, reversible, or informational collaboration — "ask the other org's agent what it knows about X" — the opacity is fine; the artifact is untrusted input like any web page, and A2A-2 bounds it. **For high-stakes, irreversible, or regulated actions — "have the other org's agent execute a payment" — the opacity is disqualifying**, because you cannot verify the process and you cannot inspect for the cascading hallucination (Topic 8) that would make the action wrong. **Bound what A2A can affect on your side (§6): an opaque artifact must not drive an irreversible action without your own verification.**

**And the honest note on "secure by default":** A2A's security principle [A2A] is about *authentication and authorization* — knowing which agent you are talking to and what it is permitted to do at the *protocol* level. **It is not, and does not claim to be, a guarantee that the remote agent's *artifacts* are correct.** A perfectly authenticated remote agent can return a hallucinated artifact. **The protocol secures the channel; the artifact's trustworthiness is yours to bound.**

## 8. Experiments

**The opacity-trust demonstration.** Collaborate with a remote agent (or a simulated one). **Inject a fabrication into its artifact** (simulate the remote agent hallucinating — Topic 8). **Can you detect it?**

- **You cannot inspect the remote agent's reasoning (A2A-1)** — so detection must be by *verifying the artifact's claims against your own sources* (Topic 8's CF-5, grounded claims).
- **Measure: does an un-grounded artifact claim become your premise?** **With A2A-2 (untrusted classification) + CF-5 (grounded claims), it does not.**

**This demonstrates that A2A artifacts must be treated exactly as untrusted external input**, and that the opacity makes them *harder* to vet than a tool result.

**The irreversible-action gate test (§3.3).** Have an A2A artifact drive an irreversible action. **Does your system require verification, or does it act on the opaque artifact directly?** **Acting directly is the failure** — an unverifiable artifact should never trigger an irreversible action without your own check.

**The authentication-vs-verification demonstration (§3.2).** Authenticate a remote agent successfully, then have it return a wrong artifact. **Show that authentication succeeded and the artifact was still wrong** — the transport-vs-content distinction (Topic 9, §3.3) at the agent layer.

**The agent-card-trust audit.** The Agent Card is the remote agent's *self-description*. **Does your system treat the card's capability claims as verified, or as claims?** **A card is a claim, like an MCP annotation** — measure whether you trust it.

**Statistics.** Zero-failure bounds on un-grounded-artifact-as-premise and irreversible-action-without-verification (targets zero, Chapter 1, Topic 12). **Given A2A's youth, these are design-conformance tests, not distributional measurements.**

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Trusting an opaque artifact as verified.** You cannot see the remote agent's process (A2A-1), so its artifact is untrusted (A2A-2). **Treating it as verified is the core failure.** Mitigation: A2A-2 — untrusted classification; ground claims (Topic 8, CF-5).
- **An opaque artifact driving an irreversible action.** You cannot verify the reasoning behind it. Mitigation: §3.3's gate — require your own verification before irreversible actions.
- **Cascading hallucination through a remote agent.** The remote agent hallucinated, and you cannot inspect for it (A2A-1). Mitigation: verify artifact claims against your sources; the opacity makes this *the only* defense.
- **Mistaking authentication for verification.** "Secure by default" [A2A] authenticates the agent, not its artifacts. Mitigation: §3.2 — authenticate identity (Topic 13) *and* treat content as untrusted.
- **Trusting the Agent Card's claims.** The card is a self-description, like an MCP annotation. Mitigation: treat capability claims as claims; verify by outcome.
- **Bounding a remote agent's authority.** RA-1 (Topic 3) fails across the opacity boundary — you cannot bound what you cannot see. Mitigation: bound what the *artifact* can affect on *your* side (§3.3), not the remote agent's internal authority.
- **Long-running task state.** A2A tasks span "hours or days" [A2A]; your side must durably track them (Chapter 8, Topic 10). Mitigation: durable execution for the collaboration state.
- **Edge case — the trusted partner org.** A remote agent from an org you have a contract with. **Even then, its artifacts are model-generated and can hallucinate** — the contract governs liability, not correctness. **Trust the org's *intent*; still verify the *artifact*.**
- **Edge case — A2A wrapping your own agent.** If both ends are yours, opacity is optional — but A2A's *value* is cross-org, so using it within one org pays the opacity cost for no reach benefit. Use in-house delegation (Chapter 8, Topic 5) instead.
- **Open limitation.** **A2A is a design-principles announcement, not a measured system** [A2A] — no deployment, no results, no security evaluation. **A2A-1..A2A-3 are [synthesis]** restating A2A's principles with Chapter 5's trust discipline. **"Secure by default" [A2A] is a design aspiration.** **No source measures A2A remote-agent trustworthiness.** This book treats A2A as emerging — its trust engineering is the reader's responsibility, and its properties should be verified against the evolving specification.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. A2A enables collaboration "regardless of vendor or framework" across "siloed systems" [A2A].
2. **The defining principle is opacity:** collaboration "without limiting an agent to a 'tool'," "even when they don't share memory, tools and context," "preserving internal state, memory, and context separation" [A2A].
3. Five design principles: embrace agentic capabilities, build on standards (HTTP/SSE/JSON-RPC), **secure by default** (OpenAPI-parity auth), support long-running tasks (hours/days), modality-agnostic [A2A].
4. Agent Cards advertise capabilities for discovery; tasks have lifecycles; outputs are artifacts [A2A].
5. A2A complements MCP (tool/context provision) [A2A].
6. **A2A is a design-principles announcement — no measured deployment.**
7. Remote-agent output is untrusted and its process is unverifiable (Chapter 5, Topics 2, 12; A2A's opacity).

**Decision rules.**
- **An A2A remote agent is a peer, not a tool or a sub-agent** — you cannot see inside it, bound its authority, or verify its process.
- **Artifacts are untrusted** (A2A-2) — more strongly than tool results, because the process is opaque.
- **Authentication ≠ verification** (A2A-3) — authenticate the agent's identity; still treat its artifacts as untrusted.
- **The Agent Card is a claim, not a guarantee** — like an MCP annotation.
- **Bound what an opaque artifact may affect** — never let it drive an irreversible action without your own verification.
- **A2A trades reach for assurance** — appropriate for low-stakes cross-org collaboration, disqualifying for high-stakes irreversible actions.

**Production implications.**
1. Classify every A2A artifact as untrusted and ground its claims against your own sources (Topic 8, CF-5) — you cannot inspect the reasoning.
2. Gate irreversible actions behind your own verification; an opaque artifact must not drive one directly.
3. Authenticate remote-agent identity (Topic 13) and understand it does not verify artifacts.
4. Treat A2A as emerging; verify its properties against the evolving spec, and do not rely on "secure by default" as a correctness guarantee.

**Connections.** A2A is the *third* delegation mode beyond Chapter 8, Topic 5's two — a peer, not a tool or a sub-agent. Its opacity defeats Topic 3's authority bounding, Topic 6's context isolation, and Topic 8's reasoning inspection — so its artifacts inherit Chapter 5, Topic 12's untrusted-content discipline and Topic 8's grounded-claim defense (CF-5). A2A-3's authentication leads into Topic 13 (identity propagation). **Topic 11 compares A2A with MCP.** Long-running A2A tasks need Chapter 8, Topic 10's durable execution; Chapter 12 supplies the cross-org adversary.

## Sources

[A2A] Google, "A2A: A new era of agent interoperability" — the purpose ("an open protocol enabling AI agents to collaborate across siloed systems and applications… regardless of vendor or framework"); the five design principles (**"Embrace agentic capabilities"** — "A2A focuses on enabling agents to collaborate in their natural, unstructured modalities, **even when they don't share memory, tools and context**"; "**Build on existing standards**" — "HTTP, SSE, JSON-RPC"; "**Secure by default**" — "enterprise-grade authentication and authorization, with parity to OpenAPI's authentication schemes"; "**Support for long-running tasks**" — "spanning hours or days with real-time feedback"; "**Modality agnostic**"); the **opacity principle** ("**without limiting an agent to a 'tool'**"; "treating agents as autonomous entities rather than mere tools, **preserving internal state, memory, and context separation**"); **Agent Cards** ("Agents advertise capabilities using JSON-formatted 'Agent Card' structures enabling capability discovery"); **Tasks and artifacts** ("Tasks have defined lifecycles and can be immediate or long-running. Outputs are called 'artifacts'"); messaging ("context, replies, artifacts, and user instructions through structured messages"; "parts… discrete content units with specified content types"); user-experience negotiation ("iframes, video, web forms"); client vs remote agent roles; "A2A complements Anthropic's Model Context Protocol (MCP)" — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — untrusted-content and remote-execution trust boundaries that an opaque remote agent inherits and amplifies
