# Chapter 1 — Agentic Systems as Sequential Decision Processes

## Scope, Prerequisites, Terminology, Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why this chapter opens with failure data, not promise

Three independent measurements, from three independent groups, define the empirical starting point of this book. None of them is flattering to the field.

**Measurement 1 — Composition destroys local competence.** DeepMind's CompWoB study (Furuta, Matsuo, Faust, Gur; TMLR) built 50 compositional web-automation tasks out of base MiniWoB tasks that agents already solve. Prompted LLM agents (gpt-3.5-turbo, gpt-4) succeed on **94.0%** of base tasks but only **24.9%** of their compositions. Finetuned/transferred models fall from **85.4%** to **54.8%**; the purpose-built HTML-T5++ reaches 95.2% base but only 61.5% zero-shot compositional. Performance degrades further when task-instruction *order* changes. If step success were independent, two composed 94%-tasks would predict ~88% joint success; the observed 24.9% means composition introduces failure modes that do not exist in the parts. Local task success cannot be extrapolated to workflows. [CompWoB]

**Measurement 2 — The harness moves the number as much as the model.** Harness-Bench (arXiv:2605.27922) fixed 106 sandboxed tasks, budgets, timeouts, and evaluators, then varied only the execution harness across 8 model backends — 5,194 trajectories total. Aggregate scores ranged from **52.4 (OpenClaw)** to **76.2 (NanoBot)**: a **23.8-point gap attributable to the harness configuration alone**, under the same model pool and task suite. The authors' conclusion, which this book adopts as an axiom: *agent capability must be reported at the model–harness configuration level, not attributed to the base model.* [HB §4.2]

**Measurement 3 — Frontier agents fail at economically real work.** Agents' Last Exam (arXiv:2606.05405) collected 1,490 task instances across 55 professional subdomains from 250+ industry experts, anchored to the O*NET/SOC occupational taxonomy. The strongest configuration measured (Codex with GPT-5.5) scores 82% on Terminal-Bench yet **below 50% on ALE's easiest tier and under 10% on the hardest**; most mainstream agents, including Claude Code, record **near-zero pass rates at the hardest difficulty**, and the average full pass rate across configurations is **below 1%**. [ALE §1]

The gap between these numbers and the marketing vocabulary of "autonomous agents" is the subject matter of this book. This chapter builds the formal apparatus needed to reason about that gap precisely.

---

## 2. Chapter scope

This chapter treats an agentic system as a **sequential decision process**: a stochastic policy (the model) embedded in a control layer (the harness) interacting with a partially observable environment through typed actions, producing a trajectory that an external evaluator scores. Everything else in the book — tools, memory, orchestration, evaluation, security — is an elaboration of one component of this process.

In scope:

- Operational definitions separating agents, workflows, assistants, automation, and autonomous systems (Topic 1)
- The formal interaction model: state, observation, action, transition, termination, reward (Topics 2–3)
- The three-layer policy decomposition: model policy, harness policy, deterministic application policy (Topic 4)
- Dimensions of agency and of task difficulty (Topics 5–6)
- The capability–reliability separation and error accumulation (Topics 7–8)
- Architecture-selection decision rules (Topics 9–10)
- A working taxonomy of deployed agent classes (Topic 11)
- The notation and measurement framework used in Chapters 2–15 (Topic 12)

## 3. Prerequisites

Readers are assumed to have:

- Probability at the level of conditional distributions, Markov chains, and expectations; prior exposure to MDPs/POMDPs helps but the chapter is self-contained
- Working knowledge of transformer LLMs as autoregressive samplers (token-level mechanics are *not* rederived here)
- Software-systems literacy: processes, sandboxes, event logs, idempotency, API semantics
- No prior agent-framework experience is assumed; SDK specifics arrive in Chapter 4

## 4. Terminology fixed for the whole book

