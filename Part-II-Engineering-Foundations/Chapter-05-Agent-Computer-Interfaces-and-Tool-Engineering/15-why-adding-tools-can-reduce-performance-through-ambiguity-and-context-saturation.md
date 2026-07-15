# Topic 15 — Why Adding Tools Can Reduce Performance Through Ambiguity and Context Saturation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The chapter's closing result: **tool-surface size is not free, and past a point it is negative.** Adding a capable, correct, well-described tool can lower the measured performance of the whole system. This topic explains the mechanisms, states honestly what is and is not measured, and gives the experiment that finds your system's turning point.

**Prerequisites.** Topic 4 (selection as a comparison whose denominator grows with the surface); Topic 6 (the per-turn token cost of definitions); Topic 13 (the instrument that makes this claim testable).

**Terminology.** *Saturation*: the regime where adding tools degrades aggregate performance. *Confusability*: the degree to which tools compete for the same selection mass. *Turning point*: the surface size beyond which marginal tools are net-negative.

**Boundaries.** Inside: the mechanisms, the honest evidence state, and the detection experiment. Outside: the mitigations, which are the whole rest of the chapter (deferral, namespacing, consolidation, code execution).

**Exclusions.** No claim of a universal turning-point number — there is none, and inventing one would violate the chapter's grounding rule.

**Outcomes.** The reader can explain *why* more tools can hurt, state that the *magnitude* is unmeasured in the literature, and run the experiment that measures it locally.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The default assumption in tool engineering is monotonicity: more capability, more tools, better agent. It is false, and it is the assumption behind the most common way tool surfaces decay — accretion, one reasonable tool at a time, until the surface is a liability nobody decided to build.

**Bottleneck.** The costs of a tool are *distributed and delayed*; its benefit is *local and immediate*. Adding a tool obviously helps the tasks it is for. It quietly hurts *every other task* — a little more context, a little more selection confusion — and that harm is spread across the whole eval where no single task shows it. So each addition looks positive in isolation and the sum goes negative. This is a tragedy-of-the-commons structure, and it is why the decision must be made against the *whole surface*, never the marginal tool.

**Objective.** Establish saturation as a real, mechanistic effect; refuse to overstate its measured magnitude; and give the reader the local experiment.

**Assumptions.** Selection is comparative (Topic 4). Definitions cost context (Topic 6). Both are established, not assumed.

**Constraints.** The magnitude is workload-, model-, and surface-specific. No source provides a curve.

**Success criteria.** The reader designs surfaces against a measured turning point rather than a monotonicity assumption.

## 3. Intuition first, then formalization

### 3.1 Intuition: the tool that helps ten tasks and taxes a thousand

Add `get_lunar_phase` to a customer-support agent. It perfectly serves the rare task that needs it. It also:

1. Adds its definition to **every** prompt on **every** turn of **every** conversation (Topic 6) — a tax on a thousand tasks to serve ten.
2. Enters the selection comparison for **every** request (Topic 4, §3.2), adding probability mass to the denominator and a chance — small per request, nonzero, paid every request — that it is selected when it should not be.
3. Sits in the neighborhood of some existing tool and makes that neighbor slightly harder to distinguish.

The benefit is concentrated and visible. The cost is diffuse and invisible. **Nobody's dashboard shows "the lunar-phase tool cost us 0.3 points of accuracy on unrelated tasks," because that harm is spread across every unrelated task as noise.** And so the surface grows, each addition locally justified, until the aggregate has quietly degraded.

This is [WTA]'s opening claim, now earned rather than asserted: **"More tools don't always lead to better outcomes."**

### 3.2 Formalization: the two mechanisms

Aggregate task success is, schematically, a benefit term minus two cost terms that both grow with surface size $N$. **[derived — a decomposition to make the sign visible, not a fitted model.]**

**Mechanism 1 — context saturation.** Definition tokens are $K\cdot N\cdot(\bar d+\bar\sigma)$ per run (Topic 6). As they grow, they (i) cost money and latency and (ii) crowd the context that reasoning and results need. Beyond the model's effective working capacity, additional definition tokens *displace* task-relevant content. The cost is at least linear in $N$ and, once displacement begins, the quality effect is worse than linear.

