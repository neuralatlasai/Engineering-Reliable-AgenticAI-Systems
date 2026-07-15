# Topic 4 — Working Context, Retrieved Context, Episodic History, Durable Instructions, and External State

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The five context *types*, distinguished not by where they came from (Topic 2's authority axis) but by their **lifetime and their relationship to the window**. This is the taxonomy that decides what gets compacted, what gets externalized, and what must never be lost.

**Prerequisites.** Topic 1 (the budget); Topic 3 (the pipeline that materializes these types into $c_t$); Chapter 4, Topic 11 (provider- vs application-managed state).

**Terminology.** *Working context*: "the immediate prompt for *this* model call" [GCA]. *Retrieved context*: evidence fetched for this turn. *Episodic history*: the accumulating event log of the run. *Durable instructions*: directives that must survive every context operation. *External state*: content held outside the window, referenced by handle.

**Boundaries.** Inside: the taxonomy, each type's lifetime, and the invariants that govern transitions between them. Outside: the durable stores themselves (Chapter 7); the compaction machinery (Topic 11).

**Exclusions.** No memory-system architecture — Chapter 7 owns it. Here, memory is a *source type* with a lifetime.

**Outcomes.** The reader can classify every token in their window by type, and can state — for each type — what happens to it when the budget runs out.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** "Context" is one word for five things with incompatible lifetimes. The system prompt must persist forever. A tool result from turn 3 is probably dead by turn 30. A retrieved document is relevant to one query. A 200 MB artifact must never enter the window at all. Treating these uniformly — as "the conversation" — is why compaction destroys instructions, why stale evidence persists, and why large payloads blow the budget.

**Bottleneck.** Without a type distinction, the only available context operation is *truncation by position* (drop the oldest), which is orthogonal to *value* and therefore discards signal at random (Topic 3, P-1).

**Objective.** A taxonomy in which each type has a declared lifetime, a declared eviction policy, and a declared behavior under compaction — so that the pipeline's Compress stage (Topic 3) makes *typed* decisions rather than positional ones.

**Assumptions.** The window is finite (Topic 1) and will be exhausted in any long-running agent.

**Constraints.** Some types cannot be evicted (durable instructions). Some cannot be summarized without corruption (a patch, a config file — Chapter 5, Topic 7).

**Success criteria.** Every block in $c_t$ carries a type; eviction and compaction are type-aware; no durable instruction is ever lost (Topic 3's V-3).

## 3. Intuition first, then formalization

### 3.1 Intuition: storage versus presentation

The distinction that organizes the taxonomy is [GCA]'s architectural principle: **"separate storage from presentation."**

The window is *presentation* — a compiled view (Topic 3). The five types are really answers to two independent questions: **where does this live?** and **how long does it live?** Once separated, the confusions dissolve:

- **Durable instructions** live in configuration and appear in *every* view. Lifetime: the deployment.
- **Episodic history** lives in the session store and appears in *recent* views. Lifetime: the run — but its *representation* in the window degrades (raw → summarized → dropped).
- **Retrieved context** lives in a corpus and appears in *one* view. Lifetime: the turn. It is fetched *for* a query and is dead when the query is answered.
- **External state** lives outside and appears *never* — only its handle does [GCA]. Lifetime: unbounded, precisely *because* it is not in the window.
- **Working context** is the view itself. Lifetime: one model call.

The error the taxonomy prevents: **treating retrieved context as if it were episodic history.** A document fetched for turn 5's question sits in the conversation forever, consuming budget on turns 6 through 40, answering a question nobody is asking anymore. This is the single largest source of avoidable context bloat in RAG-style agents, and it is invisible because the document "is part of the conversation now."

### 3.2 Formalization: lifetime, and the eviction lattice

Assign each block a type $\rho$ and a **lifetime** $L(\rho)$ — the number of turns after which it has no expected value:

| Type $\rho$ | Lives in | $L(\rho)$ | Eviction policy | Compaction behavior |
|---|---|---|---|---|
| **Durable instruction** | Config / repo | $\infty$ | **Never** | **Must survive** — re-injected post-compaction |
| **Working context** | (the view) | 1 call | N/A — recompiled each turn | N/A |
| **Episodic history** | Session store | Decays | Oldest-first *after ranking* | Summarized [ECE; OCP; GCA] |
| **Retrieved context** | Corpus | ~1 turn | **Evict when the query is answered** | Drop, do not summarize |
| **External state** | Artifact store | $\infty$ (outside) | Never in-window | Handle persists; content never enters |

**[synthesis — the taxonomy is ours; each row's mechanism is sourced in §5.]**

Two invariants govern the transitions **[derived]**:

$$
\textbf{T-1 (durability):}\qquad
\rho=\text{durable}\ \Longrightarrow\ \text{present in } c_t\ \ \forall t .
$$

This is not a preference. Compaction is *documented* to lose early instructions [CAL], so T-1 must be enforced by **re-injection after every compaction**, not by hoping the summarizer kept them. Topic 3's V-3 validator is T-1's enforcement.

$$
\textbf{T-2 (retrieval is not history):}\qquad
\rho=\text{retrieved}\ \wedge\ \text{query answered}\ \Longrightarrow\ \text{evict}.
$$

Retrieved evidence is *for a query*. Once the query is resolved, its expected future value is near zero and its token cost is undiminished. **The default in most systems is to keep it forever**, which is the T-2 violation and the bloat source of §3.1. [ECE]'s "tool result clearing" — "one of the safest lightest touch forms of compaction" — is T-2, shipped.

### 3.3 The externalization decision

The most consequential type decision is **what never enters the window at all.** [GCA]'s handle pattern and [ECE]'s just-in-time identifiers are the same move: replace content with a reference.

$$
\text{externalize}(\upsilon)\quad\text{iff}\quad
\mathrm{tok}(\upsilon)\ \gg\ \mathrm{tok}(\text{handle})
\ \ \wedge\ \
\Pr(\upsilon\ \text{needed this turn}) < 1 .
$$

**[derived]** Both conditions matter. A large payload that is *certainly* needed should be fetched (the handle just adds a round trip). A small payload should be inlined regardless. The externalization win is for **large, conditionally-needed** content — which describes nearly every artifact, file, and large tool result in a real system.

The deep version of this argument is Chapter 5, Topic 8's: intermediates that pass *between* tools should never traverse the window at all [CXM]. External state is that principle at the context layer — **the model needs to know a thing exists and how to get it, not what it contains.**

## 4. Architecture

```
   ┌──── DURABLE ────────────────────────────────────────────────────┐
   │ system prompt · developer config · CLAUDE.md · policy            │
   │ L = ∞.  Re-injected after EVERY compaction (T-1).  V-3 asserts.  │
   └──────────────────────────────────────────────────────────────────┘
   ┌──── EPISODIC HISTORY (session store) ────────────────────────────┐
   │ turn 1 ... turn t.  Representation DEGRADES with age:            │
   │   recent: raw  →  older: summarized  →  oldest: dropped          │
   │ [GCA]: "summarize older events over a sliding window", write      │
   │        summaries back as new Session events, prune raw            │
   └──────────────────────────────────────────────────────────────────┘
   ┌──── RETRIEVED (corpus) ──────────────────────────────────────────┐
   │ fetched for THIS query.  L ≈ 1 turn.                             │
   │ T-2: EVICT when answered.  ("tool result clearing" [ECE])        │
   └──────────────────────────────────────────────────────────────────┘
   ┌──── EXTERNAL STATE (artifact store) ─────────────────────────────┐
   │ IN WINDOW:  handle{id, summary, ~20 tok}          [GCA]          │
   │ OUT:        the 50,000-token document                            │
   │ Loaded on demand via LoadArtifactsTool; offloaded after use      │
   └──────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼  compiled by Topic 3's pipeline
                       ┌───────────────────────┐
                       │  WORKING CONTEXT c_t  │  L = 1 model call
                       └───────────────────────┘
```

**Google's four tiers, mapped.** [GCA] names exactly four: Working Context ("the immediate prompt for *this* model call" — system instructions, agent identity, selected history, tool outputs, optional memory results, artifact references), Session ("the durable log of the interaction" — every message, tool call, result, control signal, and error as structured Event objects), Memory ("long-lived, searchable knowledge that outlives a single session"), and Artifacts ("large binary or textual data associated with the session or user"). This topic's five types are that model plus one split: **[GCA]'s Working Context contains both durable instructions and retrieved evidence, and they have opposite lifetimes** — so the taxonomy separates them, because Compress must treat them oppositely.

**Memory's two access modes, which the taxonomy must accommodate.** [GCA] documents "reactive recall (agent-initiated `load_memory_tool` calls)" and "proactive recall (system pre-processor injects likely relevant snippets before invocation)." Reactive memory is *retrieved context* (fetched on demand, evictable). Proactive memory is closer to *durable* (injected every turn, permanent rent). **The same store yields different context types depending on the access mode**, and the budget consequence is large: proactive recall is rent, reactive recall is a purchase.

## 5. Grounding

- **The four-tier model:** Working Context / Session / Memory / Artifacts, with Working Context as "the immediate prompt for *this* model call" containing "system instructions, agent identity, selected history, tool outputs, optional memory results, and artifact references" [GCA].
- **Session as durable log:** "the durable log of the interaction," capturing "every user message, agent reply, tool call, result, control signal, and error as structured Event objects" [GCA].
- **Memory:** "long-lived, searchable knowledge that outlives a single session," with reactive (`load_memory_tool`) and proactive (pre-processor injection) recall [GCA].
- **Artifacts and the handle pattern:** "large binary or textual data"; agents see "lightweight references; raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion" [GCA].
- **History degradation by summarization:** compaction "summarize[s] older events over a sliding window" and "writes summaries back as new Session events," allowing "pruning of raw events" [GCA]. Note the architecture: the summary becomes a *new event in the source*, not a mutation of the window — Topic 3's compiler thesis, upheld.
- **Retrieved-context eviction:** "tool result clearing" as "one of the safest lightest touch forms of compaction" [ECE] — T-2, named and endorsed.
- **Just-in-time identifiers:** "maintain lightweight identifiers (file paths, stored queries, web links, etc.) and use these references to dynamically load data into context at runtime using tools" [ECE].
- **Structured note-taking as a type:** the agent "regularly writes notes persisted to memory outside of the context window. These notes get pulled back into the context window at later times," providing "persistent memory with minimal overhead"; demonstrated by Claude playing Pokémon, which "maintains precise tallies across thousands of game steps" and, "after context resets… reads its own notes and continues multi-hour training sequences" [ECE]. **This is agent-authored durable state** — a sixth type in spirit, and Chapter 7's subject.
- **Durable instructions are lost by compaction:** documented [CAL] (Chapter 3, Topic 4) — the evidentiary basis for T-1's re-injection requirement.
- **The memory survey** [MEM] supplies the broader taxonomy of memory types this chapter borrows from and Chapter 7 develops.

**Evidence gap.** [GCA] reports **no measured metrics at all** — it is an architecture document, and this chapter says so rather than implying its recommendations are validated. The lifetimes in §3.2's table are *design assignments*, not measured decay curves: **nobody has published how the expected value of a turn-$j$ tool result actually decays with $t-j$.** That decay curve would tell you exactly when to evict, and §8 is how you approximate it locally.

## 6. Implementation

```python
class ContextType(Enum):
    DURABLE   = "durable"      # L = ∞; must survive compaction (T-1)
    EPISODIC  = "episodic"     # decays: raw → summarized → dropped
    RETRIEVED = "retrieved"    # L ≈ 1 turn; EVICT when answered (T-2)
    EXTERNAL  = "external"     # never in-window; handle only
    # WORKING is the compiled view itself, not a block type.

@dataclass(frozen=True)
class TypedBlock(ContextBlock):
    ctype: ContextType
    born_at_turn: int
    query_id: str | None = None       # for RETRIEVED: which query fetched this
```

**Type-aware compression — the payoff of the taxonomy:**

```python
def compress_typed(blocks: list[TypedBlock], budget, turn, resolved_queries) -> list:
    keep = []

    # T-1: durable blocks are never candidates for eviction. Reserved first.
    durable = [b for b in blocks if b.ctype is ContextType.DURABLE]
    keep.extend(durable)
    remaining = budget.eff - sum(b.tokens for b in durable)

    # T-2: retrieved evidence whose query is answered is DEAD. Evict, don't summarize.
    live = [b for b in blocks if not (
        b.ctype is ContextType.RETRIEVED and b.query_id in resolved_queries
    ) and b.ctype is not ContextType.DURABLE]

    # External state never carries content — only handles [GCA].
    live = [to_handle(b) if b.ctype is ContextType.EXTERNAL else b for b in live]

    # Episodic history degrades by AGE, but only after ranking (Topic 3, P-1).
    for b in rank_by_density(live):
        if b.tokens <= remaining:
            keep.append(b); remaining -= b.tokens
        elif b.ctype is ContextType.EPISODIC:
            s = summarize(b)                      # degrade representation, keep the event
            if s.tokens <= remaining:
                keep.append(s); remaining -= s.tokens
    return keep
```

The three type-specific behaviors are the whole point: **durable is reserved, retrieved is evicted, episodic is degraded.** A positional truncation cannot express any of them.

**T-1 enforcement, since compaction is documented to violate it:**

```python
def after_compaction(window, durable_blocks) -> BuiltContext:
    """[CAL]: compaction can lose specific early instructions. Do not trust the summary
    to have kept them — RE-INJECT, then assert (Topic 3, V-3)."""
    for b in durable_blocks:
        if b.content not in window.text:
            window = window.prepend(b)            # re-inject, do not hope
    assert all(b.content in window.text for b in durable_blocks), "T-1 violated"
    return window
```

**The proactive/reactive memory decision, priced:**

```python
def memory_access_mode(store, query, budget) -> Literal["proactive", "reactive"]:
    """[GCA] offers both. They have OPPOSITE budget profiles:
       proactive = injected every turn      → RENT   (Topic 2, H-2)
       reactive  = fetched on demand        → PURCHASE
    Proactive is right only when the snippet is needed on most turns."""
    hit_rate = store.historical_relevance(query.kind)
    return "proactive" if hit_rate > PROACTIVE_THRESHOLD else "reactive"
```

## 7. Trade-offs

| Type decision | Buys | Costs |
|---|---|---|
| Durable (permanent) | Guaranteed presence | **Rent every turn** (Topic 2, H-2) |
| Episodic raw | Full fidelity; exact quotes | Grows without bound |
| Episodic summarized | Bounded growth | **Fidelity loss**; [CAL]'s documented instruction loss |
| Retrieved, evicted (T-2) | Budget reclaimed | Refetch if the query recurs |
| Retrieved, retained | No refetch | **The bloat source of §3.1** |
| External + handle [GCA] | 50k tokens → ~20 | A tool round trip when needed; the model must decide to fetch |
| Proactive memory [GCA] | Always there when relevant | Rent on every turn, including the many where it is not |
| Reactive memory [GCA] | Pay only when used | An extra turn; the model must know to ask |

**The trade that decides your architecture.** Proactive-vs-reactive is the taxonomy's sharpest fork, and it is the same fork as eager-vs-JIT (Topic 3) and all-loaded-vs-deferred (Chapter 5, Topic 6). **Every one of them is: pay rent for certainty, or pay a round trip for economy.** The answer is always the same shape — rent is right when the hit rate is high, round trips are right when it is low — and the mistake is always the same: **defaulting to rent because it is simpler, and never measuring the hit rate.**

## 8. Experiments

**The decay curve — the measurement nobody has published.** For episodic blocks, measure the *expected value* of a turn-$j$ tool result at turn $t$: ablate it (remove it from context at turn $t$) and measure the change in task completion. Sweep $t-j$.

- **Output:** an empirical $L(\text{episodic})$ — the age at which a tool result stops paying its rent.
- **Why it matters:** this number is your eviction threshold, and today it is set by folklore ("keep the last 10 turns").
- **Prediction to falsify:** the decay is *fast* for tool results and *slow* for the user's original task statement — which is why type-blind positional truncation is wrong.

**T-2 ablation — the cheapest win in the topic.** Arms: (a) retain retrieved evidence forever; (b) evict on query resolution ("tool result clearing" [ECE]). Metrics: tokens, $G$, refetch rate, latency. **Prediction: substantially fewer tokens at non-inferior $G$.** If $G$ drops, some queries were not actually resolved and your resolution detector is wrong — a finding.

**T-1 test — the safety one.** Force compaction; assert every durable instruction survives. **Detection rate must be 100%.** [CAL] documents that compaction loses early instructions, so a system that has never tested this does not know whether its safety instructions are still in the window at turn 40.

**Externalization ablation.** Large evidence inline vs. handle [GCA]. Metrics: tokens, $G$, **fetch rate** (how often the model actually pulls the content), latency. If fetch rate is near 1, the handle is pure overhead and the content should be inlined — the $\Pr(\text{needed})<1$ condition of §3.3, measured.

**Proactive-vs-reactive memory.** Measure the *hit rate* of proactively-injected snippets: what fraction of turns actually used them? A low hit rate means you are paying rent on every turn for a rare benefit; switch to reactive.

**Statistics.** Paired; task-clustered bootstrap; non-inferiority margins predeclared for the eviction arms (you are claiming "no worse, much cheaper," which is a non-inferiority claim, not a superiority one — Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Retrieved context treated as history.** Documents from turn 5 riding along to turn 40. **The largest avoidable bloat in RAG agents.** Mitigation: T-2; tool-result clearing [ECE].
- **Durable instructions lost to compaction.** Documented [CAL]; silent; catastrophic. Mitigation: T-1 re-injection + V-3 assertion. **Never trust the summarizer to have kept them.**
- **Positional truncation.** "Drop the oldest" ignores type entirely: it will drop the task statement before it drops a stale tool result. Mitigation: type-aware compression (§6).
- **Summarizing what must not be summarized.** A patch, a config, an ID list — lossy compression corrupts them (Chapter 5, Topic 7). Mitigation: mark such blocks EXTERNAL and handle-ize; never summarize exact-fidelity content.
- **Proactive memory as default.** Rent paid on every turn for snippets used on few. Mitigation: measure hit rate; switch to reactive below threshold.
- **Handles the model never fetches.** The content was needed and the model did not know to ask. Mitigation: the handle's *summary* must carry enough signal to trigger the fetch — this is Chapter 5, Topic 4's affordance problem, applied to artifacts.
- **Unbounded session growth.** The session store is the durable log [GCA] and grows forever, even when the *window* is bounded. Mitigation: that is Chapter 7's problem, and it is a real one — bounded context does not imply bounded storage.
- **Edge case — the summary that becomes the source.** [GCA] writes summaries "back as new Session events." The summary is now *evidence* in the log, and a later summarization will summarize the summary. **Compounding fidelity loss.** Mitigation: retain originals; mark summaries as derived; never summarize a summary (Topic 11).
- **Open limitation.** **The decay curve $L(\rho)$ is unmeasured in the public literature.** Every eviction threshold in every production agent is folklore. §8's first experiment is how you replace folklore with a number, and no source will hand it to you.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Production architecture separates four tiers: Working Context, Session, Memory, Artifacts [GCA].
2. Working context is "the immediate prompt for *this* model call" and is *compiled*, not accumulated [GCA].
3. Large payloads use handles; content loads on demand and offloads after [GCA].
4. History degrades by sliding-window summarization, with summaries written back as new events and raw events pruned [GCA].
5. Memory has reactive and proactive recall modes with opposite budget profiles [GCA].
6. "Tool result clearing" is "one of the safest lightest touch forms of compaction" [ECE] — retrieved context is evictable.
7. Agents can maintain durable state by writing notes outside the window and reading them back after resets [ECE].
8. Compaction is documented to lose early instructions [CAL].
9. **[GCA] reports no measured metrics**; the lifetimes here are design assignments, not measured decay curves.

**Decision rules.**
- **Durable instructions are re-injected after compaction, then asserted.** Never trusted to the summarizer.
- **Retrieved evidence is evicted when its query is answered.** It is not conversation.
- **Large + conditionally-needed ⇒ externalize** (§3.3). Large + always-needed ⇒ inline.
- **Proactive memory only above a measured hit rate.** Otherwise it is rent.
- **Never summarize exact-fidelity content**, and never summarize a summary.

**Production implications.**
1. Type every block. Positional truncation cannot be fixed; it must be replaced.
2. Add T-1 re-injection and V-3 assertion today — [CAL] says the failure is real and it is silent.
3. Ship T-2 (tool-result clearing); it is [ECE]-endorsed, cheap, and usually the biggest single token win available.
4. Measure the decay curve (§8) and replace your "keep last N turns" folklore with a number.
5. Measure proactive-memory hit rate before paying its rent.

**Connections.** Topic 3's Compress stage is where this taxonomy executes; Topic 11's compaction is how EPISODIC degrades; Topic 12 budgets across these types; Topic 10's cache prefix is exactly the DURABLE tier. Chapter 5, Topic 8's data-path argument is EXTERNAL state's deep justification. **Chapter 7 owns the stores behind Session, Memory, and Artifacts** — this topic is the last time they appear as mere sources.

## Sources

[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — the four-tier model: Working Context ("the immediate prompt for *this* model call": system instructions, agent identity, selected history, tool outputs, optional memory results, artifact references), Session ("the durable log of the interaction"… "every user message, agent reply, tool call, result, control signal, and error as structured Event objects"), Memory ("long-lived, searchable knowledge that outlives a single session"), Artifacts ("large binary or textual data associated with the session or user"); context compaction summarizing "older events over a sliding window," writing summaries "back as new Session events," pruning raw events; the handle pattern with `LoadArtifactsTool`; reactive (`load_memory_tool`) vs proactive (pre-processor injection) recall; "separate storage from presentation"; **no measured performance metrics reported** — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[ECE] Anthropic, "Effective context engineering for AI agents" — "tool result clearing" as "one of the safest lightest touch forms of compaction"; just-in-time "lightweight identifiers (file paths, stored queries, web links, etc.)"; structured note-taking ("the agent regularly writes notes persisted to memory outside of the context window… pulled back into the context window at later times"; "persistent memory with minimal overhead"); Claude playing Pokémon maintaining "precise tallies across thousands of game steps" and, "after context resets," reading "its own notes" to continue "multi-hour training sequences" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[CAL] Claude Agent SDK — compaction replacing older model-visible history with a summary; the documented loss of specific early instructions — https://code.claude.com/docs/en/agent-sdk/agent-loop
[OCP] OpenAI, compaction guide — compaction items as opaque, non-human-interpretable records that carry forward preserved state — https://developers.openai.com/api/docs/guides/compaction
[MEM] Memory in AI agents survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — memory-type taxonomy; developed in Chapter 7
