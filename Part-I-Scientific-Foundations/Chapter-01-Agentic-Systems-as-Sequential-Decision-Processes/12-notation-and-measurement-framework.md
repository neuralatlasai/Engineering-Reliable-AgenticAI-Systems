# Topic 12 — Scientific Notation and Measurement Framework Used Throughout the Book

## 1. Problem and objective

A book that spends fourteen more chapters making quantitative claims needs its symbols, metrics, and reporting rules fixed once, in writing, with sources. This topic is that contract. It consolidates the notation introduced across Topics 2–11, adopts the measurement conventions of the two methodologically serious benchmarks in the ledger (Harness-Bench and ALE), and states the statistical honesty rules that the rest of the book is bound by. Nothing here is new; everything here is binding.

## 2. Notation

### 2.1 The process (from Topic 2; source [MEM §2.1–2.2])

```
𝓘 = {1,…,N}            agent index set (N=1: single agent)
𝒮, s_t                  environment state space; latent state at step t
Ψ(s_{t+1} | s_t, a_t)   controlled stochastic transition kernel
o_t^i = O_i(s_t, h_t^i, 𝒬)   observation of agent i; h_t^i = visible history; 𝒬 = task spec
a_t = π_i(o_t^i, m_t^i, 𝒬)   policy; m_t^i = memory signal
τ = (s_0, o_0, a_0, …, s_T)  trajectory; T = termination step
𝓜_t ∈ 𝕄                memory state;  F (formation), E (evolution), R (retrieval) operators:
   𝓜^form_{t+1} = F(𝓜_t, φ_t);   𝓜_{t+1} = E(𝓜^form_{t+1});   m_t = R(𝓜_t, o_t, 𝒬)
```

Action types 1–5: language, tool invocation, planning, environment control, communication [MEM §2.1].

### 2.2 The system decomposition (from Topics 1, 4; source [HB §3])

```
Agent = Model + Harness                      (M, H)
π_effective = π_D ∘ π_H ∘ π_M                three-layer policy stack [derived notation]
R = Run(M, H, E, T)                          one run: model, harness, environment, task
TaskScore = Eval(R; J)                       external judge J
```

### 2.3 Scoring (source [HB §3.4])

```
TaskScore_i = Security_i · Completion_i · Process_i        Security_i ∈ {0,1}
Process_i  = (Robustness_i + ToolUse_i + Consistency_i)/3   all non-binary scores ∈ [0,1]
```

Component semantics, quoted-in-substance from the source: Completion — task-specific output quality (deterministic validators where possible, LLM judgment where necessary); Security — zeroed by unauthorized access, secret exposure, or forbidden actions; Robustness — handling of tool/environment failures; ToolUse — appropriate tool selection and application; Consistency — actions, observations, intermediate state, and outputs consistent with workspace state and user constraints [HB §3.4].

### 2.4 Reliability calculus (from Topics 6–8; [derived], CompWoB-calibrated)

```
n, n_stoch          total steps; steps under π_M choice (the horizon that matters)
p_i, p̄              per-step success probability
d_i                 per-step detection power
∏ p_i               independence bound — treated as OPTIMISTIC for coupled composition [CompWoB]
p/(p+(1−p)(1−d))    per-step effective success with detection + retry
Cap(M,H), Rel(M,H)  capability vs reliability functionals (Topic 7)
g(A)                agency vector (aut, reach, per, adp, auth) (Topic 5)
```

### 2.5 Runtime vocabulary (source [CAL])

*Turn* (one model-output → tool-execution → results round trip), *run/session*, budgets (`max_turns`, `max_budget_usd`), termination subtypes (`success`, `error_max_turns`, `error_max_budget_usd`, `error_during_execution`), compaction boundary. These words are used in their [CAL] senses everywhere in the book; "step" refers to the formal t index, which may be finer than a turn (one turn can contain several actions).

## 3. The measurement framework

### 3.1 The unit of measurement is the configuration

