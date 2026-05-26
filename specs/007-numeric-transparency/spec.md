# Spec: Deeper numeric transparency

| | |
|---|---|
| **ID** | 007-numeric-transparency |
| **Status** | draft → clarified → planned → in-progress → done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Reinforce the "**see what's really on the wire**" feeling everywhere. The app
> already shows embedding dimensions, a vector preview, token counts and
> similarity scores; push it further: show the **raw MCP JSON-RPC** for tool
> discovery/calls, the **full `POST /api/chat` request body**, and a **top-k
> similarity table/matrix** in the RAG inspector — so every station exposes the
> concrete data passing through it, like the Transformer Explainer's numeric
> openness.

## Problem / motivation

The visualizer's credibility comes from showing *real* data, and it already does
this well in places (1536-dim embeddings, `[−0.013, 0.015, …]` previews, scores
like `0.37`). But three high-value spots are still summarized rather than shown
raw: the **MCP** station shows tool name/args/result but not the JSON-RPC frames
that actually travel; the **client/API** boundary never shows the exact request
body that was sent; and the **RAG** station shows per-chunk scores but not the
full top-k ranking as a comparable table/matrix. Exposing these closes the gap
between "a nice diagram" and "a window onto the real protocol".

## Goals

- **MCP raw JSON-RPC** — surface the JSON-RPC request **and** response frames for
  `mcp.discover` and `mcp.call` in the MCP inspector (collapsible, monospaced).
- **Full request body** — show the exact `POST /api/chat` body (message,
  session_id, top_k, mode, and any `006` overrides) in the client/backend
  inspector.
- **RAG similarity table** — render the top-k as a ranked table/matrix: rank,
  source, **distance** and **similarity** (`1 − distance`), with bars, so chunks
  are visually comparable.
- Everything composed from **existing trace events** (pure projection, §7) — no
  extra requests.
- New labels **bilingual** (en + pt) — §4.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent` — this enriches the **`data`** payloads of
  existing MCP/RAG events and shows client-side request state.
- No raw OpenAI API request/response dump (keys/PII risk; out of scope).
- No new station; reuses `mcp`, `rag`, `frontend`/`backend` inspectors.

## User-facing behavior

In the **MCP** station drill-in, a collapsible "JSON-RPC" block shows the actual
request/response frames for discovery and each tool call. In the **client/backend**
station, a "Request body" block shows the exact JSON that was POSTed. In the
**RAG** station, the retrieved chunks render as a **ranked table** — rank ·
source · distance · similarity (with a bar) — making the top-k comparison legible
at a glance. All of it is read from the trace already in memory; nothing new is
fetched.

*(All new labels ship in English **and** Portuguese — §4.)*

## Acceptance criteria

> Numbered and testable. Backend payload ACs run against **OpenAI** (per
> `003-openai-only`) with **structural** assertions (the fields exist and are
> well-formed), not exact values.

1. **AC1** — `mcp.discover` and `mcp.call` END events carry a `jsonrpc` field
   containing the request **and** response frames (well-formed JSON-RPC: `method`,
   `params`/`result`), for both the stdio and local-fallback transports.
2. **AC2** — The MCP inspector renders the `jsonrpc` frames (collapsible); a chat
   that calls a tool shows a non-empty request **and** response frame.
3. **AC3** — The exact request body sent to `POST /api/chat` is available to the
   client and rendered in the client/backend inspector (message, session_id,
   top_k, mode, `006` overrides when present).
4. **AC4** — `rag.retrieve` END exposes, per top-k chunk, both `distance` and
   `similarity = 1 − distance` (and a stable rank); the RAG inspector renders them
   as a ranked table with bars.
5. **AC5** — All transparency views are derived from existing trace events /
   client state only — **no new fetch**, no new `Stage`.
6. **AC6** — New labels exist en **and** pt.

## Protocol / stage impact

§1 & §6.

- New/changed `Stage`(s): **none**. This adds **keys to the `data` payloads** of
  existing events (`mcp.discover`/`mcp.call` gain `jsonrpc`; `rag.retrieve` chunks
  gain `distance`/`similarity`/`rank`). Because `TraceEvent.data` is an open
  `dict`, `events.ts` types may need a small optional-field update for the
  inspector to read them type-safely (document in `plan.md`).
- Station mapping: **unchanged** (`mcp`, `rag`, `frontend`/`backend`).
- The request body (AC3) is **client-side state** (what the browser sent), not a
  new trace field.

## Open questions (clarify before planning)

- [ ] **Q1 — JSON-RPC fidelity.** For the **local-fallback** transport (no real
  stdio frames), synthesize equivalent JSON-RPC frames that mirror what stdio
  would send, or label them "reconstructed"? (The app already treats fallback as
  behaviorally identical via `transport`.)
- [ ] **Q2 — Request-body source.** Capture the body in `useChat.send` / the SSE
  client and stash it in the store, or reconstruct it from the `frontend` event's
  `data`? (The `frontend` event already carries `message`/`session_id`.)
- [ ] **Q3 — "Matrix" scope.** Just the query-vs-chunk ranking (rank/distance/
  similarity), or also pairwise chunk-to-chunk similarity (a true matrix, more
  compute/clutter)? Proposed: the ranked table first; pairwise deferred.
- [ ] **Q4 — Payload size.** Truncate long JSON-RPC results / large bodies in the
  event to keep traces bounded (the `TraceStore` is in-memory, §8)?

## Out of scope / deferred

- Raw OpenAI request/response dumps.
- Pairwise chunk-to-chunk similarity matrix (Q3) — deferred unless clarified in.
- Exporting/downloading a trace as JSON (could be a small later spec).
