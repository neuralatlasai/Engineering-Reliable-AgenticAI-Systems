# Chapter 11 — Coding, Research, Browser, and Computer-Use Agents

## Chapter scope and outcomes

### What this chapter is about

The previous chapters built agent machinery in the abstract: the harness (Ch.3), the SDK runtime (Ch.4), tools (Ch.5), context (Ch.6), memory (Ch.7), workflow (Ch.8), multi-agent systems (Ch.9), and long-horizon execution (Ch.10). This chapter grounds all of it in the **four agent archetypes that actually exist in production today** — coding agents, research agents, browser agents, and computer-use agents — and asks what each one *specifically* requires that the general machinery does not supply.

These four are not an arbitrary list. They are the archetypes where the sources have the most concrete, executable, and (in the coding case) *measured* material, and they span the two axes that matter for reliability engineering:

- **The action substrate.** Coding agents act through **code and the shell** — a deterministic, verifiable, textual environment. Browser and computer-use agents act through a **GUI** — a noisy, partially-observable, pixel-and-DOM environment where the same action may or may not land. Research agents act through **retrieval and synthesis** — where the failure is not a crash but a *fabrication*. The reliability problem is completely different in each, and this chapter is organized around that difference.

- **The verification substrate.** This is the chapter's throughline and its most important claim:

> **[synthesis] The reliability of an agent archetype is determined by the strength of the verification available in its environment.** Coding agents are the most reliable archetype *not because code is easy* but because code ships with the strongest verification any environment offers — compilers, type checkers, tests, linters — that can decide correctness *without asking the model*. Browser and computer-use agents are the least reliable *not because GUIs are hard to click* but because their environment offers almost no independent verification: "did the click work?" is answerable only by looking again, through the same unreliable perception that took the action. Research agents sit between: their claims are verifiable *if and only if* every claim carries a retrievable citation. **Build the verification the environment lacks, or inherit the unreliability the environment imposes.**

This chapter is where Chapter 10's abstract "verified task unit" and "independent verifier" become concrete: a passing test suite, a resolving citation, a screenshot diff, a runtime probe. And it is where the honest measurement discipline of the whole book meets its most-cited and most-abused benchmark — SWE-bench — which Topic 14 dismantles.

### Prerequisites

This chapter assumes and does not re-derive:

- **Tools as contracts; effect classes $\chi \in \{R, W_{\text{rev}}, W_{\text{irr}}\}$; read/write and reversible/irreversible discipline; code execution as an aggregation layer; shell/filesystem/browser/computer-use/retrieval tool families** (Chapter 5). This chapter is, in large part, Chapter 5's tool families *instantiated as complete agents*.
- **The harness loop, sandboxing modes (read-only / workspace-write / danger-full-access), approval modes, and the terminal-control status $\kappa_t$** (Chapter 3, [CDX]).
- **The SDK runtime semantics — client-executed tools, the tool loop, sessions, `query()` vs a managed loop** (Chapter 4).
- **Context engineering, just-in-time retrieval, and the finite attention budget** (Chapter 6) — repository discovery (Topic 2) is a context-construction problem.
- **Multimodal perception–action loops** (Chapter 2 Topic 10) — the basis for browser and computer-use agents.
- **The verified task unit, predicate, verified stop, independent verifier, quality decay, and survival measurement** (Chapter 10). This chapter's verification (Topic 13) *is* Chapter 10's predicate/verifier, specialized per archetype.
- **Multi-agent research economics, the citation agent, and cascading hallucination** (Chapter 9) — research agents (Topic 9) are the single-run realization.
- **Long-running branch/worktree/merge discipline** (Chapter 10 Topic 13) — this chapter (Topics 4, 5) completes the coding-agent branch story.
- **The statistical protocol** (Chapter 1 Topic 12): Wilson intervals, paired designs, the zero-failure bound, survival analysis — load-bearing for Topic 14.

### Terminology used throughout the chapter

| Term | Meaning in this chapter |
|------|-------------------------|
| **Coding agent** | An agent whose action substrate is code + shell in a repository; verifies via compile/test/lint. Codex, Claude Code, and the Agent SDK are the reference implementations. |
| **Research agent** | An agent that decomposes a question, searches in parallel, captures evidence, and synthesizes — with every claim citation-backed. [MAR]'s system is the reference. |
| **Browser agent** | An agent acting on web pages via DOM / accessibility tree / screenshots; contends with navigation state and anti-bot defenses. |
| **Computer-use agent** | An agent acting on a GUI via screenshots + coordinates (click/type/scroll); the noisiest, least-verified archetype. |
| **AGENTS.md / CLAUDE.md** | Persistent, repository-level instruction files the agent loads to configure its behavior in that repo. [CODEX] / [CC][CASDK]. |
| **Patch** | A diff — the unit of change a coding agent proposes; reviewable, reversible, minimal. |
| **Verification substrate** | The set of independent checks an environment supplies (compiler, tests, citations, probes) that decide correctness without the model. The chapter's organizing axis. |
| **Perception–action loop** | Observe (screenshot/DOM) → decide → act (click/type) → observe again. The browser/computer-use core; where coordinate and state uncertainty live. |

