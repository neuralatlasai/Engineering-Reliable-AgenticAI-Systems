# Topic 6 — Artifact-Mediated Continuity Across Sessions

## 1. Scope, prerequisites, terminology, boundaries, outcomes

Topic 5 built the *records* that describe the run (ledger, journal, progress file, evidence). This topic addresses the *substance* the run produces and carries forward: the **artifacts** — the code, files, reports, datasets, checkpoints, and binaries that are the actual work product, and that provide **continuity** when the context window cannot. The key claim: across sessions, **the artifact, not the conversation, is the medium of continuity.** A session ends and its window vanishes; what persists and carries the work forward is what got written to durable artifacts and referenced by handle.

This is the long-horizon application of Chapter 7's artifact model (artifact = handle-in-context, content-external; artifacts versioned independently of conversation). Here it becomes the *primary continuity mechanism*: the durable record (Topic 5) says *what is done*; the artifacts *are* what is done.

**Prerequisites.** Artifacts as handle-in-context, content external, exact-fidelity ⇒ handle-only, independent artifact versioning (two clocks), the `LoadArtifactsTool` / handle pattern (Chapter 7 Topic 10, [GCA] Chapter 6, [ADK-A]); the durable record and RI (Topics 3, 5); the resumability invariant (Topic 3).

**Terminology.**
- **Artifact** — a durable work product with content too large or too exact to live in the window: source files, a compiled binary, a generated report, a dataset, a model checkpoint, a screenshot.
- **Handle** — a lightweight reference (path, id, hash, version) to an artifact that *does* live in the window; the agent loads content on demand.
- **Continuity** — the property that work done in session $i$ is available, correct, and buildable-upon in session $i+1$, carried by artifacts + handles rather than by conversation.
- **Artifact-mediated handoff** — [HDA]'s pattern: agents communicate by writing and reading *files*, not by sharing context.

**Boundary.** This topic covers how artifacts carry continuity and how handles keep the window bounded. It does *not* cover versioning mechanics for *code branches* specifically (Topic 13) or the *records about* artifacts (Topic 5 — evidence records point to artifacts; this topic is the artifacts themselves). Artifact *lifecycle governance* (retention, deletion) is Chapter 7 Topic 10 and Chapter 12; here we use artifacts for continuity.

**Outcome.** You will be able to design continuity so that work survives session boundaries via artifacts + handles, keep the window bounded by referencing rather than embedding artifact content, and preserve exact fidelity where the task demands it.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** The work product of a long run — a codebase, a research report, a dataset — is far larger than any context window and grows past it. It cannot live *in* the conversation; if it did, the window would be consumed by the work product and nothing would be left for reasoning (Chapter 6 budget), and it would vanish at every session boundary (P2). Worse, some artifacts require *exact fidelity* — a code file, a config, a binary — where a summarized-into-context version is worse than useless (a paraphrased source file does not compile). The run needs a way to carry large, exact work products across sessions without paying window cost for their content.

**Objective.** Establish continuity such that: (i) any session can access the full, exact content of any artifact from prior sessions *on demand*, via a handle; (ii) the window carries only handles + the minimal working slice, never whole artifacts; (iii) exact-fidelity artifacts are stored and retrieved byte-exact (never round-tripped through a summary); and (iv) artifacts are versioned so a session can reference "the version I built on" and recovery can roll back to a known-good version.

**Assumptions.** (a) Durable artifact storage exists (filesystem/git/object store) — Chapter 14's substrate, assumed. (b) Artifacts have stable, resolvable handles that survive across sessions.

**Constraints.** The window budget forbids loading large artifacts wholesale; the fidelity requirement forbids storing exact artifacts as context summaries. These jointly force the handle pattern: reference in context, content external, load the *slice* you need.

