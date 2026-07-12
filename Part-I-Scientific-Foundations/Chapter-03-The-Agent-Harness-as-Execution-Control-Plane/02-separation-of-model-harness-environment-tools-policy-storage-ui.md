# Topic 2 — Separation of Model, Harness, Environment, Tools, Policy, Storage, and User Interface

## 1. Problem and objective

Topic 1 defined the harness; this topic draws the full system diagram around it. Seven concerns — model, harness, environment, tools, policy, storage, user interface — appear in every deployed agent, and in badly built ones they appear *fused*: policy embedded in prompts, storage improvised inside conversation history, environment assumptions hard-coded into tools. The objective is the canonical separation with its interfaces, the sourced evidence for why each boundary exists, and the diagnostic signs of each fusion — because every fusion converts a testable component into an untestable entanglement.

## 2. Intuition first

Separation of concerns is not aesthetics; it is the precondition for substitution, testing, and attribution. The formal harness object made this concrete: because 𝓜 and 𝓒 are separate, "two agents sharing 𝓒 but differing in 𝓜 execute the same processor pipeline" [HX §3.1] — model swaps become experiments instead of rewrites. The same logic applies at every boundary in this topic: each clean interface is a place where you can swap, mock, measure, or revoke *one thing*. Each fusion is a place where you cannot.

## 3. The seven components and their contracts

**Model (𝓜).** The stochastic policy, consumed through its API surface (Chapter 2). Contract with the harness: assembled context in, proposals out — text, tool-call requests, or both [CAL]. Everything else is someone else's job; Chapter 2 Topic 1's guarantee inventory is the interface specification.

**Harness (𝓒).** The control plane (Topic 1). In the formal decomposition, note *where the processors end and the slots begin*: P implements "all per-step behavior"; S houses "the shared infrastructure that processors depend on but do not own" — tool registry, tracer, workspace, sandbox provider, plugin list, as singletons [HX §3.1]. That per-step/shared split is the harness's own internal separation, and it previews Topic 6's control/data-plane divide.

**Environment.** "External to the agent... the task workspace, files, local services, and resources exposed during execution" [HB §3]. The environment is *not* implemented by anyone in the system — it is what the system acts on. Its interface is Ψ (Chapter 1, Topic 2): actions in, state changes out, observed only through tools and sensors. Sandboxing is the deliberate construction of a *substitute* environment with reset semantics [CAH §3.4.3; HB §3.2] — the environment made swappable for testing, which is exactly the separation logic applied to the one component you don't control.

