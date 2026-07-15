# Topic 8 — Duplicate Work, Conflicting Edits, Deadlock, Livelock, and Cascading Hallucination

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The coordination failure catalogue. Four of the five are classical distributed-systems failures wearing agent clothes; **the fifth — cascading hallucination — is new, is the worst, and has no analogue in ordinary distributed systems.**

**Prerequisites.** Topic 2 (the duplicate-work tax); Topic 5 (diversity and dissent); Topic 7 (message contracts and ordering); Chapter 8, Topics 4 and 11 (write races, deadlock, termination — the single-agent versions).

**Terminology.** *Duplicate work*: agents doing the same thing. *Conflicting edits*: agents writing incompatible changes. *Deadlock*: agents blocked on each other. *Livelock*: agents active, no progress. *Cascading hallucination*: one agent's fabrication becomes another's premise.

**Boundaries.** Inside: the five failures, their detection, and their prevention. Outside: the topology that invites them (Topic 4); the protocols (Topics 9–11).

**Exclusions.** No distributed-systems failure-theory survey; the classical four are treated as they manifest with agents.

**Outcomes.** The reader can detect and prevent all five, and understands why the fifth is categorically different and needs a defense the other four do not.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Multiple agents sharing a task and (sometimes) a workspace produce failures that a single agent cannot: they duplicate each other's work, overwrite each other's edits, wait on each other forever, thrash without progress, and — uniquely — **believe each other's fabrications.**

**Bottleneck.** Four of the five have known solutions from distributed systems (bounded work assignment, single-writer ownership, cycle detection, progress measures — all covered in Chapter 8). **The fifth does not.** **Cascading hallucination is a failure mode that ordinary distributed systems do not have, because ordinary components do not *make things up*.** An agent that fabricates a fact and passes it to another agent — which treats it as an *observation* and builds on it — produces a system-wide false belief with a plausible provenance chain. **And the receiving agent has no way to tell.**

**Objective.** Detect and prevent all five, with a defense for cascading hallucination that does not depend on agents catching each other's fabrications (they cannot).

**Assumptions.** Agent output is model-generated and therefore fabricable (Chapter 5, Topic 2: $g_{\mathrm{det}}=0$; [FSC §6.3.5]'s measured unsupported-completion propensity).

**Constraints.** Agents cannot reliably detect each other's hallucinations — they are the same kind of system, with the same failure mode.

**Success criteria.** Duplicate work measured and low; edits serialized; no deadlock; loops progress; **and every inter-agent claim is grounded in a verifiable source, not in another agent's assertion.**

## 3. Intuition first, then formalization

### 3.1 Intuition: four old failures and one new one

**The four classical failures, in agent form:**

1. **Duplicate work.** [MAR]'s documented instance: **"one subagent explored 2021 automotive chip crisis while two others duplicated 2025 supply chain work"** [MAR] — **2 of 3 subagents redundant.** *Cause:* vague delegation. *Fix:* explicit `boundaries` in the delegation contract (Topic 5's PE-1). **This is a coordination failure with a prompt-level fix.**

