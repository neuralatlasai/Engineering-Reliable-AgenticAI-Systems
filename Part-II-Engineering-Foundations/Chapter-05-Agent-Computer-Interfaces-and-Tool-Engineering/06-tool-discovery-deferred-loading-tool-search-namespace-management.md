# Topic 6 — Tool Discovery, Deferred Loading, Tool Search, and Namespace Management

## 1. Problem and objective

A production agent may have access to hundreds of operations, but presenting every full schema on every model call is rarely free. The definitions consume context, enlarge the selection space, expose irrelevant capabilities, and make schema evolution harder to reason about. Conversely, hiding tools behind an unreliable discovery stage can make a valid operation effectively nonexistent.

The engineering objective is therefore not to minimize the number of visible schemas in isolation. It is to expose enough semantic information for the model to find the right capability, load only the definitions required for the current task, and preserve deterministic authorization after discovery.

Discovery answers **what could be relevant**. Admission answers **what this principal may execute now**. Combining those questions is a category error: an undiscovered tool cannot be selected, but a discovered tool is not thereby authorized.

## 2. Intuition: a tool catalog is an index, not a prompt appendix

Treat the initial tool surface like the table of contents of a large technical library. A useful table of contents names stable domains and states what each domain contains. It does not inline every page. Once the reader chooses a domain, a second-stage lookup retrieves the precise operation and schema.

This produces a three-stage path:

$$
q
\longrightarrow \text{discover namespaces or tools}
\longrightarrow \text{load candidate definitions}
\longrightarrow \text{select and call}.
$$

Here $q$ is the task-conditioned query. Each transition has its own failure mode. A weak namespace description causes a discovery miss; overlapping tools cause a selection error; a valid call can still fail admission or execution.

OpenAI's current tool-search interface makes this separation concrete: deferred functions can be loaded through hosted or client-executed search, while namespaces and MCP servers expose only their high-level names and descriptions until matching definitions are loaded [OTS]. MCP independently defines dynamic discovery through paginated `tools/list` and optional tool-list change notifications [MCP]. These are implementations of the same general indexing problem, not interchangeable wire protocols.

## 3. Formal model and rigorous analysis

Let $\mathcal U_c$ be the tools reachable under configuration $c$. Partition it into eager tools $\mathcal U_0$ and deferred tools $\mathcal U_D$. A discovery policy $D$ maps a query, model-visible catalog metadata $M_t^{\mathrm{vis}}$, and trusted runtime context to a loaded subset:

$$
S_t = D(q_t, M_t^{\mathrm{vis}}, c_t),
\qquad
S_t \subseteq \mathcal U_D,
\qquad
L_t = \mathcal U_t^{\mathrm{callable}} = \mathcal U_0 \cup S_t.
$$

$M_t^{\mathrm{vis}}$ contains searchable names and descriptions plus eager definitions, not authenticated identity fields or the complete deferred schemas. For a candidate invocation $x_t=(u_t,\theta_t)$, callability and admission remain separate:

$$
u_t \in L_t,
\qquad
\operatorname{Admit}(x_t,c_t,s_t;v_{\mathrm{policy}})\in\{0,1\}.
$$

This equation is the security invariant: discovery changes model visibility, whereas `Admit` enforces schema, policy, authorization, effect, and resource constraints.

For a task with at least one valid target tool in the relevance set $G_t \subseteq \mathcal U_c$, evaluate the complete loaded callable surface $L_t$, including eager tools:

$$
\operatorname{Recall}_D
\mathrel{=}
\frac{|L_t \cap G_t|}{|G_t|},
\qquad
\operatorname{Precision}_D
\mathrel{=}
\frac{|L_t \cap G_t|}{\max(1,|L_t|)}.
$$

High recall prevents capability misses; high precision limits ambiguity and loaded-schema cost. Neither implies end-to-end correctness. For one required action, the chain includes an additional discovery term:

$$
\Pr(Z_{\mathrm{tool}})
\mathrel{=}
\Pr(Z_d)
\Pr(Z_s \mid Z_d)
\Pr(Z_a \mid Z_d,Z_s)
\Pr(Z_m \mid Z_d,Z_s,Z_a)
\Pr(Z_e \mid Z_d,Z_s,Z_a,Z_m)
\Pr(Z_r \mid Z_d,Z_s,Z_a,Z_m,Z_e)
\Pr(Z_v \mid Z_d,Z_s,Z_a,Z_m,Z_e,Z_r),
$$

