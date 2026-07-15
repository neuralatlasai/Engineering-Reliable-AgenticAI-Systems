# Topic 6 — Ownership Transfer, Result Aggregation, and Final-Answer Authority

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** What happens when delegated work comes *back*: how ownership returns (or does not), how multiple results are aggregated, and — the question that decides correctness — **who has the authority to declare the final answer.**

**Prerequisites.** Topic 5 (handoffs transfer ownership; agents-as-tools do not); Topic 4 (the supervisor synthesizes); Chapter 3, Topic 8 (termination — the model's "done" is a proposal); Chapter 1, Topic 12 ($\kappa$ — `model_stop` ≠ `success`).

**Terminology.** *Ownership transfer*: the change of responsible agent $\rho$ (Topic 5). *Aggregation*: combining multiple component results into one. *Final-answer authority*: the component whose output is delivered as the answer — and the check that validates it.

**Boundaries.** Inside: the return path, aggregation semantics, and answer authority. Outside: the delegation primitives themselves (Topic 5); the workflow state that carries results (Topic 7); termination proofs (Topic 11).

**Exclusions.** No consensus-algorithm survey.

**Outcomes.** The reader can define who owns the final answer, aggregate results without laundering failures, and ensure no component can unilaterally declare success.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Topic 5 established that a handoff transfers ownership and an agent-as-tool does not. That leaves three questions unanswered, and each is a source of silent failure. **(i) Does ownership come back?** A specialist finishes its branch — does the conversation return to the generalist, or does the specialist keep it? **(ii) How are multiple results combined?** A supervisor gets five worker results, two of which failed — what does it produce? **(iii) Who decides the task is done?** If any component can declare success, then the *weakest* component's judgment becomes the system's.

**Bottleneck.** Aggregation is where **failures get laundered into successes**. A supervisor synthesizing five worker results, two of which hit their budget and returned partial work, will — unless explicitly prevented — produce a confident, fluent final answer that *reads* complete. The partial failures vanish into the synthesis. **The aggregation step is a failure-laundering machine unless it is built not to be**, and this is the single most dangerous point in a multi-component workflow.

**Objective.** Explicit ownership return; aggregation that *propagates* failure rather than absorbing it; and a final-answer authority that is code, not a model.

**Assumptions.** Components fail partially (budget, timeout, error). A model asked to synthesize partial results will produce a fluent answer regardless (Chapter 2's false-completion propensity, [FSC §6.3.5]).

**Constraints.** The synthesizer is a model, so its judgment of "these results are sufficient" is a proposal, not a verdict (Chapter 3, Topic 8).

**Success criteria.** Ownership return is explicit; no component's failure is silently absorbed by aggregation; the final answer's $\kappa$ reflects the *worst* constituent outcome, not the synthesizer's confidence.

## 3. Intuition first, then formalization

### 3.1 Intuition: aggregation is where failures go to hide

The core insight, and it is the reason this topic is separate from Topic 5:

**When you combine results, you must combine their *outcomes*, not just their *content*.** A supervisor that receives five worker outputs and synthesizes them is combining *content*. If two workers failed — hit their budget, timed out, returned partial work — and the supervisor combines only the content, **the failure information is destroyed at the aggregation step.** The final answer is fluent, complete-looking, and built on two-fifths missing evidence.

This is Chapter 1, Topic 12's $\kappa$ discipline, at the aggregation boundary. Each worker returns a result *and* a terminal status $\kappa_j$. The aggregate's status is **not** the synthesizer's opinion of the aggregate — it is a *function of the constituent statuses*:

$$
\kappa_{\text{aggregate}} = \operatorname{combine}(\kappa_1, \ldots, \kappa_n)
$$

and the combining function must be **pessimistic**: if any *required* constituent failed, the aggregate failed, **no matter how good the synthesis looks.** A fluent synthesis over failed inputs is *worse* than an error, because it is a confidently-wrong answer that no downstream check will catch.

The intuition for final-answer authority follows directly: **if the synthesizer decides whether the aggregate is complete, then a model that is systematically over-confident (Chapter 2; [FSC §6.3.5]'s unsupported completion claims) becomes the system's completion oracle.** **Code must own the final-answer decision**, exactly as code owns loop termination (Chapter 3, Topic 8). The model *produces* the answer; code *decides* it is an answer.

### 3.2 Formalization: the three invariants

**Ownership return.** Let $\rho$ be the responsible agent (Topic 5). A handoff sets $\rho \leftarrow$ specialist. The question this topic answers: what sets it back? **[synthesis]**

$$
\textbf{O-1 (ownership return is explicit):}\quad
\text{ownership returns to a prior agent ONLY by an explicit transfer;}\ \text{there is no implicit "return" after a handoff.}
$$

O-1 is the correction to a common misconception. A handoff is a *transfer*, not a *call* — it does not "return" the way a function does (Topic 5: control flow is **transfer**, not **nested call** [OAO]). If the conversation should come back to the generalist, that is a *second handoff* (specialist → generalist), and it must be modeled. **A system that expects a handoff to return like a function call has a control-flow bug**: the specialist owns the conversation until it hands off again, and if it never does, it owns it forever.

**Aggregation.** For constituent results $(y_j, \kappa_j)$ with a *required* subset $R$ **[derived from Chapter 1, Topic 12]**:

$$
\textbf{O-2 (pessimistic status aggregation):}\quad
\kappa_{\text{agg}} =
\begin{cases}
\mathrm{success} & \text{iff } \kappa_j = \mathrm{success}\ \ \forall j \in R\\
\text{worst}(\{\kappa_j : j \in R\}) & \text{otherwise.}
\end{cases}
$$

O-2 is the anti-laundering invariant. **The aggregate is successful only if every *required* constituent succeeded.** Optional constituents (a nice-to-have enrichment) may fail without failing the aggregate — but they must be *declared* optional, not silently treated as such. **The default is required**, because a component nobody bothered to mark optional was probably load-bearing.

**Final-answer authority.** **[derived from Chapter 3, Topic 8]**

$$
\textbf{O-3 (code holds final-answer authority):}\quad
\text{a model's "this is the final answer" is a \emph{proposal};}\ \text{code validates it against } \kappa_{\text{agg}}\ \text{and the task's acceptance criteria.}
$$

O-3 is Chapter 3, Topic 8's termination discipline ($\kappa$: `model_stop` ≠ `success`), applied to the *answer* rather than the *loop*. **No model — not the worker, not the supervisor, not a judge — may unilaterally declare the task complete.** The synthesizer produces a candidate answer; code checks that (i) $\kappa_{\text{agg}} = \mathrm{success}$ (O-2), and (ii) the answer satisfies whatever deterministic acceptance criteria exist (Chapter 3, Topic 7's invariants). **Only then is it an answer.**

### 3.3 The synthesizer will always produce something, and that is the hazard

The mechanism behind O-2 and O-3 deserves stating explicitly, because it is the reason they are not merely good hygiene **[derived; grounded in Chapter 2's propensity findings]**:

**A model asked to synthesize will synthesize.** Give a supervisor five worker results, of which two are empty or truncated, and ask it for a final answer — it will produce a fluent, coherent final answer. It will not, reliably, say "I cannot answer; two workers failed." This is Chapter 2's documented false-completion propensity: unsupported completion claims are a *measured* behavior [FSC §6.3.5], and one that *regressed* across a version step [G56 §1] — meaning it cannot be assumed away by using a better model.

So the aggregation step has a specific, predictable pathology: **partial failure in, confident completeness out.** The synthesizer is not lying; it is doing what it does — producing the most plausible continuation given its inputs. **The defect is architectural: we asked a fluent generator to be a failure detector, and it is not one.**

The fix is structural, not prompt-based: **$\kappa$ is computed by code from the constituents (O-2), and the final answer is gated on it (O-3).** The synthesizer's fluency is then harmless — it produces a candidate, and the code refuses to ship it when the constituents failed. **You cannot prompt this away, and you do not need to; you just have to not ask the model the question.**

## 4. Architecture

```
   DELEGATION returns (Topic 5)
        │
        ▼
   ┌── RESULTS + STATUSES  (y₁,κ₁) ... (yₙ,κₙ)   ← κ MUST cross the boundary (Ch.5 T2)
   │                                                 A worker that hit `budget` is NOT success
   ▼
   ┌── O-2: PESSIMISTIC STATUS AGGREGATION (CODE, not the model) ─────────────┐
   │                                                                          │
   │   κ_agg = success  ⟺  every REQUIRED constituent succeeded                │
   │           else       worst(κ_j)                                          │
   │                                                                          │
   │   ← THIS is where failures would otherwise be LAUNDERED (§3.3)           │
   └───────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
   ┌── SYNTHESIS (the model) — produces a CANDIDATE answer ───────────────────┐
   │   The synthesizer will ALWAYS produce something fluent, even over        │
   │   failed inputs (§3.3; FSC §6.3.5). That is fine — it is a CANDIDATE.    │
   └───────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
   ┌── O-3: FINAL-ANSWER AUTHORITY (CODE) ────────────────────────────────────┐
   │   ship  ⟺  κ_agg == success  AND  acceptance_criteria(answer)  (Ch.3 T7) │
   │   else → report the ACTUAL κ (partial / budget / error), not a fluent lie │
   └──────────────────────────────────────────────────────────────────────────┘

   OWNERSHIP RETURN (O-1): a handoff is a TRANSFER, not a call.
     Coming back = a SECOND handoff (specialist → generalist), modeled explicitly.
     Expecting an implicit "return" is a control-flow bug.
```

**The architecture's key move: separate *producing* the answer from *deciding* it is one.** The model is excellent at the first and unreliable at the second. **Code computes $\kappa_{\text{agg}}$ from facts (the constituent statuses) and gates the answer on it.** This is the same separation as Chapter 3, Topic 8 (the model proposes termination; the harness decides it) and Chapter 5, Topic 10 (the model proposes an action; the harness authorizes it). **It is the book's recurring structure, and here it prevents the most consequential silent failure in multi-component workflows.**

## 5. Grounding

- **Ownership semantics:** handoffs — "Control moves to the specialist agent," control flow is **transfer**; agents-as-tools — "The manager keeps ownership of the reply," control flow is **nested calls** [OAO]. **O-1's basis: a transfer does not return like a call.**
- **The supervisor synthesizes:** a central LLM "delegates them to worker LLMs, and synthesizes their results" [BEA]; "The orchestrating agent synthesizes the final answer while delegating specific tasks" [OAO] — the aggregation point.
- **Terminal statuses must be surfaced and must not be collapsed:** Chapter 1, Topic 12's $\kappa$ (`model_stop` ≠ `success`); Chapter 4, Topic 14's totality rule (an unmapped terminal must alarm, never default to `model_stop`); Chapter 5, Topic 2's requirement that a sub-agent's $\kappa$ cross the boundary. **O-2's basis.**
- **Termination is the harness's decision, not the model's:** Chapter 3, Topic 8 — "the model saying it is done is a *proposal* about termination." **O-3's basis.**
- **The false-completion propensity is measured:** unsupported completion claims [FSC §6.3.5], and beyond-intent/propensity *regression* across a version step [G56 §1] — §3.3's mechanism, and the reason it cannot be assumed away with a better model.
- **Verification must be deterministic:** the harness "observes the repository and execution environment through deterministic sensors" [CAH §3.4.1]; verification-driven tools "provide deterministic feedback" [CAH §3.3] — O-3's acceptance criteria should be sensors, not judges (Chapter 3, Topic 7).
- **Voting/aggregation as a pattern:** [BEA]'s parallelization-voting aggregates identical tasks — a *different* aggregation (variance reduction, Topic 2, §3.3) from the *composition* aggregation here (combining different subtasks). **Do not confuse them:** voting aggregates redundant results; supervisor synthesis aggregates *complementary* ones, and only the latter has the required-constituent structure of O-2.

**Evidence gap.** The ownership semantics [OAO] and the $\kappa$/termination disciplines (Chapters 1, 3, 4, 5) are **documented and sourced**; the false-completion propensity is **measured** [FSC; G56]. O-1..O-3 are **[derived]** — O-1 from [OAO]'s transfer-vs-call semantics; O-2 from Chapter 1, Topic 12's $\kappa$ discipline; O-3 from Chapter 3, Topic 8. **No source measures failure-laundering rates at aggregation boundaries** — the claim that "partial failure in, confident completeness out" is common is *reasoned from the measured propensity* [FSC §6.3.5], not itself measured. §8 measures it locally, and it is the experiment this topic most wants run.

## 6. Implementation

**Pessimistic status aggregation (O-2) — the anti-laundering core:**

```python
KAPPA_SEVERITY = {  # worst-first
    "policy_block": 5, "execution_error": 4, "timeout": 3,
    "budget": 2, "model_stop": 1, "success": 0,
}

@dataclass
class Constituent:
    result: object
    kappa: str
    required: bool = True          # DEFAULT REQUIRED — an unmarked component was load-bearing

def aggregate_status(constituents: list[Constituent]) -> str:
    """O-2: κ_agg = success IFF every REQUIRED constituent succeeded.
    This is computed by CODE from FACTS — not by asking the synthesizer how it went.
    Without this, partial failures are laundered into a fluent complete-looking answer (§3.3)."""
    required = [c for c in constituents if c.required]
    if all(c.kappa == "success" for c in required):
        return "success"
    worst = max(required, key=lambda c: KAPPA_SEVERITY[c.kappa])
    return worst.kappa                        # the AGGREGATE inherits the worst required failure
```

**Final-answer authority (O-3) — code decides, the model proposes:**

```python
def finalize(constituents, synthesizer, task, ctx) -> tuple[object, str]:
    """O-3: the synthesizer PRODUCES a candidate; CODE decides whether it is an answer.
    (Same structure as Ch.3 T8: model proposes termination, harness decides.)"""
    kappa_agg = aggregate_status(constituents)                    # O-2 — from facts

    candidate = synthesizer.synthesize(task, [c.result for c in constituents])
    # The synthesizer will produce something fluent even over failed inputs (§3.3). Fine —
    # it is a CANDIDATE. We do not ask it whether the work succeeded.

    if kappa_agg != "success":
        # Do NOT ship a fluent synthesis over failed constituents. Report the truth.
        failed = [c for c in constituents if c.required and c.kappa != "success"]
        return PartialResult(
            candidate=candidate,
            note=f"INCOMPLETE: {len(failed)} required component(s) did not succeed "
                 f"({', '.join(c.kappa for c in failed)}). This answer is not supported.",
        ), kappa_agg

    if not acceptance_criteria(candidate, task):                 # Ch.3 T7 — deterministic
        return candidate, "execution_error"

    return candidate, "success"                                   # only NOW is it an answer
```

**Explicit ownership return (O-1):**

```python
def handoff_back(specialist, generalist, conversation) -> None:
    """O-1: a handoff is a TRANSFER, not a call — there is no implicit return.
    Coming back to the generalist is a SECOND handoff, modeled explicitly. [OAO]"""
    conversation.transfer_ownership(
        to=generalist,
        payload=handoff_payload(conversation, generalist),   # Topic 5, H-1
        reason="specialist branch complete",
    )
    # Without this, the specialist owns the conversation FOREVER.
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| **Pessimistic aggregation (O-2)** | **No laundered failures**; honest $\kappa$ | More runs report failure — *which is the point* |
| Optimistic aggregation ("synthesize whatever came back") | Higher apparent success rate | **Confidently wrong answers built on missing evidence** |
| Required-by-default | Load-bearing components cannot silently fail | Must explicitly mark true optionals |
| **Code holds answer authority (O-3)** | The model cannot declare its own success | An acceptance criterion to write |
| Model holds answer authority | Simple | **The system's completion oracle is a model with a measured over-confidence propensity** [FSC §6.3.5] |
| Explicit ownership return (O-1) | Control flow is correct | A second handoff to model |

**The trade that most teams get wrong, and it is not really a trade.** Pessimistic aggregation (O-2) will *lower your reported success rate* — and that feels like a regression. **It is not: the successes it removes were never successes.** They were fluent syntheses over partial failures, counted as complete because nobody checked the constituents. **O-2 does not make the system worse; it makes the metric honest** — and an honest metric is the precondition for improving anything (Chapter 1's entire argument).

**The O-3 trade is the book's recurring one, and the answer is always the same.** Letting the model decide the answer is complete is simpler and cedes the system's completion criterion to a component with a *measured* propensity toward unsupported completion claims [FSC §6.3.5] — a propensity that **regressed** across a model version step [G56 §1], so it will not be fixed by upgrading. **Code must hold the authority.** The cost is writing an acceptance criterion; the benefit is that the system cannot lie to itself about being done.

## 8. Experiments

**The failure-laundering test — the experiment this topic exists for.** Force a subset of workers to fail (budget, timeout, empty result). Ask the supervisor to synthesize. **Measure: does the final answer report the failure, or does it read as complete?**

- **Prediction (§3.3):** with optimistic aggregation, the synthesizer produces a fluent, confident answer and the failures **vanish**. The final $\kappa$ says `success`.
- **With O-2/O-3:** $\kappa_{\text{agg}}$ reflects the worst required constituent, and the answer is flagged incomplete.
- **The metric: laundering rate** — the fraction of runs with a failed required constituent that nonetheless report `success`. **Target: zero.** Report with the zero-failure bound (Chapter 1, Topic 12).

**This experiment reliably shocks teams**, because the laundering rate in an unguarded system is typically high — the synthesizer is *very* good at producing plausible answers from partial evidence, which is precisely the problem.

**The ownership-return test (O-1).** After a handoff, verify whether the conversation can return to the generalist. **A system that expects an implicit return will have a specialist stuck owning the conversation** — check for conversations that never leave a specialist branch.

**The answer-authority test (O-3).** Give the synthesizer inputs that *cannot* support an answer (all workers failed). Does the system ship a fluent answer anyway? **With code-held authority, it must refuse.**

**The required-vs-optional audit.** For each constituent, is it marked required or optional, and is the marking *correct*? **An optional-marked component whose failure actually breaks the answer is a mislabeled required component**, and it will launder failures through O-2's optional exemption.

**Statistics.** Zero-failure bound on laundering rate (target zero); Wilson on the honest-vs-optimistic success-rate difference (this difference *is* the laundering the system was doing); report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Failure laundering at aggregation.** Partial failures synthesized into a confident complete-looking answer. **The topic's defining failure**, and the most consequential silent failure in multi-component workflows. Mitigation: O-2 — pessimistic status aggregation computed by code from constituent $\kappa$s.
- **Model holds answer authority.** A component with a measured over-confidence propensity [FSC §6.3.5] decides the task is done. Mitigation: O-3 — code gates on $\kappa_{\text{agg}}$ and deterministic acceptance criteria.
- **Constituent $\kappa$ never crosses the boundary.** The supervisor receives content but not status; O-2 is impossible. Mitigation: surface $\kappa$ (Chapter 5, Topic 2; Topic 5's H-2).
- **Implicit ownership return.** A handoff expected to return like a call; the specialist owns the conversation forever. Mitigation: O-1 — model the return as a second handoff.
- **Everything marked optional.** O-2's exemption abused; required components silently fail. Mitigation: required-by-default; audit the markings.
- **Acceptance criteria that are model judges.** The "code" that validates the answer is itself a model — the authority is not really code (Chapter 3, Topic 7). Mitigation: deterministic sensors where possible ([CAH §3.4.1]).
- **Confusing voting-aggregation with composition-aggregation.** Voting combines *redundant* results (variance reduction, Topic 2); composition combines *complementary* ones (O-2's required-constituent structure). Applying voting's majority logic to complementary subtasks is nonsense. Mitigation: know which aggregation you are doing.
- **Edge case — the genuinely optional enrichment.** A "nice-to-have" component whose failure truly does not affect the answer's validity. This is legitimate — mark it optional, and O-2 will correctly exempt it. **But the burden is on the marker to justify it**, and most components marked optional are not.
- **Edge case — partial results that are genuinely useful.** Three of five workers succeeded; the answer is *partially* supported. Shipping nothing wastes the work; shipping a "complete" answer lies. Mitigation: ship the *partial* result **labeled as partial** (§6's `PartialResult`) — honesty preserves the value without the lie.
- **Open limitation.** O-1..O-3 are **[derived]** from sourced semantics ([OAO]'s transfer-vs-call; Chapter 1's $\kappa$; Chapter 3, Topic 8's termination). The false-completion propensity is **measured** [FSC §6.3.5; G56 §1], but **the laundering rate at aggregation boundaries is unmeasured in the sources** — §8's experiment is how you get yours, and this book expects it to be high in unguarded systems.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. A handoff is a **transfer**; an agent-as-tool is a **nested call** [OAO] — a transfer does not return implicitly (O-1).
2. The supervisor/orchestrator "synthesizes the final answer" [BEA; OAO] — the aggregation point.
3. Terminal statuses must be surfaced and never collapsed into success (Chapter 1, Topic 12; Chapter 4, Topic 14; Chapter 5, Topic 2).
4. Termination is the harness's decision, not the model's (Chapter 3, Topic 8).
5. **Unsupported completion claims are a measured propensity** [FSC §6.3.5], and propensities **regressed** across a version step [G56 §1] — a better model will not fix this.
6. Verification should use deterministic sensors [CAH §3.4.1].
7. **Failure-laundering rates at aggregation are unmeasured** — reasoned from the measured propensity.

**Decision rules.**
- **Aggregate statuses, not just content** (O-2) — $\kappa_{\text{agg}}$ is computed by code from the constituent $\kappa$s.
- **The aggregate succeeds only if every *required* constituent succeeded** — required by default.
- **Code holds final-answer authority** (O-3) — the synthesizer proposes; code decides.
- **Never ask the synthesizer whether the work succeeded** — ask the constituent statuses.
- **Ownership return is an explicit second handoff** (O-1) — a transfer is not a call.
- **Ship partial results *labeled partial*** — honesty preserves the value without the lie.

**Production implications.**
1. Run the failure-laundering test (§8) — the laundering rate in an unguarded system is typically high, and finding it is the most valuable hour in this chapter.
2. Compute $\kappa_{\text{agg}}$ from constituent statuses in code; expect your reported success rate to *drop*, and understand that the drop is the honesty you were missing.
3. Verify every constituent's $\kappa$ crosses the delegation boundary; without it, O-2 is impossible.
4. Audit required-vs-optional markings; an optional-marked load-bearing component is a laundering channel.

**Connections.** This topic completes Topic 5's delegation story (ownership out, ownership back). O-2/O-3 are Chapter 1, Topic 12's $\kappa$ discipline and Chapter 3, Topic 8's termination discipline, applied at the aggregation boundary — the same "model proposes, code decides" structure as Chapter 5, Topic 10's authorization. The measured propensity that makes this necessary is Chapter 2's ([FSC §6.3.5]). Topic 7's typed workflow state is what carries $\kappa$ across the boundary; Topic 11 proves the composed workflow terminates; Topic 14 tests these properties.

## Sources

[OAO] OpenAI, agent-orchestration guide — handoffs as **transfer** ("Control moves to the specialist agent") vs agents-as-tools as **nested calls** ("The manager keeps ownership of the reply"; "The orchestrating agent synthesizes the final answer while delegating specific tasks") — https://developers.openai.com/api/docs/guides/agents/orchestration
[BEA] Anthropic, "Building effective agents" — the orchestrator "delegates them to worker LLMs, and synthesizes their results"; parallelization-voting as a *distinct* (redundant-result) aggregation — https://www.anthropic.com/engineering/building-effective-agents
[FSC] Claude Fable 5 & Mythos 5 System Card §6.3.5 — unsupported completion claims as a **measured** propensity; the mechanism behind failure laundering (§3.3) — `Knowledge_source/`
[G56] GPT-5.6 Preview System Card §1 — propensity **regression** across a version step; a better model does not fix over-confident completion — `Knowledge_source/gpt-5-6-preview.pdf`
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3, §3.4.1 — verification-driven tools providing "deterministic feedback"; the harness observing through "deterministic sensors" — the basis for O-3's acceptance criteria
