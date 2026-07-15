# Topic 6 — Chunking, Context Windows, Overlap, Document Structure, and Provenance Preservation

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The unit problem: retrieval returns *chunks*, and the chunk boundary decides what can be found and whether it can be trusted. This topic covers how documents are cut, what is preserved across the cut, and why provenance must survive it.

**Prerequisites.** Topic 5 (retrieval, which consumes chunks); Topic 3 (Normalize, where provenance is attached); Chapter 5, Topic 12 (the provenance envelope $\phi_u$ — this topic is its ingestion-side counterpart).

**Terminology.** *Chunk*: the atomic unit of retrieval. *Overlap*: shared tokens between adjacent chunks. *Structure-aware chunking*: cutting on document structure rather than token count. *Provenance*: origin, position, time, and trust class of a chunk.

**Boundaries.** Inside: chunk sizing, boundary selection, overlap, structural metadata, and the provenance record. Outside: retrieval scoring (Topic 5); reranking (Topic 7); citation *enforcement* at output time (Topic 14).

**Exclusions.** No parser or document-loader survey.

**Outcomes.** The reader can choose a chunking strategy from the failure it must avoid, and can guarantee every retrieved token is attributable to a source, an offset, and a time.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Chunking is treated as preprocessing — a `split(text, 512)` before the interesting work. It is not preprocessing; it is **the definition of what the retrieval system is able to find at all.** A fact split across two chunks is a fact that no retriever will score highly, because neither chunk contains it. The most sophisticated embedding model in the world cannot recover from a bad cut.

**Bottleneck.** Fixed-size token chunking is the default and it is structure-blind: it cuts through the middle of a table, separates a heading from its content, splits a code function from its signature, and severs a claim from the sentence that qualifies it. The information loss happens at *ingestion*, silently, and is unrecoverable at query time.

**Objective.** Chunks that are (i) **self-contained** — interpretable without their neighbors, (ii) **structure-aligned** — cut where the document has a natural seam, and (iii) **provenance-bearing** — carrying source, offset, time, and trust so that Topic 8's boundary and Topic 14's attribution are possible.

**Assumptions.** Documents have structure. That structure is signal [ECE].

**Constraints.** Chunks must be small enough to be dense (Topic 5) and large enough to be self-contained. These pull against each other, and this tension *is* the topic.

**Success criteria.** No retrievable fact is split across a boundary; every chunk carries a complete provenance record; retrieval failures traced to chunking are measured, not guessed at.

## 3. Intuition first, then formalization

### 3.1 Intuition: the chunk is the unit of meaning, not of length

Ask what a chunk is *for*. It is the smallest thing that can be independently retrieved and independently understood. That makes it a **semantic** unit, and cutting it by token count is like cutting a book into equal-weight pieces of paper.

The failure is concrete. Consider a document:

```
## Refund Policy (EU)
Refunds are processed within 14 days.
...
## Refund Policy (US)
Refunds are processed within 30 days.
```

A 512-token cut lands mid-section. Chunk A ends with "Refunds are processed within 14 days." — **with the `(EU)` heading in the previous chunk.** The retriever, asked "how long do US refunds take," happily returns Chunk A, which says 14 days, and the model answers wrongly with full confidence. **The chunk was structurally valid, semantically detached, and actively misleading.** Nothing downstream can detect this.

The fix is the one [ECE] points at when it observes that organizational structure — "folder hierarchies, naming conventions, timestamps" — provides "important signals that help both humans and agents understand how and when to utilize information." **The document's own structure is the chunking instruction.** Cut on headings, not on counts. Carry the heading path into every chunk so it is never orphaned.

### 3.2 Formalization: self-containment and the sizing tension

A chunk $\upsilon$ is **self-contained** for a fact $f$ if $f$ can be correctly extracted from $\upsilon$ alone:

$$
\textbf{C-1 (self-containment):}\qquad
\operatorname{extract}(f\mid \upsilon)=\operatorname{extract}(f\mid \text{full document}).
$$

