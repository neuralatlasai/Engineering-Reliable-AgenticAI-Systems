# Topic 3 — The Context Construction Pipeline: Acquire → Normalize → Rank → Compress → Assemble → Validate

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The interior of $\operatorname{Assemble}_{H_c}$, opened up as a six-stage compiler. This is the chapter's structural core: every other topic is either a *source* feeding this pipeline, a *stage* inside it, or a *measurement* of its output.

**Prerequisites.** Topic 1 (the budget the pipeline allocates); Topic 2 (the sources and their authority); Chapter 3, Topic 3 (the canonical loop, in which $\operatorname{Assemble}$ is one stage).

**Terminology.** *Pipeline*: the ordered transformation from sources to working context. *Normalization*: converting heterogeneous sources into one typed representation. *Assembly*: laying out the final token sequence, position included.

**Boundaries.** Inside: the stages, their contracts, their order, and why the order is forced. Outside: the internals of ranking (Topic 7), compression (Topic 11), and retrieval (Topic 5) — each is a stage here and a topic of its own.

**Exclusions.** No template-engine advocacy.

**Outcomes.** The reader can implement context assembly as an explicit, observable, testable compiler rather than as string concatenation scattered across a codebase.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** In most agent systems, context assembly is not a component. It is an emergent behavior of string concatenation spread across a dozen call sites: the system prompt is joined here, history is appended there, a retrieval result is interpolated somewhere else, tool definitions are added by the SDK. **Nobody can point at the code that decides what is in the window**, which means nobody can measure it, budget it, or debug it.

**Bottleneck.** Without a pipeline, none of the chapter's disciplines have a place to live. There is no stage at which to enforce the budget (Topic 1), apply the authority invariant (Topic 2), rank by density (Topic 7), or attribute the output (Topic 14). Every later topic presupposes this one.

**Objective.** Realize [GCA]'s thesis literally: **"Context is a compiled view over a richer stateful system."** Sources are inputs; the pipeline is a compiler; the working context is its output — an artifact that can be inspected, diffed, tested, and attributed.

**Assumptions.** Sources are heterogeneous (events, documents, files, tool results, instructions). The budget $B_{\mathrm{eff}}$ is fixed and binding.

**Constraints.** The pipeline runs on **every model call** — it is on the latency critical path, and an expensive pipeline is a slow agent.

**Success criteria.** The working context for any turn can be reproduced, explained, and attributed to its sources; the budget is enforced at one place; a pipeline change is a versioned, measurable configuration change (Chapter 1).

## 3. Intuition first, then formalization

### 3.1 Intuition: the window is compiled, not written

The mental model that fixes most context bugs is [GCA]'s: **the context window is not a buffer you write to. It is the output of a compilation.**

Under the buffer model, context is *mutated* — you append a message, you push a tool result, you tack on a document — and the window's contents are the accumulated history of those mutations. Nobody can say why a given token is present except by replaying every mutation.

Under the compiler model, the window is *derived* on every turn from durable sources by a pure function. [GCA] states the correspondence exactly: "Sessions and artifacts serve as sources; flows and processors function as the compiler pipeline; working context is the compiled output." The consequences are the ones you want from any compiler:

- **Reproducible.** Same sources, same pipeline version → same window.
- **Inspectable.** You can diff the output of two pipeline versions.
- **Attributable.** Every token traces to a source (Topic 14).
- **Testable.** The pipeline is a function; functions have unit tests.

[GCA]'s design advice follows directly and is worth adopting verbatim: "separate storage from presentation to enable independent evolution of schemas and prompt formats," and "make transformations explicit and observable rather than ad-hoc."

### 3.2 Formalization: the six stages and why the order is forced

$$
c_t \;=\; \operatorname{Validate}\circ\operatorname{Assemble}\circ\operatorname{Compress}\circ\operatorname{Rank}\circ\operatorname{Normalize}\circ\operatorname{Acquire}\ \bigl(\mathcal S,\ q_t\bigr)
$$

