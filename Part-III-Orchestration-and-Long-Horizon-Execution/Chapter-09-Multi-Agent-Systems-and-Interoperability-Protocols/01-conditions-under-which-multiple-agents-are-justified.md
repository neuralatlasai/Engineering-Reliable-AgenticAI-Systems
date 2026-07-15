# Topic 1 — Conditions Under Which Multiple Agents Are Justified

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The chapter's premise: **when does splitting a task across agents actually pay?** The sources give an unusually crisp answer — a large measured gain, a large measured cost, and four explicit conditions under which it does not work at all.

**Prerequisites.** Chapter 8, Topic 12 (when orchestration complexity exceeds autonomy's value — this topic is that question, one level up); Chapter 8, Topic 5 ([OAO]'s "start with one agent whenever you can").

**Terminology.** *Multi-agent*: several agents, each with its own context window and loop, coordinating on one task. *Decomposition gain*: the performance improvement from splitting. *Coordination tax*: the cost of splitting (Topic 2).

**Boundaries.** Inside: the justification decision and its four disqualifying conditions. Outside: the gain/tax calculus in detail (Topic 2); the topology once justified (Topic 4).

**Exclusions.** No framework advocacy.

**Outcomes.** The reader can decide whether a task warrants multiple agents, and can recognize the four conditions under which the answer is *no* regardless of how attractive the gain looks.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Multi-agent architectures are fashionable, expensive, and — on the right task — extraordinarily effective. The measured result is striking: **"a multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"** [MAR]. That is not a marginal gain; it is a different capability regime.

**And the same source reports the cost: multi-agent systems "use about 15× more tokens than chats"** [MAR] (single-agent research is ~4×). **A 90.2% gain at 15× cost is a magnificent trade on a high-value research task and an absurd one on a task a single agent already handles.**

**Bottleneck.** Teams adopt multi-agent because it is impressive, not because their task has the properties that make it pay. And the properties are *specific*: [MAR] names four conditions under which multi-agent does **not** work, and they disqualify a large fraction of the tasks people apply it to — including, explicitly, **most coding**.

**Objective.** A justification decision grounded in the task's *structure* (is it parallelizable? are the agents independent?) and its *economics* (is the value high enough to pay 15×?) — with the four disqualifying conditions checked first.

**Assumptions.** Each agent has its own context window (the source of the benefit — §3.2) and its own loop (the source of the cost).

**Constraints.** The 90.2% is one system, one eval, one domain. The 15× is a *measured* cost that transfers more readily than the gain does.

**Success criteria.** Multi-agent is adopted only where the task passes the structural test *and* the economic test; the four disqualifiers are checked before anything is built.

## 3. Intuition first, then formalization

### 3.1 Intuition: the benefit is *context*, and the cost is *coordination*

**Why multi-agent works, when it works.** The deepest reason is not "more agents do more work" — it is **context**. [MAR] states it precisely: **"Subagents facilitate compression by operating in parallel with their own context windows, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent."**

**Each subagent gets its own context budget** (Chapter 6, Topic 1). A single agent exploring twelve research directions must hold all twelve explorations in one window — and context rot (Chapter 6, Topic 1) degrades its recall as that window fills. Twelve subagents each explore one direction in a *fresh* window, and each returns a distilled summary. **The lead agent sees twelve summaries, not twelve explorations.** This is Chapter 6, Topic 11's sub-agent distillation and Chapter 8, Topic 4's supervisor–worker context argument — and [MAR] confirms it is the mechanism.

**So multi-agent is, fundamentally, a way of buying more *effective* context than one window can hold.** That is why it excels at research (many parallel explorations, each compressible) and fails at coding (few parallelizable subtasks, many dependencies — §3.3).

**Why it costs so much.** Every subagent is a full loop with its own context, its own tool calls, its own tokens. **15× the tokens of a chat** [MAR]. And the coordination itself is expensive: the lead must decompose (a model call), delegate (prompt engineering that [MAR] devotes eight principles to), wait, and synthesize (another model call). **Chapter 8's $K_M$ accounting applies: each subagent multiplies the model-directed step count, and error compounds across them** (Chapter 1, Topic 8).

