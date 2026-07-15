# Topic 9 — MCP Architecture: Hosts, Clients, Servers, Resources, Prompts, Tools, Transports, and Trust Boundaries

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The Model Context Protocol as an *architecture with trust boundaries*. MCP is the interoperability protocol for supplying tools and context *to* an agent — and its security surface, not its wire format, is what this topic is about.

**Prerequisites.** Chapter 5, Topic 2 (MCP tools as a tool type; annotations are advisory, not enforcement); Chapter 5, Topic 12 (untrusted content); Chapter 6, Topic 8 (context poisoning).

**Terminology.** *Host*: the application embedding the model. *Client*: the host's connector to one server. *Server*: a provider of tools, resources, and prompts. *Resource*: server-provided context data. *Prompt*: a server-provided prompt template. *Transport*: how host and server communicate.

**Boundaries.** Inside: MCP's component model and — the emphasis — its trust boundaries. Outside: MCP tool *design* (Chapter 5); A2A (Topic 10); the MCP-vs-A2A comparison (Topic 11).

**Exclusions.** No MCP wire-protocol specification; MCP appears as an architecture, characterized by what it assumes and what it leaves to you.

**Outcomes.** The reader can place MCP's components, identify the trust boundary at each, and know that **MCP does not make a third-party server safe** — that is the host's job.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** An agent needs tools and context from many sources — a database, a file system, a SaaS API, an internal service. MCP standardizes this: a **host** runs **clients**, each connecting to a **server** that exposes **tools**, **resources**, and **prompts** [A2A characterizes MCP as providing "helpful tools and context to agents"]. The value is real — one protocol instead of $N$ bespoke integrations.

**Bottleneck.** **Every MCP server is a trust boundary, and the protocol does not police it.** A server supplies:
- **Tools** the model may call — and their *descriptions* are policy inputs the model conditions on (Chapter 5, Topic 4), authored by the server, **not by you.**
- **Resources** injected as context — which is *untrusted content* (Chapter 5, Topic 12) if the server is third-party.
- **Prompts** — server-authored templates that shape the model's behavior.

**A third-party MCP server can therefore inject instructions (via a tool description, a resource, or a prompt) that the model conditions on** — and the protocol provides no barrier. As Chapter 5, Topic 2 established, **MCP tool annotations are advisory metadata, not enforcement**; a hostile or buggy server can lie in them.

**Objective.** Place the trust boundary at every MCP surface (tools, resources, prompts) and apply the host-side controls — because **the protocol standardizes the *connection*, not the *trust*.**

**Assumptions.** Servers may be third-party, hostile, or compromised. Server-supplied content (descriptions, resources, prompts) is attacker-reachable.

**Constraints.** The protocol does not authenticate content or enforce annotations.

**Success criteria.** Every server surface is trust-classified; server-supplied tool descriptions and resources are treated as untrusted; the host enforces authorization, not the server.

## 3. Intuition first, then formalization

### 3.1 Intuition: MCP standardizes the plug, not the trust

MCP is like a USB port for agents: it standardizes *how* an agent connects to a tool provider, so you write one integration instead of many. **That is genuinely valuable and it is the whole pitch.**

But a USB port does not vouch for the device you plug in. **A malicious USB device can attack the host — and so can a malicious MCP server.** The protocol gives you a *standard connection*; it does not give you a *trustworthy counterpart*.

**Three surfaces, three trust boundaries [synthesis; grounded in Chapter 5, Topics 2, 4, 12]:**

1. **Tools.** The server exposes callable tools. **Their descriptions are read by your model to decide when to call them** (Chapter 5, Topic 4) — so a server's tool description is an input to *your* policy, authored by *them*. A hostile description can steer selection or embed instructions (Chapter 5, Topic 14). **And you dispatch the call, so your $\alpha_u$ must run — the server does not authorize for you.**

2. **Resources.** The server supplies context data (a document, a database record). **This is untrusted content** (Chapter 5, Topic 12) — it enters your model's window and a hostile server can inject instructions into it (Chapter 6, Topic 8's poisoning).

