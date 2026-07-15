# Topic 7 — Structured Intermediate Representations and Typed Workflow State

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** What flows *between* workflow steps. Two claims: the inter-step representation must be **typed** (not free text), and the workflow state must carry **status alongside content** — because untyped, status-free state is what makes the failures of Topics 4 and 6 possible.

**Prerequisites.** Topic 6 (aggregation needs $\kappa$ to cross boundaries); Topic 4 (shared state and ownership); Chapter 2, Topic 7 (structured outputs — the mechanism); Chapter 7, Topic 3 (state as a projection of events).

**Terminology.** *Intermediate representation (IR)*: the structured object passed between steps. *Typed workflow state*: the schema-validated state a workflow carries. *Status-carrying*: the state includes $\kappa$, not just content.

**Boundaries.** Inside: the IR's schema, the workflow state's type, and the invariants they enforce. Outside: the durable persistence of that state (Topic 10; Chapter 7); the aggregation logic that consumes it (Topic 6).

**Exclusions.** No schema-language survey.

**Outcomes.** The reader can type the workflow state so that the failures of Topics 4 and 6 become unrepresentable rather than merely discouraged.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** In most agent workflows, steps communicate by passing **free text**. Step 1 produces prose; step 2 parses it (or worse, just reads it); step 3 does the same. The workflow's state is "the conversation so far." This is convenient and it is the root of several failures already named: the supervisor cannot compute $\kappa_{\text{agg}}$ (Topic 6, O-2) because worker results carry no status; components cannot detect that their understanding of shared state has diverged (Topic 4; [CAH]'s "fundamental vulnerability"); and a step's output silently fails to satisfy the next step's expectations.

**Bottleneck.** Free text between steps means **every inter-step contract is implicit and unchecked**. A step that returns "I couldn't find the file, so I made an assumption" is, to an untyped consumer, indistinguishable from a step that returns "here is the file's contents." The failure is *in the text* and nothing reads it as failure. **The type system is where the workflow's contracts live, and free text has no type system.**

**Objective.** A typed IR that (i) makes each step's output contract explicit and validated, (ii) carries **status** ($\kappa$) alongside content, and (iii) makes the invalid states of Topics 4 and 6 unrepresentable.

**Assumptions.** Models can produce structured output reliably (Chapter 2, Topic 7). Steps have contracts, whether or not they are written down.

