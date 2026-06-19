# Spec: Backend lifecycle flowchart

| | |
|---|---|
| **ID** | 077-backend-lifecycle-flow |
| **Status** | **done** (draft → clarified → planned → in-progress → **done**) |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

> Enhancement of the 076 Backend "open full view" ([[spec-076-station-full-views]]).

## Problem / motivation

The Backend is the **orchestrator** of the whole turn — it receives the payload from
the frontend, reads history from the database, invokes the AI agent (which itself runs
RAG → MCP → LLM), persists the conversation, and streams the answer back. But the 076
Backend full view only shows two flat cards (request received / response assembled). It
hides the very thing that makes the Backend interesting: **the sequence it coordinates.**

The user asked to "see more detail here, explaining everything that happens, maybe even
a **flowchart**, showing the payload received from the front, the AI-agent call, the
database call, and the return to the front."

## Goals

- Turn the Backend full view into a **step-by-step orchestration flowchart** of the
  turn, top-to-bottom, with directional connectors between steps.
- Each step shows the **real trace data** for that hop and its **per-step latency**:
  1. **Payload received** — the message + the request body the frontend POSTed.
  2. **Load history** — the `db.read` (table + rows loaded).
  3. **AI agent invoked** — a summary of the ReAct loop (reasoning rounds, tool calls,
     retrieval count) with a pointer to the Agent / LLM / MCP full views for the detail.
  4. **Persist conversation** — the `db.write` (operation, row id, total rows).
  5. **Response streamed back** — the answer + delivery mode + session + total latency.
- A short intro framing the Backend as the orchestrator.
- Pure projection of the captured trace (no new request); step/replay-safe.

## Non-goals

- No new `Stage` / `Phase` / `TraceEvent`; no backend change. (§1)
- Does **not** duplicate the Agent / Database / RAG / LLM full views — the agent step is
  a **summary that points** at them, not a re-implementation.
- Not a generic flowchart engine; this is the Backend overlay specifically.

## User-facing behavior

Opening the Backend node's "Open full view" now shows a vertical flowchart of the five
orchestration steps connected by labelled hops (HTTPS POST → SQL read → in-process →
SQL write → HTTPS SSE). Each step carries its real payload and latency. Steps not yet
reached in the current (replay) cursor render dimmed/pending. All new prose ships en+pt.

## Acceptance criteria

1. **AC1 — ordered flow.** Given a completed turn, the Backend full view renders five
   steps in order — *payload received → load history → agent invoked → persist →
   response streamed* — each with a directional connector to the next.
2. **AC2 — payload step.** The "payload received" step shows the POSTed message and the
   request body JSON (from the `frontend`/`backend` trace data).
3. **AC3 — history step.** The "load history" step shows the `db.read` result (table and
   the number of rows loaded).
4. **AC4 — agent step.** The "agent invoked" step summarizes the ReAct loop: the number
   of reasoning rounds, the tool calls (by name), and the retrieval count, plus a
   bilingual pointer to the Agent/LLM/MCP full views.
5. **AC5 — persist step.** The "persist" step shows the `db.write` result (operation,
   row id, total rows).
6. **AC6 — response step.** The "response streamed" step shows the answer, delivery
   mode, session and the total backend latency.
7. **AC7 — pure projection + progressive/empty.** Each step reflects only the visible
   cursor slice: a step whose event hasn't arrived renders pending; with no trace at all
   the overlay shows the bilingual empty-state. No network request is issued.
8. **AC8 — bilingual.** Every new label/blurb exists in en **and** pt.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station mapping: **n/a** (reuses the `backend` station + already-mapped stages).

## Open questions (clarify before planning)

- [x] Replace the 076 two-card layout with the flowchart (the flow subsumes both).
      **Resolved** — the receive step = old "request received", the respond step = old
      "response assembled", now part of the sequence.
- [x] The agent step summarizes + links, does not re-render the Agent drill-in.
      **Resolved.**

## Out of scope / deferred

- Applying the same flowchart treatment to the other stations' full views.
- A horizontal / React-Flow-rendered diagram (the vertical CSS flow is enough here).
