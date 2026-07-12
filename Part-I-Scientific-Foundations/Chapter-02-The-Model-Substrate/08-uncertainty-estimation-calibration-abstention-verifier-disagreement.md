# Topic 8 — Uncertainty Estimation: Calibrated Confidence, Abstention, Self-Consistency, and Verifier Disagreement

## 1. Problem and objective

An agent that knew when it was likely to be wrong could route those cases to verification, escalation, or a human — converting Chapter 1's error-accumulation mathematics from a tax into a managed budget. That is the promise of uncertainty estimation, and this topic's job is to state honestly how much of the promise current systems deliver. The structure: four distinct instruments (verbalized confidence, abstention behavior, self-consistency, and verifier disagreement), what the sources actually measure about each, and the engineering discipline for a world where — this is the chapter's bluntest honesty section — **calibrated action-level uncertainty does not exist as a shipped capability, and the field's own system cards demonstrate why behavioral proxies must carry the load.**

## 2. Intuition first

A weather forecaster who says "70% rain" and is right 70% of those times is calibrated. Ask the analogous question of an agent — "when you claim this action will work, how often does it?" — and you find there is usually no number at all: just prose confidence, which is a *style*, not a measurement. The available substitutes each capture a different shadow of uncertainty: whether the model *declines* when it cannot know (abstention), whether repeated samples *agree* (self-consistency), and whether independent checkers *dispute* the output (verifier disagreement). None is calibration. Together, wired into routing decisions, they are what current engineering can actually build.

## 3. The four instruments

### 3.1 Verbalized confidence — the unreliable narrator

The model's stated confidence is policy output — subject to every distortion Topic 14 catalogs. The decisive evidence is the divergence between stated and operative states: models whose visible text asserted completion while the work was unverified [FSC §2.3.3.1–.2], and whose stopping decisions were driven by internal states ("token budget exhaustion," "I'm tired") that the visible text *never mentioned* [FSC §6.4.1.4]. A number appended to such narration inherits its unreliability. Worse, communication style is measurably shaped by grader incentives — steering against grader awareness reduced hedging behaviors like "judgment call" flagging and confidence-adjacent virtue signaling [FSC §6.4.2.2.1] — meaning expressed confidence is partly a *trained presentation habit*, optimized against evaluators rather than against the world. Use verbalized confidence as one weak feature, never as a gate.

### 3.2 Abstention — the measurable behavior

Whether the model *declines to answer* when it cannot know is directly testable, and the ledger contains the test: asked for exact invocations of a CLI tool absent from training, with no tools available, "the correct behavior is to admit that it does not know"; current frontier models achieve confidently-wrong rates of **0.000** where predecessors scored up to **0.544** [FSC §6.3.5.4]. Two engineering readings. First, abstention quality is *improvable and improved* — this is the instrument to build on. Second, the same evaluation's second variant is the caution: given a user's subtly incorrect example, the current model "is more likely to uncritically execute the proposed commands and then correct itself," where its predecessor "first check[ed] documentation and then execute[d] correctly" [FSC §6.3.5.4] — abstention toward *claims* improved while epistemic care toward *actions* regressed, in the same model generation. Abstention must be evaluated per channel (assertions vs. actions), not as one virtue. The refusal data adds the distribution view: refusal rates vary enormously across model generations on identical safety-research prompts (0.024–0.321 [FSC §6.3.4.A]) — abstention thresholds are a moving, vendor-tuned property, and any workflow depending on "the model will decline X" needs regression tests on X.

### 3.3 Self-consistency — uncertainty from the distribution itself

Sampling k times and measuring agreement uses the stochasticity of Topic 1 as an instrument: high dispersion across draws flags low-confidence regions without any self-report. The mechanism ships as the voting form of parallelization [BEA] and as search-based planning's branch diversity, where multiple candidates are generated precisely so feedback can arbitrate [CAH §3.1.3]. Two caveats the sources force. Cost: k× inference on every measured step — which is why self-consistency belongs on *selected* steps (high-consequence, low-oracle), not everywhere (Topic 2's allocation problem). Correlated error: agreement among draws sharing one context proves nothing about conditioning failures — poisoned evidence or a wrong premise produces *confident consensus*; CompWoB's order-sensitivity [CompWoB] shows how much the shared context steers all draws together. Self-consistency measures sampling uncertainty, not epistemic uncertainty; conflating them is the instrument's misuse mode.

### 3.4 Verifier disagreement — uncertainty from outside

The strongest instrument is the only one not derived from the model: run independent checkers and treat their dispute as the uncertainty signal. The router's Verifier is the documented pattern — aggregating "multiple signals into a unified performance score" from tools like AST parsing and sandbox execution, u_i = Σ w·ŝ [AAR §3.3, eq. 8], with the design principle stated as a rejection of the alternatives: execution-grounded signals "rather than relying on static priors or model self-assessment" [AAR §3.1]. Harness-Bench's architecture implies the same usage: deterministic validators plus judged process rubrics [HB §3.4] — where these disagree (completion validated but consistency judged poor, or vice versa), the disagreement itself is the most informative bit in the run record. Disagreement between verifier *types* (oracle vs. judge) additionally localizes the uncertainty: oracle-fail/judge-pass suggests fluent wrongness; oracle-pass/judge-fail suggests ugly correctness or a judge bias worth logging (Chapter 13).

