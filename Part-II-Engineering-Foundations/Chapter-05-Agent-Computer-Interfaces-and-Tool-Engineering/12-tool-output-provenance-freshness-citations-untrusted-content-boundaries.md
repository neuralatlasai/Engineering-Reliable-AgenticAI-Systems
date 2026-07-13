# Topic 12 — Tool-Output Provenance, Freshness, Citations, and Untrusted-Content Boundaries

## 1. Problem and objective

A tool result is an observation produced by an executor, from particular sources, at particular times, through particular transformations, under a particular trust relationship. If those facts are discarded, the agent cannot distinguish current from stale data, primary evidence from a summary, authenticated bytes from an unsupported claim, or instructions from untrusted content.

Every material result should answer four questions:

1. **Origin:** which source entity and executor produced it?
2. **Time:** when was the underlying fact valid, observed, retrieved, and transformed?
3. **Support:** which evidence spans support which output claims?
4. **Authority:** what may this content inform, and what may it never instruct?

Provenance does not establish truth. A traceable source can be wrong, stale, compromised, or irrelevant. A citation does not establish entailment. A hash establishes byte integrity relative to a reference value, not source honesty.

## 2. Intuition: preserve the evidence, not only the answer

A bare value answers “what did the tool return?” A provenance-bearing value also answers “according to whom, based on which observation, as of when, after which transformations, and under what trust boundary?” That additional structure lets the harness reject stale evidence, localize citations, reproduce derivations, and prevent retrieved prose from silently becoming control instruction.

## 3. Rigorous analysis: the provenance-bearing envelope

For tool call $j$, define:

$$
R_j
\mathrel{=}
\bigl(
v_j,u_j,e_j,\mathcal P_j,
t_j^{\mathrm{valid}},t_j^{\mathrm{observed}},t_j^{\mathrm{retrieved}},
q_j,\mathcal D_j,\mathcal C_j,\lambda_j,\eta_j
\bigr),
$$

where:

- $v_j$ is the typed value;
- $u_j$ is the tool and contract version;
- $e_j$ is the executor identity and authority domain;
- $\mathcal P_j$ is the source set, including stable URI or resource ID and version;
- $t_j^{\mathrm{valid}}$ is the time or interval for which the source claims validity;
- $t_j^{\mathrm{observed}}$ is the source event or observation time;
- $t_j^{\mathrm{retrieved}}$ is the harness retrieval time;
- $q_j$ is the query basis, filters, pagination, locale, and scope;
- $\mathcal D_j$ is the ordered derivation and transformation record;
- $\mathcal C_j$ maps output claims to evidence spans;
- $\lambda_j$ is a trust and handling label; and
- $\eta_j$ is integrity metadata such as a digest or signature reference.

W3C PROV models provenance through entities, activities, and agents, with generation, use, derivation, attribution, and association relations [PROV-DM, §§2 and 5]. This envelope is a tool-runtime specialization, not a replacement standard.

### 3.1 Valid time, observation time, and retrieval time

The three times are not interchangeable. A price retrieved now may describe yesterday; a delayed event retrieved later may still be valid for its event interval. At decision time $t$, define:

$$
A_j^{\mathrm{obs}}(t)
\mathrel{=}
\max\!\left(0,t-t_j^{\mathrm{observed}}\right),
\qquad
A_j^{\mathrm{ret}}(t)
\mathrel{=}
\max\!\left(0,t-t_j^{\mathrm{retrieved}}\right).
$$

A domain policy $\Delta(q,u,\chi)$ specifies maximum admissible age for query class $q$, tool $u$, and effect/risk class $\chi$. Freshness admission is:

$$
F_j(t)
\mathrel{=}
\mathbb I\!\left[
A_j^{\mathrm{obs}}(t)\leq\Delta(q,u,\chi)
\right].
$$