**Constraints.** Over-typing is brittle (a schema that cannot express a legitimate output forces the model to lie or fail). Structured output has its own failure modes (Chapter 2, Topic 7's retry exhaustion).

**Success criteria.** Every inter-step boundary has a validated schema; $\kappa$ crosses every boundary; a step cannot silently return a failure that reads as a success.

## 3. Intuition first, then formalization

### 3.1 Intuition: the boundary between steps is an API, and APIs have types

The reframe: **each workflow step is a component with an interface, and the thing passed between them is that interface's payload.** In ordinary software, this payload is typed — a function returns a `Result<T, E>`, not a paragraph describing what happened. In agent workflows it is usually prose, and every problem that follows is a consequence.

Three things the type must carry, and only the first is usually present **[synthesis]**:

1. **Content** — what the step produced. Always present.
2. **Status** ($\kappa$) — *how it went*. Did it succeed, hit its budget, time out, get blocked? **Almost never present**, and its absence is what makes Topic 6's failure-laundering possible: the aggregator cannot compute $\kappa_{\text{agg}}$ from statuses it does not receive.
3. **Provenance and confidence** — where the content came from, how sure the step is (Chapter 7, Topic 9). Enables downstream trust decisions.

The intuition that makes this urgent: **without a typed status, "I failed" and "I succeeded" have the same type — `string` — and the consumer must *interpret* the difference.** Asking a model to detect failure in prose is asking it to do the thing Chapter 2 says it does unreliably (and, per [FSC §6.3.5], with a bias toward reporting success). **Typing the status removes the interpretation: the failure is a *field*, not a sentence to be understood.**

The deeper point, from the survey: systems relying on implicit state — where "agents… reconstruct state implicitly from conversational history" — have "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state" [CAH]. **A typed IR *is* the formal shared substrate**, and free text is precisely the implicit state the survey warns about.

### 3.2 Formalization: the step contract and its invariants

A step is a typed function **[synthesis]**:

$$
\mathrm{step}_i : \Sigma^{\mathrm{in}}_i \;\longrightarrow\; \mathrm{StepResult}\bigl[\Sigma^{\mathrm{out}}_i\bigr],
\qquad
\mathrm{StepResult}[T] = \bigl(\underbrace{T \cup \{\bot\}}_{\text{content}},\ \underbrace{\kappa}_{\text{status}},\ \underbrace{\phi}_{\text{provenance}}\bigr).
$$

Three invariants **[derived]**:

$$
\textbf{T-1 (status is a field, not a sentence):}\quad
\text{every step returns } \kappa\ \text{as typed data;}\ \text{the consumer never \emph{infers} success from prose.}
$$

T-1 is the topic's core, and it is what makes Topic 6's O-2 possible. **If $\kappa$ is a field, the aggregator computes $\kappa_{\text{agg}}$ mechanically. If $\kappa$ is implied by prose, the aggregator must ask a model to interpret it — and we are back to asking a fluent generator to be a failure detector (Topic 6, §3.3).**

$$
\textbf{T-2 (the contract is validated at the boundary):}\quad
\mathrm{step}_i\text{'s output is validated against } \Sigma^{\mathrm{out}}_i\ \text{before it becomes } \mathrm{step}_{i+1}\text{'s input.}
$$

T-2 is Topic 2's programmatic gate [BEA], given a type. **A validation failure at the boundary is caught *there*, before it propagates** — rather than manifesting three steps later as a confusing downstream error. This is Chapter 3, Topic 7's deterministic-invariant discipline at the workflow layer.

$$
\textbf{T-3 (failure is representable, and distinguishable from empty):}\quad
\mathrm{StepResult}\ \text{must distinguish "succeeded with no results" from "failed to look."}
$$

T-3 is the subtle one and it bites constantly. A search step that returns `[]` — did it search and find nothing (a *successful* empty result), or did it fail to search (a *failure* that happens to have no content)? **In an untyped world these are the same value.** In a typed one, they are `(content=[], κ=success)` and `(content=⊥, κ=execution_error)` — and the difference determines whether the workflow should proceed or replan (Topic 9). **Conflating them is how a workflow confidently concludes "no results exist" when it actually failed to look.**

### 3.3 Typing makes the earlier failures unrepresentable

The topic's payoff: several failures named in earlier topics become **impossible to express** once the state is typed **[synthesis]**:

- **Topic 6's failure laundering** requires the aggregator to lack constituent statuses. With T-1, the statuses are *there*, and O-2's computation is mechanical. **You cannot launder a failure you are structurally required to read.**
- **Topic 4's shared-state divergence** ([CAH]'s "fundamental vulnerability") requires implicit state. With a typed shared substrate, a component's view either type-checks against the state or does not — divergence becomes *detectable*.
- **Topic 5's swallowed sub-agent $\kappa$** requires the delegation boundary to be untyped. With `StepResult`, $\kappa$ crosses by construction.
- **Topic 2's chain error propagation** requires no gate. With T-2, the gate is the type validation.

This is the same move as Chapter 5, Topic 3 (enums make invalid arguments unrepresentable), Topic 1's state machine (illegal transitions not on the menu), and Topic 3's constraining router (dangerous branches removed). **The book's recurring structure: do not detect the invalid state — make it inexpressible.** Typing the workflow state is that principle applied to inter-step communication, and it is the cheapest place to apply it.

## 4. Architecture

```
   STEP i                                            STEP i+1
   ┌────────────────┐                              ┌────────────────┐
   │                │   StepResult[T]              │                │
   │  produces  ────┼──►┌──────────────────────┐──►│  consumes      │
   │                │   │ content: T | ⊥       │   │                │
   └────────────────┘   │ κ:       status      │◄──┼── T-1: status is a FIELD
                        │ φ:       provenance  │   │   not a sentence to interpret
                        └──────────┬───────────┘   └────────────────┘
                                   │
                        ┌──────────▼───────────┐
                        │ T-2: VALIDATE at the │  ← Topic 2's programmatic gate,
                        │      boundary        │     given a type (Ch.3 T7)
                        │ fail ⇒ caught HERE,  │
                        │        not 3 steps on │
                        └──────────────────────┘

   T-3: content=[] , κ=success        ← searched, found nothing  (PROCEED)
        content=⊥  , κ=execution_error ← FAILED to search        (REPLAN — Topic 9)
        ↑ in an UNTYPED world these are the same value, and the workflow
          confidently concludes "no results exist" when it failed to look.

   TYPED SHARED STATE (Topic 4's substrate) — [CAH]: without a formal shared substrate,
   "agents cannot reliably detect when their internal understanding diverges from the
    true program state." The type IS the substrate.
```

**The `StepResult` type is the chapter's connective tissue.** Topic 6's aggregation reads its $\kappa$; Topic 5's delegation boundary carries it; Topic 9's replanning triggers on its failure statuses; Topic 10's durable execution persists it; Topic 14's property tests assert over it. **One type, defined here, makes five other topics' disciplines mechanically enforceable rather than aspirational.**

