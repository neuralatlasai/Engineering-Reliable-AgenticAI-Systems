# Topic 1 — Harness Definition: The System Surrounding the Model That Enables Stateful Action

## 1. Problem and objective

"Harness" is this book's most load-bearing term, and the field uses it loosely — sometimes meaning a prompt template, sometimes an entire product. The objective of this topic is a definition with edges: what the harness is, what it is *for*, what is inside and outside it, and why the definition earns the elevated status this book gives it — including the strongest formal treatment available, in which the harness is not a metaphor but a typed, serializable, substitutable mathematical object.

## 2. Intuition first

A language model, alone, is a function from text to text with no hands, no memory, no clock, and no consequences. Everything that converts that function into a system that *does things* — that reads your repository, edits your files, retries after failures, stops when it should, and leaves a record — is the harness. The name is apt: a harness is what couples a powerful but undirected source of motion to useful work, and what the driver actually holds.

## 3. The definition, assembled from four sources

The sources converge from different angles, and the composite is stronger than any one:

**Functional** (what it does): the harness "processes inputs, orchestrates tool calls, and returns results" — it is "the system that enables a model to act as an agent" [DEM]. Anthropic's operational note attached to this definition matters: when evaluating an agent, you assess "the harness *and* the model working together as an integrated system" [DEM] — the definition arrives already fused to the measurement discipline of Chapter 1, Topic 12.

**Structural** (what it contains): "the system layer that conditions model calls and turns model outputs into actions in an external workspace," possibly including "prompt templates, action formats, context construction, tool invocation, workspace access, permissions, budget control, tracing, and recovery" — with the compact equation **Agent = Model + Harness** [HB §3].

**Cybernetic** (what role it plays): "the harness acts as a *cybernetic governor*: a control layer that observes the effects of agent actions and regulates subsequent state transitions. Rather than merely forwarding error messages to the model, it observes the repository and execution environment through deterministic sensors... The harness can then decide whether to continue execution, revise a patch, request more context, route the task to another module, reduce permissions, or escalate to a human reviewer" [CAH §3.4.1]. This is the definition's teeth: the harness does not just *enable* action; it *governs* it.

**Formal** (what it is, mathematically): "a harness in HarnessX is the pair 𝓗 = (𝓜, 𝓒), where 𝓜 is a model configuration and 𝓒 is a harness configuration... 𝓜 records *which* model serves which role...; 𝓒 records *how* the agent behaves independently of model identity." 𝓒 itself decomposes as (P, S): P a hook-indexed list of processors over eight lifecycle events, S a fixed set of shared slot resources (tool registry, tracer, workspace, sandbox provider, plugin list). The configuration "is a first-class object because it is independently serializable, comparable, hashable, and substitutable. Two agents sharing 𝓒 but differing in 𝓜 execute the same processor pipeline, with behavior differing only in model responses; two agents sharing 𝓜 but differing in 𝓒 are behaviorally distinct" [HX §3.1].

**The composite definition this book adopts:** *the harness is the deterministic, versionable system that (a) constructs everything the model sees, (b) governs everything the model's outputs cause, and (c) records everything that happened — separable from the model in principle (𝓒 vs 𝓜) and inseparable from it in measurement (Agent = Model + Harness).* **[derived — synthesis; each clause sourced above]**

## 4. What "enables stateful action" means precisely

The README's phrase deserves unpacking, because statefulness is the harness's defining gift. The model is stateless [CAH §2]; the harness manufactures three kinds of state around it:

1. **Conversation state:** history assembly, compaction, re-injection of durable instructions [CAL] — the belief substrate of Chapter 1, Topic 3.
2. **Execution state:** where the run *is* — turn counts, budgets consumed, checkpoints, pending approvals; the vocabulary of Topic 5. In the event-sourced form this state is a committed event log: sessions hold "complete event history, enabling state reconstruction, session rewinding, and observability" [ADK].
3. **Workspace state:** the environment's actual condition, made legible through sensors and made safe through permission tiers [CAH §3.4.3–3.4.4].

An artifact that manages none of these is not a harness — it is a prompt. This is the definitional edge that excludes the loose usage.

## 5. The boundary cases, adjudicated

