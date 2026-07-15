# Chapter 8 — Workflow Control: From Deterministic Graphs to Adaptive Agents

## Scope, Prerequisites, Terminology, System Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter exists

Part II built the single-agent foundations: the harness (Chapter 3), the provider interfaces (Chapter 4), tools (Chapter 5), context (Chapter 6), and persistence (Chapter 7). This chapter — the opening of Part III — asks the question those chapters deferred: **how much of the control flow should be deterministic code, and how much should the model decide?**

The field's dominant answer is a spectrum, and the vendor that named the poles states it sharply. **Workflows** are "systems where LLMs and tools are orchestrated through predefined code paths"; **agents** are "systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks" [BEA]. The difference is "predictability versus autonomy" [BEA] — and the whole chapter is about choosing a point on that spectrum for a given task, and building the control structure that realizes it.

The chapter's organizing claim, and the reason it opens Part III: **orchestration is a cost, not a capability, and it must be justified against the alternative of a simpler structure.** The foundational guidance is a discipline of restraint: "find the simplest solution possible, and only increasing complexity when needed" [BEA], and "start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility" [OAO]. This inverts the usual framing — the question is never "what orchestration should I build" but "**can I avoid building orchestration, and if not, what is the least I can build?**" Chapter 8 is a chapter about *when not to*, as much as *how to*.

This connects directly to Chapter 1's foundational result. Chapter 1, Topic 9 established that *workflows dominate* — that most reliable agentic systems are mostly deterministic with model autonomy at a few controlled points. This chapter is the engineering of that result: it builds the deterministic graphs, the controlled autonomy points, and the discipline for deciding how much of each.

## 2. Chapter scope

The unit of analysis is the **control structure** — the arrangement of deterministic code and model-directed steps that governs how a task is executed. In Chapter 1's terms, this is the deterministic application policy $D_c$ and how it composes model-directed steps into a coherent execution; in Chapter 3's terms, it is the harness's loop control, generalized from a single loop to a graph of loops, workflows, and sub-agents.

Covered: the control-structure taxonomy (Topic 1); the composable workflow patterns (Topic 2); routing (Topic 3); the multi-agent control architectures (Topic 4); handoffs vs agents-as-tools (Topics 5–6); typed workflow state (Topic 7); human-in-the-loop checkpoints (Topic 8); dynamic replanning (Topic 9); durable execution and exactly-once (Topic 10); termination proofs and cycle detection (Topic 11); the complexity-vs-autonomy decision (Topic 12); comparative SDK implementations (Topic 13); and workflow conformance testing (Topic 14).

## 3. Prerequisites

Chapters 1–7 in full. This chapter leans hardest on:

- **Chapter 1, Topic 9** (workflows dominate) — the empirical result this chapter engineers; and Topic 8 (error accumulation) — the reason more autonomous steps compound more error.
- **Chapter 3, Topics 3–4** (the canonical loop; event-sourced architectures) — a workflow graph is composed loops; durable execution (Topic 10) is event-sourcing at the workflow layer.
- **Chapter 3, Topic 8** (termination and budgets) — Topic 11 here is termination proofs; and Topic 10 (exception taxonomy) — Topic 9 here is replanning after failure.
- **Chapter 5, Topics 2, 5, 11** (agents-as-tools; effect classes; idempotency/compensation) — Topics 5–6 and 10 here build on them.
- **Chapter 7, Topics 3, 13** (the authoritative event log; state migration) — Topic 10's durable execution and Topic 7's typed workflow state.

## 4. Terminology fixed for this chapter

| Term | Definition adopted | Source |
|---|---|---|
| **Workflow** | "Systems where LLMs and tools are orchestrated through predefined code paths" | [BEA] |
| **Agent** | "Systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks" | [BEA] |
| **Augmented LLM** | The building block: an LLM with retrieval, tools, and memory | [BEA] |
| **Prompt chaining** | Sequential steps where "each LLM call processes the output of the previous one," with optional gates | [BEA] |
| **Routing** | "Classifies an input and directs it to a specialized followup task" | [BEA] |
| **Parallelization** | Sectioning (independent parallel subtasks) or voting (identical tasks run multiple times) | [BEA] |
| **Orchestrator-workers** | A central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results" | [BEA] |
| **Evaluator-optimizer** | "One LLM call generates a response while another provides evaluation and feedback in a loop" | [BEA] |
| **Handoff** | Control transfer — "control moves to the specialist agent"; the specialist owns the reply | [OAO] |
| **Agents-as-tools** | Delegation without transfer — "the manager keeps ownership of the reply" | [OAO] |
| **Workflow agents (ADK)** | Deterministic composition primitives: Sequential, Parallel, Loop agents | [ADK-A] |

