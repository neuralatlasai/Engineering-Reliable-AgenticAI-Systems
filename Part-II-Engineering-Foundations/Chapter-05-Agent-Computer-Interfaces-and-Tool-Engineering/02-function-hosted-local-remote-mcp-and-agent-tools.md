# Topic 2 — Function, Hosted, Local, Remote, MCP, and Agent Tools

## 1. Problem and objective

Tool taxonomies often mix unlike properties. "Function" describes an invocation abstraction, "local" and "remote" describe placement relative to a trust boundary, "hosted" assigns execution to a platform, "MCP" identifies a protocol contract, and "agent tool" describes a higher-order capability. These labels are not mutually exclusive.

The objective is to classify a tool along independent axes so that engineers can reason precisely about latency, authority, state ownership, failure handling, portability, and evidence. The classification must answer five questions:

1. What abstraction does the model select?
2. Where is the executor?
3. Who owns credentials and authoritative state?
4. How are declarations, calls, and results transported?
5. Who verifies the effect?

## 2. Intuition

Consider `create_issue`. It may be declared as a JSON-schema function and executed by the application against a remote SaaS API. The same logical operation may be exposed by a remote MCP server. A model provider may host a connector that reaches the same SaaS service. Another agent may wrap the operation inside an incident-management workflow. Calling one option "function" and another "remote" suggests a false choice: all can be remote in physical effect, while only some use MCP or delegate reasoning.

Classification works better as coordinates than as buckets. A tool occupies one point in a multidimensional design space.

## 3. Formal classification

Augment the chapter contract with a classification vector

$$
\operatorname{Class}(u) = \bigl(\ell_u,e_u,\tau_u,H_u,S_u,C_u,V_u\bigr),
$$

where:

- $\ell_u$ is the model-visible abstraction level: primitive operation, composite workflow, or delegated agent;
- $e_u$ is executor placement: provider, application process, local isolated runtime, or remote service;
- $\tau_u$ is transport and discovery: in-request function declaration, SDK registry, MCP, or provider catalog;
- $H_u$ is the authority holder and credential issuer;
- $S_u$ is authoritative-state ownership;
- $C_u$ is the control-loop owner;
- $V_u$ is the verification owner and evidence location.

These coordinates are not statistically or logically independent, but no coordinate can be inferred safely from a marketing label alone.

For placement-sensitive expected latency, a useful decomposition is

$$
\mathbb E[T_u] = T_{\mathrm{select}} + T_{\mathrm{marshal}} + \mathbb E[T_{\mathrm{transport}}] + \mathbb E[T_{\mathrm{queue}}] + \mathbb E[T_{\mathrm{exec}}] + \mathbb E[T_{\mathrm{verify}}].
$$

The formula is a systems decomposition, not a provider guarantee. A hosted tool may reduce application round trips while adding provider queuing; a local tool may avoid network latency while paying sandbox startup cost.

## 4. Detailed concept analysis

### 4.1 Function tools

A function tool exposes a named operation with typed arguments. The model emits a call; an executor maps the call to application logic. OpenAI's function-calling lifecycle explicitly places execution in the application: the model returns a function call, the application executes it, and the application returns tool output [OFC]. Anthropic similarly distinguishes client-executed tools from server-executed tools in [How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works).

"Function" does not imply an in-process language function. The implementation may perform database I/O, call a remote API, enqueue a job, or enter a workflow engine. The function declaration is the model-facing abstraction; placement and authority remain separate.

### 4.2 Hosted tools

A hosted tool is executed on infrastructure managed by the model or agent platform. The platform may own the network call, sandbox, search index, browser, or code runtime. Hosted execution can reduce integration work and expose provider-native evidence objects, but it moves observability, data handling, limits, and part of the failure domain outside the application.

The application still owns any obligations not guaranteed by the hosted contract: business authorization, user consent, downstream policy, reconciliation, and independent verification. Provider execution is not equivalent to application authorization.

### 4.3 Local tools

