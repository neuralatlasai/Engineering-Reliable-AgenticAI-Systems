# Topic 2 — Sequential, Parallel, Conditional, Map–Reduce, Evaluator–Optimizer, and Generator–Critic Patterns

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The composable workflow patterns — the vocabulary for building structures on Topic 1's axis. [BEA] names five; the README names six; this topic reconciles them and adds what each buys, costs, and requires.

**Prerequisites.** Topic 1 (the autonomy axis; W-1 minimize $K_M$); Chapter 2, Topic 2 (test-time compute — several patterns spend it); Chapter 5, Topic 5 (effect classes — parallelism is only safe for reads).

**Terminology.** Per [BEA]: *prompt chaining* (sequential), *routing* (conditional — Topic 3), *parallelization* with *sectioning* and *voting* subtypes, *orchestrator-workers* (map–reduce with a dynamic map), *evaluator-optimizer* (generator–critic).

**Boundaries.** Inside: the patterns, their control semantics, composition rules, and applicability. Outside: routing in depth (Topic 3); orchestrator-workers as a multi-agent *architecture* (Topic 4); termination of the iterative patterns (Topic 11).

**Exclusions.** No framework-specific DSL.

**Outcomes.** The reader can select a pattern from its applicability condition, compose patterns into a structure, and state what each costs.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Topic 1 established *where* on the autonomy axis to sit; this topic is *how to build there*. Without a pattern vocabulary, teams build ad-hoc control flow: a bespoke sequence here, a hand-rolled retry loop there, no name for what they built and no way to reason about its properties. The patterns are the reusable, analyzable units — each with known control semantics, a known applicability condition, and known costs.

**Bottleneck.** Patterns are usually selected by familiarity rather than by their applicability condition. The result: an evaluator-optimizer loop where a single call would do (spending test-time compute on a task with no clear evaluation criteria), or a fixed sequence where parallelization would halve the latency, or an orchestrator-workers pattern where a fixed map would suffice. **Each pattern has a *precondition* [BEA] states explicitly, and applying a pattern outside its precondition pays its cost for none of its benefit.**

**Objective.** Select patterns by precondition, compose them correctly, and know each one's cost.

