# Topic 13 — Comparative Implementations in OpenAI Agents SDK, Claude Agent SDK, and Google ADK

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** How the three ecosystems realize this chapter's control structures — and, more usefully, **what each SDK makes easy, what it makes hard, and what it leaves entirely to you.** The comparison's value is not a ranking; it is that *the SDK's defaults shape the orchestration you end up with*, and knowing that lets you resist it.

**Prerequisites.** Chapter 4 (the SDK surfaces, documented as interfaces); Topics 1–12 (the structures being compared); Chapter 4, Topic 12 (portability limits — the divergences here do not port).

**Terminology.** Per-SDK, defined in §4. The book's vocabulary (Topics 1–12) is the neutral frame; each SDK's terms map onto it.

**Boundaries.** Inside: how each SDK expresses the chapter's structures, and what it omits. Outside: the API surfaces themselves (Chapter 4); which SDK to choose (a procurement question this book does not answer).

**Exclusions.** No feature-matrix marketing comparison; no recommendation of one SDK over another.

**Outcomes.** The reader can map their SDK's primitives onto the chapter's vocabulary, identify what their SDK does *not* provide (and must therefore be built), and recognize where the SDK's defaults are steering their orchestration.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The chapter's structures are SDK-neutral, but every implementation happens *in* an SDK, and **the SDK's defaults exert a strong pull on the design.** An SDK with first-class `Sequential`/`Parallel`/`Loop` agents makes deterministic composition the path of least resistance. An SDK whose primary primitive is a free-running agent loop makes full autonomy the default. **Teams do not usually choose their orchestration level (Topic 12) — their SDK chooses it for them**, and they discover the choice later.

**Bottleneck.** Every SDK provides a *subset* of this chapter's disciplines, and **the gaps are where the failures live.** An SDK that ships handoffs and agents-as-tools (Topic 5) but no status aggregation (Topic 6) will produce systems that launder failures — not because the team was careless, but because the SDK made the easy path the wrong one. **The bottleneck is that what the SDK omits is invisible**: you notice what it gives you, not what it does not.

**Objective.** Map each SDK's primitives onto the chapter's structures, **name the gaps explicitly**, and know what must be built regardless of SDK.

**Assumptions.** SDK surfaces are documented, dated, and change (Chapter 4, Topic 13).

**Constraints.** The book's evidence for each SDK is at the depth Chapter 4 established — **Anthropic at reference depth, OpenAI and Google at guide depth** — and this topic inherits that asymmetry and states it rather than papering over it.

**Success criteria.** The reader can name what their SDK does *not* provide, and has built or planned it.

## 3. Intuition first, then formalization

### 3.1 Intuition: the SDK's defaults are an orchestration opinion

Each SDK embodies a stance on Topic 1's autonomy axis, and the stance shows in what it makes *easy*:

- **Google ADK** ships **deterministic composition as first-class objects**: `SequentialAgent`, `ParallelAgent`, `LoopAgent` alongside `LlmAgent` [ADK-A]. **The workflow patterns are types.** This pulls toward the *left* of the axis — deterministic structure is the natural expression, and autonomy is something you opt into (an `LlmAgent` inside a `SequentialAgent`). It also ships the event-sourced runtime (commit-before-continue, [ADK]) that Topic 10's durability requires.

- **OpenAI Agents SDK** ships **delegation primitives**: handoffs and agents-as-tools [OAO; OAP], with the `Runner` loop and guardrails. **The multi-agent control primitives are types.** This pulls toward *composition of agents* — the natural expression is a set of specialist agents wired by handoffs, which is why [OAO] pairs it with such an insistent counter-default ("start with one agent whenever you can") — **the SDK makes splitting easy, so the guidance has to push back.**

