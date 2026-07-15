# Topic 11 — MCP versus A2A: Tool/Context Interoperability versus Agent-to-Agent Collaboration

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The relationship between the two protocols — which the sources are explicit about: **they are complementary, not competing.** MCP connects an agent to *tools and context*; A2A connects an agent to *other agents*. The distinction is not a turf war; it is a clean layering, and confusing them is the error to avoid.

**Prerequisites.** Topic 9 (MCP architecture and trust); Topic 10 (A2A architecture and opacity); Chapter 5, Topic 2 (the tool-type taxonomy, where agents-as-tools already sat next to MCP tools).

**Terminology.** As Topics 9–10. The one new distinction: *tool-shaped* (MCP — you call it, it returns) versus *agent-shaped* (A2A — you collaborate with a peer).

**Boundaries.** Inside: the comparison, the layering, and when to use each. Outside: each protocol's internals (Topics 9–10); identity across A2A (Topic 13).

**Exclusions.** No protocol-war editorializing; the sources say they complement, and this book reports that.

**Outcomes.** The reader can place a given integration need on the tool/context axis or the agent axis, and knows the two can compose (an A2A remote agent that itself uses MCP tools).

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Faced with two interoperability protocols, teams ask "which one?" — as if they were alternatives. **They are not.** [A2A] states it directly: **"A2A complements Anthropic's Model Context Protocol (MCP), which provides helpful tools and context to agents"** [A2A]. **MCP and A2A answer different questions**, and a system often needs both.