If observation time is unknown, the policy must use the weaker retrieval age explicitly or reject the result for decisions requiring event-time freshness. Unknown time is not zero age. RFC 9111’s HTTP freshness model is a protocol-specific example based on response generation time, age, and freshness lifetime; application facts still need domain-valid-time semantics [RFC9111, §4.2]. No universal TTL is valid for weather, balances, inventory, legal rules, and static documentation.

### 3.2 Claims and citations

Let output claims be $G=\{g_1,\ldots,g_m\}$ and evidence units $E=\{e_1,\ldots,e_n\}$. Define reviewed support:

$$
M_{ab}
\mathrel{=}
\mathbb I[e_b\text{ supports }g_a].
$$

For cited edges $\widehat{\mathcal E}\subseteq G\times E$:

$$
P_{\mathrm{cite}}
\mathrel{=}
\frac{\sum_{(g_a,e_b)\in\widehat{\mathcal E}}M_{ab}}
{|\widehat{\mathcal E}|},
$$

$$
C_{\mathrm{claim}}
\mathrel{=}
\frac{
\sum_{a=1}^{m}
\mathbb I\!\left[\exists e_b:(g_a,e_b)\in\widehat{\mathcal E}\land M_{ab}=1\right]
}{m}.
$$

If $|\widehat{\mathcal E}|=0$, precision is undefined, not zero; report zero cited edges. If $m=0$, coverage is not applicable. A citation should identify a stable source version and the smallest practical supporting span. A homepage link offers weak support localization.

### 3.3 Transformation lineage

Record a DAG of source entities and activities:

$$
P_0
\xrightarrow{a_1}
P_1
\xrightarrow{a_2}
\cdots
\xrightarrow{a_k}
v_j.
$$

Each $a_i$ records implementation version, parameters, time, and lossiness. Retrieval, decompression, parsing, filtering, redaction, ranking, translation, summarization, and aggregation are distinct activities. A citation to $P_0$ does not prove that the transformation chain preserved every qualifier.

## 4. Untrusted-content boundary

Tool-returned content is data unless a trusted control plane explicitly promotes a typed field to instruction authority. The invariant is:

$$
\operatorname{authority}(R_j.\text{content})
\preceq
\operatorname{data},
$$

even if the content says “system message,” “administrator,” “call this tool,” or “ignore previous instructions.” Delimiters help interpretation but do not enforce authority. Enforcement requires least-privilege tools, typed admission, approval for consequential effects, output isolation, and checks outside the model.

MCP supports structured and unstructured results and optional output schemas; clients should validate structured results. Its specification requires clients to treat tool annotations as untrusted unless the server is trusted [MCP, “Tool Result,” “Output Schema,” and “Security Considerations”]. Read-only or destructive annotations are server claims, not protocol-enforced capabilities.

AgentDojo evaluates stateful agents whose tools return attacker-controlled data. It uses formal utility and security checks over environment state rather than trusting a model judge that could itself consume the injection [ADO, §§1 and 3].

## 5. Result-admission algorithm

```text
ALGORITHM AdmitToolResult(raw_result, call_record, decision_policy, now):
    PRECONDITIONS:
        call_record identifies tool version, executor, principal, and call ID
        raw_result satisfies byte, item, and nesting bounds

    transport <- VerifyTransportIdentity(raw_result)
    parsed <- ParseWithoutExecuting(raw_result.payload)
    ValidateAgainstOutputSchema(parsed.structured_content)

    provenance <- BuildProvenance(
        sources = parsed.source_ids_and_versions,
        query_basis = parsed.query_basis,
        executor = call_record.executor,
        transformations = parsed.transformations,
        retrieved_at = now
    )

    IF parsed.digest exists: VerifyDigest(parsed.bytes, parsed.digest)

    trust <- ClassifyTrust(transport.identity,
                           provenance.sources,
                           parsed.content_origin)
    MarkAllFreeTextAsUntrustedData(parsed.free_text)
    Quarantine(active_content, hidden_metadata, executable_objects)

    freshness <- EvaluateFreshness(parsed.valid_time,
                                   parsed.observed_time,
                                   now,
                                   decision_policy.freshness)
    IF freshness = INSUFFICIENT_FOR_DECISION:
        RETURN TypedError(STALE_OR_TIME_UNKNOWN, provenance)

    citations <- ResolveClaimEvidenceLinks(parsed.claims,
                                           parsed.source_spans)
    RETURN ProvenanceEnvelope(parsed.value, provenance, citations,
                              trust, freshness)
```

