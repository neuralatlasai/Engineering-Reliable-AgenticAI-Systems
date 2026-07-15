# Topic 1 — Distinguishing Context, State, Memory, Knowledge, Cache, and Artifacts

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The chapter's foundational taxonomy: six words the field uses interchangeably, separated by the two properties that actually determine their engineering — *lifetime* and *authority*. Every later topic classifies its subject against this taxonomy.

**Prerequisites.** Chapter 6, Topic 4 (the context-type taxonomy — this topic's presentation-side complement); Chapter 3, Topic 4 (event-sourcing); Chapter 4, Topic 11 (provider- vs application-managed state).

**Terminology.** Defined in §3. The point of the topic is the definitions.

**Boundaries.** Inside: the six-way distinction and the classification method. Outside: the internals of each layer (Topics 2–12).

**Exclusions.** No storage-technology survey.

**Outcomes.** The reader can assign any datum in their agent to exactly one of the six categories, and can state its lifetime, authority, and failure mode from that assignment.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** "Memory" is the field's most overloaded word. The survey documents the damage directly: research "papers claiming to study 'agent memory' differ drastically in implementation, objectives, and underlying assumptions," and "the proliferation of diverse terminologies (declarative, episodic, semantic, parametric memory, etc.) further obscures conceptual clarity" [MEM]. In a single codebase, "memory" can mean the context window, the session store, a vector database, a `CLAUDE.md` file, a prompt cache, and a saved report — six systems with six lifetimes and six failure modes.

**Bottleneck.** Because they share a word, they get conflated, and conflation produces specific bugs: a cache treated as memory (stale answers served as fresh knowledge), a session treated as memory (this conversation's scratch state leaking into the next user's), an artifact treated as context (a 50 MB file crammed into the window). **Each bug is a category error — a datum handled with the wrong layer's lifetime and authority.**

**Objective.** A classification with sharp edges: assign every datum to exactly one category, and derive its handling (persistence, scope, eviction, governance) from the category rather than from ad-hoc judgment.

**Assumptions.** The two axes — lifetime and authority — are sufficient to separate the six. §3 defends this.

**Constraints.** The categories must be *mutually exclusive* (no datum in two) and *collectively exhaustive* (every datum in one), or the taxonomy fails to prevent conflation.

**Success criteria.** A team can classify their persistence surface and find the category errors — the cache treated as memory, the session leaking across users — before they ship.

## 3. Intuition first, then formalization

### 3.1 Intuition: two questions separate all six

Do not ask "is this memory?" Ask two questions:

1. **How long does it live?** (this call / this turn / this session / forever)
2. **Who authored it, and is it authoritative?** (the user / the agent / the environment / a derived copy)

The six categories fall out of the answers **[synthesis; each definition sourced in §5]**:

- **Context** — lives *one model call*; the compiled view (Chapter 6). Not persistent at all. *"What the model sees now."*
- **State** — lives *this session/task*; the working scratch of the current interaction, "relevant *only* to the *current, active* conversation thread" [ADK-S]. *"Where the task is right now."*
- **Memory** — lives *across sessions*; "a knowledge base the agent can *search* to recall information… beyond the immediate conversation" [ADK-S]. *"What the agent has learned."*
- **Knowledge** — lives *durably and authoritatively*; curated facts and instructions the agent treats as ground truth (repository memory, `CLAUDE.md`, a documentation corpus). *"What is true, by authority."*
- **Cache** — lives *until invalidated*; a *derived* copy kept for speed, reconstructible from its source (prompt cache, a computed result). *"A fast copy of something else."*
- **Artifact** — lives *durably as a product*; "large binary or textual data" [GCA] the run produced — a report, a patch, a dataset. *"What the run made."*

The two distinctions people most often collapse, and the bug each produces:

- **Cache vs memory.** A cache is *derived and reconstructible*; memory is *authoritative and lost if deleted*. Treating a cache as memory means trusting a stale copy as truth; treating memory as a cache means deleting it assuming it can be rebuilt, when it cannot. **The test: if you delete it, can you reconstruct it from a source? Yes → cache. No → memory.**
- **State vs memory.** State is *this session*; memory is *across sessions*. Treating session state as memory leaks one conversation into the next (a tenancy violation, Topic 14); treating memory as session state loses learning at session end.

### 3.2 Formalization: the lifetime × authority lattice

Assign each datum a **lifetime** $L$ and an **authority** $A$:

$$
L\in\{\text{call},\ \text{session},\ \text{cross-session},\ \text{durable}\},
\qquad
A\in\{\text{authoritative},\ \text{derived}\}.
$$

The six categories are cells in this lattice **[synthesis]**:

| Category | Lifetime $L$ | Authority $A$ | Reconstructible? | Governing topic |
|---|---|---|---|---|
| **Context** | call | derived (compiled) | Yes — recompile (Ch.6 T3) | Chapter 6 |
| **State** | session | authoritative | No — it *is* the task's position | Topics 2–3 |
| **Cache** | until invalidated | **derived** | **Yes — from source** | §3.3 |
| **Memory** | cross-session | authoritative | **No** | Topics 5–9 |
| **Knowledge** | durable | authoritative (curated) | Partially (re-authored) | Topic 12 |
| **Artifact** | durable | authoritative (product) | No — it is output | Topics 10–11 |

The **invariant that prevents the conflation bugs [derived]**:

$$
\textbf{K-1 (reconstructibility ⇒ cache):}\quad
\text{reconstructible-from-source}\ \Longrightarrow\ A=\text{derived}\ \Longrightarrow\ \text{it is a \emph{cache}, and may be evicted freely.}
$$
$$
\textbf{K-2 (authoritative ⇒ not evictable):}\quad
A=\text{authoritative}\ \Longrightarrow\ \text{eviction is \emph{data loss}, governed by a retention/deletion policy (Topic 14), never by budget pressure.}
$$

K-1 and K-2 are the whole topic. **The single most consequential classification decision is authoritative vs derived**, because it decides whether a datum can be thrown away for space. A cache can be evicted under budget pressure (Chapter 6, Topic 11's compaction); memory, knowledge, and artifacts *cannot* — evicting them is deletion, and deletion is a governance decision (Topic 14), not an assembly optimization. **A system that compacts away its memory because the window was full has made a category error with data-loss consequences.**

### 3.3 The cache is the trap

Cache is the category most often misclassified, in both directions, and both are dangerous:

- **Memory misfiled as cache** → deleted under the assumption it rebuilds; it does not; the agent's learning is gone.
- **Cache misfiled as memory** → a stale derived copy is trusted as authoritative truth; the agent acts on last week's computed answer.

The discipline: **a cache must always carry its source and its invalidation condition.** If you cannot name what a datum is derived *from* and when it goes *stale*, it is not a cache — it is memory, and it must be governed as such. This is Chapter 6, Topic 8's staleness problem (data true when computed, false when used) applied to the persistence layer, and it is why the prompt cache (Chapter 6, Topic 10) is unambiguously a cache: it is derived from the prefix and invalidated by any prefix change.

## 4. Architecture

```
   AUTHORITY →       DERIVED (reconstructible)      AUTHORITATIVE (loss = deletion)
   LIFETIME ↓
   ┌──────────────┬──────────────────────────────┬──────────────────────────────┐
   │ call         │ CONTEXT (Ch.6)               │  —                           │
   │              │ compiled view; recompile      │                              │
   ├──────────────┼──────────────────────────────┼──────────────────────────────┤
   │ session      │  —                           │ STATE (T2-3)                 │
   │              │                              │ task position; event log      │
   ├──────────────┼──────────────────────────────┼──────────────────────────────┤
   │ until inval. │ CACHE (§3.3)                 │  —                           │
   │              │ fast copy; carries source     │                              │
   │              │ + invalidation                │                              │
   ├──────────────┼──────────────────────────────┼──────────────────────────────┤
   │ cross-sess.  │  —                           │ MEMORY (T5-9)                │
   │              │                              │ learned; NOT reconstructible  │
   ├──────────────┼──────────────────────────────┼──────────────────────────────┤
   │ durable      │  —                           │ KNOWLEDGE (T12) · ARTIFACT   │
   │              │                              │ (T10-11); curated / produced  │
   └──────────────┴──────────────────────────────┴──────────────────────────────┘

   K-1: reconstructible ⇒ cache ⇒ evict freely (budget pressure OK)
   K-2: authoritative   ⇒ eviction = deletion ⇒ governance (T14), NOT budget
```

**The architecture's payoff.** Once a datum is placed in a cell, its handling is *determined*: the derived column may be evicted by Chapter 6's compaction; the authoritative column may not — it is governed by Topic 14's retention and deletion policies. **The taxonomy is not classification for its own sake; it is a decision procedure for "may I throw this away, and who decides."**

## 5. Grounding

- **The fragmentation problem the taxonomy solves:** "papers claiming to study 'agent memory' differ drastically in implementation, objectives, and underlying assumptions," and the "proliferation of diverse terminologies… further obscures conceptual clarity, highlighting the urgent need for a coherent taxonomy" [MEM]. This topic exists because the survey documents the need.
- **State, defined:** data "relevant *only* to the *current, active* conversation thread" [ADK-S] — the session lifetime.
- **Memory, defined:** "a knowledge base the agent can *search* to recall information or context beyond the immediate conversation" [ADK-S] — the cross-session lifetime, and the *search* verb distinguishes it from state (which is read directly).
- **The four-tier separation:** Working Context / Session / Memory / Artifacts, with "Context is a compiled view over a richer stateful system" [GCA] — context as *derived* (the compiler output), the rest as *sources*.
- **Artifacts, defined:** "large binary or textual data associated with the session or user (files, logs, images)" [GCA] — durable products.
- **Knowledge as authoritative durable instruction:** `CLAUDE.md` as "persistent instructions" the agent treats as guidance, distinct from auto-memory it "accumulates automatically" [CCM] — the knowledge/memory distinction, shipped (Topic 12).
- **Cache as derived-and-invalidated:** prompt caching over a stable prefix, invalidated by prefix change (Chapter 6, Topic 10; [GCA]'s stable-prefix/variable-suffix) — the reconstructible property in a shipped system.
- **The forms axis corroborates the authority distinction:** [MEM]'s token-level (external, inspectable) vs parametric (in-weights) vs latent forms — external memory is the authoritative, inspectable store this chapter governs; parametric memory is Chapter 2's.

**Evidence gap.** **No source presents this exact six-way taxonomy** — [MEM] organizes memory by forms/functions/dynamics, [GCA] by four tiers, [ADK-S] by state vs memory. This topic's contribution is the **lifetime × authority lattice** that unifies them, and it is **[synthesis]**. Its value is a *decision procedure* (K-1/K-2), not a measured finding; no source measures the frequency or cost of category-error bugs, so the "most agent memory bugs are conflation" claim in the scope file is a **reasoned assertion**, not a measured one, and is flagged as such.

## 6. Implementation

**Type the persistence layers so misclassification is a compile error:**

```python
class Lifetime(Enum):
    CALL = "call"; SESSION = "session"; UNTIL_INVALID = "until_invalid"
    CROSS_SESSION = "cross_session"; DURABLE = "durable"

class Authority(Enum):
    DERIVED = "derived"            # reconstructible from a source (K-1)
    AUTHORITATIVE = "authoritative" # loss = deletion (K-2)

@dataclass(frozen=True)
class Datum:
    value: object
    lifetime: Lifetime
    authority: Authority
    source: str | None = None          # REQUIRED if DERIVED (what it's derived from)
    invalidation: str | None = None    # REQUIRED if DERIVED (when it goes stale)

    def __post_init__(self):
        # K-1: a derived datum MUST name its source and staleness, or it is misfiled memory.
        if self.authority is Authority.DERIVED and not (self.source and self.invalidation):
            raise ValueError(
                "DERIVED datum without source+invalidation is not a cache — "
                "it is unmanaged memory masquerading as one (§3.3)."
            )

    @property
    def may_evict_for_budget(self) -> bool:
        # K-2: only derived (cache/context) may be dropped for space.
        return self.authority is Authority.DERIVED
```

The `__post_init__` check enforces §3.3: **you cannot construct a "cache" without saying what it is derived from and when it expires** — which forces the classification honest. A datum that cannot answer those is memory, and the type system says so.

**The classification audit — find the category errors:**

```python
def audit_persistence(store) -> dict:
    problems = []
    for d in store.all():
        # Memory misfiled as cache: authoritative data marked evictable → data-loss risk.
        if d.authority is Authority.DERIVED and not is_truly_reconstructible(d):
            problems.append(f"{d}: marked DERIVED but not reconstructible → will be lost on evict")
        # Session state living cross-session: a tenancy leak (Topic 14).
        if d.lifetime is Lifetime.SESSION and store.persists_across_sessions(d):
            problems.append(f"{d}: SESSION-lifetime datum persisting across sessions → leak")
    return {"category_errors": problems}
```

## 7. Trade-offs

| Distinction | Getting it right buys | Getting it wrong costs |
|---|---|---|
| Cache vs memory | Free eviction of caches; safe retention of memory | Stale answers as truth, OR memory deleted assuming reconstructible |
| State vs memory | Clean session boundaries | Cross-session leak (tenancy), OR learning lost at session end |
| Knowledge vs memory | Curated truth vs learned belief | Agent-written belief treated as authoritative fact |
| Artifact vs context | Products versioned; window protected | 50 MB file in the window, OR a report lost as "just context" |
| Authoritative vs derived | K-1/K-2 decide evictability | Data loss under budget pressure |

**The trade the whole taxonomy is really about.** Every category decision reduces to **"may this be thrown away for space, and who decides?"** Derived data (context, cache) may be evicted by the assembly pipeline for budget (Chapter 6). Authoritative data (state, memory, knowledge, artifacts) may not — its removal is deletion, a governance act (Topic 14). **The cost of blurring this is asymmetric and severe in one direction: over-classifying as derived risks silent data loss, while over-classifying as authoritative merely wastes storage.** When unsure, classify as authoritative — the failure is cheaper.

## 8. Experiments

This topic is definitional; its "experiment" is the classification audit, and it is a prerequisite, not an ablation.

**The category-error audit.** Enumerate every persistence surface in the system; classify each into the lattice; run the §6 audit. **Prediction: most systems have at least one category error** — a session cache that leaks, a memory that gets compacted away, an artifact stuffed into context. Each is a latent bug found before it fires.

**The reconstructibility test (K-1).** For every datum classified as cache: delete it; attempt reconstruction from its named source. **If reconstruction fails, it was memory misfiled as cache** — reclassify before it is evicted in production and lost. This is the single most valuable check in the topic.

**The tenancy-leak probe (ties to Topic 14).** For every session-scoped datum: start a second session (different user); check whether the first session's datum is visible. **Any leak is a category error with a privacy consequence.**

No statistics are needed for a classification audit; the output is a list of errors, each a bug to fix. Where the taxonomy informs a *measured* decision (e.g., memory precision, Topic 15), the statistics contract applies there.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Cache misfiled as memory.** A stale derived copy trusted as authoritative truth; the agent acts on last week's answer. Mitigation: caches carry source + invalidation (§6); the reconstructibility test.
- **Memory misfiled as cache.** Deleted under the assumption it rebuilds; the agent's learning is gone. Mitigation: K-1 check; when unsure, classify authoritative.
- **State leaking across sessions.** Session scratch treated as cross-session memory; one user's conversation surfaces in another's. **A tenancy violation** (Topic 14). Mitigation: scope enforcement (Topic 2); the leak probe.
- **Memory losing learning at session end.** Cross-session data treated as session state; discarded on close. Mitigation: correct lifetime classification.
- **Knowledge vs memory conflated.** Agent-written belief (memory) treated as curated fact (knowledge), so an unverified inference becomes authoritative. Mitigation: separate stores (Topic 12); provenance (Topic 9).
- **Artifact in the window.** A large product crammed into context. Mitigation: the handle pattern (Chapter 6, Topic 4; Topic 10 here).
- **Budget pressure evicting authoritative data.** Compaction (Chapter 6, Topic 11) reaching memory or knowledge because they were not marked authoritative. Mitigation: K-2; `may_evict_for_budget` gate.
- **Edge case — the derived-then-authoritative datum.** A summary is *derived* from history (cache-like) but, once history is pruned, becomes the *only* record (authoritative). Its category *changes* when its source is deleted. Mitigation: retain sources, or reclassify the summary as memory when it becomes the sole record (Chapter 6, Topic 4's "summary becomes the source" edge case).
- **Open limitation.** **The six-way taxonomy is this book's synthesis** of [MEM], [GCA], and [ADK-S], not a standard from any single source, and **no source measures the incidence or cost of category-error bugs.** The taxonomy's value is a decision procedure (K-1/K-2), validated by reasoning and by the specific bugs it prevents, not by an effect size. Boundary cases (the derived-then-authoritative datum) show the categories are not always static.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. The agent-memory literature is fragmented by terminology, creating "the urgent need for a coherent taxonomy" [MEM].
2. State is session-scoped ("relevant *only* to the *current, active* conversation thread"); memory is cross-session and *searched* [ADK-S].
3. Production architecture separates four durable tiers, with context as the *compiled* (derived) view over them [GCA].
4. Knowledge (curated `CLAUDE.md`) and memory (auto-accumulated) are distinct systems in shipped products [CCM].
5. **The lifetime × authority lattice is this book's unifying synthesis**; no source measures conflation-bug frequency.

**Decision rules.**
- **Classify by two questions: how long does it live, and is it authoritative or derived?**
- **Reconstructible ⇒ cache ⇒ evict freely** (K-1). **Authoritative ⇒ eviction is deletion ⇒ governance, not budget** (K-2).
- **A cache must name its source and invalidation**, or it is misfiled memory.
- **When unsure between derived and authoritative, choose authoritative** — the failure is cheaper (storage, not data loss).
- **Session-scoped data must not persist across sessions** — that is a tenancy leak, not memory.

**Production implications.**
1. Run the category-error audit (§8); most systems have at least one, and each is a latent bug.
2. Run the reconstructibility test on every cache; the ones that fail were memory, and they will be lost when evicted.
3. Gate budget eviction on `may_evict_for_budget` — compaction must never reach authoritative data.
4. Run the tenancy-leak probe; a leaking session cache is a privacy incident waiting to happen (Topic 14).

**Connections.** This taxonomy governs the whole chapter: State is Topics 2–3, Memory is Topics 5–9, Knowledge is Topic 12, Artifacts are Topics 10–11, and the authority axis is what Topic 14's governance enforces. It is the store-side complement of Chapter 6, Topic 4's context-type taxonomy (which classified the *presentation*); together they draw the Chapter 6 / Chapter 7 seam. K-2 is what forbids Chapter 6, Topic 11's compaction from touching authoritative data.

## Sources

[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — the fragmentation problem and "the urgent need for a coherent taxonomy"; forms (token-level / parametric / latent) distinguishing external inspectable memory from in-weights memory
[ADK-S] Google ADK session/state — State as data "relevant *only* to the *current, active* conversation thread"; Memory as "a knowledge base the agent can *search* to recall information or context beyond the immediate conversation" — https://adk.dev/sessions/
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — the four-tier model; "Context is a compiled view over a richer stateful system"; artifacts as "large binary or textual data" — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CCM] Claude Code memory model — `CLAUDE.md` (curated instructions) vs auto-memory (accumulated learnings) as two complementary systems — https://code.claude.com/docs/en/memory
