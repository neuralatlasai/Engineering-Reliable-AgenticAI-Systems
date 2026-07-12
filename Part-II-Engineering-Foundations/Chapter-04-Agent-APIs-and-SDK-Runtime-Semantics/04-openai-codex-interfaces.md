# Topic 4 — OpenAI Codex Interfaces: CLI, SDK, App Server, MCP Server, Cloud Task, GitHub Action, and Code Review

## 1. Problem and objective

Codex is a *coding agent* (Topic 1, row 3) exposed through many entry points — and the entry point determines the deployment cell, the control surface, and who holds the sandbox. The objective is to document what the accessible sources establish about those semantics, and — the more useful contribution — to state precisely what they do not, because this is the surface where this book's evidence is thinnest and where confabulation would be easiest.

**Evidence boundary, stated first and repeated in the limitations.** The vendor's loop article (`openai.com/index/unrolling-the-codex-agent-loop/`) returned HTTP 403 at retrieval time and could not be read (recorded in Chapter 3, Topic 0's ledger). The accessible Codex documentation covers **sandboxing and approvals** in detail [CDX] and lists an extensibility surface (AGENTS.md, subagents, skills, plugins, MCP servers, GitHub Actions, auto-review) in navigation only. This topic reports the former as specification and the latter as an *enumerated surface with unverified semantics*. Nothing here is attributed to the inaccessible article.

## 2. Intuition first

One agent product, many doors. The same underlying coding agent can be invoked from a terminal (you host, you approve), from CI (nobody is watching, so the approval policy *is* the safety story), from a cloud task (the provider hosts), or as an MCP server (something else drives it). Each door changes the answer to Chapter 3's two governing questions — *who enforces the gate* and *where does the evidence land* — and a control policy written for one door is not valid for another. That is the whole topic.

## 3. What the sources specify: the sandbox and approval semantics

The documented control surface [CDX]:

**Sandbox modes** — three, with a default:

| Mode | Semantics |
|---|---|
| `read-only` | Agent inspects files without modification or command execution rights unless approved |
| `workspace-write` (default) | "The agent can read files, edit within the workspace, and run routine local commands inside that boundary" |
| `danger-full-access` | Removes filesystem and network boundaries entirely |

**Enforcement is platform-native**, not policy-prose: macOS Seatbelt; Linux/WSL2 `bubblewrap` user-namespace isolation; Windows Sandbox or WSL2 [CDX]. Network access defaults to restricted; internet access requires approval unless explicitly permitted. This is Chapter 3, Topic 7's *enforced* invariant class implemented at the OS boundary — the strongest form available, and materially different from a harness-level allow-list.

**Approval policies** — three:

| Policy | Semantics |
|---|---|
| `untrusted` | Agent requests permission before running non-whitelisted commands |
| `on-request` | Agent operates within sandbox limits autonomously; requests approval only when "it needs to go beyond that boundary" |
| `never` | No approval prompts; agent proceeds without interruption |

**Escalation routing:** approvals route to `user` (direct human review, default) or `auto_review` ("automatic reviewer agent for eligible requests") [CDX]. Commands inherit sandbox boundaries from the parent process; the system distinguishes actions already permitted within the sandbox (execute without extra review) from those requiring escalation approval [CDX].

