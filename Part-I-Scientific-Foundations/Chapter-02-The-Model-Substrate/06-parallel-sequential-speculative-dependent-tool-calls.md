# Topic 6 — Parallel, Sequential, Speculative, and Dependent Tool Calls

## 1. Problem and objective

A turn may contain several tool calls, and a run contains many turns. How those calls are ordered — what may run concurrently, what must serialize, what depends on what — is a concurrency-control problem sitting exactly on the boundary between model prediction and harness execution. The model *proposes* a set of calls; the harness *schedules* them. The objective of this topic is to fix the four ordering regimes, state which layer controls each, ground the scheduling semantics in the two interfaces that document them, and treat the reliability consequences (write conflicts, stale-read hazards, wasted speculation) with the seriousness ordinary systems engineering gives them — because they are the same hazards under a new name.

## 2. Intuition first

An agent's tool calls form a tiny distributed system per turn. Reads can fan out: checking three files simultaneously costs latency of one. Writes cannot: two edits racing to the same file is a lost-update bug regardless of how intelligent the writer is. Dependency is the third regime: you cannot fix the test until you've read its output — the data flows *through the model's next decision*, forcing a full turn boundary. And speculation is the fourth: doing work now that a future decision may render unnecessary, buying latency with possibly-wasted tokens. None of this is novel computer science. What is novel is that the *transaction planner* is a stochastic policy — the schedule's safety cannot rely on the proposer's discipline, so it must live in the executor.

## 3. The four regimes, with their controlling layer

### 3.1 Parallel calls — model proposes, harness disposes

Both documented interfaces expose parallelism as a controlled capability. On the API side: "the `parallel_tool_calls` parameter controls execution strategy. When enabled, the model can invoke multiple tools simultaneously; when disabled (`false`), tools execute sequentially" [OAT]. On the runtime side, the safety policy is typed by mutation: "when Claude requests multiple tool calls in a single turn... read-only tools (like `Read`, `Glob`, `Grep`, and MCP tools marked as read-only) can run concurrently. **Tools that modify state (like `Edit`, `Write`, and `Bash`) run sequentially to avoid conflicts.** Custom tools default to sequential execution," opting into concurrency only via an explicit `readOnlyHint` annotation [CAL].

Read the design decisions in that paragraph: concurrency is an *opt-in property of the tool contract*, not a trust in the model's proposal; the default for unknown tools is the safe (serial) order; and the read/write distinction — Chapter 1 Topic 6's reversibility axis — is what licenses parallelism at all.

### 3.2 Sequential calls — the safety default

Serialization is the regime that makes each state mutation observable before the next begins: mutate → (optionally) verify → mutate. It is what gives the per-step verification of Chapter 1 Topic 8 §5 a place to stand — parallel writes have no "between" in which a check can run. The cost is latency, linear in the number of effectful calls.

### 3.3 Dependent calls — the turn boundary as data dependency

When call B's *arguments* depend on call A's *results*, no scheduler can help: the dependency routes through π_M's next prediction. The loop structure encodes this — "each set of tool results feeds back to Claude for the next decision" [CAL] — so a dependency chain of length k costs k turns, each with full model latency. This is why dependency structure, not call count, drives agent latency (Chapter 14's decomposition), and why flattening dependencies — asking for independent information in one turn rather than drip-feeding — is a real optimization with a measurable turn-count signature [HB Table 2].