**Success criteria.** A cold session, given only handles from the durable record, can retrieve the exact content it needs to continue, never re-creates an artifact that already exists (Topic 2's repeated work), and never corrupts an exact artifact by round-tripping it through the model's context.

## 3. Intuition first, then formalization

**Intuition.** Think about how you actually resume a big project after time away. You do *not* re-read every conversation you ever had about it. You open the *files* — the code, the doc, the spreadsheet — and the files *are* the state. The conversation was scaffolding; the artifacts are the building. A long-running agent must work the same way: **the artifacts are the persistent building; each session's context is temporary scaffolding erected around the part being worked on and torn down at session end.**

This flips the naive mental model. The naive model treats the *conversation* as the state ("the agent remembers what it did"). The correct model treats the *artifacts* as the state and the conversation as a transient view. [HDA] makes this literal — agents "communicate via files," one writing a file another reads. The file outlives both sessions; the conversation does not. This is the same inversion as Topic 1 (window is cache) and Topic 5 (journal is truth), now applied to the *work product*: **continuity lives in artifacts, not in memory of them.**

The second intuition is **handle vs content.** A 5,000-line codebase cannot be "in context." But its *handle* — the path, the current commit, the file tree — easily fits, and the agent loads the specific 40 lines it needs to edit. This is how a session works on a huge artifact within a small window: it holds the *map* (handles) and loads *territory* (content) just-in-time (Chapter 6's just-in-time retrieval). The map is small and stable; the territory is large and fetched on demand.

The third intuition is **fidelity.** Some things must be exact. A source file that is 99% right does not compile; a config with a paraphrased value is wrong; a dataset summarized is a different dataset. For these, you *must* store and retrieve the bytes, never a context summary. Chapter 7's rule: exact-fidelity ⇒ handle-only (never inline the content as summarizable context). Round-tripping an exact artifact through the model's window is how you silently corrupt it.

**Formalization.** An artifact is $a = (\text{id}_a, \text{version}_a, \text{content}_a, \text{hash}_a)$ stored durably; a handle is $h_a = (\text{id}_a, \text{version}_a, \text{hash}_a, \text{metadata})$ with $|h_a| \ll |a|$. The window holds handles $\{h_a\}$ and a bounded working slice $\text{slice}(a, \text{region})$ loaded on demand.

**Continuity invariant (CI) [synthesis].**
$$
\text{work}(\sigma_i) \subseteq \text{Artifacts}_{i} \quad\text{and}\quad \sigma_{i+1} \text{ accesses } \text{Artifacts}_i \text{ via handles in } D_i .
$$
Every session's output is captured in durable artifacts referenced from the durable record $D_i$ (Topic 5); the successor accesses them by handle. CI is the artifact-level form of RI (Topic 3): *no work product exists only in a window.* Combined with RI (no *decision* exists only in a window), CI (no *artifact* exists only in a window) gives full cross-session continuity.

**Fidelity rule (from Chapter 7).**
$$
\text{exact-fidelity}(a) \;\Rightarrow\; a \text{ is carried by handle only; never } \text{content}_a \in \text{context as summarizable text.}
$$
The hash lets any session verify it retrieved the intended exact bytes — $\text{hash}(\text{retrieved}) = \text{hash}_a$ — closing the corruption gap.

**Two clocks (from Chapter 7).** The artifact version advances on its *own* clock, independent of conversation turns: `clip.wav@v3` is version 3 of that artifact regardless of how many sessions or turns produced it. A session references *the version it built on*, which makes rollback (Topic 11) and reproducibility precise: "recover to `report@v7`" is unambiguous.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Artifact store.** Durable, versioned storage (git for code, object store for binaries/datasets, a documents dir for reports). Content-addressable where possible (hash = identity), giving free integrity and dedup.
2. **Handle index.** The durable record's map from logical name → current handle (id, version, hash). Part of $D$ (Topic 5). Small, in-context-able.
3. **Load-artifact tool.** The agent's on-demand fetch: given a handle + region, returns the exact slice ([ADK-A]'s `LoadArtifactsTool`, [GCA]'s handle pattern). Keeps content out of context until needed.
4. **Write-artifact / version tool.** Produces a new artifact version, updates the handle index, records the version in the journal (Topic 5). Never mutates in place without versioning (loses rollback).

**Interface: the window holds the map, not the territory.** At session start, the re-anchoring read (Topic 2) loads *handles* (the file tree, the current versions, the progress file) — not artifact contents. The agent loads specific slices as it works. This is what lets a session operate on a codebase 100× the window size.

**Control flow (working on a large artifact):**

```
start:  load handle index + progress file (bounded)          # map, not territory
edit:   load slice(a, region) via handle                     # just-in-time territory
        modify; produce a' = new version of a
commit: write a' to store; hash(a'); update handle index      # two-clock version bump
        append journal event referencing a'@v(n+1)            # Topic 5 evidence
handoff: durable record now points to a'@v(n+1); window discarded
```

**Data flow.** Artifacts flow *only* through the durable store; sessions exchange *handles*, never content-in-context. This is [HDA]'s file-mediated communication and Chapter 7's handle pattern, and it is what enforces CI.

**[LRH]/[HDA] instantiation.** [LRH]: the codebase-in-git *is* the artifact carrying continuity; git commits version it; `claude-progress.txt` and the feature registry are the handle index / map. [HDA]: agents pass work via files; the evaluator loads and *runs* the artifact (via Playwright) rather than reading a description of it — exact-fidelity access (it drives the *real* app, not a summary).

## 5. Grounding: primary sources and reproducible evidence

**File-mediated continuity.** [HDA] grounds it directly: "Communication was handled via files: one agent would write a file, another agent would read it and respond either within that file or with a new file that the previous agent would read in turn." Continuity is carried by files across agent/session boundaries — the artifact is the medium.

**Artifacts as the persistent building; git as versioned store.** [LRH]: the agent makes "incremental progress in every session" on a *codebase* held in git, with commits providing versioned checkpoints to "revert bad changes and recover working base states." The codebase persists across all sessions; the context does not. This is CI in a shipped system.

**Exact-fidelity access by running, not describing.** [HDA]: the evaluator "exercises running applications directly rather than scoring static artifacts," using Playwright MCP to "interact with running applications." It accesses the artifact at full fidelity (runs the real thing) rather than reasoning over a summary — grounding the fidelity rule (never round-trip an exact artifact through context).

**Handle pattern and independent versioning.** Chapter 7 Topic 10 grounds the handle-in-context / content-external model and the two-clock versioning: [GCA] "handle pattern + `LoadArtifactsTool`"; [ADK-A]'s artifact service; and the rule that artifacts version on their own clock, not the conversation's. This chapter *uses* those grounded constructs for continuity.

**Reproducible evidence.** CI is testable: kill a session mid-edit; verify the successor retrieves the exact prior artifact version by handle and continues (E1). The fidelity rule is testable: attempt to carry an exact config as context summary vs by handle; measure corruption (E2). Both reproducible; sources ground the design, not the metrics.

## 6. Implementation: handles, slices, and version discipline

**Handle index (in the durable record):**

```json
{ "src/audio/engine.py": {"version": 12, "hash": "sha256:...", "size": 3400},
  "report.md":           {"version": 7,  "hash": "sha256:...", "size": 21000},
  "clip.wav":            {"version": 3,  "hash": "sha256:...", "kind": "binary"} }
```

The index is small (fits context); the artifacts are large (do not). The re-anchoring read loads the *index*; the agent loads *contents* on demand.

**Just-in-time slice loading (bounded window):**

```python
# WRONG: dump the whole artifact into context (blows budget, corrupts on summarize)
ctx += read_file("src/audio/engine.py")

# RIGHT: hold the handle, load the slice you need, verify fidelity
h = handle_index["src/audio/engine.py"]
region = locate_region("engine.py", "class Recorder")   # a search/grep, cheap
content = load_artifact(h, region)                       # exact bytes, bounded slice
assert hashes_consistent(content, h)                      # fidelity check
```

**Versioned write (two-clock discipline):**

```python
def write_artifact(name, new_content, store, journal, handle_index):
    v = handle_index[name]["version"] + 1                 # artifact clock, not turn clock
    hash_ = sha256(new_content)
    store.put(name, version=v, content=new_content)        # never overwrite v-1
    handle_index[name] = {"version": v, "hash": hash_}     # update the map
    journal.append({"type": "artifact_written", "name": name, "version": v, "hash": hash_})
    return v
```

Keeping old versions is what makes rollback (Topic 11) and "recover working base state" ([LRH]) possible — a mutate-in-place store cannot roll back.

**Fidelity enforcement.** For exact-fidelity artifacts, the pipeline (Chapter 6) must *forbid* the artifact's content from entering the summarizable/compactable region of context. It enters only as a transient slice, tagged non-summarizable, and is dropped after use — never carried into a compaction (Topic 7) that would paraphrase it. The hash check on load is the tripwire: a mismatch means the exact artifact was corrupted somewhere.

## 7. Trade-offs

- **Handle indirection vs directness.** Handles keep the window bounded and enable huge artifacts, at the cost of an extra load step and the risk of a stale/dangling handle (points to a version that was garbage-collected). The trade strongly favors handles for any artifact bigger than a small fraction of the budget; inline only tiny, non-exact content.
- **Versioning storage vs rollback.** Keeping every artifact version enables precise rollback and reproducibility but costs storage that grows with the run. Mitigation: retain a bounded window of recent versions + tagged known-good checkpoints (Topic 8), garbage-collect the rest (Chapter 7 lifecycle) — but never GC a version the ledger still references.
- **Fidelity vs summarization convenience.** It is *tempting* to summarize an artifact into context ("here's what engine.py does") to save load steps. For exact artifacts this is a corruption vector — the summary drifts from the bytes, and edits based on the summary are wrong. The discipline (handle-only for exact artifacts) costs convenience and buys correctness. Non-exact artifacts (a prose report being drafted) *can* tolerate a summary in context, so the rule is scoped to exact-fidelity.
- **On-demand load latency vs pre-loading.** Loading slices just-in-time adds per-access latency; pre-loading likely-needed content saves latency but risks loading the wrong thing and bloating the window (context rot, Topic 1). Just-in-time is the [ECE]-grounded default; pre-load only content with high, predictable relevance.

## 8. Experiments: baselines, ablations, metrics

**E1 — Continuity across a kill (CI).** Kill a session mid-edit of a large artifact; start a fresh session; verify it retrieves the exact prior version by handle and continues without recreating it. Baseline: a design carrying work in context (expect loss/recreate on kill). Metric: continuity success, artifact-recreation rate (should be zero — connects to Topic 2 repeated work).
**E2 — Fidelity ablation (exact artifacts).** Carry an exact config/source across sessions two ways: (a) by handle (bytes), (b) via a context summary re-materialized by the model. **Prediction:** (b) accumulates drift/corruption (subtly wrong values, non-compiling code); (a) is byte-exact. Metric: byte-diff / compile-pass rate across sessions. This validates the fidelity rule.
**E3 — Handle vs inline (window budget).** Work on a codebase 50× the window with (a) handles + slices vs (b) attempts to inline. **Prediction:** (b) is infeasible (does not fit) or degrades badly (context rot); (a) operates within budget. Metric: window occupancy, task success vs artifact size.
**E4 — Version-retention / rollback.** Corrupt the current artifact version; roll back to the last known-good version by handle. **Prediction:** with versioned storage, exact recovery; with mutate-in-place, no recovery. Metric: rollback success (connects to Topic 11).

**Honest status.** [HDA] grounds file-mediated handoff and running-artifact access; [LRH] grounds git-versioned codebase continuity — both *qualitatively*, no metrics on continuity rate, fidelity corruption, or budget scaling. The handle/two-clock design is grounded in Chapter 7's sources ([GCA], [ADK-A]). The experiments are reproducible; the numbers are unmeasured in the sources. Mechanism grounded; magnitude yours.

## 9. Failure modes, edge cases, hazards, limitations

- **Artifact-in-context (the anti-pattern).** Loading whole large artifacts into the window: blows the budget, invites context rot, and (for exact artifacts) invites corruption via later compaction. Mitigation: handle + slice, non-summarizable tagging for exact content.
- **Exact-artifact round-trip corruption.** An exact config/source is summarized into context and later re-materialized, silently wrong. This is the fidelity rule's whole reason for existing. Mitigation: handle-only for exact artifacts; hash-verify on load.
- **Dangling / stale handle.** The record references `report@v7` but v7 was garbage-collected, or the handle points at an old version after a concurrent write. Mitigation: never GC a referenced version; make writes update the handle index atomically with the journal event (Topic 9 restart-safety); resolve handles against the current index.
- **Lost continuity (CI violation).** A session produces work but only in its window (never writes an artifact), so the successor cannot access it — the artifact-level RI violation. Mitigation: enforce "output ⇒ durable artifact" at handoff; a handoff check that every claimed output has a durable handle.
- **Concurrent artifact writes (takeover).** Two sessions (a stalled one and its takeover, Topic 10) both write the same artifact, creating divergent versions. Mitigation: single-active-worker lease (Topic 10) + versioning so divergence is at worst two versions to reconcile, not a corrupted single file.
- **Edge case: non-file artifacts.** A running process, an external deployment, or a cloud resource is an "artifact" whose state is not a file. Continuity for these is by *reference + reconstruction* (a deployment id + the config to rebuild it), and fidelity is checked by *probing* the live resource, not hashing bytes. The CI structure holds; the fidelity mechanism differs.
- **Limitation.** The continuity-by-artifact model is strongest where work *is* files ([LRH]/[HDA] code/app domains). For work whose product is diffuse (an accumulated understanding, a set of decisions), the "artifact" is the durable record itself (Topic 5) — the boundary between Topic 5's records and Topic 6's artifacts blurs. That is fine: both are "durable state referenced by handle"; the distinction is products (Topic 6) vs bookkeeping about products (Topic 5).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Continuity across sessions/agents is carried by *files*, written by one and read by the next [HDA].
- The codebase in git is the persistent work product across all sessions; commits version it for rollback [LRH].
- Full-fidelity artifact access is achieved by *running/exercising* the artifact, not summarizing it [HDA].
- The handle-in-context / content-external pattern with independent versioning is grounded [GCA][ADK-A] (Chapter 7).

**Decision rules.**
- **DR-1.** Carry continuity in artifacts + handles, never in conversation. Every session output becomes a durable artifact (CI); the window holds the map, not the territory.
- **DR-2.** For exact-fidelity artifacts (code, config, binaries, datasets), handle-only — never summarize into context. Hash-verify on load.
- **DR-3.** Version artifacts on their own clock; never mutate in place. Keep referenced versions and tagged known-good checkpoints; GC only unreferenced old versions.
- **DR-4.** Load slices just-in-time; do not pre-load or inline large artifacts. The window budget is for reasoning, not for holding the work product.

**Production implications.** Artifact-mediated continuity is what lets a long run operate on work products vastly larger than any window and survive every session boundary. It reframes the agent's persistent identity: the agent *is* its artifacts + durable record, not its conversation history. Systems built this way resume cleanly, roll back precisely, and scale to large codebases; systems that treat the conversation as state cannot do any of the three. This is the same principle as source control and object storage in ordinary engineering — the artifacts are the truth, the working session is ephemeral.

**Connections.** CI is the artifact-level RI (Topic 3) and the work-product form of Topic 1's Rule CL-1. Handles + slices are Chapter 6's just-in-time retrieval and budget discipline. Two-clock versioning and the handle pattern are Chapter 7 Topic 10 ([GCA], [ADK-A]). Evidence records (Topic 5) *point to* these artifacts. Version rollback feeds Topic 11 (recovery) and Topic 8 (checkpoints). Fidelity-vs-compaction is the tension Topic 7 resolves. Branch/worktree versioning of *code* artifacts is Topic 13.

### Sources
- **[HDA]** Anthropic — *Harness design for long-running apps* (file-mediated communication: "one agent would write a file, another agent would read it"; evaluator "exercises running applications directly rather than scoring static artifacts" via Playwright MCP).
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (git-versioned codebase as persistent work product; commits to "revert bad changes and recover working base states").
- **[GCA]** Google — production context architecture (handle pattern + `LoadArtifactsTool`; Artifacts tier). Via Chapter 6/7.
- **[ADK-A]** Google ADK — artifact service; independent artifact versioning. Via Chapter 7.
- Internal: Chapter 6 (just-in-time retrieval, budget), Chapter 7 Topic 10 (artifact = handle-in-context, two clocks, exact-fidelity ⇒ handle-only), this chapter Topics 1 (CL-1), 2 (repeated work, re-anchoring), 3 (RI), 5 (records point to artifacts), 7 (compaction-vs-fidelity), 8 (checkpoints), 10 (lease), 11 (rollback), 13 (code branches).
