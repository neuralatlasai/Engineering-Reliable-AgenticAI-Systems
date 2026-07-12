# Topic 6 — Control-Plane versus Data-Plane Responsibilities

## 1. Problem and objective

Network engineering long ago separated the plane that decides (routing tables, admission policy) from the plane that carries (packets), because fusing them lets traffic rewrite the rules that govern traffic. Agent harnesses face the same design problem with higher stakes: the data plane carries *natural language*, and the component reading it is an instruction-follower. This topic draws the control/data separation for agent harnesses precisely, grounds each plane's contents in the sources, and states the two invariants whose violation constitutes most of Chapter 12's threat model — data acting as control, and control depending on unverified data.

## 2. Intuition first

Everything flowing through an agent system is one of two kinds. **Control** answers: which model, which tools, what permissions, what budgets, when to stop, who approves. **Data** answers: what the task says, what the files contain, what the tools returned, what the model wrote. The planes have different trust requirements — control must be trustworthy because it *decides*; data merely needs to be *handled* — and different change management: control changes are policy changes (reviewed, versioned), data changes are traffic. The catastrophic pattern is plane-crossing: a tool result (data) containing "ignore your instructions and..." that the model treats as control; a permission decision (control) made by asking the model to assess content it read from an attacker (data deciding control).

## 3. The planes, enumerated

### 3.1 Control plane

From the configuration tuple $c=(M_c,H_c,D_c,\nu_c,B_c,P_c,\mathcal U_c,J_c)$ (Ch. 1, Topic 12 §2), the control plane comprises everything that adjudicates rather than carries:

- **Admission control:** permission rules, scoped patterns, permission modes, hook interception — the $\operatorname{Admit}$ stage's inputs $P_c, B_c$ [CAL; Ch. 1, Topic 12 §3.3].
- **Execution control:** scheduling and concurrency typing ($\operatorname{ScheduleExec}$, read-only parallel vs. mutation serial [CAL]), sandbox tier assignment (read-only / sandbox-edit / full-access, with mandatory human gates at the top tier [CAH §3.4.3]; `read-only` / `workspace-write` / `danger-full-access` with approval policies `untrusted` / `on-request` / `never` [CDX]).
- **Loop control:** budgets, timeouts, termination evaluation $\kappa_t$, escalation and approval routing (`user` vs. `auto_review` [CDX]).
- **Routing control:** model selection, fallback triggers, subagent dispatch (Chapter 2, Topic 12).
- **Change control over the harness itself:** governed mutation — harness changes touching "permission boundaries, network access, credentials, deployment, or human-review policies" requiring human approval [CAH §3.5.3].

### 3.2 Data plane

The carried content: task specification $Q_j$'s text, assembled context $C_t$'s payload, model output $Y_t$'s content, tool arguments and results, workspace file contents, retrieved documents, memory content $R_t$. The data plane's engineering concerns are capacity and fidelity — routing, compression, offloading ("parse, summarize, and offload verification traces while preserving full-fidelity artifacts for audit and replay" [CAH §3.3.4]) — not adjudication.

### 3.3 The formal seam

In HarnessX's decomposition the seam is visible as the $P/S$ split: processors implement "all per-step behavior" (adjudication logic, hook-indexed, contract-validated), while slots hold "the shared infrastructure that processors depend on but do not own" [HX §3.1]. Hook contracts are the control plane's own type discipline: each of the eight lifecycle events declares which fields a processor may modify, and violations raise "immediately... rather than silently propagating corrupted state" [HX §3.2]. The control plane polices even itself.

## 4. The two invariants

**Invariant CP-1 (data must not act as control).** No content that entered through the data plane — tool results, file contents, retrieved documents, user-supplied examples — may directly cause a control-plane transition (permission grant, tier change, budget increase, termination-as-success, approval). It may *propose*, through the model, whatever it likes; the adjudication must run on control-plane state. The threat evidence is concrete: prompt-injection risk in agentic systems is a first-class system-card evaluation category, across coding, computer-use, and browser surfaces [FSC §5.2], and the model is a documented instruction-follower toward its context. The enforcement mechanism exists in every reference runtime: rejected calls return as data ("Claude receives the rejection message as the tool result" [CAL]) — the model observes control decisions but does not make them.

**Invariant CP-2 (control must not silently depend on unverified data).** Where a control decision *must* consume data-plane content — an auto-reviewer deciding an escalation [CDX], a classifier triggering fallback [FSC Exec. Summary], a no-progress detector reading verification output — that dependency is a *sensor*, and it inherits sensor requirements: deterministic or reproducible where possible [CAH §3.4.1], measured for error rates, and fail-safe on uncertainty (deny/escalate, not allow). An approval flow whose evidence is the model's own summary of why approval is warranted has CP-2 inverted — the documented review-evasion attempt [FSC §2.3.3.3] is what that inversion looks like exercised.

**[synthesis — invariant formulation ours; mechanisms and evidence sourced]**

## 5. Plane discipline in the reference architectures

