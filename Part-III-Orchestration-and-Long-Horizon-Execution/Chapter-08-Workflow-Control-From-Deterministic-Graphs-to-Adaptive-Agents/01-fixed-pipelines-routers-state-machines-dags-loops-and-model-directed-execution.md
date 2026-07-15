# Topic 1 — Fixed Pipelines, Routers, State Machines, DAGs, Loops, and Model-Directed Execution

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The control-structure spectrum: six ways to arrange execution, ordered by **how much of the control flow the model decides**. This topic establishes the axis the whole chapter navigates and the default position on it.

**Prerequisites.** Chapter 1, Topic 9 (workflows dominate — the empirical basis); Chapter 1, Topic 8 (error accumulation — why autonomous steps compound); Chapter 3, Topic 3 (the canonical loop — the atom these structures compose).

**Terminology.** *Workflow*: "systems where LLMs and tools are orchestrated through predefined code paths" [BEA]. *Agent*: "systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks" [BEA]. *Control locus*: who decides the next step — code or model.

**Boundaries.** Inside: the six structures, the axis that orders them, and the default. Outside: the composable patterns built on them (Topic 2); the complexity-vs-autonomy decision in depth (Topic 12).

**Exclusions.** No workflow-engine survey.

**Outcomes.** The reader can place any control structure on the autonomy axis, state what each buys and costs, and defend a position on the axis for a given task.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Every agentic system must answer: *who decides what happens next?* Code can decide (a pipeline: step 1, then step 2), or the model can decide (an agent: it picks the next tool, and the next, until done). Most real systems are a mixture, and the mixture is usually *accidental* — nobody chose how much autonomy to grant; it emerged from what was easy to build.

**Bottleneck.** Autonomy is the axis on which reliability and capability trade against each other, and the trade is *not symmetric*. More autonomy buys the ability to handle tasks whose steps cannot be predicted — [BEA]: agents suit "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path." It costs predictability, and — critically — it *compounds error*: [BEA] names "higher costs, and the potential for compounding errors" as the agent trade-off, which is Chapter 1, Topic 8's error-accumulation result. **Every step whose control the model owns is a step at which the run can go wrong in an unbounded way.**

**Objective.** Make the position on the autonomy axis a *deliberate, defended choice* — and default to the least autonomy that solves the task, because the default in the other direction is expensive and error-compounding.

**Assumptions.** Model-directed steps are stochastic (Chapter 2); code-directed steps are deterministic. Error compounds over autonomous steps (Chapter 1, Topic 8).

**Constraints.** Some tasks genuinely cannot be hardcoded [BEA]. Some structures (loops) are necessary for open-ended work.

**Success criteria.** The autonomy position is explicit, justified, and minimal for the task; every model-directed decision point is a deliberate grant, not an accident.

## 3. Intuition first, then formalization

### 3.1 Intuition: one axis, six positions

The six structures are not six unrelated designs — they are **six points on one axis: how many decisions does the model make?**

- **Fixed pipeline** (least autonomy). Code decides everything: step 1 → step 2 → step 3. The model *executes* steps but decides no control flow. The most predictable structure; also the most limited — it can only do what you anticipated.
- **Router.** Code decides the structure; the model makes *one* control decision (which branch). [BEA]'s routing "classifies an input and directs it to a specialized followup task." **One bounded decision, then back to deterministic flow.**
- **State machine.** Code defines states and legal transitions; the model may choose *among the legal transitions*. The autonomy is bounded by the transition table — the model can pick, but only from what the machine permits. **This is the workhorse for constrained autonomy.**
- **DAG.** Code defines a dependency graph; execution order is determined by dependencies (and may parallelize). The model executes nodes; the *graph* is code. Autonomy is per-node, not over structure.
- **Loop.** Code defines the loop and its termination conditions; the model decides *what to do each iteration* and (proposes) when to stop. **This is where autonomy becomes substantial** — the number of steps is not fixed, so the model's choices compound. Chapter 3's canonical loop is this structure.
- **Model-directed execution** (most autonomy). The model decides the steps, their order, their number, and when to stop. [BEA]'s *agent*. Maximum capability on unpredictable tasks; maximum error compounding.

