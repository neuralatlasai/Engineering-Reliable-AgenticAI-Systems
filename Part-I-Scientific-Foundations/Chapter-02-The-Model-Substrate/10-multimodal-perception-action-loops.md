# Topic 10 — Multimodal Perception–Action Loops: Text, Image, Audio, Browser, Desktop, and Robotics

## 1. Problem and objective

An agent acts on an environment through observation and action channels. Text files, DOM trees, screenshots, audio streams and robot sensors expose different state variables with different latency, ambiguity, bandwidth and failure semantics. None is universally “higher fidelity”: a DOM tree can expose element identity while omitting visual occlusion; a screenshot can reveal layout while hiding program state; a file read can be exact for returned bytes while still being stale, truncated or only a small part of the environment.

The objective is to model these channels without assuming independent error rates or a universal modality ladder, then derive engineering rules for cross-modal state, verification, timing, privacy and safe action grounding.

## 2. Intuition first

A model clicking coordinates can execute the requested click perfectly and still act on the wrong control. A shell command can target the wrong file with equally perfect syntax. The modalities differ not in whether errors exist, but in where identity and state are represented and how cheaply the result can be checked.

For expert readers, the useful abstraction is therefore not “pixels are noisy, text is exact.” It is: **what state does this channel reveal, what aliases remain, how old is the observation, how is intent grounded to an effect, and which independent sensor confirms the result?**

## 3. Observation and action channels by modality

### 3.1 Text, code, and structured APIs

A file or API response can preserve returned symbols exactly. It does not expose the complete environment: results can be stale, paginated, truncated, permission-filtered or inconsistent with concurrent updates. Symbolic actions also require grounding—paths, identifiers, versions and resource ownership can be wrong even when schemas are valid.

The advantage is **machine-addressable identity** and strong potential oracles: parsers, type checkers, tests, checksums and transactional responses. Code is executable, inspectable and stateful [CAH §1–2], but those properties must be instrumented rather than assumed.

### 3.2 DOM, accessibility and application structure

DOM and accessibility trees provide stable element roles and identifiers when applications expose them correctly. They may omit canvas content, visual stacking, transient state, anti-bot interstitials or controls implemented outside the accessibility model. Structured representations and screenshots are complementary sensors, not a strict hierarchy.

### 3.3 Rendered images and desktop interaction

Screenshots expose visual appearance at a particular time, resolution, viewport and scale. Perception must infer objects and state; grounding must map intended semantics to an element or coordinate. Occlusion, animation, scrolling, localization, DPI scaling and delayed rendering create observation aliasing. Re-observation can detect some errors, but only if the confirmation criterion differs from the original uncertain perception.

### 3.4 Audio and real-time interaction

Audio introduces sampling, transcription, speaker attribution, turn detection, background noise and timing constraints. Captured audio can be buffered, replayed and retranscribed; only uncaptured streams are intrinsically unavailable for reinspection. A reliable loop retains the permitted evidence artifact, aligns transcript spans with timestamps and speakers, and accounts for privacy and retention requirements.

### 3.5 Embodied and robotic systems

Embodied systems add sensor fusion, coordinate frames, actuator dynamics, control delay and physical safety. High-level model decisions must not replace hard real-time control, collision avoidance or emergency stops. Learned policies propose goals or bounded skills; independently engineered controllers and interlocks enforce safety envelopes. Detailed robotics control remains outside this book’s scope, but the boundary is essential.

## 4. Formal model

For task specification $\mathcal Q$, let $M$ be the number of observation modalities, $x_t^{(m)}$ the raw observation from modality $m$, and $h_t$ the synchronized observable history. Let $y_t^{\mathrm{act}}$ be the model's intended-action proposal, $\widetilde a_t$ the grounded and admitted action, and $a_t$ the executed action. A single-agent specialization of Chapter 1's model is

$$
x_t^{(m)}
\sim
\Omega_m(\cdot\mid s_t,a_{t-1},\delta_t^{(m)},\nu_t^{(m)},\mathcal Q),
$$

$$
\varphi_t
\sim
F_R(\cdot\mid x_t^{(1:M)},h_t,\mathcal Q),
$$

