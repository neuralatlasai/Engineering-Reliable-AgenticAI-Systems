# Chapter 6 — Context Engineering and Retrieval Architecture

## Scope, Prerequisites, Terminology, System Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter exists

Chapter 5 spent fifteen topics defending the context window — bounding tool definitions (Topic 6), bounding tool results (Topic 7), moving intermediates out of context entirely (Topic 8). It defended a resource without ever specifying how to *allocate* it. This chapter is that specification.

The premise is stated most sharply by the vendor that ships the largest agent product: **context engineering is "the set of strategies for curating and maintaining the optimal set of tokens (information) during LLM inference, including all the other information that may land there outside of the prompts"** [ECE]. The distinction from prompt engineering is not stylistic — it is about *when* the work happens. Prompt engineering optimizes a discrete instruction once. Context engineering manages an *accumulating* resource across a multi-turn loop, where "an agent running in a loop generates more and more data that could be relevant for the next turn of inference" [ECE].

The chapter's organizing claim, and the reason it is a chapter and not a section of Chapter 5: **the context window is a finite, dynamically allocated computational resource, and every token in it is spent from a depleting budget.** Two independently-sourced facts make this literal rather than metaphorical. First, **context rot**: "as token count increases, the model's ability to accurately recall information from that context decreases," a phenomenon that "emerges across all models despite varying degradation rates" [ECE]. Second, the architectural cause: transformers create "n² pairwise relationships for n tokens," producing "performance gradients rather than hard cliffs" [ECE]. The window does not fail at its limit; it *degrades continuously* from the first token, and the engineering job is to spend the budget where it buys the most.

Google's framing supplies the other half, and it is the structural insight the chapter is built on: **"Context is a compiled view over a richer stateful system"** rather than a mutable string buffer [GCA]. The window the model sees is the *output* of a pipeline, not a place you write to — sessions and artifacts are the sources, the assembly pipeline is the compiler, and the working context is what it emits.

## 2. Chapter scope

The unit of analysis is the **context assembly pipeline** — everything that determines which tokens occupy the window at each model call — and the **retrieval architecture** that feeds it. In Chapter 1's notation, this chapter is the interior of $c_t=\operatorname{Assemble}_{H_c}(\cdot)$: not *that* the harness assembles context (Chapter 3 established the stage) but *how* it decides what goes in.

Covered: context as a finite resource (Topic 1); the instruction hierarchy (Topic 2); the acquire→normalize→rank→compress→assemble→validate pipeline (Topic 3); the context type taxonomy (Topic 4); retrieval architectures — lexical, dense, hybrid, graph, tool-mediated (Topic 5); chunking and provenance (Topic 6); query transformation and multi-hop retrieval (Topic 7); the failure modes of retrieved context — poisoning, injection, staleness, authority confusion (Topic 8); the attention-degradation failures — lost-in-the-middle, dilution, saturation (Topic 9); prompt caching and prefix stability (Topic 10); compaction and reconstruction (Topic 11); context budgeting (Topic 12); retrieval and context ablations (Topic 13); and context observability (Topic 14).

## 3. Prerequisites

Chapters 1–5 in full. This chapter leans hardest on:

- **Chapter 1, Topic 12** — the notation and statistics contract; $c_t=\operatorname{Assemble}_{H_c}(\cdot)$ is the object this chapter opens up; every measurement here is bound by that contract.
- **Chapter 3, Topic 6** — control plane vs data plane; **CP-1 (data must not act as control)** is the spine of Topic 8, exactly as it was of Chapter 5, Topic 12.
- **Chapter 5, Topics 6–8** — the tool-surface half of the context budget; Topic 9 here is Chapter 5, Topic 15's saturation generalized from tool definitions to *all* context.
- **Chapter 4, Topic 11** — provider-managed vs application-managed state; Topic 11 here (compaction) is where provider compaction APIs and application strategy meet.

## 4. Terminology fixed for this chapter

| Term | Definition adopted | Source |
|---|---|---|
| **Context engineering** | Curating and maintaining "the optimal set of tokens (information) during LLM inference, including all the other information that may land there outside of the prompts" | [ECE] |
| **Context rot** | "As token count increases, the model's ability to accurately recall information from that context decreases" — across all models, varying rates | [ECE] |
| **Attention budget** | The model's finite capacity to attend, which "depletes with each token"; analogous to human working memory | [ECE] |
| **Context as compiled view** | "Context is a compiled view over a richer stateful system" — sources (sessions, artifacts) compiled by a pipeline into working context | [GCA] |
| **Working context** | "The immediate prompt for *this* model call": system instructions, agent identity, selected history, tool outputs, memory results, artifact references | [GCA] |
| **Just-in-time retrieval** | Maintaining "lightweight identifiers (file paths, stored queries, web links, etc.)" and using them "to dynamically load data into context at runtime using tools" | [ECE] |
| **Progressive disclosure** | Allowing "agents to incrementally discover relevant context through exploration" | [ECE]; [CXM] |
| **Compaction** | Taking "a conversation nearing the context window limit, summarizing its contents, and reinitiating a new context window with the summary" | [ECE]; [OCP] |
| **Structured note-taking** | The agent "regularly writes notes persisted to memory outside of the context window" and pulls them back later | [ECE] |
| **Handle pattern** | Large payloads represented by "lightweight references; raw content loads only via [a tool] on-demand, then offloads after completion" | [GCA] |

