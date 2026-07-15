# Topic 13 — Long-Running Branch Management, Worktrees, Merge Discipline, and Conflict Resolution

## 1. Scope, prerequisites, terminology, boundaries, outcomes

This topic covers the *code-specific* slice of long-horizon execution that intersects checkpointing: how a long-running coding agent (or several) manages **branches**, **worktrees**, and **merges** so that parallel or extended work stays isolated, integrable, and recoverable. Git is already the chapter's checkpoint substrate (Topic 8) and artifact store (Topic 6); this topic is about using its *branching* model to isolate long-running work and its *merge* model to integrate it without corruption.

The chapter's scope file flagged this as the intersection of long-running execution with coding-agent concerns (Chapter 11 owns the full coding-agent story). Here we cover only what long-horizon reliability demands: keeping the main line always-green while extended work proceeds on branches, running multiple agents on isolated worktrees, and resolving the conflicts that arise.

**Prerequisites.** Git as journal/checkpoint substrate and artifact store (Topics 5, 6, 8); the single-writer / lease discipline (Topic 10); parallel exploration and the isolation logic (Chapter 9 [MAR]); "leave the environment in a clean state" (Topic 3, [LRH]); the initializer/worker split (Topic 3).

**Terminology.**
- **Branch** — a named line of development; an isolated sequence of commits that can diverge from and later merge into the main line.
- **Worktree** — a *separate working directory* attached to the same repository, allowing multiple branches to be checked out and worked on *simultaneously* in isolated filesystem contexts (git's `git worktree`).
- **Main line (trunk)** — the branch representing integrated, verified state; kept always-green (builds + acceptance passes).
- **Merge discipline** — the rules governing when and how a branch integrates into the main line (verified before merge, small merges, conflict handling).
- **Conflict** — divergent edits to the same code region on two branches that git cannot auto-merge, requiring resolution.

**Boundary.** This topic is the *long-running / checkpointing* view of branches. It does **not** cover the full coding-agent loop (plan/edit/compile/test/patch — Chapter 11), patch semantics and diff review (Chapter 11), or CI/CD execution (Chapter 11/14). It uses git's model as the mechanism because [LRH] does; the principles (isolation, verify-before-integrate, small merges) generalize to any versioned artifact store.

**Outcome.** You will be able to isolate long-running or parallel agent work on branches/worktrees, keep the main line always-green with a verify-before-merge discipline, run multiple agents without filesystem collision, and handle merge conflicts as a recovery case (Topic 11).

## 2. Problem, objective, assumptions, constraints, success criteria

**Problem.** A long coding run accumulates many changes across many sessions. If all of them land directly on the main line, three things break: (1) a bad change corrupts the main line, and every subsequent session builds on breakage (Topic 12's coverage/quality collapse); (2) a crash mid-change leaves the main line in a broken intermediate state (Topic 8's "checkpoint a broken state"); (3) if multiple agents work in parallel (Chapter 9), they collide on the same files, producing conflicting edits and corrupting each other's work (Topic 2's repeated/conflicting work, [MAR]'s duplication). The main line needs to stay clean and integrable while messy, long, parallel work happens somewhere isolated.

**Objective.** (i) Isolate extended/experimental/parallel work on branches (and worktrees for filesystem-level parallelism) so the main line is never exposed to unverified changes. (ii) Enforce a merge discipline: a branch merges to main *only after* its units are verified (Topic 12), keeping main always-green. (iii) Handle multi-agent parallelism without filesystem collision (worktrees) and without semantic collision (merge discipline + conflict resolution). (iv) Make conflicts a *recovery case* (Topic 11), not a corruption.

**Assumptions.** (a) The work product is code (or a versioned artifact with a branching model); non-code long runs use the analogous artifact-versioning (Topic 6) but rarely need worktrees. (b) The verification (Topic 4 predicates, Topic 12 acceptance) can run *on a branch* before merge — the branch is independently buildable/testable.

**Constraints.** The main line must be *always-green*: every commit on main builds and passes the acceptance predicate. A merge that would break main is rejected (verify on the branch first). Parallel agents must not write the same working directory (worktree isolation) and their merges must be serialized against main (single-writer-to-main, Topic 10's lease applied to the merge).

**Success criteria.** Extended work proceeds on branches without touching main until verified; main is always buildable; parallel agents work in isolated worktrees without collision; conflicts are detected and resolved (or escalated) rather than silently corrupting; a crash on a branch loses only branch work, never main.

## 3. Intuition first, then formalization

**Intuition.** The main line is the *verified, integrated truth* — the analogue of the checkpoint you can always recover to ([LRH]'s "working base state"). You protect it the way you protect any known-good checkpoint: you never do risky, unverified, or half-finished work *directly on it*. Instead, you branch — do the messy work in isolation — and merge back *only when it is verified*. This is exactly the checkpoint discipline of Topic 8 ("checkpoint at clean states") expressed in git's branching model: **main = clean checkpoints only; branches = the messy in-progress work.**

Worktrees add *filesystem* isolation for *parallelism*. One repository, several working directories, each on its own branch — so two agents can edit code simultaneously without overwriting each other's files. Without worktrees, two agents sharing one working directory are two workers writing the same state (Topic 10's two-writer corruption, at the filesystem level). Worktrees give each parallel agent its own sandbox that shares the same underlying object store (so merges are cheap and history is unified). This is the code-level realization of Chapter 9's information isolation: parallel agents get isolated *filesystems*, and integration happens through *merges* (the artifact-mediated handoff, Topic 6), not through shared live state.

Merge discipline is where isolation meets integration, and it has one non-negotiable rule: **verify before you merge.** A branch merges to main only after its units pass their predicates (Topic 4) and the branch builds green. This keeps main always-green: since every merged branch was verified, main is always in a verified state — which means main is *always a valid recovery checkpoint*. Merging unverified work breaks this and turns main into a potentially-broken state you can no longer trust as a fallback.

Conflicts are the friction of parallelism: two branches edited the same region, and git cannot decide which wins. The intuition is that a conflict is a *recovery case* (Topic 11), not an error to paper over — it means two lines of work made incompatible assumptions, and resolving it requires understanding *both* intents (which is real work, sometimes needing a replan or escalation), not just picking one side. The way to *minimize* conflicts is the same as minimizing any coordination cost (Chapter 9): decompose so parallel agents work on *disjoint* regions (different files/modules), so their branches rarely touch the same code — small, isolated, frequently-integrated branches conflict far less than long-lived divergent ones.

**Formalization.** Let $\text{main}$ be the trunk with invariant $\text{green}(\text{main})$: every commit builds and passes acceptance $A$ (Topic 12). A branch $b$ has commits diverging from a base $\text{base}(b) \in \text{main}$. The merge rule:

$$
\text{merge}(b \to \text{main}) \text{ allowed} \iff \text{verified}(b) \wedge \text{green}(b \text{ merged onto main}),
$$

where $\text{verified}(b)$ = all of $b$'s units pass predicates (Topic 4) and $\text{green}(b \text{ merged onto main})$ = the *merge result* builds and passes $A$ (not just $b$ in isolation — the integration can break even if $b$ alone was green). This preserves $\text{green}(\text{main})$ inductively: main starts green, and every merge is gated on the *result* being green, so main is always green. **Main is therefore always a valid recovery checkpoint** — the branch discipline is what keeps the Topic 8 checkpoint substrate trustworthy.

**Conflict as divergence.** A conflict between branches $b_1, b_2$ exists iff they edit overlapping regions incompatibly relative to their common base. Conflict probability rises with (i) branch lifetime (longer divergence → more overlap) and (ii) region overlap (agents on the same files). Minimize both: short-lived branches, disjoint decomposition. **[synthesis]** derived from standard version-control practice + Chapter 9's coordination-tax logic.

**Single-writer-to-main.** Merges to main are serialized (a lease/lock on main, Topic 10): two simultaneous merges could each be green in isolation but produce a broken combined main. Serialize merges; re-verify each against the current main.

## 4. Architecture: components, interfaces, data and control flow

**Components.**

1. **Branch manager.** Creates a branch per long-running unit / per parallel agent / per experiment; tracks base and status. Branches are the isolation boundary.
2. **Worktree manager.** For parallel agents, allocates an isolated worktree (separate working directory, own branch) per agent, sharing the repo object store. Prevents filesystem collision.
3. **Merge gate.** Enforces the merge rule: verify the branch (Topic 4 predicates), attempt the merge onto *current* main, run acceptance $A$ on the result, and only then commit to main. Serializes merges (single-writer-to-main lease, Topic 10).
4. **Conflict resolver.** On a merge conflict: classify (auto-resolvable / needs-model-resolution / needs-escalation) and route as a recovery case (Topic 11).

**Interface: main is write-gated by verification.** No commit reaches main except through the merge gate, which requires verified + green-on-merge. This makes $\text{green}(\text{main})$ a *guaranteed* invariant, not a hope — the same way the fencing token (Topic 10) makes single-writer a guarantee.

**Control flow (a long-running unit on a branch):**

```
start unit u:
    branch b = create_branch(base=main_head)          # isolate
    (in worktree if parallel)                          # filesystem isolation
work:
    edit / commit on b (b's commits = checkpoints, Topic 8; never touch main)
verify:
    run predicates for u on b (Topic 4)                # verified(b)?
merge:
    acquire main-merge-lease (Topic 10)                # serialize merges to main
    result = merge(b onto current main_head)
    if conflict:  resolve_or_escalate(conflict)         # Topic 11 recovery
    if green(result) and verified(b):                   # merge rule
        commit result to main                           # main stays green
    else:
        keep on branch; recover (Topic 11)
    release main-merge-lease
```

**Data flow.** Work flows onto branches (isolated); verification runs on branches; only verified, green-on-merge results flow to main. Parallel agents' work flows through *separate worktrees* → *separate branches* → *serialized merges* to a single green main. Conflicts flow into the recovery taxonomy (Topic 11).

**[LRH] grounding of the substrate.** [LRH] uses git commits as checkpoints and "clean state after each change" — this topic extends that from linear commits to *branches*: the same clean-state discipline, but the "clean state" that must always hold is $\text{green}(\text{main})$, and messy intermediate states live on branches where a crash costs only branch work.

## 5. Grounding: primary sources and reproducible evidence

**Honest grounding boundary.** The agent-harness sources ([LRH], [HDA]) work primarily on a *single line* of development with git commits as checkpoints; they do **not** deeply detail multi-branch/worktree/merge orchestration for agents — that is Chapter 11's coding-agent territory and, for the parallel case, an extension of Chapter 9's isolation logic. So:

- **Grounded in [LRH]:** git commits as checkpoints, descriptive commit messages, "revert bad changes and recover working base states," and "leave the environment in a clean state after making a code change." These ground the *checkpoint/clean-state substrate* that branch discipline builds on — main-always-green is the branch-level generalization of clean-state-after-change.
- **Grounded in [MAR] (Chapter 9):** parallel agents duplicating/conflicting when boundaries are vague, and information isolation as the fix. This grounds the *worktree isolation + disjoint decomposition* approach to parallel coding agents — isolate their filesystems and give them disjoint regions to minimize conflicts, exactly as Chapter 9 isolates context to minimize coordination tax.
- **Grounded in standard version-control practice (not the agent sources), applied as [synthesis]:** branches for isolation, verify-before-merge for always-green trunk, worktrees for parallel checkouts, small/short-lived branches to minimize conflicts, serialized merges. These are trunk-based-development / continuous-integration disciplines imported for agents.

**Why the sources under-specify this.** [LRH]/[HDA]'s demos are largely single-agent, single-line builds where linear commits suffice. Branch/worktree/merge machinery becomes load-bearing when (a) work is long enough to want isolated experimentation (protect main from a risky refactor) or (b) *multiple* agents work the same repo in parallel (Chapter 9 applied to code) — which is exactly the long-running / multi-agent coding case Chapter 11 and Chapter 14 address. This topic is honest that it *extends* the grounded git-checkpoint substrate with standard VCS discipline for the isolation/parallelism case, rather than reporting a shipped agent-specific branch orchestrator.

**Reproducible evidence.** Main-always-green is directly testable: with the merge gate, every main commit builds; without it, unverified merges break main (E1). Conflict-rate-vs-branch-lifetime is measurable (E2). Worktree isolation preventing collision is testable with parallel agents (E3). The git substrate ([LRH]) is grounded; the branch-discipline metrics are engineering measurements.

## 6. Implementation: worktrees, the merge gate, and conflict routing

**Isolated worktree per parallel agent (no filesystem collision):**

```bash
# Each parallel agent gets its own working directory on its own branch,
# sharing the repo object store (cheap, unified history).
git worktree add ../agent-A-wt -b feature/agent-A-unit-12   # agent A's sandbox
git worktree add ../agent-B-wt -b feature/agent-B-unit-19   # agent B's sandbox
# A and B edit files independently; no overwrite; merges reconcile later.
```

**The merge gate (keeps main always-green):**

```python
def merge_to_main(branch, repo, acceptance, main_lease):
    if not verified(branch):                       # Topic 4: all branch units pass predicates
        return "REJECT: branch not verified"
    with main_lease:                                # Topic 10: serialize merges to main
        result = repo.try_merge(branch, onto=repo.main_head())   # against CURRENT main
        if result.has_conflicts:
            return resolve_or_escalate(result.conflicts)          # Topic 11 recovery
        if repo.build(result) and acceptance.run(result) == "pass":   # green ON MERGE
            repo.commit_to_main(result)             # main stays green
            return "MERGED"
        repo.abort_merge(result)
        return "REJECT: merge result not green"     # keep on branch; recover
```

Two things make this correct: verifying against the *current* main head (not a stale base) catches integration breakage, and the main lease serializes merges so two green-in-isolation branches cannot combine into a broken main.

**Conflict routing as recovery (Topic 11):**

```python
def resolve_or_escalate(conflicts):
    auto = [c for c in conflicts if c.trivially_resolvable()]     # e.g., disjoint hunks git flagged
    apply_auto(auto)
    semantic = [c for c in conflicts if not c.trivially_resolvable()]
    if semantic:
        # A conflict = two intents collided. Resolving needs BOTH intents understood.
        if resolvable_by_model(semantic):     # model reconciles, then RE-VERIFY (predicates)
            resolution = model_resolve(semantic); return reverify(resolution)
        else:
            return escalate(semantic)          # Topic 11: human resolves genuine design conflict
```

Crucially, a model-resolved conflict is *re-verified* (its predicates re-run) — the model's reconciliation is a claim to be checked (Topic 12), not trusted. A genuine design conflict (two incompatible architectural choices) escalates rather than being papered over.

**Minimizing conflicts (decomposition, not resolution).** The cheapest conflict is the one that never happens. Assign parallel agents *disjoint* regions (different files/modules) via the decomposition (Topic 4), and keep branches short-lived (merge frequently), so divergence and overlap stay small — the same coordination-tax minimization as Chapter 9. Conflict *resolution* is expensive; conflict *avoidance* via disjoint decomposition is nearly free.

## 7. Trade-offs

- **Branch isolation vs integration lag.** Long-lived isolated branches protect main and allow deep experimentation but diverge further from main, accumulating conflict risk and integration debt (a big-bang merge). Short-lived branches integrate often (low conflict, always-green main) but offer less isolation for large refactors. Trunk-based practice favors short-lived branches + frequent merges; use long-lived branches only for genuinely large, risky work, and rebase/integrate them frequently to bound divergence.
- **Worktrees vs shared directory (parallel agents).** Worktrees give clean filesystem isolation (no collision) at the cost of more disk and orchestration (managing N working directories). A shared directory is simpler but is two-writer corruption at the filesystem level. For parallel agents, worktrees are effectively mandatory — the shared-directory alternative is broken.
- **Verify-on-merge cost vs main safety.** Running build + acceptance on every merge result costs time/compute per merge. Skipping it (merge without re-verifying the integration) is cheaper but breaks main-always-green (an integration bug lands). The trade favors verify-on-merge for anything where main must stay a trustworthy checkpoint — which is the whole point of the discipline.
- **Conflict resolution vs avoidance.** Resolving conflicts (model or human) is expensive and error-prone (a mis-resolution silently corrupts). Avoiding them via disjoint decomposition + short branches is cheap and reliable. Invest in *decomposition that minimizes overlap* rather than in sophisticated conflict resolution — the same lesson as Chapter 9 (structure to avoid coordination, don't just tolerate it).
- **Serialized merges vs merge throughput.** Serializing merges to main (single-writer-to-main) is correct (prevents broken combined states) but limits merge throughput (one at a time). For most agent workloads merge frequency is low enough that this is a non-issue; at high parallelism it can bottleneck — mitigated by disjoint decomposition (conflicting merges are rare) and fast verify (Chapter 14).

## 8. Experiments: baselines, ablations, metrics

**E1 — Merge gate vs direct-to-main (main-always-green).** Run a long coding task committing (a) directly to main vs (b) through the verify-before-merge gate. **Prediction:** (a) main breaks periodically (unverified/broken intermediate states land), so subsequent sessions build on breakage; (b) main always builds. Metric: fraction of main commits that are green; downstream sessions wasted on broken baselines.
**E2 — Conflict rate vs branch lifetime / overlap.** Vary branch lifetime and region-overlap (disjoint vs shared modules) across parallel agents; measure conflict rate. **Prediction:** conflicts rise with lifetime and overlap; disjoint short-lived branches → near-zero conflicts. Metric: conflicts per merge, resolution cost, mis-resolution rate.
**E3 — Worktree isolation.** Run parallel agents in shared directory vs separate worktrees. **Prediction:** shared → filesystem collisions / overwrites (two-writer corruption); worktrees → clean isolation, conflicts only at merge. Metric: collision rate, corrupted-file rate.
**E4 — Conflict-resolution correctness.** Have the model resolve conflicts with vs without re-verification. **Prediction:** without re-verify, some resolutions silently break (Topic 12 false-completion analogue); with re-verify, breakage caught. Metric: post-resolution build/acceptance pass rate.

**Honest status.** [LRH] grounds the git-checkpoint/clean-state substrate; [MAR] grounds parallel-agent conflict/duplication and isolation-as-fix — both *qualitatively*. **The branch/worktree/merge discipline and its metrics (E1–E4) are [synthesis]** from standard trunk-based-development practice applied to agents; no agent source publishes main-green rates, conflict-rate curves, or worktree-isolation studies. The substrate is grounded; the branch-management discipline and numbers are engineering derivations. This is the least agent-source-grounded topic alongside Topic 10 — state it plainly.

## 9. Failure modes, edge cases, hazards, limitations

- **Direct commits to main (breaks the always-green invariant).** Unverified or broken-intermediate changes land on main; subsequent sessions build on breakage; main is no longer a trustworthy recovery checkpoint. Mitigation: the merge gate (verify + green-on-merge); nothing reaches main except through it.
- **Two-writer filesystem collision (parallel agents, shared dir).** Two agents overwrite each other's files. Mitigation: worktrees (filesystem isolation) + disjoint decomposition + serialized merges.
- **Mis-resolved conflict (silent corruption).** A conflict resolved wrong (model or human picks incompatible pieces) compiles but is semantically broken. Mitigation: re-verify after resolution (Topic 12 — resolution is a claim); escalate genuine design conflicts rather than guessing.
- **Big-bang merge (long-lived branch).** A branch diverges so far that its merge is a massive, conflict-ridden, hard-to-verify integration. Mitigation: short-lived branches, frequent integration, rebase-onto-main to bound divergence.
- **Green-in-isolation, broken-on-merge.** A branch passes its own tests but the *integration* breaks (it assumed old main behavior). Mitigation: verify the *merge result* against current main, not the branch in isolation (the merge rule's second conjunct).
- **Crash mid-merge.** A merge interrupted leaves the repo in a conflicted/partial state. Mitigation: merges are restart-safe (Topic 9) — a merge is reversible ($W_{\text{rev}}$: abort and retry); the main lease + atomic commit-to-main ensures no partial main state.
- **Edge case: non-code long runs.** Research/ops long runs rarely have "branches" — their artifacts (Topic 6) version linearly. Worktrees/merges are largely code-specific. The *principle* (isolate unverified work, integrate only verified work, keep a trusted main state) transfers as artifact-versioning discipline, but the git-specific machinery does not.
- **Limitation.** This topic is deliberately a *slice* — the long-running/checkpointing intersection with branches. Full coding-agent branch strategy (PR review, CI gates, patch minimality, rollback of merged changes) is Chapter 11. The discipline here (always-green main, verify-before-merge, worktree isolation, conflict-as-recovery) is the reliability-relevant core; Chapter 11 completes the coding-agent picture.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
- Git commits are the grounded checkpoint substrate with clean-state-after-change discipline [LRH] — main-always-green is its branch-level generalization.
- Parallel agents conflict/duplicate without isolation and disjoint boundaries; isolation is the fix [MAR].
- Branch/worktree/merge discipline is standard trunk-based-development practice, imported for agents (**[synthesis]**).

**Decision rules.**
- **DR-1.** Keep main always-green: nothing reaches main except through a merge gate that requires the branch verified (Topic 4) *and* the merge result green (build + acceptance, Topic 12). Main is then always a valid recovery checkpoint.
- **DR-2.** Do extended/risky/parallel work on branches; a crash on a branch loses only branch work, never main. Verify against *current* main, not a stale base.
- **DR-3.** For parallel coding agents, give each an isolated worktree (filesystem isolation) and a disjoint region (minimize conflicts); serialize merges to main (single-writer-to-main, Topic 10).
- **DR-4.** Treat conflicts as recovery (Topic 11): auto-resolve the trivial, model-resolve-then-*re-verify* the semantic, escalate genuine design conflicts. Minimize conflicts by decomposition (short-lived, disjoint branches), not by better resolution.

**Production implications.** For long-running *coding* agents, branch discipline is what keeps the accumulating work integrable and the fallback trustworthy. The always-green main is the coding-agent form of "main is a checkpoint you can always recover to" — lose it (by committing unverified work directly) and you lose your recovery point, and every subsequent session inherits the breakage. For *parallel* coding agents (Chapter 9 applied to code), worktrees + disjoint decomposition + serialized merges are what turn "several agents on one repo" from a corruption hazard into isolated, integrable work. Teams running long or parallel coding agents without this discipline discover it the first time an unverified merge breaks main or two agents overwrite each other — both avoidable with standard VCS practice applied deliberately.

**Connections.** Git is Topic 8's checkpoint substrate and Topic 6's artifact store; branches extend Topic 8's clean-state discipline to always-green main. Worktree isolation is Chapter 9's information isolation at the filesystem level; disjoint decomposition is Chapter 9's coordination-tax minimization. Verify-before-merge is Topic 12's verified-state gate and Topic 4's predicates. Serialized merges use Topic 10's single-writer lease. Conflicts route through Topic 11's recovery taxonomy (and re-verify per Topic 12). The full coding-agent story is Chapter 11; the production CI substrate is Chapter 14.

### Sources
- **[LRH]** Anthropic — *Effective harnesses for long-running agents* (git commits as checkpoints; descriptive commit messages; "revert bad changes and recover working base states"; "leave the environment in a clean state after making a code change").
- **[MAR]** Anthropic — *Multi-agent research system* (parallel agents duplicate/conflict without clear boundaries; information isolation as the fix). Via Chapter 9.
- Standard version-control practice (**[synthesis]**, not agent-source): trunk-based development, verify-before-merge / always-green trunk, `git worktree` for parallel checkouts, short-lived branches to minimize conflicts, serialized merges.
- Internal: Chapter 9 (parallel-agent isolation, coordination tax), this chapter Topics 3 (clean state, initializer/worker), 4 (unit predicates), 6 (git artifact store, versioning), 8 (git checkpoints, clean-state), 10 (single-writer lease → main-merge-lease), 11 (conflict as recovery), 12 (verify-before-merge, re-verify resolutions); Chapter 11 (full coding-agent branch/PR/CI story), Chapter 14 (CI substrate).
