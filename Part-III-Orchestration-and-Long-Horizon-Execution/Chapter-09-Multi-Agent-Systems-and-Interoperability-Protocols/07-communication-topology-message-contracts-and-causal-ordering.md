# Topic 7 — Communication Topology, Message Contracts, and Causal Ordering

## 1. Scope, prerequisites, terminology, boundaries, exclusions, outcomes

**Scope.** The mechanics of agents talking: **who may message whom** (topology), **what a message must contain** (contract), and **what ordering guarantees exist** (causality). The sources ship a concrete message protocol, and its design choices are instructive — including what it deliberately does *not* provide.

**Prerequisites.** Topic 4 (topology — this topic is its message-layer realization); Topic 6 (what may cross a boundary); Chapter 8, Topic 7 (typed workflow state — messages are its inter-agent form).

**Terminology.** *Message contract*: the required fields of an inter-agent message. *Causal ordering*: the guarantee that if message A caused message B, every observer sees A before B. *Mailbox*: an agent's queue of pending messages.

**Boundaries.** Inside: the message layer — topology, contract, ordering, delivery. Outside: what the messages *mean* for coordination (Topic 8's failures); remote-agent protocols (Topics 9–11); concurrency limits (Topic 15).

**Exclusions.** No distributed-systems ordering-theory tutorial; Lamport clocks and vector clocks are named where relevant, not derived.

**Outcomes.** The reader can define a message contract, choose a topology's messaging discipline, and know which ordering guarantees they have and which they must build.

## 2. Problem, bottleneck, objective, assumptions, constraints, success criteria

**Problem.** Agents must exchange information: tasks down, findings up, and — in richer topologies — coordination sideways. **Each message is a context injection into the recipient's window** (Topic 6's SC-1) and a potential source of the coordination failures Topic 4 catalogued. A messaging layer without contracts and limits produces exactly [MAR]'s documented failure: agents **"distracting each other with excessive updates"** [MAR].

**Bottleneck.** Two things go wrong. **Unstructured messages** — a subagent sends prose, and the recipient must interpret it (Chapter 8, Topic 7's untyped-state problem, at the agent boundary: is this a finding, a failure, or a question?). **Unordered messages** — agent C receives B's response before A's request that caused it, and reasons over an incoherent history. **Causality violations produce agents that are confidently confused**, and they are hard to debug because each agent's view is locally plausible.

**Objective.** A typed message contract; a topology-appropriate delivery discipline; and an explicit statement of what ordering the system guarantees — because **the shipped protocols guarantee less than people assume.**

**Assumptions.** Messages carry context cost (Topic 6). Agents interpret messages with a model, so ambiguity is expensive.

**Constraints.** [OMA]'s protocol is *mailbox*-based with explicit wait semantics — **it does not provide causal ordering**, and this topic says so.

**Success criteria.** Every message is typed and carries $\kappa$; message volume is bounded; the ordering guarantee is stated and — where causality matters — enforced by the harness.

## 3. Intuition first, then formalization

### 3.1 Intuition: messages are context injections, and the protocol ships fewer guarantees than you think

**First: a message is not free.** It lands in the recipient's context window (Topic 6's SC-1), consuming its effective budget (Chapter 6, Topic 1). **[MAR]'s "distracting each other with excessive updates" is a *context* failure as much as a coordination one** — the updates crowded out the work. **So message volume is a budget, and it must be bounded.**

**Second: the shipped protocol is a mailbox, not a bus.** [OMA]'s design is instructive:

- **`send_message`** — "Queue message **without triggering turn**" [OMA]. **The message sits in the mailbox; the recipient does not wake.**
- **`followup_task`** — "Assign work and **start/resume turn**" [OMA]. This is what actually causes the recipient to act.
- **`wait_agent`** — "Wait for mailbox update" [OMA]. Explicit blocking.
- **`interrupt_agent`** — "Interrupt turn **without deleting context**" [OMA].

