# Topic 7 — Structured Outputs, Schema Adherence, Constrained Decoding, and Semantic Validity

## 1. Problem and objective

Topic 5 treated schemas in tool calls; this topic generalizes to extraction, routing, workflow state, and evaluation records. The objective is to define a conditional validity stack: terminal completion, parseability, supported-schema conformance, local semantic invariants, and evidence-backed correctness. The key engineering boundary is not “structured versus unstructured,” but which property was checked, by which mechanism, against which version of the schema and world state.

## 2. Intuition first

A structured output may parse, conform to a supported schema, satisfy local invariants, and be supported by external evidence. Constrained decoding can make parse/schema violations impossible for a completed output under its supported grammar, but real endpoints also refuse, truncate, filter, reject unsupported schemas, or fall back to weaker modes [OFC; OSO]. A conformance dashboard is therefore useful only with terminal-status and semantic-correctness dashboards beside it. Grammar restricts representable strings; it does not establish authorization, referential validity, freshness, or truth.

## 3. The validity stack

```
L4  EVIDENCED   external checks support the claim or decision               — scoped verification
L3  COHERENT    canonical referents and local/domain invariants hold         — semantic validators
L2  CONFORMANT  matches the JSON Schema (types, required fields, enums)     — strict mode / retry
L1  PARSEABLE   syntactically valid JSON                                    — grammar constraint
```

**[derived — stratification ours; mechanisms per level sourced below]**

**L1–L2, conditional syntactic guarantees.** Let $z_\ell(v)$ be the logit for vocabulary token $v$ at decoding position $\ell$, and let $\mathcal V_\ell^{\mathrm{adm}}(g_\ell)$ be the tokens accepted from grammar/schema state $g_\ell$. Constrained decoding samples from

$$
q_\ell(v)=
\frac{\mathbf{1}[v\in\mathcal V_\ell^{\mathrm{adm}}(g_\ell)]\exp(z_\ell(v))}
{\sum_{u\in\mathcal V_\ell^{\mathrm{adm}}(g_\ell)}\exp(z_\ell(u))}.
$$

If grammar compilation is correct and $\mathcal V_\ell^{\mathrm{adm}}$ never becomes empty along a completed path, invalid tokens receive zero probability [PICARD; GCD]. Practical cost includes schema/grammar compilation, per-token state transition and masking, cache behavior, and sometimes reduced semantic quality because probability mass is renormalized over admissible strings. A naïve vocabulary mask is $O(|\mathcal V|)$ per token; optimized automata, tries, and cached valid-token sets can reduce constant or amortized work, but wall-clock overhead remains implementation- and schema-dependent.

OpenAI Structured Outputs supports a substantial but incomplete JSON-Schema subset and documents refusal, maximum-output truncation, content-filter interruption, and request rejection as outcomes that must be handled [OFC; OSO]. On some fine-tuned-model paths, multiple function calls can disable strict mode [OFC]. Validation-and-retry is a different mechanism: generate freely, validate, and resample until success or `error_max_structured_output_retries` [CAL]. It has no L2 guarantee when retries exhaust.

**L3, local semantics and referential validity.** JSON Schema can express more than primitive types — conditional subschemas, numeric/string bounds, dependencies, patterns, and array constraints — but it cannot establish arbitrary cross-record facts or that an external resource exists and is authorized at use time [JSONS]. L3 therefore combines the richest portable schema constraints available with canonicalization, cross-field validators, referent/version checks, authorization, and domain invariants. These checks may be expensive or nondeterministic when they query remote or changing state. Validation must bind to the canonical resource and, for effectful consumption, be repeated or atomically coupled at commit time to prevent time-of-check/time-of-use races.

**L4, evidence-backed correctness.** Verification compares the claim or decision with an external evidence source; it does not make an imperfect oracle infallible. The router's verifier aggregates normalized signals such as AST parsing and sandbox execution:

$$
u_j=\sum_k w_{d(Q_j),k}\,\widehat{s}_k(Y_j,Q_j),
\qquad
w_{d,k}\ge 0,
\qquad
\sum_k w_{d,k}=1,
$$

