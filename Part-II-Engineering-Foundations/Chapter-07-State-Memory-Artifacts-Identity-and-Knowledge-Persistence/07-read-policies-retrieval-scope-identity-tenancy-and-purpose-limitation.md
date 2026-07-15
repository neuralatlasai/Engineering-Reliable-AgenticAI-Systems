# Topic 7 — Read Policies: Retrieval Scope, Identity, Tenancy, and Purpose Limitation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The gate on the *read* path from memory: which memories a given request may retrieve, scoped by identity, tenancy, and purpose. This is Chapter 5, Topic 10's confused-deputy fix applied to memory *retrieval* — the failure that turns a shared memory store into a cross-tenant data leak.

**Prerequisites.** Topic 2 (scopes — reads must respect them); Topic 6 (write policy — the dual); Chapter 5, Topic 10 (principal-scoped authorization); Chapter 6, Topic 5 (retrieval, which this topic governs the access-control layer of).

**Terminology.** *Read policy*: the predicate governing which memories a request may retrieve. *Tenancy*: the isolation boundary between users/organizations. *Purpose limitation*: restricting retrieval to memories relevant to the *authorized purpose* of the request, not everything the principal could see.

**Boundaries.** Inside: the read gate — scope, identity, tenancy, purpose. Outside: the retrieval *mechanism* (Chapter 6, Topic 5); the write dual (Topic 6); isolation *enforcement* infrastructure (Topic 14).

**Exclusions.** No access-control-system (RBAC/ABAC) survey.

**Outcomes.** The reader can write a memory-read policy that scopes retrieval to the acting principal and tenant, limits it to the request's purpose, and cannot leak one user's memory to another.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Memory is retrieved into context (Chapter 6, Topic 5) and thereby influences the agent's behavior. If the retrieval is not scoped to the acting principal, **one user's memory surfaces in another user's session** — a cross-tenant leak that is a privacy incident (Topic 14) and, if the leaked memory contains an injection (Topic 6's poisoned memory), a cross-tenant attack. And even *within* a principal's authority, retrieving *all* their memory for *every* request over-shares: a customer-support query pulls in the user's unrelated medical preferences, violating purpose limitation.

**Bottleneck.** Memory retrieval is usually a similarity search over a store, with no access-control layer: the query returns the top-k most similar memories *regardless of whose they are or what they are for*. This is Chapter 5, Topic 10's confused deputy at the read path — the retrieval runs with the store's full visibility, not the user's — and it is Chapter 6, Topic 5's missing-ACL problem (the retriever ignores the principal), now over durable cross-session memory where the stakes are higher.

