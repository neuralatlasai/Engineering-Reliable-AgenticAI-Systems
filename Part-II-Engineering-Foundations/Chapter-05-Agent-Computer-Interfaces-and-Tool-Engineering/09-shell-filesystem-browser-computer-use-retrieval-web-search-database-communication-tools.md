# Topic 9 — Shell, Filesystem, Browser, Computer-Use, Retrieval, Web-Search, Database, and Communication Tools

## 1. Problem and objective

“Tool use” hides materially different interfaces. Reading a file, running a shell command, clicking a rendered button, retrieving a semantic passage, updating a database row, and sending a message differ in observation quality, authority, latency, reversibility, and verification. Treating them as interchangeable functions prevents meaningful risk analysis.

The objective is to choose the narrowest tool family that exposes the required semantics and to bind it to an executor, resource scope, effect class $\chi_u$, authorization policy $\alpha_u$, and evidence contract. A graphical interface is not inherently safer than an API; a typed database operation is not safe merely because its schema validates.

## 2. Intuition: select by semantic distance and control

Prefer the interface whose operations most directly represent the intended state transition while preserving deterministic checks. If the task is “set invoice status to paid,” a domain API can express the resource, transition, version, and authorization explicitly. A browser click may reach the same outcome, but it relies on screen interpretation, focus, layout, session state, and an indirect postcondition.

This does not imply that APIs always dominate. Browser or computer-use tools are necessary when no suitable API exists, when visual state is itself the evidence, or when the supported workflow is intentionally human-facing. Shell and code execution are powerful aggregation layers when the authority surface is tightly bounded. The correct choice is conditional on task semantics and available controls.

## 3. A common analytical frame

Represent a candidate tool surface by

$$
u = \bigl(n_u,d_u,\Sigma_u^{\mathrm{in}},\Sigma_u^{\mathrm{out}},
e_u,\chi_u,\iota_u,\alpha_u,\phi_u\bigr).
$$

For an intended transition $g$, define semantic distance $D_{\mathrm{sem}}(u,g)$ as an evaluation metric measuring the number and ambiguity of intermediate interpretations between a call and $g$. Define observability $O(u)$ as the fraction of relevant prestate, transition evidence, and poststate exposed through typed results. A deployment-specific selection objective is

$$
J(u\mid g,c)
\mathrel{=}
\lambda_D D_{\mathrm{sem}}(u,g)
+
\lambda_L\mathbb E[L_u]
+
\lambda_C\mathbb E[C_u]
+
\lambda_R\mathbb E[\rho_u]
+
\lambda_V\bigl(1-O(u)\bigr),
$$

subject to authorization, availability, and evidence requirements. Here $L_u$ is latency, $C_u$ is monetary or resource cost under a declared accounting boundary, and $\rho_u=\rho(a_u,c)$ is consequence-weighted loss for the candidate action $a_u$, not the contract's effect class $\chi_u$. The weights and metrics are application-specific; the equation is a decision scaffold, not a universal ranking.

For a proposed action $a$, consequence-weighted loss can be decomposed as

$$
\rho(a,c)
\mathrel{=}
\sum_{h\in\mathcal H}
\Pr(h\mid a,c)\,C(h,c),
$$

where $\mathcal H$ is a set of harms and $C$ their context-dependent consequences. UI automation may raise $\Pr(h\mid a,c)$ through perceptual ambiguity; a high-authority database tool may instead raise $C(h,c)$ through blast radius. Neither risk is captured by syntax validity.

## 4. Tool-family analysis

| Family | Primary semantics | Typical executor and evidence | Principal risks | Strong control pattern |
|---|---|---|---|---|
| Shell | Command execution over process and OS resources | Hosted container or application-owned local runtime; stdout, stderr, exit status, artifacts | Arbitrary code, injection, ambient credentials, filesystem/network reach | Isolation, empty environment, allow/deny policy, resource limits, full audit |
| Filesystem | Read, enumerate, create, patch, move, or delete paths | Local/remote storage API; bytes, metadata, content hash, diff | Traversal, symlink races, overwrite, secret disclosure, partial writes | Canonicalized root, descriptor-relative access, atomic replace, version/hash precondition |
| Structured browser | DOM/accessibility/network operations | Browser automation runtime; selectors, DOM snapshots, responses | Stale selectors, session confusion, injected page content, hidden UI state | Isolated profile, origin allowlist, locator checks, response/state verification |
| Computer use | Coordinate-, key-, or screenshot-conditioned UI actions | Isolated browser/VM; screenshots and action results | Perceptual error, focus drift, prompt injection, high-impact clicks | Updated screenshot loop, point-of-risk confirmation, post-action visual verification |
| Retrieval/file search | Query over indexed private corpus | Search service/vector store; ranked chunks, file metadata, citations | Recall loss, stale index, authorization leakage, misleading rank | Metadata ACL filter, bounded top-$k$, source IDs, freshness and coverage tests |
| Web search | Query/open/find over external web | Hosted or client search; URLs, snippets, page content, citations | Untrusted content, freshness variance, source quality, data disclosure | Domain policy, source metadata, citation verification, query privacy review |
| Database | Typed queries and mutations over structured state | DB proxy or service API; rows, affected count, transaction/version | Injection, broad scans, stale reads, lost updates, irreversible writes | Parameterization, row/column policy, transaction, optimistic version, statement limits |
| Communication | Send, post, publish, schedule, or notify | Service API/MCP/connector; delivery or provider receipt | Acting as user, wrong recipient, privacy breach, social/legal impact | Recipient/content preview, narrow consent, idempotency, delivery and thread verification |