"Local" should be defined relative to a declared security boundary. A tool may execute in the agent process, a child process, a container, a VM, or a local desktop while accessing remote state. These placements have different isolation and cleanup properties.

Local placement offers low control-plane latency and direct access to workspace files, but raises ambient-authority risk. A local shell with inherited user credentials can be more dangerous than a remote service with a narrowly scoped token. Local tools require explicit working directories, filesystem roots, environment filtering, resource limits, and deterministic lifecycle cleanup.

### 4.4 Remote tools

A remote tool crosses a network or service boundary. It may be accessed through HTTP, RPC, a queue, a provider connector, or MCP. Remote execution introduces partial failure: a request can time out after the server commits an effect. Therefore every remote write needs a documented deduplication and reconciliation strategy, not merely retry backoff.

Remote placement can improve isolation and centralize credentials. It can also create a confused-deputy path if the remote service accepts model-supplied identity or resource scope without validating the authenticated principal.

### 4.5 MCP tools

MCP defines client-server discovery and invocation semantics. In the 2025-06-18 Tools specification, a server declares a tools capability; clients list tools and call one by name with arguments. A tool definition includes a name, description, input schema, optional output schema, and optional annotations; results can contain structured or unstructured content [MCP].

MCP is a protocol boundary, not an execution placement. An MCP server can be a local process or a remote service. It is also not an authorization system. The specification says clients must treat tool annotations as untrusted unless the server is trusted [MCP]. A `readOnlyHint` can improve presentation or policy routing, but enforcement must derive from trusted configuration and runtime checks.

### 4.6 Agent tools