Two structural readings. First, **sandbox mode and approval policy are orthogonal** — the cross-product is nine configurations with materially different risk, and "Codex is sandboxed" names a cell only when both are stated. Second, `auto_review` is the shipped instance of a stochastic component holding an approval seat (Chapter 3, Topic 6's D2 divergence): legitimate exactly to the extent it is treated as a measured sensor with an eligibility bound and a fail-safe direction — the word "eligible" is load-bearing.

## 4. The entry points, and what changes across them

The README names seven. What the sources let us say **[synthesis — the deployment-cell reading is ours; each entry point's existence is documented, its detailed semantics are not]**:

| Entry point | Deployment cell (Topic 1) | The question it changes |
|---|---|---|
| **CLI** | You host | Sandbox is on *your* machine; approvals reach a human at a terminal |
| **SDK** | You host | Your process owns the loop's embedding; approval callbacks are yours to implement |
| **App Server** | You host (as a service) | Approvals must reach *some* UI; multi-user tenancy enters |
| **MCP server** | Codex is the *callee* | Another agent drives it — the approval channel's principal is now a machine (CP-2, Ch. 3 T6) |
| **Cloud task** | Provider hosts | Sandbox and evidence move provider-side; your control plane loses pre-execution gating (Ch. 2, T9) |
| **GitHub Action** | CI hosts | **Nobody is watching** — `never` approvals plus repo write access is the highest-consequence default in the table |
| **Code review / auto-review** | Either | The agent is now a *reviewer*, i.e., part of someone else's control plane (§3's D2 hazard) |

The row that should alarm a reviewer is the GitHub Action: an unattended context where the approval policy cannot route to a human, so the sandbox mode *is* the entire control story, and the consequence class (repository writes, CI credentials) is high. This is the cell where Chapter 3, Topic 7's "deterministic gate as floor" is not advice but the only remaining defense.

## 5. What this book cannot verify

Explicitly, as with Topic 2:

- **Loop internals** — turn structure, context management, compaction, termination semantics: unavailable (the 403 article; the docs' navigation does not cover them at depth).
- **AGENTS.md semantics** — precedence, scope, injection point in $\operatorname{Assemble}$: listed in the docs' navigation, not specified in the accessible pages.
- **Subagents, skills, plugins** — enumerated; their isolation, tool inheritance, and context semantics: unverified.
- **Cloud task lifecycle** — state, retention, evidence access: unverified.
- **`auto_review` eligibility rules** — precisely the field that determines whether the CP-2 discipline is satisfied: unverified.

A team deploying Codex in a consequential context must obtain each of these from the vendor and record them in its own configuration documentation. This chapter's contribution is to name them as the questions, not to answer them from priors.

## 6. Failure modes

- **Policy transplant across entry points:** a sandbox/approval configuration validated on the CLI, shipped to a GitHub Action where the human approver does not exist (§4's alarm row).
- **`danger-full-access` as convenience:** the mode exists and removes both filesystem and network boundaries [CDX]; adopting it outside genuinely isolated environments discards the surface's strongest property (Ch. 3, Topic 7's floor).
- **`never` approvals with `workspace-write` in CI:** legal, defaulted-adjacent, and the exact configuration in which Chapter 2, Topic 14's beyond-intent action propensity [G56 §1] has repository-level blast radius.
- **`auto_review` overtrust:** treating the machine reviewer as an oracle rather than a measured sensor with an eligibility bound (§3; Ch. 3, Topic 6 §4's CP-2).
- **MCP-server mode without a principal:** Codex driven by another agent, with the approval channel's "user" now being a machine — the authority chain must be re-established explicitly (Chapter 12).
- **Evidence-cell mismatch:** assuming a complete $\hat\tau$ for cloud-task runs; the record's location follows the deployment cell (Ch. 2, Topic 9 §5.2).

## 7. Limitations

This topic is bounded by §5, and that boundary is the topic's most honest content. Chapter 3, Topic 13 marked Codex's loop cells "—" for the same reason; the treatment here is consistent with that and refuses to fill the gaps by inference. Where a decision depends on an unverified cell, the decision is *blocked on vendor documentation*, not on this book.

## 8. Production implications

1. **Configure the cross-product explicitly** (§3): sandbox mode × approval policy × entry point, written down per deployment. "We use Codex" is not a configuration.
2. **Treat the unattended cells as their own risk class** (§4): GitHub Action and cloud task get their own review, their own consequence classification, and — per Chapter 3, Topic 7 — deterministic gates as the sole floor.
3. **Bound `auto_review` before relying on it**: obtain the eligibility rules (§5), measure its error rates on your action classes, and set its fail-safe direction to deny/escalate.
4. **Record the evidence location per entry point** — what $\hat\tau$ you actually possess, and where — before you need it during an incident.
5. **Do not port control policy across doors.** Re-derive it per entry point; §4's table is the checklist.

## 9. Connections

- Topic 1 classified this surface; Chapter 3, Topic 13 decomposed it structurally (with the same evidence gaps, consistently marked); Chapter 12 owns the authority chains §6 flags; Chapter 11 covers coding agents as a class.
- The `auto_review` question is Chapter 3, Topic 6's CP-2 with a product name; it recurs in Chapter 13's judge-validation discipline, because a machine reviewer is a judge in production clothing.

## Sources

[CDX] OpenAI Codex documentation — sandboxing and approvals (sandbox modes, platform-native isolation, approval policies, escalation routing, command inheritance) — https://learn.chatgpt.com/docs/sandboxing; docs navigation (AGENTS.md, subagents, skills, plugins, MCP servers, GitHub Actions, auto-review) — https://learn.chatgpt.com/docs
[G56] GPT-5.6 Preview System Card, §1 (beyond-user-intent action propensity in agentic coding) — `Knowledge_source/gpt-5-6-preview.pdf`
