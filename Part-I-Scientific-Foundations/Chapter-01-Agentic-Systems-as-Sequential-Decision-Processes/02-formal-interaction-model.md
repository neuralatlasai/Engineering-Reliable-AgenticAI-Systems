# Topic 2 — Formal Interaction Model: Observation, Latent State, Action, Transition, Objective, and Termination

## 1. Problem and objective

Engineering discussions about agents stall because participants use words — "state," "step," "memory," "done" — that have no shared referent. The objective here is a constrained partially observable decision model that (a) covers single- and multi-agent execution, (b) distinguishes latent process variables from events an SDK can record, and (c) is precise enough to support the reliability mathematics of Topics 7–8.

The model combines standard POMDP state, transition, observation, policy, and belief semantics [POMDP] with the agent-memory survey's multi-agent and memory interfaces [MEM §2.1–2.2]. Safety and resource limits are represented as trajectory constraints in the constrained-MDP tradition [CMDP]. The synthesis is explicit because no single source supplies all three engineering views.

## 2. Intuition first

Strip an agent run to its skeleton and four operations remain: the world occupies a state; the system constructs a policy-visible view; a policy samples or selects an action; the world changes. Execution repeats until a completion rule, safety rule, or resource limit stops it. Prompts, tools, memory, schedulers, budgets, and evaluators can affect different boundaries; some components legitimately implement more than one function. Reliability analysis begins by naming those functions and their typed interfaces.

## 3. The formal model

Let $\mathcal I=\{1,\ldots,N\}$ index agents, $\mathcal S$ be the latent environment-state space, $\mathcal A_i$ agent $i$'s typed action space, and $\mathcal X_i$ its raw observation space. The task specification is $\mathcal Q$; the external environment instance is $\mathcal E$. A single-agent system has $N=1$. A multi-agent system must additionally specify whether actions are sequential, simultaneous, or asynchronously scheduled. [MEM §2.1]

### 3.1 Initial condition and latent transition

The task induces an initial-state distribution:

$$
s_0\sim\rho_0(\cdot\mid\mathcal Q,\mathcal E).
$$

At event index $t$, a scheduler $\sigma$ selects the active set $\mathcal I_t\subseteq\mathcal I$. The joint action $\mathbf a_t=(a_t^1,\ldots,a_t^N)$ assigns a distinguished no-op to inactive agents. The environment evolves according to:

$$
s_{t+1}\sim\Psi(\cdot\mid s_t,\mathbf a_t,\mathcal Q).
$$

Sequential agent loops are the special case $|\mathcal I_t|=1$. Simultaneous or asynchronous systems require ordering and conflict semantics because a joint action cannot be reconstructed from an agent index alone. [POMDP; MEM §2.1]

### 3.2 Raw observation and policy-visible context

Agent $i$ receives a stochastic raw observation:

$$
x_t^i\sim\Omega_i(\cdot\mid s_t,\mathbf a_{t-1},\mathcal Q).
$$

At initialization, define $\mathbf a_{-1}=\mathbf a_{\varnothing}$ as a distinguished no-op sentinel. This makes the $t=0$ boundary explicit without pretending that an environment action preceded initialization; an implementation may equivalently use a separate initial-observation kernel $\Omega_{i,0}(\cdot\mid s_0,\mathcal Q)$.

The harness constructs policy-visible context from the raw observation, visible history $h_t^i$, and retrieved memory $m_t^i$:

$$
c_t^i=C_H^i(x_t^i,h_t^i,m_t^i,\mathcal Q).
$$

This separation is load-bearing. $\Omega_i$ describes what the environment or tool interface reveals; $C_H^i$ describes truncation, formatting, retrieval, compaction, and access control. If observation dynamics depend on environment-side history, the state must be augmented with the variables required to recover the Markov property. [POMDP; MEM §2.1–2.2]

### 3.3 Sampled policy and heterogeneous actions

For an active agent, the model samples a proposal rather than an already authorized environment action:

$$
y_t^i\sim\pi_{M_i}(\cdot\mid c_t^i,\mathcal Q).
$$

Writing a distribution rather than $y_t^i=\pi_{M_i}(\cdot)$ preserves sampling, provider-side nondeterminism, and randomized routing. A deterministic controller is the degenerate case with all probability mass on one proposal. The proposal may encode any of the following action families from [MEM §2.1]:

1. **Natural-language generation** — explanations, proposals, responses, or instructions
2. **Tool invocation** — APIs, search, calculators, databases, simulators, or code execution
3. **Planning actions** — explicit decompositions, plans, or subgoal specifications
4. **Environment-control actions** — workspace edits, navigation, or other state-changing operations
5. **Communication actions** — structured messages to other agents