Parsing is $O(B)$ in bounded result size $B$. Citation resolution is $O(|\widehat{\mathcal E}|)$ with direct claim-span links; naive all-pairs comparison is $O(mn)$ and must not run on unbounded output. Provenance storage is $O(|V_P|+|E_P|)$ in the retained graph.

## 6. Failure modes

- **Timestamp laundering:** retrieval time is labeled source observation time.
- **Source without version:** a mutable URL later serves different content.
- **Citation laundering:** a source is topical but does not support the claim.
- **Transformation erasure:** query, filtering, truncation, or translation is missing.
- **Trust inheritance:** authenticated transport makes third-party content appear trusted.
- **Instruction promotion:** search, email, document, or MCP text alters control policy.
- **Integrity–truth confusion:** a matching digest is interpreted as accuracy.
- **Silent schema fallback:** malformed structured output bypasses validation as free text.
- **Provenance leakage:** URIs, queries, or lineage expose secrets after payload redaction.

## 7. Limitations

Complete provenance can be costly, privacy-sensitive, or unavailable. Some sources expose neither observation time nor stable versions. Signed provenance depends on key management and whether the signer is trusted for the claim domain. Automated entailment judges remain probabilistic and can be fooled by the adversarial content they assess.

Freshness is often claim-specific. One document can contain facts with different valid intervals; a document-level TTL is an approximation that must be declared.

## 8. Production implications

1. Make provenance and freshness part of $\Sigma_u^{\mathrm{out}}$, not logging decoration.
2. Retain raw bytes or a content-addressed reference when permitted, plus tool version, source version, query basis, transformations, and times.
3. Bind citations to atomic claims and spans; evaluate correctness separately from coverage.
4. Carry trust labels through transformations. Sanitization changes representation, not authority.
5. Re-observe mutable facts immediately before consequential state changes.
6. Give components interpreting untrusted text no more authority than their data-processing role needs.
7. Redact provenance with the same rigor as payloads.

## 9. Connections

- Topic 7 records filtering, pagination, and truncation in lineage.
- Topic 9 supplies source-specific provenance.
- Topic 10 enforces the authority boundary that labels cannot provide.
- Topic 11 contributes operation and reconciliation lineage.
- Topic 14 verifies that data never acquires instruction authority.
- Chapter 12 develops the full injection and exfiltration threat model.

## Sources

[PROV-DM] W3C, *PROV-DM: The PROV Data Model*, §§2 and 5 — https://www.w3.org/TR/2013/REC-prov-dm-20130430/

[RFC9111] IETF, *RFC 9111: HTTP Caching*, §4.2 “Freshness” — https://www.rfc-editor.org/rfc/rfc9111.html#section-4.2

[MCP] Model Context Protocol, *Tools Specification*, revision 2025-06-18, “Tool Result,” “Output Schema,” and “Security Considerations” — https://modelcontextprotocol.io/specification/2025-06-18/server/tools

[ADO] Debenedetti et al., “AgentDojo,” §§1, 3.1, and 3.4 — https://arxiv.org/abs/2406.13352

[OAI-WEB] OpenAI, *Web search tool*, “Sources” and citation handling — https://developers.openai.com/api/docs/guides/tools-web-search

[ANT-WEB] Anthropic, *Web search tool*, citations and search-result content — https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
