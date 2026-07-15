# Topic 8 — Memory Extraction, Consolidation, Deduplication, Conflict Resolution, and Forgetting

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The memory *lifecycle* — the dynamics by which raw experience becomes durable, reusable memory and by which stale memory is removed. This is [MEM]'s "dynamics" axis (formation, evolution, retrieval) made operational: extraction, consolidation, deduplication, conflict resolution, and forgetting.

**Prerequisites.** Topic 5 (memory types and their update rules); Topic 3 (episodic memory is the event log); Topic 6 (write policy — the lifecycle operates on gated writes); Topic 9 (temporal validity — the conflict-resolution and forgetting substrate).

**Terminology.** *Extraction*: turning raw interaction into candidate memories. *Consolidation*: abstracting episodes into semantic facts [MEM]. *Deduplication*: merging redundant memories. *Conflict resolution*: reconciling contradictory memories. *Forgetting*: deliberately removing memory [MEM].

**Boundaries.** Inside: the five lifecycle operations and their invariants. Outside: what each memory *type* is (Topic 5); temporal-validity *mechanics* (Topic 9); retention/deletion *governance* (Topic 14 — forgetting-for-privacy is there).

**Exclusions.** No summarization-model tutorial.

**Outcomes.** The reader can build a memory lifecycle that extracts high-value memories, consolidates episodes into facts without inducing errors, deduplicates and reconciles conflicts, and forgets deliberately rather than by accident.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Raw interaction is not memory. An agent processes thousands of tokens per turn; almost none should persist, and what persists must be *transformed* — extracted from noise, abstracted from specifics, deduplicated against what is already known, reconciled with contradictions, and eventually forgotten when stale. Without this lifecycle, memory is either an undifferentiated dump of raw transcripts (unsearchable, bloated, Chapter 5, Topic 15's saturation) or nothing at all.

**Bottleneck.** Each lifecycle operation can *corrupt* memory if done wrong, and the corruptions are durable and authoritative (Topic 1). **Extraction** can persist noise or miss signal. **Consolidation** can induce a *wrong general fact* from specific episodes — the most dangerous operation, because a bad abstraction poisons the semantic store authoritatively. **Deduplication** can merge distinct memories or fail to merge redundant ones. **Conflict resolution** can pick the wrong side. **Forgetting** can lose memory that mattered or retain memory that should have gone (a privacy failure, Topic 14). The bottleneck is that the lifecycle is a pipeline of lossy, error-prone transformations on authoritative data.

**Objective.** A lifecycle where each operation is deliberate, its errors are bounded, and consolidation in particular is verified — because it is the operation that manufactures authoritative facts.

**Assumptions.** Consolidation is directional (episodes → facts, per [MEM]). Memory must be bounded (forgetting is necessary). Conflicts arise (sources contradict over time).

**Constraints.** Consolidation and extraction are model calls (cost, and they can hallucinate). Forgetting is irreversible (Topic 1's K-2 — authoritative deletion).

**Success criteria.** Extraction persists high-value memories; consolidation produces *correct* abstractions (verified); duplicates merge and distinct memories do not; conflicts resolve by a principled rule; forgetting is deliberate and audited.

## 3. Intuition first, then formalization

### 3.1 Intuition: memory is manufactured, not recorded

The survey's central dynamic is that memory is *made* through a directional pipeline: "raw event streams are gradually transformed into reusable semantic fact bases" [MEM]. Experience does not become memory by being stored; it becomes memory by being *processed* — and each processing step is a manufacturing operation with a quality control problem.

The five operations, and the failure each introduces **[synthesis; grounded in [MEM]'s dynamics]**:

- **Extraction** (formation): from the raw interaction, identify what is worth remembering. *Failure:* persist noise (bloat) or miss signal (amnesia). This is [CCM]'s auto-memory decision — the agent "decides what's worth remembering based on whether the information would be useful in a future conversation" [CCM].
- **Consolidation** (evolution): abstract specific episodes into general facts. *Failure:* induce a **wrong general fact** — the episodes "on Mon/Tue/Wed the deploy failed" consolidate to "deploys always fail," which is false and now authoritative. **This is the most dangerous operation** because it manufactures authoritative facts from specifics, and a hasty induction becomes a lie the agent believes.
- **Deduplication** (evolution): merge redundant memories. *Failure:* merge distinct memories (losing information) or fail to merge redundant ones (bloat, contradiction).
- **Conflict resolution** (evolution): when two memories contradict, decide. *Failure:* pick the wrong side, or resolve silently (destroying the signal that a conflict existed — Chapter 6, Topic 8's authority confusion, at the memory layer).
- **Forgetting** (evolution): remove stale or low-value memory. *Failure:* forget what mattered (amnesia) or retain what should go (bloat, or a privacy violation — Topic 14).

The intuition that governs the whole pipeline: **consolidation manufactures authority, so it needs the most quality control.** Extraction persisting noise is recoverable (delete it); a wrong consolidated fact is a durable, authoritative falsehood that the agent will act on and cite. **The single highest-leverage discipline in the lifecycle is verifying consolidation** — checking that an induced general fact is actually supported by the episodes it was induced from.

### 3.2 Formalization: the lifecycle operations and their invariants

Let $E$ be the episodic store (append-only, Topic 3/5), $S$ the semantic store (deduplicated facts). The lifecycle is a set of operations with invariants **[synthesis; grounded in [MEM]]**:

**Consolidation** $\operatorname{cons}: 2^E \to S$ abstracts episodes to facts, with the verification invariant:

$$
\textbf{L-1 (consolidation must be supported):}\quad
\text{a consolidated fact } f\ \text{may enter } S\ \text{only if } f\ \text{is entailed by the episodes it summarizes},\ \text{not merely suggested.}
$$

L-1 is the quality control on the dangerous operation. "Deploys always fail" is *not entailed* by three failure episodes (it is over-generalization); "deploys have failed when the migration was skipped" *is* entailed if the episodes show that pattern. **The check is entailment, not plausibility** — a plausible-but-unentailed abstraction is exactly the hallucinated fact L-1 blocks.

**Deduplication** $\operatorname{dedup}$ merges $m_1, m_2$ iff they are *the same fact*, with the invariant:

$$
\textbf{L-2 (dedup preserves distinctness):}\quad
\operatorname{dedup}(m_1, m_2)\ \text{merges only if } m_1 \equiv m_2\ \text{semantically};\ \text{near-duplicates that differ in a material detail are NOT merged.}
$$

L-2 prevents the merge that loses information: "the API rate limit is 100/min" and "the API rate limit is 100/min *for tier 2*" are not duplicates — merging them loses the tier qualifier (Chapter 6, Topic 6's orphaned-context failure, at the memory layer).

**Conflict resolution** $\operatorname{resolve}$ reconciles contradictory memories, with the invariant:

$$
\textbf{L-3 (resolve by principle, surface if uncertain):}\quad
\text{contradictions resolve by a declared rule (recency, confidence, authority — Topic 9);}\ \text{if the rule is inconclusive, retain both and surface the conflict.}
$$

L-3 is Chapter 6, Topic 8's I-4 (surface conflicts, do not silently resolve) at the memory layer, plus a resolution rule for the clear cases. The default resolution rule is **recency-and-supersession** (Topic 9): a newer memory supersedes an older contradicting one, but the old one is *retained as superseded* (not deleted), because the history matters.

**Forgetting** $\operatorname{forget}$ removes memory, with the invariant:

$$
\textbf{L-4 (forgetting is deliberate and audited):}\quad
\text{memory is removed only by a declared policy (staleness, low value, privacy — Topic 14),}\ \text{and the removal is an audited event (Topic 3).}
$$

L-4 distinguishes *forgetting* (a deliberate, policied, audited removal) from *loss* (accidental — the failure). [MEM] treats "Forgetting" as a first-class dynamic, not a bug: bounded memory *requires* forgetting, and the question is whether it is principled.

### 3.3 Consolidation is where authority is manufactured — verify it

The topic's core claim, stated sharply: **consolidation is the operation that turns non-authoritative experience into authoritative knowledge, so it is the operation that most needs verification.**

An episode is a *record* ("on 2026-07-01, X happened") — authoritative only about *what was observed*. A consolidated fact is a *claim* ("X happens when Y") — authoritative about the *world*. The consolidation step *promotes* the epistemic status, and an unverified promotion manufactures a false authority. [MEM] notes consolidation is "governed by procedures for deduplication and consistency checking" [MEM] — **consistency checking is L-1's entailment verification**, and it is the difference between a semantic store of true facts and a semantic store of plausible-sounding hallucinations.

The practical discipline, mirroring Chapter 6, Topic 11's recall-then-precision but for correctness: **consolidate conservatively.** Prefer *under*-generalization (a fact too specific is merely less useful) to *over*-generalization (a fact too broad is *wrong*). "Deploys failed when migration skipped" (specific, true) beats "deploys are unreliable" (broad, false). **When consolidation is uncertain, keep the episodes and abstain from the fact** — an absent fact costs a retrieval; a wrong fact costs a wrong action, authoritatively, forever.

## 4. Architecture

```
   RAW INTERACTION (thousands of tokens/turn)
        │
        ▼  EXTRACTION (formation) — what's worth remembering? [CCM]
   ┌────────────────────────────────────────────────────────────┐
   │ EPISODIC store E (append-only, timestamped — Topic 3/5)     │
   │  "2026-07-01 deploy failed: migration not run"             │
   └───────────────────────────┬────────────────────────────────┘
                               │  CONSOLIDATION (evolution) [MEM]
                               │  L-1: entailed, not just plausible. VERIFY.
                               │  under-generalize > over-generalize (§3.3)
                               ▼
   ┌────────────────────────────────────────────────────────────┐
   │ SEMANTIC store S (dedup'd facts — Topic 5)                  │
   │  "deploys fail when migration is skipped" (entailed ✓)      │
   │  NOT "deploys always fail" (over-generalized ✗ — L-1 blocks) │
   └───────────────────────────┬────────────────────────────────┘
        │ DEDUP (L-2)          │ CONFLICT RESOLUTION (L-3)
        │ merge iff ≡          │ recency/confidence/authority (Topic 9)
        │ keep material detail │ inconclusive → retain both + surface
        ▼                      ▼
   ┌────────────────────────────────────────────────────────────┐
   │ FORGETTING (L-4) — deliberate, policied, audited (Topic 3)  │
   │  staleness · low value · privacy (Topic 14). NOT accidental. │
   └────────────────────────────────────────────────────────────┘
```

**The pipeline is directional and lossy, which is why the source is retained.** Episodes flow to facts; facts are deduplicated and reconciled; stale memory is forgotten. Each step loses information (that is the point — abstraction is compression). **The safety valve is retaining the episodic source** (Topic 3's append-only log): if a consolidated fact turns out wrong, the episodes it came from are still there to re-consolidate correctly. **Never forget the episodes that a fact was consolidated from while the fact is still authoritative** — that would make the fact unverifiable and unfixable (Chapter 6, Topic 4's "summary becomes the sole record" hazard, at the memory layer).

## 5. Grounding

- **Memory is manufactured through directional dynamics:** "raw event streams are gradually transformed into reusable semantic fact bases," stored in "vector databases… key-value stores, or knowledge graphs," "governed by procedures for deduplication and consistency checking" [MEM] — the consolidation pipeline and L-1's consistency check.
- **The evolution dynamics are consolidation, updating, forgetting:** [MEM]'s dynamics section explicitly covers "Consolidation," "Updating," and "Forgetting" as first-class operations — L-1 through L-4.
- **Consolidation ensures consistency, coherence, adaptability:** "Consistency implies stable behavior and self-presentation over time" via "a persistent internal state" [MEM] — the *goal* of correct consolidation; over-generalization breaks consistency by manufacturing false facts.
- **Extraction is the auto-memory decision:** the agent "decides what's worth remembering based on whether the information would be useful in a future conversation" [CCM] — extraction, shipped, and its inspectability is the compensating control for extraction errors (Topic 6).
- **Consolidation as note-taking, and note-precision tuning:** [ECE]'s structured note-taking (the agent writes durable notes) is agent-driven extraction+consolidation; and its compaction discipline — "maximize recall… then iterate to improve precision" [ECE] — is the tuning order for the summarization inside consolidation (Chapter 6, Topic 11).
- **Conflict resolution is I-4 at the memory layer:** Chapter 6, Topic 8 (surface conflicts, do not silently resolve) — L-3.
- **Supersession is the resolution mechanism:** Topic 9 (temporal validity, supersession) — L-3's default rule (newer supersedes, old retained as superseded).
- **The episodic source is the event log:** Topic 3 (append-only, authoritative) — the safety valve for re-consolidation.

**Evidence gap, stated plainly.** [MEM] is a **survey** that catalogues the lifecycle dynamics and names the operations; it **does not measure** consolidation error rates, optimal generalization thresholds, or forgetting policies' effect on task performance. The invariants L-1 through L-4 are **[synthesis]** — reasoned quality-control disciplines grounded in the survey's operations and in the authority-manufacturing argument (§3.3), not measured findings. **No source measures how often consolidation over-generalizes or what generalization threshold is optimal** — the "under-generalize > over-generalize" rule is reasoned from the asymmetric cost (a wrong authoritative fact vs a missing one), not from an effect size. §8 is how you measure consolidation fidelity locally.

## 6. Implementation

**Consolidation with entailment verification (L-1) — the dangerous operation, gated:**

```python
def consolidate(episodes: list[Episode], candidate_fact: str, model) -> Decision:
    """L-1: a consolidated fact enters the AUTHORITATIVE semantic store only if it is
    ENTAILED by the episodes — not merely plausible. This gate is the difference between
    a fact base of truths and one of confident hallucinations (§3.3)."""
    verdict = model.check_entailment(
        premise="\n".join(e.text for e in episodes),
        hypothesis=candidate_fact,
    )
    if verdict == "entailed":
        return Decision.persist_fact(candidate_fact, sources=[e.id for e in episodes])
    if verdict == "over_generalized":
        # Prefer under-generalization: abstain rather than manufacture a false fact.
        return Decision.abstain(f"'{candidate_fact}' not entailed by episodes — keep episodes only")
    return Decision.abstain("uncertain — retain episodes, no fact")
```

**Deduplication that preserves material detail (L-2):**

```python
def deduplicate(m1: Memory, m2: Memory, model) -> Memory | tuple[Memory, Memory]:
    """L-2: merge only if SEMANTICALLY EQUIVALENT. A material-detail difference
    (a qualifier, a scope, a number) means they are NOT duplicates."""
    if model.semantically_equivalent(m1, m2):        # not just "similar" — equivalent
        return merge(m1, m2, keep_provenance=[m1.id, m2.id])
    if model.one_qualifies_other(m1, m2):
        # "rate limit 100/min" vs "100/min for tier 2" — keep BOTH; the qualifier matters.
        return (m1, m2)
    return (m1, m2)
```

**Conflict resolution by principle, surface if uncertain (L-3):**

```python
def resolve_conflict(m1: Memory, m2: Memory) -> Resolution:
    """L-3: resolve by a DECLARED rule; if inconclusive, retain both + surface (Ch.6 T8 I-4)."""
    if m1.confidence != m2.confidence:               # Topic 9
        winner, loser = (m1, m2) if m1.confidence > m2.confidence else (m2, m1)
        return Resolution.supersede(winner, loser)   # loser RETAINED as superseded, not deleted
    if m1.observed_at != m2.observed_at:
        newer, older = (m1, m2) if m1.observed_at > m2.observed_at else (m2, m1)
        return Resolution.supersede(newer, older)    # recency default (Topic 9)
    # Inconclusive: do NOT pick silently — surface both (I-4).
    return Resolution.surface_both(m1, m2, note="conflicting memory of equal standing")
```

**Forgetting as a deliberate, audited event (L-4):**

```python
def forget(store, memory, reason: str, ctx) -> None:
    """L-4: forgetting is a POLICY decision + an AUDIT event (Topic 3), never accidental.
    Privacy forgetting is Topic 14; this is staleness/low-value forgetting."""
    assert reason in ("stale", "low_value", "superseded", "privacy_erasure"), "undeclared reason"
    # Retain episodic sources if a fact consolidated from them is still authoritative (§4).
    if store.is_source_of_active_fact(memory):
        return                                       # do not orphan an authoritative fact
    ctx.event_log.append(Event(kind="memory_forget",
                               payload={"id": memory.id, "reason": reason}, timestamp=utcnow()))
    store.remove(memory)
```

## 7. Trade-offs

| Operation | Aggressive | Conservative | Right default |
|---|---|---|---|
| Extraction | Remember much (bloat) | Remember little (amnesia) | Value-gated (Topic 6); inspectable [CCM] |
| **Consolidation** | Broad facts (useful, **risky**) | Specific facts (safe, less useful) | **Conservative — under-generalize** (§3.3) |
| Deduplication | Merge freely (lose detail) | Merge rarely (bloat, contradiction) | Merge only on equivalence (L-2) |
| Conflict resolution | Auto-pick (fast, can err) | Surface all (safe, noisy) | Principle then surface (L-3) |
| Forgetting | Forget freely (amnesia) | Retain all (bloat, privacy risk) | Policied + audited (L-4) |

**The asymmetry that sets the consolidation default.** Consolidation is the operation where aggressive and conservative have *asymmetric failure costs*: an over-general fact is *wrong and authoritative* (acted on, cited, propagated); an under-general fact is merely *less useful* (a retrieval that could have been broader). **Because a wrong authoritative fact is categorically worse than a missing useful one, consolidation defaults conservative** — under-generalize, verify entailment, abstain when uncertain. This is the same "the failure that is cheaper to recover from" principle as Topic 1 (authoritative default) and Topic 2 (narrow scope), applied to the manufacturing of facts.

**The forgetting trade is between two real costs.** Retaining everything is a bloat cost (Chapter 5, Topic 15's saturation, at the memory layer) *and* a privacy liability (Topic 14 — data you kept that you should have deleted). Forgetting aggressively is an amnesia cost. Unlike consolidation, neither direction is categorically worse — so forgetting is a genuine tuning problem, governed by policy (L-4) rather than by a default lean. **The one hard rule: forgetting is deliberate and audited, never accidental** — accidental loss is the failure, principled forgetting is the feature.

## 8. Experiments

**The consolidation-fidelity test — the most important experiment in the topic.** Take sets of episodes; have the system consolidate them into facts; **verify each fact against the episodes for entailment** (L-1). Measure the *over-generalization rate*: fraction of consolidated facts not entailed by their episodes. **This rate is your semantic store's hallucination rate**, and it directly determines how much of your "knowledge" is actually true. Target: low, and every over-generalized fact is a durable authoritative falsehood.

**The consolidation-threshold sweep.** Vary how aggressively the system generalizes; measure over-generalization rate (correctness) vs fact-base utility (do the facts help tasks?). **The trade is single-peaked**: too specific → useless facts; too broad → false facts. Find the peak locally; no source provides the threshold.

**Deduplication precision/recall (L-2).** On labeled duplicate/non-duplicate pairs: dedup precision (did merges preserve distinctness?) and recall (did redundant memories merge?). **A false merge that loses a material qualifier is the L-2 failure** — weight precision.

**Conflict-resolution correctness (L-3).** On labeled conflicts with known correct resolutions: does the rule pick right? Does it surface the genuinely-ambiguous ones rather than guessing? **Silent wrong resolution is the failure** (Chapter 6, Topic 8).

**Forgetting-policy ablation.** Aggressive vs conservative forgetting; measure amnesia (forgot something needed later) vs bloat/staleness. **Confirm forgetting is audited** — every removal is a Topic 3 event, or it is accidental loss.

**Statistics.** Wilson intervals on over-generalization, dedup precision/recall, resolution correctness; task-clustered bootstrap on utility; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Over-generalized consolidation.** A wrong general fact induced from specific episodes, stored authoritatively. **The most dangerous lifecycle failure** — a durable falsehood the agent believes and acts on. Mitigation: L-1 entailment verification; under-generalize; abstain when uncertain.
- **Extraction bloat/amnesia.** Persisting noise or missing signal. Mitigation: value-gated extraction (Topic 6); inspectability [CCM].
- **False merge.** Deduplication loses a material qualifier ("100/min" vs "100/min tier 2"). Mitigation: L-2 — merge only on equivalence, not similarity.
- **Silent conflict resolution.** The lifecycle picks a side and destroys the conflict signal. Mitigation: L-3 — principle then surface (Chapter 6, Topic 8 I-4).
- **Accidental forgetting (loss).** Memory that mattered removed without policy. Mitigation: L-4 — deliberate, audited; never budget-driven eviction of authoritative memory (Topic 1 K-2).
- **Orphaned fact.** Episodes forgotten while a fact consolidated from them is still authoritative → the fact becomes unverifiable and unfixable. Mitigation: retain sources of active facts (§4, §6).
- **Consolidating a consolidation.** Facts consolidated from facts (not episodes), compounding abstraction error. Mitigation: consolidate from episodic sources, not from prior facts (§4).
- **Poisoned consolidation.** Untrusted episodes (Topic 6 W-2) consolidated into an authoritative fact — the persistence-injection vector via the lifecycle. Mitigation: W-2 (untrusted content is not authoritative) composes with L-1 (consolidation from trusted episodes only).
- **Edge case — the legitimately-changing fact.** "The API rate limit is 100/min" becomes "200/min." This is not a conflict to surface but a *supersession* (Topic 9) — the old fact is retained as historical, the new one is current. Mitigation: temporal validity (Topic 9) distinguishes supersession from contradiction.
- **Open limitation.** [MEM] catalogues the dynamics but **measures none of them** — no consolidation error rate, no optimal generalization threshold, no forgetting-policy effect size. L-1 through L-4 are **[synthesis]** quality-control disciplines reasoned from the authority-manufacturing argument and the asymmetric costs, not measured. §8 provides local measurement; no source provides a universal.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Memory is manufactured through directional dynamics: "raw event streams are gradually transformed into reusable semantic fact bases," dedup'd and consistency-checked [MEM].
2. The evolution dynamics are consolidation, updating, and forgetting — all first-class [MEM].
3. Consolidation ensures "consistency, coherence, and adaptability" via a persistent internal state [MEM]; over-generalization breaks consistency.
4. Extraction is the agent's "what's worth remembering" decision [CCM]; note-taking is agent-driven consolidation [ECE].
5. Summarization tunes recall-first-then-precision [ECE].
6. **[MEM] measures none of the lifecycle operations** — the invariants are synthesized quality controls.

**Decision rules.**
- **Verify consolidation for entailment** (L-1) — it manufactures authoritative facts, and a plausible-but-unentailed fact is a durable lie.
- **Under-generalize > over-generalize** — a specific fact is less useful; a broad fact is wrong.
- **Abstain when consolidation is uncertain** — keep the episodes, skip the fact.
- **Deduplicate on equivalence, not similarity** (L-2) — preserve material detail.
- **Resolve conflicts by declared rule, surface the ambiguous** (L-3); supersede, do not delete.
- **Forgetting is deliberate and audited** (L-4) — never accidental, never budget-driven for authoritative memory.
- **Retain the episodic sources of active facts** — or the facts become unverifiable.

**Production implications.**
1. Run the consolidation-fidelity test (§8); the over-generalization rate *is* your knowledge base's hallucination rate, and it is probably higher than you think.
2. Gate consolidation on entailment verification; it is the single highest-leverage memory-quality control.
3. Default consolidation conservative; abstention is cheaper than a false authoritative fact.
4. Make forgetting a policied, audited event (Topic 3); accidental loss and un-audited retention are both failures.
5. Compose W-2 (Topic 6) with L-1: consolidate only from trusted episodes, or the lifecycle becomes an injection laundromat.

**Connections.** This topic operationalizes [MEM]'s dynamics on the types Topic 5 defined, over the episodic log Topic 3 makes authoritative. Consolidation manufactures the semantic memory Topic 5 catalogues; conflict resolution and supersession are Topic 9's temporal-validity mechanics; forgetting-for-privacy is Topic 14. L-1 composes with Topic 6's W-2 to close the lifecycle injection vector; L-3 is Chapter 6, Topic 8's I-4 at the memory layer; the recall-then-precision tuning is Chapter 6, Topic 11. Memory bloat from bad extraction is Chapter 5, Topic 15's saturation.

## Sources

[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — dynamics (formation, evolution, retrieval); evolution as "Consolidation," "Updating," "Forgetting"; "raw event streams are gradually transformed into reusable semantic fact bases," stored in "vector databases… key-value stores, or knowledge graphs," "governed by procedures for deduplication and consistency checking"; consolidation ensuring "consistency, coherence, and adaptability" via "a persistent internal state regarding user-specific facts"
[CCM] Claude Code memory model — extraction as the agent deciding "what's worth remembering based on whether the information would be useful in a future conversation"; inspectable, editable, deletable auto-memory — https://code.claude.com/docs/en/memory
[ECE] Anthropic, "Effective context engineering for AI agents" — structured note-taking as agent-driven extraction/consolidation; compaction tuning "maximize recall… then iterate to improve precision" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