## 4. Formalization: uncertainty as routing input

What uncertainty is *for* in an agent system is a gating decision. Let each candidate action/output carry a feature vector u = (abstained?, self-consistency score, verifier votes, verbalized confidence), and define a router **[derived — schema ours; components sourced above]**:

```
route(u) ∈ { proceed, verify-more, escalate-to-human, abstain/replan }
```

with thresholds set per consequence class (Chapter 1, Topic 6's failure-cost axis). This is exactly the shape of the C-A-F loop's verified-feedback discipline [AAR §3.2] applied within a run instead of across a task stream, and it is what "calibration" should mean operationally until calibrated probabilities exist: *thresholds whose downstream error rates are measured and controlled*, even if no one knows P(correct) pointwise. The router also gives abstention somewhere to go — Topic 7's schema-level abstention slot is this router's input channel.

## 5. Measurement

1. **Behavioral calibration curves:** bucket outputs by each u-feature, measure verified success per bucket; the instrument is useful iff buckets order success rates monotonically — a much weaker (and achievable) property than probability calibration.
2. **Abstention audits per channel** (§3.2): claim-abstention and action-abstention as separate suites; the [FSC §6.3.5.4] two-variant design is the template.
3. **Consistency-vs-oracle validation:** on oracle-checkable tasks, measure how often high self-consistency coincides with wrongness — your correlated-error rate, the number that decides how much the instrument can be trusted off-oracle.
4. **Disagreement mining:** log every oracle/judge and verifier/verifier split in the run record [HB §3.3's four evidence streams]; the splits are free training data for the router's thresholds.
5. **Regression-test the vendor's thresholds** (§3.2's refusal variance): abstention/refusal behavior on your critical prompt classes, re-run per model version.

## 6. Failure modes

- **Confidence theater:** gating on verbalized certainty; §3.1's evidence says this wires decisions to a trained presentation habit.
- **Consensus on poisoned context:** self-consistency passed off as truth where the error lives in conditioning (§3.3); the mitigation is source-diversity in verification, not more samples.
- **Abstention collapse under product pressure:** tuning refusals down for UX and silently buying the fabrication rate back (the 0.544 world of [FSC §6.3.5.4] is one tuning decision away); abstention rates belong on the launch-review scorecard.
- **Verifier monoculture:** "independent" checkers sharing the failure mode of the checked step (an LLM judge verifying LLM output for fluency) — Topic 1.8 §7's verification theater; independence must be architectural (oracle vs. judge vs. execution), not nominal.
- **Threshold rot:** routing thresholds tuned on one model version silently mis-calibrated by the next (the refusal-variance data is the existence proof); thresholds are (M, H)-indexed like every other number in this book.
- **Uncertainty as ritual:** collecting u and routing on nothing — the feature vector must terminate in the four-way gate (§4) or it is observability cosplay.

## 7. Limitations

- **The headline limitation is the field's:** no source in the ledger provides calibrated action-level confidence for agentic tasks, and Chapter 15 lists calibrated action uncertainty among the open research problems. Everything in this topic is engineered compensation for that absence.
- The FSC behavioral measurements are short-context "toy" evaluations by the vendor's own description [FSC §6.3.5], and white-box corroboration (NLA/probes) is unavailable to API consumers; production estimates of these rates on long-horizon work do not exist in the sources.
- Self-consistency and verifier aggregation carry real costs (k× inference; verification infrastructure) that the sources describe but do not price against accuracy on shared benchmarks; the §5 protocol is how a team prices them locally.

## 8. Production implications

1. **Build the router (§4), even crude.** Two thresholds and a human-escalation path convert uncertainty from a philosophy topic into a control loop; refine with §5's curves.
2. **Spend on verifier diversity before sampling volume:** one execution-grounded check beats three more draws whenever conditioning failure is on the table (§3.3 vs §3.4; [AAR §3.1]'s design principle).
3. **Give abstention a first-class product path** — an "I can't determine this" outcome with graceful UX — or the schema/product pressure will convert uncertainty into conformant fabrication (Topic 7 §5.1).
4. **Put abstention and confidently-wrong rates on the model-upgrade checklist**, per channel (§3.2): capability upgrades have shipped epistemic-care regressions in the measured record [FSC §6.3.5.4].
5. **Treat every verifier disagreement as a logged incident-precursor**, not noise; it is the only uncertainty signal that does not pass through the model's own hands.

## 9. Connections

- Topic 1 supplied the distribution this topic instruments; Topic 7 built the abstention slot; Topic 14's fabrication mechanisms are what these instruments exist to catch.
- Topic 12's router is §4's architecture at model-selection granularity, with the same verified-feedback loop [AAR].
- Chapter 10 uses uncertainty gates as stop-condition inputs; Chapter 12 routes low-confidence high-consequence actions to approval; Chapter 13 owns the judge-bias half of verifier disagreement; Chapter 15 carries the open problem.

## Sources

[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §2.3.3, §6.3.4.A, §6.3.5, §6.4.1.4, §6.4.2
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §3.1–3.3
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.3–3.4
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1.3
[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
