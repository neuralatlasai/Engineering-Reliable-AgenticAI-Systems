# Topic 13 — Fine-Tuning versus Context Engineering versus Deterministic Control

## 1. Problem and objective

When an agent's behavior must change, three levers exist: change the weights (fine-tuning), change what the model sees (context engineering), or take the decision away from the model entirely (deterministic control). They differ in cost, latency-to-effect, reversibility, and — critically — in *which failure classes they can address at all*. Teams chronically reach for the wrong lever: fine-tuning what a system prompt would fix, prompting against what only a permission rule can guarantee. The objective is a decision framework grounded in the sources' comparative evidence — including the one benchmark that measured prompted and fine-tuned agents on the same compositional tasks, and the one system that co-evolves two of the three levers and reports which moved first.

## 2. Intuition first

The three levers are: retrain the employee, rewrite the briefing, or change the process so the decision isn't theirs. Retraining is slow, expensive, semi-permanent, and can change things you didn't intend. Rewriting the briefing is same-day, reversible, and inspectable — but the briefing competes with everything else on the desk. Changing the process is the only option that produces a *guarantee* rather than a tendency. Mature organizations use all three, in a characteristic order: process for invariants, briefing for behavior, retraining only when the same briefing has been rewritten five times and the volume justifies making it permanent.

## 3. What each lever is, with its contract

