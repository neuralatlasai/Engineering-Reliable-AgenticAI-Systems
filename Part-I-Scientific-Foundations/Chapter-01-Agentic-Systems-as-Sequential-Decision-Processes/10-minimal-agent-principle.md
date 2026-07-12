# Topic 10 — The Minimal-Agent Principle: Use the Least Autonomous Architecture That Satisfies the Task

## 1. Problem and objective

Topic 9 established a binary preference; this topic states the general optimization principle it instantiates, gives it a formal shape, and — because principles without procedures decay into slogans — attaches the procedure: a baseline ladder with promotion criteria, and the standing pressure that keeps deployed systems from ratcheting upward without evidence.

**The principle:** among architectures that meet the task's success threshold at its consequence level, deploy the one with the smallest agency vector (Topic 5) — least runtime autonomy, narrowest reach, shortest persistence, most bounded adaptivity, lowest authority.

## 2. Intuition first

This is not conservatism for its own sake; it is the same reasoning as least privilege in security and Occam's razor in modeling, applied to a component whose failure modes grow with its freedom. Every increment of agency purchases flexibility and pays for it in three currencies this chapter has priced: stochastic-horizon tax (Topic 8), evaluation tax (Topic 7), and control-surface tax (Topics 5, 12). The minimal-agent principle says: make the purchase only when a measurement shows the flexibility is needed, and keep the receipt.

## 3. Grounding: every source pushes the same direction

The principle is unusual in that *all* of the ledger's sources support it independently, from different concerns:

- **The vendor:** "the *right* system for your needs, not the most sophisticated"; single LLM calls with retrieval "usually enough"; complexity only when it "demonstrably improv[es] outcomes" [BEA].
- **The benchmark methodologist:** minimal permission/tool enablement as evaluation *protocol* — "we start from its default configuration and enable only the permissions and tools required to complete the task suite" [HB §4.1] — and the empirical footnote that the leanest-running harness scored highest [HB §4.2].
- **The economics benchmark:** at current reliability, less autonomy is simply what works — near-zero pass rates at hard tiers [ALE §1] mean unconstrained autonomy is not being left on the table; it is not there to take.
- **The safety cards:** deployment tiering as practiced governance — one model, two authority configurations (Fable's classifier-constrained general release vs Mythos's trusted-partner release) [FSC Exec. Summary]; a staged limited preview "before releasing more broadly" [G56 §1]. Both labs *ship* the minimal-authority version to the general case and gate the rest on trust evidence.
- **The runtime:** the permission ladder's documented defaults and warnings — `bypassPermissions` reserved for "isolated environments where the agent's actions cannot affect systems you care about"; budget limits recommended as "a good default for production agents" [CAL].

When the model vendor, the benchmark authors, the safety teams, and the runtime documentation all converge on the same direction, the remaining dissent is marketing.

## 4. Formalization

Let 𝓐 be the space of candidate architectures for task T with success requirement θ at consequence class C. Each A ∈ 𝓐 has agency vector g(A) = (aut, reach, per, adp, auth) (Topic 5) and measured reliability Rel_T(A) (Topic 7). The principle:

```
choose  A* = argmin_{A ∈ 𝓐}  g(A)      (componentwise, lexicographic by consequence relevance)
        subject to  Rel_T(A) ≥ θ  at consequence class C
```

**[derived — formalization ours; constraint and objective both grounded above]** Three properties worth noting:

1. **The constraint is measured, not argued.** Rel_T(A) comes from the Topic 7 §7 protocol; a candidate without a measurement is not in 𝓐.
2. **The ordering is partial.** When two architectures trade autonomy against reach, the tie-break is consequence-weighted: reduce first the dimension whose interaction row (Topic 5 §6) touches your highest failure cost.
3. **The argmin moves.** θ, T's distribution, and available (M, H) all drift; A* is a standing answer to a standing question, not a one-time decision — hence §6's re-review triggers.

## 5. The procedure: the baseline ladder

Ascend only on measured failure of the rung below; each rung's failure evidence is the next rung's justification document.

```
Rung 0  Manual process                      — also your labeled-data source
Rung 1  Deterministic automation (no model)
Rung 2  Single model call (+ retrieval, examples)        [BEA's "usually enough"]
Rung 3  Workflow: chaining / routing / parallelization / evaluator-optimizer [BEA]
Rung 4  Workflow with dynamic delegation (orchestrator–workers)               [BEA]
Rung 5  Single bounded agent: budgets, minimal tools, gated authority  [CAL; HB §4.1]
Rung 6  Multi-agent                        — Chapter 9's justification burden
```

**Promotion criteria (all three, none waivable):**

