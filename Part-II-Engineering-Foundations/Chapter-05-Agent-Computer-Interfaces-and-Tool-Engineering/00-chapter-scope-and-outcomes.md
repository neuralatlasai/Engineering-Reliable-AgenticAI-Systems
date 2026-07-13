# Chapter 5 — Agent–Computer Interfaces and Tool Engineering

## Scope, Prerequisites, Terminology, Boundaries, Exclusions, and Expected Outcomes

---

## 1. Why the interface is a first-class system object

A model does not act directly on a computer. It emits a proposal; an interface assigns that proposal a typed meaning, checks whether it is admissible, executes an operation in some authority domain, and returns an observation. Tool engineering therefore sits on the causal path between model intent and environmental change. A weak interface can make a capable model unreliable; a precise interface can make the same model easier to constrain, evaluate, and debug.

This chapter treats the **agent–computer interface (ACI)** as the complete contract through which a model proposes and observes computer-mediated actions. The contract includes discovery, names and descriptions, input and output schemas, execution placement, authorization, effect semantics, retry behavior, resource ownership, provenance, and result presentation. This is broader than “function calling,” and narrower than the harness as a whole.

The core decomposition is:

$$
\text{task intent}
\longrightarrow \text{tool selection}
\longrightarrow \text{argument construction}
\longrightarrow \text{admission}
\longrightarrow \text{execution}
\longrightarrow \text{result interpretation}
\longrightarrow \text{verification}.
$$

Each arrow is a distinct failure boundary. Treating a syntactically valid call as a successful action collapses those boundaries and produces misleading reliability claims.

## 2. Chapter scope

The unit of analysis is the **tool contract and its runtime boundary**. Topics 1–4 establish the ACI abstraction, tool classes, schema design, and semantic affordance. Topics 5–8 cover effect classes, discovery, result shaping, and code execution as an aggregation layer. Topics 9–12 cover major tool families, deterministic enforcement, retry/compensation semantics, and provenance. Topics 13–15 define evaluation, adversarial contract testing, and the tool-surface saturation problem.

The chapter is provider-comparative but not provider-led. OpenAI, Anthropic, Google ADK, and MCP mechanisms are evidence-bearing implementations of general design choices; they are not the chapter’s organizing ontology.

## 3. Prerequisites

Readers should understand Chapters 1–4, especially:

- the typed proposal-to-action path $Y_t \rightarrow \Xi_t \rightarrow \widetilde A_t \rightarrow A_t$;
- the configuration-indexed tool set $\mathcal U_c$ and execution policy $\pi_{\mathrm{exec}}$;
- the harness control-plane/data-plane separation and deterministic invariant floor;
- provider-side versus application-side execution and state ownership.

Working knowledge of JSON Schema, API contracts, authentication, transactions, retries, and basic distributed-systems failure modes is assumed. Python examples use typed pseudocode or standard-library-compatible constructs unless a provider SDK is the subject.

## 4. Terminology and formal contract

For tool $u \in \mathcal U_c$, define the interface contract

$$
u = \bigl(n_u,d_u,\Sigma_u^{\mathrm{in}},\Sigma_u^{\mathrm{out}},
e_u,\chi_u,\iota_u,\alpha_u,\phi_u\bigr),
$$

where $n_u$ is the name, $d_u$ the model-visible description, $\Sigma_u^{\mathrm{in}}$ and $\Sigma_u^{\mathrm{out}}$ the input and output contracts, $e_u$ the executor placement, $\chi_u$ the effect/risk class, $\iota_u$ the retry and idempotency contract, $\alpha_u$ the authorization and resource-ownership policy, and $\phi_u$ the provenance and freshness contract.

The tuple is a book-level synthesis. Providers expose subsets of it through function schemas, MCP annotations, approval policies, execution environments, and result objects [OFC; MCP; ADK-T]. Fields described as “hints” are not enforcement: MCP explicitly defines tool annotations as advisory and untrusted unless the server is trusted [MCP].

For one required tool-mediated action, let $Z_s,Z_a,Z_m,Z_e,Z_r,Z_v$ denote correct selection, valid arguments, correct admission, correct execution, correct result interpretation, and successful verification. The exact chain rule is

