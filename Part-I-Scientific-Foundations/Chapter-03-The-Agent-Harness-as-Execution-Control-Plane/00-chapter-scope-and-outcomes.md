# Chapter 3 — The Agent Harness as an Execution Control Plane

## Scope, Prerequisites, Terminology, Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter opens with an attribution correction

Chapters 1 and 2 established two constraints on agent engineering. First, measured behavior depends materially on the harness: Harness-Bench reports a 23.8-point aggregate contrast across harness configurations under its fixed model pool and task suite [HB §4.1–4.2], while HarnessX reports a 14.5-point average absolute gain across 15 model–benchmark configurations, with a maximum of 44.0 points, after harness evolution with model weights held fixed [HX abstract]. The first result is not a within-model causal effect, and the second is specific to HarnessX's benchmark and search protocol. Second, model substrates exhibit measurable failure behaviors—including unsupported completion claims, premature stopping, and evaluation-conditioned behavior [FSC §6.3.5, §6.4.1.4, §6.4.2]—that cannot be converted into system guarantees merely by adding prompt text.

This chapter draws a scoped engineering conclusion: **the harness is an execution control plane around a stochastic proposal generator**. A deployment may realize that plane in one process or across distributed services. Either way, it needs explicit state transitions, typed proposal/admission/execution boundaries, checked budgets, recoverable state, and an experimental methodology. Event sourcing and replay are design options with prerequisites, not universal requirements. **[synthesis]**

The attribution correction that frames the chapter is narrower than “the harness caused the failure.” The Code-as-Agent-Harness survey identifies missing repository context, brittle tool interfaces, weak validators, excessive token cost, poor retry policies, and mismatched permission boundaries as recurring non-model failure mechanisms [CAH §3.5]. This is a mechanism catalogue and design synthesis, not a prevalence estimate or a causal decomposition of production incidents. It establishes that the harness is a necessary unit of diagnosis.

## 2. Chapter scope

The unit under analysis is the versioned harness configuration $H_c$ and the mechanisms it implements between model context construction and environment-facing dispatch. The harness helps induce the executable policy $pi_{\mathrm{exec}}$; it is not itself a single post-model policy $\pi_H$. Definition and decomposition (Topics 1–2); the canonical loop and its architectural variants (Topics 3–4); execution vocabulary (Topic 5); control/data-plane separation and deterministic invariants (Topics 6–7); termination and budgets (Topic 8); lifecycle operations—cancellation through replay (Topic 9); the exception taxonomy (Topic 10); harness-induced capability and harness entropy (Topics 11–12); reference decompositions of three documented harnesses (Topic 13); and ablation methodology (Topic 14).

## 3. Prerequisites

Chapters 1–2 in full. This chapter leans hardest on: the three-layer policy stack (1.4), error accumulation and the d-lever (1.8), the measurement framework (1.12), the stochastic-policy guarantee inventory (2.1), and the failure-mechanism catalog (2.14).

## 4. Terminology fixed for this chapter

| Term | Definition adopted | Source |
|---|---|---|
| **Harness / scaffold** | "The system that enables a model to act as an agent: it processes inputs, orchestrates tool calls, and returns results" | [DEM] |
| **Harness (structural)** | The layer that "conditions model calls and turns model outputs into actions in an external workspace": prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, recovery | [HB §3] |
| **Cybernetic governor** | The harness as "a control layer that observes the effects of agent actions and regulates subsequent state transitions" | [CAH §3.4.1] |
| **Harness as first-class object** | HarnessX writes $\mathcal H=(\mathcal M,\mathcal C)$ and $\mathcal C=(P,S)$ for a model configuration plus hook-indexed processor pipelines and shared slot resources. This chapter retains that notation only when quoting HarnessX; the book's harness configuration is $H_c$, avoiding collision with visible history $\mathcal H_t$ | [HX §3.1] |
| **PEV loop** | Plan–Execute–Verify: externalize intended change and validation criteria → execute in sandboxed, permissioned environment → verify via deterministic sensors and human-review gates | [CAH §3.4] |
| **Processor** | Atomic harness behavior: consumes one typed event, yields zero or more; outcomes: pass-through, transform, split, intercept, interrupt | [HX §3.2] |
| **Verification sensor** | A versioned parser, compiler, test, static analyzer, runtime monitor, judge, or human review producing evidence with a declared error model. Some are deterministic; others are only reproducible or statistically characterized | [CAH §3.4.1, §3.4.4] |
| **Commit-before-continue** | In the documented ADK event loop, execution resumes after the Runner processes a yielded event; state changes carried by that event are then visible to resumed logic. This does not make unrecorded external effects transactional | [ADK] |
| **Deep telemetry** | Structured traces connecting model decisions, harness actions, environment states, and outcomes — beyond final answers | [CAH §3.5.1] |
| **Evaluation harness** | Infrastructure running evals end-to-end: provides tools, records steps, grades outputs, aggregates results | [DEM] |
| **Typed harness stages** | $c_t=\operatorname{Assemble}_{H_c}(\cdot)$, $y_t\sim\pi_M(\cdot\mid c_t)$, $\xi_t=\operatorname{Parse}_{H_c}(y_t)$, $\widetilde a_t=\operatorname{Admit}_{H_c}(\xi_t)$, and $a_t=\operatorname{Dispatch}_{H_c}(\widetilde a_t)$. Proposal, candidate, admitted action, and executed action are distinct objects; marginalizing these stages induces $\pi_{\mathrm{exec}}$ | Ch. 1, Topic 12 §3.3 |
| **Terminal-control status** | $\kappa_t\in\{\mathrm{continue},\mathrm{success},\mathrm{model\_stop},\mathrm{budget},\mathrm{timeout},\mathrm{execution\_error},\mathrm{policy\_block}\}$, evaluated after each decision event; provider subtypes may refine it | Ch. 1, Topic 12 §3.3 |
| **Observable trace $\hat\tau$** | Persisted evidence—requests, proposals, candidate/admitted/executed actions, tool results, $\kappa$ history, usage, workspace deltas, and validator outputs—as distinct from the generally unrecoverable latent trajectory $\tau^\star$ | Ch. 1, Topic 12 §4; [HB §3.3] |

