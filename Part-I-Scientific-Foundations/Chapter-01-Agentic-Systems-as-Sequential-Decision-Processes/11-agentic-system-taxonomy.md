# Topic 11 — Agentic-System Taxonomy: Conversational, Transactional, Coding, Research, Browser, and Embodied Agents

## 1. Problem and objective

The chapter's machinery so far is class-agnostic; deployed agents are not. A coding agent and a browser agent can differ systematically in observation space, action space, verification instruments, reversibility, and consequence. The objective here is a taxonomy of six useful engineering classes, each profiled along the chapter's axes (Topics 3, 5, 6).

**Epistemic status.** The classes and profile table are design hypotheses, not measured natural kinds or a validated reliability ranking. In particular, the chapter hypothesizes that oracle quality and observability are important effect modifiers. It does not claim they matter more than model, harness, task distribution, or authority without a matched factorial study.

## 2. Intuition first, and where the classes come from

The sources organize the field convergently. The Code-as-Agent-Harness survey's application map: code assistants, GUI/OS agents, scientific discovery, personalization/recommendation, embodied agents, DevOps and enterprise workflows [CAH §1, Fig. 1]. Harness-Bench's eight workflow categories: software engineering & codebase maintenance (22 tasks — the largest), data/BI & finance analytics, workspace/tool use & multimodal operations, knowledge/evidence & retrieval, office & business communication, vertical professional workflows, long-running autonomy & state adaptation, SRE/DevOps & release ops [HB Fig. 2]. ALE targets the *Generalist Computer-Use Agent* (GCUA) — "such as Claude Code or Codex" — combining "visual perception, code execution, tool use, and long-horizon planning within a single action loop," across 13 industry domains [ALE §1]. The six-class scheme below is the intersection of these organizations with the README's frame; it is a practical partition, and real systems compose classes (the GCUA is by definition a composite).

The intuition to carry is diagnostic: ask what observations, validators, rollback mechanisms, and consequence boundaries the environment supplies. A repository may provide tests, although tests can be incomplete or wrong. A browser may expose DOM or accessibility structure, but live state can drift. A conversation may rely on delayed or subjective human feedback. These properties change the attainable detection and recovery performance; they do not determine it alone.

## 3. The taxonomy

### 3.1 Conversational agents

Dialogue systems with tool access; the action space is often dominated by language actions with intermittent tool calls [MEM §2.1 types 1–2]. The user's messages are observations of intent, not the full environment. Verification may be subjective or delayed, although grounded conversational tasks can have strong external checks. Authority ranges from advisory to effectful, so neither horizon nor failure cost is fixed by the class label. Persistent memory can propagate unsupported user or model claims [MEM §4.1].

### 3.2 Transactional agents

Agents executing state-changing operations against business systems—orders, tickets, records, or communications; Harness-Bench's office and vertical-workflow categories include examples [HB Fig. 2]. Some systems provide a draft or approval phase; others commit directly. The important variables are commit semantics, idempotency, approval topology, compensation, and external-effect reconciliation. Schemas and business rules can improve detection before commit, but they do not validate user intent or every downstream consequence.

### 3.3 Coding agents

Coding is comparatively instrumentable because code can be executable, inspectable, and stateful [CAH §1]. Repositories may supply compilers, type checkers, tests, traces, and version control, but their coverage and rollback scope must be measured. External deployments, generated migrations, credentials, and flaky tests break the simple “repository as oracle” picture. Agents can also create tests and tools as artifacts [CAH §1], which adds both verification capacity and the risk of self-authored, correlated checks. System cards document false completion, fabricated testing claims, and review-evasion examples in coding settings [FSC §2.3.3; G56 §1]; those examples establish failure modes, not class-level prevalence.

### 3.4 Research agents

Query decomposition, multi-source retrieval, and evidence synthesis; Harness-Bench includes a knowledge, evidence, and retrieval category [HB Fig. 2]. Documents and search results have heterogeneous provenance and can carry adversarial content. Citation checking is useful but does not establish completeness, entailment, or source independence. Research agents can also take operational actions, so “epistemic rather than operational” is a deployment choice, not a class invariant.

### 3.5 Browser and computer-use agents

GUI perception–action loops consume screenshots, DOM data, or accessibility trees and emit clicks, keystrokes, or structured interface actions [CAH Fig. 1]. ALE's GCUA tasks interleave GUI and CLI operations [ALE §1]. CompWoB's base-to-composition degradation is evidence from a web environment [CompWoB], but it does not isolate visual grounding, observability, branching, or live-web drift as causes. Those are testable hypotheses. Structured accessibility observations and deterministic post-action checks can materially change the profile, so “browser agent” is too broad to assign one reliability level.

### 3.6 Embodied agents

