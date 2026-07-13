# Topic 8 — Code Execution as an Aggregation Layer

## 1. Problem and objective

Direct tool calling interleaves model sampling with execution: the model proposes one or more calls, the harness executes them, and the model reads the results. This is appropriate when reasoning must occur between actions. It is inefficient when the task is dominated by repetitive fan-out, deterministic joins, filtering, arithmetic, or aggregation.

Code execution introduces a programmable layer between the model and ordinary tools. The model generates a bounded program; the runtime executes its control flow and tool calls; only a reduced result is returned to the model. The objective is to remove unnecessary model round trips and intermediate context without widening authority or hiding evidence required for verification.

Code is an aggregation mechanism, not an authorization mechanism. Every tool invoked from generated code retains its own contract, effect class $\chi_u$, authorization policy $\alpha_u$, timeout, and audit record.

## 2. Intuition: move deterministic work out of the model loop

Consider comparing inventory and demand for 500 stock-keeping units. A direct loop that asks the model to reason after every lookup spends model latency and context on a deterministic join. A short program can issue bounded parallel reads, validate the returned objects, compute differences, and send only exceptions back for model interpretation.

The architectural change is

$$
\text{model} \leftrightarrow u_1 \leftrightarrow \text{model} \leftrightarrow u_2 \leftrightarrow \cdots
$$

to

$$
\text{model}
\longrightarrow \text{bounded program}
\longrightarrow (u_1,\ldots,u_m)
\longrightarrow \text{validated aggregate}
\longrightarrow \text{model}.
$$

The second form is beneficial only when intermediate steps can be delegated to deterministic control flow. If the next call requires semantic judgment over the previous observation, the model remains on the critical path.

## 3. Formal model and rigorous analysis

Let a workflow contain $m$ tool calls, $r$ model resumptions, tool latencies $\ell_1,\ldots,\ell_m$, and model latencies $g_0,\ldots,g_r$. Ignoring queueing and overlap, direct execution has latency

$$
L_{\mathrm{direct}}
\approx
\sum_{j=0}^{r} g_j
+
\sum_{i=1}^{m}\ell_i
+
L_{\mathrm{orchestration}}.
$$

For a programmatic path with startup $L_{\mathrm{start}}$, code generation $g_c$, program execution $L_P$, and final interpretation $g_f$,

$$
L_{\mathrm{prog}}
\approx
L_{\mathrm{start}}+g_c+L_P+g_f.
$$

If the $m$ calls are independent and the runtime permits bounded parallelism $p$, an idealized lower bound is

$$
L_P
\ge
\max\!\left(
\frac{\sum_{i=1}^{m}\ell_i}{p},
\max_i \ell_i
\right).
$$

Rate limits, connection pools, skew, retries, and serialized admission checks make realized latency larger. If calls are sequentially data-dependent, $L_P$ approaches $\sum_i\ell_i$; programmatic execution then saves model resumptions, not tool latency.

### 3.1 Context economy

Let $b_i$ be the serialized model-context cost of direct result $i$, $b_P$ the program text and runtime envelope visible to the model, and $b_A$ the final aggregate. Then

$$
B_{\mathrm{direct}}
\approx
\sum_{i=1}^{m} b_i,
\qquad
B_{\mathrm{prog}}
\approx
b_P+b_A.
$$

The reduction

$$
\Delta B
\mathrel{=}
B_{\mathrm{direct}}-B_{\mathrm{prog}}
$$

is meaningful only when $b_A$ preserves the evidence required for correctness and audit. Tool results omitted from model context must still be retained in an execution trace under the applicable data policy.

### 3.2 Reliability and added failure surfaces

Programmatic aggregation removes some stochastic decisions but adds generated-code and runtime failure events. A simplified success factorization is

$$
\Pr(Z_{\mathrm{prog}})
\mathrel{=}
\Pr(Z_c)
\Pr(Z_m\mid Z_c)
\Pr(Z_x\mid Z_c,Z_m)
\Pr(Z_a\mid Z_c,Z_m,Z_x)
\Pr(Z_v\mid Z_c,Z_m,Z_x,Z_a),
$$

where $Z_c$ is semantically correct code, $Z_m$ correct admission for all invoked tools, $Z_x$ correct execution and error handling, $Z_a$ an evidence-sufficient aggregate, and $Z_v$ successful outcome verification. Fewer model turns do not automatically increase reliability; a faulty loop can repeat an error at machine speed.

