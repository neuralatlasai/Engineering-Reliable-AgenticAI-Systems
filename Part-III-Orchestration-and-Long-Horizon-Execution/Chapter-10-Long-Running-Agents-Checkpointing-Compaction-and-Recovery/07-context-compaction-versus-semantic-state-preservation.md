# Topic 7 — Context Compaction Versus Semantic State Preservation

## 1. Scope, prerequisites, terminology, boundaries, outcomes

This is the conceptual center of the chapter. Topics 5 and 6 built durable records and artifacts *on disk*; this topic addresses what happens *in the window* when it fills mid-session, and draws the distinction that most teams get wrong: **compacting the context is not the same as preserving the task's semantic state.** Compaction is a *lossy summarization of the conversation to fit the window*; semantic state preservation is *guaranteeing the facts the task depends on survive*. The two are different operations with different guarantees, and conflating them is how long runs silently lose critical state.

The one-line thesis: **you cannot summarize your way to durability.** Compaction manages the window (pressure P1); it does *not* provide continuity (P2) and it *degrades* semantic state unless a separate, lossless durable record carries the load-bearing facts. Compaction is a *complement* to the durable record (Topics 5, 6), never a substitute.

**Prerequisites.** Compaction as "maximize recall, then precision," durable-instruction re-injection (V-3 / T-1), the reset-vs-compaction distinction, prompt-cache prefix stability (Chapter 6 Topics 11, 10, [ECE][OCP]); the durable record and its authority hierarchy (Topic 5); the fidelity rule for exact artifacts (Topic 6); "context anxiety" and reset (Topic 1, [HDA]).

**Terminology.**
- **Compaction** — summarizing earlier conversation *in place* so the *same* session continues on a shortened history [OCP][HDA]. Lossy; the original context is discarded from the window.
- **Reset** — ending the session with a clean window and starting fresh, carrying state via a *handoff artifact* [HDA]. The window is cleared, not summarized.
- **Semantic state** — the set of facts the task's correctness depends on: the objective, hard constraints, verified progress, key decisions, exact artifact references. Must survive, losslessly, whatever happens to the window.
- **Semantic state preservation** — guaranteeing semantic state survives via the *durable record* (Topics 5, 6), independent of and complementary to whatever compaction/reset does to the window.

**Boundary.** This topic is about *the window*: compaction, reset, and what must be protected from both. It relies on Topics 5–6 for the durable record that does the actual preserving. It is *not* checkpoint frequency (Topic 8 — that is about disk snapshots and RPO) nor recovery (Topic 11). The relationship: compaction/reset manage the *volatile* window; checkpointing manages the *durable* state; this topic is where they meet.

**Outcome.** You will be able to state precisely what compaction is allowed to lose and what must be protected from it, choose between compaction and reset, and design the durable-record backstop that makes both safe.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** Mid-session, the window approaches full. Something must give. The two window-management options are *compaction* (summarize the history in place, keep going) and *reset* (clear the window, restart with a handoff). Both **lose information** — compaction paraphrases and drops; reset discards the window entirely. The danger: if the information they lose includes *semantic state* (a hard constraint, a verified-progress fact, an exact code reference), the run silently regresses into Topic 2's failures (forgotten constraint, repeated work, drift). The naive move — "just compact when full" — treats compaction as if it preserved everything, which it does not.

**Objective.** Establish (i) what compaction/reset are *allowed* to lose (transient reasoning, redundant tool chatter, superseded intermediate states) and what they must *not* lose (semantic state); (ii) how semantic state is *actually* preserved — by the durable record, re-injected, not by the summary; (iii) when to compact vs reset; and (iv) the guarantee that makes either safe: *anything load-bearing is in the durable record before the window is touched.*

**Assumptions.** (a) Compaction is lossy and its output is not fully controllable — [OCP]'s server-side compaction produces an *opaque* item "not intended to be human-interpretable"; you cannot audit exactly what it kept. (b) The durable record (Topics 5, 6) exists and is authoritative. Both are load-bearing: (a) means you *cannot trust* compaction to preserve any specific fact, so (b) must.

