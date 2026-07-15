# Topic 5 — Durable Task Ledgers, Progress Files, Execution Journals, and Evidence Records

## 1. Scope, prerequisites, terminology, boundaries, outcomes

This topic builds the **seat of truth** for a long-running agent: the durable record that survives every session boundary, that a cold worker reads first, and that defines what has been done, what remains, and *why the completed work is trusted*. Topics 3 and 4 assumed this record exists ("the ledger"); here we build it and distinguish its four distinct functions — the **ledger** (what/state), the **progress file** (human/agent-readable summary), the **execution journal** (append-only history), and the **evidence record** (proof each unit is genuinely done).

This is where the chapter's foundational inversion (Topic 1: window is cache, durable record is memory; Rule CL-1) and Chapter 7's "event log authoritative, state is projection" become a concrete data-structure design.

**Prerequisites.** Rule CL-1 and the durable-record-first loop (Topic 1); the re-anchoring read (Topic 2); the resumability invariant RI and progress $\mu$ (Topic 3); verifiable units and predicates (Topic 4); event log as authoritative, state as projection, memory-as-claim-with-receipt (Chapter 7 Topics 3, 9); artifacts as handle-in-context (Chapter 7 Topic 10, developed further in Topic 6 here).

**Terminology (four distinct records, one system).**
- **Task ledger** — the *current state* projection: per-unit status ($\mu$), the frontier of work, active decisions. Answers "where are we?"
- **Progress file** — a curated, readable summary for the re-anchoring read. [LRH]'s `claude-progress.txt`. Answers "what should the next session know?"
- **Execution journal** — the *append-only* event history: every action, tool call, and outcome, in order. The authoritative log; the ledger is its projection. Answers "what happened, exactly?"
- **Evidence record** — per unit, the *proof of completion*: test output, artifact hash, citation, screenshot. Answers "why do we believe this unit is done?" (the receipt in Chapter 7's claim-with-receipt).

**Boundary.** This topic designs the records and their integrity. It does *not* cover the artifacts the records *point to* (Topic 6), the compaction of the *context window* (Topic 7 — distinct from journal compaction), checkpoint *frequency* (Topic 8), or restart-safe *writing* to these records (Topic 9). It uses Chapter 7's event-log model rather than re-deriving it.

**Outcome.** You will be able to design the four records, state which is authoritative and which are projections, keep the re-anchoring summary bounded while the journal stays complete, and protect the record's integrity so re-anchoring anchors to truth.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** A cold worker (Topic 3) knows *nothing* except what the durable record tells it. If the record is missing information, the worker cannot resume (RI violation). If the record is *wrong*, the worker faithfully builds on a lie (Topic 2's "re-anchoring the wrong thing"). If the record is *too large*, reading it blows the context budget before work begins (Chapter 6). And if the record cannot be trusted — because an untrusted tool output or an earlier hallucination wrote to it — every downstream decision inherits the corruption. The record must be simultaneously **complete, correct, bounded, and trustworthy**, and those pull against each other.

**Objective.** Design a record system where: (i) the *journal* is complete and append-only (nothing lost); (ii) the *ledger* is a correct projection of the journal (state derivable, not independently mutated); (iii) the *progress file* is a bounded, high-signal summary sufficient for cold resume; (iv) the *evidence record* makes every `verified` unit's completion checkable *without* re-running the whole task; and (v) the whole thing resists corruption from untrusted content and model error.

**Assumptions.** (a) Durable storage exists (filesystem, git, DB, object store) that survives process death — the platform substrate of Chapter 14; here assumed. (b) The journal can be made append-only (git history, an event store, an append-only file) — enforced, not hoped.

**Constraints.** The progress file that the re-anchoring read injects must fit a *small* budget (a few hundred to low-thousands of tokens; [MEM]/[CCM] found long instruction files "reduce adherence"). The journal has no such limit — it is on disk, not in the window. This split — bounded summary in context, unbounded history on disk — is the core design constraint.

