# Topic 4 — Model Policy versus Harness Policy versus Deterministic Application Policy

## 1. Problem and objective

Topic 2 wrote the agent as a single policy a_t = π(o_t, m_t, 𝒬). That was a simplification, and this topic removes it. In every deployed system the effective policy is a **composition of three layers with different authors, different determinism guarantees, and different change velocities**: the model's token-level stochastic policy, the harness's control policy, and the application's deterministic code paths. The objective is to make the decomposition precise, present the quantitative evidence that the outer layers carry a large share of observed capability, and derive the reporting and design rules that follow.

## 2. Intuition first

Ask why the same model gives different results in two products, and you have already accepted the decomposition. The model proposes; the harness disposes — it decides what the model sees, which proposals become actions, when to retry, and when to stop. Around both sits application code that may pin entire regions of behavior with no model involvement at all. Attributing an agent's behavior to "the model" is like attributing a chess team's result to its strongest player: sometimes right, unmeasurable until you separate the contributions — and the sources below have now measured it.

## 3. Formalization: the three-layer policy stack

**Layer 1 — Model policy π_M.** The LLM as a stochastic map from assembled context to output: text, tool-call requests, or both [MEM §2.1; CAL]. Properties: stochastic (sampling), opaque (internal deliberation abstracted away [MEM §2.1]), updated on provider timescales, not directly patchable by the application team.

**Layer 2 — Harness policy π_H.** Everything that conditions π_M's inputs and filters its outputs. Harness-Bench's enumeration: "prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, and recovery" [HB §3]. Concretely, in the reference runtime [CAL]:

- *Input control:* system prompt, tool definitions, persistent context re-injection, compaction policy.
- *Output filtering:* permission rules (`allowed_tools`, `disallowed_tools`, scoped rules like `Bash(npm *)`), permission modes (`default` → `acceptEdits` → `dontAsk` → `bypassPermissions`), hooks (`PreToolUse` can block a call; the model receives the rejection as a result and adapts).
- *Loop control:* turn budget (`max_turns`), spend budget (`max_budget_usd`), effort level, termination subtypes, automatic compaction.

Properties: deterministic given configuration, versioned with the application, patchable same-day.

**Layer 3 — Deterministic application policy π_D.** Predefined code paths in which model calls are embedded — Anthropic's definition of a workflow [BEA]. Routing logic, fixed pipelines, validation gates, fallback branches. Properties: ordinary software; testable by ordinary means.

**Composition.** The deployed decision function is:

```
a_t = π_D( π_H( π_M(context assembled by π_H), state), state)      [derived — notation ours;
                                                                     structure from HB §3, CAL, BEA]
```

read inside-out: π_H assembles what π_M sees; π_M proposes; π_H admits, blocks, retries, or terminates; π_D determines whether a model was consulted at all and what happens around it. The Code-as-Agent-Harness survey adds a fourth element easily missed: **agent-initiated code artifacts** — code the agent writes and then executes — which are π_M-authored but π_D-typed at execution time: deterministic once written [CAH §1]. Agents thus *manufacture* layer-3 policy at runtime; this is the mechanism behind their special relationship with code (Chapter 11).

## 4. Evidence: the outer layers are not decoration

Three independent quantifications, ascending order of directness:

**(a) Harness variation at fixed model pool.** Harness-Bench: 106 tasks × 6 configurable harnesses × 8 model backends, external conditions fixed, 5,194 trajectories. Aggregate harness scores span **52.4 to 76.2 — a 23.8-point gap** with the model pool held constant [HB §4.2]. The gap is not noise; token and turn usage also vary sharply (mean tokens 68.7K–175.1K, mean turns 5.0–22.6 across harnesses [HB Table 2]), and the best-scoring configurable harness (NanoBot) used *fewer* tokens than four lower-scoring ones — "longer trajectories alone do not determine performance" [HB §4.2].