### 3.3 Economic decision rule

For deployment-specific weights, choose programmatic aggregation when

$$
\lambda_L\mathbb E[L_{\mathrm{prog}}]
+
\lambda_B\mathbb E[B_{\mathrm{prog}}]
+
\lambda_R\mathbb E[C_{\mathrm{failure,prog}}]
<
\lambda_L\mathbb E[L_{\mathrm{direct}}]
+
\lambda_B\mathbb E[B_{\mathrm{direct}}]
+
\lambda_R\mathbb E[C_{\mathrm{failure,direct}}].
$$

Estimate these terms from representative traces. Container startup, program generation, provider billing, data retention, and approval pauses all affect the inequality.

## 4. Strong and weak workload fits

| Workload shape | Fit | Reason |
|---|---|---|
| Bounded fan-out over many independent records | Strong | Parallel execution and aggregation remove model resumptions |
| Large results reduced by exact predicates or arithmetic | Strong | Raw data need not occupy model context |
| Deterministic joins across typed APIs | Strong | Code expresses keys, loops, and invariants precisely |
| Iterative retrieval with machine-checkable stopping rule | Strong | Program can query, deduplicate, and stop without resampling |
| One or two small calls | Weak | Startup and code-generation overhead may dominate |
| Every next action requires semantic interpretation | Weak | Model remains necessary between calls |
| Immediate user feedback or consent between steps | Weak | Aggregation cannot bypass interaction boundaries |
| Irreversible writes in a generated loop | Usually weak | Blast radius, duplicate effects, and recovery complexity increase |
| UI computer use driven by changing screenshots | Weak | Each observation commonly changes the action policy |

Anthropic's current programmatic-tool-calling documentation reports favorable token reductions for a 75-tool project-management benchmark and parts of production traffic, but it also reports unchanged scores with higher cost on a sequential one-or-two-call benchmark [PTC]. Those measurements are scoped to the cited model, traffic, pricing, and workload. They are evidence for measuring workload shape, not universal savings claims.

## 5. Design methodology

### 5.1 Eligibility analysis

For every candidate tool, require:

- a structured, validated output contract;
- bounded response size and execution time;
- deterministic authorization independent of generated code;
- explicit idempotency and effect semantics;
- a concurrency limit and rate-limit policy;
- provenance fields that survive aggregation;
- a decision on whether direct, programmatic, or both call paths are allowed.

OpenAI's current programmatic interface uses an `allowed_callers` field to choose direct or programmatic availability and can combine loaded tools with later program execution [OPT]. Anthropic also exposes `allowed_callers`, but explicitly states that its field guides presentation and is not a hard security boundary [PTC]. In either case, runtime authorization must inspect every actual invocation.

### 5.2 Execute a bounded aggregation program

```text
INPUT: generated program P, authenticated context c, tool registry U,
       CPU/time/memory/call/output budgets B
OUTPUT: validated aggregate A or a typed execution failure

1. Parse P; reject unsupported language features and imports.
2. Start an isolated runtime with empty ambient credentials and denied direct
   egress; authorized I/O occurs only through capability-scoped wrappers.
3. Expose only capability-scoped wrappers from U.
4. For every wrapper call:
   a. validate arguments and current authorization;
   b. enforce per-tool and global budgets;
   c. assign an invocation ID and idempotency policy;
   d. execute with timeout; retain the full result in the audit trace;
   e. return a typed value or typed error to P.
5. Enforce bounded concurrency. On terminal failure, stop new calls and attempt
   cooperative cancellation of work that has not committed.
6. Drain or reconcile calls that committed or have indeterminate status; record
   each nested outcome explicitly and never represent cancellation as rollback.
7. Validate stdout/artifacts against the aggregate output contract.
8. Attach source invocation IDs, omissions, committed effects, indeterminate
   calls, and partial-failure status.
9. Return A; destroy or retain the runtime according to declared data policy.
```

