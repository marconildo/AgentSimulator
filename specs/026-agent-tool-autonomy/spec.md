# Spec: Agent tool autonomy — canonical ReAct (retrieval as a tool)

| | |
|---|---|
| **ID** | 026-agent-tool-autonomy |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The Simple-scenario agent does **not** behave like a market-standard tool-calling
agent, and a LangSmith trace makes the divergence obvious. Comparing two of our
runs against a reference agent (`run-019e2ce0`, a canonical LangGraph agent):

- **The reference agent** carries a growing `messages` thread:
  `system → human → ai(tool_calls) → tool → ai(final)`. Each tool is a **decision
  recorded on the AI message** (`tool_calls: [{name, args}]`); its result returns
  as a `ToolMessage`. This is the `MessagesState` + `ToolNode` (ReAct) pattern.
- **Our agent** has no `messages` thread. Two concrete consequences a trace shows:
  1. **Retrieval is a forced pipeline step, not a decision.** `retrieve` runs
     unconditionally before the model reasons; in `run-019e6a0b` the RAG context
     was populated while `used_tools` was empty — the agent never chose to
     retrieve, the docs were *injected* into the system prompt.
  2. **Tool results are stuffed into the system prompt as text**, and each
     reasoning round re-sends only `[human(message)]`. The model's own
     `AIMessage(tool_calls=…)` is never fed back and no `ToolMessage` is ever
     created, so the trace can't show the "AI decided → tool ran → AI observed"
     chain. Tools look executed out-of-band and pasted in.

This misrepresents how a production agent works — the exact thing this educational
visualizer exists to teach (CLAUDE.md: "the agent genuinely decides"). We want the
agent to **own the decision** to call any tool, with **document retrieval exposed
as an explicit tool** alongside the MCP tools.

## Goals

- The agent decides, autonomously and per round, whether to call a tool — including
  whether to **search the knowledge base** — exactly as a canonical tool-calling
  agent does.
- Document retrieval (RAG) is advertised to the model as a **first-class tool**, not
  a hardwired stage. It only runs when the agent elects to call it.
- Tool calls and their results live in a canonical **message thread**
  (`AIMessage(tool_calls)` → `ToolMessage`), so a LangSmith trace renders the
  standard ReAct chain and matches the reference agent.
- The visual model is preserved: the same `Stage`s, stations, timeline phases, and
  the two exhaustive maps stay intact (no orphan events).
- Everything stays real (constitution §3) and OpenAI-only (§2); all prior
  capabilities are preserved as regressions (011 token/cost, 017 failure injection,
  006 experiment overrides, streaming vs batch, long-term memory/history).

## Non-goals

- No change to the Intermediate/Advanced rungs (008) or their preview nodes.
- No new `Stage`, `Phase`, station, hop, or tier — the protocol surface is unchanged
  (this is a *behavioral* re-architecture, not a protocol extension).
- No change to PDF ingestion (`rag.ingest.*`), `db.read`/`db.write`, or the MCP
  server's existing tool set (`calculator`, `current_time`, `kb_lookup`).
- Not adopting `create_react_agent` wholesale if it costs us the per-stage trace
  emission the visualizer depends on; we keep our `TraceEmitter` instrumentation.

## User-facing behavior

- In the **MCP/tools list** the user inspects (the `mcp.discover` readout and
  `GET /api/config`), a knowledge-base retrieval tool now appears alongside the
  existing tools, with a bilingual description.
- For a question the model can answer directly (e.g. "What is 2 + 2?"), the **RAG
  station no longer lights up** — there are no retrieval events, because the agent
  didn't choose to retrieve. For a knowledge question, the agent visibly **decides**
  to call the retrieval tool and the RAG station animates as a consequence of that
  decision (the Agent → RAG hop follows a tool-call decision, not a fixed edge).
- The Agent station's description and flow tag are corrected: the loop is
  `reason → maybe call a tool (search KB / calculator / …) → observe → reason`,
  no longer "retrieves context, then loops" (text shipped en + pt).
- Disabling all tools (`enabled_tools: []`) now also disables retrieval — a pure
  LLM-only answer with no grounding, which is the honest behavior of "no tools".

## Acceptance criteria

> All tests assert **structurally** against real OpenAI to tolerate model
> variability (constitution §9), reading the emitted `TraceEvent`s and/or the
> agent's final message thread.

