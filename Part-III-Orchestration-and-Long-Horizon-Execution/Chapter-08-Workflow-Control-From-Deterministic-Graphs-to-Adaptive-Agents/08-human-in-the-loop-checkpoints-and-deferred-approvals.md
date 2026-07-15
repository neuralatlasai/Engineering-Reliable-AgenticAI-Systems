# Topic 8 — Human-in-the-Loop Checkpoints and Deferred Approvals

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Where a human enters the control flow, what they are asked, and — the part that decides whether the gate is real — how the run *waits* without dying. Includes the deferred-approval pattern that makes human gates compatible with autonomy.

**Prerequisites.** Chapter 5, Topic 5 (effect classes — the gate fires on irreversible writes); Chapter 5, Topic 10 (the `escalate` decision as a first-class outcome; approvals as durable state); Topic 3 (risk routing — indeterminate risk escalates); Chapter 3, Topic 9 (checkpoint/resume — the mechanism that lets a run wait).

**Terminology.** *HITL checkpoint*: a control point where the run pauses for human decision. *Deferred approval*: the run continues doing *other* work while an approval is pending, rather than blocking. *Approval record*: the durable, audited outcome of a gate.

**Boundaries.** Inside: gate placement, the approval contract, waiting without dying, and gate economics. Outside: the *policy* of what requires approval (Chapter 12); the durable execution that makes waiting possible (Topic 10; Chapter 10).

**Exclusions.** No approval-UI design.

**Outcomes.** The reader can place gates where they matter, keep a paused run alive for hours or days, and avoid the approval fatigue that turns a gate into theatre.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Some actions are too consequential for a stochastic policy to take unilaterally: an irreversible write (Chapter 5, Topic 5), a production change, an outbound communication. A human must approve. But inserting a human into an autonomous loop creates three problems at once: **the run must wait** (potentially for hours — humans sleep), **the human must be given enough to decide** (an approval request with no context is a rubber stamp), and **the gate must not fire so often that humans stop reading it** (approval fatigue — the failure that makes the gate worse than useless).

**Bottleneck.** The naive implementation blocks: the run holds a process, a connection, and its context while waiting for a human who may respond in six hours. **This is why most HITL implementations either time out (losing the run) or are never used (because they cannot survive the wait).** The bottleneck is that a human gate is a *long-duration pause*, and a run that cannot be durably suspended cannot have one.

**Objective.** Gates that (i) fire on the actions that warrant them and no others, (ii) present the human with enough evidence to decide, (iii) survive an arbitrarily long wait via durable suspension, and (iv) do not train reviewers to click approve.

**Assumptions.** Human latency is unbounded (minutes to days). The gate's value depends entirely on the human actually reading it.

**Constraints.** A blocking wait is incompatible with long human latency. Every gate costs human attention, and attention is finite — the binding constraint on how many gates you can have.

**Success criteria.** Gates fire on the hazardous subset (not the whole tool); paused runs survive arbitrarily long waits; approval decisions are durable and audited; override/approve-everything rate is measured and low.

## 3. Intuition first, then formalization

### 3.1 Intuition: the gate is a suspension, not a block — and its real cost is attention

Two reframes make HITL tractable.

