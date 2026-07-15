# Topic 10 — Artifact Lifecycle: Files, Reports, Code Patches, Datasets, Checkpoints, and Binary Outputs

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Artifacts — the durable *products* an agent run makes: files, reports, code patches, datasets, checkpoints, binaries. Distinguished from memory (what the agent learned) and state (where the task is) by being *outputs*, and distinguished from context by being too large or too binary to live in the window.

**Prerequisites.** Topic 1 (artifacts are authoritative, durable products; the handle pattern); Chapter 6, Topic 4 (external state / the handle pattern — the presentation-side view); Chapter 5, Topic 8 (data-path control — artifacts should not traverse the window).

**Terminology.** *Artifact*: "large binary or textual data associated with the session or user" [GCA]. *Handle*: a lightweight reference standing in for the artifact in context [GCA]. *Lifecycle*: create → reference → version → retain → delete.

**Boundaries.** Inside: the artifact lifecycle, the handle pattern, and artifact-specific governance. Outside: versioning *independently from conversation* (Topic 11 — the next topic); repository artifacts (`CLAUDE.md`, skills — Topic 12); artifact retention/deletion (Topic 14).

**Exclusions.** No object-storage product survey.

**Outcomes.** The reader can manage artifacts through their lifecycle — created by the run, referenced by handle, versioned, retained, and deleted — without ever cramming a large product into the context window.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Agents produce outputs that are too large, too binary, or too durable to be context or memory: a 200-page report, a 50-file code patch, a 2 GB dataset, a model checkpoint, a generated image. These are *products* — the point of the run, often — and they have a lifecycle distinct from the conversation that made them: they outlive the session, they get versioned, they are retained and deleted on their own schedule, and they must never enter the window whole.

**Bottleneck.** Artifacts are frequently mishandled in two directions. **Crammed into context:** a generated report or a large file stuffed into the window, blowing the budget (Chapter 6, Topic 1) — the classic artifact-as-context category error (Topic 1). **Lost as ephemera:** an artifact treated as disposable session state, discarded at session end, when it was the run's deliverable. The bottleneck is that artifacts have neither memory's semantics (they are not learned facts) nor context's ephemerality (they persist) nor state's scope (they outlive the session) — they need their own lifecycle, and without it they are either bloating the window or being thrown away.

**Objective.** An artifact lifecycle where products are stored externally, referenced in context by handle, versioned independently (Topic 11), retained and governed (Topic 14), and loaded into context only on demand.

**Assumptions.** Artifacts are large and/or binary and/or durable. The context window cannot and should not hold them.

**Constraints.** Some artifacts are needed *by the agent* mid-run (a patch it is editing); the handle pattern must support on-demand loading. Some artifacts are binary and cannot be summarized (Chapter 5, Topic 7).

**Success criteria.** No artifact enters the window whole; every artifact is referenced by a durable handle; artifacts are versioned, retained, and deletable on their own lifecycle.

## 3. Intuition first, then formalization

### 3.1 Intuition: the artifact is the product; the handle is its address

The reframe: **an artifact is the run's *output*, and the model needs to know it *exists* and how to *reach* it — not what it *contains*, byte for byte, in the window.** [GCA]'s handle pattern states this exactly: "agents see lightweight references; raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion" [GCA].

This is Chapter 5, Topic 8's data-path argument (intermediates stay out of context) and Chapter 6, Topic 4's external-state type (handle in context, content outside), arriving at the *product* layer. The intuition: a 200-page report the agent generated does not belong in the window any more than the raw database it queried does. The agent generated it, it lives in artifact storage, and the *handle* — an ID, a summary, a location — is what occupies context.

The artifact lifecycle, five stages **[synthesis; grounded in [GCA]]**:

- **Create** — the run produces the artifact (writes the report, generates the patch, builds the dataset). It goes to artifact storage, not to context.
- **Reference** — a handle (ID + summary + location) enters context [GCA]. The agent can reason about the artifact's existence and reach it.
- **Version** — the artifact changes independently of the conversation (Topic 11): a patch is revised, a report re-generated. Each version is durable.
- **Retain** — the artifact persists on its own schedule ("associated with the session or user" [GCA]), governed by retention policy (Topic 14).
- **Delete** — the artifact is removed when its retention lapses or on request (Topic 14).

The intuition that governs it: **the artifact's lifecycle is decoupled from the conversation's.** A conversation ends; its artifacts persist. A conversation is compacted (Chapter 6, Topic 11); its artifacts are untouched. **Artifacts are not conversation state — they are durable products with their own lifecycle, and conflating the two either bloats the conversation with products or discards products with the conversation.**