The table gives typical properties, not guarantees. A “filesystem” may be an eventually consistent object store; a “database” tool may wrap a business API; a “browser” tool may expose both DOM and pixels. Classify the actual executor and contract.

### 4.1 Shell tools

Shell exposes a compact language for composing processes and files, which makes it effective for inspection, transformation, builds, and deterministic automation. It also gives a small textual proposal access to a potentially enormous authority surface.

OpenAI's current Responses shell tool supports both provider-hosted containers and application-executed local environments under the shell call/result lifecycle [OSH]. The executor location changes data residence, credentials, installed software, persistence, and incident ownership even when the model-facing abstraction is similar. The same documentation warns that arbitrary shell commands require sandboxing, allowlists or denylists where possible, and audit logging [OSH].

Do not validate shell safety with string matching alone. Shell grammars include substitution, redirection, pipelines, environment expansion, and interpreter-specific behavior. Prefer argument-vector tools or dedicated operations when possible. If a shell is required, combine OS isolation, a restricted working root, network policy, resource limits, secret minimization, and execution logging.

### 4.2 Filesystem tools

Filesystem authorization should operate on the resolved object, not only the user-supplied path string. A safe write resolves and opens beneath an authorized root, rejects traversal and unsafe link behavior, checks the expected version or hash, writes to a temporary sibling, flushes as required, and atomically replaces the target where the filesystem supports it.

For a patch with expected digest $h_0$, the precondition is

$$
H(\text{current bytes}) = h_0.
$$

After the write, verify both the new digest and the intended diff. A successful system call is not proof that the correct file changed.

### 4.3 Structured browser and computer-use tools

Structured browser automation addresses elements and network state; computer use acts through rendered observations and input events. Structured access usually reduces perceptual ambiguity, while pixels can cover applications without stable automation hooks.

Computer use is a closed observation-action loop:

$$
X_t^{\mathrm{screen}}
\longrightarrow \widetilde A_t^{\mathrm{UI}}
\longrightarrow A_t^{\mathrm{UI}}
\longrightarrow X_{t+1}^{\mathrm{screen}}.
$$

The next action must be conditioned on an updated observation when the UI may have changed. OpenAI's current guide supports batched UI `actions[]` but still requires updated screenshots and advises isolated execution, untrusted treatment of page content, and confirmation immediately before high-impact actions [OCU]. A batch is safe only when its internal actions do not cross an observation or approval boundary.

### 4.4 Retrieval and web search

Retrieval searches an indexed, usually curated corpus; web search queries an external, mutable information environment. Retrieval can offer stronger corpus identity and access control, but index freshness and chunking can hide evidence. Web search improves freshness and breadth but introduces adversarial content, source-quality variance, and privacy concerns around queries.

OpenAI's file-search interface supports result-count limits and metadata filters, explicitly trading token use and latency against answer quality [OFS]. Its web-search interface returns URL citation annotations and can expose the broader consulted source list; rendered citations must remain visible and clickable when web-derived information is shown to users [OAI-WEB]. These are provider-specific response semantics, while the general invariant is source-addressable evidence.

### 4.5 Database tools

Do not expose unrestricted SQL merely because the model can write it. Prefer domain-shaped read and mutation operations with parameterized inputs, bounded predicates, statement timeouts, row limits, and database-enforced access control. If SQL is necessary, use a proxy that parses and plans statements, restricts schemas and verbs, applies a read-only transaction where applicable, and rejects unbounded or multi-statement execution.

Mutations should include optimistic concurrency:

$$
\operatorname{UPDATE}(r,v_{\mathrm{expected}},\Delta)
\text{ succeeds only if }
v(r)=v_{\mathrm{expected}}.
$$

The affected-row count must be interpreted. Zero may mean stale version, missing resource, or denied scope; it is not automatically a successful no-op.

### 4.6 Communication tools