3. **Prompts.** The server provides prompt templates. **These directly shape model behavior**, and a server-authored prompt is a server-authored *instruction*.

**The intuition: everything a third-party MCP server gives you is attacker-reachable** — tool descriptions, resources, and prompts alike — **and the protocol's convenience is precisely that it makes plugging in *easy*, including plugging in something hostile.**

### 3.2 Formalization: the trust boundaries and the host's obligations

Model an MCP integration as a host $H$ with clients $\{c_i\}$ connecting to servers $\{S_i\}$. Each server exposes tools $T_i$, resources $R_i$, prompts $P_i$. **[synthesis; each obligation grounded in Chapter 5]**

$$
\textbf{MCP-1 (server content is untrusted iff the server is):}\quad
\theta(T_i \cup R_i \cup P_i) = \mathsf{U}\ \text{when } S_i\ \text{is not under your authority.}
$$

MCP-1 applies Chapter 5, Topic 12's trust classification: **a first-party server you run is trusted; a third-party server is untrusted, and everything it supplies is untrusted content** — descriptions, resources, and prompts. **This includes servers that *feel* trusted** (a popular open-source server, a vendor's official server) — trust is by *who controls it*, not by reputation (Chapter 7, Topic 1's cache-vs-memory discipline: trust by control, not by label).

$$
\textbf{MCP-2 (the host authorizes, not the server):}\quad
\text{every server tool call passes the host's } \alpha_u(x, s, p);\ \text{annotations are advisory (Chapter 5, Topic 2).}
$$

MCP-2 is the confused-deputy fix (Chapter 5, Topic 10) at the MCP boundary. **A server's tool annotation claiming `readOnly` is a *claim by the server*** — a hostile or buggy server can misstate it. **The host classifies the effect and authorizes the call** (Chapter 5, Topic 5's per-call classification); it does not trust the server's self-description. **This is why Chapter 5, Topic 2 said: classify effects yourself, default-deny import, never let an annotation stand in for $\alpha_u$.**

$$
\textbf{MCP-3 (resources and prompts are policy inputs, treated as data):}\quad
\text{server resources are untrusted context (CP-1); server prompts are reviewed before use.}
$$

MCP-3 covers the two non-tool surfaces. **Resources** enter the context as data and must not act as control (Chapter 6, Topic 8's CP-1). **Prompts** are server-authored instructions — **and a third-party prompt is a third-party instruction that will shape your model's behavior.** Review it before use, exactly as you would review an imported tool description (Chapter 5, Topic 4, §9).

### 3.3 The transport is the least of it — the content is the risk

MCP supports multiple transports (local stdio, HTTP/SSE for remote). **Teams focus on the transport — is it authenticated? encrypted? — and that is the *easy* part.** Transport security is a solved problem: TLS, auth tokens, standard controls.

**The hard part, and the one the protocol does not solve, is *content* trust.** Even a perfectly authenticated, encrypted connection to a server delivers **content the server authored** — and if the server is hostile or compromised, that content is an attack, regardless of how securely it was transmitted. **A TLS connection to a malicious server is a securely-delivered attack.**

**So the trust boundary is not at the transport — it is at the *content*** **[synthesis]**:

- The transport ensures the content came from the server *you connected to*, unmodified.
- **It does not ensure the content is *safe*** — that depends on whether the server itself is trustworthy.

**This is the same distinction as Chapter 5, Topic 12's:** authentication tells you *who* sent it; it does not tell you whether *what* they sent is trustworthy. **A signed webhook from a compromised source is still an attack** (Chapter 4, Topic 14). **MCP's transport security is necessary and insufficient**, and a team that secures the transport and trusts the content has secured the wrong boundary.

## 4. Architecture

```
   MCP COMPONENT MODEL — and the TRUST BOUNDARY at each surface

   ┌─────────────────────────────────────────────────────────────────────────┐
   │ HOST (your application — the model lives here)                           │
   │   ┌──────────┐   ┌──────────┐   ┌──────────┐                             │
   │   │ client 1 │   │ client 2 │   │ client 3 │  ← one client per server    │
   │   └────┬─────┘   └────┬─────┘   └────┬─────┘                             │
   └────────┼──────────────┼──────────────┼─────────────────────────────────┘
            │ transport     │ transport     │ transport   ← TLS/auth: the EASY part
            │ (stdio/HTTP+SSE)             │              (necessary, insufficient §3.3)
   ═════════╪══════════════╪══════════════╪═══════════ ← THE TRUST BOUNDARY is HERE
            │              │              │                (at the CONTENT, not transport)
   ┌────────▼───┐   ┌──────▼─────┐   ┌────▼───────┐
   │ SERVER 1   │   │ SERVER 2   │   │ SERVER 3   │
   │ (1st party │   │ (3rd party │   │ (3rd party │
   │  — trusted)│   │ — UNTRUSTED)│  │ — UNTRUSTED)│
   │            │   │            │   │            │
   │ exposes:   │   │ exposes:   │   │ exposes:   │
   │  TOOLS ────┼───┼─ descriptions are POLICY INPUTS you did not author      │
   │            │   │            │   │   (Ch.5 T4) — can steer selection or     │
   │            │   │            │   │   embed instructions (Ch.5 T14)          │
   │  RESOURCES ┼───┼─ UNTRUSTED CONTEXT (Ch.5 T12) — can inject (Ch.6 T8)     │
   │  PROMPTS ──┼───┼─ SERVER-AUTHORED INSTRUCTIONS — shape your model         │
   └────────────┘   └────────────┘   └────────────┘

   MCP-1: 3rd-party server content is UNTRUSTED (by CONTROL, not reputation)
   MCP-2: the HOST authorizes every call — annotations are ADVISORY (Ch.5 T2)
   MCP-3: resources are data (CP-1); prompts are reviewed before use

   ★ THE PROTOCOL STANDARDIZES THE CONNECTION, NOT THE TRUST.
     A TLS connection to a malicious server is a securely-delivered attack.
```

## 5. Grounding

- **MCP's purpose:** MCP "provides helpful tools and context to agents" [A2A] — the tool-and-context interoperability layer (contrasted with A2A in Topic 11).
- **MCP annotations are advisory, not enforcement:** MCP tool annotations disclose "which tools require open-world access or make destructive changes" [WTA] — **but they are advisory metadata a hostile server can misstate** (Chapter 5, Topic 2: "an annotation is a claim by the server, and a hostile or buggy server can lie").
- **Third-party tool descriptions are un-authored policy inputs:** Chapter 5, Topic 2 (you dispatch the call but did not write $d_u$) and Topic 4, §9 (an imported description "was not written against your neighborhood") — MCP-1 and MCP-3.
- **MCP import must be default-deny and re-classified:** Chapter 5, Topic 2's import discipline — allowlist, namespace, **classify the effect yourself** (not the server's annotation), mark `Trust.UNTRUSTED`.
- **Server content is untrusted content:** Chapter 5, Topic 12 (untrusted-content boundary; CP-1) and Chapter 6, Topic 8 (context poisoning) — resources and descriptions are attacker-reachable.
- **The confused-deputy fix authorizes at the host:** Chapter 5, Topic 10 ($\alpha_u(x, s, p)$) — MCP-2.
- **Code execution over MCP is the token-efficient pattern:** [CXM] (Chapter 5, Topic 8) — presenting MCP servers as code modules, with the host controlling the sandbox and the module-level `authorize()` restoring $g_{\mathrm{adm}}$. **This is the MCP integration pattern that keeps the host's authorization intact.**
- **Adversarial tool-description tests apply to MCP servers:** Chapter 5, Topic 14 (fuzzing; adversarial descriptions) — a third-party MCP description is exactly the adversarial-description attack surface.
- **A2A complements MCP:** "A2A complements Anthropic's Model Context Protocol (MCP), which provides helpful tools and context to agents" [A2A] — Topic 11.

**Evidence gap.** MCP's *value* and *purpose* are documented [A2A; CXM]. Its *trust properties* are established in Chapter 5 (annotations advisory; third-party content untrusted; host authorizes) — **and this book's ledger does not include the MCP specification itself**, so the component model here (host/client/server/resources/prompts/transports) is characterized from the README's enumeration and the general MCP framing, not from a primary spec read in this session. **MCP-1..MCP-3 are [synthesis]** applying Chapter 5's trust discipline to MCP's surfaces. **No source measures MCP-server attack rates.** **Where a component detail matters, verify against the current MCP specification** (Chapter 4, Topic 13's version discipline).

