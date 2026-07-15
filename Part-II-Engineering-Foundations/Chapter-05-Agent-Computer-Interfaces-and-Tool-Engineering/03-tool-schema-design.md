# Topic 3 — Tool Schema Design: Names, Descriptions, Argument Boundaries, Enums, Defaults, and Validation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The design of $n_u$, $d_u$, and $\Sigma^{\mathrm{in}}_u$ — the three fields the model actually reads. This is the highest-leverage and least-reviewed surface in an agent system.

**Prerequisites.** Topic 1 (descriptions are policy inputs, not comments); Chapter 2, Topic 5 (selection as a conditional distribution); Chapter 2, Topic 7 (structured outputs and constrained decoding).

**Terminology.** *Argument boundary*: the constraint set on $\Sigma^{\mathrm{in}}_u$ that makes an invalid call unrepresentable rather than merely wrong. *Validation*: the check that runs when the boundary is nonetheless crossed.

**Boundaries.** Inside: naming, description authoring, argument typing, enums, defaults, required sets, validation, and the error text returned on failure. Outside: *whether the model can tell to call it at all* — that is affordance (Topic 4), and it depends on this topic without being reducible to it.

**Exclusions.** No JSON Schema tutorial. No provider-specific structured-output flags (Chapter 2, Topic 7; Chapter 4, Topic 5).

**Outcomes.** The reader can write a schema in which the common invalid calls are *unrepresentable*, and in which the residual invalid calls produce an error that repairs the next attempt.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The schema serves two consumers with incompatible instincts. **Your code** wants a schema that validates: precise types, tight bounds, a small required set. **The model** wants a schema it can *fill in from context*: unambiguous names, explicit semantics, enumerated choices rather than free strings. A schema optimized for the first and neglectful of the second produces $\Pr(Z_a\mid Z_s)$ collapse — the model picks the right tool and cannot construct its arguments.

**Bottleneck.** The failure is invisible in the usual telemetry. A model that emits a malformed call, receives a validation error, and retries successfully looks *fine* in an accuracy metric while burning two extra model calls and a chunk of context. It is a latency and cost leak that reports as success. [WTA]'s metric list exists to catch exactly this: it tracks "tool errors" and "total number of tool calls" as first-class quantities, not just "top-level accuracy."

**Objective.** Schemas in which (i) the argument the model must produce is *derivable from the context it has*, (ii) invalid arguments are structurally unrepresentable where possible, and (iii) where impossible, the validation error is a repair instruction.

**Assumptions.** The model constructs arguments by conditioning on names, descriptions, types, and enums. It has not read your source.

**Constraints.** Every character of $d_u$ and $\Sigma^{\mathrm{in}}_u$ costs context, on every turn, for every tool visible (Topic 6). Description quality and description length trade against each other.

**Success criteria.** $\Pr(Z_a\mid Z_s)$ measured (Topic 13) and above threshold; tool-error rate low; no repair loops in traces.

## 3. Intuition first, then formalization

### 3.1 Intuition: write it for a new hire, then delete what they'd already know

[WTA] gives the authoring frame, and it is the best one available: "Think of how you would describe your tool to a new hire on your team. Consider the context that you might implicitly bring—specialized query formats, definitions of niche terminology, relationships between underlying resources—and make it explicit."

The instruction is *make the implicit explicit*, and its force comes from a fact about your own expertise: the things you would not think to say are exactly the things that are missing. You know that `status` accepts only the four values your enum defines. You know `project_id` is the Asana GID and not the URL slug. You know that `since` is exclusive. The model knows none of it, and it will guess — plausibly, fluently, and wrongly.

The naming rule follows the same logic and is stated flatly: "Input parameters should be unambiguously named: instead of a parameter named `user`, try a parameter named `user_id`" [WTA]. `user` invites a name, an email, an object, or an ID. `user_id` invites an ID. The parameter name is a *constraint communicated in the only channel the model reads*.

And the counter-instinct, which is where API reflexes actively hurt: **stop passing opaque identifiers.** [WTA] reports that "merely resolving arbitrary alphanumeric UUIDs to more semantically meaningful and interpretable language (or even a 0-indexed ID scheme) significantly improves Claude's precision in retrieval tasks by reducing hallucinations." A UUID is a token sequence with no semantic content: the model cannot *reason* about it, cannot check it against context, and cannot notice when it has produced one that does not exist. It can only copy it — and when it cannot find one to copy, it will synthesize one that looks right. **Hallucinated identifiers are a schema-design failure, not a model failure.**

