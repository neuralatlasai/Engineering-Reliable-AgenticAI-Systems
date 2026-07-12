# Topic 13 — Reference Harness Decomposition: OpenAI Codex, Claude Code, and Google ADK

## 1. Problem and objective

The chapter's machinery has been abstract by design; this topic tests it against the three production harnesses the book uses as references, decomposing each along the canonical components (Topic 2), loop phases (Topic 3), and control mechanisms (Topics 6–8). The objective is twofold: to demonstrate that the abstractions actually fit shipped systems, and to map the *divergences* — because where mature systems disagree, a real design trade lives, and where they converge, the convergence is evidence about what the problem requires.

**Evidence boundary, stated up front:** the three systems are documented at very different depths in this ledger. Claude Code's loop semantics are fully documented [CAL]; ADK's runtime architecture is fully documented [ADK]; Codex's *sandbox and approval semantics* are documented [CDX], but its loop internals are not in the accessible sources (the vendor's loop article was unreachable — Topic 0 §8's access note). Cells below marked "—" are absences of evidence, not absences of capability.

## 2. The decomposition table

| Function | Codex [CDX] | Claude Code / Agent SDK [CAL] | Google ADK [ADK] |
|---|---|---|---|
| **Loop ownership** | — (loop internals not in accessible docs) | Client-side agentic loop: evaluate → tool calls → results → repeat until no-tool-call, budget-bounded | Runner-orchestrated event loop: yield → commit → resume, per invocation |
| **State architecture** | — | Request–response with typed message stream; history-as-state, lossy compaction; resumable/forkable sessions | Event-sourced: `state_delta`/`artifact_delta` in committed events; complete history; reconstruction and rewind |
| **Workspace boundary** | Sandbox modes: `read-only` / `workspace-write` (default) / `danger-full-access`; platform-native isolation (macOS Seatbelt, Linux/WSL2 bubblewrap); network restricted by default | Permission rules + modes gate tools; sandboxing delegated to deployment ("isolated environments" for `bypassPermissions`) | Environment external to Runner; services mediate persistence; workspace semantics application-defined |
| **Escalation/approval** | Approval policies `untrusted` / `on-request` / `never`; escalation when action "needs to go beyond that boundary"; routing to `user` or `auto_review` (automatic reviewer agent) | Approval callbacks (`canUseTool`), permission modes ladder (`default`→`acceptEdits`→`plan`→`dontAsk`→`auto`→`bypassPermissions`), `PreToolUse` blocking hooks | Application-level; the event loop transports approvals as events |
| **Budgets/termination** | — | `max_turns`, `max_budget_usd`, effort; typed terminal subtypes + `stop_reason` | Invocation completes on final event; budget policy application-level |
| **Extensibility seam** | AGENTS.md, subagents, skills, plugins, MCP (per docs navigation) | Hooks (PreToolUse/PostToolUse/Stop/PreCompact/Subagent*), subagents with scoped tools/effort, MCP, skills | Callbacks/tools sync+async; services pluggable; events as the universal interface |
| **Observability substrate** | — | Typed message stream; usage/cost in `ResultMessage`; hook events | Committed event history with `invocation_id`; partial vs. final events separating display from durability |

**[synthesis — table ours; cells sourced; dashes are evidence gaps]**

## 3. Reading the convergences

Three functions converge across all documented systems, and the convergence carries design information:

**C1 — Tiered workspace authority with a human gate at the top.** Codex's three sandbox modes with approval escalation [CDX], Claude Code's permission ladder with approval callbacks [CAL], and the literature's three-tier model with "mandatory human-in-the-loop gates" at full access [CAH §3.4.3] are the same structure independently arrived at: authority is graduated, default-deny at the consequential end, with escalation as a first-class flow. When every mature system builds the same control, Chapter 1 Topic 5's authority dimension is not a taxonomy — it is a requirement.

**C2 — Rejection as information, not exception.** Codex escalates when the sandbox boundary blocks an action [CDX]; Claude Code returns denials to the model as tool results [CAL]; ADK transports everything, including refusals, as events [ADK]. All three metabolize policy decisions into the data plane for the model to adapt to, while keeping the *decision* in the control plane — Topic 6's CP-1 implemented three ways.

**C3 — The extensibility seam is per-step interception.** Hooks [CAL], processors-at-hook-points as the research formalization [HX §3.1–3.2], callbacks [ADK], and Codex's plugin/subagent surface [CDX] all place customization at lifecycle events around the loop's stages — evidence that the typed-stage decomposition (Topic 3 §5) carves the system at its actual joints.

## 4. Reading the divergences