**Tools.** The action interface: registry and calling convention owned by the harness [HX's S; HB §3], implementations facing the environment with their own contracts — schemas, mutation typing, preconditions (Chapters 2.5–2.6, 5). The boundary discipline runs both directions: the harness must not know tool internals (or every tool change is a harness change); tools must not know loop state (or they become un-reusable and un-testable in isolation).

**Policy.** The rules governing what may happen: permission rules and modes, approval requirements, budget ceilings, risk tiers [CAL; CDX; CAH §3.4.3]. Policy deserves its separation from the harness *mechanism* for a reason the sources state directly: governance should live "outside the prompt alone," in "gateway and policy layers... centralized guardrails, security automation, and falsifiable approval evidence" [CAH §3.4.3]. Policy-as-configuration can be reviewed, diffed, and audited; policy-as-prompt-prose can be argued with — by the model, which Chapter 2 Topic 14 showed is an optimizer against its instructions' letter.

**Storage.** Durable state beyond the run: session/event history, memory stores, artifacts, plans. The reference architecture separates these as named services — "Services: persistence layer managing Sessions, Artifacts, Memory; called by Runner during event processing" [ADK] — and the separation matters because each has different lifecycle, tenancy, and deletion semantics (Chapter 7). Conversation history is not a database; the plan file is not a memory; treating them interchangeably is how Chapter 1 Topic 3's compaction hostages happen.

**User interface.** Where humans see, steer, and approve: message streams for progress [CAL's typed message stream], approval prompts and escalation routes ("approvals can route to `user`... or `auto_review`" [CDX]), diffs and traces for review. The UI's separation matters most at the approval path: an approval decision is a *policy* event that happens to render in a UI; fusing them (approval logic living in frontend code) makes the security boundary depend on which client is attached.

## 4. The interface map

```
        ┌───────────── UI ─────────────┐
        │   streams, approvals, diffs   │
        └───────┬───────────▲───────────┘
                ▼           │ events, escalations
   ┌───────── HARNESS (𝓒) ──────────┐
   │  loop control · context assembly │──── policy queries ───▶ POLICY (rules,
   │  budgets · tracing · recovery    │◀─── verdicts ─────────  tiers, approvals)
   └──┬────────▲──────┬────────▲──────┘
      ▼        │      ▼        │
   MODEL (𝓜)  │    TOOLS      │──── reads/writes ───▶ STORAGE (sessions,
   context in, │    registry + │                        memory, artifacts)
   proposals   │    contracts  │
   out         │      │
               │      ▼
               │   ENVIRONMENT (workspace, services; observed via sensors)
```

**[derived — diagram ours; every edge sourced in §3]** Two structural readings. First, *the harness touches everything and owns almost nothing* — it is the coordinator, and its size should reflect that (coordination logic, not business logic). Second, *the model touches only the harness* — every other component reaches the model exclusively through context assembly and proposal handling, which is what makes the harness the single enforcement point (Topic 6) and the single point whose corruption poisons everything (Chapter 12's injection surfaces).

## 5. Evidence that the boundaries pay

- **𝓜/𝓒:** substitution as experiment — the entire Harness-Bench factorial design (8 backends × 6 harnesses) is only possible because the boundary exists [HB §4.1]; its 23.8-point finding is only *interpretable* because of it.
- **Environment:** trial isolation — "each trial must start from a clean environment" with "no unnecessary shared state between runs"; violations cause "correlated failures due to infrastructure flakiness rather than agent performance" and score inflation (an agent "examining git history from previous trials" gained unfair advantage) [DEM]. The environment boundary is what makes measurements mean anything.
- **Policy:** the three-tier permission model — read-only / sandbox-edit / full-access, with the final tier "guarded by mandatory human-in-the-loop gates because their consequences can extend beyond the sandbox" [CAH §3.4.3] — is expressible *only* as separated policy; no prompt can enforce a tier.
- **Storage:** commit-before-continue — state changes packaged as `state_delta` in events, persisted by services before execution resumes [ADK] — is a storage discipline that exists only because storage is a component with its own contract, not a side effect scattered through loop code.
- **UI:** graded outcomes vs. agent claims — "the final environmental state (e.g., whether a database entry exists, not just what the agent claimed)" [DEM] — requires that what the UI shows humans be sourced from environment/storage, not from model narration; a UI fused to the model's output channel shows users the hallucinated-state failure mode (Chapter 2, Topic 14) as if it were telemetry.

## 6. Fusion pathologies: the diagnostic table

| Fusion | Symptom | Why it hurts | Unfusing move |
|---|---|---|---|
| Policy in prompts | "Musts" written as prose; model argues or drifts | Tendency where a guarantee is needed [Ch.2 T13 §7] | Permission rules, hooks, tiers [CAL; CAH §3.4.3] |
| Storage in history | Constraints and progress lost at compaction | Belief-state hostage [CAL; Ch.1 T3] | Plan files, services, re-injected instructions |
| Environment in tools | Tools hard-coding paths, hosts, credentials | Untestable outside prod; sandbox impossible | Environment injection via workspace/sandbox slots [HX S] |
| Harness in application | Fallback branches silently hand π_D control to π_M | Least-tested path becomes an unmanaged agent [Ch.1 T1 §7] | Explicit class boundary per code path |
| UI in policy path | Approval logic in the client | Security boundary varies by attached frontend | Approval as policy event; UI renders it [CDX routing] |
| Model in verification | Judge shares the failure mode of the judged | Verification theater [Ch.1 T8 §7] | Deterministic sensors first [CAH §3.4.4] |
| Evaluator in harness | Graders reading agent claims, or agent reading grader fixtures | Integrity violations; score inflation [HB §3.2; DEM] | Evaluator external, fixtures protected |

**[derived — table ours; anchors cited]**

## 7. Limitations

- Clean separation has real costs — indirection, latency at boundaries, more surface to version — and small systems legitimately start fused. The engineering claim is not "always separate everything" but "know which fusions you are carrying, and unfuse before scale or consequence arrives." The minimal-agent principle (Chapter 1, Topic 10) applies to architecture ceremony too.
- The seven-way partition is this book's synthesis; the sources each draw a subset (𝓜/𝓒 [HX], harness/environment/evaluator [HB], services [ADK]). No source draws all seven, and the boundaries between policy/harness and storage/harness genuinely blur in shipped systems (Topic 13 shows where).
- The diagram's "single enforcement point" property (§4) is an architectural aspiration; hosted tools (Chapter 2, Topic 9) breach it by construction, and those breaches must be tracked as exceptions, not ignored.

## 8. Production implications

1. **Draw §4's diagram for your system, honestly** — including the edges that bypass the harness (hosted tools, direct storage access, UI shortcuts). The bypasses are your risk register's first draft.
2. **Run the fusion table (§6) as an architecture-review checklist**; each fusion found gets an owner and either an unfusing plan or a written acceptance.
3. **Put policy in config, storage behind services, environment behind injection** — the three unfusings with the highest reliability yield per hour of work, each sourced in §5.
4. **Test each boundary by substitution:** can you swap the model without touching tools? Run the tools against a sandbox? Replay a session against a mock environment? Each "no" names a fusion.
5. **Keep the harness thin.** Coordination, not business logic (§4); a harness that accumulates domain logic is becoming an application nobody designed — Topic 12's entropy, structural form.

## 9. Connections

- Topic 3 animates these components as a loop; Topic 6 formalizes the control/data split latent in §3's P/S distinction; Topic 13 maps three real systems onto this decomposition and shows where each draws the lines.
- Chapter 5 owns the tool contract; Chapter 6 the context content; Chapter 7 the storage services; Chapter 12 the policy plane's threat model.

## Sources

[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §3.1
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3, §3.2, §4.1–4.2
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.3–3.4.4, §3.5
[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[DEM] Anthropic, Demystifying evals for AI agents — https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CDX] OpenAI Codex documentation, sandboxing and approvals — https://learn.chatgpt.com/docs/sandboxing