**First: a human gate is a *durable suspension*, not a blocking call.** The run does not sit in a `while` loop waiting for a webhook. It **checkpoints its state, terminates its process, and is resumed when the approval arrives** (Chapter 3, Topic 9; Chapter 7, Topic 3's event log). This is why HITL and durable execution (Topic 10) are the same engineering problem: **a system that cannot durably suspend cannot have a human gate that survives lunch.** Every HITL implementation that "times out after 5 minutes" has this backwards — it built a blocking wait and then bounded it, rather than building a suspension.

**Second: the gate's cost is not latency — it is *attention*.** A gate that fires 200 times a day trains its reviewers to approve reflexively, and **a gate everyone approves is a gate that has been decommissioned by human behavior without anyone deciding to decommission it** (Chapter 5, Topic 5, §7). At that point you have the latency cost, the engineering cost, *and* a false record of oversight — which is strictly worse than no gate, because it manufactures assurance.

So the design problem is **attention budgeting**: you have a limited number of meaningful approvals per reviewer per day, and every gate spends from it. **The engineering goal is to fire the gate on the *smallest hazardous subset*, so each firing is worth reading.** This is exactly why Chapter 5, Topic 5's *per-call* effect classification matters: it lets the gate fire on `rm -rf /production` and not on `ls` — the same tool, different calls, one gate firing.

### 3.2 Formalization: the gate predicate, the suspension, and the fatigue bound

**The gate predicate.** A gate fires on a *call*, not a *tool* **[derived from Chapter 5, Topics 5, 10]**:

$$
\textbf{G-1 (gate the hazardous subset, not the tool):}\quad
\operatorname{gate}(u, x, s)\ =\ \bigl[\chi(u,x,s) = \textsf{W}_{\mathrm{irr}}\bigr]\ \wedge\ \bigl[\text{not already authorized by policy}\bigr].
$$

G-1 says the gate fires when the *per-call* effect class (Chapter 5, Topic 5) is an irreversible write *and* standing policy does not already permit it. **Gating the whole tool (every `bash` call needs approval) is what produces fatigue; gating the hazardous calls is what makes the gate readable.**

**The suspension.** A gated run does not block **[derived from Chapter 3, Topic 9]**:

$$
\textbf{G-2 (gates suspend, not block):}\quad
\text{on gate: checkpoint } \hat\tau \to \text{durable store};\ \text{terminate process};\ \text{resume on approval event.}
$$

G-2 is the mechanism, and it is why this topic depends on Topic 10. **The run's state is persisted (Chapter 7, Topic 3's event log), the process is released, and the approval arrives as an event that resumes the run** — possibly on a different machine, hours later. The run's survival is decoupled from the process's lifetime.

**The fatigue bound.** The gate's value depends on the human's attention, and attention is finite **[synthesis]**:

$$
\textbf{G-3 (fatigue bound):}\quad
\text{a gate is effective only while } \Pr(\text{reviewer rejects} \mid \text{gate fires}) \gg 0 .
$$

G-3 is the operational health metric. **If the rejection rate approaches zero, the reviewers are rubber-stamping** — either because the gate fires on safe actions (fix G-1: narrow it) or because it fires too often (fix the volume). **A gate with a ~0% rejection rate is not evidence that the agent is safe; it is evidence that the gate is not being read.** This is the metric to put on a dashboard, and it is the one nobody tracks.

### 3.3 Deferred approval: the pattern that reconciles gates with autonomy

The naive gate stops the world: the agent hits an irreversible action, pauses, and *nothing happens* until a human responds. For a long-running agent with much other work to do, this is wasteful — and it is often unnecessary.

