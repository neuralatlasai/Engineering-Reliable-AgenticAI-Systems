# Topic 9 — Gemini Interactions API and ADK Integration

## 1. Problem and objective

The Interactions API is Google's model surface for agentic work, and it makes an architectural choice the other two model APIs do not: it **elevates the agentic turn itself to the API's object**. An interaction is not a message exchange; it is "a complete conversation turn as a session record containing a chronological sequence of **execution steps** — including model thoughts, tool calls, and final outputs" [GIA]. The objective is that object model, its statefulness and retention semantics (which are unusually explicit and unusually consequential), background execution, the hosted-agent endpoint, and its relationship to ADK.

**Evidence depth:** the accessible documentation [GIA] specifies the object, statefulness, storage, background mode, and agent-callability; it does **not** detail streaming mechanics ("the page does not detail streaming mechanics specific to Interactions API"). Marked accordingly.

## 2. Intuition first

The other model APIs hand you the *pieces* of a turn and let your harness assemble the record. Interactions hands you the record. That is a real simplification for the common case — the trajectory $\hat\tau$ is the API's native return value rather than something your telemetry layer reconstructs — and it comes with a coupling the other surfaces avoid: because the record is the object, *the provider is now storing it*, and the API's stateful conveniences are gated on that storage. The whole topic turns on that trade.

## 3. The object model and statefulness

**The interaction.** "A chronological sequence of execution steps" including model thoughts, tool calls, and final outputs [GIA] — i.e., the API returns the typed trace of a turn rather than a message. Mapping to Chapter 1's notation **[synthesis]**: an interaction is a slice of $\hat\tau$ delivered by the provider, spanning $Y_t$ (proposals, including thoughts) and tool-call/result steps.

**Server-side state.** Optional continuity via `previous_interaction_id`: "When specified, the server retrieves conversation history, eliminating the need to resend prior exchanges" [GIA]. The trap is documented and sharp: **interaction-scoped parameters do not persist** — `tools`, `system_instruction`, and `generation_config` "must be re-specified per request" [GIA]. Read that carefully. The *history* persists; the *configuration* does not. A builder who assumes the chained interaction inherits the tool set will send a turn whose $\operatorname{Assemble}$ silently lacks its tools — a configuration-identity failure with no error (Chapter 1, Topic 12's configuration tuple $c$ partially forgotten between turns).

**Storage and its coupling.** `store=true` by default: interactions retained 55 days (paid) or 1 day (free); `store=false` disables storage **and thereby prevents both `previous_interaction_id` and background execution** [GIA]. This is the trade named in §2, stated by the vendor: **statefulness and background execution are purchased with provider-side retention.** A zero-retention posture is available and costs you both conveniences — a data-governance decision (Chapter 12) masquerading as an API flag.

**Background execution.** `background=true` for long-running tasks, "storing the interaction for later retrieval" [GIA] — Topic 10's mode class, gated on `store` per the above.

**Hosted agents on the same endpoint.** Specialized agents are directly callable: Deep Research (`deep-research-preview-04-2026`) and Antigravity (`antigravity-preview-05-2026`), under "one unified endpoint and pattern for calling standard Gemini models as well as specialized agents directly" [GIA]. This is Topic 1's fifth surface type (specialized hosted agent) with the model API as its front door — architecturally tidy, and a control-plane cliff: calling a hosted agent is a single request whose internal loop, tool use, and evidence are entirely provider-side (Chapter 2, Topic 9 §4's table, at its extreme).

**Positioning.** The API is "our simplest and best way to build" and the surface where "all new models, multimodal capabilities, tools, and agentic features will launch"; `generateContent` "remains supported but is now legacy" [GIA]. For Topic 13, that is a migration signal with a date on it in all but name.

**SDK floor:** `google-genai` ≥ 2.3.0 (Python), `@google/genai` ≥ 2.3.0 (JS) [GIA] — a pin, and Topic 13's discipline applies.

## 4. ADK integration