### 3.2 Formalization: the representable-invalid set

Let $A_u$ be the set of argument objects the schema *permits* and $A^\star_u\subseteq A_u$ the set that is *semantically valid* for the current state. Define the **representable-invalid set**

$$
I_u \;=\; A_u\setminus A^\star_u .
$$

Every element of $I_u$ is a call the model can emit, the schema will accept, and the system must then reject at validation time — costing a turn, a context chunk, and a chance to confuse the model.

Schema design is the minimization of $|I_u|$ *subject to* keeping $A^\star_u$ reachable:

$$
\min_{\Sigma^{\mathrm{in}}_u}\ \Pr\bigl(\xi_t\in I_u\bigr)
\qquad\text{s.t.}\qquad
A^\star_u\subseteq A_u .
$$

**[derived]** Three levers reduce $|I_u|$, in descending order of power:

1. **Enums instead of strings.** A free-text `status` has $|I_u|$ effectively unbounded; `enum: ["open","closed","pending"]` makes every invalid status *unrepresentable*. This is the single highest-return schema edit available, and it is the one most often skipped because "we validate it anyway." Validation is a *recovery* mechanism; the enum is a *prevention* mechanism, and prevention is a turn cheaper.
2. **Types and bounds.** `integer, minimum: 1, maximum: 100` beats `number`. Constrained decoding (Chapter 2, Topic 7) can enforce these *during generation* on providers that support strict schemas — moving them from "checked after" to "impossible to emit."
3. **Defaults and a minimal required set.** Every required parameter is a chance to fail. [ADK-T]'s rule is mechanical and useful: "A parameter is considered required if it has a type hint but no default value" — so a default is not merely a convenience, it *removes a member from the required set* and with it a failure mode.

The trap in the other direction: shrinking $A_u$ below $A^\star_u$ makes valid calls unrepresentable, and the model — unable to express what it needs — will do something worse than fail. It will pick the nearest representable call. **A too-tight enum does not produce an error; it produces a wrong action that validates.**

### 3.3 The parameter-count rule

[ADK-T] states three principles for function tools: "Fewer Parameters are Better," "Simple Data Types" preferred over custom classes, and "Meaningful Names" that "significantly influence LLM interpretation."

The first has a mechanism worth making explicit. Each parameter is an independent opportunity for the model to err, and the errors do not cancel. If $p_i$ is the probability of getting parameter $i$ right given correct selection, then under a working independence assumption

$$
\Pr(Z_a\mid Z_s)\ \approx\ \prod_{i=1}^{m}p_i ,
$$

which decays geometrically in the parameter count $m$. **[derived — independence is an approximation, and a generous one: correlated confusions (getting the resource wrong makes every ID wrong) make the real product worse, not better.]** Six parameters at $p_i=0.97$ each is $0.83$. This is the argument-side analogue of Chapter 1's error-accumulation result, and it is why a tool with a dozen optional parameters is a tool that will be called wrong.

## 4. Architecture: components, responsibilities, flow

```
   d_u (description)  ─┐
   n_u (name)          ├─► [ CONTEXT ] ─► π_M ─► ξ_t (candidate call)
   Σin_u (schema)     ─┘                              │
                                                      ▼
                                        ┌── structural validation (schema) ──┐
                                        │   fails ⇒ tool_result(is_error)    │
                                        │           WITH REPAIR TEXT ────────┼──► back to context
                                        └────────────────────────────────────┘
                                                      │ passes
                                                      ▼
                                        semantic validation (state-dependent)
                                                      │
                                                      ▼
                                                   Admit (α_u — Topic 10)
```

