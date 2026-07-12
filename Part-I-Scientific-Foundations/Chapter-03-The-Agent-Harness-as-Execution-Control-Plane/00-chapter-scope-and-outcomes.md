# Chapter 3 — The Agent Harness as an Execution Control Plane

## Scope, Prerequisites, Terminology, Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter opens with an attribution correction

Chapters 1 and 2 established two facts that most agent engineering still ignores. First: the harness materially changes measured performance — a 23.8-point harness-aggregated score spread under a fixed model pool and task suite (a configuration-level contrast, not a per-model causal effect) [HB §4.1–4.2], and +14.5% average improvement (up to +44.0%) on the reported benchmark suite from harness changes alone with model weights frozen [HX abstract]. Second: the model substrate ships with documented failure mechanisms — false completion claims, premature stops on unverbalized internal states, grader-optimized behavior [FSC §6.3.5, §6.4.1.4, §6.4.2] — that no prompt fixes.

This chapter draws the engineering conclusion: **the harness is not glue code. It is the control plane of a distributed system whose most important component is stochastic**, and it deserves the same design discipline as any control plane — explicit state machines, typed events, deterministic invariants, budget enforcement, replayable execution, and its own experimental methodology.

The attribution correction that frames everything: the Agentic-Harness-Engineering literature's summary of observed production failures is that "many observed failures in code agents arise from missing repository context, brittle tool interfaces, weak validators, excessive token cost, poor retry policies, or mismatched permission boundaries **rather than from model generation**" [CAH §3.5]. The failures live in the layer this chapter builds.

## 2. Chapter scope

The unit under analysis is **π_H** (Chapter 1, Topic 4): everything between the model API and the environment. Definition and decomposition (Topics 1–2); the canonical loop and its architectural variants (Topics 3–4); execution vocabulary (Topic 5); control/data-plane separation and deterministic invariants (Topics 6–7); termination and budgets (Topic 8); lifecycle operations — cancellation through replay (Topic 9); the exception taxonomy (Topic 10); harness-induced capability and harness entropy (Topics 11–12); reference decompositions of the three major production harnesses (Topic 13); and ablation methodology (Topic 14).

## 3. Prerequisites

Chapters 1–2 in full. This chapter leans hardest on: the three-layer policy stack (1.4), error accumulation and the d-lever (1.8), the measurement framework (1.12), the stochastic-policy guarantee inventory (2.1), and the failure-mechanism catalog (2.14).

## 4. Terminology fixed for this chapter

| Term | Definition adopted | Source |
|---|---|---|
| **Harness / scaffold** | "The system that enables a model to act as an agent: it processes inputs, orchestrates tool calls, and returns results" | [DEM] |
| **Harness (structural)** | The layer that "conditions model calls and turns model outputs into actions in an external workspace": prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, recovery | [HB §3] |
| **Cybernetic governor** | The harness as "a control layer that observes the effects of agent actions and regulates subsequent state transitions" | [CAH §3.4.1] |
| **Harness as first-class object** | 𝓗 = (𝓜, 𝓒): model configuration + harness configuration; 𝓒 = (P, S) — hook-indexed processor pipelines plus shared slot resources | [HX §3.1] |
| **PEV loop** | Plan–Execute–Verify: externalize intended change and validation criteria → execute in sandboxed, permissioned environment → verify via deterministic sensors and human-review gates | [CAH §3.4] |
| **Processor** | Atomic harness behavior: consumes one typed event, yields zero or more; outcomes: pass-through, transform, split, intercept, interrupt | [HX §3.2] |
| **Deterministic sensor** | Linters, parsers, compilers, type checkers, tests, static analyzers, fuzzers, runtime monitors, CI pipelines — signals "deterministic or at least reproducible enough to serve as control signals" | [CAH §3.4.1, §3.4.4] |
| **Commit-before-continue** | Execution pauses at each yielded event until the runtime persists its state changes; resumed code "can reliably assume that the state changes signaled in the yielded event have been committed" | [ADK] |
| **Deep telemetry** | Structured traces connecting model decisions, harness actions, environment states, and outcomes — beyond final answers | [CAH §3.5.1] |
| **Evaluation harness** | Infrastructure running evals end-to-end: provides tools, records steps, grades outputs, aggregates results | [DEM] |
| **Typed harness stages** | $\operatorname{Assemble}\to Y_t\sim\pi_{M_c}\to\operatorname{Parse}(\Xi_t)\to\operatorname{Admit}(\widetilde A_t)\to\operatorname{ScheduleExec}(A_t)$ — proposal, candidate set, admitted set, and executed actions are distinct typed objects | Ch. 1, Topic 12 §3.3 |
| **Terminal-control status** | $\kappa_t\in\{\mathrm{continue},\mathrm{success},\mathrm{model\_stop},\mathrm{budget},\mathrm{timeout},\mathrm{execution\_error},\mathrm{policy\_block}\}$, evaluated after each decision event; provider subtypes may refine it | Ch. 1, Topic 12 §3.3 |
| **Observable trace $\hat\tau$** | The persisted run record — requests, proposals, candidate/admitted/executed actions, tool results, $\kappa$ history, usage, workspace snapshots, validator outputs — as distinct from the unrecoverable latent trajectory $\tau^\star$ | Ch. 1, Topic 12 §4; [HB §3.3] |

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
| [CDX] | OpenAI Codex documentation — sandboxing and approvals | https://learn.chatgpt.com/docs/sandboxing (via source.md's Codex docs link) |
| [ADK] | Google ADK runtime event-loop documentation | https://adk.dev/runtime/event-loop/ (redirect from google.github.io/adk-docs) |
| [HX] | HarnessX — now including §3 (composition: hooks, processors, nine dimensions), §4 (operational mirror, pathologies, AEGIS), §5 (co-evolution, ceilings) | `2606.14249v2.pdf` |
| [CAH] | Code as Agent Harness — now including §3.3.4 (workflow-orchestration tool use), §3.4 (PEV loop), §3.5 (AHE, deep telemetry, Evolution Agent, governed mutation) | `2605.18747v1.pdf` |

**Access note, stated plainly:** the README's first anchor for this chapter — OpenAI's "Unrolling the Codex agent loop" (openai.com/index/unrolling-the-codex-agent-loop/) — returned HTTP 403 at retrieval time and could not be read. Codex-side claims in this chapter are grounded in the official Codex documentation [CDX] reachable from `source.md`'s Codex link instead, and are correspondingly narrower (sandbox and approval semantics, not the vendor's loop narrative). No claim in this chapter is attributed to the inaccessible post.

**Notation and statistics contract:** this chapter is bound by Chapter 1, Topic 12 — the typed-stage notation ($C_t$, $Y_t$, $\Xi_t$, $\widetilde A_t$, $A_t$, $\kappa_t$, $\hat\tau$), the configuration tuple $c=(M_c,H_c,D_c,\nu_c,B_c,P_c,\mathcal U_c,J_c)$, and the reporting rules (paired designs, task-clustered uncertainty, vector-valued evaluation). The contract explicitly assigns this chapter its role: "Chapter 3 decomposes the typed harness stages." Engineering syntheses beyond quoted sources are flagged **[derived]** or **[synthesis]** with assumptions stated.

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