The EU/US example violates C-1: the fact "US refunds take 30 days" is *misextracted* from a chunk lacking its heading. **[derived]**

The sizing tension, stated:

$$
\underbrace{\text{small chunks}}_{\text{high density (Topic 5); precise retrieval}}
\qquad\text{vs.}\qquad
\underbrace{\text{large chunks}}_{\text{self-contained (C-1); context preserved}}
$$

Overlap $\omega$ is the classical patch: adjacent chunks share $\omega$ tokens, so a fact near a boundary appears whole in at least one. Its cost is exact and rarely counted:

$$
\text{storage \& retrieval-set inflation}\ \approx\ \frac{1}{1-\omega/s}\quad\text{for chunk size } s,
$$

so 20% overlap costs 25% more chunks — and, worse, **near-duplicate chunks compete in the ranking**, so a query can return three overlapping variants of the same passage and burn the budget three times on one fact. **[derived]** Overlap trades a boundary failure for a redundancy failure, and deduplication at retrieval time is therefore not optional if you use overlap.

The better answer avoids the trade: **structure-aware chunking with a propagated header path** satisfies C-1 without overlap, because the boundary is placed where meaning already ends.

### 3.3 Provenance is not metadata — it is the trust boundary

Every chunk must carry, from ingestion:

$$
\phi(\upsilon)=\bigl(\underbrace{\text{source}}_{\text{uri/id}},\ \underbrace{\text{offset}}_{\text{for citation}},\ \underbrace{\text{observed\_at}}_{\text{freshness}},\ \underbrace{\text{trust}}_{\text{Category A/B — Topic 2}},\ \underbrace{\text{structure path}}_{\text{heading lineage}}\bigr).
$$

This is Chapter 5, Topic 12's $\phi_u$ envelope, **created at ingestion rather than at return**. Four downstream capabilities are impossible without it, and each is a chapter obligation:

- **Trust classification** (Topic 8): is this chunk from a user-writable corpus? Only provenance knows.
- **Citation** (Topic 14): a claim must resolve to a source and offset, or it is unverifiable.
- **Freshness** (Topic 8): a chunk from a stale index acted on as current is a TOCTOU error.
- **Attribution** (Topic 14): which source drove the output?

**A chunk without provenance is an anonymous assertion in the model's context**, indistinguishable from the model's own priors, and it cannot be defended, cited, or distrusted. This is why provenance belongs at the cut, not bolted on later — by return time the offset is gone.

## 4. Architecture

```
   DOCUMENT
      │
      ▼
   ┌── PARSE ──────────► structure tree (headings, sections, tables, code blocks)
   │                     [ECE]: structure is signal
   ▼
   ┌── CHUNK ON STRUCTURE ─────────────────────────────────────────┐
   │  cut at semantic seams, NOT at token counts                    │
   │  · never split a table, a code block, or a list                │
   │  · a section too large? recurse into subsections               │
   │  · a section too small? merge with its sibling                 │
   └───────────────────────┬────────────────────────────────────────┘
                           ▼
   ┌── PROPAGATE HEADER PATH ──────────────────────────────────────┐
   │  every chunk carries its lineage:                              │
   │    "Refund Policy > US > Processing time"                      │
   │  ← this is what makes C-1 hold WITHOUT overlap                 │
   └───────────────────────┬────────────────────────────────────────┘
                           ▼
   ┌── ATTACH PROVENANCE φ ────────────────────────────────────────┐
   │  source · offset · observed_at · trust · structure path        │
   │  ← created HERE. By return time the offset is gone.            │
   └───────────────────────┬────────────────────────────────────────┘
                           ▼
                    index  ──►  Topic 5's retrieval
                                Topic 3's Normalize (provenance already present)
                                Topic 8's trust boundary (provenance decides)
                                Topic 14's citation (offset resolves)
```

**The header-path propagation is the single highest-value implementation detail in this topic.** It costs a few tokens per chunk and it eliminates the entire class of orphaned-content failures from §3.1 — without the redundancy tax of overlap. Every chunk becomes self-contained *by construction*, because it carries the context that disambiguates it.

