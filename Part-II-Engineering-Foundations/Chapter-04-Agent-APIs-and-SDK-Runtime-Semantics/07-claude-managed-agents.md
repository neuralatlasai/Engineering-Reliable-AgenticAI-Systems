# Topic 7 — Claude Managed Agents: Agent, Environment, Session, Event Stream, Managed Sandbox, and Self-Hosted Sandbox

## 1. Problem and objective

Managed Agents is the only surface in this chapter that supplies **both** the harness and the deployment [ANT-API] — the provider runs the loop *and* hosts the container where tools execute. That makes it the cleanest available specimen of a fully-outsourced control plane, and therefore the best place to ask the question this book keeps asking: *what did you give up, and what do you still owe?* The objective is the object model, the session lifecycle and event grammar, the credential architecture (which is genuinely novel), the self-hosted variant that reclaims deployment, and the residual responsibilities that remain yours no matter how managed the platform is.

**Status:** beta (`managed-agents-2026-04-01`) [ANT-API]. Topic 13 treats beta as a version-discipline input; nothing here should be read as a stability guarantee.

## 2. Intuition first

The mental model is *hosted process with a mailbox*. You persist an **Agent** (config: model, system prompt, tools, MCP servers, skills — versioned), you define an **Environment** (the container template), and each run is a **Session** that provisions a container and exposes an **event stream** you read and write. The provider's orchestration layer runs the loop; the container is where the agent's tools act. The architecture's own summary: "the agent loop does not run here — it runs on Anthropic's orchestration layer and acts on the container via tool calls" [ANT-API].

## 3. The object model

Four objects [ANT-API]:

| Object | What it is |
|---|---|
| **Agent** (`/v1/agents`) | Persisted, **versioned** config: model, system prompt, tools, MCP servers, skills. **Must exist before a session.** |
| **Session** (`/v1/sessions`) | A stateful run: references an agent by ID + an environment + resources; produces an event stream |
| **Environment** (`/v1/environments`) | Template for container provisioning (`cloud` or `self_hosted`; networking policy) |
| **Container** | The isolated compute where *tools* execute |

The API's most-repeated rule is a structural one: "There is no inline agent config. `model`/`system`/`tools` are top-level fields on `POST /v1/agents`, not on the session" [ANT-API]. The reference names the anti-pattern explicitly — "calling `agents.create()` at the top of every script run... accumulates orphaned agent objects, pays create latency on every invocation, and defeats the versioning model" [ANT-API]. Read structurally: **the agent object is $\mathcal C$, versioned and stored server-side**, and the session is a run against a pinned $\mathcal C$-version — which is exactly the configuration-identity discipline Chapter 1, Topic 12 demanded, implemented as a platform primitive. Sessions may pin (`{type: "agent", id, version}`), take the latest (string shorthand), or apply session-local overrides (`agent_with_overrides`) that "do not modify the agent resource or create a new agent version" [ANT-API].

**Recommended operating split** [ANT-API]: "**CLI for the control plane, SDK for the data plane**" — agents and environments defined as version-controlled YAML applied with the `ant` CLI; sessions created and driven from application code. This is Chapter 3, Topic 12's config-diff discipline as a shipped workflow.

## 4. Session lifecycle and the event stream

**Lifecycle** [ANT-API]: `rescheduling → running ↔ idle → terminated`. `idle` means the agent finished the current task and awaits input — *or* is blocked on a `user.custom_tool_result` / `user.tool_confirmation`; the attached `stop_reason` disambiguates. Errors surface as `session.error` events, not as a status.

**The idle-break gate** is the surface's sharpest correctness trap, and the reference states it as a pattern [ANT-API]:

> Do not break on `session.status_idle` alone. The session goes idle transiently... Break when idle with a terminal `stop_reason`, or on `session.status_terminated`.

