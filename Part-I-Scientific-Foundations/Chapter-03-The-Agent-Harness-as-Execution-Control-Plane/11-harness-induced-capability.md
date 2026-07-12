# Topic 11 — Harness-Induced Capability: Why the Same Model Performs Differently Under Different Scaffolds

## 1. Problem and objective

This topic consolidates the chapter's empirical core: the same model, under different harnesses, is measurably a different agent. Chapters 1–2 cited the headline numbers; here the objective is the *mechanisms* — through which harness dimensions the capability differences arise — and the correct statistical reading of the evidence, which is subtler than the headlines and worth getting exactly right, because both over-claiming ("the harness adds 24 points") and under-claiming ("it's all the model") lead to misallocated engineering.

## 2. Intuition first

A capable person with the wrong desk — no files, broken phone, forms in the wrong language, no way to check their work — performs badly, and the failure is real even though nothing about the person changed. The harness is the desk. The claim "harness-induced capability" does not assert that scaffolding adds intelligence; it asserts that *measured task performance is a joint property of policy and workspace*, and that the workspace term is large, improvable, and usually cheaper to improve. The sources supply the metaphor's precise version: "the model is the agent's cognitive core... the harness is its executive apparatus" [HX §5].

## 3. The evidence, with its correct statistical reading

**E1 — Configuration-level spread.** Harness-aggregated scores across 6 configurable harnesses under a fixed 8-model pool and fixed 106-task suite span 52.4–76.2 [HB §4.2]. Correct reading: a **23.8-point configuration-level contrast** — an aggregate over backends, *not* a per-model causal effect (the protocol preserves each harness's "native execution behavior," so harnesses differ in many coupled mechanisms at once, and the authors interpret results as "diagnostics of model–harness pairings, not causal decompositions of individual harness mechanisms" [HB §3.1]). What E1 licenses: reporting at the $(M_c,H_c)$ level is mandatory; what it does not license: attributing the 23.8 points to any named mechanism.

**E2 — Harness dependence varies by model.** Per-backend variance across harness-level averages: "stronger model backends tend to achieve higher mean scores while exhibiting lower cross-harness variance," weaker backends showing performance "more sensitive to the surrounding execution substrate" [HB §4.3]. This is the interaction term made visible: harness compensation is real and model-dependent, so harness improvements measured on one backend do not transfer 1:1 (Chapter 1, Topic 4's compensation asymmetry).

**E3 — Directed harness editing moves scores at frozen weights.** HarnessX: +14.5% average, up to +44.0%, across ALFWorld, GAIA, WebShop, τ³-Bench, and SWE-bench Verified, with "gains largest where baselines are lowest" [HX abstract]. This *is* causal for the edits made (paired before/after under a gate that rejects regressions [HX §4.3]) — but benchmark-scoped and architecture-specific. The gains-where-baselines-are-lowest pattern is E2 restated as an intervention result.

**E4 — Efficiency is not spend.** The top-scoring configurable harness used fewer tokens than four lower-scoring ones (68.7K vs. up to 175.1K mean tokens; turns 5.0–22.6) — "longer trajectories alone do not determine performance" [HB §4.2, Table 2]. Whatever the harness contributes, it is not purchased by volume.

**E5 — Failure attribution.** Observed code-agent failures cluster in harness-owned causes: "missing repository context, brittle tool interfaces, weak validators, excessive token cost, poor retry policies, or mismatched permission boundaries rather than... model generation" [CAH §3.5]. Complementarily, the evaluation literature insists the harness is inside the measured object: an eval assesses "the harness and the model working together as an integrated system" [DEM].

Composite, stated carefully **[synthesis]**: the harness term in measured capability is (i) large at the configuration level (E1), (ii) larger for weaker models (E2, E3), (iii) causally improvable by directed editing under regression gates (E3), (iv) not reducible to spend (E4), and (v) where the failures actually live (E5). No source supports a universal decomposition "X% model, Y% harness," and this book declines to invent one.

## 4. The mechanisms

Through which channels does 𝓒 change measured capability? The nine-dimensional taxonomy [HX §3.3] provides the inventory; the chapter's machinery explains each channel's physics **[synthesis — mapping ours]**:

| Channel (HX dimension) | Mechanism of capability change |
|---|---|
| Context assembly (D2) | What the policy conditions on: retrieval, compaction, instruction placement — the information-deficit lever (Ch. 2, Topic 2 §4.2); one of the two "most frequent edit targets" [HX §3.3] |
| Tool ecosystem (D4) | The action space's shape: contracts, descriptions, namespace size (Ch. 2, Topic 5); the other most-frequent edit target [HX §3.3] |
| Execution environment (D5) | Sandbox fidelity, dependency availability — class-5 failure prevention (Topic 10) |
| Evaluation & reward (D6) | Verifier quality: the $d$-lever that dominates long-horizon success (Ch. 1, Topic 8 §4) |
| Control & safety (D7) | Admission, budgets, tiers: converts catastrophic tails into typed stops (Topics 7–8) |
| Memory (D3) | Belief-state maintenance across steps and sessions (Ch. 1, Topic 3) |
| Model selection (D1) | Routing to the right backend per task (Ch. 2, Topics 11–12) |
| Observability (D8) | The trace substrate enabling all diagnosis and evolution [HX §3.3] |
| Training bridge (D9) | Turning trajectories into training signal — outside this book's scope by exclusion |

The channels compose multiplicatively in the reliability calculus: context and tools raise per-step $p$; verification raises detection $d$; control bounds the loss of what remains (Ch. 1, Topics 6–8). This is why E3's gains concentrate where baselines are lowest — weak configurations have slack in *several* channels, and typed edits harvest it.

## 5. The ceiling question

The co-evolution source states the honest limit: harness engineering meets "the scaffolding ceiling" — the point where composing and evolving runtime interfaces stops yielding gains because the binding constraint is now the policy itself, distinguished from "the training-signal ceiling" that weight updates address [HX §5]. The engineering corollary runs both directions: below the scaffolding ceiling, harness iteration dominates model upgrades on cost and risk (E3's economics; Chapter 2, Topic 13's lever ordering); at the ceiling, further harness investment is denial. Locating the ceiling is an empirical task — Topic 14's ablation methodology is the instrument — and the location moves with every model generation (E2: stronger models flatten the harness term).

## 6. Failure modes of reasoning about harness-induced capability

- **Headline-number causalism:** quoting E1's 23.8 points as "what a good harness adds" — it is an aggregate contrast across coupled configurations [HB §3.1]; the causal statement requires E3-style directed edits under gates.
- **Transfer assumption:** porting a harness improvement across backends or benchmarks without re-measurement — E2 says the interaction is real; HX's gains are suite-scoped by its own reporting.
- **Spend-as-capability:** buying longer trajectories, more tools, bigger contexts as if volume were the mechanism — E4 falsifies it directly.
- **Model-blame default:** attributing E5's failure classes to the model because the model is visible — the AHE evidence exists precisely against this reflex [CAH §3.5].
- **Ceiling denial:** iterating the harness past the point of measurable return — the scaffolding ceiling is a real boundary [HX §5], and the seesaw-gated, paired measurement that would reveal it (Topic 14) is the antidote to both this and its opposite.

## 7. Limitations

- E1/E2 come from one benchmark family (106 tasks, 8 categories) and E3 from one evolvable-harness architecture over five suites; the *magnitudes* are not general constants, and the book uses them as existence-and-direction evidence only.
- The nine-channel mechanism mapping (§4) is a synthesis; no source measures per-channel contributions, and the channels are coupled in exactly the way that makes such measurement hard [HB §3.1].
- "Capability" throughout this topic means *measured task performance under an evaluator* — the Cap/Rel distinction of Chapter 1, Topic 7 still applies on top.

## 8. Production implications

1. **Budget harness engineering as capability engineering** — with E3's economics as the prior: directed, gated, paired-measured edits, cheapest where current performance is worst.
2. **Re-measure the harness term on every model change** (E2): the compensation your 𝓒 encodes for today's $M_c$ is tomorrow's dead weight or active harm.
3. **Attack channels in the order the failure data indicates** (E5 → Topic 10 §5's class distribution), not in the order of engineering enjoyment; context assembly and tool contracts are the documented high-frequency targets [HX §3.3].
4. **Watch for the ceiling** (§5): flat paired deltas across successive gated harness iterations are the signal to shift budget to the model lever (Ch. 2, Topic 13) — and vice versa.
5. **Never publish a bare-model number again.** Every result in this book's scope is a $c$-indexed measurement; E1 is the standing cost of forgetting.

## 9. Connections

- This topic is the empirical warrant for the whole chapter — Topics 1–10 built the machinery whose measured effect E1–E5 document.
- Topic 12 covers the same coin's dark side (harness changes that *degrade*); Topic 14 supplies the methodology E3 previewed; Chapter 15's capability-drift management operationalizes §8.2.

## Sources

[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.1, §4.1–4.3, Table 2
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) abstract, §3.3, §4.3, §5
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.5
[DEM] Anthropic, Demystifying evals for AI agents — https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