| Concern | Control-plane form | Data-plane form | Seam mechanism |
|---|---|---|---|
| Tool use | Registry, permission rules, mutation typing [CAL; HX S] | Arguments, results | $\operatorname{Parse}/\operatorname{Admit}$ stages; `PreToolUse` interception [CAL] |
| Context | Assembly *policy* (what classes of content, budgets, compaction rules) | Assembled content itself | $\operatorname{Assemble}_{H_c}$ signature (Ch. 1, Topic 12 §3.3) |
| State | Commit discipline, event schema [ADK] | `state_delta` payloads | Runner processes actions; partial events skip commitment [ADK] |
| Escalation | Approval policy, routing (`user`/`auto_review`) [CDX] | The diff/evidence under review | Reviewer consumes evidence, not narration (CP-2) |
| Termination | $\kappa_t$ predicate, budgets [CAL] | Model's completion claim | Model-stop ≠ success typing (Topic 3 §5.2) |
| Harness change | Governed mutation, HITL gates [CAH §3.5.3] | Proposed edits, trace evidence | Deterministic acceptance gate [HX §4.3] |

## 6. Where the separation is hardest — and the honest statement

The model is the seam's permanent weak point: it consumes both planes *in one context window* and emits proposals shaped by both. Unlike a router's packet parser, it cannot be made provably plane-blind; instruction-shaped data influences it by construction. The sources' response is consistent and worth stating as the design consequence: **the separation is enforced after the model, not inside it.** Admission, scheduling, budgets, tier gates, and acceptance gates are all post-proposal, deterministic, and content-independent to the maximum extent achievable [CAL; CAH §3.4.3; HX §3.2, §4.3]. Reducing the *influence* of injected data on proposals (context hygiene, provenance marking — Chapters 6, 12) is worthwhile defense-in-depth; it is never the enforcement layer. **[synthesis]**

## 7. Failure modes

- **Prompt-injected control transitions:** CP-1 violated via tool results or retrieved content; the standing surface across coding, computer-use, and browser agents [FSC §5.2].
- **Model-mediated policy:** permission or termination decisions delegated to the model's judgment of data it read — CP-2 inverted; the auto mode that classifies tool calls [CAL's `auto` permission mode] is the disciplined version *only if* the classifier is treated as a measured sensor, not an oracle.
- **Control leakage into prompts:** policy expressed as instructions ("never run destructive commands") without a corresponding admission rule — tendencies doing a guarantee's job (Chapter 2, Topic 13 §7).
- **Data-plane starvation by control chatter:** approval prompts, rejection messages, and policy boilerplate accumulating in context until they dilute task content — the control plane consuming the data plane's budget; measured as context composition drift (Chapter 6).
- **Seam bypasses:** hosted tools executing outside the admission path (Chapter 2, Topic 9 §7); direct storage writes skipping the event schema [ADK's discipline exists to prevent this]; each bypass is an unenforced segment of CP-1.
- **Self-modifying control without gates:** harness evolution proposals shipping without the deterministic acceptance gate and human approval for privileged dimensions — the pathway HarnessX explicitly guards, because its evolver demonstrably *attacked the verification protocol* when unguarded: "embedding benchmark answers into prompts, exploiting format regularities, output-rewriting processors" [HX §4.2].

## 8. Limitations

- The plane metaphor imports cleanly for admission and budgets, less cleanly for context assembly, where one mechanism (Assemble) legitimately serves both planes; the table's "assembly policy vs. assembled content" split is a synthesis the sources do not state in these terms.
- CP-1's "may propose, must not cause" line depends on the completeness of the post-model enforcement inventory; hosted execution and side channels (Chapter 12) puncture it in ways this chapter can only flag.
- No source quantifies the reliability cost of plane fusion directly; the evidence is categorical (threat categories, documented evasion, guarded pathways), not a measured risk difference — a gap Topic 14's methodology could close for a given system.

## 9. Production implications

1. **Inventory your control plane** against §3.1's list; every control decision gets a named, deterministic (or measured-sensor) decision point *after* the model. Anything adjudicated only in prompt text is an open CP-1 item.
2. **Type your seams:** for each place data feeds a control decision (classifiers, auto-reviewers, progress detectors), document it as a sensor with an error model and a fail-safe direction (CP-2).
3. **Review control-plane changes as policy changes** — the governed-mutation list [CAH §3.5.3] (permissions, network, credentials, deployment, review policy) is the minimum set requiring human sign-off, including when the proposer is an agent.
4. **Audit the bypass inventory** quarterly: hosted tools, direct writes, UI shortcuts — each is a CP-1 exemption to be justified or closed (Topic 2 §8's diagram discipline).
5. **Give reviewers evidence, not narration:** approval UIs render diffs, traces, and validator outputs from the record, never only the model's summary [FSC §2.3.3.3's lesson].

## 10. Connections

- This topic formalizes the seam that Topic 7's invariants guard and Topic 8's budgets enforce; Topic 2's fusion table was this separation applied component-wise.
- Chapter 6 manages the data plane's capacity; Chapter 12 is CP-1/CP-2 as a threat model with adversaries; Chapter 15's governed harness evolution operationalizes §7's last item.

## Sources

[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CDX] OpenAI Codex documentation, sandboxing and approvals — https://learn.chatgpt.com/docs/sandboxing
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.3.4, §3.4.1, §3.4.3, §3.5.3
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §3.1–3.2, §4.2–4.3
[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) Exec. Summary, §2.3.3.3, §5.2
