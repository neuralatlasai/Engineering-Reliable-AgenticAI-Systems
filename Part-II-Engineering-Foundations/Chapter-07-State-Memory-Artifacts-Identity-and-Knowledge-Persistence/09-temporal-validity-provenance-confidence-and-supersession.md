# Topic 9 — Temporal Validity, Provenance, Confidence, and Supersession

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The metadata that makes a memory *trustworthy over time*: when it was true, where it came from, how sure we are, and what replaced it. These four fields are what let the read path (Topic 7) and the lifecycle (Topic 8) reason about a memory rather than blindly trust it.

**Prerequisites.** Topic 8 (conflict resolution and supersession use these fields); Topic 6 (write policy attaches trust; provenance extends it); Chapter 6, Topic 6 (chunk provenance) and Topic 8 (staleness, authority confusion).

**Terminology.** *Temporal validity*: the time interval over which a memory is true. *Provenance*: the memory's origin and derivation chain. *Confidence*: a calibrated degree of belief. *Supersession*: the relation by which a newer memory replaces an older one while the older is retained as historical.

**Boundaries.** Inside: the four trust-over-time fields and how they govern retrieval and conflict. Outside: the lifecycle *operations* that use them (Topic 8); the retrieval that *reads* them (Topic 7); deletion for privacy (Topic 14).

**Exclusions.** No temporal-database-theory survey.

**Outcomes.** The reader can attach temporal validity, provenance, and confidence to every memory, and can use supersession to handle change without losing history.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A memory is a *fact-at-a-time-from-a-source-with-a-confidence*, but it is usually stored as a bare string. Stripped of its metadata, "the API rate limit is 100/min" cannot answer the questions that matter: *Is it still true?* (temporal validity), *Who said so, and can I trust them?* (provenance), *How sure are we?* (confidence), *Has it changed?* (supersession). A memory system without these fields treats a stale, low-confidence, untrusted-sourced belief exactly like a fresh, certain, authoritative fact — and acts on both identically.

**Bottleneck.** Two failures follow directly. **Staleness:** a memory true when written, false when retrieved, acted on as current (Chapter 6, Topic 8's TOCTOU, made durable). **Ungrounded trust:** a memory whose source and confidence are lost, so the agent cannot distinguish a fact it verified from a fact it inferred from an untrusted web page (Topic 6's W-2, undone at read time if provenance was not carried). The bottleneck is that memory without temporal/provenance/confidence metadata cannot be trusted *conditionally* — only blindly or not at all.

**Objective.** Every memory carries temporal validity, provenance, and confidence; change is handled by supersession (new supersedes old, old retained); retrieval and conflict resolution *use* these fields rather than treating all memory as equally fresh, sourced, and certain.

**Assumptions.** Facts change over time. Sources differ in trustworthiness. Beliefs differ in certainty. History matters (supersede, do not delete).

**Constraints.** Confidence must be *calibrated* to be useful (an uncalibrated confidence is noise). Temporal validity is often unknown at write time (you know when you learned a fact, not always when it stops being true).

**Success criteria.** Stale memory is detectable (temporal validity); untrusted-sourced memory is distinguishable (provenance); uncertain memory is down-weighted (confidence); changed facts supersede without losing history.

## 3. Intuition first, then formalization

### 3.1 Intuition: a memory is a claim with a receipt

The reframe: **a memory is not a fact — it is a claim, and every claim comes with a receipt** recording when it was true, who made it, and how sure they were. The bare string "the rate limit is 100/min" is a claim with the receipt torn off, and a claim without a receipt cannot be trusted intelligently — only accepted or rejected wholesale.

The four fields on the receipt **[synthesis; grounded in Chapter 6, Topic 6/8 and [MEM]]**:

- **Temporal validity** — *when is this true?* Not just when it was written (`observed_at`), but the interval `[valid_from, valid_until]` over which it holds. "The rate limit is 100/min" was true from the API v2 launch until the v3 change. **A memory retrieved outside its validity interval is stale** — this is Chapter 6, Topic 8's staleness, with the fix being an explicit validity interval rather than an implicit "probably still true."
- **Provenance** — *where did this come from?* The source (a verified API doc? an untrusted web page? a user statement? a consolidation from episodes?) and the derivation chain. This carries Topic 6's trust class forward to read time, and it is Chapter 6, Topic 6's chunk provenance, extended to memory. **Without provenance, the read path cannot honor the write path's trust decision** — the untrusted-sourced memory (Topic 6 W-2) becomes indistinguishable from a verified one.
- **Confidence** — *how sure are we?* A calibrated degree of belief. A user's explicit statement is high-confidence; an inference from behavior is medium; a consolidation over three episodes is lower. **Confidence lets retrieval and conflict resolution down-weight uncertain memory** rather than treating all memory as certain.
- **Supersession** — *what replaced this?* When a fact changes, the new fact *supersedes* the old, and the old is retained as `superseded_by`. This is how change is handled *without losing history* — the current fact is current, the old fact is available as historical, and the transition is auditable.

The intuition that unifies them: **these four fields turn "trust or don't trust" into "trust conditionally."** A memory can be fresh but low-confidence, or high-confidence but from an untrusted source, or authoritative but superseded — and the agent should treat each combination differently. **The fields are what make conditional trust possible.**

### 3.2 Formalization: the memory record with trust-over-time

A memory is not a string but a record **[synthesis]**:

$$
m = \bigl(\text{content},\ \underbrace{[\text{valid\_from},\ \text{valid\_until}]}_{\text{temporal validity}},\ \underbrace{(\text{source},\ \text{trust},\ \text{derivation})}_{\text{provenance}},\ \underbrace{\gamma\in[0,1]}_{\text{confidence}},\ \underbrace{\text{superseded\_by}}_{\text{supersession}}\bigr).
$$

Four invariants **[derived]**:

$$
\textbf{T-1 (validity gates retrieval):}\quad
\text{at query time } t,\ m\ \text{is \emph{current} only if } t\in[\text{valid\_from},\text{valid\_until}];\ \text{otherwise it is \emph{historical}.}
$$