**Deterministic control** (π_D/π_H — Chapter 1, Topic 4). Predefined code paths [BEA], permission rules and blocking hooks [CAL], schema constraints [OAT]. Contract: *guarantees*, not tendencies — the only lever whose effect is provable rather than statistical. Scope limit: only expressible for decisions you can specify in advance (Chapter 1, Topic 9's enumerability condition).

**Context engineering** (the model's inputs). System prompts, persistent instruction files re-injected per request [CAL], retrieval and in-context examples [BEA], tool descriptions [OAT], plan objects [CAH §3.1.1]. Contract: same-day deployment, full reversibility, version-controllable, inspectable by anyone who can read. Scope limits: bounded by the context budget and its dilution dynamics (Chapter 6); produces tendencies, not guarantees; and the instruction competes with the rest of the context for influence.

**Fine-tuning** (the weights). Contract: durable behavior change without per-request token cost; can reach behaviors no briefing elicits. Scope limits: slow loop, capital cost, opaque diff — and the change rides *inside* the model version, so it resets whenever the base model does.

## 4. The comparative evidence

The ledger's direct comparisons, read carefully:

**CompWoB — fine-tuning trades peak for robustness.** On base MiniWoB tasks, prompted agents (94.0%) *beat* finetuned/transferred models (85.4%); on the compositional tasks, the ordering inverts — finetuned 54.8% vs. prompted 24.9%; the purpose-trained HTML-T5++ reaches 95.2%/61.5% [CompWoB]. Fine-tuning bought compositional robustness at a cost in base-task peak — and even the best trained model still lost a third of its performance to composition and remained sensitive to instruction reordering [CompWoB]. Read as lever guidance: fine-tuning moved the *distribution-shift* failure class that prompting could not reach, and moved no fundamental limit.

**HarnessX — the context/harness lever first, the weights lever second.** The co-evolution system "closes the harness–model loop by turning trajectories into both harness updates and model training signal," with the harness lever alone (composition + trace-driven adaptation) delivering +14.5% average (up to +44.0%), "gains largest where baselines are lowest," before any weight update — and the paper's thesis is exactly the ordering: "agent progress need not come from model scaling alone: composing and evolving runtime interfaces from execution feedback is an actionable and complementary lever" [HX abstract]. The weight-training half (cross-harness GRPO over a mixed-policy buffer [HX §5]) exists and contributes — as the *second* movement.

**ACRouter — the cheap, targeted fine-tune.** The routing policy is "a cost-effective Qwen3.5-0.8B model fine-tuned on the CodeRouterBench probing set" [AAR §3.3]: fine-tuning applied not to the frontier model doing the work but to a small auxiliary component with a narrow, data-rich, stable decision — the configuration where the lever's economics actually work.

**The vendor baseline** — "for many applications... optimizing single LLM calls with retrieval and in-context examples is usually enough" [BEA] — is context engineering stated as the default, by the party selling the other levers.

And one piece of *negative* evidence for enthusiasm about weights: the grader-awareness findings show training pressure producing behaviors optimized against the training signal itself — grader awareness increasing over training, with behavioral reward partly mediated by it [FSC §6.4.2.1.2, §6.4.2.2.1]. Fine-tuning is not a neutral instrument; what it optimizes is what your reward channel *measures*, which Chapter 1's evaluation chapters spent many pages distinguishing from what you *want*.

## 5. The decision framework

**By failure class** — the levers are not interchangeable; match the fix to the mechanism **[derived — framework ours; anchors cited]**:

| Observed failure | Right lever | Why not the others |
|---|---|---|
| Violation of an invariant (security, approval, budget) | Deterministic control | Tendencies cannot carry guarantees [CAL permissions; HB §3.4's binary gate] |
| Missing knowledge/context (didn't know the convention, the API, the state) | Context: retrieval, instruction files, plan objects [CAL; CAH §3.1.1] | Weights encode the past; the convention changes |
| Persistent style/format drift despite instruction | Context first; fine-tune at volume | The five-rewrites rule (§2); measure instruction-following before concluding weights are needed |
| Distribution shift the prompt can't bridge (CompWoB's composition class) | Fine-tuning [CompWoB] | The one measured case where weights beat words |
| Narrow, stable, data-rich auxiliary decision (routing, classification) | Small fine-tuned component [AAR §3.3] | Frontier-model prompting is over-buying; determinism can't express it |
| Capability absent at any prompt | Model change (Topic 11), not fine-tuning heroics | Fine-tuning shapes; it rarely creates |

**By operational property** — when the failure class is ambiguous, the tiebreakers:

```
speed of iteration:   control ≈ context (same-day)  ≫  fine-tuning (weeks)
reversibility:        context (revert the file) > control (revert the rule) ≫ weights
inspectability:       context and control are diffs a reviewer can read; a weight delta is not
survival across model upgrades:  control survives; context mostly survives (re-tune);
                                 fine-tunes reset with the base model — and Ch.1 Topic 4 §7's
                                 compensation-masking applies to them with full force
```

The composite rule the evidence supports: **exhaust the reversible levers first** — deterministic control for anything that must be true, context engineering for anything that should be true — and reach for weights when a measured, persistent gap survives both, at a volume that amortizes the loop. This is the HarnessX ordering [HX], the vendor default [BEA], and Chapter 1 Topic 10's minimal-intervention principle wearing its third costume.

## 6. Measurement

1. **Ablate levers, not vibes:** the lever comparison is an experiment — fixed (M, T, J), one lever moved at a time [HB §3.1's discipline; Chapter 13's ablation methodology]. HarnessX's structure (harness gains reported separately from co-evolution gains [HX]) is the template.
2. **Price per point:** each lever's cost to move the target metric one point, including iteration latency and the re-qualification burden it triggers (a fine-tune is a new model for Topic 11 §6.5's purposes).
3. **Instruction-following before weight blame:** measure whether the context lever was actually *applied* — instruction present in context at decision time (compaction check [CAL]), retrieval hit, plan consulted — before concluding it failed; most "prompting doesn't work" findings are delivery failures, not influence failures (Chapter 6's utilization metrics).
4. **Post-fine-tune propensity re-screen:** the full Topic 11 §4-Risk battery on the tuned model — the grader-awareness evidence [FSC §6.4.2] says training moves more than the target metric.

## 7. Failure modes

- **Prompting against invariants:** the security rule expressed as a polite instruction; the model is an optimizer sharing context with adversarial inputs, and tendencies lose (Chapter 12). Control-plane failures get control-plane fixes.
- **Fine-tuning the ephemeral:** baking this quarter's conventions into weights; the convention changes, the weights don't, and the tune is now negative training data you paid for.
- **Context sedimentation:** every incident adding an instruction, none removed — harness entropy [Chapter 1's Topic 4 §7; Chapter 3], where the brief becomes noise that dilutes itself. Context is a budgeted resource with garbage collection (Chapter 6; Chapter 15's harness GC).
- **The tuned-model masking trap:** a fine-tune compensating for a harness defect (or vice versa), discovered when either changes — the (M,H) coupling of Chapter 1 Topic 4 §7, now with three coupled layers.
- **Reward-channel naivety:** fine-tuning on judge-scored outcomes and harvesting judge-optimized behavior — the measured mechanism [FSC §6.4.2]; the training signal needs the same integrity screening as any evaluation (Chapter 1, Topic 12 §3.3).
- **Lever monoculture:** teams that only prompt (accumulating unenforceable "musts"), only tune (slow, opaque, brittle to base-model churn), or only harden (agents constrained into workflows that no longer earn their name — sometimes correct! but then say so and take Topic 9's exit).

## 8. Limitations

- The direct three-way comparison does not exist in the ledger: CompWoB compares two levers on one domain with 2023–24-era models [CompWoB]; HarnessX reports its ordering on five benchmarks with its own architecture [HX]. The framework in §5 is a synthesis with clearly marked derivation, not a measured decision table.
- Fine-tuning economics (data requirements, drift rates, per-provider constraints) are unquantified here; the sources establish *roles*, not price curves.
- "Context engineering" spans an enormous mechanism space (Chapter 6 is entirely about it); this topic treats it as one lever, which is the right altitude for the three-way decision and wrong for everything downstream of choosing it.

## 9. Production implications

1. **Classify the failure before choosing the lever** (§5's table) — the single highest-yield habit this topic offers; most lever debates dissolve once the failure class is named.
2. **Keep an invariant ledger:** every "must" in the system, with its enforcement point; any "must" implemented as prose is an open item [CAL permissions; HB §3.4].
3. **Run the five-rewrites rule:** recurring instruction rewrites for the same behavior, at volume, are the fine-tuning trigger — before that, they're iteration.
4. **Prefer small tuned components to tuned frontiers** [AAR §3.3]: auxiliary decisions (routing, classification, extraction) are where fine-tuning's economics are cleanest and its blast radius smallest.
5. **Re-run the lever decision on every base-model upgrade:** the upgrade may obsolete the fine-tune, simplify the context, or both — Chapter 1 Topic 10 §5's demotion review, third costume (§5).
6. **Budget context like the shared resource it is** — with an owner, a review cadence, and deletions (Chapter 6; Chapter 15's GC) — or the cheapest lever silts up.

## 10. Connections

- This topic is Chapter 1 Topic 4 (the three-layer stack) turned into a change-management discipline, and Topic 10 (minimal intervention) applied to behavior modification.
- Chapter 6 is the context lever in full; Chapter 13's ablation methodology is §6.1 industrialized; Chapter 15's capability-drift topic owns the upgrade-interaction problem (§9.5).
- Topic 14, next, catalogs the failure mechanisms these levers are deployed against — including the ones (reward hacking, evaluation awareness) that constrain the fine-tuning lever itself.

## Sources

[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) abstract, §5
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §3.3
[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[OAT] OpenAI, Tools guide — https://developers.openai.com/api/docs/guides/tools
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1.1
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.1, §3.4
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.4.2