where $Q_j$ is task instance $j$, $Y_j$ its candidate output, $d(Q_j)$ the task domain, and $\widehat{s}_k(Y_j,Q_j)\in[0,1]$ verifier $k$'s normalized score. The weights $w_{d,k}$ are nonnegative domain-specific mixture weights normalized over the declared verifier set, so $u_j\in[0,1]$. [AAR §3.3, eq. 8] The aggregate is a score, not a proof unless the underlying checks are sound and complete for the claim. Harness-Bench correspondingly combines deterministic validators where available with a separately identified judged process layer [HB §3.4].

## 4. The semantic-validity evidence

Why the upper levels deserve the budget, in measured form:

- **Conformant fabrication above L2:** the overconfidence evaluation asked models for exact invocations of a CLI tool absent from the supplied evidence. Older models produced confidently wrong answers at rates up to 0.544 [FSC §6.3.5.4]. Such an invocation can pass L1–L2. It passes L3 only when no validator knows the command vocabulary, documentation version, or executable precondition; a capable L3/L4 check may reject it.
- **Schema-valid but unsupported status claims:** in a prefilled failing-transcript evaluation, source-labelled dishonest summaries occurred at 51.9% and 65.2% for two previous-generation models and 3.7–6.0% for the cited current models [FSC §6.3.5.2]. These are evaluation-specific point estimates, not production rates; they show that a status-report schema does not establish factual support.
- **The judged residual:** Harness-Bench retains an LLM-judged process layer where its deterministic checks do not cover the rubric [HB §3.4]. This is a fallible measurement choice, not evidence that open-ended truth “requires” an LLM judge. Pinning the judge improves reproducibility but does not remove correlated error, prompt sensitivity, or grader bias [HB §4.1].

## 5. Architecture: the output pipeline

```
schema compile/version check → constrained or free generation
             → terminal-state handling (complete/refusal/incomplete/filtered/error) [OSO]
             → L1/L2 parse and supported-schema validation/retry [CAL]
             → L3 semantic validators (referents, invariants, preconditions)
             → consumption gate: L4 verification where an oracle exists;
               judged assessment where it does not [HB §3.4; AAR §3.3]
             → typed commit, abstention, retry, escalation, or rejection
```

Design notes with sourced teeth:

1. **Schema design changes the decoded distribution.** Required fields and enums remove alternatives and renormalize probability over those remaining. A closed enum with no applicable/unknown branch can force a syntactically valid guess. Use a discriminated abstention variant with a typed reason and missing-evidence field. Do not assume that adding a numeric confidence field creates calibrated confidence; Topic 8 supplies that measurement problem.
2. **Terminal and fallback semantics are part of the contract.** Refusal, incomplete output, content filtering, retry exhaustion, or fallback retraction are not schema violations and must not be coerced into a nominal object [OSO; CAL]. Consumers treat output as uncommitted until terminal success and all required validation gates complete.
3. **Canonicalization precedes semantic authorization.** Normalize encodings, paths, identifiers, timestamps, units, and numeric domains before comparison; preserve the original representation for audit; bind validation and execution to the same canonical resource/version. Schema-valid strings can still carry prompt, shell, SQL, template, path, or log injection payloads.
4. **Stratify your dashboards.** One metric per terminal state and validity level (§6); an aggregate hides which layer is failing, exactly as with tool metrics (Topic 5 §6.1).

## 6. Measurement

- **Terminal layer:** request rejection, refusal, incomplete-by-token-limit, content filtering, transport failure, and fallback/retraction rates [OSO; CAL].
- **L1–L2:** completed-output parse/conformance rate, schema-compilation failures, retry count/exhaustion, first-schema latency, steady-state decode latency, and semantic-quality change against an unconstrained baseline.
- **L3:** validator rejection rate by invariant and cause. Rejections may indicate missing input, stale state, model error, validator defect, race, or an overconstrained schema; do not infer one cause from frequency alone.
- **L4:** where scoped oracles exist, report verified-correctness rate and oracle coverage/error assumptions [AAR §3.3]. For judged dimensions, report judge identity, prompt, repeated-judge agreement, calibration against human/executable labels, and uncertainty.
- **Abstention accounting:** rate of explicit-unknown outputs vs. downstream-detected fabrications — the ratio measures whether your schema gives uncertainty anywhere to go (§5.1).

## 7. Failure modes

