# Topic 13 — State Migration Across Model, SDK, Schema, and Deployment Versions

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Migrating persisted state, memory, and artifacts across the version changes that happen underneath a long-lived agent: model upgrades, SDK releases, your own schema evolution, and deployment moves. Persisted data outlives the system versions that wrote it, so this is where Chapter 4, Topic 13's version discipline meets durable storage.

**Prerequisites.** Chapter 4, Topic 13 (the four version axes; change classes; migration tests); Topic 3 (the event log and reducer-version drift); Topic 9 (provenance carries the version data was written under).

**Terminology.** *State migration*: transforming persisted data to remain valid under a new system version. *Reducer version*: the code that folds events into state (Topic 3); its version must match the events' version. *Schema evolution*: changing your own data schemas over time.

**Boundaries.** Inside: migrating persisted data across the four version axes. Outside: the version-pinning discipline itself (Chapter 4, Topic 13); the conformance tests (Chapter 4, Topic 14); retention (Topic 14 here).

**Exclusions.** No database-migration-tool survey.

**Outcomes.** The reader can migrate persisted state across model/SDK/schema/deployment changes without data loss or silent corruption, and can version their persisted data so migration is possible at all.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Persisted data is written under a system configuration and read back — sometimes months later — under a different one. The event log written by SDK v2.0 is folded by a reducer in SDK v2.5 (Topic 3's reducer drift); the memory embedded by model A is searched by model B with a different embedding space; the artifact schema v1 is read by code expecting schema v3; the state stored on-premise is migrated to a managed platform (Chapter 4, Topic 12's within-vendor gaps). **Each is a version boundary that persisted data must cross, and crossing it wrong means data loss or — worse — silent corruption** (data that reads without error but means something different than it did when written).

**Bottleneck.** Chapter 4, Topic 13 established four version axes (model, API/beta, SDK, your schemas), each changing on someone else's schedule. That chapter was about *live requests*; this topic is about *persisted data*, which has a harder problem: **a live request fails loudly on a version mismatch, but persisted data can be silently misread.** An event log folded by a mismatched reducer (Topic 3) reconstructs *wrong state* without erroring; memory embedded under an old model retrieved under a new one returns *plausible-but-wrong* results. The bottleneck is that persisted-data version mismatches are often silent, and silence is what makes them dangerous.

**Objective.** Every persisted datum carries the version it was written under (Topic 9's provenance); migrations are explicit, tested, and reversible where possible; and version mismatches are detected, not silently absorbed.

**Assumptions.** Persisted data outlives system versions. Version changes happen on external schedules (Chapter 4, Topic 13). Some mismatches are silent.

**Constraints.** Migrations run over potentially large stores (cost, downtime). Some migrations are irreversible (a lossy transform). Model-version changes to embeddings may require re-embedding the entire store.

**Success criteria.** Every persisted datum's version is recorded; migrations are tested (Chapter 4, Topic 14's tiers); mismatches are detected; no silent corruption.

## 3. Intuition first, then formalization

### 3.1 Intuition: persisted data is a message to the future, in a format the future may not read

The reframe: **persisted state is a message you write to a future version of your system, and the future may speak a different dialect.** The event log, the memory store, the artifacts — all are read back by code, models, and schemas that did not exist when the data was written. Migration is translation between dialects, and the first requirement of translation is *knowing which dialect the message is in.*

The four version axes (Chapter 4, Topic 13), each a dialect boundary for persisted data **[synthesis; grounded in Chapter 4, Topic 13]**:

- **Model version.** The dangerous one for memory. A memory store's embeddings live in a *model-specific vector space*; a model upgrade that changes the embedding space makes old embeddings *incomparable* to new queries — retrieval silently degrades, returning plausible-but-wrong results. **A model change can require re-embedding the entire memory store**, and the failure if you do not is silent (Chapter 4, Topic 13's "silent behavioral drift"). Model changes also shift tokenization (Chapter 4, Topic 13), affecting stored token counts and budgets.
- **SDK version.** The reducer-drift one (Topic 3). The event log written under one SDK is folded by a reducer under another; if the reducer's fold semantics changed (Chapter 4, Topic 13's SDK defect fixes and default changes), reconstruction diverges. **The event log is only replayable if the reducer version matches** (Topic 3's recovery condition).
- **Your schema version.** The one you control and must still manage. Memory records, artifact formats, state structures — your schemas evolve, and old data must remain readable. This is ordinary schema evolution, with the agent-specific twist that some "schema" is *model-facing* (Chapter 4, Topic 13: a schema description change is a policy change).
- **Deployment version.** The Chapter 4, Topic 12 one. Moving state between on-premise and managed platforms, or between providers, crosses the continuation-semantics and state-ownership divergences — server-managed state does not port (Topic 4).

The intuition that governs migration: **you can only migrate data whose source version you know.** A datum with no recorded version is a message in an unknown dialect — you cannot translate it because you do not know what it currently means. **Provenance (Topic 9) is the version stamp that makes migration possible**, which is why "record the version data was written under" is the first discipline, not an afterthought.

### 3.2 Formalization: the migration invariants

Let persisted datum $d$ carry a source version $\nu_{\text{src}}(d)$ (the system version under which it was written), and let the current system be at version $\nu_{\text{cur}}$. A migration $\mu: (\nu_{\text{src}}, \nu_{\text{cur}}) \to (\text{transform})$ makes $d$ valid under $\nu_{\text{cur}}$. Three invariants **[derived from Chapter 4, Topic 13; Topic 3; Topic 9]**:

$$
\textbf{D-1 (version is recorded):}\quad
\text{every persisted } d\ \text{carries } \nu_{\text{src}}(d);\ \text{a datum without a source version cannot be safely migrated.}
$$

D-1 is the precondition. It is Topic 9's provenance, specialized to version: the datum records the model, SDK, and schema versions it was written under. **Without D-1, a version mismatch is undetectable and a migration is a guess.**

$$
\textbf{D-2 (mismatch is detected, not absorbed):}\quad
\nu_{\text{src}}(d)\neq\nu_{\text{cur}}\ \Longrightarrow\ \text{migrate explicitly, or fail loudly — never read silently under the wrong version.}
$$

D-2 is the anti-silence invariant, and it is the topic's core. A reducer that folds a mismatched-version event log *without checking* produces wrong state silently (Topic 3). An embedding search that queries a mismatched-model store *without checking* returns wrong results silently. **D-2 requires that a version mismatch either triggers a migration or a loud failure — the one thing it must never do is proceed as if the versions matched.**

$$
\textbf{D-3 (migrations are tested per Chapter 4, Topic 14's tiers):}\quad
\text{a migration is validated by contract tests (structure), behavioral assertions (semantics), and re-qualification (for model changes).}
$$

D-3 imports Chapter 4, Topic 14's four-tier migration-test discipline: a schema migration needs contract tests (does the new structure parse?); a model migration needs behavioral tests (does retrieval still work after re-embedding?) *and* re-qualification (Chapter 3, Topic 14 — the model change is a configuration change). **A migration shipped without tests is a data-corruption risk deployed at scale.**

### 3.3 The re-embedding problem is the hardest migration

Most migrations are structural — transform a schema, rename a field. **The model-version migration of embedded memory is different, and it is the hardest, because it is a *lossy, expensive, silent-if-skipped* transform** **[synthesis; grounded in Chapter 4, Topic 13's model-change classes]**.

The problem: memory embedded under model A lives in A's vector space. A query embedded under model B lives in B's space. The two spaces are *not comparable* — cosine similarity between an A-embedding and a B-embedding is meaningless. So a model upgrade silently breaks retrieval: the query and the stored memories are in different spaces, and the "most similar" results are noise.

Three responses, in order of correctness **[synthesis]**:

1. **Re-embed the entire store** under the new model. Correct, and *expensive* — every memory re-embedded, potentially millions of items, at model-inference cost. This is the migration a model change forces on an embedded memory store, and it is why "just upgrade the model" is not free for memory (Chapter 4, Topic 13's "model upgrade breaks code through an unchanged endpoint," at the storage layer).
2. **Keep both spaces during transition** — query both the old-model store (with old-model query embeddings) and the new-model store, until re-embedding completes. Correct and complex; a dual-read window.
3. **Pin the embedding model separately from the generation model.** The most robust: the *embedding* model is a version axis you pin independently and change rarely, decoupled from the *generation* model you upgrade often. **This makes generation-model upgrades free for memory** (they do not touch the embedding space) and re-embedding a rare, deliberate event. This is Chapter 4, Topic 13's "independent things get independent version axes," applied to embeddings.

The discipline: **pin the embedding model, and treat a re-embedding as a major, tested, planned migration — never a side effect of a generation-model upgrade.**

## 4. Architecture

```
   PERSISTED DATA carries its source version (D-1, Topic 9 provenance)
   ┌──────────────────────────────────────────────────────────────────┐
   │ event log:    written under SDK v2.0  (reducer version)  (Topic 3)  │
   │ memory:       embedded under model A  (embedding space)             │
   │ artifacts:    schema v1                                             │
   │ state:        deployment = on-premise                              │
   └───────────────────────────┬────────────────────────────────────────┘
                               │  read back under ν_cur
                               ▼
   ┌── VERSION CHECK (D-2 — detect, never silently absorb) ──────────────┐
   │  ν_src(d) == ν_cur ?                                                │
   │     yes → read directly                                            │
   │     no  → MIGRATE (tested, D-3) or FAIL LOUD                       │
   └───────────────────────────┬────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┬─────────────────┐
        ▼                      ▼                      ▼                 ▼
   MODEL axis            SDK axis              SCHEMA axis        DEPLOY axis
   re-embed memory       reducer must match    transform schema   port state
   (§3.3, EXPENSIVE,     the event version     (contract test,    (Ch.4 T12 — server-
    silent if skipped)   (Topic 3 recovery)     Ch.4 T14)          managed doesn't port)
        │
   BEST: pin embedding model separately (§3.3) → generation upgrades free for memory

   MIGRATION TESTS (D-3, Ch.4 T14): contract → behavioral → re-qualification
```

**The event log's reducer-version coupling (Topic 3).** The event log is replayable *only if the reducer version matches the event version* (Topic 3's recovery condition). A migration across an SDK change that altered fold semantics must either migrate the events to the new reducer's expectations or run the old reducer for old events. **This is why the event log records its reducer version (D-1): reconstruction under a mismatched reducer produces wrong state silently** (D-2's core case). Version the reducer with the events, and refuse to fold events under a reducer that does not match without an explicit migration.

## 5. Grounding

- **The four version axes:** model, API/beta, SDK, your schemas — each changing on external schedules; "a team that pins only the obvious one is exposed on three" (Chapter 4, Topic 13). This topic applies them to persisted data.
- **Model upgrades break silently through unchanged endpoints:** Chapter 4, Topic 13's central warning — "model upgrades that break code through an unchanged endpoint"; silent behavioral drift; tokenizer shifts. §3.3's re-embedding problem is this, for memory.
- **The migration-test tiers:** Chapter 4, Topic 13/14's four tiers — contract tests, behavioral assertions, measured re-qualification, propensity re-screen — D-3.
- **A model change is a configuration change:** Chapter 4, Topic 13 and Chapter 3, Topic 14 — a migration triggered by a model change inherits the evidentiary burden of a configuration change.
- **The reducer must match the event version:** Topic 3's recovery condition (reconstruction needs "a version-matched reducer") — the event-log migration.
- **Provenance carries version:** Topic 9 (provenance records the source; extended here to the source *version*) — D-1.
- **Deployment portability limits:** Chapter 4, Topic 12 (continuation semantics, state ownership, within-vendor platform gaps do not port) — the deployment axis; server-managed state does not port (Topic 4).
- **Version-key experience stores:** Chapter 4, Topic 13 explicitly requires that "anything that stores model-conditioned evidence — router memory, eval baselines, cached judgments — must record the version it was collected under, or the store silently mixes regimes." **This is D-1 for memory, stated verbatim in the source** — memory embedded/collected under a model must record that model.
- **Independent version axes:** Chapter 4, Topic 13's principle (declare each axis separately) — §3.3's pin-the-embedding-model.

**Evidence gap.** The version-discipline principles are documented (Chapter 4, Topic 13/14) and one is stated verbatim for memory (version-key experience stores). The persisted-data invariants D-1..D-3 are **[synthesis]** applying that live-request discipline to durable storage. **No source measures migration failure rates, re-embedding costs, or silent-corruption incidence for agent memory.** The re-embedding problem (§3.3) is reasoned from the documented model-change classes (embedding-space incomparability is a property of how embeddings work, not a measured claim); its cost and the dual-read complexity are real but unquantified here. §8 provides local measurement.

## 6. Implementation

**Every persisted datum records its version (D-1):**

```python
@dataclass(frozen=True)
class VersionedRecord:
    """D-1: the source version is part of the record (Topic 9 provenance, for version).
    A datum without this cannot be safely migrated."""
    content: object
    schema_version: int
    model_version: str | None        # for embedded memory (§3.3)
    sdk_version: str | None          # for event-log reducer matching (Topic 3)
    written_at: datetime

def read(record: VersionedRecord, current: SystemVersion) -> object:
    """D-2: detect mismatch — migrate or fail LOUD. Never read silently under wrong version."""
    if record.schema_version != current.schema_version:
        return migrate_schema(record, current.schema_version)     # tested (D-3)
    if record.model_version and record.model_version != current.model_version:
        # §3.3: embeddings from a different model are in an incomparable space — SILENT if ignored.
        raise VersionMismatch(f"memory embedded under {record.model_version}, "
                              f"queried under {current.model_version} — re-embed required")
    return record.content
```

**The reducer-version check for event replay (Topic 3, D-2):**

```python
def replay_log(events: list[Event], reducer, current_sdk: str) -> dict:
    """Topic 3 recovery needs a VERSION-MATCHED reducer. A mismatch folds to WRONG state
    silently — D-2 forbids that. Check first."""
    for e in events:
        if e.sdk_version != current_sdk and not reducer.handles_version(e.sdk_version):
            raise ReducerMismatch(f"event written under SDK {e.sdk_version}, reducer is "
                                  f"{current_sdk} — fold semantics may differ (Ch.4 T13). Migrate.")
    return fold(reducer, INITIAL, events)
```

**Re-embedding as a planned migration (§3.3):**

```python
def migrate_embeddings(store, old_model: str, new_model: str) -> None:
    """§3.3: a model change makes old embeddings INCOMPARABLE. Re-embed the whole store —
    EXPENSIVE, and SILENT if skipped. This is a MAJOR migration, not a side effect."""
    # Dual-read window: keep both spaces until re-embedding completes.
    for batch in store.all_batches():
        new_embeddings = embed(batch.contents, model=new_model)
        store.write_embeddings(batch, new_embeddings, model_version=new_model)   # D-1
    store.mark_migration_complete(old_model, new_model)
    # BEST PRACTICE: pin the embedding model separately so generation upgrades don't trigger this.

def embedding_model() -> str:
    """§3.3: pin the EMBEDDING model independently of the GENERATION model.
    Generation upgrades are then free for memory; re-embedding is a rare, deliberate event."""
    return PINNED_EMBEDDING_MODEL      # NOT the generation model; changed rarely, deliberately
```

**Migration tested per Chapter 4, Topic 14's tiers (D-3):**

```python
def test_migration(migration, sample_data) -> None:
    # Tier 1 — contract: new structure parses.
    for d in sample_data:
        assert valid_under_new_schema(migration(d))
    # Tier 2 — behavioral: semantics preserved (a migrated preference still means the same).
    for d in sample_data:
        assert semantics_preserved(d, migration(d))
    # Tier 3 — re-qualification (model migrations): retrieval quality after re-embedding.
    #   run Chapter 3, Topic 14's ablation — a model change is a configuration change.
```

## 7. Trade-offs

| Migration | Cost | Risk if skipped | Reversible? |
|---|---|---|---|
| Schema | Transform + contract test | Old data unreadable/misread | Usually (keep old schema reader) |
| Reducer (SDK) | Version-match or migrate events | **Wrong state, silently** (Topic 3) | If events retained (they are, Topic 3) |
| Re-embedding (model) | **Whole store re-embedded** (§3.3) | **Retrieval silently broken** | Yes (keep old embeddings during transition) |
| Deployment | Port state (Ch.4 T12) | Stranded / lost state | Depends — server-managed doesn't port (Topic 4) |
| Pin embedding model | Discipline; rare re-embed | (avoids the re-embedding surprise) | — |

**The trade that decides whether model upgrades are free for memory.** If the embedding model is coupled to the generation model, every generation upgrade silently breaks memory retrieval (§3.3) and forces an expensive re-embedding — a large, recurring, easily-forgotten cost. **Pinning the embedding model separately** (§3.3) costs a little discipline (a second version axis to manage) and buys generation-model upgrades that are *free for memory* and re-embeddings that are *rare and deliberate*. **This is the single highest-leverage migration decision in the topic**, and it is Chapter 4, Topic 13's "independent version axes" principle paying off: the generation model and the embedding model change on different schedules, so they get different axes.

**The silent-corruption asymmetry (D-2) is why detection beats trust.** A version mismatch that *fails loud* costs an incident and a migration; a version mismatch that *reads silently* costs *wrong data acted on indefinitely* — the reducer that folds to wrong state, the retrieval that returns noise. **Because silent corruption is categorically worse than a loud failure, D-2 defaults to detection: check the version, and fail loud on mismatch rather than proceed.** The cost of the check (a version comparison) is trivial; the cost of skipping it is silent corruption at scale.

## 8. Experiments

**The silent-corruption test (D-2) — the critical one.** Write data under version A; read it under version B *without* migration; check whether the read *errors* (good — D-2 holds) or *returns wrong data silently* (bad — the failure D-2 exists to prevent). Test each axis: reducer mismatch (wrong state?), embedding mismatch (noise retrieval?), schema mismatch (misparsed fields?). **A silent wrong read on any axis is a D-2 violation** — the system absorbed a mismatch it should have detected.

**The re-embedding necessity test (§3.3).** Embed memory under model A; query under model B *without* re-embedding; measure retrieval quality vs a re-embedded store. **Prediction: retrieval degrades badly** (the spaces are incomparable), confirming that a model change silently breaks memory and re-embedding is required. This test is what justifies pinning the embedding model.

**The migration-test-tier validation (D-3).** For a schema migration: run contract tests (parse), behavioral tests (semantics preserved), and — for a model migration — re-qualification (Chapter 3, Topic 14). **A migration that passes contract but fails behavioral is a silent-corruption migration** (parses, means something different) — the exact failure the tiers catch.

**The version-coverage audit (D-1).** What fraction of persisted data records its source version? **Anything without a version stamp cannot be safely migrated** — it is a message in an unknown dialect. Report the fraction; the target is 100%.

**Statistics.** Zero-failure bounds on silent-corruption (target zero); retrieval-quality contrasts (re-embedded vs not) with task-clustered bootstrap; version-coverage as a fraction; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Silent reducer mismatch.** Event log folded under a mismatched reducer; wrong state reconstructed silently (Topic 3). **A core silent-corruption failure.** Mitigation: D-2 — check the reducer version; fail loud or migrate events.
- **Silent embedding mismatch.** Memory embedded under an old model queried under a new one; retrieval returns noise (§3.3). Mitigation: D-2 detection; re-embed; pin the embedding model.
- **Model upgrade breaks memory silently.** "Just upgrade the model" re-embeds nothing; retrieval degrades. Mitigation: pin embedding model separately (§3.3); treat re-embedding as a planned migration.
- **Unversioned data.** A datum with no source version; cannot be migrated. Mitigation: D-1 — version every persisted datum (Topic 9).
- **Untested migration.** A schema transform shipped without behavioral tests; parses but corrupts semantics. Mitigation: D-3 — Chapter 4, Topic 14's tiers.
- **Deployment migration loses state.** Server-managed state that does not port (Topic 4; Chapter 4, Topic 12) stranded on the old platform. Mitigation: own the truth (Topic 4's replay/log); the log ports, the server ID does not.
- **Version-mixed store.** Memory collected under multiple model versions, none recorded, silently mixing regimes — Chapter 4, Topic 13's exact warning. Mitigation: D-1 (version-key the store); segregate or re-embed per version.
- **Edge case — the irreversible migration.** A lossy transform (dropping a field, coarsening a value) cannot be undone. Mitigation: retain the pre-migration data (the event log's originals, Topic 3) until the migration is validated; migrations are reversible if the source is retained.
- **Edge case — the reducer that handles multiple versions.** A reducer written to fold events from several SDK versions (a compatibility shim) avoids event migration. Mitigation: `reducer.handles_version()` (§6) — a reducer that explicitly supports old event versions is a valid alternative to migrating the events.
- **Open limitation.** D-1..D-3 are **[synthesis]** applying Chapter 4, Topic 13's live-request discipline to persisted data (one piece — version-keying experience stores — is stated verbatim in the source). **No source measures migration failure rates, re-embedding costs, or silent-corruption incidence for agent memory.** The re-embedding problem is reasoned from embedding-space properties; §8 measures the local cost and necessity. There is no external effect size.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Four version axes (model, API/beta, SDK, your schemas) change on external schedules; pinning one leaves three exposed (Chapter 4, Topic 13).
2. Model upgrades break silently through unchanged endpoints (Chapter 4, Topic 13).
3. Event replay needs a version-matched reducer (Topic 3).
4. Model-conditioned stores "must record the version it was collected under, or the store silently mixes regimes" (Chapter 4, Topic 13) — D-1 for memory, verbatim.
5. Migrations are validated by the four test tiers (Chapter 4, Topic 14).
6. Server-managed state does not port across deployments (Topic 4; Chapter 4, Topic 12).
7. **The persisted-data invariants are this book's synthesis; migration failure rates are unmeasured.**

**Decision rules.**
- **Every persisted datum records its source version** (D-1) — no version, no safe migration.
- **Detect version mismatches; never absorb them silently** (D-2) — migrate or fail loud.
- **Pin the embedding model separately from the generation model** (§3.3) — generation upgrades stay free for memory.
- **Re-embedding is a planned, tested, major migration** — never a side effect of a model upgrade.
- **Test migrations by the four tiers** (D-3) — contract, behavioral, re-qualification, propensity.
- **Retain pre-migration data** (the event log) — migrations are reversible only if the source survives.

**Production implications.**
1. Version-stamp every persisted datum; run the version-coverage audit — unversioned data cannot be migrated.
2. Run the silent-corruption test (§8) on every axis; a silent wrong read is the failure that costs the most and shows the least.
3. Pin the embedding model separately today; it is the decision that makes future model upgrades free for memory.
4. Treat re-embedding as a planned migration with a dual-read window; skipping it silently breaks retrieval.
5. Own the authoritative log (Topic 3, Topic 4); it ports across deployments when server-managed state does not.

**Connections.** This topic extends Chapter 4, Topic 13's four-axis version discipline and Topic 14's migration tests to persisted data. It depends on Topic 3 (reducer-version matching for event replay), Topic 9 (provenance carries the source version — D-1), and Topic 4 (deployment portability; server-managed state does not port). The re-embedding problem ties to Chapter 6, Topic 5 (embedding retrieval). Retention of pre-migration data is Topic 14; the "model change is a configuration change" burden is Chapter 3, Topic 14.

## Sources

[ANT-API]/[Chapter 4, Topic 13] Anthropic Claude API reference and Chapter 4's version discipline — four version axes (model, API/beta, SDK, your schemas); model upgrades breaking silently through unchanged endpoints; tokenizer shifts; silent behavioral drift; the migration-test tiers; "anything that stores model-conditioned evidence — router memory, eval baselines, cached judgments — must record the version it was collected under, or the store silently mixes regimes" — platform.claude.com docs (cache 2026-06)
[ADK-S] Google ADK session/state — SessionService backends (InMemory / Database / VertexAI) as deployment-version axis; state persistence tied to the backend — https://adk.dev/sessions/
[OCS] OpenAI conversation-state — server-managed state (Conversations objects, `previous_response_id`) that does not port across providers (Topic 4; Chapter 4, Topic 12) — https://developers.openai.com/api/docs/guides/conversation-state
