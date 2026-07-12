# Topic 2 — Separation of Model, Harness, Environment, Tools, Policy, Storage, and User Interface

## 1. Problem and objective

Topic 1 defined the harness; this topic draws the full system diagram around it. Seven concerns — model, harness, environment, tools, policy, storage, user interface — appear in every deployed agent, and in badly built ones they appear *fused*: policy embedded in prompts, storage improvised inside conversation history, environment assumptions hard-coded into tools. The objective is the canonical separation with its interfaces, the sourced evidence for why each boundary exists, and the diagnostic signs of each fusion — because every fusion converts a testable component into an untestable entanglement.

## 2. Intuition first

Separation of concerns enables controlled substitution, testing, and attribution. HarnessX makes one boundary explicit: because $\mathcal M$ and $\mathcal C$ are separate, agents sharing $\mathcal C$ but differing in $\mathcal M$ execute the same processor pipeline [HX §3.1]. That property supports a model-swap experiment only when all other configuration and environment variables are held fixed. The same discipline applies to the remaining boundaries: each interface should expose what can be swapped, mocked, measured, or revoked.

## 3. The seven components and their contracts

**Model ($M_c$).** The stochastic proposal policy $\pi_M$, consumed through its API surface (Chapter 2). Its harness-facing contract is assembled context $c_t$ in and proposal $y_t$ out—text, tool-call requests, or both [CAL]. It does not own application authorization or environment commit semantics.

**Harness ($H_c$).** The execution control plane (Topic 1). HarnessX's paper notation decomposes $\mathcal C=(P,S)$, with $P$ implementing per-step processor behavior and $S$ housing shared infrastructure [HX §3.1]. This is an ownership/composition split, not itself a control-plane/data-plane boundary; both processors and slots may carry control or data responsibilities.

**Environment.** External to the measured agent, the environment contains the task workspace, files, services, and resources exposed during execution [HB §3]. It may be implemented by the same organization, but it has an independent state and failure contract. In Chapter 1 notation, executed $a_t$ affects latent state through $\Psi$; the harness observes projections through tools and sensors. Sandboxing constructs a bounded environment with declared reset and isolation semantics [CAH §3.4.3; HB §3.2].

**Tools.** The action interface: registry and calling convention owned by the harness [HX's S; HB §3], implementations facing the environment with their own contracts — schemas, mutation typing, preconditions (Chapters 2.5–2.6, 5). The boundary discipline runs both directions: the harness must not know tool internals (or every tool change is a harness change); tools must not know loop state (or they become un-reusable and un-testable in isolation).

**Policy.** Permission rules, approval requirements, budget ceilings, and risk tiers govern what may happen [CAL; CDX; CAH §3.4.3]. Policy data should be versioned separately from the mechanism that evaluates it. Prompt instructions can influence $y_t$ but cannot replace a complete admission check over canonicalized actions and trusted policy state.

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

**[derived—diagram ours; every edge sourced in §3]** The harness coordinates these components but should not absorb their domain logic. On the fully governed path, other components influence the model through context assembly and model proposals reach effects through parse, admission, and dispatch. Hosted tools or direct side channels can bypass this path; such bypasses must be explicit rather than hidden behind a “single enforcement point” claim.

## 5. Evidence that the boundaries pay

- **$M_c/H_c$:** substitution as experiment—the Harness-Bench factorial design crosses eight backends with six harnesses [HB §4.1]. Its aggregate 23.8-point contrast motivates configuration-aware evaluation; model-specific causal effects require the corresponding within-model contrasts and uncertainty.
- **Environment:** trial isolation — "each trial must start from a clean environment" with "no unnecessary shared state between runs"; violations cause "correlated failures due to infrastructure flakiness rather than agent performance" and score inflation (an agent "examining git history from previous trials" gained unfair advantage) [DEM]. The environment boundary is what makes measurements mean anything.
- **Policy:** CAH describes read-only, sandbox-edit, and full-access tiers, with human review at the highest-consequence boundary [CAH §3.4.3]. Current Codex documentation separately describes OS-enforced sandbox modes and approval policy, including read-only and workspace-write operation [CDX]. These are provider-specific mechanisms, not one universal tier taxonomy.
- **Storage:** commit-before-continue — state changes packaged as `state_delta` in events, persisted by services before execution resumes [ADK] — is a storage discipline that exists only because storage is a component with its own contract, not a side effect scattered through loop code.
- **UI:** graded outcomes vs. agent claims — "the final environmental state (e.g., whether a database entry exists, not just what the agent claimed)" [DEM] — requires that what the UI shows humans be sourced from environment/storage, not from model narration; a UI fused to the model's output channel shows users the hallucinated-state failure mode (Chapter 2, Topic 14) as if it were telemetry.

## 6. Fusion pathologies: the diagnostic table

| Fusion | Symptom | Why it hurts | Unfusing move |
|---|---|---|---|
| Policy in prompts | "Musts" written as prose; model argues or drifts | Tendency where a guarantee is needed [Ch.2 T13 §7] | Permission rules, hooks, tiers [CAL; CAH §3.4.3] |
| Storage in history | Constraints and progress lost at compaction | Belief-state hostage [CAL; Ch.1 T3] | Plan files, services, re-injected instructions |
| Environment in tools | Tools hard-coding paths, hosts, credentials | Untestable outside prod; sandbox impossible | Environment injection via workspace/sandbox slots [HX S] |
| Harness in application | A deterministic $D_c$ branch silently begins consulting $\pi_M$ | Least-tested path becomes an unmanaged proposal loop [Ch.1 T1 §7] | Explicit class boundary and admission path per code path |
| UI in policy path | Approval logic in the client | Security boundary varies by attached frontend | Approval as policy event; UI renders it [CDX routing] |
| Model in verification | Judge shares the failure mode of the judged | Verification theater [Ch.1 T8 §7] | Deterministic sensors first [CAH §3.4.4] |
| Evaluator in harness | Graders reading agent claims, or agent reading grader fixtures | Integrity violations; score inflation [HB §3.2; DEM] | Evaluator external, fixtures protected |

**[derived — table ours; anchors cited]**

## 7. Limitations

- Clean separation has real costs — indirection, latency at boundaries, more surface to version — and small systems legitimately start fused. The engineering claim is not "always separate everything" but "know which fusions you are carrying, and unfuse before scale or consequence arrives." The minimal-agent principle (Chapter 1, Topic 10) applies to architecture ceremony too.
- The seven-way partition is this book's synthesis; the sources each draw a subset ($\mathcal M/\mathcal C$ [HX], harness/environment/evaluator [HB], services [ADK]). No source draws all seven, and policy/harness and storage/harness boundaries vary across implementations.
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
[CDX] OpenAI Codex documentation, agent approvals and security — https://learn.chatgpt.com/docs/agent-approvals-security