where $Z_d$, $Z_s$, $Z_a$, $Z_m$, $Z_e$, $Z_r$, and $Z_v$ denote correct discovery, selection, arguments, admission, execution, result interpretation, and verification. Deferred loading can improve $\Pr(Z_s\mid Z_d)$ by reducing the candidate set while decreasing $\Pr(Z_d)$ if the catalog is poorly indexed.

### 3.1 A cost model for eager versus deferred exposure

Let $B(X)$ be the token footprint of exposing definition set $X$, $L_D$ discovery latency, $C_{\mathrm{miss}}$ the loss of failing to load a required tool, and $A(L_t)$ a measured ambiguity cost for the loaded set. A deployment-specific objective is

$$
J(D)
\mathrel{=}
\lambda_B\,\mathbb E\!\left[B(M_t^{\mathrm{vis}})+B(S_t)\right]
+
\lambda_L\,\mathbb E[L_D]
+
\lambda_M\,\Pr(L_t\cap G_t=\varnothing)C_{\mathrm{miss}}
+
\lambda_A\,\mathbb E[A(L_t)].
$$

The weights encode product constraints; they are not universal constants. An emergency-control agent may assign far more weight to discovery misses than an exploratory analytics agent. Measure $B$ with the provider's actual serialization and tokenizer because schema syntax, descriptions, caching, and hidden system material affect the realized cost.

### 3.2 Namespace design

A namespace should represent a coherent domain boundary such as `billing.invoice` or `source_control.pull_request`. Within it, tool names should distinguish resource and verb without restating the entire documentation hierarchy. The naming function should be stable:

$$
n_u = f(\text{domain},\text{resource},\text{operation}),
$$

subject to provider and protocol naming constraints.

Stability matters because traces, allowlists, approval rules, cached schemas, and evaluations often key on tool identity. A rename is therefore a contract migration, not a cosmetic edit.

OpenAI currently recommends clear high-level namespace descriptions and, as a best practice for its trained tool-search path, fewer than ten functions per namespace [OTS]. That number is scoped provider guidance, not a general threshold. Anthropic reports that prefix- versus suffix-based namespacing can change evaluation results and explicitly recommends choosing by evaluation [ATE]. Both observations imply the same rule: namespace granularity is empirical and model-dependent.

### 3.3 Dynamic catalogs and cache coherence

Tool inventories can vary by tenant, feature flag, region, resource state, or credential scope. Keep the model-visible catalog $M_t^{\mathrm{vis}}$ distinct from the trusted cache envelope

$$
K_t = (\text{catalog version},\text{principal},\text{tenant},\text{policy version},\text{expiry}).
$$

The runtime uses $K_t$ as a cache key and validation envelope; it need not expose these identity or policy fields to the model. Caching without these dimensions risks cross-tenant exposure or stale selection. MCP's `listChanged` capability allows a server to announce that its tool list changed, but the notification is an invalidation signal, not proof that a cached authorization decision remains valid [MCP].

## 4. Design methodology

### 4.1 Classify the inventory

Keep a tool eager when it is frequently required, cheap to describe, low in ambiguity, and necessary to recover from discovery failures. Defer a tool when it is specialized, schema-heavy, tenant-dependent, or one member of a broad family. Do not defer the only tool that can repair a failed discovery path unless the runtime supplies another deterministic recovery route.

### 4.2 Build a two-level catalog

1. Define stable namespace metadata: name, purpose, resource domain, effect summary, and authoritative owner.
2. Define tool metadata inside each namespace: precise purpose, input/output schemas, effect class $\chi_u$, executor $e_u$, and policy references.
3. Version both levels independently but record the exact pair used for every call.
4. Keep authorization data out of model-authored queries. The server derives principal and tenant from authenticated runtime context.

### 4.3 Retrieve, validate, and admit

```text
INPUT: task query q, authenticated context c, model-visible catalog M_vis,
       trusted cache envelope K
OUTPUT: callable definitions S or a typed discovery failure

1. Assert K.principal = c.principal and K.tenant = c.tenant; never expose or
   accept those identity fields through M_vis or the model-authored query.
2. Search namespace metadata in M_vis using q and deterministic tenant filters.
3. Rank candidate namespaces; retain at most the configured budget.
4. Retrieve tool definitions from the selected namespaces.
5. Validate every definition against the catalog schema and signature.
6. Remove expired, disabled, incompatible, or policy-ineligible entries.
7. Return S with the versions from K and the retrieval trace.
8. Before any call, run the normal admission policy again on current state.
```