**Deferred approval** [synthesis; grounded in Chapter 5, Topic 5's design-the-class-down principle]: the agent **continues doing other, non-blocked work** while the approval is pending, and applies the gated action when (and if) approval arrives.

Two mechanisms make this work:

- **Outbox / staging.** The agent *prepares* the irreversible action (drafts the email, stages the patch, computes the transfer) and writes it to an **outbox** — a durable, reviewable staging area. The action is *not* executed. The agent proceeds with unrelated work. A human reviews the outbox and approves; only then is the action dispatched. **This converts an irreversible action into a reversible one (the draft can be discarded), which — per Chapter 5, Topic 5, §7 — is the cheapest safety move available: design the effect class down rather than gating it up.**

- **Dependency-aware continuation.** The agent continues only on work that does *not* depend on the gated action's outcome. Work that does depend on it waits (Topic 4's shared-state dependency; Topic 11's cycle detection applies). **This requires the typed workflow state of Topic 7** — you must know what depends on what.

**The deferred pattern is the one that makes HITL compatible with autonomy at scale.** A blocking gate makes an autonomous agent as slow as its slowest human. A deferred gate lets the agent work at machine speed on everything except the handful of actions that need a human, and batch those for review. **This is the design that lets you have both.**

## 4. Architecture

```
   agent proposes action  (u, x, s)
        │
        ▼
   ┌── G-1: GATE PREDICATE — fires on the HAZARDOUS CALL, not the tool ──────────┐
   │   χ(u,x,s) == W_irr  (per-CALL effect class — Ch.5 T5)                       │
   │   AND not already authorized by standing policy                             │
   │   ← gating the whole tool ⇒ FATIGUE ⇒ rubber-stamping ⇒ gate decommissioned │
   └────────────────┬──────────────────────────────────┬────────────────────────┘
                    │ no gate                          │ GATE
                    ▼                                  ▼
              execute                    ┌─────────── TWO OPTIONS ───────────┐
                                         │                                   │
                    ┌────────────────────▼──────┐        ┌───────────────────▼──────────┐
                    │ BLOCKING GATE (G-2)        │        │ DEFERRED APPROVAL (§3.3)     │
                    │  checkpoint τ̂ → durable    │        │  STAGE the action → OUTBOX   │
                    │  TERMINATE the process     │        │  (irreversible → reversible! │
                    │  (do NOT hold a connection)│        │   Ch.5 T5's design-down)     │
                    │        │                   │        │        │                     │
                    │  ...hours pass...          │        │  agent CONTINUES other work  │
                    │        │                   │        │  (dependency-aware — T7)     │
                    │  approval EVENT arrives    │        │        │                     │
                    │        ▼                   │        │  human reviews the OUTBOX    │
                    │  RESUME from checkpoint    │        │  approve ⇒ dispatch          │
                    │  (Ch.3 T9, Topic 10)       │        │  reject  ⇒ discard the draft │
                    └────────────────────────────┘        └──────────────────────────────┘
                                    │                                   │
                                    ▼                                   ▼
                    APPROVAL RECORD → durable, audited (Ch.5 T10; Ch.7 T3)
                    "what was proposed, what evidence was shown, what risks were
                     surfaced, who approved or rejected it" [CAH §5]

   G-3 HEALTH METRIC: P(reject | gate fires). Near ZERO ⇒ rubber-stamping ⇒
                      the gate is theatre with an audit trail. NARROW IT.
```

**The deferred pattern's key insight, restated:** staging an irreversible action into an outbox **changes its effect class** (Chapter 5, Topic 5). A drafted email is reversible (discard it); a sent email is not. **So the outbox is not merely a queue — it is the mechanism that converts $\textsf{W}_{\mathrm{irr}}$ into $\textsf{W}_{\mathrm{rev}}$**, which is Chapter 5, Topic 5's "design the class down, don't just gate it up," realized as a workflow pattern.

## 5. Grounding

- **The `escalate` decision is a first-class outcome:** the authorization function returns allow / deny / **escalate** (Chapter 5, Topic 10, §3.2) — the gate is a return value, not an exception.
- **Approvals must be durable harness state, not transient prompts:** "Human-in-the-loop control should not appear only as an occasional prompt interruption; it should become durable harness state. Each approval, rejection, policy exception, or reviewer correction should update the harness's permission rules, escalation policy, verification criteria, and future memory retrieval" [CAH §5].
- **The approval record's required content:** "high-stakes approvals should be auditable state transitions: what action was proposed, what evidence was shown, what risks were surfaced, who approved or rejected it, and what responsibility boundary changed afterward" [CAH §5]. **This is the approval contract, sourced.**
- **Permission tiers must specify human gates:** each tier should specify "allowed actions, constraints, audit logs, rollback mechanisms, and **human-in-the-loop gates for high-risk operations**" [CAH §5, §3.4.4].
- **The PEV loop includes human-review gates:** the harness verifies "through deterministic sensors and human-review gates" [CAH §3.4] — the human gate is part of the verification stage.
- **The harness decides whether to escalate:** the cybernetic governor can "continue execution, revise a patch, request more context, route the task to another module, reduce permissions, or **escalate to a human reviewer**" [CAH §3.4.1].
- **The open problem:** designing "harnesses that can decide when autonomy is appropriate and when human judgment is mandatory" is an **open problem** [CAH §5] — the gate-placement question is *not solved*, and this topic is engineering discipline on an open problem.
- **Approval policies ship as platform primitives:** Codex's `untrusted` / `on-request` / `never` approval policies [CDX] (Chapter 4, Topic 4) — the gate as a configurable platform control.
- **Effect classes determine what needs a gate:** Chapter 5, Topic 5's E1/E2 (writes need authorization; irreversible writes need a gate) and the per-call classification — G-1's basis.
- **Approval fatigue is a named hazard:** Chapter 5, Topic 5, §7 and Topic 10, §7 (an override rate near 100% means the gate is theatre) — G-3.
- **Durable suspension is the mechanism:** Chapter 3, Topic 9 (cancellation/resumption); Chapter 7, Topic 3 (the event log as the resume substrate) — G-2.

**Evidence gap.** The approval contract and the durable-state requirement are **strongly sourced** [CAH §5]. The gate-*placement* question is explicitly an **open problem** [CAH §5] — no source specifies which actions warrant a gate, and no source measures fatigue thresholds, rejection rates, or the deferred-approval pattern's effect. G-1..G-3 are **[derived]** (G-1 from Chapter 5, Topic 5's effect classes; G-2 from Chapter 3, Topic 9; G-3 from the fatigue hazard, reasoned not measured). **The deferred-approval pattern (§3.3) is [synthesis]** — an application of Chapter 5, Topic 5's design-the-class-down principle; no source documents it as a named pattern.