**The separation of `send_message` (queue, no turn) from `followup_task` (queue and run) is a deliberate design choice**, and it is the right one: **it decouples *informing* from *activating*.** You can send an agent information without making it act on it immediately — which is exactly what you want to avoid the "excessive updates" failure (each update would otherwise trigger a turn, and a turn costs tokens).

**Third, and this is the part people miss: there is no causal-ordering guarantee.** [OMA] documents a mailbox and explicit waits. **It does not document a causal-ordering guarantee across agents.** So **if agent A messages B and C, and B's response to A triggers a message to C, C may see B's message before A's** — and C's view is then incoherent. **The protocol gives you delivery; causality is yours to build.**

### 3.2 Formalization: the message contract and the ordering hierarchy

**The message contract** — inter-agent messages are Chapter 8, Topic 7's typed state, crossing an agent boundary **[synthesis; the shipped shape is [OMA]'s]**:

$$
m = \bigl(\underbrace{\text{author},\ \text{recipient}}_{\text{routing}},\ \underbrace{\text{type}}_{\text{MESSAGE | FINAL\_ANSWER | NEW\_TASK}},\ \underbrace{\text{payload}}_{\text{content}},\ \underbrace{\kappa}_{\text{status}},\ \underbrace{\text{causal deps}}_{\text{what this depends on}}\bigr).
$$

[OMA]'s shipped format is close: messages carry `author`, `recipient`, and a typed header —

```
Message Type: MESSAGE | FINAL_ANSWER | NEW_TASK
Task name: <recipient>
Sender: <author>
Payload: <text>
```

**[OMA] types the message** (MESSAGE / FINAL_ANSWER / NEW_TASK) — which is Chapter 8, Topic 7's T-1 (status is a field, not a sentence), partially realized. **What it does not carry is $\kappa$** (did the sender's work succeed?) or causal dependencies. **Both must be added**, because without $\kappa$, Chapter 8, Topic 6's aggregation (O-2) is impossible.