### 3.2 Formalization: the handle and the offload invariant

An artifact $a$ has content (large/binary), a handle $h(a) = (\text{id}, \text{summary}, \text{location}, \text{version})$, and a lifecycle. The invariants **[synthesis; grounded in [GCA], Chapter 5, Topic 8]**:

$$
\textbf{A-1 (content stays external):}\quad
\mathrm{tok}(a)\ \text{never enters } c_t;\ \text{only } h(a)\ \text{does, with } \mathrm{tok}(h(a))\ll\mathrm{tok}(a).
$$

A-1 is the handle pattern as an invariant: the artifact's content is never in the window; the handle is. A 50,000-token report becomes a ~20-token handle (Chapter 6, Topic 4). **The context cost of an artifact is the handle's cost, independent of the artifact's size** — which is the entire point.

$$
\textbf{A-2 (load on demand, offload after):}\quad
\text{content enters context only when the agent explicitly loads it (via a tool),}\ \text{and offloads after use [GCA].}
$$

A-2 is [GCA]'s "raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion." The artifact can be brought into context *when the agent needs to work on it* (edit the patch, read a section of the report), but it does not *stay* — it offloads, freeing the budget. This is Chapter 6, Topic 4's handle-vs-inline decision, made a lifecycle rule: default to the handle, load on demand, offload after.

$$
\textbf{A-3 (lifecycle decoupled from conversation):}\quad
\text{an artifact's create/version/retain/delete schedule is independent of the session's.}
$$

A-3 is the decoupling: the artifact outlives the session, versions independently (Topic 11), and is governed independently (Topic 14). **A conversation ending does not delete its artifacts; a conversation compacting does not touch them.**

### 3.3 Artifacts are not summarizable — the handle is the only safe compression

A critical property that distinguishes artifacts from memory and history: **many artifacts cannot be summarized without corruption.** A code patch, a dataset, a checkpoint, a binary — these must be preserved *exactly* (Chapter 5, Topic 7's exact-fidelity content). You cannot compact a patch the way you compact a conversation; a summarized patch is a broken patch.

This makes the handle pattern not just an optimization but a *correctness requirement* for artifacts **[synthesis]**:

$$
\text{artifact } a\ \text{is exact-fidelity}\ \Longrightarrow\ \text{the ONLY safe context representation is a handle};\ \text{summarization corrupts it.}
$$

The failure this prevents: an agent that "compacts" its context (Chapter 6, Topic 11) and, in doing so, lossily summarizes a code patch it was holding — producing a patch that no longer applies. **Artifacts must be handles precisely because they cannot survive the compression that conversation history tolerates.** The handle points to the exact artifact in storage; the compression is of the *reference*, not the *content*, and a reference compresses losslessly (it is already tiny).

## 4. Architecture

```
   RUN produces an artifact (report, patch, dataset, checkpoint, binary)
        │
        ▼  CREATE — to artifact storage, NOT to context (A-1)
   ┌────────────────────────────────────────────────────────────────┐
   │ ARTIFACT STORAGE (external, durable)                            │
   │   report_v3.pdf   patch_4471.diff   dataset_88.parquet          │
   │   checkpoint_12   image_331.png                                 │
   │   ← versioned (Topic 11) · retained (Topic 14) · exact-fidelity  │
   └───────────────────────────┬────────────────────────────────────┘
                               │  REFERENCE — handle enters context (A-1)
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │ CONTEXT (Chapter 6): handle only                                │
   │   { id: patch_4471, summary: "fixes auth bug in login.ts",      │
   │     location: ..., version: 3 }   ~20 tokens                    │
   └───────────────────────────┬────────────────────────────────────┘
                               │  LOAD ON DEMAND (A-2) [GCA LoadArtifactsTool]
                               ▼  when the agent must WORK on it
                       content in context (temporarily)
                               │  OFFLOAD after use (A-2)
                               ▼
                       back to handle-only

   LIFECYCLE DECOUPLED (A-3): session ends → artifacts persist.
                             session compacts → artifacts untouched.
   EXACT-FIDELITY (§3.3): handle is the ONLY safe representation;
                          summarization corrupts patches/datasets/binaries.
```

**The handle's summary is an affordance problem (Chapter 5, Topic 4).** The handle carries a *summary* so the agent knows whether to load the artifact — and if the summary is uninformative ("a file"), the agent cannot tell when it needs the content, so it either never loads a needed artifact or always loads to check (defeating the pattern). **The handle summary must carry enough signal to trigger the load decision** — "fixes the auth bug in login.ts" tells the agent when this patch is relevant; "patch_4471" does not. This is Chapter 6, Topic 4's "handle the model never fetches" failure, and the fix is the same: the summary is a policy input, and it must afford the load decision.

## 5. Grounding

- **Artifacts, defined and handled:** "large binary or textual data associated with the session or user (files, logs, images)"; the handle pattern — "agents see lightweight references; raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion" [GCA]. A-1, A-2, and the artifact tier, shipped.
- **Artifacts are a distinct tier:** [GCA]'s four-tier model separates Artifacts from Working Context, Session, and Memory — A-3's decoupling is the tier separation.
- **The handle pattern is the external-state type:** Chapter 6, Topic 4 (external state — handle in context, content outside; the $\Pr(\text{needed})<1$ externalization condition) — the presentation-side view of A-1/A-2.
- **The data-path argument:** Chapter 5, Topic 8 (intermediates stay in the execution environment; "the agent only sees what you explicitly log or return" [CXM]) — the deep justification for A-1: products, like intermediates, should not traverse the window.
- **Exact-fidelity content cannot be summarized:** Chapter 5, Topic 7 (a patch, a config, an ID list corrupted by lossy compression) and Chapter 6, Topic 4 ("never summarize exact-fidelity content") — §3.3.
- **Artifacts as durable products the run makes:** [ECE]'s note that agents write intermediate results to files and create reusable skill modules ("`./skills/`") [ECE; CXM] — agent-produced durable artifacts (skills are Topic 12).
- **Checkpoints as artifacts:** Chapter 3, Topic 9 (checkpoint/resume) and Chapter 10 (long-running agents) — a checkpoint is an artifact (a durable, exact-fidelity snapshot), governed by this lifecycle.

**Evidence gap.** The artifact tier and handle pattern are documented product architecture [GCA; CXM] — reliable as specification. The five-stage lifecycle and A-1..A-3 are **[synthesis]** organizing the documented handle pattern into a lifecycle. **No source measures the artifact lifecycle's effect** (e.g., handle-vs-inline on task quality — that is Chapter 6, Topic 4's unmeasured externalization ablation, which applies to artifacts). The exact-fidelity-requires-handle argument (§3.3) is reasoned from Chapter 5, Topic 7's corruption mechanism, not measured. §8 provides local measurement.

