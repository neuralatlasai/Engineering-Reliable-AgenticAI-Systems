# Topic 14 — Tool-Contract Fuzzing and Adversarial Tool-Description Tests

## 1. Problem and objective

Tool contracts combine schemas with natural-language names, descriptions, examples, errors, and outputs. Conventional tests can prove that a validator rejects an out-of-range integer; they cannot prove that a model distinguishes `archive_account` from `delete_account`, resists a confusable name, ignores an injected instruction in a search result, or preserves behavior after an equivalent description paraphrase.

The objective is a bounded, reproducible fuzzing system that tests deterministic enforcement and probabilistic interpretation without touching real resources. It must cover schema boundaries, Unicode and confusables, ambiguous descriptions, name collisions, direct and indirect injection, metamorphic invariants, multi-turn/parallel behavior, and failures across selection, arguments, policy, results, and state.

ToolFuzz generates natural user inputs to find runtime errors and incorrect responses caused by under-, over-, or ill-specified tool documentation. Its reported 20-fold yield is relative to two prompt-engineering baselines on its evaluated tools, not a universal multiplier [TFZ, Abstract and §§4–5].

## 2. Intuition: mutate the contract, preserve the oracle

Useful fuzzing does not merely generate malformed JSON. It starts from a task with a known admissible outcome, changes one contract-relevant dimension, executes against a safe but realistic fake environment, and asks whether deterministic invariants and expected relations still hold. The mutation creates pressure; the oracle makes the result interpretable.

## 3. Rigorous analysis: fuzzing model

Let a seed test be:

$$
z
\mathrel{=}
(q,\mathcal U,s_0,\mathcal O,c),
$$

where $q$ is user task, $\mathcal U$ tool contracts, $s_0$ fake state, $\mathcal O$ executable oracle, and $c$ frozen configuration. Mutation $\mu$ produces:

$$
z'
\mathrel{=}
\mu(z;\omega),
$$

with recorded seed $\omega$. The oracle returns:

