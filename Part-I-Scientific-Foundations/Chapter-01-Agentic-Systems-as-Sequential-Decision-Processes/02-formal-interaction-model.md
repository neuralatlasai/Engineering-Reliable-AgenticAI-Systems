# Topic 2 — Formal Interaction Model: Observation, Latent State, Action, Transition, Reward, Termination

## 1. Problem and objective

Engineering discussions about agents stall because participants use words — "state," "step," "memory," "done" — that have no shared referent. The objective here is a single formal model, taken from the current literature rather than invented, that (a) covers single- and multi-agent systems, (b) maps one-to-one onto the events an actual SDK emits, and (c) is precise enough to support the reliability mathematics of Topics 7–8.

The formalization below is the one used by the agent-memory survey (arXiv:2512.13564, §2.1), chosen because it is explicitly designed to "encompass both single-agent and multi-agent configurations" and because it abstracts the model's internal reasoning honestly — as a policy, not a mind.

## 2. Intuition first

Strip any agent run to its skeleton and you see a loop with four verbs: the world *is* in some state; the agent *sees* a slice of it; the agent *does* something; the world *changes*. Repeat until something says stop. Everything an agent system contains — prompts, tools, memory stores, budgets, judges — implements exactly one of those verbs or the stop condition. If you cannot say which one an artifact implements, you do not yet understand what it does to reliability.

## 3. The formal model

Let 𝓘 = {1, …, N} index the agents (N = 1 covers the single-agent case such as ReAct; N > 1 covers debate and planner–executor architectures). The environment has state space 𝒮. [MEM §2.1]

**Transition (latent state dynamics).** At each time step t the environment evolves by a controlled stochastic transition:

```
s_{t+1} ~ Ψ(s_{t+1} | s_t, a_t)
```

where a_t is the action executed at t. In multi-agent systems this one abstraction covers both sequential decision-making and implicit coordination through environment-mediated effects. [MEM §2.1]

**Observation.** Each agent i receives:

```
o_t^i = O_i(s_t, h_t^i, 𝒬)
```

