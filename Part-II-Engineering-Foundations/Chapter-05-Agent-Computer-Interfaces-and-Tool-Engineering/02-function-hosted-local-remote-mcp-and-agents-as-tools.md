# Topic 2 — Function Tools, Hosted Tools, Local Tools, Remote Tools, MCP Tools, and Agents-as-Tools

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The tool-type taxonomy, organized by the two questions that actually change your engineering: **who executes** ($e_u$) and **who determines the result's trustworthiness** ($\phi_u$). This topic populates $e_u$ and pre-loads Topic 12's trust classification.

**Prerequisites.** Topic 1 (the contract tuple); Chapter 4, Topic 5 (client- vs server-executed tools on the Anthropic surface); Chapter 4, Topic 1 (the harness/deployment axes — this topic is their per-tool analogue).

**Terminology.** *Function tool*: a function in your process, schema-extracted from its signature [ADK-T]. *Hosted / server-side tool*: executed by the provider; you never see the call [ANT-API]. *Remote tool*: executed over a network boundary you own. *MCP tool*: supplied by a Model Context Protocol server, typically third-party. *Agent-as-tool*: a sub-agent wrapped so a parent may invoke it [ADK-T; OAP].

**Boundaries.** Inside: execution placement, its consequences for control, cost, and trust. Outside: the MCP wire protocol; multi-agent topology (Chapters 8–9) — agents-as-tools appears here only as a *type with a cost profile*.

**Exclusions.** No product catalogue.

**Outcomes.** The reader can place any tool in the taxonomy, state which enforcement points they retain for it, and refuse a tool type whose control properties do not match its effect class.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The six labels above are usually treated as deployment trivia — "where does the code run?" They are not. Execution placement determines **which of Topic 1's enforcement fields you can still enforce.** A hosted tool executes without passing through your $\operatorname{Admit}$ stage: your $\alpha_u$ never runs. An MCP tool's $d_u$ is written by someone else: your policy is conditioned on a string you did not author. An agent-as-tool returns a result produced by a *second stochastic policy*: your $\phi_u$ cannot claim determinism.

**Bottleneck.** Teams choose tool types by convenience (a hosted tool is one config line; an MCP server is one install) and discover the control consequences after an incident.

**Objective.** A decision rule that binds tool type to effect class: **the more dangerous the effect $\chi_u$, the more of the enforcement chain you must retain**, which constrains $e_u$.

**Assumptions.** You own $\operatorname{Admit}$ only for calls that traverse it. Providers execute hosted tools per their own contracts.

**Constraints.** Some capabilities exist *only* as hosted tools. Some tool inventories arrive wholesale via MCP.

**Success criteria.** No irreversible write executes through a path where your authorization predicate cannot run.

## 3. Intuition first, then formalization

### 3.1 Intuition

Ask one question of any tool: **"If the model proposes this call and my policy would forbid it, does my code get to say no?"**

