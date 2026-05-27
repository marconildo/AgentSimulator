# Spec: Failure injection (watch the agent degrade)

| | |
|---|---|
| **ID** | 017-failure-injection |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

## Problem / motivation

Learners only ever see the **happy path**. They never watch the system degrade — and
seeing how an agent reacts to a tool error or an LLM timeout is, in the assessment's
words, "didactically devastating." A small, opt-in failure injector turns the simulator
from "pretty demo" into "ferramenta que professor usa em sala": flip a switch, send a
turn, and watch the retry / abstain / error-response behavior on the real canvas.

This follows the **006 experiment-overrides / 008 scenario** pattern: a **request-only**
input that changes *how* the run executes, **not** a new pipeline stage.

## Goals

- Let the user **force a chosen failure on the next run** from the ⚙ settings, scoped
  per conversation, and observe the agent's reaction on the canvas/inspector.
- Ship at least **two failure modes in the Simple scenario**: a **tool error** and an
  **LLM timeout** (richer modes — rate-limit, RAG-empty — deferred to Advanced).

## Non-goals

- No new pipeline `Stage`; the injector is a request-only input threaded into the run.
- Not a general chaos-engineering framework; a bounded enum of failures only.
- Not changing the agent's real control flow beyond surfacing the injected failure.

## User-facing behavior

- A **"Simulate failure"** selector in the ⚙ panel (per conversation): `off` (default),
  `tool error`, `llm timeout`. Default reproduces today's behavior exactly.
- When set, the **next run** hits that failure; the trace shows where it happened and
  the agent's reaction (e.g. abstains, returns a degraded answer, or surfaces an error)
  instead of silently succeeding.
- Bilingual labels + any failure/degraded-state text.

## Acceptance criteria

1. **AC1** — `ChatRequest` accepts an optional `simulate_failure` from a **bounded enum**
   (`none | tool_error | llm_timeout`); omitting it (or `none`) reproduces the current
   pipeline byte-for-byte (a no-failure run is unchanged).
2. **AC2** — With `tool_error`, a tool invocation yields a **simulated error** that
   appears at the MCP stage in the trace, and the run **does not 500/crash** — the agent
   reaction is observable and the run reaches a terminal state.
3. **AC3** — With `llm_timeout`, a model call surfaces a **timeout** the UI can show and
   the run ends in a **clean degraded/error state** (no hang, no unhandled 500).
4. **AC4** — The control is **scoped per conversation** (like 006 overrides) and its
   allowed values are advertised by `GET /api/config` so the frontend doesn't hardcode
   them.
5. **AC5** — All new user-facing strings exist in **both en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- New **request-only** field on `ChatRequest` (`simulate_failure`, a `SimulateFailure`
  StrEnum) + its TS mirror in the request type / `ChatOverrides`, like `scenario`/006
  overrides. **No new `Stage`/`Phase`** and **no `TraceEvent` type change.**
- Failure **representation on events** → an `error` key on the **existing END event
  `data`** (`{ error, simulated: true }`). `data` is already an open record, so no
  schema/`events.ts` *type* change (an optional `SimulatedError` TS shape may be added
  for the inspector to read safely, à la 007).

## Clarified (2026-05-27)

- [x] **Failure set for Simple** → **`tool_error` + `llm_timeout`** only. `rate_limit` /
  `rag_empty` deferred to Advanced.
- [x] **Agent reaction (tool_error)** → the tool returns an **error observation** (like a
  real failed call); the agent **reasons over it and degrades/abstains**, keeping the
  run alive to a terminal state (most realistic + didactic).
- [x] **Error representation** → an **`error` key on the existing END event `data`**
  (no new `Stage`/`Phase`, no schema *type* change).
- [x] **Determinism** → **persistent until toggled** back to `off` (scoped per
  conversation, consistent with the 006 overrides — AC4).

## Out of scope / deferred

- `rate_limit` and `rag_empty` injection (Advanced scenario).
- Latency injection / slow-network simulation.
- Random/probabilistic failures (this is deterministic, user-chosen).
