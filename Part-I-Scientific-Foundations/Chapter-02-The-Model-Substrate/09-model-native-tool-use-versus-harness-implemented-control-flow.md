# Topic 9 — Model-Native Tool Use versus Harness-Implemented Control Flow

## 1. Problem and objective

Two architectures can produce the identical trace of "model called a tool, got a result, continued." In one, the provider executes the tool inside its own infrastructure and returns to you a finished multi-step result. In the other, your harness receives each proposed call, decides whether to execute it, runs it in your environment, and feeds the result back. The difference is invisible in a demo and decisive in production: it determines where control, observability, permissions, state, and cost live. The objective of this topic is to make the boundary precise, enumerate what each side of it can and cannot give you, and derive placement rules — because "who executes the tool and who runs the loop" is the most consequential architecture decision this chapter touches.

## 2. Intuition first

Hiring an employee versus hiring an agency: both get the work done. The employee works inside your building, with your badge system, your logs, your equipment — every action is yours to gate and audit. The agency delivers outcomes; its internal process is its own, cheaper to consume and opaque by construction. Neither is wrong. What is wrong is not *knowing* which one you have — discovering during an incident that the "tool call" you needed to audit executed inside someone else's infrastructure with no trace in yours.

## 3. The boundary, as the interfaces define it

**Model-native (provider-executed) tools.** The API-side catalog: "web search, file search, image generation, code interpreter, computer use" — hosted tools the provider executes [OAT]; remote MCP servers occupy a middle position (external to the provider, still outside your process, with an approval-policy knob: `require_approval` [OAT]). With hosted tools, the loop iteration for that capability happens inside the provider: the model calls, the provider executes, results return to the model, and you receive the downstream output.

**Harness-implemented (client-executed) tools.** The runtime-side contract: "the SDK runs each requested tool and collects the results" in *your* process, where "you can use hooks to intercept, modify, or block tool calls before they run"; permission rules and modes gate every execution; and hooks "run in your application process... a `PreToolUse` hook that rejects a tool call prevents it from executing" [CAL]. The loop itself — evaluate, execute, feed back, repeat — is a documented client-side artifact with client-side budgets (`max_turns`, `max_budget_usd`) and typed termination [CAL].

**Control flow generalizes the same split.** Beyond single tools, the question becomes who owns *sequencing*: model-directed looping (the agent loop as shipped [CAL]) versus harness-implemented control flow — predefined code paths with model calls at the leaves [BEA], orchestration-based planning where "the harness governs how agents or modules specialize roles, execute stages, route feedback, and trigger verification loops" [CAH §3.1.4]. Chapter 1's Topic 4 stack gives the vocabulary: the placement decision is which layer (π_M, π_H, π_D) owns each loop.

## 4. The property table

| Property | Model-native / hosted | Harness-implemented |
|---|---|---|
| Enforcement point for permissions | Provider's policy + coarse knobs (`require_approval` [OAT]) | Your rules, per call, pre-execution [CAL] |
| Observability | Outputs and provider-reported metadata | Full trace: every call, result, rejection — the four-evidence run record is *constructible* [HB §3.3] |
| Environment access | Provider's sandbox; your data must travel to it | Your workspace, your credentials, your isolation choices |
| State location | Provider-side (their sessions/infrastructure) | Your process and filesystem [CAL sessions] |
| Latency/cost shape | Fewer round trips; provider pricing | Round trip per turn; your compute for tools; token costs visible per step |
| Failure semantics | Provider's retry/failure policy, partially opaque | Typed subtypes you handle [CAL] |
| Portability | Bound to provider's tool implementations | Tools portable across models; semantics yours (Ch. 4's caveats apply) |
| Engineering burden | Minimal | The whole apparatus of Chapters 3, 5, 12 |

The table's summary sentence: **hosted tools trade control surface for convenience; client tools trade engineering burden for the enforcement and evidence that Chapters 12–14 require.** Neither trade is dominated; the placement rules below say which to make where.

## 5. Evidence that placement matters

- **The permission machinery only works where you execute.** Every enforcement mechanism this book leans on — allow/deny rules, scoped patterns, permission modes, blocking hooks [CAL] — operates at the client-side execution point. Harness-Bench's protocol ("minimal required set enabled" [HB Table 1]) and its binary Security gate [HB §3.4] presuppose an execution layer the evaluator can constrain and observe. A hosted tool is, from your control plane's perspective, a single opaque action.
- **The evidence record only exists where you execute.** The four evidence sources per run — final workspace state, execution trace, usage statistics, validator outputs [HB §3.3] — are collected at the execution boundary. Chapter 1 Topic 12 §3.2 made this record the admissibility floor for both evals and incidents; hosted execution truncates it at exactly the calls you'd most want during an incident.
- **Harness identity changes outcomes.** The 23.8-point cross-harness spread at fixed models [HB §4.2] is, among other things, a measurement of how much client-side loop implementation matters; two systems using the "same model with tools" are not the same system.
- **Deferred loading blurs the boundary usefully.** Tool search — provider-side deferral of function-definition loading, on the API [OAT] and in the runtime [CAL] — is a hybrid worth naming: *discovery* is delegated to save context, while *execution* stays client-side. It shows the boundary is per-function (define / discover / decide / execute / audit), not per-tool; you can place each function separately.

