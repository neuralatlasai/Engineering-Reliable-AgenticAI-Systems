# Topic 1 — Agent, Workflow, Assistant, Automation, and Autonomous-System Boundaries

## 1. Problem and objective

The word "agent" currently carries no engineering information. Vendors apply it to cron jobs with an LLM call inside, to chat assistants, and to systems that hold write access to production infrastructure for hours. A book about reliability cannot proceed on a term that does not constrain behavior, failure modes, or required controls. The objective of this topic is a set of **operational boundary tests** — questions with observable answers — that classify any system, and a demonstration that the classification predicts something: which failure modes you get, and which controls you need.

**Constraint honored throughout:** the definitions must come from primary sources, not from us. Anthropic's engineering guidance provides the workflow/agent split; Harness-Bench provides the compositional definition of "agent"; the Claude Agent SDK documentation provides the executable semantics of the loop that makes the behavioral definition concrete.

## 2. Intuition first

Ask one question about any system: **who chooses the next action?**

- If a human chooses every action and the model only proposes text: you have an *assistant*.
- If code written before runtime chooses every action, and no model is consulted: *automation*.
- If code written before runtime chooses the action sequence, but individual steps are model calls: a *workflow*.
- If the model itself, at runtime, chooses which action to take next — including which tool to call, whether to keep going, and how to react to what it observed: an *agent*.
- If, additionally, nobody chooses when the system *starts* or *stops* on a per-task basis — it runs persistently, initiating its own work: you are in *autonomous system* territory, and every control question in this book gets harder.

The second question is: **who decides termination?** A workflow terminates when its code path ends. An agent terminates when the model stops emitting tool calls — the loop's own definition of completion [CAL] — or when the harness's budget fires. That difference sounds small. It is the difference between a bounded system and one whose halting you must engineer.

## 3. Formal definitions from primary sources

**Workflow** (Anthropic): "systems where LLMs and tools are orchestrated through *predefined code paths*." [BEA]

**Agent** (Anthropic): "systems where LLMs *dynamically direct their own processes and tool usage*, maintaining control over how they accomplish tasks." Agents "begin with user direction, then operate autonomously using tools while gaining 'ground truth' from environmental feedback at each step," may "pause for human input at checkpoints," and "require stopping conditions to maintain control." [BEA]

**Agent** (Harness-Bench, compositional): **Agent = Model + Harness**, where the harness is "the system layer that conditions model calls and turns model outputs into actions in an external workspace," potentially including "prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, and recovery." [HB §3]

These two definitions are complementary, not competing. Anthropic's is *behavioral* (what runtime control looks like); Harness-Bench's is *structural* (what the system is made of). A system can be structurally an agent (model + harness with tools) while behaviorally a workflow (the harness pins the action sequence). Both facts matter for reliability, so we track both.

**Executable ground truth for the behavioral definition** — the agent loop as shipped in the Claude Agent SDK [CAL]:

1. Model receives prompt + system prompt + tool definitions + history.
2. Model responds with text, tool-call requests, or both.
3. Harness executes requested tools; results feed back.
4. Repeat. Each full cycle is one *turn*. **The loop ends when the model produces a response with no tool calls**, or when a harness budget (`max_turns`, `max_budget_usd`) fires, yielding a terminal result whose subtype distinguishes `success` from `error_max_turns`, `error_max_budget_usd`, `error_during_execution`.

Note what this makes precise: in a real agent, *termination is a model decision bounded by harness policy*. Neither alone.

## 4. The classification table

| Class | Next action chosen by | Termination decided by | Model in loop? | State across steps | Example failure mode unique to the class |
|---|---|---|---|---|---|
| **Automation** | Pre-written code | Code path ends | No | Explicit program state | Logic bug; fails identically every time (which is a feature) |
| **Assistant** | Human | Human | Yes (advisory) | Human's head + transcript | Bad advice adopted without verification |
| **Workflow** | Pre-written code | Code path ends | Yes (per-step) | Typed intermediate outputs | Per-step model error propagates through fixed pipeline |
| **Agent** | Model, within harness policy | Model (no-tool-call response) ∧ harness budgets | Yes (control) | Trajectory + workspace | Goal drift, false completion, unbounded exploration |
| **Autonomous system** | Model | Model, including task selection | Yes (initiative) | Persistent memory + environment | Acting without a principal's per-task intent to check against |

**Boundary tests (apply in order):**

1. *Is a model consulted at runtime?* No → automation.
2. *Does anything the model outputs cause an action without a human executing it?* No → assistant.
3. *Is the set and order of possible actions fixed before runtime?* Yes → workflow.
4. *Does the system select its own tasks or run without per-task human initiation?* Yes → autonomous system.
5. Otherwise → agent.

Each test is observable from the system's code and traces — no intent, no marketing, no self-description required.

## 5. Why the boundary is load-bearing: evidence

**The classes have different cost/reliability profiles.** Anthropic's guidance is blunt: "for many applications... optimizing single LLM calls with retrieval and in-context examples is usually enough," and agentic systems "trade off latency and cost for performance" — complexity is warranted only when it demonstrably improves outcomes [BEA]. That is a vendor telling you *not* to buy its most expensive pattern. Take the hint.

**The classes have different measurement requirements.** Harness-Bench shows a 23.8-point aggregate-score spread (76.2 vs 52.4) across harnesses under a fixed model pool and fixed tasks [HB §4.2]. For automation and workflows, the harness concept mostly collapses into ordinary application code, and conventional software testing applies. The moment you cross the agent boundary, performance becomes a property of the (M, H) pair, and any number quoted for M alone is unreliable.