## 5. System boundary

**Inside:** the assembly pipeline (acquire, normalize, rank, compress, assemble, validate); the instruction hierarchy and its precedence; retrieval architecture and query transformation; chunking and provenance at ingestion; the failure modes specific to assembled context (poisoning, lost-in-the-middle, saturation); prompt-cache-aware assembly; compaction and note-taking as context-lifecycle operations; budgeting across the window's competing consumers; and the observability of what actually occupied the window.

**Outside:** the durable stores *behind* retrieval (Chapter 7 — memory, artifacts, knowledge persistence as systems; this chapter treats them as *sources* to the pipeline); the tool contracts that carry retrieval (Chapter 5 — this chapter consumes tool-mediated retrieval, Chapter 5 built the tools); the harness stage that *invokes* assembly (Chapter 3, Topic 3); multi-agent context partitioning as a *topology* (Chapters 8–9 — sub-agents appear here as a context-isolation technique, not as an orchestration pattern); and the model's context-length capability itself (Chapter 2).

The seam with Chapter 7 is the one readers most often blur, so it is drawn precisely: **this chapter owns the pipeline that decides what enters the window; Chapter 7 owns the durable systems the pipeline reads from and writes to.** Google's four-tier model makes the seam clean — Working Context is this chapter; Session, Memory, and Artifacts are Chapter 7's subject, appearing here only as sources [GCA].

## 6. Exclusions

- No embedding-model or vector-database product comparison; Topic 5 characterizes retrieval *architectures* by their recall and failure profiles, not by vendor.
- No RAG tutorial; retrieval appears as one context *source* among several, subordinate to the allocation problem.
- No memory-system design (Chapter 7); note-taking and compaction appear here as context-lifecycle operations, their durable substrate deferred.
- No general prompt-writing advice beyond the instruction hierarchy and the "right altitude" calibration that governs what belongs in the window at all.

## 7. Measurable outcomes for the reader

1. **Treat the window as a budget:** state the token allocation across instructions, history, tool definitions, evidence, and generated reasoning, and defend it against the attention-budget argument (Topics 1, 12).
2. **Build the assembly pipeline** as an explicit, observable compiler — acquire→normalize→rank→compress→assemble→validate — rather than an ad-hoc string concatenation (Topic 3).
3. **Choose a retrieval architecture** (lexical / dense / hybrid / graph / tool-mediated / just-in-time) from a measured recall, latency, and token-cost budget, and defend the choice (Topics 5, 13).
4. **Recognize and instrument the context failure modes** — poisoning and injection (Topic 8), lost-in-the-middle and saturation (Topic 9) — and detect each before production.
5. **Operate the context lifecycle:** prompt-cache-aware assembly (Topic 10), compaction and note-taking (Topic 11), with the provider mechanics correct.
6. **Measure the context system:** recall, utilization, faithfulness, latency, and token cost as *separate* quantities with intervals (Topic 13), and attribute the output to its sources (Topic 14).

## 8. Source ledger for this chapter

All previously established tags remain in force ([HB], [CAH], [HX], [AAR], [ALE], [FSC], [G56], [MEM], [BEA], [CAL], [DEM], [ANT-API], [OAG], [OAP], [OAT], [ADK], [ADK-A], [GIA], [CDX], [WTA], [CXM], [TS], [ADK-T], plus the statistics tags of Chapter 1, Topic 12). New in this chapter:

| Tag | Source | Provenance |
|---|---|---|
| [ECE] | Anthropic, "Effective context engineering for AI agents" | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| [OCP] | OpenAI, compaction guide (Responses API `context_management`, `compact_threshold`, `/responses/compact`) | https://developers.openai.com/api/docs/guides/compaction |
| [GCA] | Google, "Architecting an efficient, context-aware multi-agent framework for production" (ADK four-tier context model) | https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/ |
| [MEM] | Memory survey, arXiv:2512.13564 — invoked here for retrieval and context-source taxonomy, in depth in Chapter 7 | `Knowledge_source/2512.13564v2.pdf` |

