# Topic 4 — Centralized Supervisor, Hierarchical Delegation, Peer Collaboration, and Market-Style Allocation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Four topologies for arranging agents, ordered by **how much coordination the agents themselves must do** — which is the axis that matters, because the sources are explicit that **"LLM agents are not yet great at coordinating and delegating to other agents in real time"** [MAR].

**Prerequisites.** Topic 1 (the four disqualifiers — including the coordination-capability one); Topic 3 (roles, information, authority); Chapter 8, Topic 4 (the single-agent control architectures these generalize).

**Terminology.** *Centralized supervisor*: one lead, flat subagents. *Hierarchical*: leads of leads. *Peer collaboration*: agents coordinate directly, no supervisor. *Market*: agents bid for tasks.

**Boundaries.** Inside: the four topologies, their coordination demands, and the evidence for each. Outside: the justification (Topics 1–2); communication mechanics (Topic 7); the failure modes (Topic 8).

**Exclusions.** No multi-agent-systems (MAS) research survey; the classical MAS literature's market and auction mechanisms are named, not developed, because **no source in this book's ledger reports them working with LLM agents.**

**Outcomes.** The reader can choose a topology from the coordination burden it imposes, and knows why the sources' shipped systems all use the *least* coordination-demanding one.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Once several agents are justified (Topic 1), they must be arranged. The classical multi-agent-systems literature offers a rich menu — supervisors, hierarchies, peer networks, markets, auctions, contract nets. **The agent-LLM literature ships exactly one of them.**

**Bottleneck.** [MAR] states the constraint that collapses the menu: **"LLM agents are not yet great at coordinating and delegating to other agents in real time."** **Coordination is itself a hard task that the models perform poorly** — and every topology that *demands more coordination from the agents* pays for it in the failures [MAR] documents (spawning 50 subagents, duplicating work, "distracting each other with excessive updates").

**So the topology choice is not about elegance — it is about how much coordination you are asking a capability-limited coordinator to do.**

**Objective.** Choose the topology that imposes the *least* coordination burden consistent with the task, and recognize that the exotic topologies (peer, market) are **unvalidated with LLM agents** in every source available here.

**Assumptions.** Agents coordinate poorly in real time [MAR]. The lead is a model and its decomposition/synthesis are model-directed steps.

**Constraints.** More decentralization = more agent-performed coordination = more exposure to the capability limit.

**Success criteria.** The topology is chosen deliberately; the coordination burden is bounded; the system does not rely on a coordination capability the sources say the models lack.

## 3. Intuition first, then formalization

### 3.1 Intuition: one axis — how much coordination do the agents have to do?

The four topologies form a spectrum of **agent-performed coordination**:

- **Centralized supervisor** (least coordination). One lead decomposes, delegates to flat subagents, and synthesizes. **The subagents coordinate with *nobody* — they do their task and report.** All coordination is done by *one* agent (the lead), and even that is hard enough that [MAR] devotes eight prompt-engineering principles to it. **This is what every shipped system in the sources uses**: [MAR]'s research system (lead + parallel subagents + citation agent), [OMA]'s root + subagents.

- **Hierarchical delegation** (more). Leads of leads. A sub-lead decomposes further. **[OMA] supports this explicitly** — agent tree paths like `/root/researcher` and `/root/reviewer/tester`, with "no fixed limit on the total number of subagents or tree depth" [OMA]. **Coordination burden grows with depth**, and so does the error compounding (each level is a $K_M$ multiplier — Chapter 1, Topic 8).

- **Peer collaboration** (much more). Agents talk to each other directly, no supervisor. **Each agent must decide who to talk to, when, and about what** — coordination as a continuous, distributed decision. **This is precisely what [MAR] says LLM agents are not yet good at.** And [MAR]'s documented failure — agents "distracting each other with excessive updates" — is what peer chatter looks like.

- **Market/auction allocation** (most). Agents bid for tasks; a mechanism allocates. **Requires agents to value tasks, bid strategically, and honor allocations.** **No source in this book's ledger reports an LLM-agent market working.** It is a well-developed classical MAS idea whose LLM instantiation is, as far as these sources show, **unvalidated.**