## 5. Grounding

- **Structure is signal.** Organizational metadata — "folder hierarchies, naming conventions, timestamps" — provides "important signals that help both humans and agents understand how and when to utilize information" [ECE]. This is the direct warrant for structure-aware chunking: **the structure you would throw away by fixed-size cutting is exactly the signal the source says to keep.**
- **Provenance is a first-class harness requirement.** The survey lists "result sanitization" and "reproducible traces" among what future harnesses must support [CAH §3.3], and requires permissions to depend on "data sensitivity" [CAH §5] — which is unknowable without provenance.
- **The provenance envelope** is established at the tool boundary in Chapter 5, Topic 12 ($\phi_u$: source, trust, uri, observed_at); this topic is its ingestion-side origin.
- **Freshness matters because agents act late.** The gap between observation and action is long in agent systems (Chapter 5, Topic 12, §3.3), which makes `observed_at` load-bearing rather than decorative.
- **Structured, event-shaped records are the durable form.** [GCA] stores sessions as "structured Event objects" rather than flat text, and Chapter 3, Topic 4's event-sourcing argument is the same principle: **structure survives; flat text does not.**
- **Citation depends on offsets:** Topic 14 and Chapter 5, Topic 12's citation-enforcement discipline both require a chunk to resolve to a location in a source.

**Evidence gap, stated bluntly.** **No source in this chapter's ledger evaluates chunking strategies, chunk sizes, or overlap ratios.** [ECE] establishes that *structure is signal*; it says nothing about how to cut. Every specific number in circulation — 512 tokens, 20% overlap, 1,000-character windows — is folklore, unattributed to any measurement in these sources. **This topic therefore gives the mechanism (C-1) and the experiment (§8), and refuses to print a recommended chunk size**, because there is no grounding for one and inventing it would violate the chapter's rule.

## 6. Implementation

**Structure-aware chunking with header propagation:**

```python
@dataclass(frozen=True)
class Chunk:
    text: str
    header_path: list[str]          # ["Refund Policy", "US", "Processing time"]
    provenance: Provenance          # source, offset, observed_at, trust  (§3.3)
    tokens: int

    def render(self) -> str:
        """C-1: the chunk is self-contained BECAUSE it carries its lineage.
        This is what makes overlap unnecessary."""
        path = " > ".join(self.header_path)
        return f"[{path}]\n{self.text}"

def chunk_document(doc, model, target=800, hard_max=1500) -> list[Chunk]:
    tree = parse_structure(doc)                 # headings, sections, tables, code blocks
    out = []

    def walk(node, path):
        text = node.render()
        n = count_tokens(text, model)           # provider tokenizer [ANT-API]

        if n <= hard_max and not node.is_container:
            out.append(Chunk(text, path, provenance_of(node, doc), n))
            return
        if node.children:
            for child in node.children:         # recurse: sections → subsections
                walk(child, path + [node.heading])
            return
        # Atomic node too large (a giant table, a long function).
        # NEVER split a table or a code block mid-structure — it becomes unreadable.
        if node.kind in ATOMIC_KINDS:
            out.append(Chunk(summarize_with_handle(node), path, provenance_of(node, doc),
                             HANDLE_TOKENS))    # externalize instead (Topic 4)
        else:
            for para in split_on_paragraphs(node, target):    # last resort, on prose only
                out.append(Chunk(para, path + [node.heading], provenance_of(para, doc),
                                 count_tokens(para, model)))

    walk(tree, [])
    merge_undersized(out, floor=target // 4)    # tiny fragments retrieve badly
    return out
```

The `ATOMIC_KINDS` branch is the one that saves you. **A table split across chunks is worse than useless** — both halves are misleading, the header row is orphaned, and the model will read numbers under the wrong columns. Handle-ize it (Topic 4) rather than butchering it.

**Deduplication, mandatory if you use overlap:**