## 6. Implementation

**The gate predicate — fire on the hazardous call, not the tool (G-1):**

```python
def needs_approval(call, ctx) -> bool:
    """G-1: gate the CALL, not the TOOL. `bash("ls")` and `bash("rm -rf /prod")` are the
    same tool and different effect classes (Ch.5 T5). Gating the tool ⇒ fatigue ⇒ the
    gate gets rubber-stamped ⇒ it is decommissioned by human behavior (G-3)."""
    effect = classify_call(call.tool, call.args, ctx)          # PER-CALL (Ch.5 T5, §6)
    if effect is not Effect.WRITE_IRREVERSIBLE:
        return False
    if ctx.policy.standing_authorization(call):                # already permitted
        return False
    return True
```

**Durable suspension — the gate does NOT block (G-2):**

```python
async def gated_execute(call, ctx) -> StepResult:
    """G-2: a gate SUSPENDS. It does not hold a process for six hours waiting on a human."""
    if not needs_approval(call, ctx):
        return await execute(call, ctx)

    record = ApprovalRecord(                       # [CAH §5]'s required content
        proposed_action=call.describe(),
        evidence_shown=ctx.evidence_for(call),
        risks_surfaced=risk_analysis(call, ctx),
        run_id=ctx.run_id, principal=ctx.acting_principal.id,
    )
    await ctx.approvals.request(record)

    # CHECKPOINT and RELEASE. The process dies; the run does not. (Ch.3 T9; Topic 10)
    await ctx.checkpoint(pending_approval=record.id)
    raise SuspendRun(reason="awaiting_approval", resume_on=f"approval:{record.id}")
    # ... hours later, the approval EVENT resumes the run from the checkpoint.
```

**Deferred approval — stage into an outbox; keep working (§3.3):**

```python
async def deferred_execute(call, ctx) -> StepResult:
    """§3.3: STAGE the irreversible action instead of blocking on it.
    The outbox converts W_irr → W_rev (a draft is discardable) — Ch.5 T5's design-down.
    The agent CONTINUES on work that does not depend on this action's outcome."""
    if not needs_approval(call, ctx):
        return await execute(call, ctx)

    staged = await ctx.outbox.stage(call)          # PREPARED, not executed. Reversible now.
    await ctx.approvals.request(ApprovalRecord(proposed_action=call.describe(),
                                               evidence_shown=ctx.evidence_for(call),
                                               risks_surfaced=risk_analysis(call, ctx),
                                               staged_id=staged.id))
    # The agent proceeds — but ONLY on work not depending on this (needs typed state, T7).
    return StepResult(content=None, kappa="pending_approval",     # a first-class status
                      provenance=ctx.provenance,
                      note=f"staged as {staged.id}; continuing independent work")

async def on_approval(staged_id, approved: bool, reviewer, ctx) -> None:
    staged = await ctx.outbox.get(staged_id)
    if approved:
        await execute(staged.call, ctx)            # NOW it is dispatched
    else:
        await ctx.outbox.discard(staged_id)        # the draft is simply discarded — reversible
    await ctx.approvals.persist(decision=approved, by=reviewer)   # DURABLE [CAH §5]
    await ctx.resume_dependents(staged_id)         # unblock work that waited on this
```

**The G-3 health metric — the one nobody tracks:**