**(b) Harness optimization at fixed model.** HarnessX treats the harness as "a first-class object" assembled from typed primitives via a substitution algebra, then adapts it from execution traces. Across ALFWorld, GAIA, WebShop, τ³-Bench, and SWE-bench Verified it reports an **average gain of +14.5% (up to +44.0%), with gains largest where baselines are lowest** — and concludes that "agent progress need not come from model scaling alone: composing and evolving runtime interfaces from execution feedback is an actionable and complementary lever" [HX abstract].

**(c) Model dependence on the harness.** Harness-Bench's *harness dependence* analysis: for each model backend, compute the variance of its harness-level average scores. **Stronger backends show higher means and lower cross-harness variance; weaker backends show larger variance** — their performance "is more sensitive to the surrounding execution substrate" [HB §4.3]. Interpretation with the stack: π_H compensates for π_M deficiencies, and the amount of compensation available is itself model-dependent. Corollary: harness improvements measured on a weak model do not transfer 1:1 to a strong one, and vice versa.

A fourth datum shows the *decision-relevant* layer can sit above the model entirely: Agent-as-a-Router finds that for routing tasks across 8 frontier LLMs, "the best model varies per task, and always picking the globally strongest model still lags behind the per-task oracle"; augmenting a vanilla LLM router with per-dimension performance statistics yields a **+15.3% relative gain**, exceeding a heuristic router built on the same priors — the bottleneck being "information deficit rather than reasoning failure" [AAR §1]. Which π_M runs at all is a π_D/π_H decision, and it is evidence-hungry, not intelligence-hungry.

## 5. Architecture: responsibilities per layer

| Concern | Owner | Rationale |
|---|---|---|
| Deciding *whether* a model is consulted | π_D | Determinism where determinism is possible [BEA] |
| Model selection / routing / fallback | π_D or π_H | Per-task, evidence-accumulating (C-A-F loop) [AAR] |
| Context assembly, compaction, re-injection | π_H | Controls what π_M can condition on [CAL] |
| Admissibility of actions (permissions, hooks) | π_H | Deterministic invariants around stochastic proposals [HB §3; CAL] |
| Retry, recovery, budgets, termination backstop | π_H | Loop control [CAL] |
| Choosing among admissible actions | π_M | The one thing only the model can do |
| Runtime-manufactured determinism (scripts, tests) | agent-initiated artifacts | π_M-authored, π_D-executed [CAH §1] |

The design principle latent in this table: **push each decision to the most deterministic layer that can make it correctly.** This is Anthropic's simplicity guidance [BEA] restated as a layering rule, and it previews Topic 10's minimal-agent principle.

## 6. Interfaces and implementation semantics

The layer boundaries are concrete, typed interfaces, not abstractions:

- π_H → π_M: the assembled request (system prompt, tools, history, injected context) [CAL].
- π_M → π_H: `AssistantMessage` content — text blocks and tool-call blocks; the *typed* channel through which all model influence flows [CAL].
- π_H → environment: executed tool calls, with read-only tools parallelizable and state-mutating tools serialized [CAL] — a π_H-level concurrency policy invisible to π_M.
- π_H → π_M (feedback): tool results and rejection messages; a blocked call returns a rejection the model can react to [CAL] — meaning π_H's policy is *observable* to π_M, which adapts to it. The layers are coupled, not merely stacked; a harness rule change shifts the model's behavior distribution, which is why harness changes require re-evaluation (Chapter 13), not just code review.

## 7. Failure modes per layer, and cross-layer hazards

