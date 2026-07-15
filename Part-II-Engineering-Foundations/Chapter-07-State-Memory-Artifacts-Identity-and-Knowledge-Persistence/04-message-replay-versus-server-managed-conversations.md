# Topic 4 — Message Replay versus Server-Managed Conversations

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The concrete choice every deployment faces for conversation state: **replay** the full message history each turn (you hold the truth) or reference **server-managed** state by identifier (the provider holds it). This is Chapter 4, Topic 11's provider-vs-application state, decided at the conversation layer.

**Prerequisites.** Topic 3 (the event log is authoritative); Chapter 4, Topic 11 (five state classes; ownership rules); Chapter 4, Topic 12 (portability limits — continuation semantics diverge).

**Terminology.** *Replay*: reconstruct context by sending the full message array each request. *Server-managed*: pass a reference (`previous_response_id`, a conversation ID) and the provider supplies prior context. *Store*: the provider flag controlling persistence and its TTL [OCS].

**Boundaries.** Inside: the two strategies, their ownership and portability consequences, and the decision rule. Outside: the event log behind replay (Topic 3); migration across the divergence (Topic 13); the compaction that shrinks either (Chapter 6, Topic 11).

**Exclusions.** No provider API tutorial (Chapter 4 owns the surfaces).

**Outcomes.** The reader can choose replay vs server-managed from ownership, portability, and cost requirements, and can state what each strategy costs and cedes.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A stateless model API needs prior context re-supplied every turn. Two ways to supply it: **you** reconstruct and send it (replay), or **the provider** stores it and you reference it (server-managed). They look interchangeable — both continue a conversation — and they differ in who owns the truth, whether you can port to another provider, and what you can inspect.

**Bottleneck.** The choice is usually made by whichever is easier to wire up (server-managed: one ID; replay: build the array), and its consequences surface later: a provider deprecation strands server-managed conversations you cannot export; a compliance audit finds conversation data on a provider you did not intend; a migration to a second model discovers the continuation semantics do not port (Chapter 4, Topic 12).