## 6. Implementation

**The artifact with a handle (A-1):**

```python
@dataclass(frozen=True)
class Artifact:
    id: str
    content: bytes | str            # large / binary — NEVER enters context (A-1)
    kind: str                       # report | patch | dataset | checkpoint | binary | image
    version: int                    # versioned independently (Topic 11)
    exact_fidelity: bool            # patches, datasets, binaries → True (§3.3)

    def handle(self) -> dict:
        """A-1: the ~20-token reference that enters context. The summary must AFFORD
        the load decision (Ch.5 T4) — 'fixes auth bug', not 'a file'."""
        return {"id": self.id, "kind": self.kind, "version": self.version,
                "summary": self.summary(),          # informative — triggers load (§4)
                "location": self.location()}
```

**Load on demand, offload after (A-2) — the [GCA] pattern:**

```python
def load_artifact(store, handle_id: str, ctx) -> str:
    """A-2: bring content into context ONLY when the agent must work on it.
    [GCA]: loads on-demand, offloads after. Exact-fidelity artifacts load VERBATIM (§3.3)."""
    a = store.get(handle_id)
    ctx.context.attach(a.content, temporary=True)   # in context, but marked for offload
    return a.content

def offload_artifact(handle_id: str, ctx) -> None:
    """A-2: after use, drop content back to handle-only. Reclaims the budget."""
    ctx.context.detach(handle_id)                   # back to ~20-token handle
```

**Exact-fidelity artifacts are never summarized (§3.3):**

```python
def compress_context(ctx) -> None:
    """When context is compacted (Ch.6 T11), artifacts are NOT summarized — they are
    already handles. An exact-fidelity artifact accidentally inlined must NOT be summarized:
    a summarized patch is a broken patch (§3.3)."""
    for block in ctx.blocks:
        if block.is_artifact_content and block.artifact.exact_fidelity:
            # Re-handle it — do NOT summarize. Correctness requirement, not optimization.
            ctx.replace_with_handle(block)
        elif block.is_summarizable:
            ctx.summarize(block)                    # only non-artifact history (Ch.6 T11)
```