- **π_M:** hallucinated state, premature completion, plan drift (Chapter 2's inventory); documented at frontier: false completion claims and unrequested actions [FSC §2.3.3; G56 §1].
- **π_H:** misconfigured permissions (over-broad `bypassPermissions` outside isolated environments [CAL]); budget subtypes unhandled by callers; compaction discarding constraints [CAL]; dead tools and contradictory injected rules — harness entropy (Chapter 3).
- **π_D:** ordinary bugs, plus the *silent class transition*: a fallback branch that hands control to the model converts a workflow into an agent on the least-tested path (Topic 1 §7).
- **Cross-layer masking:** a strong π_H hides π_M regressions (and vice versa) until an upgrade breaks the compensation — the harness-dependence variance result [HB §4.3] is this hazard measured. Mitigation: factorial evaluation over (M, H) pairs, which is precisely Harness-Bench's protocol [HB §4.1].
- **Cross-layer gaming:** π_M optimizing against π_H's controls — the model attempting "to claim its code came from a human to avoid a second review" [FSC §2.3.3.3]. Layer-2 controls are part of π_M's observable environment and must be designed as adversary-aware (Chapter 12).

## 8. Measurement protocol

1. **Report (M, H, version) triples, never M alone.** Harness-Bench's stated conclusion: performance should be "reported at the model–harness configuration level rather than attributed to the base model" [HB §1, §4.2].
2. **Harness ablations before model upgrades.** HarnessX's +14.5% average [HX] and Harness-Bench's 23.8-point spread [HB §4.2] bound how much a harness iteration can be worth; it is frequently cheaper than a model migration and does not reset your safety evidence.
3. **Vary one layer at a time.** Fix (E, T, J, budgets); ablate π_H components with π_M pinned, then swap π_M with π_H pinned. Interactions exist (the variance result [HB §4.3]), so a small factorial beats two marginals when budget allows.
4. **Attribute incidents to a layer.** Every production failure gets a layer label (π_M sampled badly / π_H admitted what it shouldn't / π_D routed wrong). The label distribution over a quarter tells you where reliability investment pays.

## 9. Limitations

- Harness-Bench measures *configuration-level* effects and says so: results are "diagnostics of model–harness pairings, not causal decompositions of individual harness mechanisms" [HB §3.1]. Which specific π_H component carries the 23.8 points is not identified; HarnessX's per-dimension taxonomy is a step toward that decomposition but its gains are benchmark-scoped.
- The composition formula in §3 is our notation **[derived]**; the sources agree on the structure (model + surrounding layer + predefined paths) but no source states the three-layer algebra explicitly.
- Coupling (§6) means clean layer attribution is an approximation: a "π_M failure" under a π_H that starved it of context is genuinely ambiguous. Attribution rules should be written down before incidents, not during.

## 10. Production implications

1. **Your harness is a policy; version it, test it, and review changes to it like policy changes** — a permissions edit is a behavioral change to the deployed decision function, with blast radius.
2. **Budget-and-backstop is non-negotiable:** π_M is allowed to decide termination only inside π_H budgets (`max_turns`, `max_budget_usd`) with all error subtypes handled [CAL].
3. **Exploit the cheap layer first.** Before procuring a stronger model, spend one iteration on π_H: the measured headroom (+14.5% avg [HX]; 23.8 points [HB]) usually exceeds a model-generation delta at a fraction of cost and risk.
4. **Expect compensation asymmetry.** Weak models need more harness; strong models tolerate more harness variation [HB §4.3]. Re-tune π_H on every model change — the old configuration encodes compensations that may now be dead weight or active harm.
5. **Treat controls as observable to the model.** Anything π_H does becomes part of π_M's environment; design controls to remain valid when the model conditions on them [FSC §2.3.3.3].

## 11. Connections

- Topic 1's boundary tests are questions about which layer holds the action choice; Topic 5's autonomy dimension is the π_M share of the composition.
- Topics 9–10 use this stack to decide how much π_D should dominate.
- Chapter 3 dissects π_H component by component; Chapter 4 maps the stack onto the OpenAI, Anthropic, and Google runtimes; Chapter 13's evaluation science operationalizes §8.

## Sources

[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §1, §3, §3.1, §4.1–4.3, Table 2
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) abstract, §3
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1
[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §2.3.3
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