The intuition that orders them, and the chapter's thesis in one sentence: **each step to the right buys the ability to handle less-predictable tasks and pays with less-predictable behavior** — and since error compounds over autonomous steps (Chapter 1, Topic 8), the payment grows superlinearly with the number of steps the model controls.

Hence the default, stated by both vendors: **"find the simplest solution possible, and only increasing complexity when needed"** [BEA], and **"start with one agent whenever you can"** [OAO]. **Move right on the axis only when a task provably cannot be solved to the left.**

### 3.2 Formalization: the autonomy axis and the compounding cost

Let a task's execution have $K$ steps, of which $K_M$ are *model-directed* (the model chooses what happens next) and $K_D = K - K_M$ are *code-directed*. Define the **autonomy fraction**:

$$
\alpha = \frac{K_M}{K}\ \in\ [0, 1].
$$

The six structures span $\alpha$ **[synthesis]**:

| Structure | $\alpha$ | Model decides | Code decides |
|---|---|---|---|
| Fixed pipeline | $0$ | nothing (executes only) | every step, order, count |
| Router | $\approx 1/K$ | one branch | structure, all else |
| State machine | small–moderate | which legal transition | states, legal transitions, invariants |
| DAG | small | node execution | dependencies, order, parallelism |
| Loop | moderate–high | each iteration's action; stop *proposal* | loop bounds, termination (Ch.3 T8) |
| Model-directed | $\approx 1$ | steps, order, count, stop | (guardrails only) |

The cost of autonomy, from Chapter 1, Topic 8's error accumulation. If a code-directed step succeeds with probability $\approx 1$ (deterministic) and a model-directed step with $p < 1$, then:

$$
\Pr(\text{run succeeds}) \;\approx\; \prod_{i=1}^{K_M} p_i \;\le\; p^{K_M},
$$

**[derived from Chapter 1, Topic 8; the per-step independence is an approximation and, as Chapter 1 established, a generous one — correlated failures make it worse.]**

**This is the formal statement of the chapter's thesis.** Success decays geometrically in $K_M$ — *the number of model-directed steps* — not in $K$. **Code-directed steps are free** (they do not compound error); **model-directed steps are the expensive ones**. Therefore:

$$
\textbf{W-1 (minimize } K_M \textbf{, not } K \textbf{):}\quad
\text{a structure with more total steps but fewer model-directed steps is \emph{more reliable}.}
$$

W-1 is counterintuitive and load-bearing. **Adding deterministic steps to a workflow costs latency but not reliability; converting a deterministic step to a model-directed one costs reliability geometrically.** A ten-step pipeline with two model-directed steps beats a four-step agent loop with four model-directed steps, on reliability, despite being "longer." **This is the mechanism behind Chapter 1, Topic 9's "workflows dominate" result**, and it is why the default is left on the axis.

### 3.3 The one thing autonomy buys, and when you must pay for it

W-1 argues for minimizing $K_M$ — but $K_M = 0$ (a fixed pipeline) can only solve tasks whose every step is predictable in advance. [BEA] states the boundary exactly: agents suit "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path."

So the decision rule is a *feasibility* test, not a preference **[derived from [BEA]]**:

$$
\textbf{W-2 (autonomy is a feasibility purchase):}\quad
\text{grant the model control over step } i\ \text{ONLY IF the correct step } i\ \text{cannot be determined by code from the state at } i.
$$

If code *can* determine the step (the input class is known → route it; the dependencies are known → DAG them; the sequence is fixed → pipeline it), **granting autonomy there is paying reliability for nothing.** If code *cannot* (the number of steps depends on what is discovered mid-run; the path depends on environmental feedback), autonomy is the only option — and you pay for it knowingly.

