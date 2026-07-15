# Topic 4 — Planner–Executor, Supervisor–Worker, Blackboard, and Shared-State Architectures

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The four control architectures that organize a *plan* and its *execution* across multiple model-directed components, distinguished by **where the plan lives and who owns the shared state**.

**Prerequisites.** Topic 1 (the autonomy axis); Topic 2 (orchestrator-workers — this topic's supervisor–worker at pattern scale); Chapter 2, Topics 3–4 (the plan lifecycle; ReAct vs planner–executor as *model* behaviors); Chapter 7, Topic 2 (shared state and its scopes).

**Terminology.** *Planner–executor*: plan produced up front, then executed. *Supervisor–worker*: a supervisor delegates to workers and synthesizes. *Blackboard*: components communicate through a shared, structured state store rather than by direct message. *Shared state*: state readable/writable by multiple components.

**Boundaries.** Inside: the four architectures, their control and state semantics, and their failure modes. Outside: whether multiple agents are justified at all (Chapter 9 — this topic assumes the decomposition and asks how to structure it); the model's internal planning (Chapter 2); the typed state that flows (Topic 7).

**Exclusions.** No agent-framework survey.

**Outcomes.** The reader can choose an architecture from the plan's stability and the state's sharing needs, and can avoid the shared-state failures that make blackboards fail.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Once a task is decomposed (Topic 2's orchestrator-workers, or a static map), two questions remain: **who holds the plan**, and **how do the components share information?** These are orthogonal, and the four architectures are the useful combinations. Getting them wrong produces a system where the plan is stale (planner–executor on a changing environment), the supervisor is a bottleneck (supervisor–worker at scale), or the shared state is a race (blackboard without discipline).

**Bottleneck.** The plan and the environment can diverge. A planner–executor architecture commits to a plan *before* execution reveals what the environment actually contains — and if the environment surprises it, the plan is wrong and the executor executes a wrong plan faithfully. Meanwhile, shared-state architectures let components coordinate flexibly and, without discipline, let them **overwrite each other's work, read stale state, and deadlock**. The bottleneck is that both plan-rigidity and state-sharing have failure modes that only appear under environmental change and concurrency.

**Objective.** Choose the architecture from (i) the plan's *stability* under environmental feedback and (ii) the components' *state-sharing* needs, with the shared-state disciplines that make sharing safe.

**Assumptions.** Components are model-directed (each is an agent or an LLM call). The environment can surprise the plan. Concurrent components can conflict.

**Constraints.** A plan made before execution is a *prediction*, and predictions about the environment can be wrong (Chapter 2, Topic 3's plan lifecycle). Shared mutable state under concurrency requires the disciplines of Chapter 5, Topic 5 (E3) and Chapter 7, Topic 2.

**Success criteria.** The plan survives environmental feedback (or is replanned — Topic 9); shared state is not corrupted; the supervisor is not a bottleneck; ownership of every state item is clear.

## 3. Intuition first, then formalization

### 3.1 Intuition: two questions, four architectures

The architectures are the cells of a 2×2 on two questions **[synthesis]**:

**Q1: Is the plan made up front, or emergent?**
**Q2: Do components communicate *directly* (messages) or *indirectly* (shared state)?**

- **Planner–executor** — plan up front, direct execution. A planner produces a plan; an executor executes it. **Buys:** a legible, inspectable plan before any action (Chapter 2, Topic 4's transparency argument); deterministic execution of a fixed sequence. **Costs:** the plan is a *prediction* made without the information execution will reveal. **Fails when:** the environment surprises the plan — and it does. Chapter 2, Topic 3's plan lifecycle and this chapter's Topic 9 (replanning) exist because of this.

- **Supervisor–worker** — emergent plan, direct delegation. A supervisor "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results" [BEA]. This is [BEA]'s orchestrator-workers, at architecture scale. **Buys:** the decomposition adapts to what execution reveals; the supervisor sees worker results and can re-decompose. **Costs:** the supervisor is a $K_M$ and a *bottleneck* — everything flows through it, and its context accumulates every worker's result. **Fails when:** the supervisor's context saturates (Chapter 6) or it becomes the serialization point at scale.

- **Blackboard** — emergent plan, *indirect* communication through shared state. Components read and write a shared, structured state store; the "plan" emerges from what each component contributes when the state permits. **Buys:** loose coupling — components need not know each other; new components can be added without changing the others. **Costs:** **the shared state is a concurrency hazard**, and the emergent control flow is hard to reason about and hard to terminate (Topic 11). **Fails when:** components race, overwrite, or deadlock waiting for state that never arrives.

- **Shared-state (with explicit ownership)** — the disciplined blackboard. Shared state exists, but **every state item has an owner**, and only the owner writes it. **Buys:** blackboard's loose coupling *without* the write races. **Costs:** the ownership map must be designed and enforced. **This is the architecture to reach for when a blackboard is tempting.**

The intuition that decides between them: **planner–executor buys legibility and pays with rigidity; supervisor–worker buys adaptivity and pays with a bottleneck; blackboard buys decoupling and pays with concurrency hazards; disciplined shared-state buys blackboard's benefit and pays only a design cost.** And the meta-rule from Topic 1 applies throughout: **each of these adds model-directed decisions ($K_M$), so none should be reached for before the simpler structures fail.**

### 3.2 Formalization: the plan-validity and state-ownership invariants

**The planner–executor's core problem, formalized.** A plan $P$ is made at time $0$ under belief $b_0$ about the environment. Execution reveals the environment's actual state. The plan is valid only while its *assumptions* hold **[derived; grounded in Chapter 2, Topic 3]**:

$$
\textbf{A-1 (plan validity):}\quad
P\ \text{remains valid at step } i\ \text{iff}\ \ \mathrm{assumptions}(P) \subseteq \mathrm{observed}(s_i).
$$

**When an observation contradicts a plan assumption, the plan is invalid and executing it further is executing a known-wrong plan.** A planner–executor without an assumption check will do exactly that — faithfully execute a plan whose premise has been refuted. **The fix is not a better planner; it is a *validity check between steps*** (Topic 2's programmatic gate) that detects assumption violation and triggers replanning (Topic 9). **A planner–executor without a replanning path is a bet that the environment will not surprise it.**

**The shared-state invariant.** For shared state item $v$ with a set of writers $W(v)$ **[derived from Chapter 5, Topic 5's E3 and Chapter 7, Topic 2]**:

$$
\textbf{A-2 (single writer):}\quad
|W(v)| \le 1\ \text{for every shared item } v;\ \text{multiple writers require an explicit serialization or CRDT-like merge.}
$$

A-2 is the discipline that separates a *working* shared-state architecture from a broken blackboard. **Concurrent writers to the same state item produce lost updates**, and the failure is silent (Chapter 5, Topic 5's E3: parallel writes corrupt). Single-writer ownership makes the race unrepresentable: only one component may write $v$, so no write race on $v$ can occur.

$$
\textbf{A-3 (no wait cycles):}\quad
\text{the "component } c_i \text{ waits for state written by } c_j \text{" relation must be \emph{acyclic}, or the system deadlocks.}
$$

A-3 is the blackboard's other hazard: components blocking on state that will never be written, because the writer is itself blocked. This is a classic deadlock, and it arrives in blackboards *emergently* — nobody designed the cycle; it emerged from what each component decided to wait for. Topic 11's cycle detection applies.

### 3.3 The supervisor is a context bottleneck, and that is the architecture's real limit

The supervisor–worker architecture's cost is usually described as "a coordination overhead." Its *real* limit is a **context** limit, and it is specific **[derived; grounded in Chapter 6 and [ECE]]**.

The supervisor must (i) decide the decomposition, (ii) receive every worker's result, and (iii) synthesize a final answer [BEA]. Step (ii) means **every worker's output flows into the supervisor's context** — so the supervisor's context grows with the number and verbosity of workers. Chapter 6, Topic 1's context rot then applies: as the supervisor's context fills with worker results, its ability to synthesize degrades.

The mitigation is the one [ECE] documents: **workers return *distilled* results, not raw work.** A sub-agent "might explore extensively, using tens of thousands of tokens or more, but returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)" [ECE], achieving "clear separation of concerns—the detailed search context remains isolated within sub-agents, while the lead agent focuses on synthesizing and analyzing the results" [ECE].

**This is the architectural justification for supervisor–worker, and it is a *context* argument, not a coordination one:** the architecture exists to keep the workers' detailed context *out of* the supervisor's window. **A supervisor–worker system whose workers return raw output has thrown away the architecture's main benefit** and kept only its costs (the extra $K_M$, the latency, the bottleneck). **The distillation is not an optimization — it is the point.**

## 4. Architecture

```
   PLANNER–EXECUTOR — plan up front, then execute
   ┌──────────┐    plan P     ┌───────────┐
   │ PLANNER  │──────────────►│ EXECUTOR  │──► steps 1..n
   └──────────┘               └───────────┘
   A-1: P valid only while assumptions(P) ⊆ observed(s).
        NO assumption check ⇒ faithfully executes a REFUTED plan.
        NEEDS a validity gate + replanning path (Topic 9).

   SUPERVISOR–WORKER (orchestrator-workers [BEA]) — emergent plan, direct delegation
                 ┌────────────┐
       ┌────────►│ SUPERVISOR │◄────────┐   decomposes · delegates · SYNTHESIZES
       │         └─────┬──────┘         │
       │  distilled    │  subtasks      │  distilled
       │  1-2k tok     ▼                │  1-2k tok      [ECE]
   ┌───┴───┐      ┌────────┐      ┌─────┴──┐
   │worker1│      │worker2 │      │worker3 │  ← each explores with 10s of thousands
   └───────┘      └────────┘      └────────┘     of tokens, returns a DISTILLED summary
   §3.3: the architecture exists to keep worker context OUT of the supervisor's window.
         Workers returning RAW output ⇒ benefit gone, costs remain.

   BLACKBOARD — emergent plan, INDIRECT communication via shared state
   ┌────────┐  ┌────────┐  ┌────────┐
   │  c₁    │  │  c₂    │  │  c₃    │   components don't know each other
   └───┬────┘  └───┬────┘  └───┬────┘
       │  r/w      │  r/w      │  r/w
       ▼           ▼           ▼
   ╔═══════════════════════════════════╗
   ║   SHARED BLACKBOARD (state)       ║   HAZARDS: write races (A-2),
   ╚═══════════════════════════════════╝            deadlock cycles (A-3)

   SHARED-STATE WITH OWNERSHIP — the DISCIPLINED blackboard  ← reach for THIS
   ╔═══════════════════════════════════╗
   ║  v₁ [owner: c₁]  v₂ [owner: c₂]   ║   A-2: SINGLE WRITER per item.
   ║  v₃ [owner: c₃]  ...              ║        Races become UNREPRESENTABLE.
   ╚═══════════════════════════════════╝   Anyone READS; only the owner WRITES.
```

**The disciplined shared-state architecture is the recommendation.** A blackboard's benefit (loose coupling, extensible) is real; its hazards (races, deadlock) come entirely from *unowned* mutable state. **Adding single-writer ownership (A-2) preserves the benefit and eliminates the primary hazard** at the cost of designing an ownership map — which you should be able to do anyway, and if you *cannot* say who owns a piece of state, that is itself a design smell (Chapter 7, Topic 2's scoping discipline).

## 5. Grounding

- **Orchestrator-workers / supervisor–worker:** a central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results," for tasks "where you can't predict the subtasks needed" [BEA].
- **The distillation that justifies the architecture:** sub-agents "might explore extensively, using tens of thousands of tokens or more, but return only a condensed, distilled summary of [their] work (often 1,000-2,000 tokens)," giving "clear separation of concerns—the detailed search context remains isolated within sub-agents, while the lead agent focuses on synthesizing and analyzing the results" [ECE]. **§3.3's context argument, sourced.**
- **Planning loci — where the plan lives:** [CAH §3.1]'s taxonomy — *linear decomposition* planning (a plan produced then translated to action: planner–executor), *orchestration-based* planning ("distributed across specialized agent roles and feedback loops to coordinate execution at the system level": supervisor–worker), plus search-based and structure-grounded planning [CAH §3.1]. **The four architectures map onto documented planning loci.**
- **The planner–executor's rigidity is documented:** [CAH §3.1] notes that without planning as harness control the agent "may commit too early to brittle solution paths," and that planning evolved "from a simple pre-generation scaffold into a richer harness-level control mechanism" — i.e., *a plan is not enough; the harness must govern its revision* (Topic 9).
- **Planner–worker coordination at scale:** [CAH §3.1] cites large-scale autonomous coding experiments highlighting "planner–worker coordination as a way to scale from focused single-agent tasks to many parallel agents working on a shared project" — supervisor–worker, in the wild.
- **Shared state is the coordination substrate and its hazards are documented:** [CAH §5.2.4] on transactional shared program state; and the survey's warning that systems relying on *implicit* state ("agents… reconstruct state implicitly from conversational history") have "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state" [CAH] — **the argument for an explicit, owned shared state over implicit coordination.**
- **Channels are partial and lossy:** "Files, APIs, diffs, tests, logs, schemas, blackboards, and workflow states are all partial channels through which task state is encoded, transmitted, and reconstructed. Each channel trades off fidelity, latency, and scope"; "the central design question is therefore not merely whether code is present, but which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved" [CAH]. **The blackboard is one such channel, and it needs an authority and conflict story** — which is A-2's ownership.
- **Write concurrency is an effect-class problem:** Chapter 5, Topic 5's E3 (parallel writes corrupt) — A-2's basis.

**Evidence gap.** The architectures are documented as *planning loci* and *patterns* [CAH §3.1; BEA] and the distillation benefit is documented with figures [ECE] — but **no source measures the architectures against each other** (planner–executor vs supervisor–worker vs blackboard on a task suite). A-1..A-3 are **[derived]** (A-1 from Chapter 2, Topic 3's plan lifecycle; A-2 from Chapter 5, Topic 5's E3; A-3 from standard deadlock reasoning). **The supervisor bottleneck's magnitude and the blackboard's failure rates are unmeasured.** [ECE]'s token figures (tens of thousands explored, 1–2k returned) are architectural estimates on Anthropic's systems, not a distributional claim.

## 6. Implementation

**Planner–executor with the assumption gate (A-1) — the missing piece in most implementations:**

```python
def planner_executor(task, planner, executor, env):
    """A-1: a plan is a PREDICTION. Executing it after its assumptions are refuted is
    executing a KNOWN-WRONG plan. The assumption gate is what makes this architecture safe."""
    plan = planner.make_plan(task, env.observe())
    for i, step in enumerate(plan.steps):
        obs = env.observe()
        violated = [a for a in plan.assumptions if not a.holds(obs)]     # A-1 CHECK
        if violated:
            # The plan is REFUTED. Do not execute it further. Replan. (Topic 9)
            plan = planner.replan(task, obs, refuted=violated, done=plan.steps[:i])
            continue
        execute(step, env)
    return env.result()
```

**Supervisor–worker with distillation (§3.3) — the point of the architecture:**

```python
async def supervisor_worker(task, supervisor, worker_pool):
    """§3.3: workers return DISTILLED results [ECE]. Raw worker output in the supervisor's
    context defeats the architecture's main benefit (context isolation)."""
    subtasks = supervisor.decompose(task)                  # K_M + 1 (model-directed)

    async def run_worker(st):
        result = await worker_pool.run(st)                 # explores with 10s of thousands of tokens
        return worker_pool.distill(result, max_tokens=2000)    # returns 1-2k [ECE]

    distilled = await asyncio.gather(*[run_worker(st) for st in subtasks])
    # The supervisor sees ONLY the distillations — its context stays synthesizable (Ch.6 T1).
    return supervisor.synthesize(task, distilled)          # K_M + 1
```

**Shared state with single-writer ownership (A-2) — the disciplined blackboard:**

```python
class OwnedSharedState:
    """A-2: SINGLE WRITER per item. Races become unrepresentable, not merely discouraged.
    Anyone reads; only the owner writes. This is the blackboard, made safe."""
    def __init__(self, ownership: dict[str, str]):   # item -> owning component
        self._ownership = ownership
        self._state = {}

    def write(self, key: str, value, component_id: str) -> None:
        owner = self._ownership.get(key)
        if owner != component_id:
            raise OwnershipViolation(
                f"{component_id} may not write {key!r} (owner: {owner}) — "
                f"A-2: single writer per item. Lost updates are SILENT (Ch.5 T5 E3)."
            )
        self._state[key] = value

    def read(self, key: str):
        return self._state.get(key)                  # anyone may read
```

**Deadlock detection (A-3):**

```python
def check_wait_cycles(components) -> None:
    """A-3: the 'c_i waits for state written by c_j' graph must be ACYCLIC.
    Blackboard deadlocks arrive EMERGENTLY — nobody designs the cycle. (Topic 11)"""
    g = {c.id: [dep_owner(k) for k in c.waits_on] for c in components}
    if cycle := find_cycle(g):
        raise DeadlockRisk(f"wait cycle: {' → '.join(cycle)} — the system will hang")
```

## 7. Trade-offs

| Architecture | Plan | Communication | Buys | Costs / fails when |
|---|---|---|---|---|
| **Planner–executor** | Up front | Direct | Legible plan before action; deterministic execution | **Plan is a prediction** — refuted by the environment (A-1). Needs replanning (Topic 9) |
| **Supervisor–worker** | Emergent | Direct | Adaptive decomposition [BEA]; **context isolation** [ECE] | Supervisor is a $K_M$ and a **context bottleneck** (§3.3); serialization at scale |
| **Blackboard** | Emergent | Indirect (shared state) | Loose coupling; extensible | **Write races (A-2); deadlock (A-3)**; emergent flow is hard to reason about/terminate |
| **Shared-state + ownership** | Emergent | Indirect, owned | Blackboard's coupling benefit, **races unrepresentable** | Ownership map must be designed (a feature, not a bug) |

**The trade that decides planner–executor vs supervisor–worker: how stable is the plan under environmental feedback?** If the environment is *predictable enough* that a plan made up front survives execution, planner–executor is better — the plan is legible, inspectable, and the execution is deterministic. If the environment *surprises* the plan (and in most real agent domains it does — [CAH §3.1]'s "commit too early to brittle solution paths"), then the plan must adapt, and supervisor–worker's emergent decomposition is the architecture. **The planner–executor is not wrong; it is a bet on environmental predictability, and it must be paired with an assumption gate (A-1) and a replanning path (Topic 9) to be safe when the bet loses.**

**The blackboard trade is not a trade — it is a fixable defect.** Blackboard's benefit (decoupling) is real. Its hazards (races, deadlock) come entirely from unowned mutable state. **Single-writer ownership (A-2) keeps the benefit and removes the primary hazard for the cost of a design decision you should be making anyway.** There is no reason to run an unowned blackboard: it is a disciplined shared-state architecture with the discipline removed.

## 8. Experiments

**The plan-refutation test (A-1) — the planner–executor's core risk.** Run planner–executor in an environment that *changes* mid-execution (or that the planner's initial observation misrepresented). Measure: **how often does the executor execute a step whose plan-assumption has been refuted?** Without an assumption gate this is common and silent. **With the gate (§6), it should be zero — refuted plans trigger replanning instead of faithful wrong execution.** This experiment is the concrete case for the gate.

**The distillation ablation (§3.3) — the supervisor–worker's justification.** Workers returning *raw* output vs *distilled* summaries [ECE]. Metrics: supervisor context tokens, synthesis quality, task completion, cost. **Prediction: raw output saturates the supervisor's context (Chapter 6, Topic 1) and degrades synthesis; distillation preserves it.** If distillation does *not* help, the architecture's main benefit is absent and a simpler structure would do.

**The supervisor-bottleneck scaling test.** Increase the worker count; measure supervisor context growth, synthesis latency, and completion. **Find the worker count at which the supervisor saturates** — that is the architecture's scaling limit, and it is a *context* limit (§3.3).

**The shared-state race test (A-2).** Run components concurrently with an *unowned* shared state; inject concurrent writes to the same item; measure lost updates. **Then add single-writer ownership and repeat — lost updates must be zero** (the write is refused, loudly). This demonstrates that A-2 makes the race unrepresentable rather than merely unlikely.

**The deadlock test (A-3).** Construct a wait cycle; verify detection (§6) rather than a hang. **A blackboard that hangs instead of erroring has an undetected cycle.**

**Statistics.** Zero-failure bounds on refuted-plan execution, lost updates, and undetected deadlock (targets zero); task-clustered bootstrap on completion; report supervisor context tokens as a distribution; $n$ always (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Executing a refuted plan.** The environment contradicted the plan's assumption; the executor proceeds faithfully. **The planner–executor's defining failure.** Mitigation: A-1's assumption gate (§6) + a replanning path (Topic 9).
- **Supervisor context saturation.** Workers return raw output; the supervisor's window fills; synthesis degrades (Chapter 6, Topic 1). **This defeats the architecture's main benefit.** Mitigation: distillation [ECE] — workers return 1–2k tokens, not their exploration.
- **Supervisor as serialization bottleneck.** Everything flows through one component. Mitigation: know the scaling limit (§8); consider hierarchical supervision (Chapter 9) or a shared-state architecture.
- **Blackboard write race.** Concurrent writers; lost updates; **silent** (Chapter 5, Topic 5's E3). Mitigation: A-2 single-writer ownership — the write is *refused*, not lost.
- **Blackboard deadlock.** Emergent wait cycle; the system hangs. Mitigation: A-3 cycle detection (§6; Topic 11).
- **Implicit shared state.** Components reconstruct state from conversational history rather than a formal substrate — "agents cannot reliably detect when their internal understanding diverges from the true program state" [CAH]. Mitigation: an *explicit*, owned shared state.
- **Unresolved channel conflicts.** Multiple channels (files, tests, logs, blackboard) disagree; no authority declared — [CAH]'s "which artifacts are authoritative… how conflicts across channels are resolved." Mitigation: declare the authoritative channel; A-2's ownership is the blackboard's answer.
- **Architecture chosen before the simpler ones failed.** A supervisor–worker where a static map (Topic 2's P-3) would do; each adds $K_M$ (Topic 1's W-1). Mitigation: the simplicity default [BEA; OAO]; Topic 12.
- **Edge case — the plan that is *partially* refuted.** One assumption fails; most of the plan is still valid. Replanning the whole thing wastes the valid work. Mitigation: replan *from the refutation point*, retaining completed steps (§6's `done=plan.steps[:i]`) — Topic 9's incremental replanning.
- **Open limitation.** The architectures are documented as planning loci and patterns [CAH §3.1; BEA], and the distillation benefit has figures [ECE] — but **no source measures the architectures against each other.** A-1..A-3 are **[derived]** from Chapter 2 (plan lifecycle), Chapter 5 (E3), and standard deadlock reasoning. The supervisor's bottleneck magnitude and the blackboard's failure rates are unmeasured; §8 measures locally.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Orchestrator/supervisor–worker: a central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results," for unpredictable subtasks [BEA].
2. Sub-agents explore with "tens of thousands of tokens" and return "1,000-2,000 tokens" distilled, keeping "the detailed search context… isolated within sub-agents" [ECE] — the architecture's context justification.
3. Planning loci are documented (linear decomposition, search-based, structure-grounded, orchestration-based) [CAH §3.1]; planner–worker coordination scales single-agent tasks to parallel agents [CAH §3.1].
4. Without planning as harness control, agents "may commit too early to brittle solution paths" [CAH §3.1] — the planner–executor's rigidity.
5. Implicit shared state is "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state" [CAH].
6. Channels are partial; "which artifacts are authoritative… how conflicts across channels are resolved" is "the central design question" [CAH].
7. **No source measures the architectures against each other.**

**Decision rules.**
- **Planner–executor requires an assumption gate and a replanning path** (A-1) — a plan is a prediction, and executing a refuted plan is worse than not planning.
- **Supervisor–worker requires distillation** [ECE] — workers return summaries, not raw work, or the architecture's benefit is gone.
- **Never run an unowned blackboard** — add single-writer ownership (A-2); it is a disciplined shared-state architecture with the discipline removed.
- **Check the wait graph for cycles** (A-3) — blackboard deadlocks arrive emergently.
- **Choose planner–executor vs supervisor–worker on the plan's stability** under environmental feedback.
- **Reach for none of these before the simpler structures fail** (Topic 1's W-1; [BEA]'s simplicity default).

**Production implications.**
1. Add the assumption gate to any planner–executor; without it, the system faithfully executes refuted plans and nobody notices.
2. Verify your supervisor–worker actually distills; a supervisor drowning in raw worker output has the costs and none of the benefit.
3. Add single-writer ownership to any shared state; lost updates are silent, and ownership makes them impossible.
4. Measure the supervisor's context growth vs worker count; the architecture has a *context* scaling limit and you should know where it is.

**Connections.** These architectures compose Topic 2's patterns (supervisor–worker *is* orchestrator-workers at architecture scale) on Topic 1's axis. The assumption gate is Topic 2's programmatic gate; replanning is Topic 9. Shared state is Chapter 7, Topic 2 (scoping) and Chapter 5, Topic 5 (E3, write safety); the distillation is Chapter 6, Topic 11's sub-agent context isolation. Cycle detection is Topic 11. **Chapter 9 asks whether these sub-components should be independent agents at all** — this topic assumes the decomposition and structures it.

## Sources

[BEA] Anthropic, "Building effective agents" — orchestrator-workers (a central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results"; for "complex tasks where you can't predict the subtasks needed") — https://www.anthropic.com/engineering/building-effective-agents
[ECE] Anthropic, "Effective context engineering for AI agents" — sub-agent architectures: each subagent "might explore extensively, using tens of thousands of tokens or more, but returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)"; "clear separation of concerns—the detailed search context remains isolated within sub-agents, while the lead agent focuses on synthesizing and analyzing the results" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1 (planning loci: linear-decomposition, search-based, structure-grounded, orchestration-based planning; "commit too early to brittle solution paths"; planning as "a richer harness-level control mechanism"; planner–worker coordination scaling to "many parallel agents working on a shared project"), §5.2.4 and the shared-state discussion (implicit state as "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state"; channels as partial — "which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved")
[CAL] Claude Agent SDK — parallel read-only / serialized write execution (A-2's basis) — https://code.claude.com/docs/en/agent-sdk/agent-loop
