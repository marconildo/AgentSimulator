# Spec: Core agentic request pipeline

| | |
|---|---|
| **ID** | 000-core-pipeline |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> **Retroactive spec.** This documents the pipeline that already shipped (commits
> `c885c0c` → `ccdf55e`) as a spec, reconciled against the existing test suite. It is
> *reverse specification*: written after the code, on purpose, to (a) record the intent
> behind the core system and (b) seed the SDD workflow with a worked example. Every
> acceptance criterion below points to a test that already guards it (see `plan.md`).

## Problem / motivation

People learn agentic AI from diagrams that hide the moving parts. We want a tool where
a user types a real message and **watches the actual request lifecycle** — routing, RAG
retrieval, MCP tool calls, LLM reasoning, token streaming, persistence — animate stage
by stage, and can inspect the real data at each stop. For that to be both truthful and
usable as a portfolio/demo, it must:

- run a **real** agent (not a scripted animation), and
- run **fully offline** with no API key, deterministically, so anyone can try it and CI
  needs no secrets.

## Goals

- A bounded ReAct agent (RAG → optional MCP tools → LLM) that runs one user message
  end to end.
- Emit the whole lifecycle as a stream of typed trace events that the frontend can both
  animate live and replay later.
- Two delivery contracts over the same pipeline: live **stream** (SSE, token by token)
  and synchronous **batch** (one JSON response).
- Real subsystems: LangGraph loop, Chroma vector store, SQLite application database, MCP
  tool execution. Only LLM reasoning/generation and embeddings are mockable.
- Long-term memory: prior turns are persisted and folded back into the prompt.

## Non-goals

- Multi-user / multi-tenant or cross-replica shared state — **single-instance by design**
  (constitution §8).
- Production auth, rate limiting, or durable queues.
- Agent autonomy beyond a 3-iteration tool loop.

## User-facing behavior

The user sends a message and sees stations light up in order across three columns
(client / API-over-agent / data). In stream mode the answer types out token by token; in
batch mode it arrives at once. Each station can be inspected for the real data that
passed through it, and any finished run can be replayed by its trace id. *(All visible
prose is bilingual en/pt — constitution §4.)*

## Acceptance criteria

Each is testable; the guarding test is named in `plan.md` → *Test strategy*.

1. **AC1 — Stable event protocol.** `Stage`/`Phase` serialize as their dotted/simple
   string values (e.g. `"rag.search"`, `"end"`); `seq` is monotonic and unique within a
   trace.
2. **AC2 — Full pipeline fires in order.** A normal query emits, at minimum,
   `agent.route`, `mcp.discover`, `rag.embed`, `rag.search`, `rag.retrieve`,
   `agent.think`, `llm.prompt`, `llm.generate`, `respond`.
3. **AC3 — RAG returns scored, ranked context.** Retrieval yields chunks each with
   `score` (0..1), `source`, and `text`; the obviously-relevant doc ranks first; it emits
   `rag.embed` → `rag.search` → `rag.retrieve`.
4. **AC4 — MCP tools are discoverable and execute.** The registry exposes `calculator`,
   `current_time`, `kb_lookup`; a known tool runs; an unknown tool returns a handled
   error; transport is either `mcp-stdio` or `local-fallback` (identical behavior).
5. **AC5 — Tool-using query.** A math question invokes the `calculator` tool and the
   computed result appears in the final answer.
6. **AC6 — Streaming delivery.** In stream mode, `llm.generate` emits more than one
   `progress` event, each carrying a `token`, and the SSE stream ends with a `done`
   event carrying the answer.
7. **AC7 — Batch delivery.** In batch mode the whole pipeline still runs and returns the
   full trace + answer as one JSON response, with **no** per-token `progress` events; the
   batch trace is still replayable.
8. **AC8 — Long-term memory.** Prior turns passed as history are folded into the assembled
   prompt, and `agent.route` reports the `memory_turns` count.
9. **AC9 — Relational persistence.** The conversation store round-trips a written turn and
   is idempotent per trace id (same id replaces, not appends); a chat run emits both
   `db.read` and `db.write`.
10. **AC10 — Replay.** A finished trace is retrievable by id; an unknown id returns 404.
11. **AC11 — Offline demo mode.** ~~With no API key the app reports `demo_mode: true` and the
    full pipeline runs deterministically.~~ **Superseded by [spec 003](../003-openai-only/spec.md)**
    (2026-05-26): demo mode was removed — the app now runs only against OpenAI and requires a key.

## Open questions (clarify before planning)

None — resolved (this is a retroactive spec of shipped, tested behavior).

## Out of scope / deferred

- Frontend rendering details (covered by the visual-model source of truth in
  `stations.ts`; constitution §6/§7) — a future spec can formalize the canvas projection.
- OpenAI-mode parity tests (the offline path is the contract; OpenAI is the swap behind
  `LLMProvider`).
