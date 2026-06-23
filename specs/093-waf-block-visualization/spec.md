# Spec: Visualize a WAF block (the 403 that never reaches the backend)

| | |
|---|---|
| **ID** | 093-waf-block-visualization |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-23 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The WAF (ModSecurity / OWASP CRS) is real and *does* block attacks with a 403 — but
today a block is **invisible** in the visualizer. The reason is structural: when a
request trips the WAF, ModSecurity returns a **403 at the edge** and the request
**never reaches the backend**, so:

- the backend never runs → there is **no trace**, no `trace_id`, no events;
- the frontend's chat `POST /api/chat` gets an **HTTP 403**, not an SSE stream;
- the canvas (which replays a `TraceEvent[]`) has nothing to show, and the chat just
  appears to fail.

So the most teachable security moment in the whole chain — "your payload was blocked
before it touched the app" — is the one thing the user can't see. This spec makes a
block a **first-class, honest outcome**: the canvas shows the request reaching the
WAF and being stopped there, and the WAF drill-in explains the 403. It directly
continues the user's "give me messages that get blocked" exploration (091/092).

## Goals

- When the chat request is **blocked by the WAF** (the chain returns 403 instead of a
  stream), render an honest **"blocked at the WAF"** outcome: the WAF station shows
  *blocked*, the stations past it (API-GW, backend, agent, …) are clearly **never
  reached**, and the chat surfaces the 403 instead of an answer.
- The WAF drill-in for a blocked run shows the real block evidence available (HTTP
  403, that ModSecurity is the blocker, and any block detail the 403 response
  carries), and says plainly the request never reached the backend.
- Stay honest (§2/§3): a block has **no server trace**, so we model it as a distinct
  *outcome* — not fabricated `TraceEvent`s — and we do **not** invent the per-request
  evidence of the appliances the request passed through.
- Real-chain-only: with no chain in front (bare `uvicorn`) there is no WAF, so the
  feature is inert and nothing changes.

## Non-goals

- Inventing the DNS/CDN/LB per-request evidence for a blocked run (the appliances
  don't forward it on a block) — those stations are shown as "reached", not detailed.
- Making the demo / GitHub Pages mode block anything (no backend / no chain there).
- Changing what counts as an attack — that's ModSecurity/CRS at the configured
  paranoia level; we only *visualize* its verdict.
- A new pipeline `Stage` (the block reuses the existing `waf` station; see below).

## User-facing behavior

Send a payload that trips CRS (e.g. `' OR '1'='1' --`, `<script>alert(1)</script>`)
**with the real chain running**:

1. The chat bubble shows a clear **"Blocked by the WAF (403) — the request never
   reached the agent"** state (bilingual), not a generic error.
2. On the canvas, the path lights up **to the WAF**, the **WAF station turns
   blocked** (its accent / a 🛡️✋ block marker), and **API-GW → Backend → Agent and
   the data tier stay dim / "not reached"**.
3. The **WAF drill-in** shows: verdict **blocked**, HTTP **403**, engine
   ModSecurity, the block detail the response carries (e.g. a ModSecurity
   transaction id / message when present), and the honest line "the request was
   stopped here and never reached the backend".

## Acceptance criteria

1. **AC1 — block is detected** — When `POST /api/chat` returns HTTP **403** (the
   chain blocked it) instead of an SSE stream, the app enters a **blocked** outcome
   rather than a generic stream error.
2. **AC2 — canvas shows where it stopped** — In the blocked outcome the WAF station
   renders *blocked* and every station **downstream of the WAF** (api-gw, backend,
   agent, data tier) renders **not-reached**; the stations up to the WAF render as
   *reached*.
3. **AC3 — WAF drill-in explains the block** — The WAF "open full view" for a
   blocked run shows verdict = blocked, HTTP 403, engine, any block detail present in
   the response, and the "never reached the backend" note. It fabricates no
   appliance evidence it didn't receive.
4. **AC4 — chat surfaces it honestly** — The chat bubble shows the bilingual
   "blocked by the WAF" message (not an answer, not a silent failure).
5. **AC5 — no fabricated trace** — A block produces **no synthesized `TraceEvent`s
   masquerading as server events**; it is modeled as a distinct outcome in the store,
   and `GET /api/trace` is never expected to have a trace for it.
6. **AC6 — inert without the chain / default unchanged** — With no chain in front
   (no WAF) a normal run streams exactly as today; nothing about the non-blocked path
   changes.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — the block reuses the existing `waf` station and
  its `status: "blocked"` vocabulary (already in `WafData`). It is represented as a
  store-level **outcome**, not new events.
- Mirror in `frontend/src/types/events.ts`: likely a small **blocked-outcome** type
  (FE-only), not an event-protocol change.
- Station mapping in `stations.ts`: unchanged.

## Open questions (clarify before planning)

- (resolved) **How much of the path to light** → light the path **up to the WAF**:
  DNS/CDN/LB "reached", WAF "blocked", everything downstream "not reached" (AC2).
  Honest caveat: the reached appliances carry no per-request evidence on a block.
- (resolved) **Persist the blocked attempt?** → **No** — a block is a momentary
  visual outcome (no trace, nothing written); keeps single-instance + scope tight.
- (plan decision) **CORS on the 403** — ModSecurity's default 403 may lack CORS
  headers, so a cross-origin `fetch` could surface a network error instead of a
  readable 403. The plan configures the chain to return CORS headers on the 403 so
  the FE reads `status === 403`; if that can't be guaranteed, the FE degrades to an
  honest "blocked or unreachable" state (still stops the canvas at the WAF).

## Out of scope / deferred

- Recording blocked attempts in the relational store / a "security events" log.
- Showing the exact CRS rule id(s) that matched unless the 403 response carries them.