- **Claude Agent SDK** ships **a single strong agent loop** with hooks, permissions, subagents, and sessions [CAL]. **The agent loop is the primitive.** This pulls toward the *right* of the axis — a capable autonomous loop with guardrails (hooks, permission modes) rather than deterministic composition. Its subagents provide context isolation (Chapter 6, Topic 11; Topic 4's distillation).

**The intuition: the SDK you pick pre-selects your position on Topic 1's axis unless you deliberately resist it.** An ADK team will naturally build deterministic graphs; an OpenAI-SDK team will naturally build a constellation of specialists; a Claude-SDK team will naturally build one strong guarded loop. **None of these is wrong — but none of them is the *task's* answer, and Topic 12's decision procedure should drive the structure, not the SDK's ergonomics.**

### 3.2 Formalization: the coverage matrix

Map the chapter's structures onto what each SDK provides. **[synthesis; each cell grounded in §5 and Chapter 4]**

| Chapter structure | Google ADK | OpenAI Agents SDK | Claude Agent SDK |
|---|---|---|---|
| **T1: deterministic composition** | **First-class** (`Sequential`, `Parallel`, `Loop` agents) [ADK-A] | Via code around the `Runner` | Via code around the loop |
| **T1: agent loop** | `LlmAgent` [ADK-A] | `Runner` loop [OAP] | **The primitive** [CAL] |
| **T2: patterns** | Sequential/Parallel are types; others in code | In code | In code |
| **T3: routing** | In code (or an `LlmAgent` that routes) | Handoffs *are* routing-with-transfer | In code / subagent selection |
| **T4: supervisor–worker** | Workflow agents + `LlmAgent` | **Agents-as-tools** [OAO] | **Subagents** [CAL] |
| **T5: handoff vs tool** | `AgentTool` vs sub-agent transfer [ADK-T] | **Both, first-class** [OAO] | Subagents (tool-shaped) |
| **T6: status aggregation** | **You build it** | **You build it** | **You build it** |
| **T7: typed state** | **`state_delta`, typed session state** [ADK-S] | Session state | Session state |
| **T8: HITL gates** | Callbacks/plugins; tool confirmation | Guardrails; approvals | **Permission modes, hooks** [CAL] |
| **T9: replanning** | **You build it** | **You build it** | **You build it** |
| **T10: durable execution** | **Event-sourced runtime** (commit-before-continue) [ADK] | Sessions; you build durability | Sessions; you build durability |
| **T11: termination** | Loop bounds | `max_turns` [OAP] | Budgets, `max_turns` [CAL] |
| **T12: the decision** | **Yours** | **Yours** | **Yours** |

**The row that matters most is the one where all three say "you build it."** **Status aggregation (Topic 6), replanning (Topic 9), and the orchestration decision (Topic 12) are provided by none of them** — and Topic 6's failure-laundering is, per this book's argument, the most consequential silent failure in multi-component workflows. **Every SDK ships the delegation primitives that create the aggregation boundary and none ships the discipline that makes the boundary safe.**

### 3.3 The three gaps that no SDK fills

The comparison's most useful output is not what the SDKs *have* but what they *all lack* **[synthesis]**:

1. **Status aggregation (Topic 6).** Every SDK lets you delegate and get a result back. **None computes $\kappa_{\text{agg}}$ from constituent statuses.** So the default path — synthesize the results, return the answer — launders partial failures, and the SDK does nothing to stop it. **You must build O-2/O-3.**

2. **Replanning discipline (Topic 9).** Every SDK gives you a loop and an error. **None classifies failures into transient/refutation/terminal, and none detects thrashing.** So the default path is "retry on error," which produces infinite identical failures on refutations. **You must build the classification and the novelty check.**

3. **The orchestration decision (Topic 12).** No SDK tells you how much orchestration to build. **Worse, each SDK's ergonomics push you toward a particular answer** (§3.1), and that push is invisible. **You must make the decision deliberately, against the SDK's grain if necessary.**

**These three gaps are where this chapter's disciplines earn their keep**, and they are precisely the areas where a team relying on the SDK's happy path will ship the failures the chapter has catalogued.

## 4. Architecture

```
   THE SAME WORKFLOW, THREE SDKS — and what each leaves to you

   GOOGLE ADK — deterministic composition is FIRST-CLASS
   ┌────────────────────────────────────────────────────────────┐
   │ SequentialAgent(                                            │
   │   ParallelAgent(worker_a, worker_b),   ← Topic 2's patterns │
   │   LlmAgent(name="synthesizer"),          AS TYPES [ADK-A]   │
   │ )                                                           │
   │ + event-sourced runtime (commit-before-continue) [ADK]      │
   │   → Topic 10's durability, PROVIDED                         │
   │ + typed state_delta [ADK-S] → Topic 7, PROVIDED             │
   │ ✗ status aggregation (T6) · replanning (T9) — YOU BUILD     │
   └────────────────────────────────────────────────────────────┘

   OPENAI AGENTS SDK — delegation primitives are FIRST-CLASS
   ┌────────────────────────────────────────────────────────────┐
   │ triage = Agent(handoffs=[billing, refunds])   ← T5 handoff  │
   │ manager.tools = [summarizer.asTool(...)]      ← T5 as-tool  │
   │ Runner.run(agent, max_turns=N)                ← T11 bound   │
   │ + guardrails                                                │
   │ ⚠ the SDK makes SPLITTING easy → hence [OAO]'s insistent    │
   │   counter-default: "start with one agent whenever you can"  │
   │ ✗ status aggregation (T6) · replanning (T9) · durability    │
   └────────────────────────────────────────────────────────────┘

   CLAUDE AGENT SDK — the AGENT LOOP is the primitive
   ┌────────────────────────────────────────────────────────────┐
   │ query(prompt, options=ClaudeAgentOptions(                   │
   │   permission_mode=...,      ← T8 gates, PROVIDED            │
   │   hooks={PreToolUse: ...},  ← T8 ENFORCEMENT (Ch.5 T10)     │
   │   agents={...subagents...}, ← T4 distillation (Ch.6 T11)    │
   │   max_turns=N,              ← T11 bound                     │
   │ ))                                                          │
   │ + parallel-read / serial-write rule [CAL] → T2's P-1        │
   │ ✗ status aggregation (T6) · replanning (T9) · deterministic │
   │   composition (T1/T2 — you write the code around the loop)  │
   └────────────────────────────────────────────────────────────┘

   ★ ALL THREE LEAVE TO YOU: status aggregation (T6), replanning
     discipline (T9), and the orchestration decision (T12).
     These are exactly where the chapter's worst failures live.
```

## 5. Grounding

**Google ADK:**
- **Workflow agents as deterministic composition primitives:** Sequential, Parallel, and Loop agents alongside `LlmAgent` [ADK-A] — Topic 2's patterns as types.
- **Event-sourced runtime with commit-before-continue:** "only after the Runner processes and commits the event does execution continue"; resumed code "can reliably assume that the state changes signaled in the yielded event have been committed"; the documented dirty-read window [ADK] — **Topic 10's durability, provided.**
- **Sessions hold complete event history enabling "state reconstruction, session rewinding, and observability"** [ADK] — Chapter 7, Topic 3's authoritative log.
- **Typed state with `state_delta` carried by events; direct mutation forbidden** [ADK-S] — **Topic 7's typed workflow state, provided.**
- **`AgentTool` vs sub-agent transfer** [ADK-T] — Topic 5's distinction.
- **Parallel function tools since Python 1.10.0** [ADK-T].

**OpenAI Agents SDK:**
- **Handoffs and agents-as-tools as first-class primitives**, with the ownership distinction (transfer vs nested call) [OAO; OAP] — **Topic 5, provided.**
- **The decision rule shipped with the SDK:** "Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"; "Splitting prematurely creates complexity without proportional benefit" [OAO] — **Topic 12's default, stated by the vendor whose SDK makes splitting easiest.**
- **`Runner`, guardrails, sessions, tracing, `max_turns`** [OAP] (Chapter 4, Topic 3) — Topic 11's bound.

**Claude Agent SDK:**
- **The agent loop as the primitive**, with `query()` / `ClaudeSDKClient` [CAL] (Chapter 4, Topic 6).
- **Permission modes and hooks** [CAL] — Topic 8's gates, and — critically — **hooks are the *enforcement* mechanism** ("To block an action regardless of what Claude decides, use a PreToolUse hook" [CCM]), which is Chapter 5, Topic 10's "guarantees come from code."
- **Subagents** [CAL] — Topic 4's supervisor–worker with context isolation ([ECE]'s distillation).
- **Parallel read-only / serialized write execution** [CAL] — **Topic 2's P-1, enforced by the SDK.**
- **Budgets and `max_turns`** [CAL] — Topic 11's backstop.
- **Compaction** [CAL] — Chapter 6, Topic 11.