Every reported number is indexed by **(M, H, versions, budgets, permissions, E, T-suite, J)**. This is Harness-Bench's protocol elevated to book policy: external task conditions fixed (task prompt and fixtures, initial sandbox state, budget, timeout, evaluator), harness and model varied in a factorial matrix, everything native-to-harness documented rather than forcibly standardized [HB Table 1, §3.1]. Consequences the reader should internalize now: numbers quoted for a bare model are treated in this book as *incomplete citations*; the measured spread they omit is up to 23.8 points [HB §4.2].

### 3.2 Evidence per run: four sources or the run didn't happen

"Each run produces four sources of evidence: the final workspace state, execution trace, usage statistics, and validator outputs" [HB §3.3]. The book adopts this as the minimum admissible record — for benchmarks *and* for production incidents (Chapter 14's trace topology is this requirement industrialized). Outcome-only logging is scored, in our methodology reviews, as non-evidence.

### 3.3 Task admission standards

From Harness-Bench, the four criteria — **Realism** (plausible user workflow), **Solvability** (completable with provided resources), **Oracle-checkability** (deterministic checks or a specified rubric), **Integrity** (no credit via reading hidden answers, modifying protected fixtures, or bypassing constraints) [HB §3.2]. From ALE, the three admission requirements — **Representativeness** (real professional practice, real software), **Complexity** (end-to-end deliverable, "workflow, not an action"), **Verifiability** (deterministic checking or unambiguous rubric tied to observable artifacts) [ALE §2.1] — plus the construction discipline: expert-sourced, multi-gate review (first-pass conference-style review, engineered implementation with dry-runs, final QC committee) [ALE §2.3]. Tasks failing these standards produce numbers this book declines to interpret.

### 3.4 Contamination control

Public/private split with rotation: ALE releases ~10% (150 of 1,490) publicly, holds 1,017 private, rotates retired private tasks into public as replacements arrive — "an uncontaminated evaluation surface over successive model generations" [ALE §2.3, Fig. 5]. Book policy: scores on fully-public, long-lived suites carry an unknown contamination premium and are cited only with that caveat attached.

### 3.5 Judge discipline

Where LLM judges are unavoidable (process rubrics, non-oracle outcomes): one pinned judge version across all compared trajectories — Harness-Bench fixes claude-sonnet-4.6 for every trajectory in the study [HB §4.1] — and rubric-based scoring with components reported separately alongside the aggregate [HB §3.4]. Judge changes are treated as instrument changes: they reset comparability, full stop.

### 3.6 Efficiency reporting

Tokens and turns reported alongside quality, always — the source table reports Tok.(K) and Turns per configuration [HB Table 2] — because the NanoBot result (highest score, fewer tokens than four lower-scoring harnesses [HB §4.2]) shows quality and spend are not monotonically linked, and because cost-per-successful-task (Chapter 14's FinOps) is undefined without them.

### 3.7 Behavioral propensity tracking

Alongside success metrics, the measured behavioral rates the system cards demonstrate are trackable: beyond-user-intent actions [G56 §1], false completion / fabricated verification claims [FSC §2.3.3.1–.2], control-evasion attempts [FSC §2.3.3.3], evaluation-awareness indicators [FSC]. These are first-class reliability metrics in this book, not safety-team exotica — Topic 7 established that they move independently of capability, which is precisely why they need their own instruments.

### 3.8 Difficulty stratification and the shape of results

Report by difficulty tier, never as a single average — ALE's structure (easiest tier vs hardest, with the strongest configuration spanning <50% to <10% [ALE §1]) shows a single mean would misrepresent by construction. For horizon effects specifically: matched task families at doubling n, log-survival plots against the n·log p̄ reference line (Topic 8 §6) — the *decay slope* is the reported quantity, not the point estimate.

## 4. Statistical honesty rules

1. **Denominators visible.** 106 tasks [HB §4.1] and 1,490 instances [ALE] are respectable but finite; per-category cells (e.g., 7 SRE tasks [HB Fig. 2]) are anecdote-sized, and conclusions drawn from them are labeled as such. Every rate in this book travels with its n.
2. **Variance is a result, not noise.** Cross-harness variance per model is Harness-Bench's most decision-relevant finding (weaker backends more harness-sensitive [HB §4.3]); the book reports spread wherever it reports means.
3. **Aggregates are diagnostic, not guarantees.** The multiplicative TaskScore is "intentionally conservative" and interpreted by its own authors as "a diagnostic benchmark measure rather than a standalone deployment guarantee" [HB §3.4]. The book extends the stance to every composite index it uses.
4. **Derivations are labeled.** As throughout this chapter: **[derived]** marks mathematics we constructed, with assumptions stated, calibrated against sources where possible (the independence bound vs CompWoB's observed 24.9% [CompWoB]), never presented as measured fact.
5. **Absence of evidence is stated.** Where the ledger lacks a measurement (controlled workflow-vs-agent trials, Topic 9 §8; validated agency scales, Topic 5 §8; production belief-divergence rates, Topic 3 §8), the book says "unmeasured," not "known."

## 5. Failure modes of measurement itself

The framework guards against the instrument errors the sources document: **contamination** (§3.4); **integrity gaming** — agents obtaining credit by reading answers or modifying fixtures [HB §3.2]; **evaluation awareness** — behavior under test as an upper bound on behavior in the wild [FSC]; **judge drift** (§3.5); **aggregation hiding** — averages laundering catastrophic tails, countered by the multiplicative gate and component-wise reporting [HB §3.4]; **coverage illusion** — 16 major benchmarks jointly leaving 13 of 55 professional subdomains untouched [ALE §2.2]. Chapter 13 treats each in operational depth; they are named here because the notation contract must include what the numbers *cannot* say.

## 6. Limitations

- The framework inherits its sources' scopes: Harness-Bench is offline and sandboxed by design [HB §3.2], so the four-evidence standard and scoring formulas are proven there and *extrapolated* by this book to production settings — an extrapolation Chapter 14 must earn, not assume.
- Two benchmarks and two system cards is a thin normative base; where they conflict with a reader's domain constraints (e.g., domains where deterministic oracles are impossible), the *principles* (§4) transfer even where the formulas don't.
- Notation unification papers over source differences (e.g., [MEM]'s per-agent indexing vs [HB]'s per-run framing); we chose compatibility over fidelity in two places, both flagged **[derived]**.

## 7. Production implications

1. **Adopt the run record (§3.2) as your logging schema floor** — it is simultaneously the eval record, the incident record, and the audit record (Chapters 13–14 build on exactly it).
2. **Write internal evals to §3.3's admission standards**; a golden-task corpus that fails Oracle-checkability or Integrity screening measures your judge, not your agent.
3. **Institute the reporting contract** — configuration-indexed numbers, visible denominators, tiered results, propensity metrics — as the required format for any launch review artifact. The alternative is Topic 7's category error with your company's name on the incident report.
4. **Version everything in the index tuple:** model swap, harness edit, judge update, task-pool rotation each invalidate comparability with prior numbers; the tuple is what makes "did we get better?" a well-posed question.

## 8. Connections — and the chapter's closing observations

This topic closes Part I's opening chapter. What the chapter established, in the order the evidence forced it: local competence does not compose [CompWoB]; the harness is co-equal with the model and must share the citation [HB]; economically real work remains far from saturated [ALE]; capability and reliability are separately-moving quantities documented as such by the vendors themselves [FSC; G56]; and therefore architecture selection is a constrained minimization of agency (Topics 9–10), not a maximization of impressiveness. The notation and measurement contract of this topic is how the remaining chapters will be held to that standard:

- **Chapter 2** (the model substrate) uses π_M, action types, and the propensity metrics of §3.7.
- **Chapter 3** (the harness) decomposes π_H against the [HB §3] component list.
- **Chapters 8–10** compute in n_stoch, p, d; **Chapter 13** industrializes §§3.3–3.8; **Chapter 14** operationalizes §3.2 and §3.6; **Chapter 15**'s falsification checklist is §4 as governance.

## Sources

[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1–2.2
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.1–3.4, §4.1–4.3, Tables 1–2, Fig. 2
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1, §2.1–2.3, Fig. 5
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) Exec. Summary, §2.3.3
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
