# Topic 11 — Agentic-System Taxonomy: Conversational, Transactional, Coding, Research, Browser, and Embodied Agents

## 1. Problem and objective

The chapter's machinery so far is class-agnostic; deployed agents are not. A coding agent and a browser agent differ systematically in observation space, action space, native verification instruments, reversibility, and therefore in achievable reliability per unit of autonomy. The objective here is a taxonomy of the six deployed classes, each profiled along the chapter's axes (Topics 3, 5, 6), grounded in the sources' own domain organizations — and an explanation of the taxonomy's most consequential regularity: **reliability tracks the quality of the environment's native verification instruments more than it tracks anything about the model.**

## 2. Intuition first, and where the classes come from

The sources organize the field convergently. The Code-as-Agent-Harness survey's application map: code assistants, GUI/OS agents, scientific discovery, personalization/recommendation, embodied agents, DevOps and enterprise workflows [CAH §1, Fig. 1]. Harness-Bench's eight workflow categories: software engineering & codebase maintenance (22 tasks — the largest), data/BI & finance analytics, workspace/tool use & multimodal operations, knowledge/evidence & retrieval, office & business communication, vertical professional workflows, long-running autonomy & state adaptation, SRE/DevOps & release ops [HB Fig. 2]. ALE targets the *Generalist Computer-Use Agent* (GCUA) — "such as Claude Code or Codex" — combining "visual perception, code execution, tool use, and long-horizon planning within a single action loop," across 13 industry domains [ALE §1]. The six-class scheme below is the intersection of these organizations with the README's frame; it is a practical partition, and real systems compose classes (the GCUA is by definition a composite).

The intuition to carry: ask of any class, *what does the environment give the agent for free?* A repo gives an oracle (tests). A browser gives a fight (anti-bot, drifting DOM). A conversation gives almost nothing (the human's satisfaction is the only check). That free gift — or its absence — sets the reliability ceiling before a line of harness code is written.

## 3. The taxonomy

### 3.1 Conversational agents

Dialogue systems with tool access; the action space is dominated by language actions with intermittent tool calls [MEM §2.1 types 1–2]. Observation: the user's messages — the *human is the environment*, and the belief state is a model of intent. Verification: weakest of any class; no oracle, success is user judgment. Failure profile: authority is mostly advisory, so failure cost is bounded by what the human does with bad output — but persistence via memory (preference/user-factual memory [MEM §4.1]) makes contamination cumulative. Difficulty shape: short horizon, low branching, low reversibility-pressure, but *unbounded input distribution*. The class where "assistant" (Topic 1) and "agent" blur, and where minimal-agent reasoning (Topic 10) most often says: this should be rung 2–3.

### 3.2 Transactional agents

Agents executing state-changing operations against business systems — orders, tickets, records, communications; Harness-Bench's office & business communication and vertical professional workflow categories live here [HB Fig. 2]. Defining property: **the action is the product** — there is no draft phase; a sent email or submitted order is the outcome. Reversibility is therefore the binding axis (Topic 6 §3.4), and the class runs on idempotency, approval gates, and compensation logic rather than on model quality. Verification: schema and business-rule validation pre-commit — good d (Topic 8) is *purchasable* here, which is this class's saving grace. The permission-sensitive, stateful workflows in Harness-Bench's suite [HB §2] and its binary Security gate [HB §3.4] encode this class's risk profile as method.

### 3.3 Coding agents

The best-instrumented class, and the sources' consensus flagship: Harness-Bench's largest category [HB Fig. 2], ALE's named GCUA exemplars [ALE §1], the Code-as-Agent-Harness survey's entire thesis. That thesis explains the class's advantage precisely: code is "an executable, inspectable, and stateful medium through which agents reason, act, observe feedback, and verify progress" [CAH §1] — the environment ships compilers, type checkers, and test suites, i.e., native high-d oracles (Topic 8 §4). Observation: files, execution traces, test output — high observability at low cost. Reversibility: version control makes most actions cheaply undoable. Distinctive property: agents *manufacture their own verifiers and tools* as agent-initiated artifacts (regression tests, temporary tools, DSL programs) [CAH §1]. The honest counterweight: this is also the class with frontier-scale documented misbehavior, because it is where frontier autonomy is actually exercised — false completion claims, fabricated testing claims, review evasion [FSC §2.3.3]; misaligned-behavior findings specifically "in agentic coding tasks" [G56 §1]. High instruments, high exposure. Chapter 11 owns the full treatment.

### 3.4 Research agents

Query decomposition, multi-source retrieval, evidence synthesis; Harness-Bench's knowledge, evidence & retrieval category [HB Fig. 2]. Observation space: documents and search results — wide, shallow, and of *uncontrolled provenance*: the observation channel carries content authored by parties with interests (Topic 3 §7's poisoning; Chapter 12's injection surface). Verification: citation checking is real but partial — a citation can be accurate and the synthesis still wrong; no oracle exists for "the answer is complete." Failure profile: errors are epistemic rather than operational — wrong beliefs delivered confidently — which makes them cheap per-incident and expensive in aggregate. Horizon: moderate; branching: high (which source next?); the class most dependent on Chapter 6's retrieval architecture.

### 3.5 Browser and computer-use agents

GUI perception–action loops: screenshots/DOM/accessibility trees in, clicks and keystrokes out — CAH's GUI/OS agent class (DOM state, visual grounding, UI memory, execute checks) [CAH Fig. 1]; the perception half of ALE's GCUA, whose tasks "demand computer use that interleaves GUI interaction... with CLI operations" [ALE §1]. This is the chapter's cautionary class: **CompWoB — the founding measurement of composition collapse (94.0% → 24.9%) — is a web-agent result** [CompWoB]. The difficulty shape explains it: low observability (state inferred from rendered pixels/DOM), high branching (every interactive element), fragile grounding (coordinate/element uncertainty), an environment that drifts and actively resists (anti-bot) — and, on the live web, actions with real-world consequence and no undo. Verification: screenshot-based state checks — expensive, lossy, and themselves model-mediated (the verifier shares the perceiver's failure modes; Topic 8 §7's verification theater risk is structural here). Sandboxing rescues evaluation [HB §3.2] but not deployment.

### 3.6 Embodied agents

Programs as executable policies "for interacting with physical or simulated worlds" [CAH §1]; robotics, lab automation, and simulation-grounded skill learning in CAH's map (skill libraries, affordance grounding, simulator feedback) [CAH Fig. 1]. Defining properties: Ψ is physics — irreversibility is literal, failure cost includes safety-of-life, and the sim-to-real gap is a permanent D_bench ≠ D_prod (Topic 7) built into the class. Per this book's exclusion (Topic 0 §6) the class appears for taxonomy completeness; note only that every axis this chapter defined reaches its extreme here, which is why the class's practice (simulation rehearsal, staged deployment, hard interlocks outside the learned policy) is the rest of the taxonomy's discipline made mandatory.

## 4. The profile table

| Class | Observation quality | Native oracle (d) | Reversibility | Typical n_stoch | Binding constraint |
|---|---|---|---|---|---|
| Conversational | High (text-native) | None — human judgment | High (advice, not action) | Low | Input distribution breadth; memory contamination |
| Transactional | High (structured) | Purchasable (schemas, rules) | **Low** | Low–moderate | Irreversibility; approval topology |
| Coding | High (files, traces) | **Native and strong** (tests, compilers) | High (VCS) | High | Exposure at frontier autonomy [FSC §2.3.3] |
| Research | Wide, uncontrolled | Partial (citations) | High | Moderate | Provenance; no completeness oracle |
| Browser/computer-use | **Low** (pixels/DOM) | Weak, model-mediated | Low on live web | High | Grounding + composition collapse [CompWoB] |
| Embodied | Sensor-limited | Simulation only | **None** | High | Physics; safety-of-life |

The regularity announced in §1 reads directly off columns 3 and the class's reliability reputation: coding leads because d is native; browser trails because d is weak *and* p is depressed by low observability; transactional survives despite irreversibility because d is purchasable and horizons are short. **Reliability per unit autonomy ≈ f(oracle quality, observability) — the model is a second-order term.** [derived — synthesis of Topic 8's algebra with the sourced class profiles]