## 5. System boundary

**Inside:** the control structures composing deterministic code and model-directed steps — pipelines, routers, state machines, DAGs, loops; the composable workflow patterns; single-agent orchestration architectures (planner–executor, supervisor–worker, blackboard); handoffs and agents-as-tools as control primitives; typed workflow state; HITL checkpoints; replanning; durable execution and exactly-once; termination proofs; and the complexity-vs-autonomy decision.

**Outside:** *when multiple agents are justified* and *multi-agent coordination as a distinct discipline* (Chapter 9 — this chapter builds the control primitives; Chapter 9 asks when to use many agents and how they interoperate via MCP/A2A); the model's own planning capability (Chapter 2, Topics 3–4 — planner/executor as a *model* behavior; this chapter is the *harness* structure around it); the tool contracts the workflow invokes (Chapter 5); long-horizon checkpointing/recovery *as a survival discipline* (Chapter 10 — this chapter's Topic 10 is the workflow-control view; Chapter 10 is the long-run view); and evaluation science broadly (Chapter 13).

The seam with Chapter 9 is the chapter's defining boundary: **this chapter is single-agent control flow, including sub-agents as control primitives (handoffs, agents-as-tools, orchestrator-workers); Chapter 9 is when and how genuinely independent agents collaborate.** Orchestrator-workers appears here as a *pattern* (one agent directing sub-agents it fully controls) and returns in Chapter 9 as a *topology* (the marginal-contribution, coordination-tax analysis). The line: if one agent owns the control structure and the others are its subordinates, it is Chapter 8; if agents are peers or independently deployed, it is Chapter 9.

## 6. Exclusions