## 5. Grounding

- **Implicit state is a documented vulnerability:** systems where "agents… reconstruct state implicitly from conversational history at each invocation" have "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state"; "the reliance on implicit state representations is the technical root of system brittleness rather than a scalability convenience" [CAH]. **This is the strongest statement in the sources for typed workflow state, and it calls implicit state the *technical root of brittleness*.**
- **Channels are partial and need declared authority:** "Files, APIs, diffs, tests, logs, schemas, blackboards, and workflow states are all partial channels through which task state is encoded, transmitted, and reconstructed. Each channel trades off fidelity, latency, and scope… The central design question is therefore not merely whether code is present, but which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved" [CAH] — the IR is a channel, and it must be authoritative and typed.
- **Typed tool schemas are a named future-harness requirement:** future harnesses "should support typed tool schemas, permission-aware invocation, sandboxed execution, lifecycle hooks, result sanitization, context compaction, state offloading, and reproducible traces" [CAH §3.3] — typing is first on the list.
- **Structured outputs are the mechanism:** Chapter 2, Topic 7 (constrained decoding; strict schemas) — how a model reliably produces a typed IR, and its failure mode (retry exhaustion).
- **$\kappa$ is the status type:** Chapter 1, Topic 12's terminal-control status; Chapter 4, Topic 14's totality rule; Chapter 5, Topic 2's requirement that a sub-agent's $\kappa$ cross the boundary — T-1's content.
- **Programmatic gates between steps:** [BEA]'s prompt chaining with "programmatic gates" — T-2, named.
- **Typed workflow state ships in SDKs:** ADK's session state with typed `state_delta` and event-carried updates [ADK-S] (Chapter 7, Topic 2) — a typed, event-carried workflow state, in production.
- **Deterministic verification:** [CAH §3.4.1]'s deterministic sensors — the validator at T-2's boundary should be one.

**Evidence gap.** The *argument* for typed state is unusually well-grounded — [CAH] calls implicit state "the technical root of system brittleness," which is a strong sourced claim. What is **unmeasured**: the effect size of typing (no source compares typed vs untyped workflow state on task outcomes), and the failure rates that typing prevents. T-1..T-3 are **[derived]** from Chapter 1's $\kappa$ discipline, [BEA]'s gates, and standard type-theoretic reasoning. **The claim that typing makes earlier failures unrepresentable (§3.3) is a structural argument, not a measured one** — it is true by construction, but its *practical impact* on your system is local (§8).

## 6. Implementation

**The `StepResult` type — the chapter's connective tissue:**

```python
from typing import Generic, TypeVar
T = TypeVar("T")

@dataclass(frozen=True)
class StepResult(Generic[T]):
    """T-1: status is a FIELD, not a sentence. T-3: failure is DISTINGUISHABLE from empty."""
    content: T | None                  # None = ⊥ (no content because it FAILED)
    kappa: str                         # success | budget | timeout | execution_error | policy_block
    provenance: Provenance             # Ch.7 T9 — source, trust, confidence
    note: str = ""                     # human-readable, NOT the status (never parsed)

    def __post_init__(self):
        # T-3: "succeeded with empty content" and "failed" must be distinguishable.
        if self.kappa == "success" and self.content is None:
            raise ValueError(
                "T-3: κ=success with content=⊥ is ambiguous. If the step succeeded and "
                "found nothing, content must be the EMPTY value (e.g. []), not None. "
                "If it failed, κ must not be success."
            )

    @property
    def succeeded(self) -> bool:
        return self.kappa == "success"      # read the FIELD — never interpret `note`
```

**T-2: validate at the boundary — the typed gate:**

```python
def run_step(step, input_data, schema_out) -> StepResult:
    """T-2: validate the output against the contract BEFORE it becomes the next step's input.
    A contract violation is caught HERE, not three steps downstream. (Ch.3 T7; [BEA] gates)"""
    raw = step.run(input_data)
    try:
        content = schema_out.validate(raw.content)          # deterministic validation
    except ValidationError as e:
        return StepResult(content=None, kappa="execution_error",
                          provenance=raw.provenance,
                          note=f"{step.name} output violated its contract: {e}")
    return StepResult(content=content, kappa=raw.kappa, provenance=raw.provenance)
```