2. **Conflicting edits.** Two agents write incompatible changes to a shared artifact (a file, a document, a database row). *Cause:* concurrent writes to shared mutable state. *Fix:* **single-writer ownership** (Chapter 8, Topic 4's A-2) — the same fix as the single-agent blackboard, and [OMA] names the hazard directly: prefer one agent when "**agents contend over shared mutable state**" [OMA].

3. **Deadlock.** Agent A waits for B; B waits for A. *Cause:* a cycle in the wait-for graph. *Fix:* **cycle detection** (Chapter 8, Topics 4 and 11's A-3/TE-4). **With [OMA]'s `wait_agent` primitive, this is a live hazard** — an agent waiting on a mailbox update that will never arrive.

4. **Livelock.** Agents active, exchanging messages, making no progress. *Cause:* no progress measure. **[MAR]'s "distracting each other with excessive updates"** [MAR] is livelock's signature. *Fix:* **progress measures and message budgets** (Chapter 8, Topic 11's TE-3; Topic 7's budgets).

**These four are known problems with known fixes**, all of which this book has already covered at the single-agent layer. **They are not the reason multi-agent is hard.**

**The fifth failure is why multi-agent is hard:**

5. **Cascading hallucination.** Agent A fabricates a fact ("the company's Q3 revenue was $4.2B"). It reports it to agent B — **as a finding, in a structured message, with the authority of a tool result** (Chapter 5, Topic 2: sub-agent output arrives dressed as an observation). **B treats it as an observation** and builds on it: it searches for context around $4.2B, computes growth rates, and reports *its* findings to the lead. **The lead synthesizes a coherent, well-cited, internally-consistent, completely false analysis.**

**And every agent behaved correctly.** A hallucinated (a known, measured propensity — [FSC §6.3.5]). B trusted its input (as it must — it cannot verify everything). The lead synthesized faithfully. **The error entered once and was *laundered into fact* by every subsequent hop.**

### 3.2 Formalization: the four fixes, and why the fifth needs a different one

**The four classical failures have structural fixes [derived; each from Chapter 8]:**

$$
\textbf{CF-1 (duplicate work):}\quad \text{explicit disjoint task boundaries} \Rightarrow \mathrm{overlap}(f_i, f_j) \approx 0 .
$$
$$
\textbf{CF-2 (conflicting edits):}\quad \text{single-writer ownership: } |W(v)| \le 1\ \forall v\ \text{(Chapter 8, Topic 4's A-2)}.
$$
$$
\textbf{CF-3 (deadlock):}\quad \text{the wait-for graph is acyclic (Chapter 8, Topic 11's TE-4)}.
$$
$$
\textbf{CF-4 (livelock):}\quad \text{a well-founded progress measure } \mu\ \text{decreases (Chapter 8, Topic 11's TE-3)}.
$$

**Cascading hallucination has no such fix, because it is not a coordination failure — it is an *epistemic* one [derived]:**

$$
\textbf{CF-5 (cascading hallucination):}\quad
\text{agent } B \text{ cannot distinguish } A\text{'s \emph{fabrication} from } A\text{'s \emph{observation}, because both arrive as the same message type.}
$$

**The problem is that CF-1..CF-4 are about *coordination* (who does what, who writes what, who waits for whom) and CF-5 is about *truth*.** No amount of coordination discipline prevents an agent from believing a well-formed lie.

**And the obvious fix does not work: you cannot ask agent B to verify agent A's claims**, because B is the same kind of system with the same failure mode — **it will hallucinate its verification.** [FSC §6.3.5]'s propensity applies to B as much as to A.

**The defense must therefore be structural [synthesis]:**

$$
\textbf{CF-5-FIX (ground every inter-agent claim):}\quad
\text{a claim crossing an agent boundary MUST carry a \emph{verifiable source};}\ \text{a claim without one is a \emph{proposal}, not an observation.}
$$

**This is Chapter 5, Topic 2's $g_{\mathrm{det}}=0$ and Chapter 5, Topic 12's trust boundary, enforced at every agent hop.** The mechanism: **agent B receives not "revenue was $4.2B" but "revenue was $4.2B [source: 10-Q filing, URL, page 3]"** — and B (or the harness) can *check* the source. **A claim with no source is marked untrusted and does not become B's premise.**

**This is exactly why [MAR] ships a citation agent** (Topic 5, §3.3): **attribution is not a nicety; it is the only defense against cascading hallucination.** A claim that must be attributed to a *retrievable source* cannot be fabricated without the fabrication being detectable.

### 3.3 Why cascading hallucination is worse in multi-agent than single-agent

A single agent that hallucinates produces one wrong answer. **A multi-agent system that hallucinates produces a wrong answer with a *provenance chain* that makes it look verified** **[synthesis]**:

- The fabrication passes through several agents, each adding corroborating detail.
- The final synthesis is internally consistent (every agent built on the same false premise).
- The output *cites its sources* — which are other agents.
- **It looks more trustworthy than a single agent's hallucination, and it is less so.**

**This is the multi-agent failure that should frighten you.** The architecture that makes the system more capable (Topic 1's 90.2%) also makes its errors more *convincing* — because they arrive with the apparent corroboration of multiple independent investigators, when in fact all of them derived from one fabrication.

**And it compounds with Topic 5's dissent-suppression failure:** if one agent *did* find the correct value and it contradicts the cascaded fabrication, **the synthesizer will smooth away the minority correct finding in favor of the majority fabricated one.** **The two failures compose into a system that is confidently, coherently, and comprehensively wrong.**

## 4. Architecture

```
   THE FOUR CLASSICAL FAILURES — known problems, known fixes (all from Chapter 8)
   ┌─────────────────────┬──────────────────────────┬─────────────────────────────┐
   │ DUPLICATE WORK      │ vague delegation          │ CF-1: explicit BOUNDARIES    │
   │ [MAR]: 2 of 3       │                           │       (Topic 5's PE-1)       │
   ├─────────────────────┼──────────────────────────┼─────────────────────────────┤
   │ CONFLICTING EDITS   │ concurrent writes to      │ CF-2: SINGLE-WRITER          │
   │ [OMA]: "agents      │ shared mutable state      │       ownership (Ch.8 T4 A-2)│
   │ contend over shared │                           │                             │
   │ mutable state"      │                           │                             │
   ├─────────────────────┼──────────────────────────┼─────────────────────────────┤
   │ DEADLOCK            │ wait-for cycle            │ CF-3: CYCLE DETECTION        │
   │ (`wait_agent` [OMA])│                           │       (Ch.8 T11 TE-4)        │
   ├─────────────────────┼──────────────────────────┼─────────────────────────────┤
   │ LIVELOCK            │ [MAR]: "distracting each  │ CF-4: PROGRESS MEASURE       │
   │                     │ other with excessive       │       (Ch.8 T11 TE-3) +      │
   │                     │ updates"                  │       message budgets (T7)   │
   └─────────────────────┴──────────────────────────┴─────────────────────────────┘

   ★ THE FIFTH — CASCADING HALLUCINATION — is CATEGORICALLY DIFFERENT
   ┌───────────────────────────────────────────────────────────────────────────────┐
   │                                                                               │
   │   Agent A ──── "revenue was $4.2B" ────► Agent B ──── builds on it ────► LEAD  │
   │   (FABRICATED)   ↑ arrives as a          (treats it   (searches around $4.2B,  │
   │   [FSC §6.3.5]     structured MESSAGE     as an        computes growth,        │
   │   is a MEASURED    with the authority     OBSERVATION  reports "findings")     │
   │   propensity       of a tool result       — as it MUST;                        │
   │                    (Ch.5 T2: g_det=0)     it cannot                            │
   │                                            verify all)   ▼                     │
   │                                                    SYNTHESIS: coherent,        │
   │                                                    well-cited, internally      │
   │                                                    consistent, COMPLETELY FALSE│
   │                                                                               │
   │   ⚠ EVERY AGENT BEHAVED CORRECTLY. The error entered ONCE and was              │
   │     LAUNDERED INTO FACT by every hop.                                          │
   │                                                                               │
   │   ⚠ WORSE THAN SINGLE-AGENT (§3.3): the output arrives with the apparent       │
   │     CORROBORATION of multiple independent investigators — so it looks MORE     │
   │     trustworthy and is LESS so.                                                │
   │                                                                               │
   │   ✗ YOU CANNOT ASK AGENT B TO VERIFY AGENT A — B is the same kind of system    │
   │     with the same failure mode. It will hallucinate its verification.          │
   │                                                                               │
   │   ✓ CF-5-FIX: GROUND EVERY INTER-AGENT CLAIM IN A VERIFIABLE SOURCE.           │
   │     A claim with no retrievable source is a PROPOSAL, not an observation.      │
   │     ← this is WHY [MAR] ships a CITATION AGENT (Topic 5, §3.3)                 │
   └───────────────────────────────────────────────────────────────────────────────┘

   ⚠⚠ COMPOSES WITH TOPIC 5's DISSENT SUPPRESSION: if one agent found the TRUE value
      and it contradicts the cascaded fabrication, the synthesizer smooths away the
      minority CORRECT finding in favour of the majority FABRICATED one.
      ⇒ confidently, coherently, comprehensively wrong.
```

## 5. Grounding

- **Duplicate work — the documented instance:** "one subagent explored 2021 automotive chip crisis while **two others duplicated 2025 supply chain work**"; caused by vague instructions that left subagents to "misinterpret the task or perform the exact same searches as other agents" [MAR].
- **Conflicting edits — named as a disqualifier:** prefer one agent when "**agents contend over shared mutable state**" [OMA]; and Chapter 8, Topic 4's A-2 (single-writer ownership) is the fix. [CAH §5.2.4] discusses "Transactional Shared Program State and Semantic Conflict Resolution" as an open scaling problem.
- **Livelock — the documented instance:** agents "**distracting each other with excessive updates**" [MAR]; and "scouring the web endlessly for nonexistent sources" [MAR] — **an agent looping on a search that will never succeed.**
- **Deadlock — the primitive that invites it:** `wait_agent` "Wait for mailbox update" [OMA] — an agent can wait for a message that never comes.
- **Error compounding across agents:** "**One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes**"; "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely" [MAR].
- **The hallucination propensity is measured:** unsupported completion claims [FSC §6.3.5]; and it **regressed** across a version step [G56 §1] — **a better model does not fix it.**
- **Sub-agent output is untrusted and arrives with false authority:** Chapter 5, Topic 2 ($g_{\mathrm{det}}=0$; "a sub-agent's 'done' is a claim, not evidence"; the result arrives dressed as a *tool result*, which carries an implicit authority that model text does not).
- **The citation agent is the structural defense:** [MAR] ships a separate "Citation agent: Post-processes to attribute claims to sources," and scores **citation accuracy** as a first-class rubric dimension [MAR].
- **Human evaluation catches what evals miss:** "People testing agents find edge cases that evals miss. These include **hallucinated answers on unusual queries**, system failures, or subtle source selection biases" [MAR] — **hallucination is named as something the automated evals missed.**
- **Implicit state prevents divergence detection:** "agents cannot reliably detect when their internal understanding diverges from the true program state" [CAH] — the epistemic problem, in the harness literature.

**Evidence gap, and it is significant.** **Duplicate work and livelock are documented with concrete instances** [MAR]. **Conflicting edits is named as a disqualifier** [OMA] and an open problem [CAH §5.2.4]. **Deadlock is not documented in any source** — it is inferred from `wait_agent`'s existence [OMA]. **And cascading hallucination is not documented as a multi-agent failure by any source** — **CF-5 is [synthesis]**, composed from measured facts (the hallucination propensity [FSC §6.3.5]; sub-agent output being untrusted [Chapter 5, Topic 2]; [MAR]'s note that human testers found "hallucinated answers" the evals missed). **The cascade mechanism is reasoned, not measured, and no source quantifies it.** §8's experiment would establish it.

## 6. Implementation

**CF-1..CF-4 — the four classical fixes (all from Chapter 8, applied across agents):**

```python
# CF-1 — DUPLICATE WORK: explicit disjoint boundaries (Topic 5's PE-1)
def assign_disjoint_tasks(aspects, subagents) -> list[SubagentTask]:
    return [SubagentTask(objective=a, boundaries=f"Do NOT cover: {others(a, aspects)}")
            for a in aspects]                       # [MAR]'s fix for the 2-of-3 failure

# CF-2 — CONFLICTING EDITS: single-writer ownership (Ch.8 T4's A-2)
class SharedWorkspace:
    def write(self, key, value, agent_id):
        if self._owner[key] != agent_id:
            raise OwnershipViolation(
                f"{agent_id} may not write {key} (owner: {self._owner[key]}). "
                f"[OMA] names 'agents contend over shared mutable state' as a reason to "
                f"prefer ONE agent. Lost updates are SILENT (Ch.5 T5 E3)."
            )
        self._state[key] = value

# CF-3 — DEADLOCK: cycle detection before waiting (Ch.8 T11's TE-4)
def wait_agent(waiter, target, ctx):
    ctx.wait_graph.add_edge(waiter, target)
    if cycle := ctx.wait_graph.find_cycle():
        ctx.wait_graph.remove_edge(waiter, target)
        raise DeadlockDetected(f"wait cycle: {' → '.join(cycle)} — would hang forever")
    ctx.block(waiter, on=target)

# CF-4 — LIVELOCK: progress measure + message budget (Ch.8 T11's TE-3; Topic 7)
def check_progress(ctx):
    if ctx.mu >= ctx.mu_prev:                       # TE-3: no decrease ⇒ no progress
        raise NoProgress("agents active, μ not decreasing — livelock. "
                         "[MAR]: 'distracting each other with excessive updates'.")
```

**CF-5 — the grounded-claim contract: the ONLY defense against cascading hallucination:**

```python
@dataclass(frozen=True)
class GroundedClaim:
    """CF-5-FIX: a claim crossing an agent boundary MUST carry a VERIFIABLE source.
    A claim without one is a PROPOSAL, not an observation (Ch.5 T2's g_det = 0).

    You CANNOT ask agent B to verify agent A — B is the same kind of system with the
    same failure mode ([FSC §6.3.5]'s propensity applies to B too). It will hallucinate
    its verification. The defense must be STRUCTURAL."""
    content: str
    source: Source | None          # a RETRIEVABLE source: URL, doc ID, tool output hash
    asserting_agent: str

    @property
    def is_observation(self) -> bool:
        """Only a claim with a verifiable source is an OBSERVATION.
        Everything else is a PROPOSAL and must be treated as untrusted."""
        return self.source is not None and self.source.is_retrievable()

def receive_from_agent(claim: GroundedClaim, receiver, ctx) -> ContextBlock:
    if not claim.is_observation:
        # CF-5: this is agent A's ASSERTION, not a fact. Do NOT let it become B's premise.
        return ContextBlock(
            content=f"[UNVERIFIED ASSERTION from {claim.asserting_agent}]: {claim.content}",
            trust=Trust.UNTRUSTED,                  # Ch.5 T12
            authority=Authority.NONE,               # Ch.6 T2's H-1 — data, not control
        )

    # Verifiable: the harness can CHECK it. Optionally do so for high-stakes claims.
    if ctx.policy.verify_inter_agent_claims:
        if not ctx.verify(claim.source, claim.content):
            raise HallucinationDetected(
                f"{claim.asserting_agent} asserted {claim.content!r} citing "
                f"{claim.source} — but the source does NOT support it. This is a "
                f"fabrication that would have CASCADED (CF-5)."
            )
    return ContextBlock(content=claim.content, trust=Trust.TRUSTED, source=claim.source)
```

**The citation agent as the systemic check ([MAR]; Topic 5, §3.3):**

```python
def citation_pass(synthesis, all_claims: list[GroundedClaim]) -> CitedSynthesis:
    """[MAR] ships this as a SEPARATE agent — and CF-5 is why it must exist.
    Every claim in the final answer must trace to a RETRIEVABLE source, not to
    another agent's assertion. A claim whose provenance chain terminates in an
    AGENT rather than a SOURCE is a cascaded fabrication."""
    for claim in synthesis.claims:
        chain = trace_provenance(claim, all_claims)
        if chain.terminates_in_agent_assertion():
            raise CascadedFabrication(
                f"claim {claim.content!r} traces back to an AGENT assertion "
                f"({chain.root_agent}), not to a source. This is CF-5: a fabrication "
                f"laundered into fact by {len(chain)} hops."
            )
    return attribute_all(synthesis, all_claims)
```

## 7. Trade-offs

| Failure | Fix | Cost | Residual risk |
|---|---|---|---|
| **Duplicate work** | Explicit boundaries [MAR] | A prompt field | Boundaries may be wrong |
| **Conflicting edits** | Single-writer ownership | An ownership map | Contention forces serialization |
| **Deadlock** | Cycle detection | A wait-graph | — |
| **Livelock** | Progress measure + message budget | A measure to define | Legitimate slow progress cut short |
| **Cascading hallucination** | **Grounded claims + citation agent** | **Every claim needs a retrievable source; an extra agent** | **Hallucination still happens — it just cannot *cascade*** |

**The trade on CF-5 is the important one, and it is worth paying.** Requiring every inter-agent claim to carry a **retrievable source** is a real constraint: it means agents cannot pass along their reasoning, their inferences, or their syntheses as *facts* — only as *proposals*. **That feels limiting, and it is exactly the point.** **An agent's inference is not an observation, and treating it as one is how fabrications cascade.**

**And the residual risk must be stated honestly: this does not prevent hallucination. It prevents *cascading*.** Agent A can still fabricate. **But the fabrication cannot become agent B's premise, because it arrives without a retrievable source and is therefore marked untrusted.** **The error stays local instead of becoming systemic** — which is the whole game.

**Note also what does *not* work, and why it is tempting:** adding a "verifier agent" that checks the others' claims. **The verifier is the same kind of system with the same failure mode** ([FSC §6.3.5] applies to it too). **It will confidently verify a fabrication.** **The defense must be a *deterministic* check against a *retrievable source*** — Chapter 3, Topic 7's deterministic-sensor principle, at the agent boundary.

## 8. Experiments

**The cascade test (CF-5) — the experiment this topic exists for.** Inject a **fabricated fact** into one subagent's output (simulate the hallucination). Let the system run.

- **Measure: does the fabrication propagate?** Do downstream agents build on it? Does it appear in the final synthesis?
- **Measure the cascade depth:** how many agents incorporated it before the answer was produced.
- **With CF-5's grounded-claim contract:** the fabrication has no retrievable source, is marked untrusted, and **does not become a premise.**

**Prediction: without grounding, the fabrication cascades and the final answer is coherent, well-cited (citing *agents*), and false.** **This experiment demonstrates the failure vividly and no source runs it.**

**The provenance-chain audit.** For each claim in a final synthesis, **trace it back.** **Does it terminate in a retrievable source, or in an agent's assertion?** **Every chain terminating in an agent is a potential cascade.** Measure the fraction.

**The duplicate-work measurement (CF-1).** Semantic overlap across subagent findings, with and without explicit boundaries. **[MAR]'s documented failure was 2-of-3** — measure yours (Topic 5, §8).

**The conflicting-edit test (CF-2).** Two agents writing the same shared artifact concurrently. **Measure lost updates.** With single-writer ownership, the write is *refused* (loud), not lost (silent).

**The deadlock test (CF-3).** Construct a `wait_agent` cycle. **Detected or hung?**

**The livelock test (CF-4).** Agents exchanging messages with no progress. **Does the progress measure fire, or does the system burn its budget?**

**Statistics.** Zero-failure bounds on cascade, lost updates, and undetected deadlock (targets zero); Wilson on duplicate-work rate; report cascade depth as a distribution (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Cascading hallucination.** One agent's fabrication becomes the system's premise; the output is coherent, corroborated-looking, and false. **The multi-agent failure that should frighten you** (§3.3). Mitigation: **grounded claims** (CF-5-FIX); the citation agent [MAR]; **never let an agent's assertion become another's observation.**
- **Trusting a verifier agent.** A "checker" agent that validates others' claims — **it is the same kind of system and will hallucinate its verification.** Mitigation: deterministic checks against retrievable sources (Chapter 3, Topic 7).
- **Duplicate work.** [MAR]'s 2-of-3. Mitigation: explicit boundaries.
- **Conflicting edits.** Silent lost updates. Mitigation: single-writer ownership; [OMA] says prefer one agent when agents contend over shared mutable state.
- **Deadlock.** `wait_agent` on a message that never comes. Mitigation: cycle detection.
- **Livelock.** "Distracting each other with excessive updates" [MAR]. Mitigation: progress measure; message budgets.
- **Cascade + dissent suppression composed.** A minority *correct* finding contradicts a cascaded fabrication, and the synthesizer smooths away the correct one (§3.3). **The worst case.** Mitigation: PE-2 (surface contradictions) *and* CF-5 (ground claims) — **both are needed; either alone is insufficient.**
- **Error compounding.** "One step failing can cause agents to explore entirely different trajectories" [MAR]. Mitigation: durable execution (Chapter 8, Topic 10); [MAR]: "letting the agent know when a tool is failing and letting it adapt works surprisingly well."
- **Edge case — the legitimate inference.** An agent reasons correctly from sourced facts to a conclusion the sources do not state directly. **Under CF-5 this is a *proposal*, not an observation — correctly.** It should be passed along *as an inference, attributed to the reasoning agent*, and the downstream agent should know it is one.
- **Open limitation.** **Cascading hallucination is not documented as a multi-agent failure by any source.** **CF-5 is [synthesis]**, composed from the measured hallucination propensity [FSC §6.3.5], sub-agent untrustedness (Chapter 5, Topic 2), and [MAR]'s note that human testers found "hallucinated answers" the automated evals missed. **The cascade mechanism is reasoned, not measured, and its frequency is unknown.** §8's experiment would establish it, and it should be run before deploying a multi-agent system on anything consequential.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. **Duplicate work is documented:** "two others duplicated 2025 supply chain work" — 2 of 3 subagents [MAR].
2. **Conflicting edits is a named disqualifier:** prefer one agent when "agents contend over shared mutable state" [OMA]; shared-state conflict resolution is an open problem [CAH §5.2.4].
3. **Livelock is documented:** agents "distracting each other with excessive updates"; "scouring the web endlessly for nonexistent sources" [MAR].
4. **Error compounding across agents is documented:** "One step failing can cause agents to explore entirely different trajectories" [MAR].
5. **The hallucination propensity is measured** [FSC §6.3.5] and **regressed** across a version step [G56 §1] — a better model does not fix it.
6. **Sub-agent output is untrusted and arrives with false authority** (Chapter 5, Topic 2).
7. **[MAR] ships a citation agent** and scores citation accuracy — **the structural defense.**
8. **Human testers found "hallucinated answers" that the automated evals missed** [MAR].
9. **Cascading hallucination is not documented as a multi-agent failure by any source** — CF-5 is this book's synthesis.

**Decision rules.**
- **Four failures are classical with known fixes** — boundaries, single-writer, cycle detection, progress measures. **Apply Chapter 8's solutions across agents.**
- **The fifth is different: ground every inter-agent claim in a retrievable source** (CF-5-FIX). **A claim without one is a proposal, not an observation.**
- **Never ask an agent to verify another agent** — it is the same system with the same failure mode.
- **A claim whose provenance chain terminates in an agent is a potential cascade.** Audit it.
- **Ship a citation agent** [MAR] — it is not a nicety; it is the systemic defense.
- **CF-5 and Topic 5's PE-2 are both required** — a cascade plus dissent suppression is a system that is comprehensively wrong.

**Production implications.**
1. Run the cascade test (§8); inject a fabrication and watch it propagate. It is the most alarming demonstration in this chapter and it takes an afternoon.
2. Require a retrievable source on every inter-agent claim; an agent's assertion must never become another agent's premise.
3. Audit provenance chains in your final outputs; every chain terminating in an agent is a cascade risk.
4. Apply Chapter 8's four fixes across agents — they are known problems and there is no excuse for shipping them.

**Connections.** Four of these failures are Chapter 8's (A-2 write races, TE-4 deadlock, TE-3 livelock) and Topic 5's (duplicate work), applied across agents. **CF-5 is new**, and it rests on Chapter 5, Topic 2 ($g_{\mathrm{det}}=0$), Chapter 5, Topic 12 (untrusted content), and Chapter 3, Topic 7 (deterministic sensors). Its defense — grounded claims — is Chapter 6, Topic 14's attribution and Topic 5's citation agent. It composes disastrously with Topic 5's dissent suppression. Topic 14 measures these failures as evaluation dimensions.

## Sources

[MAR] Anthropic, "How we built our multi-agent research system" — the duplicate-work failure ("one subagent explored 2021 automotive chip crisis while **two others duplicated 2025 supply chain work**"); livelock ("**distracting each other with excessive updates**"; "scouring the web endlessly for nonexistent sources"); error compounding ("**One step failing can cause agents to explore entirely different trajectories, leading to unpredictable outcomes**"; "The compound nature of errors in agentic systems means that minor issues for traditional software can derail agents entirely"); the **Citation agent** ("Post-processes to attribute claims to sources") and **citation accuracy** as a scored rubric dimension; **"People testing agents find edge cases that evals miss. These include hallucinated answers on unusual queries, system failures, or subtle source selection biases"** — https://www.anthropic.com/engineering/multi-agent-research-system
[OMA] OpenAI, multi-agent guide — prefer one agent when "**agents contend over shared mutable state**"; `wait_agent` ("Wait for mailbox update") as the deadlock-inviting primitive — https://developers.openai.com/api/docs/guides/responses-multi-agent
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — unsupported completion claims as a **measured** propensity — the fabrication that cascades — `Knowledge_source/`
[G56] GPT-5.6 Preview System Card §1 — propensity **regression** across a version step; a better model does not fix hallucination — `Knowledge_source/gpt-5-6-preview.pdf`
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5.2.4 (Transactional Shared Program State and Semantic Conflict Resolution as an open scaling problem); the implicit-state vulnerability ("agents cannot reliably detect when their internal understanding diverges from the true program state")
