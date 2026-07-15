# Topic 14 — Context Observability: Attribution Maps and Per-Source Contribution Analysis

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Making the context system *observable*: for any output, which sources in the window influenced it, and for any source, whether it earned its budget. This is the instrument that Topic 13's utilization and faithfulness metrics depend on, and it closes the chapter by making the whole pipeline auditable.

**Prerequisites.** Topic 3 (the pipeline whose output we attribute); Topic 6 (provenance, the substrate of attribution); Topic 13 (the metrics attribution serves); Chapter 3, Topic 4 (the observable trace $\hat\tau$).

**Terminology.** *Attribution map*: a mapping from output claims to the context sources that support them. *Per-source contribution*: how much a given source influenced the output, or was used at all. *Context provenance chain*: the record linking a window token back to its origin (Topic 6).

**Boundaries.** Inside: attribution methods, contribution analysis, and the observability record. Outside: the metrics themselves (Topic 13); the durable trace store (Chapter 3, Topic 4; Chapter 7).

**Exclusions.** No interpretability-research survey; attribution here is engineering observability, not mechanistic interpretability.

**Outcomes.** The reader can produce an attribution map for any agent output, identify sources that consume budget without contributing, and make "why did the agent say that" answerable.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The context window is assembled from many sources (Topic 3), and when the agent produces an output — right or wrong — nobody can say *which* sources drove it. "Why did the agent claim the refund window is 14 days?" has no answer without attribution: was it a retrieved document (which one?), the system prompt, a stale memory, an injected page (Topic 8), or the model's priors? Without attribution, every context failure is a mystery and every context success is unexplained.

**Bottleneck.** Utilization and faithfulness (Topic 13) are *defined* in terms of which sources influenced the output — and that quantity is not directly observable. The model does not emit "I used source 3." Worse, its self-report is unreliable: "LLMs don't always say what they mean" [WTA], and unverbalized behavior is measured [FSC §6.4.1.4]. **The metrics the chapter needs most rest on a quantity that must be *inferred*, not asked for.**

**Objective.** An observability layer that (i) records every source's provenance and budget cost, (ii) attributes output claims to supporting sources, and (iii) identifies sources that consume budget without contributing — so the pipeline can be audited, debugged, and pruned.

**Assumptions.** Every source carries provenance (Topic 6). The trace $\hat\tau$ persists the window contents (Chapter 3, Topic 4).

**Constraints.** True causal attribution (which source *caused* the output) is expensive or impossible; practical attribution is an approximation with known error.

**Success criteria.** "Why did the agent say X" is answerable from the trace; sources that never contribute are identified and pruned; injected content that influenced an output is detectable after the fact.

## 3. Intuition first, then formalization

### 3.1 Intuition: attribution is the audit trail of the answer

An agent's output is a function of everything in its window. Attribution asks: *of everything in the window, what actually mattered for this output?* It is the audit trail that connects the answer back to its evidence.

Three questions attribution answers, each valuable **[synthesis]**:

