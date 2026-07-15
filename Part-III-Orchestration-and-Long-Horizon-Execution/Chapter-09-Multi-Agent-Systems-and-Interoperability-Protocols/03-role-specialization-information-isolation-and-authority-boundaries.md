# Topic 3 — Role Specialization, Information Isolation, and Authority Boundaries

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** What distinguishes one agent from another: its **role** (what it does), its **information** (what it can see), and its **authority** (what it may do). These three are independent axes, and conflating them is how a multi-agent system becomes either a set of clones or a security hole.

**Prerequisites.** Topic 2 (the delegation contract's four fields — this topic is that contract, generalized); Chapter 5, Topic 10 (principal scoping; the confused deputy); Chapter 7, Topic 7 (read policies; purpose limitation).

**Terminology.** *Role*: the agent's function and its prompt/tools. *Information isolation*: what context an agent can see (Topic 6 develops this). *Authority boundary*: what actions an agent may take, and on whose behalf.

**Boundaries.** Inside: the three axes and the invariants relating them. Outside: shared-vs-private context mechanics (Topic 6); identity propagation across *remote* agents (Topic 13); the topology that arranges roles (Topic 4).

**Exclusions.** No RBAC-system design.

**Outcomes.** The reader can specify an agent's role, information scope, and authority independently, and can ensure a subagent cannot exceed the authority of the principal that invoked it.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** "Specialist agent" is usually a *prompt* difference — the billing agent has a billing prompt. That is the weakest and least useful form of specialization. **Three things can differ, and they have different consequences:**

- **Role** — different prompt, tools, and objective. Buys focus and prompt clarity ([OAO]'s justifications).
- **Information** — different context. **This is the mechanism that makes multi-agent work at all** (Topic 1, §3.1: parallel context windows).
- **Authority** — different permissions. **This is what makes multi-agent a security architecture rather than just a performance one** — and it is the axis nobody sets deliberately.

**Bottleneck.** Most multi-agent systems differentiate on *role* only. Every subagent inherits the lead's full context (losing the isolation benefit) and the lead's full authority (creating a confused deputy at scale — Chapter 5, Topic 10). **A subagent with the orchestrator's authority is a subagent that can do anything the orchestrator can — and a prompt-injected subagent (Chapter 5, Topic 12) then has that authority too.**

**Objective.** Specify role, information, and authority as **three independent, explicitly-set axes**, with the invariant that **a subagent's authority never exceeds its invoker's**.

**Assumptions.** Subagents are model-directed and can be manipulated (Chapter 5, Topic 12). Their output is untrusted (Chapter 5, Topic 2: $g_{\mathrm{det}}=0$).

**Constraints.** Too little information and the subagent cannot do its job; too much and you lose the isolation benefit *and* widen the blast radius.

**Success criteria.** Each agent's three axes are declared; no subagent exceeds its invoker's authority; information given matches the task (least privilege on both context and permissions).

## 3. Intuition first, then formalization

### 3.1 Intuition: three axes, and only one is usually set

**Role** answers *what does this agent do?* — the prompt, the tools, the objective. This is what [OAO] means by specialists that "materially improve capability isolation, policy isolation, prompt clarity, or trace legibility," and what [MAR] means by "give each specialist a narrow job."

**Information** answers *what can this agent see?* This is the axis that *creates the multi-agent benefit*: each subagent gets its own context window (Topic 1, §3.1), and the whole point is that it sees **less** than the lead — a focused slice, not the whole conversation. [OMA] exposes this as a parameter: **`fork_turns` controls "how much context you want to propagate to your sub-agents"** [OMA]. **The default matters enormously: propagate everything, and you have paid 15× for agents that each carry the lead's full window.**

**Authority** answers *what may this agent do, and on whose behalf?* This is the axis that is almost never set, and it is the one with a security consequence. **A subagent invoked to "search the web" should not be able to write to the database — even if the lead can.** [OAO]'s "policy isolation" names this, and Chapter 5, Topic 10's principal scoping is the mechanism.

The intuition that ties them: **role is about *effectiveness*; information is about *efficiency* (the multi-agent benefit); authority is about *safety*.** A system that only sets role has optimized none of the three.

The failure that follows from setting only role: **the subagent is a clone with a different prompt** — same context (no isolation benefit, 15× cost for nothing), same authority (a confused deputy that a prompt injection can weaponize).

### 3.2 Formalization: the three axes and the authority invariant

An agent $a$ is specified by a triple **[synthesis]**:

$$
a = \bigl(\underbrace{R_a}_{\text{role: prompt, tools, objective}},\ \underbrace{I_a}_{\text{information: context scope}},\ \underbrace{A_a}_{\text{authority: permitted actions} \times \text{principal}}\bigr).
$$

**The invariant that makes multi-agent safe, and it is the topic's core [derived from Chapter 5, Topic 10]:**

$$
\textbf{RA-1 (authority does not grow downward):}\quad
A_{\text{subagent}} \;\subseteq\; A_{\text{invoker}}\ \cap\ A_{\text{needed for the task}} .
$$

RA-1 has two clauses and both matter. **A subagent's authority cannot exceed its invoker's** — otherwise delegation is a privilege-escalation primitive. And it cannot exceed **what the task needs** — least privilege, so a "search the web" subagent cannot write to a database even though the lead can.

**RA-1 is the multi-agent form of Chapter 5, Topic 10's confused-deputy fix**, and it is *more* important here, because a multi-agent system has more surfaces: **an injected web page (Chapter 5, Topic 12) reaching a subagent with full lead authority is an injection with the *system's* authority, not the subagent's.** RA-1 is what bounds that.

**The information invariant [derived from Topic 1's mechanism]:**

$$
\textbf{RA-2 (information isolation is the benefit — do not give it away):}\quad
I_{\text{subagent}} \;\subsetneq\; I_{\text{lead}}\quad\text{(strictly less)},\ \text{else the context-isolation benefit is zero.}
$$

RA-2 says: **if a subagent gets the lead's full context, you have paid a full extra loop for no isolation gain.** The whole mechanism (Topic 1, §3.1) is that subagents explore in *fresh, focused* windows. **`fork_turns` propagating everything defeats the architecture** [OMA].

**The role contract — [MAR]'s four fields, generalized:**

$$
R_a = \bigl(\text{objective},\ \text{output format},\ \text{tool guidance},\ \textbf{boundaries}\bigr)
$$

**[MAR]**: lead agents must provide subagents with "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries" [MAR]. **The boundaries field is what prevents duplicate work** (Topic 2's documented 2-of-3 failure) — it is the role's *negative* specification, and it is the one that gets omitted.

### 3.3 Information isolation cuts both ways — and one direction is a security control

Information isolation is usually framed as an *efficiency* property (fresh context windows → the multi-agent benefit). **It is also a security control, and this framing is under-used [synthesis; grounded in Chapter 5, Topic 12 and Chapter 7, Topic 7]:**

**A subagent that cannot see the credentials cannot leak them.** A subagent that cannot see other customers' data cannot cross-contaminate it. **Information isolation is *purpose limitation* (Chapter 7, Topic 7's R-3) applied across agents** — and it means a compromised or injected subagent's blast radius is bounded by *what it could see*, not by what the system knows.

**The composition with RA-1 is what makes a multi-agent system defensible:**
- **RA-1** bounds what a compromised subagent can *do* (authority).
- **RA-2 / information isolation** bounds what it can *see* and therefore *leak* (information).

**Together, an injected subagent is limited to the authority and the information of its narrow role** — which is a far better security posture than a monolithic agent with everything. **This is a genuine security *argument for* multi-agent architecture**, and it is one the performance-focused sources do not make: **decomposition with proper isolation is a blast-radius reduction.**

The converse is the failure: **a multi-agent system that propagates full context and full authority to every subagent has *more* attack surface than a single agent** (more loops to inject, more untrusted output) **with none of the isolation benefit.** That is the worst of both, and it is what you get by default.

## 4. Architecture

```
   THREE INDEPENDENT AXES — most systems set only the first

   ┌── ROLE (R) — effectiveness ─────────────────────────────────────────────┐
   │  [MAR]'s four-field contract:                                            │
   │    objective · output format · tool guidance · BOUNDARIES                │
   │                                            ↑ the negative spec —          │
   │                                              prevents duplicate work      │
   │  [OAO]: "give each specialist a narrow job"                              │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌── INFORMATION (I) — efficiency AND security ────────────────────────────┐
   │  RA-2: I_subagent ⊊ I_lead  (STRICTLY less)                             │
   │    → the multi-agent BENEFIT is the fresh, focused window (T1 §3.1)     │
   │    → [OMA]'s `fork_turns` controls this. Propagate everything and you    │
   │      pay 15× for agents carrying the lead's full context.                │
   │  §3.3: ALSO a security control — a subagent that cannot SEE the          │
   │        credentials cannot LEAK them. (Ch.7 T7's purpose limitation)      │
   └─────────────────────────────────────────────────────────────────────────┘

   ┌── AUTHORITY (A) — safety ──────────────────────────────────────────────┐
   │  RA-1: A_subagent ⊆ A_invoker ∩ A_needed                                │
   │    ↑ authority NEVER grows downward — else delegation is a               │
   │      PRIVILEGE-ESCALATION primitive                                      │
   │    ↑ least privilege: a "search the web" subagent CANNOT write to the DB │
   │      even though the lead can                                            │
   │  ← Ch.5 T10's confused-deputy fix, at the agent boundary                 │
   └─────────────────────────────────────────────────────────────────────────┘

   THE COMPOSITION (§3.3) — why this is a SECURITY argument FOR multi-agent:
     RA-1 bounds what a compromised subagent can DO.
     RA-2 bounds what it can SEE (and therefore LEAK).
     ⇒ an INJECTED subagent is limited to its narrow role's authority + information.

   THE DEFAULT FAILURE: full context + full authority to every subagent
     ⇒ MORE attack surface than a single agent, NONE of the isolation benefit.
```

## 5. Grounding

- **The delegation contract's four fields:** lead agents must provide subagents with **"an objective, an output format, guidance on the tools and sources to use, and clear task boundaries"** [MAR] — the role contract, with boundaries as the anti-duplication clause.
- **Vague roles cause duplication:** "Simple instructions caused… subagents [to] misinterpret the task or performed the exact same searches as other agents" [MAR] — the documented 2-of-3 failure (Topic 2).
- **Specialization is justified by isolation:** specialists are added when they "materially improve **capability isolation, policy isolation**, prompt clarity, or trace legibility" [OAO] — **capability isolation is the information axis; policy isolation is the authority axis.** [OAO] names both.
- **"Give each specialist a narrow job"** [OAO].
- **Context propagation is a parameter:** **`fork_turns` controls "how much context you want to propagate to your sub-agents"** [OMA] — RA-2's control surface, and its default determines whether you get the isolation benefit.
- **Separate contexts are the design:** "Root and subagents maintain separate contexts. Automatic server-side compaction applies independently per agent" [OMA].
- **Separation of concerns is a stated benefit:** "Distinct tools, prompts, and trajectories per agent reduce path dependency and enable independent investigation" [MAR].
- **The confused-deputy fix is the authority mechanism:** Chapter 5, Topic 10 ($\alpha_u(x, s, p)$ takes the acting principal) — RA-1's basis.
- **Purpose limitation:** Chapter 7, Topic 7's R-3 (retrieve only what the purpose needs) — §3.3's information-as-security-control.
- **Subagent output is untrusted:** Chapter 5, Topic 2 ($g_{\mathrm{det}} = 0$) — which is *why* bounding a subagent's authority matters.

**Evidence gap.** The role contract is **[MAR]'s, documented with a failure it prevents**. The information axis is documented as a *parameter* [OMA] and as the *mechanism* [MAR]. **The authority axis is named ([OAO]'s "policy isolation") but not developed by any source** — no source specifies RA-1 or discusses privilege escalation through delegation. **RA-1 and RA-2 are [derived]** (RA-1 from Chapter 5, Topic 10; RA-2 from Topic 1's mechanism). **The security argument for multi-agent (§3.3) is [synthesis]** — it composes documented mechanisms (isolation, confused-deputy) into an argument no source makes, and **no source measures blast-radius reduction from agent isolation.**

## 6. Implementation

**The three axes, declared independently:**

```python
@dataclass(frozen=True)
class AgentSpec:
    """Three INDEPENDENT axes. Most systems set only `role` — and thereby get a clone
    with a different prompt: same context (no benefit), same authority (a security hole)."""

    # ROLE — effectiveness. [MAR]'s four fields.
    role: RoleContract          # objective, output_format, tool_guidance, BOUNDARIES

    # INFORMATION — efficiency AND security (RA-2, §3.3)
    context_scope: ContextScope # what this agent may SEE — strictly less than the lead's

    # AUTHORITY — safety (RA-1)
    authority: Authority        # what it may DO, and on whose behalf
```

**RA-1 — authority never grows downward (the invariant no source states):**

```python
def spawn_subagent(parent: AgentSpec, task: SubagentTask, ctx) -> AgentSpec:
    """RA-1: A_subagent ⊆ A_invoker ∩ A_needed.
    Without this, delegation is a PRIVILEGE-ESCALATION primitive, and an injected
    subagent (Ch.5 T12) acts with the LEAD's authority, not its own."""

    needed = authority_required_for(task)
    child_authority = parent.authority & needed          # intersection — both clauses

    if not child_authority <= parent.authority:          # defensive; should be impossible
        raise AuthorityEscalation(
            f"subagent authority {child_authority} exceeds parent {parent.authority}. "
            f"Delegation must NEVER grow authority (RA-1)."
        )

    return AgentSpec(
        role=task.role_contract,
        context_scope=fork_context(parent.context_scope, task),   # RA-2 — strictly less
        authority=child_authority.on_behalf_of(ctx.acting_principal),   # Ch.5 T10
    )
```

**RA-2 — information isolation is the benefit; do not give it away:**

```python
def fork_context(parent_scope: ContextScope, task: SubagentTask) -> ContextScope:
    """RA-2: the subagent gets STRICTLY LESS context — a focused slice, not the whole
    conversation. [OMA]'s `fork_turns` is this control. Propagating everything means
    paying 15× for agents that each carry the lead's full window (Topic 1's benefit, GONE).

    §3.3: this is ALSO a security control — what the subagent cannot SEE, it cannot LEAK."""
    scope = ContextScope(
        turns=parent_scope.recent_turns(n=task.context_turns_needed),   # `fork_turns`
        documents=[d for d in parent_scope.documents if task.needs(d)],  # purpose-limited
        credentials=[],            # ← subagents get NO credentials unless the task needs them
    )
    assert scope < parent_scope, "RA-2 VIOLATED: subagent context is not strictly smaller"
    return scope
```

**The role contract with the boundaries field ([MAR]):**

```python
@dataclass(frozen=True)
class RoleContract:
    objective: str
    output_format: str
    tool_guidance: str
    boundaries: str        # ← [MAR]'s anti-duplication clause: what NOT to do

    def __post_init__(self):
        if not self.boundaries:
            raise ValueError(
                "[MAR]: without 'clear task boundaries', subagents 'perform the exact same "
                "searches as other agents' — the documented 2-of-3 duplication failure."
            )
```

## 7. Trade-offs

| Axis | Set it tightly | Set it loosely |
|---|---|---|
| **Role** | Focus; no duplication [MAR] | Vague → subagents duplicate or misinterpret |
| **Information** | **The multi-agent benefit** (fresh windows); smaller blast radius | **No isolation benefit** (15× for nothing); larger leak surface |
| **Authority** | **Bounded blast radius**; injection is contained | **Privilege escalation**; an injected subagent acts with the lead's authority |

**The trade on information is the one with a real tension.** Too little context and the subagent cannot do its job — it will ask, guess, or fail. Too much and you lose the isolation benefit (Topic 1's mechanism) *and* widen the leak surface (§3.3). **[MAR]'s delegation contract is the resolution: give the subagent exactly what its *objective* requires, specified explicitly** — not "the conversation so far," which is the lazy default that `fork_turns` makes easy.

**The authority axis has no tension — set it tightly, always.** There is no benefit to giving a subagent more authority than its task needs. **RA-1 costs nothing and prevents privilege escalation through delegation.** The only reason it is usually absent is that nobody thought to set it — the framework propagates the parent's credentials by default, and the default is wrong.

**And the composition (§3.3) is the argument for multi-agent that the performance literature misses:** a properly-isolated multi-agent system has a *smaller* blast radius than a monolithic agent, because each component sees less and can do less. **Decomposition is a security architecture, if you set the axes.** Without them, it is the opposite — more surfaces, more untrusted outputs, no containment.

## 8. Experiments

**The privilege-escalation test (RA-1) — the security test no source describes.** Give a subagent a task requiring narrow authority (search the web). **Attempt to make it perform an action only the lead should be able to do** (write to the database) — via a crafted task, or via an injected instruction in a web page it fetches (Chapter 5, Topic 12).

- **With RA-1:** the action is refused — the subagent's authority does not include it.
- **Without RA-1:** the subagent has the lead's authority and the action succeeds.

**Report escalation count with the zero-failure bound; the target is exactly zero** (Chapter 1, Topic 12). **This test finds a real vulnerability in most multi-agent systems**, because subagents almost always inherit the parent's credentials.

**The information-isolation ablation (RA-2).** Vary `fork_turns` / context propagation from *none* to *full*. Measure: **subagent token cost, task completion, and — the point — whether the multi-agent benefit survives.** **Prediction: full propagation eliminates the benefit** (each subagent carries the lead's window, so no fresh-context gain) **while retaining the full cost.** This demonstrates that RA-2 is not hygiene but the mechanism.

**The leak test (§3.3).** Put a credential/secret in the lead's context. **Can a subagent leak it?** With isolation, it cannot see it. Without, it can. **Measure leak rate across injected subagents.**

**The boundaries ablation** (Topic 2's, repeated here at the role level). Role contract with vs without the `boundaries` field. **Measure duplicate-work rate** — [MAR]'s documented failure.

**Statistics.** Zero-failure bounds on escalation and leak (targets zero); Wilson on duplicate-work rate; paired completion comparison across `fork_turns` settings (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Subagents inherit the lead's authority.** Delegation becomes a privilege-escalation primitive; an injected subagent acts with the system's full authority. **The security failure, and it is the default.** Mitigation: RA-1 — intersect with what the task needs.
- **Subagents inherit the lead's full context.** No isolation benefit (Topic 1's mechanism gone), 15× cost retained, larger leak surface. Mitigation: RA-2; `fork_turns` set deliberately.
- **Role differentiation only.** A clone with a different prompt. Mitigation: set all three axes.
- **Missing boundaries in the role contract.** Subagents duplicate work — [MAR]'s 2-of-3 failure. Mitigation: the `boundaries` field is required (§6).
- **Credentials propagated to subagents by default.** The framework passes the parent's credentials; the subagent can now do anything the lead can. Mitigation: subagents get **no** credentials unless the task requires them (§6).
- **A subagent that cannot do its job.** Over-tight information isolation. Mitigation: give what the *objective* requires, explicitly — the delegation contract is the specification.
- **Untrusted subagent output treated as authoritative.** Chapter 5, Topic 2's $g_{\mathrm{det}}=0$. Mitigation: subagent results are proposals; verify.
- **Edge case — a subagent that legitimately needs elevated authority.** A "deploy" subagent needs write access the lead may not have. **RA-1 forbids this** — and correctly: the authority must come from the *invoking principal*, not be conjured by the subagent. If the deploy authority is legitimate, the *principal* must have it, and RA-1 will then permit it.
- **Edge case — the lead needs the subagent's findings but not its raw context.** This is the *intended* design ([ECE]'s distillation, Chapter 6, Topic 11): the subagent explores widely and returns a summary. **Information flows *up* as a distillation, not as raw context.**
- **Open limitation.** **The authority axis is named ([OAO]'s "policy isolation") but developed by no source.** RA-1 and RA-2 are **[derived]** from Chapter 5, Topic 10 and Topic 1's mechanism. **The security argument for multi-agent (§3.3) is [synthesis]** — no source makes it, and **no source measures blast-radius reduction from agent isolation.** §8's tests are local.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. The delegation contract requires **"an objective, an output format, guidance on the tools and sources to use, and clear task boundaries"** [MAR].
2. Vague roles cause subagents to "perform the exact same searches as other agents" [MAR].
3. Specialists are justified by **"capability isolation, policy isolation,** prompt clarity, or trace legibility" [OAO] — **the information and authority axes, named.**
4. **`fork_turns` controls "how much context you want to propagate to your sub-agents"** [OMA]; root and subagents "maintain separate contexts" [OMA].
5. "Distinct tools, prompts, and trajectories per agent reduce path dependency and enable independent investigation" [MAR].
6. Subagent output is model-generated and untrusted (Chapter 5, Topic 2).
7. **No source develops the authority axis or measures isolation's security benefit.**

**Decision rules.**
- **Set all three axes** — role, information, authority — independently and explicitly.
- **Authority never grows downward** (RA-1): $A_{\text{sub}} \subseteq A_{\text{invoker}} \cap A_{\text{needed}}$.
- **Subagents get no credentials unless the task requires them** — the framework's default is wrong.
- **Information given must be strictly less than the lead's** (RA-2) — or the multi-agent benefit is zero and you paid 15× for it.
- **The role contract's `boundaries` field is required** [MAR] — it is what prevents duplication.
- **Information isolation is a security control, not just an efficiency one** (§3.3).

**Production implications.**
1. Run the privilege-escalation test (§8); most multi-agent systems fail it, because subagents inherit the parent's credentials by default.
2. Check your `fork_turns` / context-propagation default; if it propagates everything, you are paying the multi-agent cost for none of the benefit.
3. Make `boundaries` a required field in the delegation contract; [MAR]'s duplication failure came from omitting it.
4. Recognize that properly-isolated decomposition *reduces* blast radius — and that un-isolated decomposition *increases* it.

**Connections.** This topic generalizes Topic 2's delegation contract into three axes. RA-1 is Chapter 5, Topic 10's confused-deputy fix at the agent boundary, and it is what Topic 13 must propagate across *remote* agents. RA-2 is Topic 1's mechanism and Topic 6's shared-vs-private context, which develops it. The security composition (§3.3) is Chapter 5, Topic 12's blast-radius bounding, at the multi-agent layer, and Chapter 12 supplies the adversary. Topic 4 arranges these roles into a topology.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — the delegation contract ("an objective, an output format, guidance on the tools and sources to use, and clear task boundaries"); the duplication failure from vague instructions ("subagents misinterpreted the task or performed the exact same searches as other agents"); "Distinct tools, prompts, and trajectories per agent reduce path dependency and enable independent investigation" — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — **`fork_turns` controls "how much context you want to propagate to your sub-agents"**; "Root and subagents maintain separate contexts. Automatic server-side compaction applies independently per agent" — https://developers.openai.com/api/docs/guides/responses-multi-agent
[OAO] OpenAI, agent-orchestration guide — specialists justified by "**capability isolation, policy isolation**, prompt clarity, or trace legibility"; "Give each specialist a narrow job" — https://developers.openai.com/api/docs/guides/agents/orchestration
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — permissions depending on "arguments, environment state, data sensitivity, and expected side effects"; the basis for authority scoping across agents
