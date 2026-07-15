# Topic 5 — Handoffs versus Agents-as-Tools

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The two primitives for delegating to a specialist, distinguished by **one question: who owns the reply?** This is the most consequential and most-confused control decision in multi-component agent systems, and the sources answer it precisely.

**Prerequisites.** Chapter 5, Topic 2 (agents-as-tools as a *tool type*, with $g_{\mathrm{det}}=0$); Topic 4 (supervisor–worker — agents-as-tools at architecture scale); Chapter 4, Topic 3 (the OpenAI Agents SDK's handoff/tool primitives).

**Terminology.** *Handoff*: control transfer — "control moves to the specialist agent" [OAO]. *Agents-as-tools*: delegation without transfer — "the manager keeps ownership of the reply" [OAO].

**Boundaries.** Inside: the two primitives, their ownership semantics, and the decision rule. Outside: what happens *after* the delegation returns (Topic 6 — aggregation and final-answer authority); the multi-agent topology question (Chapter 9).

**Exclusions.** No SDK API tutorial (Chapter 4; Topic 13 compares).

**Outcomes.** The reader can choose between the primitives from ownership requirements, and can state what each cedes.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A generalist agent encounters a task needing a specialist. Two ways to involve one: **hand off** (the specialist takes over and answers the user directly) or **call it as a tool** (the specialist does bounded work and returns a result; the generalist synthesizes the answer). They look interchangeable — both "delegate to a specialist" — and they differ in the property that matters most: **who is responsible for what the user finally sees.**

**Bottleneck.** The choice is usually made by whichever the SDK made easier, and its consequences surface later. A handoff cedes the reply to a specialist that may not know the conversation's full context or the operator's response policy. An agent-as-tool keeps the manager responsible but pays a full sub-agent loop for every delegation and inherits the sub-agent's *non-determinism* (Chapter 5, Topic 2: $g_{\mathrm{det}}=0$ — a sub-agent's result is a *proposal*, not an observation). **Neither is wrong; choosing without understanding the ownership transfer is.**

**Objective.** Choose the primitive from the ownership requirement — who must own the final reply, and who must remain accountable for policy — and handle the non-determinism each introduces.

**Assumptions.** The specialist is another model-directed component (an agent). Its output is model-generated and therefore untrusted (Chapter 5, Topic 2).

**Constraints.** A handoff transfers control *and* the response obligation. An agent-as-tool costs a full sub-agent loop (latency, cost, context).

**Success criteria.** Ownership is explicit; the specialist that owns the reply has the context and policy to own it; sub-agent results are treated as proposals, not verdicts.

## 3. Intuition first, then formalization

### 3.1 Intuition: one question — who answers the user?

The distinction reduces to a single question, and the sources answer it in one line each:

- **Handoff:** "Control moves to the specialist agent" [OAO]. The specialist **owns the reply** — it takes over the conversation for that branch and answers the user directly. The manager is *out of the loop* for that branch.
- **Agents-as-tools:** "The manager keeps ownership of the reply" [OAO]. The specialist does a "bounded task" and returns a result; **the manager synthesizes the final answer.** The specialist never speaks to the user.

[OAO]'s own table is the clearest statement of the difference:

| Aspect | Handoffs | Agents-as-Tools |
|---|---|---|
| **Ownership** | Specialist owns response | Manager stays responsible |
| **Use case** | "Delegated ownership across branches" | "Helper/specialist pattern" |
| **Control flow** | **Transfer** | **Nested calls** |

The intuition that makes the choice easy: **ask who must be accountable for what the user sees.**

- If the specialist genuinely *owns* that branch of the conversation — a billing agent that should handle the entire billing interaction, with its own policy, tone, and escalation path — **hand off.** The specialist has the context and the mandate.
- If the specialist is a *capability* the manager needs — "summarize this," "classify that," "look this up" — and the manager must weave the result into a coherent answer under its own policy, **use it as a tool.** [OAO]'s framing: specialists as "bounded capabilities" for "bounded tasks like summarization or classification."

The failure of getting it wrong: **hand off when you needed a tool, and you have ceded the reply to an agent that does not know the operator's response policy or the rest of the conversation.** **Use a tool when you needed a handoff, and the manager becomes a bottleneck relaying a conversation it should have delegated** — every turn round-trips through a manager that adds nothing.

