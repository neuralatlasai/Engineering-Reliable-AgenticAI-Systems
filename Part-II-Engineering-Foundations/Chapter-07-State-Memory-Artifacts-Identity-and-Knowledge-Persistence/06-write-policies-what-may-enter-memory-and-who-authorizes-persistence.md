# Topic 6 — Write Policies: What May Enter Memory and Who Authorizes Persistence

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The gate on the *write* path to memory: what is allowed to persist, who authorizes it, and how untrusted content is prevented from writing itself into a durable store. This is Chapter 5, Topic 10 (authorization) and Topic 12 (untrusted content) applied to the memory-write boundary — the highest-stakes write in an agent, because it persists.

**Prerequisites.** Topic 5 (memory types, each with a write trigger); Chapter 5, Topic 10 (the confused-deputy fix, $\alpha_u$); Chapter 5, Topic 12 (CP-1, untrusted content); Chapter 8's persistence-injection vector (previewed).

**Terminology.** *Write policy*: the predicate governing whether a candidate memory may persist. *Persistence authorization*: who may authorize a write, over what scope. *Memory poisoning*: an adversary causing malicious content to enter durable memory.

**Boundaries.** Inside: the write gate, its authorization, and its untrusted-content defense. Outside: the read path (Topic 7); what happens to written memory (Topic 8); tenancy enforcement (Topic 14).

**Exclusions.** No content-moderation model survey.

