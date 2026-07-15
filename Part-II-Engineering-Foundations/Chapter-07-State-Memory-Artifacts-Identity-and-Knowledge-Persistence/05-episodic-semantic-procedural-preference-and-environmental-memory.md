# Topic 5 — Episodic, Semantic, Procedural, Preference, and Environmental Memory

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The memory *content* taxonomy: the kinds of things an agent remembers, distinguished by what they are *for*. The README names five (episodic, semantic, procedural, preference, environmental); the survey [MEM] offers a more principled three-function frame that the five map into. This topic reconciles them.

**Prerequisites.** Topic 1 (memory is authoritative, cross-session, non-reconstructible); Topic 2 (scope — much memory is `user:`-scoped); the [MEM] survey's forms/functions/dynamics organization.

**Terminology.** Per [MEM]: *forms* (token-level, parametric, latent — *how* memory is realized); *functions* (factual, experiential, working — *what role* it plays); *dynamics* (how it forms, evolves, is retrieved). The README's five types are *function*-level categories.

**Boundaries.** Inside: the content taxonomy, the function each type serves, and the storage/retrieval consequences of the type. Outside: write/read *policy* (Topics 6–7); the lifecycle *operations* (Topic 8); parametric/latent forms as a *training* concern (Chapter 2).

**Exclusions.** No cognitive-science memory-model survey beyond what grounds the engineering.

**Outcomes.** The reader can classify a memory by function, and can derive its storage form, retrieval trigger, and update policy from the classification.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** "Add memory to the agent" is under-specified because *memory* is not one thing. An agent might need to recall a past interaction (episodic), a learned fact (semantic), a way of doing something (procedural), a user's stated preference (preference), or the state of its environment (environmental). These have **different write triggers, different retrieval cues, different update rules, and different failure modes** — and building one undifferentiated "memory store" for all of them produces a store that serves none well.

**Bottleneck.** Without a type distinction, every memory is treated as an interchangeable blob: written the same way, retrieved by the same query, updated by the same policy. But a preference ("I use metric") should be *overwritten* when it changes, while an episode ("on 2026-07-01 the deploy failed") should be *appended* and never overwritten; a procedure ("to deploy: run X then Y") should be *versioned*, while a semantic fact should be *deduplicated* against existing facts. **One store cannot apply five update policies.**

**Objective.** A functional taxonomy where each memory type carries its own write trigger, storage form, retrieval cue, and update rule — so the memory system is a set of typed subsystems, not one blob.

**Assumptions.** The [MEM] forms/functions/dynamics frame organizes the space; the README's five types are function-level and map into it.

**Constraints.** The types are not always crisp — a preference is a kind of semantic fact about the user; a procedure learned from experience blends procedural and experiential. The taxonomy must handle the overlaps.

**Success criteria.** Every memory is classified; its update policy follows from its type; the store applies type-appropriate write/retrieval/update.

## 3. Intuition first, then formalization

### 3.1 Intuition: memory types are defined by what they are for

The survey's key move is to organize memory by **function** rather than by mechanism, because the function determines the engineering. [MEM] "move[s] beyond coarse temporal categorizations and propose[s] a finer-grained taxonomy that distinguishes **factual, experiential, and working memory**" [MEM]. The README's five types are function-level and map cleanly:

- **Episodic** → *experiential*. Specific past events, timestamped: "the deploy on 2026-07-01 failed with error X." **Write trigger:** something happened. **Storage:** append-only, timestamped (it is an event, Topic 3). **Retrieval:** by time, entity, or similarity to the current situation. **Update rule:** never overwrite — episodes are historical facts; a later contradicting episode is a *new* episode, not an edit.
- **Semantic** → *factual*. General facts abstracted from episodes: "deploys fail when the migration is not run first." **Write trigger:** a fact is learned or induced (often from consolidating episodes, Topic 8). **Storage:** deduplicated fact base. **Retrieval:** by semantic similarity to the query. **Update rule:** deduplicate against existing facts; supersede on contradiction (Topic 9).
- **Procedural** → *factual/experiential blend*. How to do something: "to deploy: run migration, then deploy, then smoke-test." **Write trigger:** a procedure is learned or refined. **Storage:** versioned (procedures change). **Retrieval:** by task. **Update rule:** version; the new procedure supersedes but the old is retained (audit).
- **Preference** → *factual, about the user*. Stated or inferred user choices: "prefers metric units, terse responses." **Write trigger:** the user states or the agent infers a preference. **Storage:** `user:`-scoped (Topic 2), single-valued per preference. **Retrieval:** loaded proactively (it applies to most turns). **Update rule:** **overwrite** — a preference has one current value; the old one is wrong, not historical.
- **Environmental** → *working/factual about the world*. The state of the agent's environment: "the repo has 400 files; the database has these tables; the current branch is X." **Write trigger:** the environment is observed. **Storage:** often a *cache* (Topic 1) — reconstructible by re-observing. **Retrieval:** on demand. **Update rule:** refresh on staleness (Chapter 6, Topic 8's TOCTOU).