**Evidence-depth asymmetry, stated as Chapter 4 did.** The Anthropic surface is documented at **reference depth** [CAL; CCM]; the OpenAI and Google surfaces at **guide depth** [OAO; OAP; ADK-A; ADK-S; ADK]. **This topic's coverage matrix is therefore more confident for some cells than others**, and cells marked "you build it" are claims that *the source documentation does not describe such a primitive* — not proof that none exists in a corner of the API this book did not reach. **Where a cell is uncertain, verify against current documentation** (Chapter 4, Topic 13's version discipline).

**Evidence gap.** **No source compares the SDKs on outcomes** — no benchmark, no reliability comparison, no measured effect of the ergonomic pull (§3.1). The coverage matrix is **[synthesis]** from documented primitives; the "SDK defaults shape your orchestration" claim (§3.1) is **reasoned, not measured** — it follows from the ergonomics, and it is the kind of claim that would need a study of real deployments to establish. **The three gaps (§3.3) are the topic's most defensible output**: they are absences in the documentation, verifiable by inspection.

## 6. Implementation

**The same workflow, three ways — and the same gaps in all three:**

```python
# ── GOOGLE ADK — deterministic composition as TYPES [ADK-A] ────────────────
root = SequentialAgent(
    name="pipeline",
    sub_agents=[
        ParallelAgent(name="gather", sub_agents=[worker_a, worker_b]),   # T2 sectioning
        LlmAgent(name="synthesize", instruction="..."),                  # the K_M step
    ],
)
# PROVIDED: durability (event-sourced, commit-before-continue [ADK]); typed state [ADK-S]
# YOU BUILD: status aggregation (T6) — the synthesizer will launder worker failures.

# ── OPENAI AGENTS SDK — delegation as TYPES [OAO] ─────────────────────────
manager = Agent(name="manager", tools=[
    worker_a.as_tool(tool_name="gather_a", tool_description="..."),      # T5 as-tool
    worker_b.as_tool(tool_name="gather_b", tool_description="..."),
])
result = await Runner.run(manager, input, max_turns=20)                   # T11 bound
# PROVIDED: T5's primitives; guardrails; the "start with one agent" default [OAO]
# YOU BUILD: status aggregation (T6); durability (T10); replanning (T9).

# ── CLAUDE AGENT SDK — the agent LOOP as the primitive [CAL] ──────────────
async for msg in query(prompt, options=ClaudeAgentOptions(
        agents={"worker_a": AgentDefinition(...), "worker_b": AgentDefinition(...)},  # T4
        hooks={"PreToolUse": [gate_irreversible_writes]},   # T8 ENFORCEMENT (Ch.5 T10)
        permission_mode="acceptEdits",
        max_turns=20,                                        # T11 bound
)):
    ...
# PROVIDED: gates (hooks — real enforcement); subagent context isolation; P-1 (parallel
#           reads / serial writes [CAL]); compaction
# YOU BUILD: deterministic composition (T1/T2); status aggregation (T6); replanning (T9).
```