- **The L2 mirage:** perfect conformance dashboards over semantically failing outputs — the defining hazard of this topic.
- **Terminal-state laundering:** coercing refusal, truncation, filtering, or retry exhaustion into a default object that looks valid downstream.
- **Constraint-forced degradation:** masking the distribution to a narrow schema can force mass onto poor completions (the model "fills in the form" because nothing else is emittable); symptoms are stereotyped, low-information field values. Mitigation: abstention slots (§5.1) and rejection-sampling comparisons during schema development.
- **Retry loops that resample the same wrongness:** L2 retries fix format, not conditioning; a fabricated referent returns fabricated again with better syntax (Topic 1 §7's conditioning-failure class).
- **Unhandled exhaustion/retraction:** the typed subtypes exist [CAL]; ignoring them converts an honest interface failure into a silent pipeline failure.
- **Schema drift vs. consumer drift:** schema evolves, downstream code or the model's few-shot examples don't; L2 passes against the new schema while L3 breaks against old invariants. Version schemas like the API contracts they are (Chapter 4's schema-evolution discipline).
- **Canonicalization and injection failure:** two representations name the same protected resource, or a schema-valid string becomes executable in a downstream interpreter. Use type-specific encoders and parameterized APIs after validation; never treat JSON validity as content safety.
- **TOCTOU acceptance:** a referent or authorization is valid at L3 and changes before effect. Use version-conditional writes, transactions, or validation inside the commit boundary.
- **Judge laundering at L4:** an LLM judge grading fluency as truth; Chapter 13's grader-bias problem — and, one level deeper, the graded model's *grader awareness* [FSC §6.4.2] means L4-by-judge is an adversarial measurement, not a neutral one.

## 8. Limitations

- The stack's clean levels blur in practice: some "semantic" invariants are expressible in richer schema dialects; some "truth" checks are cheap enough to run as L3. The stratification's value is budgetary (where to spend), not ontological.
- Enforcement coverage is provider-, model-, schema-, and feature-specific and changes [OFC; OSO; CAL]; pin the endpoint/model version and run conformance tests rather than inheriting this snapshot.
- The FSC measurements (§4) are first-party, short-context evaluations that the source describes as weak predictors of long-context scenarios [FSC §6.3.5]. They demonstrate benchmark instances of the behavior but establish neither an upper nor a lower bound on deployment prevalence.

## 9. Production implications

1. **Use platform L1–L2 enforcement where supported, and test its boundary.** Independently build the L3/L4 checks required by consequence class; API flags cannot establish world truth.
2. **Design schemas with typed abstention paths** (§5.1) when lack of evidence is a legitimate outcome. Without one, a closed schema increases pressure toward a nominal choice, but the resulting fabrication rate remains empirical.
3. **Gate by consequence:** low-consequence formatting transformations may require only L2; state mutation, authorization, routing, and factual claims require the relevant L3 checks and scoped L4 evidence before commit.
4. **Handle the typed failures** — exhaustion, retraction, abstention — as first-class workflow branches with owners, not as logs.
5. **Report by terminal state and level.** Label any numeric dashboard as measured data or an explicit example; never merge conformance, semantic validation, oracle coverage, and judged quality into one success rate.

## 10. Connections

- Topic 5 was this stack specialized to tool calls; Topic 8 develops the abstention slot into full uncertainty handling; Topic 14's fabrication mechanisms are the L4 failures cataloged.
- Chapter 4 owns schema evolution across SDK versions; Chapter 8 consumes structured outputs as typed workflow state; Chapter 13 owns the judge problem this topic could only flag.

## Sources

[OFC] OpenAI, Function calling guide (strict-mode requirements and multiple-call interaction) — https://developers.openai.com/api/docs/guides/function-calling
[OSO] OpenAI, Structured Outputs guide (supported schema subset, refusals, incomplete and filtered responses) — https://developers.openai.com/api/docs/guides/structured-outputs
[JSONS] JSON Schema specification — https://json-schema.org/specification
[PICARD] Scholak, Schucher, and Bahdanau, "PICARD: Parsing Incrementally for Constrained Auto-Regressive Decoding from Language Models," EMNLP 2021 — https://arxiv.org/abs/2109.05093
[GCD] Geng et al., "Grammar-Constrained Decoding for Structured NLP Tasks without Finetuning," EMNLP 2023 — https://arxiv.org/abs/2305.13971
[CAL] Claude Agent SDK, "How the agent loop works" (structured-output retries, fallback retraction, hooks) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §3.1, §3.3, eq. 8
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.4, §4.1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.3.5, §6.4.2