| Term | Definition adopted | Source |
|---|---|---|
| **Model** | The LLM as a stochastic policy mapping context to a distribution over token sequences and structured actions | [MEM §2.1] |
| **Harness** | The system layer that conditions model calls and turns model outputs into actions in an external workspace: prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, recovery | [HB §3] |
| **Agent** | Model + Harness (the pair, never the model alone) | [HB §3]: "Agent = Model + Harness" |
| **Workflow** | System where LLMs and tools are orchestrated through predefined code paths | [BEA] |
| **Agent (Anthropic's behavioral sense)** | System where the LLM dynamically directs its own processes and tool usage, maintaining control over how it accomplishes tasks | [BEA] |
| **Environment** | Everything external to the agent: task workspace, files, local services, live systems; the evaluator is also external | [HB §3] |
| **Trajectory** | τ = (s₀, o₀, a₀, s₁, o₁, a₁, …, s_T) — the full execution record | [MEM §2.1] |
| **Turn** | One round trip: model output including tool calls → tool execution → results fed back | [CAL] |
| **Run** | R = Run(M, H, E, T): one complete task attempt by model M under harness H in environment E on task T | [HB §3.3] |
| **Evaluator / Judge** | External scorer J producing TaskScore = Eval(R; J) from workspace state, trace, usage statistics, validator outputs | [HB §3.3–3.4] |

## 5. System boundary

The unit under analysis is the tuple **(M, H, E, T, J)**. The boundary cuts:

- **Inside:** model inference, harness control flow, tool execution, context/memory management, termination logic.
- **Outside:** the environment's ground-truth state, the evaluator, the human principal, and the training process that produced M.

This boundary follows Harness-Bench's evaluation setting (task, initial sandbox state, budget, timeout, and evaluator fixed; harness varied) [HB §3.1] and is load-bearing: most published agent numbers blur it, which is precisely why they fail to predict production behavior.

## 6. Exclusions

- **No model training or RL fine-tuning.** We take M as given. (HarnessX's harness–model co-evolution is discussed only as evidence about harness leverage, not as a training recipe. [HX])
- **No embodied robotics hardware.** Embodied agents appear only as a taxonomy class (Topic 11); actuator control is out of scope.
- **No provider tutorials.** SDK mechanics are used as evidence of executable semantics, not as how-to material; Chapter 4 owns the API surface.
- **No economic productivity claims.** ALE explicitly frames the benchmark-to-GDP gap as *unclosed* [ALE §1]; we do not assert workforce impact the sources do not measure.

## 7. Measurable outcomes for the reader

After this chapter you should be able to:

1. Classify any proposed system as automation / workflow / assistant / agent using the decision tests in Topic 1, and defend the classification.
2. Write down the formal interaction model (Ψ, O, π, τ) for a concrete system and identify which component each engineering artifact implements (Topic 2).
3. Predict the direction of reliability change when task horizon, branching, observability, reversibility, or failure cost shifts (Topic 6).
4. Compute a compositional success bound from per-step measurements and explain why observed degradation (CompWoB) is worse than the independence bound (Topic 8).
5. Justify — with measurements, not taste — when a deterministic workflow must replace an agent (Topics 9–10).
6. Report agent performance at the (M, H) configuration level with the measurement framework of Topic 12.

## 8. Source ledger for this chapter

All claims in Chapter 1 trace to the following sources in `Knowledge_source/`:

| Tag | Source | Provenance |
|---|---|---|
| [CompWoB] | Furuta et al., "Exposing Limitations of Language Model Agents in Sequential-Task Compositions on the Web," TMLR | https://deepmind.google/research/publications/46840/ |
| [BEA] | Anthropic, "Building Effective Agents" | https://www.anthropic.com/engineering/building-effective-agents |
| [HB] | "Harness-Bench: Measuring Harness Effects across Models in Realistic Agent Workflows" | `2605.27922v1.pdf`, arXiv:2605.27922 |
| [CAH] | "Code as Agent Harness: Toward Executable, Verifiable, and Stateful Agent Systems" | `2605.18747v1.pdf`, arXiv:2605.18747 |
| [MEM] | "Memory in the Age of AI Agents: A Survey" | `2512.13564v2.pdf`, arXiv:2512.13564 |
| [ALE] | "Agents' Last Exam" | `2606.05405v2.pdf`, arXiv:2606.05405 |
| [HX] | "HarnessX: A Composable, Adaptive, and Evolvable Agent Harness Foundry" | `2606.14249v2.pdf`, arXiv:2606.14249 |
| [AAR] | "Agent-as-a-Router: Agentic Model Routing for Coding Tasks" | `2606.22902v3.pdf`, arXiv:2606.22902 |
| [FSC] | Anthropic, "System Card: Claude Fable 5 & Claude Mythos 5" (June 9, 2026) | `Claude Fable 5 & Claude Mythos 5 System Card.pdf` |
| [G56] | OpenAI, "GPT-5.6 Preview System Card" (2026-06-25) | `gpt-5-6-preview.pdf` |
| [CAL] | Anthropic, Claude Agent SDK — "How the agent loop works" | https://code.claude.com/docs/en/agent-sdk/agent-loop |

**Epistemic rules used throughout:** (i) every quantitative claim carries a source tag; (ii) mathematics that we *derive* (rather than quote) is flagged as **[derived]** and its assumptions stated; (iii) where the literature has no validated construct — e.g., "agency dimensions" — we say so explicitly rather than laundering an engineering rubric into science.

## 9. Chapter map

```
00 scope (this file)
01 boundaries: automation | workflow | assistant | agent | autonomous system
02 formal interaction model  ──┐
03 partial observability       ├── the mathematics
04 three-layer policy stack  ──┘
05 agency dimensions         ──┐
06 task-difficulty dimensions  ├── the design space
07 capability ≠ reliability    │
08 error accumulation        ──┘
09 workflows dominating agents ──┐
10 minimal-agent principle       ├── the decision rules
11 system taxonomy               │
12 notation & measurement      ──┘
```

Chapter 2 takes the model M apart; Chapter 3 takes the harness H apart. Nothing in either makes sense without the (M, H, E, T, J) decomposition established here.