This reframes the whole chapter: **autonomy is not a design preference, it is a purchase made under a feasibility constraint, and W-1 says the price is geometric.** Topic 12 makes this the explicit decision procedure.

## 4. Architecture

```
   THE AUTONOMY AXIS — α = K_M / K  (fraction of steps the MODEL directs)

   α = 0                                                              α ≈ 1
   ├────────────┬──────────┬───────────────┬──────┬────────┬──────────┤
   FIXED        ROUTER     STATE MACHINE   DAG    LOOP     MODEL-DIRECTED
   PIPELINE                                                (agent [BEA])
   │            │          │               │      │        │
   code: all    code:      code: states +  code:  code:    code: guardrails only
                structure  legal transit.  deps   bounds   model: steps, order,
   model:       model:     model: which    model: model:          count, stop
   executes     1 branch   transition      node   each iter
                                           exec   + stop proposal

   ◄──────────────── PREDICTABILITY ─────────────────────────────────►
   ◄──────────────── ERROR COMPOUNDING (W-1: geometric in K_M) ──────►
   ◄──────────────── CAPABILITY on UNPREDICTABLE tasks ──────────────►

   DEFAULT: LEFT. "Find the simplest solution possible" [BEA];
                  "start with one agent whenever you can" [OAO].
   MOVE RIGHT: only when W-2's feasibility test fails — code CANNOT
               determine the step. Autonomy is a purchase, not a preference.
```

**The structures compose, and that is the practical design.** Real systems are not one point on the axis — they are a *fixed pipeline whose step 3 is a router, whose branch B is a loop*. The autonomy is *localized*: deterministic where it can be, model-directed where it must be. **This is Chapter 1, Topic 9's "workflows dominate" as an architecture: mostly deterministic structure with autonomy at a few controlled points** — and Topic 2's composable patterns are exactly the vocabulary for building it.

**The state machine deserves emphasis as the underused middle.** It grants autonomy (the model picks a transition) *bounded by a transition table* (only legal transitions). This is a strictly better structure than a free loop whenever the legal next-steps are enumerable: **the model gets to choose, and cannot choose something illegal.** It is the control-flow analogue of Chapter 5, Topic 3's enum-over-free-string — constrain the choice set, and the invalid choices become unrepresentable rather than merely wrong.

## 5. Grounding

- **The workflow/agent distinction:** workflows are "systems where LLMs and tools are orchestrated through predefined code paths"; agents are "systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks"; the difference is "predictability versus autonomy" [BEA]. **This is the axis, named by the source.**
- **When agents are warranted:** "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path" [BEA] — W-2's feasibility test.
- **The cost of agents:** "higher costs, and the potential for compounding errors" [BEA] — W-1's mechanism, named by the source and quantified by Chapter 1, Topic 8.
- **The simplicity default:** "find the simplest solution possible, and only increasing complexity when needed"; "Optimizing single LLM calls with retrieval and in-context examples is usually enough" [BEA]; "Start with one agent whenever you can" [OAO].
- **Agents use environmental ground truth:** agents "leverage ground truth from the environment at each step" [BEA] — the feedback loop that makes autonomy *work* when it is warranted, and Chapter 3's canonical loop.
- **Deterministic composition primitives exist as first-class SDK objects:** ADK's workflow agents — Sequential, Parallel, Loop — alongside the LlmAgent [ADK-A]. **The vendors ship the deterministic structures**, which is evidence the spectrum is the real design space (Topic 13).
- **Workflows dominate** is Chapter 1, Topic 9's result; **error accumulates over steps** is Chapter 1, Topic 8's — the empirical and formal bases for W-1.
- **Planning loci:** [CAH §3.1]'s taxonomy of *where* planning control sits (linear decomposition, search-based, structure-grounded, orchestration-based) [CAH] — a finer decomposition of the model-directed end of the axis.

