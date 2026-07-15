# Topic 3 — Routing by Intent, Capability, Risk, Cost, Latency, and Data Locality

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Routing — the single bounded control decision that directs an input to a specialized path. Six routing *dimensions*, of which most systems use one (intent) and neglect the five that carry the operational and safety weight.

**Prerequisites.** Topic 2 (routing as a pattern; its precondition); Chapter 2, Topic 12 (model routing and portfolios — the model-selection half); Chapter 5, Topic 5 (effect classes — risk routing depends on them).

**Terminology.** *Route*: the branch chosen. *Routing dimension*: the property the routing decision is made *on*. *Misroute*: an input sent to the wrong branch.

**Boundaries.** Inside: the routing decision — its dimensions, its implementation, its failure modes. Outside: what each branch does (Topic 2's patterns); model selection within a branch (Chapter 2, Topic 12); the multi-agent architectures routing composes into (Topic 4).

**Exclusions.** No classifier-model survey.

**Outcomes.** The reader can route on the dimension that matters (not just intent), bound the cost of a misroute, and know when routing is not worth its decision.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Routing "classifies an input and directs it to a specialized followup task" [BEA], and its precondition is "distinct categories that are better handled separately" [BEA]. Most implementations classify on **intent** ("is this a billing question or a technical question?") and stop there. But intent is only one of six dimensions on which a route can be chosen, and the other five — capability, risk, cost, latency, data locality — are where the *operational* and *safety* consequences live.

**Bottleneck.** A router that considers only intent will happily send an irreversible, high-risk request down a fully-autonomous path because the *intent* matched, ignoring that the *risk* required a human gate. It will send a trivial request to an expensive model because the intent matched a "complex" branch. It will send an EU customer's data to a US-region processor because intent said nothing about locality. **The routing decision is a control-plane decision and it must consider the control-plane properties — risk, cost, latency, locality — not just semantic intent.**

**Objective.** Route on the dimension(s) that matter for the decision, with risk routing taking precedence over intent routing, and with a bounded, measured misroute cost.

**Assumptions.** Routing is a model-directed decision ($K_M$ +1, Topic 1) unless the dimension is deterministically computable — and several dimensions *are*.

**Constraints.** A misroute is a cost (wrong specialization) or a hazard (wrong risk tier). Some dimensions (risk, locality) must be *deterministic*, not model-judged.

**Success criteria.** Every route is made on a stated dimension; risk and locality routing are deterministic; misroute rate is measured and its cost bounded.

## 3. Intuition first, then formalization

### 3.1 Intuition: six dimensions, and only one of them is about meaning

The routing question is not "what is this input about?" — it is "**which path should this input take, and why?**" Six answers, each a different dimension **[synthesis; each grounded in §5]**:

1. **Intent** — *what the user wants*. Billing vs technical vs sales. **Model-directed** (semantic classification). This is [BEA]'s canonical routing and the one everyone builds. It buys **specialization**: each branch's prompt, tools, and context are tuned for its category.

2. **Capability** — *what the task requires*. Does this need code execution? Vision? A long context? **Often deterministic** (does the input contain an image? a file?). Routes to the branch that *has* the capability. Chapter 2, Topic 12's model routing is this dimension at the model layer.

3. **Risk** — *what could go wrong*. Does this request imply an irreversible write (Chapter 5, Topic 5)? Touch production? Exceed a value threshold? **MUST BE DETERMINISTIC.** Routes to a gated, human-approved, or restricted path. **This is the dimension that must never be model-judged**, because a model-judged risk classification is a safety control the model can be talked out of (Chapter 5, Topic 12's CP-1).

4. **Cost** — *what it should cost*. A trivial request should not go to the expensive path. Routes to a cheaper model or a shorter workflow. Chapter 2, Topic 12's portfolio logic.

5. **Latency** — *how fast it must be*. An interactive request routes to a fast path; a batch request can take the slow, thorough path. Routes on an SLA, which is deterministic (it is a property of the request's channel, not its content).

6. **Data locality** — *where the data may be processed*. An EU customer's data must be processed in-region; a regulated tenant's data must go to a compliant path. **MUST BE DETERMINISTIC** — it is a compliance property (Chapter 7, Topic 14), and a model-judged locality decision is a compliance violation waiting to happen.

The intuition that reorders priorities: **intent routing is the *least* consequential of the six, and it is the only one most systems implement.** Getting intent wrong costs a suboptimal answer. Getting *risk* wrong costs an unauthorized irreversible action. Getting *locality* wrong costs a compliance breach. **The dimensions with the worst failure modes are precisely the ones that must be deterministic — and they are the ones teams skip.**

### 3.2 Formalization: the routing function and the precedence invariant

A router is a function from input and context to a branch:

$$
\operatorname{route}(x, \mathrm{ctx}) \;\longrightarrow\; b \in \mathcal B .
$$

Decompose it by dimension. Each dimension $d$ yields a *constraint* on the admissible branch set **[synthesis]**:

$$
\mathcal B_{\text{admissible}} \;=\; \underbrace{\mathcal B_{\text{risk}}(x)}_{\text{deterministic}} \cap \underbrace{\mathcal B_{\text{locality}}(x)}_{\text{deterministic}} \cap \underbrace{\mathcal B_{\text{capability}}(x)}_{\text{mostly det.}} \cap \underbrace{\mathcal B_{\text{latency}}(\mathrm{ctx})}_{\text{deterministic}},
$$

and *within* the admissible set, the model chooses on intent, subject to cost preference:

$$
b^\star \;=\; \operatorname*{arg\,min}_{b \,\in\, \mathcal B_{\text{admissible}}} \ \mathrm{cost}(b) \quad\text{among those matching } \operatorname{intent}_{\pi_M}(x).
$$

**[derived]** The structure is the topic's key result: **the deterministic dimensions *constrain the choice set*; the model chooses *within* it.** Two invariants:

$$
\textbf{R-1 (safety dimensions are deterministic and constraining):}\quad
\text{risk and locality routing are computed by code and \emph{restrict} } \mathcal B;\ \text{the model never overrides them.}
$$

R-1 is the topic's core. It is Chapter 5, Topic 3's enum-over-free-string, and Topic 1's state-machine principle, applied to routing: **constrain the choice set deterministically, then let the model pick within it.** A high-risk request has its dangerous branches *removed from the admissible set* before the model ever sees the choice — so a misclassification cannot route it dangerously, because the dangerous route is not on the menu.

$$
\textbf{R-2 (misroute cost bounds routing's value):}\quad
\text{routing is worth its } K_M\ \text{only if } \ \mathbb E[\text{gain from specialization}] \;>\; \Pr(\text{misroute})\cdot \mathrm{cost}(\text{misroute}).
$$

R-2 is the economics. Routing adds a model-directed decision ($K_M$ +1, Topic 1's W-1) and a misroute risk. It pays only if specialization's gain exceeds the expected misroute cost. **For low-stakes intent routing with similar branches, this can be negative** — the classification error costs more than the specialization buys, and a single general branch would be better. **This is the routing analogue of [BEA]'s precondition ("distinct categories that are *better handled separately*") — if the branches are not meaningfully different, routing is pure cost.**

### 3.3 Risk routing must be deterministic — and it is the one that matters

The sharpest claim in the topic **[derived from Chapter 5, Topics 5, 10, 12]**: **a model-judged risk classification is not a safety control.**

The reasoning is Chapter 5, Topic 12's CP-1, applied to routing. If the router asks the model "is this request risky?" and routes accordingly, then:
- An **injected** input (Chapter 5, Topic 12) can claim to be low-risk and be routed to the ungated path.
- A **misclassification** (the model is a stochastic classifier — Chapter 2) sends a high-risk request down a low-risk path, with no error, silently.

**A safety control that a stochastic, manipulable classifier can bypass is not a control.** So risk routing must be computed by *code*, from properties code can determine: does the request's *tool surface* include irreversible writes (Chapter 5, Topic 5's effect class)? Does the target resource exceed a value threshold? Is the environment production or sandbox ([CAH §5]: "the same command may be safe in a disposable sandbox but unsafe in a production repository")?

The same argument holds for **locality** — a compliance property (Chapter 7, Topic 14) that must be determined by the data's tenant/region metadata, not by the model's judgment of what the data "seems to be."

**The pattern: the model routes on *meaning*; code routes on *consequence*.** This division is the topic's operational rule, and it is why R-1 makes the deterministic dimensions *constraining* rather than merely *advisory*.

## 4. Architecture

```
   input x  +  context (channel, tenant, SLA)
        │
        ▼
   ┌── DETERMINISTIC CONSTRAINTS (code) — these RESTRICT the choice set (R-1) ─────┐
   │                                                                               │
   │  RISK      (Ch.5 T5 effect class; prod vs sandbox [CAH §5])  → B_risk         │
   │            HIGH RISK ⇒ dangerous branches REMOVED from the menu               │
   │  LOCALITY  (tenant region; compliance — Ch.7 T14)            → B_locality     │
   │  LATENCY   (channel SLA — interactive vs batch)              → B_latency      │
   │  CAPABILITY(has image? file? needs code exec?)               → B_capability   │
   │                                                                               │
   │  B_admissible = B_risk ∩ B_locality ∩ B_latency ∩ B_capability                │
   └───────────────────────────────┬───────────────────────────────────────────────┘
                                    │  the model NEVER sees the inadmissible branches
                                    ▼
   ┌── MODEL DECISION (K_M + 1) — chooses WITHIN the admissible set ───────────────┐
   │  INTENT: semantic classification [BEA]                                        │
   │  COST:   prefer the cheapest admissible branch that serves the intent          │
   └───────────────────────────────┬───────────────────────────────────────────────┘
                                    ▼
                            branch b* ─► specialized path (Topic 2's patterns)

   THE DIVISION: the model routes on MEANING; code routes on CONSEQUENCE (§3.3).
   A model-judged RISK classification is NOT a safety control (CP-1, Ch.5 T12).
```

**Constraining beats advising, and this is the architecture's whole point.** A router that *asks* the model to consider risk is a router whose safety depends on the model's judgment. A router that *removes* the dangerous branches from the admissible set before the model chooses is a router whose safety is a property of the code. **The second is a control; the first is a hope.** This is the same move as Chapter 5, Topic 3 (enums make invalid arguments unrepresentable) and Topic 1's state machine (illegal transitions are not on the menu) — **make the wrong choice unrepresentable rather than merely discouraged.**

## 5. Grounding

- **Routing, defined and preconditioned:** "classifies an input and directs it to a specialized followup task," for "complex tasks where there are distinct categories that are better handled separately," "enabling specialized prompts for distinct input categories" [BEA].
- **Risk depends on effect class and environment:** permissions "should depend not only on tool identity, but also on arguments, environment state, data sensitivity, and expected side effects"; "the same command may be safe in a disposable sandbox but unsafe in a production repository" [CAH §5] — risk is *computable from state*, which is why it can and must be deterministic.
- **Effect classes are the risk taxonomy:** Chapter 5, Topic 5 (read / reversible write / irreversible write) — the deterministic basis for $\mathcal B_{\text{risk}}$.
- **A safety control the model can bypass is not a control:** Chapter 5, Topic 12's CP-1 (authorization must not read untrusted/model-influenced input) and Chapter 5, Topic 10 (guarantees come from code) — §3.3's argument.
- **Locality is a compliance property:** Chapter 7, Topic 14 (tenancy, data residency) — deterministic by construction (it is tenant metadata).
- **Model routing by cost/capability is a documented practice:** Chapter 2, Topic 12 (routing and portfolios; the [AAR] agent-as-a-router result — +15.3% on the information-deficit setting) — the capability/cost dimensions have prior grounding, including a measured routing result.
- **Routing adds a model-directed decision:** Topic 1's $K_M$ accounting — R-2's cost side.
- **Specialization is the benefit:** [BEA]'s "specialized prompts for distinct input categories" and [OAO]'s "Give each specialist a narrow job" [OAO] — R-2's benefit side.

**Evidence gap.** [BEA] documents routing and its precondition but **publishes no measured misroute rate, no specialization gain, and no comparison to a single general branch.** The six-dimension taxonomy and R-1/R-2 are **[synthesis]** — R-1 derives from Chapter 5, Topic 12's CP-1 (sourced); R-2 is an economic decomposition, not a measured curve. The one *measured* routing result available is [AAR]'s +15.3% on an information-deficit setting (Chapter 2, Topic 12) — which is a *model*-routing result on a specific benchmark, not a general workflow-routing effect size. **Misroute rates and specialization gains are workload-specific and unmeasured**; §8 measures them locally.

## 6. Implementation

**The constraining router — deterministic dimensions restrict the menu (R-1):**

```python
def route(x, ctx, branches: list[Branch]) -> Branch:
    """R-1: code routes on CONSEQUENCE (risk, locality, latency, capability) by RESTRICTING
    the choice set. The model routes on MEANING (intent) WITHIN the admissible set.
    The model never sees the inadmissible branches — a misclassification cannot reach them."""

    admissible = branches
    # RISK — deterministic. From effect class (Ch.5 T5) + environment ([CAH §5]).
    risk = compute_risk(x, ctx)                       # code, NOT the model (§3.3, CP-1)
    admissible = [b for b in admissible if b.max_risk >= risk]   # dangerous branches REMOVED

    # LOCALITY — deterministic. Compliance (Ch.7 T14): tenant region, not model judgment.
    admissible = [b for b in admissible if b.region in allowed_regions(ctx.tenant)]

    # LATENCY — deterministic. Channel SLA is a property of the request, not its content.
    admissible = [b for b in admissible if b.p95_latency <= ctx.sla]

    # CAPABILITY — mostly deterministic. Does the input HAVE an image / file / code need?
    required = required_capabilities(x)               # detectable from the input's shape
    admissible = [b for b in admissible if required <= b.capabilities]

    if not admissible:
        return ESCALATE                                # no admissible branch → human (Topic 8)

    # INTENT — the model's decision (K_M + 1), WITHIN the admissible set. [BEA]
    matching = model.classify(x, options=[b.name for b in admissible])
    candidates = [b for b in admissible if b.name in matching]

    # COST — prefer the cheapest admissible branch that serves the intent.
    return min(candidates, key=lambda b: b.cost)
```

**Risk computed from state, never judged (§3.3):**

```python
def compute_risk(x, ctx) -> Risk:
    """DETERMINISTIC. A model-judged risk classification is not a safety control (CP-1)."""
    tools = tools_reachable_from(x, ctx)
    if any(t.effect is Effect.WRITE_IRREVERSIBLE for t in tools):     # Ch.5 T5
        return Risk.HIGH
    if ctx.environment == "production" and any(t.effect is not Effect.READ for t in tools):
        return Risk.HIGH                          # [CAH §5]: same command, different env
    if value_at_risk(x, ctx) > ctx.policy.threshold:
        return Risk.HIGH
    return Risk.LOW
```

**Measuring R-2's economics:**

```python
def routing_is_worth_it(traces) -> dict:
    """R-2: routing pays only if specialization gain > misroute rate × misroute cost.
    For low-stakes intent routing between SIMILAR branches, this is often NEGATIVE."""
    misroute_rate = mean(t.routed_branch != t.correct_branch for t in traces)
    specialization_gain = (mean_completion(routed=True) - mean_completion(routed=False))
    misroute_cost = mean(t.completion_loss for t in traces if t.misrouted)
    return {
        "gain": specialization_gain,
        "expected_misroute_cost": misroute_rate * misroute_cost,
        "worth_it": specialization_gain > misroute_rate * misroute_cost,
    }
```

## 7. Trade-offs

| Dimension | Deterministic? | Failure cost if wrong | Must be code? |
|---|---|---|---|
| **Intent** | No (semantic) | Suboptimal answer | No — the model's job |
| **Capability** | Mostly | Task cannot be done (loud) | Prefer code |
| **Risk** | **Yes** | **Unauthorized irreversible action** | **YES** (§3.3) |
| **Cost** | Yes | Overspend | Prefer code |
| **Latency** | Yes (SLA) | SLA breach | Prefer code |
| **Locality** | **Yes** | **Compliance breach** | **YES** (Ch.7 T14) |

**The trade that reorders the priorities.** Intent routing — the one everyone builds — has the *mildest* failure mode (a suboptimal answer) and is the *only* one that genuinely needs the model. Risk and locality routing have the *severest* failure modes (unauthorized action; compliance breach) and **must not** use the model. **Most systems have this exactly backwards: they model-route on intent and neglect risk/locality entirely.** The correction is cheap — risk and locality are computable from state and tenant metadata — and it is the highest-value change in the topic.

**The R-2 trade nobody runs the numbers on.** Routing costs a $K_M$ (Topic 1's geometric reliability cost) plus a misroute risk. It pays only if the branches are *meaningfully* different [BEA]. **For branches whose prompts differ trivially, routing is negative-value: the classification error costs more than the specialization buys.** Measure it (§6) — and be prepared to collapse two branches into one general branch, which removes a $K_M$ and a misroute mode at once.

## 8. Experiments

**The misroute-cost measurement (R-2) — the economics.** On labeled tasks (correct branch known): measure misroute rate, specialization gain (routed vs a single general branch), and misroute cost (completion loss when misrouted). **If gain < rate × cost, routing is negative-value — collapse the branches.** This is the experiment that tells you whether your router should exist.

**The risk-routing bypass test (R-1, §3.3) — the safety one.** Attempt to get a high-risk request routed to a low-risk branch: (a) by crafting an input the *model* would misclassify as low-risk; (b) by an injected instruction claiming low risk (Chapter 5, Topic 12). **With deterministic risk routing (R-1), both must fail — the dangerous branch is not in the admissible set.** With model-judged risk routing, both will sometimes succeed. **Report bypass count with the zero-failure bound; the target is exactly zero.** This experiment is the concrete demonstration that R-1 is a control and model-judged risk is not.

**The locality-compliance test.** Attempt to route a region-restricted tenant's request to an out-of-region branch. **Zero target** (Chapter 7, Topic 14).

**The single-branch baseline.** The most important baseline and the most often skipped: **a single general branch, no routing at all.** [BEA]: "Optimizing single LLM calls… is usually enough." If the router does not beat this, it is a $K_M$ and a failure mode for nothing.

**Statistics.** Wilson on misroute rate; zero-failure bounds on risk/locality bypass (targets zero); paired comparison against the single-branch baseline with McNemar; task-clustered bootstrap; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Model-judged risk routing.** A stochastic, manipulable classifier as a safety control. **The severe failure.** Mitigation: R-1 — risk is computed from effect class and environment (§6); dangerous branches removed from the menu.
- **Model-judged locality.** A compliance decision made by a model. Mitigation: locality from tenant metadata (Chapter 7, Topic 14), deterministic.
- **Intent-only routing.** The five consequential dimensions ignored. **The default failure.** Mitigation: the six-dimension router (§6).
- **Advisory rather than constraining.** The router *tells* the model about risk instead of *removing* the risky branches. Mitigation: constrain the choice set (R-1) — make the wrong route unrepresentable.
- **Routing between trivially-different branches.** $K_M$ + misroute risk for negligible specialization (R-2 negative). Mitigation: measure; collapse the branches.
- **No admissible branch.** The constraints eliminate everything. Mitigation: escalate to a human (Topic 8) — never fall back to an inadmissible branch.
- **Misroute is silent.** The wrong branch handles the request and produces a plausible-but-suboptimal answer; nobody notices. Mitigation: measure misroute rate on labeled tasks; log the routing decision and its dimension.
- **Edge case — the input whose risk is not computable from state.** Some risk depends on *intent* ("delete the old records" — which records?). Here, code cannot fully determine risk before the model has interpreted the request. Mitigation: route to a *gated* path when risk is *indeterminate* — fail safe. The admissible set for an indeterminate-risk input excludes the ungated branches, and the gate (Topic 8) resolves it.
- **Edge case — routing that fragments context.** Each branch has its own context and history; a conversation that routes differently across turns loses coherence. Mitigation: shared conversational state across branches (Topic 7's typed workflow state); route the *turn*, not the *conversation*.
- **Open limitation.** **[BEA] documents routing without measuring it** — no misroute rates, no specialization gains. The six-dimension taxonomy and R-1/R-2 are **[synthesis]**, with R-1 derived from Chapter 5, Topic 12's sourced CP-1. The only measured routing result in the book's sources is [AAR]'s model-routing gain (Chapter 2, Topic 12), which is a different question. All workflow-routing magnitudes are local (§8).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Routing "classifies an input and directs it to a specialized followup task," for "distinct categories that are better handled separately" [BEA].
2. Risk is a function of effect class, arguments, and environment — "the same command may be safe in a disposable sandbox but unsafe in a production repository" [CAH §5] — hence *computable by code*.
3. Guarantees come from code, not from model judgment (Chapter 5, Topics 10, 12) — a model-judged risk route is not a control.
4. Specialists should have "a narrow job" [OAO] — the specialization that routing buys.
5. **No source measures misroute rates or specialization gains for workflow routing.**

**Decision rules.**
- **The model routes on meaning; code routes on consequence** (§3.3).
- **Risk and locality routing are deterministic and *constraining*** (R-1) — the dangerous branch is removed from the menu, not merely discouraged.
- **Route on all six dimensions**, not just intent — the neglected five carry the operational and safety weight.
- **Indeterminate risk ⇒ route to the gated path** — fail safe.
- **Measure R-2** — routing between similar branches is negative-value; collapse them.
- **Always baseline against a single general branch** [BEA].

**Production implications.**
1. Add deterministic risk and locality constraints to your router today; most routers have neither, and they are the two with severe failure modes.
2. Run the risk-bypass test (§8); if a crafted or injected input can reach a dangerous branch, your risk routing is not a control.
3. Measure misroute economics (R-2); you may be paying a $K_M$ and a failure mode for specialization you are not getting.
4. Log the routing dimension with every decision; a misroute you cannot attribute is a misroute you cannot fix.

**Connections.** Routing is Topic 2's conditional pattern, deepened. Its constraining architecture is Topic 1's state-machine principle (constrain the choice set) and Chapter 5, Topic 3's enum discipline. Risk routing rests on Chapter 5, Topic 5's effect classes and Topic 12's CP-1; locality on Chapter 7, Topic 14. The indeterminate-risk escalation is Topic 8's HITL gate. Model-level routing (cost/capability) is Chapter 2, Topic 12. Topic 4 composes routers into multi-agent architectures.

## Sources

[BEA] Anthropic, "Building effective agents" — routing ("classifies an input and directs it to a specialized followup task"; for "complex tasks where there are distinct categories that are better handled separately"; "enabling specialized prompts for distinct input categories"); "Optimizing single LLM calls with retrieval and in-context examples is usually enough" (the single-branch baseline) — https://www.anthropic.com/engineering/building-effective-agents
[OAO] OpenAI, agent-orchestration guide — "Give each specialist a narrow job"; specialists added only when they "materially improve capability isolation, policy isolation, prompt clarity, or trace legibility" — https://developers.openai.com/api/docs/guides/agents/orchestration
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — "permissions should depend not only on tool identity, but also on arguments, environment state, data sensitivity, and expected side effects"; "the same command may be safe in a disposable sandbox but unsafe in a production repository" — the deterministic basis for risk routing
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) — the one measured routing result in this book's sources (+15.3% on the information-deficit setting); a *model*-routing finding, not a workflow-routing effect size
