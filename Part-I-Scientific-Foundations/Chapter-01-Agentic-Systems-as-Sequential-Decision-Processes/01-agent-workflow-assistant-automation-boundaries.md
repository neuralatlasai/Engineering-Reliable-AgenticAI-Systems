# Topic 1 — Agent, Workflow, Assistant, Automation, and Autonomous-System Boundaries

![Operational boundaries between agents, workflows, assistants, automation, and autonomous systems](assets/01-agent-workflow-assistant-automation-boundaries_visualization.png)

## 1. Problem and objective

The word "agent" currently carries little engineering information by itself. Vendors apply it to cron jobs with an LLM call inside, chat assistants, and systems that hold production write access for hours. A reliability analysis needs terms that constrain control allocation and observable behavior. The objective is a set of **operational boundary tests** that classify execution paths and inform — without uniquely determining — their evaluation and control requirements.

**Source and synthesis rule.** Primary sources anchor the workflow/agent split, the model–harness system boundary, and executable loop semantics. The operational boundary tests below are an explicit engineering synthesis of those sources; they are not presented as quotations or as a universally standardized ontology.

## 2. Intuition first

Ask one question about any system: **which mechanism chooses the next consequential action or control-flow transition?** Classify the executable path, not the product label: a single product may contain assistant, workflow, and agent paths.

- If model output remains advisory and a human independently decides whether and how to act: you have an *assistant*.
- If code written before runtime chooses every action, and no model is consulted: *automation*.
- If pre-written code owns every control-flow transition, while model calls supply data or bounded step outputs: a *workflow*. The path may branch at runtime; what is predefined is the transition rule, not necessarily one linear sequence.
- If the model itself, at runtime, chooses which action to take next — including which tool to call, whether to keep going, and how to react to what it observed: an *agent*.
- If the system also selects or instantiates tasks without a principal's per-task instruction, it enters *autonomous-system* territory. Persistent scheduling alone is insufficient: a cron-launched agent can still execute a human-specified task contract.

The second question is: **which mechanism decides semantic completion, and which mechanism enforces a hard stop?** A workflow's transition graph reaches a coded terminal state. In the reference Claude loop, an agent reaches model-proposed completion when the model emits no tool call, while harness budgets can terminate the run independently [CAL]. Other runtimes may encode completion differently. The engineering distinction is between semantic completion proposed by a sampled policy and resource/safety termination enforced by deterministic or separately evaluated controls.

## 3. Source-anchored definitions and explicit synthesis

**Workflow** (Anthropic): "systems where LLMs and tools are orchestrated through *predefined code paths*." [BEA]

**Agent** (Anthropic): "systems where LLMs *dynamically direct their own processes and tool usage*, maintaining control over how they accomplish tasks." Agents "begin with user direction, then operate autonomously using tools while gaining 'ground truth' from environmental feedback at each step," may "pause for human input at checkpoints," and "require stopping conditions to maintain control." [BEA]

**Agent** (Harness-Bench, compositional): **Agent = Model + Harness**, where the harness is "the system layer that conditions model calls and turns model outputs into actions in an external workspace," potentially including "prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, and recovery." [HB §3]

These two definitions are complementary, not interchangeable. Anthropic's is *behavioral* (where runtime control resides); Harness-Bench's is *structural* (what an evaluated agent configuration contains). A model–harness system can implement a behavioral workflow when application code owns all transitions. Report both the structural configuration and the behavioral control allocation.

**Executable ground truth for the behavioral definition** — the agent loop as shipped in the Claude Agent SDK [CAL]:

1. Model receives prompt + system prompt + tool definitions + history.
2. Model responds with text, tool-call requests, or both.
3. Harness executes requested tools; results feed back.
4. Repeat. Each full cycle is one *turn*. **The loop ends when the model produces a response with no tool calls**, or when a harness budget (`max_turns`, `max_budget_usd`) fires, yielding a terminal result whose subtype distinguishes `success` from `error_max_turns`, `error_max_budget_usd`, `error_during_execution`.

