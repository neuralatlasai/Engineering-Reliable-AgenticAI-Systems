# Topic 12 — Repository Memory: `AGENTS.md`, `CLAUDE.md`, Rules, Skills, Plans, Tests, and Architecture Records

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** Repository memory — durable, curated *knowledge* (Topic 1) that lives in the codebase and is loaded to guide the agent: `CLAUDE.md` / `AGENTS.md`, path-scoped rules, skills, plans, tests, and architecture records. This is the *knowledge* corner of Topic 1's taxonomy, made concrete against a shipped model [CCM].

**Prerequisites.** Topic 1 (knowledge = authoritative, curated, durable); Chapter 6, Topic 2 (the instruction hierarchy — repository memory is a Category A source); Chapter 6, Topic 10 (prompt caching — repository memory is the stable prefix); Chapter 6, Topic 11 (compaction survival).

**Terminology.** *Repository memory*: curated knowledge in the codebase. *`CLAUDE.md`*: "persistent instructions you write to give Claude context" [CCM]. *Auto-memory*: "notes Claude writes itself" [CCM] (Topic 6's write path). *Rules*: path-scoped instruction files [CCM]. *Skills*: on-demand workflow modules.

**Boundaries.** Inside: the repository-knowledge model, its load hierarchy, precedence, and the guidance-vs-enforcement boundary. Outside: auto-memory *writes* (Topic 6); the instruction *budget* (Chapter 6, Topic 2); enforcement hooks (Chapter 5, Topic 10; Chapter 12).

**Exclusions.** No IDE-integration tutorial.

**Outcomes.** The reader can structure repository knowledge with correct scope and precedence, keep it from bloating the context, and know what it can and cannot enforce.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** An agent working in a codebase needs durable, project-specific knowledge: build commands, conventions, architecture, "always do X" rules. This knowledge is *curated* (a human wrote it), *authoritative* (the agent treats it as ground truth), and *durable* (it persists across every session) — it is Topic 1's *knowledge*, distinct from learned memory. It must be loaded into every session, scoped correctly (org-wide vs project vs personal), and kept concise (it is permanent context rent, Chapter 6, Topic 2).

**Bottleneck.** Repository knowledge has three failure modes, each documented [CCM]. **Bloat:** it grows unbounded, consuming context and — [CCM] is explicit — reducing adherence: "Longer files consume more context and reduce adherence" [CCM]. **Conflict:** multiple files (org, user, project, nested) give contradictory guidance, and "if two rules contradict each other, Claude may pick one arbitrarily" [CCM]. **Guidance mistaken for enforcement:** the knowledge is "context, not enforced configuration" [CCM] — relying on a `CLAUDE.md` instruction to *guarantee* a behavior fails, because "there's no guarantee of strict compliance" [CCM].

**Objective.** Repository knowledge structured with correct scope and precedence, bounded to preserve adherence, path-scoped where it applies narrowly, and used for *guidance* — with enforcement delegated to hooks (Chapter 5, Topic 10; Chapter 12).

**Assumptions.** Repository knowledge is curated by humans, authoritative, and loaded every session. It is context, not enforcement [CCM].

**Constraints.** It is permanent context rent (Chapter 6, Topic 2's H-2). Adherence falls with size [CCM]. It cannot enforce [CCM].

**Success criteria.** Knowledge is correctly scoped and precedence-ordered; it stays concise (adherence preserved); path-scoped rules load only when relevant; enforcement uses hooks, not instructions.

## 3. Intuition first, then formalization

### 3.1 Intuition: curated knowledge, loaded by hierarchy, that guides but does not enforce

Repository memory is Topic 1's *knowledge* — curated, authoritative, durable — and it has three properties that distinguish it from the learned memory of Topics 5–9:

- **It is written by humans, not the agent.** [CCM] draws exactly this line: `CLAUDE.md` is "instructions you write," auto-memory is "notes Claude writes itself." The `CLAUDE.md` half is *knowledge* (authored, authoritative); the auto-memory half is *learned memory* (Topic 6's write path). This topic is the authored half.
- **It loads by a scope hierarchy.** [CCM]'s four scopes — managed policy (org), user, project, local — load "from broadest scope to most specific" [CCM], nesting exactly like Topic 2's state scopes (`app:`/`user:`/session). Org-wide knowledge, then personal, then project, then local, each more specific overriding by position.
- **It guides but does not enforce.** [CCM] is emphatic and repeated: `CLAUDE.md` is "context, not enforced configuration"; "there's no guarantee of strict compliance"; "To block an action regardless of what Claude decides, use a PreToolUse hook instead" [CCM]. **This is Chapter 5, Topic 10's principle — guarantees come from code, not from asking the model — applied to repository knowledge.**

The intuition that governs its design: **repository knowledge is the stable, curated, authoritative context that shapes every session — so it must be concise (adherence), correctly scoped (precedence), and never relied on for guarantees (it is guidance).** Bloat kills adherence; conflict makes precedence arbitrary; and mistaking guidance for enforcement is the error that lets a "never do X" instruction be ignored.

### 3.2 Formalization: the load hierarchy and the three invariants

Repository knowledge loads by a scope hierarchy with a precedence order **[grounded in [CCM]]**. The scopes, broadest to most specific [CCM]:

$$
\text{managed policy (org)}\ \prec\ \text{user}\ \prec\ \text{project}\ \prec\ \text{local}\ \prec\ \text{nested (subdirectory)}.
$$

"Content is ordered from the filesystem root down to your working directory," so "instructions closer to where you launched Claude are read last" [CCM] — later-read, more-specific instructions take precedence by position. Three invariants **[grounded in [CCM]]**:

$$
\textbf{K-1 (precedence by specificity):}\quad
\text{more-specific scope overrides broader}^\dagger;\ \text{but contradictions across files are resolved \emph{arbitrarily} by the model — so avoid them.}
$$

$^\dagger$ The dagger is the critical caveat: [CCM] says precedence is by load order, but *contradictions* are not cleanly resolved — "if two rules contradict each other, Claude may pick one arbitrarily" [CCM]. **Precedence orders non-conflicting guidance; it does not reliably resolve contradictions.** So K-1's real force is: *do not create contradictions* (audit for them: "review your CLAUDE.md files… periodically to remove outdated or conflicting instructions" [CCM]), because precedence will not save you.

$$
\textbf{K-2 (conciseness preserves adherence):}\quad
\text{adherence falls with size:}\ \text{"Longer files consume more context and reduce adherence" [CCM]};\ \text{target } \le 200\ \text{lines [CCM]}.
$$

K-2 is the bloat invariant, and it is a *measured-behavior* claim by the vendor: longer files reduce adherence. The mitigations [CCM]: keep it concise; use path-scoped rules so instructions "load only when Claude works with matching files" [CCM]; and note that imports "help organization but do not reduce context, since imported files load at launch" [CCM] — **imports organize, they do not shrink the budget.**

$$
\textbf{K-3 (guidance, not enforcement):}\quad
\text{repository knowledge is "context, not enforced configuration" [CCM];}\ \text{guarantees require hooks, not instructions.}
$$

K-3 is the enforcement boundary. A behavior that must be *guaranteed* (block a command, run a step before every commit) cannot live in `CLAUDE.md` — "there's no guarantee of strict compliance" [CCM]. It must be a PreToolUse hook [CCM] (a deterministic gate, Chapter 5, Topic 10). **The `CLAUDE.md` shapes behavior; the hook enforces it — and confusing the two means relying on guidance for a guarantee.**

### 3.3 Repository knowledge is the cacheable, compaction-surviving stable prefix

Two properties tie repository memory to Chapter 6's context engineering **[grounded in [CCM], [GCA]]**:

- **It is the stable prefix (Chapter 6, Topic 10).** Repository knowledge is loaded "at the start of every session" [CCM] and is stable across turns — it is exactly [GCA]'s "stable prefixes (instructions, identity, summaries)" that the prompt cache amortizes. **Repository knowledge belongs in the cache prefix**, and its stability is worth money (Chapter 6, Topic 10) — which is another reason not to put per-turn-varying content in it.
- **It survives compaction by re-injection (Chapter 6, Topic 11).** [CCM] documents this precisely: "Project-root CLAUDE.md survives compaction: after `/compact`, Claude re-reads it from disk and re-injects it into the session" [CCM]. This is Topic 4's T-1 (durable instructions re-injected after compaction) and Chapter 6, Topic 11's R-1, shipped — and the caveat: "Nested CLAUDE.md files in subdirectories are not re-injected automatically" [CCM], so only the *root* knowledge is guaranteed to survive; nested knowledge reloads only "the next time Claude reads a file in that subdirectory" [CCM].

The consequence **[synthesis]**: **repository knowledge is durable *because* it is re-read from disk, not because it survives in the context.** It is authoritative memory (Topic 1, K-2 — not evictable) whose durability mechanism is *re-loading from the source of truth (the file)*, which is exactly why it survives compaction: the file is the authority, the context is a loaded copy (a cache, Topic 1). This is Topic 3's log-plus-projection pattern again — the file is authoritative, the loaded context is the projection.

## 4. Architecture

```
   LOAD HIERARCHY (broadest → most specific, [CCM])
   ┌──────────────────────────────────────────────────────────────────┐
   │ MANAGED POLICY (org)   /etc/claude-code/CLAUDE.md  ← IT/DevOps      │  cannot be excluded
   │ USER                   ~/.claude/CLAUDE.md         ← personal       │
   │ PROJECT                ./CLAUDE.md or ./.claude/   ← team, in VCS    │
   │ LOCAL                  ./CLAUDE.local.md           ← personal, gitignored │
   │ NESTED                 subdir/CLAUDE.md            ← on-demand       │
   │ PATH-SCOPED RULES      .claude/rules/*.md (paths:) ← when files match │
   └───────────────────────────┬────────────────────────────────────────┘
                               │  concatenated, root→cwd, more-specific read LAST (K-1)
                               ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │ STABLE PREFIX (Ch.6 T10) — cached, loaded every session            │
   │ ≤ 200 lines for adherence (K-2). Imports (@path) organize, not     │
   │ shrink. Path-scoped rules load only on matching files.             │
   └───────────────────────────┬────────────────────────────────────────┘
                               │  survives compaction by RE-INJECTION from disk (§3.3)
                               ▼          (root only; nested reloads on file access)
                        guides the agent — GUIDANCE, not enforcement (K-3)
                               │
                               ▼
   HARD GUARANTEE needed? → PreToolUse HOOK, not a CLAUDE.md instruction (K-3, Ch.5 T10)

   SKILLS: on-demand workflow modules — load "when invoked or relevant", NOT every session
   PLANS / TESTS / ARCH RECORDS: durable knowledge artifacts (Topic 10), referenced not inlined
```

**The skill/rule/CLAUDE.md distinction is a budget architecture.** [CCM] draws it explicitly: `CLAUDE.md` for "facts Claude should hold in every session"; path-scoped rules for instructions that "load only when Claude works with matching files"; skills for "task-specific instructions that don't need to be in context all the time," loading "when you invoke them or when Claude determines they're relevant" [CCM]. **This is Chapter 6, Topic 6's deferred-loading, applied to knowledge:** always-needed knowledge is permanent prefix (`CLAUDE.md`); conditionally-needed knowledge is deferred (rules load on path match; skills load on relevance). **The three tiers are a budget decision — how much knowledge to pay for on every turn vs load on demand** — and putting a one-file-type rule in `CLAUDE.md` is the same bloat error as putting tool guidance there (Chapter 6, Topic 2).

## 5. Grounding

- **Two memory systems, knowledge vs learned:** `CLAUDE.md` ("instructions you write") vs auto-memory ("notes Claude writes itself"); both "loaded at the start of every conversation" [CCM]. This topic is the authored (knowledge) half; Topic 6 is the written (learned) half.
- **The four scopes and load order:** managed policy (org, "cannot be excluded"), user (`~/.claude/CLAUDE.md`), project (`./CLAUDE.md` or `./.claude/CLAUDE.md`), local (`./CLAUDE.local.md`, gitignored); loaded "from broadest scope to most specific," root→cwd, "closer to where you launched Claude are read last" [CCM] — K-1.
- **Adherence falls with size:** "Longer files consume more context and reduce adherence"; target "under 200 lines"; path-scoped rules to "load only when Claude works with matching files"; imports "do not reduce context, since imported files load at launch" [CCM] — K-2.
- **Guidance, not enforcement:** "context, not enforced configuration"; "there's no guarantee of strict compliance"; "To block an action regardless of what Claude decides, use a PreToolUse hook instead" [CCM] — K-3.
- **Conflict resolution is arbitrary:** "if two rules contradict each other, Claude may pick one arbitrarily"; "review… periodically to remove outdated or conflicting instructions" [CCM] — K-1's dagger.
- **Compaction survival by re-injection:** "Project-root CLAUDE.md survives compaction: after `/compact`, Claude re-reads it from disk and re-injects it"; nested files "are not re-injected automatically" [CCM] — §3.3, Topic 4's T-1, Chapter 6, Topic 11's R-1.
- **`AGENTS.md` interop:** "Claude Code reads `CLAUDE.md`, not `AGENTS.md`"; the pattern is a `CLAUDE.md` that imports `@AGENTS.md` so "both tools read the same instructions" [CCM] — cross-tool knowledge sharing.
- **Path-scoped rules:** `.claude/rules/*.md` with `paths:` frontmatter, loading "only when Claude is working with files matching the specified patterns" [CCM] — deferred knowledge.
- **Skills load on demand:** "task-specific instructions that don't need to be in context all the time… load when you invoke them or when Claude determines they're relevant" [CCM] — the deferred tier.
- **It is the stable prefix (Chapter 6, Topic 10) and Category A (Chapter 6, Topic 2):** repository knowledge is the cacheable instruction hierarchy.
- **Comments stripped to save context:** "Block-level HTML comments… are stripped before the content is injected" [CCM] — maintainer notes cost no tokens.

**Evidence gap.** This topic is unusually well-grounded: the load hierarchy, scopes, precedence, size/adherence relationship, compaction survival, and guidance-vs-enforcement boundary are all **documented product behavior** [CCM] — dated and Claude-Code-specific (Chapter 4, Topic 13). The one *measured-behavior* claim ("longer files reduce adherence" [CCM]) is a vendor assertion without a published curve — the direction is sourced, the magnitude is not (like Chapter 6, Topic 1's context rot). The synthesis is limited: mapping [CCM]'s model onto Topic 1's knowledge category and Chapter 6's prefix/deferred-loading is **[synthesis]**, but the mechanics themselves are documented, not derived.

## 6. Implementation

**Structure repository knowledge by scope and tier (§4):**

```
your-project/
├── CLAUDE.md                    # PROJECT knowledge, ≤200 lines (K-2), in VCS, team-shared
│                                #   build/test commands, conventions, architecture, "always X"
├── CLAUDE.local.md              # LOCAL, gitignored — personal sandbox URLs, test data
├── .claude/
│   └── rules/
│       ├── testing.md           #   loaded every session (no paths:) — same priority as CLAUDE.md
│       └── api.md               #   paths: ["src/api/**/*.ts"] — DEFERRED, loads on file match
└── AGENTS.md                    # cross-tool — CLAUDE.md imports @AGENTS.md [CCM]

# ~/.claude/CLAUDE.md            # USER knowledge — personal prefs, all projects
# /etc/claude-code/CLAUDE.md     # MANAGED POLICY — org-wide, cannot be excluded [CCM]
```

**The conciseness + conflict audit (K-1, K-2):**

```python
def audit_repository_knowledge(files) -> dict:
    problems = []
    for f in files:
        if f.line_count > 200:                          # K-2: adherence falls [CCM]
            problems.append(f"{f.path}: {f.line_count} lines >200 — reduces adherence; "
                            f"move file-specific content to path-scoped rules [CCM]")
    # K-1 dagger: contradictions are resolved ARBITRARILY [CCM] — find and remove them.
    for a, b in itertools.combinations(files, 2):
        if contradicts(a, b):
            problems.append(f"{a.path} and {b.path} contradict — Claude picks arbitrarily [CCM]. "
                            f"Precedence does NOT reliably resolve this. Remove the conflict.")
    return {"knowledge_problems": problems}
```

**Guidance vs enforcement (K-3) — the boundary that matters:**

```python
# GUIDANCE — shapes behavior, no guarantee [CCM]. Lives in CLAUDE.md.
# CLAUDE.md:
#   - Use 2-space indentation
#   - API handlers live in src/api/handlers/
#   - Prefer pnpm over npm

# ENFORCEMENT — a guarantee. Lives in a HOOK, not CLAUDE.md (K-3, Ch.5 T10).
# A "never push to main" that must be GUARANTEED:
def pre_tool_use_hook(tool_call):
    """[CCM]: 'To block an action regardless of what Claude decides, use a PreToolUse hook.'
    CLAUDE.md 'never push to main' is GUIDANCE — the model may not comply. This ENFORCES."""
    if tool_call.command_matches("git push origin main"):
        return HookResult.deny("pushing to main is blocked by policy")
```

**Deferred knowledge — path-scoped rules and skills (§4):**

```markdown
<!-- .claude/rules/api.md — DEFERRED: loads only on matching files (K-2 budget) -->
---
paths:
  - "src/api/**/*.ts"
---
# API Development Rules
- All endpoints must include input validation
- Use the standard error response format
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Concise `CLAUDE.md` (≤200) | **Higher adherence** [CCM] | Less content; must move detail to rules/skills |
| Large `CLAUDE.md` | Everything in one place | **Lower adherence + more rent** (K-2, Ch.6 T2) |
| Path-scoped rules | Loads only when relevant (K-2 budget) | More files; per-file organization |
| Skills (on-demand) | No per-session cost | Loads only when invoked/relevant — may miss |
| Imports (`@path`) | Organization | **Do not reduce context** — load at launch [CCM] |
| More-specific scope | Overrides broader by position (K-1) | Contradictions resolved arbitrarily — audit them |
| `CLAUDE.md` for enforcement | Simple | **No guarantee** [CCM] — use a hook (K-3) |

**The trade K-2 forces: conciseness vs coverage.** More repository knowledge covers more cases and — [CCM] states as measured behavior — *reduces adherence*. This is a genuine tension with a documented direction: bigger files are followed less reliably. The resolution [CCM] provides is *tiering*: keep `CLAUDE.md` to the always-needed essentials (≤200 lines), push file-specific content to path-scoped rules (load on match), and push task-specific procedures to skills (load on relevance). **The knowledge is not deleted — it is deferred**, exactly as Chapter 6, Topic 6 defers tool definitions. **Conciseness is not about having less knowledge; it is about paying for less of it on every turn.**

**The K-3 trade is not really a trade — it is a category correction.** Using `CLAUDE.md` for enforcement *feels* simpler than writing a hook, but it does not enforce — it is "context, not enforced configuration" [CCM]. So the "trade" (simple instruction vs hook infrastructure) is illusory: the instruction does not buy the guarantee it appears to. **For anything that must be guaranteed, the hook is not the expensive option — it is the only option that works**, and the `CLAUDE.md` version is a guarantee that silently is not one.

## 8. Experiments

**The adherence-vs-size measurement (K-2) — the one [CCM] asserts and does not quantify.** Vary `CLAUDE.md` size (concise vs bloated with the same essential rules plus filler); measure instruction adherence (does the agent follow the essential rules?). **[CCM] claims adherence falls with size; measure your curve** — the direction is sourced, the magnitude is yours. This tells you where your adherence cliff is.

**The conflict-arbitrariness test (K-1 dagger).** Introduce a contradiction across two knowledge files; run the same task many times; measure which rule the agent follows. **[CCM] says "arbitrarily" — confirm the non-determinism**, which is the evidence that precedence does not resolve contradictions and you must remove them.

**The guidance-vs-enforcement test (K-3) — the safety one.** Put a "never do X" rule in `CLAUDE.md`; attempt to induce X; measure the compliance rate. **It will be <100% [CCM]** — "no guarantee of strict compliance." Then move X to a PreToolUse hook; measure again. **The hook is 100%; the instruction is not.** This experiment is the concrete proof of K-3, and it is the difference between a policy that holds and one that mostly holds.

**The deferred-loading budget ablation.** `CLAUDE.md`-everything vs tiered (concise `CLAUDE.md` + path-scoped rules + skills); measure per-turn context tokens and adherence. **Prediction: tiering lowers per-turn tokens and raises adherence** (smaller always-loaded set) — Chapter 6, Topic 6's deferral, at the knowledge layer.

**The compaction-survival test (§3.3).** Trigger `/compact`; verify the root `CLAUDE.md` re-injects [CCM] and nested files do not (until a file in their directory is read). **This is Topic 4's T-1 / Chapter 6, Topic 11's R-1 test, for repository knowledge** — confirm your durable knowledge actually survives.

**Statistics.** Wilson on adherence and compliance rates; the compliance-under-enforcement should be exactly 1.0 (a hook is deterministic); report $n$ (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Bloat.** `CLAUDE.md` grows; adherence falls [CCM]; permanent rent rises (Chapter 6, Topic 2). Mitigation: ≤200 lines; tier to rules/skills; the size audit.
- **Contradiction.** Conflicting files; the agent "may pick one arbitrarily" [CCM]. Mitigation: audit and remove contradictions (K-1 dagger); precedence does not save you.
- **Guidance mistaken for enforcement.** A "never do X" instruction relied on as a guarantee; the agent does X. **The safety-critical failure.** Mitigation: K-3 — hooks for guarantees, `CLAUDE.md` for guidance [CCM].
- **Import bloat illusion.** Splitting into `@path` imports believing it shrinks context; it does not — "imported files load at launch" [CCM]. Mitigation: path-scoped rules (which *do* defer), not imports, for budget.
- **Nested knowledge lost after compaction.** Only the root `CLAUDE.md` re-injects; nested files do not until their directory is read [CCM]. Mitigation: put must-survive knowledge in the root; know nested is reload-on-access.
- **Org policy assumed excludable.** Managed-policy `CLAUDE.md` "cannot be excluded" [CCM] — a team trying to override org knowledge cannot. Mitigation: understand the hierarchy; org policy is authoritative.
- **Skill never loads.** On-demand knowledge the agent does not know to invoke. Mitigation: skills load "when Claude determines they're relevant" [CCM] — the trigger description must afford relevance (Chapter 5, Topic 4), like a tool.
- **Monorepo cross-team pollution.** Other teams' `CLAUDE.md` files loaded. Mitigation: `claudeMdExcludes` [CCM].
- **Edge case — the fast-changing convention.** A convention that changes often does not belong in the *cached* prefix (Chapter 6, Topic 10) — it churns the cache. Mitigation: stable knowledge in `CLAUDE.md`; volatile guidance in the conversation or a hook.
- **Open limitation.** This topic is well-documented [CCM] — mechanics are product behavior, not synthesis. The one **[unquantified]** claim is "adherence falls with size" (direction sourced, magnitude not — measure locally, §8). Everything is dated and Claude-Code-specific (Chapter 4, Topic 13); other agents' repository-memory models differ, and the *concepts* (scoped curated knowledge, guidance-not-enforcement, deferred loading) generalize while the *specifics* (200 lines, file paths) do not.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. `CLAUDE.md` (curated instructions) and auto-memory (learned notes) are two systems, both loaded every session [CCM].
2. Four scopes load broadest→specific (managed policy, user, project, local); root→cwd; more-specific read last [CCM].
3. "Longer files consume more context and reduce adherence"; target ≤200 lines [CCM] — a measured-direction claim.
4. Contradictions are resolved "arbitrarily"; audit and remove them [CCM].
5. Repository knowledge is "context, not enforced configuration"; "no guarantee of strict compliance"; hooks enforce [CCM].
6. Root `CLAUDE.md` survives compaction by re-injection; nested files do not [CCM].
7. Imports organize but do not reduce context; path-scoped rules and skills defer [CCM].

**Decision rules.**
- **`CLAUDE.md` is curated knowledge — concise (≤200 lines), authoritative, guidance-only.**
- **Tier knowledge by need:** always → `CLAUDE.md`; per-path → path-scoped rules; per-task → skills. Do not put file-specific rules in `CLAUDE.md`.
- **Remove contradictions** — precedence resolves them arbitrarily (K-1 dagger).
- **Guarantees use hooks, not instructions** (K-3) — `CLAUDE.md` cannot enforce.
- **Imports organize; only path-scoped rules and skills defer** the budget.
- **Must-survive knowledge goes in the root `CLAUDE.md`** (re-injected after compaction).

**Production implications.**
1. Audit `CLAUDE.md` size and conflicts (§6); bloat costs adherence [CCM] and rent (Chapter 6, Topic 2).
2. Run the guidance-vs-enforcement test (§8); a "never do X" in `CLAUDE.md` is <100% — move safety rules to hooks.
3. Tier your knowledge; per-turn context and adherence both improve (Chapter 6, Topic 6 at the knowledge layer).
4. Verify compaction survival (§8); confirm root re-injects and know nested does not (Topic 4, Chapter 6, Topic 11).

**Connections.** This topic is Topic 1's *knowledge* category, made concrete. It is Chapter 6, Topic 2's instruction hierarchy (Category A, the stable prefix), Chapter 6, Topic 10's cache prefix, and Chapter 6, Topic 11's compaction-surviving durable instruction (Topic 4's T-1). Its guidance-vs-enforcement boundary (K-3) is Chapter 5, Topic 10 and Chapter 12. Its deferred tiers (rules, skills) are Chapter 6, Topic 6's deferred loading. Auto-memory (the learned half) is Topic 6; plans/tests/architecture records as artifacts are Topic 10. Skills as agent-produced knowledge connect to Chapter 5, Topic 8's `./skills/`.

## Sources

[CCM] Claude Code memory model — `CLAUDE.md` (curated instructions) vs auto-memory (learned notes), both loaded every session; the four scopes (managed policy at `/etc/claude-code/CLAUDE.md` "cannot be excluded", user `~/.claude/CLAUDE.md`, project `./CLAUDE.md`/`./.claude/CLAUDE.md`, local `./CLAUDE.local.md`) loaded "broadest scope to most specific," root→cwd, "closer to where you launched Claude are read last"; "Longer files consume more context and reduce adherence," target "under 200 lines"; "if two rules contradict each other, Claude may pick one arbitrarily," "review… periodically to remove outdated or conflicting instructions"; "context, not enforced configuration," "no guarantee of strict compliance," "To block an action regardless of what Claude decides, use a PreToolUse hook instead"; "Project-root CLAUDE.md survives compaction: after `/compact`, Claude re-reads it from disk and re-injects it," nested files "not re-injected automatically"; `@path` imports (depth 4) "help organization but do not reduce context, since imported files load at launch"; path-scoped rules (`.claude/rules/*.md` with `paths:` frontmatter) loading "only when Claude works with matching files"; skills loading "when you invoke them or when Claude determines they're relevant"; `AGENTS.md` interop via `@AGENTS.md` import; `claudeMdExcludes`; HTML comments stripped before injection — https://code.claude.com/docs/en/memory
[GCA] Google, "Architecting an efficient, context-aware multi-agent framework for production" — "stable prefixes (instructions, identity, summaries)" — repository knowledge as the cacheable prefix — https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
[ECE] Anthropic, "Effective context engineering for AI agents" — `CLAUDE.md` "naively dropped into context up front" as durable project knowledge — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