Programs as executable policies for physical or simulated worlds [CAH §1]. The environment may include stochastic dynamics, partial sensing, real-time constraints, and effects that are expensive or impossible to reverse. Some embodied tasks are low consequence and highly observable; others are safety critical. Simulation-to-real transfer is one possible distribution shift, not a universal scalar gap. Per the chapter's exclusion (Topic 0 §6), this row is included for boundary completeness rather than as a robotics reliability survey.

## 4. The profile table

| Class | Observation pattern | Potential verifier | Reversibility pattern | Frequent concern |
|---|---|---|---|---|
| Conversational | Text plus inferred intent | Human feedback, grounded tools, domain checks | Often advisory; can be effectful | Subjective success; memory contamination |
| Transactional | Structured business state | Schemas, business rules, reconciliation | Frequently limited after commit | Idempotency; approval; compensation |
| Coding | Files, traces, test output | Tests, compilers, static analysis | Often good inside VCS; weaker externally | Validator coverage; self-authored checks |
| Research | Heterogeneous documents and search results | Citation, entailment, source-diversity checks | Usually high for drafts | Provenance; completeness |
| Browser/computer-use | Pixels, DOM, accessibility state | Post-action state checks, task-specific oracles | Environment dependent | Perception, grounding, drift |
| Embodied | Sensors and world state | Simulation, monitors, physical interlocks | Task dependent; sometimes low | Real-time control; physical consequence |

**Hypothesis for evaluation.** Holding model, harness, task distribution, and authority fixed, stronger independent validators and more informative observations should reduce undetected failures and improve recovery. This follows from Topic 8's definitions, but the effect size and interactions must be measured; the model is not assumed to be a second-order term.

## 5. Composite systems and the taxonomy's use

The GCUA combines coding, computer-use, and retrieval behaviors in one loop [ALE §1]. Composite reliability is not the minimum of constituent scores: interfaces can amplify, mask, or mitigate failures, and end-to-end success depends on conditional hazards. Use the taxonomy to identify interfaces—GUI-to-CLI state transfer, retrieval-to-action provenance, or code-to-deployment authority—and evaluate those transitions directly. Worst-case reasoning is appropriate for hard safety constraints, but it is not an estimator of average performance.

## 6. Failure modes of taxonomy misuse

- **Class-blind benchmarking:** quoting a coding-agent score to justify a browser-agent deployment; Topic 7's distribution error with a taxonomy label on it.
- **Oracle transplant fantasies:** “we'll just add tests” to a class without executable ground truth; research and conversational agents cannot import coding-specific validators, and judged checks have different failure modes.
- **Reversibility assumptions crossing classes:** the coding habit ("commit, revert if wrong") applied to transactional actions; there is no `git revert` for a sent email.
- **Composite scored as its best constituent:** §5's error, in evaluation form.

## 7. Limitations

- Six classes is a chapter-scale resolution; Harness-Bench's eight categories and ALE's 55 subdomains [HB Fig. 2; ALE §2.2] show finer structure, and vertical workflows (legal, clinical, finance) have within-class variance this taxonomy compresses.
- The profile table's cells are qualitative syntheses of sourced properties, not measured constants; per-cell measurement is exactly what class-matched task profiling (Topic 6 §6) produces for *your* deployment.
- The class boundaries are already dissolving in the GCUA direction [ALE §1]; the taxonomy's durable content is the *axes*, not the partition — if the classes merge, the per-axis analysis is what survives.

## 8. Production implications

1. **Declare the class hypotheses in the design document** and decompose composites at their interfaces before selecting controls.
2. **Use the class profile to choose the first measurements and ablations.** Observation/grounding for browser agents, provenance for research agents, and compensation logic for transactional agents are defensible starting hypotheses—not a universal investment order. Reverse that order when class-matched evidence identifies a different bottleneck.
3. **Match the evaluation to observable outcomes:** use deterministic validators where valid, human or model judges where necessary, and report agreement and uncertainty [HB §3.2, §4.1].
4. **Let consequence and measured detection set authority:** a class label or the presence of tests does not by itself justify wider autonomy.

## 9. Connections

- The table's columns *are* Topics 3, 6, and 8 — the taxonomy is the chapter's machinery applied classwise.
- Chapter 5 engineers per-class action surfaces; Chapter 6 owns research-class retrieval; Chapter 11 is classes 3.3–3.5 in full depth; Chapter 12's threat models are class-indexed (injection for research/browser, authority for transactional).
- Topic 12, next, fixes the notation and measurement standards that make cross-class comparison honest.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §1, Fig. 1
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §2, §3.2, §3.4, Fig. 2
[ALE] Agents' Last Exam, arXiv:2606.05405 (`Knowledge_source/2606.05405v2.pdf`) §1, §2.2
[CompWoB] Furuta et al., TMLR — https://deepmind.google/research/publications/46840/
[MEM] Memory survey, arXiv:2512.13564 (`Knowledge_source/2512.13564v2.pdf`) §2.1, §4.1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §2.3.3
[G56] GPT-5.6 Preview System Card (`Knowledge_source/gpt-5-6-preview.pdf`) §1
