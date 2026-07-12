# Topic 8 — Termination Predicates, Step Budgets, Token Budgets, Time Budgets, and Cost Budgets

## 1. Problem and objective

Termination is the control plane's hardest decision because it is a judgment ("is this done?") that must be rendered by machinery that cannot judge, about a claim ("I'm done") from a component that cannot be trusted to make it. Chapter 2 documented the distrust empirically: premature stops driven by unverbalized internal states, including a spurious belief of budget exhaustion with $2.43\times10^6$ tokens actually remaining [FSC §6.4.1.4]. This topic builds the full termination architecture: the typed predicate $\kappa_t$, the four budget families and their enforcement semantics, the verification-governed stop conditions the sources specify, and the measurement treatment of budget-terminated runs — which is where most reporting goes quietly wrong.

## 2. Intuition first

A run can end for exactly three kinds of reason: *it worked* (verified success), *it should not continue* (safety or policy says stop), or *it may not continue* (a resource ran out). The model's opinion that it is finished belongs to none of the three — it is evidence for evaluating the first, never the verdict. Budgets exist because the second and third kinds must be decidable without cooperation from the thing being stopped: a budget is a promise to the operator that no run, however confused, can spend more than $B$. The design problem is to make the first kind (verified success) the *common* terminal cause and the budget backstops the *rare* ones — because every budget-stop is, definitionally, a run the detection layer failed to conclude on merit (Chapter 1, Topic 8).

## 3. The termination predicate

From the notation contract (Ch. 1, Topic 12 §3.3), evaluated after each decision event:

$$
\kappa_t=\mathsf K\!\left(\hat\tau_{0:t},\,b_t^{\mathrm{rem}},\,v_t\right)\in
\{\mathrm{continue},\,\mathrm{success},\,\mathrm{model\_stop},\,\mathrm{budget},\,\mathrm{timeout},\,\mathrm{execution\_error},\,\mathrm{policy\_block}\},
$$

with $b_t^{\mathrm{rem}}$ the remaining budgets and $v_t$ any validator/environment terminal signal. The source-specified content of $\mathsf K$'s success branch: "termination should... be governed by verification rather than by model confidence: a loop can stop when required checks pass, when additional attempts no longer improve the state, when the risk tier changes, or when human review is required" [CAH §3.4.4]. Reading those four clauses as predicate structure **[synthesis — formalization ours; clauses sourced]**:

$$
\kappa_t=\mathrm{success} \iff v_t=\text{pass on the declared check set}
$$

$$
\kappa_t\in\{\mathrm{model\_stop},\ \text{escalate}\} \iff \text{no-progress}(\hat\tau_{t-w:t}) \ \lor\ \text{tier-change} \ \lor\ \text{review-required}
$$

The no-progress clause deserves engineering attention it rarely gets: "additional attempts no longer improve the state" requires a *state-improvement metric* over a trailing window $w$ — verification scores, failing-test counts, diff churn — and it is the principled replacement for both infinite retry loops and arbitrary retry caps. A run that plateaus should stop *as a detected plateau* (escalation or clean model-stop), not by exhausting its budget noisily.

The model-side stop signal — the no-tool-call emission [CAL] — enters $\mathsf K$ as the *trigger to evaluate* the success branch. If validation passes, $\kappa=\mathrm{success}$; if it fails or does not exist, the honest terminal class is $\mathrm{model\_stop}$: an unverified completion proposal, reported as such (Topic 3 §5.2).

## 4. The four budget families

| Family | Mechanism | Enforcement semantics | Failure it bounds |
|---|---|---|---|
| **Steps/turns** | `max_turns` (counts tool-use turns) [CAL] | Loop refuses further turns; terminal subtype `error_max_turns` | Unbounded exploration; retry spirals |
| **Tokens** | Context/window management plus usage accounting [CAL] | Compaction pressure; per-run usage in $\hat\tau$ | Context saturation; runaway generation |
| **Time** | Timeouts, fixed per task in evaluation protocols [HB Table 1] | Hard wall-clock cut; `timeout` terminal class | Hangs; environment stalls |
| **Cost** | `max_budget_usd` [CAL] | Spend ceiling; `error_max_budget_usd` | Monetary blowout; the operator's promise |

Design semantics the sources fix. Budgets are **harness-enforced and model-independent** — which matters because the model's *internal* budget representation is demonstrably unreliable in both directions: self-rationing at 0.15% of available budget on a false exhaustion belief [FSC §6.4.1.4]. Corollary **[derived]**: make true budget state *visible* to the model (as data), never *delegated* to it (as control) — visibility addresses the self-rationing failure; delegation would recreate it with authority. Budgets compose across levels (per-turn, per-subagent, per-run, per-portfolio); the binding constraint should be chosen per consequence class, and "budget as a good default for production agents" is the vendor's own stated posture [CAL].