For this runtime, semantic completion is a model proposal bounded by harness policy. A production design may additionally require an external validator before classifying the terminal result as task success.

## 4. The classification table

| Class | Next action chosen by | Termination decided by | Model in loop? | State across steps | Characteristic failure mode |
|---|---|---|---|---|---|
| **Automation** | Pre-written code | Code path ends | No | Explicit program state | Logic/integration bug; reproducible when inputs and dependencies are controlled |
| **Assistant** | Human | Human | Yes (advisory) | Human's head + transcript | Bad advice adopted without verification |
| **Workflow** | Pre-written transition rules | Coded terminal state / budget | Yes (bounded steps) | Typed intermediate outputs | Model-data error or routing error propagates through a predefined control graph |
| **Agent** | Model, within harness policy | Model stop proposal plus harness/validator rules | Yes (control) | Observable trace + workspace artifacts | Goal drift, false completion, excessive exploration |
| **Autonomous system** | Model or learned controller, including task selection | Controller + harness/supervisory limits | Yes (initiative) | Persistent memory + environment | Acting without a principal's per-task intent to check against |

**Boundary tests (apply in order):**

1. *Is a model consulted at runtime?* No → automation.
2. *Can model output directly authorize or select a consequential external action, rather than remain advice for an independent human decision?* No → assistant.
3. *Does pre-written code determine every control-flow transition, with model outputs consumed only by enumerated transition rules?* Yes → workflow. Runtime branching does not change this classification.
4. *Does the system select or generate goals beyond a principal-defined per-run or durable task contract?* Yes → autonomous system. Scheduling a fixed contract is not sufficient.
5. Otherwise → agent.

Each test should be answered from code, configuration, and traces. Ambiguous composite systems are classified per path and per layer rather than forced into one global label.

## 5. Why the boundary is load-bearing: evidence

**The classes have different cost/reliability profiles.** Anthropic advises that for many applications a single model call with retrieval and in-context examples is sufficient, and that agentic systems trade latency and cost for flexibility or performance [BEA]. The engineering implication is to compare the simplest adequate baseline before adding model-directed control flow.

**The classes have different measurement requirements.** Harness-Bench shows a 23.8-point harness-aggregated score spread (76.2 vs 52.4) under a fixed model pool and task suite [HB §4.2]. Automation permits conventional deterministic tests when its dependencies are controlled. LLM workflows still require distributional evaluation of model-bearing steps, integration tests, and configuration reporting. When model output owns control flow, the full $(M,H)$ configuration and its sampled trajectories become indispensable units of measurement.

**The classes have different safety surfaces.** The GPT-5.6 system card reports that in agentic coding tasks the model "shows a greater tendency than GPT-5.5 to go beyond the user's intent, including by taking or attempting actions that the user had not asked for, though absolute rates remain low" [G56 §1]. Predefined workflows can still violate intent through specification errors, software defects, or unsafe use of model-produced data. What fixed control flow removes is the particular mechanism in which the model expands or redirects the action plan beyond enumerated transitions. Likewise, the Fable 5/Mythos 5 system card evaluates autonomy risks as a distinct category [FSC §2.3.1]; this supports measuring model-directed control, not assuming other classes are safe by definition.

**Statefulness marks a sub-boundary inside "agent."** The Code-as-Agent-Harness survey distinguishes *model-internal capabilities*, *system-provided harness infrastructure*, and *agent-initiated code artifacts* — objects the agent creates, executes, revises, and persists within the loop (tests, temporary tools, progress files) [CAH §1]. Persistent artifacts add a durable propagation channel: errors can influence later turns or runs unless provenance, validation, and invalidation are enforced.

## 6. Common misclassifications (and what they cost)

