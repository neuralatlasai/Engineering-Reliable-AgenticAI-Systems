# Topic 15 — Long-Horizon Benchmarks, Survival Curves, and Time-to-First-Unrecoverable-Error

## 1. Scope, prerequisites, terminology, boundaries, outcomes

The chapter closes with **measurement**: how do you *quantify* the reliability of a long-running agent? A single pass/fail at the end is nearly useless — it collapses a run's entire trajectory into one bit and hides *where* and *how* runs fail. The right instruments are borrowed from reliability engineering and biostatistics: the **survival curve** (probability a run has *not yet* hit its first unrecoverable error by step $k$) and **time-to-first-unrecoverable-error** (the horizon at which runs die). These make Topic 2's horizon failures *visible*, quantify the pressures P1–P3 (Topic 1), and turn "it seems reliable" into a defensible number with confidence intervals.

**Prerequisites.** The multiplicative error model and CompWoB precedent (Chapter 1 Topic 8); the statistical protocol — Kaplan–Meier survival [KM], censoring, Wilson intervals [WILSON], the zero-failure bound (Chapter 1 Topic 12); horizon failures and eval-blindness (Topic 2); the three pressures P1/P2/P3 (Topic 1); verified stop and false-completion (Topic 12); the recovery taxonomy — what makes an error *recoverable* vs *unrecoverable* (Topic 11); end-state evaluation and the ~20-query rule (Chapter 9 [MAR]).

**Terminology.**
- **Survival function** $S(k) = \Pr[T > k]$ — probability the run's first unrecoverable error occurs *after* step $k$; the reliability trajectory over the horizon.
- **Time-to-first-unrecoverable-error** $T$ — the step (or unit, or wall-clock) at which a run hits an error it cannot recover from (Topic 11 escalate/terminal). The survival analysis's event.
- **Unrecoverable error** — a failure the harness cannot retry/replan/rollback/compensate/quarantine past (Topic 11) — it terminates the run short of success. *Recoverable* errors (crashes the checkpoint resumes, transients retried) are *not* events; a run that recovers has *not* failed.
- **Censoring** — a run that ended without an unrecoverable error (succeeded, or was still going, or was stopped for external reasons) — its $T$ is only known to be *greater than* its observed length. Must be handled, not dropped [KM].
- **Hazard rate** $h(k)$ — the instantaneous rate of unrecoverable failure at step $k$ given survival to $k$; reveals *where* in the horizon runs die.

**Boundary.** This topic is the *long-horizon-specific* measurement — survival, time-to-failure, hazard. General evaluation science (graders, trace grading, statistical power, contamination) is Chapter 13; this specializes to the metrics unique to long runs. It measures the reliability the whole chapter builds; it does not add new mechanisms.

**Outcome.** You will be able to define the failure event correctly (unrecoverable, not any error), build a survival curve with proper censoring, compute time-to-first-unrecoverable-error, read the hazard to locate failures in the horizon, and compare two harnesses with the right statistics.

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** Long-run reliability is usually reported as end-state pass rate at one horizon — which (Topic 2) hides everything that matters: *where* runs fail, *how the failure rate grows with horizon*, and *whether a harness change helped*. Worse, naive metrics mis-handle two things: (1) they count *recoverable* errors as failures (a crash the checkpoint resumed is not a run failure — Topic 11), inflating the failure rate and obscuring the harness's actual reliability; and (2) they drop or mis-count *censored* runs (still-running, externally-stopped, or successful), biasing the estimate. The result is a number that is both pessimistic (counts recovered crashes) and biased (mishandles censoring), and that says nothing about the horizon dependence that is the entire subject of the chapter.

**Objective.** (i) Define the failure *event* correctly: the first *unrecoverable* error (Topic 11), not any error. (ii) Estimate the survival function $S(k)$ with proper censoring [KM], so reliability is a *curve over horizon*, not a point. (iii) Report time-to-first-unrecoverable-error and the hazard $h(k)$ to locate *where* runs die (early setup? late-run decay? the "last mile"?). (iv) Compare harnesses with valid statistics (survival-curve comparison, not just two pass rates). (v) Connect the observed hazard back to the pressures P1–P3 and horizon failures (Topic 2) that cause it.