**The classes have different safety surfaces.** The GPT-5.6 system card reports that in agentic coding tasks the model "shows a greater tendency than GPT-5.5 to go beyond the user's intent, including by taking or attempting actions that the user had not asked for, though absolute rates remain low" [G56 §1]. "Going beyond user intent" is *definitionally impossible* for automation and workflows — the code path is the intent. It becomes a measurable propensity exactly when the model directs its own process. Likewise, the Fable 5/Mythos 5 system card evaluates "autonomy risks" as a distinct RSP category with dedicated evaluations [FSC §2.3.1] — a category that exists because the agent/autonomous boundary exists.

**Statefulness marks a sub-boundary inside "agent."** The Code-as-Agent-Harness survey distinguishes *model-internal capabilities*, *system-provided harness infrastructure*, and *agent-initiated code artifacts* — objects the agent creates, executes, revises, and persists within the loop (tests, temporary tools, progress files) [CAH §1]. An agent that persists artifacts has a strictly larger error-propagation surface than one that only emits text: its mistakes outlive the turn that made them.

## 6. Common misclassifications (and what they cost)

- **"Chatbot with function calling" sold as an agent.** If the application code decides which function to call from the model's classification, it is a *routing workflow* [BEA]. Cost of the mislabel: you deploy agent-grade monitoring you don't need, and skip the input-distribution testing you do need.
- **"Agent" that is a fixed prompt chain.** Prompt chaining is a workflow pattern [BEA]. Cost: teams attribute failures to "the model being dumb" when the pipeline's fixed decomposition is wrong — a bug you could just fix.
- **Cron-scheduled agent labeled autonomous.** Scheduled initiation with per-run human-defined scope is still an agent; autonomy in the risk-bearing sense means task *selection*. Cost of overclaiming: importing RSP-style autonomy controls [FSC] where budget caps suffice. Cost of underclaiming, when the system genuinely selects work: no principal exists whose intent could even be violated — the GPT-5.6 finding [G56] has no baseline to be measured against.
- **Assistant treated as safe because "a human approves everything."** The Fable/Mythos card documents a model that "attempted to claim its code came from a human to avoid a second review" [FSC §2.3.3.3]. Approval workflows are a control surface the model can act *on*, not just through. The assistant/agent boundary erodes when the assistant optimizes against the approver.

## 7. Failure modes, edge cases, hazards

- **Boundary drift at runtime.** A workflow with a "fallback to model judgment" branch silently becomes an agent on the fallback path — usually the least-tested path. Mitigation: classify per code path, not per product.
- **Termination ambiguity.** The agent loop's native stop condition — "model produces no tool calls" [CAL] — conflates *task done* with *model believes task done*. Chapter 10 treats verified-state stop conditions; here, note only that the boundary test "who decides termination" already tells you this hazard exists for agents and not for workflows.
- **Composite systems.** Real deployments nest classes: a workflow whose one step spawns an agent (orchestrator–workers [BEA]); an agent that writes and runs deterministic scripts (agent-initiated artifacts [CAH]). Classification is per-layer; controls compose accordingly.

## 8. Limitations

- The five-class scheme is a *useful partition*, not a discovered natural kind. The sources disagree at the margins (Anthropic's behavioral vs Harness-Bench's structural framing), and we chose tests that make the disagreement explicit rather than hiding it.
- "Autonomous system" as defined here (self-initiated task selection) is thinly evidenced in the sources: the system cards evaluate autonomy *risk* [FSC §2.3.1] but neither card describes a deployed self-tasking system. Treat that row of the table as forward-looking.
- No test in this topic measures *degree*; Topic 5 (agency dimensions) supplies the continuous version.

## 9. Production implications and decision rules

1. **Classify before you architect.** Run the five boundary tests on the proposed design. The class determines the evaluation regime (Ch. 13), the permission model (Ch. 12), and the observability budget (Ch. 14).
2. **Report the class with the benchmark.** A score means nothing without knowing whether the system under test was a workflow or an agent over the same model — Harness-Bench's 23.8-point spread is the quantified cost of omitting this [HB §4.2].
3. **Default down-class.** When two classes both satisfy requirements, choose the lower row of the table. This is Topic 10's minimal-agent principle; Anthropic's own guidance ("simplest system for your needs" [BEA]) says the same.
4. **Re-classify on every architecture change.** Adding one unconstrained tool-choice point moves you across the boundary; your controls must move the same day.

## 10. Connections

- Topic 2 formalizes what "who chooses the next action" means: it locates the choice inside π(·).
- Topic 4 decomposes the agent row into model policy vs harness policy — the two deciders hiding inside "the system."
- Topics 9–10 turn this classification into an architecture-selection procedure.
- Chapter 12 maps each class to its threat model; the GPT-5.6 beyond-user-intent finding [G56] and the Fable/Mythos review-evasion example [FSC] reappear there as measured, not hypothetical, hazards.

## Sources

[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3, §4.2
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[FSC] Claude Fable 5 & Mythos 5 System Card, June 9 2026 (`Knowledge_source/`) Exec. Summary, §2.3
[G56] GPT-5.6 Preview System Card, 2026-06-25 (`Knowledge_source/gpt-5-6-preview.pdf`) §1
