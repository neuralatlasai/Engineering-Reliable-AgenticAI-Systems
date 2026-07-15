# Topic 5 — Parallel Exploration and Diversity-Aware Result Synthesis

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The mechanism that makes the supervisor topology pay: **many agents exploring *different* directions in parallel, then a synthesis that preserves what was different about them.** Both halves fail in characteristic ways — exploration that isn't diverse (duplicate work) and synthesis that isn't diversity-aware (the distinctive findings get averaged away).

**Prerequisites.** Topic 2 (the duplicate-work tax; [MAR]'s documented 2-of-3 failure); Topic 3 (the delegation contract's `boundaries` field); Chapter 8, Topic 6 (aggregation and failure laundering — which recurs here in a new form).

**Terminology.** *Parallel exploration*: subagents investigating different aspects simultaneously. *Diversity*: the degree to which their explorations differ. *Synthesis*: combining findings into one answer.

**Boundaries.** Inside: making exploration diverse and synthesis diversity-preserving. Outside: the topology (Topic 4); the coordination failures broadly (Topic 8); evaluation of diversity (Topic 14).

**Exclusions.** No ensemble-methods survey.

**Outcomes.** The reader can make parallel exploration genuinely diverse, and can synthesize without destroying the minority findings that the diversity was purchased to produce.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Multi-agent's benefit (Topic 1) is that subagents explore *different aspects* in parallel with their own context windows [MAR]. **This benefit is entirely contingent on the explorations actually being different.** [MAR] documents what happens when they are not: **"one subagent explored 2021 automotive chip crisis while two others duplicated 2025 supply chain work"** [MAR] — **two of three subagents did the same work.** The parallelism was purchased and not delivered.

And the second half is worse. Suppose the exploration *is* diverse: five subagents find five different things, one of which is a minority finding that contradicts the other four. **A synthesizing model, asked for a coherent answer, will smooth it away.** The very output that diversity was purchased to produce — the dissenting finding, the unusual source, the contradiction — is what a fluent synthesis destroys.

**Bottleneck.** **Diversity is expensive to create and easy to destroy.** You pay 15× tokens (Topic 1) for parallel exploration, engineer the delegation to prevent duplication (Topic 2), and then hand the results to a model whose job is to make them *coherent* — which is the opposite of preserving what made them different. **The synthesis step is where the multi-agent investment gets thrown away.**

**Objective.** Exploration that is *provably* diverse (measured, not assumed), and synthesis that *preserves* minority and contradictory findings rather than averaging them into consensus.

**Assumptions.** A synthesizing model produces coherent prose regardless of whether its inputs agree (Chapter 8, Topic 6, §3.3 — the same mechanism as failure laundering).

**Constraints.** Diversity has a cost: fully independent explorations may miss the obvious answer that a coordinated search would find quickly.

**Success criteria.** Duplicate-work rate is low and measured; contradictions and minority findings survive synthesis and are surfaced, not smoothed.

## 3. Intuition first, then formalization

### 3.1 Intuition: you bought divergence — do not pay a model to converge it

**The exploration half.** Diversity does not happen by default. Given the same task and similar prompts, subagents will do similar things — they are the same model with similar context. **[MAR]'s 2-of-3 duplication is the natural outcome, not an anomaly.** Diversity must be *engineered*, and [MAR]'s mechanism is the delegation contract's **`boundaries`** field: telling each subagent explicitly what the others are covering and what it should *not* do.

**The synthesis half, and this is the topic's sharper point.** You spent 15× tokens to get *five different perspectives*. Now you hand them to a model and ask for "a coherent answer." **A synthesizing model is a coherence machine** — it will find the through-line, harmonize the tensions, and produce a fluent consensus. **And in doing so it destroys exactly the thing you paid for.**

The failure has the same mechanism as Chapter 8, Topic 6's failure laundering: **a fluent generator, given heterogeneous inputs, produces homogeneous output.** There, partial *failures* were smoothed into apparent success. Here, minority *findings* are smoothed into apparent consensus. **Same model behavior, different casualty.**

The consequence is specific and costly: **the contradiction is often the finding.** If four subagents find that a company's revenue grew and one finds a restatement showing it did not, **the restatement is the answer** — and a consensus synthesis reports growth. If four sources say a drug is safe and one reports an adverse trial, **the adverse trial is the story.** **Diversity's value is concentrated in the minority report, and synthesis is where it dies.**

