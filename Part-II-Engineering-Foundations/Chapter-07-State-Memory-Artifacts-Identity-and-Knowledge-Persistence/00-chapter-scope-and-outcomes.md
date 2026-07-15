# Chapter 7 — State, Memory, Artifacts, Identity, and Knowledge Persistence

## Scope, Prerequisites, Terminology, System Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter exists

Chapter 6 built the context window as "a compiled view over a richer stateful system" [GCA] and, at least a dozen times, deferred the *stateful system itself* to this chapter: session, memory, and artifacts appeared only as *sources* the pipeline reads from. This chapter builds them as systems.

The distinction is the chapter's reason to exist, and it is one the field routinely blurs. **Context is what the model sees this turn; state, memory, and artifacts are what persist between turns, sessions, and runs.** The memory survey opens on exactly this confusion: "papers claiming to study 'agent memory' differ drastically in implementation, objectives, and underlying assumptions," and "the proliferation of diverse terminologies (declarative, episodic, semantic, parametric memory, etc.) further obscures conceptual clarity, highlighting the urgent need for a coherent taxonomy" [MEM]. Chapter 7 supplies that taxonomy and the engineering that follows from it.

The organizing claim: **persistence is not one thing but a layered set of systems with different lifetimes, authorities, and failure modes, and conflating them is the source of most agent memory bugs.** Google's four-tier model states the architecture — Working Context, Session, Memory, Artifacts, where "Context is a compiled view over a richer stateful system" [GCA]; ADK's scope prefixes state the lifetimes — session state, `user:`, `app:`, `temp:` [ADK-S]; and Claude Code's memory model states the durable-instruction layer — `CLAUDE.md` files loaded every session, plus auto-memory the agent writes itself [CCM]. This chapter unifies them.

## 2. Chapter scope

The unit of analysis is the **persistence layer** — every system that survives beyond the current model call — and the identity and governance that scope it. In Chapter 1's terms, this is the durable substrate behind $\hat\tau$ (the observable trace) and the source of everything Chapter 6's $\operatorname{Assemble}$ pipeline retrieves.

Covered: the taxonomy separating context, state, memory, knowledge, cache, and artifacts (Topic 1); the four state scopes (Topic 2); event logs as the authoritative record (Topic 3); message replay vs server-managed conversations (Topic 4); the memory-type taxonomy (Topic 5); write and read policies (Topics 6–7); the memory lifecycle — extraction, consolidation, deduplication, conflict resolution, forgetting (Topic 8); temporal validity and supersession (Topic 9); the artifact lifecycle and independent versioning (Topics 10–11); repository memory (Topic 12); state migration (Topic 13); privacy, deletion, retention, and tenant isolation (Topic 14); and memory evaluation (Topic 15).

## 3. Prerequisites

Chapters 1–6 in full. This chapter leans hardest on:

- **Chapter 6 in its entirety** — this chapter builds the stores Chapter 6 treated as sources; Topic 4 there (the context type taxonomy) is the presentation-side view of Topics 1–2 here.
- **Chapter 3, Topic 4** — event-sourcing and the observable trace $\hat\tau$; Topic 3 here makes the event log the *authoritative* record.
- **Chapter 4, Topic 11** — provider- vs application-managed state; Topics 3–4 here are its persistence-layer treatment.
- **Chapter 5, Topics 10 and 12** — the confused-deputy fix and the untrusted-content boundary; Topics 6–7 and 14 here apply them to memory read/write and tenancy.

## 4. Terminology fixed for this chapter

| Term | Definition adopted | Source |
|---|---|---|
| **State** | Data "relevant *only* to the *current, active* conversation thread" (`session.state`) | [ADK-S] |
| **Memory** | "A knowledge base the agent can *search* to recall information or context beyond the immediate conversation" | [ADK-S] |
| **Session** | "A *single, ongoing interaction* between a user and your agent system" — a chronological sequence of Events | [ADK-S] |
| **Event log** | "The durable log of the interaction," every message, tool call, result, control signal, and error as structured Event objects | [GCA] |
| **Artifact** | "Large binary or textual data associated with the session or user (files, logs, images)" | [GCA] |
| **Memory forms** | Token-level, parametric, and latent memory | [MEM] |
| **Memory functions** | Factual, experiential, and working memory (finer-grained than temporal categories) | [MEM] |
| **Memory dynamics** | How memory is formed, evolved (consolidation, updating, forgetting), and retrieved | [MEM] |
| **State scope prefix** | `user:` (all sessions for a user), `app:` (all users), `temp:` (invocation only), none (session) | [ADK-S] |
| **Repository memory** | Persistent project instructions in `CLAUDE.md` / `AGENTS.md`; plus auto-memory the agent writes | [CCM] |
| **Server-managed state** | Provider-hosted conversation objects (`previous_response_id`, Conversations API, `store`) | [OCS] |

## 5. System boundary