### The ten-section structure (binding for every topic)

Every topic file uses the same fixed ten-section skeleton, one section per governing instruction, in order:

1. **Scope, prerequisites, terminology, boundaries, exclusions, outcomes**
2. **Problem, bottleneck, objective, assumptions, constraints, success criteria**
3. **Intuition first, then formalization**
4. **Architecture: components, interfaces, data flow, control flow**
5. **Grounding: primary sources and reproducible evidence**
6. **Implementation: APIs, schemas, data structures, configuration**
7. **Trade-offs: complexity, latency, throughput, scalability, reliability, security, cost**
8. **Experiments: baselines, ablations, metrics, statistical tests, thresholds**
9. **Failure modes, edge cases, hazards, mitigations, limitations**
10. **Verified observations, decision rules, production implications, connections, and Sources**

### The fifteen topics and the through-line

The chapter moves through the coding archetype (the most verifiable, richest sources), then the reference implementations, then the less-verifiable archetypes, then cross-cutting verification and evaluation:

**The coding agent's foundations (Topics 1–6).** Topic 1 establishes code's five simultaneous roles — and why code is the *verification substrate* that makes coding agents the reliability benchmark. Topic 2 is repository discovery (a context-construction problem). Topic 3 is the plan→edit→compile→test→inspect→patch→review loop. Topic 4 is patch semantics and minimal-change discipline. Topic 5 is the execution substrate (local / cloud sandbox / container / worktree / CI). Topic 6 is persistent repository instructions (AGENTS.md / CLAUDE.md / skills / hooks / plugins).

**The reference implementations (Topics 7–8).** Topic 7 is Codex (CLI / cloud / GitHub / code review / CI). Topic 8 is Claude Code and the Agent SDK. These are the executable ground truth, treated at the depth the sources allow.

**The less-verifiable archetypes (Topics 9–12).** Topic 9 is research agents (decomposition, parallel search, citation validation, synthesis). Topic 10 is browser agents (DOM, accessibility tree, screenshots, anti-bot). Topic 11 is computer-use agents (perception–action, coordinate uncertainty, visual grounding). Topic 12 is shell and generated-code execution under sandbox constraints — the shared safety substrate.

**Verification and measurement (Topics 13–15).** Topic 13 is independent verification across all archetypes (tests, linters, type checkers, security scanners, runtime probes). Topic 14 is coding-agent evaluation *beyond SWE-bench* — environment stability, infrastructure noise, patch validity, maintainability. Topic 15 is human review interfaces (diffs, traces, approvals, evidence-backed completion).

### Grounding boundary and honesty commitments

The chapter's ground truth is four primary sources plus heavily-reused earlier-chapter anchors:

- **[CODEX]** — the OpenAI Codex repository (`github.com/openai/codex`): Codex CLI as "a lightweight coding agent that runs in your terminal," CLI / IDE / Web variants, `AGENTS.md`, ChatGPT/API auth. The repo README is *thin on internals*; the executable detail comes from the Codex docs.
- **[CDX]** — the Codex documentation (`learn.chatgpt.com/docs`, reused from Chapter 3): sandboxing (read-only / workspace-write / danger-full-access), agent approvals & security, `AGENTS.md`, subagents, MCP, **auto-review**, code review, long-running work, record & replay, local↔remote task handoff.
- **[CC]** — the Claude Code repository (`github.com/anthropics/claude-code`): "an agentic coding tool that lives in your terminal," terminal / IDE / `@claude` on GitHub, slash commands, plugins, hooks. Also thin on internals at the README level.
- **[CASDK]** — the Claude Agent SDK overview (`code.claude.com/docs/en/agent-sdk/overview`): `query()` vs the Client-SDK tool loop; built-in tools (**Read, Write, Edit, Bash, Monitor, Glob, Grep, WebSearch, WebFetch, AskUserQuestion**); hooks (**PreToolUse, PostToolUse, Stop, SessionStart, SessionEnd, UserPromptSubmit**); subagents (`AgentDefinition`, the `Agent` tool, `parent_tool_use_id`); MCP; permissions (`allowed_tools`, `permission_mode="acceptEdits"`); sessions (`resume`, fork, `session_id`); skills (`.claude/skills/*/SKILL.md`); `CLAUDE.md`; Agent SDK vs Client SDK vs Managed Agents.

**A source that 403s and is never used.** The README anchor `openai.com/index/harness-engineering/` returns **HTTP 403 Forbidden** (the same access failure as the Codex-agent-loop URL flagged in Chapter 3). **No claim in this chapter is attributed to it.** Where "harness engineering" ideas appear, they are grounded in [CDX], [CASDK], or the earlier-chapter harness sources ([CAH], [HX], [CAL]) — never in the inaccessible page.

