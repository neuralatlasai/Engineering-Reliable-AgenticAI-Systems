# Engineering Reliable Agentic AI Systems

### Models, Harnesses, Tools, Memory, Orchestration, Evaluation, Security, and Production Operations

**Audience:** researchers, principal engineers, AI platform architects, and technical leaders with approximately ten years of systems or ML experience.

**Source boundary:** current as of **12 July 2026**. OpenAI, Anthropic, and Google/DeepMind primary sources define the technical ground truth. 

---

## Part I — Scientific Foundations

### Chapter 1 — Agentic Systems as Sequential Decision Processes

1. Agent, workflow, assistant, automation, and autonomous-system boundaries
2. Formal interaction model: observation, latent state, action, transition, reward, termination
3. Partially observable environments and belief-state approximation
4. Model policy versus harness policy versus deterministic application policy
5. Agency dimensions: autonomy, environmental reach, persistence, adaptivity, and authority
6. Task horizon, branching factor, observability, reversibility, and failure cost
7. Capability–reliability separation: why benchmark competence does not imply operational correctness
8. Error accumulation across composed tasks
9. When deterministic workflows dominate agents
10. Minimal-agent principle: use the least autonomous architecture that satisfies the task
11. Agentic-system taxonomy for conversational, transactional, coding, research, browser, and embodied agents
12. Scientific notation and measurement framework used throughout the book