1. **AC1 — Retrieval is advertised as a tool.** The tool list the model sees
   (the `mcp.discover` END event's `tools`, and `GET /api/config`) includes a
   knowledge-base retrieval tool with a non-empty description.
2. **AC2 — Retrieval only runs on an agent decision.** For a query the model can
   answer without documents (e.g. "What is 2 + 2?", calculator enabled), **no**
   `rag.embed` / `rag.search` / `rag.retrieve` events are emitted. (Today they
   always fire.)
3. **AC3 — A knowledge question triggers a retrieval *decision*.** For a corpus
   question, the agent emits a tool-call decision for the retrieval tool, and the
   `rag.*` events follow it; the final answer is non-empty and grounded.
4. **AC4 — Tool calls form a canonical message thread.** After a tool-using run,
   the agent's message thread contains an `AIMessage` whose `tool_calls` is
   non-empty and a following `ToolMessage` whose content is that tool's result —
   i.e. results are fed back as `ToolMessage`s, **not** concatenated into the
   system prompt.
5. **AC5 — MCP tools remain agent decisions (regression of existing behavior).**
   A math question with the calculator enabled invokes the `calculator` tool via
   the canonical loop (`used_tools` / messages show it), and the numeric answer is
   correct. The existing `test_agent.py` tool-use assertions still pass.
6. **AC6 — The loop stays bounded and always answers.** The ReAct loop terminates
   within `MAX_ITERATIONS` and every run ends with a non-empty answer and a
   `respond` event.
7. **AC7 — Visual-model parity holds.** Every `Stage` still maps to exactly one
   station (`STAGE_TO_STATION`) and one timeline phase (`STAGE_TO_PHASE`); the
   existing parity tests pass unchanged, and a run with conditional retrieval
   projects through `deriveView` with no unmapped events.
8. **AC8 — Failure injection preserved (017).** `simulate_failure="tool_error"`
   still feeds a simulated error observation back to the model (now as an error
   `ToolMessage`) and the run reaches a terminal degraded answer;
   `simulate_failure="llm_timeout"` still degrades to the fallback answer and skips
   tools + generation. Both still surface `{error, simulated: true}` on the
   existing END `data`.
9. **AC9 — Token/cost preserved (011).** Each real model call still records token
   usage + US$ cost metrics on its trace event; a multi-round run totals more than
   one round.
10. **AC10 — Streaming & overrides preserved.** Stream mode still emits per-token
    `llm.generate` PROGRESS events and batch mode delivers once; `enabled_tools=[]`
    yields an answer with **no** tool calls **and no retrieval**; a `system_prompt`
    override still fully replaces the default; `top_k` still bounds retrieval when
    the agent does retrieve.

## Protocol / stage impact

This is a **behavioral** change; the protocol surface is unchanged.

- New/changed `Stage`(s): **none**. The same 17 stages survive.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no `Stage`/type change).
- Stations: **unchanged**. `rag.*` still maps to the `rag` station, `mcp.call`
  to the `mcp` station, `agent.*` to the `agent` station. The difference is *when*
  `rag.*` fires: now inside the retrieval tool's execution, only when the agent
  calls it (the map stays total, the events become conditional).
- The retrieval tool animates the **RAG station** (via `rag.*`), **not** the MCP
  station — it is a native agent tool whose body is the real RAG pipeline, distinct
  from the stdio MCP tools that emit `mcp.call`.

## Open questions (resolved during clarify)

- [x] **Depth of rewrite?** → **Canonical**: adopt a `MessagesState`-based thread +
  a `ToolNode`-style executor + tools bound to the model, so the LangSmith trace
  matches the reference agent. (User decision, 2026-05-27.)
- [x] **Is retrieval a tool?** → **Yes**: document retrieval is exposed as an
  explicit, agent-elected tool. The forced `retrieve` step is removed. (User
  decision, 2026-05-27.)
- [x] **Where does the retrieval tool live?** → A **native agent tool** (not added
  to the stdio MCP server, which has no access to the app's Chroma store / session
  scoping). Its execution runs the real RAG pipeline and emits the `rag.*` stages,
  so the RAG station animates on retrieval. MCP tools continue to run via the
  `ToolRegistry` and emit `mcp.call`.
- [x] **Keep the final answer as a distinct `llm.generate` stage?** → **Yes**.
  Preserve the separate streamed generation so the LLM station, the `generate`
  timeline phase, and token streaming are unchanged for the learner; it is the
  same canonical agent producing its final (tool-call-free) message.
- [x] **Keep `agent.route` + `mcp.discover` as a pre-step?** → **Yes**, as
  observability — they show the query landing and the (now retrieval-inclusive)
  tool list before the loop begins.

## Out of scope / deferred

- Parallel tool calls in a single round (the canonical loop allows them; we keep
  the existing sequential execution unless it falls out for free).
- Re-ranking / hybrid retrieval (that is the Intermediate rung, 008+).
- Exposing the retrieval tool's *parameters* (e.g. `top_k`, filters) to the model;
  `top_k` stays a request-level bound for now (the tool takes just the query).