**Reused earlier-chapter anchors** (not re-fetched, cited by tag): **[MAR]** (Chapter 9 — research-agent architecture, citation agent, cascading hallucination, the 90.2%/15× economics), **[HDA]** (Chapter 10 — the Playwright-driven evaluator, a browser agent in practice), **[WTA]/[CXM]/[TS]/[ADK-T]** (Chapter 5 — tool engineering, code-execution aggregation, tool search; and SWE-bench Verified attribution), **[FSC]** (Chapter 2 — measured coding-agent dishonesty: code-summary fabrication, lazy investigation, CLI fabrication), **[CAH]/[HX]/[CAL]** (Chapter 3 — code-as-agent-harness, harness taxonomy, agent-loop docs).

The honesty discipline from Chapter 5 onward holds without exception:

- **Every claim is source-tagged;** syntheses are flagged **[synthesis]**, derivations **[derived]** with assumptions.
- **The measurement asymmetry across archetypes is stated, not hidden.** Coding agents have real (if abused) benchmarks; research agents have [MAR]'s internal eval; browser and computer-use agents have **almost no published reliability numbers at all**. The chapter says so per archetype, gives the mechanism, and specifies the experiment rather than inventing a number.
- **SWE-bench is treated as a flawed instrument, not a truth.** Topic 14 develops, from [WTA]'s own attribution caveats and Chapter 1's statistics, why a SWE-bench number is not a reliability measurement — environment stability, infrastructure noise, contamination, and patch-validity-vs-maintainability all confound it.
- **The reference-implementation topics (7, 8) are documentation-grounded, not benchmarked.** [CODEX]/[CC] READMEs are thin; [CDX]/[CASDK] give executable API detail but few numbers. Each topic declares its evidence depth rather than padding.

### Learning outcomes

After this chapter you should be able to:

1. **Explain why verification-substrate strength, not task difficulty, ranks the archetypes by reliability**, and locate any new agent on that axis.
2. **Treat code as action, reasoning, environment model, verification substrate, and memory simultaneously**, and exploit code-as-verification as the coding agent's core advantage.
3. **Perform repository discovery as bounded context construction** — architecture, dependencies, build graph, tests, rules, ownership — without blowing the attention budget.
4. **Run the plan→edit→compile→test→inspect→patch→review loop** with the compile/test gate as the verified predicate (Chapter 10 Topic 12).
5. **Apply patch semantics and minimal-change discipline**, and roll back via the reversible-write path.
6. **Choose an execution substrate** (local / cloud sandbox / container / worktree / CI) by isolation and reversibility needs.
7. **Configure persistent repository instructions** (AGENTS.md / CLAUDE.md / skills / hooks / plugins) and know their authority and enforcement limits.
8. **Build coding automation on Codex and the Claude Agent SDK**, mapping each construct to the earlier-chapter primitive it realizes.
9. **Build a research agent** whose every claim carries a resolving citation, defeating cascading hallucination structurally.
10. **Build browser and computer-use agents that verify their own actions**, compensating for the environment's missing verification with explicit state checks and visual grounding.
11. **Sandbox shell and generated-code execution** correctly (read-only / workspace-write / danger-full-access; approval by consequence).
12. **Verify independently** across archetypes — tests, linters, type checkers, security scanners, runtime probes — as the concrete form of Chapter 10's predicate/verifier.
13. **Evaluate coding agents beyond SWE-bench**, quantifying environment stability, infrastructure noise, patch validity, and maintainability.
14. **Design human review interfaces** — diffs, traces, approvals, evidence-backed completion — that make an agent's work auditable rather than trusted.

### What this chapter deliberately excludes

- **General tool engineering** (schema design, tool search, code-execution aggregation) is Chapter 5; this chapter *uses* it and covers only the archetype-specific instantiation.
- **General security and sandboxing threat modeling** (confused deputy, injection, supply chain, authority matrices) is Chapter 12; Topic 12 here covers the *execution-safety* slice, not the full threat model.
- **General evaluation science** (graders, trace grading, statistical power) is Chapter 13; Topic 14 specializes to *coding-agent* evaluation and the SWE-bench critique.
- **Production serving, observability, and economics** (gateways, queues, SLOs, FinOps) are Chapter 14; this chapter is agent-level, not platform-level.
- **The full long-running branch/worktree/merge discipline** is Chapter 10 Topic 13; Topics 4–5 here cover the coding-agent-specific patch/execution slice that intersects it.

### Sources

- **[CODEX]** OpenAI — *Codex repository.* https://github.com/openai/codex
- **[CDX]** OpenAI — *Codex documentation* (sandboxing, approvals, AGENTS.md, auto-review, MCP, long-running work). https://learn.chatgpt.com/docs (reused from Chapter 3)
- **[CC]** Anthropic — *Claude Code repository.* https://github.com/anthropics/claude-code
- **[CASDK]** Anthropic — *Claude Agent SDK overview.* https://code.claude.com/docs/en/agent-sdk/overview
- **Unfetchable (never attributed):** *Codex harness engineering* — https://openai.com/index/harness-engineering/ returns HTTP 403.
- Reused: **[MAR]** (Ch.9), **[HDA]** (Ch.10), **[WTA]/[CXM]/[TS]/[ADK-T]** (Ch.5), **[FSC]** (Ch.2), **[CAH]/[HX]/[CAL]** (Ch.3).
- Statistical methods: Chapter 1 Topic 12 (Wilson, paired designs, zero-failure bound, survival).