**Constraints.** Semantic state preservation must be *independent of* the window operation — because you cannot guarantee what compaction keeps, you must guarantee it *elsewhere* (the durable record) and *re-inject* it (Chapter 6 V-3/T-1). Exact artifacts must never be compacted (Topic 6 fidelity rule — a summarized source file is corrupt).

**Success criteria.** After any compaction or reset, the session still has (via re-injection from the durable record) the verbatim objective, verbatim hard constraints, verified progress, and exact artifact handles. Nothing the task's correctness depends on was entrusted *solely* to the summary. Repeated-work and forgotten-constraint rates do not rise after a compaction event.

## 3. Intuition first, then formalization

**Intuition.** Compaction is *note-taking under a page limit*: you compress your working notes to fit, and inevitably you paraphrase, drop details, and lose exactness. That is fine for *your train of thought* — the reasoning that got you here — but catastrophic for *facts you must not get wrong*, like a phone number, a legal constraint, or the exact contents of a file. For those, you do not rely on your compressed notes; you keep the *original document* and re-read it. **Compaction compresses the train of thought; the durable record holds the originals.** The error is treating the compressed notes as if they were the originals.

The distinction between *compaction* and *reset* is the distinction between *editing your notes down* and *throwing your notes away and rewriting a clean summary from the source documents*. Compaction (edit down, same session) risks accumulating paraphrase-of-paraphrase drift and keeps whatever distraction the window held (worsening P3 — this is why [HDA]'s "context anxiety" was fixed by *reset*, not compaction). Reset (clean slate from a handoff artifact) discards accumulated distraction entirely but pays the cost of reconstructing context from the handoff. [HDA]'s exact framing: "A reset provides a clean slate, at the cost of the handoff artifact having enough state for the next agent to pick up the work cleanly."

The deepest intuition: **the only thing that makes either safe is that the load-bearing facts are somewhere lossless.** Compaction is safe *because* the durable record holds the constraints and progress; reset is safe *because* the handoff artifact + durable record hold the state. Neither window operation is safe *on its own* — both are safe *only against a lossless backstop.* Remove the backstop and both silently destroy semantic state. This is why "just compact when full" is dangerous: it assumes a backstop that may not exist.

**Formalization.** Partition the window's contents into:
- $\Sigma$ — **semantic state**: objective, hard constraints, verified progress, key decisions, exact artifact handles. Correctness depends on it.
- $\Theta$ — **transient reasoning**: intermediate chains of thought, superseded plans, tool-call chatter, redundant observations. Correctness does *not* depend on preserving it exactly.

Compaction is a lossy map $\text{compact}: (\Sigma \cup \Theta) \to \text{summary}$, with the property that **it may lose or paraphrase anything, including parts of $\Sigma$** (its output is opaque, [OCP]). Reset is $\text{reset}: \text{window} \to \emptyset$, discarding everything.

**The preservation theorem [synthesis].** A window operation $\omega \in \{\text{compact}, \text{reset}\}$ is *semantic-state-safe* iff
$$
\Sigma \subseteq \text{DurableRecord} \quad\text{and}\quad \Sigma \text{ is re-injected after } \omega .
$$
That is: semantic state is safe *not because $\omega$ preserves it* (it may not) *but because it lives in the durable record and is re-injected*. The window operation is then free to be as lossy as it likes on $\Theta$. **Compaction preserves nothing you can rely on; the durable record + re-injection preserves $\Sigma$; those are different mechanisms and you need the second regardless of the first.**

**Corollary (the exact-artifact carve-out).** $\Sigma$ includes *handles* to exact artifacts, never their *content* — content in the window would be subject to $\text{compact}$'s paraphrase (Topic 6 fidelity rule). So exact content is preserved by the artifact store (lossless bytes), referenced by a handle that lives in $\Sigma$, and never summarized.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Window monitor.** Watches occupancy; triggers a window operation at a threshold ([OCP]'s `compact_threshold`; or a step/cost budget for reset).
2. **Compactor.** Summarizes the window in place. May be server-side ([OCP]: automatic at `compact_threshold`, produces an opaque encrypted item) or harness-implemented (Chapter 6's recall-then-precision). Operates on $\Theta$ primarily; *cannot be trusted* to preserve $\Sigma$.
3. **Re-injector.** After any window operation, re-injects $\Sigma$ from the durable record: verbatim objective + hard constraints + verified progress + artifact handles (Topic 2's re-anchoring read; Chapter 6 V-3/T-1; Chapter 7 [CCM] root-instruction re-injection).
4. **Reset/handoff writer.** For reset: writes the handoff artifact (a fresh, clean summary built *from the durable record*, not from the accumulated window), clears the window, starts fresh.
5. **Durable record (Topics 5, 6).** The lossless home of $\Sigma$. The backstop that makes 2 and 4 safe.

**Interface: re-injection is mandatory after every window operation.** The invariant — never let a window operation be the *only* thing standing between the task and its semantic state — is enforced by making re-injection a non-optional post-step of both compaction and reset.

**Control flow:**

```
if occupancy > compact_threshold:            # [OCP]
    if session_healthy and not decay_signal:
        window = compact(window)             # in place; lossy on Theta; DISTRUST for Sigma
    else:                                     # decay / "context anxiety" -> reset [HDA]
        handoff = build_handoff(durable_record)   # clean summary FROM the record
        window = fresh()
        window += handoff
    window += reinject(Sigma from durable_record)  # MANDATORY: verbatim objective,
                                                    # constraints, progress, handles
```

**Data flow.** $\Sigma$ flows *from the durable record into the window* after every operation. It does **not** flow *from the window's summary back into the durable record* — the durable record is authoritative (Topic 5); the window never overwrites it with a paraphrase. This one-directional flow (record → window, never summary → record-as-truth) is what prevents compaction drift from corrupting the authoritative state.

**[OCP]'s server-side compaction, precisely.** [OCP]: crossing `compact_threshold` triggers server-side compaction producing an "encrypted compaction item" that "carries forward key prior state and reasoning... using fewer tokens," is "opaque and not intended to be human-interpretable," and should be passed to the next call "as-is." Architecturally: this is a *black-box* compactor. You cannot inspect what it kept, so you *must not rely on it for $\Sigma$* — you re-inject $\Sigma$ from your own durable record on top of it. The opaque item handles $\Theta$; your re-injection handles $\Sigma$.

## 5. Grounding: primary sources and reproducible evidence

**Compaction is in-place summarization; reset is a clean slate with handoff.** [HDA] grounds both precisely: compaction = "earlier parts of the conversation are summarized in place so the same agent can keep going on a shortened history"; reset = "clearing the context window entirely and starting a fresh agent, combined with a structured handoff that carries the previous agent's state and the next steps." And the trade: "A reset provides a clean slate, at the cost of the handoff artifact having enough state for the next agent to pick up the work cleanly."

**Reset was the fix for decay/anxiety, not compaction.** [HDA]: Sonnet 4.5's "context anxiety" "requir[ed] resets"; Opus 4.5 "largely eliminated this, enabling continuous sessions without resets." This grounds the control-flow branch above (decay signal → reset) and the intuition that compaction does not fix P3 (decay) — reset does, by clearing accumulated distraction.

**Compaction output is opaque and lossy.** [OCP] grounds the distrust: the compaction item is "opaque and not intended to be human-interpretable" and you "pass it as-is." You cannot verify it preserved any specific fact — which is exactly why $\Sigma$ must be preserved *elsewhere*. [OCP] also grounds the trigger (`compact_threshold`, e.g. 200k) and the retention model (compaction item + retained recent items; earlier context pruned).

**Semantic state must be re-injected, not left to the summary.** [ECE] (Chapter 6): compaction should "maximize recall, then precision"; V-3 validator = "durable-instruction survival"; [CCM] (Chapter 7): the root instruction "survives compaction by re-injection," nested does not. These ground the mandatory re-injection of $\Sigma$: the sources explicitly note that without re-injection, durable instructions are lost to compaction — the forgotten-constraint failure (Topic 2).

**The safe-compaction contrast (Topic 5).** The progress file is a compaction *whose original is preserved on disk*; context compaction discards the original. This chapter's Topic 5 grounds that the *safe* kind keeps the original — which is precisely the durable-record backstop this topic requires.

**Reproducible evidence.** The claim "compaction loses $\Sigma$ without a backstop" is directly testable: place a hard constraint early, compact past it *without* re-injection, and measure violation downstream (E1). The compaction-vs-reset decay difference is testable via a long single-session run with each strategy (E2). Sources ground the mechanisms; the curves are unmeasured.

## 6. Implementation: the $\Sigma$/$\Theta$ split and mandatory re-injection

**Tagging semantic state so it is never *only* in the summary.** In a harness-controlled context (Chapter 6 assembly pipeline), mark $\Sigma$ items so the durable record owns them and they are re-injected regardless of compaction:

```python
SIGMA = {                                   # lives in durable record (Topics 5,6)
    "objective":   record.objective,         # verbatim
    "constraints": record.hard_constraints,  # verbatim, NEVER summarized
    "progress":    record.verified_units,    # count + ids = mu
    "handles":     record.artifact_handles,  # references, not content (Topic 6)
    "decisions":   record.key_decisions,     # RI: rationale a successor needs
}

def after_window_op(window):                 # runs after EVERY compact or reset
    window += render_verbatim(SIGMA["objective"], SIGMA["constraints"])
    window += render(SIGMA["progress"], SIGMA["handles"], SIGMA["decisions"])
    return window
```

**Server-side compaction ([OCP]) + local re-injection.** When using [OCP]'s automatic compaction, you do not control the opaque item — so you layer your $\Sigma$ re-injection *on top*:

```python
# [OCP]: set the threshold; the platform compacts Theta into an opaque item.
request = {"context_management": {"compact_threshold": 200_000}, ...}
# YOUR job: after the platform compacts, ensure Sigma is present from YOUR record.
response = responses.create(**request)
if response.compacted:                        # platform pruned; opaque item carries Theta
    next_input = [response.compaction_item] + after_window_op([])   # re-inject Sigma
```

Do not fight the opaque compactor; complement it. It handles the transient reasoning you do not care about exactly; you guarantee $\Sigma$ from your durable record.

**Compaction vs reset decision (deterministic policy):**

```python
def choose_window_op(session):
    if session.decay_signal or session.anxiety_signal:   # [HDA]: reset fixes decay
        return "reset"      # clean slate; rebuild from handoff (from durable record)
    if session.occupancy > THRESH:
        return "compact"    # cheaper; keep going; DISTRUST for Sigma -> re-inject
    return "continue"
```

**Exact-artifact protection.** The assembly pipeline tags exact-artifact *content* (when transiently loaded, Topic 6) as non-summarizable and drops it before compaction, keeping only the *handle* in $\Sigma$. A compaction pass must never receive an exact artifact's bytes as summarizable text.

## 7. Trade-offs

- **Compaction vs reset.** Compaction is cheaper (no full context rebuild), keeps momentum, but accumulates paraphrase drift and *retains distraction* (does not fix decay). Reset is more expensive (rebuild from handoff) but gives a clean slate that fixes decay/anxiety and eliminates accumulated distraction. [HDA]'s guidance: reset when the model shows decay; compact otherwise — and the need for reset *shrinks as models improve* (Opus 4.5 "largely eliminated" the anxiety that forced resets). Choose per-model, and re-check after upgrades.
- **Re-injection cost vs semantic loss.** Re-injecting $\Sigma$ after every window operation costs tokens (the verbatim objective + constraints + progress). Skipping it saves tokens and *loses semantic state* — the forgotten-constraint/repeated-work failures. This is not a real trade: re-injection is mandatory; its cost is the price of not silently regressing. Keep $\Sigma$ small so the cost is bounded (constraints are short; progress is a count + ids; handles are references).
- **Server-side (opaque) vs harness compaction.** Server-side [OCP] is turnkey and efficient but opaque — you cannot audit or steer what it keeps, which *forces* the durable-record backstop. Harness compaction (Chapter 6 recall-then-precision) is auditable and steerable but is your code to build and maintain. Either way you need the backstop; opaque compaction just makes it non-negotiable.
- **Caching interaction.** Compaction and reset both *break the prompt-cache prefix* (Chapter 6 S-1/S-2: a byte-stable prefix is required for cache hits; compaction rewrites the prefix). Continuous compaction is therefore incompatible with prefix caching. Reset breaks the cache once (a clean prefix that can then be cached for the new session). The cost-latency implication is Chapter 14; here, note that aggressive in-place compaction sacrifices caching.

## 8. Experiments: baselines, ablations, metrics

**E1 — Re-injection ablation (the headline).** Place a hard constraint early; run past a compaction event with re-injection ON vs OFF. **Prediction:** OFF → constraint violated downstream at a high rate (forgotten-constraint, Topic 2); ON → violation near zero. Metric: post-compaction constraint-violation rate. This is the experiment that proves "compaction ≠ preservation."
**E2 — Compaction vs reset under decay.** Long single-session task; strategy (a) compact-in-place vs (b) periodic reset-from-handoff, matched total budget. **Prediction ([HDA]):** on a decay-prone model, (b) sustains quality longer (clean slate); on a decay-resistant model, (a) and (b) are comparable and (a) is cheaper. Stratify by model — the stratification is the finding. Metric: quality vs step index (Topic 14 decay slope), cost.
**E3 — Opaque-compaction reliance test.** Rely *solely* on [OCP]'s server-side compaction (no $\Sigma$ re-injection) vs compaction + re-injection. **Prediction:** solo-reliance loses specific facts unpredictably (opaque item does not guarantee any given fact); +re-injection preserves $\Sigma$. Metric: specific-fact survival rate across compaction events.
**E4 — Caching cost of compaction.** Measure prompt-cache hit rate under continuous compaction vs reset-then-cache. **Prediction:** continuous compaction ≈ zero cache hits (prefix churns); reset allows re-caching. Metric: cache-hit rate, token cost.

**Honest status.** [HDA] grounds the compaction/reset definitions and the decay→reset finding *qualitatively* (the context-anxiety observation is real but reported without a decay curve). [OCP] grounds the opaque, lossy nature of server-side compaction. [ECE]/[CCM] ground the re-injection necessity. **No source publishes E1's violation-rate curve, E2's decay slopes, or E3's fact-survival numbers.** The mechanisms are firmly grounded; the magnitudes are unmeasured — specify the experiment, do not invent the number.

## 9. Failure modes, edge cases, hazards, limitations

- **"Just compact when full" (the cardinal error).** Treating compaction as preservation, with no durable-record backstop and no re-injection. Result: $\Sigma$ decays silently — constraints forgotten, work repeated, drift. Mitigation: the preservation theorem — $\Sigma$ in the durable record, re-injected after every operation.
- **Paraphrase-of-paraphrase drift.** Repeated in-place compaction summarizes summaries, and facts mutate across generations (a constraint's meaning softens, a decision's rationale garbles). Mitigation: re-inject $\Sigma$ *verbatim from the durable record* each time, so it does not degrade across compactions — only $\Theta$ is repeatedly summarized, and $\Theta$ is disposable.
- **Exact artifact in the compaction path.** An exact source/config gets summarized and later re-materialized wrong (Topic 6 corruption). Mitigation: exact content is never summarizable; only handles are in $\Sigma$.
- **Reset with an inadequate handoff.** Reset clears the window, but the handoff artifact lacks enough state (RI violation, Topic 3), so the fresh session cannot resume. Mitigation: build the handoff *from the durable record* (which is complete), not from the accumulated window; handoff-completeness check.
- **Compaction hides a live problem.** An error or warning in the window gets summarized away ("some tests failed" loses *which*), and the session proceeds as if clear. Mitigation: unresolved errors are $\Sigma$ (they affect correctness), not $\Theta$ — carry them in the durable record until resolved.
- **Edge case: the decay signal is model-dependent and moving.** The reset-for-decay branch was *necessary* on Sonnet 4.5 and *largely unnecessary* on Opus 4.5 ([HDA]). A harness hard-wired to reset frequently may be paying reset costs a newer model does not need. Mitigation: measure decay (Topic 14); make the reset policy a tunable, not a constant; garbage-collect it if a model no longer needs it (Chapter 15).
- **Limitation.** The $\Sigma$/$\Theta$ partition is a clarifying **[synthesis]**; in practice the boundary is fuzzy (is a mid-computation intermediate $\Sigma$ or $\Theta$? — it depends on whether a later step needs it). The safe default: when unsure, treat it as $\Sigma$ (preserve it in the record). Over-preserving costs tokens; under-preserving costs correctness. The sources ground the operations (compact, reset, re-inject) but not this exact partition, which is the author's framing.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Compaction = in-place summarization (same session, shortened history); reset = clean window + structured handoff [HDA]. They are different operations.
- Reset, not compaction, was the fix for decay/"context anxiety" — and its necessity shrinks as models improve [HDA].
- Server-side compaction produces an *opaque, non-interpretable* item you pass "as-is" — you cannot verify what it kept [OCP].
- Durable instructions survive compaction *only by re-injection*; without it they are lost [ECE][CCM].

**Decision rules.**
- **DR-1.** Never treat compaction as preservation. Compaction manages the window (P1); it does not preserve semantic state. Keep $\Sigma$ in the durable record and re-inject it after every window operation.
- **DR-2.** Re-inject the verbatim objective, verbatim hard constraints, verified progress, and artifact handles after *every* compaction or reset. This is mandatory, not optional.
- **DR-3.** Compact by default (cheaper); reset when the model shows decay/anxiety. Make the policy model-dependent and re-tune after upgrades — the need for reset falls as models improve.
- **DR-4.** Never let an exact artifact's content enter the compaction path; carry it by handle. Never let the window's summary overwrite the authoritative durable record (one-directional flow: record → window).

**Production implications.** This topic is where teams most often build a system that *demos* well and *fails* silently in long runs: they enable compaction, watch it keep the session going, and never realize it is quietly shedding constraints and progress. The fix is not a better compactor — it is the recognition that compaction and semantic-state preservation are *different jobs*, and that the durable record + re-injection does the second. A long-running agent that compacts without a durable-record backstop is not preserving state; it is forgetting it slowly. Getting this right is the difference between "the window fit" and "the task's facts survived."

**Connections.** This topic operationalizes Chapter 6 Topic 11 (compaction) + V-3/T-1 (re-injection) and Chapter 7 [CCM] (root re-injection) for the long-horizon case. $\Sigma$ is preserved by Topics 5 (records) and 6 (artifacts); the exact-artifact carve-out is Topic 6's fidelity rule. Reset is the window-level analogue of Topic 3's session boundary + handoff. The decay signal driving reset is measured in Topic 14. The caching cost is Chapter 14. The distinction "compaction ≠ durability" is the window-level restatement of Topic 1's "context length ≠ long-horizon reliability."

### Sources
- **[HDA]** Anthropic — *Harness design for long-running apps* (compaction = summarize in place, same agent, shortened history; reset = clear window + structured handoff; "a reset provides a clean slate, at the cost of the handoff artifact having enough state"; context anxiety Sonnet 4.5 requiring resets → Opus 4.5 largely eliminated).
- **[OCP]** OpenAI — *Compaction* (`compact_threshold`; server-side automatic; opaque encrypted compaction item "not intended to be human-interpretable"; "pass it as-is"; retained items + pruning).
- **[ECE]** Anthropic — *Effective context engineering* (compaction "maximize recall, then precision"; V-3 durable-instruction survival). Via Chapter 6.
- **[CCM]** Anthropic — *Claude Code memory* (root instruction survives compaction by re-injection; nested does not). Via Chapter 7.
- Internal: Chapter 6 Topics 10/11 (prompt-cache prefix, compaction, re-injection V-3/T-1), Chapter 7 (re-injection, artifacts), this chapter Topics 1 (P1/P2/P3, CL-1), 2 (forgotten constraint, repeated work, decay), 3 (reset = session boundary + handoff), 5 (durable record backstop, safe compaction keeps the original), 6 (exact-fidelity handle rule), 8 (checkpoints), 14 (decay measurement).