**Evidence-quality note, stated plainly and enforced throughout.** As in Chapter 5, the strongest evidence here is *vendors reporting engineering practice on their own systems* [ECE; OCP; GCA], plus the memory survey [MEM] and the harness literature. Three disciplines follow:

1. **Context rot is a sourced qualitative claim without a public curve.** [ECE] states the *direction* ("recall decreases as tokens increase," "emerges across all models") and the *cause* ($n^2$ attention), but publishes **no threshold and no degradation rate** — indeed it explicitly notes "varying degradation rates." This chapter states the mechanism as sourced and the magnitude as unmeasured, exactly as Chapter 5 handled tool saturation, and hands the reader the experiment (Topic 13).
2. **Vendor figures carry their scope.** The sub-agent figures ("tens of thousands of tokens" explored, "1,000–2,000 tokens" returned) [ECE] are architectural estimates on Anthropic's own systems, not distributional claims. Compaction's "200,000 tokens" [OCP] is an example threshold, not a recommended optimum. [GCA] reports **no measured metrics at all** and says so.
3. **Every allocation rule is a hypothesis until ablated.** The context pipeline is the interior of $\operatorname{Assemble}_{H_c}$; a change to it changes $c_t$ and therefore the policy (Chapter 1). Topic 13 is the measurement discipline; the sources model it — [ECE]'s compaction guidance is itself an iterative "maximize recall, then improve precision" tuning loop.

**Notation and statistics contract:** Chapter 1, Topic 12 binds this chapter. The window at step $t$ is $c_t=\operatorname{Assemble}_{H_c}(\cdot)$; its token budget is a fixed $B_{\mathrm{ctx}}$ partitioned across consumers (Topic 12). Retrieval quality and context utilization are measured as vectors, never scalars (Topic 13). Syntheses beyond the sources are flagged **[synthesis]** or **[derived]** with assumptions stated; anything unmeasured is stated as unmeasured.

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
01 context as a finite resource              ── the premise
02 instruction hierarchy                    ──┐
03 construction pipeline                      ├─ how the window is built
04 context type taxonomy                      │
05 retrieval architecture                   ──┘
06 chunking & provenance                    ──┐
07 query transformation & multi-hop           ├─ feeding the pipeline
08 context poisoning & injection            ──┘
09 lost-in-the-middle & saturation            ── how the window fails
10 prompt caching & prefix stability        ──┐
11 compaction & reconstruction                ├─ the context lifecycle
12 context budgeting                        ──┘
13 retrieval & context ablations            ──┐
14 context observability                    ──┘ proving the system
```

Chapter 7 owns the durable stores this chapter's pipeline reads from and writes to; Chapter 8 composes the sub-agent context isolation of Topic 11 into orchestration patterns.

## 10. Notation and grounding contract

Chapter 1, Topic 12 binds this chapter. Working context is $c_t$; the assembly pipeline is the interior of $\operatorname{Assemble}_{H_c}$; the context budget $B_{\mathrm{ctx}}$ is partitioned across instructions, history, tool definitions ($\mathcal U_c$ from Chapter 5), retrieved evidence, and generated reasoning (Topic 12). Every claim carries a source tag; every synthesis is flagged **[synthesis]** or **[derived]** with assumptions stated; anything unmeasured — the context-rot curve above all — is stated as unmeasured rather than asserted with unearned confidence.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — context engineering vs prompt engineering; context rot ("as token count increases, the model's ability to accurately recall information from that context decreases," "emerges across all models despite varying degradation rates"); $n^2$ attention and "performance gradients rather than hard cliffs"; attention budget; the "Goldilocks zone" / "right altitude" system prompt; just-in-time retrieval with lightweight identifiers; progressive disclosure; compaction ("maximize recall… then iterate to improve precision"); tool-result clearing; structured note-taking (Claude plays Pokémon); sub-agent architectures ("tens of thousands of tokens," "1,000–2,000 tokens"); "the smallest set of high-signal tokens"; "do the simplest thing that works" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[OCP] OpenAI, compaction guide — server-side compaction at `compact_threshold`; standalone `/responses/compact`; `context_management`; encrypted/opaque compaction items; `store=false` ZDR; `previous_response_id` vs stateless-array chaining; example 200,000-token threshold; `gpt-5.3-codex`, `gpt-5.6` — https://developers.openai.com/api/docs/guides/compaction
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — the four-tier model (Working Context / Session / Memory / Artifacts); "Context is a compiled view over a richer stateful system"; sources→compiler→compiled-output; context compaction over a sliding window; context caching (stable prefix / variable suffix); artifact externalization / handle pattern (`LoadArtifactsTool`); reactive vs proactive memory recall; agents-as-tools vs agent-transfer; conversation reframing / narrative casting; `LLMFlow` contents processor (selection / transformation / injection); "scope context by default"; **no measured metrics reported** — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