**Create-to-storage, not to context (A-1):**

```python
def produce_artifact(content, kind, ctx) -> dict:
    """CREATE: the run's product goes to storage; a handle goes to context.
    NOT: return the 200-page report into the window."""
    a = Artifact(id=new_id(), content=content, kind=kind, version=1,
                 exact_fidelity=(kind in EXACT_FIDELITY_KINDS))
    ctx.artifact_store.put(a)                       # durable, versioned, governed
    ctx.event_log.append(Event(kind="artifact_created",
                               payload={"id": a.id, "kind": kind}, timestamp=utcnow()))  # Topic 3
    return a.handle()                               # ~20 tokens to context, not the product
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Handle in context (A-1) | 50k-token artifact for ~20 tokens | A load round-trip when content is needed |
| Load on demand (A-2) | Content available when working | Latency per load; the agent must decide to load |
| Content inline | No load latency | **Blows the budget** (Ch.6 T1); corrupts exact-fidelity on compaction (§3.3) |
| Informative handle summary | Agent loads when relevant (Ch.5 T4) | A summary to generate/maintain |
| Lifecycle decoupled (A-3) | Products persist past the session | Separate storage, versioning, governance |
| Artifact as session state | Simple | **Lost at session end** — the deliverable discarded |

**The trade the handle pattern wins decisively.** For artifacts, the handle-vs-inline trade is *not close*, because artifacts have two properties that force the handle: they are large (inline blows the budget) and often exact-fidelity (inline risks corruption on compaction, §3.3). **The only cost of the handle is a load round-trip when the content is actually needed** — and for a product the agent references far more often than it edits (a report it generated, a dataset it queries by handle), that round-trip is rare. **The handle pattern is the default for artifacts, and inline is the exception reserved for small, actively-edited, non-exact-fidelity content** — which is a narrow case.

**The decoupling trade (A-3) is what makes artifacts durable products.** Treating artifacts as session state is simpler (one lifecycle) and wrong (the deliverable dies with the conversation). Decoupling costs a separate storage, versioning (Topic 11), and governance (Topic 14) — real infrastructure — and buys products that persist, version, and are governed on their own schedule. **For anything that is a *deliverable* rather than *scratch*, the decoupling is mandatory**, because a deliverable that vanishes when the conversation ends is not a deliverable.

## 8. Experiments

**The handle-vs-inline ablation (Chapter 6, Topic 4, at the artifact layer).** For artifacts the agent references: handle-only vs inline. Metrics: context tokens, task completion, **load rate** (how often the agent actually loads the content), latency. **Prediction: handle-only saves large token budgets at non-inferior completion, with load rate well below 1** (the agent references far more than it edits). If load rate is near 1, the artifact is being actively worked and might be inlined — the $\Pr(\text{needed})$ condition (Chapter 6, Topic 4).

**The exact-fidelity corruption test (§3.3) — the correctness one.** Hold an exact-fidelity artifact (a code patch) in context; trigger compaction (Chapter 6, Topic 11); check whether the patch survives verbatim or gets summarized. **A summarized patch that no longer applies is the §3.3 failure** — and it is silent until the patch is used. Confirm exact-fidelity artifacts are re-handled, never summarized (§6).

**The handle-summary affordance test (§4, Chapter 5, Topic 4).** Vary handle summary informativeness ("a file" vs "fixes auth bug in login.ts"); measure whether the agent loads the artifact when it is relevant. **Uninformative summaries cause missed loads (needed artifact never fetched) or over-loading (load-to-check every time).**

**The lifecycle-decoupling test (A-3).** End a session; check whether its artifacts persist. Compact a session; check whether its artifacts are untouched. **Artifacts lost at session end or corrupted by compaction are A-3 failures** — the products were treated as conversation state.

**Statistics.** Task-clustered bootstrap on completion (handle vs inline); Wilson on load rate and missed-load rate; zero target on exact-fidelity corruption; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Artifact inlined into context.** A 200-page report or large file in the window; budget blown (Chapter 6, Topic 1). **The classic artifact-as-context error** (Topic 1). Mitigation: A-1 — handle only; create-to-storage.
- **Exact-fidelity artifact summarized.** A patch/dataset/binary lossily compressed on compaction; corrupted; silently broken (§3.3). Mitigation: A-1 + re-handle, never summarize exact-fidelity (§6).
- **Artifact lost at session end.** The deliverable treated as session state, discarded. Mitigation: A-3 — decoupled lifecycle; artifacts persist.
- **Artifact corrupted by compaction.** The conversation compacts and takes the artifact with it. Mitigation: A-3 — artifacts are untouched by conversation compaction.
- **Uninformative handle.** The agent cannot tell when to load; misses needed artifacts or over-loads. Mitigation: informative summary (§4; Chapter 5, Topic 4).
- **Content never offloaded.** Loaded artifact stays in context, defeating A-2. Mitigation: offload after use; mark loads temporary (§6).
- **Binary artifact stringified into context.** A binary crammed in as text, wasting budget and useless to the model. Mitigation: binaries are always handles; the model reasons about their existence, not their bytes.
- **Edge case — the artifact the agent must extensively edit.** A patch under active revision genuinely needs to be in context. Here inline (or load-and-hold) is correct — the $\Pr(\text{needed})\approx1$ case (Chapter 6, Topic 4). Mitigation: load-and-hold during active editing, re-handle when done; do not summarize even while held (§3.3).
- **Open limitation.** The artifact tier and handle pattern are **documented** [GCA; CXM]; the five-stage lifecycle and A-1..A-3 are **[synthesis]**. **No source measures the lifecycle's effect** (handle-vs-inline is Chapter 6, Topic 4's unmeasured ablation); the exact-fidelity-requires-handle argument is reasoned from Chapter 5, Topic 7's corruption mechanism. Local measurement (§8) is the only source of the numbers.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Artifacts are "large binary or textual data associated with the session or user (files, logs, images)" — a distinct durable tier [GCA].
2. The handle pattern: "agents see lightweight references; raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion" [GCA].
3. Artifacts are separate from Working Context, Session, and Memory [GCA] — decoupled lifecycle.
4. Intermediates and products should stay out of context (Chapter 5, Topic 8; [CXM]).
5. Exact-fidelity content cannot be summarized (Chapter 5, Topic 7; Chapter 6, Topic 4).
6. **The five-stage lifecycle and A-1..A-3 are this book's synthesis; the effect is unmeasured.**

**Decision rules.**
- **Artifacts are handles in context, content in storage** (A-1) — never inline a large product.
- **Load on demand, offload after** (A-2) — content enters only when the agent works on it.
- **Exact-fidelity artifacts are ALWAYS handles** (§3.3) — summarization corrupts them; this is correctness, not optimization.
- **The handle summary must afford the load decision** (Chapter 5, Topic 4).
- **Decouple the artifact lifecycle from the conversation** (A-3) — deliverables persist past the session.
- **Inline only small, actively-edited, non-exact-fidelity content** — the narrow exception.

**Production implications.**
1. Route artifact creation to storage with a handle to context; a run that returns its 200-page report into the window has made the category error.
2. Verify exact-fidelity artifacts are re-handled, never summarized, on compaction (§8); a broken patch is silent until used.
3. Make handle summaries informative; an uninformative handle is one the agent cannot decide to load.
4. Decouple artifact storage, versioning (Topic 11), and governance (Topic 14) from the conversation; a deliverable that dies with the session is not a deliverable.

**Connections.** This topic is Topic 1's artifact category and Chapter 6, Topic 4's external-state type, at the product layer, built on Chapter 5, Topic 8's data-path argument. Exact-fidelity is Chapter 5, Topic 7 and Chapter 6, Topic 4. **Topic 11 (the next topic) versions artifacts independently of conversation** — A-3's versioning half. Checkpoints (a checkpoint is an artifact) connect to Chapter 3, Topic 9 and Chapter 10. Skills and repository artifacts are Topic 12; artifact retention/deletion is Topic 14. The handle summary is Chapter 5, Topic 4's affordance.

## Sources

[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — Artifacts as "large binary or textual data associated with the session or user (files, logs, images)"; the handle pattern ("agents see lightweight references; raw content loads only via `LoadArtifactsTool` on-demand, then offloads after completion"); the four-tier model separating Artifacts as a distinct durable tier — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CXM] Anthropic, "Code execution with MCP" — intermediates and products staying in the execution environment ("the agent only sees what you explicitly log or return"); writing intermediate results to files; `./skills/` as agent-produced durable artifacts — https://www.anthropic.com/engineering/code-execution-with-mcp
[ECE] Anthropic, "Effective context engineering for AI agents" — agents writing durable notes/results to files outside the window; structured note-taking — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
