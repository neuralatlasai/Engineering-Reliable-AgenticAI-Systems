# Topic 14 — Reference Python Implementations and Cross-Provider Conformance Tests

## 1. Problem and objective

Every preceding topic in this chapter ended in a claim about *semantics*: the tool-use round trip pairs IDs and batches parallel results in one message [ANT-API]; `pause_turn` must be resumed by echoing the response back or the turn is silently truncated [ANT-API]; a stream must be drained past its terminal message or the loop hangs on unread state [CAL]; provider-managed state is pinned by identifier, not reconstructed [ANT-API; OAG; GIA]; and a model upgrade is a configuration change with an evidentiary burden (Topic 13 §6). Claims about semantics are cheap. The objective of this topic is to convert them into **artifacts that fail loudly when a provider changes its mind**: reference implementations of the disciplines this chapter established, and a conformance suite that tests the *divergences* of Topic 12 rather than assuming them away.

The distinction that organizes the topic: a **reference implementation** encodes what your code must do; a **conformance test** encodes what the provider must still be doing. The second is the one teams skip, and it is the one that catches the failures of Topic 13 §4 that exceptions cannot see.

**Scope honesty.** The code here is *reference*, not a library: it is written to be read, and it is deliberately short of the retry, telemetry, and configuration apparatus a production harness carries (Chapter 3, Topics 9–10 own those). Where a provider's behavior is documented at guide depth only (Topic 12 §7's evidence asymmetry), the corresponding test is marked as an **assertion of your assumption**, not of a documented guarantee — and that label is the point, because an assumption you have written down as an executable test is an assumption you will be told about when it breaks. **[synthesis]**

## 2. Intuition first

A conformance test is a *sensor* in Chapter 3's cybernetic sense [CAH §3.4.1]: a versioned instrument with a declared error model, watching a component you do not control. The component here is the provider. You cannot prevent it from changing; you can only choose whether you learn about the change from your CI or from your users.

This reframes what the suite is *for*. It is not "testing the vendor's code" — that is their job and it is not your business. It is testing **the specific interface facts your harness has hard-coded a dependency on**, which is a small, enumerable, and locally-determined set. The suite's size should be proportional to your coupling, not to the provider's API surface.

## 3. Design constraints on the suite

Four constraints, each of which rules out an obvious-looking approach **[synthesis]**:

1. **The suite calls real endpoints.** A mocked provider tests your mocks. Silent default changes, tokenizer shifts, and silent model fallback (Topic 13 §4) are *invisible* to a mock by construction, and they are exactly the failures the suite exists to catch. This costs money and it is the price of the signal.
2. **Therefore it must be cheap enough to run often.** Tier 1 assertions use the smallest model in the family, minimal `max_tokens`, and a trivial tool. The expensive tiers (Topic 13 §6, Tiers 3–4) are *not* part of this suite — they are experiments (Chapter 3, Topic 14), and conflating a contract test with an experiment produces something too slow to run per-commit and too weak to support a claim.
3. **Assertions are on observable facts, not on the absence of exceptions** (Topic 13 §4). `assert response.model.startswith(TARGET)` is a real test; `try: call() except: fail()` is not.
4. **Non-determinism is confined to the arrange step.** A conformance test must not assert on model *content*. It asserts on the *shape and protocol* of what came back — that a `tool_use` block has an `id`, that the terminal status is in the documented set, that the served model is the pinned one. Content-level behavior is Tier 3's business, with Tier 3's statistics.

## 4. Reference implementation: the tool-use round trip

The contract from Topic 5, restated as invariants the code must maintain [ANT-API]:

- **I1 — ID pairing.** Every `tool_result` carries the `tool_use_id` of the block it answers.
- **I2 — Batching.** Results for parallel `tool_use` blocks in one assistant message go back in **one** user message, as multiple `tool_result` blocks. Splitting them across messages is a protocol violation.
- **I3 — Completeness.** *Every* `tool_use` block gets a result, including ones your dispatcher rejected — a rejection is a `tool_result` with `is_error: true`, not an omission.
- **I4 — Error channel.** Tool failure is `is_error: true` on the result, not an exception that unwinds the loop.
- **I5 — Full-history echo.** The assistant message containing the `tool_use` blocks is appended to history *verbatim* before the results.

