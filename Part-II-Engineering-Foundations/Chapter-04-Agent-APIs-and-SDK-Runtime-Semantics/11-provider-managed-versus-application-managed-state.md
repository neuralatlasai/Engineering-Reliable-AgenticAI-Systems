# Topic 11 — Provider-Managed versus Application-Managed State

## 1. Problem and objective

Every surface in this chapter offers to hold your state, and each offer has different retention, tenancy, deletion, portability, and failure semantics. The choice is usually made by accident — whichever the quickstart used — and then discovered during a compliance review, an incident, or a migration. The objective is to make it a decision: what "state" actually comprises, which provider offers to hold which part, what each offer costs, and the rules for choosing an owner per class of state rather than one owner for all of it.

## 2. Intuition first

"State" in an agent system is at least five different things with five different lifecycles: the **conversation** (this run's messages), the **execution record** ($\hat\tau$ — what happened, for audit), the **workspace** (files the agent touched), **memory** (what should survive the run), and **artifacts** (what the run produced). Handing all five to one owner because the SDK made it easy is how a team ends up with an audit trail that expires in 55 days, a memory store that replays a leaked key into every future session, and a migration path that requires re-implementing four things at once. ADK's three-service split — session, memory, artifact [ADK-A] — is the shape the others make you build yourself.

## 3. What each provider offers to hold

**Anthropic Messages API** — stateless. "The API is stateless — send the full conversation history each time" [ANT-API]. State is yours, entirely. (Prompt caching is a *cost* optimization over a prefix you still send, not storage.)

**Claude Agent SDK** — session state, client-side. Sessions are resumable and forkable by ID with full context restored; history accumulates in-process and is compacted when it nears the window [CAL]. The store is yours to host; the *semantics* (compaction's lossiness) are the SDK's.

**Claude Managed Agents** — provider-held, extensively [ANT-API]: agent configs (versioned, server-side), session event history (`events.list()` paginated), the container workspace, session outputs captured to the Files API (`/mnt/session/outputs/`), memory stores (workspace-scoped, FUSE-mounted, with immutable per-mutation **memory versions** and a `redact` operation), and vault credentials. Deletion semantics are explicit and asymmetric: sessions have `delete` (permanently removes session, event history, container, checkpoints) *and* `archive`; agents, environments, and memory stores have **archive only** — permanent, read-only, no unarchive [ANT-API].

**OpenAI Responses API** — three strategies offered, explicitly: "manual history tracking, response chaining, or the **Conversations API** for persistent context" [OAG]. The API hands you the ownership decision as a menu.

**OpenAI Agents SDK** — sessions as "resumable state containers," with `SQLiteSession` and Redis implementations [OAP; OAG]. Client-side by construction (harness-only surface): *you* host the store, and its durability, tenancy, and backup are your operational problem.

**Google ADK** — three services, separate: `SessionService` (state dict + complete event history), memory service, artifact service ("persistent outputs like files, code, or documents") [ADK; ADK-A]. Client-configured; the runtime commits through them (Topic 8 §4).

**Gemini Interactions** — provider-held by default and *coupled*: `store=true` retains interactions 55 days (paid) / 1 day (free); `store=false` disables storage **and** disables both `previous_interaction_id` continuity and background execution [GIA]. The clearest statement in the chapter that provider state is a *purchase*, not a gift.

## 4. The five state classes and their owners

**[synthesis — the class decomposition is ours; each provider capability sourced above]**

| Class | What it is | Retention driver | Where it can live |
|---|---|---|---|
| **Conversation** | This run's messages/context | Task duration | App (stateless API), SDK session, provider (Conversations, `previous_interaction_id`, Managed session) |
| **Execution record ($\hat\tau$)** | Requests, proposals, admitted/executed actions, results, $\kappa$, usage, validator outputs | **Audit/compliance** — often years | App telemetry; provider event history (Managed `events.list()`; ADK ledger) |
| **Workspace** | Files/services the agent acted on | The workspace's own lifecycle | Your infra; provider sandbox (Managed cloud); your infra under provider orchestration (Managed self-hosted) |
| **Memory** | What survives across runs | Product + privacy policy | App store; provider (Managed memory stores; ADK memory service) |
| **Artifacts** | Deliverables the run produced | Business retention | App storage; provider (Managed session outputs → Files API; ADK artifact service) |

The table's operative column is *retention driver*, because it is what makes single-owner designs fail. The execution record's retention is set by your auditors; Interactions' is set at 55 days by the vendor [GIA]. If your audit obligation exceeds the provider's retention, the provider **cannot** be the record's owner — no amount of convenience changes that, and discovering it at audit time is expensive.

## 5. The decision rules

**[synthesis; anchored in §§3–4]**

1. **The execution record is yours. Always.** Chapter 1, Topic 12's $\hat\tau$ and Chapter 3, Topic 4's evidence floor are *your* obligations; a provider's event history is a convenience layer over them, subject to the provider's retention (55 days [GIA]), the provider's deletion semantics (Managed session `delete` removes event history [ANT-API]), and the provider's continued existence. Mirror it locally, or accept that your audit trail has a vendor's TTL.
2. **Conversation state may be provider-held when the run is short and the record is mirrored.** The efficiency is real (not resending history [GIA]); the coupling is acceptable *only* under rule 1.
3. **Memory is the highest-consequence class to outsource** — not because providers hold it badly (Managed's versioning + redact is better than most in-house designs [ANT-API]) but because memory is *replayed into future contexts*: "a key written once is replayed into every later session that mounts the store" [ANT-API]. Whoever holds it, the governance (provenance, retention, redaction, secret prohibition) is yours (Chapter 7).
4. **Workspace ownership follows the consequence class.** If the actions are consequential in *your* environment, the workspace is in your environment — Chapter 2, Topic 9's placement rule, and precisely what Managed's self-hosted sandbox exists to allow, at the documented cost of losing egress-substituted credentials [ANT-API].
5. **Never let two owners be authoritative for one class.** Topic 9 §4.1's dual-state hazard, generalized: for each of the five classes, name the record of truth and make the other a cache with an explicit reconciliation rule. Chapter 3, Topic 12's contradictory-state entropy (E-4) is what the alternative feels like six months in.
6. **Deletion is a design input, not an afterthought.** Archive-is-permanent [ANT-API] and TTL-by-tier [GIA] are semantics you inherit; a right-to-erasure obligation must be satisfiable in *every* store you chose (Chapter 12).

## 6. Failure modes

- **Audit trail with a vendor TTL** — the record's retention set by a provider default (§4); discovered at audit.
- **Dual-authoritative conversation state** — SDK ledger plus provider history, both written, neither designated (§5.5; Topic 9 §4.1).
- **Secrets in provider-held state** — "prompts and messages are stored in the session's event history, returned by `events.list()`, and included in compaction summaries" [ANT-API]; and memory stores replay content forward. Both are documented, both are routinely violated.
- **Client-side session store treated as managed** — SQLite/Redis sessions [OAP] with no backup, no tenancy isolation, no retention policy; a resumable session pointing at a lost store is an unrecoverable run.
- **Irreversible archive** — an agent, environment, or memory store archived as "cleanup," now permanently read-only [ANT-API].
- **Portability shock** — five state classes in one provider's proprietary objects; the migration (Topic 12) requires re-implementing all five at once.
- **Compaction as silent state loss** — the conversation class quietly summarized, with the record assumed intact (Chapter 1, Topic 3; Chapter 3, Topic 4 §6).

## 7. Limitations

- Provider retention, deletion, and tenancy semantics change; §3's specifics are cache-dated snapshots and must be re-verified per release (Topic 13).
- The five-class decomposition is this book's synthesis; ADK's three services [ADK-A] are the closest sourced analogue, and no source draws all five.
- Data-residency and regulatory analysis is Chapter 12's, not this topic's; here the state classes are engineered, not adjudicated.

## 8. Production implications

1. **Draw the five-class ownership table for your system** (§4), with the record of truth named per class and the retention driver stated. This one table pre-empts the audit, migration, and erasure conversations simultaneously.
2. **Mirror $\hat\tau$ locally regardless of surface** (§5.1). This is the single non-negotiable of the topic, and it is what makes every other choice reversible.
3. **Write the reconciliation rule wherever a cache exists** (§5.5) — including "the cache may be stale by up to X, and here is how we detect it."
4. **Audit provider-held state for secrets** on a cadence (§6); the two documented replay paths (event history, memory stores) are where they hide.
5. **Treat deletion semantics as acceptance criteria** (§5.6): can you erase a user's data from every store you chose, within your obligation, without destroying an artifact you must keep?

## 9. Connections

- Topics 2, 5–9 supplied each surface's offer; Topic 12 shows why §4's table is also the migration cost estimate; Topic 13 keeps its semantics current.
- Chapter 3, Topic 4 (event-sourced vs request–response) is this decision at runtime-architecture granularity; Chapter 7 owns memory governance; Chapter 12 owns retention, residency, and erasure; Chapter 14 owns the operational side of provider-held state.

## Sources

[ANT-API] Anthropic Claude API & Managed Agents reference — stateless Messages API; Managed Agents state surfaces (versioned agent configs, session event history, container workspace, session outputs via Files API, memory stores with versions/redact, vaults); delete-vs-archive asymmetry and permanence; secrets-in-event-history and memory-replay warnings — platform.claude.com docs (cache 2026-06)
[CAL] Claude Agent SDK (sessions: resume/fork, context accumulation, automatic compaction) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[OAG] OpenAI agents guide (three state strategies: manual history, response chaining, Conversations API; sessions as resumable state containers) — https://developers.openai.com/api/docs/guides/agents
[OAP] OpenAI Agents SDK (SQLiteSession, Redis) — https://github.com/openai/openai-agents-python
[ADK] / [ADK-A] Google ADK (SessionService with complete event history; memory service; artifact service) — https://adk.dev/runtime/event-loop/ ; https://adk.dev/agents/
[GIA] Gemini Interactions API (`store` default, 55-day/1-day retention tiers, coupling to `previous_interaction_id` and background) — https://ai.google.dev/gemini-api/docs/interactions