**Bottleneck.** The confusion is a *layering* confusion, and it produces two errors: **(a) using MCP for agent collaboration** — wrapping an autonomous agent as an MCP "tool," which strips its agency (A2A's whole point is *not* doing this: "without limiting an agent to a 'tool'" [A2A]); and **(b) using A2A for tool access** — treating a database or a file system as a "remote agent," which adds opacity and coordination overhead to what should be a simple tool call. **Each error applies the wrong protocol's trust model and cost model to the wrong problem.**

**Objective.** Place each integration need on the correct axis — is this a *tool/context* need (MCP) or an *agent collaboration* need (A2A)? — and compose them where a system needs both.

**Assumptions.** The two protocols coexist and compose. Each has its own trust boundary (Topics 9–10).

**Constraints.** Both are young; A2A especially (a design announcement, Topic 10).

**Success criteria.** Integration needs are placed on the right axis; the two protocols compose cleanly where both are needed; neither is misapplied to the other's problem.

## 3. Intuition first, then formalization

### 3.1 Intuition: MCP is "what can I use," A2A is "who can I work with"

The cleanest way to hold the distinction:

- **MCP answers: *what tools and context can my agent use?*** A database, a file system, a search API, a SaaS integration. **The thing on the other end is a *capability*, not a collaborator.** You call it; it returns; you keep ownership (this is Chapter 8, Topic 5's agents-as-tools ownership, at the protocol layer). **MCP is a plug for capabilities.**

- **A2A answers: *which other agents can my agent work with?*** A different org's billing agent, a partner's research agent. **The thing on the other end is a *peer*, autonomous and opaque** (Topic 10). You send it a task; it decides how; it returns an artifact. **A2A is a protocol for collaboration.**

The intuition that makes the choice automatic: **ask whether the other end has *agency you want to preserve*.**
- A database has no agency — it does what you ask. **MCP.**
- Another org's agent has agency — it decides how to accomplish a task using its own judgment, tools, and memory. **A2A**, and A2A exists precisely to *not* strip that agency by forcing it into a tool shape.

**The two errors, restated as intuition failures:**
- **Wrapping an agent as an MCP tool** treats a collaborator as a capability — you lose its agency, its ability to negotiate, its autonomy. **You have hired an expert and handed them a script.**
- **Treating a tool as an A2A agent** treats a capability as a collaborator — you add opacity, task-lifecycle overhead, and coordination cost to what should be a function call. **You have made a database into a black box you negotiate with.**

### 3.2 Formalization: the two axes and the composition

The two protocols occupy orthogonal axes **[synthesis; the complementarity is [A2A]'s]**:

$$
\textbf{MCP axis:} \quad \text{agent} \longrightarrow \text{tools / context (capabilities)}
$$
$$
\textbf{A2A axis:} \quad \text{agent} \longleftrightarrow \text{agents (collaborators)}
$$

**They are orthogonal, and they compose [derived from [A2A]'s "complements"]:**

$$
\textbf{MA-1 (the protocols layer, they do not compete):}\quad
\text{an A2A remote agent may ITSELF use MCP tools;}\ \text{a system may use both simultaneously.}
$$

MA-1 is the key structural fact. **An A2A remote agent, behind its opacity boundary (Topic 10), uses MCP to access *its* tools and context.** You collaborate with it via A2A; it uses MCP internally — **and you cannot see that (opacity, A2A-1).** So a full cross-org agent system is *both*: A2A between the agents, MCP within each. **They are not alternatives; they are different layers of the same stack.**

**The placement rule:**

$$
\textbf{MA-2 (place by agency):}\quad
\text{the other end has agency you want to preserve} \Rightarrow \text{A2A};\quad
\text{it is a capability you invoke} \Rightarrow \text{MCP}.
$$

MA-2 is the decision. And it maps onto the trust models: **MCP's trust boundary is at the *content* the server supplies (Topic 9); A2A's is at the *artifact* the opaque agent returns (Topic 10).** Both are untrusted-when-third-party, but for different reasons — MCP because the server authored the content, A2A because the agent's process is opaque. **The trust discipline is the same (Chapter 5, Topic 12); the *reason* differs.**

### 3.3 The comparison table, and what each protocol does NOT do

The clean comparison **[synthesis; each cell grounded in Topics 9–10]**:

| Dimension | MCP | A2A |
|---|---|---|
| **Question answered** | What tools/context can my agent use? | Which agents can my agent work with? |
| **Other end is** | A capability (tool/resource/prompt) | A peer (autonomous, opaque) |
| **Ownership** | You call it; you keep ownership | Collaboration; it owns its process |
| **Visibility** | You see the tool's result | You see only the artifact (opaque, A2A-1) |
| **Agency** | None — it does what you ask | **Preserved — "without limiting an agent to a 'tool'"** [A2A] |
| **Trust boundary** | The server's content (Topic 9) | The remote agent's artifact (Topic 10) |
| **Trust reason** | Server authored the content | Agent's process is opaque |
| **Interaction** | Request/response (a call) | Task lifecycle (immediate or "hours or days" [A2A]) |
| **Complements** | A2A [A2A] | MCP [A2A] |

**What MCP does NOT do:** it does not preserve agency. An MCP "tool" is invoked, not collaborated with. **If you need the other end to *decide* how to do something, MCP is the wrong protocol** — you would be forcing an agent into a tool shape, which is exactly what A2A was created to avoid.

**What A2A does NOT do:** it does not give you visibility or control. An A2A remote agent is opaque (Topic 10). **If you need to verify the process, bound the authority, or inspect the reasoning, A2A cannot** — and for a simple capability (a database query), A2A's opacity and lifecycle overhead are pure cost.

**The honest summary: MCP for capabilities, A2A for collaborators, and both together for cross-org agent systems.** The protocols are young — MCP more established, A2A a design announcement (Topic 10) — but the *layering* is clean, and it is the sources' own framing.

## 4. Architecture

```
   THE TWO AXES ARE ORTHOGONAL AND THEY COMPOSE (MA-1)

   ┌─── YOUR AGENT ─────────────────────────────────────────────────────────┐
   │                                                                        │
   │   MCP axis (DOWN — capabilities):                                       │
   │      agent ──► MCP ──► [ database ][ file system ][ search ][ SaaS ]    │
   │                        ← CAPABILITIES you invoke; you keep ownership     │
   │                          (Ch.8 T5's agents-as-tools, at protocol layer)  │
   │                                                                        │
   │   A2A axis (SIDEWAYS — collaborators):                                  │
   │      agent ◄──► A2A ◄──► [ other org's agent (OPAQUE peer) ]            │
   │                          ← COLLABORATOR; agency preserved; you see       │
   │                            only the ARTIFACT (Topic 10, A2A-1)          │
   └────────────────────────────────────────────────────────────────────────┘

   THE COMPOSITION (MA-1) — a full cross-org system is BOTH:
   ┌─── YOUR ORG ──────────┐              ┌─── OTHER ORG (opaque) ──────────┐
   │  your agent           │              │  remote agent                    │
   │    │ MCP              │    A2A        │    │ MCP  ← it uses MCP for ITS   │
   │    ▼                  │◄────────────►│    ▼        tools — and you       │
   │  [your tools]         │              │  [its tools] CANNOT see this      │
   └───────────────────────┘              └──────────────────────────────────┘

   MA-2 PLACEMENT RULE — ask: does the other end have AGENCY you want to preserve?
      ┌──────────────────────────────────┬──────────────────────────────────┐
      │ NO — it's a capability            │ YES — it's a collaborator         │
      │  (database, file, API)            │  (another org's autonomous agent)  │
      │  → MCP                            │  → A2A                            │
      └──────────────────────────────────┴──────────────────────────────────┘

   THE TWO ERRORS:
     ✗ agent-as-MCP-tool  = hiring an expert and handing them a script
       (strips agency — the exact thing A2A avoids)
     ✗ tool-as-A2A-agent  = making a database into a black box you negotiate with
       (adds opacity + lifecycle overhead to a function call)
```

## 5. Grounding

- **The complementarity, stated by the source:** **"A2A complements Anthropic's Model Context Protocol (MCP), which provides helpful tools and context to agents"** [A2A]. **This is the topic's foundation — the sources say complement, not compete.**
- **MCP's role:** "provides helpful tools and context to agents" [A2A]; the tool/resource/prompt provision layer (Topic 9).
- **A2A's role:** "addresses agent-to-agent collaboration" [A2A]; the peer-collaboration layer (Topic 10).
- **A2A explicitly does NOT treat agents as tools:** collaboration "**without limiting an agent to a 'tool'**"; "treating agents as autonomous entities rather than mere tools" [A2A] — **the design decision that distinguishes A2A from wrapping an agent as an MCP tool.**
- **Agents-as-tools is already a distinct thing from a remote peer:** Chapter 5, Topic 2 (agents-as-tools as a tool type, $g_{\mathrm{det}}=0$) and Chapter 8, Topic 5 (the ownership distinction) — **A2A is the *third* mode: not a tool, not an owned sub-agent, but an opaque peer.**
- **Both trust models are Chapter 5, Topic 12's:** MCP content untrusted because the server authored it (Topic 9); A2A artifacts untrusted because the process is opaque (Topic 10) — **same discipline, different reason.**
- **MCP is the more established protocol; A2A is emerging:** MCP has a specification and wide adoption (Chapter 5, Topic 2); A2A is a design-principles announcement (Topic 10). **The layering is clean regardless of maturity.**

**Evidence gap.** The *complementarity* is explicitly stated by [A2A] — **this is the best-grounded claim in the topic.** The *placement rule* (MA-2) and the *composition* (MA-1) are **[synthesis]** — MA-1 follows directly from "complements" (an A2A agent using MCP internally is the obvious composition); MA-2 formalizes the tool-vs-agent distinction the sources draw. **No source measures the two protocols against each other** (they are not alternatives, so there is nothing to measure), and **no source reports a deployed system using both** — the composition is architecturally clean and, as far as this book's ledger shows, undemonstrated at scale. A2A's youth (Topic 10) means the composition is more design than practice.

## 6. Implementation

**The placement decision (MA-2):**

```python
def choose_protocol(integration_need) -> str:
    """MA-2: ask whether the other end has AGENCY you want to preserve.
    A capability you invoke → MCP. An autonomous collaborator → A2A."""
    if integration_need.other_end_decides_how:
        # It has judgment, its own tools/memory, and autonomy you want to preserve.
        # Forcing it into a tool shape STRIPS that agency — the exact thing A2A avoids.
        return "A2A"       # a collaborator (Topic 10)
    else:
        # It does what you ask — a database, a file system, an API.
        # Making it an 'agent' adds opacity + lifecycle overhead to a function call.
        return "MCP"       # a capability (Topic 9)
```

**The composition (MA-1) — a system that uses both:**

```python
class CrossOrgAgentSystem:
    """MA-1: MCP and A2A are ORTHOGONAL LAYERS, not alternatives.
    Your agent uses MCP for ITS tools; it collaborates via A2A with remote agents;
    those remote agents use MCP for THEIR tools — which you cannot see (opacity)."""

    def __init__(self):
        self.mcp_clients = []        # DOWN: your agent's tools/context (Topic 9)
        self.a2a_sessions = []       # SIDEWAYS: remote collaborators (Topic 10)

    async def run(self, task, ctx):
        # Use YOUR tools via MCP (capabilities you invoke)
        tools = [t for c in self.mcp_clients for t in c.tools]

        # Collaborate with a remote agent via A2A (a peer, opaque)
        if task.needs_external_agent:
            remote = discover_agent(task.capability_needed, self.registry)   # Agent Card
            artifact = await self.collaborate_a2a(remote, task, ctx)          # Topic 10
            # ↑ the remote agent uses ITS OWN MCP tools internally — INVISIBLE to you (A2A-1)
            #   its artifact is UNTRUSTED (A2A-2), for a DIFFERENT reason than an MCP
            #   resource: opaque process, not server-authored content.
```

**The two errors, caught (§3.1):**

```python
def validate_protocol_choice(integration, chosen: str) -> None:
    """Catch the two layering errors."""
    if chosen == "MCP" and integration.other_end_decides_how:
        raise ProtocolMismatch(
            "wrapping an autonomous agent as an MCP TOOL strips its agency — "
            "you have hired an expert and handed them a script. [A2A] exists to NOT do "
            "this: collaboration 'without limiting an agent to a tool'. Use A2A."
        )
    if chosen == "A2A" and not integration.other_end_decides_how:
        raise ProtocolMismatch(
            "treating a capability (a database, an API) as an A2A AGENT adds opacity and "
            "task-lifecycle overhead to a function call — a black box you negotiate with. "
            "Use MCP."
        )
```

**The trust discipline — same for both, different reason (§3.2):**

```python
def classify_external_content(content, protocol: str, source) -> Trust:
    """Both protocols' third-party content is UNTRUSTED (Ch.5 T12) — for DIFFERENT reasons."""
    if protocol == "MCP":
        # Untrusted because the SERVER authored it (Topic 9, MCP-1).
        return Trust.UNTRUSTED if not source.first_party else Trust.TRUSTED
    else:  # A2A
        # Untrusted because the agent's PROCESS is opaque (Topic 10, A2A-2) —
        # a STRONGER reason: you cannot even inspect the reasoning.
        return Trust.UNTRUSTED    # always, for a remote peer
```

## 7. Trade-offs

| Need | Use | Because |
|---|---|---|
| Access a database / file / API | **MCP** | It is a capability you invoke; agency is not wanted |
| Reusable tool across agents | **MCP** | Standard tool exposure |
| Context/resources from a source | **MCP** | Tool/context provision is MCP's role |
| Collaborate with another org's agent | **A2A** | It is an autonomous peer; agency is preserved |
| Cross-vendor/framework agent teamwork | **A2A** | "regardless of vendor or framework" [A2A] |
| A cross-org system with tools on each side | **Both** | MCP within each agent, A2A between them (MA-1) |
| Wrap an agent as a tool | **Neither / reconsider** | Strips agency — use A2A if it is really an agent |
| Treat a tool as an agent | **Neither / reconsider** | Adds overhead — use MCP if it is really a tool |

**The trade is not "which protocol" — it is "which axis," and getting the axis wrong applies the wrong cost and trust model.** MCP's cost model is a tool call (cheap, request/response); A2A's is a collaboration (opacity, lifecycle, "hours or days" [A2A]). **Apply A2A to a database and you pay collaboration costs for a function call. Apply MCP to an agent and you strip the agency you needed.**

**The composition (MA-1) is where the real systems live, and it is under-appreciated.** A cross-organizational agent system is *both* protocols: **A2A for the collaboration between orgs, MCP for the tools within each.** And the opacity composes: **you use A2A to collaborate with a remote agent, and that agent uses MCP internally, and you cannot see it** (A2A-1). **This is the natural architecture of a multi-org agent ecosystem, and the two protocols were designed to layer this way** — [A2A]'s "complements" is not marketing; it is the layering.

**On maturity, the honest note:** MCP is established and A2A is a design announcement (Topic 10). **So the composition (MA-1) is, today, more architecture than deployed practice** — the MCP layer is real, the A2A layer is emerging. This does not change the *layering* (which is clean) but it does mean the cross-org composition is ahead of the evidence, and should be built with that understood.

## 8. Experiments

**The placement audit — the practical check.** For each external integration in your system, ask MA-2: **does the other end have agency you want to preserve?** **Then check: are you using the protocol that matches?** **A capability accessed via A2A, or an agent wrapped as an MCP tool, is a misplacement** — measure how many you have.

**The agency-stripping demonstration.** Wrap an autonomous agent as an MCP tool. **Show what is lost:** it cannot negotiate, cannot decide its own approach, cannot use its own judgment — you have reduced a collaborator to a function. **This demonstrates why A2A exists** ("without limiting an agent to a 'tool'").

**The overhead demonstration (the reverse error).** Access a simple database via an A2A "agent" wrapper. **Measure the added cost:** opacity, task-lifecycle overhead, and the loss of the direct visibility a tool call gives you. **This demonstrates why MCP exists for capabilities.**

**The composition test (MA-1).** Build a small system using both: your agent uses MCP tools and collaborates with a remote agent via A2A that uses its own MCP tools. **Verify the layering works** and that the opacity boundary is respected (you see the artifact, not the remote agent's MCP calls).

**The trust-reason check (§3.2).** For MCP content and A2A artifacts, verify both are classified untrusted (third-party) — **and that the *reason* is recorded** (server-authored vs opaque-process), because the mitigations differ slightly (Topic 9's content review vs Topic 10's artifact grounding).

**Statistics.** These are design-conformance checks, not distributional measurements — the protocols are not alternatives, so there is no A/B to run (Chapter 1, Topic 12's discipline applies where a rate is measured, e.g., misplacement rate).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Treating the protocols as alternatives.** "MCP vs A2A — which one?" **They are complementary** [A2A]. Mitigation: MA-2 — place by axis, not by preference.
- **Agent wrapped as an MCP tool.** Agency stripped; the collaborator reduced to a function. Mitigation: if the other end has agency, use A2A ("without limiting an agent to a 'tool'").
- **Tool treated as an A2A agent.** Opacity and lifecycle overhead added to a function call. Mitigation: if the other end is a capability, use MCP.
- **Wrong trust model applied.** MCP's content-trust reasoning applied to an opaque A2A artifact (or vice versa). Mitigation: same discipline (untrusted), different reason (§3.2); record the reason.
- **Assuming the composition is proven.** MA-1 is architecturally clean but A2A is emerging. Mitigation: build the MCP layer on established ground; treat the A2A layer as emerging (Topic 10).
- **Opacity in the composition.** In MA-1, the remote agent's MCP tool use is invisible to you (A2A-1). **You cannot audit the remote agent's tool calls.** Mitigation: this is inherent to A2A's opacity; bound what the remote agent's *artifact* can affect (Topic 10, §3.3).
- **Edge case — an agent you own, exposed via A2A.** Both ends yours: A2A's opacity is optional and its cross-org value is absent. Mitigation: use in-house delegation (Chapter 8, Topic 5) unless you genuinely need cross-org interoperability.
- **Edge case — a capability with a thin agent wrapper.** A database exposed via an agent that adds retrieval logic. **Is it a tool or an agent?** MA-2's test: does the wrapper *decide how* (agency → A2A) or just *execute* (capability → MCP)? A thin wrapper that adds no judgment is a capability.
- **Open limitation.** **The complementarity is explicitly sourced** [A2A] — the best-grounded claim here. **MA-1 and MA-2 are [synthesis]** (MA-1 follows from "complements"; MA-2 formalizes the tool-vs-agent distinction). **No source reports a deployed system using both**, and A2A's youth means the composition is more design than practice. **No comparison is measured** — because they are not alternatives.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **"A2A complements Anthropic's Model Context Protocol (MCP), which provides helpful tools and context to agents"** [A2A] — **the protocols are complementary, not competing.**
2. MCP is the tool/context-provision layer; A2A is the agent-collaboration layer [A2A].
3. **A2A explicitly does NOT treat agents as tools:** "without limiting an agent to a 'tool'" [A2A].
4. Agents-as-tools (owned) is already distinct from an A2A remote peer (opaque) — A2A is the *third* delegation mode (Chapter 5, Topic 2; Chapter 8, Topic 5; Topic 10).
5. Both protocols' third-party content is untrusted (Chapter 5, Topic 12) — for different reasons.
6. MCP is established; A2A is a design announcement (Topics 9–10).
7. **No source reports a deployed system using both; the composition is architecturally clean but undemonstrated at scale.**

**Decision rules.**
- **The protocols are complementary — ask "which axis," not "which protocol."**
- **Place by agency** (MA-2): a capability you invoke → MCP; an autonomous collaborator → A2A.
- **They compose** (MA-1): a cross-org system uses A2A between agents and MCP within each.
- **Do not wrap an agent as an MCP tool** — it strips the agency A2A preserves.
- **Do not treat a tool as an A2A agent** — it adds opacity and overhead to a function call.
- **Same trust discipline (untrusted), different reason** — server-authored content (MCP) vs opaque process (A2A).

**Production implications.**
1. Audit your integrations for misplacement — agents wrapped as tools, or tools treated as agents.
2. For a cross-org system, plan for both layers (MA-1); build the MCP layer on established ground and treat the A2A layer as emerging.
3. Record *why* external content is untrusted (server-authored vs opaque) — the mitigations differ (Topic 9 vs Topic 10).
4. Do not use A2A within a single org unless you genuinely need cross-org interoperability; in-house delegation (Chapter 8, Topic 5) is simpler and controllable.

**Connections.** This topic layers Topic 9 (MCP) and Topic 10 (A2A) into a stack. A2A is the third delegation mode beyond Chapter 5, Topic 2 and Chapter 8, Topic 5. The composition (MA-1) is the natural architecture of a multi-org agent ecosystem. Both trust boundaries are Chapter 5, Topic 12; the A2A identity layer is Topic 13. Cross-framework composition (Topic 12) is the practical realization of these protocols across implementations.

## Sources

[A2A] Google, "A2A: A new era of agent interoperability" — **"A2A complements Anthropic's Model Context Protocol (MCP), which provides helpful tools and context to agents"**; MCP as the tool/context layer, A2A as the agent-collaboration layer; A2A "without limiting an agent to a 'tool'," "treating agents as autonomous entities rather than mere tools" — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[CXM] Anthropic, "Code execution with MCP" — MCP as a tool/context provision layer accessed as code — https://www.anthropic.com/engineering/code-execution-with-mcp
[WTA] Anthropic, "Writing effective tools for agents" — MCP tools and their advisory annotations — https://www.anthropic.com/engineering/writing-tools-for-agents