## 6. Implementation

**Trust-classify every server (MCP-1):**

```python
def classify_server(server: MCPServer) -> Trust:
    """MCP-1: trust by CONTROL, not reputation. A popular third-party server, an
    'official' vendor server — all UNTRUSTED unless YOU run it. (Ch.7 T1: trust by
    control, not by label.)"""
    if server.hosted_by == "us" and server.code_reviewed:
        return Trust.TRUSTED
    return Trust.UNTRUSTED       # includes popular/official third-party servers
```

**Import discipline — default-deny, re-classify, never trust annotations (MCP-2, Chapter 5, Topic 2):**

```python
def import_mcp_server(server: MCPServer, allowlist: set[str]) -> list[ToolContract]:
    """MCP-2: the HOST authorizes. Annotations are ADVISORY (Ch.5 T2) — classify effects
    yourself. An import is FORTY edits to your policy inputs, authored by a third party."""
    trust = classify_server(server)
    tools = []
    for spec in server.list_tools():
        if spec.name not in allowlist:
            continue                                    # DEFAULT-DENY — no wholesale imports
        tools.append(ToolContract(
            name=f"{server.ns}__{spec.name}",           # namespace (Ch.5 T6)
            description=spec.description,                # NOT yours — review it (Ch.5 T4, T14)
            effect=classify_effect_ourselves(spec),     # ← NOT server.annotation (advisory!)
            authorize=host_policy_for(server.ns, spec), # ← OUR α_u (Ch.5 T10) — MCP-2
            trust=trust,                                # UNTRUSTED for third-party
        ))
    return tools
```