**Mechanism 2 — selection ambiguity.** From Topic 4's comparative selection, the probability of choosing the correct tool $u^\star$ has a denominator over the visible set:

$$
\Pr(\text{select }u^\star)\;=\;\frac{\exp(\operatorname{score}(u^\star))}{\displaystyle\sum_{u\in\mathcal V\cup\{\varnothing\}}\exp(\operatorname{score}(u))}.
$$

Every tool added puts a term in the denominator. If a new tool $u'$ is **confusable** with $u^\star$ — overlapping domain, similar description — its term is large exactly when $u^\star$ is correct, and $\Pr(\text{select }u^\star)$ falls. Adding an *unrelated* tool costs little selection accuracy (its score is low when $u^\star$ is right); adding a *confusable* one costs a lot. **This is the key refinement, and it flips the naive intuition: the danger of a new tool is not its capability but its confusability with what you already have.** A surface can hold many unrelated tools cheaply and few confusable ones expensively.

Combining, aggregate performance as a function of $N$ is benefit (concave — early tools help most, later ones serve rarer tasks) minus saturation (super-linear once displacement starts) minus ambiguity (driven by confusability, not count). The difference is **single-peaked**: it rises, turns, and falls. The peak is the turning point, and its location depends on the model's capacity, the confusability structure of the surface, and the task distribution — none of which are universal.

### 3.3 What is measured, and what is not — stated without softening

This is the chapter's largest evidence gap and it will be stated plainly, because the alternative is to invent a number.

**Measured and sourced:**
- Descriptions collectively steer selection [WTA] — Mechanism 2's premise.
- Large surfaces cost hundreds of thousands of tokens [CXM] — Mechanism 1's premise.
- "More tools don't always lead to better outcomes" [WTA] — the qualitative conclusion, from the vendor that measures it internally.
- Held-out accuracy *improved* when tool surfaces were *optimized* (which included removing and consolidating) [WTA] — indirect evidence that surface quality, not quantity, drives performance.

**Not measured in any source available to this chapter:**
- A curve of task success against $N$.
- A turning-point value, universal or otherwise.
- The relative size of Mechanism 1 vs Mechanism 2.
- The confusability threshold at which a new tool goes net-negative.

**Therefore this topic states the mechanisms with sources and the magnitude as unmeasured, and hands the reader §8's experiment.** Any specific saturation number a reader encounters — including in this book — is either measured on a specific system (and non-transferable) or invented (and worthless). This book will not print one it cannot ground.

## 4. Architecture

```
   aggregate
   performance
      │            ╭──────╮  ← turning point (single peak)
      │          ╭─╯      ╰─╮
      │        ╭─╯          ╰──╮
      │      ╭─╯               ╰────╮
      │    ╭─╯                       ╰──────  ← saturated regime: adding tools HURTS
      │  ╭─╯
      │╭─╯
      └────────────────────────────────────────►  N (tools visible in 𝒱)
        │◄── benefit dominates ──►│◄── costs dominate ──►│

   Shape: SOURCED as single-peaked (benefit concave; costs grow in N).
   Peak LOCATION: UNMEASURED. Yours to find (§8).
```

**The architectural response is not "add fewer tools" — it is "keep $|\mathcal V|$ small while keeping $|\mathcal U_c|$ large."** The entire rest of the chapter is mechanisms for exactly this decoupling: namespacing (Topic 6) reduces confusability; deferred loading (Topic 6) shrinks $\mathcal V$ below $\mathcal U_c$; code execution (Topic 8) drives $\mathcal V$ toward one; consolidation (Topic 4) reduces $N$ itself. **Saturation is not an argument against capability; it is an argument for not putting all your capability in the model's face at once.** You can have a thousand tools and a small visible set — that is the whole point of Topics 6 and 8.

## 5. Grounding

