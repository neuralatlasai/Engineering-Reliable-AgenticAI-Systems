# Topic 10 — Multimodal Perception–Action Loops: Text, Image, Audio, Browser, Desktop, and Robotics

## 1. Problem and objective

Everything in this chapter so far assumed the model's observations arrive as text. Real deployed agents increasingly perceive rendered screens, images, and (in the embodied limit) sensor streams, and act through GUIs, desktops, and actuators. Each added modality changes the perception–action loop's error structure — not incrementally but structurally, because it changes what "observation" costs, how it can be wrong, and whether action grounding can be verified. The objective is to characterize the loop per modality with the sources' own framings, establish the central asymmetry (text/code observations are checkable in ways pixel observations are not), and state the engineering rules for systems that must cross modalities — which, per the benchmark evidence, is exactly where current agents break.

## 2. Intuition first

A text-tool agent reading a file gets the file — the observation *is* the state, byte for byte. A browser agent looking at a screenshot gets a *rendering* of the state, which it must re-perceive into structure: that button, at those coordinates, probably submits the form. Perception has become inference, and inference can be wrong before any decision is made. Acting inherits the same downgrade: a `write_file` call either succeeds or errors; a click at (412, 305) silently succeeds *at clicking* regardless of whether it hit the intended control. The loop still runs — observe, decide, act — but both endpoints have acquired noise floors, and nothing in the middle can be better than its endpoints.

## 3. The modality ladder

Ordered by observation fidelity and action verifiability — the two properties that Chapter 1's Topics 3 and 6 identified as reliability-controlling:

**Text and code.** The privileged rung, and the Code-as-Agent-Harness survey says why with precision: code is "*executable*, meaning model outputs become operations with formally verifiable outcomes; *inspectable*, meaning intermediate computation is exposed as structured traces...; and *stateful*, meaning the evolving program represents task progress in a persistent, modifiable form" [CAH §2]. Observations are lossless; actions carry native oracles.

**Structured GUI representations.** GUI/OS agents that perceive DOM trees and accessibility APIs rather than pixels: "agents synthesize and execute interface commands grounded in DOM trees, accessibility APIs, and executable evaluators" [CAH §4-app / Fig. 1: DOM state, visual grounding, UI memory, execute checks]. Halfway house: structure without executability — the DOM says what exists, not what the app will do.

**Rendered perception (screenshots).** The vision-mediated loop: perceive pixels, ground intent to coordinates or elements, act, re-perceive to confirm. Every step is model inference; the grounding step ("which pixels are the submit button") is a recognized failure locus — Chapter 1's taxonomy row for computer-use agents (coordinate uncertainty, state verification, visual grounding) exists because of it.

**Audio and realtime.** Present in the interaction surface of modern APIs but thinly evidenced in this ledger for *agentic* loops; noted as a modality whose agent-loop properties (latency floors, no re-read — you cannot re-observe an utterance) the sources do not measure. **[gap noted]**

**Embodied/robotics.** Programs as executable policies "for interacting with physical or simulated worlds" [CAH §1]; skill libraries, affordance grounding, simulator feedback [CAH Fig. 1]. The ladder's bottom rung on both axes: perception is sensors, action is physics, no undo. Chapter 1 Topic 11 §3.6's exclusions apply; the class appears here as the limiting case that makes the ladder's logic vivid.

## 4. The evidence: crossing modalities is where agents currently fail

The chapter's opening benchmarks are, on inspection, modality results:

- **CompWoB is a web-perception result.** The composition collapse (94.0% → 24.9% prompted; instruction-order sensitivity) [CompWoB] occurred in web automation — the modality where observations are DOM/rendered state and actions are UI operations. The base tasks were solved; composition across a stateful *perceived* environment is what broke.
- **ALE is a modality-union result.** Its target is the Generalist Computer-Use Agent, which "combines visual perception, code execution, tool use, and long-horizon planning within a single action loop"; its task surface is "by construction, a superset of GUI-only benchmarks like OSWorld and CLI-only benchmarks like Terminal-Bench," with most tasks demanding "computer use that interleaves GUI interaction (desktop applications, browsers, domain-specific software) with CLI operations... requiring the union of capabilities that existing benchmarks test in isolation" [ALE §1]. The result: the configuration that scores 82% on the CLI-only benchmark scores <50% on ALE's easiest tier and <10% on its hardest [ALE §1]. Same models. The delta is substantially the price of leaving the text rung — and of *switching rungs mid-task*, where each interleave point (GUI result consumed by CLI step, and back) compounds both modalities' noise floors.
- **The over-action failure has a modality signature too:** the system card's targeted evaluations include "overeager behavior in GUI computer use" as its own category [FSC §6.3.7 heading] — acting-before-verifying is distinct enough in rendered environments to earn a dedicated evaluation.

## 5. Formalization: what a modality does to the loop

In Chapter 1 Topic 2's terms, a modality fixes the observation function O and the action interface into Ψ. Define per-modality: ε_percep (probability the perceived structure mismatches actual state) and ε_ground (probability an intended action lands on the wrong target). Then the per-step success from Chapter 1 Topic 8 decomposes as **[derived — decomposition ours]**:

```
p_step ≈ (1 − ε_percep) · p_decide · (1 − ε_ground) · p_effect
```