Sending a message, publishing a post, creating a ticket, or scheduling a meeting changes another person's information environment and may legally or socially represent the user. The executor should bind the authenticated sender, normalize recipients, display the exact audience and payload at the point of approval when required, and return a durable provider or thread identifier.

“API accepted” is a transport observation, not proof of delivery or human receipt. Define the required postcondition—queued, delivered, posted, or acknowledged—and verify at that level.

## 5. Design methodology

```text
INPUT: intended outcome g, authenticated context c, candidate tool contracts U
OUTPUT: admitted tool plan P or a typed infeasibility result

1. Derive required resources, operations, evidence, latency, and reversibility from g.
2. Remove tools whose executor, authority, or data-residency boundary is incompatible.
3. Remove tools that cannot expose the required prestate and postcondition evidence.
4. Estimate semantic distance, latency, cost, and consequence-weighted loss.
5. Prefer the narrowest typed operation on the Pareto frontier.
6. Add deterministic preconditions, budgets, authorization, and point-of-risk approval.
7. Define executor-specific postconditions and recovery behavior.
8. Execute one observation-dependent segment at a time.
9. Verify the resulting state through an independent or authoritative observation.
10. Record proposal, admission, executor, resources, results, and verification evidence.
```

For $n$ candidate tool surfaces and constant-time contract predicates, filtering is $O(n)$. Pareto-front construction is $O(n^2)$ by naive pairwise dominance and is inappropriate for unbounded catalogs; fixed-dimensional algorithms or incremental indexes can reduce cost, but in practice discovery should first produce a bounded $n$. Estimation callbacks may dominate local complexity when they query policy engines, planners, or remote health data.

## 6. Failure modes

| Failure | Example | Mitigation |
|---|---|---|
| Wrong abstraction | Pixel clicks used where a typed API exists | Interface selection evaluation and semantic-distance review |
| Executor confusion | Hosted shell assumed to see local files | Explicit executor and mounted-resource contract |
| Observation staleness | UI changes after screenshot | Fresh observation before dependent action |
| Ambient authority | Local process inherits cloud credentials | Empty environment and capability-scoped broker |
| Injection | Web page or tool output supplies hostile instructions | Untrusted-content labeling; never treat content as authorization |
| Weak verification | Exit code zero or HTTP 200 treated as outcome success | Domain-specific postcondition query |
| Broad query | Model scans full table or corpus | Indexed filters, row/result limits, timeouts |
| Recipient ambiguity | Message sent to wrong “Alex” | Stable recipient ID plus human-readable preview |
| Citation loss | Search answer survives without source metadata | Preserve URL/file identifiers through result shaping |
| Cross-tool identity mismatch | Browser account and API credential refer to different tenant | Principal/account binding and trace correlation |

## 7. Limitations and evidence boundaries

No taxonomy fully separates these families. Shell can call databases; browser automation can download files; MCP can expose every family; a communication API may persist data in a database. The family label is useful only when accompanied by executor, authority, resource, state, and evidence semantics.

Provider tools evolve. Availability, action formats, citation objects, confirmation defaults, retention, and supported models must be rechecked at deployment. Documentation demonstrates interface behavior, not reliability under a different workload or threat model.

## 8. Production implications and connections

- Maintain a registry that records family, executor, effect class, resource scope, data residence, and verification method.
- Do not share broad credentials across unrelated families; compromise of a retrieval tool should not imply communication or mutation authority.
- Set family-specific budgets: process limits for shell, path roots for files, origins for browsers, rows for databases, recipients for communication.
- Evaluate the same outcome through competing surfaces where possible; disagreement exposes hidden semantics.
- Preserve an end-to-end causal trace across nested tools and executor boundaries.

Topic 2 distinguishes hosted, local, remote, MCP, and agent tools by placement. This topic classifies what those tools do. Topic 7 shapes their observations, Topic 10 enforces their preconditions and ownership, Topic 11 handles retry and partial success, and Chapter 12 expands the threat model.

## 9. Page-level sources

- [OpenAI, *Shell*](https://developers.openai.com/api/docs/guides/tools-shell) [OSH]
- [OpenAI, *Computer use*](https://developers.openai.com/api/docs/guides/tools-computer-use) [OCU]
- [OpenAI, *File search*](https://developers.openai.com/api/docs/guides/tools-file-search) [OFS]
- [OpenAI, *Retrieval*](https://developers.openai.com/api/docs/guides/retrieval)
- [OpenAI, *Web search*](https://developers.openai.com/api/docs/guides/tools-web-search) [OAI-WEB]
- [OpenAI, *MCP and Connectors*](https://developers.openai.com/api/docs/guides/tools-connectors-mcp) [OMCP]
- [Model Context Protocol, *Tools specification (2025-06-18)*](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP]
- [Google ADK, *Tools and Integrations*](https://adk.dev/tools/) [ADK-T]