The chapter must begin with empirical limitations: DeepMind reported a sharp degradation between base and compositionally combined web tasks, demonstrating that local task success cannot be extrapolated to long workflows. [DeepMind CompWoB research](https://deepmind.google/research/publications/46840/), [Anthropic’s agent/workflow distinction](https://www.anthropic.com/engineering/building-effective-agents)

---

### Chapter 2 — The Model Substrate: Reasoning, Planning, Tool Use, and Uncertainty

1. Language models as stochastic policies rather than transaction processors
2. Reasoning-token allocation and test-time compute
3. Plan generation, execution, reflection, replanning, and verification
4. ReAct-style interleaving versus explicit planner–executor separation
5. Tool-call generation as constrained structured prediction
6. Parallel, sequential, speculative, and dependent tool calls
7. Structured outputs, schema adherence, constrained decoding, and semantic validity
8. Uncertainty estimation: calibrated confidence, abstention, self-consistency, and verifier disagreement
9. Model-native tool use versus harness-implemented control flow
10. Multimodal perception–action loops: text, image, audio, browser, desktop, and robotics
11. Model selection by horizon, tool accuracy, latency, cost, and risk—not aggregate benchmark rank
12. Capability routing, fallback models, escalation, and heterogeneous model portfolios
13. Fine-tuning versus context engineering versus deterministic control
14. Failure mechanisms: hallucinated state, premature completion, plan drift, reward hacking, and evaluation awareness

DeepMind’s work supplies the broader sequential-decision, world-model, embodied-agent, and evaluation perspective; provider APIs supply the executable tool-use semantics. [Google DeepMind research](https://deepmind.google/research/), [OpenAI tool interface](https://developers.openai.com/api/docs/guides/tools)

---

### Chapter 3 — The Agent Harness as an Execution Control Plane

1. Harness definition: the system surrounding the model that enables stateful action
2. Separation of model, harness, environment, tools, policy, storage, and user interface
3. Canonical loop: gather → infer → act → observe → verify → update state → terminate
4. Event-sourced versus request–response runtime architectures
5. Run, turn, step, span, tool call, interruption, checkpoint, and terminal result
6. Control-plane versus data-plane responsibilities
7. Deterministic invariants around probabilistic model behavior
8. Termination predicates, step budgets, token budgets, time budgets, and cost budgets
9. Cancellation, interruption, resumption, replay, and idempotency
10. Exception taxonomy: model, schema, tool, policy, environment, transport, and orchestration failures
11. Harness-induced capability: why the same model performs differently under different scaffolds
12. Harness entropy: duplicated instructions, stale rules, dead tools, contradictory state, and unbounded context
13. Reference harness decomposition for OpenAI Codex, Claude Code, and Google ADK
14. Experimental methodology for harness ablations

This chapter is anchored in OpenAI’s explicit unrolling of the Codex agent loop and Anthropic’s definition of the harness as the system orchestrating model–tool interaction. [OpenAI Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/), [Anthropic agent-evaluation architecture](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

---

## Part II — Runtime Construction

### Chapter 4 — Agent APIs and SDK Runtime Semantics

1. API endpoint, model API, agent SDK, coding agent, and managed-agent platform distinctions
2. OpenAI Responses API: response items, tool items, conversations, background execution, and compaction
3. OpenAI Agents SDK: `Agent`, `Runner`, tools, handoffs, agents-as-tools, sessions, guardrails, tracing, and interruptions
4. OpenAI Codex interfaces: CLI, SDK, App Server, MCP server, cloud task, GitHub Action, and code review
5. Anthropic Messages API: content blocks, `tool_use`, `tool_result`, streaming, and client-executed tools
6. Claude Agent SDK: `query()`, `ClaudeSDKClient`, built-in tools, permissions, hooks, subagents, sessions, skills, and MCP
7. Claude Managed Agents: agent, environment, session, event stream, managed sandbox, and self-hosted sandbox
8. Google ADK: agent classes, runner, event loop, session service, memory service, artifact service, callbacks, and plugins
9. Gemini Interactions API and ADK integration
10. Sync, async, streaming, WebSocket, webhook, and background execution
11. Provider-managed versus application-managed state
12. Portability limits: semantic differences hidden behind superficially similar abstractions
13. Version pinning, release compatibility, schema evolution, and migration tests
14. Reference Python implementations and cross-provider conformance tests

Primary executable references: [OpenAI Agents SDK](https://github.com/openai/openai-agents-python), [OpenAI agent documentation](https://developers.openai.com/api/docs/guides/agents), [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python), [Google ADK](https://github.com/google/adk-python).

---

### Chapter 5 — Agent–Computer Interfaces and Tool Engineering

1. Agent–computer interface as a first-class design object
2. Function tools, hosted tools, local tools, remote tools, MCP tools, and agents-as-tools
3. Tool schema design: names, descriptions, argument boundaries, enums, defaults, and validation
4. Semantic affordance: ensuring the model can infer when and how to call a tool
5. Read tools versus write tools; reversible versus irreversible actions
6. Tool discovery, deferred loading, tool search, and namespace management
7. Tool-result compression, filtering, pagination, and progressive disclosure
8. Code execution as an aggregation layer over large tool surfaces
9. Shell, filesystem, browser, computer-use, retrieval, web-search, database, and communication tools
10. Deterministic preconditions, postconditions, authorization, and resource ownership
11. Retry semantics, idempotency keys, duplicate actions, partial success, and compensation
12. Tool output provenance, freshness, citations, and untrusted-content boundaries
13. Tool-choice accuracy and argument-validity evaluation
14. Tool-contract fuzzing and adversarial tool-description tests
15. Why adding tools can reduce performance through ambiguity and context saturation

[Anthropic tool-engineering study](https://www.anthropic.com/engineering/writing-tools-for-agents), [OpenAI tool-search mechanism](https://developers.openai.com/api/docs/guides/tools-tool-search), [Google ADK tools and integrations](https://google.github.io/adk-docs/integrations/)

---

### Chapter 6 — Context Engineering and Retrieval Architecture

1. Context as a finite, dynamically allocated computational resource
2. Instruction hierarchy: system, developer, user, repository, task, tool, and environment context
3. Context construction pipeline: acquire → normalize → rank → compress → assemble → validate
4. Working context, retrieved context, episodic history, durable instructions, and external state
5. Retrieval architecture: lexical, dense, hybrid, graph, metadata-filtered, and tool-mediated retrieval
6. Chunking, context windows, overlap, document structure, and provenance preservation
7. Query rewriting, decomposition, multi-hop retrieval, reranking, and evidence synthesis
8. Context poisoning, prompt injection, stale data, authority confusion, and conflicting evidence
9. Lost-in-the-middle, attention dilution, irrelevant-context interference, and tool-schema saturation
10. Prompt caching and prefix stability
11. Sliding windows, summarization, compaction, selective replay, and context reconstruction
12. Context budgeting across instructions, history, tool definitions, evidence, and generated reasoning
13. Retrieval and context ablations: recall, utilization, faithfulness, latency, and token cost
14. Context observability: attribution maps and per-source contribution analysis

[Anthropic context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction), [Google production context architecture](https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/)

---

### Chapter 7 — State, Memory, Artifacts, Identity, and Knowledge Persistence

1. Distinguishing context, state, memory, knowledge, cache, and artifacts
2. Turn-local scratch state, session state, cross-session memory, and organizational knowledge
3. Event logs as the authoritative execution record
4. Message replay versus server-managed conversations
5. Episodic, semantic, procedural, preference, and environmental memory
6. Write policies: what may enter memory and who authorizes persistence
7. Read policies: retrieval scope, identity, tenancy, and purpose limitation
8. Memory extraction, consolidation, deduplication, conflict resolution, and forgetting
9. Temporal validity, provenance, confidence, and supersession
10. Artifact lifecycle: files, reports, code patches, datasets, checkpoints, and binary outputs
11. Versioning artifacts independently from conversational state
12. Repository memory: `AGENTS.md`, `CLAUDE.md`, rules, skills, plans, tests, and architecture records
13. State migration across model, SDK, schema, and deployment versions
14. Privacy, deletion, retention, encryption, and cross-tenant isolation
15. Memory evaluation: precision, recall, utility, contamination, and behavioral drift

[OpenAI conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [Claude Code memory model](https://docs.anthropic.com/en/docs/claude-code/memory), [Google ADK session and memory model](https://google.github.io/adk-docs/sessions/)

---

## Part III — Orchestration and Long-Horizon Execution

### Chapter 8 — Workflow Control: From Deterministic Graphs to Adaptive Agents

1. Fixed pipelines, routers, state machines, DAGs, loops, and model-directed execution
2. Sequential, parallel, conditional, map–reduce, evaluator–optimizer, and generator–critic patterns
3. Routing by intent, capability, risk, cost, latency, and data locality
4. Planner–executor, supervisor–worker, blackboard, and shared-state architectures
5. Handoffs versus agents-as-tools
6. Ownership transfer, result aggregation, and final-answer authority
7. Structured intermediate representations and typed workflow state
8. Human-in-the-loop checkpoints and deferred approvals
9. Dynamic replanning after environmental or tool failure
10. Durable execution, checkpoints, retries, compensation, and exactly-once illusions
11. Workflow termination proofs and cycle detection
12. When orchestration complexity exceeds the value of model autonomy
13. Comparative implementations in OpenAI Agents SDK, Claude Agent SDK, and Google ADK
14. Workflow conformance and property-based testing

[OpenAI orchestration semantics](https://developers.openai.com/api/docs/guides/agents/orchestration), [Anthropic workflow patterns](https://www.anthropic.com/engineering/building-effective-agents), [Google ADK event loop](https://google.github.io/adk-docs/runtime/event-loop/)

---

### Chapter 9 — Multi-Agent Systems and Interoperability Protocols

1. Conditions under which multiple agents are justified
2. Decomposition gain versus coordination tax
3. Role specialization, information isolation, and authority boundaries
4. Centralized supervisor, hierarchical delegation, peer collaboration, and market-style allocation
5. Parallel exploration and diversity-aware result synthesis
6. Shared context versus private context
7. Communication topology, message contracts, and causal ordering
8. Duplicate work, conflicting edits, deadlock, livelock, and cascading hallucination
9. MCP architecture: hosts, clients, servers, resources, prompts, tools, transports, and trust boundaries
10. A2A architecture: agent cards, task negotiation, messaging, artifacts, and remote-agent opacity
11. MCP versus A2A: tool/context interoperability versus agent-to-agent collaboration
12. Cross-language and cross-framework agent composition
13. Remote-agent authentication, authorization, identity propagation, and audit
14. Multi-agent evaluation: marginal contribution, redundancy, diversity, and coordination overhead
15. Cost- and latency-aware concurrency control

[Anthropic multi-agent research architecture](https://www.anthropic.com/engineering/multi-agent-research-system), [OpenAI multi-agent API](https://developers.openai.com/api/docs/guides/responses-multi-agent), [Google A2A specification framing](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)

---

### Chapter 10 — Long-Running Agents: Checkpointing, Compaction, and Recovery

1. Why context length alone does not solve long-horizon execution
2. Horizon failure: goal drift, forgotten constraints, repeated work, and false completion
3. Initializer-agent and worker-agent separation
4. Requirement decomposition into verifiable task units
5. Durable task ledgers, progress files, execution journals, and evidence records
6. Artifact-mediated continuity across sessions
7. Context compaction versus semantic state preservation
8. Checkpoint frequency and recovery-point objectives
9. Restart-safe execution and replayable actions
10. Liveness monitoring, heartbeats, leases, stalled-agent detection, and takeover
11. Failure recovery: retry, replan, rollback, compensate, quarantine, and escalate
12. Stop conditions based on verified task state rather than model declarations
13. Long-running branch management, worktrees, merge discipline, and conflict resolution
14. Quality decay across extended runs and independent verifier agents
15. Long-horizon benchmarks, survival curves, and time-to-first-unrecoverable-error

[Anthropic long-running harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents), [Anthropic application-development harness](https://www.anthropic.com/engineering/harness-design-long-running-apps), [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction)

---

### Chapter 11 — Coding, Research, Browser, and Computer-Use Agents

1. Code as action, reasoning, environment model, verification substrate, and memory
2. Repository discovery: architecture, dependencies, build graph, tests, rules, and ownership
3. Plan → edit → compile → test → inspect → patch → review loop
4. Patch semantics, diff review, minimal-change discipline, and rollback
5. Local execution, cloud sandboxes, containers, worktrees, and CI agents
6. Persistent repository instructions: `AGENTS.md`, `CLAUDE.md`, skills, hooks, and plugins
7. Codex CLI, cloud tasks, App Server, GitHub integration, code review, and CI/CD execution
8. Claude Code tools, permissions, hooks, subagents, sessions, and Agent SDK automation
9. Research agents: query decomposition, parallel search, evidence capture, citation validation, and synthesis
10. Browser agents: DOM, accessibility tree, screenshots, navigation state, and anti-bot constraints
11. Computer-use agents: perception–action loops, coordinate uncertainty, state verification, and visual grounding
12. Shell and generated-code execution under sandbox constraints
13. Independent verification: tests, linters, type checkers, security scanners, and runtime probes
14. Coding-agent evaluation beyond SWE-bench: environment stability, infrastructure noise, patch validity, and maintainability
15. Human review interfaces: diffs, traces, approvals, and evidence-backed completion

[OpenAI Codex repository](https://github.com/openai/codex), [Codex harness engineering](https://openai.com/index/harness-engineering/), [Claude Code repository](https://github.com/anthropics/claude-code), [Claude Agent SDK overview](https://docs.anthropic.com/en/docs/claude-code/sdk)

---

## Part IV — Trust, Evaluation, and Production Operations

### Chapter 12 — Security, Safety, Permissions, and Governance

1. Threat modeling the complete agent–harness–tool–environment system
2. Prompt injection, indirect injection, tool-output poisoning, and instruction exfiltration
3. Confused-deputy failures and excessive agency
4. Least privilege, capability security, allowlists, denylists, and scoped credentials
5. Read, write, execute, network, browser, deployment, and financial authority levels
6. Sandbox design: filesystem, process, network, secret, and resource isolation
7. Approval policies based on consequence, reversibility, and uncertainty
8. Input, output, tool, and tripwire guardrails
9. Deterministic hooks, callbacks, policy engines, and enforcement points
10. Authentication, authorization, delegation tokens, and identity propagation
11. Secret management and prevention of credentials entering model context
12. Data classification, residency, retention, and audit requirements
13. Supply-chain security for MCP servers, skills, plugins, tools, and generated dependencies
14. Agentic misalignment, covert action, sabotage, and monitor evasion
15. Incident response: containment, evidence preservation, revocation, rollback, and postmortem
16. Governance artifacts: model card, agent card, threat model, authority matrix, and change record

[Anthropic trustworthy-agents research](https://www.anthropic.com/research/trustworthy-agents), [Anthropic agentic-misalignment study](https://www.anthropic.com/research/agentic-misalignment), [Google ADK safety architecture](https://google.github.io/adk-docs/safety/)

---

### Chapter 13 — Evaluation Science for Agentic Systems

1. Evaluation target: model, harness, toolset, environment, or integrated agent system
2. Outcome, trajectory, policy, safety, efficiency, and robustness dimensions
3. Task specification: initial state, hidden state, allowed actions, invariants, and success predicate
4. Reference trajectories versus valid alternative trajectories
5. Exact-match, semantic, programmatic, human, model-based, and hybrid graders
6. Tool-selection, argument-validity, routing, handoff, retrieval, and memory metrics
7. Trace grading: model calls, tool calls, guardrails, handoffs, and state transitions
8. Pass@k, pass^k, success probability, calibration, and retry-adjusted utility
9. Long-horizon reliability and multiplicative step-error accumulation
10. Environment nondeterminism and infrastructure-noise quantification
11. Adversarial, counterfactual, perturbation, and metamorphic tests
12. Safety evaluations: deception, sabotage, exfiltration, escalation, and policy bypass
13. Offline replay, shadow evaluation, canaries, online A/B testing, and progressive rollout
14. Benchmark contamination, evaluation awareness, grader bias, and reward hacking
15. Statistical power, confidence intervals, stratification, and significance testing
16. Cost-, latency-, and risk-normalized evaluation
17. Failure taxonomy and causal error analysis
18. Reproducible evaluation manifests and experiment tracking

[OpenAI trace grading](https://developers.openai.com/api/docs/guides/agent-evals), [Anthropic agent-evaluation methodology](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [Google ADK evaluation model](https://google.github.io/adk-docs/evaluate/)

---

### Chapter 14 — Production Reliability, Observability, Performance, and Economics

1. Agent serving architecture: gateway, runtime, model provider, tool plane, state plane, and event bus
2. Synchronous, streaming, asynchronous, background, batch, and realtime execution
3. Queueing, admission control, priority, fairness, backpressure, and cancellation
4. Timeout hierarchy: model, tool, step, turn, run, and workflow
5. Retry budgets, circuit breakers, bulkheads, rate limits, and provider failover
6. Durable orchestration and event-sourced recovery
7. Trace topology: runs, spans, model inference, tools, handoffs, guardrails, and approvals
8. Structured logs, metrics, distributed traces, replay artifacts, and audit events
9. SLOs for task success, availability, latency, cost, safety, and human intervention
10. Latency decomposition: queue, prefill, decode, tool execution, network, verification, and synthesis
11. Token economics: context construction, tool schemas, retrieved evidence, outputs, and compaction
12. Caching: prompt, retrieval, tool-result, artifact, semantic, and policy caches
13. Concurrency and multi-agent fan-out cost
14. Model routing and quality–latency–cost Pareto frontiers
15. Capacity planning, quota management, regional deployment, and disaster recovery
16. Data and schema migrations without orphaning active sessions
17. Release engineering: version pinning, canaries, rollback, and compatibility gates
18. FinOps for agents: cost per successful task, cost per verified action, and wasted-token rate
19. Operational dashboards and production incident playbooks

[OpenAI Agents SDK observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability), [OpenAI background execution](https://developers.openai.com/api/docs/guides/background), [Google ADK logging](https://google.github.io/adk-docs/observability/logging/)

---

## Part V — Scientific and Organizational Operating Model

### Chapter 15 — The Agent Engineering Lifecycle and Frontier Research Agenda

1. Problem selection: identifying workflows that genuinely require agency
2. Agent Requirements Document: objective, environment, tools, authority, constraints, and measurable success
3. Baseline ladder: manual process → deterministic automation → single model call → workflow → single agent → multi-agent
4. Architecture decision record and explicit rejection of unnecessary autonomy
5. Prototype construction with minimum tool and context surface
6. Golden-task corpus, failure corpus, and adversarial-task corpus
7. Eval-driven development and disciplined error analysis
8. Harness, prompt, tool, model, retrieval, and memory ablation methodology
9. Shadow deployment, constrained pilot, progressive authority, and production rollout
10. Human–agent responsibility allocation and escalation design
11. Continuous trace mining and automatic failure-cluster discovery
12. Harness garbage collection: removing obsolete rules, tools, memory, and scaffolding
13. Capability drift following model upgrades
14. Research-to-production reproducibility and evidence standards
15. Workforce and process redesign without unsupported productivity claims
16. Build-versus-buy and provider-lock-in analysis
17. Open research problems:

    * reliable long-horizon planning
    * calibrated action uncertainty
    * compositional generalization
    * scalable agent monitoring
    * trustworthy memory
    * formal tool contracts
    * secure cross-agent identity
    * multi-agent credit assignment
    * environment-grounded verification
    * automated harness synthesis
18. Final reference architecture for a secure, observable, resumable, multi-provider agent platform
19. Final production-readiness review and falsification checklist

This lifecycle reflects the strongest common pattern across the sources: define bounded authority, build the smallest viable harness, instrument trajectories, evaluate failures, and expand autonomy only when evidence supports it. [OpenAI Academy agent lifecycle](https://academy.openai.com/public/events/skill-lab-build-your-first-workspace-agent-nnjoi6bjce), [OpenAI harness engineering](https://openai.com/index/harness-engineering/), [Anthropic harness research](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## Mandatory Technical Appendices

These do not count toward the 15 chapters:

* **Appendix A:** Cross-provider terminology map—Responses API, Agents SDK, Codex, Messages API, Claude Agent SDK, Managed Agents, Gemini Interactions API, and ADK
* **Appendix B:** Python reference implementations and typed event schemas
* **Appendix C:** MCP and A2A protocol comparison
* **Appendix D:** Agent threat-model and authority-matrix templates
* **Appendix E:** Evaluation manifest, trace schema, grader contract, and statistical protocol
* **Appendix F:** SLO, telemetry, incident-response, and rollback templates
* **Appendix G:** Reproducibility ledger containing source URL, publication date, API/SDK version, repository commit, and verification date

Every chapter should follow the same scientific structure: **objective → mechanism → formulation → architecture → implementation → controlled experiments → observations → failure modes → limitations → production implications**. This prevents the book from becoming either an SDK tutorial or an “agentic AI” strategy narrative.