where h_t^i is the portion of interaction history visible to agent i (previous messages, intermediate tool outputs, partial reasoning traces, shared workspace state, other agents' contributions — depending on system design), and 𝒬 is the task specification (user instruction, goal description, external constraints), treated as fixed within a task unless otherwise specified. [MEM §2.1]

**Action.** The distinguishing feature of LLM-based agents is the *heterogeneity* of the action space. The survey's taxonomy [MEM §2.1]:

1. **Natural-language generation** — reasoning, explanations, responses, instructions
2. **Tool invocation** — external APIs, search engines, calculators, databases, simulators, code execution environments
3. **Planning actions** — explicit task decompositions, execution plans, subgoal specifications that guide later behavior
4. **Environment-control actions** — direct manipulation: navigation in embodied settings, editing a software repository, modifying a shared memory buffer
5. **Communication actions** — structured messages to other agents

All five are produced by the same autoregressive backbone conditioned on contextual input.

**Policy.** Each agent i follows:

```
a_t = π_i(o_t^i, m_t^i, 𝒬)
```

where m_t^i is a memory-derived signal (retrieved from a memory state 𝓜_t; Chapter 7 owns the details). The policy "may internally generate multi-step reasoning chains, latent deliberation, or scratchpad computations prior to emitting an executable action; such internal processes are abstracted away and not explicitly modeled." [MEM §2.1] That abstraction is deliberate and correct: internal reasoning is not observable state, and reliability engineering can only contract over observables.

**Trajectory and termination.** A full execution induces:

```
τ = (s_0, o_0, a_0, s_1, o_1, a_1, …, s_T)
```

"where T is determined by task termination conditions or system-specific stopping criteria." [MEM §2.1] The trajectory interleaves (i) environment observation, (ii) optional memory retrieval, (iii) LLM-based computation, (iv) action execution driving the next state transition.

**Reward / scoring.** Here the deployed-agent literature departs from classical RL, and honesty requires saying so plainly: **production agents generally have no runtime reward signal.** What exists instead is *post-hoc evaluation*. Harness-Bench formalizes it [HB §3.3–3.4]:

```
R = Run(M, H, E, T)          — a run of model M, harness H, environment E, task T
TaskScore = Eval(R; J)       — an external judge J scores the completed run

TaskScore_i = Security_i · Completion_i · Process_i,   Security_i ∈ {0, 1}
Process_i  = (Robustness_i + ToolUse_i + Consistency_i) / 3
```

The multiplicative form is intentionally conservative: "high aggregate credit requires task completion, no explicit security violation, and reliable execution behavior." [HB §3.4] Treat "reward" in agentic systems as this offline functional over trajectories, not as a per-step scalar the policy can see.

## 4. Invariants worth stating

- **I1 (Markov in the pair).** Ψ conditions only on (s_t, a_t). Any apparent history dependence must be carried inside s_t (environment) or h_t/m_t (agent). This forces you to decide, for every piece of information, *where it lives* — the single most clarifying exercise in agent design.
- **I2 (Observation ≠ state).** o_t is a function of s_t, never s_t itself. Topic 3 develops the consequences.
- **I3 (Termination is part of the model).** T is not an afterthought; it is a component with its own failure modes (Topic 1 §7, Chapter 10).
- **I4 (Score is external).** Nothing inside π computes TaskScore. Any "self-assessment" the model emits is an action (type 1), not an evaluation — a distinction the Fable/Mythos system card makes empirically vivid: the model "reported a production release as healthy without sufficient verification" and "says it tested work end to end, when it had not" [FSC §2.3.3.1–2]. Self-report is policy output, and policy output can be wrong or motivated.

## 5. Mapping the formalism onto an executable runtime

The model is only useful if every symbol has a concrete referent. Using the Claude Agent SDK loop [CAL] as the reference implementation:

| Symbol | Concrete referent in the SDK loop |
|---|---|
| 𝒬 | The user prompt plus system prompt (fixed per session) |
| o_t | Tool results returned to the model (`UserMessage` after each tool execution) plus accumulated history |
| h_t | The conversation history in the context window: "prompts, responses, tool inputs, tool outputs" accumulating over turns |
| a_t (type 1) | Text content blocks in an `AssistantMessage` |
| a_t (type 2, 4) | Tool-call blocks (`Read`, `Bash`, `Edit`, `Write`, …); environment-control actions are tool calls whose targets are workspace state |
| Ψ | The actual effect of tool execution on the workspace — the part *nobody implements*; it is the world |
| π's stochasticity | Model sampling; the SDK's `effort` parameter modulates deliberation depth without changing the policy's type |
| m_t | Content re-injected each request (e.g., CLAUDE.md) and anything retrieved from stores |
| T (model-decided) | The model produces a response with no tool calls |
| T (harness-decided) | `max_turns`, `max_budget_usd`; terminal `ResultMessage` subtypes: `success`, `error_max_turns`, `error_max_budget_usd`, `error_during_execution` |
| τ | The full message stream: `SystemMessage(init)` → alternating `AssistantMessage`/`UserMessage` → `ResultMessage` (with cost, usage, session ID) |

Two engineering facts fall out of this mapping. First, **h_t is physically bounded**: the context window accumulates until compaction summarizes older history [CAL] — meaning the policy's effective observation of its own past is lossy (Topic 3). Second, **turns are the natural unit of the process**: "a turn is one round trip... Claude produces output that includes tool calls, the SDK executes those tools, and the results feed back" [CAL]; per-turn analysis is where error-accumulation math (Topic 8) attaches.

## 6. What the formalism buys you: three worked consequences

**(a) It locates disagreements.** "The agent forgot the constraint" is ambiguous. In the model it is exactly one of: the constraint left h_t (compaction loss), never entered o_t (observation design), was absent from m_t (retrieval miss), or was present and π ignored it (policy failure). Each has a different fix and a different owner. [MEM §2.2 gives the memory operators; CAL gives compaction]

**(b) It exposes what benchmarks hold fixed.** Harness-Bench's protocol fixes (E, T, J, budgets) and varies H — so its 23.8-point spread [HB §4.2] is a statement about how much of π's effective behavior lives *outside the model*. CompWoB composes T while holding the base capabilities fixed — its 94.0% → 24.9% collapse [CompWoB] is a statement about Ψ-trajectory length and h_t interference, not about per-action competence. The formalism is what lets you say which knob each result turned.

**(c) It makes "multi-agent" non-mystical.** N > 1 adds an index and a visibility function h_t^i — nothing else. Coordination is either explicit (communication actions, type 5) or environment-mediated (through Ψ) [MEM §2.1]. Chapter 9's coordination-tax analysis is bookkeeping over this same structure.

## 7. Experiments and measurement hooks

A formal model earns its keep by dictating what to log. Minimum instrumentation implied by the symbols:

- Persist τ completely — Harness-Bench records "model requests and responses, tool calls, workspace changes, and usage statistics" reconstructed into a unified trace, and derives four evidence sources per run: final workspace state, execution trace, usage statistics, validator outputs [HB §3.3]. Anything less and the symbols above are unobservable.
- Log the *cause* of T for every run (model-decided vs each budget subtype [CAL]); the distribution of termination causes is a cheap, high-signal reliability metric.
- Score with an explicit, versioned J (Harness-Bench pins claude-sonnet-4.6 as the fixed external judge across all trajectories [HB §4.1]) — otherwise TaskScore drift is indistinguishable from agent drift.

## 8. Failure modes visible only at this level of abstraction

- **State–belief divergence:** the workspace (s_t) and the model's account of it (inside h_t) part ways; Topic 3's subject. Empirically instantiated by the false-completion examples in [FSC §2.3.3].
- **Action-type confusion:** planning output (type 3) mistaken by the harness for environment control (type 4) — executing a *proposed* plan step because it parsed like a command. The action taxonomy exists precisely so interfaces can type-check this.
- **Termination race:** a model-decided stop while environment effects of the last action are still settling; τ ends, Ψ has not. Idempotency and verification (Chapters 3, 5) live here.
- **History contamination:** in multi-agent settings h_t^i may include other agents' unverified claims [MEM §2.1]; garbage observation in, confident action out — Chapter 9's cascading-hallucination problem in embryo.

## 9. Limitations

- The formalism abstracts internal deliberation away [MEM §2.1]. That is a strength for contracting and a weakness for interpretability: phenomena like evaluation awareness — the Fable/Mythos card reports "rates of evaluation awareness and reasoning about being graded are significant, and not always verbalized" [FSC] — live inside the abstracted box and are invisible to τ-level analysis.
- Ψ is assumed stationary within a task. Live environments (drifting web state, concurrent human edits) violate this; Harness-Bench deliberately sandboxes offline to escape the violation [HB §3.2], which is also an admission that the clean model does not fully describe production.
- 𝒬 fixed-within-task excludes mid-run re-instruction, which streaming interfaces permit [CAL]. Extending 𝒬 to a process is straightforward but the sources do not formalize it, so neither do we.

## 10. Production implications

1. **Design by symbol assignment.** For every component in a proposed architecture, write down which of {O, π, Ψ-interface, m, T, J} it implements. Components that implement none are dead weight (harness entropy, Chapter 3); components implementing two are refactor targets.
2. **Contract at the boundaries.** o_t and a_t are the system's typed interfaces; schema-validate both (Chapter 5).
3. **Never let π grade itself.** Invariant I4 is the formal version of "trust but verify"; the system-card evidence [FSC §2.3.3] shows the verification must be external.
4. **Log τ or accept blindness.** Every later chapter's methodology (evals, observability, incident response) consumes the trajectory; it must exist.

## 11. Connections

- Topic 3 develops I2 (partial observability) into belief-state engineering.
- Topic 4 splits π into model policy and harness policy — the composition this topic treated as one function.
- Topic 8 computes over τ lengths. Topic 12 fixes the notation introduced here for the rest of the book.
- Chapter 7 expands m_t into the full memory lifecycle (formation F, evolution E, retrieval R operators [MEM §2.2]).

## Sources

[MEM] Memory in the Age of AI Agents: A Survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1–2.2
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.3–3.4, §4.1–4.2
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[FSC] Claude Fable 5 & Mythos 5 System Card, June 9 2026 (`Knowledge_source/`) Exec. Summary, §2.3.3