```python
def dedupe(chunks: list[Chunk], threshold=0.85) -> list[Chunk]:
    """Overlap creates near-duplicate chunks that COMPETE in the ranking and burn
    the budget three times on one fact (§3.2). If you overlap, you must dedupe."""
    kept = []
    for c in chunks:
        if not any(similarity(c.text, k.text) > threshold for k in kept):
            kept.append(c)
    return kept
```

**Provenance at ingestion, not at return:**

```python
def provenance_of(node, doc) -> Provenance:
    return Provenance(
        source=doc.uri,
        offset=(node.start, node.end),          # for citation (Topic 14) — GONE if not captured now
        observed_at=doc.fetched_at,             # for freshness (Topic 8)
        trust=(Trust.UNTRUSTED if doc.user_writable else Trust.TRUSTED),   # ← Topic 8
        structure_path=node.path,
    )
```

`doc.user_writable` is the line that decides whether this corpus is an injection channel. **A "trusted internal knowledge base" that users can upload to is an untrusted corpus**, and the trust class must be set by *who can write*, not by where the store lives.

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Small chunks | Density (Topic 5); precise retrieval | **C-1 violations**; fragmented facts |
| Large chunks | Self-containment; context | Low density; noise tokens dilute (Topic 1) |
| Fixed-size cutting | Trivial to implement | **Structure-blind**; the §3.1 failure |
| Structure-aware | C-1 by construction; keeps [ECE]'s signal | A parser per document type |
| Overlap | Boundary facts survive | Storage ×1/(1−ω/s); **near-duplicates compete in ranking**; mandatory dedupe |
| Header propagation | **C-1 without overlap** | A few tokens per chunk |
| Handle-ize atomic blocks | Tables/code survive intact | A fetch when needed (Topic 4) |
| Rich provenance | Trust, citation, freshness, attribution | Storage; ingestion complexity |

**The trade to take.** Overlap is the popular answer to the boundary problem and it is the *inferior* one: it pays storage, inflates the retrieval set, creates near-duplicates that compete for budget, and still cuts through tables. **Header propagation solves the same problem for a few tokens per chunk and no redundancy.** Use structure-aware chunking with propagated lineage; reach for overlap only on genuinely unstructured prose where no seam exists.

## 8. Experiments

**The chunk-boundary failure test — the experiment that finds the invisible loss.** Build a query set whose answers sit *near* chunk boundaries in your corpus (find them programmatically: facts within $\epsilon$ tokens of a cut). Measure retrieval recall and end-to-end correctness on this set versus a control set of mid-chunk facts.

- **Predicted signature: a large gap.** Boundary-adjacent facts are retrieved and answered worse.
- **If the gap is large, your chunking is losing information at ingestion**, and no amount of retriever tuning will recover it. This is the highest-value diagnostic in the topic and almost nobody runs it.

**The orphaned-context test (C-1).** Sample chunks; for each, ask a model to answer a question about it *using only that chunk*; compare with the answer given the full document. **Disagreement = C-1 violation.** Report the violation rate with Wilson intervals. The EU/US refund case is exactly what this catches.

**Chunking-strategy ablation.** Arms: fixed-size / fixed-size+overlap / structure-aware / structure-aware+header-path. Metrics: recall@k, **density** (Topic 5), C-1 violation rate, storage, retrieval latency, and end-to-end $G$.

**Since no source recommends a chunk size, sweep it.** Chunk size × overlap grid; measure the vector. **The output is your corpus's chunking parameters — and they are corpus-specific, which is precisely why no source can give you a number.** Re-run per document type: code, prose, tables, and logs will not agree.

**Provenance completeness audit.** What fraction of retrieved chunks carry a resolvable source, offset, timestamp, and trust class? **Anything below 100% is a citation you cannot verify and a trust decision you cannot make** (Topics 8, 14).