## 6. Placement rules

**[derived — rules ours; each grounded where cited]**

1. **Anything effectful in *your* environment executes client-side.** Non-negotiable: it is the only placement where pre-execution gating exists [CAL] and where the evidence record is complete [HB §3.3].
2. **Commodity read-only capabilities are the hosted-tool sweet spot** (web search, generic code interpretation on non-sensitive data [OAT]): low consequence, no workspace access, and the convenience is real.
3. **Data gravity decides the middle cases:** a hosted code interpreter means your data travels to it; sensitive-data steps therefore execute client-side even when read-only (Chapter 12's residency and secret-management rules).
4. **Loops with invariants live in the harness.** Any sequencing that policy must guarantee — approval before deploy, verify before report — is π_H/π_D control flow [BEA; CAH §3.1.4]; model-directed looping is for the segments where flexibility is the point (Chapter 1, Topics 9–10's whole apparatus).
5. **Remote MCP is client-side *authorization* with remote *execution*** — grant it the trust of a remote service, not of a local tool: its approval policy [OAT] is your gate, and its outputs are untrusted input (Chapter 12's supply-chain and injection surfaces).
6. **Decide per function, not per feature** (§5.4): definition, discovery, decision, execution, and audit can each sit on either side; write the placement down.

## 7. Failure modes

- **Phantom auditability:** compliance narratives assuming a complete trace while key steps ran hosted; discovered during the incident, which is the worst time (§5.2).
- **Permission asymmetry:** rigorous client-side gating beside a hosted computer-use tool with provider-default policy — the control plane has a hole shaped exactly like its most powerful capability.
- **Double loops:** provider-side agentic behavior nested inside your harness loop — retries and tool iterations happening on both sides of the boundary, multiplying cost and making termination analysis (whose budget fires first?) undefined. Know which side is looping; make the other side single-shot.
- **Portability illusions:** "we can swap providers because our tools are ours" — true for execution, false for the semantics of hosted capabilities and loop behavior; Chapter 4's portability-limits topic owns the details.
- **Convenience creep:** hosted tools adopted for velocity in the prototype becoming load-bearing in production without ever passing the placement review; the prototype-to-production transition is where §6's rules need a checkpoint (Chapter 15's lifecycle).
- **State stranding:** session/conversation state accumulating provider-side [CAL sessions have client-visible IDs; hosted-tool internal state may not] — the recovery and migration story (Chapters 10, 14) must know where every piece of state physically lives.

## 8. Limitations

- The property table reflects the two documented interfaces [OAT; CAL]; other providers draw the line elsewhere, and the hosted-tool column especially is a moving target (what's observable, what's gateable) — re-verify per provider, per quarter.
- The ledger contains no controlled comparison of hosted-vs-client execution on matched tasks (cost, latency, or reliability); §4's latency/cost row is architectural reasoning, not measurement.
- "Client-side" purity is partial: the model itself is a hosted dependency, and its tool-*emission* behavior (Topic 5) is trained by the provider; the boundary governs execution and evidence, not the policy's provenance.

## 9. Production implications

1. **Draw the execution map** — every tool and loop in the system labeled with where it executes, who gates it, and what evidence it leaves; this one diagram surfaces most of §7 before deployment.
2. **Apply the placement rules (§6) at design review, and re-apply at the prototype→production gate** — convenience creep is the default trajectory, not the exception.
3. **For every hosted capability, document the compensating controls:** what you cannot gate pre-execution, you must bound by scope (what the tool *can* reach) and monitor post-hoc (what it *did* reach).
4. **Budget the harness.** The client-side column's engineering burden is the price of Chapters 12–14 being possible at all; teams that won't pay it should shrink the agent's authority (Chapter 1, Topic 10) until the hosted column's guarantees suffice.

## 10. Connections

- Topics 5–7 described the emission-side machinery; this topic placed the execution side. Topic 12's router is harness-implemented control flow at model granularity.
- Chapter 3 builds the client-side loop this topic argued for; Chapter 4 details each provider's actual split (hosted tools, client tools, managed agents); Chapter 5 owns tool contracts; Chapter 12 owns the permission and supply-chain consequences.

## Sources

[OAT] OpenAI, Tools guide (hosted tools, function tools, remote MCP, tool search) — https://developers.openai.com/api/docs/guides/tools
[CAL] Claude Agent SDK, "How the agent loop works" (client execution, permissions, hooks, budgets, sessions) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.3–3.4, §4.2, Table 1
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.1.4
[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