- **Is the system prompt part of the harness?** Yes — it is context construction [HB §3], and in the formal model it is exactly what the `task_start` hook may modify [HX Table 1]. But a system prompt *alone* fails §4's test.
- **Are tools part of the harness?** The registry, invocation machinery, permission gates, and result routing are harness [HB §3; HX's S slots]; the tool *implementations* are environment-facing components with their own contracts (Chapter 5). The harness owns the calling convention, not the callee.
- **Is the evaluator part of the harness?** No — "the evaluator is also external: it observes the completed run and assigns outcome- and process-level scores" [HB §3]. But the *evaluation harness* — the infrastructure that runs evals end-to-end [DEM] — is itself a harness by this definition, applied to a different workload. The concept is role-relative, which is a feature: it is why harness engineering and evaluation engineering share methods (Topic 14).
- **Is a workflow's application code harness?** Chapter 1 Topic 4's answer stands: π_D is a distinct layer. The harness is the layer that governs *model-initiated* action; predefined code paths that never consult the model are application, not harness. The two blur exactly where fallback branches hand control to the model — and that blur is a hazard to name, not a definition to fudge.

## 6. Why the definition carries this much weight: the evidence recap

Three results, assembled across two chapters, now stated as the definition's justification:

1. **Behavioral identity:** two agents differing only in 𝓒 "are behaviorally distinct" [HX §3.1] — measured as the 23.8-point spread at fixed models [HB §4.2].
2. **Improvability:** editing 𝓒 alone yields +14.5% average, up to +44.0%, "gains largest where baselines are lowest" [HX abstract].
3. **Failure attribution:** production failures cluster in 𝓒's responsibilities — "missing repository context, brittle tool interfaces, weak validators, excessive token cost, poor retry policies, or mismatched permission boundaries rather than... model generation" [CAH §3.5].

A layer that is behaviorally decisive, independently improvable, and where the failures actually live is a first-class engineering object. That is the whole argument, and it is quantitative.

## 7. Failure modes of getting the definition wrong

- **Harness-as-afterthought:** treating 𝓒 as glue written incidentally while "the real work" is prompting; the result is an unversioned, untested control plane governing production actions — the exact layer the failure data points at [CAH §3.5].
- **Harness-as-product-boundary:** assuming the vendor SDK *is* your harness, fully specified; the SDK is a harness *substrate* — your configuration of it (rules, hooks, budgets, tools) is the 𝓒 that determines behavior, and it is yours to version and test.
- **Model-anthropomorphic attribution:** debugging harness failures as model failures ("it forgot," "it ignored instructions") — Chapter 1 Topic 2 §6's symbol-assignment discipline exists to catch this; the fix lives in whichever component actually failed.
- **Definitional creep in reporting:** publishing "Model X: 76%" when the measurement was (X, your-𝓒); Chapter 1's citation-completeness rule, now with the formal notation to enforce it.

## 8. Limitations

- The formal object 𝓗 = (𝓜, 𝓒) is one research system's formalization [HX]; production harnesses (Topic 13) are not literally hook-indexed processor pipelines, and mapping them onto the formalism involves judgment. The formalism's value is as a *specification target* — what a harness would need to be to be fully evolvable and testable — not as a description of what shipped.
- The role-relativity of §5.3 (evaluation harnesses are harnesses) is conceptually clean but terminologically hazardous in mixed company; this book keeps the qualifier ("evaluation harness") explicit.
- The definition is synchronic; harnesses also *change over time*, and their change management (Evolution Agents, governed mutation [CAH §3.5.2–3.5.3]) is deferred to Topics 12 and 14.

## 9. Production implications

1. **Name a harness owner.** The layer that is behaviorally decisive (§6) needs an owner, a repository, a version history, and a review process — most organizations have all four for the model choice and none for 𝓒.
2. **Write your 𝓒 down.** Enumerate your configuration against the [HB §3] component list (prompts, action formats, context construction, tools, workspace access, permissions, budgets, tracing, recovery); components you cannot enumerate, you cannot test or garbage-collect (Topic 12).
3. **Adopt the governor stance:** every design review question of the form "will the model do X?" gets the counter-question "what does the harness do when it doesn't?" [CAH §3.4.1's decision list is the menu].
4. **Report (𝓜, 𝓒, version) — always.** The definitional equation Agent = Model + Harness [HB §3] is a reporting requirement wearing a definition's clothes.

## 10. Connections

- Topic 2 decomposes 𝓒 into its canonical components; Topic 3 animates it as a loop; Topic 11 quantifies §6 in full; Topic 13 maps three production systems onto the definition.
- Chapter 4 treats the SDKs as harness substrates; Chapter 15's harness garbage collection and lifecycle assume everything this topic defined.

## Sources

[DEM] Anthropic, Demystifying evals for AI agents — https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3, §4.2
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §2, §3.4.1, §3.5
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) abstract, §3.1, Table 1
[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