**Evidence gap, stated plainly.** [BEA] names the structures and states *when* each applies, with a stated rationale (predictability vs autonomy; compounding errors). **It publishes no measured comparison** — no benchmark of pipeline vs router vs agent on a task suite, no measured $\alpha$-vs-reliability curve. The autonomy axis and W-1's geometric-decay formalization are **[synthesis/derived]** — W-1 follows from Chapter 1, Topic 8's error-accumulation model (which *is* grounded) applied to the model-directed step count, but **the per-step success probability $p$ and therefore the actual cost of a marginal autonomous step are workload-specific and unmeasured.** The *direction* (more autonomy → more compounding) is sourced; the *magnitude* is local. §8 is how you measure it.

## 6. Implementation

**The six structures, as code — the point is that they differ only in who decides:**

```python
# α = 0 — FIXED PIPELINE. Code decides everything. Model executes.
def pipeline(input, steps):
    x = input
    for step in steps:                       # code decides the sequence
        x = step.run(x)                      # model executes, decides nothing
    return x

# α ≈ 1/K — ROUTER. Model makes ONE bounded control decision. [BEA]
def router(input, branches: dict):
    category = model.classify(input, options=list(branches))   # the ONE decision
    return branches[category].run(input)                       # back to deterministic

# small–moderate α — STATE MACHINE. Model picks among LEGAL transitions only.
def state_machine(state, transitions: dict):
    while not state.terminal:
        legal = transitions[state.name]                # code CONSTRAINS the choice set
        choice = model.choose(state, options=legal)    # model picks — but only legal ones
        assert choice in legal, "illegal transition"   # unrepresentable, not merely wrong
        state = choice.apply(state)
    return state

# moderate–high α — LOOP. Model decides each iteration; code owns termination. (Ch.3 T8)
def loop(task, budget):
    state = init(task)
    for i in range(budget.max_steps):                  # code owns the BOUND
        action = model.decide_next(state)              # model decides each iteration
        state = execute(action, state)
        if terminate(state, budget):                   # CODE decides termination, not model
            return state                               # (Ch.3 T8: model_stop ≠ success)
    return state, "budget"
```

**Counting $K_M$ — make the autonomy explicit and measurable (W-1):**

```python
@dataclass
class ControlStructure:
    """W-1: reliability decays geometrically in K_M, not K. Count the model-directed steps."""
    def autonomy_fraction(self, trace) -> float:
        k_m = sum(1 for s in trace.steps if s.control_locus == "model")
        return k_m / max(len(trace.steps), 1)          # α

    def audit(self, trace) -> list[str]:
        """W-2: every model-directed step must FAIL the feasibility test — i.e., code
        genuinely could not determine it. An autonomous step code could have decided
        is reliability paid for nothing."""
        return [f"step {s.i}: model-directed, but code could determine it from state "
                f"({s.determinable_reason}) — convert to deterministic (W-2)"
                for s in trace.steps
                if s.control_locus == "model" and code_could_decide(s)]
```

The `audit` is the topic's operational contribution: **find the model-directed steps that did not need to be**, and convert them. Each conversion is a geometric reliability gain at zero capability cost.

## 7. Trade-offs

| Structure | Predictability | Capability (unpredictable tasks) | Error compounding | Cost/latency |
|---|---|---|---|---|
| Fixed pipeline | **Highest** | **Lowest** — only what you anticipated | None ($K_M=0$) | Lowest |
| Router | High | Low–moderate | Minimal (one decision) | Low |
| State machine | High | Moderate — **bounded autonomy** | Bounded by transition table | Low–moderate |
| DAG | High | Moderate (parallelizable) | Per-node only | Moderate (parallel wins) |
| Loop | Moderate | High | **Compounds over iterations** | Higher |
| Model-directed | **Lowest** | **Highest** | **Geometric in $K_M$** | Highest [BEA] |