The intuition that unifies them: **the update rule is the type's signature.** Episodic never overwrites; semantic deduplicates; procedural versions; preference overwrites; environmental refreshes. **If you know how a memory should be updated, you know its type — and if you are applying one update rule to all of them, you have five bugs waiting.**

### 3.2 Formalization: the type → policy mapping

For memory item $m$ with function type $\rho \in \{\text{episodic}, \text{semantic}, \text{procedural}, \text{preference}, \text{environmental}\}$, define the policy tuple **[synthesis; grounded in [MEM]'s functions and dynamics]**:

$$
\operatorname{policy}(\rho)=\bigl(\text{write-trigger},\ \text{storage-form},\ \text{retrieval-cue},\ \text{update-rule},\ \text{authority}\bigr).
$$

| $\rho$ | Write trigger | Storage | Retrieval | Update rule | Authority (Topic 1) |
|---|---|---|---|---|---|
| Episodic | event occurred | append-only, timestamped | time / entity / similarity | **never overwrite** | authoritative (memory) |
| Semantic | fact learned/induced | dedup'd fact base | semantic similarity | dedup + supersede | authoritative |
| Procedural | procedure refined | **versioned** | by task | version | authoritative |
| Preference | user states/infers | `user:`, single-valued | proactive load | **overwrite** | authoritative |
| Environmental | env observed | often **cache** | on demand | **refresh on staleness** | **derived (cache!)** |

**The two invariants that catch the common bugs [derived]:**

$$
\textbf{M-1 (update rule follows type):}\quad
\text{applying the wrong update rule corrupts the type} — \text{e.g., overwriting an episode erases history; appending a preference accumulates stale values.}
$$
$$
\textbf{M-2 (environmental memory is usually a cache):}\quad
\rho=\text{environmental}\ \Longrightarrow\ \text{typically } A=\text{derived (Topic 1)};\ \text{re-observe rather than trust stale.}
$$

M-1 is the topic's core: **the five types are five update disciplines, and mixing them is the signature memory bug.** M-2 is the trap: environmental "memory" is usually reconstructible (re-observe the repo, re-query the tables), so per Topic 1 it is a *cache*, not authoritative memory — and treating it as authoritative means acting on a stale world (Chapter 6, Topic 8's staleness). **Most "the agent used out-of-date environment info" bugs are environmental memory misclassified as authoritative.**

### 3.3 The forms axis: where memory is realized

[MEM] separates *forms* (how memory is stored) from *functions* (what it does): **token-level** (external, inspectable text — the vast majority of what this chapter governs), **parametric** (in the model's weights — Chapter 2's training), and **latent** (in intermediate representations) [MEM].

