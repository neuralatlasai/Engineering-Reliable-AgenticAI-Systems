# Topic 2 — Turn-Local Scratch State, Session State, Cross-Session Memory, and Organizational Knowledge

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The four *scopes* of persistent data — the lifetimes-and-audiences axis of Topic 1, made concrete against a shipped scoping model. This topic decides *where a datum lives and who can see it*, which is the decision that prevents both leaks and losses.

**Prerequisites.** Topic 1 (the lifetime × authority lattice); Chapter 5, Topic 10 (principal scoping, the confused-deputy fix — this topic is its persistence-layer application).

**Terminology.** *Turn-local / scratch*: data for a single invocation, discarded after. *Session*: this conversation. *Cross-session*: this user, across conversations. *Organizational*: this app/tenant, across users. The [ADK-S] prefixes name exactly these: `temp:`, none, `user:`, `app:`.

**Boundaries.** Inside: the four scopes, their persistence and visibility rules, and the invariants that keep them separate. Outside: the memory *content* taxonomy (Topic 5); tenancy *enforcement* and isolation (Topic 14, which this topic sets up).

**Exclusions.** No key-value-store product survey.

**Outcomes.** The reader can assign a datum to one of four scopes, and can state — from the scope alone — its persistence, its visibility, and the leak it would cause if mis-scoped.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Agent data has four natural audiences — this invocation, this conversation, this user, this organization — and they nest. A scratch calculation is narrower than a conversation flag, which is narrower than a user preference, which is narrower than an app-wide template. Store a datum at the wrong scope and one of two failures follows: **too broad** (it leaks — this user's preference visible to another; this conversation's state bleeding into the next) or **too narrow** (it is lost — a user preference discarded at session end and re-asked every conversation).

**Bottleneck.** Scope is usually implicit. A dictionary called `state` accumulates everything, and nobody records whether a given key is meant to survive the turn, the session, or forever. The scope is discovered only when it fails — when a user sees another user's data, or when the agent re-asks a question it should remember.

**Objective.** Explicit scope on every datum, with persistence and visibility *derived from the scope*, and an invariant that a datum never becomes visible beyond its scope.

**Assumptions.** The four scopes nest: `temp:` ⊂ session ⊂ `user:` ⊂ `app:` in visibility. Persistence is orthogonal — a broad scope is not automatically durable.

**Constraints.** Persistence depends on the backend: [ADK-S] is explicit that session/`user:`/`app:` persist *only* with a persistent `SessionService` (Database/VertexAI), while in-memory backends lose everything on restart.

**Success criteria.** Every datum's scope is declared; no datum is visible beyond its scope (no leak); no datum needed across a boundary is scoped below it (no loss).

## 3. Intuition first, then formalization

### 3.1 Intuition: four nested audiences

The scopes answer "who should be able to see this, and for how long," and they nest like org-chart visibility:

- **`temp:` (turn-local scratch)** — "an intermediate calculation, flag[s] passed between tool calls" [ADK-S]. Lives for *one invocation* and is "**never persistent**; discarded after invocation completes" [ADK-S]. This is the agent's working memory *within* a single reasoning episode — the sub-total it computes and no longer needs. **Storing anything here that must outlive the turn is a loss.**
- **Session (no prefix)** — "track progress within current task; temporary flags" [ADK-S]. Lives for *this conversation*. This is where the task's *position* lives (Topic 1's state): what step we are on, what the user asked, what we have done. **It must not persist across sessions** — that is the leak.
- **`user:` (cross-session)** — "User preferences, profile details" [ADK-S]. Lives across *all this user's sessions*. This is where "remember I prefer metric units" belongs — narrower than the app, broader than one conversation. **Scoping a preference to the session loses it; scoping it to the app leaks it to every user.**
- **`app:` (organizational)** — "Global settings, shared templates" [ADK-S], visible to "all users and sessions for an application." This is curated, shared configuration — closer to *knowledge* (Topic 1) than to learned memory. **User data must never live here.**

The nesting is the whole model, and the two failure directions are symmetric: **broaden a scope and you leak; narrow it and you lose.** Correct scoping is the narrowest scope that still covers every reader who legitimately needs the datum.

### 3.2 Formalization: the scope lattice and the containment invariant

Order the scopes by visibility:

$$
\texttt{temp:}\ \prec\ \text{session}\ \prec\ \texttt{user:}\ \prec\ \texttt{app:} .
$$

Each datum $d$ carries a scope $\operatorname{scope}(d)$ and a reader context $(u, s, i)$ = (user, session, invocation). Visibility is defined by containment:

$$
\text{visible}(d\mid u,s,i)=
\begin{cases}
i=\operatorname{inv}(d) & \operatorname{scope}(d)=\texttt{temp:}\\
s=\operatorname{sess}(d) & \operatorname{scope}(d)=\text{session}\\
u=\operatorname{user}(d) & \operatorname{scope}(d)=\texttt{user:}\\
\text{true (within the app)} & \operatorname{scope}(d)=\texttt{app:}.
\end{cases}
$$

**[synthesis — the lattice formalizes [ADK-S]'s prefix semantics.]** The invariant that prevents leaks:

$$
\textbf{S-1 (no upward leak):}\quad
\text{a reader at scope } \sigma \text{ may see } d \text{ only if } \operatorname{scope}(d)\preceq\sigma\ \text{and the containment above holds.}
$$

S-1 says data flows *down* the lattice (an `app:` template is visible within a session) but **never up** (a session's state is invisible to another session; a user's preference invisible to another user). **A leak is an S-1 violation, and it is a tenancy incident** (Topic 14).

The dual invariant prevents losses:

$$
\textbf{S-2 (scope covers all readers):}\quad
\operatorname{scope}(d)\ \succeq\ \max\{\text{scope of every legitimate reader of } d\}.
$$

S-2 says: scope a datum *at least* as broadly as its broadest legitimate reader. A user preference read across sessions must be `user:`, not session. **Together S-1 and S-2 pin the scope exactly: no broader (S-1, no leak), no narrower (S-2, no loss).**

### 3.3 Persistence is orthogonal to scope

The subtlety [ADK-S] makes explicit and teams miss: **scope determines visibility; the backend determines persistence, and they are independent.** A `user:`-scoped preference is *visible* across the user's sessions, but it only *persists* across them if the `SessionService` is persistent (Database/VertexAI); with an in-memory backend, "all data… is lost when your application restarts" [ADK-S].

$$
\text{durable}(d)\ =\ \bigl[\operatorname{scope}(d)\ \text{is cross-session or broader}\bigr]\ \wedge\ \bigl[\text{backend is persistent}\bigr].
$$

**[derived]** The failure this prevents: assuming a broad scope implies durability. A `user:` preference on an in-memory backend is visible across sessions *within one process lifetime* and gone on restart — which looks like memory and behaves like a cache, exactly the Topic 1 confusion. **Broad scope is a necessary but not sufficient condition for persistence; the backend is the other half.**

And the mutation discipline [ADK-S] is emphatic about: state must be updated "through managed contexts or events" (`state_delta` via `append_event`), never by direct mutation, because direct mutation "bypasses event tracking, breaks persistence with database services, causes race conditions, and loses auditability" [ADK-S]. This is Chapter 3, Topic 4's commit-before-continue at the state layer: **state changes are events, and events are the authoritative record** (Topic 3).

## 4. Architecture

```
   app:      ┌──────────────────────────────────────────────────────────┐
   (org)     │ global settings · shared templates · curated config       │  ← knowledge-like
             │ visible to ALL users. NEVER holds user data.               │
             └───────────────────────────┬──────────────────────────────┘
   user:                     ┌───────────┴───────────────────────────────┐
   (cross-sess) │ preferences · profile · "remember metric units"          │
                │ visible across THIS user's sessions only. (S-1)          │
                └───────────────────────┬──────────────────────────────────┘
   session                  ┌───────────┴──────────────────────────────────┐
                │ task position · progress · conversation flags             │
                │ visible in THIS conversation only. NOT across sessions.    │
                └───────────────────────┬──────────────────────────────────┘
   temp:                    ┌───────────┴──────────────────────────────────┐
   (invocation) │ intermediate calc · flags between tool calls              │
                │ NEVER persisted. Discarded after invocation. Sub-agents    │
                │ share the parent's temp: (one invocation) [ADK-S].         │
                └────────────────────────────────────────────────────────────┘

   PERSISTENCE (orthogonal): session/user:/app: persist ONLY with a persistent
   backend [ADK-S]. temp: NEVER persists. In-memory backend ⇒ all lost on restart.

   MUTATION: via state_delta + append_event ONLY. Direct mutation breaks
   persistence, auditability, and thread-safety [ADK-S].
```

**The sub-agent subtlety [ADK-S].** "The invocation encompasses the entire chain from agent receiving input to generating output; sub-agents share the parent's invocation context and `temp:` state." So `temp:` is *not* per-agent — it is per-*invocation*, shared down the sub-agent tree. **A sub-agent writing to `temp:` is writing to the parent's scratch**, which is either a useful coordination channel or a surprising collision, depending on whether you designed for it. This is Chapter 8's shared-state question, appearing early.

## 5. Grounding

- **The four scopes and their exact semantics:** `temp:` ("Current invocation only… **Never persistent**; discarded after invocation completes"; "Intermediate calculations, flags passed between tool calls"); session/none ("Current session only… Track progress within current task; temporary flags"); `user:` ("All sessions for a specific user… User preferences, profile details"); `app:` ("All users and sessions for an application… Global settings, shared templates") [ADK-S].
- **Persistence depends on the backend:** session/`user:`/`app:` persist "Only if `SessionService` is persistent (Database/VertexAI)"; in-memory options mean "all data stored using these in-memory options… is lost when your application restarts" [ADK-S].
- **The invocation spans the sub-agent chain:** "sub-agents share the parent's invocation context and `temp:` state" [ADK-S].
- **Mutation must go through events:** updates via `output_key`, `EventActions.state_delta`, or `CallbackContext`/`ToolContext`, all requiring `append_event`, which "Adds the event to session history, Applies `state_delta` changes correctly, Updates `last_update_time`, Ensures thread-safety and persistence"; and the warning that direct mutation "bypasses event tracking, breaks persistence with database services, causes race conditions, and loses auditability" [ADK-S].
- **The scope model corroborated elsewhere:** OpenAI's server-managed state distinguishes per-response (`store`, 30-day TTL) from persistent Conversations objects (no TTL) [OCS] — the same session-vs-durable split at a different granularity; Claude Code's `CLAUDE.md` scopes (managed / user / project / local) [CCM] are the *knowledge*-layer analogue of `app:`/`user:`/session (Topic 12).
- **Scope is principal scoping:** the `user:` boundary is Chapter 5, Topic 10's acting-principal, applied to persistence — a datum scoped to a user is a datum the confused-deputy fix must respect (Topic 7, Topic 14).

**Evidence gap.** The scope *semantics* are documented product behavior [ADK-S] — reliable as a specification, provider-specific and dated (Chapter 4, Topic 13). **The lattice formalization (S-1/S-2) is this book's synthesis**, and **no source measures scope-error rates** (how often production systems leak or lose via mis-scoping). The claim that mis-scoping is a common bug is a reasoned assertion grounded in the documented failure modes, not a measured incidence.

## 6. Implementation

**Scope as a typed, enforced property:**

```python
class Scope(IntEnum):                       # ordered by visibility (§3.2)
    TEMP = 0        # invocation only, never persisted
    SESSION = 1     # this conversation
    USER = 2        # this user, across sessions
    APP = 3         # this app, across users

@dataclass(frozen=True)
class ScopedDatum:
    key: str
    value: object
    scope: Scope
    invocation_id: str | None = None   # set iff TEMP
    session_id: str | None = None      # set iff SESSION
    user_id: str | None = None         # set iff USER

def visible(d: ScopedDatum, ctx: RequestContext) -> bool:
    """S-1: data flows DOWN the lattice, never UP. A leak is a violation here."""
    if d.scope is Scope.TEMP:    return d.invocation_id == ctx.invocation_id
    if d.scope is Scope.SESSION: return d.session_id == ctx.session_id
    if d.scope is Scope.USER:    return d.user_id == ctx.user_id
    return ctx.app_id == d.app_id      # APP: within the app
```

**Mutation through events only [ADK-S]:**

```python
def set_state(service, session, key, value, scope: Scope):
    """[ADK-S]: NEVER mutate session.state directly. Go through state_delta + append_event,
    or you break persistence, auditability, and thread-safety."""
    prefixed = {Scope.TEMP: "temp:", Scope.USER: "user:", Scope.APP: "app:"}.get(scope, "")
    service.append_event(session, Event(
        actions=EventActions(state_delta={f"{prefixed}{key}": value})
    ))   # applies the delta, appends to history, updates last_update_time, persists
```

**The scope-and-persistence audit — catch leaks and losses:**

```python
def audit_scopes(store, backend) -> dict:
    problems = []
    for d in store.all():
        # S-1 leak: a session datum readable from another session.
        if d.scope is Scope.SESSION and store.readable_cross_session(d):
            problems.append(f"{d.key}: SESSION scope but cross-session readable → LEAK (Topic 14)")
        # S-2 loss: user data scoped to the session, re-asked every conversation.
        if is_user_preference(d) and d.scope < Scope.USER:
            problems.append(f"{d.key}: looks like a user preference at {d.scope.name} → LOST each session")
        # Persistence trap: broad scope on a volatile backend (§3.3).
        if d.scope >= Scope.SESSION and not backend.is_persistent:
            problems.append(f"{d.key}: {d.scope.name} scope on in-memory backend → gone on restart")
    return {"scope_errors": problems}
```

## 7. Trade-offs

| Scope choice | Buys | Costs |
|---|---|---|
| `temp:` for scratch | No leak, no persistence overhead | Lost after the turn — correct only for genuine scratch |
| Session for task state | Clean conversation boundary | Re-derived each new session |
| `user:` for preferences | Remembered across conversations | **Requires a persistent backend** (§3.3); a per-user store |
| `app:` for shared config | One source of truth for all users | **Must never hold user data** — a leak vector |
| Broad scope "to be safe" | Fewer "lost data" complaints | **Leaks** (S-1) — the more dangerous failure |
| Narrow scope "to be safe" | No leaks | Data re-asked / re-derived — annoying, not dangerous |

**The asymmetry that should guide scoping.** Too-broad leaks (a privacy incident); too-narrow loses (an annoyance). **The costs are asymmetric — a leak is a security event, a loss is a re-derivation — so the safe default under uncertainty is the narrower scope.** This is the opposite of Topic 1's authoritative-vs-derived default (where authoritative was safer), and the reason is the same principle applied to a different axis: **choose the failure that is cheaper to recover from.** A lost preference is re-asked; a leaked one cannot be un-leaked.

## 8. Experiments

**The leak probe (S-1) — the security-critical test.** For every session- and user-scoped datum: construct a second context at the same or broader scope but *different identity* (another session, another user), and attempt to read. **Any successful read is an S-1 violation and a tenancy incident** (Topic 14). Report leaks as a count with zero target and the zero-failure bound $p_{\max}=1-(1-\gamma)^{1/n}$ over $n$ probe pairs (Chapter 1, Topic 12).

**The loss probe (S-2).** For data that *should* persist across a boundary (user preferences), start a fresh session and check whether the datum is available. **Missing data that should persist is an S-2 violation** — re-derivation the user will notice.

**The persistence-trap test (§3.3).** Set a `user:`-scoped datum; restart the process; check whether it survives. **On an in-memory backend it will not** — confirming that broad scope without a persistent backend is a cache, not memory (Topic 1).

**The sub-agent `temp:` collision test.** Spawn two sub-agents in one invocation; have both write the same `temp:` key; observe the collision. This documents whether your `temp:` sharing [ADK-S] is a coordination feature or a race (Chapter 8).

**Statistics.** Zero-failure bounds on leak counts; Wilson intervals on loss/persistence rates; report $n$ (Chapter 1, Topic 12). Scope errors are correctness bugs, not distributions — the target for leaks is exactly zero.

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Session state leaking across sessions.** The S-1 violation; one conversation's data in another. Mitigation: containment enforcement (§6); the leak probe.
- **User data at `app:` scope.** Visible to every user — a broad tenancy leak. Mitigation: `app:` holds only curated shared config, never user data; the audit.
- **Preference lost at session end.** S-2 violation; scoped to session, re-asked every conversation. Mitigation: `user:` scope + persistent backend.
- **Broad scope, volatile backend.** A `user:` datum that vanishes on restart — memory that behaves like a cache. Mitigation: pair broad scope with a persistent `SessionService` [ADK-S]; the persistence-trap test.
- **Direct state mutation.** Bypasses events; breaks persistence, auditability, thread-safety [ADK-S]. Mitigation: `state_delta` + `append_event` only.
- **`temp:` used for cross-turn data.** Discarded after the invocation; the datum needed next turn is gone. Mitigation: session scope for anything outliving the turn.
- **Sub-agent `temp:` collision.** Two sub-agents share the parent's `temp:` [ADK-S] and clobber each other. Mitigation: namespace keys; design the sharing explicitly (Chapter 8).
- **Edge case — the scope that must change.** A datum starts session-scoped (a draft) and becomes user-scoped (a saved preference). The *promotion* is a deliberate write at the new scope, not a silent broadening — and it must re-check S-1 (does promoting it leak it?). Mitigation: explicit scope-promotion, audited.
- **Open limitation.** Scope semantics are **documented, dated, provider-specific** [ADK-S] (Chapter 4, Topic 13). The lattice is **[synthesis]**; **no source measures scope-error incidence.** The asymmetry argument (§7) is reasoned from the failure modes, not from measured cost data.

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Four scopes exist with exact semantics: `temp:` (invocation, never persisted), session, `user:` (cross-session), `app:` (cross-user) [ADK-S].
2. Persistence of session/`user:`/`app:` requires a persistent backend; in-memory loses all on restart [ADK-S].
3. The invocation spans the sub-agent chain, so `temp:` is shared down the tree [ADK-S].
4. State must be mutated through events (`state_delta` + `append_event`), never directly [ADK-S].
5. Server-managed state elsewhere shows the same session-vs-durable split (`store` TTL vs Conversations objects) [OCS].
6. **The scope lattice is this book's synthesis; scope-error incidence is unmeasured.**

**Decision rules.**
- **Scope a datum at the narrowest scope covering every legitimate reader** (S-1 ∧ S-2).
- **Under uncertainty, scope narrower** — a leak is a security event, a loss is an annoyance.
- **Broad scope needs a persistent backend** to actually persist — scope and durability are orthogonal.
- **User data never lives at `app:`.**
- **Mutate state through events, never directly** [ADK-S].
- **`temp:` is per-invocation and shared with sub-agents** — namespace it.

**Production implications.**
1. Run the leak probe (§8) and report leaks with a zero-failure bound — the target is exactly zero.
2. Declare scope explicitly on every datum; an implicit `state` dict hides both leaks and losses.
3. Verify your backend is persistent for any cross-session scope, or your "memory" is a per-process cache.
4. Enforce event-based mutation; direct mutation silently breaks persistence and auditability [ADK-S].

**Connections.** This topic makes Topic 1's lifetime axis concrete and sets up Topic 3 (state changes are events → the authoritative log) and Topic 4 (server-managed vs replayed state). The `user:` boundary is Chapter 5, Topic 10's principal scoping, and its enforcement is Topic 7 (read policy) and Topic 14 (tenant isolation). `app:`-scoped curated config is knowledge (Topic 12). Sub-agent `temp:` sharing is Chapter 8's shared-state problem in miniature.

## Sources

[ADK-S] Google ADK session/state — the four scope prefixes with exact semantics (`temp:` "Current invocation only… Never persistent; discarded after invocation completes"; session "Current session only"; `user:` "All sessions for a specific user"; `app:` "All users and sessions for an application"); persistence "Only if `SessionService` is persistent (Database/VertexAI)"; in-memory data "lost when your application restarts"; "sub-agents share the parent's invocation context and `temp:` state"; update via `output_key` / `EventActions.state_delta` / `CallbackContext`/`ToolContext` requiring `append_event`; the direct-mutation warning ("bypasses event tracking, breaks persistence with database services, causes race conditions, and loses auditability") — https://adk.dev/sessions/state/
[OCS] OpenAI, conversation-state guide — per-response `store` (30-day TTL) vs persistent Conversations objects (no TTL) — the session-vs-durable split — https://developers.openai.com/api/docs/guides/conversation-state
[CCM] Claude Code memory model — `CLAUDE.md` scope hierarchy (managed / user / project / local) as the knowledge-layer analogue of app/user/session scoping — https://code.claude.com/docs/en/memory