For a client-executed function tool, yes: the call comes back to you as a `tool_use` block, you run $\alpha_u$, and you may return `is_error` instead of executing (Chapter 4's I3–I4). For a provider-hosted tool, **no** — the provider executes it inside the turn and hands you a result. You did not gate it because you were never asked.

That is the whole taxonomy. Everything else is detail.

The second question, close behind: **"Who wrote the string my model is conditioning on, and who wrote the bytes coming back?"** For a function tool: you, and your system. For an MCP tool from a third party: them, and possibly the open internet. For an agent-as-tool: you wrote the sub-agent's config, but a *model* wrote the bytes coming back — which means the result is a proposal, not an observation.

### 3.2 Formalization: the control-retention vector

For tool $u$ let

$$
\mathrm{ctl}(u)=\bigl(g_{\mathrm{adm}},\ g_{\mathrm{desc}},\ g_{\mathrm{res}},\ g_{\mathrm{det}}\bigr)\in\{0,1\}^4
$$

be the **control-retention vector**: $g_{\mathrm{adm}}=1$ iff your $\operatorname{Admit}$ stage sees the call before execution; $g_{\mathrm{desc}}=1$ iff you author $d_u$; $g_{\mathrm{res}}=1$ iff you can inspect and reshape the result before it enters $c_{t+1}$; $g_{\mathrm{det}}=1$ iff the executor is deterministic given its arguments. **[synthesis]**

| Tool type | $g_{\mathrm{adm}}$ | $g_{\mathrm{desc}}$ | $g_{\mathrm{res}}$ | $g_{\mathrm{det}}$ | Source for the execution semantics |
|---|:--:|:--:|:--:|:--:|---|
| **Function tool** (in-process) | 1 | 1 | 1 | 1 | Schema extracted from signature, docstring, type hints [ADK-T] |
| **Remote tool** (your service) | 1 | 1 | 1 | 1 | Same contract; network is an availability concern, not a control one |
| **Hosted / server-side tool** | **0** | 0 | ~ | 1 | Provider executes within the turn; you receive results, not calls [ANT-API] |
| **MCP tool** (third-party server) | 1 | **0** | 1 | 1 | You still dispatch; but $d_u$ and the bytes are theirs. Annotations are advisory only |
| **Agent-as-tool** | 1 | 1 | 1 | **0** | Wrapped sub-agent [ADK-T; OAP]; result is model-generated |
| **Code execution** (Topic 8) | ~ | 1 | 1 | 1 | You gate the *sandbox*, not each inner call [CXM] |

The governing invariant, and the topic's single rule:

$$
\chi_u=\textsf{WRITE\_IRREVERSIBLE}\ \Longrightarrow\ g_{\mathrm{adm}}(u)=1 .
$$

**[derived]** An irreversible write must traverse a stage where your code can refuse it. This forbids executing irreversible writes as hosted tools whose invocation you never see, and it forbids handing an agent-as-tool an irreversible write it can trigger without a parent-side gate. The rule is not a preference; violating it means your authorization policy is, in the literal sense, not running.

## 4. Architecture: components, responsibilities, interfaces, flow

```
                        ┌─ function tool ──► your code ──► your system         [full control]
                        │
                        ├─ remote tool ────► HTTP ──► your service             [full control]
  Admit ──► Dispatch ───┤
   (α_u)                ├─ MCP tool ───────► MCP server (3rd party)      [d_u & bytes: theirs]
                        │
                        └─ agent-as-tool ──► sub-agent loop (π_M again)  [result is a proposal]

  ┌─────────────────────────────────────────────────────────────────────┐
  │ hosted tool: provider executes INSIDE the turn.                     │
  │ Your Admit stage is never invoked. You see the result, not the call.│
  └─────────────────────────────────────────────────────────────────────┘
```

**Responsibilities by type.**

- **Function tools.** You own everything. ADK generates the schema by inspecting the signature: name, parameters, type hints, defaults, and the docstring, which "serves as the tool description sent to the LLM" [ADK-T]. This is ergonomic and it is a trap: **it means an engineer editing a docstring is editing the policy** (Topic 1, §3.3) with no review gate and no surface-hash bump unless you build one.
- **Hosted tools.** You own the *decision to enable them* and nothing else per call. The mitigation is not a gate but a *choice*: enable hosted tools whose effect class is read-only, and read their result-trust contract carefully (Chapter 4, Topic 5's server-tool security contracts).
- **MCP tools.** You own dispatch and result handling; you do **not** own $d_u$. Consequences: the imported description is a policy input you did not write (Topic 4), a potential attack surface (Topic 14), and a context cost you did not budget (Topic 6). MCP tool annotations describing destructiveness are **advisory metadata, not enforcement** — an annotation is a claim by the server, and a hostile or buggy server can lie. Never let an annotation stand in for $\alpha_u$.
- **Agents-as-tools.** ADK exposes this as `AgentTool` and distinguishes it from sub-agent transfer [ADK-T]; the OpenAI Agents SDK exposes agents-as-tools alongside handoffs [OAP]. The decision rule from Chapter 4, Topic 3 carries over: **agent-as-tool when the parent must retain control and consume the result; handoff/transfer when the child should own the remainder of the task.** The engineering consequence unique to this chapter is $g_{\mathrm{det}}=0$: the sub-agent's output is a *proposal* with all of Chapter 2's failure propensities (unsupported completion claims, premature stopping [FSC §6.3.5, §6.4.1.4]). A parent that treats a sub-agent's "done" as an observation has imported the exact error Chapter 3, Topic 8 forbids.

**Data flow consequence.** Tools with $g_{\mathrm{res}}=1$ can have their results budgeted, filtered, and provenance-wrapped (Topics 7, 12). Tools with $g_{\mathrm{res}}=0$ or `~` inject bytes into your context on the provider's terms. That is a context-budget hole and an injection surface at once.

## 5. Grounding: primary sources and evidence

- **Function-tool schema extraction from signatures** — name, parameters with type hints, defaults determining optionality, and the docstring as description — is documented [ADK-T], including that "a parameter is considered required if it has a type hint but no default value," and that variadic parameters (`*args`, `**kwargs`) are "ignored by the ADK framework when generating the tool schema for the LLM."
- **The four functional classes** — function-oriented, environment-interaction, verification-driven, and workflow-orchestration tool use — are the survey's taxonomy [CAH §3.3]. They are *orthogonal* to this topic's placement axis: a verification-driven tool (a test runner) may be a function tool or a sandboxed code execution. The survey's own summary of the trajectory is worth quoting because it is the argument for this chapter's existence: tool use "has evolved from isolated API retrieval to a full harness mechanism for action, observation, verification, and governance" [CAH §3.3].
- **Workflow-orchestration tool use** is where the survey lands the control point: "The challenge is not simply adding more tools, but deciding when each tool should be invoked, with what permissions, under which context, and how its result should update the harness state" [CAH §3.3.4]. It further documents that "pre-use hooks can validate arguments, enforce permission policies, or block risky commands, while post-use hooks can sanitize outputs, compact logs, update memory, or trigger follow-up verification" [CAH §3.3.4] — which is precisely the $g_{\mathrm{adm}}$ / $g_{\mathrm{res}}$ pair of §3.2, independently arrived at.
- **Client- vs server-executed tools** and their differing security contracts are documented on the Anthropic surface [ANT-API] (Chapter 4, Topic 5).
- **Agent-as-tool** as a distinct primitive from transfer/handoff: [ADK-T] (`AgentTool`, "key difference from sub-agents"), [OAP] (agents-as-tools alongside handoffs).

**Evidence gap, named.** No source measures the reliability difference between the six types. The control-retention vector is a *derivation from documented execution semantics*, not a measured finding. Its value is that it makes an unmeasured risk *visible* and assignable, not that it quantifies one.

## 6. Implementation

**The gate that enforces §3.2's invariant**, run at registry construction, not at call time:

```python
HOSTED_TYPES = {"provider_hosted"}          # Admit stage never sees these
NONDET_TYPES = {"agent_as_tool"}            # result is a proposal, not an observation

def validate_placement(t: ToolContract) -> None:
    if t.effect is Effect.WRITE_IRREVERSIBLE and t.executor in HOSTED_TYPES:
        raise ValueError(
            f"{t.name}: irreversible write via hosted executor — your α_u cannot run"
        )
    if t.executor in NONDET_TYPES and t.trust is Trust.TRUSTED:
        raise ValueError(
            f"{t.name}: agent-as-tool output is model-generated; it is UNTRUSTED "
            f"by construction (g_det = 0). A sub-agent's 'done' is a claim, not evidence."
        )
```

**MCP import discipline.** An MCP server is not a dependency; it is *forty edits to your policy input, authored by a third party*. Treat the import as a code review:

```python
def import_mcp(server, allowlist: set[str]) -> list[ToolContract]:
    imported = []
    for spec in server.list_tools():
        if spec.name not in allowlist:
            continue                        # default-deny; no wholesale imports
        imported.append(ToolContract(
            name=f"{server.ns}__{spec.name}",       # namespace it — Topic 6
            description=spec.description,           # NOT yours: review it — Topic 14
            input_schema=spec.input_schema,
            effect=classify_effect(spec),           # YOUR classification, not their annotation
            authorize=policy_for(server.ns, spec),  # YOUR α_u
            trust=Trust.UNTRUSTED,                  # bytes from a system you don't own
            ...
        ))
    return imported
```

Two lines carry the weight. `classify_effect(spec)` — **you** classify the effect, because the server's annotation is advisory and a wrong or hostile one would otherwise route an irreversible write down the read path. And `Trust.UNTRUSTED` — set unconditionally, because the result bytes come from a system you do not control (Topic 12).

**Agent-as-tool wrapping** must preserve budget and terminal semantics across the boundary:

```python
def as_tool(agent, *, budget: Budget, name: str, description: str) -> ToolContract:
    def call(args, ctx):
        result, kappa = agent.run(args["task"], budget=budget)   # child budget is BOUNDED
        return {
            "status": "success" if kappa == "success" else "incomplete",
            "kappa": kappa,          # surface the child's terminal — never swallow it
            "content": result,
        }, (kappa in FAILED_KAPPA)
    ...
```

The child's $\kappa$ must cross the boundary. A wrapper that returns only content has converted a `budget` termination into a silent success — the exact terminal-collapse failure Chapter 4, Topic 14 built the totality rule to prevent, reappearing one level down.

## 7. Trade-offs

| Type | Latency | Context cost | Control | Trust | When it is the right answer |
|---|---|---|---|---|---|
| Function | Lowest | You control | Full | Trusted | Default. Anything with a write effect. |
| Remote | + network | You control | Full | Trusted | Shared capability across agents; scaling |
| Hosted | Lowest (no round trip out) | Provider-shaped | **None per call** | Provider's contract | Read-only capabilities you cannot build (search, retrieval) |
| MCP | + IPC/network | **Unbudgeted by default** | Dispatch only | **Untrusted** | Ecosystem reach — with an allowlist and a namespace |
| Agent-as-tool | **Highest** (a whole loop) | High (child's context, plus its result) | Full, but $g_{\mathrm{det}}=0$ | **Untrusted** | Genuine sub-problems needing autonomy; never for a deterministic transform |
| Code execution | Sandbox startup | **Lowest at scale** (Topic 8) | Sandbox-level | Depends on inputs | Large tool surfaces; chained calls with big intermediates |

**The trade nobody prices.** Agents-as-tools are the most expensive tool type on every axis — a full model loop, a second context, a nondeterministic result — and the easiest to add (a single wrapper call). This asymmetry is why systems accumulate sub-agents that should have been functions. **A sub-agent whose job is deterministic is a function with a latency bill and an error rate.** [CAH §3.3.4]'s framing applies: the question is not whether you *can* orchestrate, but whether the orchestration earns its permissions and its context.

## 8. Experiments

**Ablation A — placement.** For a capability available both as a hosted tool and as a function tool, run both arms paired: same tasks, same model. Metrics: completion $G$, latency, cost, and **critical-violation count** $V$ (Chapter 1's vector). The hypothesis worth falsifying is that the hosted path is strictly better on latency and strictly worse on $V$, because $\alpha_u$ never ran.

**Ablation B — agent-as-tool vs function.** For any sub-agent performing a task with a deterministic reference implementation, run both. Report $G$, $\Pr(Z_r)$ (did the parent correctly interpret the child's result), latency, and cost. **Acceptance rule:** if the sub-agent does not beat the function on $G$ by more than the clustered-bootstrap interval, it is a latency bill with an error rate; delete it.

**Ablation C — MCP surface cost.** Import an MCP server; measure the token delta in $\operatorname{Assemble}$ and the change in tool-choice accuracy $\Pr(Z_s)$ on tasks *that do not need the new tools*. This is Topic 15's experiment in miniature, and it is the one that most often surprises teams.

**Statistics.** Paired; McNemar on completion; clustered bootstrap for intervals; Holm across arms (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Irreversible write behind a hosted tool.** Your $\alpha_u$ never runs. Mitigation: §6's placement gate; if the capability exists only as hosted, wrap the *effect* behind a function tool you do control.
- **MCP annotation trusted as enforcement.** A `readOnly` annotation is a *claim by the server*. Mitigation: classify effects yourself; default-deny import.
- **MCP wholesale import.** Forty tools, forty descriptions, no review, unbudgeted context. Mitigation: allowlist; namespace; budget (Topic 6).
- **Sub-agent's $\kappa$ swallowed.** A child that hit `budget` reported to the parent as success. Mitigation: §6's wrapper — surface $\kappa$ across the boundary.
- **Sub-agent result treated as evidence.** The parent believes the child's "I verified it." This is Chapter 2's false-completion propensity [FSC §6.3.5] crossing a tool boundary and arriving dressed as a tool result — which is *worse*, because tool results carry an implicit authority that model text does not. Mitigation: $g_{\mathrm{det}}=0 \Rightarrow$ `Trust.UNTRUSTED`; verify with a deterministic sensor (Chapter 3, Topic 7).
- **Docstring-as-policy with no review.** ADK's ergonomic schema extraction [ADK-T] means `git blame` on a docstring is a policy change log nobody reads. Mitigation: surface hash (Topic 1, §6) in CI.
- **Edge case — hosted tools with hidden context cost.** A hosted tool's results enter your context on the provider's terms and may be large; your budget did not account for them.
- **Open limitation.** The control-retention vector is derived from documented execution semantics, not measured. Providers may change hosted-tool semantics (Chapter 4, Topic 13's silent-change classes), and the vector must be re-derived when they do.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Tool use has moved from API retrieval to "a full harness mechanism for action, observation, verification, and governance" [CAH §3.3].
2. The governing question is "when each tool should be invoked, with what permissions, under which context, and how its result should update the harness state" [CAH §3.3.4] — all four of which are determined by execution placement.
3. Hosted execution removes your admission gate; MCP removes your authorship of $d_u$; agents-as-tools remove determinism **[derived from documented semantics]**.

**Decision rules.**
- **Irreversible write ⇒ your code must be able to refuse it.** This forbids hosted execution for such tools, without exception.
- **Third-party tool ⇒ untrusted output and un-authored description.** Allowlist, namespace, re-classify, re-review.
- **Sub-agent output ⇒ a proposal, not an observation.** It needs verification exactly as model text does.
- **Deterministic job ⇒ function tool.** If a sub-agent's task has a reference implementation, the sub-agent is overhead.

**Production implications.**
1. Run §6's `validate_placement` in CI. It is the cheapest control in this chapter.
2. Give every MCP import an allowlist, a namespace, and an owner — the import is a policy change, not a dependency bump.
3. Make $\kappa$ cross every agent-as-tool boundary.
4. Budget hosted-tool results explicitly; they are context you do not control.

**Connections.** $e_u$ feeds Topic 5's effect classification and Topic 10's enforcement points; MCP's un-authored $d_u$ is Topic 4's affordance problem and Topic 14's attack surface; MCP's context cost is Topic 6's and Topic 8's central problem; agents-as-tools return in Chapter 8 as an orchestration pattern, where the *topology* questions this topic deliberately deferred are answered.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3 (four tool classes; "evolved from isolated API retrieval to a full harness mechanism for action, observation, verification, and governance"), §3.3.4 ("the challenge is not simply adding more tools, but deciding when each tool should be invoked, with what permissions, under which context, and how its result should update the harness state"; pre-use and post-use hooks)
[ADK-T] Google ADK custom tools — schema extraction from signature, type hints, defaults, and docstring; required-parameter rule; `*args`/`**kwargs` ignored; `LongRunningFunctionTool`; `AgentTool` and its distinction from sub-agents — https://adk.dev/tools-custom/function-tools/
[ANT-API] Anthropic Claude API reference — client- vs server-executed tools and their separate security contracts (platform.claude.com docs, cache 2026-06)
[OAP] OpenAI Agents SDK for Python — agents-as-tools alongside handoffs — https://github.com/openai/openai-agents-python
[CXM] Anthropic, "Code execution with MCP" — code execution as an alternative to direct tool exposure — https://www.anthropic.com/engineering/code-execution-with-mcp
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — unsupported completion claims; the propensity a sub-agent's result inherits — `Knowledge_source/`
