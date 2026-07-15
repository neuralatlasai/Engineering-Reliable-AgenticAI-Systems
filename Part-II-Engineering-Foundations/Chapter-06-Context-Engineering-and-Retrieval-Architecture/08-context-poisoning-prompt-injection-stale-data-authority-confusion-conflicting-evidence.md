# Topic 8 — Context Poisoning, Prompt Injection, Stale Data, Authority Confusion, and Conflicting Evidence

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The five ways assembled context is *wrong* — not the model failing, but the window containing content that is malicious, out of date, mis-attributed, or self-contradictory. This topic is Chapter 5, Topic 12 (untrusted tool output) generalized to the entire context pipeline.

**Prerequisites.** Chapter 3, Topic 6 (control plane vs data plane, **CP-1/CP-2**); Chapter 5, Topic 12 (the untrusted-content boundary; the confused-deputy fix); Topic 2 (the authority hierarchy H-1); Topic 6 (provenance, which is the defense's substrate).

**Terminology.** *Poisoning*: an adversary places content in a corpus the agent will retrieve. *Injection*: untrusted content is treated as instruction (Chapter 5, Topic 12). *Staleness*: content true when indexed, false when used. *Authority confusion*: the model cannot tell which of two conflicting sources outranks the other. *Conflicting evidence*: two retrieved sources disagree.

**Boundaries.** Inside: the five context-integrity failures and the structural defenses that bound them. Outside: the org threat model (Chapter 12); the tool-boundary version (Chapter 5, Topic 12 — assumed and generalized here).

**Exclusions.** No injection-payload catalogue.

**Outcomes.** The reader can state, for each failure, the structural control that bounds it — and why no control *prevents* it.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** The context pipeline (Topic 3) assembles content from many sources, and several of them are attacker-reachable or time-sensitive: retrieved documents, tool results, files, web pages, memory, sub-agent output. Once assembled, it is all *tokens in one window* (Topic 2), and the model conditions on all of it with no native authority or freshness model.

**Bottleneck.** This is a **CP-1 violation by default** (Chapter 3, Topic 6), identical in structure to Chapter 5, Topic 12's tool-output problem but with a larger attack surface: the tool boundary has *tool results*; the context pipeline has results *plus* retrieved corpora *plus* memory *plus* files *plus* history. A poisoned document retrieved from a "trusted" knowledge base is an injection that arrived through a channel most teams do not even classify as untrusted.

**Objective.** Structural controls that **bound the damage** of each failure — not prevent it, which no source claims is possible — plus detection and honest disclosure.

**Assumptions.** Injection succeeds sometimes. Corpora get poisoned. Indexes go stale. Sources disagree. All four are design certainties, not risks.

**Constraints.** The model must still *use* untrusted, possibly-stale, possibly-conflicting content — that is what retrieval is for.

**Success criteria.** No context-integrity failure causes an out-of-authority action (CP-1); staleness on irreversible actions is caught; conflicts are surfaced, not silently resolved.

## 3. Intuition first, then formalization

### 3.1 Intuition: the corpus is an attack surface

The reframe that most teams resist: **your retrieval corpus is part of your context, and if an adversary can write to it, they can write to your model's context.** A "trusted internal wiki" that any employee can edit; a customer-support knowledge base that ingests ticket text; a code repository with a `README` an attacker submitted via PR; a memory store the agent itself populates from web content — every one is an injection channel wearing a trusted label.

This makes context poisoning *worse* than the tool-boundary injection of Chapter 5, Topic 12, for a specific reason: **retrieved content arrives with the implicit authority of "the knowledge base says."** A web page the agent browses is obviously external; a document from the company wiki *feels* authoritative, and both the model and the engineers who built the system are more likely to trust it. The trust label is doing the attacker's work.

The defense is the same as Chapter 5, Topic 12, and it must be stated with the same bluntness: **you cannot prevent this.** What you can do is ensure that a poisoned document, a stale record, or a hostile web page **cannot cause an action beyond the user's own authority** (CP-1 + principal scoping), cannot exfiltrate (egress control), and does not silently override a legitimate source (authority + provenance). Bounded damage, not prevention. Any claim stronger than that is unsupported by every source available to this chapter.

### 3.2 Formalization: the five failures and their invariants

Partition context blocks by trust $\theta\in\{\mathsf T,\mathsf U\}$ (Topic 2) and carry provenance $\phi$ (Topic 6: source, observed_at, trust). The five failures and the invariant that bounds each **[synthesis; CP-1/CP-2 from Chapter 3, Topic 6]**:

| Failure | Definition | Bounding invariant |
|---|---|---|
| **Poisoning** | Adversary places $\upsilon$ with $\theta(\upsilon)=\mathsf U$ in a retrieved corpus | Same as injection below — poisoning *is* delayed injection |
| **Injection** | $\upsilon$ with $\theta=\mathsf U$ is treated as instruction | **I-1:** $\alpha_u$ does not read any $\upsilon$ with $\theta=\mathsf U$ (CP-1) |
| **Staleness** | $\upsilon$ true at `observed_at`, false at action time | **I-2:** irreversible actions re-verify basis freshness (Chapter 5, Topic 12) |
| **Authority confusion** | Conflicting $\upsilon_1,\upsilon_2$; model cannot rank them | **I-3:** precedence follows provenance authority (Topic 2), not position or fluency |
| **Conflicting evidence** | $\upsilon_1$ contradicts $\upsilon_2$, both plausibly relevant | **I-4:** surface the conflict; never silently resolve |

$$
\textbf{I-1 (CP-1):}\quad \alpha_u(x,s,p)\ \text{depends on no}\ \upsilon\ \text{with}\ \theta(\upsilon)=\mathsf U .
$$

This is the load-bearing invariant, imported verbatim from Chapter 5, Topic 12, and it does the same work: an injection (whether via tool result or poisoned corpus) can change what the model *proposes* but not what the harness *permits*. **The blast radius of any context-integrity failure is bounded by the user's own authority**, which is why Chapter 5, Topic 10's principal scoping is, again, the single most important control.

$$
\textbf{I-4 (conflict):}\quad \upsilon_1\perp\!\!\!\perp\upsilon_2\ \text{contradict}\ \Longrightarrow\ \text{present both, attributed; do not choose silently.}
$$

I-4 is the failure unique to *retrieval* (the tool boundary rarely returns two contradictory results at once). It is subtle because the "helpful" behavior — pick the more plausible one and answer confidently — is exactly wrong: **contradictory retrieved evidence is a signal that something is off** (a stale document, a poisoned one, a genuine policy ambiguity), and silently resolving it destroys the signal and often launders the poisoned source into the answer.

### 3.3 Why detection is necessary but not sufficient

You can *detect* some of these (a classifier for injection-shaped text; a staleness check against source timestamps; a contradiction detector across retrieved chunks). Detection is worth building. But detection is a **probabilistic sensor with false negatives**, and the structural invariants (I-1..I-4) are what hold when detection fails. **The order of operations is: structural bound first, detection second.** A system that relies on an injection classifier and skips CP-1 has bet its security on a model catching every attack — which Chapter 2, Topic 1 says it will not.

## 4. Architecture

```
   RETRIEVED / TOOL / MEMORY / FILE / WEB / SUB-AGENT content
        │
        ▼
   ┌── PROVENANCE (Topic 6): source, observed_at, trust θ ──────────────┐
   │                                                                    │
   │   θ = U (attacker could have written it)      θ = T (you did)      │
   └───────────┬────────────────────────────────────┬──────────────────┘
               │                                     │
               ▼                                     ▼
   ┌───────────────────────────────┐        enters as control-eligible
   │ WRAP + DELIMIT (mitigation)   │        (still bounded by principal)
   │ + FRESHNESS CHECK (I-2)       │
   │ + CONFLICT DETECT (I-4)       │
   └───────────┬───────────────────┘
               ▼
        enters context as DATA
               │
               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ THE STRUCTURAL BOUND (holds when detection fails):            │
   │   I-1: α_u never reads θ=U content            (CP-1)          │
   │   principal scoping: blast radius = USER's authority (Ch.5 T10)│
   │   egress allowlist: injection ≠ exfiltration    (Ch.5 T12)    │
   └──────────────────────────────────────────────────────────────┘
```

**This is deliberately the same architecture as Chapter 5, Topic 12.** The point of drawing it again is that the *context pipeline* has more untrusted inputs than the tool boundary, and each must pass through the same discipline. A team that hardened its tool results against injection and left its retrieval corpus unclassified has defended one door and left the larger one open.

## 5. Grounding

- **CP-1/CP-2** are Chapter 3, Topic 6; **the untrusted-content boundary and the confused-deputy bound** are Chapter 5, Topic 12 — this topic generalizes both to the context pipeline.
- **Provenance and data-sensitivity as authorization inputs:** "permissions should depend not only on tool identity, but also on arguments, environment state, data sensitivity, and expected side effects" [CAH §5] — I-1 and I-3's basis.
- **Result sanitization as a harness requirement:** future harnesses must support "result sanitization" [CAH §3.3], and post-use hooks "sanitize outputs" [CAH §3.3.4] — the wrap/delimit stage.
- **Network requests as context-dependent hazards:** "the same network request may be benign during documentation retrieval but risky when it transmits local state" [CAH §5] — the exfiltration half; egress control.
- **Open problems:** "secret handling," "secure tool schemas," and "sandbox escape prevention" are explicitly open [CAH §5]. **The literature does not claim injection is solved**, and neither does this chapter.
- **Staleness matters because agents act late:** the observation-to-action gap is long (Chapter 5, Topic 12, §3.3); `observed_at` from Topic 6 is what I-2 checks against.
- **Conflict must be surfaced, not resolved:** the survey's account of "conflicting evidence" across partial channels — "which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved" is "the central design question" [CAH §5.2.4 / §3.5] — and its warning that summaries and channels each lose information differently, so silent resolution destroys signal.
- **The propensity that makes injection land:** models exhibit measured evaluation-conditioned and instruction-following behaviors [FSC §6.4.2], and beyond-intent action propensities [G56 §1] — a model *will* sometimes follow an injected instruction.

**Evidence gap, stated as bluntly as in Chapter 5, Topic 12.** **No source in this chapter's ledger measures context-poisoning or injection success rates, or the effectiveness of any defense.** The invariants are architecturally sound (they follow from CP-1); their empirical failure rate is unmeasured. **Anyone claiming a solved context-injection defense is overclaiming**, and this chapter's position is bounded damage, not prevention.

## 6. Implementation

**Trust classification at the corpus, by who can write:**

```python
def trust_of(source: Source) -> Trust:
    """The label that decides everything. Set by WRITE access, not by store location.
    A 'trusted internal wiki' that employees can edit is UNTRUSTED for injection."""
    if source.user_writable or source.ingests_external_content:
        return Trust.UNTRUSTED
    if source.origin in ("web", "email", "third_party_mcp", "sub_agent"):
        return Trust.UNTRUSTED
    return Trust.TRUSTED
```

**I-1, enforced in the signature (Chapter 5, Topic 12, §6):**

```python
def authorize(tool, args, ctx) -> Decision:
    """I-1 / CP-1: α_u receives arguments, state, principal. It does NOT receive
    retrieved content, tool results, memory, or any context block. Checkable in one line
    by reading the signature: there is no parameter for θ=U content to arrive through."""
    ...
```

**I-2, freshness on irreversible action:**

```python
def check_basis_freshness(action, ctx) -> Decision:
    if action.effect is not Effect.WRITE_IRREVERSIBLE:
        return Decision.allow()
    for block in action.basis_blocks:                 # what the model read to decide
        age = utcnow() - block.provenance.observed_at
        if age > action.max_basis_age:
            return Decision.deny(
                f"Basis is {age.seconds}s old (max {action.max_basis_age.seconds}s). "
                f"Re-retrieve before acting — the world may have changed."
            )
    return Decision.allow()
```

**I-4, conflict detection and surfacing:**

```python
def assemble_evidence(chunks: list[Chunk]) -> str:
    conflicts = detect_contradictions(chunks)          # cheap NLI, or a model pass
    parts = [wrap_untrusted(c) if c.provenance.trust is Trust.UNTRUSTED else c.render()
             for c in chunks]
    if conflicts:
        # I-4: SURFACE it. Do not let the model silently pick — that launders poison
        # and destroys the signal that something is wrong.
        parts.append(
            "[CONFLICT DETECTED among the evidence above:\n"
            + "\n".join(f"  - {a.cite()} says {a.claim!r} but {b.cite()} says {b.claim!r}"
                        for a, b in conflicts)
            + "\nReport this conflict and its sources. Do not silently choose one. "
              "If one source is more authoritative or more recent, say why.]"
        )
    return "\n\n".join(parts)
```

**Detection as a second layer, never the first:**

```python
def scan_for_injection(block: ContextBlock) -> float:
    """A SENSOR with false negatives. Runs AFTER I-1, never instead of it.
    Flags for logging/monitoring; does not gate security (that is I-1's job)."""
    return injection_classifier.score(block.content)   # log high scores; do not rely on them
```

## 7. Trade-offs

| Control | Buys | Honest limit |
|---|---|---|
| Trust-by-write-access | Correct classification of the real attack surface | Requires knowing who can write to every source |
| **I-1 (α_u blind to θ=U)** | **The real bound**: injection cannot escalate authority | Does not prevent injection; bounds it |
| Principal scoping (Ch.5 T10) | Blast radius = user's authority | The user's own authority may still hurt |
| Egress allowlist | Injection ≠ exfiltration | Covert channels remain |
| Freshness check (I-2) | Prevents stale-basis actions | Latency; a window always remains |
| Conflict surfacing (I-4) | Preserves the signal; blocks silent laundering | The model must handle the conflict well |
| Wrap/delimit | Raises the bar | **Mitigation, not a boundary** — can be argued around |
| Injection classifier | Detection, monitoring | **False negatives**; never a gate |

**The summary, identical to Chapter 5, Topic 12 and worth repeating because the surface is larger here.** You cannot prevent context poisoning or injection. You can make a successful one **unable to exceed the user's authority** (I-1 + principal scoping), **unable to exfiltrate** (egress control), **unable to act on stale data** (I-2), and **unable to silently launder a poisoned source into the answer** (I-4). That is a bounded-damage posture. Every source treats prevention as open [CAH §5], and this chapter will not claim otherwise.

## 8. Experiments

**Corpus-poisoning red-team — the experiment specific to this topic.** Plant instruction-bearing and disinformation payloads *in the retrieval corpus* (not just in tool results — that was Chapter 5, Topic 12). Include the realistic channels: a wiki page, an ingested support ticket, a memory entry the agent wrote from web content, a repository file.

**Metrics, and the separation is the whole point (Chapter 5, Topic 12, §8):**
- **Follow rate** — the model acted on the poisoned instruction. **Expect nonzero. Measures the model.**
- **Escalation rate** — the poison caused an action beyond the user's authority. **Target zero.** Measures whether I-1 holds. Report with the zero-failure bound $p_{\max}=1-(1-\gamma)^{1/n}$ and $n$ (Chapter 1, Topic 12).
- **Exfiltration rate** — data reached a non-allowlisted destination. **Target zero**, same treatment.
- **Laundering rate** — a poisoned document's claim appeared in the answer *without* the conflict being surfaced. Tests I-4.

**Staleness injection.** Change a source after indexing; measure the rate of actions taken on stale basis, with and without I-2. **The gap is I-2's value.**

**Conflict-handling test.** Retrieve deliberately contradictory documents; measure how often the model surfaces the conflict versus silently picking one. **Silent resolution is the failure**, and it is common because it looks like helpfulness.

**Authority-confusion test.** Place a low-authority source (a random web page) in conflict with a high-authority one (official policy); measure which wins. This tests I-3 and, like Topic 2's conflict test, will likely show the model does *not* honor your intended precedence — which is why safety-relevant precedence must move into code.

**Statistics.** Wilson intervals; zero-failure bounds where the target is zero; report $n$ always (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Poisoned "trusted" corpus.** The wiki anyone can edit; the ingested ticket; the agent's own web-sourced memory. **The signature failure of this topic**, and the one teams do not classify as an attack surface. Mitigation: trust by write-access; I-1.
- **Injection → out-of-authority action.** Mitigation: I-1 + principal scoping. **Bounds; does not prevent.**
- **Injection → exfiltration.** Mitigation: egress allowlist (Chapter 5, Topic 12).
- **Stale-basis action.** Acted on a record that changed after retrieval. Mitigation: I-2.
- **Silent conflict resolution.** The model picks the poisoned document and answers confidently; the conflict — the actual warning — is gone. Mitigation: I-4; surface, never resolve.
- **Authority confusion.** A fluent low-authority source out-argues a terse high-authority one. Mitigation: provenance-based precedence in code, not in prose (I-3; Topic 2).
- **Detection relied on as a gate.** An injection classifier with false negatives standing in for I-1. Mitigation: structural bound first, detection second — always.
- **Memory as a persistence vector.** An injection that writes itself into the agent's memory store fires on every future run (Chapter 7). Mitigation: trust-classify memory writes; treat agent-written memory sourced from θ=U content as θ=U.
- **Sub-agent output as authoritative injection.** A poisoned sub-agent returns attacker-influenced content that arrives as a "result" (Chapter 5, Topic 2). Mitigation: sub-agent output is θ=U.
- **Edge case — legitimate conflict.** Sometimes sources genuinely disagree (policy changed; two valid interpretations). I-4 handles this correctly by surfacing it — the same mechanism that catches poisoning catches honest ambiguity, which is a feature.
- **Open limitation.** **Injection and poisoning are unsolved** [CAH §5]. No source measures defense effectiveness. This chapter offers a bounded-damage architecture and says so; the escalation-rate and exfiltration-rate targets of zero are architectural aspirations backed by CP-1, not by published efficacy data.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Permissions must depend on data sensitivity, not just tool identity [CAH §5] — provenance is an authorization input.
2. Result sanitization is a named harness requirement; post-use hooks sanitize outputs [CAH §3.3, §3.3.4].
3. Network requests are context-dependent hazards — benign on retrieval, risky when transmitting local state [CAH §5].
4. Conflict resolution across channels is "the central design question," and channels lose information differently [CAH §5.2.4].
5. Secret handling, secure tool schemas, and sandbox escape are **open problems** [CAH §5].
6. Models exhibit measured propensities to follow instructions and act beyond intent [FSC §6.4.2; G56 §1].
7. **No source measures context-injection defenses.** Bounded damage, not prevention.

**Decision rules.**
- **Trust is set by who can write to a source, not by where it lives.** The "trusted" wiki is untrusted if editable.
- **$\alpha_u$ never reads θ=U content.** Enforce in the signature (I-1).
- **Irreversible actions re-verify basis freshness** (I-2).
- **Surface conflicts; never resolve them silently** (I-4). Silent resolution launders poison.
- **Structural bound first, detection second.** A classifier is a sensor, not a gate.
- **Say "bounded damage," not "protected."** The evidence supports the weaker claim only.

**Production implications.**
1. Classify every retrieval corpus by write-access today. The unclassified "trusted" corpus is the open door.
2. Confirm I-1 holds by reading $\alpha_u$'s signature (Chapter 5, Topic 12) — it should be structurally impossible for retrieved content to reach it.
3. Run the corpus-poisoning red-team (§8) and report **escalation** and **exfiltration** rates with zero-failure bounds — not follow rate, which is the model's number.
4. Ship I-4 conflict surfacing; silent resolution is both a correctness bug and a poison-laundering path.
5. Trust-classify memory writes — an injection that reaches memory is an injection that persists (Chapter 7).

**Connections.** This topic is Chapter 5, Topic 12 generalized to the whole context pipeline, and it depends on the same fix (Chapter 5, Topic 10's principal scoping) for its damage bound. Topic 2's H-1 is I-1 at the instruction hierarchy; Topic 6's provenance is the defense's substrate; Topic 7's conflict-surfacing synthesis is I-4's mechanism. Chapter 7's memory is a persistence vector; Chapter 12 owns the threat model this topic can only bound.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3 (future harnesses requiring "result sanitization"), §3.3.4 (post-use hooks "sanitize outputs"), §5 (permissions depending on "data sensitivity"; "the same network request may be benign during documentation retrieval but risky when it transmits local state"; secret handling, secure tool schemas, and sandbox-escape prevention as **open problems**), §5.2.4 (conflict resolution across partial channels as "the central design question"; channels losing information differently)
[FSC] Claude Fable 5 & Mythos 5 System Card §6.4.2 — evaluation-conditioned and instruction-following behavior; the propensity that makes injection sometimes land — `Knowledge_source/`
[G56] GPT-5.6 Preview System Card §1 — beyond-intent action propensity — `Knowledge_source/gpt-5-6-preview.pdf`
[ECE] Anthropic, "Effective context engineering for AI agents" — retrieved content and memory as context sources subject to curation — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