$$
\textbf{MC-1 (messages carry } \kappa \textbf{):}\quad
\text{every inter-agent message carries the sender's terminal status;}\ \text{a FINAL\_ANSWER with } \kappa = \text{budget is NOT a success.}
$$

**MC-1 is Chapter 8, Topic 6's O-2 at the message layer**, and it is the difference between a lead that can compute $\kappa_{\text{agg}}$ and one that launders failures. **A `FINAL_ANSWER` message type does not tell you whether the answer is *good*** — only that the sender considers itself done, which is precisely the `model_stop ≠ success` error (Chapter 1, Topic 12).

**The ordering hierarchy** — what you have and what you need **[derived; standard distributed-systems ordering, applied]**:

$$
\text{no ordering} \;\subset\; \text{FIFO per-sender} \;\subset\; \textbf{causal} \;\subset\; \text{total}.
$$

$$
\textbf{MC-2 (state your ordering guarantee):}\quad
\text{the protocol provides delivery; causal ordering must be built.}
$$

**Causal ordering** (if $m_1 \to m_2$, every agent sees $m_1$ first) is the level that matters for multi-agent coherence — **an agent that sees an effect before its cause reasons over an incoherent world.** **[OMA]'s mailbox does not provide it.** The standard mechanism is a **vector clock** or a **causal-dependency list** on each message, with the recipient buffering a message until its dependencies have arrived.

**Total ordering** (all agents see all messages in the same order) is stronger, more expensive, and usually unnecessary.

### 3.3 The topology determines the message discipline

Topic 4's topologies imply different messaging patterns **[synthesis]**:

- **Supervisor:** messages flow **lead ↔ subagent only**. **No subagent-to-subagent messaging.** This is a *star*, and it is why the supervisor topology has few coordination failures: **there is no sideways channel to abuse.** Ordering is trivial (the lead sequences everything).

- **Hierarchy:** messages flow along tree edges. Still no sideways. **Ordering within a subtree is manageable; across subtrees it is not** — and cross-subtree causality is where hierarchical systems get confusing.

- **Peer:** any-to-any. **This is where causal ordering becomes essential and where [MAR]'s "excessive updates" failure lives.** **Every peer channel is a context injection into the recipient (Topic 6's SC-1) and a coordination decision the agents must make (Topic 4's capability limit).**

**The design rule: the topology's message graph should be as sparse as the task allows.** **A star (supervisor) has $n$ edges; a peer mesh has $n^2$.** Each edge is a channel that can carry noise, violate ordering, and inject context. **[MAR]'s shipped system is a star, and its coordination failures were still significant enough to require eight prompt principles** — which should calibrate expectations for a mesh.

## 4. Architecture

```
   THE MESSAGE CONTRACT — [OMA]'s shipped shape + what it's MISSING
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  SHIPPED [OMA]:                                                           │
   │    Message Type: MESSAGE | FINAL_ANSWER | NEW_TASK   ← typed (Ch.8 T7 T-1)│
   │    Task name: <recipient>                                                 │
   │    Sender: <author>                                                       │
   │    Payload: <text>                                                        │
   │    (encrypted `agent_message` items)                                      │
   │                                                                          │
   │  MISSING — and you must add both:                                         │
   │    κ (sender's terminal status)  ← MC-1. Without it, the lead CANNOT      │
   │       compute κ_agg ⇒ Ch.8 T6's failure laundering is UNAVOIDABLE.        │
   │       ⚠ FINAL_ANSWER does NOT mean success — it means the sender          │
   │         considers itself done (`model_stop ≠ success`, Ch.1 T12)          │
   │    causal deps  ← MC-2. The mailbox gives DELIVERY, not CAUSALITY.        │
   └──────────────────────────────────────────────────────────────────────────┘

   [OMA]'s MAILBOX SEMANTICS — the design choice worth stealing:
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  send_message    → "Queue message WITHOUT triggering turn"                │
   │  followup_task   → "Assign work and START/RESUME turn"                    │
   │  wait_agent      → "Wait for mailbox update"                              │
   │  interrupt_agent → "Interrupt turn WITHOUT deleting context"              │
   │                                                                          │
   │  ★ INFORMING is decoupled from ACTIVATING. This is what prevents the      │
   │    "distracting each other with excessive updates" failure [MAR] —        │
   │    an update that triggered a turn would cost tokens every time.          │
   └──────────────────────────────────────────────────────────────────────────┘

   TOPOLOGY → MESSAGE GRAPH SPARSITY (§3.3)
        SUPERVISOR (star, n edges)          PEER (mesh, n² edges)
             lead                              A ←→ B
            ↙ ↓ ↘                              ↕ ╳ ↕
          s1  s2  s3                           C ←→ D
        NO sideways channel                  every edge = a context injection,
        ⇒ few coordination failures            an ordering hazard, and a
        ⇒ ordering is TRIVIAL                   coordination decision the agents
                                                must make (and are bad at [MAR])

   ORDERING HIERARCHY (MC-2):  none ⊂ FIFO ⊂ CAUSAL ⊂ total
                                            ↑ the level that matters
                                              — and the protocol does NOT provide it
```

## 5. Grounding

- **The shipped message format:** agent-to-agent communication via encrypted `agent_message` items containing `author`, `recipient`, and encrypted content; messages format as `Message Type: MESSAGE | FINAL_ANSWER | NEW_TASK`, `Task name`, `Sender`, `Payload` [OMA].
- **The mailbox primitives, with their exact semantics:** **`send_message` — "Queue message without triggering turn"**; **`followup_task` — "Assign work and start/resume turn"**; **`wait_agent` — "Wait for mailbox update"**; **`interrupt_agent` — "Interrupt turn without deleting context"**; `spawn_agent`; `list_agents` [OMA].
- **The output item types:** `multi_agent_call` (records hosted actions), `multi_agent_call_output` (result), `agent_message` (inter-agent encrypted message) [OMA].
- **Excessive messaging is a documented failure:** early agents "**distracting each other with excessive updates**" [OMA-adjacent; [MAR]] — the reason to bound message volume.
- **Tracing is agent-attributed but incomplete:** "Agent-attributed SSE events include `agent.agent_name` identifying source. **Response lifecycle events (`response.created`, `response.completed`) lack agent attribution**" [OMA] — **a documented observability gap** (Topic 14).
- **Transport modes and injection:** HTTP (execute pending function calls, resubmit) vs WebSocket (`response.inject` event into an active response; "waiting agent resumes immediately"), with acknowledgements `response.inject.created` / `response.inject.failed` and error codes (`response_already_completed`, `response_not_found`) [OMA].
- **Concurrency is bounded:** `max_concurrent_subagents` "limits the number of active subagent turns across the entire tree," default 3 [OMA].
- **A2A builds on standard transports:** "built on top of existing, popular standards including **HTTP, SSE, JSON-RPC**" [A2A] — the remote-agent message layer (Topic 10).
- **Typed state is required for coordination:** [CAH]'s implicit-state vulnerability ("agents cannot reliably detect when their internal understanding diverges from the true program state") — MC-1's basis, and Chapter 8, Topic 7's argument.
- **$\kappa$ must cross boundaries:** Chapter 1, Topic 12; Chapter 5, Topic 2; Chapter 8, Topic 6's O-2 — MC-1.

**Evidence gap, and one of it is notable.** **The message protocol is documented** [OMA] — types, primitives, transports. **But no source documents a causal-ordering guarantee**, and [OMA]'s mailbox semantics suggest there is none. **MC-2's claim that causality must be built is [derived]** from the absence of any ordering guarantee in the documentation — **it is an inference from silence, and should be verified against current docs.** **MC-1 ($\kappa$ in messages) is [derived]** from Chapter 8, Topic 6 — **[OMA]'s `FINAL_ANSWER` type carries no status**, which is exactly the gap. **No source measures message-ordering failures or their impact.**

## 6. Implementation

**The message contract — [OMA]'s shape plus what it is missing (MC-1, MC-2):**

```python
@dataclass(frozen=True)
class AgentMessage:
    """[OMA]'s shipped fields + the two it is MISSING."""
    author: str
    recipient: str
    type: Literal["MESSAGE", "FINAL_ANSWER", "NEW_TASK"]     # [OMA] — typed (Ch.8 T7 T-1)
    payload: str

    # MC-1 — MISSING FROM [OMA]. Without κ, the lead cannot compute κ_agg (Ch.8 T6 O-2)
    # and failure laundering is UNAVOIDABLE.
    kappa: str                        # success | budget | timeout | execution_error | ...

    # MC-2 — MISSING FROM [OMA]. The mailbox gives DELIVERY, not CAUSALITY.
    causal_deps: list[str] = field(default_factory=list)      # message IDs this depends on
    msg_id: str = field(default_factory=new_id)

    def __post_init__(self):
        if self.type == "FINAL_ANSWER" and self.kappa != "success":
            # A FINAL_ANSWER is the sender saying it is DONE — not that it SUCCEEDED.
            # `model_stop ≠ success` (Ch.1 T12). The recipient MUST see this.
            log.warning(f"{self.author} sent FINAL_ANSWER with κ={self.kappa} — "
                        f"this is NOT a success. The lead must not launder it (Ch.8 T6).")
```

**Causal ordering — buffer until dependencies arrive (MC-2):**

```python
class CausalMailbox:
    """MC-2: [OMA]'s mailbox provides DELIVERY. Causal ordering is YOURS to build.
    Without it, an agent can see an EFFECT before its CAUSE and reason over an
    incoherent world — confidently, and undebuggably."""

    def __init__(self):
        self._delivered: set[str] = set()
        self._buffered: list[AgentMessage] = []

    def receive(self, m: AgentMessage) -> list[AgentMessage]:
        self._buffered.append(m)
        return self._drain()

    def _drain(self) -> list[AgentMessage]:
        """Deliver only messages whose causal dependencies have ALL arrived."""
        ready, still_buffered = [], []
        for m in self._buffered:
            if all(dep in self._delivered for dep in m.causal_deps):
                ready.append(m)
                self._delivered.add(m.msg_id)
            else:
                still_buffered.append(m)      # HOLD — its cause has not arrived
        self._buffered = still_buffered
        return ready if not ready else ready + self._drain()   # cascade
```

**Bound the message volume — it is a context budget (Topic 6's SC-1):**

```python
def send(sender, recipient, msg, ctx) -> None:
    """[MAR]: agents 'distracting each other with excessive updates'.
    Every message is a CONTEXT INJECTION into the recipient (Topic 6, SC-1) and consumes
    its effective budget (Ch.6 T1). Message volume is a BUDGET."""
    if ctx.message_budget[sender] <= 0:
        raise MessageBudgetExceeded(
            f"{sender} exceeded its message budget. Excessive inter-agent updates are a "
            f"documented failure [MAR] — they crowd out the recipient's actual work."
        )
    ctx.message_budget[sender] -= 1

    # [OMA]'s design choice, worth stealing: INFORM without ACTIVATING.
    if msg.requires_action:
        ctx.followup_task(recipient, msg)     # queue AND start/resume the turn
    else:
        ctx.send_message(recipient, msg)      # queue WITHOUT triggering a turn — no token cost
```

**Enforce the topology's message graph (§3.3):**

```python
def can_message(sender: str, recipient: str, topology: str) -> bool:
    """§3.3: the message graph should be as SPARSE as the task allows.
    A star (supervisor) has n edges; a peer mesh has n². Each edge is a channel that
    can carry noise, violate ordering, and inject context."""
    match topology:
        case "supervisor":
            return is_lead(sender) or is_lead(recipient)    # star: NO sideways channel
        case "hierarchy":
            return is_parent_child(sender, recipient)       # tree edges only
        case "peer":
            return True                                     # mesh — and now you need MC-2
```

## 7. Trade-offs

| Choice | Buys | Costs |
|---|---|---|
| **Typed messages** [OMA] | Recipient does not interpret prose | A schema |
| **$\kappa$ in messages** (MC-1) | Aggregation possible (Chapter 8, Topic 6) | One field — **and no SDK gives it to you** |
| Untyped prose messages | Simple | **Recipient must infer failure from text** — the Chapter 8, Topic 7 failure |
| **Causal ordering** (MC-2) | Coherent agent views | Vector clocks / dep lists; buffering latency |
| No ordering | Simple; what the protocol gives you | **Agents see effects before causes** — confidently confused |
| `send_message` (no turn) [OMA] | **Inform without spending a turn** | The recipient may not act promptly |
| `followup_task` (starts turn) [OMA] | Immediate action | **Every message costs a turn** — the "excessive updates" failure |
| **Star topology** | $n$ edges; trivial ordering; few failures | No direct peer coordination |
| Peer mesh | Rich coordination | **$n^2$ edges**; ordering essential; the capability limit bites |

**The trade [OMA]'s design gets right and most home-grown systems get wrong: decoupling inform from activate.** If every message triggers a turn, then **every "just letting you know" update costs the recipient a full model call** — and you get [MAR]'s "distracting each other with excessive updates," which is expensive *and* degrading. **`send_message` (queue without turn) vs `followup_task` (queue and run) is the fix**, and it should be in any messaging layer you build.

**The trade on ordering: you probably need causality and you do not have it.** **Causal ordering is not exotic** — it is what makes agent views coherent. **And the shipped protocol does not appear to provide it** (§5's evidence gap). **The star topology hides this**, because the lead sequences everything and there is no concurrent cross-agent causality to violate. **A peer or hierarchical system, where agents message each other, needs it — and must build it.**

## 8. Experiments

**The causal-violation test (MC-2) — the failure that is hard to see.** In a topology with agent-to-agent messaging, construct a causal chain: A → B, and B's response → C, where C also receives a message from A. **Delay A's message to C.** **Does C see B's (effect) before A's (cause)?**

- **Without causal ordering:** yes, and **C reasons over an incoherent history** — it sees a response to a request it has not seen.
- **With MC-2's buffering:** C holds B's message until A's arrives.

**Measure: causal-violation rate.** **The insidious part is that C's behavior will look *locally plausible*** — it produces a reasonable-seeming output from an incoherent input, which is why this failure is hard to debug.

**The $\kappa$-propagation test (MC-1).** Have a subagent terminate with `budget` and send a `FINAL_ANSWER`. **Does the lead treat it as a success?** **Without $\kappa$ in the message, it must** — `FINAL_ANSWER` carries no status. **This is Chapter 8, Topic 6's failure laundering, entering through the message protocol.**

**The message-volume ablation.** Vary the per-agent message budget. Measure: task completion, recipient context consumption, and total tokens. **Prediction from [MAR]: unbounded messaging degrades performance** ("distracting each other with excessive updates") — the messages crowd out the work.

**The inform-vs-activate comparison.** All messages as `followup_task` (each triggers a turn) vs `send_message` for informational updates. **Measure: token cost.** **Prediction: activating on every message multiplies cost** — this validates [OMA]'s design choice.

**The topology-sparsity comparison.** Star vs mesh messaging on the same task. **Measure: messages exchanged, coordination failures, causal violations, completion.** **Prediction (§3.3): the mesh has $n^2$ channels and proportionally more failures.**

**Statistics.** Zero-failure bound on causal violations and laundered $\kappa$ (targets zero); Wilson on message-budget effects; task-clustered bootstrap on completion (Chapter 1, Topic 12).

## 9. Failure modes, edge cases, hazards, mitigations, open limitations

- **Causal-ordering violation.** An agent sees an effect before its cause; its view is incoherent; **its output is locally plausible and globally wrong** — the hardest multi-agent bug to find. Mitigation: MC-2 — causal deps + buffering.
- **`FINAL_ANSWER` treated as success.** The message type says "done," not "succeeded." **`model_stop ≠ success`** (Chapter 1, Topic 12), and without $\kappa$ in the message, the lead cannot tell. **Failure laundering, entering through the protocol.** Mitigation: MC-1.
- **Excessive updates.** [MAR]'s documented failure — agents distracting each other; the messages crowd out the work (Topic 6's SC-1). Mitigation: message budgets; `send_message` (no turn) for informational updates.
- **Every message triggers a turn.** Each "just letting you know" costs a full model call. Mitigation: [OMA]'s inform/activate split.
- **Untyped prose messages.** The recipient must infer meaning (and failure) from text — Chapter 8, Topic 7's core failure, at the agent boundary. Mitigation: typed messages [OMA] + $\kappa$.
- **Peer mesh without ordering.** $n^2$ channels, no causality, agents confidently confused. Mitigation: sparse topology (star) or build causal ordering.
- **Observability gap in tracing.** [OMA]: "**Response lifecycle events (`response.created`, `response.completed`) lack agent attribution**" — **you cannot attribute lifecycle events to an agent**. Mitigation: correlate via `agent.agent_name` on the SSE events you *do* get; build your own attribution (Topic 14).
- **Interrupt semantics misunderstood.** `interrupt_agent` interrupts "without deleting context" [OMA] — the agent's context survives, so an interrupted agent can be resumed. **An implementation that assumes interrupt = kill will leak agents.**
- **Edge case — the WebSocket injection race.** [OMA]'s `response.inject` can fail with `response_already_completed` — **the agent finished before your injection arrived.** Mitigation: handle the failure code; do not assume injection succeeds.
- **Open limitation.** **No source documents a causal-ordering guarantee**, and MC-2 is an **inference from silence** — verify against current docs. **MC-1's gap ($\kappa$ absent from [OMA]'s message format) is documented by omission.** **No source measures message-ordering failures or their impact.**

## 10. Verified observations, decision rules, production implications, connections

**Verified observations.**
1. The shipped message format is **typed** (`MESSAGE | FINAL_ANSWER | NEW_TASK`) with `author`, `recipient`, `payload`, as encrypted `agent_message` items [OMA].
2. **`send_message` queues "without triggering turn"; `followup_task` "assign[s] work and start[s]/resume[s] turn"** [OMA] — **informing is decoupled from activating.**
3. `wait_agent` waits for a mailbox update; `interrupt_agent` interrupts "without deleting context" [OMA].
4. **Tracing has a documented gap:** "Response lifecycle events (`response.created`, `response.completed`) **lack agent attribution**" [OMA].
5. WebSocket injection can fail (`response_already_completed`, `response_not_found`) [OMA].
6. Excessive inter-agent updates are a **documented failure** [MAR].
7. **No source documents a causal-ordering guarantee**, and **[OMA]'s message format carries no $\kappa$.**

**Decision rules.**
- **Every message carries $\kappa$** (MC-1) — a `FINAL_ANSWER` is "done," not "succeeded," and without $\kappa$ the lead launders failures.
- **State your ordering guarantee** (MC-2) — the protocol gives delivery; **causality is yours to build**, and you need it in any topology with agent-to-agent messaging.
- **Decouple inform from activate** — `send_message` for updates, `followup_task` for work. Otherwise every update costs a turn.
- **Bound message volume** — messages are context injections (Topic 6's SC-1) and "excessive updates" is a documented failure.
- **Keep the message graph sparse** — a star has $n$ edges; a mesh has $n^2$, and each edge is a hazard.
- **Type every message** — the recipient must not infer meaning from prose.

**Production implications.**
1. Add $\kappa$ to your inter-agent message contract; without it, Chapter 8, Topic 6's aggregation is impossible and failure laundering is guaranteed.
2. Build causal ordering if agents message each other; the protocol does not provide it, and causal violations produce confidently-confused agents.
3. Use the inform/activate split; activating on every message multiplies your token cost.
4. Know the tracing gap — lifecycle events lack agent attribution [OMA] — and build your own correlation (Topic 14).

**Connections.** This topic is Topic 4's topology at the message layer, and Chapter 8, Topic 7's typed state, crossing an agent boundary. MC-1 is Chapter 8, Topic 6's O-2 (aggregation needs $\kappa$) and Chapter 5, Topic 2's requirement that $\kappa$ cross delegation boundaries. Message volume is Topic 6's SC-1 (context cost). The coordination failures these messages carry are Topic 8; the remote-agent message layer is Topics 9–11 (A2A builds on HTTP/SSE/JSON-RPC [A2A]); the observability gap feeds Topic 14.

## Sources

[OMA] OpenAI, multi-agent guide — the hosted collaboration actions with exact semantics (**`send_message` — "Queue message without triggering turn"**; **`followup_task` — "Assign work and start/resume turn"**; **`wait_agent` — "Wait for mailbox update"**; **`interrupt_agent` — "Interrupt turn without deleting context"**; `spawn_agent`; `list_agents`); the message format (`Message Type: MESSAGE | FINAL_ANSWER | NEW_TASK`, `Task name`, `Sender`, `Payload`) as encrypted `agent_message` items; the output item types (`multi_agent_call`, `multi_agent_call_output`, `agent_message`); HTTP vs WebSocket transports with `response.inject` and its failure codes (`response_already_completed`, `response_not_found`); **the tracing gap ("Response lifecycle events (`response.created`, `response.completed`) lack agent attribution")** — https://developers.openai.com/api/docs/guides/responses-multi-agent
[MAR] Anthropic, "How we built our multi-agent research system" — agents "**distracting each other with excessive updates**" as a documented coordination failure — https://www.anthropic.com/engineering/multi-agent-research-system
[A2A] Google, "A2A: A new era of agent interoperability" — the protocol "built on top of existing, popular standards including **HTTP, SSE, JSON-RPC**"; structured messages exchanging "context, replies, artifacts, and user instructions" — https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/
[CAH] Code as Agent Harness, arXiv:2605.18747 (`Knowledge_source/2605.18747v1.pdf`) — the implicit-state vulnerability: "agents cannot reliably detect when their internal understanding diverges from the true program state"