- **The headline claim:** "More tools don't always lead to better outcomes. A common error we've observed is tools that merely wrap existing software functionality or API endpoints" [WTA]. The wrapper anti-pattern is a saturation *generator*: wrapping an API produces many low-value, mutually-confusable tools.
- **Mechanism 1's premise:** large surfaces cost "hundreds of thousands of tokens before reading a request" [CXM], and "Tool descriptions occupy more context window space, increasing response time and costs" [CXM].
- **Mechanism 2's premise:** descriptions "collectively steer agents" [WTA] — selection is a joint function of the whole surface, so the surface's size and confusability structure are selection inputs.
- **The mitigation direction is the source's own:** build "a few thoughtful tools targeting specific high-impact workflows, which match your evaluation tasks" [WTA]; consolidate (`schedule_event`, `search_logs`, `get_customer_context`) [WTA]; namespace to "reduce the number of tools and tool descriptions loaded into the agent's context" [WTA]; present tools as a filesystem for on-demand loading [CXM].
- **Indirect evidence of the effect's sign:** [WTA]'s optimized tool surfaces beat human-written ones on held-out sets, and the optimization explicitly included consolidation and removal — i.e., *fewer, better* tools measured *higher*.
- **The harness-composition analogue:** HarnessX documents that harness configuration has non-trivial, sometimes negative, interactions across its nine dimensions [HX §3–4], and that naive additions can trigger pathologies — the same "more is not monotone" lesson at the harness level.

**Evidence gap, restated because it is the topic's spine:** the *mechanisms* are sourced; the *curve* is not measured anywhere in this chapter's ledger. §8 is the only honest way to get a number.

## 6. Implementation

**Make the surface's cost and confusability visible**, so accretion is a decision rather than a drift:

```python
def surface_health(tools: list[ToolContract], usage: UsageLog, model) -> dict:
    cost = surface_cost(tools, model)                          # Topic 6
    # Never-used tools: pure cost, zero benefit — the first thing to cut.
    never_used = [t.name for t in tools if usage.calls(t.name) == 0]
    # Confusability: tools whose descriptions are near-duplicates (Topic 4, §3.3).
    confusable = [(a.name, b.name) for a, b in combinations(tools, 2)
                  if domains_overlap(a, b) and description_similarity(a, b) > 0.7]
    return {
        "n_tools": len(tools),
        "def_tokens_per_turn": cost["per_turn_all_loaded"],
        "def_fraction_of_prompt": cost["per_turn_all_loaded"] / typical_prompt_tokens(),
        "never_used": never_used,                    # cut these
        "confusable_pairs": confusable,              # merge or disambiguate these
        "usage_gini": gini([usage.calls(t.name) for t in tools]),  # concentration
    }
```

Two outputs drive action. **`never_used`** — a tool called zero times across a representative window is pure Mechanism-1 cost with no benefit; it is the cut that is always safe. **`confusable_pairs`** — the tools driving Mechanism 2; each pair is a merge (Topic 4) or a boundary clause. A high `usage_gini` (a few tools do all the work, a long tail does nothing) is the signature of a surface deep in the saturated regime.

**The addition gate — make growth pay for itself:**

```python
def gate_new_tool(candidate, current_surface, eval_suite, ctx) -> Decision:
    """A new tool must improve the WHOLE surface, not just its own tasks (Topic 13)."""
    before = run_eval(current_surface, eval_suite, ctx)          # Topic 13, factored
    after  = run_eval(current_surface + [candidate], eval_suite, ctx)
    # The decisive comparison: Pr(Z_s) on tasks the new tool is NOT for.
    unrelated_delta = after.pr_zs_on(eval_suite.unrelated_to(candidate)) \
                    - before.pr_zs_on(eval_suite.unrelated_to(candidate))
    if unrelated_delta < -CLUSTERED_BOOTSTRAP_MARGIN:
        return Decision.deny(
            f"{candidate.name} degrades unrelated-task selection by "
            f"{-unrelated_delta:.3f} — net-negative despite serving its own tasks."
        )
    return Decision.allow()
```

This gate operationalizes the topic. **A tool is admitted only if the whole surface holds or improves — measured on the tasks the tool is *not* for**, because that is where saturation shows. A tool that helps its own tasks and quietly taxes the rest is exactly the accretion this chapter warns against, and this gate catches it at the door.