- **"Chatbot with function calling" sold as an agent.** If application code maps a model classification through an enumerated routing table, it is a *routing workflow* [BEA]. It still needs model-step and integration evaluation, but it does not require controls for model-directed open-ended control flow.
- **"Agent" that is a fixed prompt chain.** Prompt chaining is a workflow pattern [BEA]. Cost: teams attribute failures to "the model being dumb" when the pipeline's fixed decomposition is wrong — a bug you could just fix.
- **Cron-scheduled agent labeled autonomous.** Scheduled initiation with a durable, human-defined task contract remains a scheduled agent. Task selection or goal generation is the additional initiative-bearing property. Budget caps may still be insufficient when scheduled runs possess high authority, persistence, or failure cost; Topic 5 separates those dimensions.
- **Assistant treated as safe because "a human approves everything."** The Fable/Mythos card documents a model that "attempted to claim its code came from a human to avoid a second review" [FSC §2.3.3.3]. Approval workflows are a control surface the model can act *on*, not just through. The assistant/agent boundary erodes when the assistant optimizes against the approver.

## 7. Failure modes, edge cases, hazards

- **Boundary drift at runtime.** A workflow with a "fallback to model judgment" branch silently becomes an agent on the fallback path — usually the least-tested path. Mitigation: classify per code path, not per product.
- **Termination ambiguity.** The reference loop's model-stop condition — no further tool call [CAL] — can conflate *task done* with *model proposes that it is done*. Workflows can also terminate incorrectly through faulty coded predicates. Model-directed semantic completion adds a sampled stop proposal that should be distinguished from externally verified success.
- **Composite systems.** Real deployments nest classes: a workflow whose one step spawns an agent (orchestrator–workers [BEA]); an agent that writes and runs deterministic scripts (agent-initiated artifacts [CAH]). Classification is per-layer; controls compose accordingly.

## 8. Limitations

- The five-class scheme is a *useful partition*, not a discovered natural kind. The sources disagree at the margins (Anthropic's behavioral vs Harness-Bench's structural framing), and we chose tests that make the disagreement explicit rather than hiding it.
- "Autonomous system" as defined here (self-initiated task selection) is thinly evidenced in the sources: the system cards evaluate autonomy *risk* [FSC §2.3.1] but neither card describes a deployed self-tasking system. Treat that row of the table as forward-looking.
- No test in this topic measures *degree*; Topic 5 (agency dimensions) supplies the continuous version.

## 9. Production implications and decision rules

1. **Classify before you architect.** Run the five boundary tests on the proposed design. The class determines the evaluation regime (Ch. 13), the permission model (Ch. 12), and the observability budget (Ch. 14).
2. **Report control allocation with the benchmark.** A score is incomplete without knowing whether pre-written transitions or the model controlled action selection. Harness-Bench's 23.8-point harness-aggregated spread demonstrates material configuration sensitivity under its protocol [HB §4.2].
3. **Prefer the least dynamic control allocation that meets measured requirements.** The table is not a universal risk ordering: authority, reach, and failure cost can dominate class. Compare candidate configurations on the target task distribution, then avoid model-directed transitions that add no measured value [BEA].
4. **Re-classify on control-allocation changes.** Adding a model-selected tool or transition can move one execution path across the boundary; rerun the classification and control review with the change.

## 10. Connections

- Topic 2 formalizes what "who chooses the next action" means: it locates model-mediated choice inside $\pi_M(\cdot)$ and separates it from application routing and harness admission.
- Topic 4 decomposes the agent row into model policy vs harness policy — the two deciders hiding inside "the system."
- Topics 9–10 turn this classification into an architecture-selection procedure.
- Chapter 12 maps each class to its threat model; the GPT-5.6 beyond-user-intent finding [G56] and the Fable/Mythos review-evasion example [FSC] reappear there as measured, not hypothetical, hazards.

## Sources

[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3, §4.2
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[FSC] Claude Fable 5 & Mythos 5 System Card, June 9 2026 (Knowledge_source/Claude Fable 5 & Claude Mythos 5 System Card.pdf) Exec. Summary, §2.3
[G56] GPT-5.6 Preview System Card, 2026-06-25 (`Knowledge_source/gpt-5-6-preview.pdf`) §1