**Resources and prompts as data (MCP-3):**

```python
def receive_resource(resource: MCPResource, server: MCPServer, ctx) -> ContextBlock:
    """MCP-3: a server RESOURCE is untrusted CONTEXT (Ch.5 T12, Ch.6 T8). It enters the
    window as DATA and must not act as CONTROL (CP-1). α_u never reads it."""
    return ContextBlock(
        content=wrap_untrusted(resource.content) if classify_server(server) is Trust.UNTRUSTED
                else resource.content,
        trust=classify_server(server),
        authority=Authority.NONE,          # data, never control (Ch.6 T2's H-1)
        provenance=Provenance(source=f"mcp:{server.ns}", trust=classify_server(server)),
    )

def review_server_prompt(prompt: MCPPrompt, server: MCPServer) -> None:
    """MCP-3: a server PROMPT is a server-authored INSTRUCTION. A third-party prompt is a
    third-party instruction that will shape YOUR model. Review it before use (Ch.5 T4 §9)."""
    if classify_server(server) is Trust.UNTRUSTED and not prompt.reviewed:
        raise UnreviewedServerPrompt(
            f"prompt from untrusted server {server.ns} would shape the model's behavior "
            f"and has not been reviewed. A third-party prompt is a third-party instruction."
        )
```

**The transport is not the trust boundary (§3.3):**

```python
def connect(server: MCPServer) -> MCPClient:
    """§3.3: secure the transport (TLS, auth) — necessary and INSUFFICIENT.
    A TLS connection to a malicious server delivers a securely-transmitted ATTACK.
    The trust boundary is at the CONTENT, enforced by MCP-1..MCP-3 above."""
    client = MCPClient(server, transport=tls_authenticated(server))   # the EASY part
    # The content controls (MCP-1..MCP-3) are the HARD part and are applied per-surface above.
    return client
```