- **Debugging:** the agent said the refund window is 14 days; attribution points at the source that said so — a document with the EU heading orphaned from its content (Topic 6's chunking failure), now *visible* rather than mysterious.
- **Security:** an injected page (Topic 8) influenced an output; attribution detects it *after the fact*, which is the forensic half of the bounded-damage posture — you cannot prevent every injection, but you can *see* which ones landed.
- **Efficiency:** a source consumed 5,000 tokens across 200 turns and never once influenced an output; attribution flags it as pure budget waste (Topic 12), pruneable.

The reason this is hard, and why self-report will not do it: **the model's stated reasoning is a hypothesis about its output, not the output's cause.** Chapter 2's unverbalized-behavior findings [FSC §6.4.1.4] and [WTA]'s "LLMs don't always say what they mean" are the same warning — asking the model "what did you use" measures what the model *says* it used, which can diverge from what it used. Attribution must be grounded in something more objective than introspection.

### 3.2 Formalization: attribution methods and their error models

Let output $o$ be produced from window $c$ with sources $\{\sigma_1,\ldots,\sigma_k\}$. An attribution map $\mathcal A: \text{claims}(o)\to 2^{\{\sigma_i\}}$ assigns each output claim to supporting sources. Three practical methods, in increasing cost and fidelity **[synthesis — the methods are standard; the error-model framing is ours]**:

| Method | Mechanism | Error model |
|---|---|---|
| **Citation-based** | The model cites sources; verify each citation resolves and supports the claim | Misses uncited influence; the model may cite what it did not use |
| **Overlap-based** | Match output spans to source spans (lexical/semantic) | Attributes coincidence; misses paraphrase and synthesis |
| **Ablation-based** | Remove a source; measure output change | **Most faithful**; expensive ($k$ reruns); interaction effects |

**[derived]** The methods trade fidelity for cost, exactly as retrieval did (Topic 5). Citation-based is cheap and gameable; ablation-based is faithful and expensive. The honest framing: **each is an approximation with a stated error model**, and the right choice depends on whether you need cheap continuous monitoring (citation) or a faithful forensic answer (ablation).

The most faithful, ablation-based attribution, is the causal definition:

$$
\text{contribution}(\sigma_i)\ =\ \operatorname{dist}\bigl(o(c),\ o(c\setminus\sigma_i)\bigr)
\quad\text{— how much the output changes when } \sigma_i \text{ is removed.}
$$

A source whose removal does not change the output *did not contribute* — regardless of what the model said about it. This is the objective ground truth utilization (Topic 13) needs, and it is why **citation-enforcement is a monitoring tool and ablation is the audit tool.**

### 3.3 Attribution requires provenance, which requires the pipeline

Attribution is only possible if every window token traces to a source, and that trace is exactly Topic 6's provenance chain, carried through Topic 3's pipeline. **This is why the pipeline (Topic 3) had to be a compiler over typed, provenance-bearing sources rather than string concatenation:** you cannot attribute an output to a source if the window is an anonymous blob of concatenated text. The observability of the *output* depends on the typing of the *input*, established five topics earlier.

The chain: source → chunk with provenance (Topic 6) → normalized `ContextBlock` (Topic 3) → position in window (Topic 9) → attributed claim (this topic). **Every link must be recorded in $\hat\tau$**, or attribution breaks where the chain does.

## 4. Architecture

```
   ASSEMBLE (Topic 3) records the SOURCE MANIFEST for the window:
   ┌──────────────────────────────────────────────────────────────────┐
   │  σ₁: system prompt          provenance, tokens, position          │
   │  σ₂: doc#4471 (EU refund)   provenance, tokens, position          │
   │  σ₃: memory entry #88       provenance, tokens, position          │
   │  σ₄: web page (θ=U)         provenance, tokens, position          │
   │  ...                                                              │
   └───────────────────────────┬────────────────────────────────────────┘
                               ▼
                        model → output o (with citations if instructed)
                               │
                               ▼
   ┌── ATTRIBUTION (§3.2) ─────────────────────────────────────────────┐
   │  citation-based:  cheap, continuous  → monitoring                 │
   │  overlap-based:   medium              → triage                     │
   │  ablation-based:  faithful, costly    → forensic audit            │
   └───────────────────────────┬────────────────────────────────────────┘
                               ▼
   ┌── ATTRIBUTION MAP + CONTRIBUTION LEDGER ─────────────────────────┐
   │  claim "14 days" ← σ₂ (doc#4471)   ← DEBUG: wrong heading (T6)    │
   │  σ₄ (web, θ=U) influenced output   ← SECURITY: injection landed(T8)│
   │  σ₃ used 0 times in 200 turns      ← EFFICIENCY: prune it   (T12) │
   └──────────────────────────────────────────────────────────────────┘
                               ▼
                    persisted to  τ̂  (Chapter 3, Topic 4)
```

**The source manifest is the cheap, always-on half.** Recording *what was in the window and what it cost* — provenance, tokens, position, per source — is nearly free and is the foundation for everything else. Even without expensive attribution, the manifest answers "what did the agent see" and "which sources cost the most budget," which is most of the operational value. **Ship the manifest first; add attribution depth where a specific question demands it.**

## 5. Grounding

- **Deep telemetry is the substrate, and it is a named harness requirement:** structured traces connecting "model decisions, harness actions, environment states, and outcomes—beyond final answers" [CAH §3.5.1]. Attribution is deep telemetry applied to the context sources.
- **Reproducible traces as a future-harness requirement:** future harnesses must support "reproducible traces" [CAH §3.3] — the manifest and attribution map are what makes a context decision reproducible and auditable.
- **The observable trace $\hat\tau$** (Chapter 1, Topic 12; Chapter 3, Topic 4) is where the manifest and attribution live; the trace store is "a structured record of execution events" that trace-driven harness improvement consumes [CAH §3.5.2, HX §4.3].
- **Self-report is unreliable, so attribution must be objective:** "What agents omit… can often be more important than what they include. LLMs don't always say what they mean" [WTA]; measured unverbalized behavior [FSC §6.4.1.4]. **This is the direct warrant for ablation-based over introspection-based attribution.**
- **Citation as a grounding detector:** unsupported completion claims are a measured propensity [FSC §6.3.5]; citation enforcement (Chapter 5, Topic 12, §6) is the detection mechanism, and attribution is its verification (does the citation actually support the claim, and did uncited sources also contribute).
- **Provenance is the prerequisite:** Topic 6 (chunk provenance) and Topic 3 (typed blocks) — attribution is impossible over anonymous concatenated text.
- **Contribution analysis drives harness evolution:** the Evolution Agent attributes failures "to specific harness components" from telemetry [CAH §3.5.2] — per-source contribution is that analysis at the context layer.

**Evidence gap.** **No source describes context-source attribution methods or measures their fidelity for agent systems.** [CAH] establishes deep telemetry and reproducible traces as requirements; it does not specify attribution. The three methods (§3.2) are standard techniques composed here for context observability, and **their error models are stated qualitatively because none is measured in these sources.** Ablation-based attribution's faithfulness is a reasoning claim (removing a source and seeing the output change is causal by construction); its *cost* and *interaction-effect* limits are real and unquantified here. This topic gives the methods and the honest error framing; the fidelity numbers are local (§8).

## 6. Implementation

**The source manifest — cheap, always on, the foundation:**

```python
@dataclass
class SourceManifest:
    """Recorded at ASSEMBLE (Topic 3). Answers 'what did the agent see and what did it cost'
    without any expensive attribution. Ship this first."""
    sources: list[dict]           # per source: id, provenance, tokens, position, ctype, trust

def record_manifest(window, trace) -> SourceManifest:
    return SourceManifest(sources=[{
        "id": b.source_id,
        "provenance": b.provenance,          # Topic 6: origin, uri, observed_at, trust
        "tokens": b.tokens,                  # what it cost (Topic 12)
        "position": b.position,              # Topic 9
        "ctype": b.ctype,                    # Topic 4
        "trust": b.provenance.trust,         # Topic 8 — θ for post-hoc injection audit
    } for b in window.blocks])
```

**Citation-based attribution — continuous monitoring:**

```python
def attribute_by_citation(output, manifest) -> AttributionMap:
    amap = {}
    for claim in extract_claims(output):
        cited = claim.citations                              # [source:offset] (Topic 6)
        amap[claim] = [c for c in cited
                       if resolves(c, manifest) and supports(c, claim)]  # verify, don't trust
        if not amap[claim]:
            amap[claim] = ["UNSUPPORTED"]                    # a faithfulness flag (Topic 13)
    return amap
```

**Ablation-based attribution — the faithful, forensic method:**

```python
def attribute_by_ablation(task, window, model, target_claim) -> dict:
    """The causal definition (§3.2): remove each source, see if the claim survives.
    Expensive (k reruns). Use for forensic 'why did it say X', not continuous monitoring."""
    baseline = model.run(window)
    contribution = {}
    for src in window.sources:
        ablated = model.run(window.without(src))
        contribution[src.id] = claim_changed(baseline, ablated, target_claim)
    # A source whose removal changes the claim CAUSED it — regardless of citations.
    return {"caused_by": [s for s, changed in contribution.items() if changed]}
```

**The contribution ledger — efficiency and security, over a run:**

```python
def contribution_ledger(traces) -> dict:
    used = Counter()
    for t in traces:
        for src in attributed_sources(t):
            used[src] += 1
    all_sources = {s for t in traces for s in t.manifest.source_ids}
    return {
        "never_used": [s for s in all_sources if used[s] == 0],   # PRUNE (Topic 12)
        "untrusted_that_influenced": [                            # SECURITY audit (Topic 8)
            s for s in all_sources if used[s] > 0 and is_untrusted(s)
        ],
        "cost_per_contribution": {s: tokens(s) / max(used[s], 1) for s in all_sources},
    }
```

The `never_used` and `untrusted_that_influenced` lists are the two highest-value outputs: the first is pure budget waste to prune (Topic 12), the second is the forensic detection of landed injections (Topic 8).

## 7. Trade-offs

| Method | Cost | Fidelity | Use |
|---|---|---|---|
| Source manifest | ~Free | N/A (records, doesn't attribute) | **Always on**; the foundation |
| Citation-based | Low (model already cites) | Low — gameable, misses uncited | Continuous monitoring; faithfulness flags |
| Overlap-based | Medium | Medium — attributes coincidence | Triage |
| Ablation-based | **High ($k$ reruns)** | **High — causal** | Forensic audit; utilization ground truth |

**The trade that structures a real deployment.** You cannot afford ablation attribution on every turn, and you do not need it. **Run the manifest always, citation-based monitoring continuously, and ablation only when a specific question demands a faithful answer** — a security incident, a puzzling failure, a utilization calibration. This mirrors the whole book's cheap-first escalation: the manifest is the `tool_result`-clearing of observability (cheap, always safe), ablation is the compaction (powerful, expensive, reserved for when it is needed).

**The honest limit of cheap attribution.** Citation-based attribution is *gameable by the model itself*: it can cite a source it did not use, or use one it did not cite. Because self-report is unreliable [WTA; FSC §6.4.1.4], **citation-based numbers are a monitoring signal, not ground truth** — and treating them as ground truth for utilization would import exactly the self-report unreliability the chapter has warned against. When utilization matters (a config decision, Topic 13), calibrate it against ablation on a sample.

## 8. Experiments

**Attribution-method calibration — the experiment that validates your instrument.** On a labeled set (tasks where the truly-relevant source is known), measure each method's agreement with ground truth. **Output: the error model for each method on your workload** — how much citation-based attribution over- or under-counts relative to ablation. Without this, you do not know how much to trust your cheap attribution, and Topic 13's utilization metric inherits that uncertainty.

**The never-used-source audit.** Run the contribution ledger (§6) over a representative trace set. **Prediction: a meaningful fraction of sources never contribute** — proactively-injected memory (Topic 4), over-broad retrieval (Topic 5), instructions nobody's output needs (Topic 2). Each is pruneable budget (Topic 12), and the audit is how you find them.

**The injection-detection test (ties to Topic 8).** Plant an injection; let it influence an output; run ablation attribution. **Does it surface the untrusted source as a cause?** This measures your *forensic* capability — the after-the-fact half of the bounded-damage posture. A system that cannot attribute a landed injection cannot investigate its own incidents.

**Utilization calibration (ties to Topic 13).** Topic 13's utilization metric uses attribution; measure how utilization computed via citation differs from utilization via ablation. **If they diverge widely, Topic 13's utilization numbers are as unreliable as the cheap method that produced them** — and the config decisions built on them are shakier than they look.

**Statistics.** Agreement rates with Wilson intervals; report attribution-method error explicitly; task-clustered where sources repeat across tasks (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **No attribution at all.** Every context failure is a mystery; "why did it say that" is unanswerable. Mitigation: the source manifest, minimum; citation-based monitoring.
- **Citation-based attribution trusted as ground truth.** Gameable, self-report-based, unreliable [WTA]. Mitigation: calibrate against ablation; treat citation numbers as monitoring signal.
- **Self-report attribution.** Asking the model what it used. The exact error the chapter warns against [FSC §6.4.1.4]. Mitigation: ablation, or verified citation — never introspection.
- **Ablation interaction effects.** Two sources jointly support a claim; removing either alone does not change it, so both look non-contributing. Mitigation: known limit; use subset ablation for suspected interactions; state the error model.
- **Attribution over anonymous context.** No provenance chain (Topic 6 skipped), so nothing to attribute to. Mitigation: the typed pipeline (Topic 3); provenance at ingestion (Topic 6).
- **Never-used sources unpruned.** Budget waste persists because nobody ran the ledger. Mitigation: the contribution audit as a standing job.
- **Landed injections undetected.** No forensic attribution; incidents cannot be investigated. Mitigation: ablation attribution on security-relevant outputs; the untrusted-influence ledger.
- **Attribution not persisted.** Computed and discarded; unavailable for the incident that happens next week. Mitigation: persist to $\hat\tau$ (Chapter 3, Topic 4).
- **Edge case — synthesized claims.** An output claim that emerges from *combining* several sources, supported by no single one. Overlap and citation miss it; ablation attributes it to the set. Mitigation: subset ablation; accept that some claims are genuinely multi-source.
- **Open limitation.** **No source specifies or measures context attribution for agents.** The methods are standard, composed here; their fidelity is stated qualitatively and is workload-specific (§8). Ablation is faithful but expensive and has interaction-effect blind spots; cheap methods are gameable. This topic gives the instrument and its honest error framing; it does not claim a solved attribution problem, and the calibration numbers are yours to produce.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Deep telemetry — traces linking "model decisions, harness actions, environment states, and outcomes—beyond final answers" — is a named harness requirement [CAH §3.5.1].
2. Reproducible traces are a future-harness requirement [CAH §3.3]; the trace store drives harness evolution [CAH §3.5.2; HX §4.3].
3. Self-report is unreliable — "LLMs don't always say what they mean" [WTA]; unverbalized behavior is measured [FSC §6.4.1.4] — so attribution must be objective, not introspective.
4. Failure attribution to specific components is how harness evolution works [CAH §3.5.2]; per-source contribution is that at the context layer.
5. **No source specifies context attribution methods for agents** — they are composed here from standard techniques with stated error models.

**Decision rules.**
- **Record the source manifest always.** It is nearly free and answers most operational questions.
- **Attribute by ablation for ground truth, by citation for monitoring** — and never by self-report.
- **Calibrate cheap attribution against ablation** before trusting utilization numbers built on it.
- **Run the never-used-source audit** — a meaningful fraction of your budget is likely pure waste.
- **Persist attribution to the trace** — the incident that needs it happens later.
- **Attribution requires the typed, provenance-bearing pipeline** — it is impossible over concatenated text.

**Production implications.**
1. Ship the source manifest today; it is the cheapest observability win and the foundation for everything else.
2. Add citation-based monitoring and flag unsupported claims (faithfulness, Topic 13).
3. Reserve ablation attribution for forensics — security incidents, puzzling failures, utilization calibration — and persist the results.
4. Run the contribution ledger to prune never-used sources (Topic 12) and to detect landed injections (Topic 8).
5. Calibrate your utilization metric (Topic 13) against ablation, or acknowledge it inherits citation's unreliability.

**Connections.** This topic supplies the instrument Topic 13's utilization and faithfulness metrics require, over the provenance chain Topic 6 established and the typed pipeline Topic 3 built. It is the forensic half of Topic 8's bounded-damage posture (detect landed injections) and the pruning input to Topic 12's budget (never-used sources). It rests on Chapter 3, Topic 4's observable trace $\hat\tau$ and Chapter 1, Topic 12's telemetry contract; it feeds Chapter 14's production observability and the trace-driven harness improvement of Chapter 15.

**Chapter close.** Chapter 6 built the context system as a compiled view over durable sources (Topic 3), allocated against a measured finite budget (Topics 1, 12), fed by retrieval chosen on failure profile (Topics 5–7), defended structurally against poisoning and dilution (Topics 8–9), kept cheap by caching and compaction (Topics 10–11), and — in these last two topics — measured and made observable. Chapter 7 takes the durable stores this chapter treated as sources — session, memory, artifacts — and builds them as systems in their own right.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3 (future harnesses requiring "reproducible traces"), §3.5.1 (deep telemetry: structured traces connecting "model decisions, harness actions, environment states, and outcomes—beyond final answers"), §3.5.2 (the Evolution Agent attributing failures "to specific harness components" from telemetry)
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §4.3 — the trace store as "a structured record of execution events" driving harness improvement
[WTA] Anthropic, "Writing effective tools for agents" — "What agents omit in their feedback and responses can often be more important than what they include. LLMs don't always say what they mean" — the warrant for objective over introspective attribution — https://www.anthropic.com/engineering/writing-tools-for-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 (unsupported completion claims — the faithfulness target), §6.4.1.4 (unverbalized behavior — why self-report attribution fails) — `Knowledge_source/`
