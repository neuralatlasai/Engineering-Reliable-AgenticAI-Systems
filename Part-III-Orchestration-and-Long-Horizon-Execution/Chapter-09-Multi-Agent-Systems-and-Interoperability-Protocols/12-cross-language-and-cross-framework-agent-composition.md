# Topic 12 — Cross-Language and Cross-Framework Agent Composition

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Composing agents built in *different languages and frameworks* — a Python LangGraph agent, a TypeScript OpenAI-SDK agent, a Java Spring-AI agent — into one system. The protocols (Topics 9–11) make this *possible*; this topic is about what actually breaks at the seams, which is everything Chapter 4, Topic 12 predicted, at the agent layer.

**Prerequisites.** Chapter 4, Topic 12 (portability limits — continuation semantics, terminal taxonomies, tool semantics diverge); Topic 11 (MCP/A2A as the composition substrate); Chapter 8, Topic 13 (the SDK comparison and its three gaps).

**Terminology.** *Cross-framework composition*: agents from different SDKs working together. *Semantic gap*: a divergence in meaning (not syntax) across frameworks. *Lowest common denominator*: what all frameworks agree on.

**Boundaries.** Inside: what breaks across framework boundaries and how to compose despite it. Outside: the protocols themselves (Topics 9–11); identity across the boundary (Topic 13).

**Exclusions.** No framework tutorial.

**Outcomes.** The reader can compose agents across frameworks, knows which semantics do *not* port (and will produce silent bugs if assumed), and can build the translation layer the protocols do not provide.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The interoperability protocols (MCP, A2A) standardize the *wire*: how agents connect and exchange messages. **They do not standardize the *semantics*.** A2A lets a Python agent send a task to a Java agent — but "task complete," "the tool failed," "the run terminated," and "the state is X" **mean different things in different frameworks**, and the protocol carries the *words* without carrying the *meaning*.

**Bottleneck.** This is Chapter 4, Topic 12's portability problem, one layer up — and it is *worse* at the agent layer, because agents have richer semantics than APIs. Chapter 4, Topic 12 catalogued the divergences: **continuation semantics, terminal-status taxonomies, tool-result contracts, model-gated behaviors.** Every one of them recurs here: a `FINAL_ANSWER` from framework A's agent may map to a different $\kappa$ than framework B expects; framework A's "success" may be framework B's "partial." **And the failure is silent** — the message is delivered, parsed, and *misinterpreted*, producing a system that is confidently wrong at the seam.

**Objective.** Compose across frameworks with an explicit *semantic translation layer* that maps each framework's terminal statuses, tool contracts, and continuation semantics onto a common model — because the protocols provide the transport and leave the translation to you.

**Assumptions.** Frameworks diverge semantically (Chapter 4, Topic 12). The protocols carry words, not meaning.

**Constraints.** The lowest common denominator across frameworks is small — text in, text out — and richer composition requires per-framework translation.

**Success criteria.** Every cross-framework boundary has a semantic translation; terminal statuses and tool contracts are mapped, not assumed compatible; semantic mismatches are detected, not silently absorbed.

## 3. Intuition first, then formalization

### 3.1 Intuition: the protocol carries the word, not the meaning

A2A delivers a message from a Python agent to a Java agent. The message says `Message Type: FINAL_ANSWER`. **The word arrives intact. The *meaning* does not necessarily survive.**

- In framework A, `FINAL_ANSWER` might mean "the agent completed successfully with a verified result."
- In framework B, it might mean "the agent stopped and this is its last output" — which, per Chapter 1, Topic 12, is `model_stop`, **not** `success`.

**The receiving framework interprets the word by *its own* semantics, and if those differ from the sender's, the interpretation is wrong** — silently, because the message was well-formed and parsed cleanly.

