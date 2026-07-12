# Topic 5 — Tool-Call Generation as Constrained Structured Prediction

## 1. Problem and objective

When a model calls a tool, it is not "using" anything — it is *emitting a structured prediction*: a token sequence that the harness parses as (tool name, arguments) and may execute. Every property of tool use that engineers care about — the right tool, valid arguments, sensible timing — is a property of this prediction task and of the constraints imposed on it. The objective here is to decompose tool-call generation into its three prediction sub-problems (whether, which, with-what), state exactly which of them the interface machinery can constrain and which it cannot, and derive the design rules that follow from that asymmetry.

## 2. Intuition first

Think of the tool schema as a form the model must fill in. Modern APIs can *guarantee the form is filled in correctly*: fields present, types right, enums respected. What no schema can guarantee is that the form *should have been filled in at all*, that it was the *right form*, or that the values — while type-valid — are true of the world. A perfectly schema-conformant call to `delete_file` with a syntactically flawless path is the interface working exactly as designed; whether that path should be deleted is a question the constraint machinery cannot see. The industry's early tool-use failures were syntactic and have been largely engineered away; the remaining failures are semantic, and they are the expensive ones.

## 3. Formalization: three nested predictions

A tool-emitting policy factors the action distribution as **[derived — factorization ours; components sourced]**:

```
P(a_t | context) = P(call vs. respond | ·)          — whether to act
                 × P(tool k | call, ·)               — which tool
                 × P(arguments | tool k, ·)          — with what arguments
```

Each factor has its own constraint mechanism and its own failure literature:

**Whether.** "The model automatically decides whether to invoke them based on the prompt context"; the developer "can guide this behavior using the `tool_choice` parameter" [OAT] — forcing a call, forbidding calls, or leaving the decision free. This factor is also where the loop's termination lives: the run ends when the model emits a response with no tool calls [CAL], so *whether* is simultaneously the continue/stop prediction — and Topic 14's premature-completion evidence [FSC §6.4.1.4] is a failure of exactly this factor.

**Which.** Selection over the tool namespace, conditioned on names and descriptions — the model infers applicability from the schema's documentation, which is why tool descriptions are policy inputs, not comments (Chapter 5's semantic-affordance engineering). Deferred loading changes the selection problem's shape: tool search "defers loading function definitions until needed, optimizing token usage" [OAT; CAL ToolSearch] — the namespace becomes dynamic, and selection becomes a two-stage retrieve-then-choose prediction.

**With-what.** Argument generation under JSON Schema: `"strict": true` "enforces JSON Schema compliance... ensur[ing] the model's function arguments match defined parameters exactly, preventing invalid or unexpected calls" [OAT]. This is the factor that constrained decoding actually solves — and the only one.

## 4. What the constraints buy, precisely

The guarantee inventory, in the spirit of Topic 1 §4:

| Property | Guaranteed by machinery? | Mechanism / residual |
|---|---|---|
| Syntactic validity of arguments | **Yes**, under strict mode | JSON Schema enforcement [OAT] |
| Well-typed tool name from the namespace | Yes | Parse-or-reject at the harness |
| Argument *semantic* truth (path exists, ID refers to what the model thinks) | **No** | Preconditions, validation hooks (Ch. 5); `PreToolUse` interception [CAL] |
| Right tool for the intent | No | Measured, not enforced: Harness-Bench scores ToolUse — "whether tools are selected and applied appropriately" — as a judged process dimension [HB §3.4] |
| Right time (call vs. respond; continue vs. stop) | No | Budgets and verified stop conditions [CAL; Ch. 10] |
| Authorized call | Not by the schema | Permission layer: allow/deny rules, scoped patterns, hooks [CAL] |

The retry machinery marks the boundary honestly: the reference runtime ships a terminal result subtype `error_max_structured_output_retries` — "no valid structured output was produced within the configured retry limit: every attempt failed validation" [CAL]. Validation-with-retry is the practical constrained-decoding fallback, and its failure is a *typed, detectable* event. Contrast the semantic factors: a wrong-tool or wrong-argument-semantics call produces no typed error at all — it produces a tool *result*, which feeds back into context as if informative. Syntactic failures are cheap because they are visible; semantic failures are expensive because they are camouflaged as progress.

## 5. Architecture: the constraint stack around one prediction

```
schema layer      — JSON Schema + strict mode: shapes the argument distribution [OAT]
namespace layer   — which tools are visible at all: minimal enablement [HB Table 1],
                    deferred loading/tool search [OAT; CAL]
permission layer  — which predicted calls may execute: allow/deny/scoped rules,
                    permission modes, PreToolUse hooks that block pre-execution [CAL]
verification layer— whether the executed call did what the intent required:
                    result validation, oracles, judged ToolUse/Consistency [HB §3.4]
```

Reading the stack top-down: each layer narrows a different factor of §3's factorization — schema narrows *with-what*, namespace narrows *which*, permissions gate *whether-this-one-executes*, verification alone addresses truth. The stack is also Chapter 1 Topic 4's π_H in miniature: every layer is harness policy shaping a model prediction, and a rejected call is *observable to the model* ("Claude receives the rejection message as the tool result and typically attempts a different approach" [CAL]) — the constraint is part of the policy's environment, with all the adaptation consequences Topic 1.4 §7 flagged.