I3 is the one that is violated in practice, and it is the one that maps directly onto Chapter 1's typed stages: $\operatorname{Admit}_{H_c}$ can reject a candidate $\xi_t$, and that rejection is an *observation* the model must receive — a policy block is a `tool_result` with `is_error: true`, not a silent hole in the transcript. A hole in the transcript is an ill-formed request at best and a model that hallucinates the missing result at worst.

```python
# reference/tool_loop.py — the round trip, with the invariants named.
from anthropic import Anthropic

TERMINAL = {"end_turn", "stop_sequence", "max_tokens", "refusal"}  # non-continuing
client = Anthropic()

def run_turn(messages, tools, dispatch, *, model, max_tokens=1024, max_steps=16):
    """Drive one turn to a terminal stop_reason. `dispatch` maps a tool_use block
    to (content, is_error). Returns (messages, kappa)."""
    for _ in range(max_steps):
        resp = client.messages.create(
            model=model, max_tokens=max_tokens, tools=tools, messages=messages,
        )
        assert resp.model.startswith(model.rsplit("-", 1)[0]), resp.model  # Topic 13 §4

        if resp.stop_reason == "pause_turn":
            # I6: echo the paused response back verbatim; do NOT re-prompt. [ANT-API]
            messages.append({"role": "assistant", "content": resp.content})
            continue
        if resp.stop_reason == "refusal":
            return messages, "policy_block"          # handled BEFORE reading content
        if resp.stop_reason in TERMINAL:
            messages.append({"role": "assistant", "content": resp.content})
            return messages, "model_stop"            # NOT success — Ch.1 Topic 12
        if resp.stop_reason != "tool_use":
            raise AssertionError(f"undocumented stop_reason: {resp.stop_reason}")

        messages.append({"role": "assistant", "content": resp.content})   # I5

        results = []                                                       # I2
        for block in resp.content:
            if block.type != "tool_use":
                continue
            content, is_error = dispatch(block)                            # I3, I4
            results.append({
                "type": "tool_result",
                "tool_use_id": block.id,                                   # I1
                "content": content,
                "is_error": is_error,
            })
        messages.append({"role": "user", "content": results})              # one message

    return messages, "budget"
```

Three details carry the chapter's weight. The `stop_reason` switch is **exhaustive with an alarming default** — a new terminal state (Topic 13 §4) surfaces as an `AssertionError` in your logs rather than as a loop that silently treats it as completion. The `pause_turn` branch echoes the response back rather than re-prompting, which is the documented resumption contract and whose violation is *silent truncation* [ANT-API]. And the terminal mapping returns `model_stop`, never `success`: the model saying it is done is a *proposal about termination*, and Chapter 3, Topic 8 is the whole argument for why the harness — not the model — decides whether $\kappa=\mathrm{success}$.

## 5. Reference implementation: stream drain and the managed-session disciplines

**Stream-to-completion.** The SDK documents that the stream must be iterated past its terminal `ResultMessage`; abandoning the iterator early leaves the loop wedged on unread state, and a message arriving on the turn's final iteration could be lost before v2.1.205 [CAL]. The discipline is a `finally` that drains, not a `break` on the message you wanted:

```python
async def drain(stream):
    """Consume to exhaustion; never `break` out of a provider stream. [CAL]"""
    result = None
    async for msg in stream:                 # no early exit
        if type(msg).__name__ == "ResultMessage":
            result = msg                     # record, keep iterating
    return result
```