- No workflow-engine or orchestration-framework product survey; patterns are characterized by their control semantics, not by vendor (except Topic 13's deliberate comparison).
- No multi-agent interoperability protocols (MCP, A2A — Chapter 9).
- No treatment of the model's internal planning (Chapter 2); this chapter is the external control structure.
- No general distributed-systems tutorial; durable execution and exactly-once (Topic 10) appear as they bear on agent workflows, grounded in Chapters 3 and 7.

## 7. Measurable outcomes for the reader

1. **Place a task on the workflow–agent spectrum** and choose the least-complex control structure that meets its requirements (Topics 1, 12).
2. **Compose the five workflow patterns** (prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer) and state when each applies (Topic 2).
3. **Route deliberately** by intent, capability, risk, cost, latency, and locality (Topic 3), and choose a multi-agent control architecture (Topic 4).
4. **Choose handoffs vs agents-as-tools** from ownership and final-answer authority (Topics 5–6), and type the workflow state that flows between steps (Topic 7).
5. **Place HITL checkpoints and replanning** at the right control points (Topics 8–9), and build durable execution with honest exactly-once semantics (Topic 10).
6. **Prove termination** and detect cycles (Topic 11); **decide when orchestration complexity exceeds the value of autonomy** (Topic 12); and **test workflows** for conformance and properties (Topic 14).

## 8. Source ledger for this chapter

All previously established tags remain in force. New or newly-central in this chapter:

| Tag | Source | Provenance |
|---|---|---|
| [BEA] | Anthropic, "Building effective agents" (workflow patterns; workflows vs agents; simplicity principle) | https://www.anthropic.com/engineering/building-effective-agents |
| [OAO] | OpenAI, agent-orchestration guide (handoffs vs agents-as-tools; "start with one agent") | https://developers.openai.com/api/docs/guides/agents/orchestration |
| [ADK] / [ADK-A] | Google ADK runtime event loop and agent classes (workflow agents: Sequential, Parallel, Loop; LlmAgent) | https://adk.dev/runtime/event-loop/ ; https://adk.dev/agents/ |

**Evidence-quality note, stated plainly and enforced throughout.** The evidence here is *vendor engineering guidance* [BEA; OAO; ADK] plus the harness literature [CAH; HX; HB]. Three disciplines follow:

1. **The patterns are documented; their comparative performance is not.** [BEA] names five workflow patterns and says *when* to use each — but publishes **no measured comparison** of, say, orchestrator-workers vs a fixed pipeline on a task suite. The patterns are a design vocabulary with sourced applicability heuristics, not a benchmarked ranking. This chapter uses them as vocabulary and flags where a choice between them is unmeasured.
2. **The simplicity principle is guidance with a stated rationale, not a measured law.** "Find the simplest solution possible" [BEA] and "start with one agent" [OAO] are vendor recommendations grounded in the cost/latency/error-accumulation trade (which *is* sourced — Chapter 1, Topic 8) — but the *crossover point* (when complexity starts paying off) is workload-specific and unmeasured. Topic 12 states the mechanism and hands the reader the experiment.
3. **Durable execution and exactly-once rest on Chapters 3 and 7, and inherit their honesty.** Exactly-once is an *illusion* (Topic 10's title word is deliberate) — Chapter 5, Topic 11 established that ambiguous failures make true exactly-once impossible without idempotency; this chapter carries that forward rather than promising what the sources do not support.

**Notation and statistics contract:** Chapter 1, Topic 12 binds this chapter. A control structure is part of $D_c$ (deterministic application policy) composing model-directed steps that induce $\pi_{\mathrm{exec}}$; workflow outcomes are measured as vectors (completion, cost, latency, $\kappa$) with intervals (Topic 14). Syntheses beyond the sources are flagged **[synthesis]** or **[derived]**; anything unmeasured — most pattern comparisons and the complexity crossover — is stated as unmeasured.

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
01 the control-structure spectrum            ── the premise (workflows dominate)
02 the composable workflow patterns          ──┐
03 routing                                     ├─ deterministic composition
04 multi-agent control architectures           │
05 handoffs vs agents-as-tools                  │
06 ownership, aggregation, final-answer authority ┘
07 typed workflow state                       ──┐
08 human-in-the-loop checkpoints                ├─ making control safe
09 dynamic replanning after failure             │
10 durable execution & exactly-once illusions  ──┘
11 termination proofs & cycle detection       ──┐
12 when complexity exceeds autonomy's value     ├─ proving control
13 comparative SDK implementations              │
14 workflow conformance & property testing    ──┘
```

Chapter 9 asks when the sub-agents this chapter treats as control primitives should instead be independent, collaborating agents; Chapter 10 makes durable execution the survival discipline for long-horizon runs.

## 10. Notation and grounding contract

Chapter 1, Topic 12 binds this chapter. A control structure is part of $D_c$; it composes model-directed steps (each an $\operatorname{Assemble}\to\pi_M\to\operatorname{Admit}\to\operatorname{Dispatch}$ cycle, Chapter 3) into a graph. Workflow state is typed (Topic 7); durable execution is event-sourced (Chapter 3, Topic 4; Chapter 7, Topic 3). Every claim carries a source tag; every synthesis is flagged **[synthesis]** or **[derived]**; the simplicity principle and pattern applicability are reported as sourced *guidance*, and pattern comparisons and complexity crossovers are stated as unmeasured where the sources do not measure them.

## Sources

[BEA] Anthropic, "Building effective agents" — workflows ("systems where LLMs and tools are orchestrated through predefined code paths") vs agents ("systems where LLMs dynamically direct their own processes and tool usage"); "predictability versus autonomy"; the augmented LLM (retrieval, tools, memory); the five workflow patterns (prompt chaining, routing, parallelization with sectioning/voting, orchestrator-workers, evaluator-optimizer) with per-pattern applicability; "find the simplest solution possible, and only increasing complexity when needed"; agents for "open-ended problems where it's difficult or impossible to predict the required number of steps"; "higher costs, and the potential for compounding errors"; "Optimizing single LLM calls with retrieval and in-context examples is usually enough" — https://www.anthropic.com/engineering/building-effective-agents
[OAO] OpenAI, agent-orchestration guide — handoffs ("control moves to the specialist agent"; specialist owns the reply) vs agents-as-tools ("the manager keeps ownership of the reply"); "Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"; `handoffs`/`asTool`; "Give each specialist a narrow job" — https://developers.openai.com/api/docs/guides/agents/orchestration
[ADK] / [ADK-A] Google ADK — runtime event loop (commit-before-continue); workflow agents (Sequential, Parallel, Loop) and LlmAgent as deterministic composition primitives — https://adk.dev/runtime/event-loop/ , https://adk.dev/agents/
[CAH] Code as Agent Harness, arXiv:2605.18747 — planning loci; the PEV (Plan–Execute–Verify) loop; workflow-orchestration tool use — `Knowledge_source/2605.18747v1.pdf`