Two namespace-design facts deserve their own sentence. First, the selection factor degrades as the namespace grows — Chapter 1's branching axis applied to tools; Harness-Bench's protocol of enabling "only the permissions and tools required" [HB §4.1] is the countermeasure as method. Second, the description text is the *only* channel through which the model knows what a tool does; schema quality is therefore a capability input, measured (ToolUse scores vary 79.5–93.8 across harnesses at fixed tasks [HB Table 2]) rather than cosmetic.

## 6. Measurement

1. **Split the metrics by factor.** Syntactic validity rate (strict-mode violations, retry exhaustions [CAL]) is a different quantity from tool-selection appropriateness (judged ToolUse [HB §3.4]) and from argument-semantic correctness (precondition failures, wrong-target actions). One aggregate "tool error rate" hides which layer needs work.
2. **Selection accuracy needs a denominator design:** evaluate on tasks where the correct tool is known (oracle-checkable selection), and separately on distractor-rich namespaces — the deferred-loading regime [OAT] makes retrieval recall a new, measurable stage.
3. **Timing failures are trace metrics:** calls-after-task-completion, responses-without-needed-calls, and stop-without-verification — all computable from the Chapter 1 Topic 12 run record.
4. **Adversarial argument tests** (Chapter 5's contract fuzzing): schema-valid but semantically hostile arguments are the class strict mode is *guaranteed not to catch*; test the verification layer with them, not the schema layer.

## 7. Failure modes

- **Schema-valid, world-false arguments** — the signature semantic failure (§4); the call executes, the result contaminates state (Ch. 1 Topic 8's propagation).
- **Wrong-tool fluency:** confident selection of a plausible-but-wrong tool in a bloated namespace; rises with tool count (Ch. 5's ambiguity result) and is judged, not typed [HB §3.4].
- **Over-calling:** tools invoked where a text answer was the task — observation substituted for thought (Topic 4 §7's tool spam); token cost and, for write tools, risk.
- **Under-calling / premature respond:** the *whether* factor failing toward inaction — answering from stale belief instead of re-observing (Ch. 1 Topic 3), or stopping on false completion [FSC §6.4.1.4].
- **Constraint-evasion via the free channel:** when a needed tool is blocked, the model may route the intent through a permitted one (`Bash` as the universal escape hatch); permission design must consider the *closure* of what enabled tools can express, not the list (Chapter 12).
- **Retry exhaustion as silent degradation:** structured-output retries fail, a fallback model "retract[s] the completed output" [CAL], and the caller sees only a terminal error subtype — handle it; it is the interface telling you the constraint machinery gave up.

## 8. Limitations

- Strict-mode guarantees are provider- and feature-scoped ([OAT] documents the mechanism; coverage across output types and models varies and changes); treat "guaranteed valid" as a per-endpoint checkable claim, not a platform axiom.
- The factorization in §3 is an analytical device; the model computes one joint distribution, and factors interact (a bloated namespace degrades argument quality too, not just selection). Metrics by factor (§6) remain useful even where the factors are not causally separable.
- ToolUse and Consistency scores in the ledger are LLM-judged [HB §3.4, §4.1] with the judge biases Chapter 13 catalogs; no source provides human-verified tool-selection accuracy at scale.

## 9. Production implications

1. **Turn strict mode on and treat its absence as a defect** — syntactic validity is purchasable at negligible cost [OAT]; spend your engineering budget on the factors it cannot cover.
2. **Design the namespace as a prediction problem:** minimal enablement per phase [HB Table 1], descriptions written as decision criteria (when to use, when not), deferred loading once the namespace outgrows the context budget [OAT; CAL].
3. **Put semantic validation at the boundary, not in the prompt:** `PreToolUse` hooks and precondition checks [CAL] catch world-false arguments before execution; prompt-level pleading does not.
4. **Handle every typed failure subtype** — retry exhaustion and rejection paths are part of the interface contract [CAL], and unhandled they become silent task failures.
5. **Report tool metrics by factor** (§6.1) in launch reviews; "tool calling works" is four claims, three of which strict mode cannot make.

## 10. Connections

- Topic 6 covers the *execution ordering* of emitted calls; Topic 7 generalizes the schema machinery to all structured outputs; Topic 9 asks who executes the call at all.
- Chapter 5 owns the full engineering of schemas, descriptions, and contracts this topic could only frame; Chapter 12 owns the authorization layer and the evasion problem (§7.5).
- The *whether* factor's stop-side reappears as Chapter 10's termination discipline.

## Sources

[OAT] OpenAI, Tools guide (function tools, strict mode, tool_choice, tool search) — https://developers.openai.com/api/docs/guides/tools
[CAL] Claude Agent SDK, "How the agent loop works" (tool execution, permissions, hooks, structured-output retry subtype) — https://code.claude.com/docs/en/agent-sdk/agent-loop
[HB] Harness-Bench, arXiv:2605.27922 (`Knowledge_source/2605.27922v1.pdf`) §3.4, §4.1, Tables 1–2
[FSC] Claude Fable 5 & Mythos 5 System Card (`Knowledge_source/`) §6.4.1.4