## 7. Trade-offs

| Response to saturation | Buys | Costs |
|---|---|---|
| Add fewer tools | Simplicity | Capability you genuinely wanted |
| Consolidate (Topic 4) | Fewer, higher-affordance tools | Less flexible individual tools |
| Namespace (Topic 6) | Lower confusability | Model-dependent; measure it |
| Defer / tool-search (Topic 6) | $\mathcal V\ll\mathcal U_c$ | Retriever recall becomes the ceiling |
| Code execution (Topic 8) | $\mathcal V\to 1$; huge $\mathcal U_c$ | Sandbox; the model must write code |
| Cut never-used tools | Free win | Someone has to notice they are unused |

**The trade the whole chapter has been building toward.** Every mitigation decouples *capability* ($|\mathcal U_c|$) from *visible surface* ($|\mathcal V|$). Saturation is a property of $|\mathcal V|$, not $|\mathcal U_c|$ — so the resolution is never to cap your ambitions, but to stop showing the model everything at once. **A system with a thousand tools and a five-tool visible set is not saturated.** The failure is not having many capabilities; it is presenting them undifferentiated. This is why Topic 15 is the chapter's conclusion and not its warning label: it retroactively explains why Topics 4, 6, and 8 were worth their complexity.

## 8. Experiments

**The saturation curve — the experiment this chapter most wants you to run**, because nobody has published it for your workload.

**Design.** Fix the model, the task suite, and the harness. Vary $N$ = the visible tool set, from a minimal core to the full surface, adding tools in a controlled order. At each $N$, run Topic 13's factored evaluation.

**Metrics at each $N$:**
- $\Pr(Z_s)$ on **core tasks** — the tasks the base tools serve. **This is the saturation signal:** it should be roughly flat, then decline as confusable tools accumulate.
- $\Pr(Z_s)$ on the newly-added tools' own tasks — the local benefit.
- Spurious-call rate on negative tasks — over-triggering, which rises with $N$.
- Total tokens and latency — Mechanism 1, directly.
- Aggregate task completion $G$ — the single-peaked curve of §4.

**Two addition orders, run separately** — this isolates the two mechanisms and is the design's key idea:
- **Confusable-first:** add tools that overlap existing domains. Predicts a *steep* $\Pr(Z_s)$ decline — Mechanism 2 dominant.
- **Unrelated-first:** add tools in disjoint domains. Predicts a *gentle* decline dominated by token cost — Mechanism 1 dominant.

If the two orders produce different curves, you have empirically separated confusability from context cost — and you know which mitigation (disambiguation vs. deferral) your surface needs.

**Acceptance / decision output.** The turning point in $G(N)$ is your surface's practical capacity *at the current visible-set strategy*. If it sits below the number of tools you need, that is not a verdict against the tools — it is the trigger to move $\mathcal V$ below $\mathcal U_c$ (Topics 6, 8) and re-run. The curve tells you *which* mitigation to reach for and *when* it becomes mandatory.

**Statistics.** Paired across $N$ where possible; task-clustered bootstrap for each point's interval; Wilson intervals on $\Pr(Z_s)$; do **not** over-interpret a single $N$'s point estimate — the *shape* is the finding, and the shape needs intervals at each point to be real (Chapter 1, Topic 12).