**What you must build regardless of SDK (§3.3) — the portable disciplines:**

```python
# GAP 1 — STATUS AGGREGATION (Topic 6). No SDK does this. It is the most consequential gap.
def aggregate_status(constituents: list[StepResult]) -> str:
    """O-2: κ_agg = success IFF every REQUIRED constituent succeeded.
    Every SDK gives you delegation. NONE computes this. Without it, the synthesizer
    launders partial failures into a fluent complete-looking answer (T6, §3.3)."""
    required = [c for c in constituents if c.required]
    return "success" if all(c.kappa == "success" for c in required) \
           else worst_kappa([c.kappa for c in required])

# GAP 2 — REPLANNING DISCIPLINE (Topic 9). No SDK classifies failures.
def classify_failure(result: StepResult, plan, state) -> str:
    """Every SDK gives you a loop and an error. NONE distinguishes transient (retry) from
    refutation (replan) from terminal (escalate). The default 'retry on error' produces
    infinite identical failures on refutations (T9, §3.1)."""
    if result.kappa in TRANSIENT: return "retry"
    if result.kappa in TERMINAL:  return "escalate"
    return "replan" if refutes_assumption(result, plan, state) else "retry_once"

# GAP 3 — THE ORCHESTRATION DECISION (Topic 12). No SDK tells you how much to build,
#         and each SDK's ergonomics push you toward a particular answer (§3.1).
#         Resist the pull; run Topic 12's decision procedure.
```

## 7. Trade-offs