$$
\widetilde a_t
\sim
G_{m_a}(\cdot\mid y_t^{\mathrm{act}},\varphi_t,\mathcal Q),
$$

$$
a_t=\operatorname{Exec}(\widetilde a_t),
\qquad
s_{t+1}\sim \Psi(\cdot\mid s_t,a_t,\mathcal Q),
$$

Here $s_t$ is latent environment state; $\delta_t^{(m)}$ is observation delay; $\nu_t^{(m)}$ collects channel conditions such as truncation, viewport, resolution, or noise; $F_R$ is the fusion/representation kernel; $m_a$ identifies the selected action interface; $G_{m_a}$ is its grounding-and-admission kernel; and $\Psi$ is the task-conditioned environment transition kernel. At $t=0$, use the initialization sentinel $a_{-1}=a_\varnothing$ from Chapter 1. Multiple modalities may observe overlapping but non-identical state.

If step success requires correct perception $P_t$, decision $D_t$, grounding $G_t$ and effect $E_t$, the exact chain rule is

$$
\Pr(P_t,D_t,G_t,E_t)
=\Pr(P_t)
\Pr(D_t\mid P_t)
\Pr(G_t\mid P_t,D_t)
\Pr(E_t\mid P_t,D_t,G_t).
$$

This is a diagnostic factorization, not an independence claim. The factors are state- and task-dependent. Text/code does not set perception or grounding error to zero, and a GUI benchmark delta cannot identify any one factor without a controlled ablation.

### Observation aliasing

Aliasing is defined only relative to channel conditions. For fixed task $\mathcal Q$, previous action $a^{-}$, delay $\delta$, and channel condition $\nu$, two states are aliased under modality $m$ if they induce the same observation distribution:

$$
s\sim_{m;a^{-},\delta,\nu,\mathcal Q} s'
\quad\Longleftrightarrow\quad
\Omega_m(\cdot\mid s,a^{-},\delta,\nu,\mathcal Q)
=\Omega_m(\cdot\mid s',a^{-},\delta,\nu,\mathcal Q).
$$

If delay and channel conditions are random, define aliasing after marginalizing both sides under the same declared channel protocol. Adding a complementary modality is valuable when it separates equivalence classes relevant to the decision. More pixels or more tokens are not useful if they preserve the same aliasing.

## 5. What the benchmark evidence does and does not show

- **CompWoB** demonstrates severe degradation under composed web tasks and sensitivity to instruction order [CompWoB]. Because planning, context, horizon, state coupling and interface behavior change together, it does not isolate visual perception or grounding as the causal mechanism.
- **ALE** evaluates professional tasks combining GUI, CLI, code and domain tools [ALE §1]. Its low hard-tier scores show that the evaluated configurations struggle on that task distribution. Comparisons with narrower benchmarks are unmatched in task mix, evaluator, environment, and horizon, so they neither identify a standalone “modality tax” nor prove which structural variable caused the gap.
- **OSWorld and WebArena** provide task environments for computer and web agents [OSWORLD; WEBARENA]. Their results are configuration- and benchmark-specific; transfer to a production UI requires matched state, permissions and timing.
- **System-card computer-use evaluations** establish that overeager action is measurable [FSC §6.3.7]. They do not supply a general rate for every rendered environment.

The correct scientific conclusion is that modality and interface are important task variables requiring controlled ablation—not that one aggregate benchmark gap identifies their causal effect.

## 6. Architecture: a synchronized cross-modal loop

~~~text
1. Choose the least ambiguous authorized interface for the current operation.
2. Capture observation artifacts with timestamp, source, viewport/version and provenance.
3. Fuse only state that can be temporally aligned; preserve conflicts explicitly.
4. Bind intent to a stable resource or element identity where possible.
5. Revalidate preconditions immediately before an effectful action.
6. Execute through an authority- and consequence-aware gate.
7. Observe an independent postcondition or reconciliation signal.
8. Commit the state update, or rollback/compensate and escalate.
~~~

For rendered interfaces, store the screenshot or permitted derived artifact plus the grounded target. For structured interfaces, store identifiers, versions and returned state. Evidence capture must follow data-minimization rules: screenshots and audio can contain secrets, personal data and unrelated content.

## 7. Measurement methodology

Evaluate the full configuration on matched tasks while ablating one channel property at a time:

1. **Perception:** compare inferred state with labeled or instrumented ground truth; report precision, recall and localization error by state type.
2. **Grounding:** measure intended-target accuracy, not merely whether an input event was delivered.
3. **Effect:** verify postconditions independently of the perception used to choose the action.
4. **Timing:** report observation age, action latency and failure rate as a function of delay.
5. **Fusion:** ablate DOM-only, screenshot-only and fused inputs on the same tasks.
6. **Cross-modal handoff:** measure state-loss and contradiction rates at GUI↔CLI or audio↔text transitions.
7. **Robustness:** perturb resolution, locale, theme, noise, layout, loading time, occlusion and concurrent updates.
8. **Safety:** stratify by reversibility and consequence; report human takeover and blocked-action quality.

Use repeated runs and task-cluster confidence intervals. A modality comparison with different tasks, models or authority profiles is descriptive, not causal.

## 8. Failure modes

- **Observation aliasing:** different environment states look identical through the chosen channel.
- **Temporal misalignment:** fused observations describe different moments.
- **Stale symbolic state:** an exact response is treated as current after the environment changes.
- **Grounding slip:** the intended action is mapped to the wrong element, coordinate, path or identifier.
- **False confirmation:** post-action checking repeats the same perception error.
- **Rung-switch state loss:** one interface assumes state that another never observed.
- **Overeager action:** execution begins before loading, identity or preconditions stabilize.
- **Coordinate-frame error:** browser, screen, image and device coordinates are confused.
- **Privacy-heavy observability:** evidence capture stores sensitive screenshots or audio without minimization.
- **Unsafe real-time delegation:** a high-latency generative policy is placed in a hard control loop.

## 9. Limitations

- The factorization localizes error classes but does not make them independently identifiable; controlled interventions are needed.
- Ground-truth perception labels are expensive and can omit application semantics.
- DOM and accessibility access may change the task relative to human-only interaction; report the available interface explicitly.
- Production browser state includes authentication, personalization, anti-bot behavior and live drift that sandbox benchmarks may suppress.
- Robotics requires control-theoretic and safety-engineering treatment beyond this chapter.

## 10. Production implications and connections

1. Select interfaces by task-conditioned ambiguity, authority and verification—not a universal modality ranking.
2. Prefer stable identifiers and structured state when they preserve the required semantics; retain rendered evidence when visual state matters.
3. Timestamp and version every observation used for an effectful decision.
4. Verify through an independent postcondition and measure verifier coverage.
5. Treat cross-modal transitions as typed interfaces with explicit state contracts.
6. Minimize, redact and govern stored perception artifacts.
7. Keep hard real-time safety outside the generative policy.

This topic specializes Chapter 1’s partial-observability model. Chapter 6 owns context cost, Chapter 11 owns computer-use implementations, Chapter 12 owns observation-channel security and Chapter 13 owns modality-matched evaluation.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (Knowledge_source/2605.18747v1.pdf) §1–2
[ALE] Agents’ Last Exam, arXiv:2606.05405 (Knowledge_source/2606.05405v2.pdf) §1
[CompWoB] Furuta et al., “Exposing Limitations of Language Model Agents in Sequential-Task Compositions on the Web,” TMLR — https://arxiv.org/abs/2311.18751
[FSC] Claude Fable 5 & Mythos 5 System Card (Knowledge_source/Claude Fable 5 & Claude Mythos 5 System Card.pdf) §6.3.7
[HB] Harness-Bench, arXiv:2605.27922 (Knowledge_source/2605.27922v1.pdf) §3.2
[OSWORLD] Xie et al., “OSWorld: Benchmarking Multimodal Agents for Open-Ended Tasks in Real Computer Environments” — https://arxiv.org/abs/2404.07972
[WEBARENA] Zhou et al., “WebArena: A Realistic Web Environment for Building Autonomous Agents” — https://arxiv.org/abs/2307.13854
