# Topic 9 — When Deterministic Workflows Dominate Agents

## 1. Problem and objective

The previous eight topics assembled the evidence; this one draws the unpopular conclusion: **for a large class of production tasks, a deterministic workflow is not the cautious fallback — it is the dominant design**, better on reliability, cost, latency, testability, and auditability simultaneously, with zero sacrifice on outcomes. The objective is to characterize that class precisely, with decision rules a review board can apply, and to be equally precise about the complement — the tasks where workflows genuinely cannot win.

The claim is not contrarianism. It is the published position of the vendor with the strongest commercial interest in agents: Anthropic's guidance opens by advising most applications *away* from them.

## 2. Intuition first

An agent buys you one thing: runtime action selection by a stochastic policy. That purchase is worth making exactly when you cannot enumerate the decision structure in advance. If you *can* enumerate it — if the branches are knowable, the steps nameable, the order fixed — then handing action selection to π_M is paying stochastic-failure tax (Topic 8), evaluation tax (Topic 7), and security tax (Topic 5) for a decision your team could have compiled into code that makes it correctly every time. Nobody hires an improviser to read a checklist.

## 3. The primary-source position

Anthropic, verbatim in substance [BEA]:

- "For many applications... optimizing single LLM calls with retrieval and in-context examples is usually enough."
- Workflows suit "well-defined tasks" requiring predictability; agents suit cases where "flexibility and model-driven decision-making are needed at scale."
- Agentic systems "trade off latency and cost for performance"; success means "the *right* system for your needs," not the most sophisticated; "complexity should only increase when demonstrably improving outcomes."

And the pattern catalog that covers most of the enumerable space [BEA]: **prompt chaining** (fixed sequential decomposition), **routing** (classify, then dispatch to specialized handlers), **parallelization** (sectioning or voting), **orchestrator–workers** (dynamic delegation of subtasks within a fixed control shape), **evaluator–optimizer** (generate–critique loops). Note what these are: the five most common things people build "agents" for, expressed as predefined code paths with model calls at the leaves.

## 4. The argument from the chapter's own mathematics

Assemble Topics 4–8 into one chain **[derived — composition of sourced results]**:

1. Every step moved from π_M-choice to π_D-code exits the stochastic process: its p → ~1, and it no longer consumes verification budget (Topic 8's algebra).
2. The stochastic horizon n_stoch — not total steps — drives the decay ∏p_i and its super-multiplicative violations [CompWoB]. A workflow with 30 deterministic steps and 3 model calls has n_stoch = 3.
3. Deterministic control flow is immune to the composition-interference mechanisms (shared-context dilution, instruction-order sensitivity) that CompWoB measured — code does not get distracted by the previous task's instructions.
4. Deterministic paths are testable by ordinary software methods: no (M, H) factorial [HB], no judge pinning, no contamination-controlled task pools [ALE]. The evaluation cost differential is easily 10–100× per release.
5. Beyond-intent action propensity [G56 §1] and false-completion behavior [FSC §2.3.3] have zero measure on paths where the model chooses nothing.

The conclusion follows: **when the decision structure is enumerable, the workflow dominates on every axis this chapter has quantified.** The agent's sole advantage — runtime flexibility — has value only against decision structures you could not write down.

## 5. The decision rules

**A workflow dominates when all of the following hold:**

| # | Condition | Test |
|---|---|---|
| W1 | Decision structure enumerable pre-runtime | Team can draw the flowchart; every branch has a nameable trigger |
| W2 | Input variation absorbable at the leaves | Variability is *within* steps (classify, extract, draft) not *between* them |
| W3 | Success programmatically checkable per step | Oracle-checkability in the [HB §3.2] sense, applied per stage |
| W4 | Audit/compliance requires explainable control flow | The path taken must be defensible to a third party |
| W5 | Volume high, latency- or cost-sensitive | The agent's exploration overhead (tokens, turns [HB Table 2]) multiplies by request count |

**An agent earns its tax when any of the following hold:**

| # | Condition | Why the workflow fails |
|---|---|---|
| A1 | Decision structure discovered during execution | Debugging, research, incident diagnosis: next step depends on what the last observation revealed; the flowchart cannot be drawn in advance [BEA's "flexibility... at scale" criterion] |
| A2 | Branch space combinatorially large but per-branch logic trivial | Enumerable in principle, unmaintainable in practice — the flowchart would be the size of the input space |
| A3 | Environment feedback is the specification | "Make the tests pass," "fix the build": the target state is defined by an oracle the system must iterate against — the agent loop's native shape [CAL], and code-as-harness's home ground [CAH] |
| A4 | Unpredictable subtask decomposition with fixed outer shape | The documented middle path: orchestrator–workers, where "a central LLM dynamically delegates unpredictable subtasks" inside a predefined pattern [BEA] |

Ambiguous cases default to the workflow (Topic 10 makes that default a principle), with one discipline: record the failed inputs. A workflow whose leaf-failure log keeps saying "the decomposition itself was wrong for this input" is presenting evidence for A1/A2 — that log is your architecture-review input, and it is *data*, which beats taste.

## 6. The hybrid is the normal endpoint, and it has a direction

Production systems rarely sit at either pole; what matters is *which layer owns control flow*. The stable pattern from the sources: **deterministic spine, agentic leaves** — π_D owns sequencing and gates; bounded agent loops execute the genuinely open-ended steps; verification sits at the joints (Topic 8 §4). The inverse — an agent that owns control flow and occasionally calls deterministic scripts — is also legitimate but belongs to A1/A3 tasks, and note the convergence: a *good* agent manufactures its own determinism at runtime, writing scripts and tests as agent-initiated artifacts that execute deterministically [CAH §1]. Even inside the agent pole, reliability engineering is the art of shrinking n_stoch.

Two corollaries worth making explicit:

- **Routing is a workflow, and evidence beats intelligence at it.** Agent-as-a-Router: adding per-dimension performance statistics to a vanilla router yields +15.3% relative gain, *exceeding* a heuristic built on the same statistics, with the bottleneck identified as "information deficit rather than reasoning failure" [AAR §1]. Where the control decision is a classification, invest in the evidence pipeline, not in giving the decision to a smarter free-running model.
- **Model-directed ≠ better even at fixed cost.** Harness-Bench: the top-scoring harness used *fewer* tokens and turns than four lower-scoring ones — "longer trajectories alone do not determine performance" [HB §4.2]. Exploration is not intrinsically productive; structure often outperforms it.

## 7. Failure modes on both sides of the boundary

**Workflow chosen, agent needed:** brittle branch explosion (endless special-case patches at the leaves — the A2 signature); silent coverage gaps where unhandled inputs get the closest wrong branch; teams re-labeling the mismatch "model quality" because the per-step calls are the visible stochastic component (Topic 1 §6).

**Agent chosen, workflow sufficient:** paying the full Topic-8 decay on an enumerable task; un-auditable trajectories where a compliance-relevant path decision lives in sampled tokens; the demo-to-production cliff of Topic 7 — the agent handled the happy path impressively and the tail expensively; security surface (Chapter 12) purchased for zero flexibility value.

**Boundary drift (both directions):** the workflow that grows a "model decides" fallback branch becomes an agent on its least-tested path (Topic 1 §7); the agent that accretes hard-coded guardrail patches becomes a workflow nobody designed — worst of both, with neither's guarantees.

## 8. Limitations

- The dominance claim is conditional on W1–W5; it is not "workflows are better." Against A1/A3 tasks a workflow does not degrade gracefully — it simply cannot express the solution.
- The decision tables are our synthesis **[derived]** of [BEA]'s qualitative guidance plus this chapter's quantitative results; no source publishes a controlled workflow-vs-agent trial on matched tasks. That absence is itself a finding: the field measures agents against agents, rarely against the deterministic baseline — which is why Chapter 15's baseline ladder makes the workflow a *mandatory* rung.
- Enumerability (W1) is partly a function of team effort and domain maturity, not just the task; a domain expert can often draw a flowchart where a generalist sees open-endedness. Budget real analysis time before declaring A1.

## 9. Production implications

1. **Burden of proof sits on the agent.** The review question is never "why not an agent?" but "which of A1–A4 holds, and what measurement shows it?" [BEA's own framing: complexity only when it demonstrably improves outcomes.]
2. **Build the workflow baseline first, and keep it.** It is the control arm for every subsequent agent claim, the fallback when the agent misbehaves, and frequently the ship-it answer (Chapter 15's ladder).
3. **When you do build the agent, keep the spine deterministic:** gates, budgets, verification joints in π_D/π_H; model choice only inside the leaves that earned it (§6).
4. **Instrument for regret in both directions:** leaf-failure logs on workflows (detecting suppressed A1), n_stoch and backstop-firing rates on agents (detecting unearned autonomy) — architecture reviews should consume these logs on a cadence, because the task distribution drifts even when the code doesn't.
5. **Price the evaluation delta into the architecture decision.** The agent's eval bill ((M,H) factorials, judge pinning, private task pools, behavioral propensity tracking — Topics 7, 12) recurs every release; for W1–W5 tasks it buys nothing the workflow's unit tests didn't.

## 10. Connections

- This topic is Topics 4–8 applied; Topic 10 generalizes its default into the minimal-agent principle and the baseline ladder.
- Chapter 8 details the workflow patterns and their comparative implementations across the three major SDKs; Chapter 15's Architecture Decision Record institutionalizes §9.1's burden of proof.
- The A3 class (environment feedback as specification) is Chapter 11's whole subject.

## Sources

[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.2, §4.2, Table 2
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §1
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §2.3.3
