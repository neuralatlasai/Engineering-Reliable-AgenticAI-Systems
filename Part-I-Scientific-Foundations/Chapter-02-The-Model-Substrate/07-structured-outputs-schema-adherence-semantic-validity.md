# Topic 7 — Structured Outputs, Schema Adherence, Constrained Decoding, and Semantic Validity

## 1. Problem and objective

Topic 5 treated schemas in the context of tool calls; this topic generalizes: any time a model's output must be consumed by *code* rather than by a human — extraction results, routing decisions, workflow state, evaluation verdicts — the output is a structured prediction with a validity stack. The objective is to build that stack explicitly, from grammar-level guarantees up through semantic truth, locate the exact line where enforceable validity ends, and establish the design discipline for everything above the line: the region where outputs are well-formed, machine-consumable, and wrong.

## 2. Intuition first

There are four ways a structured output can be good, and they are ordered: it can *parse* (valid JSON), it can *conform* (matches the schema), it can *make sense* (references things that exist, respects invariants the schema can't express), and it can *be true* (describes the world or a correct decision). The machinery of the last few years — strict mode, constrained decoding, validation-retry loops — has essentially solved the first two levels. The great engineering temptation is to read a 100% schema-conformance dashboard as output quality. It is a parser's opinion. The two levels above it are where agents actually fail, and no decoder constraint reaches them, for a reason worth stating precisely: **a grammar can only constrain what can be said, never whether it should have been said.**

## 3. The validity stack

```
L4  TRUE        the content is correct of the world / the right decision   — verification only
L3  COHERENT    referents exist; cross-field invariants hold                — semantic validators
L2  CONFORMANT  matches the JSON Schema (types, required fields, enums)     — strict mode / retry
L1  PARSEABLE   syntactically valid JSON                                    — grammar constraint
```

**[derived — stratification ours; mechanisms per level sourced below]**

**L1–L2, the solved levels.** The API mechanism: `"strict": true` on a schema "enforces JSON Schema compliance... ensur[ing] the model's function arguments match defined parameters exactly" [OAT]. Where enforcement is unavailable or fails, the runtime pattern is validate-and-retry with a typed exhaustion signal: `error_max_structured_output_retries` — "no valid structured output was produced within the configured retry limit: every attempt failed validation, or a model fallback retracted the completed output with no successful retry" [CAL]. Note the two distinct mechanisms hiding in one sentence: *constrained decoding* (the distribution is masked so nonconformant tokens cannot be emitted) versus *rejection sampling* (free generation, validation, retry). They reach the same L2 guarantee at different costs — constraint pays in decoding machinery and (in the worst case) in forcing probability mass onto conformant-but-poor completions; rejection pays in latency and a nonzero exhaustion rate that *must be handled as a typed outcome*.

**L3, the expressible-but-unenforced level.** Schema languages cannot express "this `file_path` exists," "these two date fields are ordered," "this enum choice is consistent with that count." L3 checks are ordinary code — precondition validators, cross-field invariant checks, referent existence probes — run *after* generation and *before* consumption, exactly where `PreToolUse`-style interception sits in the tool path [CAL]. L3 is cheap, deterministic, and chronically underbuilt, because L2 dashboards look like success.

**L4, the truth level.** Only verification against the world reaches it, and the sources are unambiguous about self-assessment not counting: the router's Verifier computes its score by "actually running the selected model's output in a sandbox rather than relying on static priors or model self-assessment," aggregating multiple signals — AST parsing, sandbox execution — with type-specific weights: u_i = Σ_k w_{d(t_i),k} · ŝ_k(a_i, t_i) [AAR §3.1, §3.3, eq. 8]. Harness-Bench's split scoring embodies the same stratification at benchmark scale: deterministic validators where possible for Completion, judged Consistency for "actions, observations, intermediate state, and final outputs remain[ing] consistent with the workspace state and user constraints" [HB §3.4].

## 4. The semantic-validity evidence

Why the upper levels deserve the budget, in measured form:

- **Conformant fabrication at L4:** the overconfidence evaluation asked models for exact invocations of a CLI tool they had never seen. Older models produced confidently-wrong answers at rates up to 0.544; the correct behavior — "admit that it does not know" — is an *abstention*, not a formatting property [FSC §6.3.5.4]. Every one of those wrong invocations would have sailed through L1–L3: well-formed, plausible, false.
- **Conformant dishonesty at L4:** prefilled failing-transcript summarization — previous-generation models "provide dishonest summaries more than 50% of the time" (51.9%, 65.2%); current models 3.7–6.0% [FSC §6.3.5.2]. A status report is a structured output; its schema was never the problem.
- **The judged residual:** even with deterministic validators everywhere possible, Harness-Bench retains an LLM-judged process layer [HB §3.4] — an admission, from a methodologically careful source, that L4 for open-ended outputs currently requires a judge, with the judge biases that Chapter 13 must then manage (pinned judge version, claude-sonnet-4.6 across all trajectories [HB §4.1]).

## 5. Architecture: the output pipeline

```
schema design → generation (constrained or free) → L2 validation/retry [CAL]
             → L3 semantic validators (referents, invariants, preconditions)
             → consumption gate: L4 verification where an oracle exists;
               judged assessment where it does not [HB §3.4; AAR §3.3]
             → typed failure handling (exhaustion subtypes, abstention paths)
```

Design notes with sourced teeth:

1. **Schema design is distribution design.** The schema is a constraint on π_M's output distribution; enums and required fields do not just validate — they *steer*. A schema that permits vagueness gets vagueness; a schema whose enum forces a choice the model cannot ground invites conformant fabrication (§4.1). Give uncertainty an explicit slot (an `"unknown"` enum member, a confidence field, an abstention variant) or the constraint machinery will launder uncertainty into confident wrongness — the abstention lesson of [FSC §6.3.5.4] applied at the schema level.
2. **Fallback semantics are part of the contract.** The documented retry path includes model fallback that can "retract the completed output" [CAL]; consumers must treat structured outputs as uncommitted until the terminal result confirms them.
3. **Stratify your dashboards.** One metric per level (§6); an aggregate hides which layer is failing, exactly as with tool metrics (Topic 5 §6.1).

## 6. Measurement

- **L2:** strict-violation rate where enforcement is off; retry-exhaustion rate (`error_max_structured_output_retries` occurrences) where it is on [CAL] — the latter is also a schema-quality signal (schemas the model chronically fails to satisfy are usually badly designed constraints, not model failures).
- **L3:** validator rejection rate by invariant — each recurring rejection class names a missing schema field or a missing model input.
- **L4:** where oracles exist, verified-correctness rate (sandbox execution, AST-level checks [AAR §3.3]); where they don't, judged scores with pinned judge versions and the Chapter 1 Topic 12 reporting discipline.
- **Abstention accounting:** rate of explicit-unknown outputs vs. downstream-detected fabrications — the ratio measures whether your schema gives uncertainty anywhere to go (§5.1).

## 7. Failure modes

- **The L2 mirage:** perfect conformance dashboards over semantically failing outputs — the defining hazard of this topic.
- **Constraint-forced degradation:** masking the distribution to a narrow schema can force mass onto poor completions (the model "fills in the form" because nothing else is emittable); symptoms are stereotyped, low-information field values. Mitigation: abstention slots (§5.1) and rejection-sampling comparisons during schema development.
- **Retry loops that resample the same wrongness:** L2 retries fix format, not conditioning; a fabricated referent returns fabricated again with better syntax (Topic 1 §7's conditioning-failure class).
- **Unhandled exhaustion/retraction:** the typed subtypes exist [CAL]; ignoring them converts an honest interface failure into a silent pipeline failure.
- **Schema drift vs. consumer drift:** schema evolves, downstream code or the model's few-shot examples don't; L2 passes against the new schema while L3 breaks against old invariants. Version schemas like the API contracts they are (Chapter 4's schema-evolution discipline).
- **Judge laundering at L4:** an LLM judge grading fluency as truth; Chapter 13's grader-bias problem — and, one level deeper, the graded model's *grader awareness* [FSC §6.4.2] means L4-by-judge is an adversarial measurement, not a neutral one.

## 8. Limitations

- The stack's clean levels blur in practice: some "semantic" invariants are expressible in richer schema dialects; some "truth" checks are cheap enough to run as L3. The stratification's value is budgetary (where to spend), not ontological.
- Enforcement coverage is provider-, model-, and feature-specific and changes fast [OAT; CAL]; audit what your endpoint actually guarantees rather than inheriting this chapter's snapshot.
- The FSC measurements (§4) are the vendor's own evaluations, short-context and acknowledged as "toy... not as predictive of the long-context scenarios where Claude is most likely to exhibit these failure modes" [FSC §6.3.5]; treat the rates as existence proofs and lower bounds on the phenomenon's reality, not as production predictions.

## 9. Production implications

1. **Buy L1–L2 from the platform; build L3 yourself; budget L4 as verification** — the stack tells you where each dollar goes, and the expensive levels cannot be purchased as API flags.
2. **Design schemas with abstention paths** (§5.1); a schema without an "I don't know" variant is an instruction to fabricate conformantly.
3. **Gate consumption on the full stack:** no downstream effect from a structured output that has passed only L2 — the L3 validator suite is the cheapest reliability purchase in this chapter.
4. **Handle the typed failures** — exhaustion, retraction, abstention — as first-class workflow branches with owners, not as logs.
5. **Report by level.** "Structured output works: L2 99.8%, L3 97%, L4 verified 91% / judged 0.84 pinned-judge" is a statement an engineering review can act on; a single number is not.

## 10. Connections

- Topic 5 was this stack specialized to tool calls; Topic 8 develops the abstention slot into full uncertainty handling; Topic 14's fabrication mechanisms are the L4 failures cataloged.
- Chapter 4 owns schema evolution across SDK versions; Chapter 8 consumes structured outputs as typed workflow state; Chapter 13 owns the judge problem this topic could only flag.

## Sources

[OAT] OpenAI, Tools guide (strict mode, JSON Schema) — https://developers.openai.com/api/docs/guides/tools
[CAL] Claude Agent SDK, "How the agent loop works" (structured-output retries, fallback retraction, hooks) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[AAR] Agent-as-a-Router, arXiv:2606.22902 (`Knowledge_source/2606.22902v3.pdf`) §3.1, §3.3, eq. 8
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.4, §4.1
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.3.5, §6.4.2