**The managed-session disciplines** (Topic 7), which compose into one loop: *stream first* (SSE is the low-latency path), *consolidate on reconnect* (a dropped connection is resumed by replaying the event history, not by re-sending the prompt), *gate on the idle break* (`session.status_idle` is the terminal signal; a quiet stream is not), and *poll before cleanup* (never tear down an environment on stream closure alone — closure is a transport fact, idleness is a session fact) [ANT-API].

```python
# reference/managed_session.py — the four disciplines, in dependency order.
def run_session(sess, *, poll_timeout_s):
    last_seq = 0
    while True:
        try:
            for ev in sess.stream(after=last_seq):        # 1. stream first
                last_seq = ev.sequence                    # 2. consolidate on reconnect
                yield ev
                if ev.type == "session.status_idle":      # 3. idle break gate
                    return
        except StreamDisconnected:
            if sess.get().status == "idle":               # 4. poll before cleanup
                return
            continue                                      # resume from last_seq
```

The sequence cursor is what makes reconnection a *resumption* rather than a *replay*, and it is why the event stream must be sequenced at all (Chapter 3, Topic 4's ledger, at the wire). Without it, a reconnect either duplicates events or drops them, and both corrupt the observable trace $\hat\tau$ that everything downstream — audit, evaluation, harness evolution — consumes.

**Webhook receipt** (Topic 10) is the same problem with the ordering guarantee removed. Three requirements, in this order: **verify** the signature before parsing the body (an unverified webhook is untrusted data arriving on the control plane — Chapter 3, Topic 6's CP-1, and the most dangerous violation in this chapter); **dedupe** on the event ID, because at-least-once delivery means retries are normal and a non-idempotent handler will double-execute; **order** by sequence, not by arrival, because delivery order is not send order. A handler that does the third without the first is a well-organized security hole.

## 6. The conformance suite: Tier 1 (contract) and Tier 2 (behavioral)

Topic 13 §6 named four tiers. Tiers 1 and 2 are *tests*, and they belong in CI; Tiers 3 and 4 are *experiments*, and they belong in the protocol of Chapter 3, Topic 14. This section implements the first two.

**Tier 1 — contract tests.** Each assertion corresponds to a documented failure mode, and this correspondence is the acceptance criterion for adding a test at all: **[synthesis — the suite is ours; every asserted fact is sourced]**

| # | Assertion | Catches | Source |
|---|---|---|---|
| C1 | `response.model` starts with the pinned family | Silent model fallback (retired `-fast` → standard) | [ANT-API] |
| C2 | Every observed `stop_reason` ∈ documented set; unknown ⇒ alarm | A new terminal state read as completion | [ANT-API] |
| C3 | Tool round trip: IDs paired, parallel results in one message, `is_error` accepted | Protocol violations that surface as 400s or hallucinated results | [ANT-API] |
| C4 | `pause_turn` resumed by echo ⇒ turn completes, output not truncated | Silent truncation — documented *including under the SDK tool runners* | [ANT-API] |
| C5 | Stream drained past terminal message ⇒ no hang; final message present | Wedged loops; the pre-v2.1.205 lost-message defect | [CAL] |
| C6 | Structured-output retry exhaustion surfaces as a handled terminal, not a crash | `error_max_structured_output_retries` | [CAL] |
| C7 | Beta headers accepted as exact strings; the feature is actually active | Header drift; a "corrected" date rejected | [ANT-API] |
| C8 | Managed-agent session pinned to `{type: "agent", id, version}` resolves to that version | Config drift under an updated agent | [ANT-API] |

```python
# tests/conformance/test_tier1.py  (pytest; real endpoints; smallest model)
import pytest
from reference.tool_loop import run_turn, TERMINAL

PINNED = "claude-haiku-4-5-20251001"
ECHO = [{"name": "echo", "description": "Echo the input back.",
         "input_schema": {"type": "object", "properties": {"s": {"type": "string"}},
                          "required": ["s"]}}]

def test_c1_served_model_is_pinned(client):
    r = client.messages.create(model=PINNED, max_tokens=16,
                               messages=[{"role": "user", "content": "hi"}])
    assert r.model.startswith(PINNED.rsplit("-", 1)[0])      # not: no exception raised

def test_c2_stop_reason_is_documented(client):
    r = client.messages.create(model=PINNED, max_tokens=16,
                               messages=[{"role": "user", "content": "hi"}])
    assert r.stop_reason in TERMINAL | {"tool_use", "pause_turn"}, r.stop_reason

def test_c3_tool_round_trip_and_rejection(client):
    """I3: an ADMISSION REJECTION is still a tool_result. The loop must not stall."""
    def dispatch(block):
        return "blocked by policy", True                     # is_error, not an omission
    msgs, kappa = run_turn(
        [{"role": "user", "content": "Call echo with s='x', then reply DONE."}],
        ECHO, dispatch, model=PINNED)
    assert kappa in {"model_stop", "budget"}
    ids  = [b.id for m in msgs if m["role"] == "assistant"
            for b in m["content"] if getattr(b, "type", None) == "tool_use"]
    rets = [b["tool_use_id"] for m in msgs if m["role"] == "user"
            and isinstance(m["content"], list) for b in m["content"]
            if isinstance(b, dict) and b.get("type") == "tool_result"]
    assert sorted(ids) == sorted(rets)                        # I1 + I3: total pairing
```

The `test_c3` assertion — that the multiset of `tool_use` IDs equals the multiset of `tool_result` IDs across the whole transcript — is the single most valuable line in the suite, because it is the invariant that a rejecting admission gate (Chapter 3, Topic 7) tends to break, and the failure it prevents is a model reasoning over a transcript with a hole in it.

**Tier 2 — behavioral assertions.** These are the detectors for the failures exceptions cannot see (Topic 13 §4), and they are the reason a mocked suite is worthless:

- **Thinking text present.** With `thinking.display` set to a summarizing mode, assert the thinking blocks carry non-empty text — the documented default flipped to `"omitted"`, and a pipeline that reads thinking would have received empty strings without a single error [ANT-API].
- **Token counts re-baselined per model** using the provider's `count_tokens`, never a third-party tokenizer (which the reference states undercounts by ~15–20% on typical text and by much more on code) [ANT-API]. Assert your `max_tokens` budgets still clear the new tokenizer's counts; a documented tokenizer shift of ~1×–1.35× turns a comfortable budget into a truncation.
- **Refusal path exercised**, so `stop_reason: "refusal"` is handled *before* content is read [ANT-API].
- **Platform matrix**, per deployment target: a feature present on the first-party API may be absent on Bedrock/Vertex/Foundry [ANT-API], and the test must run against the endpoint you actually deploy to.

## 7. Cross-provider conformance: testing the divergences, not the sameness

The temptation, having built an adapter over three providers, is to write one test suite that passes on all three. **That suite is a lie by construction**: it passes precisely because it tests only the intersection, and the intersection is not where migrations fail. Topic 12's divergence catalogue says the failures live in continuation semantics, terminal taxonomies, tool semantics, model-gated breaks, stream shapes, and within-vendor platform gaps. A cross-provider suite earns its keep only if it **asserts the divergence explicitly** — encoding, per provider, what that provider actually does, so that a provider changing to match another one is a *test failure you investigate*, not a silent behavior change you inherit. **[synthesis]**

The structure that makes this tractable is a **capability matrix rather than a common interface**: the adapter declares, per provider, which semantics it implements natively and which it emulates, and the suite tests each cell for the behavior that cell claims.

| Semantic axis | Provider A | Provider B | What the test asserts |
|---|---|---|---|
| Continuation | Server-side ID (pin and reference) | Client-resent history | That the *declared* mechanism is the one in use — a provider silently persisting state you thought was stateless is a compliance surprise (Topic 11) |
| Terminal taxonomy | Provider's subtypes | Provider's subtypes | That the adapter's mapping onto $\kappa_t$ is **total** — every provider terminal maps to exactly one $\kappa$, and an unmapped one alarms |
| Tool contract | Batched parallel results | Per-call results | That the adapter emits the provider's required shape, not the other's |
| Config persistence | Immutable versioned configs | Config re-sent per call | That pinning actually pins (C8), and that "amnesia" providers are re-sent full config (Topic 9's trap) |

The $\kappa_t$ mapping test is the load-bearing one, and it is worth stating as a rule: **the map from provider terminal states to $\kappa_t$ must be total, explicit, and tested, and its default branch must alarm rather than default to `model_stop`.** Chapter 1's terminal-control status exists so that a run's ending is a fact about the *harness*, comparable across substrates; an adapter that quietly collapses an unrecognized provider terminal into `model_stop` has destroyed exactly the comparability the abstraction was built for, and it has done so in the direction that makes failures look like successes.

```python
# tests/conformance/test_kappa_totality.py
@pytest.mark.parametrize("provider", PROVIDERS)
def test_kappa_map_is_total(provider):
    """Every documented terminal maps to exactly one kappa; nothing defaults."""
    for terminal in provider.documented_terminals():          # from the pinned version
        kappa = provider.to_kappa(terminal)
        assert kappa in KAPPA_SET, (provider.name, terminal, kappa)
    with pytest.raises(UnmappedTerminal):                     # the default branch ALARMS
        provider.to_kappa("__terminal_that_does_not_exist__")
```

`documented_terminals()` is deliberately a hand-maintained list pinned to a provider version, not something discovered at runtime. That is the point: when the provider adds a terminal state, the list is stale, and the *first* thing that tells you is this test — which is the earliest, cheapest, and least damaging place to find out.

## 8. Cost, and what the suite is worth

**[derived — the accounting is ours; the failure modes it prices are sourced]**

The Tier 1 suite is roughly a dozen real API calls at the smallest model with minimal `max_tokens`, run per-commit: negligible against any engineering budget, and the correct comparison is not against zero but against the failures in Topic 13 §4. Tier 2 is run per model/SDK/beta change — tens of calls, occasionally. Tiers 3–4 (Chapter 3, Topic 14; Chapter 2, Topic 14) are the expensive tiers, and they are experiments with predeclared endpoints, not CI jobs; running them per-commit is both unaffordable and statistically incoherent (Chapter 1, Topic 12's multiplicity discipline exists because repeated unplanned looks at an outcome are not free).

The honest limit of the suite: **it detects protocol and interface regressions, and it detects nothing about quality.** A model that has become subtly worse at your tasks passes every test in this topic. That is not a defect in the suite; it is the boundary between *contract* and *capability*, and pretending a green CI run says anything about the latter is the error Chapter 1, Topic 7 (capability–reliability separation) was written to prevent.

## 9. Failure modes

- **Mocked conformance tests.** The suite passes forever and detects nothing; every silent-change class of Topic 13 §4 is invisible to a mock. If budget forces mocks, label them unit tests and admit the conformance surface is untested.
- **Asserting on model content.** A test that asserts the model said a particular thing is a flaky test measuring a random variable with $n=1$; it will be deleted after the third false alarm, and it will take the real assertions with it.
- **A cross-provider suite that tests only the intersection** (§7) — it certifies portability that does not exist, and the migration discovers the truth in production.
- **The `to_kappa` default branch returning `model_stop`.** Unmapped terminals become successes. This is the failure mode that converts a provider change into a silently inflated success rate, and it corrupts every number downstream.
- **Omitting results for rejected tool calls** (I3) — the transcript hole; the model then reasons over an absence.
- **`break` inside a provider stream** — the wedged loop [CAL]; the fix is drain-in-`finally`, and it is one line.
- **Suite drift.** The `documented_terminals()` list, the beta headers, and the pinned model IDs are all snapshots; a suite whose pins are stale tests a provider that no longer exists.
- **Treating a green suite as a migration decision.** Tier 1–2 green means *the interface still works*, not *the system is still as good* (§8).

## 10. Limitations

- The reference code is Anthropic-shaped, because the Anthropic surface is the one documented in this chapter at reference depth [ANT-API; CAL]; the OpenAI and Google equivalents are sketched structurally rather than exhibited, and Topic 12 §7's evidence-asymmetry note applies in full. Readers implementing against those surfaces should treat §§4–6 as a *specification of the invariants to test*, not as transcribable code.
- The suite is untested against a real provider breaking change in this text — its value is argued from the documented failure classes of Topic 13 §4, not demonstrated by a measured incident-detection rate. No source reports the base rate at which such suites catch such changes.
- Everything version-specific (model IDs, beta headers, SDK floors, terminal sets) is a cache-dated snapshot. The **invariants** (I1–I6), the **tiers**, and the **totality rule** for $\kappa$ are the durable content.

## 11. Production implications

1. **Write the eight Tier 1 assertions before you write the harness.** Each one corresponds to a documented silent failure, and they cost less than the first incident any of them prevents.
2. **Make the $\kappa$ map total and make its default alarm.** If you take one artifact from this chapter, take this: an unmapped provider terminal must be a loud failure, never a quiet `model_stop`.
3. **Give every rejected tool call a `tool_result`.** The admission gate (Chapter 3, Topic 7) and the protocol (I3) meet here, and the meeting point is where transcripts get holes.
4. **Run the suite against the endpoint you deploy to** — first-party API, Bedrock, Vertex, Foundry — because the platform matrix is a real divergence [ANT-API], not a formality.
5. **Keep the pins in one file** (Topic 13 §9.1) and let the suite read them. A conformance suite with its own hard-coded model string is a second, silently-diverging source of truth.
6. **Do not let a green suite authorize a model upgrade.** Green means Tier 1–2; the upgrade needs Tiers 3–4 (Topic 13 §6), and those are experiments with the burden Chapter 1 imposes on any configuration change.

## 12. Connections

- This topic executes Topic 13's Tiers 1–2, tests Topic 12's divergences, and encodes the round-trip and stream contracts of Topics 5–7 and 10 and the state-ownership rules of Topic 11.
- Chapter 3, Topic 7 (deterministic invariants) is what the admission gate in §4 enforces; Chapter 3, Topic 14 (ablation methodology) is where Tiers 3–4 live; Chapter 1, Topic 12 (configuration identity, $\kappa_t$, observable trace $\hat\tau$) is what the totality rule protects.
- Chapter 5 takes the tool contract from a protocol invariant to a design discipline: this topic guarantees the round trip is *well-formed*; Chapter 5 asks whether the tool was *worth calling*.

## Sources

[ANT-API] Anthropic Claude API reference — tool-use round trip (`tool_use`/`tool_result` ID pairing; parallel results in a single user message; `is_error`); `stop_reason` set including `refusal` and `pause_turn`, and the documented silent truncation when a paused turn is not echoed back (including under the SDK tool runners); `thinking.display` default change; tokenizer shifts and `count_tokens` vs third-party tokenizers; retired-model silent fallback and the `assert response.model.startswith(...)` verification step; exact-string beta headers; Managed Agents immutable agent versions with session pinning; managed-session event stream, `session.status_idle`, and webhook delivery semantics; platform-availability matrix — platform.claude.com docs (cache 2026-06)
[CAL] Claude Agent SDK — iterate the stream to completion past `ResultMessage`; streaming-input message-loss defect fixed in v2.1.205; `error_max_structured_output_retries` — https://code.claude.com/docs/en/agent-sdk/agent-loop
[OAG] OpenAI agents guide — Responses API state strategies (server-side continuation vs client-resent history) — https://developers.openai.com/api/docs/guides/agents
[GIA] Gemini Interactions API — `previous_interaction_id` continuation and `store` coupling — https://ai.google.dev/gemini-api/docs/interactions
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.1 — the harness as cybernetic governor observing through versioned sensors