**Statistics.** Wilson on recall and violation rates; task-clustered bootstrap for $G$; Holm across arms (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **The orphaned chunk.** Content severed from the heading that qualifies it; retrieved confidently; answered wrongly (§3.1). **The defining failure of this topic.** Mitigation: header-path propagation.
- **The split table.** Header row in one chunk, data in another. The model reads numbers under the wrong columns. Mitigation: atomic kinds are never split; handle-ize them.
- **The split code block.** A function severed from its signature; the model reasons about a fragment. Mitigation: same.
- **Fixed-size cutting.** Structure-blind by construction; throws away exactly the signal [ECE] says to keep. Mitigation: parse first.
- **Overlap without deduplication.** Three near-identical chunks in the top-5; the budget spent thrice on one fact. Mitigation: dedupe (§6), or avoid overlap via header paths.
- **Provenance attached at return.** The offset is gone by then; citations cannot resolve. Mitigation: attach at ingestion (§6).
- **Trust class set by store location.** A "trusted" knowledge base that users can write to. Mitigation: trust by *who can write*, not by where it lives (Topic 8).
- **Stale `observed_at`.** A chunk indexed six months ago, presented as current, acted on. Mitigation: freshness checks (Topic 8); staleness rate (Topic 5, §8).
- **Undersized fragments.** A 30-token chunk that retrieves on a coincidence and carries no meaning. Mitigation: merge below a floor.
- **Edge case — documents with no structure.** Transcripts, logs, OCR output. Here, and only here, overlap earns its cost — because there is no seam to cut on. Say so explicitly rather than letting the exception become the default.
- **Open limitation.** **No source in this chapter's ledger measures chunking.** Every chunk size, overlap ratio, and boundary heuristic in production is folklore. This topic gives C-1, the structural mechanism, and the experiment — and declines to invent a number it cannot ground.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Document and corpus structure — "folder hierarchies, naming conventions, timestamps" — is retrieval signal [ECE].
2. Provenance (source, trust, uri, observed_at) is required at the context boundary [Chapter 5, Topic 12; CAH §5's data-sensitivity requirement].
3. Structured records, not flat text, are the durable form [GCA's Event objects; Chapter 3, Topic 4].
4. **No source evaluates chunk size, overlap, or boundary strategy.** Every number in common use is unattributed folklore.

**Decision rules.**
- **Cut on structure, never on token count.** The document tells you where to cut.
- **Propagate the header path into every chunk.** It buys C-1 without overlap's redundancy tax.
- **Never split a table, a code block, or a list.** Handle-ize instead.
- **Attach provenance at ingestion.** The offset does not survive to return time.
- **Set trust by who can write to the corpus**, not by where it is stored.
- **If you overlap, you must dedupe.**

**Production implications.**
1. Run the boundary-failure test (§8). If boundary-adjacent facts answer worse, you are losing information at ingestion and no retriever tuning will fix it.
2. Add header-path propagation; it is a few tokens per chunk and it removes a whole failure class.
3. Audit provenance completeness. Below 100% means unverifiable citations and undecidable trust.
4. Sweep chunk size per document type — code, prose, tables, and logs will not want the same parameters, and no source will tell you what they want.

**Connections.** Topic 5 retrieves what this topic defines — a bad cut caps retrieval quality absolutely. Topic 7's reranking operates on these units. **Topic 8's trust boundary is decided by the provenance attached here.** Topic 14's citations resolve through the offsets captured here. Chapter 5, Topic 12's $\phi_u$ envelope is this provenance record, at the tool boundary; Chapter 7 owns the stores these chunks live in.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — corpus and document structure as signal: metadata from "folder hierarchies, naming conventions, timestamps" provides "important signals that help both humans and agents understand how and when to utilize information"; progressive disclosure through structure — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — sessions stored as "structured Event objects"; separation of storage from presentation; artifact handles for large payloads — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3 (future harnesses requiring "result sanitization… and reproducible traces"), §5 (permissions depending on "data sensitivity" — unknowable without provenance)
[ANT-API] Anthropic Claude API reference — `count_tokens`; third-party tokenizers undercount by ~15–20% on text and more on code — platform.claude.com docs (cache 2026-06)