$$
V(z')
\in
\{\text{pass},\text{selection-fail},\text{schema-fail},
\text{semantic-arg-fail},\text{policy-fail},\text{state-fail},
\text{injection-success},\text{timeout},\text{oracle-error}\}.
$$

An `oracle-error` is not a model failure and remains outside the accuracy denominator while being reported separately.

### 3.1 Schema mutation families

For every property and cross-field constraint, generate valid boundaries and invalid one-step neighbors:

- integers: $m$, $m-1$, $M$, $M+1$, zero, and overflow candidates;
- floats: allowed extremes, precision-sensitive decimals, non-finite values where serialization permits, and unit mismatches;
- strings: empty, min/max length, one over maximum, NUL, controls, newlines, escapes, and repeated graphemes;
- arrays: empty, min/max cardinality, one over, duplicates, reorderings, and deep nesting;
- objects: missing required fields, extras, duplicate serialized keys, wrong types, null boundaries, and inconsistent fields;
- enums/identifiers: unknown, deprecated alias, case/space variation, path traversal, URI edges, and stale resource IDs.

Bound bytes, nesting, array cardinality, regex work, and integer conversions before model-generated values reach an executor.

### 3.2 Unicode, canonicalization, and confusables

Test NFC/NFD normalization, bidirectional controls, zero-width characters, cross-script homoglyphs, full-width punctuation, non-breaking spaces, locale-sensitive case folding, and combining marks. Unicode TR39 specifies confusable detection and restriction mechanisms; it does not make all visually similar strings semantically equivalent [UTS39, §§3–5].

Canonicalize before authorization only when the contract defines canonical equivalence, then compute the authorized action digest from the canonical representation:

$$
d_a
\mathrel{=}
H\!\left(\operatorname{canon}(u,x,\text{principal},\text{resource})\right).
$$

Compare the digest admitted by policy with the digest executed. Never normalize opaque tokens, signatures, filesystem paths, or externally assigned identifiers blindly: distinct values can collapse into one alias.

Test names such as Latin `a` versus Cyrillic `а`, `pay_user` versus a visually identical name containing a zero-width character, and similar leaf names from different namespaces. Logs must preserve code points and escaped bytes.

### 3.3 Description and namespace adversaries

Generate controlled variants:

- meaning-preserving paraphrases;
- omitted units, defaults, preconditions, or side effects;
- contradictory summary and parameter descriptions;
- vague verbs such as “process” or “handle”;
- overlapping tools with different effect classes;
- exact names in different namespaces;
- prefix/suffix and presentation-order permutations;
- distractors sharing key nouns with the correct tool;
- malicious annotations claiming a destructive tool is read-only.

MCP tools contain names, descriptions, input schemas, and optional output schemas, but clients must treat annotations as untrusted unless the server is trusted [MCP, “Tool” and “Security Considerations”]. Description tests evaluate interpretation; they never replace deterministic effect classification.

### 3.4 Injection payloads

Place injection text in every untrusted field the model may observe: remote descriptions, errors, search snippets, documents, filenames, metadata, structured strings, pagination cursors, and nested results. Vary direct commands, role impersonation, encodings, multilingual text, delayed triggers, fake policy quotations, exfiltration requests, and instructions to call another tool.

AgentDojo supplies stateful user tasks, attacker goals, injection endpoints, and deterministic utility/security checks for indirect injection [ADO, §§3.1–3.4]. ToolSword adds six scenarios across input, execution, and output: malicious queries, jailbreaks, noisy misdirection, risky cues, harmful feedback, and error conflicts [TSW, §3]. These are useful seed families, not proofs of adaptive-attack coverage.

## 4. Metamorphic testing

A metamorphic relation specifies expected behavior under controlled transformation. For mutation $\mu$ and predicate $\Psi_\mu$:

$$
Z_\mu
\mathrel{=}
\mathbb I\!\left[
\Psi_\mu\bigl(O(z),O(\mu(z))\bigr)
\right],
$$

where $O$ is trajectory and final state. The violation rate is:

$$
\widehat R_{\mathrm{meta}}
\mathrel{=}
1-\frac{1}{M}\sum_{j=1}^{M}Z_{\mu_j}.
$$

Useful relations include:

- **tool-order invariance:** permuting independent definitions preserves accepted outcome;
- **consistent renaming:** renaming a tool and all references preserves semantics;
- **description paraphrase:** a meaning-preserving paraphrase preserves admissible behavior within measured stochastic variation;
- **irrelevant-tool insertion:** an irrelevant read-only tool does not change final state;
- **round-trip canonicalization:** declared-equivalent values produce the same canonical intent;
- **permission monotonicity:** removing authority cannot enable a forbidden effect;
- **effect isolation:** changing untrusted result text cannot authorize a write;
- **idempotent replay:** replaying one intent key cannot create a second effect.

Ordering can empirically affect model behavior, so a violation is a robustness finding; it does not prove the prompts are mathematically identical to the model.

## 5. Safe fake executor

Fuzzing must never invoke production effects. The executor needs:

1. a disposable database restored from a content-hashed snapshot;
2. synthetic identities, credentials, endpoints, funds, and messages;
3. denied network egress except explicit fake services;
4. deterministic virtual time and seeded identifiers;
5. bounded CPU, memory, output, recursion, and wall time;
6. append-only action journals and post-state hashes;
7. fake implementations for every write and compensation;
8. crash injection before mutation, after mutation, and before response; and
9. a hard assertion that no real authority token is present.

A mock that always succeeds is insufficient. The fake must implement state transitions, validation, authorization, partial success, timeout ambiguity, idempotency, and errors closely enough to exercise the contract.

## 6. Coverage and reporting

Let $B$ be boundary obligations, $D$ description mutation classes, and $A$ adversarial placements. Structural coverage is:

$$
C_{\mathrm{struct}}
\mathrel{=}
\frac{|B_{\mathrm{executed}}|+|D_{\mathrm{executed}}|+|A_{\mathrm{executed}}|}
{|B|+|D|+|A|}.
$$

Coverage is not correctness. Report unique minimized failures, verdict counts, mutation family, effect class, configuration, and task cluster. Bootstrap seed tasks, retaining all mutants and repeats within a sampled seed.

Fuzzing yield is:

$$
Y
\mathrel{=}
\frac{N_{\mathrm{unique\ minimized\ failures}}}
{N_{\mathrm{executed\ cases}}}.
$$

Deduplicate by violated oracle, responsible contract element, normalized trace suffix, and state diff. Raw counts otherwise reward reproducing one bug repeatedly.

## 7. Fuzzing and shrinking algorithm

```text
ALGORITHM FuzzToolContracts(seed_suite, mutation_catalog, budget):
    RequireFakeExecutorAndNoProductionCredentials()
    corpus <- ValidateSeeds(seed_suite)
    failures <- EmptyFailureIndex()

    WHILE budget.HasCapacity():
        seed <- SelectByUncoveredObligationAndPastYield(corpus)
        mutation <- SelectMutation(mutation_catalog, seed)
        candidate <- ApplyRecordedMutation(seed, mutation)

        IF ExceedsStaticBounds(candidate):
            RecordHarnessRejection(candidate)
            CONTINUE

        environment <- RestoreContentHashedSnapshot(candidate.initial_state)
        trace <- RunBoundedAgent(candidate, environment)
        verdict <- ExecuteDeterministicOracles(candidate, trace, environment)

        IF verdict is a model_or_contract_failure:
            minimized <- DeltaDebug(candidate,
                preserve = SameFailureSignature,
                executor = FAKE_ONLY)
            failures.InsertIfNovel(minimized)
            corpus.Add(minimized)

        UpdateCoverageAndYield(candidate, verdict)

    RETURN failures, CoverageReport(), ReproductionArtifacts()
```

For $M$ cases, base runtime is $O(MC)$ for bounded run cost $C$. Delta debugging can take $O(n^2)$ candidate checks in the worst case for input size $n$; impose shrink budgets and hierarchical reductions.

## 8. Failure modes

- Production-backed fuzzing reaches real authority domains.
- Validator-only oracles miss semantic and policy failures.
- LLM-only judges share biases or follow the injection.
- An invalid metamorphic relation changes a hidden precondition.
- Random bytes die at parsing without testing semantic ambiguity.
- Missing shrinking leaves unreproducible transcripts.
- Unicode logging erases the code points causing collision.
- Unbounded regex or nesting exhausts the harness.
- Variant count inflates coverage while effect classes remain untested.

## 9. Limitations

Fuzzing shows discovered failures, not their absence. Natural-language mutation has no complete finite basis. Model updates can invalidate fixtures or create failures, and stochastic behavior requires repeated runs. Fake executors cannot reproduce every race, rate limit, or eventual-consistency behavior; separately authorized staging tests remain necessary.

A fixed injection corpus is a regression suite, not a security guarantee. Adaptive evaluation must evolve with defenses.

## 10. Production implications

1. Run deterministic fuzzing on every contract change and model-mediated suites on every model, prompt, or tool-surface release.
2. Block new high-consequence authorization, state, injection, duplicate-effect, and outcome-unknown regressions.
3. Store minimized fixtures with exact Unicode, configuration hashes, and fake-state snapshots.
4. Separate contract, harness, model, and oracle failures in triage.
5. Rotate generators and hold out mutation families to measure generalization.

## 11. Connections

- Topics 3–4 provide schemas and descriptions under mutation.
- Topics 10–12 provide authorization, idempotency, provenance, and trust oracles.
- Topic 13 supplies configuration identities and clustered uncertainty.
- Topic 15 uses insertion, collision, order, and description mutations.
- Chapter 12 expands the threat model; Chapter 13 defines release gates.

## Sources

[TFZ] Milev et al., “ToolFuzz — Automated Agent Tool Testing,” §§3–5 — https://arxiv.org/abs/2503.04479

[MCP] Model Context Protocol, *Tools Specification*, revision 2025-06-18, “Tool,” “Tool Result,” and “Security Considerations” — https://modelcontextprotocol.io/specification/2025-06-18/server/tools

[UTS39] Unicode Consortium, *Unicode Technical Standard #39: Unicode Security Mechanisms*, §§3–5 — https://www.unicode.org/reports/tr39/

[ADO] Debenedetti et al., “AgentDojo,” §§3.1–3.4 — https://arxiv.org/abs/2406.13352

[TSW] Ye et al., “ToolSword,” *ACL 2024*, §3 and Tables 1–2 — https://aclanthology.org/2024.acl-long.119/

[TSB] Lu et al., “ToolSandbox,” §2.1 and §§2.2–2.3 — https://arxiv.org/abs/2408.04682