This is exactly Chapter 4, Topic 12's terminal-taxonomy divergence, and its lesson recurs: **the map from one framework's terminal states to another's $\kappa$ must be *total, explicit, and tested, with a default that alarms*** (Chapter 4, Topic 14's totality rule). **A cross-framework composition that assumes `FINAL_ANSWER` means the same thing everywhere has, in effect, an untested terminal-status map — and it will collapse a failure into a success at the boundary** (Chapter 8, Topic 6's laundering, entering through a framework seam).

**The four divergences that recur, from Chapter 4, Topic 12 [derived]:**

1. **Terminal-status taxonomies.** Each framework's "done / failed / partial" vocabulary differs. **Must be mapped to a common $\kappa$.**
2. **Tool-result contracts.** How a tool result (including an error) is represented differs (Chapter 5, Topic 5; Chapter 8, Topic 7). **Must be normalized.**
3. **Continuation semantics.** How a conversation/task continues (server-managed vs replayed — Chapter 4, Topic 4) differs. **Does not port; the composition must own the continuation.**
4. **Type systems.** Framework A's typed state (Chapter 8, Topic 7) is framework B's untyped blob. **The typed contract must be re-established at the boundary.**

### 3.2 Formalization: the semantic translation layer

Let frameworks $F_1, \ldots, F_k$ each have their own semantics $\Sigma_i$ (terminal statuses, tool contracts, continuation model, types). Composition requires a translation to a common model $\Sigma^\star$ **[synthesis; grounded in Chapter 4, Topic 12]**:

$$
\tau_i : \Sigma_i \longrightarrow \Sigma^\star \quad\text{(and back)}.
$$

Three invariants **[derived from Chapter 4, Topic 12/14]**:

$$
\textbf{XF-1 (terminal-status maps are total and alarming):}\quad
\tau_i(\text{terminal})\ \text{maps every framework terminal to exactly one } \kappa \in \Sigma^\star;\ \text{an unmapped terminal ALARMS, never defaults to success.}
$$

XF-1 is Chapter 4, Topic 14's totality rule, at the framework boundary. **The most dangerous default is mapping an unrecognized terminal to `success` or `model_stop`** — it launders a failure across the seam. **Every framework's terminal vocabulary must be explicitly mapped, and the default branch must fail loud.**

$$
\textbf{XF-2 (the composition owns continuation):}\quad
\text{continuation semantics do NOT port (Chapter 4, Topic 12);}\ \text{the composition layer owns the conversation/task state, not any single framework.}
$$

XF-2 is Chapter 4, Topic 4's replay-vs-server-managed choice, forced: **since frameworks disagree on continuation, the composition cannot rely on any one framework's continuation — it must hold the authoritative state itself** (Chapter 7, Topic 3's event log) and drive each framework statelessly. **This is the hybrid pattern from Chapter 4, Topic 4: own the log, treat each framework as a stateless function of it.**

$$
\textbf{XF-3 (re-establish the typed contract at the boundary):}\quad
\text{a message crossing a framework boundary is re-typed against } \Sigma^\star;\ \text{it does not inherit the sender's types.}
$$

XF-3 is Chapter 8, Topic 7's typed state, at the seam. **Framework A's typed `StepResult` becomes a blob when it crosses to framework B** unless the boundary re-types it. **The translation layer is where the typed contract (including $\kappa$) is re-asserted** — otherwise the composition inherits the untyped-state failures Chapter 8, Topic 7 catalogued.

### 3.3 The lowest common denominator is text — and richer composition is a translation problem

**What all frameworks agree on: text in, text out.** Any agent, in any language, can receive a text prompt and return text. **This is the lowest common denominator, and it is *safe* — text has no framework-specific semantics to misinterpret.**

**Everything richer is a translation problem [synthesis]:**
- **Structured tool calls** — framework-specific formats (Chapter 4, Topic 12's tool-semantic divergence).
- **Terminal statuses** — framework-specific vocabularies (XF-1).
- **Typed state** — framework-specific type systems (XF-3).
- **Streaming, interruption, continuation** — framework-specific mechanics (Chapter 4, Topic 12).

**So there is a spectrum:**
- **Compose at the text layer** — safe, framework-agnostic, but you lose the structure (a `FINAL_ANSWER` is just text, and you cannot mechanically tell success from failure).
- **Compose at the semantic layer** — richer, but requires the translation layer (XF-1..XF-3), which the protocols do not provide.

**The honest engineering position: A2A gives you cross-framework *transport*, and you build the cross-framework *translation*.** [A2A]'s "build on existing standards" (HTTP/SSE/JSON-RPC) [A2A] means the *wire* is standard; **the *semantics* on the wire are yours to reconcile.** And the lesson from Chapter 8, Topic 13 recurs: **the three things no SDK provides — status aggregation, replanning, and the orchestration decision — are also the three things no *protocol* provides across frameworks.** You build them, in your composition layer, once, framework-agnostically.

## 4. Architecture

```
   THE PROTOCOL CARRIES THE WORD, NOT THE MEANING (§3.1)

   ┌── FRAMEWORK A (Python, LangGraph) ──┐         ┌── FRAMEWORK B (Java, Spring-AI) ──┐
   │  its own:                           │         │  its own:                          │
   │   · terminal vocab                  │         │   · terminal vocab                 │
   │   · tool contract                   │         │   · tool contract                  │
   │   · continuation model              │  A2A    │   · continuation model             │
   │   · type system                     │◄───────►│   · type system                    │
   │                                     │ (wire   │                                    │
   │  "FINAL_ANSWER" = "verified success"│  only)  │  "FINAL_ANSWER" = "stopped, last   │
   │                                     │         │   output" = model_stop ≠ success!  │
   └──────────────┬──────────────────────┘         └──────────────┬─────────────────────┘
                  │                                                │
                  │  ⚠ the word "FINAL_ANSWER" arrives intact;      │
                  │    the MEANING does not. Silent misinterpretation.
                  ▼                                                ▼
   ┌──────────────────────────── SEMANTIC TRANSLATION LAYER (YOURS) ──────────────────────┐
   │  τ_A : Σ_A → Σ*        τ_B : Σ_B → Σ*    (the protocols do NOT provide this)          │
   │                                                                                      │
   │  XF-1: terminal maps TOTAL + ALARMING — an unmapped terminal NEVER defaults to        │
   │        success (Ch.4 T14's totality rule, at the framework seam)                      │
   │  XF-2: the composition OWNS continuation — no framework's continuation ports          │
   │        (Ch.4 T4's hybrid: own the log, drive each framework statelessly)              │
   │  XF-3: RE-TYPE at the boundary — Framework A's typed StepResult is B's blob            │
   │        unless the layer re-asserts the contract (incl. κ) (Ch.8 T7)                    │
   └──────────────────────────────────────────────────────────────────────────────────────┘

   THE SPECTRUM (§3.3):
     TEXT layer  ── safe, framework-agnostic, but you lose the structure
     SEMANTIC layer ── rich, but requires the translation layer above (YOURS to build)

   LOWEST COMMON DENOMINATOR = text in, text out (no semantics to misinterpret)
```

## 5. Grounding

- **A2A's cross-framework premise:** collaboration "regardless of vendor or framework," across "siloed systems and applications" [A2A] — the composition this topic is about.
- **A2A carries structured messages but framework-specific meaning:** messages exchange "context, replies, artifacts, and user instructions" with "parts… discrete content units with specified content types" [A2A] — **the parts have content types, but the *semantics* of a `FINAL_ANSWER` or a terminal status are the framework's, not the protocol's.**
- **The portability divergences are Chapter 4, Topic 12:** continuation semantics (server-side ID vs client-resent history), terminal-status taxonomies, tool-result contracts, model-gated breaks — **each recurs at the framework boundary.**
- **The totality rule is Chapter 4, Topic 14:** the provider-terminal → $\kappa$ map must be total, explicit, tested, with an alarming default — XF-1.
- **The replay/own-the-log pattern is Chapter 4, Topic 4:** own the authoritative state, drive the provider statelessly — XF-2.
- **Typed state at the boundary is Chapter 8, Topic 7:** re-establish the contract; a message that loses its type loses its $\kappa$ (XF-3).
- **The three universal gaps are Chapter 8, Topic 13:** no SDK provides status aggregation, replanning, or the orchestration decision — **and no protocol provides them across frameworks either.**
- **The SDK differences are documented:** Chapter 4, Topic 3 and Chapter 8, Topic 13 (OpenAI Agents SDK, Claude Agent SDK, ADK have different primitives) — the frameworks being composed.
- **OpenAI's multi-agent is GPT-5.6-only, beta:** [OMA] ("GPT-5.6 models only (beta feature)") — **even within one vendor, cross-version composition has constraints** (Chapter 4, Topic 13).

**Evidence gap.** A2A's cross-framework *transport* premise is documented [A2A]. **The semantic-divergence problem is [derived]** from Chapter 4, Topic 12 (which *is* grounded in documented provider divergences) — **no source specifically documents cross-framework semantic mismatches for agents**, because A2A is too young to have a body of composition experience. **XF-1..XF-3 are [synthesis]** applying Chapter 4's portability discipline to the framework boundary. **No source measures cross-framework composition failures** — the composition is emerging (Topic 10's A2A youth), so this topic is *predictive*: it says what *will* break, reasoning from the documented API-layer divergences, not from measured agent-layer ones.

## 6. Implementation

**The semantic translation layer — what the protocols do not provide:**

```python
class SemanticTranslator:
    """The protocols carry the WORD (A2A wire); YOU translate the MEANING.
    This is Ch.4 T12's portability problem, at the framework boundary."""

    def __init__(self):
        # XF-1: EXPLICIT terminal-status maps per framework. NO defaults to success.
        self.terminal_maps = {
            "langgraph": {"END": "success", "interrupt": "model_stop", "error": "execution_error"},
            "openai_sdk": {"completed": "success", "max_turns": "budget",
                           "guardrail_tripwire": "policy_block"},
            "spring_ai":  {"FINISHED": "model_stop",   # ← NOT success! it means "stopped"
                           "COMPLETED": "success", "FAILED": "execution_error"},
        }

    def to_kappa(self, framework: str, terminal: str) -> str:
        """XF-1: total + ALARMING. An unmapped terminal must NEVER become success —
        that launders a failure across the framework seam (Ch.8 T6, Ch.4 T14)."""
        mapping = self.terminal_maps.get(framework, {})
        if terminal not in mapping:
            raise UnmappedTerminal(
                f"framework {framework} returned terminal {terminal!r} with no mapping. "
                f"Defaulting to success would LAUNDER a possible failure. Map it explicitly."
            )
        return mapping[terminal]
```

**XF-2 — the composition owns continuation (Chapter 4, Topic 4's hybrid):**

```python
class CrossFrameworkComposition:
    """XF-2: continuation semantics do NOT port. The composition owns the AUTHORITATIVE
    state (Ch.7 T3's event log) and drives each framework STATELESSLY — because no
    framework's continuation model can be trusted across the boundary."""

    def __init__(self):
        self.event_log = EventLog()        # OUR authoritative state (Ch.7 T3)
        self.translator = SemanticTranslator()

    async def step(self, framework_agent, task) -> StepResult:
        # Drive the framework statelessly from OUR log (Ch.4 T4's replay).
        context = self.event_log.project_for(framework_agent)
        raw = await framework_agent.run(task, context=context)

        # XF-1 + XF-3: translate the terminal and RE-TYPE at the boundary.
        kappa = self.translator.to_kappa(framework_agent.framework, raw.terminal)
        result = StepResult(                # re-established typed contract (Ch.8 T7)
            content=raw.output,
            kappa=kappa,                    # ← the MEANING, translated
            provenance=Provenance(source=f"framework:{framework_agent.framework}",
                                  trust=Trust.UNTRUSTED),   # cross-framework = untrusted
        )
        self.event_log.append(result)       # OUR log stays authoritative
        return result
```

**XF-3 — re-type at the boundary; text is the safe LCD (§3.3):**

```python
def receive_cross_framework(raw_message, sender_framework: str, translator) -> StepResult:
    """XF-3: a message crossing a framework boundary does NOT inherit the sender's types.
    Re-establish the contract. If you cannot map the semantics, fall back to the safe
    lowest common denominator: TEXT (which has no framework-specific meaning to misinterpret)."""
    try:
        return StepResult(
            content=raw_message.payload,
            kappa=translator.to_kappa(sender_framework, raw_message.terminal),   # XF-1
            provenance=Provenance(source=sender_framework, trust=Trust.UNTRUSTED),
        )
    except UnmappedTerminal:
        # Cannot translate the semantics → fall back to TEXT (the safe LCD, §3.3).
        # You LOSE the structure (cannot mechanically tell success from failure) but you
        # do not SILENTLY MISINTERPRET it.
        return StepResult(content=str(raw_message.payload), kappa="unknown",
                          provenance=Provenance(source=sender_framework, trust=Trust.UNTRUSTED),
                          note="semantics untranslatable; treated as opaque text")
```

## 7. Trade-offs

| Composition level | Buys | Costs |
|---|---|---|
| **Text (LCD)** | Framework-agnostic; **no misinterpretation** | Lose structure — cannot mechanically tell success from failure |
| **Semantic (translated)** | Rich composition; $\kappa$, types, contracts preserved | **The translation layer (XF-1..XF-3) — yours to build and maintain** |
| Assume compatibility | Simple | **Silent misinterpretation at the seam** — the failure this topic exists to prevent |
| Own the continuation (XF-2) | State survives framework disagreement | An authoritative log the composition maintains |
| Inherit framework continuation | Simple | **Does not port** (Chapter 4, Topic 12) — breaks across the boundary |

**The trade: safety at the text layer versus richness at the semantic layer.** Text composition is *safe* — a `FINAL_ANSWER` is just a string, and a string cannot be misinterpreted as a $\kappa$ it does not mean. **But you lose the structure**: you cannot mechanically aggregate statuses (Chapter 8, Topic 6), because there are no statuses, only text. **Semantic composition is *rich* — you get $\kappa$, types, contracts across frameworks — but only if you build the translation layer**, and the translation layer is exactly what the protocols do not provide.

**The failure to avoid is the *implicit middle*: assuming semantic compatibility without translating.** This is the worst option — it *looks* like semantic composition (you are passing `FINAL_ANSWER` and reading it as a status) but it is *unvalidated* semantic composition, and it silently misinterprets at every framework mismatch. **Either translate explicitly (XF-1..XF-3) or fall back to text — never assume.**

**And the recurring lesson: the three things no SDK provides (Chapter 8, Topic 13) are the three things no protocol provides either.** Status aggregation, replanning, the orchestration decision — **build them once, in your composition layer, framework-agnostically**, and every framework's agents inherit them. **This is the argument for a thin, framework-neutral composition layer that owns the semantics** — it is the only place these disciplines can live consistently across frameworks.

## 8. Experiments

**The terminal-mismatch test (XF-1) — the silent-failure test.** Compose two frameworks whose terminal vocabularies differ (one's `FINISHED` means `model_stop`, another's means `success`). **Does the composition correctly translate, or does it read one framework's "stopped" as another's "succeeded"?**

- **Without translation:** the mismatch is silent — a `model_stop` is read as `success`, laundering a non-completion across the seam (Chapter 8, Topic 6).
- **With XF-1's total, alarming map:** an unmapped terminal alarms; a mapped one translates correctly.

**Measure: terminal-misinterpretation rate.** **Target zero** (Chapter 1, Topic 12). **This is Chapter 4, Topic 14's conformance test, at the framework boundary.**

**The continuation-portability test (XF-2).** Compose frameworks with different continuation models (server-managed vs replay — Chapter 4, Topic 4). **Does a multi-turn cross-framework conversation stay coherent?** **Prediction: without the composition owning the log, continuation breaks at the boundary** — the frameworks disagree on how the conversation continues.

**The type-loss test (XF-3).** Send a typed `StepResult` (with $\kappa$) from framework A to framework B. **Does $\kappa$ survive, or does the message arrive as an untyped blob?** **Without re-typing at the boundary, $\kappa$ is lost** — and Chapter 8, Topic 6's aggregation becomes impossible.

**The text-fallback test (§3.3).** For semantics you cannot translate, verify the fallback to text is *safe* — that an untranslatable message becomes opaque text (`kappa="unknown"`), **not a silently misinterpreted status.**

**Statistics.** Zero-failure bounds on terminal misinterpretation and type loss (targets zero); design-conformance for continuation. **Given A2A's youth, these are predictive conformance tests — the failures are derived from Chapter 4's documented API-layer divergences, and this experiment confirms they recur at the agent layer.**

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Assuming semantic compatibility.** Reading framework A's `FINAL_ANSWER` as framework B's success. **The silent misinterpretation at the seam — the topic's core failure.** Mitigation: XF-1 — explicit, total, alarming terminal maps.
- **Terminal collapsed to success.** An unmapped terminal defaults to `success`, laundering a failure across the boundary (Chapter 8, Topic 6; Chapter 4, Topic 14). Mitigation: the default branch alarms.
- **Continuation broken across frameworks.** Frameworks disagree on how a conversation continues; the composition relies on one framework's model. Mitigation: XF-2 — the composition owns the log.
- **Type loss at the boundary.** A typed `StepResult` becomes a blob; $\kappa$ is lost; aggregation impossible. Mitigation: XF-3 — re-type at the boundary.
- **Building the translation per-pair.** $k$ frameworks require $k^2$ pairwise translations. Mitigation: translate to a *common* model $\Sigma^\star$ ($k$ translations, not $k^2$) — the hub-and-spoke of §3.2.
- **The three universal gaps, per-framework.** Rebuilding status aggregation / replanning / orchestration for each framework. Mitigation: build them once in the framework-neutral composition layer.
- **Cross-version, even within a vendor.** [OMA]'s multi-agent is GPT-5.6-only, beta — even same-vendor composition has version constraints (Chapter 4, Topic 13). Mitigation: pin versions; treat cross-version as cross-framework.
- **Edge case — the text-only composition.** Sometimes text is *enough* (an agent that just needs another agent's prose answer). **Then compose at the text layer and skip the translation** — the LCD is safe and sufficient. Don't build a translation layer you don't need.
- **Edge case — a framework that exposes no terminal status.** Some frameworks return only text (no structured terminal). **You cannot translate what isn't there** — treat its output as text (`kappa="unknown"`) and verify by outcome, not by claimed status.
- **Open limitation.** **No source documents cross-framework semantic mismatches for agents** — A2A is too young. **XF-1..XF-3 are [synthesis]** applying Chapter 4, Topic 12's *documented* API-layer divergences to the *predicted* agent-layer ones. **This topic is predictive**: it says what will break, reasoned from grounded API-layer evidence, not measured agent-layer evidence. **No source measures cross-framework composition failures.** §8's experiments are the local confirmation.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. A2A enables composition "regardless of vendor or framework" [A2A] — the transport for cross-framework composition.
2. A2A carries structured messages with content-typed parts, but **the semantics of terminal statuses are the framework's, not the protocol's** [A2A; derived].
3. The portability divergences (continuation, terminal taxonomies, tool contracts, model-gated behavior) are documented at the API layer (Chapter 4, Topic 12) and **recur at the framework layer**.
4. The totality rule (terminal maps total, explicit, tested, alarming default) is Chapter 4, Topic 14.
5. The three universal gaps (aggregation, replanning, orchestration) are provided by no SDK (Chapter 8, Topic 13) **and no protocol**.
6. Even within one vendor, composition can be version-constrained ([OMA]: GPT-5.6-only, beta).
7. **No source measures cross-framework agent composition — this topic is predictive.**

**Decision rules.**
- **The protocol carries the word; you translate the meaning.** Build the semantic translation layer (XF-1..XF-3).
- **Terminal-status maps are total and alarming** (XF-1) — an unmapped terminal never defaults to success.
- **The composition owns continuation** (XF-2) — no framework's continuation ports.
- **Re-type at the boundary** (XF-3) — a message loses its type, and its $\kappa$, unless you re-assert the contract.
- **Text is the safe lowest common denominator** — fall back to it rather than misinterpret.
- **Never assume semantic compatibility** — translate explicitly or fall back to text; the implicit middle is the worst option.
- **Build the three universal gaps once, framework-neutrally.**

**Production implications.**
1. Build a semantic translation layer with explicit, total terminal-status maps; assuming compatibility silently launders failures at every framework seam.
2. Own the authoritative state (Chapter 7, Topic 3) and drive each framework statelessly; continuation does not port.
3. Re-type messages at framework boundaries; $\kappa$ and typed contracts are lost otherwise, breaking aggregation.
4. Where you cannot translate, fall back to text — safe, if lossy — never to an assumed status.

**Connections.** This topic is Chapter 4, Topic 12's portability limits and Topic 14's conformance tests, at the framework-composition layer. It uses the A2A transport (Topic 10) and the MCP/A2A layering (Topic 11). Its terminal-status discipline is Chapter 1, Topic 12 ($\kappa$) and Chapter 8, Topic 6 (aggregation); its typed-boundary discipline is Chapter 8, Topic 7; its own-the-log pattern is Chapter 4, Topic 4 and Chapter 7, Topic 3. The three universal gaps are Chapter 8, Topic 13. Topic 13 handles identity across the same boundary.

## Sources

[A2A] Google, "A2A: A new era of agent interoperability" — collaboration "regardless of vendor or framework" across "siloed systems and applications"; structured messages with "parts… discrete content units with specified content types"; built on "HTTP, SSE, JSON-RPC" (the standard *wire*, not the standard *semantics*) — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[OMA] OpenAI, multi-agent guide — the multi-agent feature is "GPT-5.6 models only (beta feature)" — even same-vendor composition has version constraints — https://developers.openai.com/api/docs/guides/responses-multi-agent
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) — channels as partial ("which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved"); the semantic-translation problem in the harness literature
