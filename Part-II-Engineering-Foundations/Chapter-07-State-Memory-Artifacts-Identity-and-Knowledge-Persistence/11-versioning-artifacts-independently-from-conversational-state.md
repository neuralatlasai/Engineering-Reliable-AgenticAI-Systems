# Topic 11 — Versioning Artifacts Independently from Conversational State

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Why an artifact's version history must be *decoupled* from the conversation that produced it, and how to version artifacts on their own axis — so a report at version 3, a patch at version 5, and the conversation at turn 40 evolve independently.

**Prerequisites.** Topic 10 (the artifact lifecycle; A-3's decoupling); Topic 3 (the event log — conversational state is versioned by events); Chapter 4, Topic 13 (version pinning — the same discipline for provider surfaces).

**Terminology.** *Artifact version*: an immutable snapshot of an artifact at a point in its evolution. *Conversational state*: the session's position (Topic 2), versioned by the event log (Topic 3). *Independent versioning*: the artifact's version axis is separate from the conversation's turn axis.

**Boundaries.** Inside: the decoupling, its rationale, and the versioning mechanism. Outside: the artifact lifecycle broadly (Topic 10); state migration across *system* versions (Topic 13); retention of versions (Topic 14).

**Exclusions.** No VCS (git) tutorial; git is one implementation, not the concept.

**Outcomes.** The reader can version artifacts independently of the conversation, reference a specific artifact version from context, and roll an artifact back without rewinding the conversation.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** An artifact evolves during a run: a report is drafted, revised, re-generated; a patch is written, corrected, extended. Each revision is a *version*. The conversation *also* evolves — turn by turn. The naive coupling ties them: "the report as of turn 20." But this coupling breaks the moment the two axes need to move independently — when you want to roll the report back to version 2 *without* rewinding the conversation to turn 20, or reference report v2 and patch v5 in the same turn (different artifacts at different versions), or resume a conversation with the *latest* artifacts rather than the ones from when the conversation paused.

**Bottleneck.** Conversational state is versioned by the event log (Topic 3): the conversation's "version" is its turn/event count. Coupling an artifact's version to the conversation's turn count means the artifact has no independent version axis — you cannot express "report v3, produced across turns 5, 12, and 20" as a first-class version; you can only express "the report's content at turn 20." The bottleneck is that **artifacts and conversations have different natural version granularities** (an artifact versions on *revisions*, a conversation on *turns*), and forcing one axis onto both loses the ability to reference, roll back, or resume either independently.

**Objective.** Artifacts versioned on their own axis (revision number, independent of turn), referenced by `(artifact_id, version)` from context, rollback-able without conversation rewind, and resumable to the latest version.

**Assumptions.** Artifacts revise during a run. Conversations and artifacts evolve at different granularities. Both need version history.

**Constraints.** Artifact versions must be immutable (like events, Topic 3) to be referenceable. Version history grows (retention, Topic 14).

**Success criteria.** An artifact version is referenceable independently of any turn; an artifact rolls back without conversation rewind; a resumed conversation gets the latest artifact version, not a stale coupled one.

## 3. Intuition first, then formalization

### 3.1 Intuition: two clocks, not one

The reframe: **the conversation and its artifacts run on two independent clocks, and coupling them to one clock loses information that only two clocks can express.**

The conversation's clock ticks on turns/events (Topic 3): turn 1, turn 2, …, turn 40. The report's clock ticks on revisions: v1 (initial draft), v2 (added section 3), v3 (fixed the numbers). The patch's clock ticks on its own revisions: v1, …, v5. **These are three independent clocks**, and a real interaction needs to reference points on each independently: "in this turn (conversation clock), use report v2 (report clock) and patch v5 (patch clock)."

The failures of a single coupled clock **[synthesis]**:

- **Cannot roll back an artifact without rewinding the conversation.** If the report's version *is* the turn number, reverting the report to v2 means reverting the conversation to turn 20 — losing 20 turns of conversation to undo one artifact revision. **Two clocks let you roll back one without touching the other.**
- **Cannot reference mixed versions.** "Report v2 and patch v5 in one turn" is unexpressible if versions are turns — v2 and v5 would be different turns, but the turn is one number.
- **Cannot resume to latest artifacts.** A conversation paused at turn 20 and resumed later should get the *current* artifacts (someone may have revised the report to v4 in between), not the v3 frozen at turn 20. **Coupling freezes artifacts to the pause point; decoupling lets them advance.**

The intuition that governs it: **conversational state is versioned by events (Topic 3); artifacts are versioned by revisions; the two axes are orthogonal and must stay orthogonal.** This is Topic 10's A-3 (lifecycle decoupled) sharpened to the version axis specifically.

### 3.2 Formalization: orthogonal version axes

Let the conversation have an event-log version $\nu_c$ (its turn/event count, Topic 3) and each artifact $a$ have an independent version $\nu_a$ **[synthesis]**:

$$
\text{system position} = \bigl(\nu_c,\ \{(\text{artifact\_id},\ \nu_a)\}\bigr),
$$

a *tuple* of the conversation version and a per-artifact version map — not a single scalar. The invariants **[derived]**:

$$
\textbf{V-1 (orthogonal axes):}\quad
\nu_a\ \text{is independent of } \nu_c;\ \text{an artifact revision increments } \nu_a\ \text{without touching } \nu_c,\ \text{and a turn increments } \nu_c\ \text{without touching any } \nu_a.
$$

V-1 is the two-clocks invariant: a report revision (v2→v3) is not a conversation event, and a conversation turn is not a report revision. They increment independently. **The system's position is the tuple, and the tuple's components move independently.**

$$
\textbf{V-2 (versions are immutable, referenceable):}\quad
\text{each } (\text{artifact\_id}, \nu_a)\ \text{is an immutable snapshot;}\ \text{context references it by the pair, not by turn.}
$$

V-2 makes artifact versions first-class, referenceable objects — like events (Topic 3, immutable and ordered). A context handle (Topic 10) carries `(artifact_id, version)`, so the agent references *this exact version*, and that reference is stable regardless of what the conversation does.

$$
\textbf{V-3 (rollback and resume operate per-axis):}\quad
\text{rolling back } a\ \text{to } \nu_a'\ \text{leaves } \nu_c\ \text{unchanged;}\ \text{resuming a conversation gets the CURRENT } \nu_a,\ \text{not the one at pause.}
$$

V-3 is the payoff: rollback and resume operate on one axis without disturbing the other. Roll the report back to v2 (conversation untouched). Resume the conversation and get the latest patch (v5, even if you paused at v3). **This is only possible because the axes are orthogonal (V-1) and versions are referenceable (V-2).**

### 3.3 The relationship to conversation-state versioning

Topic 3 established that conversational state is versioned by the event log — the conversation's "version" is $\nu_c$, its event count, and its history is the fold of events. Artifacts add a *second* versioning system, and the two relate but do not merge:

- **The event log records artifact events** (created, revised, rolled back — Topic 10's `artifact_created`), so the conversation's log *knows about* artifact versions. But the log records *that* a version happened, not by *being* the version axis. The artifact version lives on the artifact.
- **A context handle links the two:** it carries `(artifact_id, version)`, so a given turn's context references specific artifact versions. This is the join between the clocks — at conversation-time $\nu_c$, context references artifact-versions $\{\nu_a\}$ — but the reference is a *pointer*, not a coupling.

The distinction that matters **[synthesis]**: **the event log is authoritative about the conversation and about the *fact* of artifact changes; the artifact store is authoritative about the artifact's *content* at each version.** A rollback is an event in the log (auditable — "rolled report back to v2 at turn 25") *and* a version-pointer change (the handle now references v2). The two systems cooperate: the log audits, the artifact store versions. **They do not merge into one clock, because merging loses V-1's independence.**

## 4. Architecture

```
   CONVERSATION CLOCK (ν_c — event log, Topic 3)
   turn 1 ── turn 2 ── ... ── turn 20 ── turn 25 ── ... ── turn 40
                              │            │
                              │ handle     │ handle: rollback event logged
                              │ refs       │
                              ▼            ▼
   ARTIFACT CLOCKS (independent — V-1)
   report:  v1 ──── v2 ──────── v3 ─────────────  [rollback to v2 at turn 25]
              (turn5) (turn12)   (turn20)              ↑ ν_c UNCHANGED (V-3)
   patch:   v1 ─ v2 ─ v3 ─ v4 ─ v5 ──────────────────────────────
   dataset: v1 ──────────────── v2 ────────────────────────────────

   SYSTEM POSITION = (ν_c=40, {report: v2, patch: v5, dataset: v2})   ← a TUPLE, not a scalar

   RESUME a conversation paused at turn 20:
     → get CURRENT artifact versions (patch v5), NOT the v3 frozen at pause (V-3)

   THE EVENT LOG audits version changes; THE ARTIFACT STORE holds version content (§3.3).
```

**The two systems, cooperating not merging.** The event log (Topic 3) is the conversation's version axis and the *audit* of artifact changes. The artifact store (Topic 10) is the artifacts' version axis and the *content* at each version. A context handle joins them by carrying `(artifact_id, version)`. **This cooperation — log audits the change, store holds the version, handle references it — is what gives you both auditability (the log) and independent versioning (the store) without collapsing the two clocks into one.** A design that versions artifacts *in* the event log (as turn-stamped content) collapses the clocks and loses V-1; a design that versions artifacts with *no* log record loses the audit. Both systems, each authoritative over its own concern.

## 5. Grounding

- **Artifacts are a distinct tier with their own lifecycle:** [GCA]'s four-tier separation of Artifacts from Session — Topic 10's A-3, and the basis for a separate version axis. Artifacts are "associated with the session or user" [GCA] but are not the session's state.
- **Conversational state is versioned by events:** Topic 3 (the event log is authoritative; the conversation's version is its event count) — $\nu_c$.
- **Session rewinding is an event-axis operation:** [ADK] "session rewinding" [ADK] operates on the conversation clock; artifact rollback is a *different* operation on a *different* clock — the distinction V-3 formalizes.
- **Version pinning is a general discipline:** Chapter 4, Topic 13 (four version axes — model, API, SDK, your schemas — each pinned independently) — this topic adds the *artifact* version axis to that discipline, and the principle is the same: **independent things get independent version axes, declared separately.**
- **Immutable versions are the referenceable form:** Topic 3 (events are immutable and ordered) — V-2 applies the same property to artifact versions.
- **Checkpoints are versioned artifacts:** Chapter 3, Topic 9 and Chapter 10 (checkpoints as recovery points) — a checkpoint is an artifact version, and resuming to a checkpoint is a version-axis operation.
- **Repository artifacts version independently:** Topic 12 (`CLAUDE.md`, skills, plans) and their evolution — code and knowledge artifacts version on their own axis (git, revisions), separate from any conversation.

**Evidence gap.** The artifact-tier separation is documented [GCA]; the independent-versioning discipline (V-1..V-3) is **[synthesis]** — applying Chapter 4, Topic 13's "independent things get independent version axes" principle to artifacts, and Topic 3's immutability to artifact versions. **No source explicitly documents artifact-vs-conversation version decoupling for agents**, nor measures its effect. The two-clocks argument (§3.1) is reasoned from the operations it enables (independent rollback, mixed-version reference, resume-to-latest), not measured. §8 provides local validation of those operations.

## 6. Implementation

**Independent version axes (V-1):**

```python
@dataclass(frozen=True)
class ArtifactVersion:
    """Immutable, referenceable (V-2). Its version axis is independent of ν_c (V-1)."""
    artifact_id: str
    version: int                    # the ARTIFACT clock — independent of turn
    content: bytes | str
    created_at_turn: int            # links to ν_c for audit, but is NOT the version
    parent_version: int | None      # revision history

class ArtifactStore:
    def revise(self, artifact_id: str, new_content, ctx) -> ArtifactVersion:
        """V-1: increments the ARTIFACT version, NOT ν_c. A revision is not a turn."""
        prev = self.latest(artifact_id)
        v = ArtifactVersion(artifact_id, prev.version + 1, new_content,
                            created_at_turn=ctx.current_turn, parent_version=prev.version)
        self.put(v)
        # The event log AUDITS the change (§3.3) — but the store holds the version.
        ctx.event_log.append(Event(kind="artifact_revised",
            payload={"id": artifact_id, "version": v.version}, timestamp=utcnow()))
        return v
```

**System position as a tuple (§3.2):**

```python
def system_position(conversation, artifact_store) -> dict:
    """The position is a TUPLE (§3.2): conversation version + per-artifact version map.
    NOT a single scalar. This is what lets the axes move independently."""
    return {
        "conversation_version": conversation.event_count,          # ν_c
        "artifacts": {a.id: artifact_store.latest(a.id).version    # {(id, ν_a)}
                      for a in artifact_store.all()},
    }
```

**Rollback per-axis, resume-to-latest (V-3):**

```python
def rollback_artifact(store, artifact_id, target_version, ctx) -> None:
    """V-3: roll the ARTIFACT back — ν_c UNCHANGED. The conversation is not rewound."""
    target = store.get(artifact_id, target_version)
    store.set_current(artifact_id, target_version)     # handle now references v2
    ctx.event_log.append(Event(kind="artifact_rolled_back",     # AUDITED (§3.3)
        payload={"id": artifact_id, "to_version": target_version}, timestamp=utcnow()))
    # The conversation continues from where it is — no turns lost.

def resume_conversation(session, store) -> Context:
    """V-3: resume gets CURRENT artifact versions, not the ones frozen at pause."""
    ctx = load_conversation(session)                   # ν_c restored to pause point
    for handle in ctx.artifact_handles:
        handle.bind(store.latest(handle.artifact_id))  # LATEST ν_a, not the paused one
    return ctx
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Independent axes (V-1) | Rollback/resume/mix per-axis (V-3) | Two version systems to maintain |
| Coupled to turn | One clock, simple | **Cannot roll back artifact without rewinding conversation**; cannot mix versions; freezes artifacts on resume |
| Immutable versions (V-2) | Referenceable, auditable | Version history grows (Topic 14) |
| Log audits + store versions (§3.3) | Auditability AND independent versioning | Two systems cooperating |
| Version in the log | Single system | Collapses clocks — loses V-1 |
| No version record | Simple | No rollback, no audit |

**The trade the decoupling wins for any artifact that revises.** Coupling artifact version to conversation turn is simpler (one clock) and loses three capabilities the moment artifacts revise independently: independent rollback, mixed-version reference, and resume-to-latest. **For an artifact revised even twice during a run, the coupling is already inadequate** — you cannot undo revision 2 without undoing the conversation since revision 2. The cost of decoupling (two version systems, cooperating via the handle) is real infrastructure, but it is the only design that supports the operations real artifact work requires. **Decouple whenever artifacts revise; couple only for artifacts that are write-once** (a final report never revised), which is a narrow case.

**The cooperation trade (§3.3) is what avoids two bad extremes.** Versioning artifacts *in* the event log collapses the clocks (loses V-1); versioning them with no log record loses the audit. The middle — log audits the change, store holds the content — costs two cooperating systems and buys both auditability and independence. **This is the same pattern as Topic 3's log-plus-projection: two systems, each authoritative over its own concern**, and it is worth the coordination cost because collapsing to one loses a capability you need.

## 8. Experiments

**The independent-rollback test (V-3) — the core capability.** Revise an artifact several times during a conversation; roll it back to an earlier version; verify the *conversation is unchanged* (same turn, same history) while the *artifact is at the earlier version*. **If rolling back the artifact rewinds the conversation, the axes are coupled** — the V-1 failure.

**The mixed-version reference test (V-2).** In one turn, reference two artifacts at *different* versions (report v2, patch v5); verify both resolve correctly. **If versions are turn-coupled, this is unexpressible** — a direct test of orthogonality.

**The resume-to-latest test (V-3).** Pause a conversation at turn 20 with artifacts at some versions; revise the artifacts (v3→v4) while paused; resume; verify the conversation gets the *latest* artifact versions, not the ones frozen at pause. **A resume that returns stale artifacts is coupling** — the pause froze the artifact clock to the conversation clock.

**The audit-completeness test (§3.3).** After rollbacks and revisions, query the event log: can it reconstruct the full version history ("report went v1→v2→v3, rolled back to v2 at turn 25")? **If the log cannot audit the version changes, the log-store cooperation is broken** — versions are happening without audit.

**Statistics.** These are correctness tests (capabilities present or absent), reported as pass/fail with the failure being a coupling bug (Chapter 1, Topic 12's discipline applies where a rate is measured, e.g., resume-staleness rate across many resumes).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Artifact coupled to turn.** Cannot roll back the artifact without rewinding the conversation; 20 turns lost to undo one revision. **The core failure.** Mitigation: V-1 — independent axes.
- **Mixed versions unexpressible.** Report v2 and patch v5 in one turn cannot be referenced. Mitigation: V-2 — reference by `(artifact_id, version)`, not turn.
- **Resume freezes artifacts.** A resumed conversation gets stale artifacts from the pause point, not the latest. Mitigation: V-3 — resume binds to latest.
- **Versions collapsed into the log.** Artifacts versioned as turn-stamped log content; the clocks merge; V-1 lost. Mitigation: log audits the *change*, store holds the *content* (§3.3).
- **No version audit.** Rollbacks and revisions with no log record; version history unreconstructable. Mitigation: every version change is a log event (§6).
- **Mutable versions.** An artifact version modified in place; references become stale/wrong. Mitigation: V-2 — immutable versions, like events (Topic 3).
- **Unbounded version history.** Every revision retained forever. Mitigation: version retention policy (Topic 14) — retain what audit/rollback needs, prune the rest.
- **Edge case — the write-once artifact.** A final report never revised needs no version axis; coupling is harmless (there is only v1). Mitigation: decouple only artifacts that revise; write-once artifacts are a trivial single-version case.
- **Edge case — the artifact shared across conversations.** An artifact (a shared dataset) referenced by multiple conversations, each at a different conversation version, all pointing at the same artifact version. V-1's independence is *essential* here — one artifact clock, many conversation clocks. Mitigation: the artifact version is global; each conversation references it by `(id, version)`.
- **Open limitation.** The independent-versioning discipline (V-1..V-3) is **[synthesis]** applying Chapter 4, Topic 13's principle and Topic 3's immutability to artifacts. **No source explicitly documents or measures artifact-vs-conversation version decoupling for agents.** The two-clocks argument is reasoned from the operations it enables; §8 validates the operations locally. There is no external effect size.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Artifacts are a distinct tier, separate from Session state [GCA] — the basis for a separate version axis.
2. Conversational state is versioned by the event log (Topic 3); session rewinding operates on that axis [ADK].
3. Independent things get independent version axes (Chapter 4, Topic 13's four-axis discipline).
4. Immutable, ordered records are the referenceable form (Topic 3).
5. **Artifact-vs-conversation version decoupling is this book's synthesis; unmeasured externally.**

**Decision rules.**
- **Version artifacts on their own axis, independent of conversation turn** (V-1) — two clocks, not one.
- **System position is a tuple** (conversation version + per-artifact version map), never a scalar.
- **Reference artifacts by `(artifact_id, version)`** (V-2) — immutable, referenceable, not turn-stamped.
- **Rollback and resume operate per-axis** (V-3) — roll back the artifact without rewinding the conversation; resume to the latest artifact.
- **The log audits version changes; the store holds version content** (§3.3) — cooperate, do not collapse.
- **Decouple whenever artifacts revise; couple only write-once artifacts.**

**Production implications.**
1. Give artifacts an independent version axis; coupling to turn breaks the moment an artifact revises twice.
2. Run the independent-rollback and resume-to-latest tests (§8); a rollback that rewinds the conversation or a resume that freezes artifacts is a coupling bug.
3. Make every version change a log event; you will need the version-history audit for debugging.
4. Set a version retention policy (Topic 14); unbounded version history is unbounded storage.

**Connections.** This topic is Topic 10's A-3 (decoupled lifecycle), sharpened to the version axis, and it extends Chapter 4, Topic 13's version-pinning discipline to artifacts. It cooperates with Topic 3's event log (which audits version changes) via the handle's `(artifact_id, version)`. Checkpoints (Chapter 3, Topic 9; Chapter 10) are versioned artifacts. Repository artifacts (Topic 12) version on their own axis. Version retention is Topic 14; state migration across *system* versions (a different axis) is Topic 13.

## Sources

[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — Artifacts as a distinct tier "associated with the session or user," separate from Session state; the handle pattern referencing artifacts — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[ADK] Google ADK runtime — session rewinding as an event-axis operation (distinct from artifact rollback) — https://adk.dev/runtime/event-loop/
[GCA]/[ADK-S] — artifacts and sessions as separate tiers with separate lifecycles — https://adk.dev/sessions/