**Objective.** A read gate that filters retrieval by (i) *scope and identity* (Topic 2 — a `user:` memory is visible only to that user), (ii) *tenancy* (no cross-organization retrieval), and (iii) *purpose* (retrieve what the request's authorized purpose needs, not everything the principal owns).

**Assumptions.** Memory is shared infrastructure serving many principals and tenants. Similarity search alone does not respect boundaries.

**Constraints.** The read gate is on the retrieval hot path (every turn that retrieves memory), so it must be cheap. Over-restriction loses useful memory; under-restriction leaks.

**Success criteria.** No memory is retrieved outside the acting principal's scope or tenant; retrieval is limited to the request's purpose; the read gate is fast enough for the hot path.

## 3. Intuition first, then formalization

### 3.1 Intuition: retrieval is an access-control decision, not just a search

The reframe: **a memory retrieval is not "find similar text" — it is "find similar text *that this principal, in this tenant, for this purpose, is allowed to see*."** The similarity search is the easy part; the access-control filter is the part that is usually missing and always consequential.

Three nested filters, from the outside in **[synthesis; grounded in Chapter 5, Topic 10 and Topic 2]**:

1. **Tenancy** — the outermost, hardest boundary. Memory from organization A is *never* retrievable in organization B's request, regardless of similarity, principal, or purpose. This is the boundary whose violation is a breach, not a bug.
2. **Identity/scope** — within a tenant, a `user:`-scoped memory is visible only to that user (Topic 2's containment, S-1). The acting principal (Chapter 5, Topic 10) determines what is in scope.
3. **Purpose** — within scope, retrieve what the *authorized purpose* of the request needs. A support query does not retrieve the user's unrelated preferences; a coding session does not retrieve their personal notes. This is data-minimization: **just because the principal *could* see a memory does not mean this *request* should retrieve it.**

The intuition that orders them: **filter before you search, outermost boundary first.** Apply the tenancy and scope filters to *narrow the candidate set* before the similarity search runs (Chapter 6, Topic 5's "filter first" — metadata before scoring). This is faster (fewer candidates to score) *and* safer (a boundary applied as a post-filter can be bypassed by a bug in the scorer; a boundary applied as a pre-filter cannot return what it excluded).

### 3.2 Formalization: the read gate

A retrieval request is $(q, p, t, \psi)$ = (query, acting principal, tenant, purpose). The read gate composes with the retriever **[synthesis]**:

$$
\operatorname{retrieve}(q, p, t, \psi)\ =\ \operatorname{search}\Bigl(q,\ \{m : \underbrace{\operatorname{tenant}(m)=t}_{\text{R-1 tenancy}} \wedge \underbrace{\operatorname{visible}(m, p)}_{\text{R-2 scope, Topic 2}} \wedge \underbrace{\operatorname{purpose}(m)\in \Psi(\psi)}_{\text{R-3 purpose}}\}\Bigr).
$$

The candidate set is filtered *before* `search` runs. Three invariants **[derived from Chapter 5, Topic 10; Topic 2]**:

$$
\textbf{R-1 (tenancy is absolute):}\quad
\operatorname{tenant}(m)\neq t\ \Longrightarrow\ m\ \text{is not a candidate, ever, regardless of anything else.}
$$

R-1 is the hard boundary. It is not a ranking factor or a soft preference — a cross-tenant memory is *excluded from the candidate set*, so no similarity, no principal, no purpose can surface it. **Tenancy violations are breaches, so tenancy must be a pre-filter, not a post-rank.**

$$
\textbf{R-2 (scope containment on read):}\quad
\text{a memory is retrievable only if } \operatorname{visible}(m, p)\ \text{holds (Topic 2's S-1).}
$$

R-2 is Topic 2's containment applied to retrieval: a `user:` memory is retrievable only by that user; a session memory only within that session. **This is the read-path confused-deputy fix** — the retrieval uses the *acting principal's* visibility (Chapter 5, Topic 10), not the store's.

$$
\textbf{R-3 (purpose limitation):}\quad
\text{retrieve only memories whose purpose is within the request's authorized purpose } \Psi(\psi).
$$

R-3 is data-minimization: even within scope, retrieve what the purpose needs. A support request retrieves support-relevant memory, not everything the user owns. **R-3 is weaker than R-1/R-2 (a purpose violation over-shares within a principal's own data, which is a privacy concern, not a breach) but it is the difference between a memory system that respects data-minimization and one that pulls the user's whole history into every unrelated request.**

### 3.3 Purpose limitation is the subtle one

Tenancy and scope are binary boundaries. Purpose is a *relevance-and-authorization* judgment, and it is where memory systems over-share most quietly. The principle, borrowed from data-protection practice: **data collected/retained for one purpose should be used only for that purpose.** In memory terms: a preference the user set for purpose A should not be silently retrieved and acted on for unrelated purpose B.

Two mechanisms **[synthesis]**:

- **Purpose-tagged memory:** memories carry the purpose they were written for (Topic 9's provenance extended), and retrieval filters by compatible purpose. A medical preference tagged `health` is not retrieved for a `coding` request.
- **Purpose-scoped retrieval:** the request declares its purpose, and the read gate restricts the candidate set to purpose-compatible memory before searching.

The failure R-3 prevents is not dramatic like a cross-tenant leak — it is the *quiet over-reach*: the agent that "helpfully" surfaces everything it knows about the user on every request, using memory collected for one purpose to shape behavior in another. Over time this is both a privacy erosion and a context-pollution problem (Chapter 6, Topic 1 — irrelevant memory dilutes the window). **Purpose limitation is where memory read policy meets both privacy (Topic 14) and context density (Chapter 6).**

## 4. Architecture

```
   retrieval request  (q, p, t, ψ)
        │
        ▼
   ┌── READ GATE — filter BEFORE search (§3.1), outermost boundary first ──────┐
   │                                                                          │
   │  R-1 TENANCY (absolute):  tenant(m) = t  → EXCLUDE from candidate set     │
   │      cross-tenant = breach. Pre-filter, never post-rank.                  │
   │                          │                                                │
   │  R-2 SCOPE (Topic 2):     visible(m, p)  → acting principal's visibility   │
   │      user: memory ↔ that user only. Read-path confused-deputy fix.        │
   │                          │                                                │
   │  R-3 PURPOSE:             purpose(m) ∈ Ψ(ψ)  → data-minimization          │
   │      support req ↛ medical prefs. Quiet over-reach blocked here.          │
   └──────────────────────────┬───────────────────────────────────────────────┘
                              │  candidate set (already boundary-safe)
                              ▼
                    SIMILARITY SEARCH (Chapter 6, Topic 5)
                              │  top-k by relevance/density
                              ▼
            retrieved memory → context (Chapter 6) — carries provenance/trust (Topic 9)
```

**Filter-before-search is both the fast and the safe ordering.** It is Chapter 6, Topic 5's "metadata filter first" (orders of magnitude cheaper) *and* the security-correct ordering: **a boundary enforced as a candidate-set filter cannot be defeated by a scorer bug, while a boundary enforced as a post-search filter can** (a mis-ranked cross-tenant memory that slips past a buggy post-filter is a breach). The two motivations — speed and safety — point the same way, which is why this is not a trade-off but a straightforward win.

**The proactive/reactive distinction (Chapter 6, Topic 4) interacts with purpose.** [GCA]'s proactive memory recall ("system pre-processor injects likely relevant snippets before invocation") is *higher-risk for purpose limitation* — it injects memory the request did not ask for, so the purpose filter (R-3) is doing more work. Reactive recall (agent-initiated `load_memory_tool`) is lower-risk — the agent asks for specific memory for a stated purpose. **Proactive memory needs a stricter purpose filter**, because it decides what to surface without the request's explicit ask.

## 5. Grounding

- **Read authorization by principal:** the confused-deputy fix (Chapter 5, Topic 10) — retrieval must use the acting principal's visibility, not the agent's/store's. A retriever ignoring the principal is Chapter 6, Topic 5's "retrieval without ACL" — "a confused deputy at the corpus."
- **Scope containment on read:** Topic 2's S-1 (data flows down the lattice, never up) applied to retrieval — a `user:` memory retrievable only by that user [ADK-S].
- **Data sensitivity as an access input:** permissions "should depend not only on tool identity, but also on… data sensitivity" [CAH §5] — R-3's basis (purpose and sensitivity govern retrieval).
- **Memory search is the read primitive:** Memory is "a knowledge base the agent can *search*" [ADK-S], and the MemoryService "provides search capabilities" [ADK-S] — the read gate wraps this search.
- **Retrieval timing and intent:** [MEM]'s dynamics include "Retrieval Timing and Intent" and "Query Construction" — the read policy operates at retrieval time and is part of query construction (the candidate-set filter).
- **Proactive vs reactive recall:** [GCA]'s "reactive recall (agent-initiated `load_memory_tool` calls)" vs "proactive recall (system pre-processor injects likely relevant snippets)" — the two retrieval modes with different purpose-limitation risk (§4).
- **Tenancy is Topic 14's isolation boundary:** cross-tenant isolation is a governance requirement (Topic 14), and R-1 is its read-path enforcement.
- **Filter-first is Chapter 6, Topic 5:** metadata/ACL filtering before scoring — cheaper and safer.

**Evidence gap.** The access-control principles are documented [CAH §5; ADK-S; Chapter 5, Topic 10] and the read gate is **[synthesis]** applying them to memory retrieval. **No source measures memory-retrieval leak rates or read-gate effectiveness.** R-1's zero-cross-tenant-retrieval target is an architectural requirement (a breach otherwise), enforced by the pre-filter, not a measured outcome. R-3 (purpose limitation) is imported from data-protection practice; its application to agent memory is **[synthesis]**, and no source measures purpose-over-reach in agent systems.

## 6. Implementation

**The read gate — filter the candidate set before search (§3.1):**

```python
def retrieve_memory(store, q: str, ctx: RequestContext) -> list[Memory]:
    """Read gate: boundaries as PRE-FILTERS (safe + fast), then search. (§3.2)"""

    candidates = store.filter(
        # R-1: TENANCY is absolute — a pre-filter, never a post-rank. Cross-tenant = breach.
        tenant=ctx.tenant_id,
        # R-2: SCOPE — the acting principal's visibility (Topic 2 S-1, Ch.5 T10).
        visible_to=ctx.acting_principal,
        # R-3: PURPOSE — data-minimization; only purpose-compatible memory.
        purpose_in=authorized_purposes(ctx.request_purpose),
    )
    # Only now does similarity search run — over an already-boundary-safe candidate set.
    return search(q, candidates, k=ctx.k)               # Chapter 6, Topic 5
```

**Proactive recall needs a stricter purpose filter (§4):**

```python
def proactive_recall(store, ctx) -> list[Memory]:
    """[GCA] proactive injection surfaces memory the request didn't ask for →
    R-3 does MORE work here. Restrict to memory clearly relevant to the CURRENT purpose."""
    candidates = store.filter(
        tenant=ctx.tenant_id, visible_to=ctx.acting_principal,
        purpose_in=authorized_purposes(ctx.request_purpose),
        relevance_floor=PROACTIVE_FLOOR,                # stricter than reactive
    )
    return search(ctx.current_context_summary, candidates, k=PROACTIVE_K)
```

**The tenancy assertion — defense in depth (R-1):**

```python
def assert_tenancy(results: list[Memory], ctx) -> None:
    """R-1 is a breach if violated. Even with a pre-filter, ASSERT — a bug in filter()
    that leaks cross-tenant memory must fail loud, not ship silently."""
    for m in results:
        if m.tenant_id != ctx.tenant_id:
            raise TenancyViolation(f"cross-tenant memory {m.id} in {ctx.tenant_id} — BREACH")
```

The redundant assertion is deliberate: **tenancy is the boundary whose violation is a breach, so it is enforced twice — as a pre-filter (correctness) and as a post-assertion (defense in depth).** A pre-filter bug that would silently leak becomes a loud failure instead.

## 7. Trade-offs

| Filter | Boundary strength | Cost of over-restriction | Cost of under-restriction |
|---|---|---|---|
| R-1 tenancy | **Absolute** (breach) | Legitimate cross-tenant (rare, e.g. shared org memory) blocked | **Cross-tenant breach** |
| R-2 scope | Hard (privacy) | User can't see their own memory (annoying) | Cross-user leak within tenant |
| R-3 purpose | Soft (minimization) | Useful memory not surfaced | Over-reach; context pollution |
| Filter-before-search | — | — | (no trade — faster AND safer) |
| Proactive recall | — | Misses useful memory | **Higher over-reach risk** (R-3) |

**The asymmetry that sets the defaults.** For R-1 and R-2, under-restriction is a breach/leak and over-restriction is an annoyance — so **default to stricter** (deny cross-boundary; the failure of over-restriction is cheap). For R-3, both directions are soft (over-reach vs missing useful memory), so it is a genuine tuning problem — but the *proactive* case tilts toward stricter, because injecting unasked-for memory is where over-reach compounds. **The general rule: the harder the boundary, the more you default to strict, because the cost of leaking across a hard boundary is categorically worse than the cost of not surfacing a memory.**

**Purpose limitation is also a context-density win (Chapter 6).** R-3 does double duty: it protects privacy *and* it keeps irrelevant memory out of the window (Chapter 6, Topic 1's dilution). A support request that pulls in the user's entire history both over-shares (privacy) and dilutes (context rot). **Tightening the purpose filter improves both privacy and answer quality**, which is a rare alignment of security and performance incentives — take it.

## 8. Experiments

**The cross-tenant retrieval red-team (R-1) — the breach test.** Populate memory for two tenants; issue queries in tenant A designed to be *maximally similar* to tenant B's memory; check whether any B memory is retrieved. **Any cross-tenant retrieval is a breach.** Report with the zero-failure bound $p_{\max}=1-(1-\gamma)^{1/n}$ over $n$ adversarial query pairs (Chapter 1, Topic 12); the target is exactly zero, and the assertion (§6) must fire on any leak.

**The cross-user leak test (R-2).** Same, within a tenant, across users. Zero target.

**The purpose over-reach measurement (R-3).** For a set of purpose-scoped requests, measure what fraction of retrieved memory is *outside* the request's purpose. **This quantifies over-reach** — the privacy-and-dilution cost of a loose purpose filter. Compare proactive vs reactive recall (§4); proactive should show higher over-reach.

**The proactive-recall risk ablation.** Proactive vs reactive memory injection; measure both purpose over-reach (privacy) and task completion (utility). **The trade: proactive surfaces more useful memory AND more over-reach** — the experiment prices it, and the purpose filter (R-3) is what you tune to keep the utility without the over-reach.

**Read-gate latency.** The candidate-set filter is on the hot path; measure its latency. **Filter-before-search should be faster than search-then-filter** (Chapter 6, Topic 5's filter-first) — confirm it, because a slow read gate taxes every retrieval.

**Statistics.** Zero-failure bounds on cross-tenant and cross-user retrieval (targets zero); Wilson on over-reach fraction; latency distributions; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Cross-tenant retrieval.** One org's memory in another's request. **A breach.** Mitigation: R-1 pre-filter + post-assertion (defense in depth); the red-team.
- **Cross-user leak within a tenant.** A `user:` memory retrieved by another user. Mitigation: R-2 scope containment (Topic 2 S-1); the acting principal, not the store's visibility (Chapter 5, Topic 10).
- **Retrieval without ACL.** Similarity search over the whole store, ignoring the principal — Chapter 6, Topic 5's confused deputy, over durable memory. **The default failure.** Mitigation: the read gate; filter-first.
- **Purpose over-reach.** The agent surfaces everything it knows about the user on every request. Mitigation: R-3 purpose limitation; purpose-tagged memory.
- **Proactive recall over-sharing.** Injected memory the request did not ask for, crossing purposes. Mitigation: stricter purpose filter for proactive recall (§4).
- **Boundary as post-filter.** A tenancy/scope check applied *after* search, bypassable by a scorer bug. Mitigation: filter-before-search; boundaries are pre-filters.
- **Leaked poisoned memory.** A cross-tenant leak that also carries an injection (Topic 6's poisoned memory) — a cross-tenant *attack*, not just a leak. Mitigation: R-1 (no cross-tenant retrieval) + W-2 (no authoritative poison) compose to close this.
- **Edge case — legitimately shared memory.** Some memory is meant to be shared: `app:`-scoped org knowledge (Topic 2), a shared team knowledge base. R-1/R-2 must permit *intended* sharing while blocking unintended — the scope model (Topic 2) is what distinguishes them, and `app:` memory is shared *within* a tenant, never across. Mitigation: explicit shared-scope tagging; cross-tenant sharing is never automatic.
- **Open limitation.** The read gate is **[synthesis]** applying documented access-control principles [CAH §5; Ch.5 T10; Topic 2] to memory retrieval. **No source measures memory-retrieval leak rates or purpose over-reach in agent systems.** R-1's zero target is an architectural requirement enforced by construction, not a measured outcome; R-3 (purpose limitation) is imported from data-protection practice and its agent-memory application is unmeasured.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Memory is retrieved by *search* [ADK-S]; the read gate wraps that search with access control.
2. Retrieval must use the acting principal's visibility, not the store's (Chapter 5, Topic 10; Chapter 6, Topic 5's ACL requirement).
3. Access must depend on data sensitivity [CAH §5] — R-3's basis.
4. Proactive recall injects unasked-for memory; reactive recall is agent-requested [GCA] — different over-reach risk.
5. Filter-before-search is both faster and safer (Chapter 6, Topic 5).
6. **No source measures memory-retrieval leaks or purpose over-reach.**

**Decision rules.**
- **Filter by tenancy, scope, and purpose BEFORE the similarity search** — outermost boundary first.
- **Tenancy is absolute** (R-1) — a pre-filter and a post-assertion; a violation is a breach.
- **Retrieval uses the acting principal's visibility** (R-2), never the store's — the read-path confused-deputy fix.
- **Limit retrieval to the request's purpose** (R-3) — it protects privacy *and* context density.
- **Proactive recall needs a stricter purpose filter** than reactive.
- **Default stricter on hard boundaries** — over-restriction is an annoyance, under-restriction is a breach.

**Production implications.**
1. Run the cross-tenant and cross-user retrieval red-teams; report with zero-failure bounds — these are breach/leak tests, not quality tests.
2. Add the read gate as a candidate-set pre-filter; a post-search filter is bypassable.
3. Keep the tenancy post-assertion as defense in depth — a pre-filter bug must fail loud.
4. Tighten the purpose filter; it improves privacy and answer density at once (a rare aligned win).
5. Treat proactive recall as higher-risk for over-reach and filter it harder.

**Connections.** This topic is the read dual of Topic 6's write gate; both are Chapter 5, Topic 10's confused-deputy fix, at the two ends of the memory path. R-2 is Topic 2's scope containment on read; R-1 is Topic 14's tenant isolation enforced at retrieval. It governs the access-control layer of Chapter 6, Topic 5's retrieval and interacts with Chapter 6, Topic 4's proactive/reactive recall. Purpose limitation (R-3) connects to Topic 14 (privacy) and Chapter 6, Topic 1 (density). Leaked poisoned memory is where this topic and Topic 6 compose to close a cross-tenant attack.

## Sources

[ADK-S] Google ADK session/memory — Memory as "a knowledge base the agent can *search*"; MemoryService "provides search capabilities"; `user:`-scoped state visible only to that user — https://adk.dev/sessions/
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — reactive recall (agent-initiated `load_memory_tool`) vs proactive recall (system pre-processor injecting likely-relevant snippets) — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — permissions depending on "data sensitivity"; access as a function of the data, not the agent identity
[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — memory retrieval dynamics: "Retrieval Timing and Intent," "Query Construction," "Retrieval Strategies"