with `stop_reason.type` ∈ {`requires_action` (waiting on *you* — handle it, don't break), `retries_exhausted` (terminal failure), `end_turn` (normal completion)} [ANT-API]. In Chapter 1's notation this is a $\kappa_t$ that *includes a "blocked on the principal" state* — a value the single-process runtimes don't need and a hosted one must have.

**Events** — you send `user.message`, `user.interrupt`, `user.tool_confirmation`, `user.custom_tool_result`, `user.define_outcome`, and (model-gated) `system.message`; you receive `agent.message`, `agent.thinking`, `agent.tool_use`/`tool_result`, `agent.mcp_tool_use`/`result`, `agent.custom_tool_use`, `agent.thread_context_compacted`, the `session.status_*` transitions, `session.error`, and `span.model_request_start`/`end` (the latter carrying `model_usage` for cost tracking) [ANT-API]. Every persisted event carries `id`, `type`, and `processed_at` (null while queued, populated once processed) [ANT-API].

**Three delivery mechanisms** and their traps [ANT-API]:

1. **SSE stream** (`/events/stream`) — real-time, heartbeated, **and has no replay**. Two disciplines follow: **stream-first** ("open the stream *before* sending the kickoff event," or early events arrive buffered), and **reconnect with consolidation** (on every (re)connect, open the stream, then fetch history via `events.list()` and dedupe by event ID — "if the stream drops while a tool_use is pending resolution... the session deadlocks").
2. **Polling** (`/events`) — paginated; returns immediately. The reference's warning is a systems-engineering one worth repeating verbatim: `requests`/`httpx` timeouts are "**per-chunk** read timeouts (reset on every byte), so a trickling response can block forever" — for a hard deadline, track wall-clock at the loop level.
3. **Webhooks** — provider POSTs state transitions to your HTTPS endpoint; **thin payloads** (event type + IDs only — "fetch the resource for current state"), HMAC-signed via `webhooks.unwrap()`, at-least-once with retries carrying the same `event.id` (dedupe on it), **no ordering guarantee**, auto-disabled after ~20 consecutive failures [ANT-API].

Two more lifecycle hazards the reference documents and Topic 14 should test: the **post-idle status-write race** (the stream emits `status_idle` slightly before the session's queryable status reflects it — an immediate `delete`/`archive` intermittently 400s; poll before cleanup), and **archive is permanent** on agents, environments, and memory stores — read-only, no unarchive, new sessions cannot reference them [ANT-API].

## 5. Tools, credentials, and the sandbox boundary

**Three tool kinds** [ANT-API]: the prebuilt **agent toolset** (`agent_toolset_20260401`: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_fetch`, `web_search`) executed by the provider on the session container; **MCP tools** via `mcp_toolset`; and **custom tools** executed by *you* — the agent emits `agent.custom_tool_use`, the session goes idle, you send `user.custom_tool_result` [ANT-API].

**Permission policies** on server-executed tools: `always_allow` (default) or `always_ask`, per-tool or by `default_config`; `always_ask` idles the session pending a `user.tool_confirmation` carrying the *event* ID (`sevt_...`, "not a `toolu_...` ID") with `result: allow|deny` and an optional `deny_message` surfaced back to the agent [ANT-API]. Chapter 3, Topic 6's CP-1 again — but note where the gate now lives: *the provider* evaluates the policy and *you* answer the question. Your enforcement point has become an approval channel.

**Vaults — the genuinely novel piece.** Credentials are stored provider-side and **never enter the sandbox** [ANT-API]:

> This is a deliberate security boundary — code running in the sandbox (including anything the agent writes) cannot read or exfiltrate a vaulted credential, even under prompt injection. Instead, credentials are injected by Anthropic-side proxies **after** a request leaves the sandbox.

Three credential types: `mcp_oauth` (auto-refreshed via the stored `refresh_token`), `static_bearer`, and `environment_variable` — the last one appearing in the sandbox as "an opaque placeholder" whose real value is substituted **at egress**, scoped by `networking.allowed_hosts` and `injection_location` (`header`/`body`; a secret in the **URL path is never substituted**) [ANT-API]. Git operations on attached repositories are proxied the same way: the `authorization_token` "is never placed inside the container" [ANT-API].

This is the strongest answer in the whole chapter to Chapter 12's exfiltration problem, and it is worth naming why: it moves the secret *outside the blast radius of prompt injection entirely*, rather than defending the model's judgment about it. The reference's own guardrail — "**Never store credentials, API keys, or tokens in memory stores**... a key written once is replayed into every later session that mounts the store" [ANT-API] — is the counterpart discipline.

**Self-hosted sandboxes** reclaim the deployment axis: `config: {type: "self_hosted"}` keeps the loop on the provider but moves tool execution to your infrastructure via an **outbound-polling worker** (`EnvironmentWorker.run()` / `ant beta:worker poll`) — "connectivity is **outbound-only**: your worker long-polls Anthropic's work queue; Anthropic never dials into your network" [ANT-API]. What you regain: filesystem contents and egress never leave your environment. What you take on, per the reference's own list: container hardening, egress restriction ("there is no default"), environment-key custody and rotation, least privilege, log retention — and what Anthropic explicitly **cannot** do for you: "fast-revoke a leaked environment key, verify your image or supply chain, sandbox tool execution inside your container, or enforce retention after tool output reaches your infrastructure" [ANT-API]. Notably, `environment_variable` vault credentials are **not supported** on self-hosted (egress is yours, so there is nowhere to substitute) [ANT-API] — the security property of §5 is a *cloud-sandbox* property, and choosing self-hosted trades it away.

## 6. What remains yours on a fully-managed surface

**[synthesis — the residual list is ours; each item sourced above]** Even at maximum managedness:

1. **Agent config as versioned artifact** — $\mathcal C$ is yours to author, review, and version (§3).
2. **Custom-tool execution and its security** — anything you keep host-side runs in your process (§5).
3. **Approval decisions** — the platform asks; you answer, and your answer is the gate (§5).
4. **Stream correctness** — stream-first, reconnect-with-consolidation, the idle-break gate, the status-write race (§4). These are *your* bugs when they bite.
5. **Credential hygiene** — vault scoping, `allowed_hosts`, `injection_location`, and the memory-store prohibition (§5).
6. **Verification and termination-by-evidence** — the platform's `end_turn` is still a model proposal (Chapter 3, Topic 8); outcomes with rubrics (`user.define_outcome`, graded iterate-loop [ANT-API]) are the platform's answer, and adopting them is your decision.

Read the list back: the managed platform removes the loop, the sandbox, and the state store — and removes *none* of Chapter 1's epistemics. Convenience is real; the verification burden is conserved.

## 7. Failure modes

- **Inline agent config** — the API's most-repeated rejection [ANT-API]; a session with `model`/`tools` on it is a 400 and a sign the mental model is wrong.
- **`agents.create()` in the request path** — orphaned agents, wasted latency, versioning defeated [ANT-API].
- **Break-on-idle** — the documented gate violation: a transiently-idle session (awaiting *your* tool result) treated as finished [ANT-API].
- **Stream-after-send** — early events buffered; the kickoff's first events missed [ANT-API].
- **Reconnect without consolidation** — a pending tool call unresolved ⇒ **deadlock** [ANT-API].
- **Cleanup race** — `delete`/`archive` immediately after idle; intermittent 400 [ANT-API].
- **Accidental permanent archive** — of an agent, environment, or memory store: read-only, no unarchive [ANT-API].
- **Secrets in prompts or memory** — "prompts and messages are stored in the session's event history, returned by `events.list()`, and included in compaction summaries" [ANT-API]; a secret placed there is durably persisted.
- **Path-secret endpoints vaulted** — substitution covers headers and body only; a Slack-style webhook URL with the secret in the path cannot be protected this way [ANT-API].
- **Self-hosted with cloud assumptions** — expecting `environment_variable` credentials, memory stores, or Anthropic-managed egress; none apply [ANT-API].

## 8. Limitations

- Beta surface, dated header; the reference itself is a snapshot. Everything in §§3–5 is a version-pinned fact (Topic 13).
- No reliability, latency, or cost measurements for this platform exist in this book's ledger; the topic is interface documentation. A configuration built on it is measured by Chapter 3, Topic 14's methodology like any other.
- Availability is uneven across cloud providers (Managed Agents is unsupported on Bedrock/Vertex/Foundry per the reference's platform matrix [ANT-API]) — a portability fact Topic 12 consumes.

## 9. Production implications

1. **Adopt the control-plane/data-plane split** (§3): agents and environments as version-controlled YAML applied by CLI; sessions from application code. This is the shipped form of Chapter 3, Topic 12's config discipline — take it.
2. **Implement the four stream disciplines as library code, once** (§4): stream-first, consolidation-on-reconnect, the idle-break gate, poll-before-cleanup. Every one is a documented, silent, expensive bug.
3. **Vault every credential; put none in prompts, messages, or memory** (§5). Scope `allowed_hosts` and prefer `injection_location: {header: true}` — the narrower surface.
4. **Choose cloud vs. self-hosted with the trade stated** (§5): self-hosted buys data locality and *sells* egress-substituted credentials, memory stores, and Anthropic-run hardening. Write the trade down.
5. **Keep the verification layer** (§6). The platform runs the loop; it does not certify the outcome. Rubric-graded outcomes are the platform's affordance for this — use them, or supply your own validator.

## 10. Connections

- Topic 1 classified this cell; Topic 11 uses it as the fully-provider-owned state case; Topic 12 notes its non-portability (no equivalent object model elsewhere); Topic 13 owns its beta-header discipline.
- Chapter 3, Topics 4 and 9 explain why §4's stream disciplines exist (no replay ⇒ ledger consolidation; interruption ⇒ deadlock); Chapter 12 will treat the vault architecture as the reference answer to credential exfiltration.

## Sources

[ANT-API] Anthropic Managed Agents reference — architecture (agent/session/environment/container; loop on orchestration layer), mandatory agent-first flow and versioning, control-plane/data-plane split, session lifecycle and `stop_reason` gate, event types and `processed_at`, SSE/polling/webhook delivery with reconnect-consolidation and timeout warnings, post-idle race, permanent archive, tool kinds and permission policies (`always_ask`, `user.tool_confirmation`), vaults (`mcp_oauth`/`static_bearer`/`environment_variable`, egress substitution, `allowed_hosts`, `injection_location`, git proxy), memory-store credential prohibition, self-hosted sandboxes (outbound-only worker; what you own; unsupported features), platform availability — platform.claude.com docs, `managed-agents-2026-04-01` beta (cache 2026-06)