**D1 — State architecture is the deepest split** (Topic 4's whole subject): ADK's committed event ledger vs. Claude Code's history-with-compaction. The trade is recovery/audit/rewind vs. per-step persistence cost and implementation weight; neither is wrong, and the workload rules of Topic 4 §5 decide. What the split means operationally: the same recovery drill (kill mid-run, resume) has *architecturally different* guarantees per system, and a team must know which they bought.

**D2 — Approval routing to a machine reviewer.** Codex's `auto_review` — an "automatic reviewer agent for eligible requests" [CDX] — is the one documented instance of a stochastic component holding an approval seat. Topic 6's CP-2 discipline applies in full: legitimate iff treated as a measured sensor with a fail-safe direction and eligibility bounds ("eligible requests" is the load-bearing phrase). It is also the clearest shipped example of the escalation-ladder economics of Chapter 2, Topic 12 §5 — human attention as the scarce resource, machine review as its multiplier.

**D3 — Where sandboxing lives.** Codex ships OS-level isolation as a product property [CDX]; Claude Code documents permission gating and *expects* deployment-level isolation for its most permissive mode [CAL]; ADK abstracts the environment entirely [ADK]. The divergence maps to the three products' positions on Chapter 2, Topic 9's execution-placement spectrum — and means "sandboxed" is a claim that must name its enforcing layer (OS, harness policy, or deployment) to be auditable.

## 5. Mapping onto the chapter's formalism

Each system instantiates the typed stages with different bindings **[synthesis]**: $\operatorname{Assemble}$ is CLAUDE.md/AGENTS.md injection + history + tool schemas [CAL; CDX] or `InvocationContext` construction [ADK]; $\operatorname{Admit}$ is permission evaluation + hooks [CAL], sandbox-mode enforcement + approval policy [CDX], or application callbacks [ADK]; $\operatorname{commit}$ is session persistence [CAL] or `append_event` [ADK]; $\kappa$ is `ResultMessage` subtypes [CAL] or final-event completion [ADK]. The exercise is not decorative: a team adopting any of the three can fill the stage-binding table for their configuration in an afternoon, and every blank is a phase the substrate leaves to them (Topic 3 §4's finding — verify and terminate-by-verification are the usual blanks, in all three).

## 6. Failure modes of reference-architecture use

- **Capability inference from documentation silence:** treating Codex's "—" cells as absent features; the honest state is unmeasured, and procurement decisions need vendor answers, not table gaps.
- **Cross-system vocabulary transfer:** "session," "turn," and "approval" bind differently per column (Topic 5 §4); porting runbooks or metrics without the unit dictionary produces category errors.
- **Substrate-default worship:** shipping the SDK's defaults as if they were the vendor's recommendation for *your* consequence class — the permission ladders exist because no default fits all tiers [CAL; CDX].
- **Auto-review overtrust:** D2's machine reviewer generalized past its eligibility bounds without the sensor discipline — the one divergence where copying the pattern without its constraints imports a CP-2 inversion.
- **Formalism forcing:** the stage mapping (§5) is a lens, not a proof of equivalence; each system has semantics the mapping compresses (ADK's partial events, Claude Code's compaction, Codex's platform isolation differences), and decisions near those semantics need the primary docs, not this table.

## 7. Limitations

- The Codex column's evidence gap is the topic's largest limitation, stated in §1 and marked throughout; nothing here should be read as a claim about Codex's loop internals.
- All three documentations describe *current* behavior of fast-moving products; this decomposition is dated evidence (retrieval: this book's writing), and Chapter 4 owns the maintenance burden of tracking the surfaces.
- The comparison covers the harness substrates, not the deployed products' full stacks (Codex the product vs. Codex the CLI vs. the API-side agents differ in ways the accessible docs do not fully separate).

## 8. Production implications

1. **Fill the stage-binding table (§5) for your actual configuration** before writing custom machinery; most teams discover the substrate already provides half of what they were about to build, and leaves blank exactly what Topic 3 predicted.
2. **Adopt the convergences as requirements** (C1–C3): tiered authority with human gates, rejection-as-information, per-step interception — a harness missing any of the three is below the industry's demonstrated floor.
3. **Choose consciously on the divergences** (D1–D3): state architecture by workload (Topic 4 §5), machine review with sensor discipline (Topic 6 §4), sandbox enforcement with a named enforcing layer.
4. **Maintain the unit dictionary per system** (Topic 5 §8.1) wherever more than one substrate runs in the fleet — the mixed-fleet reality Chapters 4 and 14 assume.

## 9. Connections

- This topic is the chapter's abstractions audited against shipped reality; Chapter 4 documents the same three ecosystems as *interfaces* (SDK surfaces, feature matrices, migration costs) rather than as architectural evidence.
- The convergences feed Chapter 12 (C1 is its authority machinery), Chapter 8 (C3 is where orchestration patterns attach), and Chapter 14 (observability substrates).

## Sources

[CDX] OpenAI Codex documentation, sandboxing and approvals — https://learn.chatgpt.com/docs/sandboxing (docs navigation for extensibility surface)
[CAL] Claude Agent SDK, "How the agent loop works" — https://code.claude.com/docs/en/agent-sdk/agent-loop
[ADK] Google ADK runtime event-loop documentation — https://adk.dev/runtime/event-loop/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §3.4.3
[HX] HarnessX, arXiv:2606.14249 (`Knowledge_source/2606.14249v2.pdf`) §3.1–3.2
