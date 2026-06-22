# Spec: Hop communication detail (click an edge → Inspector)

| | |
|---|---|
| **ID** | 085-hop-communication-detail |
| **Status** | draft → clarified → planned → in-progress → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

## Problem / motivation

The arrows between stations carry almost no information: today a **hover-only tooltip**
(`FlowEdge.tsx`, `pointer-events-none`) shows the protocol, a one-line detail, the comm style and
the zone/controls — and it vanishes the moment the pointer leaves. There is no way to *click* an
edge and study the communication, and nowhere to see **the real data that actually crossed that
hop** this run. Two concrete complaints from review:

1. Each arrow should expose **more detail**, with an explicit **expand** affordance (not just hover)
   — e.g. frontend↔backend.
2. The Network Edge's ⊕-expanded box (084) crams the DNS·CDN·WAF·TLS/LB·API GW chain into a flat
   k/v list — it looks bad and there's no room to do it justice.

Both are the same gap: the *communication* between components is under-explained and badly placed.
The fix makes every hop a first-class, clickable object whose detail lives where stations' details
already live (the Inspector), and shows **the honest, real per-run data** that traversed it —
on-brand with §3 ("everything is real").

## Goals

- Clicking an edge opens a **hop detail in the Inspector** (the same panel a station opens into),
  with an explicit selected state on the edge.
- The hop detail shows the **theory** (protocol · comm + mode-aware note · zone · controls · the
  existing one-line detail) **and** an **"On this run"** section with the **real data** that crossed
  that hop, derived purely from the trace events (no new requests, no new `Stage`).
- The **Network Edge chain** (DNS·CDN·WAF·TLS/LB·API GW) moves out of the cramped inline ⊕ box into
  the public-ingress hop detail, rendered as a proper visual pipeline (TLS/LB real vs the preview
  segments clearly distinguished). The inline ⊕ box is simplified.
- Station selection, hop selection, the Execution-traces view and the drill-in overlay stay mutually
  exclusive and coherent with replay/step.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent` and **no backend change** — this is a pure frontend projection
  of data already on the trace.
- No new "full-view overlay" component for hops (the detail lives in the existing Inspector body).
- Not every hop needs bespoke real data — hops with nothing meaningful captured show an honest
  "nothing crossed this hop this run" note (preview/idle hops included).

## User-facing behavior

- Hovering an edge keeps today's quick tooltip. **Clicking** an edge selects it (a subtle
  highlight) and the Inspector shows the hop detail; clicking a station or the empty pane clears it.
- The hop detail header reads `Source → Target`, followed by protocol, comm, zone, controls, the
  detail line, and an **"On this run"** block:
  - `frontend → backend` / `frontend → edge`: the request body + the final answer.
  - `edge → backend`: the forwarded headers the proxy added (proxied? · scheme · client IP · request id).
  - `frontend → edge` also renders the **edge chain pipeline** (DNS·CDN·WAF·TLS/LB·API GW).
  - `backend → database`: the real SQL statements that ran (079 data).
  - `agent → rag`: the retrieved chunks (count + top score).
  - `agent → mcp`: the tool calls made (tool → result).
  - `agent → llm`: the assembled-prompt summary + token usage/cost.
  - any other hop (incl. preview hops): an honest "no data captured this run".
- All new prose ships in **en + pt**.

## Acceptance criteria

1. **AC1** — Clicking an edge sets a selected-hop state and the Inspector renders that hop's detail
   (header `source → target`, protocol, comm, zone, controls). Selecting a station, opening traces,
   or clicking the pane clears the selected hop (mutually exclusive).
2. **AC2** — `deriveHopData(source, target, events)` (pure) returns the real per-run data for a hop,
   keyed by the hop, for at least: request (request body + answer), edge (forwarded headers), sql
   (db queries), rag (chunks), mcp (tool calls), llm (prompt preview + usage). Unknown/empty hops
   return a `none`/empty result. It never mutates its input and is deterministic.
3. **AC3** — The Inspector hop detail renders the `deriveHopData` result for the selected hop, and
   shows an honest empty-state note when there is no run data.
4. **AC4** — The `frontend → edge` hop detail renders the edge chain as a visual pipeline with the
   **TLS/LB** segment bound to real edge data and **DNS/CDN/WAF/API GW** marked preview; the Network
   Edge inline ⊕ box no longer lists the 5-row chain (it is simplified).
5. **AC5** — No protocol change: `backend/app/schemas.py` and `frontend/src/types/events.ts` are
   untouched; no new `Stage`. The schema-mirror + `STAGE_TO_PHASE`/`STAGE_TO_STATION` parity tests
   still pass unchanged.
6. **AC6** — All new user-facing strings exist in **both** `en` and `pt`.
7. **AC7** — Replay/step is unaffected: `deriveView(events, cursor)` and the canvas projection are
   unchanged; the hop detail reflects the data present up to the current cursor (reads the same
   `events` the rest of the Inspector reads).

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Pure projection.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (hops, not stations).

## Open questions (clarify before planning)

- [x] Where does the detail open? → **Inspector**, like a station.
- [x] How rich? → **Theory + real run data** that traversed the hop.
- [x] The edge ⊕ box chain? → **Move it into the (public-ingress) hop detail**; simplify the inline box.

## Out of scope / deferred

- A pinned-popover variant on the edge itself (we chose the Inspector).
- Per-hop bespoke "why this hop" essays (reuse the existing `detail` line for now).
- Rich real data for every minor hop (backend→agent, ingestion→rag, agent→pageindex,
  agent→sub-agents) beyond an honest summary/empty-state — each can deepen in a later spec.