ADK (Topic 8) is the harness-only SDK above this model surface: `LlmAgent` is model-backed, the Runner owns the loop, and the services own state [ADK-A; ADK]. Two integration facts follow **[synthesis — the interplay is ours; both sides sourced]**:

1. **Two state layers exist, and they must not both be authoritative.** ADK's `SessionService` holds the event-sourced session ledger [ADK]; the Interactions API can hold conversation history server-side via `previous_interaction_id` [GIA]. Using both without deciding which is the record of truth reproduces Chapter 3, Topic 12's **contradictory state** (E-4) across a vendor boundary — the worst place for it, because reconciliation requires two systems' cooperation. Decide: ADK's ledger is the record (send full context; treat interaction storage as cache), or the provider's is (and accept that your ledger is now partial).
2. **Hosted agents are opaque to ADK's callbacks.** A `deep-research-preview` call from inside an ADK agent is one tool call from the runtime's perspective; the callbacks, artifact service, and event ledger see a black box (§3's control-plane cliff). If the work inside it is consequential, that opacity is the finding.

## 5. Failure modes

- **Config amnesia on chained interactions** — `tools`/`system_instruction`/`generation_config` not re-sent [GIA]; the turn runs under a silently different $c$.
- **Retention surprise** — `store=true` by default with 55-day retention [GIA]; a compliance posture that assumed no retention is wrong until checked, and a `store=false` posture that assumed background execution still worked is broken until tested.
- **Dual-authoritative state** — ADK ledger + provider history, neither designated (§4.1).
- **Hosted-agent overtrust** — consequential work behind a single opaque call with no local evidence (§4.2; Ch. 2, Topic 9 §7).
- **Legacy-path inertia** — building new work on `generateContent` after the vendor has named it legacy and pointed all new capability at Interactions [GIA].
- **Streaming assumptions** — this book cannot state Interactions' streaming semantics (§1); do not port Topic 5's SSE grammar to it by analogy.

## 6. Limitations

- Streaming mechanics, error taxonomy, and tool-call wire format for Interactions are not established by the accessible source [GIA]; a builder must obtain them.
- The two hosted agents are previews with dated IDs [GIA] — Topic 13's pinning applies, and preview surfaces should not carry consequential load.
- No measured reliability evidence; interface documentation only, as throughout this chapter.

## 7. Production implications

1. **Re-send interaction-scoped parameters on every chained turn** (§3), and assert their presence in a conformance test (Topic 14) — this is a silent failure with a cheap detector.
2. **Decide the `store` posture deliberately**: it is simultaneously a retention decision, a statefulness decision, and a background-execution decision [GIA]. Write down which of the three drove the choice.
3. **Nominate one authoritative state layer** when running ADK over Interactions (§4.1), and treat the other as cache with an explicit reconciliation rule.
4. **Fence hosted agents** (§4.2): consequence-class them like any provider-side execution (Chapter 2, Topic 9's placement rules), and keep local evidence of inputs and outputs even when the middle is opaque.
5. **Plan the `generateContent` → Interactions migration on the vendor's stated direction** [GIA], with Topic 13's migration tests rather than on faith.

## 8. Connections

- Topic 8 documented the SDK above this surface; Topic 10 develops background execution; Topic 11 uses `store`/`previous_interaction_id` as the clearest case of provider-managed state; Topic 12 makes §3's config-amnesia trap a portability lesson (the same *concept* — "continue the conversation" — has different parameter-persistence semantics on every surface in this chapter).
- Chapter 12 owns the retention posture §3 forces; Chapter 14 owns the background-execution operations.

## Sources

[GIA] Gemini Interactions API documentation — interaction as a session record of execution steps; `previous_interaction_id` and the non-persistence of `tools`/`system_instruction`/`generation_config`; `store` semantics and retention tiers; `background`; hosted agents (`deep-research-preview-04-2026`, `antigravity-preview-05-2026`) on the unified endpoint; positioning vs legacy `generateContent`; SDK version floors — https://ai.google.dev/gemini-api/docs/interactions
[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[ADK-A] Google ADK agents documentation — https://adk.dev/agents/