**The typed shared substrate (Topic 4's fix) — divergence becomes detectable:**

```python
@dataclass
class WorkflowState:
    """[CAH]: implicit state is 'the technical root of system brittleness'. A TYPED
    substrate lets components detect when their view diverges from the true state."""
    schema_version: int
    items: dict[str, TypedItem]        # each with an owner (Topic 4, A-2)

    def read_as(self, key: str, expected: type) -> object:
        item = self.items[key]
        if not isinstance(item.value, expected):
            # DIVERGENCE DETECTED — the component's understanding does not match reality.
            raise StateDivergence(
                f"{key}: component expected {expected.__name__}, state holds "
                f"{type(item.value).__name__} — internal understanding has diverged [CAH]"
            )
        return item.value
```

**Aggregation becomes mechanical (Topic 6's O-2, now enforceable):**

```python
def aggregate(results: list[StepResult]) -> str:
    """Because κ is a FIELD (T-1), O-2 is MECHANICAL — no model is asked how it went.
    This is what typing buys: the failure cannot be laundered (§3.3)."""
    required = [r for r in results if r.provenance.required]
    return "success" if all(r.succeeded for r in required) \
           else worst_kappa([r.kappa for r in required])
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| Typed IR with $\kappa$ | **Aggregation is mechanical** (Topic 6); failures unrepresentable | Schemas to define and maintain |
| Free-text IR | Flexible; no schema work | **Every contract implicit**; failure indistinguishable from success in prose |
| Boundary validation (T-2) | Errors caught at the source | A validator per boundary; a rejected-output path |
| Failure ≠ empty (T-3) | "Found nothing" vs "failed to look" distinguishable | One more field to get right |
| Typed shared substrate | Divergence detectable [CAH] | Schema evolution across components (Chapter 7, Topic 13) |
| Over-tight schema | Nothing | **The model cannot express a legitimate output** → forced to lie or fail |

**The trade that argues for typing decisively.** Free text is *easier to produce* and *impossible to check*. Typed IR costs schema work and buys the mechanical enforceability of half this chapter's disciplines: Topic 6's aggregation, Topic 5's $\kappa$ propagation, Topic 9's replanning triggers, Topic 14's property tests. **The schema is not overhead — it is the substrate that makes those disciplines *code* rather than *hope*.** And the survey's judgment is stronger than a preference: implicit state is "the technical root of system brittleness" [CAH].

**The over-typing trap is real and worth naming.** A schema that cannot express a legitimate output forces the model into a bad choice: fail (retry exhaustion — Chapter 2, Topic 7) or *lie* (fit its answer into a shape that misrepresents it). **Type the *contract*, not the *prose*** — the status, the structure, the required fields; leave a free-text `note` for what the schema cannot capture. **The `note` is for humans and logs; the fields are for code.** The failure is when code starts parsing the `note`.

## 8. Experiments

**The status-propagation test (T-1) — the enabling test for Topic 6.** Force a step to fail; check whether the consumer receives $\kappa$ as *data*. **If the consumer must infer failure from prose, Topic 6's O-2 is impossible and failure laundering is inevitable.** This test gates the whole aggregation discipline.

**The empty-vs-failed test (T-3) — the subtle, common bug.** Make a search step (a) succeed with no results and (b) fail to search. **Does the workflow distinguish them?** An untyped workflow treats both as "no results" and confidently concludes nothing exists. **Measure how often a failure-to-look is reported as a successful empty result** — this is a specific, findable bug in most systems.

**The boundary-validation test (T-2).** Have a step produce output violating the next step's contract. **Is it caught at the boundary, or does it propagate and manifest downstream as a confusing error?** Measure the *distance* between the fault and its detection — typed boundaries should make it zero.

**The typed-vs-untyped ablation.** Same workflow, two IRs. Metrics: completion, failure-laundering rate (Topic 6), fault-detection distance, and — the cost side — schema-violation retry rate (Chapter 2, Topic 7). **Prediction: typed IR has lower laundering and shorter fault distance, at the cost of some retry overhead.** If the retry overhead is high, the schema is over-tight (§7).

**Statistics.** Zero-failure bound on laundering and on failure-reported-as-empty (targets zero); Wilson on retry rate; task-clustered bootstrap on completion (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Free-text inter-step state.** Every contract implicit; failure indistinguishable from success; **"the technical root of system brittleness"** [CAH]. Mitigation: typed `StepResult` (§6).
- **Status inferred from prose.** The consumer asks a model whether the previous step succeeded — a fluent generator as a failure detector (Topic 6, §3.3). Mitigation: T-1 — $\kappa$ is a field.
- **Failure conflated with empty (T-3).** "Failed to search" reported as "found nothing"; the workflow concludes the world is empty. Mitigation: `content=⊥` for failure, `content=[]` for empty; the `__post_init__` check (§6).
- **No boundary validation.** A contract violation propagates and surfaces downstream, far from its cause. Mitigation: T-2 — validate at the boundary.
- **Over-tight schema.** The model cannot express a legitimate output; forced to fail or misrepresent. Mitigation: type the contract, keep a free-text `note`; monitor retry-exhaustion (Chapter 2, Topic 7).
- **Code parsing the `note`.** The escape hatch becomes a contract; the type system is bypassed. Mitigation: `note` is for humans and logs only — if code needs it, it needs a *field*.
- **Schema evolution across components.** Step 1 upgraded, step 2 not; the contract breaks (Chapter 7, Topic 13; Chapter 4, Topic 13). Mitigation: version the schema; migrate (Chapter 7, Topic 13's D-1..D-3).
- **Typed content, untyped provenance.** The content is structured but its source/confidence are lost — downstream trust decisions become impossible (Chapter 7, Topic 9). Mitigation: provenance is part of `StepResult`.
- **Edge case — genuinely unstructured output.** Some steps legitimately produce prose (a written report). **Type the *envelope*, not the prose**: `StepResult[str]` with $\kappa$ and provenance is still typed where it matters — the status and the contract — even when the content is free text.
- **Open limitation.** The *argument* is strongly sourced ([CAH]'s "technical root of system brittleness"), but the *effect size of typing is unmeasured* — no source compares typed vs untyped workflow state on outcomes. T-1..T-3 are **[derived]**. §3.3's "makes failures unrepresentable" is true *by construction* but its practical impact on a given system is local (§8).

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. Implicit state (reconstructed from conversational history) is "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state," and is "the technical root of system brittleness rather than a scalability convenience" [CAH].
2. Channels are partial; "which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved" is "the central design question" [CAH].
3. **Typed tool schemas head the list of future-harness requirements** [CAH §3.3].
4. Programmatic gates between chained steps are recommended [BEA].
5. Typed, event-carried workflow state ships in production SDKs [ADK-S].
6. $\kappa$ must cross every boundary (Chapter 1, Topic 12; Chapter 5, Topic 2).
7. **The effect size of typing is unmeasured.**

**Decision rules.**
- **Status is a field, never a sentence** (T-1) — the consumer reads $\kappa$; it never interprets prose.
- **Validate at every step boundary** (T-2) — the typed gate catches the fault at its source.
- **Distinguish "succeeded with nothing" from "failed to look"** (T-3) — conflating them makes the workflow confidently wrong.
- **Type the contract, not the prose** — a free-text `note` for what the schema cannot hold, and **code never parses the note**.
- **The typed shared substrate is what makes divergence detectable** [CAH].
- **Version the schema** — steps evolve independently (Chapter 7, Topic 13).

**Production implications.**
1. Introduce a `StepResult` type with $\kappa$ and provenance; it makes Topics 5, 6, 9, and 14's disciplines mechanically enforceable rather than aspirational.
2. Run the empty-vs-failed test (§8); the "failed to look reported as found nothing" bug is common and produces confidently wrong conclusions.
3. Validate at boundaries; measure fault-detection distance — it should be zero.
4. Audit for code parsing the free-text `note`; that is the type system being bypassed.

**Connections.** This topic supplies the type that makes Topic 6's aggregation mechanical, Topic 5's $\kappa$ propagation structural, Topic 4's shared substrate detectable, and Topic 2's gates typed. It rests on Chapter 2, Topic 7 (structured outputs — the production mechanism), Chapter 1, Topic 12 ($\kappa$), and Chapter 7, Topic 9 (provenance). Topic 9's replanning triggers on its failure statuses; Topic 10 persists it durably; Topic 14 writes property tests over it.

## Sources

[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) — implicit state as "a fundamental vulnerability: without a formal shared substrate, agents cannot reliably detect when their internal understanding diverges from the true program state"; "the reliance on implicit state representations is the technical root of system brittleness rather than a scalability convenience"; channels as partial ("Files, APIs, diffs, tests, logs, schemas, blackboards, and workflow states are all partial channels… which artifacts are authoritative, how they are compressed, and how conflicts across channels are resolved"); §3.3 — future harnesses "should support **typed tool schemas**, permission-aware invocation, sandboxed execution, lifecycle hooks, result sanitization, context compaction, state offloading, and reproducible traces"; §3.4.1 — deterministic sensors
[BEA] Anthropic, "Building effective agents" — prompt chaining with "programmatic gates" between steps — https://www.anthropic.com/engineering/building-effective-agents
[ADK-S] Google ADK session/state — typed state with `state_delta` carried by events; the formal state substrate in a production SDK — https://adk.dev/sessions/state/