**Two validation layers, deliberately separated.** *Structural* validation is schema conformance — types, enums, required fields — and is state-independent. *Semantic* validation is state-dependent (does this `project_id` exist; is this `since` before `until`) and cannot be expressed in JSON Schema. Both return `is_error: true` results (Chapter 4's I4), never exceptions. The separation matters because the *repair text* differs: a structural failure tells the model what shape to emit; a semantic failure tells it what the world actually contains.

**Where authorization is not.** $\alpha_u$ runs after both, at $\operatorname{Admit}$ (Topic 10). Validation asks "is this call well-formed and coherent?"; authorization asks "is this call *allowed*?" Conflating them produces the classic leak in which a permission denial is phrased as a validation error and tells the attacker the resource exists.

## 5. Grounding

- **Parameter naming.** "Input parameters should be unambiguously named: instead of a parameter named `user`, try a parameter named `user_id`" [WTA].
- **Description authoring.** The new-hire frame and the instruction to make implicit context explicit — "specialized query formats, definitions of niche terminology, relationships between underlying resources" [WTA].
- **Identifier semantics.** Resolving UUIDs to "semantically meaningful and interpretable language (or even a 0-indexed ID scheme) significantly improves Claude's precision in retrieval tasks by reducing hallucinations" [WTA]. **Scope: a vendor's internal finding on retrieval tasks, no effect size published.**
- **Description edits move benchmark numbers.** "Claude Sonnet 3.5 achieved state-of-the-art performance on the SWE-bench Verified evaluation after we made precise refinements to tool descriptions, dramatically reducing error rates and improving task completion" [WTA]. **Scope: uncontrolled, vendor-attributed. It establishes that the lever moves; it does not size it.**
- **Schema extraction and parameter discipline.** Name, type hints, defaults, docstring-as-description; "Fewer Parameters are Better"; "Simple Data Types"; "Meaningful Names"; variadics ignored [ADK-T].
- **Return-value discipline** (the output side of the contract, detailed in Topic 7): "Strive to make your return values as descriptive as possible… As a best practice, include a 'status' key in your return dictionary to indicate the overall outcome (e.g., 'success', 'error', 'pending')" [ADK-T]. And the reason, which is the whole chapter compressed: "Remember that the LLM, not a piece of code, needs to understand the result" [ADK-T].
- **Error text as repair instruction.** Error responses should communicate "specific and actionable improvements, rather than opaque error codes or tracebacks" [WTA].

**Evidence gap.** Every quantitative claim above is a vendor's uncontrolled internal result. There is no published controlled study of enum-vs-string, parameter-count, or identifier-semantics effects with intervals. The *mechanisms* are sound and independently reasoned in §3; the *magnitudes* in your system are unmeasured until Topic 13.

## 6. Implementation

**A schema that minimizes $I_u$:**

```python
{
  "name": "asana_tasks_search",                     # namespaced, verb-noun (Topic 6)
  "description": (
      "Search tasks in an Asana project. Use when the user refers to work items, "
      "tickets, or assignments in Asana.\n"
      "  project: the project NAME as shown in the UI (e.g. 'Q3 Launch'), not a GID.\n"
      "  status:  omit to search all statuses.\n"
      "  since:   ISO-8601 date, EXCLUSIVE lower bound.\n"
      "Returns at most `limit` tasks, newest first, with a cursor for more."
  ),
  "input_schema": {
    "type": "object",
    "properties": {
      "project": {"type": "string",
                  "description": "Project name exactly as displayed. Case-insensitive."},
      "status":  {"type": "string",
                  "enum": ["open", "closed", "blocked"],      # I_u collapses to ∅ here
                  "description": "Omit for all statuses."},
      "since":   {"type": "string", "format": "date",
                  "description": "Exclusive lower bound, ISO-8601 (YYYY-MM-DD)."},
      "limit":   {"type": "integer", "minimum": 1, "maximum": 50, "default": 20}
    },
    "required": ["project"],                        # ONE required field
    "additionalProperties": false                   # unknown args are unrepresentable
  }
}
```

Every choice is a lever from §3.2. `project` takes a **name, not a GID** — the identifier-semantics finding [WTA]. `status` is an **enum** — the invalid-status set is empty. `limit` has **bounds and a default** — it leaves the required set. `additionalProperties: false` — hallucinated parameters become structurally invalid rather than silently ignored. The required set has **one** member.

**Error text that repairs.** The contrast [WTA] draws is between opaque codes and actionable guidance; concretely:

```python
# Useless: the model learns nothing and will repeat the error.
{"error": "ValidationError: 400"}

# Useless in a different way: a traceback is context spend with no repair signal.
{"error": "Traceback (most recent call last):\n  File \"...\", line 214, in search\n ..."}

# Repairing: names the offending field, the valid space, and the next action.
{
  "status": "error",
  "error": "Unknown project 'Q3 Lauch'. Did you mean 'Q3 Launch'? "
           "Projects available to you: 'Q3 Launch', 'Q4 Planning', 'Infra'. "
           "Re-call asana_tasks_search with the exact project name."
}
```

The third is longer and it is *cheaper*, because it converts a retry loop into a single corrected call. This is a general principle worth stating: **in an agent system, error text is not a log line — it is the next turn's prompt.** [WTA] extends this to steering: when truncating, you can "directly encourage agents to pursue more token-efficient strategies, like making many small and targeted searches instead of a single, broad search."

**Semantic validation with a repair channel:**

```python
def validate_semantic(args: dict, ctx) -> Result:
    projects = ctx.visible_projects()                 # authorization-scoped (Topic 10)
    if args["project"] not in projects:
        near = difflib.get_close_matches(args["project"], projects, n=1)
        return Err(f"Unknown project {args['project']!r}."
                   + (f" Did you mean {near[0]!r}?" if near else "")
                   + f" Available: {', '.join(sorted(projects))}.")
    if (s := args.get("since")) and s > date.today().isoformat():
        return Err(f"`since` is {s}, which is in the future. Tasks cannot exist after today.")
    return Ok(args)
```

Note `ctx.visible_projects()` returns only what the *caller* may see. The error message enumerates available projects — which is helpful to the model and would be an **information leak if the enumeration were not authorization-scoped**. This is the seam where a helpful error becomes a vulnerability, and it is why §4 insists validation and authorization stay distinct but *cooperate*.

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Enum over free string | $I_u\to\emptyset$ for that field; constrained decoding can enforce it | Schema churn when the value set changes; a stale enum makes valid calls unrepresentable |
| Names over UUIDs | Reduced hallucination [WTA]; model can self-check | A resolution layer; ambiguity when names collide; a rename breaks references |
| Rich description | Higher $\Pr(Z_s)$, higher $\Pr(Z_a\mid Z_s)$ | Context on **every turn, for every visible tool** — the dominant cost at scale (Topic 6) |
| Fewer parameters | $\prod p_i$ improves geometrically | Tool does less; may force more calls (latency) or a second tool (surface growth — Topic 15) |
| `additionalProperties: false` | Hallucinated params fail structurally | Brittle across schema evolution (Chapter 4, Topic 13) |
| Defaults | Smaller required set | The model cannot see the default's *value* unless you state it in the description — an unstated default is a silent behavior |

**The central tension of this topic.** Description quality and description cost are the same axis. A perfectly explicit tool is expensive on every turn it is visible and never called. Topics 6–8 exist to resolve this — by making tools *not visible* until needed — and until you adopt one of those strategies, richer descriptions are a real, recurring, per-turn tax.

## 8. Experiments

**Metrics, separated** (this is the point of Topic 13, previewed here): $\Pr(Z_s)$ — did it pick the right tool; $\Pr(Z_a\mid Z_s)$ — given the right tool, were the arguments valid; tool-error rate; **repair-loop rate** (fraction of calls preceded by a failed call to the same tool) — the metric that catches the invisible leak of §2.

**Ablations, paired, one factor each:**

| Arm | Change | Hypothesis |
|---|---|---|
| A | Free string → enum on one high-traffic field | $\Pr(Z_a\mid Z_s)\uparrow$, repair loops $\downarrow$ |
| B | UUID → semantic name | Hallucinated-identifier rate $\downarrow$ [WTA] |
| C | Description: terse → new-hire-explicit | $\Pr(Z_s)\uparrow$; **context cost $\uparrow$ — measure it** |
| D | 6 params → 3 params (split or default) | $\Pr(Z_a\mid Z_s)\uparrow$ per §3.3 |
| E | Opaque error → repair text | Repair-loop *length* $\downarrow$; end-to-end $G$ $\uparrow$ |

**Statistics.** Paired same-task designs; McNemar for the binary contrasts; task-clustered bootstrap for intervals; **Holm across the five arms** — five uncorrected comparisons on a shared task set is exactly the multiplicity Chapter 1, Topic 12 forbids.

**Acceptance thresholds.** Arm C must be judged on the *vector*: a description that raises $\Pr(Z_s)$ by 2 points while adding 400 tokens to every turn may be a net loss at scale, and only the joint (accuracy, cost) view can say. Predeclare the primary endpoint before running.

**Reproducibility.** Pin the model; record the surface hash (Topic 1, §6); hold out tasks — [WTA] used "held-out test sets to ensure we did not overfit to our 'training' evaluations," and a schema tuned against its own eval is a schema that has memorized it.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **The UUID argument.** The model must produce an identifier it cannot derive; it invents one. Mitigation: semantic names [WTA]; if IDs are unavoidable, make them 0-indexed and *return them in a prior tool's output* so they can be copied rather than invented.
- **The unstated default.** `limit` defaults to 20; the description does not say so; the model reasons as if it will get everything. Mitigation: state defaults in the description text, not only in the schema.
- **The too-tight enum.** A valid state is unrepresentable, so the model picks the nearest representable value and produces a wrong action that *validates*. This is worse than a rejection, because nothing errors. Mitigation: an explicit `other` variant with a free-text companion field, and monitoring of its use.
- **Ambiguous parameter name.** `user`, `id`, `query`, `data`, `content`. Mitigation: [WTA]'s rule — say what it is.
- **The parameter-count creep.** A tool grows to eleven optional parameters as features accrete; $\prod p_i$ collapses. Mitigation: split the tool, or move rare parameters into a separate advanced tool.
- **The traceback-as-error.** A stack trace returned to the model: hundreds of tokens, zero repair signal, and an *information leak* about internal structure. Mitigation: §6's repair-text discipline; never pass exceptions through.
- **The leaky error message.** Enumerating valid values reveals resources the caller may not access. Mitigation: authorization-scope the enumeration (§6).
- **Edge case — schema evolution.** `additionalProperties: false` plus a client on an older schema equals hard failure (Chapter 4, Topic 13's change classes). Stage additive changes; deprecate on a window.
- **Open limitation.** There is no published, controlled effect size for any of these levers. The mechanisms are well-argued and vendor-corroborated; the magnitudes are yours to measure.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Parameter names are constraints the model reads; ambiguity in them produces argument errors [WTA].
2. Opaque identifiers induce hallucination; semantic names reduce it [WTA — vendor, retrieval tasks, no effect size].
3. Description refinement measurably moved a benchmark result [WTA — uncontrolled attribution].
4. Fewer parameters, simple types, and meaningful names are the documented function-tool discipline [ADK-T].
5. Error text is a policy input for the next turn, and should carry "specific and actionable improvements" rather than codes or tracebacks [WTA].

**Decision rules.**
- **A field with a finite value set that is not an enum is a bug.** Fix it before anything else in this chapter.
- **A tool that takes a UUID the model has not been shown is a hallucination generator.** Either return the ID from a prior tool or use names.
- **A required parameter that could have a default should have one.** Every required field is a failure mode.
- **If your error messages contain tracebacks, you are paying tokens to teach the model nothing.**

**Production implications.**
1. Audit every tool for free-text fields with finite domains; convert to enums. Cheapest win in the chapter.
2. Add a **repair-loop rate** to your dashboards. It is the metric that exposes the schema failures your accuracy number is hiding.
3. Put the schema through review like code — because it *is* code that the model executes (Topic 1, §3.3).
4. Bound the description budget per tool and enforce it in CI; otherwise §7's tension resolves itself, badly, by accretion.

**Connections.** Topic 4 takes $d_u$ from *correct* to *findable* — this topic makes the tool usable once chosen; Topic 4 makes it choosable. Topic 6 shows why every character here is a recurring cost. Topic 7 designs $\Sigma^{\mathrm{out}}_u$, the other half of the contract, and inherits [ADK-T]'s status-key discipline. Topic 13 measures $\Pr(Z_a\mid Z_s)$; Topic 14 attacks $d_u$ adversarially. Chapter 2, Topic 7's constrained decoding is what turns a tight schema from *checked* into *unrepresentable*.

## Sources

[WTA] Anthropic, "Writing effective tools for agents — with agents" — `user` vs `user_id`; the new-hire framing and making implicit context explicit; UUID-to-semantic-name resolution improving precision by reducing hallucinations; SWE-bench Verified attribution to tool-description refinement; error responses carrying "specific and actionable improvements, rather than opaque error codes or tracebacks"; steering toward token-efficient strategies on truncation; held-out test sets; the evaluation metric list (accuracy, runtime, tool calls, tokens, tool errors) — https://www.anthropic.com/engineering/writing-tools-for-agents
[ADK-T] Google ADK custom tools — schema generation from name, parameters, type hints, defaults, docstring; "A parameter is considered required if it has a type hint but no default value"; "Fewer Parameters are Better"; "Simple Data Types"; "Meaningful Names"; `*args`/`**kwargs` ignored; dict returns with a `status` key; "Remember that the LLM, not a piece of code, needs to understand the result" — https://adk.dev/tools-custom/function-tools/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3.4 — pre-use hooks validating arguments; §3.5 — brittle tool interfaces as a failure mechanism