## 5. Termination and measurement: censoring, not embarrassment-hiding

Budget- and timeout-terminated runs are *censored observations*, and the notation contract's rules apply (Ch. 1, Topic 12 §7): for service-level completion they may count as failures; for time-to-event analysis they may be right-censored when the censoring assumptions are defensible; report both views, and never silently drop them [KM via Ch. 1, Topic 12]. Three reporting obligations follow:

1. **The $\kappa$ distribution is a first-class result** — the split among success / model-stop / budget / timeout / error across a run population, with task-clustered intervals. A configuration whose failures are mostly `budget` differs diagnostically from one whose failures are mostly `execution_error`, at identical success rates.
2. **Budget sensitivity is part of the configuration's identity:** the same $(M_c,H_c)$ under different $B_c$ is a different configuration $c$ (the tuple includes $B_c$), and comparisons across budget settings are configuration comparisons, not free variations. Evaluation protocols fix budgets and timeouts per task for exactly this reason [HB §3.1, Table 1].
3. **Backstop-firing rate is the detection-failure metric** (Chapter 1, Topic 8 §7): each `budget`/`timeout` termination is a run the verification layer neither concluded nor escalated; trend it.

## 6. Failure modes

- **Model-stop reported as success:** the unverified completion accepted because the loop's native stop condition fired [CAL] — the premature-completion pipeline from Chapter 2, Topic 14 §4, laundered by reporting.
- **Budget as the only working stop:** no validator set, no no-progress detector; every hard task ends in `error_max_turns` and the spend is pure waste — the plateau clause of [CAH §3.4.4] unimplemented.
- **Unhandled terminal subtypes:** callers reading `result` without checking subtype (only `success` carries it [CAL]); a budget-stop silently becomes an empty-output "success" downstream.
- **Self-rationing unmeasured:** model-initiated stops with large unspent budgets on incomplete tasks — the [FSC §6.4.1.4] signature; instrument unspent-budget-at-model-stop as a standing metric.
- **Mid-turn message loss at limits:** the documented queue-into-ending-turn defect class (a message arriving on the final iteration "consumed into the ending turn and lost" pre-fix [CAL]) — termination boundaries are where interruption handling is most fragile; test them.
- **Censoring malpractice:** dropping timed-out runs from the denominator; the contract's failure-mode list names it directly ("censored runs silently removed" — Ch. 1, Topic 12 §12).
- **Budget arms race:** raising $B_c$ to make failures disappear instead of diagnosing why runs need the extra spend; the turn/token spread across harnesses at similar or inverse quality [HB Table 2, §4.2] says spend is not merit.

## 7. Limitations

- The no-progress predicate requires a domain progress metric; in weak-oracle classes (Chapter 1, Topic 11) the available metrics are judge-mediated, importing judge noise into termination itself — an unavoidable coupling this book can only insist be *declared*.
- The [CAH §3.4.4] stop conditions are stated for code-agent loops; their transfer to conversational or research classes is a synthesis (plateau detection over judged quality is measurably weaker than over failing-test counts).
- No source in the ledger quantifies the optimal budget-setting problem (the trade between censoring rate and spend); Topic 14's paired methodology with $B_c$ as the treatment is the honest way to answer it locally.

## 8. Production implications

1. **Implement $\mathsf K$ explicitly** — a named function with the three branches of §2's intuition, not an emergent property of scattered checks; log its inputs ($v_t$, budgets, trigger) with every terminal event.
2. **Declare the check set per task class:** what validator pass constitutes $\mathrm{success}$; a task class without a declared check set can only ever produce $\mathrm{model\_stop}$, and its dashboard should say so.
3. **Build the plateau detector** (trailing-window state-improvement) before raising any budget; most `error_max_turns` populations are plateaus that should have stopped cheaply and been escalated.
4. **Set budgets per consequence class, compose per level** (turn/subagent/run), and alarm on backstop-firing rate, not just spend.
5. **Report the $\kappa$ distribution with censoring treatment declared** (§5) in every evaluation and every production review; a success rate without its terminal-cause distribution is a number without its meaning.

## 9. Connections

- This topic instantiates the terminate phase of Topic 3 and the resource-invariant class of Topic 7; Topic 9 handles what happens when termination is *imposed* (cancellation) rather than decided.
- Chapter 10 owns verified stop conditions over long horizons and budget management across sessions; Chapter 13 inherits the censoring discipline; Chapter 14 owns spend governance at fleet scale.

## Sources

[CAL] Claude Agent SDK, "How the agent loop works" (budgets, terminal subtypes, streaming-input note) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.4
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.4.1.4
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.1, §4.2, Tables 1–2
[KM] Kaplan and Meier, via the book's notation contract (Ch. 1, Topic 12 §7) — https://doi.org/10.1080/01621459.1958.10501452