**Outcomes.** The reader can write a memory-write policy that authorizes by principal and scope, rejects untrusted content from becoming authoritative, and makes persistence a deliberate, audited act.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** A memory write is not like a context inclusion — it *persists*, across sessions, and is later retrieved *as authoritative* (Topic 1). So the stakes are higher than any single turn: a bad context inclusion pollutes one turn; a bad memory write pollutes every future retrieval. And the memory-write path is uniquely dangerous because agents write memory *from content they process* — including untrusted content (a web page, a tool result, a user message that is itself an injection). **An injection that reaches memory becomes a persistent injection, firing on every future run** (Chapter 8's persistence vector).

**Bottleneck.** Memory writes are usually ungated. The agent decides to "remember" something and it persists — no authorization check, no trust classification, no policy. This is Chapter 5, Topic 10's confused deputy (the write runs with the agent's authority, not the user's) and Topic 12's CP-1 violation (untrusted content becomes authoritative) *combined and made durable*.

**Objective.** A write gate that (i) authorizes by the *acting principal* and *scope* (Topic 2), (ii) refuses untrusted content the status of authoritative memory, and (iii) makes every persistence an auditable event (Topic 3).

**Assumptions.** The agent will attempt to persist untrusted content it processed. An injection will try to write itself to memory. Both are certainties (Chapter 5, Topic 12).

**Constraints.** The agent must still write *legitimate* memory — the gate cannot be "deny all." Some memory (auto-memory, [CCM]) is written by the agent itself.

**Success criteria.** No untrusted content becomes authoritative memory; every write is authorized by principal and scope; every persistence is audited; a poisoned memory is traceable to its source (Topic 9).

## 3. Intuition first, then formalization

### 3.1 Intuition: persistence is a privileged act

Writing to memory should feel like a *commit*, not a note. A note is cheap and local; a commit is durable and consequential, and it deserves review. The reframe: **a memory write is the most privileged action an agent takes, because it is the only one whose effect outlives the run and shapes every future run.**

Three questions must be answered before any content persists **[synthesis; grounded in Chapter 5, Topics 10, 12]**:

1. **Who is authorizing this?** — the acting principal (Chapter 5, Topic 10). A write on behalf of user A must be scoped to user A (Topic 2's `user:`), not to the agent's service identity. Otherwise it is a confused deputy that can write into any user's memory.
2. **Is this content trustworthy enough to become authoritative?** — the trust class (Chapter 5, Topic 12). Content derived from untrusted sources (web, email, tool results, sub-agents) must not become authoritative memory that later retrievals treat as fact. **This is the persistence version of CP-1.**
3. **Should this persist at all?** — the write policy. Not everything the agent processes deserves durable memory; over-writing pollutes the store (Chapter 5, Topic 15's saturation, at the memory layer) and inflates cost.

The intuition that ties it together: **the memory-write gate is the same gate as the tool-admission gate (Chapter 5, Topic 10), applied to the write "action," and it must read the same three inputs — principal, arguments (the content), and trust — that $\alpha_u$ reads.** A system that gates tool calls but not memory writes has left its most consequential action ungated.

### 3.2 Formalization: the write gate

A candidate memory write is $(m, \rho, \sigma, \theta, p)$ = (content, type, scope, trust class, acting principal). The write gate is a predicate **[synthesis]**:

$$
\operatorname{may\_persist}(m, \rho, \sigma, \theta, p)=
\underbrace{\alpha_{\text{mem}}(\sigma, p)}_{\text{principal may write at this scope}}
\ \wedge\
\underbrace{W(\theta, \rho)}_{\text{trust permits this type}}
\ \wedge\
\underbrace{V(m, \rho)}_{\text{content valid for the type}} .
$$

Three invariants **[derived from Chapter 5, Topics 10, 12]**:

$$
\textbf{W-1 (principal-scoped write):}\quad
\alpha_{\text{mem}}(\sigma, p)\ \text{true only if } p\ \text{may write at scope } \sigma\ (\text{Topic 2}).
$$

W-1 is the confused-deputy fix at the write path: a `user:`-scoped write must be authorized by *that user's* principal, so the agent cannot write into user B's memory while acting for user A. **Without W-1, memory is a cross-tenant write primitive** (Topic 14).

$$
\textbf{W-2 (untrusted content cannot become authoritative):}\quad
\theta(m)=\mathsf U\ \Longrightarrow\ m\ \text{may enter memory only as } \theta\text{-tagged, non-authoritative, or not at all.}
$$

W-2 is CP-1 for persistence: content from an untrusted source (Chapter 5, Topic 12) must not become authoritative memory. Either it is stored *with its untrusted provenance preserved* (Topic 9 — so retrieval knows to distrust it) or it is refused. **The failure W-2 prevents: an injection in a web page the agent read gets "remembered" as a fact, and every future retrieval treats it as ground truth.** This is the persistence-injection vector, closed at the write.

$$
\textbf{W-3 (persistence is audited):}\quad
\text{every write is an event (Topic 3) recording content, type, scope, trust, principal, and timestamp.}
$$

W-3 makes memory writes reconstructible and traceable (Topic 3): a poisoned memory can be traced to the write that introduced it, and a right-to-erasure (Topic 14) can find everything a principal wrote.

### 3.3 The auto-memory case: the agent authorizes its own writes

[CCM]'s auto-memory is a live instance of this problem: "notes Claude writes itself based on your corrections and preferences" — the agent decides "what's worth remembering based on whether the information would be useful in a future conversation" [CCM]. **The agent is the write-authorizer**, which is convenient and is exactly the case W-2 must handle carefully: if the agent processed untrusted content and decides to "remember" it, the untrusted content persists on the agent's own authority.

[CCM]'s mitigations are instructive: auto-memory is **plain, inspectable markdown** the user can "edit or delete at any time" [CCM]; it is machine-local (not silently shared); and it is bounded (the first 200 lines / 25KB of `MEMORY.md` load). **Inspectability is the compensating control for agent-authorized writes** — the user can audit what the agent chose to remember and delete poison. This is the pattern for any auto-memory: if the agent authorizes its own writes, the writes must be *inspectable and reversible*, because the authorization is weak (the agent, not a human, decided).

Contrast with [CCM]'s stronger boundary for *enforcement*: "To block an action regardless of what Claude decides, use a PreToolUse hook instead" — because CLAUDE.md and auto-memory are "context, not enforced configuration" [CCM]. **The write policy is enforcement; the memory content is guidance.** A memory write that must be *prevented* (not just remembered-then-reviewed) needs a hook (a deterministic gate), not a memory instruction — Chapter 5, Topic 10's principle that guarantees come from code, not from asking the model.

## 4. Architecture

```
   agent decides to persist  (m, ρ, σ, θ, p)
        │
        ▼
   ┌── WRITE GATE (the same shape as tool-admission α_u, Ch.5 T10) ──────────┐
   │                                                                         │
   │  α_mem(σ, p):  may THIS principal write at THIS scope?    (W-1)         │
   │      fail → reject (confused-deputy prevention, Topic 14)               │
   │                                                                         │
   │  W(θ, ρ):  θ=U content → NOT authoritative                (W-2, CP-1)   │
   │      untrusted → store θ-tagged (Topic 9) or refuse                     │
   │      "injection in a web page becomes a permanent fact" ← BLOCKED HERE  │
   │                                                                         │
   │  V(m, ρ):  valid for the type? (preference single-valued, etc. Topic 5) │
   └────────────────────────────────┬────────────────────────────────────────┘
                                     │ pass
                                     ▼
   WRITE as an EVENT (W-3, Topic 3): content, type, scope, trust, principal, ts
                                     │
                                     ▼
   memory store (typed, Topic 5) → later RETRIEVAL (Topic 7) treats provenance (Topic 9)

   AUTO-MEMORY (§3.3): agent authorizes → writes must be INSPECTABLE + REVERSIBLE [CCM]
   HARD BLOCK needed? → PreToolUse hook, not a memory instruction [CCM]
```

**The write gate is the tool-admission gate.** This is the architectural payoff: you already built $\alpha_u$ for tool calls (Chapter 5, Topic 10), reading principal, arguments, and state. The memory-write gate reads principal, content, and trust — the *same shape*. **Do not build a second, weaker authorization system for memory; reuse the tool-admission gate, treating "persist" as an action with the content as its argument.** A system with strong tool authorization and ungated memory writes has an inconsistent security boundary that the persistence path defeats.

## 5. Grounding

- **Authorization by principal and content:** permissions "should depend not only on tool identity, but also on arguments, environment state, data sensitivity, and expected side effects" [CAH §5] — W-1 (principal) and the content-dependence of the gate. A memory write is a side effect with data sensitivity.
- **The confused-deputy fix** is Chapter 5, Topic 10 (thread the acting principal, not the agent's identity) — W-1's basis.
- **Untrusted content must not act as control / become authoritative** is Chapter 5, Topic 12 (CP-1) — W-2's basis, extended from "act" to "persist."
- **Persistence is a governed harness state:** "high-stakes approvals should be auditable state transitions: what action was proposed, what evidence was shown, what risks were surfaced, who approved or rejected it" [CAH §5] — W-3, applied to memory writes.
- **Post-use hooks can update memory:** "post-use hooks can sanitize outputs, compact logs, **update memory**, or trigger follow-up verification" [CAH §3.3.4] — the write gate lives in the post-use hook, and sanitization (W-2) happens there.
- **Auto-memory as agent-authorized, inspectable writes:** "notes Claude writes itself"; the agent "decides what's worth remembering"; plain markdown you can "edit or delete at any time"; machine-local; bounded load [CCM] — §3.3's pattern, shipped.
- **Enforcement vs guidance:** "To block an action regardless of what Claude decides, use a PreToolUse hook instead"; CLAUDE.md and auto-memory are "context, not enforced configuration" [CCM] — the write *policy* is enforcement (a hook/gate); the memory *content* is guidance.
- **Consolidation is governed by "deduplication and consistency checking"** [MEM] — the write path into semantic memory has its own validity checks (V, and Topic 8).
- **The persistence-injection vector** is Chapter 5, Topic 12, §9 and Chapter 8 (memory as a persistence vector) — W-2 is its closure.

**Evidence gap.** The authorization and untrusted-content principles are documented [CAH §5, §3.3.4; CCM], and the write gate is **[synthesis]** — reusing the tool-admission gate for memory writes. **No source measures memory-poisoning rates or write-gate effectiveness** (Chapter 5, Topic 12's injection-defense gap persists here, made durable). The claim that ungated memory writes are the persistence-injection vector is **reasoned from the composition** (untrusted content + persistence + authoritative retrieval), grounded in the documented mechanisms, not measured. W-2's target (zero untrusted content becoming authoritative) is an architectural aspiration backed by CP-1, not a measured guarantee.

## 6. Implementation

**The write gate — reuse the tool-admission gate (§4):**

```python
def may_persist(m: Candidate, ctx: RequestContext) -> Decision:
    """The memory-write gate. Same shape as tool-admission α_u (Ch.5 T10):
    reads principal, content, trust — NOT the model's say-so."""

    # W-1: principal-scoped write. A user:-scoped write needs THAT user's principal.
    if not ctx.acting_principal.may_write(scope=m.scope, mtype=m.mtype):
        return Decision.deny(f"principal {ctx.acting_principal.id} may not write "
                             f"{m.mtype} at scope {m.scope} — confused-deputy prevention")

    # W-2 / CP-1: untrusted content cannot become AUTHORITATIVE memory.
    if m.trust is Trust.UNTRUSTED:
        if m.mtype in AUTHORITATIVE_TYPES:              # semantic facts, preferences
            # An injection in a web page must NOT become a permanent 'fact'.
            return Decision.store_untrusted(m)          # keep, θ-tagged (Topic 9), non-authoritative
        # else: episodic (it's a record of an untrusted observation — fine, tagged)

    # V: valid for the type (Topic 5's per-type validity)
    if not valid_for_type(m):
        return Decision.deny(f"content invalid for {m.mtype}")

    return Decision.allow()

def persist(m: Candidate, ctx) -> None:
    decision = may_persist(m, ctx)
    if decision.denied:
        return
    # W-3: the write is an EVENT (Topic 3) — auditable, traceable, erasable.
    ctx.event_log.append(Event(
        kind="memory_write",
        payload={"content": m.content, "type": m.mtype, "scope": m.scope,
                 "trust": m.trust, "principal": ctx.acting_principal.id},
        timestamp=utcnow(),
    ))
    ctx.memory.write(m, provenance=m.provenance)        # Topic 9 carries trust forward
```

**Auto-memory with the compensating controls (§3.3, [CCM]):**

```python
class AutoMemory:
    """Agent authorizes its own writes → MUST be inspectable + reversible [CCM]."""
    def remember(self, note, ctx):
        # Still passes the gate — agent authority is weak, so W-2 matters MORE here.
        if may_persist(note, ctx).denied:
            return
        self.write_markdown(note)                       # plain, inspectable markdown [CCM]
        # user can /memory → edit or delete at any time (reversibility is the control)

    # HARD block (not "remember then review")? → a PreToolUse hook, not a memory note [CCM].
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Gated writes (W-1..W-3) | No cross-tenant writes; no persistent injection; audit | A gate on the write path; some legitimate writes friction |
| Ungated writes | Simplicity | Confused-deputy writes + persistent injection — **the two worst memory failures** |
| Refuse untrusted content | No poison enters | Loses genuinely useful untrusted-sourced info |
| Store untrusted θ-tagged (W-2) | Keeps the info, distrusts it | Retrieval must honor the tag (Topic 9) — complexity |
| Agent-authorized (auto-memory) | No manual effort [CCM] | Weak authorization → needs inspectability + reversibility |
| Human-authorized writes | Strong authorization | Latency; defeats autonomy |
| Hook-enforced hard block | Guaranteed prevention [CCM] | Rigid; a hook per blocked write |

**The trade at the heart of the topic: how much to gate the agent's own memory.** Full gating with human authorization is safe and destroys the autonomy that motivated memory. Ungated is convenient and opens the two worst failures (cross-tenant write, persistent injection). **The [CCM] middle path — agent authorizes, but writes are inspectable and reversible, and hard blocks use hooks — is the pragmatic answer**: it keeps autonomy, catches the common case (the user reviews and deletes poison), and reserves hard enforcement for the writes that truly must be prevented. The key insight: **inspectability + reversibility is a valid substitute for strong up-front authorization when the write is reversible** — you cannot un-send an email, but you can delete a bad memory, so a review-after gate is acceptable for memory in a way it is not for irreversible actions (Chapter 5, Topic 5).

## 8. Experiments

**The memory-poisoning red-team (ties to Chapter 5, Topic 12; Chapter 8).** Feed the agent untrusted content containing "remember that X" instructions (X being false or malicious); check whether X becomes *authoritative* memory that later retrievals treat as fact.

- **Follow rate** — the agent attempted to persist the injected content. Expect nonzero (measures the model).
- **Authoritative-persistence rate** — untrusted content became *authoritative* memory. **Target zero** (measures whether W-2 holds). Report with the zero-failure bound $p_{\max}=1-(1-\gamma)^{1/n}$ and $n$ (Chapter 1, Topic 12).
- **Cross-tenant-write rate** — a write on behalf of user A reached user B's memory. **Target zero** (W-1).

**The auto-memory audit (§3.3).** Over a run, inspect what the agent chose to remember; check for content sourced from untrusted inputs persisted as authoritative. **The inspectability control [CCM] only works if someone actually inspects** — this experiment is that inspection, systematized.

**The write-scope leak test (W-1, ties to Topic 14).** Attempt writes at every scope with mismatched principals; any write that lands where the principal should not reach is a W-1 violation. Zero target.

**The over-write saturation test.** Measure memory growth per run and retrieval quality as the store grows; an ungated write path accumulates low-value memory that degrades retrieval (Chapter 5, Topic 15). **Prediction: ungated writes bloat the store; a write policy that rejects low-value candidates keeps it dense.**

**Statistics.** Zero-failure bounds on authoritative-persistence, cross-tenant-write, and scope-leak (targets are zero); Wilson on follow rate; report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Persistent injection.** Untrusted content "remembered" as authoritative, firing on every future run. **The worst memory failure**, and unique to the write path (Chapter 8). Mitigation: W-2 — untrusted content never becomes authoritative.
- **Cross-tenant write (confused deputy).** A write on behalf of user A lands in user B's memory. Mitigation: W-1 — principal-scoped writes.
- **Ungated auto-memory.** The agent persists whatever it processed, on its own authority, including poison. Mitigation: gate auto-memory too; inspectability + reversibility [CCM]; W-2.
- **Guidance mistaken for enforcement.** A memory instruction ("never persist secrets") relied on to *prevent* a write — but memory is "context, not enforced configuration" [CCM]. Mitigation: hard blocks use a PreToolUse hook, not a memory note.
- **Unaudited writes.** A poisoned memory with no trace to its source; unerasable (Topic 14). Mitigation: W-3 — every write is an event.
- **Over-writing / store bloat.** Ungated writes accumulate low-value memory, degrading retrieval (Chapter 5, Topic 15). Mitigation: a write policy that rejects low-value candidates.
- **Untrusted content refused entirely.** Over-strict W-2 loses genuinely useful info from untrusted sources. Mitigation: store θ-tagged rather than refuse; let Topic 9's provenance/confidence handle the distrust.
- **Edge case — the agent legitimately learns from untrusted content.** A web page teaches a genuinely useful fact. W-2 says it cannot be *authoritative*, but it can be an *episode* ("on 2026-07-01 a web page claimed X") or a *low-confidence semantic fact* pending corroboration (Topic 9). Mitigation: trust is a spectrum via confidence (Topic 9), not a binary refuse/accept.
- **Open limitation.** **No source measures memory-poisoning rates or write-gate effectiveness.** W-2's zero-authoritative-persistence target is an aspiration backed by CP-1 (Chapter 5, Topic 12), not a measured guarantee; the persistence-injection vector is reasoned from composition, not measured. The write gate is **[synthesis]** reusing the documented tool-admission gate.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Permissions must depend on principal, content, and data sensitivity — not the acting identity alone [CAH §5].
2. Post-use hooks "update memory" and "sanitize outputs" [CAH §3.3.4] — the write gate's home.
3. High-stakes persistence should be "auditable state transitions" recording who authorized what [CAH §5].
4. Auto-memory is agent-authorized, inspectable, reversible, machine-local, and bounded [CCM].
5. Memory is "context, not enforced configuration"; hard blocks need a PreToolUse hook [CCM].
6. **No source measures memory-poisoning or write-gate effectiveness.**

**Decision rules.**
- **Gate memory writes with the same gate as tool calls** (principal, content, trust) — do not build a weaker one.
- **Untrusted content never becomes authoritative memory** (W-2) — store θ-tagged or refuse.
- **A user-scoped write needs that user's principal** (W-1) — or memory is a cross-tenant write primitive.
- **Every write is an event** (W-3) — auditable, traceable, erasable.
- **Agent-authorized writes must be inspectable and reversible** [CCM].
- **Hard blocks use hooks, not memory instructions** [CCM].

**Production implications.**
1. Run the memory-poisoning red-team; report authoritative-persistence and cross-tenant-write rates with zero-failure bounds — these are the two worst memory failures.
2. Route memory writes through your tool-admission gate; ungated memory defeats strong tool authorization.
3. Make auto-memory inspectable and audit it (§8); the [CCM] control only works if someone looks.
4. Use hooks for writes that must be prevented, not memory instructions [CCM].

**Connections.** This topic gates the write path Topic 5's types feed; it is Chapter 5, Topic 10's authorization and Topic 12's CP-1, applied to persistence and made durable. Its output is written as a Topic 3 event, carries Topic 9's provenance/trust, and is later read under Topic 7's read policy. W-1 is Topic 14's tenant isolation at the write; W-2 closes Chapter 8's persistence-injection vector. Consolidation into semantic memory (Topic 8) has its own validity checks on this path.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3.4 (post-use hooks "sanitize outputs… update memory… or trigger follow-up verification"), §5 (permissions depending on "arguments, environment state, data sensitivity, and expected side effects"; "high-stakes approvals should be auditable state transitions: what action was proposed, what evidence was shown, what risks were surfaced, who approved or rejected it")
[CCM] Claude Code memory model — auto-memory as "notes Claude writes itself"; the agent "decides what's worth remembering based on whether the information would be useful in a future conversation"; plain markdown you can "edit or delete at any time"; machine-local; bounded load; "To block an action regardless of what Claude decides, use a PreToolUse hook instead"; CLAUDE.md/auto-memory as "context, not enforced configuration" — https://code.claude.com/docs/en/memory
[MEM] "Memory in the Age of AI Agents: A Survey," arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) — consolidation into semantic memory "governed by procedures for deduplication and consistency checking"