where $\mathcal S$ are the sources (Topic 2's seven) and $q_t$ is the turn's query/state. **[synthesis — the stage names are this book's; each stage corresponds to a documented operation, sourced in §5.]**

| Stage | Contract | Why here and not elsewhere |
|---|---|---|
| **Acquire** | $\mathcal S \to \{\text{raw units}\}$ — fetch from sessions, memory, artifacts, retrieval, tools | Must precede everything; it is the only stage that touches I/O |
| **Normalize** | raw → typed `ContextBlock`s with authority (Topic 2), provenance (Topic 6), tokens | **Must precede Rank**: you cannot rank heterogeneous types, and you cannot enforce authority on untyped strings |
| **Rank** | order by *signal density* w.r.t. $q_t$ (Topic 1, §6) | **Must precede Compress**: compression discards the tail, so the tail must be the *least valuable* first (Chapter 5, Topic 7's ranked-truncation argument) |
| **Compress** | reduce to fit $B_{\mathrm{eff}}$: truncate, summarize, compact (Topic 11), handle-ize (§4) | **Must precede Assemble**: assembly is layout, and you cannot lay out what does not fit |
| **Assemble** | order and delimit into the final token sequence — **position matters** (Topic 9) | Layout is a distinct concern from selection; conflating them is why lost-in-the-middle goes unaddressed |
| **Validate** | check invariants before the call | **Must be last**: it is the only stage that sees the actual $c_t$ |

**The ordering is not stylistic — three of the six adjacencies are forced by an invariant [derived]:**

$$
\textbf{P-1:}\quad \operatorname{Rank}\prec\operatorname{Compress}
\qquad\text{(compress drops the tail; the tail must be sorted to be droppable safely)}
$$
$$
\textbf{P-2:}\quad \operatorname{Normalize}\prec\operatorname{Rank}
\qquad\text{(authority and provenance must exist before selection uses them)}
$$
$$
\textbf{P-3:}\quad \operatorname{Assemble}\prec\operatorname{Validate}
\qquad\text{(the invariants are properties of the final sequence, not of its parts)}
$$

P-1 is the one systems violate most often: they truncate history *before* ranking it (dropping the oldest, which may be the most important), or they truncate a retrieved document to a token limit before deciding whether it was relevant at all. **Truncating unranked content is discarding a random sample** — Chapter 5, Topic 7's argument, now at pipeline scale.

### 3.3 The validation stage, which almost nobody builds

Validate is the stage teams omit, and it is the one that catches the chapter's silent failures. Its checks are cheap and each corresponds to a documented failure **[synthesis; each check's failure is sourced elsewhere in this chapter]**:

$$
\textbf{V-1:}\ \ \mathrm{tok}(c_t)\le B_{\mathrm{eff}}\quad\text{(Topic 1 — not } B^{\max}_{\mathrm{ctx}})
$$
$$
\textbf{V-2:}\ \ \text{every Category B block is wrapped and provenance-tagged}\quad\text{(Topic 2's H-1; Topic 8)}
$$
$$
\textbf{V-3:}\ \ \text{durable instructions are present}\quad\text{(survived compaction — Topic 11)}
$$
$$
\textbf{V-4:}\ \ \text{the cache prefix is byte-identical to last turn's}\quad\text{(Topic 10)}
$$
$$
\textbf{V-5:}\ \ \text{signal density}\ \ge\ \text{threshold}\quad\text{(Topic 1)}
$$

V-3 deserves emphasis. Compaction is documented to lose specific early instructions [CAL] (Chapter 3, Topic 4). **A validator that asserts the durable instructions are still present converts a silent, catastrophic loss into a caught error** — and it is perhaps ten lines of code.

## 4. Architecture

```
  SOURCES (Topic 2 · Chapter 7's stores)
  ┌────────────┬───────────┬──────────┬───────────┬──────────────┐
  │ system/dev │ session   │ memory   │ artifacts │ retrieval /  │
  │ repo/task  │ (events)  │          │           │ tool results │
  └─────┬──────┴─────┬─────┴────┬─────┴─────┬─────┴──────┬───────┘
        │            │          │           │            │
        ▼            ▼          ▼           ▼            ▼
  ┌──────────────────────────────────────────────────────────────┐
  │ 1. ACQUIRE      fetch. The only I/O stage. Parallelize here.  │
  ├──────────────────────────────────────────────────────────────┤
  │ 2. NORMALIZE    → ContextBlock{content, authority, provenance,│
  │                   tokens}.  Types exist from here on.  (P-2)  │
  ├──────────────────────────────────────────────────────────────┤
  │ 3. RANK         by signal density w.r.t. q_t.          (P-1)  │
  ├──────────────────────────────────────────────────────────────┤
  │ 4. COMPRESS     fit B_eff: drop tail · summarize · handle-ize │
  ├──────────────────────────────────────────────────────────────┤
  │ 5. ASSEMBLE     layout: stable prefix → ... → recency tail.   │
  │                 POSITION IS A DECISION (Topic 9).             │
  ├──────────────────────────────────────────────────────────────┤
  │ 6. VALIDATE     V-1..V-5. Fail closed.                 (P-3)  │
  └──────────────────────────────┬───────────────────────────────┘
                                 ▼
                          working context c_t  ──►  π_M
```

**Google's realization of this, as shipped.** [GCA] documents that ADK agents "backed by `LLMFlow` maintain ordered processor lists," and that the `contents` processor performs "three critical steps: selection (filters irrelevant events), transformation (flattens to `Content` objects), and injection (writes to `llm_request.contents`)." Selection is Rank; transformation is Normalize; injection is Assemble. **The pipeline is not a proposal — it is documented production architecture**, and this topic's contribution is naming the two stages ADK's `contents` processor leaves implicit: Compress and Validate.

**The handle pattern — Compress's most powerful move.** [GCA]: large payloads use "a 'handle pattern'—agents see lightweight references; raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion." This is Compress replacing content with a *pointer*, and it is exactly [ECE]'s just-in-time strategy ("maintain lightweight identifiers (file paths, stored queries, web links, etc.)") arriving at the same architecture from the other direction. A 50,000-token document becomes a 20-token reference plus a tool the model may call. **The pipeline's compression stage is where Chapter 5, Topic 8's data-path argument becomes a context decision.**

## 5. Grounding

- **The compiler thesis:** "Context is a compiled view over a richer stateful system"; "Sessions and artifacts serve as sources; flows and processors function as the compiler pipeline; working context is the compiled output" [GCA].
- **The shipped pipeline:** `LLMFlow` with "ordered processor lists"; the `contents` processor's "selection (filters irrelevant events), transformation (flattens to `Content` objects), and injection (writes to `llm_request.contents`)" [GCA].
- **The design principles:** "Separate storage from presentation to enable independent evolution of schemas and prompt formats"; "make transformations explicit and observable rather than ad-hoc"; "scope context by default" [GCA].
- **The handle pattern:** lightweight references with on-demand loading via `LoadArtifactsTool`, then offload [GCA].
- **Just-in-time acquisition:** "maintain lightweight identifiers (file paths, stored queries, web links, etc.) and use these references to dynamically load data into context at runtime using tools" [ECE].
- **The hybrid acquire strategy, as shipped:** "CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep allow it to navigate its environment and retrieve files just-in-time" [ECE] — i.e., Acquire has both an eager tier and a lazy tier, and the choice is per-source.
- **Compression as a first-class stage:** compaction [ECE; OCP]; "tool result clearing" as "one of the safest lightest touch forms of compaction" [ECE].
- **Ranked-before-truncated:** Chapter 5, Topic 7's argument, and [WTA]'s pagination/filtering/truncation guidance with "sensible default parameter values."
- **Harness-level corroboration:** the survey's account of context packing rules as a revisable harness component, and its list of what future harnesses need — "result sanitization, context compaction, state offloading, and reproducible traces" [CAH §3.3] — every one of which is a stage or a validator here.

**Evidence gap.** **No source specifies the six-stage decomposition or its ordering invariants.** [GCA] documents three of the stages as shipped (`selection`/`transformation`/`injection`) and names compaction and caching as separate mechanisms; this topic's contribution is to unify them into one ordered pipeline with forced adjacencies (P-1..P-3) and a validation stage (V-1..V-5). That unification is **[synthesis]**, and no source measures whether an explicit pipeline outperforms ad-hoc assembly — a real gap, since the claim is architectural rather than empirical.

## 6. Implementation

```python
@dataclass(frozen=True)
class ContextBlock:
    content: str
    authority: Authority          # Topic 2 — NONE for Category B
    provenance: Provenance        # Topic 6/14 — source, uri, observed_at, trust
    tokens: int                   # provider tokenizer, never an estimator [ANT-API]
    kind: Literal["instruction", "history", "tool_def", "evidence", "reasoning"]  # Topic 12

class ContextPipeline:
    """[GCA]: sources → compiler → compiled output. One place decides the window."""

    def build(self, sources: Sources, q: Query, budget: Budget) -> BuiltContext:
        raw     = self.acquire(sources, q)          # 1. I/O — parallelize
        blocks  = self.normalize(raw)               # 2. typed; authority + provenance (P-2)
        ranked  = self.rank(blocks, q)              # 3. by signal DENSITY        (P-1)
        fitted  = self.compress(ranked, budget)     # 4. drop tail / summarize / handle-ize
        window  = self.assemble(fitted)             # 5. layout — position matters (Topic 9)
        self.validate(window, budget)               # 6. V-1..V-5, fail closed    (P-3)
        return window

    def acquire(self, sources, q) -> list[Raw]:
        # [ECE]'s hybrid: eager for small stable sources, lazy for large ones.
        eager = sources.instructions() + sources.repo_files()      # CLAUDE.md up front
        lazy  = []                                                  # handles, not content
        for artifact in sources.artifacts():
            lazy.append(Handle(artifact.id, artifact.summary, tokens=20))   # [GCA]
        retrieved = sources.retrieve(q) if self.eager_retrieval else []      # Topic 5
        return eager + lazy + retrieved

    def compress(self, blocks, budget) -> list[ContextBlock]:
        kept, used = [], 0
        for b in blocks:                            # already ranked — the tail is droppable
            if used + b.tokens <= budget.eff:
                kept.append(b); used += b.tokens
            elif b.kind == "evidence" and b.tokens > HANDLE_THRESHOLD:
                h = to_handle(b)                    # [GCA] handle pattern: content → pointer
                if used + h.tokens <= budget.eff:
                    kept.append(h); used += h.tokens
        return kept
```

**The validator — the stage that earns its keep:**

```python
    def validate(self, w: BuiltContext, budget: Budget) -> None:
        assert w.tokens <= budget.eff, f"V-1: {w.tokens} > B_eff {budget.eff}"

        for b in w.blocks:                                                  # V-2
            if b.authority is Authority.NONE and not b.is_wrapped:
                raise ContextError(f"V-2: untrusted block from {b.provenance.source} "
                                   f"entered context unwrapped")

        for req in DURABLE_INSTRUCTIONS:                                    # V-3
            if req not in w.text:
                # Compaction is DOCUMENTED to lose early instructions [CAL].
                # This assertion turns a silent catastrophe into a caught error.
                raise ContextError(f"V-3: durable instruction {req!r} lost from context")

        if w.prefix_hash != self.last_prefix_hash:                          # V-4
            log.warning("V-4: cache prefix changed — full cache miss this turn (Topic 10)")
        self.last_prefix_hash = w.prefix_hash

        if w.signal_density < MIN_DENSITY:                                  # V-5
            log.warning(f"V-5: signal density {w.signal_density:.2f} — context rot risk")
```

**Pipeline versioning.** The pipeline is part of $H_c$ (Chapter 3): a change to it changes $c_t$ and therefore the policy. Hash it — stage list, ranker version, budget, prompt templates — and emit the hash into every trace $\hat\tau$ and every eval result, exactly as Chapter 5, Topic 1 did for the tool surface. **Without this, a ranker change and a model change are indistinguishable in your metrics.**

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Explicit pipeline | Reproducible, testable, attributable, budgetable | Real engineering; a component where there was none |
| Ad-hoc concatenation | Nothing you want | Unmeasurable, undebuggable, unbudgetable |
| Eager acquire | Low latency; predictable | Pays for context that may go unused |
| Lazy acquire (JIT) | High signal density; low tokens | **"Runtime exploration is slower than retrieving pre-computed data"** [ECE]; extra turns |
| Hybrid [ECE] | Best of both | Two code paths; the eager/lazy split is a design decision per source |
| Handle pattern [GCA] | Huge payloads for ~20 tokens | A tool round trip when the content is actually needed |
| Validation stage | Catches the silent failures | ~ms per turn; a few dozen lines |

**The trade [ECE] states plainly and this book will not soften.** Just-in-time retrieval is not free: "Runtime exploration is slower than retrieving pre-computed data," and it requires "opinionated and thoughtful engineering" to stop agents "wasting context by misusing tools, chasing dead-ends, or failing to identify key information." **JIT trades tokens for turns and for the risk that the agent explores badly.** The hybrid — eager for small, stable, always-needed sources (`CLAUDE.md`); lazy for large, conditional ones (artifacts, files) — is what [ECE] actually ships, and it is the honest default.

## 8. Experiments

**Pipeline-as-configuration ablation.** The pipeline is part of $H_c$, so a change to it is a configuration change with Chapter 3, Topic 14's evidentiary burden. Arms, paired on the same tasks:

| Arm | Change | Predicted signature |
|---|---|---|
| Baseline | Current assembly | — |
| Ranked-then-compressed | Enforce P-1 | Same tokens, **higher $G$** (the tail dropped was the right tail) |
| Unranked truncation | Violate P-1 deliberately | **Lower $G$ at identical tokens** — the cleanest proof P-1 matters |
| Handle pattern [GCA] | Large evidence → references | **Far fewer tokens**; $G$ non-inferior; +latency when fetched |
| Eager vs JIT acquire | [ECE]'s trade | JIT: fewer tokens, **more turns, higher latency** |

**The P-1 ablation is the one to run first**, because it is cheap, and because "we truncate the oldest history" is the most common pipeline in production and the most likely to be silently discarding signal.

**Validator effectiveness.** Deliberately inject the failures V-1..V-5 exist to catch (over-budget assembly; an unwrapped untrusted block; a compaction that drops a durable instruction; a prefix change). Measure detection rate. **V-3's detection rate should be 100%** — and if you have never tested it, you do not know whether your compaction is silently removing your safety instructions.

**Metrics.** The vector, always: task completion $G$, total tokens, latency, turns, signal density, cache-hit rate (Topic 10), and $\kappa$ distribution.

**Statistics.** Paired; McNemar on completion; task-clustered bootstrap; Holm across arms; predeclare the primary endpoint (Chapter 1, Topic 12). Record the **pipeline hash** with every result, or the numbers are not comparable across time.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **No pipeline at all.** Assembly scattered across call sites; nobody can say why a token is present. Mitigation: build the component. This is the topic's whole point.
- **Truncate-before-rank (P-1 violated).** Dropping the oldest history rather than the least relevant; discarding a random sample. **The single most common pipeline bug.** Mitigation: rank first.
- **Rank on untyped strings (P-2 violated).** Authority and provenance unavailable to the ranker, so an untrusted document can outrank an instruction. Mitigation: normalize first.
- **No validation stage (P-3 skipped).** Every silent failure in this chapter ships. Mitigation: V-1..V-5; fail closed.
- **Durable instructions lost to compaction.** Documented behavior [CAL], catastrophic, silent. Mitigation: **V-3**. This is the highest-value ten lines in the topic.
- **Budget checked against $B^{\max}_{\mathrm{ctx}}$ rather than $B_{\mathrm{eff}}$.** The request succeeds; the quality is quietly gone (Topic 1). Mitigation: V-1 against $B_{\mathrm{eff}}$.
- **Unstable prefix from pipeline nondeterminism.** A ranker that reorders stable blocks destroys the cache (Topic 10). Mitigation: V-4; stable sort; freeze the prefix.
- **Acquire on the critical path.** Serial I/O across five sources on every turn. Mitigation: parallelize Acquire; it is the only I/O stage, which is *why* it is isolated.
- **JIT exploration that goes wrong.** [ECE]'s named risk: agents "wasting context by misusing tools, chasing dead-ends, or failing to identify key information." Mitigation: the hybrid; bound exploration turns; measure turns as a first-class metric.
- **Edge case — sources that disagree.** Two retrieved documents contradict each other, or memory contradicts the session. The pipeline must not silently pick one; surface the conflict (Topic 8).
- **Open limitation.** **No source measures whether an explicit pipeline beats ad-hoc assembly.** The argument here is architectural — reproducibility, attributability, testability, budgetability — and those are real engineering goods, but the *performance* claim is untested. §8's P-1 ablation is the closest thing to a direct test, and it tests one invariant, not the architecture.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. "Context is a compiled view over a richer stateful system": sources → compiler → compiled output [GCA].
2. Production frameworks ship an ordered-processor pipeline whose `contents` processor performs selection, transformation, and injection [GCA].
3. The design principles are "separate storage from presentation" and "make transformations explicit and observable rather than ad-hoc" [GCA].
4. Large payloads should use the handle pattern: references in context, content on demand [GCA]; equivalently, "lightweight identifiers… to dynamically load data into context at runtime" [ECE].
5. Production systems use a **hybrid** acquire strategy — eager for `CLAUDE.md`, just-in-time via `glob`/`grep` for files [ECE].
6. JIT is slower than pre-computed retrieval and risks wasted exploration [ECE].
7. **The six-stage decomposition and its invariants are this book's synthesis**, unmeasured as an architecture.

**Decision rules.**
- **Rank before you compress.** Truncating unranked content discards a random sample.
- **Normalize before you rank.** A ranker that cannot see authority will let evidence outrank instructions.
- **Validate last, and fail closed.** V-3 alone justifies the stage.
- **Budget against $B_{\mathrm{eff}}$, not the API limit.**
- **Hash the pipeline** and put it in every trace and every eval result.
- **Hybrid acquire:** eager for small/stable/always-needed; handles and JIT for large/conditional.

**Production implications.**
1. Build the pipeline as one component with six named stages. Everything else in this chapter needs somewhere to live.
2. Add V-3 (durable-instruction survival) today — compaction is documented to lose instructions [CAL], and this is the assertion that catches it.
3. Run the P-1 ablation; "we drop the oldest history" is probably costing you completion at zero token savings.
4. Parallelize Acquire; it is the only I/O stage and it is on every turn's critical path.
5. Emit the pipeline hash into $\hat\tau$, or a ranker regression and a model regression will look identical.

**Connections.** Every topic in this chapter is a stage, a source, or a measurement of this pipeline: Topic 2 supplies Normalize's authority types; Topic 5 is Acquire's retrieval; Topics 6–7 are Rank's inputs and internals; Topic 8 is what Validate defends against; Topic 9 is why Assemble's *position* choices matter; Topic 10 constrains Assemble's prefix; Topic 11 is Compress's heavy machinery; Topic 12 is the budget Compress enforces; Topics 13–14 measure the whole. Chapter 3, Topic 3's canonical loop calls this pipeline once per turn; Chapter 7 owns the stores that Acquire reads.

## Sources

[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — **"Context is a compiled view over a richer stateful system"**; "Sessions and artifacts serve as sources; flows and processors function as the compiler pipeline; working context is the compiled output"; the four-tier model (Working Context / Session / Memory / Artifacts); `LLMFlow` ordered processor lists; the `contents` processor's "selection (filters irrelevant events), transformation (flattens to `Content` objects), and injection (writes to `llm_request.contents`)"; the handle pattern with `LoadArtifactsTool` ("agents see lightweight references; raw content loads only… on-demand, then offloads after completion"); context compaction over a sliding window; "separate storage from presentation"; "make transformations explicit and observable rather than ad-hoc"; "scope context by default" — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[ECE] Anthropic, "Effective context engineering for AI agents" — just-in-time retrieval with "lightweight identifiers (file paths, stored queries, web links, etc.)"; progressive disclosure; the hybrid strategy ("CLAUDE.md files are naively dropped into context up front, while primitives like glob and grep allow it to navigate its environment and retrieve files just-in-time"); "Runtime exploration is slower than retrieving pre-computed data" and the risk of "wasting context by misusing tools, chasing dead-ends, or failing to identify key information"; compaction; "tool result clearing" as "one of the safest lightest touch forms of compaction" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[CAL] Claude Agent SDK — compaction replacing older model-visible history with a summary, and the documented risk of losing specific early instructions — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3 — future harnesses requiring "result sanitization, context compaction, state offloading, and reproducible traces"; context packing rules as a revisable harness component
[ANT-API] Anthropic Claude API reference — `count_tokens`; third-party tokenizers undercount — platform.claude.com docs (cache 2026-06)