$$
\Pr(Z_s \cap Z_a \cap Z_m \cap Z_e \cap Z_r \cap Z_v)
\mathrel{=}
\Pr(Z_s)
\Pr(Z_a\mid Z_s)
\Pr(Z_m\mid Z_s,Z_a)
\Pr(Z_e\mid Z_s,Z_a,Z_m)
\Pr(Z_r\mid Z_s,Z_a,Z_m,Z_e)
\Pr(Z_v\mid Z_s,Z_a,Z_m,Z_e,Z_r).
$$

No independence assumption is made. The factorization exists to show why schema-validity accuracy alone is not end-to-end tool reliability.

## 5. System boundary

The ACI begins where a tool surface becomes visible to the model or to a tool-search mechanism. It ends when a typed, provenance-bearing result has been incorporated into the harness record. Inside the boundary are schema validation, authorization, execution dispatch, retries, duplicate suppression, pagination, filtering, compression, and result labeling. The external service, database, browser, operating system, or human organization remains part of the environment and retains its own semantics.

## 6. Exclusions and handoffs

- General prompt/context allocation belongs to Chapter 6; this chapter covers tool-definition and tool-result context only.
- Cross-session memory belongs to Chapter 7.
- Multi-agent topology belongs to Chapters 8–9; agents-as-tools appear here only as an interface class.
- Full sandbox, credential, prompt-injection, and data-exfiltration treatment belongs to Chapter 12; this chapter establishes the enforcement and trust boundaries those analyses consume.
- General evaluation methodology belongs to Chapter 13; Topics 13–14 specialize it for tool contracts.
- Vendor quickstarts and exhaustive SDK references are excluded. Version-sensitive facts are dated and linked to first-party documentation.

## 7. Measurable outcomes for the reader

After completing the chapter, the reader should be able to:

1. Specify an ACI using the full contract tuple rather than only a name and input schema.
2. Separate function, hosted, local, remote, MCP, and agent tools by executor, authority, state, and evidence location.
3. Design schemas and descriptions that improve selection and argument validity without transferring enforcement into prose.
4. Classify actions by effect, reversibility, idempotency, and resource ownership, then bind each class to deterministic gates.
5. Design bounded, provenance-bearing tool outputs using filtering, pagination, range selection, and progressive disclosure.
6. Decide when code execution reduces round trips and context load, and when its startup, security, or sequential-dependency costs dominate.
7. Implement retry, deduplication, partial-success, and compensation semantics without repeating irreversible effects.
8. Measure tool selection, argument validity, policy compliance, state transition correctness, and end-to-end outcome success separately.
9. Fuzz schemas and descriptions with boundary values, ambiguity, confusables, injection payloads, and metamorphic variants.
10. Detect when adding tools has reduced performance through selection ambiguity, namespace collision, or context saturation.

## 8. Evidence and source ledger