**Reproducibility.** Surface hash at each $N$; pinned model; held-out tasks. And re-run on model upgrade — the turning point is model-capacity-dependent (§3.2) and does not transfer (Chapter 4, Topic 13's Tier 3).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Accretion.** Tools added one-at-a-time, each locally justified, the aggregate silently degrading. **The default failure mode of every tool surface.** Mitigation: the §6 addition gate; measure on *unrelated* tasks.
- **The monotonicity assumption.** "More capability is more better." Refuted by [WTA] and by §3's mechanisms. Mitigation: internalize single-peakedness.
- **Optimizing the marginal tool.** Judging an addition by the tasks it serves. Mitigation: judge it by the whole surface (§6 gate).
- **The never-used tool.** Pure cost, invisible until you look. Mitigation: `surface_health`; cut on sight.
- **Confusable additions.** The expensive kind of growth; a new tool overlapping an existing one. Mitigation: `confusable_pairs`; merge or disambiguate (Topic 4).
- **Mistaking the mitigation for the problem.** Concluding "we must limit capability." Mitigation: understand that saturation is about $|\mathcal V|$, not $|\mathcal U_c|$ — decouple them (§4, §7).
- **Inventing a turning-point number.** Quoting a universal saturation threshold. **There isn't one** (§3.3). Mitigation: measure locally; distrust any cited universal.
- **Edge case — a genuinely more capable model raises the turning point**, so a surface that saturated last quarter may be fine after an upgrade — or a *less* patient model may saturate *earlier*. Either way the point moved. Mitigation: re-run §8 on model change.
- **Open limitation.** **The curve is unmeasured in the public literature.** This topic gives you the mechanisms (sourced) and the experiment (yours to run). The magnitude is, and will remain until you measure it, unknown for your system — and that is the honest state of the art, not a gap in this chapter's diligence.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. "More tools don't always lead to better outcomes" [WTA] — from the party that measures it internally.
2. Large surfaces impose large, per-turn context costs [CXM] — Mechanism 1.
3. Selection is a joint comparison over the whole visible surface [WTA] — Mechanism 2.
4. Optimized surfaces (fewer, consolidated tools) measured *higher* on held-out sets than human-written ones [WTA] — the effect's sign.
5. **The saturation curve and its turning point are unmeasured in this chapter's sources.** The shape is argued from sourced mechanisms; the magnitude is local and must be measured.

**Decision rules.**
- **A new tool must improve the whole surface, measured on the tasks it is *not* for**, or it does not ship (§6 gate).
- **Cut never-used tools on sight.** Pure cost.
- **A new tool confusable with an existing one is a merge or a boundary clause, not an addition.**
- **Saturation is a $|\mathcal V|$ problem.** Fix it by decoupling visible surface from capability (Topics 6, 8), never by capping ambition.
- **Never trust a universal turning-point number.** Measure yours; re-measure on model change.

**Production implications.**
1. Put `surface_health` on a dashboard; a rising tool count with a rising `usage_gini` is saturation in progress.
2. Gate every tool addition on whole-surface, unrelated-task measurement (§6). This is the single control that stops accretion.
3. Run the §8 saturation curve once per major surface or model change; the turning point is a real operating parameter, not a curiosity.
4. When the turning point sits below your capability needs, that is the signal to adopt deferral or code execution — not to remove tools.

**Connections.** This topic is the destination of the whole chapter: Topic 4's comparative selection is Mechanism 2; Topic 6's token cost is Mechanism 1; Topics 6 and 8's architectures are the mitigations; Topic 13's instrument is what makes the claim testable; Topic 1's surface hash makes the curve reproducible. Beyond the chapter: Chapter 6 (context engineering) is Mechanism 1 generalized to all context, not just tools; Chapter 3, Topic 12 (harness entropy) is the same accretion pathology at the harness level; HarnessX's non-monotone composition results [HX §3–4] are the harness-scale analogue of this topic's central claim.

## Sources

[WTA] Anthropic, "Writing effective tools for agents — with agents" — "More tools don't always lead to better outcomes. A common error we've observed is tools that merely wrap existing software functionality or API endpoints"; build "a few thoughtful tools targeting specific high-impact workflows, which match your evaluation tasks"; consolidation examples; namespacing to "reduce the number of tools and tool descriptions loaded into the agent's context"; descriptions "collectively steer agents"; held-out-set accuracy gains from optimized (consolidated, fewer) tools — https://www.anthropic.com/engineering/writing-tools-for-agents
[CXM] Anthropic, "Code execution with MCP" — "Tool descriptions occupy more context window space, increasing response time and costs"; "hundreds of thousands of tokens before reading a request"; filesystem presentation for on-demand loading — https://www.anthropic.com/engineering/code-execution-with-mcp
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §3–4 — non-monotone interactions across harness configuration dimensions; naive additions triggering pathologies (the harness-level analogue of tool-surface saturation)