The deepest version of dependency-flattening is code execution as the aggregation layer: instead of N dependent tool-call turns, the model writes one program in which the dependencies are ordinary dataflow, executed in a single call [CAH §2.2's code-for-acting; Chapter 5 treats this fully]. The dependency chain moves from "through the model, per link" to "through the interpreter, once" — the single most effective known reduction of both latency and n_stoch for tool-heavy steps.

### 3.4 Speculative calls — the honest gap

Speculation — executing calls whose usefulness depends on decisions not yet made — must be flagged plainly: **no interface in this book's ledger documents speculative tool execution as a first-class mechanism.** The nearest sourced relatives are: parallel *sampling* of candidate trajectories in search-based planning, where multiple paths are explored and most discarded [CAH §3.1.3] — speculation over reasoning, with validator-arbitrated selection; and voting-parallelization [BEA] — speculative redundancy over answers. Speculative *effectful* execution (fire the probable-next write before the decision confirms it) would violate the read/write discipline of §3.1 and appears nowhere in the sources; for reads, prefetching is harmless in principle but is a harness feature you would build, not one you can cite. This paragraph is the section: the regime exists in classical systems, is largely unbuilt in shipped agent interfaces, and claims about it should be treated accordingly. **[gap noted]**

## 4. Formalization: the per-turn schedule

Model a turn's proposed calls as nodes with two attributes: mutates ∈ {true, false} (from the tool contract: `readOnlyHint` [CAL]) and target (the resource touched). The documented scheduling policy is then **[derived — formalization of the sourced rules]**:

```
legal schedule:  all read-only calls may run concurrently
                 mutating calls execute in proposal order, serially
                 dependent calls cannot appear in one turn (data flows via next prediction)
```

Two classical hazards remain *within* the legal schedule, and engineers should name them:

- **Stale read under concurrency:** a read racing a same-turn write (read-only batch + mutation in one proposal) can observe pre- or post-write state; the serialized-writes rule bounds but does not eliminate read/write interleaving ambiguity. Where the distinction matters, force it across turns: write, then read in the next turn — paying a turn for a guarantee, the agentic version of a memory barrier.
- **Cross-run interference:** two *agents* (or an agent and a human) sharing a workspace re-create every multi-writer anomaly at session scale; nothing in the per-turn scheduler addresses it. Chapter 9's conflicting-edits problem and Chapter 10's worktree isolation are the treatments; the per-turn discipline here is necessary, nowhere near sufficient.

## 5. Evidence and efficiency

The turn-accounting numbers give the regimes their economic weight: across Harness-Bench configurations at fixed tasks, mean turns ranged **5.0 to 22.6** and mean tokens 68.7K–175.1K, with the top-scoring harness among the *leanest* — "longer trajectories alone do not determine performance" [HB Table 2, §4.2]. Turn count is dependency structure made visible: configurations that batch independent reads and flatten dependencies spend fewer turns for equal or better outcomes. Parallelism optimizes *within-turn* latency; dependency-flattening optimizes *turn count*; the second dominates in practice because each turn carries full model-inference latency plus context growth [CAL context accumulation].

## 6. Failure modes

- **Write–write races via mislabeled tools:** a custom tool marked `readOnlyHint` that actually mutates state re-admits lost updates past the scheduler [CAL]; the annotation is a safety contract and deserves review as one.
- **Read-batch staleness** (§4.1): conclusions drawn from a parallel read batch that a same-turn write invalidated.
- **Dependency mis-prediction:** the model proposes "independent" calls that are semantically dependent (edit file A, run tests that compile A) — schedule-legal, logically racy. The serialized-write rule saves the common cases; the residual is a verification problem (did the test run see the edit?), caught by result-consistency checks [HB §3.4 Consistency].
- **Turn-fragmentation:** the inverse inefficiency — issuing one call per turn where a batch or a program was available; k× the latency and context growth for no safety gain (§3.3's aggregation escape).
- **Unbounded fan-out:** parallel read storms (dozens of concurrent fetches) as a cost and rate-limit event; concurrency needs the same budgeting as any other resource (Chapter 14's admission control).
- **Speculation improvised without a framework** (§3.4): effectful "probably-needed" calls fired ahead of decisions — this is just acting before deciding, and every Chapter 1 reversibility rule applies at full force.

## 7. Limitations

- The scheduling semantics cited are those of two specific interfaces [OAT; CAL]; other runtimes make other choices, and portability of concurrency behavior across SDKs is exactly the kind of semantic difference Chapter 4's portability topic warns about.
- The stale-read analysis in §4 is engineering reasoning over documented rules **[derived]**; the sources do not publish anomaly frequencies. Measure yours: same-turn read/write co-occurrence rate is computable from the run record.
- No source quantifies the latency gain of parallel reads or the cost of turn-fragmentation on agentic suites; §5's turn-count spread is consistent with, but does not isolate, the effect.

## 8. Production implications

1. **Trust the type system, not the proposer:** concurrency eligibility comes from tool contracts (`readOnlyHint`, mutation typing) [CAL]; audit custom-tool annotations as safety-critical metadata.
2. **Flatten dependencies deliberately:** batch independent reads; move dependency chains into executed code where the environment allows [CAH §2.2]; treat turns as the expensive unit.
3. **Force turn boundaries where read-after-write consistency matters** (§4.1) — pay the turn, take the guarantee.
4. **Budget concurrency** like any resource: fan-out caps, rate-limit awareness, and per-turn call ceilings alongside `max_turns` [CAL].
5. **Watch turns-per-task as a standing efficiency metric** [HB Table 2]; rising fragmentation and rising fan-out are both visible there before they are visible in cost reports.
6. **Do not improvise speculation.** Until an interface offers speculative execution with cancellation semantics, restrict "work ahead" to reads you would have issued anyway — and say so in the design doc (§3.4's gap is citable).

## 9. Connections

- Topic 5 factored the *emission* of calls; this topic scheduled them; Topic 7 constrains their payloads; Topic 9 decides which side of the API executes them.
- Chapter 5 owns tool contracts (including idempotency, which turns retry-after-ambiguous-failure from hazard to routine); Chapter 9 owns multi-agent write conflict; Chapter 14 owns the latency decomposition where turn count dominates.
- The read/write asymmetry is Chapter 1 Topic 6's reversibility axis, now operating as a scheduler — one more instance of the chapter-1 axes reappearing as runtime mechanics.

## Sources

[OAT] OpenAI, Tools guide (`parallel_tool_calls`) — https://developers.openai.com/api/docs/guides/tools
[CAL] Claude Agent SDK, "How the agent loop works" (parallel execution rules, readOnlyHint, turn structure, context accumulation) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) §2.2, §3.1.3
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.4, §4.2, Table 2
[BEA] Anthropic, Building Effective Agents — https://www.anthropic.com/engineering/building-effective-agents