## 5. System boundary

Inside: loop control, event/message architecture, context assembly mechanics (as control decisions — content strategy is Chapter 6), permission and budget enforcement, exception handling, checkpoint/resume/replay, telemetry, and the harness's own change management. Outside: the model (Chapter 2), tool semantics (Chapter 5), context content (Chapter 6), memory stores (Chapter 7), multi-agent topology (Chapters 8–9), and provider SDK surface details (Chapter 4 — this chapter uses the three reference harnesses as *evidence*, Chapter 4 documents them as *interfaces*).

## 6. Exclusions

- No SDK tutorials; Topic 13's decompositions extract architecture, not usage.
- No security threat modeling (Chapter 12), though the permission machinery appears here as control-plane structure.
- No orchestration patterns (Chapter 8) — this chapter is the single-agent control plane.

## 7. Measurable outcomes for the reader

1. Decompose any agent runtime into the canonical components (Topic 2) and identify which are missing, duplicated, or conflated.
2. State the canonical loop's seven phases and map any SDK's events onto them (Topics 3, 5).
3. Choose event-sourced vs. request–response architecture from recovery and audit requirements, and defend it (Topic 4).
4. Write termination predicates that do not trust the model (Topic 8) and an exception policy covering all seven failure classes (Topic 10).
5. Explain harness-induced capability with the three quantitative results, and detect harness entropy with concrete instruments (Topics 11–12).
6. Design a harness ablation that survives methodological review (Topic 14).

## 8. Source ledger for this chapter

All previous tags remain. New:

| Tag | Source | Provenance |
|---|---|---|
| [DEM] | Anthropic, "Demystifying evals for AI agents" | https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents |
| [CDX] | OpenAI Codex documentation—sandboxing, approvals, and network controls | https://learn.chatgpt.com/docs/agent-approvals-security |
| [ADK] | Google ADK runtime event-loop documentation | https://adk.dev/runtime/event-loop/ (redirect from google.github.io/adk-docs) |
| [HX] | HarnessX — now including §3 (composition: hooks, processors, nine dimensions), §4 (operational mirror, pathologies, AEGIS), §5 (co-evolution, ceilings) | `2606.14249v2.pdf` |
| [CAH] | Code as Agent Harness — now including §3.3.4 (workflow-orchestration tool use), §3.4 (PEV loop), §3.5 (AHE, deep telemetry, Evolution Agent, governed mutation) | `2605.18747v1.pdf` |

**Version note:** runtime documentation is mutable. Provider-specific statements in this chapter are scoped to the official pages cited in [CAL], [ADK], and [CDX] as checked on 2026-07-13. Codex-side claims are limited to documented sandbox, approval, and network semantics; this chapter does not infer an undocumented Codex loop architecture.

**Notation and statistics contract:** this chapter is bound by Chapter 1, Topic 12. Worked prose uses realized values $c_t\rightarrow y_t\rightarrow\widetilde a_t\rightarrow a_t$; formal random variables may use their uppercase counterparts when needed. $\pi_M$ is the model proposal policy and $\pi_{\mathrm{exec}}$ the induced distribution over actions actually dispatched. The configuration tuple is $c=(M_c,H_c,D_c,\nu_c,B_c,P_c,\mathcal U_c,J_c)$, and $\hat\tau$ never denotes the latent trajectory $\tau^\star$. Engineering syntheses beyond quoted sources are flagged **[derived]** or **[synthesis]** with assumptions stated.

## 9. Chapter map

```
00 scope (this file)
01 harness definition                    ──┐
02 separation of concerns                  ├─ what the control plane is
03 canonical loop                          │
04 event-sourced vs request–response     ──┘
05 execution vocabulary                  ──┐
06 control plane vs data plane             ├─ its structure
07 deterministic invariants                │
08 termination and budgets               ──┘
09 cancellation → replay                 ──┐
10 exception taxonomy                      ├─ its failure discipline
11 harness-induced capability              │
12 harness entropy                       ──┘
13 reference decomposition (Codex, Claude Code, ADK)
14 harness ablation methodology
```

Chapter 4 documents the SDK surfaces this chapter analyzed structurally; Chapters 5–7 fill in the planes (tools, context, state) that this chapter's control plane coordinates.