**Assumptions.** Patterns compose (a pattern's step can be another pattern). Each pattern's benefit is conditional on its precondition holding.

**Constraints.** Parallelism requires independence (and, for effects, read-only — Chapter 5, Topic 5, E3). Iterative patterns (evaluator-optimizer) require a termination guarantee (Topic 11) and a *usable* evaluation signal.

**Success criteria.** Every pattern in the system satisfies its precondition; latency-critical independent work is parallelized; iterative patterns terminate and their evaluation signal is real.

## 3. Intuition first, then formalization

### 3.1 Intuition: six patterns, six preconditions

Each pattern is a control shape with a **precondition** — the property the task must have for the pattern to pay off. [BEA] states these directly, and the precondition, not the shape, is what should drive selection.

- **Sequential (prompt chaining)** — steps in order, "each LLM call processes the output of the previous one," with optional "programmatic gates" for validation [BEA]. **Precondition:** the task "can be easily and cleanly decomposed into fixed subtasks" [BEA]. *Buys:* higher accuracy (each call does less, so does it better). *Costs:* latency (serial); error propagates down the chain. **The programmatic gate is the underused part** — a deterministic check between steps that catches an error before it propagates, which is Chapter 3, Topic 7's invariant, applied between workflow steps.

- **Conditional (routing)** — "classifies an input and directs it to a specialized followup task" [BEA]. **Precondition:** "distinct categories that are better handled separately" [BEA]. *Buys:* specialization (each branch's prompt is tuned for its category). *Costs:* one classification decision ($K_M$ +1) and a misroute risk. Topic 3 in depth.

- **Parallel — sectioning** — independent subtasks run concurrently [BEA]. **Precondition:** "the divided subtasks can be parallelized" [BEA] — i.e., they are *independent*. *Buys:* latency (wall-clock, not total compute). *Costs:* nothing on reliability if truly independent; **corruption if not** (Chapter 5, Topic 5's E3 — parallelism is safe for reads, dangerous for writes to shared state).

- **Parallel — voting** — "running identical tasks multiple times for diverse outputs" [BEA]. **Precondition:** "multiple perspectives" are beneficial [BEA]. *Buys:* reliability through redundancy — this is test-time compute (Chapter 2, Topic 2) spent on *variance reduction*. *Costs:* $n\times$ the compute for one task.

- **Map–reduce / orchestrator-workers** — a central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results" [BEA]. **Precondition:** "complex tasks where you can't predict the subtasks needed" [BEA]. *Buys:* a dynamic decomposition — the map is *decided at runtime*. *Costs:* the orchestrator's decision is model-directed ($K_M$), and the synthesis is another model call. **The key distinction from a static map–reduce: if you *can* predict the subtasks, use a fixed map (deterministic, $K_M$=0 for the decomposition); orchestrator-workers is for when you cannot** [BEA].

- **Evaluator–optimizer / generator–critic** — "one LLM call generates a response while another provides evaluation and feedback in a loop" [BEA]. **Precondition:** "clear evaluation criteria" exist AND "iterative refinement provides measurable value" [BEA]. *Buys:* quality through iteration. *Costs:* multiple rounds of compute; **and it fails silently when the precondition does not hold** — an evaluator without clear criteria produces noise, and the loop optimizes toward the noise.

The intuition that unifies them: **each pattern is a way of spending compute to buy something — accuracy (chaining), specialization (routing), latency (sectioning), reliability (voting), flexibility (orchestrator-workers), or quality (evaluator-optimizer) — and each purchase is only valid if the task has the property the pattern requires.**

### 3.2 Formalization: the patterns as control operators, and their compositions

Let a step be an operator on state. The patterns are combinators **[synthesis; the patterns are [BEA]'s, the combinator framing is ours]**:

$$
\textbf{Seq}(f_1,\ldots,f_n) = f_n \circ \cdots \circ f_1
\qquad\text{with gates: } \textbf{Seq}_g = f_n \circ g_{n-1} \circ \cdots \circ g_1 \circ f_1
$$
$$
\textbf{Par}_{\text{sect}}(f_1,\ldots,f_n)(x) = \textrm{merge}\bigl(f_1(x_1),\ldots,f_n(x_n)\bigr)
\quad\text{where } x_i \text{ are \emph{independent} sections}
$$
$$
\textbf{Par}_{\text{vote}}(f, n)(x) = \textrm{aggregate}\bigl(f(x)^{(1)},\ldots,f(x)^{(n)}\bigr)
\quad\text{— same } f,\ n \text{ samples}
$$
$$
\textbf{Cond}(c, \{f_k\})(x) = f_{c(x)}(x)
\qquad\text{where } c \text{ is a classifier (Topic 3)}
$$
$$
\textbf{OrchWork}(o, w)(x) = o_{\text{synth}}\bigl(\{w(t) : t \in o_{\text{decompose}}(x)\}\bigr)
\quad\text{— decomposition is \emph{model-directed}}
$$
$$
\textbf{EvalOpt}(g, e)(x) = \textrm{iterate}\bigl(y \mapsto g(y, e(y))\bigr)\ \text{until } e(y) \ \text{accepts or budget}
$$

Two invariants govern their correct use **[derived]**:

$$
\textbf{P-1 (parallelism requires independence):}\quad
\textbf{Par}\ \text{is valid only if the branches share no mutable state and no write effects (Ch.5 T5, E3).}
$$

P-1 is Chapter 5, Topic 5's E3 at the workflow layer: **parallel branches are safe if they are reads; parallel branches that write to shared state corrupt it.** [BEA]'s sectioning precondition ("can be parallelized") *is* this independence requirement, and violating it is not a slowdown — it is a data race.

$$
\textbf{P-2 (iteration requires a real signal and a bound):}\quad
\textbf{EvalOpt}\ \text{is valid only if } e \ \text{is a \emph{genuine} evaluation signal AND a termination bound exists (Topic 11).}
$$

P-2 has two halves and both fail in practice. **The signal half:** [BEA]'s precondition is "clear evaluation criteria" — an evaluator without them produces noise, and iterating against noise is worse than not iterating (it *actively degrades*, optimizing toward a meaningless gradient). **The bound half:** an evaluator-optimizer loop is a loop, so it needs a termination guarantee (Topic 11) — and the evaluator is a *model*, so its "accept" is a proposal, not a verdict (Chapter 3, Topic 8's $\kappa$ discipline: the code, not the model, decides when the loop ends).

$$
\textbf{P-3 (dynamic decomposition only when static fails):}\quad
\textbf{OrchWork}\ \text{is warranted only when the subtasks \emph{cannot} be predicted [BEA]; otherwise a static map (}\textbf{Par}_{\text{sect}}\text{) is strictly better} (K_M \text{ lower — W-1}).
$$

P-3 is Topic 1's W-2 (autonomy is a feasibility purchase) applied to decomposition: **a model-directed decomposition costs a $K_M$; a static one costs zero.** Use the dynamic version only when the static one is infeasible.

### 3.3 Voting is test-time compute spent on variance, and it has a ceiling

The voting pattern deserves its own analysis because it is the one pattern that buys *reliability* directly, and its economics are specific **[synthesis; grounded in [BEA] and Chapter 2, Topic 2]**.

Voting runs the same task $n$ times and aggregates. It reduces *variance* — the run-to-run randomness of a stochastic policy (Chapter 2, Topic 1). If the model is *right on average* but noisy, voting recovers the average and suppresses the noise: $n$ samples, majority (or best-of-$n$ under a verifier).

But voting has a **hard ceiling**: it cannot fix *bias*. If the model is *systematically* wrong on a task — it misunderstands the requirement, it lacks the knowledge — then all $n$ samples are wrong in the same way, and the majority is confidently wrong. **Voting reduces variance, not bias**, and the two failure modes look identical from the outside (a wrong answer) while responding oppositely to the pattern (voting fixes one, wastes $n\times$ compute on the other).

The diagnostic **[derived]**: if the model's samples *disagree* with each other, the error is variance-like and voting helps. If they *agree and are wrong*, the error is bias-like and voting is pure cost. **Measure sample disagreement before paying for voting** — high disagreement justifies it; low disagreement with low accuracy means voting will not save you, and the fix is elsewhere (better context, a different model, a different decomposition).

## 4. Architecture

```
   SEQUENTIAL (prompt chaining) — precondition: cleanly decomposable into FIXED subtasks
   x ─► f₁ ─►[GATE]─► f₂ ─►[GATE]─► f₃ ─► y
              ↑ deterministic check catches error BEFORE it propagates (Ch.3 T7)

   CONDITIONAL (routing) — precondition: distinct categories better handled separately
   x ─► classify ─┬─► branch_A (specialized prompt)
                  ├─► branch_B
                  └─► branch_C                          [Topic 3]

   PARALLEL — SECTIONING — precondition: subtasks INDEPENDENT (P-1!)
   x ─┬─► f₁(x₁) ─┐
      ├─► f₂(x₂) ─┼─► merge ─► y      buys LATENCY (wall-clock)
      └─► f₃(x₃) ─┘                   P-1: reads safe; shared writes CORRUPT (Ch.5 T5 E3)

   PARALLEL — VOTING — precondition: multiple perspectives valuable
   x ─┬─► f(x)⁽¹⁾ ─┐
      ├─► f(x)⁽²⁾ ─┼─► aggregate ─► y   buys RELIABILITY (variance, NOT bias — §3.3)
      └─► f(x)⁽ⁿ⁾ ─┘                    ceiling: agreeing-and-wrong ⇒ voting is pure cost

   ORCHESTRATOR-WORKERS (dynamic map–reduce) — precondition: subtasks UNPREDICTABLE
   x ─► orchestrator.decompose ─┬─► worker(t₁) ─┐
        (MODEL-DIRECTED, K_M+1) ├─► worker(t₂) ─┼─► orchestrator.synthesize ─► y
                                └─► worker(t₃) ─┘
        P-3: if subtasks ARE predictable → use static Par_sect (K_M=0, strictly better)

   EVALUATOR-OPTIMIZER (generator–critic) — precondition: CLEAR criteria + measurable value
   x ─► generate ─► y ─► evaluate ─┬─ accept ─► y     P-2: signal must be REAL;
              ▲                    │                        CODE owns termination
              └──── feedback ◄─────┘ reject                 (Ch.3 T8: eval "accept"
                                     (bounded — Topic 11)    is a PROPOSAL)
```

**The patterns compose, and composition is the practical architecture.** A router whose branch B is a sequential chain whose step 2 is a parallel sectioning whose merge feeds an evaluator-optimizer. **Composition is how Chapter 1, Topic 9's "workflows dominate" is realized: a mostly-deterministic composition of patterns, with model-directed steps only at the classifier, the orchestrator's decomposition, and the generator.**

## 5. Grounding

- **The five patterns, named and defined:** prompt chaining ("each LLM call processes the output of the previous one," with "programmatic gates"); routing ("classifies an input and directs it to a specialized followup task"); parallelization with sectioning ("breaking tasks into independent parallel subtasks") and voting ("running identical tasks multiple times for diverse outputs"); orchestrator-workers (a central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results"); evaluator-optimizer ("one LLM call generates a response while another provides evaluation and feedback in a loop") [BEA].
- **The preconditions, stated per pattern:** chaining for tasks "easily and cleanly decomposed into fixed subtasks"; routing for "distinct categories that are better handled separately"; parallelization "when the divided subtasks can be parallelized for speed, or when multiple perspectives" help; orchestrator-workers for "complex tasks where you can't predict the subtasks needed"; evaluator-optimizer when "clear evaluation criteria" exist and "iterative refinement provides measurable value" [BEA]. **The preconditions are the selection criteria, and they are sourced.**
- **Deterministic composition primitives ship in SDKs:** ADK's Sequential, Parallel, and Loop workflow agents [ADK-A] — the patterns as first-class objects (Topic 13).
- **Parallelism safety is an effect-class property:** Chapter 5, Topic 5's E3 (parallel dispatch admissible only for reads or provably disjoint writes) and [CAL]'s documented parallel-read/serial-write rule — P-1's basis.
- **Iteration needs code-owned termination:** Chapter 3, Topic 8 ($\kappa$: the model's "done" is a proposal) — P-2's second half.
- **Voting is test-time compute:** Chapter 2, Topic 2 (test-time compute spent for reliability) — §3.3's economics.
- **The PEV loop:** [CAH §3.4]'s Plan–Execute–Verify is an evaluator-optimizer at the harness layer — the verify stage is the evaluator, with the crucial difference that CAH's verifiers are *deterministic sensors*, not model judges (Chapter 3, Topic 7). **A deterministic verifier makes evaluator-optimizer far stronger than a model-judge version**, because P-2's signal is real by construction.

**Evidence gap, stated plainly.** [BEA] names the patterns and their preconditions — **but publishes no measured comparison.** There is no benchmark of chaining vs single-call, no measured latency gain from sectioning, no accuracy gain from voting at $n$, no orchestrator-workers-vs-static-map comparison. **The patterns are a sourced design vocabulary with sourced applicability heuristics; their effect sizes are unmeasured in the sources.** The combinator formalization and P-1..P-3 are **[synthesis/derived]** (P-1 from Chapter 5, Topic 5's E3; P-2 from Chapter 3, Topic 8; P-3 from Topic 1's W-2). The voting variance-vs-bias analysis (§3.3) is **[derived]** from standard estimator reasoning, not measured here. §8 measures locally.

## 6. Implementation

**Sequential with the gate — the underused part [BEA]:**

```python
def sequential(x, steps, gates):
    """[BEA]: 'programmatic gates' between steps catch errors BEFORE they propagate.
    The gate is Ch.3 T7's deterministic invariant, applied between workflow steps."""
    for step, gate in zip(steps, gates):
        x = step.run(x)
        if not gate(x):                      # DETERMINISTIC check — not a model judge
            raise WorkflowGateFailed(f"{step.name} output failed gate: {gate.describe()}")
    return x
```

**Parallel sectioning with the P-1 safety check:**

```python
async def parallel_sectioning(x, sections):
    """P-1: parallelism is safe ONLY if branches are independent (Ch.5 T5 E3).
    Shared WRITES corrupt; this is a data race, not a slowdown."""
    assert all(s.effect is Effect.READ for s in sections) or disjoint_writes(sections), \
        "P-1 VIOLATED: parallel branches with overlapping writes will corrupt state (Ch.5 T5)"
    results = await asyncio.gather(*[s.run(x.section(i)) for i, s in enumerate(sections)])
    return merge(results)
```

**Voting, with the variance-vs-bias diagnostic (§3.3):**

```python
async def voting(x, f, n: int):
    """Buys RELIABILITY by reducing VARIANCE. Cannot fix BIAS (§3.3).
    Diagnostic: if samples AGREE and are wrong, voting is pure cost — fix elsewhere."""
    samples = await asyncio.gather(*[f(x) for _ in range(n)])
    agreement = disagreement_rate(samples)
    if agreement < LOW_DISAGREEMENT:
        log.warning(f"voting: samples agree ({agreement:.2f}) — if accuracy is low, this is "
                    f"BIAS not variance; voting wastes {n}x compute. Fix context/model/decomp.")
    return aggregate(samples)                # majority, or best-of-n under a VERIFIER
```

**Evaluator-optimizer with P-2's two guards:**

```python
def evaluator_optimizer(x, generate, evaluate, max_rounds: int):
    """P-2: (a) the signal must be REAL; (b) CODE owns termination (Ch.3 T8).
    A model evaluator's 'accept' is a PROPOSAL, not a verdict."""
    assert evaluate.has_clear_criteria, \
        "P-2: evaluator without clear criteria produces NOISE — iterating against noise DEGRADES"

    y = generate(x)
    for round in range(max_rounds):          # CODE owns the bound (Topic 11)
        verdict = evaluate(y)                # prefer a DETERMINISTIC verifier ([CAH] PEV)
        if verdict.accepted and code_accepts(y, verdict):   # code confirms, not just the model
            return y, "success"
        y = generate(x, feedback=verdict.feedback)
    return y, "budget"                        # κ = budget, NOT success (Ch.1 T12)
```

## 7. Trade-offs

| Pattern | Buys | Costs | Fails when |
|---|---|---|---|
| Sequential | Accuracy (each call does less) | **Latency** (serial); error propagates | Task not cleanly decomposable |
| + gates | Error caught before propagating | A gate to write | (gates are near-free — use them) |
| Conditional | Specialization per category | 1 classification ($K_M$+1); misroute risk | Categories not distinct |
| Parallel-sectioning | **Latency** (wall-clock) | None on reliability *if independent* | **Branches share writes → corruption (P-1)** |
| Parallel-voting | **Reliability** (variance ↓) | $n\times$ compute | **Error is bias, not variance (§3.3)** |
| Orchestrator-workers | Dynamic decomposition | $K_M$+1 (decompose) + synthesis call | **Subtasks were predictable → static map better (P-3)** |
| Evaluator-optimizer | Quality via iteration | Multiple rounds; unbounded if unguarded | **No clear criteria → optimizes toward noise (P-2)** |

**The trade that decides pattern selection: each pattern's cost is unconditional; its benefit is conditional on the precondition.** A voting pattern costs $n\times$ compute *always* and buys reliability *only if the error is variance-like*. An evaluator-optimizer costs multiple rounds *always* and buys quality *only if the evaluation signal is real*. **This asymmetry is why the preconditions [BEA] states are the selection criteria, not afterthoughts** — applying a pattern outside its precondition is paying full price for nothing.

**The most valuable and most-skipped element: the programmatic gate.** [BEA] mentions it in passing ("optional programmatic gates"), and it is nearly free — a deterministic check between chain steps. It converts a chain's worst property (error propagates down the sequence, compounding) into a bounded one (error caught at the gate). **In a sequential chain, a gate between every pair of steps turns compounding error into caught error, at the cost of writing the checks** — which is Chapter 3, Topic 7's deterministic-invariant discipline, and it is the highest-return line in this topic.

## 8. Experiments

**The precondition test — the experiment that validates pattern selection.** For each pattern in your system, test whether its precondition actually holds:

- **Sectioning:** are the branches truly independent? Inject a shared-write and see if it corrupts (P-1).
- **Voting:** measure sample *disagreement*. **Low disagreement + low accuracy = bias, and voting is pure cost** (§3.3). This single measurement can save $n\times$ compute.
- **Evaluator-optimizer:** does the evaluator's score *correlate with actual quality*? **An evaluator whose score does not predict quality is noise, and the loop is optimizing toward it** — measure the correlation before trusting the loop.
- **Orchestrator-workers:** could the decomposition have been static? If the orchestrator produces the *same* decomposition every time, it is a static map with a $K_M$ tax (P-3).

**Pattern-vs-baseline ablations.** Each pattern against the simpler alternative it replaced:
- Chaining vs a single call ([BEA]: "Optimizing single LLM calls… is usually enough").
- Voting at $n$ vs $n=1$ — measure the accuracy gain per unit of compute. **Sweep $n$; the gain saturates.**
- Evaluator-optimizer vs single-shot generation — is the iteration buying measurable quality [BEA]'s precondition?
- Orchestrator-workers vs static map — the P-3 test.

**Metrics:** completion, latency (wall-clock — the point of parallelism), cost, $K_M$, and $\kappa$ distribution (Chapter 1, Topic 12).

**Statistics.** Paired; McNemar on completion; task-clustered bootstrap; Holm across patterns; **report latency as p50/p95** (parallelism's benefit is in the tail); predeclare the primary endpoint.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Parallel branches sharing writes.** P-1 violated; state corruption, not slowdown. **The dangerous parallelism failure.** Mitigation: reads-only or provably disjoint writes (Chapter 5, Topic 5, E3); the assertion (§6).
- **Voting against bias.** $n\times$ compute for zero gain; all samples agree and are wrong (§3.3). Mitigation: measure disagreement first.
- **Evaluator without clear criteria.** The loop optimizes toward noise and *degrades* the output. **Worse than not iterating.** Mitigation: P-2 — verify the evaluator's score predicts quality; prefer deterministic verifiers ([CAH]'s PEV).
- **Model evaluator's "accept" trusted as a verdict.** Chapter 3, Topic 8's error — the model's judgment ends the loop. Mitigation: code confirms termination.
- **Unbounded evaluator-optimizer.** No round limit; the loop runs forever. Mitigation: code owns the bound (Topic 11).
- **Orchestrator-workers where a static map would do.** $K_M$ tax for no flexibility gain (P-3). Mitigation: check whether the decomposition varies; if not, make it static.
- **Sequential chain with no gates.** Error at step 1 propagates and compounds through steps 2..n. Mitigation: gates between steps — the highest-return, lowest-cost element in the topic.
- **Chaining a task that is not cleanly decomposable.** The chain's steps do not correspond to real subtasks; each step's output is a poor input to the next. Mitigation: [BEA]'s precondition — "easily and cleanly decomposed into *fixed* subtasks."
- **Edge case — patterns that look alike.** Voting and sectioning are both "parallel" but have *opposite* preconditions: sectioning needs the subtasks to be *different and independent*; voting needs them to be *identical*. Confusing them produces either a redundant sectioning (same work $n$ times, merged as if different) or a broken vote (different work, aggregated as if the same).
- **Open limitation.** **[BEA] names the patterns and preconditions but measures none of them.** No pattern-vs-baseline effect sizes, no voting-saturation curve, no latency figures. The patterns are a *sourced vocabulary*; P-1..P-3 are **[derived]** from Chapters 3 and 5; the voting variance/bias analysis is **[derived]** from estimator reasoning. All magnitudes are local (§8).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Five patterns are named with explicit preconditions: chaining, routing, parallelization (sectioning/voting), orchestrator-workers, evaluator-optimizer [BEA].
2. Chaining suits tasks "easily and cleanly decomposed into fixed subtasks" and supports "programmatic gates" [BEA].
3. Orchestrator-workers suits tasks where "you can't predict the subtasks needed" [BEA] — otherwise a static map is better (P-3).
4. Evaluator-optimizer requires "clear evaluation criteria" and that "iterative refinement provides measurable value" [BEA].
5. Deterministic Sequential/Parallel/Loop primitives ship as SDK objects [ADK-A].
6. Parallelism is safe for reads, dangerous for shared writes (Chapter 5, Topic 5; [CAL]).
7. **No source measures any pattern's effect size.**

**Decision rules.**
- **Select a pattern by its precondition, not its familiarity** — the cost is unconditional, the benefit is not.
- **Put a programmatic gate between every chain step** [BEA] — near-free, and it stops error propagation.
- **Parallelize only independent branches** (P-1) — shared writes corrupt.
- **Measure sample disagreement before voting** — agreement + low accuracy = bias, and voting is pure cost.
- **An evaluator without a validated signal degrades the output** (P-2) — prefer a deterministic verifier.
- **Static map beats orchestrator-workers whenever the subtasks are predictable** (P-3, W-1).
- **Code owns termination in every iterative pattern** (Chapter 3, Topic 8).

**Production implications.**
1. Add gates to your sequential chains; it is the cheapest reliability improvement in the chapter.
2. Measure voting's disagreement rate; if samples agree and are wrong, you are paying $n\times$ for nothing.
3. Validate every evaluator's signal against actual quality before trusting the loop — an unvalidated evaluator makes the output *worse*.
4. Check whether your orchestrator's decomposition ever varies; if not, make it static and reclaim a $K_M$.
5. Assert P-1 on every parallel section; a shared write is a race, and races are silent.

**Connections.** These patterns build structures on Topic 1's axis, minimizing $K_M$ (W-1) by using deterministic composition wherever the precondition allows. Routing is Topic 3; orchestrator-workers becomes an architecture in Topic 4 and a topology question in Chapter 9. Gates are Chapter 3, Topic 7's invariants; parallelism safety is Chapter 5, Topic 5's E3; iterative termination is Topic 11 and Chapter 3, Topic 8. The evaluator-optimizer's deterministic-verifier variant is [CAH]'s PEV loop (Chapter 3). Topic 13 compares the SDK implementations.

## Sources

[BEA] Anthropic, "Building effective agents" — prompt chaining ("each LLM call processes the output of the previous one"; "programmatic gates"; for tasks "easily and cleanly decomposed into fixed subtasks"); routing ("classifies an input and directs it to a specialized followup task"; for "distinct categories that are better handled separately"); parallelization — sectioning ("breaking tasks into independent parallel subtasks") and voting ("running identical tasks multiple times for diverse outputs"); orchestrator-workers (a central LLM "dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results"; for "complex tasks where you can't predict the subtasks needed"); evaluator-optimizer ("one LLM call generates a response while another provides evaluation and feedback in a loop"; requires "clear evaluation criteria" and that "iterative refinement provides measurable value"); "Optimizing single LLM calls with retrieval and in-context examples is usually enough" — https://www.anthropic.com/engineering/building-effective-agents
[ADK-A] Google ADK agents — Sequential, Parallel, and Loop workflow agents as first-class deterministic composition primitives — https://adk.dev/agents/
[CAL] Claude Agent SDK — parallel execution for read-only tools, serialized for writes — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4 — the Plan–Execute–Verify loop as an evaluator-optimizer whose verifier is a *deterministic sensor* rather than a model judge