```python
def gate_health(approvals: list[ApprovalRecord]) -> dict:
    """G-3: a gate with a ~0% rejection rate is NOT evidence the agent is safe.
    It is evidence the gate is not being read. NARROW IT (G-1)."""
    fired = len(approvals)
    rejected = sum(1 for a in approvals if not a.approved)
    rate = rejected / max(fired, 1)
    return {
        "fires_per_day": fired / days_covered(approvals),
        "rejection_rate": rate,
        "healthy": rate > MIN_REJECTION_RATE,      # near zero ⇒ rubber-stamping
        "verdict": ("RUBBER-STAMPING: gate fires on safe actions or too often. "
                    "Narrow the predicate (G-1)." if rate < MIN_REJECTION_RATE else "ok"),
    }
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Gate on the hazardous call (G-1) | Each firing is worth reading | Per-call classification (Chapter 5, Topic 5) |
| Gate on the whole tool | Simple | **Fatigue → rubber-stamping → the gate is theatre** |
| **Blocking gate** | Simple control flow | **Holds a process for human-latency**; times out; loses runs |
| **Durable suspension (G-2)** | Runs survive arbitrarily long waits | Checkpoint/resume infrastructure (Topic 10) |
| **Deferred approval (§3.3)** | **Autonomy at machine speed + human gates** | An outbox; dependency tracking (Topic 7) |
| Rich approval record [CAH §5] | The reviewer can actually decide | Assembling the evidence |
| Bare approval prompt | Cheap | **A rubber stamp** — the reviewer has nothing to decide *with* |

**The trade that decides whether HITL is usable at all: blocking vs suspension.** A blocking gate is easy to write and **incompatible with human latency** — humans respond in hours, and no process should be held for hours. Teams discover this, add a timeout, and the timeout kills runs. **The suspension (G-2) is more infrastructure (Topic 10's durable execution) and is the only design that actually works**, because it decouples the run's lifetime from the process's.

**The trade that decides whether the gate is *real*: attention.** Every gate spends reviewer attention, and attention is the binding constraint. **A system with many gates has no gates**, because the reviewers stop reading. **Narrow the predicate (G-1) until each firing is worth a human's time** — and measure the rejection rate (G-3) to know whether you have. **The deferred pattern helps here too: batching staged actions for review is far cheaper in attention than interrupting a human per action.**

## 8. Experiments

**The gate-health measurement (G-3) — the one that reveals theatre.** Measure rejection rate and fires-per-day per gate. **A rejection rate near zero means the gate is being rubber-stamped** — and the correct response is *not* to remove it but to *narrow* it (G-1), so that it fires on the hazardous subset where a human genuinely adds judgment. **This metric belongs on a dashboard and almost never is.**

**The suspension-survival test (G-2).** Trigger a gate; kill the process; wait (simulate hours); deliver the approval; **verify the run resumes correctly from its checkpoint.** A run that cannot survive a process death cannot survive a human. **This is Chapter 3, Topic 9's recovery test, applied to the gate** — and it is the test that separates a real HITL implementation from one that only works in a demo.

**The deferred-approval throughput ablation (§3.3).** Blocking gate vs deferred/outbox. Metrics: **end-to-end task latency** (the point — deferred should be dramatically lower), work completed while pending, and correctness (does the deferred agent avoid work that depended on the gated action?). **Prediction: deferred approval decouples agent throughput from human latency**, which is the pattern's entire justification.

**The reviewer-evidence test.** Vary the approval record's richness (bare action / action + evidence / action + evidence + risk analysis [CAH §5]). **Measure reviewer decision quality and time.** A reviewer given only "approve `bash` command?" cannot decide — and will approve.

**The fatigue simulation.** Increase gate firing rate; measure rejection rate over time. **Prediction: rejection rate decays as firing rate rises** — the empirical demonstration of G-3, and the argument for narrowing.

**Statistics.** Wilson on rejection rates; report fires-per-day distributions; paired latency comparison (blocking vs deferred) with p50/p95; zero-failure bound on suspension-survival failures (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Blocking gate.** Holds a process for human latency; times out; loses the run. **The implementation failure that makes teams abandon HITL.** Mitigation: G-2 — durable suspension (Topic 10).
- **Approval fatigue → rubber-stamping.** The gate fires so often that reviewers approve reflexively; **you have the cost, none of the safety, and a false audit trail** — worse than no gate. Mitigation: G-1 (narrow the predicate); G-3 (measure rejection rate).
- **Gate on the tool, not the call.** Every `bash` needs approval, including `ls`. The direct cause of fatigue. Mitigation: per-call effect classification (Chapter 5, Topic 5).
- **Bare approval prompt.** The reviewer has no evidence and cannot decide — so they approve. Mitigation: [CAH §5]'s record — what was proposed, what evidence, what risks.
- **Transient approvals.** The approval is a modal dialog that disappears; no durable record; the system learns nothing and satisfies no auditor. Mitigation: [CAH §5] — approvals are durable harness state that updates policy.
- **Deferred approval executing dependent work.** The agent continues on work that *did* depend on the gated action, using a result that does not exist. Mitigation: dependency-aware continuation (§3.3) — requires typed workflow state (Topic 7).
- **The outbox that is never reviewed.** Staged actions accumulate; nothing ships. Mitigation: outbox SLAs and alerting; the outbox is a queue with an owner.
- **Approval of a stale action.** Approved six hours later, the world has changed, and the action is no longer safe. Mitigation: **re-validate the basis at dispatch time** (Chapter 5, Topic 12's freshness check; Chapter 6, Topic 8's staleness) — approval authorizes the *intent*, and the *preconditions* must still hold when it executes.
- **Edge case — an action too urgent to wait.** Some irreversible actions are time-critical (stop a runaway process). A gate that blocks them is itself a hazard. Mitigation: standing authorization for time-critical safety actions (G-1's second clause), with post-hoc review rather than pre-hoc approval.
- **Open limitation.** **Gate placement is an explicitly open problem** [CAH §5]: "designing harnesses that can decide when autonomy is appropriate and when human judgment is mandatory" is unsolved. **No source measures fatigue thresholds, optimal rejection rates, or the deferred pattern's effect.** G-1..G-3 are **[derived]**; the deferred pattern is **[synthesis]**. This topic is disciplined engineering on an open problem, and it should be read that way.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. `escalate` is a first-class authorization outcome (Chapter 5, Topic 10), and the harness may "escalate to a human reviewer" [CAH §3.4.1].
2. **Approvals must be durable harness state, not "an occasional prompt interruption"** — each approval "should update the harness's permission rules, escalation policy, verification criteria, and future memory retrieval" [CAH §5].
3. The approval record must contain "what action was proposed, what evidence was shown, what risks were surfaced, who approved or rejected it, and what responsibility boundary changed afterward" [CAH §5].
4. Permission tiers must specify "human-in-the-loop gates for high-risk operations" [CAH §5, §3.4.4].
5. Approval policies ship as platform primitives (`untrusted`/`on-request`/`never`) [CDX].
6. **Deciding when human judgment is mandatory is an OPEN PROBLEM** [CAH §5].
7. **No source measures fatigue thresholds or the deferred pattern's effect.**

**Decision rules.**
- **Gate the hazardous *call*, not the tool** (G-1) — per-call effect classification is what makes the gate readable.
- **Gates suspend; they never block** (G-2) — checkpoint, release the process, resume on the approval event.
- **Measure the rejection rate** (G-3) — a rate near zero means the gate is theatre, and the fix is to *narrow* it, not remove it.
- **Prefer deferred approval** (§3.3) — stage into an outbox, keep working; it converts $\textsf{W}_{\mathrm{irr}}$ to $\textsf{W}_{\mathrm{rev}}$ and decouples agent throughput from human latency.
- **The approval record carries evidence and risk** [CAH §5] — a bare prompt is a rubber stamp by construction.
- **Re-validate preconditions at dispatch** — approval authorizes the intent; the world may have moved.

**Production implications.**
1. Put gate rejection rate on a dashboard (G-3); a ~0% rate is the signal that your oversight is theatre.
2. Build the suspension (G-2) before building the gate — a gate that cannot survive a process death cannot survive a human.
3. Adopt the outbox/deferred pattern; it is what makes HITL compatible with autonomous throughput.
4. Make approvals durable and policy-updating [CAH §5], not modal dialogs that vanish.

**Connections.** This topic's gate predicate is Chapter 5, Topic 5's effect classes and Topic 10's `escalate`; its durable suspension is Chapter 3, Topic 9 and **Topic 10's durable execution** (they are the same mechanism); its outbox is Chapter 5, Topic 5's design-the-class-down. Topic 3's indeterminate-risk routing escalates here. Topic 7's typed state enables dependency-aware continuation. Chapter 12 supplies the policy of what requires approval — this topic builds the mechanism.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4 (the PEV loop verifying "through deterministic sensors and human-review gates"), §3.4.1 (the harness may "escalate to a human reviewer"), §3.4.4 and §5 (permission tiers specifying "human-in-the-loop gates for high-risk operations"; **"Human-in-the-loop control should not appear only as an occasional prompt interruption; it should become durable harness state. Each approval, rejection, policy exception, or reviewer correction should update the harness's permission rules, escalation policy, verification criteria, and future memory retrieval"**; "high-stakes approvals should be auditable state transitions: what action was proposed, what evidence was shown, what risks were surfaced, who approved or rejected it, and what responsibility boundary changed afterward"; **"The open problem is to design harnesses that can decide when autonomy is appropriate and when human judgment is mandatory"**)
[CDX] OpenAI Codex documentation — approval policies (`untrusted`, `on-request`, `never`) as shipped platform gate controls — https://learn.chatgpt.com/docs/agent-approvals-security