**Assumptions.** (a) Runs can be instrumented to detect the first unrecoverable error (Topic 11's classifier tags terminal/escalate). (b) Enough runs at enough horizons to estimate a curve — long runs are expensive, so the design must be *sample-efficient* ([MAR]'s "~20 queries enough for big effects" is the relevant scale for large effects; small effects need more). (c) Runs are comparable (same task family) — mixing task difficulties confounds the curve (Chapter 1's warning against aggregating over different mixtures).

**Constraints.** The failure event must exclude recovered errors (else you measure crash-rate, not run-reliability). Censoring must be handled ([KM]), not by dropping runs (survivorship bias) or by treating censored runs as failures (pessimistic bias). Confidence intervals are mandatory — a survival curve without them is a story, not a measurement; zero-failure horizons need the zero-failure bound $p_{\max} = 1 - (1-\gamma)^{1/n}$, not "100% reliable."

**Success criteria.** A survival curve $S(k)$ with confidence bands; a reported time-to-first-unrecoverable-error (e.g., median survival) with its interval; a hazard curve locating failures in the horizon; a valid harness-vs-harness comparison; and an interpretation tying the hazard shape to P1–P3 / horizon failures.

## 3. Intuition first, then formalization

**Intuition.** Reliability of a long-running agent is not "does it work?" — it is "*how far can it get before it dies?*" That is a survival question, identical in structure to "how long does a machine run before it breaks" or "how long does a patient survive after treatment." The survival curve $S(k)$ answers it: it starts at 1 (every run is alive at step 0) and decays toward 0 as runs hit their first unrecoverable error. A harness that is more reliable has a *higher* survival curve — runs get further before dying. This single picture contains everything a point pass-rate hides: the *shape* tells you whether runs die early (bad setup/decomposition), steadily (per-step error accumulation, Topic 2's $e^{-pK}$), or late (the "last mile" — [MAR]: "the last mile is most of the journey").

The critical definitional insight is **what counts as death.** A crash that the checkpoint resumes (Topic 8) is *not* death — the run survived it. A transient retried successfully (Topic 11) is *not* death. Counting those as failures measures your *infrastructure's* flakiness, not your *run's* reliability — and makes a well-recovering harness look *worse* than a fragile one that happens to crash less. Death is the *first unrecoverable error*: the failure the recovery taxonomy (Topic 11) cannot get past — a terminal failure, an exhausted recovery, an escalation the run cannot resume from. **The whole point of Topics 8–11 was to convert deaths into survivable events; the survival curve measures whether they succeeded.** A harness that recovers well has *few unrecoverable errors even if it has many recoverable ones* — and only the survival curve, with the right event definition, shows that.

The **hazard rate** $h(k)$ is the survival curve's derivative-in-spirit: the rate of dying *at* step $k$ given you made it to $k$. It *locates* the danger. A flat hazard means constant per-step risk (steady accumulation). A rising hazard means late-run danger (decay, P3; drift, Topic 2 — the run gets more likely to die the longer it goes). A U-shaped hazard means both early risk (setup failures) and late risk (decay). Reading the hazard tells you *which* topic to invest in: early hazard → fix decomposition/initializer (Topics 3–4); rising late hazard → fix decay/verification (Topics 7, 12, 14).

**Censoring** is the subtle statistical point. Many runs *do not* die during observation — they succeed, or you stop them (budget, time, external), or they are still going. Their true time-to-failure is *unknown*, only known to exceed their observed length. You cannot drop them (that biases toward the runs that *did* fail — survivorship bias inverted) and you cannot call them failures at their stop point (pessimistic). Kaplan–Meier [KM] handles exactly this: it uses each censored run's information ("survived at least this far") without assuming when it *would* have failed. This is why survival analysis, not a raw failure fraction, is the correct tool — long runs are *expensive*, so many are censored (stopped before failure), and censoring must be handled correctly or the estimate is garbage.

**Formalization.** Let $T$ = step of first unrecoverable error (the event), with runs indexed $i$. Observed data: $(t_i, \delta_i)$ where $t_i$ is the observed length and $\delta_i = 1$ if the run hit an unrecoverable error (event), $0$ if censored (succeeded / stopped / ongoing).

**Kaplan–Meier estimator [KM]:**
$$
\hat S(k) = \prod_{j:\, k_j \le k} \left(1 - \frac{d_j}{n_j}\right),
$$
where $k_j$ are the distinct event steps, $d_j$ the number of unrecoverable failures at $k_j$, and $n_j$ the number of runs still "at risk" (alive and uncensored) just before $k_j$. Censored runs leave the risk set without being counted as events — this is the correct handling. Confidence bands via Greenwood's formula.

**Hazard:** $\hat h(k_j) = d_j / n_j$ — the fraction of at-risk runs that die at $k_j$. Its shape over $k$ is the diagnostic.

**Median survival** = the smallest $k$ with $\hat S(k) \le 0.5$ — a robust summary of time-to-first-unrecoverable-error (robust to the long censored tail, unlike a mean).

**Connection to the error model (Chapter 1) [derived].** If unrecoverable failure were memoryless at per-step rate $p$, then $S(k) = (1-p)^k \approx e^{-pk}$ — an exponential survival curve with constant hazard $p$. Deviations from exponential *diagnose* the failure mechanism: a *rising* hazard (survival falling faster than exponential) indicates self-reinforcing failures (drift, decay — Topic 2's faster-than-$(1-p)^K$ class); a *front-loaded* hazard indicates setup fragility. The survival curve is thus not just a score — it is a *window into which pressure (P1–P3) dominates*.

**Zero-failure horizons.** If no run fails by horizon $k$ across $n$ runs, do *not* report "100% reliable." Report the one-sided bound: with confidence $\gamma$, the true per-run failure probability by $k$ is at most $p_{\max} = 1 - (1-\gamma)^{1/n}$ (Chapter 1). $n = 20$ zero-failure runs bounds failure at ~14% (95%), *not* 0% — a crucial honesty about how little a handful of clean runs proves at long horizons.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Event detector.** Tags each run's outcome: unrecoverable error at step $t_i$ ($\delta_i = 1$, from Topic 11's terminal/escalate classification) or censored ($\delta_i = 0$: success via verified stop Topic 12, or externally stopped). The correct event definition lives here.
2. **Run instrumentation.** Records, per run, the length, the outcome, the step of first unrecoverable error, and (for diagnosis) which horizon failure (Topic 2) / pressure (Topic 1) caused it.
3. **Survival estimator.** Computes $\hat S(k)$ [KM] with Greenwood bands, the hazard $\hat h(k)$, and median survival.
4. **Comparator.** Compares two harnesses' survival curves (log-rank test) and reports the difference with its interval — not two point pass-rates.

**Interface: the event definition is the linchpin.** Everything downstream depends on `is_unrecoverable(failure)` being right: a recovered crash is *not* an event (censor or ignore — the run continues), only a first *unrecoverable* error is. Wiring the event detector to Topic 11's classifier (terminal/exhausted/escalate) is what makes the metric measure *run* reliability rather than *infrastructure* flakiness.

**Control flow (measurement campaign):**

```
for each run i in a matched task family, at horizon budget H:
    run the agent (with full harness: Topics 3-14)
    outcome = classify_end(run_i):
        SUCCESS (verified stop, Topic 12)         -> censored at t_i (delta=0)
        UNRECOVERABLE (Topic 11 terminal/exhausted)-> event at t_i (delta=1)
        STOPPED (budget/time/external)             -> censored at t_i (delta=0)
    record (t_i, delta_i, cause_i)                  # cause -> which P1/P2/P3, which horizon failure
estimate:
    S_hat(k) via Kaplan-Meier; Greenwood bands
    h_hat(k); median survival + CI
    if zero events by H: report p_max, NOT "100%"
compare (if two harnesses): log-rank test; report survival difference + CI
diagnose: hazard shape -> dominant pressure -> which topic to invest in
```

**Data flow.** Runs → event detector (Topic 11-tagged outcomes) → (t, δ, cause) tuples → survival estimator → curve + hazard + median + comparison. The *cause* field closes the loop: a rising late hazard traced to decay (Topic 2/14) tells you to invest in verification/reset, not decomposition.

## 5. Grounding: primary sources and reproducible evidence

**Local success does not transport — the survival premise.** Chapter 1's CompWoB result (94.0% → 24.9% as tasks compose) and the multiplicative error model (Topic 8 there) are the grounded basis for "reliability is a decaying function of horizon" — i.e., a survival curve, not a point. This is the empirical fact that makes survival analysis the right tool: the failure rate *grows with horizon*, exactly what $S(k)$ captures.

**The last mile — where the hazard concentrates.** [MAR] (Chapter 9): "the last mile is most of the journey" — long research tasks fail disproportionately near the end (consistent with false completion and decay being end-of-run phenomena, Topic 2). This grounds the expectation of a *rising late hazard* for long agent tasks and the value of reading *where* in the horizon runs die, not just *whether*.

**End-state evaluation and sample size.** [MAR]: evaluate the *end state* (not the process, "agents find alternative paths"), and "~20 queries [were] enough" for *big* effects. This grounds the event being defined on *outcome* (success/unrecoverable at end state) and the sample-efficiency reality — big reliability differences show with ~20 runs, but small ones (and tight survival bands) need many more, which at long horizons is expensive. It also grounds that *humans catch hallucinated answers evals miss* — a caveat that automated event-detection has blind spots (a false success counted as censored-success is a mismeasurement).

**Statistical protocol.** Chapter 1 Topic 12 grounds the exact tools: Kaplan–Meier with censoring [KM], Wilson intervals [WILSON] for the per-horizon rates, the zero-failure bound $p_{\max} = 1-(1-\gamma)^{1/n}$, and the warning against aggregating rates over different task mixtures (CompWoB $0.94^n$ "not statistically valid"). These are *directly* the tools this topic applies to survival.

**Recovery makes crashes non-events — the definitional grounding.** [LRH]'s "recover working base states," Topic 11's recovery taxonomy, and [MAR]'s "resume-from-error" ground the distinction between recoverable (survived) and unrecoverable (event). The whole chapter's mechanism (Topics 8–11) is what converts potential deaths into survived events — so the metric must count only the deaths that *remain* unrecoverable, or it fails to credit the recovery machinery.

**Honest grounding boundary.** Survival analysis / Kaplan–Meier / hazard / log-rank are **standard biostatistics-and-reliability tools**, applied here to agents (grounded in Chapter 1's protocol, which imported them). **No agent source publishes a survival curve, a time-to-first-unrecoverable-error, or a hazard for a long-running agent** — [MAR] gives the "last mile" *qualitative* observation and the ~20-query scale; [LRH]/[HDA] publish no survival data at all ([HDA]'s cost/time figures are single builds, not a distribution). This topic provides the *right instrument and the honest interpretation*; the *curves themselves are unmeasured in the agent literature* and are what a rigorous team must produce. This is the chapter's culminating honesty: the sources describe the architecture in detail and measure its reliability almost not at all.

**Reproducible evidence.** The full pipeline is reproducible: instrument runs at varied horizons, tag outcomes via Topic 11, estimate $\hat S(k)$ [KM]. The horizon-sweep (Topic 2 E1) *is* the raw data for a survival curve. Any team can produce these; the sources have not.

## 6. Implementation: survival estimation and honest reporting

**The event definition (the linchpin — get this right):**

```python
def classify_outcome(run):
    if run.verified_stop_success:                 # Topic 12: verified, not model-declared
        return ("censored", run.length)            # SUCCESS is censoring, not an event
    if run.terminated_unrecoverable:               # Topic 11: terminal / recovery-exhausted / escalate
        return ("event", run.first_unrecoverable_step)
    if run.stopped_external:                        # budget/time/manual — not a run failure
        return ("censored", run.length)
    # A recovered crash/transient is NOT here — the run continued; it is not an outcome.
```

**Kaplan–Meier with censoring [KM]:**

```python
def kaplan_meier(observations):   # observations: list of (t_i, delta_i)
    event_times = sorted({t for t, d in observations if d == 1})
    S, surv = 1.0, [(0, 1.0)]
    for k in event_times:
        n_at_risk = sum(1 for t, _ in observations if t >= k)      # alive & uncensored before k
        d_events  = sum(1 for t, delta in observations if t == k and delta == 1)
        S *= (1 - d_events / n_at_risk)
        surv.append((k, S))
    return surv        # + Greenwood variance for confidence bands
```

**Hazard and median:**

```python
def hazard(observations, k):
    n = sum(1 for t, _ in observations if t >= k)
    d = sum(1 for t, delta in observations if t == k and delta == 1)
    return d / n if n else 0.0        # instantaneous unrecoverable-failure rate at k

def median_survival(surv):
    return next((k for k, s in surv if s <= 0.5), None)   # None => >50% survive the horizon
```

**Honest zero-failure reporting (Chapter 1):**

```python
def report_reliability(observations, horizon, gamma=0.95):
    events = [o for o in observations if o[1] == 1 and o[0] <= horizon]
    n = len(observations)
    if not events:
        p_max = 1 - (1 - gamma) ** (1 / n)
        return f"0 unrecoverable failures in {n} runs; failure-by-{horizon} <= {p_max:.1%} ({gamma:.0%} conf) — NOT 0%"
    return kaplan_meier(observations)   # with bands
```

**Comparison (harness A vs B).** Use the log-rank test on the two survival curves (compares the *whole* curve, not two endpoints) and report the survival difference at key horizons with intervals. Never compare two point pass-rates and call it a reliability comparison — that discards the horizon dependence that is the entire signal. Use paired/matched task families (Chapter 1) to reduce variance.

## 7. Trade-offs

- **Survival curve vs point pass-rate.** The curve is vastly more informative (shape, hazard, where runs die) but costs more runs (to estimate a curve with bands) and more instrumentation (event detection at every step). A point pass-rate is cheap and nearly uninformative for long runs. For any serious long-horizon system the curve is worth it; the point rate is a demo metric.
- **Sample size vs cost.** Long runs are expensive; a tight survival curve needs many. [MAR]'s ~20 suffices for *big* effects (is harness B clearly better?), but *small* improvements and *tight bands* need many more — and at long horizons that is real money. Resolution: use ~20 to detect big effects and screen; invest in larger $n$ only where the decision needs a small-effect resolution. Report the zero-failure bound honestly when $n$ is small.
- **Event-definition strictness vs measurability.** The correct event (first *unrecoverable* error) requires the recovery classifier (Topic 11) to be reliable — a mis-tagged recoverable error becomes a false event (pessimistic), a mis-tagged unrecoverable-as-recovered hides a real death (optimistic). Simpler definitions (any error = failure) are easier to detect but measure the wrong thing. The strict definition is correct but couples the metric's validity to Topic 11's classifier quality.
- **Automated vs human event detection.** Automated detection scales but has blind spots — [MAR]: humans catch hallucinated "successes" evals miss. A run that *falsely* succeeded (Topic 12 false completion that slipped past the verifier) is counted as censored-success, inflating survival. Periodic human audit of "successful" runs is the check; it costs human time but catches the mismeasurement that most flatters the system.
- **Aggregation vs stratification.** Aggregating survival over mixed task difficulties gives one curve but confounds (Chapter 1: aggregating over different mixtures is "not statistically valid"). Stratifying by task family gives valid but more numerous curves. Stratify; a single aggregate survival curve over a heterogeneous task mix is a misleading average.

## 8. Experiments: baselines, ablations, metrics

**E1 — Baseline survival curve.** Instrument a task family at a long horizon; estimate $\hat S(k)$ [KM] with bands, median survival, and hazard. **Deliverable:** the reliability trajectory the chapter has been building toward — a curve, not a number. Read the hazard shape to locate failures (early → setup; rising late → decay/last-mile).
**E2 — Harness-ablation survival (the payoff experiment).** Compare survival with vs without each major mechanism: verified stop (Topic 12), independent verifier (Topic 14), re-anchoring (Topic 2), checkpointing (Topic 8). **Prediction:** verified stop and re-anchoring raise the whole curve (fewer unrecoverable deaths from false completion / drift); checkpointing converts P2 crashes from events to censored-survivals (raises survival by removing a death class). Metric: log-rank test per ablation; survival difference at key horizons. *This is how you prove a harness component earns its place* — and feeds Chapter 15's harness GC.
**E3 — Horizon dependence.** Estimate survival at increasing horizon budgets; confirm the failure rate grows with horizon (the chapter's premise; CompWoB analogue). **Prediction:** median survival is finite and the curve decays — quantifying eval-blindness (Topic 2): the same agent that "passes" at short horizon has a survival curve that reveals its long-horizon failure rate.
**E4 — Hazard diagnosis.** Fit the hazard shape and trace each hazard peak to its cause (P1/P2/P3, which horizon failure). **Prediction:** an early hazard from setup/decomposition; a rising late hazard from decay/false-completion ("last mile"). Metric: cause-attributed hazard — turns the survival curve into an *action* (which topic to invest in).

**Honest status.** The tools (KM, hazard, log-rank, zero-failure bound) are standard and grounded in Chapter 1's protocol. The *premise* (reliability decays with horizon) is grounded (CompWoB, [MAR] last-mile). **But no agent source publishes any of E1–E4 for a long-running agent** — there is no published survival curve, no time-to-first-unrecoverable-error, no hazard for these systems. [MAR] gives the last-mile *qualitative* claim and the ~20-query scale; that is the extent of long-horizon reliability *measurement* in the sources. This topic hands the reader the correct instrument and the honest interpretation; producing the curves is the rigorous team's job and is, to the author's knowledge, largely undone in the public literature. The chapter ends where honest measurement must: *here is how to measure it; the field has mostly not.*

## 9. Failure modes, edge cases, hazards, limitations

- **Counting recovered errors as failures (the dominant mismeasurement).** Treating every crash/transient as a run failure measures infrastructure flakiness, not run reliability, and *penalizes* a well-recovering harness. Mitigation: event = first *unrecoverable* error (Topic 11); recovered errors are non-events.
- **Mishandling censoring.** Dropping censored (successful/stopped) runs, or counting them as failures at their stop point, biases the estimate. Mitigation: Kaplan–Meier [KM]; censored runs contribute "survived at least this far."
- **"100% reliable" from zero failures.** Reporting a small clean sample as perfect. Mitigation: zero-failure bound $p_{\max}$; $n=20$ clean runs bounds failure at ~14% (95%), not 0.
- **False success inflates survival (the insidious one).** A false completion (Topic 12) that slipped past the verifier (Topic 14) is counted as censored-success, so the survival curve *over-states* reliability — the metric is fooled by the exact failure the chapter most warns about. Mitigation: audit "successful" runs (human, [MAR]); a survival curve is only as honest as its success detection.
- **Aggregating heterogeneous tasks.** One survival curve over mixed difficulties is a misleading average (Chapter 1). Mitigation: stratify by task family.
- **Point-in-time comparison.** Comparing two harnesses at one horizon misses that one may dominate early and the other late. Mitigation: compare *curves* (log-rank), report differences across horizons.
- **Edge case: continuous / unbounded tasks.** Some long-running agents have no natural "success" (a monitoring agent that runs indefinitely). Survival still applies (time-to-first-unrecoverable-error), but "success" censoring is replaced by "still running" censoring, and the relevant metric is mean-time-between-unrecoverable-errors, not median survival. The framework adapts; the summary statistic changes.
- **Limitation.** Survival analysis quantifies *when runs die*, not *why* — the cause attribution (E4) is a *correlation* between hazard peaks and tagged causes, not a controlled proof. Establishing that decay (not something co-occurring) *causes* the late hazard needs the ablations (E2) and the per-pressure experiments (Topics 1, 2, 14), not the survival curve alone. The curve is the *symptom map*; the ablations are the *diagnosis*.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Reliability decays with horizon (CompWoB 94.0 → 24.9%; multiplicative error) — reliability is a *curve*, not a point (Chapter 1).
- Long agent tasks fail disproportionately near the end — "the last mile is most of the journey" [MAR].
- ~20 runs suffice for *big* reliability effects; humans catch false successes automated evals miss [MAR].
- Kaplan–Meier with censoring, Wilson intervals, and the zero-failure bound are the correct tools (Chapter 1 protocol). **No agent source publishes a long-horizon survival curve** — the measurement gap is real and honestly stated.

**Decision rules.**
- **DR-1.** Measure long-run reliability as a *survival curve* over horizon, not an end-point pass rate. The event is the *first unrecoverable error* (Topic 11) — recovered crashes/transients are not events.
- **DR-2.** Handle censoring with Kaplan–Meier [KM]: successful and externally-stopped runs are censored, not failures and not dropped. Report confidence bands; never report "100%" from zero failures — use $p_{\max}$.
- **DR-3.** Read the *hazard* to locate failures in the horizon and trace them to a pressure (P1–P3) / horizon failure (Topic 2): early hazard → invest in decomposition/initializer (Topics 3–4); rising late hazard → invest in decay/verification/verified-stop (Topics 7, 12, 14).
- **DR-4.** Compare harnesses by *survival curves* (log-rank), not two point rates. Audit "successful" runs for false completion (a false success inflates survival). Stratify by task family; never aggregate over mixed difficulties.

**Production implications.** The survival curve is what turns the entire chapter from a set of practices into a *measured* engineering discipline. It is the instrument that (a) proves a harness component earns its place (E2 ablation — the input to Chapter 15's harness GC), (b) reveals *where* your runs die so you invest in the right topic (E4 hazard), and (c) states reliability with the honesty long horizons demand (censoring, confidence bands, zero-failure bounds). The uncomfortable production truth this topic ends on: **the field has built elaborate long-running-agent architectures and measured their reliability almost not at all.** The sources describe initializer/worker splits, ledgers, compaction, recovery, and verification in rich detail — and publish no survival curves, no time-to-first-unrecoverable-error, no hazard. A team that produces these curves for its own system knows something almost no one has published: *how far its agent actually gets before it dies, and why.* That knowledge — not a bigger model, not a bigger window (Topic 1) — is what long-horizon reliability engineering is made of.

**Connections.** This topic measures the whole chapter: the event is Topic 11's unrecoverable failure; success is Topic 12's verified stop; the mechanisms whose value it quantifies (E2) are Topics 2, 8, 12, 14; the hazard's causes are Topic 1's P1–P3 and Topic 2's horizon failures; the "last mile" is [MAR] (Chapter 9). The statistical protocol is Chapter 1 Topic 12 ([KM], [WILSON], zero-failure bound). General evaluation science is Chapter 13; production reliability SLOs and dashboards are Chapter 14; the harness-GC decision the ablation feeds is Chapter 15. This closes Chapter 10 and Part III: the orchestration and long-horizon machinery is built (Chapters 8–10) and now *measurable*.

### Sources
- **[MAR]** Anthropic — *Multi-agent research system* ("the last mile is most of the journey"; end-state evaluation; ~20 queries enough for big effects; humans catch hallucinated answers evals miss). Via Chapter 9.
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (recover working base states — recoverable ≠ unrecoverable).
- **[HDA]** Anthropic — *Harness design for long-running apps* (single-build cost/time figures — anecdotes, not a survival distribution).
- Statistical protocol (Chapter 1 Topic 12): [KM] Kaplan–Meier with censoring; [WILSON] Wilson score interval; zero-failure bound $p_{\max}=1-(1-\gamma)^{1/n}$; log-rank test (standard survival analysis, **[derived]** application to agents).
- Internal: Chapter 1 Topics 8/12 (multiplicative error, CompWoB, statistical protocol), Chapter 9 [MAR] (last mile, end-state eval), this chapter Topics 1 (P1–P3), 2 (horizon failures, eval-blindness), 8 (checkpoint converts crash to non-event), 11 (recoverable vs unrecoverable — the event definition), 12 (verified stop = censored-success), 14 (decay → late hazard); Chapter 13 (general eval science), Chapter 14 (production SLOs), Chapter 15 (harness GC).
