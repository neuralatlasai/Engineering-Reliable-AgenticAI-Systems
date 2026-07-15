# Chapter 9 — Multi-Agent Systems and Interoperability Protocols

## Scope, Prerequisites, Terminology, System Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter exists

Chapter 8 built the control primitives for delegating work — handoffs, agents-as-tools, supervisor–worker — and deliberately deferred one question: **when is a *multi-agent* system actually justified?** That chapter treated sub-agents as *control primitives* owned by one orchestrator. This chapter treats agents as *independent systems* that must be justified, coordinated, and — when they cross organizational boundaries — made interoperable.

The chapter is unusually well-grounded, because the field's best-documented multi-agent result is also its most honest. Anthropic's research system reports that **"a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"** [MAR] — a large, measured gain. And in the same document: **multi-agent systems "use about 15× more tokens than chats"** [MAR], and they are a poor fit for "domains that require all agents to share the same context or involve many dependencies between agents," because **"LLM agents are not yet great at coordinating and delegating to other agents in real time"** [MAR].

**Both facts are true, and the chapter is about the conditions that separate them.** A 90.2% gain at 15× cost is an extraordinary trade on a high-value research task and an absurd one on a task a single agent handles fine. **The multi-agent decision is therefore an economic and structural one — not an architectural preference** — and the sources are unusually explicit about it: "for economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance" [MAR].

The second half of the chapter is **interoperability**: when agents cross vendor, framework, or organizational boundaries, they need protocols. Two exist and they are complementary, not competing: **MCP** supplies tools and context *to* an agent; **A2A** enables agents to collaborate *with each other* — and A2A's design premise is that a remote agent is **not a tool**: it enables collaboration "without limiting an agent to a 'tool'," letting agents "collaborate in their natural, unstructured modalities, even when they don't share memory, tools and context" [A2A].

## 2. Chapter scope

The unit of analysis is the **agent as an independent participant** — one with its own context, its own loop, and (sometimes) its own owner — and the coordination and protocols that make several of them work together.

Covered: when multiple agents are justified (Topic 1); the decomposition-gain-versus-coordination-tax calculus (Topic 2); role specialization and authority boundaries (Topic 3); the coordination topologies (Topic 4); parallel exploration and synthesis (Topic 5); shared versus private context (Topic 6); communication topology and causal ordering (Topic 7); the coordination failure modes — duplicate work, conflicting edits, deadlock, cascading hallucination (Topic 8); MCP's architecture and trust boundaries (Topic 9); A2A's architecture and remote-agent opacity (Topic 10); MCP versus A2A (Topic 11); cross-framework composition (Topic 12); remote-agent authentication and identity propagation (Topic 13); multi-agent evaluation (Topic 14); and cost- and latency-aware concurrency control (Topic 15).

## 3. Prerequisites

Chapters 1–8 in full. This chapter leans hardest on:

- **Chapter 8, Topic 12** (when orchestration complexity exceeds autonomy's value) — this chapter asks the same question one level up, and the answer has the same shape: *justify the complexity or do not add it*.
- **Chapter 8, Topics 5–6** (handoffs vs agents-as-tools; ownership and final-answer authority) — the delegation primitives that multi-agent systems compose, and the failure-laundering that aggregation invites.
- **Chapter 6, Topic 11 and Chapter 8, Topic 4** (sub-agent context isolation; the distillation that justifies supervisor–worker) — the *context* argument that is, per [MAR], the deepest reason multi-agent works at all.
- **Chapter 5, Topics 2, 10, 12** (agents-as-tools; the confused-deputy fix; the untrusted-content boundary) — a remote agent's output is untrusted, and its identity must be propagated (Topic 13).
- **Chapter 7, Topics 2, 7, 14** (state scopes; read policies; tenant isolation) — shared context across agents is a scoping and isolation problem.

## 4. Terminology fixed for this chapter

| Term | Definition adopted | Source |
|---|---|---|
| **Orchestrator-worker (lead/subagent)** | A lead agent that "analyzes queries, develops strategy, spawns subagents, synthesizes results"; subagents "operate independently in parallel" with their own context windows | [MAR] |
| **Compression by parallelism** | "Subagents facilitate compression by operating in parallel with their own context windows… before condensing the most important tokens for the lead research agent" | [MAR] |
| **Coordination tax** | The cost of delegating: token multiplication, synchronization, prompt-engineering of delegation, emergent behavior | [MAR]; **[synthesis]** |
| **MCP** | Model Context Protocol — "provides helpful tools and context to agents" | [A2A] |
| **A2A** | Agent2Agent — agent-to-agent collaboration across vendors/frameworks, "without limiting an agent to a 'tool'" | [A2A] |
| **Agent Card** | A JSON structure by which an agent "advertise[s] capabilities," enabling capability discovery | [A2A] |
| **Opaque agent** | A remote agent treated as an autonomous entity, not a tool — collaborating "even when they don't share memory, tools and context" | [A2A] |
| **Artifact (A2A)** | A task's output | [A2A] |
| **Hosted collaboration actions** | `spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents` | [OMA] |
| **`max_concurrent_subagents`** | Limits active subagent turns "across the entire tree," excluding root; default `3` | [OMA] |
| **`fork_turns`** | Controls "how much context you want to propagate to your sub-agents" | [OMA] |

## 5. System boundary

**Inside:** the justification, economics, and topology of multiple agents; the coordination mechanisms and their failure modes; the interoperability protocols (MCP, A2A) and their trust boundaries; cross-framework composition; remote-agent identity and authorization; multi-agent evaluation; and concurrency control.

**Outside:** the single-agent control primitives that multi-agent systems compose (Chapter 8 — handoffs, agents-as-tools, aggregation, termination; **all of Chapter 8's invariants still apply and are assumed**); the tool contracts an agent invokes (Chapter 5); the context engineering inside each agent (Chapter 6); the persistence each agent owns (Chapter 7); long-horizon execution and recovery (Chapter 10); and the security threat model (Chapter 12 — this chapter specifies the *interoperability* trust boundaries, Chapter 12 supplies the adversary).

The seam with Chapter 8 is the chapter's defining boundary: **Chapter 8 owns the control structure when one agent is in charge; Chapter 9 owns the question of whether there should be several, and what happens when they are independent.** Orchestrator-workers appears in both — as a *pattern* in Chapter 8, and here as a *topology with a measured cost and benefit*. The line: if the sub-agents are a control primitive of one system, it is Chapter 8; if the agents are independently justified, independently deployed, or independently owned, it is Chapter 9.

## 6. Exclusions

- No agent-framework product comparison beyond the interoperability protocols themselves.
- No re-derivation of Chapter 8's control invariants — status aggregation (O-2/O-3), termination (TE-1..TE-4), typed state (T-1..T-3) all still apply, and a multi-agent system that violates them fails exactly as Chapter 8 predicted.
- No MCP or A2A specification walk-through at wire level; both appear as *architectures with trust boundaries*, characterized by what they assume and what they leave to you.
- No security threat modeling (Chapter 12), though Topic 13's identity propagation and Topics 9–10's trust boundaries are specified here as protocol obligations.

## 7. Measurable outcomes for the reader

1. **Decide whether a task warrants multiple agents** from the measured decomposition gain against the measured coordination tax — and know the four conditions under which multi-agent *does not work* (Topics 1–2).
2. **Choose a topology** (supervisor, hierarchical, peer, market) and set authority boundaries and information isolation deliberately (Topics 3–4).
3. **Decide shared versus private context** (Topic 6) and design the communication topology with causal ordering (Topic 7).
4. **Recognize and prevent the coordination failure modes** — duplicate work, conflicting edits, deadlock, cascading hallucination (Topic 8).
5. **Place MCP and A2A correctly** — tool/context interoperability versus agent-to-agent collaboration — and reason about each one's trust boundary (Topics 9–11).
6. **Propagate identity and authorization across agent boundaries** (Topic 13) and **evaluate the multi-agent system** on marginal contribution, redundancy, diversity, and coordination overhead (Topic 14), under a cost- and latency-aware concurrency policy (Topic 15).

## 8. Source ledger for this chapter

All previously established tags remain in force. New or newly-central:

| Tag | Source | Provenance |
|---|---|---|
| [MAR] | Anthropic, "How we built our multi-agent research system" | https://www.anthropic.com/engineering/multi-agent-research-system — **the chapter's empirical spine**: the 90.2% result, the 15× token cost, the variance decomposition, and the explicit non-fit conditions |
| [OMA] | OpenAI, multi-agent guide (Responses API) | https://developers.openai.com/api/docs/guides/responses-multi-agent — hosted collaboration actions; `max_concurrent_subagents`; `fork_turns`; the use/do-not-use decision guidance |
| [A2A] | Google, "A2A: A new era of agent interoperability" | https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/ — the five design principles; agent cards; opaque agents; the MCP relationship |
| [MCP] | Model Context Protocol (as characterized by [A2A] and Chapter 5) | MCP "provides helpful tools and context to agents" [A2A]; Chapter 5, Topic 2's trust analysis |

**Evidence-quality note, stated plainly and enforced throughout.** This chapter has **the best empirical grounding in the book so far, and it is still one vendor's internal eval.** Three disciplines follow:

1. **The 90.2% result carries its scope.** It is *one system* (research), on *one internal eval*, with *one model pairing* (Opus 4 lead, Sonnet 4 subagents), against *one baseline* (single-agent Opus 4) [MAR]. It is strong evidence that decomposition can pay enormously **on a parallelizable, open-ended search task** — and it is *not* evidence that multi-agent helps on coding, on dependent tasks, or in your domain. **[MAR] itself says so**, and this chapter repeats the qualification every time it repeats the number.

2. **The costs are measured too, and they are large.** 15× the tokens of a chat interaction [MAR]. **Token usage alone explains 80% of performance variance** on BrowseComp [MAR] — which is a remarkable and double-edged finding: it means multi-agent's gain is substantially *bought with tokens*, and it raises the question (Topic 2) of how much of the 90.2% is decomposition and how much is simply *spending more*.

3. **The protocols are young and their trust boundaries are the engineering surface.** A2A is a design-principles announcement, not a measured system; MCP's annotations are advisory, not enforcement (Chapter 5, Topic 2). **Neither protocol solves the confused-deputy problem for you** (Topic 13), and this chapter says so rather than implying the protocol makes remote agents safe.

**Notation and statistics contract:** Chapter 1, Topic 12 binds this chapter. A multi-agent system is a configuration $c$ whose $D_c$ spans several agents; its outcomes are vectors (completion, **token cost**, latency, $\kappa$) — and **cost is not a secondary metric here, it is the decision variable** (Topic 2). All of Chapter 8's control invariants (aggregation, termination, typed state) carry forward. Syntheses are flagged **[synthesis]** or **[derived]**; unmeasured claims are stated as unmeasured.

## 9. Chapter layout

Every topic file follows the ten-section skeleton, one section per governing instruction:

```
1.  Scope, prerequisites, terminology, boundaries, exclusions, outcomes
2.  Problem, bottleneck, objective, assumptions, constraints, success criteria
3.  Intuition first, then formalization (equations, algorithms, invariants)
4.  Architecture: components, responsibilities, interfaces, data and control flow
5.  Grounding: primary sources, specifications, reproducible evidence
6.  Implementation: APIs, schemas, data structures, configuration, semantics
7.  Trade-offs: complexity, latency, throughput, scalability, reliability, security, cost
8.  Experiments: baselines, ablations, metrics, statistical tests, thresholds
9.  Failure modes, edge cases, hazards, mitigations, recovery, open limitations
10. Verified observations, decision rules, production implications, connections
```

Chapter map:

```
00 scope (this file)
01 when multiple agents are justified          ── the premise (and the 90.2% / 15× trade)
02 decomposition gain vs coordination tax     ──┐
03 role specialization & authority boundaries   ├─ the economics and structure
04 topologies (supervisor→hierarchy→peer→market)│
05 parallel exploration & diversity synthesis   │
06 shared vs private context                  ──┘
07 communication topology & causal ordering   ──┐
08 coordination failure modes                   ├─ making coordination work
09 MCP architecture & trust boundaries          │
10 A2A architecture & remote-agent opacity      │
11 MCP vs A2A                                 ──┘
12 cross-language / cross-framework composition ──┐
13 remote-agent authn/authz & identity propagation ├─ interoperating safely
14 multi-agent evaluation                         │
15 cost- & latency-aware concurrency control    ──┘
```

Chapter 10 takes the long-horizon execution these systems require; Chapter 12 supplies the threat model behind Topic 13's trust boundaries.

## 10. Notation and grounding contract

Chapter 1, Topic 12 binds this chapter. **Cost is a first-class outcome, not a footnote** — the 15× multiplier [MAR] makes it the decision variable. Chapter 8's invariants (O-2 aggregation, TE-1..TE-4 termination, T-1..T-3 typed state) carry forward and are assumed, not restated. Every claim carries a source tag; **the 90.2% result is always reported with its scope**; syntheses are flagged **[synthesis]** or **[derived]**; and anything unmeasured — most protocol properties, most topology comparisons — is stated as unmeasured.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — the orchestrator-worker architecture (lead agent + parallel subagents + citation agent); **"a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"**; "subagents facilitate compression by operating in parallel with their own context windows"; multi-agent systems "use about 15× more tokens than chats" (single-agent research ≈4×); **token usage alone explains 80% of performance variance** on BrowseComp; parallel tool calling "cut research time by up to 90%"; the non-fit conditions ("most coding tasks involve fewer truly parallelizable tasks than research"; "domains that require all agents to share the same context or involve many dependencies between agents"; "LLM agents are not yet great at coordinating and delegating to other agents in real time"); "for economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance"; the delegation-prompt principles; the synchronous-execution bottleneck; rainbow deployments; the last-mile gap — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — hosted collaboration actions (`spawn_agent`, `send_message`, `followup_task`, `wait_agent`, `interrupt_agent`, `list_agents`); agent tree paths (`/root/researcher`); `max_concurrent_subagents` (default 3, "across the entire tree"); `fork_turns` (context propagation to sub-agents); encrypted `agent_message` items; the use-multi-agent / prefer-one-agent decision guidance — https://developers.openai.com/api/docs/guides/responses-multi-agent
[A2A] Google, "A2A: A new era of agent interoperability" — the five design principles (embrace agentic capabilities; build on existing standards — HTTP, SSE, JSON-RPC; secure by default; support long-running tasks; modality agnostic); **"A2A focuses on enabling agents to collaborate in their natural, unstructured modalities, even when they don't share memory, tools and context"**; collaboration "without limiting an agent to a 'tool'"; Agent Cards for capability discovery; tasks, artifacts, and user-experience negotiation; A2A "complements Anthropic's Model Context Protocol (MCP), which provides helpful tools and context to agents" — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[CAH] Code as Agent Harness, arXiv:2605.18747 — multi-agent coordination, shared program state, and the implicit-state vulnerability — `Knowledge_source/2605.18747v1.pdf`