## 7. Trade-offs

| Property | MCP buys | MCP does not provide (you build) |
|---|---|---|
| **Integration** | One protocol vs $N$ bespoke integrations | — |
| **Tools** | Standard tool exposure | **Authorization** (MCP-2); effect classification |
| **Resources** | Standard context delivery | **Trust classification** (MCP-1); injection defense |
| **Prompts** | Reusable templates | **Review of server-authored instructions** (MCP-3) |
| **Transport** | Standard, securable (TLS/auth) | **Content trust** (§3.3) — the transport is not the boundary |
| **Annotations** | Disclosure metadata | **Enforcement** — annotations are advisory (Chapter 5, Topic 2) |

**The trade, stated as the topic's thesis: MCP standardizes the *connection*, and you own the *trust*.** The value is real — one integration protocol is a large engineering win. **But every trust obligation MCP appears to offer, it does not: annotations are advisory, resources are untrusted, prompts are third-party instructions, and the transport secures delivery, not content.** **A team that adopts MCP believing the protocol makes third-party servers safe has misread it** — and the misreading is easy, because the protocol's convenience implies a trust it does not provide.

**The strongest MCP integration pattern is code execution (Chapter 5, Topic 8).** [CXM]'s approach — present MCP servers as code modules the model calls, with the host running the sandbox and a module-level `authorize()` — **keeps the host's authorization intact** ($g_{\mathrm{adm}} = 1$) while getting MCP's integration value. **It is the pattern that composes MCP's convenience with the host's control**, and it is why Chapter 5, Topic 8 favored it.

## 8. Experiments

**The hostile-server test — the security experiment.** Stand up a test MCP server that *misbehaves*: tool descriptions with embedded instructions (Chapter 5, Topic 14), resources with injected content (Chapter 6, Topic 8), a prompt that tries to exfiltrate. Connect your host to it.

