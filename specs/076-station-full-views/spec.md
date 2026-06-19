# Spec: Full-view drill-ins for MCP, App Database, Backend & Frontend

| | |
|---|---|
| **ID** | 076-station-full-views |
| **Status** | **done** (draft → clarified → planned → in-progress → **done**) |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

Today only four stations expose an **"Open full view"** drill-in (`agent`, `rag`,
`pageindex`, `llm`). Those overlays are where the real, turn-specific data lives —
every ReAct round, every retrieval cycle, the full assembled prompt. The remaining
real stations (`mcp`, `database`, `backend`, `frontend`) only offer the **Inspector**,
which mixes *theory* (blurb / why / what-breaks) with a cramped, last-only data
readout. The Inspector cannot comfortably show, say, **every** MCP `tool_call` of a
turn with its raw JSON-RPC frames, or both SQL operations with their payloads.

The visualizer's promise is "inspect the **real** data at each station." Four of the
default-visible stations only half-deliver on it. We want the **same affordance,
consistently**: a station's node opens a focused, full-screen drill-in for *its*
turn-specific data, while the Inspector is left to do what it's good at — the
**theoretical explanation**.

## Goals

- Give `mcp`, `database`, `backend`, and `frontend` an **"Open full view"** button on
  their node, matching the existing agent/llm affordance (collapsed **and** expanded).
- Each opens a **focused overlay** that is a **pure projection of the captured trace**
  (no extra network request), driven by the same `events`+`cursor` as the canvas so
  **live streaming and step/replay stay in sync**.
- **MCP**: show the tool discovery and **every** `mcp.call` of the turn — tool, args,
  result, and the **raw JSON-RPC request/response frames** — not just the last call.
- **App Database**: show **both** operations (`db.read` load-history and `db.write`
  persist) with their real payloads.
- **Backend**: show the API-edge lifecycle of the turn (request received → response
  assembled).
- **Frontend**: show what the browser **sent** (POSTed message + request overrides)
  and the streamed **answer** it received.
- Keep the **Inspector** as the home for the theoretical explanation of these stations
  (unchanged).

## Non-goals

- No new `Stage` / `Phase` / `TraceEvent`; no event-protocol change. (§1)
- No backend change. This is a frontend-only, pure-projection feature.
- No drill-in for **preview / coming-soon** stations (`gateway`, `guardrails`,
  `cache`, `eval`, `observability`, `researcher`, `coder`, `critic`) — they don't run,
  so they must not fake a full view (§3).
- No redesign of the existing agent/rag/pageindex/llm overlays.

## User-facing behavior

The user clicks a station's "Open full view" button (e.g. on **MCP Tools**). A
full-screen overlay slides over the canvas with a `←` back button and the station's
identity in the header, then panels of that station's real turn data. Closing it
(back button, or a second click on the node's button) returns to the canvas. The
Inspector still opens on single-click and still shows the theory.

All new prose ships in **en + pt** (§4).

## Acceptance criteria

1. **AC1 — button parity.** The `mcp`, `database`, `backend`, and `frontend` station
   nodes each render an "Open full view" button (in both collapsed and expanded
   states), styled like the existing agent/llm button, with its label resolved from
   i18n in en and pt. Preview/coming-soon stations render **no** such button.
2. **AC2 — open/close toggle.** Clicking a station's "Open full view" sets the store
   `detail` to that station id and renders its overlay; clicking the node's button
   again (or the overlay's `←` back) closes it (`detail = null`) — the same toggle
   contract the existing detail nodes honor.
3. **AC3 — MCP full view.** Given a turn whose trace contains a `mcp.discover` and
   N `mcp.call` end events, the MCP overlay renders the discovered-tool catalog (with
   transport) **and N call entries**, each showing tool name, arguments, result, and
   the JSON-RPC request/response frames when present. DeepAgents local tool calls
   (no `mcp.call`) are surfaced too.
4. **AC4 — App Database full view.** Given a trace with `db.read` and `db.write` end
   events, the App Database overlay renders **both** operations, each labelled, with
   its real payload (db.read: table + session + the loaded recent-history rows;
   db.write: persisted message id + chunk/skill counts).
5. **AC5 — Backend full view.** Given a trace with `backend` start/end events, the
   Backend overlay renders the request received (validated request body / delivery
   mode) and the assembled response (answer + delivery mode + session).
6. **AC6 — Frontend full view.** Given a trace with a `frontend` end event, the
   Frontend overlay renders the POSTed message and the request overrides the browser
   sent, plus the streamed answer it received (from the `respond`/answer projection).
7. **AC7 — pure projection + empty state.** Each overlay reads the same visible slice
   (`events` up to `cursor`) the canvas projects, issuing no network request; with no
   trace yet it shows a bilingual empty-state message.
8. **AC8 — Inspector unchanged.** The Inspector's theoretical content (blurb / why /
   what-breaks / tech) for these four stations is unchanged; the full view is additive.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (reuses existing stations & their
  already-mapped stages; `STAGE_TO_STATION` / `STAGE_TO_PHASE` unchanged).

## Open questions (clarify before planning)

- [x] Scope = the four named real stations only; preview stations excluded. **Resolved.**
- [x] Each overlay shows only **its** station's stages (frontend→{frontend,respond},
      backend→{backend}, database→{db.read,db.write}, mcp→{mcp.discover,mcp.call}),
      not the whole pipeline. **Resolved.**
- [x] Inspector keeps the theory; full view carries the data. **Resolved** (user's ask).

## Out of scope / deferred

- A generic, config-driven "station detail" abstraction unifying all overlays
  (agent/rag/llm included). Parked — these four can follow the existing per-station
  component pattern for now.
- Full-view drill-ins for the preview-rung stations once they become real.