For a catalog with an indexed search structure, retrieval is typically sublinear in the total number of tools, but exact complexity depends on the index. A linear scan is $O(|\mathcal U_c|)$ per discovery request and may be acceptable only for a bounded catalog. If one score computation costs $C_s$ and one comparison costs $C_{\mathrm{cmp}}$, ranking $k$ retrieved candidates costs $O(kC_s+k\log k\,C_{\mathrm{cmp}})$ with comparison sorting, or $O(kC_s+k\log b\,C_{\mathrm{cmp}})$ when retaining the best $b\ll k$ in a bounded heap. The dominant production cost is often remote catalog latency plus schema serialization rather than the local comparison count.

### 4.4 Evaluate with ablations

Compare at least four conditions on held-out, multi-step tasks:

- all definitions eager;
- namespace-level deferred loading;
- individual-function deferred loading;
- an oracle catalog containing only task-relevant tools.

Measure end-to-end success, discovery recall, wrong-tool rate, argument validity, input tokens, time to first call, total latency, and denied-call rate. The oracle is a diagnostic upper bound on selection simplicity, not a deployable baseline because it assumes task relevance is known in advance.

## 5. Failure modes

| Failure | Mechanism | Detection | Control |
|---|---|---|---|
| Discovery miss | Namespace description does not match user language | Low held-out recall; fallback queries succeed | Synonyms, examples, query rewriting, bounded second search |
| Namespace collision | Two domains expose indistinguishable names or purposes | Wrong-domain calls; unstable rankings | Stable domain/resource/verb naming and distinct descriptions |
| Catalog poisoning | Untrusted server supplies manipulative descriptions or annotations | Signature or trust-root failure | Trust registry, signed catalog snapshots, untrusted-content labeling |
| Stale definition | Schema or availability changed after caching | Version mismatch or repeated validation failures | Expiry, invalidation, version pinning, forced refresh |
| Tenant leakage | Cache key omits principal or tenant | Cross-tenant tool appearance in audit | Principal- and tenant-bound cache keys |
| Discovery-as-authorization | Loaded tool bypasses current policy | Calls succeed after permission revocation | Independent just-in-time admission |
| Search explosion | Broad query loads many schemas | Loaded-token and candidate-count alarms | Namespace budget, minimum score, deterministic cap |
| Hidden recovery path | Discovery tool itself fails | No callable fallback remains | Small eager recovery set and typed failure response |

## 6. Limitations and evidence boundaries

Tool-search quality depends on the model, query distribution, naming language, catalog implementation, and provider serialization. Results observed for one model or vendor interface do not transfer automatically. A token reduction can also increase wall-clock latency if discovery requires another remote hop.

Namespace boundaries improve cognitive organization but do not create isolation. If two namespaces share credentials, executor state, or mutable resources, their failure domains remain coupled. Likewise, a protocol's discovery metadata cannot certify that the implementation behind a tool is safe or honest.

## 7. Production implications

- Record the visible catalog, loaded definitions, search query, scores, catalog version, and policy version in the trace.
- Separate catalog availability objectives from tool-execution objectives; a healthy executor is useless if discovery cannot expose it.
- Apply strict output limits to client-executed discovery so a compromised catalog cannot inject an unbounded schema set.
- Maintain an eager minimal set for clarification, policy explanation, and recovery where the product requires those capabilities.
- Re-run discovery evaluations after model, schema, namespace, or description changes. These are behavioral changes even when the executor code is untouched.

## 8. Connections

This topic extends the configuration-indexed tool set $\mathcal U_c$ from Chapters 1 and 3 with a runtime visibility layer. Topic 3's schema design determines the cost of loading each definition. Topic 4's semantic affordance determines whether catalog descriptions support reliable search. Topic 10 supplies the admission boundary that discovery must never replace, and Topic 15 analyzes the saturation regime in which additional visible tools reduce performance.

## 9. Page-level sources

- [OpenAI, *Tool search*](https://developers.openai.com/api/docs/guides/tools-tool-search) [OTS]
- [Model Context Protocol, *Tools specification (2025-06-18)*](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) [MCP]
- [Anthropic, *Writing effective tools for agents*](https://www.anthropic.com/engineering/writing-tools-for-agents) [ATE]
- [Google ADK, *Tools and Integrations*](https://adk.dev/tools/) [ADK-T]
