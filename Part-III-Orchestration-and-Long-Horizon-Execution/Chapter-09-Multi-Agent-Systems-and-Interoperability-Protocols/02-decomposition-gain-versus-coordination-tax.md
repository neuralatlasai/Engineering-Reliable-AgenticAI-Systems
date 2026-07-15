# Topic 2 — Decomposition Gain versus Coordination Tax

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The calculus Topic 1 introduced, opened up: **what exactly is the gain made of, what exactly is the tax made of, and how does each scale with the number of agents?** The tax has five components, most of them invisible, and one of them — [MAR]'s token-variance finding — casts doubt on how much of the gain is decomposition at all.

**Prerequisites.** Topic 1 (the 90.2% / 15× trade; the four disqualifiers); Chapter 1, Topic 8 (error accumulation); Chapter 6, Topic 1 (context rot — the gain's mechanism).

**Terminology.** *Decomposition gain*: performance improvement from splitting. *Coordination tax*: the full cost of splitting — tokens, latency, prompt engineering, emergent behavior, error compounding. *Marginal agent*: the $n$-th agent added.

**Boundaries.** Inside: the gain's and tax's components and their scaling. Outside: the justification decision (Topic 1); measuring marginal contribution (Topic 14).

**Exclusions.** No cost-modeling framework.

**Outcomes.** The reader can decompose the gain and the tax into measurable components, find the point where the marginal agent stops paying, and know which of the two hypotheses for [MAR]'s 90.2% their system is actually exhibiting.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Topic 1 established that multi-agent pays when the gain exceeds the tax. But **"gain" and "tax" are aggregates, and aggregates are not actionable.** If the multi-agent system underperforms, you need to know *which component* of the tax ate the gain — and if it overperforms, you need to know *whether the gain was decomposition or merely more tokens*.

**Bottleneck.** [MAR] reports a finding that should give every multi-agent advocate pause: on BrowseComp, **"token usage alone explains 80% of performance variance"** [MAR]. **Eighty percent.** Not architecture, not decomposition, not coordination quality — *token usage*. And multi-agent systems use 15× the tokens [MAR].

**This raises a hypothesis the 90.2% result cannot rule out: that a large share of the multi-agent gain is simply the effect of spending more tokens**, which a single agent with the same budget might also achieve. **[MAR] does not test this**, and it is the most important open question in the chapter.

**Objective.** Decompose both sides into measurable components; find the marginal agent's break-even; and **run the token-matched baseline that distinguishes decomposition from spend.**

**Assumptions.** Gain and tax both scale with agent count, and not in the same way.

**Constraints.** The token-variance finding is from one benchmark (BrowseComp) [MAR]. Its generality is unknown.

**Success criteria.** The tax's components are individually measured; the marginal agent's break-even is known; the decomposition-vs-spend question is answered *for your system*.

## 3. Intuition first, then formalization

### 3.1 Intuition: the tax has five components and four of them are invisible

The token cost (15× [MAR]) is the *visible* tax. **Four more are not, and they are where multi-agent projects actually fail** **[synthesis; each grounded in [MAR]]**:

1. **Token multiplication** (visible). 15× chat [MAR]. Each subagent is a full loop with its own context and tool calls.

2. **Coordination latency** (partly visible). [MAR]: "lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents." **The system blocks on the *slowest* subagent** — so wall-clock time is the max, not the mean. (Parallelism still wins overall: "up to 90%" faster [MAR] — but the *tail* subagent sets the pace.)

3. **Delegation prompt-engineering** (invisible until it fails). [MAR] devotes eight principles to this, because **bad delegation is a silent, expensive failure**: "Simple instructions caused… subagents [to] misinterpret the task or perform the exact same searches as other agents." The documented example: "one subagent explored 2021 automotive chip crisis while two others duplicated 2025 supply chain work" [MAR]. **Two of three subagents did the same work.** That is a 33% efficiency loss from a prompt.

4. **Emergent behavior** (invisible and dangerous). [MAR]: **"Small changes to the lead agent can unpredictably change how subagents behave."** The system is *coupled* in ways that are not visible in the code — a lead-prompt tweak changes subagent behavior nonlinearly. **This makes the system hard to tune and hard to trust.**

5. **Error compounding across agents** (invisible). Chapter 1, Topic 8's accumulation, now multiplied: each subagent has its own $K_M$, and [MAR] confirms the consequence: **"One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes."**

**The four invisible components are the ones that kill multi-agent projects**, and they are the reason [MAR] describes "the last mile" as "most of the journey": **"The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely"** [MAR].

### 3.2 Formalization: the gain, the tax, and the marginal agent

Let $n$ be the number of subagents. **[synthesis; components grounded in [MAR]]**

**The gain.** Two sources:

$$
G(n) \;=\; \underbrace{G_{\text{ctx}}(n)}_{\text{context isolation}} \;+\; \underbrace{G_{\text{tok}}(n)}_{\text{simply spending more tokens}} .
$$

$G_{\text{ctx}}$ is the *real* decomposition gain: each subagent explores in a fresh window and returns a distilled summary (Topic 1, §3.1). It is **concave in $n$** — the first few subagents cover the most valuable directions; the tenth adds a marginal direction.

$G_{\text{tok}}$ is the confound: **more agents means more tokens, and [MAR] says token usage explains 80% of variance** [MAR]. **This term would be available to a single agent with the same budget.**

**The tax.**

$$
T(n) \;=\; \underbrace{c_{\text{tok}} \cdot n}_{\text{linear}} \;+\; \underbrace{c_{\text{lat}} \cdot \max_i \ell_i}_{\text{slowest subagent}} \;+\; \underbrace{c_{\text{dup}}(n)}_{\text{duplicate work}} \;+\; \underbrace{c_{\text{err}}(n)}_{\text{compounding}} .
$$

The duplicate-work term $c_{\text{dup}}$ is the one [MAR] documents concretely (two of three subagents duplicating), and it **grows with $n$** — more subagents means more chances for overlap unless delegation is precise (Topic 8's duplicate-work failure).

**The marginal condition:**

$$
\textbf{MT-1 (add the } n\text{-th agent iff):}\quad
\frac{\partial G}{\partial n} \;>\; \frac{\partial T}{\partial n} .
$$

**[derived]** Since $G_{\text{ctx}}$ is concave and $T$ is at least linear (and $c_{\text{dup}}$ super-linear), **there is a finite $n^\star$ beyond which agents stop paying.** This is Chapter 5, Topic 15's saturation curve, at the agent layer — and [MAR]'s early failure ("spawning 50 subagents for simple queries") is what the far side of $n^\star$ looks like.

**[MAR] gives explicit scaling rules — the practical form of $n^\star$:**

> "Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents" [MAR]

**These are embedded in the lead agent's prompt as *effort budgets*, "to prevent overinvestment in simple queries"** [MAR]. **The scaling rule is a prompt-level control, and it exists because the model would otherwise get $n$ badly wrong in both directions.**

### 3.3 The decomposition-versus-spend question — the chapter's most important open problem

Restating it, because it is the topic's central contribution and the sources do not resolve it.

**[MAR] establishes two facts:**
1. Multi-agent beats single-agent by 90.2% on their research eval.
2. **Token usage alone explains 80% of performance variance** on BrowseComp.

**These are consistent with two very different explanations [derived]:**

- **Hypothesis A (decomposition):** the multi-agent architecture wins because parallel context windows let it explore more directions without context rot (Topic 1, §3.1). **A single agent with 15× the budget would still lose**, because its single window would rot.

- **Hypothesis B (spend):** the multi-agent architecture wins largely because it *spends 15× more tokens*, and token spend is the dominant variance factor [MAR]. **A single agent given 15× the budget would close most of the gap.**

**The truth is likely a mixture, and the mixture matters enormously**: under A, the architecture is the value; under B, the architecture is an expensive way to authorize spending, and a simpler mechanism (a bigger budget, more tool calls, a longer loop) would get most of the benefit.

**The experiment that distinguishes them is simple and, to this book's knowledge, unrun (§8): give the single agent the multi-agent system's token budget.** [MAR] does not report it. **Until someone does, "multi-agent is better" is confounded with "multi-agent spends more," and every team adopting multi-agent should run this baseline before committing.**

**[MAR] offers one clue in the other direction, and it is worth weighing:** the S&P 500 board-members example — "the single agent system failed to find the answer with slow, sequential searches" [MAR]. **A single agent, given more budget, would still search *sequentially*** — so on tasks where *parallelism itself* is the mechanism (wall-clock exploration breadth), Hypothesis A has genuine support. **The honest position: decomposition is real on parallel-search tasks; how much of the 90.2% it accounts for is unmeasured.**

## 4. Architecture

```
   THE GAIN                                    THE TAX
   ┌─────────────────────────────┐            ┌──────────────────────────────────┐
   │ G_ctx(n) — CONTEXT isolation │            │ 1. TOKEN multiplication (VISIBLE) │
   │   fresh window per subagent   │            │    15× chat [MAR] · linear in n   │
   │   CONCAVE in n                │            ├──────────────────────────────────┤
   │   ↑ the REAL decomposition    │            │ 2. COORDINATION LATENCY           │
   │     gain                      │            │    synchronous: blocks on the     │
   ├─────────────────────────────┤            │    SLOWEST subagent [MAR]         │
   │ G_tok(n) — simply MORE TOKENS │            ├──────────────────────────────────┤
   │   ⚠ [MAR]: token usage alone  │            │ 3. DELEGATION PROMPT-ENGINEERING  │
   │     explains 80% of variance   │            │    ⚠ INVISIBLE. Bad delegation ⇒  │
   │   ⚠ a SINGLE agent with 15×    │            │    "two others duplicated 2025    │
   │     budget would ALSO get this │            │     supply chain work" [MAR]      │
   └─────────────────────────────┘            ├──────────────────────────────────┤
                                               │ 4. EMERGENT BEHAVIOR              │
   §3.3 THE OPEN QUESTION:                     │    ⚠ "Small changes to the lead   │
   How much of the 90.2% is                    │    agent can unpredictably change  │
   DECOMPOSITION (G_ctx) vs SPEND (G_tok)?     │    how subagents behave" [MAR]    │
   → run the TOKEN-MATCHED baseline (§8)       ├──────────────────────────────────┤
     [MAR] does not. Nobody does.              │ 5. ERROR COMPOUNDING across agents│
                                               │    "One step failing can cause     │
                                               │    agents to explore entirely      │
                                               │    different trajectories" [MAR]  │
                                               └──────────────────────────────────┘

   MT-1: add agent n iff  ∂G/∂n > ∂T/∂n.  G_ctx concave, T at least linear
         ⇒ a finite n* exists. Past it, agents COST more than they add.

   [MAR]'s SCALING RULES (the practical n*), embedded in the lead's prompt:
     simple fact-finding    → 1 agent, 3-10 tool calls
     direct comparisons     → 2-4 subagents, 10-15 calls each
     complex research       → 10+ subagents
   "to prevent overinvestment in simple queries" [MAR]
```

## 5. Grounding

- **The token-variance finding — the chapter's most consequential number:** on BrowseComp, three factors explained 95% of performance variance, and **"token usage alone" accounted for 80%**; number of tool calls was secondary; **model choice was tertiary** [MAR]. **This is the basis for §3.3's Hypothesis B.**
- **The efficiency corollary:** "Upgrading to Claude Sonnet 4 is a larger performance gain than doubling the token budget on Claude Sonnet 3.7" [MAR] — **model quality can substitute for spend**, which is a cheaper lever than adding agents.
- **The cost:** 15× chat for multi-agent; ~4× for single-agent research [MAR].
- **The synchronous bottleneck:** "lead agents execute subagents synchronously, waiting for each set of subagents to complete before proceeding. This simplifies coordination, but creates bottlenecks in the information flow between agents"; the lead "cannot steer subagents mid-task" and the system blocks on the slowest [MAR].
- **The duplicate-work tax, with a concrete instance:** vague delegation caused subagents to "misinterpret the task or perform the exact same searches as other agents" — "one subagent explored 2021 automotive chip crisis while two others duplicated 2025 supply chain work" [MAR].
- **The delegation contract that fixes it:** lead agents must give subagents "an objective, an output format, guidance on the tools and sources to use, and clear task boundaries" [MAR] — **four required fields** (Topic 3).
- **Emergent coupling:** "Small changes to the lead agent can unpredictably change how subagents behave" [MAR].
- **Error compounding:** "One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes"; "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely" [MAR].
- **The scaling rules:** the 1 / 2–4 / 10+ effort budgets, embedded in the prompt "to prevent overinvestment in simple queries" [MAR].
- **The saturation precedent:** Chapter 5, Topic 15 (more tools can hurt) and Chapter 8, Topic 12 (more orchestration can hurt) — MT-1 is the same shape, at the agent layer.

**Evidence gap, and it is the chapter's most important.** **[MAR] does not report a token-matched single-agent baseline**, so **the 90.2% is confounded with the 15× spend** — and the source's *own* finding (80% of variance from token usage) makes the confound plausible rather than pedantic. **Neither [MAR] nor any other source resolves §3.3's question.** MT-1 and the five-component tax are **[synthesis]** — each component is documented in [MAR]; the decomposition is this book's. **The scaling rules are [MAR]'s and are the closest thing to a published $n^\star$**, but they are prompt heuristics, not measured optima.

## 6. Implementation

**Measure the tax's five components — four are invisible unless instrumented:**

```python
def measure_coordination_tax(traces) -> dict:
    """The 15× token cost is VISIBLE. The other four components are not — and they are
    where multi-agent projects fail (§3.1)."""
    return {
        # 1. TOKEN MULTIPLICATION (visible)
        "token_multiple": mean(t.total_tokens for t in traces) / SINGLE_AGENT_BASELINE,

        # 2. COORDINATION LATENCY — the system blocks on the SLOWEST subagent [MAR]
        "wall_clock": mean(t.wall_clock for t in traces),
        "straggler_cost": mean(max(s.duration for s in t.subagents) -
                               mean(s.duration for s in t.subagents) for t in traces),

        # 3. DUPLICATE WORK — [MAR]'s documented failure (2 of 3 subagents duplicating)
        "duplicate_work_rate": mean(
            overlap_fraction([s.actions for s in t.subagents]) for t in traces
        ),

        # 4. EMERGENT COUPLING — "small changes to the lead agent can unpredictably
        #    change how subagents behave" [MAR]. Measured as behavioral variance.
        "subagent_behavior_variance": variance_across_runs(traces),

        # 5. ERROR COMPOUNDING — "one step failing can cause agents to explore entirely
        #    different trajectories" [MAR]
        "trajectory_divergence_after_error": divergence_rate(traces),
    }
```

**[MAR]'s scaling rules as an effort budget (the practical $n^\star$):**

```python
def subagent_count(query) -> tuple[int, int]:
    """[MAR]'s scaling rules, embedded in the lead's prompt 'to prevent overinvestment
    in simple queries'. Without these, the lead spawns 50 subagents for a simple query."""
    match classify_complexity(query):
        case "simple_fact_finding":   return 1,  (3, 10)    # 1 agent, 3-10 tool calls
        case "direct_comparison":     return 3,  (10, 15)   # 2-4 subagents, 10-15 calls each
        case "complex_research":      return 10, (15, 30)   # 10+ subagents
```

**The delegation contract — the fix for the duplicate-work tax [MAR]:**

```python
@dataclass(frozen=True)
class SubagentTask:
    """[MAR]: lead agents must provide subagents with 'an objective, an output format,
    guidance on the tools and sources to use, and clear task boundaries.'
    Vague delegation ⇒ 'two others duplicated 2025 supply chain work' — a 33% loss."""
    objective: str            # what to achieve
    output_format: str        # how to report
    tool_guidance: str        # which tools and sources
    boundaries: str           # ← THE CRITICAL ONE: what NOT to do (prevents duplication)

    def __post_init__(self):
        if not self.boundaries:
            raise ValueError(
                "no task boundaries — subagents will duplicate each other's work [MAR]. "
                "This is the documented failure: 2 of 3 subagents doing the same searches."
            )
```

**The marginal-agent check (MT-1):**

```python
def marginal_agent_pays(n: int, measurements) -> bool:
    """MT-1: add the n-th agent iff ∂G/∂n > ∂T/∂n. G_ctx is CONCAVE, T is at least
    linear ⇒ a finite n* exists (Ch.5 T15's saturation, at the agent layer)."""
    gain_n   = measurements.completion_at(n) - measurements.completion_at(n - 1)
    tax_n    = (measurements.tokens_at(n) - measurements.tokens_at(n - 1)) * TOKEN_PRICE \
             + measurements.duplicate_work_cost_at(n)
    return gain_n * TASK_VALUE > tax_n
```

## 7. Trade-offs

| Tax component | Visible? | Scales with $n$ | Mitigation |
|---|---|---|---|
| Token multiplication | **Yes** (15×) | Linear | Scaling rules [MAR]; cheaper subagent models |
| Coordination latency | Partly | Max over subagents (straggler) | Async execution [MAR's future work]; timeouts |
| Delegation prompt-engineering | **No** | Constant-ish, but failures scale | The four-field contract [MAR] |
| Duplicate work | **No** | **Super-linear** | **Clear task boundaries** [MAR] |
| Emergent coupling | **No** | Worse with $n$ | Full tracing [MAR]; behavior-variance monitoring |
| Error compounding | **No** | Multiplicative | Durable execution (Chapter 8, Topic 10) |

**The trade that determines whether a multi-agent project succeeds: the invisible tax.** Everyone budgets the tokens. **Almost nobody budgets the delegation prompt-engineering, and it is the one [MAR] spends the most words on** — eight principles, because vague delegation produced a documented 33% duplication loss. **The invisible components are not smaller than the token cost; they are just harder to see.**

**The model-quality substitution is the cheapest lever and it is under-used.** [MAR]: **"Upgrading to Claude Sonnet 4 is a larger performance gain than doubling the token budget on Claude Sonnet 3.7."** **A better model can substitute for more agents *and* more tokens** — and it costs a config change rather than an architecture. **Before adding an agent, try a better model.** This follows directly from [MAR]'s variance decomposition and is the most actionable cheap win in the chapter.

## 8. Experiments

**The token-matched baseline — the chapter's most important unrun experiment (§3.3).** Give the **single agent the multi-agent system's token budget** (15× chat, or whatever your system uses). Compare.

- **If the single agent closes most of the gap:** you are largely buying *spend*, not decomposition (Hypothesis B). **A simpler mechanism — a bigger budget, more tool calls, a longer loop — gets most of the benefit at a fraction of the complexity.**
- **If it does not:** the decomposition is real (Hypothesis A), and the architecture earns its complexity.

**[MAR] does not run this. Nobody does. Run it before committing to multi-agent**, because the answer changes the whole decision.

**The marginal-agent curve (MT-1).** Sweep $n$ (1, 2, 4, 8, 16 subagents). Measure completion, tokens, wall-clock, and duplicate-work rate. **Prediction: completion is concave in $n$ and saturates; duplicate work grows; there is an $n^\star$.** **Compare your $n^\star$ to [MAR]'s scaling rules** (1 / 2–4 / 10+) — if they differ, yours are wrong for your task or [MAR]'s do not transfer.

**The delegation-contract ablation.** Vague delegation vs [MAR]'s four-field contract (objective, output format, tool guidance, **boundaries**). **Measure duplicate-work rate.** **Prediction: without boundaries, subagents duplicate** — [MAR]'s documented 2-of-3 failure. This is a cheap experiment with a large, visible effect.

**The model-substitution test.** Better model + fewer agents vs weaker model + more agents, at matched cost. **[MAR]'s variance decomposition predicts the better model wins** — test it, because it is the cheapest lever.

**The straggler measurement.** Wall-clock vs mean subagent duration. **The gap is the synchronous-execution tax** [MAR], and it tells you what async execution would buy.

**Statistics.** Paired designs; **report token cost and wall-clock as first-class outcomes**; task-clustered bootstrap; Holm across $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Mistaking spend for decomposition.** The multi-agent gain is largely more tokens; a cheaper mechanism would do. **The chapter's central risk**, and it is unresolved in the literature. Mitigation: the token-matched baseline (§8).
- **Duplicate work from vague delegation.** [MAR]'s documented 2-of-3 failure. **A 33% efficiency loss from a prompt.** Mitigation: the four-field contract, especially **boundaries**.
- **Over-spawning.** "Spawning 50 subagents for simple queries" [MAR]. Mitigation: scaling rules as effort budgets in the lead's prompt.
- **Straggler latency.** Synchronous execution blocks on the slowest subagent [MAR]. Mitigation: timeouts per subagent; async execution (with the coordination costs [MAR] names).
- **Emergent coupling.** A lead-prompt tweak changes subagent behavior unpredictably [MAR]. **Hard to tune, hard to trust.** Mitigation: full production tracing [MAR]; monitor behavior variance across runs.
- **Error compounding across agents.** "One step failing can cause agents to explore entirely different trajectories" [MAR]. Mitigation: durable execution (Chapter 8, Topic 10); "letting the agent know when a tool is failing and letting it adapt works surprisingly well" [MAR].
- **Ignoring the model-substitution lever.** Adding agents when a better model would do more, cheaper [MAR]. Mitigation: try the model upgrade first.
- **Edge case — the task where parallelism *is* the mechanism.** The S&P 500 example [MAR]: a single agent with more budget still searches *sequentially*. **Here Hypothesis A has real support**, and the token-matched baseline should show the single agent still losing.
- **Open limitation.** **The decomposition-versus-spend question is unresolved.** [MAR] reports both the 90.2% gain and the 80%-of-variance-from-tokens finding, and does not reconcile them. **MT-1 and the five-component tax are [synthesis]**; the scaling rules are [MAR]'s prompt heuristics, not measured optima. §8's experiments are the local resolution, and the token-matched baseline is the one that matters most.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **Token usage alone explains 80% of performance variance** on BrowseComp; tool calls secondary; **model choice tertiary** [MAR].
2. **"Upgrading to Claude Sonnet 4 is a larger performance gain than doubling the token budget on Claude Sonnet 3.7"** [MAR] — model quality substitutes for spend.
3. Multi-agent costs ~15× chat tokens [MAR].
4. Vague delegation causes duplicate work: "one subagent explored 2021 automotive chip crisis while two others duplicated 2025 supply chain work" [MAR].
5. The delegation contract requires **"an objective, an output format, guidance on the tools and sources to use, and clear task boundaries"** [MAR].
6. Scaling rules: 1 agent (simple), 2–4 (comparison), 10+ (complex research) — embedded as effort budgets "to prevent overinvestment in simple queries" [MAR].
7. Synchronous execution "creates bottlenecks"; the lead "cannot steer subagents mid-task" [MAR].
8. **"Small changes to the lead agent can unpredictably change how subagents behave"** [MAR].
9. **The 90.2% gain and the 80%-token-variance finding are not reconciled by any source.**

**Decision rules.**
- **Run the token-matched single-agent baseline before committing** — it distinguishes decomposition from spend, and no source has run it.
- **Try a better model before adding an agent** — [MAR]'s variance decomposition says model quality beats doubled budget, and it is a config change.
- **Every subagent task carries objective, output format, tool guidance, and BOUNDARIES** [MAR] — boundaries are what prevent duplication.
- **Embed scaling rules as effort budgets** — otherwise the lead spawns 50 subagents for a simple query.
- **Instrument the four invisible tax components** — they are not smaller than the token cost, just harder to see.
- **There is a finite $n^\star$** (MT-1) — find it; do not assume more agents is more better.

**Production implications.**
1. Run the token-matched baseline (§8). It is the single most consequential experiment in this chapter, and its result determines whether your architecture is earning its complexity.
2. Instrument duplicate-work rate; [MAR]'s documented failure was 2 of 3 subagents, and it came from a prompt.
3. Put the four-field delegation contract in code (§6); the `boundaries` field is not optional.
4. Try the model upgrade before the architecture change; it is cheaper and [MAR] says it is often larger.

**Connections.** This topic opens up Topic 1's gain/tax aggregate. MT-1 is Chapter 5, Topic 15's saturation and Chapter 8, Topic 12's complexity curve, at the agent layer. The duplicate-work tax is Topic 8's coordination failure; the delegation contract is Topic 3's role specialization; the straggler tax is Topic 15's concurrency control; the emergent-coupling problem is Topic 14's evaluation challenge. Error compounding across agents is Chapter 1, Topic 8 and Chapter 8, Topic 10's durability.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — **token usage alone explaining 80% of performance variance on BrowseComp** (tool calls secondary, model choice tertiary; three factors = 95%); **"Upgrading to Claude Sonnet 4 is a larger performance gain than doubling the token budget on Claude Sonnet 3.7"**; the 15× token cost; the delegation contract ("an objective, an output format, guidance on the tools and sources to use, and clear task boundaries") and the duplicate-work failure ("one subagent explored 2021 automotive chip crisis while two others duplicated 2025 supply chain work"); the scaling rules ("Simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents… to prevent overinvestment in simple queries"); the synchronous-execution bottleneck ("lead agents execute subagents synchronously… creates bottlenecks in the information flow between agents"); **"Small changes to the lead agent can unpredictably change how subagents behave"**; "One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes"; "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely"; the early failure "spawning 50 subagents for simple queries" — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — `max_concurrent_subagents` (default 3) bounding the concurrency tax — https://developers.openai.com/api/docs/guides/responses-multi-agent