These action types may be proposed by an autoregressive model, selected by deterministic application logic, or jointly mediated by both. A harness admits a proposal as $\widetilde{\mathbf a}_t$ and the dispatcher records the executed joint action $\mathbf a_t$; rejection, parse failure, and no-op remain explicit. The three objects must not be conflated.

Let $\mathbf c_t=(c_t^1,\ldots,c_t^N)$ collect the agents' policy-visible contexts. The complete application–harness–model system induces an **executable policy** $\pi_{\mathrm{exec}}(\mathbf a_t\mid\mathbf c_t,\hat\tau_{0:t-1},\mathcal Q)$ over joint actions actually dispatched. This is an analytical marginal over proposal sampling, admission, routing, and scheduling—not a fourth implementation layer and not another name for $\pi_M$.

The model's internal deliberation remains abstracted inside $\pi_{M_i}$ [MEM §2.1]. Reliability contracts belong on observable inputs, proposed actions, admitted actions, effects, and externally checked outcomes; they need not assume that hidden reasoning is faithful or fully inspectable.

### 3.4 Termination

Let $\kappa_t$ be a typed termination decision:

$$
\kappa_t=\mathsf K(\hat\tau_{0:t},b_t^{\mathrm{rem}},v_t)
\in
\{\text{continue},\text{model-stop},\text{verified-success},
\text{budget-stop},\text{safety-stop},\text{execution-error}\},
$$

where $b_t^{\mathrm{rem}}$ is remaining resource budget, $\hat\tau_{0:t}$ is the observable trace prefix, and $v_t$ is any typed environment or validator terminal signal available to the control plane. The decision is evaluated after the step-$t$ proposal has been adjudicated and any admitted action has executed; a terminal proposal with no environment effect records the distinguished no-op. The terminal index is:

$$
T_{\mathrm{end}}=\inf\{t:\kappa_t\neq\text{continue}\}.
$$

Model-proposed completion and verified task success are distinct terminal causes. A model can emit no further tool call while an external validator rejects the result.

### 3.5 Latent trajectory versus observable trace

The generative process induces a latent trajectory:

$$
\tau^\star=(s_0,\mathbf x_0,\mathbf a_0,s_1,\ldots,
\mathbf x_{T_{\mathrm{end}}},\mathbf a_{T_{\mathrm{end}}},
s_{T_{\mathrm{end}}+1}).
$$

Because $s_t$ is latent under partial observability, production systems cannot persist $\tau^\star$ completely. They can persist an observable trace:

$$
\hat\tau=
(\text{requests},\text{responses},\text{tool calls/results},
\text{workspace deltas},\text{timestamps},\text{usage},\text{validator events}).
$$

Final artifacts and workspace snapshots are evidence about state, not the complete latent state itself. [HB §3.3]

### 3.6 Objective, runtime feedback, constraints, and evaluation

Three signals must not be conflated:

- **Training reward** $r_t$, if any, was used to optimize model or controller parameters before deployment.
- **Runtime feedback** consists of observations, tool results, validator messages, approvals, and rejections supplied during execution. It affects future actions only if re-entered through $c_{t+1}$.
- **Post-hoc evaluation** is an external measurement of a completed or terminated run. It need not be visible to the policy and is not automatically the reward that trained it.

Define task utility $U_{\mathcal Q}(\tau^\star)$ and $K_C$ safety/resource cost functionals $C_k(\tau^\star)$ with limits $b_k$:

$$
\max_{\pi_{\mathrm{exec}}\in\mathcal P_{\mathrm{allowed}}}
\ \mathbb E_{\pi_{\mathrm{exec}}}[U_{\mathcal Q}(\tau^\star)]
\qquad\text{subject to}\qquad
\mathbb E_{\pi_{\mathrm{exec}}}[C_k(\tau^\star)]\le b_k,
\quad k=1,\ldots,K_C.
$$

Here $\mathcal P_{\mathrm{allowed}}$ is the set of executable policies realizable under the declared permissions, budgets, and control mechanisms. This is the constrained decision problem. In deployment, exact utility and costs may be unknown; the evaluator $J$ estimates them from observable evidence:

$$
R=\operatorname{Run}(M,H,\mathcal E,\mathcal Q),
\qquad
\widehat U_J=\operatorname{Eval}(\hat\tau,\text{artifacts};J).
$$

Harness-Bench instantiates one diagnostic score:

$$
\operatorname{TaskScore}_j
\mathrel{=}
\operatorname{Security}_j\,
\operatorname{Completion}_j\,
\operatorname{Process}_j,
\qquad
\operatorname{Security}_j\in\{0,1\},
$$