### 3.2 Formalization: the justification condition

Multi-agent is justified when the decomposition gain exceeds the coordination tax **[synthesis; the terms are measured in [MAR]]**:

$$
\textbf{M-1 (the economic condition):}\quad
\underbrace{V \cdot \Delta P}_{\text{value} \times \text{performance gain}} \;>\; \underbrace{C_{\text{tokens}} \cdot 15\times \;+\; C_{\text{coord}}}_{\text{the tax}} .
$$

[MAR] states this directly: **"For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance."** **The value of the task is a *term in the equation*** — which means the same architecture is correct for a $10,000 research question and wrong for a $0.10 lookup, *with identical technical properties*. **This is the rare case where the engineering decision is explicitly an economic one, and the source says so.**

But M-1 is necessary and *not sufficient*, because the gain $\Delta P$ is not available on all tasks. The structural condition:

$$
\textbf{M-2 (the structural condition):}\quad
\Delta P \gg 0\ \text{requires the task to be \emph{parallelizable} and the subtasks \emph{independent}.}
$$

**[derived from [MAR]'s non-fit conditions]** If the subtasks are not parallelizable, there is nothing to distribute. If they are *dependent* — each needs the previous one's output — then the agents serialize, and you have paid the coordination tax for a sequential execution you could have had in one agent.

### 3.3 The four disqualifying conditions — check these first

[MAR] is explicit about where multi-agent **does not work**, and this list is the topic's most actionable output **[all four quoted from [MAR]]**:

1. **"Most coding tasks involve fewer truly parallelizable tasks than research."** — **Coding is named, specifically, as a poor fit.** This matters because coding agents are the most common agent application, and the multi-agent enthusiasm is strongest exactly where the source says it fits worst. A codebase's changes are *interdependent* (change a signature, and every caller must change), so the subtasks do not decompose cleanly.

2. **"Domains that require all agents to share the same context."** — If every agent needs the *whole* context, then the context-isolation benefit (§3.1) *evaporates* — you are paying 15× to give each agent the same window a single agent would have had. **The benefit's mechanism is the disqualifier's mirror image.**

3. **"Involve many dependencies between agents."** — Dependencies serialize. [OMA] states the same: prefer one agent when "each step depends directly on previous step" [OMA].

4. **"LLM agents are not yet great at coordinating and delegating to other agents in real time."** — **This is a capability limitation, stated by a vendor about its own models.** The coordination itself is a hard task the model performs imperfectly, and [MAR]'s early failures illustrate it: agents "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates" [MAR].

**These four conditions should be checked before any multi-agent design work.** They are cheap to evaluate and they disqualify most tasks. And [OMA]'s complementary "prefer one agent" list adds a fourth structural case: **"Agents contend over shared mutable state"** and **"Fixed, deterministic execution graph required"** [OMA] — the first is Chapter 8, Topic 4's write-race hazard, the second is Chapter 8, Topic 1's point that a determinable structure needs no autonomy at all.

## 4. Architecture

```
   THE DECISION — check the DISQUALIFIERS first (§3.3), then the economics

   ┌── STEP 1: THE FOUR DISQUALIFIERS [MAR] ────────────────────────────────┐
   │  ✗ Task is mostly CODING?           → "fewer truly parallelizable      │
   │                                        tasks than research"             │
   │  ✗ All agents need the SAME context? → the benefit's MECHANISM is gone  │
   │  ✗ Many DEPENDENCIES between agents? → they serialize; you pay 15× for  │
   │                                        a sequential run                 │
   │  ✗ Needs real-time coordination?     → "LLM agents are not yet great at │
   │                                        coordinating and delegating"     │
   │  + [OMA]: agents contend over shared mutable state? deterministic graph?│
   │                                                                        │
   │  ANY YES → DO NOT USE MULTI-AGENT. Stop here.                          │
   └────────────────────────────┬───────────────────────────────────────────┘
                                │ all NO
                                ▼
   ┌── STEP 2: THE STRUCTURAL CONDITION (M-2) ──────────────────────────────┐
   │  Is the task PARALLELIZABLE into INDEPENDENT subtasks?                  │
   │  → the benefit is CONTEXT ISOLATION (§3.1): each subagent explores in a │
   │    FRESH window and returns a DISTILLED summary [MAR; ECE]              │
   └────────────────────────────┬───────────────────────────────────────────┘
                                ▼
   ┌── STEP 3: THE ECONOMIC CONDITION (M-1) ────────────────────────────────┐
   │  V · ΔP  >  15× token cost + coordination cost                          │
   │  [MAR]: "multi-agent systems require tasks where the VALUE of the task  │
   │          is high enough to pay for the increased performance"            │
   │  ← the task's VALUE is a term in the engineering equation                │
   └────────────────────────────┬───────────────────────────────────────────┘
                                ▼
                       MULTI-AGENT JUSTIFIED
                       (measured: +90.2% on research [MAR] — ONE eval, ONE domain)
```

## 5. Grounding

- **The measured gain, with its full scope:** **"A multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"** [MAR]. **One system, one internal eval, one model pairing, one domain (research), one baseline.**
- **The worked example of *why*:** asked to identify all board members of S&P 500 IT companies, "the multi-agent system found the correct answers by decomposing this into tasks for subagents, while the single agent system failed to find the answer with slow, sequential searches" [MAR] — **a parallelizable, independent-subtask search problem: exactly M-2's shape.**
- **The mechanism is context:** "Subagents facilitate compression by operating in parallel with their own context windows, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent" [MAR].
- **The cost:** multi-agent systems "use about 15× more tokens than chats"; single-agent research "typically use about 4× more tokens than chat interactions" [MAR].
- **The economic condition, stated as such:** "For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance" [MAR].
- **The four disqualifiers**, quoted in §3.3 [MAR].
- **The complementary decision guidance:** use multi-agent when "work splits into independent, bounded tasks," "separate context improves focus," "parallel exploration reduces wall-clock time," or "comparing independent findings improves coverage"; **prefer one agent** when "each step depends directly on previous step," "task is small enough for single run," "agents contend over shared mutable state," or "fixed, deterministic execution graph required" [OMA].
- **The single-agent default:** "Start with one agent whenever you can" [OAO] (Chapter 8, Topic 5); "find the simplest solution possible" [BEA].
- **Open-ended tasks need autonomy:** "Research work involves open-ended problems where it's very difficult to predict the required steps in advance. You can't hardcode a fixed path for exploring complex topics, as the process is inherently dynamic and path-dependent" [MAR] — Chapter 8, Topic 1's W-2, restated for research.

**Evidence gap, stated carefully because the number is so quotable.** **The 90.2% is a real, measured result — and it is one vendor's internal eval on one domain with one model pairing.** [MAR] does not publish the eval's composition, its size, or its confidence interval. **It is strong evidence that decomposition can pay enormously on a parallelizable open-ended search task; it is not evidence about your domain**, and [MAR] itself names the domains where it does not transfer. **The 15× cost transfers more readily than the 90.2% gain** — costs are structural (a subagent is a full loop), while gains are task-dependent. **This asymmetry should make you more cautious, not less**: you can be confident of the cost and not of the benefit.

## 6. Implementation

**The disqualifier gate — check before designing (§3.3):**

```python
def multi_agent_disqualified(task) -> str | None:
    """[MAR]'s four non-fit conditions + [OMA]'s. Check these FIRST — they are cheap
    to evaluate and they disqualify most tasks."""

    if task.domain == "coding" and not task.has_independent_parallel_subtasks:
        return ("[MAR]: 'most coding tasks involve fewer truly parallelizable tasks "
                "than research'. Coding is NAMED as a poor fit.")

    if task.all_agents_need_full_context:
        return ("[MAR]: 'domains that require all agents to share the same context'. "
                "The context-isolation BENEFIT is the mechanism — if every agent needs "
                "the whole window, you pay 15× for nothing (§3.1).")

    if task.inter_agent_dependencies > DEPENDENCY_THRESHOLD:
        return ("[MAR]: 'many dependencies between agents' — they SERIALIZE. You pay the "
                "coordination tax for a sequential run. [OMA]: prefer one agent when "
                "'each step depends directly on previous step'.")

    if task.requires_realtime_coordination:
        return ("[MAR]: 'LLM agents are not yet great at coordinating and delegating to "
                "other agents in real time' — a stated CAPABILITY limitation.")

    if task.agents_contend_over_shared_mutable_state:      # [OMA]
        return "[OMA]: 'agents contend over shared mutable state' — Ch.8 T4's write races."

    if task.has_fixed_deterministic_graph:                  # [OMA]
        return ("[OMA]: 'fixed, deterministic execution graph required' — you do not need "
                "agents at all (Ch.8 T1's W-2).")

    return None
```

**The economic condition (M-1) — the task's value is a term in the equation:**

```python
def multi_agent_economically_viable(task, baseline_cost_tokens) -> dict:
    """M-1 [MAR]: 'multi-agent systems require tasks where the VALUE of the task is high
    enough to pay for the increased performance.' The same architecture is correct for a
    $10,000 research question and wrong for a $0.10 lookup."""
    mult = 15 / 4          # multi-agent (15× chat) vs single-agent research (4× chat) [MAR]
    projected_cost = baseline_cost_tokens * mult * TOKEN_PRICE
    projected_gain = task.value * EXPECTED_DELTA_P     # ← ΔP is NOT the 90.2%; measure YOURS

    return {
        "projected_cost": projected_cost,
        "projected_gain": projected_gain,
        "viable": projected_gain > projected_cost,
        "caveat": ("EXPECTED_DELTA_P must be MEASURED on your task. The 90.2% [MAR] is one "
                   "vendor's internal research eval — the COST transfers, the GAIN may not."),
    }
```

**The full decision:**

```python
def should_use_multi_agent(task, baseline) -> Decision:
    if reason := multi_agent_disqualified(task):           # STEP 1 — the disqualifiers
        return Decision.no(reason)

    if not (task.parallelizable and task.subtasks_independent):    # STEP 2 — M-2
        return Decision.no("not parallelizable into independent subtasks — no ΔP available")

    econ = multi_agent_economically_viable(task, baseline)          # STEP 3 — M-1
    if not econ["viable"]:
        return Decision.no(f"value too low for the 15× token cost [MAR]: {econ}")

    return Decision.yes("parallelizable, independent, and the value covers the tax — "
                        "but MEASURE ΔP before committing (§8)")
```

## 7. Trade-offs

| | Single agent | Multi-agent |
|---|---|---|
| **Performance (research)** | Baseline | **+90.2%** [MAR] — *one eval, one domain* |
| **Token cost** | ~4× chat (agentic research) [MAR] | **~15× chat** [MAR] |
| **Wall-clock** | Sequential | **Up to 90% faster** with parallel tool calling [MAR] |
| **Context** | One window (rots — Chapter 6, Topic 1) | **Each subagent gets a fresh window** — the mechanism |
| **Error compounding** | $K_M$ steps | **$K_M$ multiplied across agents** (Chapter 1, Topic 8) |
| **Coordination** | None | **Emergent behavior; hard to debug** (Topic 8) |
| **Fits** | Dependent, sequential, small, deterministic tasks | Parallelizable, independent, open-ended, **high-value** tasks |

**The trade, stated with both numbers.** A 90.2% gain for 15× the tokens is *superb* when the task is worth it and *ruinous* when it is not. **[MAR] makes the economics explicit and this book will not soften it: the value of the task is an engineering input.** A research question worth thousands of dollars of an analyst's time easily justifies 15×; a customer-support lookup does not, at any performance gain.

**The asymmetry that should govern adoption: the cost is certain and the gain is not.** The 15× is *structural* — a subagent is a full loop, and that transfers to every domain. The 90.2% is *task-dependent*, and [MAR] explicitly names the domains where it does not transfer (coding, shared-context, dependent, coordination-heavy). **So the honest prior is: expect the cost, measure the gain.**

## 8. Experiments

**The decomposition-gain measurement — the experiment that must precede adoption.** Run the task with (a) a single agent, (b) the multi-agent system. Measure: **completion, token cost, wall-clock latency, and $\kappa$ distribution** (Chapter 1, Topic 12).

- **The comparison that matters is gain-per-token**, not gain. A multi-agent system that wins by 90% at 15× cost has a *worse* gain-per-token than one that wins by 20% at 2× — and which is right depends on M-1's value term.
- **Prediction from [MAR]'s non-fit list:** on coding, dependent, or shared-context tasks, the gain will be small or negative *and* the cost will still be 15×. **This is the experiment that stops a bad adoption.**

**The token-variance check — [MAR]'s most double-edged finding.** [MAR] reports that on BrowseComp, **"token usage alone explains 80% of performance variance."** This raises a question the source does not answer and you should: **how much of the multi-agent gain is *decomposition* and how much is simply *spending more tokens*?**

**The controlled experiment: give the single agent the same token budget as the multi-agent system.** If the single agent — allowed to spend 15× — closes most of the gap, then the architecture is buying you *permission to spend*, not decomposition. **If it does not close the gap, the decomposition is real.** This experiment is not in [MAR] and it is the one this topic most wants run, because it separates the two hypotheses that the 90.2% cannot distinguish.

**The disqualifier validation.** On a task that *violates* one of [MAR]'s four conditions (e.g., a dependent coding task), measure multi-agent vs single. **Prediction: no gain, full cost.** This validates the disqualifiers on your workload.

**Statistics.** Paired designs (same tasks); McNemar on completion; **report token cost as a first-class outcome, not a footnote**; task-clustered bootstrap; Holm across arms (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Multi-agent adopted for fashion.** The task fails one of the four disqualifiers; the team pays 15× for nothing. **The default failure.** Mitigation: the disqualifier gate (§6) — cheap to check, disqualifies most tasks.
- **Multi-agent on coding.** [MAR] names it: "most coding tasks involve fewer truly parallelizable tasks than research." **The most common misapplication**, because coding agents are the most common agents. Mitigation: check for genuinely independent parallel subtasks.
- **Multi-agent where all agents need the full context.** The context-isolation mechanism — the *reason* it works — is absent. You pay 15× to give every agent the same window. Mitigation: disqualifier 2.
- **Dependent subtasks.** The agents serialize; you have bought a sequential run at a parallel price. Mitigation: disqualifier 3; [OMA]'s "each step depends directly on previous step."
- **Coordination overhead exceeding the gain.** [MAR]'s early failures: agents "spawning 50 subagents for simple queries… distracting each other with excessive updates." Mitigation: scaling rules (Topic 2); effort budgets.
- **Ignoring the economics.** A technically-justified multi-agent system on a low-value task. Mitigation: M-1 — the task's value is a term.
- **Quoting 90.2% out of scope.** Treating one vendor's research-eval number as a general multi-agent effect size. **Mitigation: always state the scope. The cost transfers; the gain may not.**
- **Edge case — the task that is parallelizable *and* low-value.** Technically a fit, economically not. **M-1 says no**, and it is right: a fast, cheap, adequate single-agent answer beats an expensive excellent one when the value does not justify the spend.
- **Edge case — the task whose value is *latency*.** Parallel tool calling "cut research time by up to 90%" [MAR]. If wall-clock time is the value (a user waiting), the 15× token cost may be worth it *for latency alone*, even without a quality gain. **The value term in M-1 need not be quality.**
- **Open limitation.** **The 90.2% is one internal eval, one domain, one model pairing, without a published interval or eval composition.** [MAR]'s own non-fit conditions bound its transferability. **And the token-variance finding (80% of variance from token usage) raises an unanswered question**: how much of the gain is decomposition versus spend? §8's controlled experiment is the way to find out, and no source runs it.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **"A multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"** [MAR] — one system, one eval, one domain.
2. Multi-agent uses **~15× more tokens than chat**; single-agent research ~4× [MAR].
3. The mechanism is **context compression by parallel windows** — subagents explore in their own windows and condense for the lead [MAR].
4. **"For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance"** [MAR] — the task's value is an engineering input.
5. **Four disqualifiers** [MAR]: most coding; shared-context domains; many inter-agent dependencies; real-time coordination ("LLM agents are not yet great at coordinating and delegating to other agents in real time").
6. [OMA] adds: prefer one agent when steps depend on each other, the task is small, agents contend over shared mutable state, or a deterministic graph is required.
7. Parallel tool calling cut research time by **up to 90%** [MAR].
8. **Token usage alone explains 80% of performance variance** on BrowseComp [MAR].

**Decision rules.**
- **Check the four disqualifiers first** — they are cheap and they disqualify most tasks, including most coding.
- **The mechanism is context isolation** — if every agent needs the full context, the benefit is gone.
- **The task's value is a term in the equation** (M-1) — the same architecture is right at high value and wrong at low.
- **Expect the cost; measure the gain.** The 15× is structural and transfers; the 90.2% is task-dependent and may not.
- **Run the token-matched baseline** (§8) — give the single agent 15× the budget and see how much of the gap closes. This separates decomposition from spend.
- **Start with one agent** [OAO; BEA] — the burden of proof is on the split.

**Production implications.**
1. Run the disqualifier gate before any multi-agent design; it will stop most projects, and that is the point.
2. Run the token-matched single-agent baseline (§8); it is the experiment that tells you whether you are buying decomposition or permission to spend.
3. Report token cost as a first-class metric from day one; at 15×, it is the decision variable, not a footnote.
4. Never quote 90.2% without its scope.

**Connections.** This topic is Chapter 8, Topic 12's decision procedure, one level up — same shape (justify the complexity or do not add it), higher stakes (15× rather than a code branch). The context-isolation mechanism is Chapter 6, Topic 11 and Chapter 8, Topic 4's distillation. Topic 2 develops the gain/tax calculus; Topic 4 chooses the topology once justified; Topic 14 measures marginal contribution; Topic 15 controls the cost this topic priced.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — **"A multi-agent system with Claude Opus 4 as the lead agent and Claude Sonnet 4 subagents outperformed single-agent Claude Opus 4 by 90.2% on our internal research eval"**; the S&P 500 board-members example; "Subagents facilitate compression by operating in parallel with their own context windows, exploring different aspects of the question simultaneously before condensing the most important tokens for the lead research agent"; multi-agent "use about 15× more tokens than chats" and single-agent research "about 4× more tokens than chat interactions"; **"For economic viability, multi-agent systems require tasks where the value of the task is high enough to pay for the increased performance"**; the four non-fit conditions ("most coding tasks involve fewer truly parallelizable tasks than research"; "domains that require all agents to share the same context or involve many dependencies between agents"; "LLM agents are not yet great at coordinating and delegating to other agents in real time"); "Research work involves open-ended problems where it's very difficult to predict the required steps in advance"; parallel tool calling cutting research time "by up to 90%"; **token usage alone explaining 80% of performance variance** on BrowseComp; the early coordination failures (50 subagents for simple queries) — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — use multi-agent when "work splits into independent, bounded tasks," "separate context improves focus," "parallel exploration reduces wall-clock time," "comparing independent findings improves coverage"; **prefer one agent** when "each step depends directly on previous step," "task is small enough for single run," "agents contend over shared mutable state," "fixed, deterministic execution graph required" — https://developers.openai.com/api/docs/guides/responses-multi-agent
[OAO] OpenAI, agent-orchestration guide — "Start with one agent whenever you can" — https://developers.openai.com/api/docs/guides/agents/orchestration
[BEA] Anthropic, "Building effective agents" — "find the simplest solution possible, and only increasing complexity when needed" — https://www.anthropic.com/engineering/building-effective-agents