### 3.2 Formalization: diversity, and the synthesis invariant

**Diversity of exploration.** For subagent findings $\{f_1, \ldots, f_n\}$, define coverage overlap **[synthesis]**:

$$
\mathrm{Div}(\{f_i\}) \;=\; 1 \;-\; \frac{\sum_{i<j}\ \mathrm{overlap}(f_i, f_j)}{\binom{n}{2}} .
$$

$\mathrm{Div} \to 0$ means the subagents duplicated (the [MAR] failure); $\mathrm{Div} \to 1$ means they covered disjoint ground.

$$
\textbf{PE-1 (diversity must be engineered and measured):}\quad
\mathrm{Div}\ \text{does not arise by default;}\ \text{it requires explicit \textbf{boundaries} in the delegation contract [MAR], and it must be \emph{measured}.}
$$

**The synthesis invariant — the topic's core [derived from Chapter 8, Topic 6's mechanism]:**

$$
\textbf{PE-2 (synthesis preserves dissent):}\quad
\text{if } \exists\, i, j:\ f_i \ \text{contradicts}\ f_j,\ \text{the synthesis MUST surface the contradiction — never resolve it silently.}
$$

PE-2 is **Chapter 6, Topic 8's I-4** (surface conflicts, do not silently resolve) and **Chapter 8, Topic 6's O-2** (aggregate the statuses, not just the content), applied to *findings*. **The synthesizer's job is not to make the findings agree; it is to report what was found, including what disagreed.**

And its corollary, which is the operational rule:

$$
\textbf{PE-3 (minority findings are not noise):}\quad
\text{a finding reported by 1 of } n\ \text{subagents is not thereby less likely to be true;}\ \text{it may be the only one that looked.}
$$

**PE-3 is what distinguishes this from voting** (Chapter 8, Topic 2). **Voting aggregates *redundant* explorations of the *same* question — there, a 1-of-5 answer is probably wrong (variance).** **Parallel exploration aggregates *complementary* explorations of *different* questions — here, a 1-of-5 finding is simply the finding of the one agent that explored that direction, and its minority status carries no evidential weight at all.**

**Confusing these two is a serious error**: applying voting logic (majority wins) to complementary exploration *systematically discards the unique findings that were the entire purpose of the exploration.*

### 3.3 The citation agent is the structural answer

[MAR] ships a mechanism that is more important than it first appears: a **separate citation agent** that "post-processes to attribute claims to sources" [MAR].

**Why this is structurally right, not just a nicety [synthesis]:** if every claim in the synthesis must be attributed to a specific subagent's finding and a specific source, then:

- **A smoothed-away contradiction becomes visible** — the synthesis cannot claim "revenue grew" if the citation must point at the subagent that found the restatement.
- **A hallucinated consensus becomes detectable** — a claim with no attributable source is a claim the synthesizer invented (Chapter 6, Topic 14's faithfulness).
- **Minority findings get a home** — they are cited, not averaged.

**Citation is the enforcement mechanism for PE-2.** It is the difference between a synthesis that *reports* and one that *summarizes* — and [MAR] made it a separate agent, which suggests they found it did not work as a synthesizer sub-task. **That is a meaningful signal: the agent that produces coherent prose should not also be the agent that enforces attribution**, because the two objectives conflict.

## 4. Architecture

```
   PARALLEL EXPLORATION — diversity must be ENGINEERED (PE-1)
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  LEAD decomposes with EXPLICIT BOUNDARIES [MAR]:                          │
   │    sub1: "2021 chip crisis — do NOT cover 2025 supply chain"              │
   │    sub2: "2025 supply chain, demand side — do NOT cover pricing"          │
   │    sub3: "2025 supply chain, pricing — do NOT cover demand"               │
   │           ↑ WITHOUT boundaries: "two others duplicated 2025 supply        │
   │             chain work" — 2 of 3 subagents doing the same thing [MAR]     │
   └───────────────────────────┬──────────────────────────────────────────────┘
                                │  parallel, own context windows (T1's mechanism)
                                ▼
              f₁          f₂          f₃          f₄          f₅
           (growth)   (growth)   (growth)   (growth)   (RESTATEMENT — contradicts!)
                                │
   ┌────────────────────────────▼─────────────────────────────────────────────┐
   │  ⚠ THE DANGER ZONE — synthesis is where the 15× investment dies           │
   │                                                                          │
   │  A synthesizing model is a COHERENCE MACHINE. Asked for "a coherent       │
   │  answer," it will harmonize f₅ away and report GROWTH.                    │
   │  ← same mechanism as Ch.8 T6's failure laundering: a fluent generator     │
   │    given heterogeneous inputs produces homogeneous output.                │
   │                                                                          │
   │  PE-2: contradictions MUST be SURFACED, never resolved silently.          │
   │  PE-3: a 1-of-5 finding is NOT noise — it may be the only agent that      │
   │        LOOKED. (This is NOT voting — Ch.8 T2. Do not apply majority logic │
   │        to COMPLEMENTARY exploration.)                                     │
   └────────────────────────────┬─────────────────────────────────────────────┘
                                ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  CITATION AGENT [MAR] — a SEPARATE agent, and that is the signal           │
   │    every claim → attributed to a subagent finding + a source              │
   │    ⇒ a smoothed-away contradiction becomes VISIBLE                        │
   │    ⇒ a hallucinated consensus becomes DETECTABLE (no attributable source) │
   │    ⇒ citation is the ENFORCEMENT MECHANISM for PE-2 (§3.3)                │
   └──────────────────────────────────────────────────────────────────────────┘
```

## 5. Grounding

- **Parallel exploration is the mechanism:** "Subagents facilitate compression by operating in parallel with their own context windows, **exploring different aspects of the question simultaneously** before condensing the most important tokens for the lead research agent" [MAR].
- **Diversity does not happen by default — the documented failure:** vague instructions caused subagents to "misinterpret the task or **perform the exact same searches as other agents**"; concretely, "one subagent explored 2021 automotive chip crisis while **two others duplicated 2025 supply chain work**" [MAR].
- **The fix is explicit boundaries:** the delegation contract requires "an objective, an output format, guidance on the tools and sources to use, and **clear task boundaries**" [MAR].
- **The citation agent is a separate component:** the architecture includes a "**Citation agent**: Post-processes to attribute claims to sources" [MAR] — a distinct agent, not a synthesizer sub-task.
- **Citation accuracy is an evaluated dimension:** [MAR]'s LLM-judge rubric scores **factual accuracy, citation accuracy, completeness, source quality, and tool efficiency** [MAR] — citation is a first-class quality axis.
- **Source-quality bias is a documented failure:** early agents "consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs" [MAR] — **diversity of *sources*, not just of *directions*, must be engineered.**
- **[OMA] frames the benefit as coverage:** use multi-agent when "**comparing independent findings improves coverage**" [OMA] — the independence *is* the value.
- **Voting is a different aggregation:** [BEA]'s parallelization-voting runs "identical tasks multiple times" (Chapter 8, Topic 2) — **redundant, not complementary.** PE-3's distinction.
- **Conflict must be surfaced, not resolved:** Chapter 6, Topic 8's I-4; Chapter 8, Topic 6's O-2/O-3 — PE-2's basis.
- **The false-completion mechanism:** [FSC §6.3.5]'s unsupported completion claims — the synthesizer will produce a confident answer over heterogeneous or partial inputs.

**Evidence gap.** The duplication failure and its fix (boundaries) are **documented with a concrete instance** [MAR]. The citation agent is **shipped** [MAR]. **But PE-2 and PE-3 are [derived]** — no source states that synthesis destroys minority findings, and **no source measures it.** The claim is reasoned from the same mechanism that produces failure laundering (Chapter 8, Topic 6, §3.3), which *is* grounded in a measured propensity [FSC §6.3.5]. **The "contradiction is often the finding" argument (§3.1) is [synthesis]** — persuasive, and unmeasured. **§8's experiment is the one that would establish it.**

## 6. Implementation

**Engineer the diversity — explicit boundaries per subagent (PE-1):**

```python
def decompose_with_boundaries(task, n: int, lead) -> list[SubagentTask]:
    """PE-1: diversity does NOT arise by default. Same model + similar prompt ⇒ similar
    work. [MAR]'s documented failure: 2 of 3 subagents duplicating.
    The fix is telling each subagent what the OTHERS are covering."""
    aspects = lead.identify_aspects(task, n=n)

    tasks = []
    for i, aspect in enumerate(aspects):
        others = [a for j, a in enumerate(aspects) if j != i]
        tasks.append(SubagentTask(
            objective=f"Investigate: {aspect}",
            output_format=FINDINGS_SCHEMA,
            tool_guidance=tool_guidance_for(aspect),
            boundaries=(                                    # ← the anti-duplication clause
                f"Do NOT investigate: {'; '.join(others)}. "
                f"Other subagents are covering those. Stay within your aspect."
            ),
        ))
    return tasks
```

**Measure the diversity you paid for:**

```python
def measure_diversity(findings: list[Finding]) -> dict:
    """You paid 15× for parallel exploration (Topic 1). Did you GET it?
    [MAR]'s failure was 2-of-3 duplication — measure it, don't assume it."""
    pairs = list(combinations(findings, 2))
    overlap = mean(semantic_overlap(a, b) for a, b in pairs)
    return {
        "diversity": 1 - overlap,
        "duplicate_pairs": [(a.subagent, b.subagent) for a, b in pairs
                            if semantic_overlap(a, b) > DUPLICATE_THRESHOLD],
        "verdict": ("DUPLICATION: subagents covered the same ground. You paid for "
                    "parallelism and did not get it. Tighten the `boundaries` field [MAR]."
                    if overlap > DUPLICATE_THRESHOLD else "ok"),
    }
```

**Diversity-preserving synthesis (PE-2, PE-3) — the hard part:**

```python
SYNTHESIS_INSTRUCTION = """
Synthesize the findings below into an answer.

CRITICAL — these findings come from INDEPENDENT investigations of DIFFERENT aspects.
They are COMPLEMENTARY, not redundant. Therefore:

1. A finding reported by only ONE subagent is NOT less likely to be true. It may be the
   only agent that investigated that direction. Do NOT discount it for being a minority.

2. If any findings CONTRADICT each other, you MUST surface the contradiction explicitly,
   cite both sides, and explain what would resolve it. Do NOT harmonize them into a
   consensus. The contradiction is often the most important finding.

3. Every claim must cite the subagent and source it came from. A claim you cannot
   attribute is a claim you invented — do not make it.
"""

def synthesize(findings: list[Finding], lead, ctx) -> Synthesis:
    contradictions = detect_contradictions(findings)          # PE-2 — find them FIRST

    draft = lead.synthesize(findings, instruction=SYNTHESIS_INSTRUCTION,
                            contradictions=contradictions)     # tell it what conflicts

    # PE-2 ENFORCEMENT: a contradiction that exists in the findings must appear in the
    # output. Do not trust the model to have surfaced it — CHECK.
    for c in contradictions:
        if not draft.surfaces(c):
            raise DissentSuppressed(
                f"contradiction between {c.a.subagent} and {c.b.subagent} was NOT surfaced. "
                f"The synthesizer smoothed it away — this is where the 15× investment dies."
            )
    return draft
```

**The citation agent — the enforcement mechanism (§3.3, [MAR]):**

```python
def citation_pass(synthesis: Synthesis, findings: list[Finding]) -> CitedSynthesis:
    """[MAR] ships this as a SEPARATE agent — and that separation is the signal.
    The agent producing coherent prose should NOT also enforce attribution: the two
    objectives conflict (coherence smooths; attribution exposes).

    A claim with no attributable source is a claim the synthesizer INVENTED (Ch.6 T14)."""
    cited = citation_agent.attribute(synthesis, findings)

    unattributed = [c for c in cited.claims if not c.source]
    if unattributed:
        raise UnattributedClaims(
            f"{len(unattributed)} claims cannot be traced to any subagent finding. "
            f"These were invented in synthesis. [MAR] scores 'citation accuracy' as a "
            f"first-class quality dimension for exactly this reason."
        )
    return cited
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Explicit boundaries (PE-1) | **Real diversity**; no duplicate work | The lead must know the aspects up front |
| No boundaries | Simple | **[MAR]'s 2-of-3 duplication** — 33% of the spend wasted |
| Diversity-preserving synthesis (PE-2) | **The minority finding survives** | A less "clean" answer; contradictions surfaced |
| Coherent synthesis | Fluent, satisfying prose | **Destroys what you paid 15× for** |
| Citation agent [MAR] | Enforces attribution; exposes invention | An extra agent, an extra pass |
| Majority logic on findings | Simple | **Systematically discards unique findings** (PE-3 violated) |

**The trade that defines the topic: coherence versus fidelity.** A synthesis that surfaces every contradiction and preserves every minority finding is *less satisfying to read* — it is messier, more hedged, less conclusive. **A synthesis that harmonizes is a better document and a worse report.**

**And the asymmetry is severe: you paid 15× for divergence, and coherence is free.** The synthesizer will *default* to coherence, because that is what fluent generation does. **So the effort must go entirely into preserving dissent** — the instruction (§6), the contradiction detection, the citation enforcement. **None of it happens by default, and all of it is what makes the multi-agent investment worth anything.**

**The citation agent's separation is the design insight worth stealing.** [MAR] did not make attribution a synthesizer instruction; they made it **a separate agent that post-processes** [MAR]. **The plausible reading: the objectives conflict, and a single agent asked to be both coherent and rigorously attributive will sacrifice attribution.** Separating them puts a check on the coherence machine.

## 8. Experiments

**The dissent-suppression test — the experiment this topic most wants run.** Construct findings where **one subagent's result contradicts the other four** and is *correct*. Run the synthesis.

- **With a plain "synthesize these findings" instruction:** **prediction — the minority finding is smoothed away, and the synthesis reports the majority view.**
- **With PE-2's instruction + contradiction detection + citation enforcement (§6):** the contradiction is surfaced.

**Measure: dissent-suppression rate** — the fraction of contradictions that fail to appear in the synthesis. **Target: zero.** **This experiment demonstrates that the 15× investment is being destroyed at the synthesis step, and no source runs it.**

**The diversity measurement (PE-1).** Measure semantic overlap across subagent findings. **[MAR]'s failure was 2-of-3 duplication — measure whether yours duplicates.** Compare: with vs without explicit `boundaries` in the delegation contract. **Prediction: without boundaries, high overlap** (the documented failure).

**The majority-logic error test (PE-3).** Deliberately apply voting logic (majority wins) to complementary findings. **Measure: how many unique findings are discarded.** **This quantifies the cost of confusing voting with exploration** (Chapter 8, Topic 2's distinction).

**The citation-accuracy measurement** [MAR]. Score citation accuracy as [MAR] does (part of their five-dimension rubric). **Unattributable claims are inventions** — measure the rate.

**The source-diversity check.** [MAR]'s documented bias: agents "consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources." **Measure source quality distribution** — diversity of *directions* is not diversity of *sources*.

**Statistics.** Zero-failure bound on dissent suppression (target zero); Wilson on duplication rate and citation accuracy; paired comparison with/without boundaries (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Dissent suppressed in synthesis.** The minority finding — often *the* finding — is harmonized away. **The topic's defining failure, and where the 15× investment dies.** Mitigation: PE-2 — detect contradictions, instruct explicitly, enforce with citation.
- **Duplicate exploration.** [MAR]'s documented 2-of-3 failure; you paid for parallelism and got redundancy. Mitigation: PE-1 — explicit `boundaries` naming what the *others* cover.
- **Majority logic applied to complementary findings.** Unique findings discarded as "outliers" — **but they are not outliers; they are the only agent that looked** (PE-3). Mitigation: know the difference between voting (redundant) and exploration (complementary) — Chapter 8, Topic 2.
- **Unattributable claims.** The synthesizer invented a consensus with no source. Mitigation: the citation agent [MAR]; citation accuracy as a scored dimension.
- **Source-quality bias.** Agents prefer SEO content farms over authoritative sources [MAR]. **Direction diversity without source diversity.** Mitigation: explicit source guidance in the delegation contract [MAR]'s `tool_guidance` field; score source quality.
- **Over-diverse exploration.** Fully independent subagents may all miss an obvious answer that a coordinated search would find. Mitigation: the lead's decomposition should cover the obvious first, then diversify.
- **Contradiction that is a data error, not a finding.** One subagent found a contradiction because its source was wrong. **PE-2 says surface it, not believe it** — surfacing includes reporting the source quality so a human can judge.
- **Edge case — legitimate consensus.** Five subagents genuinely agree. **Then the synthesis should say so, and say that they agree** — which is itself informative (independent corroboration). The failure is *manufactured* consensus, not *found* consensus.
- **Open limitation.** **PE-2 and PE-3 are [derived], not documented.** No source states that synthesis destroys minority findings or measures dissent suppression. The reasoning rests on the *same mechanism* as Chapter 8, Topic 6's failure laundering, which *is* grounded in a measured propensity [FSC §6.3.5] — but **the specific claim about diversity destruction is unmeasured**, and §8's experiment is what would establish it.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Subagents explore "**different aspects of the question simultaneously**" in their own context windows — the multi-agent mechanism [MAR].
2. **Diversity does not arise by default:** vague delegation caused "two others [to duplicate] 2025 supply chain work" — 2 of 3 subagents redundant [MAR].
3. The fix is **explicit task boundaries** in the delegation contract [MAR].
4. **[MAR] ships a separate citation agent** that "post-processes to attribute claims to sources" — attribution is not a synthesizer sub-task.
5. **Citation accuracy is a first-class evaluated dimension** in [MAR]'s five-part rubric.
6. Agents exhibit **source-quality bias** — SEO content farms over authoritative sources [MAR].
7. Multi-agent is warranted when "comparing independent findings improves coverage" [OMA] — **independence is the value.**
8. **No source measures dissent suppression in synthesis.**

**Decision rules.**
- **Engineer the diversity — do not assume it.** Explicit `boundaries` naming what the *other* subagents cover.
- **Measure the diversity you paid for** — [MAR]'s failure was 2-of-3 duplication.
- **Synthesis must surface contradictions, never harmonize them** (PE-2) — the contradiction is often the finding.
- **A minority finding is not noise** (PE-3) — it may be the only agent that looked. **Never apply voting logic to complementary exploration.**
- **Separate the citation agent from the synthesizer** [MAR] — coherence and attribution are conflicting objectives.
- **Diversity of directions ≠ diversity of sources** — score source quality too.

**Production implications.**
1. Run the dissent-suppression test (§8); the synthesizer will smooth away the minority finding by default, and that is where your 15× goes to die.
2. Measure subagent finding overlap; [MAR]'s documented duplication was 33% and came from a missing prompt field.
3. Ship a citation agent as a separate pass; unattributable claims are inventions.
4. Never let a majority-of-subagents heuristic filter findings — complementary exploration has no majority.

**Connections.** This topic is the mechanism Topic 1 identified, made to actually work. The duplicate-work failure is Topic 2's tax and Topic 8's coordination failure. PE-2 is Chapter 6, Topic 8's I-4 and Chapter 8, Topic 6's O-2/O-3 — **the same fluent-generator mechanism, with minority findings as the casualty instead of partial failures.** PE-3's voting-vs-exploration distinction is Chapter 8, Topic 2's. The citation agent connects to Chapter 6, Topic 14's attribution and faithfulness. Topic 14 measures diversity and redundancy as evaluation dimensions.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — "Subagents facilitate compression by operating in parallel with their own context windows, **exploring different aspects of the question simultaneously**"; the duplication failure ("subagents misinterpreted the task or **performed the exact same searches as other agents**"; "one subagent explored 2021 automotive chip crisis while **two others duplicated 2025 supply chain work**"); the delegation contract's "**clear task boundaries**"; the **Citation agent** ("Post-processes to attribute claims to sources") as a separate architectural component; the LLM-judge rubric scoring **factual accuracy, citation accuracy, completeness, source quality, and tool efficiency**; the source-quality bias ("consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources like academic PDFs or personal blogs") — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — use multi-agent when "**comparing independent findings improves coverage**" — https://developers.openai.com/api/docs/guides/responses-multi-agent
[BEA] Anthropic, "Building effective agents" — parallelization-voting ("running identical tasks multiple times") as a *redundant* aggregation, distinct from complementary exploration — https://www.anthropic.com/engineering/building-effective-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — unsupported completion claims; the fluent-generator mechanism that smooths heterogeneous inputs into homogeneous output — `Knowledge_source/`