| Tag | Primary source | Used for |
|---|---|---|
| [ATE] | Anthropic, *Writing effective tools for agents* — https://www.anthropic.com/engineering/writing-tools-for-agents | Tool descriptions, namespacing, result shaping, pagination, evaluation |
| [OFC] | OpenAI, Function calling — https://developers.openai.com/api/docs/guides/function-calling | Strict schemas, parallel calls, function-call lifecycle |
| [OTS] | OpenAI, Tool search — https://developers.openai.com/api/docs/guides/tools-tool-search | Deferred loading, namespaces, search results |
| [OSH] | OpenAI, Shell — https://developers.openai.com/api/docs/guides/tools-shell | Hosted versus local execution, shell result items, sandbox warning |
| [OCU] | OpenAI, Computer use — https://developers.openai.com/api/docs/guides/tools-computer-use | UI-action loop and high-impact confirmation boundaries |
| [OMCP] | OpenAI, MCP and Connectors — https://developers.openai.com/api/docs/guides/tools-connectors-mcp | Remote tools, approvals, trust and data-sharing boundaries |
| [MCP] | Model Context Protocol, Tools specification (2025-06-18) — https://modelcontextprotocol.io/specification/2025-06-18/server/tools | Tool discovery/call protocol, schemas, results, annotations |
| [ADK-T] | Google ADK, Custom Tools — https://adk.dev/tools-custom/; Function tools — https://adk.dev/tools/function-tools/; MCP tools — https://adk.dev/tools-custom/mcp-tools/ | Function, built-in, third-party, MCP, and agent tools |
| [ADK-C] | Google ADK, Action confirmations — https://adk.dev/tools-custom/confirmation/ | Human/supervisor confirmation and current limitations |
| [PTC] | Anthropic, Programmatic tool calling — https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling | Code execution as aggregation, placement, context and latency trade-offs |
| [OPT] | OpenAI, Programmatic tool calling — https://developers.openai.com/api/docs/guides/tools-programmatic-tool-calling | Programmatic callers, loaded-tool availability, aggregation, and evaluation guidance |
| [OFS] | OpenAI, File search — https://developers.openai.com/api/docs/guides/tools-file-search | Retrieval result limits, metadata filters, inclusion of raw search results, and quality/context trade-offs |
| [OAI-WEB] | OpenAI, Web search — https://developers.openai.com/api/docs/guides/tools-web-search | Search-source objects and citation handling |
| [ANT-WEB] | Anthropic, Web search — https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool | Search-result content and citations |
| [RFC9110] | IETF, *RFC 9110: HTTP Semantics*, §9.2.2 — https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2 | Idempotent methods and retry semantics |
| [RFC9111] | IETF, *RFC 9111: HTTP Caching*, §4.2 — https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2 | Freshness lifetime and stale responses |
| [AWS-IDEMP] | Featonby, AWS Builders' Library, *Making retries safe with idempotent APIs* — https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/ | Request identity, semantic equivalence, and late-arriving requests |
| [AWS-RETRY] | Brooker, AWS Builders' Library, *Timeouts, retries, and backoff with jitter* — https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ | Retry budgets, capped exponential backoff, and jitter |
| [SAGA] | García-Molina and Salem, *Sagas*, SIGMOD 1987 — https://doi.org/10.1145/38713.38742 | Forward and compensating transactions without global ACID rollback |
| [PROV-DM] | W3C, *PROV-DM: The PROV Data Model* — https://www.w3.org/TR/2013/REC-prov-dm-20130430/ | Entities, activities, agents, derivation, and provenance records |
| [UTS39] | Unicode Consortium, *Unicode Technical Standard #39: Unicode Security Mechanisms* — https://www.unicode.org/reports/tr39/ | Confusables and identifier-security tests |
| [BFCL] | Berkeley Function-Calling Leaderboard V4 — https://gorilla.cs.berkeley.edu/leaderboard | Single-turn, multi-turn, agentic, hallucination, and format evaluation |
| [TSB] | Lu et al., *ToolSandbox*, arXiv:2408.04682 — https://arxiv.org/abs/2408.04682 | Stateful, on-policy tool-use evaluation and milestone/minefield grading |
| [TAU] | Yao et al., *$\tau$-bench*, arXiv:2406.12045 — https://arxiv.org/abs/2406.12045 | Tool-agent-user interaction and policy compliance |
| [TFZ] | Majumdar et al., *ToolFuzz*, arXiv:2503.04479 — https://arxiv.org/abs/2503.04479 | Automated natural-language testing of tool documentation |
| [ADO] | Debenedetti et al., *AgentDojo*, arXiv:2406.13352 — https://arxiv.org/abs/2406.13352 | Stateful adversarial tool-use and indirect prompt-injection evaluation |
| [TSW] | Ye et al., *ToolSword*, ACL 2024 — https://aclanthology.org/2024.acl-long.119/ | Tool-learning robustness and invalid-tool/invalid-parameter tests |
| [MCP-SMELL] | Hasan et al., *Model Context Protocol (MCP) Tool Descriptions Are Smelly!*, arXiv:2602.14878v3 — https://arxiv.org/abs/2602.14878v3 | Empirical tool-description quality defects; preprint evidence |

**Evidence date:** provider and protocol documentation was checked on 2026-07-13. Product defaults, model support, beta status, and limits must be re-verified at deployment time. Empirical vendor results are reported only with their workload and measurement scope; they are not universal performance guarantees.

## 9. Chapter map

1. Agent–computer interface as a first-class design object  
2. Function, hosted, local, remote, MCP, and agent tools  
3. Tool-schema design  
4. Semantic affordance  
5. Read/write and reversible/irreversible actions  
6. Discovery, deferred loading, tool search, and namespaces  
7. Result compression, filtering, pagination, and progressive disclosure  
8. Code execution as an aggregation layer  
9. Major tool families  
10. Deterministic preconditions, postconditions, authorization, and ownership  
11. Retry, idempotency, duplicates, partial success, and compensation  
12. Provenance, freshness, citations, and untrusted content  
13. Tool-choice and argument-validity evaluation  
14. Contract fuzzing and adversarial description tests  
15. Why adding tools can reduce performance