| SDK | Makes easy | Makes hard | Pulls you toward |
|---|---|---|---|
| **Google ADK** | Deterministic composition (types); durability (event-sourced); typed state | Free-form autonomy (you nest an `LlmAgent`) | **Left of Topic 1's axis** — deterministic graphs |
| **OpenAI Agents SDK** | Delegation (handoffs, agents-as-tools); guardrails | Deterministic composition (code around `Runner`); durability | **Multi-agent composition** — hence [OAO]'s insistent counter-default |
| **Claude Agent SDK** | A strong guarded loop; **hook enforcement**; subagent isolation; P-1 | Deterministic composition; durability | **Right of the axis** — one capable autonomous loop |

**The trade nobody frames as a trade: the SDK is an orchestration opinion, and you inherit it by default.** Choosing an SDK for its API ergonomics and then discovering it has pre-selected your position on the autonomy axis is the common path. **The discipline: run Topic 12's decision procedure *first*, decide the structure the task warrants, and then evaluate whether the SDK expresses it naturally or fights you.** An ADK team building a free-running agent, or a Claude-SDK team building a deterministic DAG, will be working against the grain — which is fine, but should be a *choice*.

**The three universal gaps (§3.3) are the strongest practical takeaway.** Whatever SDK you use, **you will build status aggregation, replanning discipline, and the orchestration decision yourself** — and those are precisely where this chapter's worst failures (laundered failures, thrashing, over/under-orchestration) live. **The SDK will not save you from them, and its happy path leads directly into them.**

## 8. Experiments

**The gap audit — the practical output.** For your SDK, verify §3.2's matrix against *current* documentation (Chapter 4, Topic 13: surfaces change). **For every cell marked "you build it," check: have you built it?** The three universal gaps (§3.3) are the priority.

**The laundering test, per SDK (Topic 6, §8).** Force a delegated component to fail; use the SDK's natural delegation path; **check whether the failure reaches the final answer or is synthesized away.** **Prediction: on all three SDKs' happy paths, it is laundered** — because none computes $\kappa_{\text{agg}}$. This experiment demonstrates the gap concretely and is the most persuasive argument for building O-2.

**The ergonomic-pull check (§3.1).** Examine your system's autonomy fraction $\alpha$ (Topic 12, §6) and ask: **is this the level the task warrants (Topic 12), or the level the SDK made easy?** **A system whose $\alpha$ matches its SDK's default and was never deliberately chosen has been designed by its framework.**

**Portability probe (Chapter 4, Topic 12).** Which of your control structures would survive an SDK migration? **The SDK-provided ones (workflow agents, handoffs, hooks) would not port; the ones you built (aggregation, replanning, typed state) would.** This is an argument for building the disciplines *outside* the SDK's abstractions where practical.

