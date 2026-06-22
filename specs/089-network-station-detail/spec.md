# Spec: Network-edge station full-view drill-ins

| | |
|---|---|
| **ID** | 089-network-station-detail |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The 088-network-layer chain renders five real ingress appliances as canvas
boxes — DNS, CDN / Cache, WAF, TLS / Load Balancer, API Gateway — each of which
already emits a real per-run `data` payload (forwarded-header evidence). But the
only way to read that payload today is a cramped raw-JSON dump inside the right-
hand **Inspector** (`renderDetail`'s `forwardedEvidence` case). That panel is
narrow, theory-first, and easy to miss; the user asked "what actually happened
in each box — what went **in** and what came **out**" and could not see it
clearly.

Every other *real* station (Frontend, Backend, App DB, MCP, Agent, LLM, RAG,
Ingestion) already has an **"Open full view"** floating overlay (the `RagDetail`
pattern via `DetailShell`) that shows the real per-run data in a wide, legible
box while the Inspector keeps the general theory. The network-edge boxes are the
last real stations *without* one. This closes that gap so the ingress chain is
as inspectable as the rest of the pipeline.

A secondary motivation: the user asked "where is the reverse proxy?". There is
no box literally named "Reverse Proxy" — the reverse-proxy *function* lives in
**TLS / Load Balancer** (HAProxy terminates TLS and forwards to the upstream)
and in the always-on `edge` nginx (folded into the Backend station, shown on the
`frontend→backend` hop). The TLS/LB full-view should make that role explicit so
the question answers itself.

## Goals

- Each of the five network-edge stations (`dns`, `cdn`, `waf`, `lb`, `apigw`)
  gets an **"Open full view"** floating overlay, opened the same way as RAG /
  Backend / Frontend (a button on the node → a `DetailShell` overlay).
- Each overlay presents the appliance's real per-run data as a legible
  **In → Out** story (what the appliance received vs. what it produced /
  forwarded), not a raw JSON blob — plus the verbatim forwarded headers kept
  available for honesty.
- The **Inspector keeps its general/theory explanation** unchanged for these
  stations (role, controls, the chain on the hops). The floating box is purely
  the per-run data view.
- The TLS / Load Balancer overlay explicitly names its **reverse-proxy** role
  (terminate TLS · forward to upstream), answering "where is the reverse proxy?"
- Honest empty / "not in front" states: when the chain is not running ahead of
  the request (`seen: false`, mirroring `edge`'s `proxied: false`), the overlay
  says so plainly rather than faking data.

## Non-goals

- **No new "Reverse Proxy" box / station / Stage.** (User decision: explain
  where it is, don't add a node.)
- **No protocol change.** No new `Stage`, `Phase`, or `TraceEvent` shape — the
  five stages and their `data` payloads already exist from 088.
- **No backend change.** Pure frontend projection of the existing trace.
- Not changing the canvas geometry, the hop details (085/086), or the Inspector
  theory text for these stations.
- Not changing how/when the network chain executes (the `NETWORK_CHAIN` env gate,
  the `network` request flag) — only how its already-emitted data is displayed.

## User-facing behavior

- On each network-edge node (DNS, CDN/Cache, WAF, TLS/Load Balancer, API
  Gateway) an **"Open full view"** button appears (same affordance, same place
  as the other real stations), and is a toggle (second click closes).
- Clicking it opens a wide floating overlay (the `DetailShell` look: backdrop,
  back button, station icon + title) over the canvas — **not** the Inspector.
- The overlay shows, for the current turn:
  - a one-line summary of what the appliance did to this request;
  - an **In → Out** breakdown built from the appliance's typed fields
    (e.g. DNS: host → resolved address + TTL; CDN: cache HIT/MISS · age ·
    server; WAF: status clean/blocked · rules · anomaly score · engine;
    TLS/LB: TLS version · scheme · upstream · server, **labelled as the
    reverse proxy**; API GW: route · rate-limit remaining · upstream latency ·
    gateway);
  - the verbatim forwarded-header evidence (the raw `data`) still available.
- If the appliance did not run in front of this request (`seen: false`, or no
  event yet at the cursor), the overlay shows an honest empty/"direct access —
  no {appliance} in front" message.
- The Inspector, when one of these stations is selected, is **unchanged** —
  still shows the role/why/tech/hops theory.
- All new prose ships in **en + pt** (constitution §4).
- Works identically under live streaming, **step**, and **replay** (the overlay
  reads only the visible cursor slice, like every other drill-in).

## Acceptance criteria

1. **AC1** — Given a turn whose trace contains a `dns` END event with
   `seen: true`, when the DNS "Open full view" overlay is open, then it renders
   the resolved host, address and TTL from that event's `data` (not raw JSON
   only), and is not the empty state.
2. **AC2** — Same as AC1 for `cdn` (cache HIT/MISS, age, server), `waf`
   (status, rules, anomaly score, engine), `lb` (TLS version, scheme, upstream,
   server) and `apigw` (route, rate-limit remaining, upstream latency, gateway):
   each overlay renders that appliance's typed fields.
3. **AC3** — Given a `dns`/`cdn`/`waf`/`lb`/`apigw` event with `seen: false`
   (or no event at the cursor), the corresponding overlay shows its honest
   empty / "not in front" state and does **not** fabricate values.
4. **AC4** — Each of the five network nodes renders an "Open full view" button;
   clicking it opens the matching overlay (store `detail` becomes that station
   id) and a second click closes it (toggle), exactly like the existing real
   stations.
5. **AC5** — The TLS / Load Balancer overlay contains text identifying it as the
   **reverse proxy** (terminate TLS · forward to upstream / reverse proxy),
   present in both en and pt.
6. **AC6** — Selecting a network station still renders the Inspector's theory
   view (role / why / tech / hops); the full-view overlay is an addition, not a
   replacement (the Inspector behavior for these stations is unchanged).
7. **AC7** — Every new user-facing string exists in both `en` and `pt`
   (constitution §4); `tsc --noEmit` stays clean (the five overlays are wired
   into the exhaustive `detail` render in `App.tsx`).
8. **AC8** — The overlays read only the cursor-bounded visible slice, so
   stepping/replaying to a cursor *before* an appliance's event shows that
   overlay's empty state (no leakage from later events).

## Protocol / stage impact

- New/changed `Stage`(s): **none** (reuses 088's `dns`/`cdn`/`waf`/`lb`/`apigw`).
- Mirror in `frontend/src/types/events.ts`: **n/a** (the `DnsData`/`CdnData`/
  `WafData`/`LbData`/`ApiGwData` interfaces already exist).
- Station it maps to in `stations.ts`: **n/a** (stages already mapped to their
  same-named stations).

## Open questions (clarify before planning)

- [x] Add a dedicated Reverse Proxy box? → **No.** Explain the role in the
  TLS/LB overlay; keep the five boxes.
- [x] How is the overlay triggered? → **"Open full view"** button on the node,
  identical to RAG / Backend / Frontend (not a direct-click replacement of the
  Inspector).

## Out of scope / deferred

- A combined "whole ingress chain" walk-through overlay (one box that walks DNS
  → … → API GW in sequence, like the Ingestion phase-walk). Could be a future
  spec; here each appliance gets its own box, matching the canvas.
- Surfacing these per-appliance payloads on the `frontend→backend` hop detail
  beyond what 085/086 already show.