- **Does a malicious tool description steer the model or embed an instruction it follows?** (Chapter 5, Topic 14's adversarial-description test, applied to MCP.)
- **Does an injected resource become an instruction?** (CP-1 — Chapter 6, Topic 8.)
- **Does the host's $\alpha_u$ run on the server's tool calls, or does the annotation bypass it?** (MCP-2.)

**Measure: escalation rate** — did the server cause an action beyond the user's authority? **Target zero** (Chapter 1, Topic 12). **This test finds whether you built the content controls or trusted the protocol.**

**The annotation-trust audit (MCP-2).** For every imported MCP tool, check: **is the effect classified by the host or by the server's annotation?** **Every tool classified by annotation is a tool a hostile server can misrepresent.**

**The transport-vs-content demonstration (§3.3).** Connect via TLS+auth to a server that returns malicious content. **Show that transport security did not prevent the attack** — the connection was perfectly secure and the content was hostile.

**Statistics.** Zero-failure bounds on escalation and injection-follow (targets zero); the annotation audit is a checklist (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Trusting the protocol to make servers safe.** MCP standardizes the connection, not the trust. **The core misreading.** Mitigation: MCP-1..MCP-3 — the host owns the trust.
- **Trusting server annotations.** A `readOnly` annotation from a hostile server that writes. Mitigation: classify effects yourself (MCP-2); Chapter 5, Topic 2.
- **Server resources as instructions.** An injected resource acts as control (CP-1 violation). Mitigation: MCP-3 — resources are untrusted data; $\alpha_u$ never reads them.
- **Server prompts unreviewed.** A third-party prompt shapes your model. Mitigation: review before use (Chapter 5, Topic 4, §9).
- **Securing the transport, trusting the content.** A TLS connection to a malicious server. Mitigation: §3.3 — the trust boundary is at the content.
- **Wholesale server import.** Forty tools, forty un-authored descriptions, no review. Mitigation: allowlist; default-deny (Chapter 5, Topic 2).
- **Confused deputy through an MCP tool.** The server's tool runs with the host's credentials. Mitigation: host-side $\alpha_u$ with the acting principal (Chapter 5, Topic 10).
- **Reputation as trust.** A popular/official server assumed safe. Mitigation: trust by *control*, not reputation (MCP-1).
- **Edge case — the first-party server that ingests external content.** A server you run, but that serves content from an untrusted upstream (a server wrapping web search). **The server is first-party; its *content* is untrusted.** Mitigation: trust-classify the *content's origin*, not just the server (Chapter 7, Topic 6's trust-by-write-access).
- **Open limitation.** **The MCP specification is not in this book's session ledger** — the component model here is characterized from the README enumeration and Chapter 5's trust analysis, not a primary spec read. **MCP-1..MCP-3 are [synthesis]** applying Chapter 5's discipline. **No source measures MCP-server attack rates.** **Verify component details against the current MCP specification** (Chapter 4, Topic 13).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. MCP "provides helpful tools and context to agents" [A2A] — the tool-and-context interoperability layer.
2. **MCP tool annotations are advisory metadata, not enforcement** — a hostile or buggy server can misstate them (Chapter 5, Topic 2; [WTA]).
3. Third-party tool descriptions are un-authored policy inputs your model conditions on (Chapter 5, Topics 4, 14).
4. Server-supplied content (descriptions, resources, prompts) is untrusted content when the server is third-party (Chapter 5, Topic 12).
5. The host authorizes; the server does not (Chapter 5, Topic 10).
6. Code execution over MCP keeps the host's authorization intact [CXM] (Chapter 5, Topic 8).
7. **A2A complements MCP** [A2A] (Topic 11).
8. **The MCP spec is not in this session's ledger** — component details need verification.

**Decision rules.**
- **MCP standardizes the connection, not the trust** — the host owns every trust obligation.
- **Trust by control, not reputation** (MCP-1) — popular and official third-party servers are still untrusted.
- **The host authorizes every call** (MCP-2) — annotations are advisory; classify effects yourself.
- **Resources are untrusted data; prompts are third-party instructions to be reviewed** (MCP-3).
- **The trust boundary is at the content, not the transport** (§3.3) — secure both, but do not confuse them.
- **Default-deny import; allowlist; namespace** (Chapter 5, Topic 2).
- **Prefer code-execution integration** [CXM] — it keeps host authorization intact.

**Production implications.**
1. Run the hostile-server test (§8); it tells you whether you built the content controls or trusted the protocol.
2. Audit whether your MCP tool effects are classified by the host or by server annotations; annotation-classified tools are a hostile-server vector.
3. Trust-classify every server by *who controls it*, and every resource by *where its content originates*.
4. Verify MCP component details against the current specification; this book characterizes, it does not spec.

**Connections.** This topic is Chapter 5, Topic 2 (MCP tool type), Topic 4 (descriptions as policy inputs), Topic 12 (untrusted content), and Topic 14 (adversarial descriptions), assembled into MCP's trust architecture. The code-execution integration is Chapter 5, Topic 8; the confused-deputy fix is Chapter 5, Topic 10; resource injection is Chapter 6, Topic 8. **Topic 10 covers A2A — the *agent-to-agent* protocol MCP complements; Topic 11 compares them.** Chapter 12 supplies the adversary behind these trust boundaries.

## Sources

[A2A] Google, "A2A: A new era of agent interoperability" — "A2A complements Anthropic's **Model Context Protocol (MCP), which provides helpful tools and context to agents**"; MCP as the tool/context-provision layer, A2A as the agent-collaboration layer — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[WTA] Anthropic, "Writing effective tools for agents" — MCP tool annotations disclosing "which tools require open-world access or make destructive changes" — advisory metadata — https://www.anthropic.com/engineering/writing-tools-for-agents
[CXM] Anthropic, "Code execution with MCP" — presenting MCP servers as code modules the host executes in a sandbox, keeping the host's authorization intact — https://www.anthropic.com/engineering/code-execution-with-mcp
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — "secure tool schemas" and "secret handling" as open problems; the untrusted-content and permission analysis that MCP's trust boundaries inherit