$$
\operatorname{Process}_j
\mathrel{=}
\frac{
\operatorname{Robustness}_j+
\operatorname{ToolUse}_j+
\operatorname{Consistency}_j
}{3}.
$$

The multiplicative form requires completion, no scored security violation, and process quality for high aggregate credit [HB §3.4]. It is an evaluation instrument over available evidence, not a claim that the deployed policy observes or optimizes this scalar.

## 4. Invariants worth stating

- **I1 — Markov after explicit augmentation.** $\Psi$ conditions on current state and joint action. Time, concurrent edits, pending I/O, and other history-dependent variables must enter the augmented state if they affect the next-state distribution.
- **I2 — Observation may be partial.** In a fully observable special case, $x_t$ can identify $s_t$. In the agent settings of interest, tool and interface boundaries usually make $\Omega$ many-to-one, delayed, truncated, or noisy.
- **I3 — Policy context is not raw observation.** $\Omega$ and $C_H$ have different owners and failure modes. A missing file can be an environment-interface omission; a truncated tool result is context construction.
- **I4 — Termination cause is part of the result.** Model stop, verified success, budget exhaustion, safety stop, and execution error are not interchangeable outcomes.
- **I5 — Evaluation is external.** A self-assessment emitted by $\pi_M$ is a proposal, not independent evidence. The Fable/Mythos system card documents false completion and verification claims [FSC §2.3.3].
- **I6 — Trace is not trajectory.** $\hat\tau$ is auditable evidence; $\tau^\star$ contains latent variables and cannot generally be reconstructed exactly.

## 5. Mapping the formalism onto an executable runtime

Using the Claude Agent SDK loop [CAL] as one concrete implementation:

| Symbol | Concrete referent |
|---|---|
| $\mathcal Q$ | User task plus explicit task constraints; stable system policy belongs to $H$, not to the task |
| $\rho_0$ | Initial workspace/session state induced by task fixtures and runtime initialization |
| $s_t$ | Complete environment state, including unobserved files, pending effects, external changes, and hidden service state |
| $x_t$ | Raw tool results, read outputs, error messages, and other interface observations |
| $C_H$ | System prompt, tool schemas, history selection, persistent-context injection, retrieval, and compaction |
| $c_t$ | The assembled request visible to the model |
| $\pi_M$ | The model's conditional distribution over text and tool-call proposals |
| $\mathbf y_t$ | Sampled model proposal: text, candidate calls, or a terminal proposal |
| $\widetilde{\mathbf a}_t$ | Proposal set admitted by parsing, schema, permission, and budget gates |
| $\mathbf a_t$ | Joint action actually dispatched, including explicit no-op; multiple calls require a scheduling policy |
| $\Psi$ | Effects of tool execution and exogenous environment changes |
| $\kappa_t$ | Model stop proposal, verified success gate, budget stop, safety stop, or execution error |
| $\hat\tau$ | Persisted message and tool-event stream plus workspace deltas, usage, and validator events |
| $J$ | Versioned external evaluator consuming trace evidence and artifacts |

Two facts follow. First, policy-visible history is bounded: compaction can summarize older events [CAL], so $C_H$ is a lossy observation transformation. Second, a runtime turn and the formal event index are not identical: one model turn can propose several tool actions, while asynchronous effects can create events between turns. Reliability reports must state their counting unit.

## 6. What the formalism buys you: three worked consequences

**(a) It locates disagreements.** "The agent forgot the constraint" decomposes into testable hypotheses: the task contract omitted it; $\Omega$ never exposed relevant state; $C_H$ truncated it; retrieval failed; $\pi_M$ sampled an inconsistent proposal; or admission/dispatch altered the proposal. More than one cause can co-occur, so incident attribution should retain uncertainty rather than force one label.

**(b) It exposes what benchmarks hold fixed.** Harness-Bench fixes $(\mathcal E,\mathcal Q,J,\text{budgets})$ and varies $(M,H)$, making configuration-level variation observable [HB §4.1–4.2]. CompWoB changes the task distribution by composing two to eight subtasks; its aggregate base and compositional rates do not by themselves isolate trajectory length, context interference, or state coupling. Those mechanisms require matched per-composition or intervention-based analysis. [CompWoB]

**(c) It makes multi-agent assumptions explicit.** $N>1$ requires a joint action, scheduler, visibility relation, and conflict semantics. Coordination may be explicit through communication actions or environment-mediated through $\Psi$ [MEM §2.1], but its reliability cost is not captured by merely adding an agent index.