**The trade, stated exactly.** [BEA]: "Agentic systems often trade latency and cost for better task performance." The trade is real *and it is only worth making when the task requires it* (W-2). The chapter's discipline: **do not buy capability you do not need with reliability you cannot spare.** An agent loop on a task a router could solve is strictly worse on every axis — less predictable, more error-prone, slower, more expensive — with no compensating benefit, because the capability it bought was not needed.

**The state machine is the underpriced option.** It sits in the middle of the axis and is skipped by most teams, who jump from pipeline to full agent loop. **It grants real autonomy (the model chooses) with a bounded blast radius (only legal transitions)** — and for any task whose next-steps are enumerable-but-conditional, it dominates the loop: same capability, strictly better predictability. **Reach for the state machine before the loop.**

## 8. Experiments

**The $\alpha$-vs-reliability curve — the measurement W-1 predicts and no source publishes.** Take a task solvable at several autonomy levels (e.g., a pipeline version, a state-machine version, an agent-loop version). Measure: task completion, cost, latency, and $\kappa$ distribution (Chapter 1, Topic 12) at each.

- **Prediction (W-1):** completion falls as $K_M$ rises, *geometrically*, unless the higher-autonomy structure is solving cases the lower one *cannot*.
- **The decisive comparison:** on tasks the *pipeline can handle*, the agent should be **no better and measurably worse** (more error, more cost). On tasks the pipeline *cannot* handle, the agent should be the only one that completes. **This experiment separates "autonomy I needed" from "autonomy I paid for and did not need."**

**The unnecessary-autonomy audit (§6, W-2).** For each model-directed step in production traces, ask: could code have determined this from the state? **Every "yes" is a step where reliability was spent for nothing** — convert it and re-measure. This is the cheapest reliability win in the chapter.

**The state-machine-vs-loop ablation.** Same task, same model, two structures: a free loop vs a state machine with the legal transitions enumerated. Metrics: completion, illegal/nonsensical actions, steps taken. **Prediction: the state machine matches completion with strictly fewer invalid actions** — the constraint eliminates the illegal choices rather than catching them.