### 3.2 Formalization: the ownership transfer and its consequences

Let the conversation have a *responsible agent* $\rho$ — the component accountable for the next reply to the user. The two primitives differ in their effect on $\rho$ **[synthesis; grounded in [OAO]]**:

$$
\textbf{Handoff:}\quad \rho \;\leftarrow\; \text{specialist} \qquad\text{(transfer — } \rho \text{ CHANGES)}
$$
$$
\textbf{Agent-as-tool:}\quad \rho \;\text{unchanged} \qquad\text{(nested call — the manager remains } \rho\text{)}
$$

Three consequences follow, and each is an invariant **[derived]**:

$$
\textbf{H-1 (the responsible agent must be competent to reply):}\quad
\text{after a handoff, the specialist must have the CONTEXT and the POLICY to own the reply.}
$$

H-1 is the handoff's precondition. A handoff transfers the *obligation* to reply — so the specialist must have what it needs to discharge it: the conversation's relevant history, the operator's response policy, the escalation path. **A handoff to an agent that lacks the conversation's context produces a specialist confidently answering the wrong question.** This is why [OAO] notes that handoffs "carry structured metadata or filtered history" — the transfer must carry what the specialist needs.

$$
\textbf{H-2 (a sub-agent's result is a proposal, not an observation):}\quad
\text{an agent-as-tool returns model-generated output:}\ g_{\mathrm{det}}=0\ \text{(Ch.5 T2)};\ \text{it is UNTRUSTED and unverified.}
$$

H-2 is Chapter 5, Topic 2's control-retention result, and it is the agent-as-tool's central hazard. **The manager receives the sub-agent's output dressed as a *tool result* — which carries an implicit authority that model text does not.** A manager that treats a sub-agent's "I verified this" as an observation has imported Chapter 2's false-completion propensity [FSC §6.3.5] across a boundary that made it look authoritative. **The sub-agent's $\kappa$ must cross the boundary** (Chapter 5, Topic 2, §6): a worker that hit `budget` must not be reported to the manager as `success`.

$$
\textbf{H-3 (delegation is a } K_M \textbf{ multiplier):}\quad
\text{each agent-as-tool call is a full sub-agent loop} \Rightarrow K_M^{\text{total}} = K_M^{\text{manager}} + \textstyle\sum_j K_M^{(j)} .
$$

H-3 is Topic 1's W-1, applied to delegation: **a sub-agent does not add one model-directed step — it adds a whole loop of them.** The error compounding (Chapter 1, Topic 8) accumulates across the nested loops. **This is the strongest argument for [OAO]'s "start with one agent whenever you can"**: each specialist multiplies the autonomous-step count, and reliability decays geometrically in it.

### 3.3 The decision rule, and the default

[OAO] states the default and the criteria for departing from it, and it is worth quoting exactly because it is the most actionable rule in the chapter:

> **"Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility."** [OAO]

Four justifications for a specialist, and note what is *not* on the list **[grounded in [OAO]]**:

- **Capability isolation** — the specialist has tools or knowledge the generalist should not have.
- **Policy isolation** — the specialist operates under a different policy (a refunds agent with different authority — Chapter 5, Topic 10's principal scoping).
- **Prompt clarity** — one prompt cannot serve both jobs without becoming incoherent (Chapter 6, Topic 2's altitude problem).
- **Trace legibility** — the delegation makes the run *easier to understand and debug*.

**"It felt more organized" is not on the list. Neither is "the framework made it easy."** [OAO] adds: "Splitting prematurely creates complexity without proportional benefit." **The specialist must *materially* improve one of the four, or it is a $K_M$ multiplier (H-3) for nothing.**

And once a specialist is justified, [OAO]'s design rules: **"Give each specialist a narrow job"** and **"Keep `handoffDescription` short and concrete"** [OAO] — the handoff description is a *policy input* the model reads to decide whether to hand off, so it is Chapter 5, Topic 4's affordance problem, applied to delegation.

## 4. Architecture

```
   HANDOFF — control TRANSFERS; the specialist OWNS the reply [OAO]
   ┌──────────┐   handoff    ┌─────────────┐
   │ TRIAGE   │─────────────►│ BILLING     │──────────► reply to USER
   │ AGENT    │  (+ filtered │ SPECIALIST  │
   └──────────┘   history /  └─────────────┘   ρ ← specialist  (ownership MOVED)
                  metadata)
   H-1: the specialist MUST have the context + policy to own the reply.
        Handoff to an under-contexted agent ⇒ confidently answers the wrong question.

   AGENTS-AS-TOOLS — NESTED call; the manager KEEPS the reply [OAO]
   ┌──────────────────────────────────────────────┐
   │ MANAGER  (ρ — stays responsible)              │──────────► reply to USER
   │    │                                          │
   │    ├── summarizer.asTool() ──► result ────────┤   H-2: result is a PROPOSAL
   │    ├── classifier.asTool() ──► result ────────┤         (g_det = 0, Ch.5 T2)
   │    └── lookup.asTool()     ──► result ────────┤         κ must cross the boundary
   │                                               │
   │    manager SYNTHESIZES the final answer       │
   └──────────────────────────────────────────────┘
   H-3: each sub-agent is a FULL LOOP ⇒ K_M multiplies. Error compounds (Ch.1 T8).

   DEFAULT [OAO]: "Start with one agent whenever you can."
   ADD A SPECIALIST only for: capability isolation · policy isolation ·
                              prompt clarity · trace legibility
   "Splitting prematurely creates complexity without proportional benefit." [OAO]
```

**The handoff's filtered history is the H-1 mechanism.** [OAO] notes handoffs "carry structured metadata or filtered history." This is the transfer's payload — and getting it wrong is the handoff's main failure. **Too little context: the specialist cannot answer. Too much: the specialist's window fills with irrelevant conversation (Chapter 6, Topic 1's dilution).** The filtered history is a *context-engineering decision* (Chapter 6) made at the delegation boundary, and it deserves the same discipline as any other context assembly.

## 5. Grounding

- **The two primitives and the ownership distinction:** handoffs — "Control moves to the specialist agent," used when "specialists should own different branches," the specialist "takes over the conversation for that part of the workflow"; agents-as-tools — "The manager keeps ownership of the reply" by calling specialists as "bounded capabilities," and "The orchestrating agent synthesizes the final answer while delegating specific tasks" [OAO].
- **The comparison table:** Ownership (specialist owns response / manager stays responsible); Use case (delegated ownership across branches / helper-specialist pattern); Control flow (**transfer** / **nested calls**) [OAO].
- **The decision rule and the default:** "Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"; "Splitting prematurely creates complexity without proportional benefit" [OAO].
- **The design rules:** "Give each specialist a narrow job"; "Keep `handoffDescription` short and concrete"; handoffs "carry structured metadata or filtered history" [OAO].
- **The API shapes:** handoffs declared via `handoffs: [billingAgent, handoff(refundAgent)]`; agents-as-tools via `summarizer.asTool({toolName, toolDescription})` [OAO] — and both primitives ship in the OpenAI Agents SDK [OAP] (Chapter 4, Topic 3), with ADK's `AgentTool` vs sub-agent transfer as the same distinction [ADK-T] (Chapter 5, Topic 2).
- **Sub-agent output is non-deterministic and untrusted:** Chapter 5, Topic 2's control-retention vector ($g_{\mathrm{det}}=0$ for agents-as-tools; "a sub-agent's 'done' is a claim, not evidence") and the false-completion propensity [FSC §6.3.5] — H-2's basis.
- **Delegation multiplies autonomous steps:** Topic 1's W-1 and Chapter 1, Topic 8's error accumulation — H-3.
- **Sub-agents isolate context:** [ECE]'s distillation (Topic 4, §3.3) — the agent-as-tool's context benefit, when the sub-agent returns a summary rather than raw work.

**Evidence gap.** The primitives, their semantics, and the decision rule are **documented product behavior and explicit vendor guidance** [OAO] — this is among the better-grounded topics in the chapter. What is **unmeasured**: the *reliability cost* of a handoff vs an agent-as-tool; the misuse rate (how often systems pick the wrong primitive); the effect of the four justifications on outcomes. H-1..H-3 are **[derived]** (H-1 from the ownership semantics; H-2 from Chapter 5, Topic 2's sourced control-retention analysis; H-3 from Chapter 1, Topic 8's error accumulation). **No source measures handoff-vs-tool outcomes**; §8 measures locally.

## 6. Implementation

**The two primitives, and what each cedes:**

```python
# HANDOFF — ownership TRANSFERS. [OAO]
triage = Agent(
    name="Triage",
    handoffs=[billing_agent, handoff(refund_agent)],       # [OAO]'s shape
)
# H-1: the specialist must be able to OWN the reply. What crosses the boundary matters:
def handoff_payload(conversation, specialist) -> dict:
    """[OAO]: handoffs 'carry structured metadata or filtered history'.
    Too little → the specialist answers the wrong question.
    Too much  → its window fills with irrelevant history (Ch.6 T1 dilution)."""
    return {
        "filtered_history": filter_relevant(conversation, specialist.domain),   # Ch.6
        "policy": specialist.policy,                    # H-1: it needs the POLICY too
        "escalation_path": conversation.escalation,
    }

# AGENTS-AS-TOOLS — manager KEEPS the reply. [OAO]
manager.tools = [
    summarizer.as_tool(name="summarize_text",
                       description="Generate a concise summary of the supplied text."),  # [OAO]
]
```

**H-2: the sub-agent's result is a proposal — surface its $\kappa$ (Chapter 5, Topic 2):**

```python
def as_tool(agent, *, budget, name, description) -> ToolContract:
    """H-2: g_det = 0 (Ch.5 T2). The sub-agent's output is MODEL-GENERATED — a proposal,
    not an observation. Its κ must cross the boundary or a `budget` termination is
    silently reported to the manager as success."""
    def call(args, ctx):
        result, kappa = agent.run(args["task"], budget=budget)   # child budget BOUNDED
        return {
            "status": "success" if kappa == "success" else "incomplete",
            "kappa": kappa,                     # ← surfaced, never swallowed
            "content": result,
        }, (kappa in FAILED_KAPPA)
    return ToolContract(name=name, description=description,
                        trust=Trust.UNTRUSTED,          # model-generated (Ch.5 T2, T12)
                        executor="agent_as_tool", ...)
```

**The specialist-justification gate ([OAO]'s four criteria):**

```python
JUSTIFICATIONS = {"capability_isolation", "policy_isolation", "prompt_clarity", "trace_legibility"}

def justify_specialist(spec) -> None:
    """[OAO]: 'Add specialists only when they materially improve capability isolation,
    policy isolation, prompt clarity, or trace legibility.'
    'Splitting prematurely creates complexity without proportional benefit.'
    H-3: each specialist MULTIPLIES K_M — error compounds geometrically (Ch.1 T8)."""
    if not (spec.justification & JUSTIFICATIONS):
        raise DesignError(
            f"{spec.name}: no material justification. 'It felt more organized' and "
            f"'the framework made it easy' are NOT on the list. This specialist is a "
            f"K_M multiplier (H-3) for no benefit. Start with one agent. [OAO]"
        )
```

## 7. Trade-offs

| | Handoff | Agents-as-tools |
|---|---|---|
| **Who replies to the user** | **Specialist** | **Manager** |
| Control flow | Transfer | Nested call |
| Manager's context after | Out of the loop for that branch | Grows with each result |
| Specialist needs | **Conversation context + policy** (H-1) | Just the bounded task |
| Latency | One agent, not two | **Manager + sub-agent loop** |
| $K_M$ cost (H-3) | Specialist's loop *replaces* the manager's | Specialist's loop *adds* to the manager's |
| Result trust | Specialist speaks directly | **Proposal, untrusted** (H-2) |
| Best for | "Delegated ownership across branches" [OAO] | "Bounded tasks like summarization or classification" [OAO] |

**The trade, stated as the one question:** *who must be accountable for what the user sees?* If the specialist can and should own that branch — it has the domain, the policy, and the mandate — **hand off**, and the manager gets out of the way (lower latency, no bottleneck, and the $K_M$ *replaces* rather than *adds*). If the manager must remain accountable — because it must synthesize, apply a policy the specialist does not have, or weave several results together — **use a tool**, and pay the nested loop.

**The H-3 asymmetry is under-appreciated and it favors handoffs on reliability.** An agent-as-tool *adds* a full sub-agent loop to the manager's own — so $K_M$ accumulates and error compounds across both (Chapter 1, Topic 8). A handoff *transfers* control — the specialist's loop runs *instead of* the manager continuing. **On pure reliability grounds, a handoff is cheaper than an agent-as-tool for the same delegation** — which is a real argument for handoffs whenever ownership transfer is acceptable. The cost is that you have ceded the reply, so H-1 must hold.

## 8. Experiments

**The primitive-misuse audit — the cheapest finding.** For each delegation in the system, ask: *who owns the reply, and who should?* **A handoff where the specialist lacks the conversation context (H-1 violated) or an agent-as-tool where the manager adds nothing to the specialist's answer (a pointless relay) is a misuse.** Both are common and both are visible in traces.

**The H-1 test — does the specialist have what it needs?** After a handoff, measure whether the specialist's reply is *coherent with the prior conversation*. **A specialist answering the wrong question because the filtered history omitted the context is the handoff's defining failure.** Vary the handoff payload (minimal / filtered / full history) and measure reply quality vs the specialist's context tokens — the trade between H-1 (enough context) and Chapter 6, Topic 1 (not too much).

**The H-2 test — is the sub-agent's $\kappa$ crossing the boundary?** Force a sub-agent to terminate on `budget`; check whether the manager treats it as `success`. **A manager that reports a budget-truncated sub-agent result as a completed task has swallowed the $\kappa$** — the exact terminal-collapse failure from Chapter 4, Topic 14 and Chapter 5, Topic 2.

**The H-3 reliability measurement.** Same task, three structures: one agent; manager + agent-as-tool; triage + handoff. Metrics: completion, $K_M$ (total, across nested loops), latency, cost. **Prediction (H-3, W-1): the agent-as-tool structure has the highest $K_M$ and, on tasks the single agent can do, the lowest completion.** This prices [OAO]'s "start with one agent."

**The justification test ([OAO]'s four criteria).** For each specialist, ablate it (fold its job back into the generalist) and measure whether the claimed justification materializes: does capability isolation matter (does the generalist misuse the tool)? Does prompt clarity improve (is the merged prompt incoherent)? **A specialist whose ablation costs nothing was not justified** — [OAO]'s "splitting prematurely."

**Statistics.** Paired designs; McNemar on completion; task-clustered bootstrap; zero-failure bound on swallowed-$\kappa$ (target zero); report $K_M$ and the vector (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Handoff to an under-contexted specialist.** H-1 violated; the specialist confidently answers the wrong question. **The handoff's defining failure.** Mitigation: the handoff payload carries filtered history *and policy* [OAO]; test it (§8).
- **Sub-agent result treated as an observation.** H-2 violated; a model-generated "I verified it" arrives dressed as an authoritative *tool result* (Chapter 5, Topic 2). Mitigation: `Trust.UNTRUSTED`; verify with a deterministic sensor (Chapter 3, Topic 7).
- **Sub-agent's $\kappa$ swallowed.** A `budget` termination reported as success. Mitigation: surface $\kappa$ across the boundary (§6).
- **Specialist added without justification.** A $K_M$ multiplier (H-3) for "it felt organized." Mitigation: [OAO]'s four criteria; the justification gate (§6).
- **Manager as a pointless relay.** An agent-as-tool whose result the manager passes through unchanged — the manager adds nothing and costs a loop. Mitigation: if the manager adds nothing, hand off instead.
- **Handoff when the manager must remain accountable.** The specialist replies under a policy it does not have; the operator's response policy is bypassed. Mitigation: if policy must be applied centrally, use a tool.
- **Handoff description as an afterthought.** The model decides *whether* to hand off by reading `handoffDescription` — it is a policy input (Chapter 5, Topic 4's affordance). A vague one produces missed or spurious handoffs. Mitigation: "short and concrete" [OAO].
- **Nested delegation depth.** An agent-as-tool that itself calls agents-as-tools; $K_M$ compounds multiplicatively (H-3). Mitigation: bound the delegation depth explicitly; measure total $K_M$.
- **Edge case — the handoff that must come back.** A specialist finishes its branch and the conversation should return to the generalist. This is *not* what a handoff models (it transfers ownership); it is either a *sequence* of handoffs (specialist hands back) or an agent-as-tool misused. Mitigation: model the return explicitly — a handoff back, or restructure as a tool call. Topic 6 (ownership transfer and final-answer authority) treats this.
- **Open limitation.** The primitives and the decision rule are **well documented** [OAO] — but the *outcomes* are not: no measured handoff-vs-tool reliability comparison, no misuse rate, no validation of the four justification criteria. H-1..H-3 are **[derived]** from the sourced ownership semantics (H-1), Chapter 5, Topic 2's control-retention analysis (H-2), and Chapter 1, Topic 8's error accumulation (H-3). §8 measures locally.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Handoff: "Control moves to the specialist agent"; the specialist "takes over the conversation for that part of the workflow" and **owns the response** [OAO].
2. Agents-as-tools: "The manager keeps ownership of the reply"; specialists are "bounded capabilities" for "bounded tasks like summarization or classification" [OAO].
3. Control flow: **transfer** vs **nested calls**; ownership: specialist vs manager [OAO].
4. "Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"; "Splitting prematurely creates complexity without proportional benefit" [OAO].
5. "Give each specialist a narrow job"; handoffs "carry structured metadata or filtered history" [OAO].
6. A sub-agent's output is model-generated, non-deterministic, and untrusted (Chapter 5, Topic 2; [FSC §6.3.5]).
7. **No source measures handoff-vs-tool outcomes.**

**Decision rules.**
- **Ask one question: who must be accountable for what the user sees?** Specialist → handoff. Manager → agent-as-tool.
- **A handoff requires the specialist to have the context AND the policy** (H-1) — the payload is a context-engineering decision.
- **A sub-agent's result is a proposal, not an observation** (H-2) — untrusted, and its $\kappa$ must cross the boundary.
- **Every specialist must materially improve capability isolation, policy isolation, prompt clarity, or trace legibility** [OAO] — or it is a $K_M$ multiplier for nothing.
- **Start with one agent** [OAO]. Splitting prematurely costs complexity without proportional benefit.
- **On reliability alone, a handoff is cheaper than an agent-as-tool** (H-3: transfer vs add) — when ownership transfer is acceptable.

**Production implications.**
1. Audit every delegation for primitive misuse — a handoff with no context, or a manager that relays a tool result unchanged, is a design error visible in traces.
2. Verify sub-agent $\kappa$ crosses the boundary; a swallowed `budget` is a silent false success.
3. Apply [OAO]'s four-criteria gate before adding any specialist; "the framework made it easy" is not a justification.
4. Treat the handoff payload (filtered history + policy) as a context-engineering problem (Chapter 6), because it is.

**Connections.** This topic is Chapter 5, Topic 2's agents-as-tools *type*, elevated to a control primitive, and Topic 4's supervisor–worker at the delegation boundary. H-2 is Chapter 5, Topic 2's $g_{\mathrm{det}}=0$ and Chapter 5, Topic 12's untrusted-content rule; H-3 is Topic 1's W-1 and Chapter 1, Topic 8. The handoff payload is Chapter 6's context assembly. **Topic 6 takes up what this topic leaves open: what happens to ownership when results come back, and who holds final-answer authority.** Chapter 9 asks when these specialists should be independently-deployed agents rather than in-process delegates.

## Sources

[OAO] OpenAI, agent-orchestration guide — handoffs ("Control moves to the specialist agent"; specialists "own different branches"; the specialist "takes over the conversation for that part of the workflow"; declared via `handoffs: [billingAgent, handoff(refundAgent)]`; "carry structured metadata or filtered history"; "Keep `handoffDescription` short and concrete") vs agents-as-tools ("The manager keeps ownership of the reply"; specialists as "bounded capabilities" via `summarizer.asTool({toolName, toolDescription})`; for "bounded tasks like summarization or classification"; "The orchestrating agent synthesizes the final answer"); the comparison table (Ownership / Use case / Control flow: transfer vs nested calls); "Start with one agent whenever you can. Add specialists only when they materially improve capability isolation, policy isolation, prompt clarity, or trace legibility"; "Splitting prematurely creates complexity without proportional benefit"; "Give each specialist a narrow job" — https://developers.openai.com/api/docs/guides/agents/orchestration
[OAP] OpenAI Agents SDK for Python — handoffs and agents-as-tools as shipped primitives — https://github.com/openai/openai-agents-python
[ADK-T] Google ADK — `AgentTool` (agent-as-tool) vs sub-agent transfer, "the key difference from sub-agents" — https://adk.dev/tools-custom/function-tools/
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — unsupported completion claims; the propensity a sub-agent's result inherits (H-2) — `Knowledge_source/`
