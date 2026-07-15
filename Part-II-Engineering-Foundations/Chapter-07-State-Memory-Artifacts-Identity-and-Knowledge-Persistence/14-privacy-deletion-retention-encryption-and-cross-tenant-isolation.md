# Topic 14 — Privacy, Deletion, Retention, Encryption, and Cross-Tenant Isolation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The governance of persisted data: who can access it (isolation), how long it lives (retention), how it is removed (deletion), and how it is protected (encryption). This is where the chapter's persistence layers meet privacy and compliance obligations.

**Prerequisites.** Topic 2 (scopes — tenancy is the outermost); Topic 7 (read policy — tenancy enforcement at retrieval); Topic 3 (the event log's immutability-vs-deletion tension); Topic 9 (provenance — deletion-by-source needs it).

**Terminology.** *Cross-tenant isolation*: the guarantee that one tenant's data is inaccessible to another. *Retention*: the policy governing how long data persists. *Deletion / erasure*: removing data, including the right-to-erasure. *Encryption*: protecting data at rest and in transit.

**Boundaries.** Inside: the governance disciplines and their invariants. Outside: the threat model broadly (Chapter 12); the read/write policies that enforce access (Topics 6–7 — this topic is their governance layer); provider-specific TTLs (Topic 4; Chapter 4).

**Exclusions.** No encryption-algorithm or compliance-framework tutorial.

**Outcomes.** The reader can isolate tenants absolutely, retain and delete data by policy, resolve the immutability-vs-erasure tension, and encrypt persisted data — making persistence compliant, not just functional.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Persisted data — state, memory, artifacts, event logs — is *personal, sensitive, and regulated*. It must be isolated between tenants (one customer's memory never reaching another), retained no longer than policy allows (data minimization), deletable on request (right to erasure), and encrypted. These are not optional features; they are obligations, and a persistence system that ignores them is a compliance incident waiting to happen — with the agent-specific twist that the data is *scattered across layers* (context, state, memory, artifacts, logs), so deletion and isolation must reach all of them.

**Bottleneck.** Two tensions make this hard. **Immutability vs erasure:** Topic 3 made the event log append-only and immutable (for audit and reconstruction), but the right to erasure *requires* deletion — the log's core property and a legal obligation are in direct conflict (Topic 3's dagger). **Scattered data vs complete deletion:** a user's data lives in the event log, the memory store, artifact storage, caches, *and* (Topic 4) possibly on a provider's servers — so "delete my data" must reach every layer, and a single missed layer is an incomplete deletion. The bottleneck is that governance must span the whole persistence architecture, and any gap is a failure.

**Objective.** Absolute tenant isolation; policy-driven retention; complete, verifiable deletion across all layers that resolves the immutability tension; and encryption of persisted data — making the persistence layer compliant by construction.

**Assumptions.** Persisted data is personal, sensitive, regulated. Deletion is a legal obligation. Tenancy violations are breaches. Data is scattered across layers.

**Constraints.** Immutability (Topic 3) conflicts with erasure. Deletion must reach every layer including providers (Topic 4). Retention must balance minimization against audit/recovery needs (Topic 3).

**Success criteria.** No cross-tenant access (breach); retention enforced by policy; deletion complete and verifiable across all layers; the immutability-erasure tension resolved; persisted data encrypted.

## 3. Intuition first, then formalization

### 3.1 Intuition: persistence is a liability, not just an asset

The reframe that governs the topic: **every datum you persist is both an asset (it helps the agent) and a liability (it is data you must protect, isolate, retain-not-too-long, delete on request, and encrypt).** A memory system optimized purely for capability — remember everything, forever, in one shared store — is a compliance disaster: it mixes tenants, retains indefinitely, cannot delete completely, and exposes sensitive data. **Governance is what turns persistence from a liability into a compliant asset.**

Four governance disciplines, each with a hard obligation **[synthesis; grounded in [OCS], [ADK-S], [CAH §5]]**:

- **Isolation (tenancy):** one tenant's data is *absolutely* inaccessible to another. This is Topic 7's R-1 (tenancy is absolute) as a governance guarantee. A cross-tenant access is a breach, not a bug — the highest-severity failure in the chapter.
- **Retention:** data lives *as long as policy allows, and no longer*. Data minimization: retain what you need for the stated purpose and duration, delete the rest. [OCS]'s TTLs (30-day response retention, `store: false` for no retention) are provider-side retention controls; your own stores need their own.
- **Deletion (erasure):** data is removable on request, *completely*, across every layer. The right to erasure. This is where the immutability tension lives (§3.3) and where scattered data must be fully reached.
- **Encryption:** persisted data is protected at rest and in transit. [OCS]'s `store: false` for zero-data-retention (ZDR) and encrypted reasoning content [OCS] are provider-side; your stores need encryption too.

The intuition that unifies them: **governance must span the whole persistence architecture, and the agent-specific hazard is that the architecture is layered (Topic 1) — so a governance guarantee is only as strong as its weakest layer.** Isolation that holds in memory but leaks in the cache; deletion that reaches the memory store but not the event log; encryption that protects artifacts but not state — each is a gap, and a gap is a failure.

### 3.2 Formalization: the governance invariants

Let a datum $d$ belong to tenant $t(d)$ and principal $p(d)$, with retention policy $r(d)$ and encryption state. Four invariants **[synthesis; grounded in Topic 7, [OCS], [CAH §5]]**:

$$
\textbf{G-1 (isolation is absolute):}\quad
\text{a request in tenant } t'\neq t(d)\ \text{can NEVER access } d,\ \text{at any layer (context, state, memory, artifact, log, cache).}
$$

G-1 is Topic 7's R-1 as a whole-architecture guarantee: not just retrieval (Topic 7) but *every* layer must isolate. A tenant boundary that holds at the memory store but leaks through a shared cache (Topic 1) or a shared event log is a G-1 violation. **Isolation is a property of the architecture, not of one layer.**

$$
\textbf{G-2 (retention is bounded by policy):}\quad
d\ \text{persists only while } r(d)\ \text{permits;}\ \text{past } r(d),\ d\ \text{is deleted (Topic 8's forgetting-for-privacy).}
$$

G-2 is data minimization: retention is a policy, and data past its retention is deleted — this is Topic 8's L-4 (forgetting is deliberate and policied), with the policy being retention. **Indefinite retention is a liability**, and G-2 makes forgetting a compliance mechanism, not just a budget one.

$$
\textbf{G-3 (deletion is complete and verifiable):}\quad
\text{erasing } d\ \text{removes it from EVERY layer, and the completeness is verifiable.}
$$

G-3 is the scattered-data invariant: deletion reaches the event log, memory, artifacts, caches, *and* providers (Topic 4). And it is *verifiable* — you can prove the data is gone, not just assert it. **A deletion that misses one layer is not a deletion**, and the agent's layered architecture makes missing a layer easy.

$$
\textbf{G-4 (the immutability-erasure tension is resolved by crypto-shredding or tombstoning):}\quad
\text{the append-only log (Topic 3) is reconciled with erasure by deleting the \emph{decryptable content}, not the log structure.}
$$

G-4 resolves Topic 3's dagger (§3.3).

### 3.3 Resolving the immutability-erasure tension

Topic 3 made the event log immutable (never modify or delete events) for audit and reconstruction. The right to erasure requires deleting a user's data. These conflict directly, and the resolution is one of the topic's key techniques **[synthesis; standard privacy engineering]**:

- **Crypto-shredding.** Encrypt each user's data with a per-user key; to erase, *delete the key*. The encrypted data remains in the immutable log (structure preserved, audit intact) but is now *undecryptable* — effectively erased. **This resolves the tension: the log stays append-only and immutable; erasure is achieved by destroying the ability to read the data, not by mutating the log.** The log still shows *that* events happened (audit) but their *content* is gone (erasure).
- **Tombstoning.** Mark the data deleted with a tombstone event (append-only, Topic 3 — a deletion is a new event, not a mutation) and physically remove the content, retaining only the tombstone as the audit record of the deletion. The log records "data X was erased at time T for reason R" — the deletion is itself an audited event (Topic 3's discipline: corrections/deletions are new events).

Both preserve the log's append-only nature (G-4) while achieving erasure. **The one thing you cannot do is mutate the log in place** — that breaks Topic 3's reconstruction and audit. Erasure is achieved *around* the immutability, not by violating it: crypto-shredding removes readability, tombstoning removes content while recording the removal. **This is why deletion (Topic 9's third operation, distinct from supersession) is a governance action with its own mechanism, not a memory update.**

The completeness challenge (G-3) remains: crypto-shredding works only if *all* copies of the user's data used the per-user key, and tombstoning must reach every store. A user's data in a cache (Topic 1) that was not crypto-shredded, or an artifact not tombstoned, is data that survives the erasure — an incomplete deletion. **Completeness requires that every layer participate in the deletion mechanism**, which is why G-3's verifiability matters: you must be able to *prove* every layer is clean.

## 4. Architecture

```
   GOVERNANCE spans EVERY persistence layer (G-1..G-4) — a guarantee is only as
   strong as its weakest layer:

   ┌────────────┬────────────┬────────────┬────────────┬────────────┬────────────┐
   │ CONTEXT    │ STATE      │ MEMORY     │ ARTIFACTS  │ EVENT LOG  │ CACHE      │
   │ (Ch.6)     │ (T2-3)     │ (T5-9)     │ (T10-11)   │ (T3)       │ (T1)       │
   ├────────────┴────────────┴────────────┴────────────┴────────────┴────────────┤
   │ G-1 ISOLATION: tenant boundary holds at EVERY layer (breach if any leaks)     │
   │ G-2 RETENTION: policy-bounded lifetime; past retention → delete (T8 L-4)      │
   │ G-3 DELETION: reaches EVERY layer, incl. PROVIDERS (T4) — verifiable          │
   │ G-4 IMMUTABILITY: log stays append-only; erase via crypto-shred / tombstone   │
   │ ENCRYPTION: at rest + in transit; per-user keys enable crypto-shredding        │
   └──────────────────────────────────────────────────────────────────────────────┘

   ERASURE (G-3, G-4, §3.3):
     crypto-shred:  delete per-user key → log content undecryptable (audit intact)
     tombstone:     append deletion event + remove content (deletion is AUDITED, T3)
     completeness:  EVERY layer participates, or the deletion is incomplete
     provider:      store:false / delete via API (T4) — provider-held data too

   PROVENANCE (T9) enables DELETION-BY-SOURCE: "delete everything from source X"
```

**Provenance (Topic 9) is what makes selective deletion possible.** To honor "delete all data derived from source X" (a poisoned source, a withdrawn consent), you need to know each datum's *derivation* — which is Topic 9's provenance. A memory consolidated from a user's episodes (Topic 8) must be deletable when the user is erased, which requires tracing the consolidated fact back to its source episodes. **Deletion-by-source is provenance-driven**, and a store without provenance can only delete what it can directly identify, missing derived data — an incomplete erasure.

## 5. Grounding

- **Data sensitivity governs access:** permissions "should depend not only on tool identity, but also on… data sensitivity" [CAH §5]; the permission tiers must specify "audit logs" and governance [CAH §5, §3.4.4] — the governance basis.
- **Provider-side retention and ZDR:** [OCS]'s `store: true` (30-day retention), `store: false` ("Disables persistence; data not retained"), and ZDR-friendliness when `store=false` [OCS] — G-2 and encryption at the provider layer (Topic 4).
- **Encrypted content carry:** [OCS]'s encrypted reasoning content [OCS] — provider-side encryption of sensitive state.
- **Tenancy is Topic 7's R-1:** cross-tenant isolation is absolute at retrieval (Topic 7); G-1 extends it to every layer.
- **The immutability-erasure tension is Topic 3's dagger:** the append-only log (Topic 3) vs the right to erasure — G-4 resolves it.
- **Deletion is a distinct operation:** Topic 9 (deletion vs supersession — deletion removes, supersession retains) — deletion is governance, not memory update.
- **Forgetting-for-privacy is Topic 8's L-4:** deliberate, policied, audited removal — retention past policy triggers it (G-2).
- **Deletion-by-source needs provenance:** Topic 9 (provenance/derivation) — the derivation chain enables complete selective deletion.
- **Managed platforms and vaults:** Chapter 4, Topic 7 (Managed Agents' vaults for egress credential substitution; data-residency) — provider-side governance the deployment must account for (Topic 4).
- **Self-hosted stores keep governance in your control:** [ADK-S]'s Database/VertexAI SessionService (self-hosted, Topic 4) — governance you run vs governance you cede.

**Evidence gap.** The governance *obligations* are real (privacy law, data-protection practice) and the *provider controls* are documented [OCS] (dated, provider-specific, Chapter 4, Topic 13). The whole-architecture invariants G-1..G-4 and the crypto-shredding/tombstoning resolution are **[synthesis]** — standard privacy engineering applied to the agent's layered persistence. **No source measures deletion-completeness rates, isolation-leak rates, or the effectiveness of crypto-shredding in agent systems.** G-1's zero-cross-tenant target is a compliance requirement (a breach otherwise), enforced by construction, not a measured outcome. This topic states obligations and mechanisms; the specific legal requirements (which data, which retention, which jurisdiction) are outside its scope and are the reader's compliance context.

## 6. Implementation

**Per-user encryption enabling crypto-shredding (G-4, §3.3):**

```python
class TenantIsolatedStore:
    """G-1: isolation at the store. G-4: per-user keys enable crypto-shredding erasure."""
    def write(self, d, tenant_id: str, user_id: str) -> None:
        key = self.key_for(user_id)                    # per-user key (crypto-shred unit)
        self._store.put(
            partition=tenant_id,                        # G-1: tenant is the partition boundary
            content=encrypt(d, key),                    # encryption at rest
            provenance=d.provenance,                    # T9: for deletion-by-source
        )

    def read(self, key_id: str, ctx) -> object:
        # G-1: tenant partition enforced (Topic 7 R-1, at the store).
        assert ctx.tenant_id == self._store.partition_of(key_id), "cross-tenant read — BREACH"
        key = self.key_for(ctx.user_id)
        if key is None:                                 # G-4: key deleted → crypto-shredded
            raise Erased("data was erased (key destroyed) — content unrecoverable")
        return decrypt(self._store.get(key_id), key)
```

**Erasure across every layer (G-3), resolving immutability (G-4):**

```python
def erase_user(user_id: str, layers, ctx) -> ErasureReport:
    """G-3: deletion reaches EVERY layer. G-4: log stays append-only (crypto-shred/tombstone).
    Incomplete = not a deletion. Verifiable = provable."""
    report = ErasureReport(user_id)

    # G-4: event log — DO NOT mutate (Topic 3). Crypto-shred: destroy the key.
    keystore.destroy_key(user_id)                       # log content now undecryptable
    ctx.event_log.append(Event(kind="user_erased",     # deletion is an AUDITED event (T3)
        payload={"user_id": user_id, "method": "crypto_shred"}, timestamp=utcnow()))
    report.mark("event_log", "crypto_shredded")

    # Every other layer participates (G-3 completeness).
    report.mark("memory",    layers.memory.delete_by_user(user_id))       # incl. derived (T9)
    report.mark("artifacts", layers.artifacts.delete_by_user(user_id))
    report.mark("state",     layers.state.delete_by_user(user_id))
    report.mark("cache",     layers.cache.evict_by_user(user_id))         # caches too (T1)!
    report.mark("provider",  layers.provider.delete(user_id))             # Topic 4 — provider-held

    # G-3 verifiability: prove every layer is clean.
    report.verify_complete()                            # fails if any layer still has data
    return report
```

**Deletion-by-source via provenance (T9):**

```python
def delete_by_source(source_id: str, layers, ctx) -> None:
    """T9 provenance enables 'delete everything derived from source X' — incl. facts
    CONSOLIDATED (T8) from that source. A store without provenance misses derived data."""
    for layer in layers:
        for d in layer.find_by_provenance(source_id, include_derived=True):  # T9 derivation chain
            layer.delete(d)                             # or crypto-shred / tombstone (G-4)
```

**Retention enforcement (G-2):**

```python
def enforce_retention(store, ctx) -> None:
    """G-2 / T8 L-4: past retention, delete. Data minimization is a compliance mechanism."""
    for d in store.all():
        if d.age > retention_policy(d.kind, d.tenant):
            forget(store, d, reason="retention_expired", ctx=ctx)   # T8 L-4, audited (T3)
```

## 7. Trade-offs

| Discipline | Buys | Costs |
|---|---|---|
| Tenant partition (G-1) | Isolation by construction | Partitioned stores; no cross-tenant convenience |
| Per-user encryption | Crypto-shredding erasure (G-4) | Key management; per-user key overhead |
| Crypto-shredding | Erasure without mutating the log (G-4) | Depends on ALL copies using the key |
| Tombstoning | Auditable deletion (G-3) | Content removed, tombstone retained |
| Policy retention (G-2) | Minimization; less liability | Deletes data that might have helped |
| Encryption at rest | Protection | Compute; key infrastructure |
| Provider `store:false` (T4) | ZDR; no provider retention | Lose server-managed convenience (Topic 4) |

**The trade at the heart of governance: capability vs liability.** Every governance discipline *reduces capability* to *reduce liability* — retention deletes potentially-useful data, isolation forbids convenient cross-tenant sharing, encryption adds overhead, deletion removes memory. **The trade is not "how much governance can I afford to add" but "how much liability can I afford to carry" — and for regulated data, the answer is that governance is not optional, so the capability cost is a cost of doing business, not a discretionary trade.** A memory system that skips governance to maximize capability is not cheaper; it is a compliance incident with deferred cost.

**The crypto-shredding trade resolves the topic's hardest tension elegantly but conditionally.** It gives erasure *and* an immutable audit log (G-4) — resolving Topic 3's dagger without compromise. But it works *only if every copy of the user's data used the per-user key* — a cache that stored plaintext, a derived fact that lost the key linkage, breaks the guarantee. **Crypto-shredding trades a key-management discipline for a clean resolution of immutability-vs-erasure, and the discipline must be complete** — which is why G-3's completeness and verifiability are not separate from G-4 but its precondition.

## 8. Experiments

**The cross-tenant isolation red-team (G-1) — the breach test.** For every layer (context, state, memory, artifacts, log, cache), attempt cross-tenant access. **Any successful access at any layer is a breach.** This extends Topic 7's read-path red-team to the *whole architecture* — the isolation guarantee is only as strong as its weakest layer, so every layer must be tested. Report with a zero-failure bound; the target is exactly zero.

**The deletion-completeness test (G-3) — the compliance-critical one.** Erase a user; then, for every layer, search for any surviving data belonging to that user. **Any surviving datum in any layer is an incomplete deletion** — a compliance failure. Test the hard cases: derived facts (consolidated from the user's episodes, Topic 8), cached copies (Topic 1), provider-held data (Topic 4), and the event log (crypto-shredded — verify undecryptable). **This is the test that proves your erasure is real, and it is the one most likely to find a missed layer.**

**The crypto-shredding verification (G-4).** After crypto-shredding, attempt to decrypt the user's log content. **It must be unrecoverable** (key destroyed). Verify the log *structure* is intact (audit preserved) but the *content* is gone — confirming G-4 resolves the tension correctly.

**The retention-enforcement test (G-2).** Age data past its retention policy; verify it is deleted (Topic 8's L-4). **Data surviving past retention is a minimization failure.**

**The deletion-by-source test (T9).** Delete by a source; verify all *derived* data (facts consolidated from that source) is also removed. **Surviving derived data is a provenance gap** — the deletion reached direct data but not derived.

**Statistics.** Zero-failure bounds on cross-tenant access and deletion-survival (targets exactly zero — these are breach/compliance tests); report $n$ (Chapter 1, Topic 12). These are not quality metrics with tolerances; they are correctness guarantees with zero-failure targets.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Cross-tenant leak at any layer.** Isolation holds at memory but leaks through a shared cache or log. **A breach.** Mitigation: G-1 at every layer; the whole-architecture red-team.
- **Incomplete deletion.** Erasure reaches memory but misses the log, a cache, derived facts, or provider-held data. **A compliance failure.** Mitigation: G-3 — every layer participates; verifiable completeness; the deletion-completeness test.
- **Immutability blocks erasure.** The append-only log (Topic 3) cannot delete, but erasure requires it. Mitigation: G-4 — crypto-shred (delete the key) or tombstone; never mutate the log.
- **Crypto-shredding gap.** A plaintext cache copy survives key destruction. Mitigation: every copy uses the per-user key; G-3 completeness is G-4's precondition.
- **Derived data survives deletion.** A fact consolidated from erased episodes (Topic 8) persists because its provenance link was lost. Mitigation: T9 provenance/derivation; delete-by-source includes derived.
- **Indefinite retention.** Data kept forever; a growing liability. Mitigation: G-2 retention policy; forgetting-for-privacy (Topic 8 L-4).
- **Provider-held data forgotten.** Deletion reaches your stores but not the provider's (Topic 4's server-managed state, 30-day+ retention). Mitigation: `store:false` or provider deletion API; own the truth (Topic 4).
- **Unencrypted persistence.** Sensitive data at rest in plaintext. Mitigation: encryption at rest; per-user keys (which also enable crypto-shredding).
- **Edge case — audit vs erasure conflict.** A legal hold requires retaining data that a user asks to erase. This is a genuine legal conflict (retention obligation vs erasure right), resolved by the applicable law, not by the architecture — the architecture must *support both* (tombstone with legal-hold flag) and defer the decision to compliance. Mitigation: the architecture enables both retention and erasure; which applies is a legal determination.
- **Open limitation.** The governance obligations are real and the provider controls documented [OCS], but G-1..G-4 and the crypto-shred/tombstone resolution are **[synthesis]** — standard privacy engineering applied to agent persistence. **No source measures deletion-completeness or isolation-leak rates in agent systems.** The specific legal requirements are the reader's compliance context, outside this chapter's scope. G-1's zero target is a compliance requirement enforced by construction, not a measured outcome.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Access must depend on data sensitivity; governance requires audit logs [CAH §5, §3.4.4].
2. Providers offer retention controls: `store:true` (30-day), `store:false` (no retention, ZDR) [OCS].
3. Sensitive state (reasoning) can be encrypted for carry [OCS].
4. Tenancy isolation is absolute (Topic 7 R-1).
5. The event log is immutable (Topic 3); erasure conflicts with it.
6. Deletion is distinct from supersession (Topic 9); it removes.
7. **The whole-architecture governance invariants are this book's synthesis; deletion/isolation rates are unmeasured.**

**Decision rules.**
- **Isolation is absolute and at every layer** (G-1) — a leak anywhere is a breach.
- **Retention is policy-bounded** (G-2) — indefinite retention is a liability; delete past policy.
- **Deletion is complete and verifiable across every layer** (G-3) — including derived data, caches, and providers.
- **Resolve immutability vs erasure by crypto-shredding or tombstoning** (G-4) — never mutate the log.
- **Delete-by-source uses provenance** (T9) — to reach derived data.
- **Encrypt persisted data at rest**; per-user keys enable crypto-shredding.

**Production implications.**
1. Run the cross-tenant red-team on *every* layer; isolation is only as strong as the weakest (§8).
2. Run the deletion-completeness test; a missed layer (cache, derived facts, provider) is a compliance failure, and it is the most likely gap.
3. Adopt crypto-shredding to reconcile the immutable log with erasure; verify every copy uses the per-user key.
4. Set retention policies and enforce them (Topic 8 L-4); indefinite retention is deferred liability.
5. Ensure deletion reaches provider-held data (Topic 4); your erasure is incomplete if the provider still holds it.

**Connections.** This topic is the governance layer over the whole chapter: G-1 is Topic 7's R-1 extended to every layer; G-2 is Topic 8's forgetting-for-privacy; G-4 resolves Topic 3's immutability dagger; deletion-by-source uses Topic 9's provenance; deletion is Topic 9's third operation. Provider governance is Topic 4 and Chapter 4, Topic 7 (vaults, residency). The threat model is Chapter 12; encryption and isolation are its persistence-layer enforcement. Retention balances Topic 3's audit/recovery needs against minimization.

## Sources

[OCS] OpenAI, conversation-state guide — `store: true` (30-day retention), `store: false` ("Disables persistence; data not retained"), ZDR-friendliness with `store=false`; encrypted reasoning content carry — https://developers.openai.com/api/docs/guides/conversation-state
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 (permissions depending on "data sensitivity"; secret handling as an open problem), §3.4.4 (permission tiers specifying "audit logs" and governance)
[ADK-S] Google ADK session/state — self-hosted SessionService (Database/VertexAI) keeping governance in the operator's control vs ceding to a provider — https://adk.dev/sessions/
[ANT-API]/[Chapter 4, Topic 7] — Managed Agents' vaults (egress credential substitution) and data-residency as provider-side governance — platform.claude.com docs (cache 2026-06)
