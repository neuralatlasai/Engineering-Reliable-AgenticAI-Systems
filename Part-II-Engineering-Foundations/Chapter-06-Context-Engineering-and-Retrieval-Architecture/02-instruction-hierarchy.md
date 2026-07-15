# Topic 2 — Instruction Hierarchy: System, Developer, User, Repository, Task, Tool, and Environment Context

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The seven instruction sources that compete for authority in the window, what each earns in budget, how conflicts between them resolve, and — the load-bearing distinction — which of them are *control* and which are merely *data wearing an imperative mood*.

**Prerequisites.** Topic 1 (the budget); Chapter 3, Topic 6 (control plane vs data plane, CP-1); Chapter 5, Topic 12 (untrusted content at the tool boundary — this topic is its generalization to every context source).

**Terminology.** *Instruction hierarchy*: the precedence ordering over context sources when their directives conflict. *Right altitude*: [ECE]'s "Goldilocks zone" — "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics." *Durable instruction*: one that must survive compaction (Topic 11).

**Boundaries.** Inside: the sources, their precedence, their budget entitlement, and conflict resolution. Outside: the pipeline that assembles them (Topic 3); what happens when an untrusted source *attacks* the hierarchy (Topic 8).

**Exclusions.** No prompt-writing style guide beyond the altitude calibration, which is in scope because it determines *how many tokens* an instruction source deserves.

**Outcomes.** The reader can enumerate their seven sources, assign each a precedence and a budget, and state which ones an attacker can write to.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** By the time a model call is made, instructions have arrived from seven places: the system prompt, developer configuration, the user's message, repository files (`CLAUDE.md`, `AGENTS.md`), the task specification, tool descriptions ($\mathcal U_c$ from Chapter 5), and the environment (tool results, retrieved documents, file contents). They are all *text in one window*. The model does not receive them with authority labels attached.

**Bottleneck.** Two failures follow from that flattening, and they are opposite in character. **The precedence failure:** when two sources conflict, the resolution is whatever the model's training and the accidents of position produce — not what you intended. **The authority failure:** the seventh source, *environment context*, is attacker-writable (Chapter 5, Topic 12), and if it can issue instructions the model obeys, an injected string has been promoted to the top of your hierarchy.

**Objective.** An explicit precedence ordering, an explicit budget per source, and a **structural** separation between the sources that may issue directives and the sources that may only supply evidence.

**Assumptions.** The model conditions on all seven jointly. It has no native authority model beyond what training instilled and what your assembly encodes.

**Constraints.** Every instruction token is permanent budget (Topic 1) — it is paid on every turn of every run. Instructions compete with evidence for the same $B_{\mathrm{eff}}$.

**Success criteria.** Conflicts resolve as designed; no environment-sourced text ever changes what the agent is *permitted* to do (CP-1); the instruction budget is bounded and measured.

## 3. Intuition first, then formalization

### 3.1 Intuition: seven sources, two categories

The seven sources look like a ranked list. They are better understood as **two categories with a ranking inside one of them.**

**Category A — control sources.** System prompt, developer config, repository instructions, task spec, and (with a critical caveat) the user. These are authored by parties inside your trust boundary, they arrive through channels an attacker cannot write, and they *may* direct behavior.

**Category B — data sources.** Tool results, retrieved documents, file contents, web pages, sub-agent output. These are *evidence*. They may inform the model's beliefs. **They may never direct its behavior**, because an adversary can author them (Chapter 5, Topic 12).

Tool *descriptions* are the awkward middle and deserve their own line: they are Category A when you wrote them and **Category B when a third party did** (Chapter 5, Topic 2 — an imported MCP description is un-authored text your model conditions on).

The ranking *within* Category A is a real design decision (§3.2). But the boundary *between* A and B is not a ranking at all — it is a **type distinction enforced in code**, and collapsing it into "environment context has lowest priority" is the error that makes prompt injection work. Lowest priority is still *some* priority; "priority" is a quantity a persuasive string can argue with. **Data must not be on the priority scale at all.**

### 3.2 Formalization: precedence and the authority invariant

Let the sources be $\sigma_1,\ldots,\sigma_7$ and let $\operatorname{auth}(\sigma)$ be their precedence. For Category A, define a total order:

$$
\text{system} \;\succ\; \text{developer} \;\succ\; \text{repository} \;\succ\; \text{task} \;\succ\; \text{user} \quad\text{(within the user's authority scope)}.
$$

**[synthesis]** The user sits *below* system and developer because a user cannot grant themselves permissions the operator withheld — this is Chapter 5, Topic 10's principal scoping, expressed as instruction precedence. It sits *above* nothing much, and that is fine: the user's authority is bounded by their principal, and Chapter 5, Topic 10's $\alpha_u(x,s,p)$ is what enforces the bound. **Precedence text does not enforce anything; it only resolves conflicts among sources that are already permitted to speak.**

The invariant that actually protects the system is not a precedence rule:

$$
\textbf{H-1 (authority invariant):}\qquad
\forall\,\sigma\in\text{Category B}:\quad
\operatorname{auth}(\sigma)=\varnothing .
$$

**[derived from CP-1, Chapter 3, Topic 6.]** Category B sources have *no* authority — not low authority. They cannot raise it by asserting they have it. The enforcement is structural, exactly as in Chapter 5, Topic 12: **the authorization function $\alpha_u$ does not read Category B content**, so no string in a retrieved document can change what the agent is permitted to do. An injection can change what the model *proposes*; it cannot change what the harness *permits*.

$$
\textbf{H-2 (budget monotonicity):}\qquad
\text{instruction tokens are paid on \emph{every} turn.}
$$

An instruction is not a one-time cost; it is rent. This is why §3.3's altitude question is a *budget* question and not a style question.

### 3.3 The right altitude

[ECE] frames instruction authoring as finding a "Goldilocks zone" between two failure modes: hardcoded brittle logic on one side, and vague guidance that "falsely assumes shared context" on the other. The target is prose "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics."

The budget lens sharpens this into a decision rule. Instructions are permanent rent (H-2), so an instruction earns its tokens only if it changes behavior *across many turns and many tasks*. That gives a clean triage **[derived]**:

- **Applies to every task, changes behavior** → system prompt. Permanent budget, justified.
- **Applies to this repository/project** → repository instructions. Permanent within the project.
- **Applies to this task only** → task spec. Paid once per run, not per turn — cheaper than it looks.
- **Applies to one tool** → the tool's description (Chapter 5, Topic 4), *not* the system prompt. **This is the most commonly violated rule**: teams put tool guidance in the system prompt, where it is paid on every turn whether or not the tool is visible, instead of in $d_u$, where deferral (Chapter 5, Topic 6) can avoid paying for it at all.
- **Applies to one edge case** → **do not write an instruction.** [ECE]'s guidance on examples applies: prefer "a set of diverse, canonical examples that effectively portray the expected behavior" over enumerating edge cases. Edge-case instructions are the classic budget leak — each one is cheap, all of them together are the system prompt.

[ECE]'s summary rule is the one to keep: "the minimal set of information that fully outlines your expected behavior," with the caveat that "minimal does not necessarily mean short."

## 4. Architecture

```
  CATEGORY A — CONTROL (may direct behavior; you author; attacker cannot write)
  ┌──────────────────────────────────────────────────────────────────┐
  │ system      ≻ developer ≻ repository ≻ task ≻ user                │
  │ (identity,    (config,    (CLAUDE.md,  (this   (within their      │
  │  policy,       flags)      AGENTS.md)   run)    principal's scope)│
  │  altitude)                                                        │
  │                                                                   │
  │ tool descriptions d_u  ← Category A IF you wrote them             │
  └──────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                            [ WORKING CONTEXT c_t ]
                                   ▲
                                   │  wrapped, delimited, provenance-tagged
  ┌──────────────────────────────────────────────────────────────────┐
  │ tool results · retrieved docs · file contents · web pages ·       │
  │ sub-agent output · THIRD-PARTY tool descriptions                  │
  │                                                                   │
  │ H-1:  auth(σ) = ∅.  Not "low priority" — NO priority.             │
  │       α_u never reads these. (CP-1, Ch.3 T6; Ch.5 T12)            │
  └──────────────────────────────────────────────────────────────────┘
  CATEGORY B — DATA (evidence only; attacker-writable; never directs)
```

**Structural separation, per [ECE] and [GCA].** [ECE] recommends "XML tagging or Markdown headers to delineate these sections," with subdivisions like `<background_information>`, `<instructions>`, and `## Tool guidance`. This delineation does two jobs: it helps the model attend to the right section, **and** it is the marker that makes Category B content visibly *quoted* rather than *spoken*. But as Chapter 5, Topic 12 established: **delineation is a mitigation, not the boundary.** The boundary is H-1, enforced in code.

**Google's contribution — instructions as a cache-stable prefix.** [GCA] divides context into "stable prefixes (instructions, identity, summaries) and variable suffixes (latest turns, new outputs)," and recommends treating "cache-friendliness as an architectural constraint using `static instruction` primitives." The instruction hierarchy is therefore not merely a precedence structure — **it is the prefix, and its stability is worth real money** (Topic 10). An instruction that changes per turn destroys the cache for everything after it.

## 5. Grounding

- **The altitude calibration.** The "Goldilocks zone"; avoiding "overly brittle hardcoded logic versus vague guidance that falsely assumes shared context"; "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"; "the minimal set of information that fully outlines your expected behavior"; "minimal does not necessarily mean short" [ECE].
- **Structural delineation.** "XML tagging or Markdown headers to delineate these sections," with `<background_information>`, `<instructions>`, `## Tool guidance` [ECE].
- **Examples over edge cases.** Prefer "a set of diverse, canonical examples that effectively portray the expected behavior of the agent"; "examples are the 'pictures' worth a thousand words" [ECE].
- **Tools belong in the tool layer.** Tools should be "self-contained, robust to error, and extremely clear with respect to their intended use," and the named failure is "bloated tool sets that cover too much functionality or lead to ambiguous decision points about which tool to use" [ECE] — corroborating Chapter 5, Topics 4 and 15.
- **The repository-instruction pattern, in the wild.** [ECE] documents that "CLAUDE.md files are naively dropped into context up front," which is exactly the repository tier: permanent budget, project-scoped.
- **Instructions as the stable prefix.** "Stable prefixes (instructions, identity, summaries)" vs "variable suffixes"; "static instruction primitives"; cache-friendliness as "an architectural constraint" [GCA].
- **Scope by default.** "Scope context by default; agents must explicitly reach for additional information" [GCA] — the architectural statement of H-2's discipline.
- **The authority invariant's basis** is CP-1 (Chapter 3, Topic 6) and its tool-boundary application (Chapter 5, Topic 12), where the sources are explicit that permissions must not depend on attacker-writable content [CAH §5].

**Evidence gap.** **No source specifies a precedence ordering among the seven sources, nor measures what models actually do when sources conflict.** The ordering in §3.2 is a synthesis grounded in the principal-scoping requirement [CAH §5] and ordinary security practice. Whether a given model *honors* your intended precedence when sources conflict is **unmeasured and model-specific** — which is why §8 makes conflict resolution an experiment rather than an assumption.

## 6. Implementation

**Type the sources so the invariant is checkable:**

```python
class Authority(Enum):
    SYSTEM     = 100      # operator identity, policy, altitude
    DEVELOPER  = 80       # deployment configuration
    REPOSITORY = 60       # CLAUDE.md / AGENTS.md — project-scoped [ECE]
    TASK       = 40       # this run's specification
    USER       = 20       # bounded by their principal (Ch.5 T10)
    NONE       = 0        # ← CATEGORY B. Not "lowest". NONE.

@dataclass(frozen=True)
class ContextBlock:
    content: str
    authority: Authority
    source: str                       # for provenance (Topic 14)

    @property
    def is_directive_bearing(self) -> bool:
        return self.authority is not Authority.NONE

def assemble_instructions(blocks: list[ContextBlock]) -> str:
    control = [b for b in blocks if b.is_directive_bearing]
    data    = [b for b in blocks if not b.is_directive_bearing]

    control.sort(key=lambda b: b.authority.value, reverse=True)
    parts = [f"<instructions source=\"{b.source}\">\n{b.content}\n</instructions>"
             for b in control]                                   # [ECE]: XML delineation
    parts += [wrap_untrusted(b) for b in data]                   # quoted, never spoken
    return "\n\n".join(parts)
```

**The invariant, enforced where it matters** — note again that this is a *signature* constraint, checkable in one line by a reviewer (Chapter 5, Topic 12, §6):

```python
def authorize(tool: str, args: dict, ctx: Context) -> Decision:
    """H-1 / CP-1: α_u receives arguments, state, and principal. It does NOT receive
    context blocks. There is no parameter through which Category B text could arrive."""
    ...
```

**The altitude audit — because instructions are rent (H-2):**

```python
def audit_instruction_budget(system_prompt, tools, model) -> dict:
    sys_tokens = count_tokens(system_prompt, model)              # paid EVERY turn
    # The classic leak: tool guidance living in the system prompt instead of in d_u,
    # where Chapter 5's deferral could avoid paying for it entirely.
    misplaced = [t.name for t in tools if t.name in system_prompt]
    return {
        "system_tokens_per_turn": sys_tokens,
        "system_tokens_per_20_turn_run": 20 * sys_tokens,        # the real number
        "tool_guidance_in_system_prompt": misplaced,             # move these to d_u
        "fraction_of_B_eff": sys_tokens / B_EFF,                 # Topic 1
    }
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Rich system prompt | Consistent behavior across all tasks | **Rent on every turn** (H-2); crowds $B_{\mathrm{eff}}$ |
| Repository instructions | Project-scoped guidance, no per-task cost | Naively dropped in up front [ECE] — pure permanent budget |
| Tool guidance in $d_u$ (not system) | Deferral can avoid the cost entirely (Ch.5 T6) | Must be maintained per-tool |
| Canonical examples [ECE] | High behavior-shaping per token | Tokens; examples can over-anchor |
| Edge-case instructions | Handles the edge case | **The budget leak**; use examples instead [ECE] |
| XML/Markdown delineation | Attention structure; quoting of Category B | A few tokens; **not a security boundary** |
| Stable instruction prefix | Prompt-cache hits [GCA] (Topic 10) | Instructions cannot vary per turn without cache cost |

**The trade teams get backwards.** Instructions *feel* free because they are written once. They are the most expensive tokens in the system, because they are paid on **every turn of every run** — while retrieved evidence, which feels expensive, is often paid once. A 2,000-token system prompt in a 20-turn run costs 40,000 tokens; the document you agonized over including costs 800. **Audit the rent, not the one-time purchase.**

## 8. Experiments

**Conflict-resolution measurement — the experiment that tests §3.2's ordering rather than assuming it.** Construct tasks in which two sources give *contradictory* directives (system says "always cite sources"; user says "don't cite anything"; repository says "cite only external claims"). Measure which source the model follows, per pair.

- **Metric:** per-pair precedence-adherence rate, with Wilson intervals.
- **Finding to expect:** your intended ordering is **not** what the model does, in at least one pair. This is why it is measured, not assumed — and it is unmeasured in every source available to this chapter.
- **Consequence:** where the model's behavior diverges from your intended precedence and the divergence matters for safety, **the resolution must move from prose into code** (a validator, an admission check), because a precedence you cannot enforce is a precedence you do not have.

**Injection test against H-1 (the important one).** Place directive-bearing payloads in every Category B source: retrieved documents, tool results, file contents, third-party tool descriptions, sub-agent output. Two metrics, and their separation is the point (Chapter 5, Topic 12, §8):

- **Follow rate** — the model acted on the injected directive. **Expect nonzero. This measures the model.**
- **Escalation rate** — the injection caused an action *beyond the user's own authority*. **Target zero.** This measures whether H-1 is actually enforced in code. Report with the zero-failure bound $p_{\max}=1-(1-\gamma)^{1/n}$ and its $n$ (Chapter 1, Topic 12).

**Altitude ablation.** Vary system-prompt specificity across three arms: brittle/hardcoded, right-altitude, vague. Metrics: task completion $G$, **system tokens per turn**, and generalization to held-out task types. [ECE]'s claim is that both extremes lose; test it on your workload, since the altitude that is "right" depends on your task distribution.

**Budget ablation.** Move tool guidance from the system prompt into $d_u$. Predicted signature: identical $G$, **lower tokens per turn**, and — if you also defer (Chapter 5, Topic 6) — lower still. If $G$ drops, the guidance was doing cross-tool work and belongs in the system prompt after all. That is a finding.

**Statistics.** Paired designs; McNemar for adherence contrasts; task-clustered bootstrap; Holm across arms (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Environment context treated as low-priority instruction rather than as non-instruction.** The injection vector. "Low priority" is a quantity a persuasive string can argue with; $\varnothing$ authority is not. Mitigation: H-1, enforced in $\alpha_u$'s signature.
- **Precedence assumed, never measured.** The model resolves conflicts its own way and nobody checked. Mitigation: §8's conflict measurement; move safety-relevant resolutions into code.
- **The system prompt as a junk drawer.** Every edge case, every tool's usage notes, every past incident's lesson accreted into permanent per-turn rent. **This is the instruction analogue of Chapter 5, Topic 15's tool accretion, with the same one-at-a-time-justification structure.** Mitigation: the altitude triage (§3.3); the budget audit (§6); prefer canonical examples to edge-case rules [ECE].
- **Tool guidance in the system prompt.** Paid every turn even when the tool is not visible; defeats deferral. Mitigation: put it in $d_u$ (Chapter 5, Topic 4).
- **Brittle hardcoded logic** — the failure [ECE] names on one side of the Goldilocks zone; the prompt becomes an unmaintainable decision tree. Mitigation: heuristics plus examples.
- **Vague guidance that "falsely assumes shared context"** [ECE] — the other side; the model does not know what you know (Chapter 5, Topic 3's new-hire framing, applied to instructions).
- **Unstable prefix.** Instructions that vary per turn (a timestamp, a turn counter) destroy the prompt cache for everything downstream [GCA]. Mitigation: keep variability in the suffix (Topic 10).
- **Edge case — the user *is* the adversary.** Then user-tier authority is exactly as dangerous as it is broad, and the bound is their principal, not their tier (Chapter 5, Topic 10). Precedence does not help here; scoping does.
- **Edge case — third-party tool descriptions.** Category B text sitting in what looks like a Category A slot. Mitigation: rewrite on import (Chapter 5, Topic 4, §9); never let an imported description carry directives you have not read.
- **Open limitation.** **No source measures how models resolve inter-source conflicts.** The precedence ordering here is a synthesis; its *realization* in any given model is unmeasured and version-dependent (Chapter 4, Topic 13). Treat your ordering as a design intent that must be verified per model, not as a property you get for free.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Effective instructions occupy a "Goldilocks zone" between brittle hardcoding and vague guidance that "falsely assumes shared context" [ECE].
2. The target is "the minimal set of information that fully outlines your expected behavior," where "minimal does not necessarily mean short" [ECE].
3. Structural delineation (XML tags, Markdown headers) is the recommended organization [ECE].
4. Canonical examples beat edge-case enumeration — "examples are the 'pictures' worth a thousand words" [ECE].
5. Instructions are the *stable prefix* and cache-friendliness is "an architectural constraint" [GCA].
6. Repository instructions are dropped in up front and are therefore permanent budget [ECE].
7. **No source specifies or measures inter-source precedence** — that ordering is this book's synthesis, and its realization must be measured per model.

**Decision rules.**
- **Category B has no authority — not low authority.** Enforce it in $\alpha_u$'s signature, not in prose.
- **An instruction earns permanent budget only if it changes behavior across many turns and tasks.** Otherwise it belongs in the task spec, the tool description, or nowhere.
- **Tool guidance goes in $d_u$**, never the system prompt.
- **Edge cases get examples, not rules** [ECE].
- **Keep the instruction prefix stable**, or you are paying for cache misses you cannot see (Topic 10).
- **Measure conflict resolution.** If the model does not honor your precedence where it matters, move the resolution into code.

**Production implications.**
1. Run the instruction-budget audit (§6): system tokens × turns is the real number, and it is usually a shock.
2. Move tool guidance out of the system prompt this week; it is free budget with no behavior cost (verify with §8's budget ablation).
3. Run the injection test against H-1 and report **escalation rate** with its zero-failure bound — follow rate is the model's number, escalation rate is yours.
4. Treat the system prompt like the tool surface: it accretes, one justified line at a time, and needs an owner and a gate (Chapter 5, Topic 15's lesson, applied to prose).

**Connections.** Topic 1's budget is what instructions pay rent from; Topic 3 assembles the hierarchy; Topic 8 is what happens when Category B attacks it; Topic 10 depends on the instruction prefix being stable; Topic 11's compaction must preserve durable instructions or lose them (the documented compaction risk, Chapter 3, Topic 4); Topic 12 budgets across the tiers. Chapter 5, Topic 12's untrusted-content boundary is H-1's tool-side instance; Chapter 5, Topic 10's principal scoping is what bounds the user tier.

## Sources

[ECE] Anthropic, "Effective context engineering for AI agents" — the "Goldilocks zone" for system prompts; "overly brittle hardcoded logic versus vague guidance that falsely assumes shared context"; "specific enough to guide behavior effectively, yet flexible enough to provide the model with strong heuristics"; "the minimal set of information that fully outlines your expected behavior"; "minimal does not necessarily mean short"; "XML tagging or Markdown headers to delineate these sections" with `<background_information>`, `<instructions>`, `## Tool guidance`; canonical examples over edge cases ("examples are the 'pictures' worth a thousand words"); tools "self-contained, robust to error, and extremely clear with respect to their intended use" and the failure of "bloated tool sets"; `CLAUDE.md` files "naively dropped into context up front" — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — "stable prefixes (instructions, identity, summaries)" vs "variable suffixes (latest turns, new outputs)"; `static instruction` primitives; "treat cache-friendliness as an architectural constraint"; "scope context by default; agents must explicitly reach for additional information" — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §5 — permissions must depend on arguments, environment state, data sensitivity, and expected side effects, not on attacker-writable content; the basis for H-1's enforcement in code