- **P1 — Measured insufficiency:** rung r fails on the target distribution for reasons *structural to the rung* (Topic 9's A1–A4 for the 3→5 transition), documented with failure cases, not vibes.
- **P2 — Attributable remedy:** the specific capability rung r+1 adds addresses the documented failure mechanism. "It might help" fails P2; HarnessX-class evidence — try the cheaper lever first, harness iteration yields +14.5% average without touching autonomy [HX abstract] — is the P2 discipline applied *within* a rung.
- **P3 — Priced controls:** the incremental control stack (evaluation regime, permission design, monitoring) for rung r+1 is specified and budgeted *before* promotion, at the task's consequence class [Topic 7 §7; Chapter 12].

**Demotion is symmetric and neglected.** When a model upgrade raises Rel at rung 3 above θ, the rung-5 deployment above it is now unjustified agency — recheck downward on every model change [HB §4.3's compensation asymmetry makes this concrete: the harness/architecture tuned for the old model encodes obsolete compensations].

## 6. Keeping the minimum: pressure against the ratchet

Deployed systems accrete agency the way codebases accrete dependencies — each increment locally reasonable, the sum unjustified. Standing countermeasures:

- **Change control on the agency vector** (Topic 5 §9.2): any tool addition, permission widening, memory enablement, or session-lifetime extension re-opens the P1–P3 check for that increment alone.
- **Re-review triggers:** model swap (compensations shift [HB §4.3]); task-distribution drift (leaf-failure logs, Topic 9 §9.4); incident (each one is free P1 evidence about where the current rung actually fails).
- **Garbage collection:** unused tools, dead rules, stale memories are agency without function — pure risk surface. Chapter 15's harness garbage collection owns the cadence.
- **The autonomy budget as an explicit document:** what the system may decide alone, what it must surface, what it must never do — Chapter 12's authority matrix; the minimal-agent principle is that document's optimization objective.

## 7. Failure modes of the principle itself

Honesty requires arguing against our own rule:

- **Under-provisioning churn:** a task genuinely in A1 territory forced through rung 3 generates endless leaf patches (Topic 9 §7) and, worse, a false record that "AI doesn't work here." Mitigation: P1 review reads the failure log for *structural* signatures, in both directions.
- **Ladder theater:** teams performing rung ascent with strawman baselines — a rung-2 implementation nobody tried to make work, failed on cue to justify the agent someone already wanted. Mitigation: baseline implementations get the same engineering effort standard as the promoted candidate, and the review board knows this failure mode by name.
- **Local minima:** componentwise-minimal g can miss a globally better trade (slightly more autonomy, much less reach). The lexicographic tie-break (§4.2) is a heuristic, not a theorem; document when you deviate and why.
- **Velocity cost:** P1–P3 takes time; competitors ship demos. The honest answer is Topic 7: the demo's capability number was never going to survive contact with the task distribution anyway — the ladder's cost is mostly the cost of finding that out before customers do. But the principle *does* trade time-to-impressive for time-to-dependable, and organizations should choose that trade knowingly.

## 8. Limitations

- The formalization inherits Topic 5's limitation: g has no validated cross-system scale, so "minimal" is rigorous only within a candidate set you can order — which, for one team's architecture review, you can.
- No source runs the full ladder as a controlled experiment; the grounding in §3 is convergent testimony plus the chapter's quantitative results, not a single decisive trial. (Chapter 15's eval-driven lifecycle is the closest the sources come to institutionalizing it [BEA; HX].)
- The principle presumes a measurement capability (Rel_T at each rung) that early-stage teams lack; for them the honest reading is: the ladder *is* the plan for acquiring that capability, rung by rung, starting from the manual process's labeled data.

## 9. Production implications

1. **Institutionalize the burden of proof:** the Architecture Decision Record for any rung ≥ 5 deployment cites P1 evidence, P2 mechanism, P3 budget — or the deployment doesn't happen (Chapter 15's ADR-with-explicit-rejection-of-unnecessary-autonomy).
2. **Ship the tiered configuration, not the maximal one:** default deployment at minimal authority with documented promotion paths — the Fable/Mythos pattern [FSC] as internal platform design.
3. **Audit the agency vector quarterly** against actual usage: every enabled-but-unused capability is a free reduction; take it.
4. **Exhaust the cheap levers inside the current rung before promoting:** harness iteration [HX], evidence-pipeline investment [AAR §1's information-deficit finding], context engineering (Chapter 6) — each has measured headroom that autonomy increments do not beat on cost.
5. **Write the demotion review into the model-upgrade runbook.** Nobody remembers to take autonomy back; the runbook has to.

## 10. Connections

- The optimization objective is Topic 5's vector; the constraint is Topic 7's Rel; the rung-comparison mathematics is Topic 8; the 3-vs-5 boundary test is Topic 9.
- Chapter 12 supplies the authority-matrix artifact; Chapter 13 the Rel measurement machinery; Chapter 15 the lifecycle that runs this ladder as standard practice (baseline ladder, ADR, progressive authority, harness GC).

## Sources

[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §4.1–4.3
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) abstract
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §1
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) Exec. Summary
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