Let $n=mk$ for $m$ calls returning at most $k$ records each. With bounded $n$ and keyed, denial-of-service-resistant hashing, hash aggregation has expected amortized time $O(n)$ and space $O(h)$ for $h$ distinct keys. When worst-case guarantees are required, a balanced-tree aggregation costs $O(n\log h)$ and avoids an unbounded quadratic collision path. A comparison sort costs $O(n\log n\,C_{\mathrm{cmp}})$ and should be used only when ordered output is required; $C_{\mathrm{cmp}}$ may dominate for normalized or locale-aware keys.

### 5.3 Bound the runtime

Apply wall-clock, CPU, memory, process, file, network, tool-call, recursion, and output limits. Do not inject broad service credentials into the container. Instead, expose narrow wrappers that bind the authenticated principal and current policy. Treat tool results as untrusted data; never interpolate them into executable code or shell commands without safe parsing and validation.

### 5.4 Preserve verification evidence

The aggregate should include the set of source invocation IDs, record counts, failure counts, filters, and transformation version. For high-impact conclusions, retain representative or complete source references rather than a prose summary alone. The final model should be able to distinguish “no match” from “query failed,” “not authorized,” and “result omitted by budget.”

### 5.5 Comparative evaluation

Use direct calling as the control. On identical task instances and policy state, measure final correctness, evidence coverage, model tokens, total cost, wall-clock latency, model resumptions, tool calls, retries, timeouts, and unsafe-attempt rate. Stratify by call count, response size, dependency depth, effect class, and cold versus warm container.

OpenAI's current guidance likewise recommends evaluating correctness and evidence coverage before efficiency, with direct calling as a baseline [OPT]. No provider measurement should be transported to a different workload without matched instrumentation.

## 6. Failure modes

| Failure | Mechanism | Control |
|---|---|---|
| Unbounded fan-out | Generated loop expands over attacker-controlled data | Global call budget, bounded iterators, concurrency semaphore |
| Injection through results | External string is interpreted as code or command | Typed deserialization; data/code separation |
| Hidden partial failure | Program aggregates successes and drops exceptions | Exhaustive typed errors and explicit partial status |
| Duplicate write | Retry repeats side effect inside a loop | Idempotency key, deduplication ledger, write restrictions |
| Approval bypass assumption | Programmatic route is treated as pre-approved | Per-invocation policy and point-of-risk approval |
| Credential leakage | Runtime inherits host environment or broad token | Empty environment; capability wrappers; secret broker |
| Evidence collapse | Final scalar cannot be audited | Source IDs, counts, transform version, retained raw trace |
| Resource exhaustion | Large data or nontermination consumes runtime | CPU, memory, time, output, and call limits |
| Stale container state | Reused files or variables influence later task | Tenant-bound lifecycle and explicit state reset |
| Cancellation leak | Child tasks continue after aggregate fails | Structured concurrency and executor-side cancellation |

## 7. Limitations and evidence boundaries

Generated programs are not automatically deterministic: tool results, clocks, unordered iteration, floating-point reductions, and concurrency can vary. Reproducible aggregation requires fixed inputs, stable snapshots, explicit ordering, bounded numeric behavior, and recorded runtime versions.

Sandboxing reduces but does not eliminate risk. Kernel, runtime, package, network, and tool-wrapper vulnerabilities remain. Managed containers also introduce retention, residency, startup, and observability constraints that must be checked against deployment requirements.

## 8. Production implications and connections

- Place read-only, typed, high-volume tools in the first programmatic rollout; add writes only with explicit effect analysis.
- Capture program source, hash, runtime image, budgets, every nested call, and final transformation metadata.
- Maintain separate service-level objectives for container startup, nested tool execution, and final model completion.
- Route a workload programmatically from measured shape features, not from a global “faster” flag.
- Keep point-of-risk confirmation outside generated code and bind approval to exact arguments and resources.

This topic operationalizes Topic 7's filtering and compression inside an execution runtime. Topic 10 defines the per-invocation gates that the program cannot bypass. Topic 11 supplies retry and compensation semantics, while Chapter 12 provides the sandbox and credential threat model.

## 9. Page-level sources

- [Anthropic, *Programmatic tool calling*](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling) [PTC]
- [OpenAI, *Programmatic Tool Calling*](https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling) [OPT]
- [OpenAI, *Shell*](https://developers.openai.com/api/docs/guides/tools-shell) [OSH]
- [Model Context Protocol, *Tools specification (2025-06-18)*](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP]