**The intuition, stated bluntly: the shipped systems all use the topology that demands the least coordination from the agents, because the agents are bad at coordination.** The exotic topologies are not obviously wrong — they are *unevidenced*, and the one source that speaks to the capability says it is lacking.

### 3.2 Formalization: the coordination-burden ordering

Let $\mathrm{CB}(\text{topology})$ be the number of coordination decisions the *agents* (not the harness) must make **[synthesis]**:

$$
\mathrm{CB}(\text{supervisor}) \;<\; \mathrm{CB}(\text{hierarchy}) \;<\; \mathrm{CB}(\text{peer}) \;<\; \mathrm{CB}(\text{market}).
$$

| Topology | Coordination decisions made by agents | Evidence in the sources |
|---|---|---|
| **Supervisor** | Lead: decompose, delegate, synthesize. **Subagents: none.** | **Shipped** [MAR; OMA] |
| **Hierarchy** | As above, at each level; depth $d$ multiplies it | **Supported** [OMA: tree paths, no depth limit] |
| **Peer** | Every agent: who, when, what to communicate | **None** — and [MAR] says the capability is lacking |
| **Market** | Every agent: value, bid, honor allocation | **None** |

**The invariant this yields [derived from [MAR]'s capability statement]:**

$$
\textbf{TP-1 (do not exceed the coordination capability):}\quad
\text{choose the topology with the LOWEST } \mathrm{CB}\ \text{that the task admits.}
$$

TP-1 is Chapter 8's simplicity default (`start with one agent`; `find the simplest solution`) applied to topology: **do not ask the agents to do coordination work you can do in the harness.** A supervisor topology puts the coordination in *one* agent, with a *prompt* you can engineer (and [MAR] shows how). A peer topology distributes it across *all* agents, where you cannot.

### 3.3 Why the supervisor topology dominates — and its one real limitation

The supervisor's advantages are structural **[synthesis; grounded in [MAR]]**:

- **Coordination is centralized and therefore *engineerable*.** [MAR]'s eight prompt principles all target the *lead*. You can iterate on one prompt; you cannot iterate on emergent peer chatter.
- **Context isolation works cleanly.** Subagents explore in fresh windows and report distillations (Topic 1's mechanism). In a peer topology, agents share context ad hoc, and the isolation benefit degrades.
- **Aggregation has one owner.** Chapter 8, Topic 6's O-2/O-3 (pessimistic status aggregation, code-held answer authority) has a clear home: the lead. **In a peer topology, who aggregates? Who decides the answer?** The final-answer-authority problem becomes *harder*, not easier.
- **Authority flows down a tree** (Topic 3's RA-1). In a peer mesh, authority scoping is a graph problem.

**The supervisor's real limitation, and [MAR] names it:** **"lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents"** [MAR]. The lead **cannot steer subagents mid-task**, and the system **blocks on the slowest** [MAR].

**[MAR]'s stated future direction is asynchronous execution — and it names the cost honestly:** "Asynchronous execution would enable additional parallelism: agents working concurrently and creating new subagents when needed. **But this asynchronicity adds challenges in result coordination, state consistency, and error propagation**" [MAR].

**That sentence is the whole topic in miniature: every step away from the simple supervisor buys parallelism and pays in coordination complexity — and coordination is what the agents are bad at.**

## 4. Architecture

```
   THE COORDINATION-BURDEN SPECTRUM (§3.2) — CB = decisions the AGENTS must make

   ┌── CENTRALIZED SUPERVISOR — CB: LOWEST ─────────────────────────────────┐
   │                    ┌────────┐                                           │
   │                    │  LEAD  │  decompose · delegate · synthesize        │
   │                    └───┬────┘  ← ALL coordination lives HERE, in ONE    │
   │        ┌───────────────┼───────────────┐    prompt you can ENGINEER     │
   │        ▼               ▼               ▼    ([MAR]'s 8 principles)      │
   │    ┌───────┐       ┌───────┐       ┌───────┐                            │
   │    │ sub 1 │       │ sub 2 │       │ sub 3 │  ← subagents coordinate    │
   │    └───────┘       └───────┘       └───────┘     with NOBODY            │
   │  ★ SHIPPED: [MAR]'s research system; [OMA]'s root+subagents             │
   │  ⚠ LIMIT: synchronous — blocks on the SLOWEST; lead cannot steer mid-task│
   └────────────────────────────────────────────────────────────────────────┘

   ┌── HIERARCHICAL — CB: HIGHER (grows with depth d) ──────────────────────┐
   │    /root  →  /root/researcher  →  /root/reviewer/tester                 │
   │    [OMA]: "no fixed limit on the total number of subagents or tree depth"│
   │    ⚠ each level multiplies K_M and compounds error (Ch.1 T8)            │
   └────────────────────────────────────────────────────────────────────────┘

   ┌── PEER COLLABORATION — CB: HIGH ───────────────────────────────────────┐
   │    agents talk directly; each decides WHO/WHEN/WHAT to communicate      │
   │    ⚠⚠ [MAR]: "LLM agents are not yet great at coordinating and          │
   │       delegating to other agents in real time"                          │
   │    ⚠⚠ [MAR]'s documented failure: agents "distracting each other with    │
   │       excessive updates" ← THIS IS WHAT PEER CHATTER LOOKS LIKE          │
   │    ✗ NO source reports this working with LLM agents                     │
   └────────────────────────────────────────────────────────────────────────┘

   ┌── MARKET / AUCTION — CB: HIGHEST ──────────────────────────────────────┐
   │    agents value tasks, bid, honor allocations                           │
   │    ✗ NO source in this book's ledger reports an LLM-agent market working │
   │    → a well-developed CLASSICAL MAS idea, UNVALIDATED for LLM agents    │
   └────────────────────────────────────────────────────────────────────────┘

   TP-1: choose the LOWEST-CB topology the task admits.
         Do not ask the agents to do coordination work the harness can do.
```

## 5. Grounding

- **The shipped topology is a centralized supervisor:** [MAR]'s research system is a **lead agent (Opus 4) + parallel subagents (Sonnet 4) + a citation agent**; the lead "analyzes queries, develops strategy, spawns subagents, synthesizes results," and subagents "operate independently in parallel," returning findings to the LeadResearcher [MAR].
- **The coordination capability limit — the constraint that collapses the menu:** **"LLM agents are not yet great at coordinating and delegating to other agents in real time"** [MAR].
- **What poor coordination looks like:** early agents "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and **distracting each other with excessive updates**" [MAR] — **the last is peer chatter, and it is listed as a failure.**
- **Hierarchy is supported by the API:** agent tree paths (`/root/researcher`, `/root/reviewer/tester`); "The API imposes no fixed limit on the total number of subagents or tree depth" [OMA]; `list_agents` "returns tree structure, statuses, `last_task_message`" [OMA].
- **The supervisor's synchronous limitation, and the async trade:** "lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents"; the lead cannot steer mid-task; and asynchronous execution "adds challenges in result coordination, state consistency, and error propagation" [MAR].
- **Concurrency is bounded, not unbounded:** `max_concurrent_subagents` "limits the number of active subagent turns across the entire tree," default `3` (recommended) [OMA] — **even the API that supports unlimited depth recommends a low concurrency.**
- **Collective intelligence is the aspiration, not the current state:** [MAR] invokes human "collective intelligence and ability to coordinate" as the motivation [MAR] — **an aspiration explicitly qualified by the capability limit above.**
- **Coordination bottlenecks are documented in the harness literature:** [CAH]'s account of multi-agent systems relying on implicit state ("agents cannot reliably detect when their internal understanding diverges from the true program state") and its warning that "code-mediated channels do not eliminate coordination bottlenecks" [CAH].

**Evidence gap, and it is stark.** **Two of the four topologies — peer collaboration and market allocation — have *no supporting evidence* in this book's sources.** They are staples of the classical MAS literature, and **this book will not present them as validated LLM-agent designs**, because nothing here shows them working. **The one source that speaks to the required capability says it is lacking** [MAR]. **TP-1 and the coordination-burden ordering are [synthesis]** — reasoned from [MAR]'s capability statement and the shipped-system evidence. **No source compares topologies experimentally.**

## 6. Implementation

**The supervisor topology — the one with evidence:**

```python
async def supervisor_topology(task, lead, subagent_pool, ctx):
    """The SHIPPED topology [MAR; OMA]. ALL coordination lives in the LEAD's prompt —
    which is why [MAR] devotes 8 principles to engineering it. Subagents coordinate
    with NOBODY: they do their task and report."""

    n, tool_budget = scaling_rule(task)                  # [MAR]: 1 / 2-4 / 10+ (Topic 2)
    subtasks = lead.decompose(task, n=n)                 # K_M — the lead's coordination

    async def run(st: SubagentTask):
        spec = spawn_subagent(lead.spec, st, ctx)        # RA-1/RA-2 (Topic 3)
        result, kappa = await subagent_pool.run(spec, st, tool_budget=tool_budget)
        return Constituent(result=distill(result), kappa=kappa, required=st.required)

    constituents = await gather_bounded(
        [run(st) for st in subtasks],
        max_concurrent=MAX_CONCURRENT_SUBAGENTS,         # [OMA]: default 3 (Topic 15)
    )

    # Chapter 8, Topic 6 still applies — and no SDK does this for you (Ch.8 T13):
    kappa_agg = aggregate_status(constituents)           # O-2 — pessimistic
    answer = lead.synthesize(task, [c.result for c in constituents])
    return finalize(answer, kappa_agg)                   # O-3 — CODE holds authority
```

**Hierarchical delegation — bounded, because depth compounds error:**

```python
def spawn_with_depth_bound(parent, task, ctx, max_depth: int = 2):
    """[OMA] imposes 'no fixed limit on… tree depth'. YOU should.
    Each level multiplies K_M and compounds error (Ch.1 T8), and each level's lead
    is a coordinator — the thing [MAR] says LLM agents are not yet good at."""
    if ctx.depth >= max_depth:
        raise DepthExceeded(
            f"delegation depth {ctx.depth} ≥ {max_depth}. Each level adds a coordinator, "
            f"and '[LLM] agents are not yet great at coordinating' [MAR]. Flatten the tree."
        )
    return spawn_subagent(parent, task, ctx.at_depth(ctx.depth + 1))
```

**Peer collaboration — if you must, bound the chatter:**

```python
def peer_message(sender, recipient, msg, ctx) -> None:
    """[MAR]'s documented failure: agents 'distracting each other with excessive updates'.
    That IS peer chatter. If you build a peer topology, BOUND the communication —
    the agents will not bound it themselves."""
    ctx.message_budget[sender] -= 1
    if ctx.message_budget[sender] < 0:
        raise ChatterBudgetExceeded(
            f"{sender} exceeded its message budget. [MAR]: agents 'distracting each other "
            f"with excessive updates' is a documented failure of unbounded peer messaging."
        )
    ctx.deliver(sender, recipient, msg)
```

**Market allocation — the honest stub:**

```python
def market_allocation(*args, **kwargs):
    """NOT IMPLEMENTED — and deliberately so.

    Market/auction allocation is a well-developed CLASSICAL multi-agent-systems idea.
    NO source in this book's ledger reports it working with LLM agents, and the one
    source that speaks to the required capability says: 'LLM agents are not yet great at
    coordinating and delegating to other agents in real time' [MAR].

    If you build one, you are ahead of the published evidence. Measure it (§8)."""
    raise NotImplementedError("unvalidated for LLM agents — see §5's evidence gap")
```

## 7. Trade-offs

| Topology | Coordination burden | Parallelism | Evidence | Failure mode |
|---|---|---|---|---|
| **Supervisor** | **Lowest** (one lead) | Good (parallel subagents) | **Shipped** [MAR; OMA] | Synchronous bottleneck; blocks on slowest [MAR] |
| **Hierarchy** | Grows with depth | Better (nested parallelism) | **Supported** [OMA] | Error compounds per level; more coordinators |
| **Peer** | **High** (every agent) | Potentially high | **None** | "Distracting each other with excessive updates" [MAR] |
| **Market** | **Highest** | Potentially high | **None** | Unvalidated |

**The trade that decides the topology: coordination is the scarce capability.** Every step toward decentralization asks the *agents* to do more coordination — and [MAR] states plainly that they are not yet good at it. **The supervisor topology is not shipped everywhere because it is elegant; it is shipped because it concentrates the coordination into one prompt that a human can engineer**, and even then it took [MAR] eight principles and a documented list of failures to get right.

**The async trade is the supervisor's one real frontier, and [MAR] prices it honestly.** Synchronous execution "simplifies coordination" and "creates bottlenecks"; asynchronous execution buys parallelism and "adds challenges in result coordination, state consistency, and error propagation" [MAR]. **This is the same trade as the topology spectrum — parallelism for coordination complexity — and it is unresolved.**

**On peer and market topologies, this book's position is explicit: they are unevidenced, not disproven.** The classical MAS literature developed them for agents with well-defined utility functions and reliable protocols. **LLM agents have neither**, and the one relevant capability statement in the sources is negative. **If you build one, you are ahead of the published evidence — which is a legitimate research position and a poor production default.**

## 8. Experiments

**The topology comparison — unrun in every source.** Same task, four topologies (supervisor / hierarchy-depth-2 / peer / market). Metrics: completion, **token cost**, wall-clock, coordination overhead (messages exchanged, duplicate work), and $\kappa$ distribution.

**Prediction from [MAR]'s capability statement (TP-1):** **supervisor wins on reliability and cost; peer and market show high coordination overhead and coordination failures** ("excessive updates," duplicate work, mis-allocation). **This experiment would be a genuine contribution — no source runs it.**

**The depth sweep (hierarchy).** Vary tree depth (1, 2, 3, 4). Measure completion and error compounding. **Prediction: each level multiplies $K_M$ and compounds error** (Chapter 1, Topic 8) — **find the depth at which the added decomposition stops paying.** [OMA] imposes no depth limit; **you should** (§6).

**The synchronous-bottleneck measurement.** Wall-clock vs mean subagent duration [MAR's straggler cost, Topic 2]. **The gap is what async execution would recover** — and [MAR]'s honest list of async's costs (result coordination, state consistency, error propagation) is what you would pay for it.

**The peer-chatter budget test.** If building a peer topology: vary the message budget. **Measure: task completion vs messages exchanged.** **Prediction from [MAR]: unbounded messaging degrades performance** ("distracting each other with excessive updates").

**Statistics.** Paired across topologies; report token cost and wall-clock as first-class; task-clustered bootstrap; Holm across topologies (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Choosing a topology beyond the coordination capability.** Peer or market with LLM agents that "are not yet great at coordinating" [MAR]. Mitigation: TP-1 — lowest CB the task admits.
- **Excessive peer chatter.** [MAR]'s documented failure — "distracting each other with excessive updates." Mitigation: bound the messaging (§6); prefer a supervisor.
- **Unbounded hierarchy depth.** [OMA] imposes no limit; each level compounds error and adds a coordinator. Mitigation: bound the depth (§6).
- **Synchronous bottleneck.** The system blocks on the slowest subagent; the lead cannot steer mid-task [MAR]. Mitigation: per-subagent timeouts; consider async *with its costs* [MAR].
- **Over-spawning.** "Spawning 50 subagents for simple queries" [MAR]. Mitigation: scaling rules (Topic 2).
- **Aggregation without an owner.** In a peer topology, who holds final-answer authority (Chapter 8, Topic 6's O-3)? **This problem gets *harder* with decentralization.** Mitigation: a supervisor has an obvious answer-holder; a peer mesh does not.
- **Concurrency unbounded.** [OMA] recommends `max_concurrent_subagents=3`; unbounded concurrency multiplies cost and contention. Mitigation: Topic 15.
- **Edge case — the task that genuinely needs peer coordination.** Some tasks (negotiation, multi-party simulation) *are* peer-shaped. **Here you are ahead of the evidence** — build it, measure it, and expect the coordination failures [MAR] documents.
- **Open limitation.** **Peer and market topologies have no supporting evidence in this book's sources**, and the one relevant capability statement is negative [MAR]. **No source compares topologies experimentally.** TP-1 and the CB ordering are **[synthesis]**. The async frontier is **open** — [MAR] names it as future work and lists its unsolved costs.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **The shipped topology is a centralized supervisor:** lead agent + parallel subagents + citation agent [MAR]; root + subagents [OMA].
2. **"LLM agents are not yet great at coordinating and delegating to other agents in real time"** [MAR] — the capability limit that collapses the topology menu.
3. Documented coordination failures include agents **"distracting each other with excessive updates"** [MAR] — peer chatter, as a failure.
4. Hierarchy is API-supported with "no fixed limit on the total number of subagents or tree depth" [OMA] — **and the same API recommends `max_concurrent_subagents=3`.**
5. The supervisor is **synchronous**, blocks on the slowest subagent, and the lead "cannot steer subagents mid-task" [MAR].
6. Async execution "adds challenges in result coordination, state consistency, and error propagation" [MAR] — **an open frontier, priced honestly.**
7. **Peer and market topologies have no supporting evidence in these sources.**

**Decision rules.**
- **Choose the lowest-coordination-burden topology the task admits** (TP-1) — coordination is the scarce capability.
- **Default to the centralized supervisor** — it is the only topology with shipped evidence, and it concentrates coordination into one engineerable prompt.
- **Bound hierarchy depth** — [OMA] does not; each level compounds error and adds a coordinator.
- **If you build peer, bound the messaging** — the agents will not bound it themselves [MAR].
- **Treat market allocation as research, not production** — it is unvalidated for LLM agents.
- **Do not ask the agents to do coordination the harness can do.**

**Production implications.**
1. Use the supervisor topology unless you have a specific reason not to; it is where all the evidence is.
2. Bound your delegation depth and concurrency ([OMA]'s default of 3 is a reasonable start).
3. Measure the straggler cost; it tells you what the synchronous bottleneck is costing and what async would recover.
4. If you are building peer or market coordination, know that you are ahead of the published evidence and instrument accordingly.

**Connections.** This topic arranges Topic 3's roles into structures, bounded by Topic 1's coordination disqualifier. It generalizes Chapter 8, Topic 4's single-agent architectures (supervisor–worker becomes the centralized supervisor; blackboard becomes peer collaboration — **and Chapter 8's A-2/A-3 hazards, write races and deadlock, are exactly what a peer topology invites**). Topic 7 details the communication; Topic 8 catalogues the failures; Topic 15 bounds the concurrency. Chapter 8, Topic 6's aggregation problem gets *harder* as topology decentralizes.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — the lead-agent + parallel-subagents + citation-agent architecture; **"LLM agents are not yet great at coordinating and delegating to other agents in real time"**; the early coordination failures ("spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and **distracting each other with excessive updates**"); the synchronous bottleneck ("lead agents execute subagents synchronously… creates bottlenecks in the information flow between agents"; the lead cannot steer mid-task); the async frontier ("Asynchronous execution would enable additional parallelism… But this asynchronicity adds challenges in result coordination, state consistency, and error propagation"); collective intelligence as the motivation — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — hierarchical agent tree paths (`/root/researcher`, `/root/reviewer/tester`); "The API imposes no fixed limit on the total number of subagents or tree depth"; `list_agents` returning "tree structure, statuses, `last_task_message`"; `max_concurrent_subagents` limiting active subagent turns "across the entire tree," **default 3 (recommended)** — https://developers.openai.com/api/docs/guides/responses-multi-agent
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) — multi-agent systems relying on implicit state ("agents cannot reliably detect when their internal understanding diverges from the true program state"); "code-mediated channels do not eliminate coordination bottlenecks"