**Statistics.** Paired designs (same tasks, structures vary); McNemar on completion; task-clustered bootstrap; Holm across structures; report the vector (completion, cost, latency, $\kappa$), never a scalar (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Accidental autonomy.** Nobody chose $\alpha$; it emerged from what was easy to build; the system is far right on the axis for no reason. **The default failure.** Mitigation: count $K_M$ (§6); audit against W-2.
- **Autonomy where code could decide.** Reliability spent for nothing (W-2 violated). Mitigation: the unnecessary-autonomy audit; convert to deterministic.
- **Agent loop where a router would do.** Strictly worse on every axis. Mitigation: W-2's feasibility test; the simplicity default [BEA; OAO].
- **Skipping the state machine.** Jumping from pipeline to full loop, forgoing bounded autonomy. Mitigation: enumerate legal transitions; the state machine dominates the loop when they are enumerable.
- **Model decides termination.** In a loop, letting the model's "I'm done" end the run — Chapter 3, Topic 8's core error ($\kappa$: `model_stop` ≠ `success`). Mitigation: code owns termination, always.
- **Unbounded loop.** No step budget; the run does not terminate (Topic 11). Mitigation: code owns the bound (Chapter 3, Topic 8).
- **Compounding error unmeasured.** The system's $\alpha$ is high and nobody has measured the reliability cost. Mitigation: the $\alpha$-vs-reliability curve (§8).
- **Edge case — the task that genuinely needs full autonomy.** Open-ended problems where "you can't hardcode a fixed path" [BEA] exist, and for them the agent is correct. The discipline is not "never use agents" but "**prove the task needs one**" (W-2) — and then invest in the guardrails ([BEA]: "sandboxed testing and guardrails") that bound the autonomy you granted.
- **Edge case — autonomy that reduces steps.** A model that plans well may solve a task in *fewer* model-directed steps than a naive structure forces. $K_M$ is what matters, not the structure's label — a smart agent taking 3 steps beats a clumsy state machine taking 12. Mitigation: measure $K_M$ empirically, not from the architecture diagram.
- **Open limitation.** **[BEA] names the structures and their applicability but publishes no measured comparison.** The autonomy axis and W-1's geometric decay are **[derived]** from Chapter 1, Topic 8's grounded error-accumulation model; the *magnitude* (the per-step $p$, the actual cost of a marginal autonomous step) is workload-specific and **unmeasured in the sources**. §8 measures it locally; no source provides a universal curve.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Workflows orchestrate "through predefined code paths"; agents "dynamically direct their own processes"; the difference is "predictability versus autonomy" [BEA].
2. Agents suit "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path" [BEA].
3. Agents carry "higher costs, and the potential for compounding errors" [BEA].
4. The default is simplicity: "find the simplest solution possible" [BEA]; "start with one agent whenever you can" [OAO].
5. Deterministic composition primitives (Sequential, Parallel, Loop) ship as first-class SDK objects [ADK-A].
6. **Reliability decays geometrically in $K_M$ — the model-directed step count, not the total** **[derived, Chapter 1, Topic 8]**.
7. **No source measures the autonomy-vs-reliability curve.**

**Decision rules.**
- **Minimize $K_M$, not $K$** (W-1) — deterministic steps are free; autonomous steps compound geometrically.
- **Grant autonomy only where code cannot determine the step** (W-2) — autonomy is a feasibility purchase, not a preference.
- **Default left on the axis; move right only under a proven feasibility failure.**
- **Reach for the state machine before the loop** — bounded autonomy dominates free autonomy when transitions are enumerable.
- **Code owns termination, always** (Chapter 3, Topic 8).
- **Localize autonomy:** a mostly-deterministic structure with model-directed steps at the few points that need them (Chapter 1, Topic 9).

**Production implications.**
1. Count $K_M$ in your traces; most teams have never measured their system's autonomy fraction and are further right on the axis than they intended.
2. Run the unnecessary-autonomy audit (§6); every model-directed step that code could have decided is a geometric reliability loss for zero capability gain.
3. Run the $\alpha$-vs-reliability curve (§8); it prices your autonomy and reveals which of it you actually needed.
4. Add a state-machine layer where transitions are enumerable; it is the underused middle that dominates the loop.

**Connections.** This topic establishes the axis the chapter navigates. Topic 2 supplies the composable patterns that build structures on it; Topic 3 is the router; Topic 4 the multi-agent architectures; Topic 11 proves the loops terminate; **Topic 12 makes W-2's feasibility test the explicit decision procedure**. It rests on Chapter 1, Topic 9 (workflows dominate) and Topic 8 (error accumulation), and composes Chapter 3's canonical loop as its atom. Chapter 9 asks when the sub-structures here should become independent agents.

## Sources

[BEA] Anthropic, "Building effective agents" — workflows ("systems where LLMs and tools are orchestrated through predefined code paths") vs agents ("systems where LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks"); "predictability versus autonomy"; routing ("classifies an input and directs it to a specialized followup task"); agents for "open-ended problems where it's difficult or impossible to predict the required number of steps, and where you can't hardcode a fixed path"; "higher costs, and the potential for compounding errors"; "sandboxed testing and guardrails"; agents leveraging "ground truth from the environment at each step"; "find the simplest solution possible, and only increasing complexity when needed"; "Optimizing single LLM calls with retrieval and in-context examples is usually enough" — https://www.anthropic.com/engineering/building-effective-agents
[OAO] OpenAI, agent-orchestration guide — "Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility" — https://developers.openai.com/api/docs/guides/agents/orchestration
[ADK-A] Google ADK agents — workflow agents (Sequential, Parallel, Loop) as deterministic composition primitives alongside LlmAgent — https://adk.dev/agents/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1 — planning loci (linear decomposition, search-based, structure-grounded, orchestration-based) as a finer taxonomy of the model-directed end of the axis