An agent-as-a-tool exposes a delegated reasoning process as a callable capability. Google ADK distinguishes this from a sub-agent transfer: an agent tool returns its answer to the calling agent, which retains control, whereas transfer to a sub-agent changes who answers subsequent input in [Function tools and agent-as-a-tool](https://adk.dev/tools/function-tools/).

Agent tools can hide a multi-step workflow behind one semantic affordance. They also introduce stochastic internal selection, multiple tool calls, hidden state, and a larger failure surface. Their output should therefore include bounded evidence and status, not only prose. Delegation does not transfer the caller's authority automatically; the child must receive an explicitly attenuated capability.

### 4.7 Comparison by engineering responsibility

| Label | What it specifies | What it does not specify | Principal engineering risk |
|---|---|---|---|
| Function tool | Typed call abstraction | Executor placement or authority | Schema-valid call with invalid domain meaning |
| Hosted tool | Provider-side execution | Business authorization or verification | Externalized observability and data boundary |
| Local tool | Proximity to declared local boundary | Isolation strength or remote effects | Ambient credentials and host compromise |
| Remote tool | Service/network boundary | Protocol or semantic granularity | Partial failure and duplicate effects |
| MCP tool | Discovery/call/result protocol | Trust, authorization, or physical location | Treating declarations and annotations as trusted policy |
| Agent tool | Delegated reasoning abstraction | Placement, determinism, or authority | Hidden multi-step effects and weak evidence |

## 5. Methodology: selecting a tool form

1. Write the required state transition and evidence before choosing a provider feature.
2. Select the abstraction level $\ell_u$ that minimizes ambiguous selection without hiding safety-critical intermediate decisions.
3. Choose placement $e_u$ according to data residency, credential containment, latency, isolation, and observability.
4. Choose transport $\tau_u$ according to interoperability and lifecycle needs; do not use MCP merely to rename an in-process function.
5. Assign identity, credential issuance, policy decision, state ownership, and verification to named components.
6. Define timeout, cancellation, deduplication, and late-result handling at every crossed boundary.
7. Conformance-test declarations and results across versions before relying on portability.
8. Measure the complete path under realistic concurrency and faults, including cold start and postcondition reads.

## 6. Reference classification algorithm

```text
PROCEDURE ClassifyTool(tool_definition, deployment):
    abstraction <- InspectModelVisibleUnit(tool_definition)
    executor <- ResolveActualExecutor(deployment)
    transport <- IdentifyDiscoveryAndCallProtocol(deployment)
    authority <- IdentifyCredentialIssuerAndPolicyDecisionPoint(deployment)
    state_owner <- IdentifyAuthoritativeResourceOwner(deployment)
    loop_owner <- IdentifyComponentThatConsumesResultsAndChoosesNextStep(deployment)
    verifier <- IdentifyIndependentEvidenceAndVerificationOwner(deployment)

    ASSERT executor is explicit
    ASSERT authority is not inferred from description or annotation
    ASSERT write tools define timeout and duplicate semantics
    ASSERT agent tools define delegated capability scope

    RETURN Classification(abstraction, executor, transport, authority,
                          state_owner, loop_owner, verifier)
```

The classification record itself has fixed arity; the hard part is organizational discovery. A hash registry provides expected amortized $O(1)$ lookup under suitable hashing, while a balanced tree provides worst-case $O(\log N)$ for $N$ tools. Linear scanning is $O(N)$ and should not sit on an unbounded hot path. Registries must be bounded or use denial-of-service-resistant hashing when names can be influenced by untrusted parties. Model selection cost is not characterized by registry lookup complexity; it depends on prompt representation, model behavior, and tool ambiguity.

## 7. Limitations and assumptions

- "Local" and "remote" are observer-relative; architecture documents must name the reference boundary.
- Hosted implementations can change independently of application code, so product semantics require dated documentation and regression tests.
- An agent tool may expose too little internal trace to verify each delegated action.
- Protocol interoperability does not guarantee semantic interoperability: two servers can use identical schemas but assign different meanings to fields and errors.
- Lower network latency does not imply lower end-to-end latency when sandbox startup, queuing, or verification dominates.

## 8. Failure modes

| Failure mode | Example | Mitigation |
|---|---|---|
| Placement inferred from label | Assuming every function runs locally | Record executor identity in the registry and trace |
| Protocol treated as trust | Auto-approving an MCP tool's advisory annotation | Bind policy to trusted server identity and local classification |
| Hosted tool over-authorized | Provider-held connector can access every tenant | Per-user scoped credentials and server-side resource checks |
| Local tool inherits ambient secrets | Child process receives the full environment | Allowlisted environment and attenuated capabilities |
| Remote timeout blindly retried | Duplicate payment or ticket creation | Idempotency key and reconciliation read |
| Agent tool becomes an opaque mega-tool | Child performs unreviewed writes | Effect budget, nested trace, and approval at irreversible boundary |

## 9. Production implications

- Store $\operatorname{Class}(u)$ beside the schema; review changes to any coordinate as contract changes.
- Trace logical tool identity separately from physical executor instance and downstream resource.
- Use end-to-end deadlines propagated across provider, application, MCP, and remote-service boundaries.
- Keep credentials at the narrowest execution boundary and pass capability references rather than raw secrets.
- Preserve late completions and duplicate detections in the invocation record; do not overwrite the original uncertain outcome.
- Benchmark warm, cold, failure, cancellation, and verification paths separately.

## 10. Connections

- Topic 1 supplies the full ACI contract to which this classification attaches.
- Topic 3 specifies the typed declarations transported by function APIs and MCP.
- Topic 5 adds effect and reversibility classes, which cannot be inferred from executor placement.
- Chapter 3 assigns control-plane responsibility for admission and lifecycle across these placements.
- Chapter 4 explains the provider-specific call and result objects used to transport these abstractions.

## Primary sources

- [OpenAI, Function calling](https://developers.openai.com/api/docs/guides/function-calling) [OFC].
- [Anthropic, How tool use works](https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works).
- [Model Context Protocol, Tools specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP].
- [Google ADK, Function tools and agent-as-a-tool](https://adk.dev/tools/function-tools/).
- [Google ADK, MCP tools](https://adk.dev/tools-custom/mcp-tools/).