**Objective.** Choose deliberately from ownership, portability, inspectability, and cost — and know that **replay keeps the truth with you (Topic 3's log) while server-managed cedes it to the provider.**

**Assumptions.** The model API is stateless per request; context is re-supplied each turn by one of the two mechanisms.

**Constraints.** Server-managed state has provider-specific semantics and TTLs: OpenAI stores responses "for 30 days by default" under `store: true`, while Conversations objects "have no 30-day TTL" and "persist indefinitely" [OCS]. Billing is identical either way: "all previous input tokens for responses in the chain are billed as input tokens" [OCS] — **server-managed does not save tokens.**

**Success criteria.** The strategy matches the ownership and portability requirements; the truth's location is deliberate; the cost is understood (and is not lower for server-managed).

## 3. Intuition first, then formalization

### 3.1 Intuition: who holds the truth

The two strategies differ on one question: **when the conversation's context is needed next turn, where does it come from?**

- **Replay:** from *you*. You hold the event log (Topic 3), you project the message array, you send it. The provider is stateless — it sees a fresh request with full context every time. "By using alternating `user` and `assistant` messages, you capture the previous state of a conversation in one request" [OCS]. **The truth is yours; the provider is a pure function.**
- **Server-managed:** from the *provider*. You send a reference — `previous_response_id` to "chain responses across turns" [OCS], or a Conversations object ID that stores "items (messages, tool calls, tool outputs, etc.) across sessions and devices" [OCS]. The provider reconstructs context from its store. **The truth is theirs; you hold a pointer.**

The intuition that decides it: **server-managed is convenient and cedes ownership; replay is more work and keeps it.** And the critical correction to the usual assumption — *server-managed does not save money.* [OCS] is explicit: "Even when using `previous_response_id`, all previous input tokens for responses in the chain are billed as input tokens." **You pay for the full context either way**; server-managed saves you *transmitting* it, not *being billed* for it. The only thing it saves is the bandwidth and code of building the array — and it charges for that saving in ownership and portability.

This maps onto Chapter 4, Topic 11's continuation-semantics divergence directly: replay is "client-resent history"; server-managed is "server-side ID." The two do not port to each other (Chapter 4, Topic 12), which is the portability cost made concrete.

### 3.2 Formalization: the ownership and portability properties

Characterize each strategy by four properties **[synthesis; each sourced in §5]**:

$$
\operatorname{strategy}\in\{\text{replay},\ \text{server-managed}\},\quad
(\text{owner},\ \text{portable},\ \text{inspectable},\ \text{token-cost}).
$$

| Property | Replay | Server-managed |
|---|---|---|
| **Truth owner** | You (your event log, Topic 3) | Provider |
| **Portable across providers** | **Yes** — you hold the messages | **No** — the ID is provider-specific (Ch.4 T12) |
| **Inspectable** | Fully — it is your log | Only via the provider's retrieval API |
| **Token cost** | Full context billed | **Full context billed** [OCS] — identical |
| **Persistence** | Yours to govern | Provider's TTL (30-day / indefinite) [OCS] |
| **Failure if provider changes** | None (you own it) | **Stranded** (Ch.4 T13's silent-change classes) |

**The invariant that should drive the choice [derived]:**

$$
\textbf{R-1 (ownership follows requirement):}\quad
\text{if the conversation record must be portable, auditable, or provider-independent}\ \Longrightarrow\ \text{replay.}
$$

R-1 says: **if you need to own the truth, replay is the only strategy that lets you.** Server-managed is acceptable precisely when you *do not* need portability, provider-independence, or full inspection — a disposable conversation, a single-provider product with no export requirement. The moment any of those requirements appears, server-managed is a liability, because you cannot export what you do not hold.

### 3.3 The hybrid, and the reasoning-state subtlety

The strategies are not exclusive. The robust pattern — and the one that reconciles Topic 3 — is: **hold the authoritative event log yourself (replay-capable), and optionally use server-managed state as a cache (Topic 1, K-1) for latency.** The server-managed ID becomes a derived, rebuildable optimization; if it is lost or the provider changes, you replay from your log. **This keeps ownership (R-1) while getting server-managed's convenience, and it is the only pattern that survives Chapter 4, Topic 13's provider changes.**

The reasoning-state wrinkle [OCS] adds: reasoning models carry *encrypted reasoning content* across turns. Stateless (replay) requests must "preserve encrypted reasoning via `include: ["reasoning.encrypted_content"]` and all response output items," while server-managed models can use `reasoning.context: "all_turns"` [OCS]. **This is an opaque, provider-specific state that replay must explicitly carry** — a case where replay is not simply "send the messages" but "send the messages *and* the encrypted reasoning blobs," and dropping the blobs silently loses the model's prior reasoning. It is a portability trap (Chapter 4, Topic 12): the encrypted reasoning is not portable, so a run that depends on it is pinned to one provider even under replay.

## 4. Architecture

```
   REPLAY (you own the truth)                SERVER-MANAGED (provider owns it)
   ┌────────────────────────────┐            ┌────────────────────────────────┐
   │ YOUR event log (Topic 3)   │            │ send previous_response_id       │
   │        │ project           │            │   or conversation_id            │
   │        ▼                   │            │        │                        │
   │ full message array ────────┼──► model   │        ▼                        │
   │ (+ encrypted reasoning     │            │ provider reconstructs context   │
   │  blobs for reasoning       │            │ from ITS store ──────────► model│
   │  models [OCS])             │            │                                 │
   │                            │            │ store: true  → 30-day TTL       │
   │ PORTABLE · INSPECTABLE     │            │ Conversations → no TTL   [OCS]  │
   │ full tokens billed         │            │ full tokens billed [OCS]        │
   └────────────────────────────┘            └────────────────────────────────┘

   HYBRID (§3.3) — the robust pattern:
   ┌──────────────────────────────────────────────────────────────────────────┐
   │ AUTHORITATIVE: your event log (Topic 3, R-1)                              │
   │ CACHE (Topic 1, K-1): server-managed ID for latency                      │
   │ provider changes / ID lost → REPLAY from your log. Ownership preserved.   │
   └──────────────────────────────────────────────────────────────────────────┘
```

**The billing architecture matters.** Because both strategies bill the full context [OCS], the token *cost* is not a decision axis — only the *transmission* and *ownership* are. Prompt caching (Chapter 6, Topic 10) reduces the *reprocessing* cost of the repeated prefix under *either* strategy, and it is orthogonal to replay-vs-server-managed. **A team choosing server-managed "to save tokens" has misunderstood the billing; the token savings they want come from caching, not from ceding ownership.**

## 5. Grounding

- **Replay, defined:** "By using alternating `user` and `assistant` messages, you capture the previous state of a conversation in one request to the model"; each request "remains stateless" [OCS].
- **`previous_response_id`:** "Chain responses across turns by passing the previous response ID" [OCS].
- **Conversations API:** persistent conversation objects with "durable identifiers, storing items (messages, tool calls, tool outputs, etc.) across sessions and devices" [OCS].
- **`store` and TTL:** `store: true` persists responses "for 30 days by default"; `store: false` "Disables persistence; data not retained"; Conversations objects "have no 30-day TTL" and "persist indefinitely" [OCS].
- **Billing is identical:** "Even when using `previous_response_id`, all previous input tokens for responses in the chain are billed as input tokens in the API" [OCS] — the token-cost equality.
- **Reasoning-state carry:** stateless requests preserve reasoning via `include: ["reasoning.encrypted_content"]` and "all response output items"; persisted-reasoning models use `reasoning.context: "all_turns"` [OCS].
- **The ownership/portability framing is Chapter 4:** Topic 11 (provider- vs application-managed state; the five state classes) and Topic 12 (continuation semantics as a portability divergence — "server-side ID" vs "client-resent history").
- **The authoritative-log basis is Topic 3:** replay is possible *because* you hold the event log; server-managed cedes that log to the provider.
- **ADK's session model is a third point:** SessionService (InMemory/Database/VertexAI) [ADK-S] is *self-hosted* server-managed — you run the store, so you keep ownership *and* get server-managed's structure. It shows the replay/server-managed axis is really about *who runs the store*, not a binary.

**Evidence gap.** The mechanics and TTLs are documented, dated, provider-specific [OCS] (Chapter 4, Topic 13). **No source measures the latency or reliability difference between replay and server-managed**, nor the frequency of provider-change stranding. The R-1 rule and the hybrid recommendation are **reasoned from the documented ownership/portability properties**, not from measured incident data. The token-cost *equality*, however, is a documented fact [OCS], not a synthesis.

## 6. Implementation

**The hybrid: own the log, cache the server ID (§3.3):**

```python
class ConversationState:
    """Authoritative event log (Topic 3, R-1) + server-managed ID as a rebuildable cache."""
    def __init__(self, log: EventLog):
        self.log = log                          # AUTHORITATIVE (yours)
        self.server_id: str | None = None       # CACHE (provider's, rebuildable)

    def continue_turn(self, user_msg, client) -> Response:
        self.log.append(Event(kind="user_message", payload=user_msg, ...))
        try:
            if self.server_id:
                # Fast path: reference server state (a cache, Topic 1 K-1).
                resp = client.responses.create(
                    input=[user_msg], previous_response_id=self.server_id,
                    store=True,
                )
            else:
                raise NoServerState
        except (NoServerState, ProviderStateError):
            # Provider changed / ID lost / migrating → REPLAY from OUR log. Ownership held.
            resp = client.responses.create(input=self.log.project_messages(), store=True)

        self.server_id = resp.id                 # refresh the cache
        self.log.append(Event(kind="model_reply", payload=resp, ...))
        return resp
```

**Reasoning-state carry under replay [OCS] — the blob that must not be dropped:**

```python
def project_messages_with_reasoning(log: EventLog) -> list:
    """Reasoning models: replay must carry encrypted reasoning, or prior reasoning is LOST.
    This is a portability trap (Ch.4 T12) — the blob is provider-specific."""
    msgs = log.project_messages()
    for e in log.events_of_kind("model_reply"):
        if e.payload.get("reasoning_encrypted"):
            msgs.append({"type": "reasoning", "encrypted_content": e.payload["reasoning_encrypted"]})
    return msgs   # request with include=["reasoning.encrypted_content"]
```

**The ownership decision, as a gate:**

```python
def choose_strategy(reqs: Requirements) -> str:
    """R-1: portability / audit / provider-independence ⇒ you must own the truth ⇒ replay."""
    if reqs.must_export or reqs.multi_provider or reqs.full_audit or reqs.data_residency:
        return "replay"      # or self-hosted server-managed (ADK SessionService [ADK-S])
    return "server_managed"  # disposable, single-provider, no export requirement
```

## 7. Trade-offs

| Dimension | Replay | Server-managed |
|---|---|---|
| Ownership | **You** | Provider |
| Portability (Ch.4 T12) | **Yes** | No — ID is provider-specific |
| Inspectability | Full (your log) | Provider's retrieval API only |
| Token cost | Full billed | **Full billed — identical** [OCS] |
| Transmission | You send full array | You send an ID |
| Wiring effort | Build the array | One reference |
| Persistence control | Yours | Provider TTL (30-day / indefinite) [OCS] |
| Provider-change risk | None | **Stranded** (Ch.4 T13) |
| Reasoning state | Must carry the blob [OCS] | Provider carries it |

**The trade, corrected for the common misconception.** Server-managed *feels* cheaper and *feels* simpler. It is neither cheaper (identical billing [OCS]) nor free of hidden cost (it cedes ownership and portability). What it genuinely buys is *less transmission and less code*. **That is a real but small benefit, and it is paid for with ownership — which is a bad trade the moment you need to export, audit, migrate, or survive a provider change.** The hybrid (§3.3) captures the small benefit without paying the large cost, which is why it is the default recommendation: own the log, use the ID as a cache.

**The self-hosted middle ground.** ADK's Database/VertexAI SessionService [ADK-S] is server-managed state *you run*. It gives server-managed's structure (a queryable session store, not a message array you rebuild) while keeping ownership (it is your database). **For teams that want server-managed ergonomics without ceding the truth, self-hosting the store is the answer** — the axis is "who runs the store," and running it yourself is the third option the binary framing hides.

## 8. Experiments

**The ownership/portability audit (not an ablation — a design check).** For your conversation store, answer: can you export every conversation without the provider? Can you reconstruct a conversation if the provider deprecates the endpoint tomorrow (Chapter 4, Topic 13)? Can you audit a conversation's full content for compliance? **A "no" to any means you are server-managed on a requirement that needs replay** (R-1).

**Provider-change simulation.** Invalidate the server-managed ID mid-conversation; does the system recover by replaying from the log (§6), or does it lose the conversation? **The hybrid recovers; pure server-managed strands.** This is Chapter 4, Topic 14's conformance test, applied to conversation state.

**Latency measurement.** Replay (full array) vs server-managed (ID reference) round-trip latency, and both with and without prompt caching (Chapter 6, Topic 10). **Prediction: server-managed saves transmission latency; caching saves reprocessing under both** — confirming the two levers are orthogonal and caching, not server-managed, is where the compute savings live.

**Reasoning-state fidelity (reasoning models).** Replay *with* vs *without* the encrypted reasoning blob [OCS]; measure whether prior reasoning is preserved. **Dropping the blob silently loses reasoning** — a failure invisible until a multi-turn reasoning task degrades.

**Statistics.** Latency distributions (p50/p95); zero-failure bound on provider-change recovery; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Server-managed chosen "to save tokens."** Billing is identical [OCS]; the saving is imagined. Mitigation: understand the billing; get compute savings from caching (Chapter 6, Topic 10).
- **Provider deprecation strands conversations.** Server-managed state you cannot export (Chapter 4, Topic 13). Mitigation: the hybrid — own the log, cache the ID.
- **Compliance surprise.** Conversation data persists on a provider (30-day or indefinite [OCS]) beyond intent, or in the wrong jurisdiction. Mitigation: `store: false` for ZDR [OCS]; replay with your own governed store (Topic 14).
- **Dropped reasoning blob.** Replay without `reasoning.encrypted_content` [OCS] silently loses prior reasoning. Mitigation: carry the blob (§6); the reasoning-fidelity test.
- **TTL expiry mid-conversation.** A `store: true` response expires at 30 days during a long-running conversation [OCS]; the reference dangles. Mitigation: the hybrid replays from the log; or use Conversations objects (no TTL) [OCS].
- **Continuation semantics do not port.** Migrating provider breaks server-managed continuation (Chapter 4, Topic 12). Mitigation: replay ports; server-managed does not.
- **Edge case — the WebSocket cache.** [OCS] notes a connection-local cache retains "the most recent response"; an uncached ID "require[s] sending a new turn with `previous_response_id` set to `null` and full input context" — i.e., a forced fallback to replay. **Server-managed silently degrades to replay under connection loss**, so your replay path must exist regardless.
- **Open limitation.** Mechanics and TTLs are **documented, dated, provider-specific** [OCS] (Chapter 4, Topic 13). **No source measures replay vs server-managed latency/reliability or stranding frequency.** R-1 and the hybrid are reasoned from ownership/portability properties; the token-cost equality is a documented fact, not a synthesis.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Replay captures conversation state in "alternating `user` and `assistant` messages" in one stateless request [OCS].
2. Server-managed state uses `previous_response_id` chaining or persistent Conversations objects storing items "across sessions and devices" [OCS].
3. `store: true` persists responses 30 days; Conversations objects have no TTL; `store: false` disables persistence [OCS].
4. **Billing is identical** — "all previous input tokens… are billed as input tokens" regardless of strategy [OCS].
5. Reasoning models require explicit encrypted-reasoning carry under replay [OCS].
6. Self-hosted session stores (ADK Database/VertexAI) give server-managed structure with retained ownership [ADK-S].
7. **No source measures the latency/reliability trade or stranding frequency.**

**Decision rules.**
- **Portability, audit, provider-independence, or residency requirement ⇒ replay** (R-1), or self-hosted server-managed.
- **Own the authoritative log (Topic 3); use a server-managed ID only as a cache** (the hybrid).
- **Do not choose server-managed to save tokens** — billing is identical; caching saves compute.
- **Carry the encrypted reasoning blob under replay** for reasoning models, or lose prior reasoning.
- **Always keep a replay path** — server-managed degrades to it under connection loss anyway [OCS].

**Production implications.**
1. Run the ownership/portability audit; a "no" on export/audit/recovery means you are server-managed on a requirement that needs replay.
2. Build the hybrid: authoritative log plus server-managed cache with a replay fallback (§6). It is the only pattern that survives provider change.
3. Correct any "server-managed saves money" assumption; get compute savings from caching instead.
4. Set `store: false` where data residency or ZDR requires it [OCS], and hold the truth in your own governed store (Topic 14).

**Connections.** This topic decides where Topic 3's authoritative log lives relative to the provider, and it is Chapter 4, Topic 11's ownership question and Topic 12's portability divergence at the conversation layer. The hybrid makes the server ID a Topic 1 cache over the Topic 3 log. Governance of the stored conversation is Topic 14; migration across the strategy divergence is Topic 13; caching (Chapter 6, Topic 10) is the orthogonal compute lever.

## Sources

[OCS] OpenAI, conversation-state guide — replay ("By using alternating `user` and `assistant` messages, you capture the previous state of a conversation in one request"; stateless requests); `previous_response_id` chaining; the Conversations API (persistent objects, items "across sessions and devices"); `store: true` 30-day TTL, `store: false` no retention, Conversations objects "no 30-day TTL… persist indefinitely"; **"Even when using `previous_response_id`, all previous input tokens for responses in the chain are billed as input tokens"**; encrypted-reasoning carry (`include: ["reasoning.encrypted_content"]`, `reasoning.context: "all_turns"`); the WebSocket connection-local cache and `previous_response_id: null` fallback — https://developers.openai.com/api/docs/guides/conversation-state
[ADK-S] Google ADK session/state — SessionService (InMemory / Database / VertexAI) as self-hosted server-managed state retaining ownership — https://adk.dev/sessions/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) — the authoritative-record and observability requirements replay satisfies