The engineering consequence: **this chapter is almost entirely about token-level memory** — external, inspectable, governable stores. Parametric and latent memory are real (a fine-tuned model "remembers" in its weights) but they are *not inspectable, not editable per-item, and not governable by the read/write policies of Topics 6–7*. **When a requirement needs auditable, deletable, per-item-correctable memory (Topic 14's right-to-erasure), it must be token-level** — you cannot delete one fact from a model's weights on request. This is a load-bearing distinction for governance: the choice of form constrains what governance is even possible.

## 4. Architecture

```
   [MEM] FORMS:   token-level (external, inspectable) ← THIS CHAPTER
                  parametric (in weights)             ← Chapter 2 (not governable per-item)
                  latent (intermediate reps)          ← Chapter 2

   [MEM] FUNCTIONS (README's 5 types map here):
   ┌──────────────┬───────────────┬─────────────┬──────────────┬──────────────────┐
   │ EPISODIC     │ SEMANTIC      │ PROCEDURAL  │ PREFERENCE   │ ENVIRONMENTAL    │
   │ (experiential)│ (factual)    │ (fact/exp)  │ (factual/user)│ (working/world)  │
   ├──────────────┼───────────────┼─────────────┼──────────────┼──────────────────┤
   │ append-only  │ dedup'd facts │ versioned   │ user:, single│ CACHE (M-2)      │
   │ timestamped  │               │             │ -valued      │                  │
   │ NEVER        │ dedup +       │ version     │ OVERWRITE    │ REFRESH on       │
   │ overwrite    │ supersede     │             │              │ staleness        │
   └──────────────┴───────────────┴─────────────┴──────────────┴──────────────────┘
        │              │                │              │                │
        └──────────────┴────────────────┴──────────────┴────────────────┘
                                    │
              write policy (Topic 6) · read policy (Topic 7)
              lifecycle: extraction/consolidation/forgetting (Topic 8)
              temporal validity / supersession (Topic 9)
```

**Consolidation flows between types [MEM].** Episodes (experiential) consolidate into semantic facts: "raw event streams are gradually transformed into reusable semantic fact bases" [MEM]. This is Topic 8's mechanism, and it is *directional* — episodes → facts, not the reverse — which is why episodic is append-only (the source) and semantic is deduplicated (the abstraction). The architecture is not five independent stores but a *pipeline*: experience accumulates as episodes, consolidates into facts, and refines into procedures.

## 5. Grounding

- **The function taxonomy:** [MEM] "propose[s] a finer-grained taxonomy that distinguishes **factual, experiential, and working memory**," moving "beyond coarse temporal categorizations" [MEM]. The README's five map into these three.
- **The forms taxonomy:** "three dominant realizations of agent memory, namely **token-level, parametric, and latent memory**" [MEM] — the realization axis constraining governability (§3.3).
- **The dynamics:** memory "is formed, evolved, and retrieved over time," with evolution comprising "Consolidation," "Updating," and "Forgetting" [MEM] — the update rules of §3.2 are dynamics, per type.
- **Consolidation is directional (episodic → semantic):** "raw event streams are gradually transformed into reusable semantic fact bases," stored in "vector databases… key-value stores, or knowledge graphs," "governed by procedures for deduplication and consistency checking" [MEM] — Topic 8's mechanism, and the reason episodic is the source and semantic the abstraction.
- **The three properties consolidation ensures:** "consistency, coherence, and adaptability" — "Consistency implies stable behavior and self-presentation over time… maintaining a persistent internal state regarding user-specific facts" [MEM] — the *why* of preference and semantic memory.
- **Episodic memory is event-shaped:** it maps to Topic 3's event log — episodes *are* events, timestamped and append-only.
- **Preference memory is `user:`-scoped:** Topic 2's `user:` prefix ("User preferences, profile details" [ADK-S]) is exactly where preference memory lives.
- **Environmental memory as cache:** Chapter 6, Topic 5's tool-mediated retrieval ("re-observe the live system") and Topic 8's staleness (TOCTOU) — environmental facts are best re-observed, hence cache (M-2).

**Evidence gap, stated carefully.** [MEM] is a **survey — a systematization of a fragmented field**, and it is explicit that the terminology "obscures conceptual clarity" [MEM]. It maps the design space (forms/functions/dynamics) and catalogues mechanisms; **it does not, in general, provide measured effect sizes** for "episodic memory improves task X by Y%." The type→policy mapping (§3.2) is **[synthesis]** — a reasoned assignment of update disciplines to functions, grounded in the survey's dynamics but not measured by it. The README's five-type list and the survey's three functions are **two different granularities of the same space**; this topic reconciles them but neither is a measured ground truth. Anyone claiming "episodic memory is worth N points" is inventing a number the sources do not provide.

## 6. Implementation

**Typed memory with per-type update policy (M-1):**

```python
class MemoryType(Enum):
    EPISODIC = "episodic"; SEMANTIC = "semantic"; PROCEDURAL = "procedural"
    PREFERENCE = "preference"; ENVIRONMENTAL = "environmental"

# M-1: the update rule IS the type's signature. One dispatch, five disciplines.
def write_memory(store, item, mtype: MemoryType):
    match mtype:
        case MemoryType.EPISODIC:
            store.append(item.with_timestamp())            # never overwrite (it's an event)
        case MemoryType.SEMANTIC:
            existing = store.find_similar(item)
            if existing: store.supersede_or_merge(existing, item)  # dedup (Topic 8/9)
            else: store.add(item)
        case MemoryType.PROCEDURAL:
            store.add_version(item)                         # version; retain old (audit)
        case MemoryType.PREFERENCE:
            store.set(item.key, item.value, scope=Scope.USER)  # OVERWRITE, user-scoped
        case MemoryType.ENVIRONMENTAL:
            # M-2: this is usually a CACHE. Store with source + invalidation (Topic 1).
            store.cache(item, source=item.observed_from, invalidation=item.ttl)
```

**Environmental memory as a cache, not authoritative (M-2):**

```python
def get_environmental(store, key, observer) -> object:
    """M-2: re-observe rather than trust stale. Environmental 'memory' is derived (Topic 1)."""
    cached = store.get_cache(key)
    if cached and not cached.is_stale():
        return cached.value
    fresh = observer.observe(key)          # re-observe the live world (Ch.6 T5)
    store.cache(key, fresh, source="live_observation", invalidation=default_ttl(key))
    return fresh
```

**Retrieval cue by type (Topic 7 preview):**

```python
def retrieve(store, query, ctx) -> list:
    return {
        MemoryType.PREFERENCE:    lambda: store.all_preferences(ctx.user_id),   # proactive
        MemoryType.EPISODIC:      lambda: store.by_time_entity_similarity(query),
        MemoryType.SEMANTIC:      lambda: store.by_similarity(query),
        MemoryType.PROCEDURAL:    lambda: store.by_task(query.task),
        MemoryType.ENVIRONMENTAL: lambda: get_environmental(store, query.key, ctx.observer),
    }[query.mtype]()
```

## 7. Trade-offs

| Type | Storage cost | Retrieval value | Update hazard if wrong (M-1) |
|---|---|---|---|
| Episodic | Grows (append-only) | High for "what happened" | Overwrite → **history erased** |
| Semantic | Bounded (dedup'd) | High for "what's true" | No dedup → contradictory facts accumulate |
| Procedural | Versioned (grows slowly) | High for "how to" | No version → old procedure lost, no audit |
| Preference | Tiny (per-user) | High (applies to most turns) | Append not overwrite → **stale preferences pile up** |
| Environmental | Cache (bounded) | High but perishable | Treat as authoritative → **stale-world action** |

**The trade the taxonomy is really about: matching the update discipline to the type.** The cost of getting it wrong is *type-specific corruption* (M-1): erased history, accumulating contradictions, lost procedures, stale preferences, stale-world actions. **A single blob store with one update rule guarantees four of these five corruptions** — it can be right for at most one type. The engineering cost of the taxonomy (five typed subsystems instead of one) buys correctness on all five update disciplines, which is not optional polish but the difference between a memory that helps and one that accumulates lies.

**The environmental-memory trap, priced.** Storing environmental facts as authoritative memory *looks* like an optimization (avoid re-observing) and is a *staleness bomb* (M-2). Re-observing costs a tool call; trusting stale environment costs a wrong action on a world that moved (Chapter 6, Topic 8). **The cheap-looking choice is the dangerous one**, which is why environmental memory defaults to cache with an invalidation condition.

## 8. Experiments

**The update-discipline audit (M-1).** For each memory type in your system, check: is the update rule correct for the type? **Look specifically for: preferences that append instead of overwrite (stale-value accumulation), episodes that get overwritten (history loss), environmental facts marked authoritative (M-2 violation).** This is a correctness audit, not an ablation, and it finds shipped bugs.

**Per-type utility ablation.** Since no source measures type-specific value, measure it locally: ablate each memory type (remove it from retrieval) and measure task completion on tasks that *should* need it. **Output: your system's per-type memory value** — the numbers [MEM] does not provide. Preference memory should help personalization tasks; episodic should help "have we seen this before" tasks; and if a type helps *nothing*, it is cost without benefit (Chapter 5, Topic 15's saturation, at the memory layer).

**The consolidation-fidelity test (ties to Topic 8).** Consolidate episodes into semantic facts (§4); check whether the facts are *correct* abstractions of the episodes. **A consolidation that induces a wrong general fact from specific episodes poisons the semantic store** — and it poisons it authoritatively.

**Environmental staleness test (M-2).** Store an environmental fact; change the world; check whether the agent acts on the stale fact or re-observes. **Acting on stale environment is the M-2 failure**, and it is Chapter 6, Topic 8's TOCTOU at the memory layer.

**Statistics.** Task-clustered bootstrap on per-type ablation completion; Wilson on consolidation-correctness rate; the update-audit output is a bug list (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **One blob store, one update rule.** Guarantees four of five type corruptions (M-1). Mitigation: typed subsystems with per-type policy (§6).
- **Preference appended, not overwritten.** Stale preferences accumulate; the agent applies "metric" and "imperial" both. Mitigation: overwrite; single-valued per-user (§6).
- **Episode overwritten.** History erased; "the deploy failed" replaced by "the deploy succeeded," losing the failure record. Mitigation: append-only; episodes are events (Topic 3).
- **Environmental memory as authoritative.** Stale-world action (M-2). **The most common environmental-memory bug.** Mitigation: cache with invalidation; re-observe.
- **Semantic facts not deduplicated.** Contradictory facts accumulate; retrieval returns both (Chapter 6, Topic 8's conflict). Mitigation: dedup + supersede (Topics 8–9).
- **Wrong consolidation.** A bad general fact induced from episodes, stored authoritatively (Topic 8). Mitigation: consolidation-fidelity check; confidence and provenance (Topic 9).
- **Parametric memory where governance is needed.** A fine-tuned "memory" that cannot be deleted per-item on a right-to-erasure request (§3.3). Mitigation: token-level memory for anything governable (Topic 14).
- **Edge case — the type-blended memory.** A procedure learned from experience is both procedural and experiential; a preference inferred from behavior is both preference and semantic. Mitigation: classify by the *dominant update rule* — how should it be updated? — and accept that the boundary is soft.
- **Open limitation.** [MEM] is a **survey**, explicit about the field's terminological fragmentation; it maps the space and **does not measure per-type effect sizes.** The type→policy mapping is **[synthesis]**; the README's five and the survey's three are two granularities reconciled here, neither a measured ground truth. Local ablation (§8) is the only source of per-type value for your system.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. [MEM] organizes memory by *forms* (token-level/parametric/latent), *functions* (factual/experiential/working), and *dynamics* (formation/evolution/retrieval).
2. The function taxonomy moves "beyond coarse temporal categorizations" [MEM]; the README's five types are function-level.
3. Consolidation is directional: "raw event streams are gradually transformed into reusable semantic fact bases," dedup'd and consistency-checked [MEM].
4. Memory ensures "consistency, coherence, and adaptability," maintaining "a persistent internal state regarding user-specific facts" [MEM].
5. Preference memory is `user:`-scoped [ADK-S]; episodic memory is event-shaped (Topic 3).
6. **[MEM] is a survey; per-type effect sizes are unmeasured.**

**Decision rules.**
- **Classify memory by its update rule** — append (episodic), dedup (semantic), version (procedural), overwrite (preference), refresh (environmental). The update rule *is* the type.
- **One blob store cannot serve five types** — it is right for at most one.
- **Environmental memory is a cache by default** (M-2) — re-observe, do not trust stale.
- **Governable memory must be token-level** — parametric memory cannot be deleted per-item.
- **Consolidate episodes into facts directionally**, with correctness checks (Topic 8).

**Production implications.**
1. Run the update-discipline audit; preferences-that-append and episodes-that-overwrite are common shipped bugs.
2. Build typed memory subsystems, not one store; the per-type update policy is not optional.
3. Default environmental memory to cache-with-invalidation; the authoritative version is a staleness bomb.
4. Ablate each type (§8) to get the per-type value [MEM] does not provide; drop types that help nothing.

**Connections.** This taxonomy drives Topics 6–9: write policy (Topic 6) is per-type; read policy (Topic 7) uses per-type retrieval cues; the lifecycle (Topic 8) is consolidation (episodic→semantic) plus per-type update; temporal validity (Topic 9) is how supersession works per type. Episodic memory is Topic 3's event log; preference memory is Topic 2's `user:` scope; environmental memory is Topic 1's cache and Chapter 6, Topic 5's re-observation. Parametric/latent forms are Chapter 2's; Topic 14 governs the token-level forms this chapter can delete.

## Sources

[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — forms (token-level, parametric, latent); functions (factual, experiential, working — "beyond coarse temporal categorizations"); dynamics (formation, consolidation, updating, forgetting, retrieval); consolidation as directional ("raw event streams are gradually transformed into reusable semantic fact bases," stored in "vector databases… key-value stores, or knowledge graphs," "governed by procedures for deduplication and consistency checking"); memory ensuring "consistency, coherence, and adaptability" and "a persistent internal state regarding user-specific facts"
[ADK-S] Google ADK session/state — `user:`-scoped state as "User preferences, profile details" — https://adk.dev/sessions/state/
[ECE] Anthropic, "Effective context engineering for AI agents" — structured note-taking as agent-authored episodic/procedural memory — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