**Statistics.** The gap audit is a checklist, not a measurement. The laundering test carries a zero-failure bound (target zero, Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **The SDK chose your orchestration.** $\alpha$ matches the SDK's default and was never deliberated. Mitigation: Topic 12's decision procedure *first*; then evaluate SDK fit.
- **Trusting the happy path.** The SDK's natural delegation path launders failures (no SDK computes $\kappa_{\text{agg}}$). **This is the single most consequential SDK gap.** Mitigation: build O-2/O-3 (Topic 6).
- **"Retry on error" as the replanning strategy.** No SDK classifies failures; the default produces infinite identical failures on refutations. Mitigation: build Topic 9's classification.
- **Assuming durability.** Only ADK's runtime is documented as event-sourced with commit-before-continue [ADK]; on the others you build durability yourself. **A HITL gate (Topic 8) on a non-durable SDK will not survive a deploy.** Mitigation: Topic 10.
- **Mistaking guidance for enforcement.** Instructions are context, not enforcement — hooks enforce [CCM]. An SDK's *guidance* mechanisms (system prompts, agent instructions) do not gate. Mitigation: hooks/gates (Chapter 5, Topic 10).
- **Version drift.** Every cell in §3.2 is dated and provider-specific (Chapter 4, Topic 13). Mitigation: re-verify against current docs; pin versions.
- **Edge case — mixing SDKs.** A multi-SDK system inherits *all three* ergonomic pulls and *none* of the portability. Mitigation: build the disciplines (aggregation, typed state, replanning) in *your* code, not the SDK's abstractions, so they compose.
- **Open limitation.** **No source compares the SDKs on outcomes** — the coverage matrix is a **[synthesis]** from documented primitives, and the "SDKs shape your orchestration" claim (§3.1) is **reasoned, not measured.** The **evidence-depth asymmetry** (Anthropic at reference depth; OpenAI/Google at guide depth) means some cells are more confident than others, and a "you build it" cell asserts *absence from the documentation this book consulted*, not proof of absence. **Verify against current docs.**

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **ADK ships deterministic composition as types** (Sequential, Parallel, Loop agents) alongside `LlmAgent` [ADK-A], plus an **event-sourced runtime with commit-before-continue** [ADK] and **typed `state_delta` state** [ADK-S].
2. **The OpenAI Agents SDK ships handoffs and agents-as-tools as first-class primitives** with the ownership distinction, plus `Runner`, guardrails, and `max_turns` [OAO; OAP] — and ships the counter-default **"start with one agent whenever you can"** [OAO].
3. **The Claude Agent SDK's primitive is the agent loop**, with **hooks as real enforcement**, permission modes, subagents, budgets, compaction, and the **parallel-read/serial-write rule** [CAL; CCM].
4. **No SDK provides status aggregation (Topic 6), replanning discipline (Topic 9), or the orchestration decision (Topic 12)** — the three universal gaps.
5. **No source compares the SDKs on outcomes.**

**Decision rules.**
- **Decide the orchestration level *first* (Topic 12), then check SDK fit** — do not let the SDK's ergonomics choose your position on the autonomy axis.
- **Build status aggregation yourself** (Topic 6) — every SDK creates the aggregation boundary; none makes it safe.
- **Build the replanning classification yourself** (Topic 9) — "retry on error" is every SDK's default and it is wrong for refutations.
- **Verify durability** — only ADK's runtime documents it; a HITL gate on a non-durable workflow will not survive a deploy.
- **Build the portable disciplines outside the SDK's abstractions** where practical — they are what survives a migration.
- **Re-verify the matrix against current docs** (Chapter 4, Topic 13).

**Production implications.**
1. Run the laundering test on your SDK's happy path (§8); it will launder, and seeing it is the most persuasive case for building O-2.
2. Audit the three universal gaps; they are where this chapter's worst failures live and no SDK covers them.
3. Check whether your autonomy fraction was *chosen* or *inherited* from the SDK.
4. If you use a non-ADK SDK and need HITL gates or long workflows, build durability (Topic 10) before you build the gate.

**Connections.** This topic maps Chapter 4's documented SDK surfaces onto Chapter 8's control vocabulary. Its three gaps are Topics 6, 9, and 12 — the chapter's most consequential disciplines. The portability observation is Chapter 4, Topic 12; the version discipline is Chapter 4, Topic 13. Hooks-as-enforcement is Chapter 5, Topic 10; subagent distillation is Chapter 6, Topic 11 and Topic 4. Topic 14 tests the structures this topic locates.

## Sources

[ADK-A] Google ADK agents — Sequential, Parallel, and Loop workflow agents as first-class deterministic composition primitives alongside `LlmAgent` — https://adk.dev/agents/
[ADK] Google ADK runtime event loop — event-sourced runtime; **commit-before-continue** ("only after the Runner processes and commits the event does execution continue"); sessions with "complete event history, enabling state reconstruction, session rewinding, and observability"; the dirty-read window — https://adk.dev/runtime/event-loop/
[ADK-S] Google ADK session/state — typed state with `state_delta` carried by events; direct mutation forbidden — https://adk.dev/sessions/state/
[ADK-T] Google ADK custom tools — `AgentTool` vs sub-agent transfer; parallel function tools (Python ≥1.10.0) — https://adk.dev/tools-custom/function-tools/
[OAO] OpenAI, agent-orchestration guide — handoffs ("control moves to the specialist agent") and agents-as-tools ("the manager keeps ownership of the reply") as first-class primitives; "**Start with one agent whenever you can.** Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"; "Splitting prematurely creates complexity without proportional benefit" — https://developers.openai.com/api/docs/guides/agents/orchestration
[OAP] OpenAI Agents SDK for Python — `Runner`, handoffs, agents-as-tools, guardrails, sessions, tracing, `max_turns` — https://github.com/openai/openai-agents-python
[CAL] Claude Agent SDK — `query()`/`ClaudeSDKClient`; the agent loop as the primitive; permission modes; hooks; subagents; budgets/`max_turns`; compaction; **parallel read-only / serialized write execution** — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CCM] Claude Code memory model — instructions are "context, not enforced configuration"; "To block an action regardless of what Claude decides, use a **PreToolUse hook**" — hooks as the enforcement mechanism — https://code.claude.com/docs/en/memory