**Success criteria.** Kill any worker; a fresh worker reads the progress file + ledger, and (a) knows exactly what is done/remaining, (b) can verify any "done" claim from the evidence record, (c) never redoes verified work, and (d) is anchored to *true* state. The journal can reconstruct the ledger if the ledger is lost.

## 3. Intuition first, then formalization

**Intuition.** These four records are the same four things a disciplined engineer keeps on a long project, and they exist because *memory is unreliable and people leave.* The **journal** is the commit history / lab notebook — every step, in order, never rewritten. The **ledger** is the ticket board — current status of each piece, derived from the history. The **progress file** is the standup note / README-for-the-next-shift — short, high-signal, "here's where we are and what's next." The **evidence record** is the attached test output / receipt — *proof* that a closed ticket is really done, not just marked done.

The critical intuition is the **authority hierarchy**: the *journal is the truth*, and everything else is a *view* over it. If the ledger and the journal disagree, the journal wins and the ledger is rebuilt. This is exactly Chapter 7's "event log authoritative, state is a projection," and it is what makes the system self-healing: a corrupted or lost ledger is *recoverable* by replaying the journal, whereas if the ledger were the primary truth, its corruption would be fatal.

The second critical intuition is **separation of the bounded from the unbounded.** The progress file must be small because it goes *into the context window* every session (Chapter 6 budget). The journal must be complete, so it lives *on disk* where size is free. Conflating them — dumping the whole history into the re-anchoring read — reintroduces the context-rot problem (Topic 1) the whole design exists to avoid. **The progress file is a compaction of the journal for the window; the journal is the durable original.** (Note the parallel to Topic 7's context compaction — but here the *original is preserved on disk*, which is exactly what context compaction does not do.)

**Formalization.** Let the journal be an append-only sequence of events $J = \langle e_1, e_2, \dots, e_t \rangle$. Define:

- **Ledger** $L = \pi(J)$: a deterministic projection (fold) over the journal producing current state (unit statuses, frontier, decisions). $L$ is *never* mutated directly; it is *always* $\pi(J)$. (Chapter 7 R-1: state mutation via appending events only, never direct write.)
- **Progress file** $\text{PF} = \text{summarize}(L, J)$: a bounded, high-signal projection for the window, $|\text{PF}| \le B_{\text{PF}}$ (a small budget). Lossy *for the window*, but the loss is recoverable because $J$ persists.
- **Evidence record** $\mathcal{E} = \{ (u, P_u, \text{result}_u, \text{proof}_u) : \text{status}_u = \text{verified} \}$: per verified unit, the predicate, its pass result, and the durable proof (test log, artifact hash, citation). This is the *receipt* (Chapter 7's claim-with-receipt).

**Authority order (the invariant that makes it recoverable):**
$$
J \;\succ\; L \;\succ\; \text{PF}, \qquad L \equiv \pi(J), \quad \text{PF} \equiv \text{summarize}(L,J).
$$
$J$ is authoritative; $L$ and $\text{PF}$ are derived and rebuildable. **Corruption or loss of $L$ or $\text{PF}$ is recoverable by re-projecting $J$; corruption of $J$ is not** — hence $J$ gets the strongest integrity protection (append-only, hash-chained; §6).

**Progress = a journal query.** $\mu = |\{u : \exists\, e \in J,\ e = \text{Verified}(u)\}|$. Because $\mu$ is a *journal fact*, it cannot be inflated by editing the ledger — you would have to forge a journal event, which the integrity chain (§6) detects. This is how the record resists the false-progress hazard (Topic 4's predicate erosion, one layer up).

## 4. Architecture: components, interfaces, data and control flow

**Components and their durable homes.**

| Record | Function | Durable home (typical) | Authority |
|--------|----------|------------------------|-----------|
| Execution journal $J$ | Append-only history | git history + event-store file / DB append-only table | **Authoritative** |
| Task ledger $L$ | Current state | derived file / DB rows, rebuildable from $J$ | Projection |
| Progress file PF | Cold-start summary | `claude-progress.txt` (a git-tracked file) [LRH] | Projection (curated) |
| Evidence record $\mathcal{E}$ | Per-unit proof | test logs, artifact hashes, citations (git-tracked / object store) | Receipt |

**Interfaces.**
- **Worker → journal:** `append(event)` only. No direct state mutation (Chapter 7).
- **Journal → ledger:** `project()` — deterministic fold; run on demand or maintained incrementally.
- **Ledger + journal → progress file:** `summarize()` — the worker *writes* the next progress file at handoff (it curates what the successor needs); or a deterministic summarizer produces it.
- **Worker → evidence record:** on `done→verified`, attach the predicate result and proof.
- **Cold worker ← progress file + ledger + evidence:** the re-anchoring read (Topic 2).

**Control flow (a worker session):**

```
start:   read PF + L + (evidence for adjacent units)      # re-anchor, bounded
step:    do work
         append events to J (action, tool call, outcome)  # authoritative, per step (Topic 9)
verify:  run P_u; append Verified(u) + attach proof to E   # receipt
handoff: rebuild L = project(J); write next PF = summarize(L, J)   # curate for successor
```

**Data-flow rule (the CL-1 enforcement point).** Every fact that must survive the session is written to $J$ (and surfaced in $L$/PF) *at the step that produces it*, not at handoff. Deferring persistence to handoff means a crash before handoff loses the session's work — reintroducing P2. Per-step journaling is the RPO mechanism (Topic 8).

**[LRH]'s concrete instantiation.** The `claude-progress.txt` is the progress file; git commits ("descriptive commit messages") are the journal; the pass/fail feature registry is the ledger's unit-status projection; the test outputs are the evidence. [LRH] leverages git to "revert bad changes and recover working base states" — i.e., the git history *is* the append-only journal supporting rollback (Topic 11).

## 5. Grounding: primary sources and reproducible evidence

**The progress file.** [LRH] grounds `claude-progress.txt` directly: agents maintain it "as the primary state bridge," enabling them to "quickly understand the state of work when starting with a fresh context window." This is the progress-file-for-cold-start design, verbatim.

**Git as the journal and rollback substrate.** [LRH]: "the system leverages git commits with 'descriptive commit messages' to enable reverting bad changes and recovering working base states." Git history is an append-only journal (commits are immutable, identified by content hash) that supports the ledger projection (what's built) and rollback (Topic 11). This grounds the journal-is-authoritative, state-is-derived design in a shipped system.

**Evidence records = end-to-end test outputs.** [LRH]'s end-to-end testing tools and the feature-test registry ground the evidence record: a unit is `verified` because a *test passed*, and that test output is the durable proof. [HDA]'s evaluator "exercises running applications directly rather than scoring static artifacts," and its findings ("routing bugs, missing event handlers, API endpoint ordering issues") are evidence records of *failures* — the same mechanism producing the receipt.

**File-mediated handoff.** [HDA]: "Communication was handled via files: one agent would write a file, another agent would read it and respond either within that file or with a new file." This grounds the progress file / handoff artifact as the inter-session (and inter-agent) communication channel — the durable record *is* the channel, consistent with RI (Topic 3).

**Claim-with-receipt.** Chapter 7 Topic 9 ([MEM]) grounds the evidence record's role: memory (and here, a completed unit) is a *claim* that must carry provenance and be checkable, not a bare assertion. The evidence record is the receipt attached to each `verified` claim.

**Reproducible evidence.** The authority hierarchy is testable: corrupt the ledger, re-project the journal, verify the ledger is restored (E1). The bounded-summary discipline is testable: measure PF token size across a long run and confirm it stays within budget while $J$ grows unbounded (E2).

## 6. Implementation: schemas, integrity, and the bounded summary

**Journal event schema (append-only):**

```json
{ "seq": 1043, "ts": "...", "session": "w-17", "type": "unit_verified",
  "unit": "u_audio_record", "predicate_ref": "tests/...::test_roundtrip",
  "result": "pass", "proof": {"log_hash": "sha256:...", "artifact": "clip.wav@v3"},
  "prev_hash": "sha256:...", "hash": "sha256:..." }
```

**Integrity — hash-chaining the journal.** Each event carries `prev_hash` (the previous event's hash), forming a tamper-evident chain (a lightweight Merkle/blockchain-style log; git already does this via commit parent hashes). Benefit: a forged or altered event breaks the chain and is detectable — this is what protects $\mu$ from being inflated by a fabricated `unit_verified` event. **Security note (Chapter 12 territory):** if untrusted tool output or model hallucination could write a `unit_verified` event, false progress enters the authoritative log. Mitigation: only the *verifier* (running $P_u$, Topic 14), not the working model's assertion, may append `unit_verified`; this is Chapter 7's write-gate W-2 (untrusted ≠ authoritative) applied to the journal.

**Ledger projection (deterministic fold):**

```python
def project(journal):
    L = {u: "pending" for u in decomposition}
    for e in journal:                      # replay in order
        if e.type == "unit_started":  L[e.unit] = "in_progress"
        if e.type == "unit_claimed":  L[e.unit] = "done"
        if e.type == "unit_verified": L[e.unit] = "verified"   # only source of mu
    return L
```

Because $L = \text{project}(J)$ is pure, a lost or corrupted ledger is rebuilt by re-running `project` over $J$. This is the self-healing property.

**The bounded progress file (curated at handoff).** The progress file must contain *exactly* what a cold worker needs and no more:

```
# claude-progress.txt  (target: < ~1-2k tokens)
OBJECTIVE: <verbatim>            # anti-drift (Topic 2)
HARD CONSTRAINTS: <verbatim>      # anti-forgotten-constraint; NEVER dropped
DONE (verified): u1, u3, u7 ...   # count = mu; anti-repeat
IN PROGRESS: u9 — <state, decisions, rationale>   # RI: decisions, not just status
NEXT: u10, u11 (deps ready)
KNOWN ISSUES / DECISIONS: <the non-obvious choices a successor must not re-litigate>
```

Note "IN PROGRESS" carries *decisions and rationale* — this is the RI enforcement (Topic 3): the successor must be able to continue the in-flight unit without re-deriving the current worker's undocumented reasoning. The hard constraints are re-stated verbatim every time (Topic 2: forgotten-constraint mitigation; they are *never* summarized away).

**Two compactions, one preserved original.** The progress file is a *lossy* compaction of $J$ *for the window* — but crucially, $J$ is preserved on disk. Contrast Topic 7's *context* compaction, which discards the original. This is the safe kind of compaction: summarize for the window, keep the original durable. It is why the ledger/journal design is *more* reliable than in-context compaction alone.

## 7. Trade-offs

- **Completeness (journal) vs boundedness (progress file).** The journal must capture everything (or you cannot rebuild/audit); the progress file must be small (or it blows the budget and reduces adherence, [CCM]). Resolving this is the *point* of the two-record split — complete on disk, bounded in context. The cost is maintaining both and the `summarize` step; the payoff is you never trade completeness against context budget.
- **Curation quality vs cost.** A worker curating the next progress file at handoff spends tokens deciding what matters. A poor summary drops something the successor needs (RI violation → stall/redo); a bloated one wastes budget. [LRH]/[HDA] rely on the *agent* curating the handoff — which is itself fallible; a handoff-completeness check (does PF let a cold worker resume?) is worth the extra step.
- **Integrity strength vs overhead.** Hash-chaining the journal costs little (git does it free) and buys tamper-evidence. Full cryptographic signing (per-writer keys) costs more and is warranted only when the threat model includes a compromised writer (Chapter 12). Default to hash-chaining; sign only under a real threat.
- **Evidence granularity vs storage.** Storing full test logs / artifact snapshots per unit makes every `verified` independently checkable but consumes storage. Storing only hashes is cheap but requires the artifacts to persist (Topic 6). The trade: pay storage for self-contained auditability, or pay a dependency on artifact retention. For long runs, keep at least hashes + the ability to re-run predicates.
- **Journal growth vs replay cost.** An unbounded journal makes `project()` slower over a very long run. Mitigation: periodic *checkpoint snapshots* of $L$ (Topic 8) so `project` only replays events *since* the last snapshot — the standard event-sourcing snapshot optimization (Chapter 3, Chapter 7). The journal stays complete; replay stays bounded.

## 8. Experiments: baselines, ablations, metrics

**E1 — Self-healing (authority hierarchy).** Corrupt or delete the ledger $L$ mid-run; trigger recovery. **Prediction:** `project(J)` fully restores $L$; the run continues without loss. Baseline: a design where $L$ is primary (no journal) — corruption is fatal. Metric: recovery success, work lost. This validates $J \succ L$.
**E2 — Bounded-summary discipline.** Over a long run, measure the progress-file token size and the journal size. **Prediction:** PF stays within budget (roughly constant); $J$ grows linearly. If PF grows with $J$, the summarizer is failing and context rot returns. Metric: PF token size vs step count; correlate PF size with adherence to hard constraints (does a bloated PF lose constraints?).
**E3 — Handoff-completeness ablation.** Compare agent-curated progress files with and without a completeness check ("can a cold worker resume from this alone?"). **Prediction:** without the check, some handoffs omit in-progress rationale → successor stalls or redoes (RI violation, Topic 3 E1); with it, resume rate rises. Metric: cold-resume success rate, redo rate.
**E4 — Journal-integrity ablation.** Attempt to inflate $\mu$ by writing a `unit_verified` event without running $P_u$. **Prediction:** with the write-gate (only verifier appends `unit_verified`) + hash chain, the forgery is blocked or detected; without it, false progress enters the log. Metric: false-progress injection rate.

**Honest status.** [LRH] grounds the *design* (progress file, git journal, test-based evidence) and states it works, without publishing recovery rates, PF-size curves, or resume-rate numbers. The self-healing and integrity properties (E1, E4) follow from event-sourcing theory (Chapter 3/7) and are reproducible, but the sources report no metrics. Mechanism grounded; magnitudes yours.

## 9. Failure modes, edge cases, hazards, limitations

- **Ledger-as-primary (the anti-pattern).** Treating the ledger as the source of truth and mutating it directly (no journal) means corruption is unrecoverable and progress can be silently edited. Mitigation: journal is authoritative, ledger is `project(J)`, mutation via append only (Chapter 7).
- **Progress-file drift from journal.** The curated PF says a unit is done; the journal (and reality) disagree (a bad `summarize`, or a manual edit). Mitigation: PF is *derived*, never hand-authored as truth; on suspicion, re-derive from $J$; the journal wins.
- **Untrusted write to the journal (security).** A prompt-injection or hallucination causes a false `unit_verified` or a fabricated constraint. This corrupts the anchor every future session re-reads (Topic 2's "re-anchoring the wrong thing," now weaponized). Mitigation: write-gate W-2 (only the verifier appends completion; untrusted content is data, not authority — Chapter 7, Chapter 12); hash-chain for tamper-evidence.
- **Summary loses the constraint.** The `summarize` step drops a hard constraint to save tokens; a later session violates it (Topic 2). Mitigation: hard constraints are *never* summarized — copied verbatim into every PF (a non-negotiable field).
- **Journal bloat → slow replay.** Very long runs make `project(J)` expensive. Mitigation: periodic ledger snapshots (Topic 8); replay only since the last snapshot.
- **Edge case: non-code domains.** For research/ops, the "journal" is an event log of searches/actions and the "evidence" is citations/state assertions rather than test logs. The structure holds; the instances change. [LRH]/[HDA] ground the code instance; the research/ops instance is a **[synthesis]** (well-supported by Chapter 9's citation agent and Chapter 7's claim-with-receipt, but not the same shipped system).
- **Limitation.** The four-record separation is a clarifying **[synthesis]**; real systems often collapse them ([LRH]'s git-history-plus-progress-file-plus-test-registry is three of the four in practice). The value is knowing *which function each serves* — especially which is authoritative — not insisting on four separate stores.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- A durable progress file that a fresh session reads first is the grounded "primary state bridge" for cold resume [LRH].
- Git history serves as the append-only journal and the rollback substrate ("revert bad changes, recover working base states") [LRH].
- Completed units are certified by *test outputs*, and evaluators produce evidence by *exercising the running system*, not scoring static artifacts [LRH][HDA].
- Inter-session communication is file-mediated (the durable record is the channel) [HDA].

**Decision rules.**
- **DR-1.** Make the journal authoritative and append-only; make the ledger a deterministic projection; make the progress file a bounded, curated summary. If ledger and journal disagree, the journal wins.
- **DR-2.** Persist every survival-critical fact to the journal *at the step that produces it*, not at handoff (RPO, Topic 8; CL-1, Topic 1).
- **DR-3.** Keep the progress file small and copy hard constraints into it *verbatim* every session — never summarize a constraint away.
- **DR-4.** Only the verifier may append `unit_verified`; untrusted content and model self-assertion are data, not authority (W-2). Hash-chain the journal for tamper-evidence.
- **DR-5.** Attach a durable evidence record (test log / hash / citation) to every `verified` unit, so any completion claim is checkable without re-running the task.

**Production implications.** The durable record is what a long-running agent *actually is* between sessions — the agent process is transient, but the record persists and defines the run. Getting its authority hierarchy right (journal wins, ledger and progress file derive) is what makes the system self-healing: lost ledgers rebuild, corrupted summaries re-derive, and only the append-only, integrity-protected journal needs strong durability. This is the same architecture as production event-sourced systems (Chapter 14), scoped to one agent's task.

**Connections.** The record is the concrete form of Topic 1's Rule CL-1 and Chapter 7's state-as-projection. The progress file drives Topic 2's re-anchoring read. The ledger's $\mu$ is Topic 3's progress measure and Topic 12's stop input. Evidence records are Topic 4's predicates' outputs and Chapter 7's claim-with-receipt. Journal snapshots are Topic 8's checkpoints. The write-gate is Chapter 7 W-2 and Chapter 12's injection defense. Restart-safe *writing* to the journal is Topic 9. Artifacts the evidence points to are Topic 6.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (`claude-progress.txt` as "primary state bridge"; "quickly understand the state of work when starting with a fresh context window"; git commits with descriptive messages to "revert bad changes and recover working base states"; feature-test registry; end-to-end test evidence).
- **[HDA]** Anthropic — *Harness design for long-running apps* (file-mediated handoff; evaluator "exercises running applications directly rather than scoring static artifacts"; concrete evidence of failures — routing bugs, missing handlers, endpoint ordering).
- **[MEM]** Memory survey — claim-with-receipt; raw event streams → semantic fact bases. Via Chapter 7.
- **[CCM]** Anthropic — *Claude Code memory* (long files reduce adherence; context not enforced → hook). Via Chapter 7.
- Internal: Chapter 3 Topic 4 (event log authoritative, snapshots), Chapter 7 Topics 3/9 (state as projection, mutation via append, write-gate W-2, claim-with-receipt), this chapter Topics 1 (CL-1), 2 (re-anchoring), 3 (RI, $\mu$), 4 (predicates/evidence), 6 (artifacts), 7 (context compaction contrast), 8 (checkpoints/snapshots), 9 (restart-safe writes), 12 (verified stop), 14 (verifier).