T-1 makes staleness detectable: a memory outside its validity interval is not "probably still true" — it is explicitly historical, and retrieval either excludes it or flags it. When `valid_until` is unknown (the common case), it defaults to *open* but with a *staleness horizon* — a memory unrefreshed past its horizon is treated as suspect and re-verified (Chapter 6, Topic 8's re-observe).

$$
\textbf{T-2 (provenance carries trust forward):}\quad
\theta(m)\ \text{written at Topic 6's gate persists on } m\ \text{and governs retrieval trust (Topic 7).}
$$

T-2 closes the loop with Topic 6: the write gate's trust decision (W-2) is *useless* if provenance is stripped, because the read path cannot then distinguish trusted from untrusted memory. **Provenance is the wire that carries the write-time trust decision to read time.**

$$
\textbf{T-3 (confidence must be calibrated):}\quad
\text{a confidence } \gamma\ \text{is useful only if } \Pr(\text{correct}\mid \gamma)\approx\gamma;\ \text{an uncalibrated } \gamma\ \text{is noise.}
$$

T-3 is the discipline that makes confidence worth storing. This is Chapter 2, Topic 8's uncertainty problem: a confidence the agent assigns is only useful if it *predicts correctness*. An agent that marks everything "high confidence" has a field that carries no information. **Calibration is what separates a useful confidence from a decorative one.**

$$
\textbf{T-4 (supersession preserves history):}\quad
\text{a changed fact } m'\ \text{supersedes } m\ \text{by setting } m.\text{superseded\_by}=m';\ m\ \text{is \emph{retained}, not deleted.}
$$

T-4 distinguishes supersession (a fact changed; keep both, mark the transition) from deletion (Topic 14 — remove entirely, for privacy). Supersession is how memory handles a changing world *while remaining auditable*: you can always ask "what did we believe on 2026-06-01, and when did it change?" This is Topic 3's append-only log discipline (never overwrite; corrections are new records) applied to semantic memory.

### 3.3 Supersession vs conflict vs deletion — three different things

The topic's sharpest distinction, because these are constantly confused **[synthesis]**:

- **Supersession** (T-4): the *same fact* changed over time. "Rate limit 100/min" → "rate limit 200/min." Not a contradiction — a *temporal change*. The old is historically true (it was 100/min); the new is currently true. **Handle by superseding: mark the old `superseded_by` the new, retain both.** Both are correct, at different times.
- **Conflict** (Topic 8, L-3): *two memories* disagree about the *same time*, and at most one is right. "The rate limit is 100/min" and "the rate limit is 500/min," both claimed as currently true. **Handle by resolution** (recency, confidence, authority) or surfacing (Chapter 6, Topic 8 I-4). One is wrong.
- **Deletion** (Topic 14): a memory must be *removed entirely* — for privacy (right to erasure), not because it is stale or wrong. **Handle by governed, audited deletion**, the one sanctioned mutation of the append-only record (Topic 3's dagger).

Confusing these produces bugs: treating supersession as conflict (surfacing a temporal change as if it were a disagreement); treating conflict as supersession (letting a wrong memory silently "supersede" a right one by recency); treating deletion as supersession (marking privacy-deleted data as merely "superseded," leaving it retained and thus not actually deleted — a compliance failure, Topic 14). **The temporal-validity and confidence fields are exactly what distinguish these cases: a temporal change has non-overlapping validity intervals; a conflict has overlapping intervals with different content; a deletion is a governance action independent of both.**

## 4. Architecture

```
   MEMORY RECORD (not a string — a claim with a receipt, §3.1)
   ┌──────────────────────────────────────────────────────────────────┐
   │ content:        "API rate limit is 100/min"                       │
   │ temporal:       valid_from=2026-01-15  valid_until=2026-06-01      │  ← T-1
   │ provenance:     source=api_docs_v2  trust=TRUSTED  derived=none    │  ← T-2 (from Topic 6)
   │ confidence:     γ=0.95 (CALIBRATED, T-3)                           │  ← Ch.2 T8
   │ superseded_by:  mem#4471 ("200/min", valid_from=2026-06-01)        │  ← T-4
   └──────────────────────────────────────────────────────────────────┘

   RETRIEVAL (Topic 7) uses the fields:
     T-1: query at time t → is m current or historical?
     T-2: trust → honor Topic 6's write-time decision
     T-3: confidence → down-weight uncertain memory in ranking
     T-4: superseded → return the CURRENT fact, not the stale one

   THREE DIFFERENT OPERATIONS (§3.3), distinguished by the fields:
     SUPERSESSION  non-overlapping validity, same fact changed  → keep both (T-4)
     CONFLICT      overlapping validity, different content       → resolve/surface (Topic 8)
     DELETION      governance action (privacy)                   → remove (Topic 14)
```

**Provenance is the through-line of the whole chapter.** It starts as chunk provenance at ingestion (Chapter 6, Topic 6), becomes trust class at the write gate (Topic 6 W-2), persists on the memory record (T-2), governs retrieval trust (Topic 7), enables attribution (Chapter 6, Topic 14), and supports deletion-by-source (Topic 14). **A memory system that drops provenance anywhere in this chain breaks every downstream trust decision** — which is why provenance is attached at ingestion and carried, never reconstructed.

## 5. Grounding

- **Temporal validity and supersession are memory dynamics:** [MEM]'s "Updating" dynamic — memory evolves as facts change; supersession is the mechanism that updates while retaining history.
- **Provenance carries trust from write to read:** Chapter 6, Topic 6 (chunk provenance: source, trust, `observed_at`, structure path) and Topic 12/Chapter 5, Topic 12 (the $\phi_u$ envelope: source, trust, uri, observed_at) — the receipt fields, established at ingestion and required at every trust decision.
- **Staleness is the failure temporal validity prevents:** Chapter 6, Topic 8 (data true when written, false when used; the long observation-to-action gap) — T-1's motivation.
- **Confidence and calibration:** Chapter 2, Topic 8 (uncertainty; a confidence is useful only if calibrated) — T-3's basis. Provenance and confidence are named memory attributes in [MEM]'s discussion of memory quality.
- **Supersession is append-only discipline:** Topic 3 (never overwrite; corrections are new records) — T-4 is Topic 3 at the semantic-memory layer.
- **Conflict resolution uses these fields:** Topic 8, L-3 (resolve by recency/confidence/authority) — the fields T-1..T-3 are exactly the resolution inputs.
- **Data sensitivity as an authorization input:** [CAH §5] — provenance (source, sensitivity) governs access (Topic 7).
- **The three operations are distinct in the literature:** [MEM]'s separation of "Updating" (supersession) from the retrieval-time conflict handling, and privacy deletion as a governance concern (Topic 14) — §3.3's distinction.

**Evidence gap.** The provenance and staleness *mechanisms* are documented (Chapter 6, Topics 6, 8; [CAH §5]) and calibration is Chapter 2, Topic 8's concern. The four-field memory record and the T-1..T-4 invariants are **[synthesis]** — a reasoned discipline for trust-over-time, grounded in the documented provenance/staleness/calibration concerns but not measured as a memory-system design. **No source measures the effect of temporal-validity or confidence metadata on memory-system quality**, nor the calibration of agent-assigned memory confidence. The supersession-vs-conflict-vs-deletion distinction (§3.3) is **[synthesis]**; its value is preventing the confusion bugs, validated by reasoning, not by an effect size.

## 6. Implementation

**The memory record with trust-over-time:**

```python
@dataclass(frozen=True)
class MemoryRecord:
    content: str
    valid_from: datetime
    valid_until: datetime | None       # None = open, with a staleness_horizon (T-1)
    provenance: Provenance             # source, trust, derivation (T-2, from Topic 6/Ch.6 T6)
    confidence: float                  # CALIBRATED (T-3, Ch.2 T8)
    superseded_by: str | None = None   # (T-4)
    staleness_horizon: timedelta | None = None

    def status_at(self, t: datetime) -> str:
        """T-1: current, historical, or stale-suspect."""
        if self.superseded_by:
            return "historical"                        # a newer fact supersedes this
        if self.valid_until and t > self.valid_until:
            return "expired"
        if self.staleness_horizon and (t - self.valid_from) > self.staleness_horizon:
            return "stale_suspect"                     # re-verify (Ch.6 T8 re-observe)
        return "current"
```

**Supersession, not overwrite (T-4):**

```python
def update_fact(store, old: MemoryRecord, new_content: str, ctx) -> MemoryRecord:
    """T-4: the fact CHANGED. Supersede — keep both, mark the transition. NOT overwrite.
    History is preserved and auditable (Topic 3)."""
    new = MemoryRecord(
        content=new_content, valid_from=utcnow(), valid_until=None,
        provenance=ctx.provenance, confidence=ctx.confidence,
    )
    store.add(new)
    # old is RETAINED, marked superseded and its validity closed.
    store.mark_superseded(old, by=new.id, valid_until=new.valid_from)
    ctx.event_log.append(Event(kind="memory_superseded",
                               payload={"old": old.id, "new": new.id}, timestamp=utcnow()))
    return new
```

**Distinguishing the three operations (§3.3):**

```python
def classify_change(existing: MemoryRecord, incoming: MemoryRecord) -> str:
    """The temporal-validity fields distinguish supersession from conflict (§3.3)."""
    overlap = intervals_overlap(existing.validity(), incoming.validity())
    if not overlap and same_subject(existing, incoming):
        return "supersession"      # non-overlapping time, same fact changed → T-4
    if overlap and contradicts(existing, incoming):
        return "conflict"          # same time, disagreement → Topic 8 L-3 (resolve/surface)
    return "distinct"              # different facts → coexist
    # DELETION (privacy) is a separate governance action (Topic 14), not classified here.
```

**Retrieval honoring the fields (Topic 7):**

```python
def rank_with_trust(memories, query, t) -> list:
    """Retrieval down-weights stale, low-confidence, untrusted memory (T-1/T-2/T-3)."""
    scored = []
    for m in memories:
        if m.status_at(t) in ("expired", "historical"):
            continue                                   # T-1: exclude non-current (unless asked)
        trust_w = 1.0 if m.provenance.trust is Trust.TRUSTED else UNTRUSTED_WEIGHT  # T-2
        score = similarity(query, m) * m.confidence * trust_w                        # T-3
        scored.append((m, score))
    return [m for m, _ in sorted(scored, key=lambda x: -x[1])]
```

## 7. Trade-offs

| Field | Buys | Costs |
|---|---|---|
| Temporal validity | Staleness detectable (T-1) | Must track/estimate validity; often unknown at write |
| Provenance | Trust honored at read (T-2); attribution; deletion-by-source | Storage; must be carried, never dropped |
| Confidence | Uncertain memory down-weighted (T-3) | **Only useful if calibrated** (Ch.2 T8) — noise otherwise |
| Supersession | Change without history loss (T-4); auditable | Store grows (old retained); must distinguish from conflict |
| Bare string (no fields) | Simple, small | **Blind trust** — stale/untrusted/uncertain all treated as fresh/trusted/certain |

**The trade the fields resolve: conditional vs blind trust.** Storing the four fields costs storage and discipline (carry provenance, track validity, calibrate confidence, supersede rather than overwrite). It buys the ability to trust memory *conditionally* — to act confidently on a fresh, high-confidence, trusted-source fact and cautiously on a stale, low-confidence, untrusted one. **Without the fields, an agent has only blind trust: it either believes all its memory equally (acting on stale poison as readily as verified fact) or trusts none of it (memory becomes useless).** The fields are what make memory *usable* rather than merely *present* — which is why the bare-string memory that most systems ship is a false economy.

**The calibration caveat is the one that undermines the field.** Confidence is worth storing *only if calibrated* (T-3). An agent that assigns confidence poorly — marking guesses "high" and facts "medium" — has a field that actively misleads (down-weighting good memory, up-weighting bad). **An uncalibrated confidence is worse than no confidence**, because it carries false signal. So confidence must be measured for calibration (§8) before it is trusted in ranking, and where the agent cannot calibrate, a coarse trusted/untrusted binary (from provenance) is more honest than a fine-grained uncalibrated $\gamma$.

## 8. Experiments

**The staleness-detection test (T-1).** Store memories with validity intervals; query at times inside and outside the intervals; measure whether stale memory is correctly excluded/flagged. **Un-flagged stale memory acted on as current is the T-1 failure** (Chapter 6, Topic 8's TOCTOU). Also test the staleness-horizon re-verification path.

**The provenance-carry test (T-2).** Write memory from untrusted sources (Topic 6); retrieve it; check whether the trust class survived to read time. **If retrieval cannot distinguish untrusted-sourced from trusted-sourced memory, provenance was dropped** — and Topic 6's write-time trust decision is undone. This is the loop-closure test between Topics 6, 7, and 9.

**The confidence-calibration measurement (T-3) — the critical one.** Collect memories with assigned confidence; measure actual correctness at each confidence level; plot $\Pr(\text{correct}\mid\gamma)$ vs $\gamma$. **A calibrated system lies on the diagonal; a miscalibrated one does not.** This is Chapter 2, Topic 8's calibration, at the memory layer. **If confidence is miscalibrated, do not use it in ranking** — it misleads. Report calibration error (e.g., ECE) with intervals.

**The supersession-vs-conflict test (§3.3).** Present temporal changes (same fact, different times) and genuine conflicts (same time, disagreement); measure whether the system classifies correctly. **Misclassifying supersession as conflict surfaces spurious disagreements; misclassifying conflict as supersession lets a wrong memory silently win by recency.**

**Statistics.** Wilson on staleness-detection and provenance-carry rates; calibration error (ECE) with bootstrap intervals; classification accuracy on supersession-vs-conflict; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Staleness.** Memory true when written, false when retrieved, acted on as current. **The core failure temporal validity prevents.** Mitigation: T-1 validity intervals; staleness horizons; re-verify (Chapter 6, Topic 8).
- **Provenance dropped.** The read path cannot distinguish trusted from untrusted memory; Topic 6's W-2 undone. Mitigation: T-2 — carry provenance, never reconstruct; the carry test.
- **Uncalibrated confidence.** A confidence field that misleads ranking. **Worse than no confidence.** Mitigation: T-3 — measure calibration; fall back to trusted/untrusted binary if miscalibrated.
- **Overwrite instead of supersede.** A changed fact overwrites the old; history lost; "what did we believe on date X" unanswerable. Mitigation: T-4 — supersede, retain, audit (Topic 3).
- **Supersession mistaken for conflict.** A temporal change surfaced as a spurious disagreement. Mitigation: §3.3 classification via validity intervals.
- **Conflict mistaken for supersession.** A wrong memory silently wins by recency. Mitigation: §3.3; overlapping validity ⇒ conflict, resolve/surface (Topic 8 L-3).
- **Deletion mistaken for supersession.** Privacy-deleted data marked "superseded" but *retained* — a compliance failure (Topic 14). Mitigation: deletion is a separate governance action, not supersession; it *removes*.
- **Unknown validity.** `valid_until` unknown at write (the common case). Mitigation: open interval + staleness horizon; re-verify past the horizon rather than trust indefinitely.
- **Edge case — provenance of a consolidation.** A semantic fact consolidated from episodes (Topic 8) has *derived* provenance — its trust is a function of the episodes' trust (Topic 6 W-2 composes with L-1). Mitigation: derivation chain in provenance; a fact consolidated from untrusted episodes inherits untrusted status.
- **Open limitation.** The four-field record and T-1..T-4 are **[synthesis]** grounded in documented provenance/staleness/calibration concerns but **not measured as a memory-system design.** No source measures the quality effect of temporal/confidence metadata or the calibration of agent-assigned memory confidence. The supersession/conflict/deletion distinction prevents specific bugs (validated by reasoning), not measured by effect size.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Memory evolves as facts change — [MEM]'s "Updating" dynamic; supersession is the mechanism.
2. Provenance (source, trust, `observed_at`) is established at ingestion and required at every trust decision (Chapter 6, Topics 6, 12).
3. Staleness — true-when-written, false-when-used — is a documented failure with a long observation-to-action gap (Chapter 6, Topic 8).
4. Confidence is useful only if calibrated (Chapter 2, Topic 8).
5. Append-only discipline (never overwrite; corrections are new records) is Topic 3.
6. **The four-field record and its invariants are this book's synthesis; the metadata's quality effect is unmeasured.**

**Decision rules.**
- **Store memory as a record with a receipt** — content plus temporal validity, provenance, and confidence — never a bare string.
- **Carry provenance from write to read** (T-2), or the write-time trust decision is undone.
- **Calibrate confidence before trusting it in ranking** (T-3); an uncalibrated $\gamma$ is worse than none.
- **Supersede, do not overwrite** (T-4) — retain history, mark the transition, audit it.
- **Distinguish supersession, conflict, and deletion** by the validity fields (§3.3) — they are three different operations.
- **Unknown validity ⇒ open interval + staleness horizon**, re-verify past it.

**Production implications.**
1. Add temporal validity, provenance, and confidence to every memory record; the bare string is a false economy that forces blind trust.
2. Run the provenance-carry test; if retrieval cannot tell trusted from untrusted memory, Topic 6's write gate is being undone.
3. Measure confidence calibration (§8) before using it in ranking; miscalibrated confidence misleads.
4. Implement supersession, not overwrite; you will need "what did we believe on date X" for debugging and audit.
5. Keep deletion (Topic 14) distinct from supersession — privacy-deleted data must be *removed*, not merely marked superseded.

**Connections.** These four fields are the substrate for Topic 8's conflict resolution (L-3 uses recency/confidence/authority) and supersession; for Topic 7's read policy (retrieval down-weights by them); and for Topic 6's write gate (which sets trust, carried by provenance). Provenance is the through-line from Chapter 6, Topic 6 (chunk provenance) through Chapter 6, Topic 14 (attribution) to Topic 14 (deletion-by-source). Confidence is Chapter 2, Topic 8's calibration; supersession is Topic 3's append-only discipline. Deletion is Topic 14.

## Sources

[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — the "Updating" dynamic (memory evolves as facts change); memory quality attributes; supersession as the update-while-retaining mechanism
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — permissions/access depending on "data sensitivity"; provenance as an access input
[ECE] Anthropic, "Effective context engineering for AI agents" — freshness and staleness as context-quality concerns; structured notes carrying provenance — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