Text/code sets ε_percep ≈ ε_ground ≈ 0, which is *why* its agents are the reliability leaders (Chapter 1 Topic 11 §4's regularity). Rendered modalities buy nonzero ε at both ends, and the multiplicative horizon mathematics then amplifies them: at ε_percep + ε_ground ≈ 0.05 per step, fifty steps cost you ~92% → ~8% survival from the modality taxes *alone*, before any decision error **[derived — illustrative arithmetic]**. The engineering programs that follow are all attacks on the two ε's:

- **Structure recovery:** prefer DOM/accessibility observation to pixels where obtainable [CAH Fig. 1] — moves ε_percep toward 0 by changing O, not the model.
- **Verification re-perception:** re-observe after acting ("execute checks" [CAH Fig. 1]); converts silent grounding failures into detected ones — the d-lever of Topic 1.8 §4 applied to ε_ground.
- **Modality escape:** route steps to the text/code rung whenever an equivalent exists (CLI instead of GUI for the same operation; APIs instead of clicking through screens). ALE's task construction documents that real workflows *interleave* rungs [ALE §1]; the design freedom is choosing the lowest-ε rung per step, and the GCUA framing makes that choice the agent's core competence rather than an afterthought.

## 6. Architecture: the cross-modal loop

```
per step:  choose rung (lowest-ε interface that can express the step)      — §5.3
           observe structurally if possible; render only if necessary       — §5.1
           act; re-perceive to confirm effect before consuming it           — §5.2
           log both the perception artifact (screenshot/DOM snapshot) and
           the grounded action target — the modality-specific run record
```

The last line extends Chapter 1 Topic 12 §3.2's evidence discipline: for rendered modalities, the *perception artifact itself* is evidence — without the screenshot the agent acted on, no post-hoc analysis can distinguish perception failure from decision failure. Sandboxing gets a modality note too: Harness-Bench's offline sandboxes deliberately exclude live-web complexity [HB §3.2], which suppresses exactly the drift and anti-bot dynamics that browser agents face in production (Chapter 1 Topic 11's browser row); rendered-modality benchmark numbers are therefore best-case bounds twice over.

## 7. Failure modes

- **Perception drift compounding:** ε_percep errors entering belief state (Chapter 1 Topic 3's mechanism 4, with a camera): the agent's world-model diverges from the screen it is looking at, confidently.
- **Grounding slip:** right decision, wrong target — the click lands, the wrong thing happens, and *no error is raised*; only re-perception catches it (§5.2).
- **Rung-switch state loss:** GUI state assumed by a CLI step (or vice versa) that the other interface cannot see; the interleave points [ALE §1] need explicit state handoff, not assumed continuity.
- **Overeager action in rendered environments** [FSC §6.3.7]: acting on a partially loaded or misread screen; the mitigation is the confirm-before-consume discipline, which costs a re-perception per effectful step and is worth it in exact proportion to Chapter 1 Topic 6's reversibility axis.
- **Benchmark transfer illusion:** CLI-rung scores quoted for GUI-rung deployments; the 82%-to-<10% spread [ALE §1] is the measured size of that illusion.
- **Screenshot-blind audit trails:** trace records that log actions but not the perceptions they were grounded on (§6) — the incident review's key question ("what did it see?") becomes unanswerable.

## 8. Limitations

- The ε-decomposition is illustrative structure **[derived]**; the sources do not publish per-modality ε measurements, and real perception/grounding errors are state-dependent, not i.i.d.
- Audio/realtime agentic loops are a genuine evidence gap in this ledger (§3.4); claims about them should await sources.
- The embodied rung is characterized here only as a limit; its own literature (excluded per Chapter 1 Topic 0 §6) has machinery — sim-to-real analysis, safety interlocks — that this book does not import.
- ALE's difficulty confounds modality with horizon and domain expertise [ALE §1]; §4.2's reading (modality as a major contributor) is the paper's own framing but not an isolated causal decomposition.

## 9. Production implications

1. **Choose the rung per step, and prefer descent:** every step that *can* run on text/code *should* — the modality tax is paid per step and compounds (§5).
2. **Buy structure before intelligence:** DOM/accessibility integration and API alternatives beat model upgrades for rendered-environment reliability; they attack ε at its source [CAH Fig. 1].
3. **Mandate re-perception after effectful rendered actions** — the confirm-before-consume loop (§5.2, §7.4), budgeted like any verification.
4. **Log perception artifacts as evidence** (§6); a rendered-modality trace without screenshots/DOM snapshots is not a trace.
5. **Match evaluation modality to deployment modality** (§7.5): a GUI product evaluated on CLI benchmarks has not been evaluated.
6. **Treat modality-crossing points as interfaces** with explicit state contracts (§7.3) — they are where ALE says real workflows live, and where the union-of-capabilities requirement bites [ALE §1].

## 10. Connections

- This topic closes the chapter's action-interface arc (Topics 5–7: emission; 6: scheduling; 9: placement; 10: modality) and feeds Topic 11's selection problem — model choice must weight the deployment's rung profile.
- Chapter 1 Topic 11's browser/computer-use row is this topic's taxonomy anchor; Chapter 11 develops browser and computer-use agents in full; Chapter 6 owns the context cost of perception artifacts; Chapter 13 owns modality-matched evaluation design.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1–2, Fig. 1
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.3.7
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.2