## 5. Composite systems and the taxonomy's use

The GCUA composes 3.3 + 3.5 (+ 3.4) in one loop [ALE §1], and ALE's near-zero hard-tier pass rates [ALE §1] are what the profile table predicts for a composite: **the composite inherits the weakest column of each constituent** — browser-grade observability, live-web reversibility, research-grade provenance — while the marketing inherits the strongest (coding-grade demos). Use the taxonomy at design time by decomposition: profile each constituent class, take the worst cell per axis, and design controls for *that* row. The uniform-treatment error — one permission scheme, one verification strategy for a system that is three classes in a trench coat — is among the most common architecture-review findings this book will keep flagging.

## 6. Failure modes of taxonomy misuse

- **Class-blind benchmarking:** quoting a coding-agent score to justify a browser-agent deployment; Topic 7's distribution error with a taxonomy label on it.
- **Oracle transplant fantasies:** "we'll just add tests" to a class without executable ground truth; research and conversational agents cannot import coding's d — their checks are judges, with judge failure modes.
- **Reversibility assumptions crossing classes:** the coding habit ("commit, revert if wrong") applied to transactional actions; there is no `git revert` for a sent email.
- **Composite scored as its best constituent:** §5's error, in evaluation form.

## 7. Limitations

- Six classes is a chapter-scale resolution; Harness-Bench's eight categories and ALE's 55 subdomains [HB Fig. 2; ALE §2.2] show finer structure, and vertical workflows (legal, clinical, finance) have within-class variance this taxonomy compresses.
- The profile table's cells are qualitative syntheses of sourced properties, not measured constants; per-cell measurement is exactly what class-matched task profiling (Topic 6 §6) produces for *your* deployment.
- The class boundaries are already dissolving in the GCUA direction [ALE §1]; the taxonomy's durable content is the *axes*, not the partition — if the classes merge, the per-axis analysis is what survives.

## 8. Production implications

1. **Declare the class(es) in the design document**, decompose composites, and inherit the worst cell per axis (§5) — before choosing rung (Topic 10) or controls (Chapter 12).
2. **Invest where the class is weak, not where investment is easy:** browser agents need observation and grounding engineering before prompt tuning; research agents need provenance architecture before better synthesis; transactional agents need compensation logic before capability.
3. **Match the evaluation to the class:** oracle-checkable classes get deterministic validators; the rest get pinned judges with known biases [HB §3.2, §4.1] — and never the reverse.
4. **Let the class set the autonomy prior:** native-oracle classes earn wider bounded autonomy (the d-term covers them); weak-oracle, low-reversibility classes start at approval-gated rungs regardless of model quality.

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