**Inside:** the persistence layers (state, session, memory, artifacts, repository memory) as systems — their storage models, lifetimes, scopes, write/read policies, lifecycle operations (consolidation, forgetting), versioning, migration, governance, and evaluation.

**Outside:** the context pipeline that *reads* these stores (Chapter 6 — this chapter is the store side of the seam); the tool contracts that *carry* memory reads/writes (Chapter 5 — memory tools are tools); the harness stage that invokes persistence (Chapter 3); model-internal (parametric/latent) memory as a *training* concern (Chapter 2 owns the model; this chapter treats parametric memory only where it interacts with external stores, per [MEM]'s forms taxonomy); and multi-agent shared memory topology (Chapters 8–9 — this chapter builds single-agent persistence, noting where sharing enters).

The seam with Chapter 6 is the chapter's defining boundary and must be exact: **Chapter 6 owns the compiled view (working context); Chapter 7 owns the durable systems it compiles from.** A memory *retrieval* is Chapter 6 (it enters the window); a memory *write policy* is Chapter 7 (it governs the store). [GCA]'s four tiers draw the line: Working Context is Chapter 6; Session, Memory, and Artifacts are Chapter 7.

## 6. Exclusions

- No database-product or vector-store comparison; stores are characterized by their persistence and governance properties, not by vendor.
- No RAG or retrieval-mechanism tutorial (Chapter 6 owns retrieval); memory *retrieval* appears here only where read policy (scope, tenancy, purpose) governs it.
- No model-training or fine-tuning treatment of parametric memory (Chapter 2); this chapter treats external, inspectable persistence.
- No multi-agent shared-memory orchestration (Chapters 8–9) beyond noting where single-agent persistence must change to support it.

## 7. Measurable outcomes for the reader

1. **Separate the six persistence concepts** (context, state, memory, knowledge, cache, artifacts) and assign any datum in their system to exactly one (Topic 1).
2. **Scope state correctly** across the four lifetimes and defend each assignment against leak and staleness (Topic 2).
3. **Make the event log authoritative** and reconstruct state from it (Topic 3), choosing replay vs server-managed state deliberately (Topic 4).
4. **Classify memory by function** and write the read/write policies that govern who may persist and retrieve what, for which identity and purpose (Topics 5–7).
5. **Operate the memory lifecycle** — extraction, consolidation, deduplication, conflict resolution, forgetting — with temporal validity and supersession (Topics 8–9).
6. **Version artifacts independently** from conversation, and migrate state across model/SDK/schema/deployment changes (Topics 10–11, 13).
7. **Govern persistence:** privacy, deletion, retention, encryption, cross-tenant isolation (Topic 14), and **evaluate memory** on precision, recall, utility, contamination, and behavioral drift (Topic 15).

## 8. Source ledger for this chapter

All previously established tags remain in force (through [ECE], [OCP], [GCA] of Chapter 6, plus the statistics tags of Chapter 1, Topic 12). New in this chapter:

| Tag | Source | Provenance |
|---|---|---|
| [MEM] | "Memory in the Age of AI Agents: A Survey — Forms, Functions and Dynamics" | `Knowledge_source/2512.13564v2.pdf` (107pp) — forms/functions/dynamics taxonomy; consolidation, updating, forgetting; retrieval |
| [OCS] | OpenAI, conversation-state guide | https://developers.openai.com/api/docs/guides/conversation-state — manual vs server-managed; `previous_response_id`; Conversations API; `store` (30-day TTL); billing |
| [CCM] | Claude Code memory model | https://code.claude.com/docs/en/memory — `CLAUDE.md` hierarchy and load order; auto-memory (`MEMORY.md`, topic files); `@`-imports; compaction survival |
| [ADK-S] | Google ADK session, state, and memory model | https://adk.dev/sessions/ , /sessions/state/ — Session/State/Events/Memory; SessionService/MemoryService; scope prefixes `user:`/`app:`/`temp:` |

**Evidence-quality note, stated plainly and enforced throughout.** The evidence here is of two kinds, and they carry different weight. **Architecture and mechanics** (state scopes [ADK-S]; server-managed state and its 30-day TTL [OCS]; the `CLAUDE.md` hierarchy and load order [CCM]) are documented product behavior — reliable as *specifications*, dated and provider-specific (Chapter 4, Topic 13's version discipline applies). **The memory taxonomy and dynamics** [MEM] are a survey — a systematization of a fragmented literature, explicit that the field's "terminologies… obscure conceptual clarity" [MEM]; it maps the design space and does not, in general, supply measured effect sizes for the mechanisms it catalogues. Three disciplines follow:

1. **Provider mechanics carry their dates and scopes.** The 30-day response TTL and the "no TTL" for Conversations objects [OCS]; the "first 200 lines or 25KB" auto-memory load [CCM]; the `temp:`/`user:`/`app:` semantics [ADK-S] — each is a cache-dated snapshot of one provider, not a law.
2. **The taxonomy is a map, not a measurement.** [MEM]'s forms/functions/dynamics organize the space; the chapter uses them to *classify and reason*, and flags where a design choice (a consolidation policy, a forgetting rule) is un-measured in the sources.
3. **Memory is a store the agent writes and reads, so it is an attack surface and a state-migration liability.** Chapter 5, Topic 12's untrusted-content boundary and Chapter 8's persistence-injection vector apply; Topic 14 governs tenancy; Topic 13 migrates schemas. A memory design that ignores these has built a database without access control or migrations.

**Notation and statistics contract:** Chapter 1, Topic 12 binds this chapter. Persistence layers are the durable substrate behind $\hat\tau$; state scopes and memory functions are classified, not scalar-scored; memory evaluation (Topic 15) reports precision/recall/utility/contamination/drift as a vector with intervals. Syntheses beyond the sources are flagged **[synthesis]** or **[derived]**; anything unmeasured is stated as unmeasured.

## 9. Chapter layout

Every topic file follows the ten-section skeleton, one section per governing instruction:

```
1.  Scope, prerequisites, terminology, boundaries, exclusions, outcomes
2.  Problem, bottleneck, objective, assumptions, constraints, success criteria
3.  Intuition first, then formalization (equations, algorithms, invariants)
4.  Architecture: components, responsibilities, interfaces, data and control flow
5.  Grounding: primary sources, specifications, reproducible evidence
6.  Implementation: APIs, schemas, data structures, configuration, semantics
7.  Trade-offs: complexity, latency, throughput, scalability, reliability, security, cost
8.  Experiments: baselines, ablations, metrics, statistical tests, thresholds
9.  Failure modes, edge cases, hazards, mitigations, recovery, open limitations
10. Verified observations, decision rules, production implications, connections
```

Chapter map:

```
00 scope (this file)
01 context vs state vs memory vs knowledge vs cache vs artifacts  ── the taxonomy
02 the four state scopes                       ──┐
03 event logs as authoritative record            ├─ state & the record
04 message replay vs server-managed state       ──┘
05 memory-type taxonomy                         ──┐
06 write policies                                 ├─ the memory system
07 read policies (identity, tenancy, purpose)     │
08 extraction, consolidation, dedup, forgetting   │
09 temporal validity, provenance, supersession  ──┘
10 artifact lifecycle                           ──┐
11 versioning artifacts independently             ├─ artifacts & knowledge
12 repository memory (CLAUDE.md, skills, plans)  ──┘
13 state migration across versions              ──┐
14 privacy, deletion, retention, tenancy          ├─ governance & proof
15 memory evaluation                            ──┘
```

Chapter 8 composes single-agent persistence into multi-agent shared memory; Chapter 10 makes these stores the survival substrate for long-running agents.

## 10. Notation and grounding contract

Chapter 1, Topic 12 binds this chapter. State is `session.state`; memory is the searchable cross-session store; the event log is the authoritative record behind $\hat\tau$. Every claim carries a source tag; every synthesis is flagged **[synthesis]** or **[derived]** with assumptions stated; provider mechanics are dated and scoped; and anything the sources leave unmeasured — most memory-lifecycle effect sizes — is stated as unmeasured rather than asserted.

## Sources

[MEM] "Memory in the Age of AI Agents: A Survey — Forms, Functions and Dynamics," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — the fragmentation problem ("papers claiming to study 'agent memory' differ drastically… terminologies (declarative, episodic, semantic, parametric memory, etc.) further obscures conceptual clarity"); forms (token-level, parametric, latent); functions (factual, experiential, working); dynamics (formation, consolidation, updating, forgetting, retrieval)
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — the four-tier model (Working Context / Session / Memory / Artifacts); "Context is a compiled view over a richer stateful system"; session as "the durable log of the interaction" of structured Event objects; artifacts as "large binary or textual data" — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[ADK-S] Google ADK session/state/memory — Session as "a single, ongoing interaction"; State as data "relevant only to the current, active conversation thread"; Memory as "a knowledge base the agent can search"; scope prefixes (`user:`, `app:`, `temp:`, none); SessionService/MemoryService; `state_delta`/`append_event`; the direct-mutation warning — https://adk.dev/sessions/ , https://adk.dev/sessions/state/
[OCS] OpenAI, conversation-state guide — manual message-list vs server-managed state; `previous_response_id` chaining; Conversations API (persistent objects, no TTL); `store` (30-day default TTL, `store:false` ZDR); "all previous input tokens… are billed as input tokens"; encrypted reasoning carry-forward — https://developers.openai.com/api/docs/guides/conversation-state
[CCM] Claude Code memory model — `CLAUDE.md` vs auto-memory; the four `CLAUDE.md` scopes (managed policy, user, project, local) and load order (root→cwd, broadest→specific); `@path` imports (depth 4); auto-memory dir `~/.claude/projects/<project>/memory/` with `MEMORY.md` index (first 200 lines / 25KB loaded); `/init`, `/memory`; project-root `CLAUDE.md` survives compaction by re-injection — https://code.claude.com/docs/en/memory