## 7. Experiments and measurement hooks

Minimum instrumentation implied by the observable variables:

- Persist $\hat\tau$, not an imaginary complete latent trajectory. Harness-Bench records model requests/responses, tool calls, workspace changes, usage, and validators, then derives four evidence sources: final workspace state, execution trace, usage statistics, and validator outputs [HB §3.3].
- Record both proposed and admitted actions so model-policy and harness-policy failures remain distinguishable.
- Log the typed cause of $\kappa_t$ and whether an external validator confirmed success.
- Version $J$ and retain component scores. Harness-Bench pins one judge across compared trajectories [HB §4.1]; a judge change is an instrument change that requires a bridge study for longitudinal comparison.
- In multi-agent systems, log scheduler decisions, message visibility, causal ordering, and conflicting writes.

## 8. Failure modes visible only at this level of abstraction

- **State–belief divergence:** the environment state and the policy-visible reconstruction part ways; Topic 3 develops the mechanisms.
- **Action-type confusion:** planning output is parsed as an executable environment action. Typed proposal/admission interfaces prevent this class of ambiguity.
- **Termination race:** a model proposes stop while the last environment effect is pending. Pending effects belong in augmented state and must be drained or cancelled before verified success.
- **History contamination:** untrusted tool output or another agent's unsupported claim enters $C_H$ as if it were evidence.
- **Scheduler ambiguity:** simultaneous actions are serialized differently across runs, changing $\Psi$ while the high-level transcript appears identical.
- **Evaluator leakage:** information intended only for $J$ enters $c_t$, changing the policy being measured.

## 9. Limitations

- A POMDP is an abstraction, not a claim that production teams know $\rho_0$, $\Psi$, or $\Omega$ numerically. Its value is boundary discipline and explicit uncertainty.
- Internal deliberation remains hidden inside $\pi_M$ [MEM §2.1]. Trace-level analysis cannot prove why a sampled proposal occurred.
- Stationarity requires state augmentation. Live web state, concurrent edits, clock time, and provider changes violate a naive stationary model unless represented as state or as a versioned change in $\mathcal E$.
- Treating $\mathcal Q$ as fixed excludes mid-run re-instruction. An interactive task can instead model $\mathcal Q_t$ as part of state and record principal-authorized updates.
- The constrained objective states what should be optimized; the external evaluator is only an estimator and can be biased, noisy, or incomplete.

## 10. Production implications

1. **Design by typed boundary.** Assign each component to one or more of $\rho_0$, $\Psi$ interface, $\Omega$, $C_H$, model proposal policy $\pi_M$, induced executable policy $\pi_{\mathrm{exec}}$, scheduler $\sigma$, termination rule $\mathsf K$, utility/constraints, or evaluator $J$.
2. **Validate both proposal and admission.** Schema-check model output, then independently enforce permissions, preconditions, idempotency, and action-specific safety policy.
3. **Do not let policy output serve as its only evidence.** Use external validators where the task admits them and label judgment-only outcomes accordingly.
4. **Persist observable evidence and its limits.** Record $\hat\tau$ completely enough for replay and audit, while documenting latent state that remains unobserved.
5. **Report the counting unit.** Step, action, event, turn, and run are different units; error-accumulation analysis is invalid when they are silently interchanged.

## 11. Connections

- Topic 3 derives the belief update implied by $(\Psi,\Omega)$ and then shows how deployed systems approximate it through $C_H$ and memory.
- Topic 4 expands $C_H$, model proposals, harness admission, application routing, and environment dispatch into a typed execution pipeline.
- Topic 8 computes conditional success over event sequences; Topic 12 fixes the notation for the rest of the book.
- Chapter 7 expands $m_t$ into formation, evolution, and retrieval operators.

## Sources

[POMDP] Kaelbling, Littman, and Cassandra, "Planning and Acting in Partially Observable Stochastic Domains," *Artificial Intelligence* 101, 1998 — https://doi.org/10.1016/S0004-3702(98)00023-X
[CMDP] Altman, *Constrained Markov Decision Processes*, Chapman & Hall/CRC, 1999
[MEM] Memory in the Age of AI Agents: A Survey, arXiv:2512.13564 (Knowledge_source/2512.13564v2.pdf) §2.1–2.2
[HB] Harness-Bench, arXiv:2605.27922 (Knowledge_source/2605.27922v1.pdf) §3.1–3.4, §4.1–4.2
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[FSC] Claude Fable 5 & Mythos 5 System Card, June 9 2026 (Knowledge_source/Claude Fable 5 & Claude Mythos 5 System Card.pdf) §2.3.3
