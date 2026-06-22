# Spec: Network edge (real reverse proxy / LB / TLS) — expandable box

| | |
|---|---|
| **ID** | 084-network-edge |
| **Status** | draft → clarified → planned → in-progress → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-21 |

> **Revision (2026-06-22) — the standalone Network Edge node was removed.** On review the
> user did not want the edge rendered as its own tier/station box. Following
> [`085-hop-communication-detail`](../085-hop-communication-detail/spec.md) (which put hop detail
> on the arrows), the edge was **folded into the `frontend→backend` hop**: the StationId `edge`,
> the `edge` tier, the edge station, and the `frontend→edge`/`edge→backend` hops were deleted; the
> `edge` `Stage` now **maps to the `backend` station**, and the chain + forwarded headers render in
> the `frontend→backend` hop detail. Everything else below still holds — the proxy is real, the
> stage is emitted from forwarded headers, and the chain renders on the `frontend→backend` hop.
>
> **Revision 2 (2026-06-22) — edge is always-on, not a toggle.** The user did not want the edge in
> the Build popover either. So `edge` was **removed as a Build component** (no `ComponentId`, no
> palette entry, FE no longer sends it) and `ChatRequest.edge` **defaults `True`** — the edge is
> always-on platform behaviour now (set `edge=False` to opt out). `proxied=false` keeps it honest
> with no proxy in front. The AC text below describing a visible node/tier **and** an opt-in default
> is superseded by these revisions.

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

Today the request goes **straight from the client (Presentation tier) to the backend
(Application tier)** in a single hop. A real production app never exposes the app server
directly: every request first crosses a **network edge** — DNS → CDN → WAF → TLS termination
/ load balancer (reverse proxy) → API gateway — before it reaches application code.

The simulator's strongest, most differentiated axis is its **honest network model** (public/
private zones, `controls` on hops, the VNet/VPC boundary), yet the edge — the most visible
piece of production networking — is missing. Adding it closes the biggest *"this isn't really
production"* gap on the **networking** axis, and it can be done **honestly** (constitution §3):
a real reverse proxy runs in `docker-compose` and the request genuinely traverses it; the
backend reports only the **evidence** the proxy injects (forwarded headers), exactly like the
`mcp-stdio` vs `local-fallback` honesty seam already in the project.

## Goals

- A **"Network Edge" box** on the canvas, between client and backend, collapsed by default and
  **expandable inline (⊕)** to reveal the production edge chain.
- The **reverse-proxy / TLS / load-balancer** part is **real**: `nginx` runs in front of the
  backend in `docker-compose`, terminates TLS, load-balances, and injects forwarded headers; the
  backend emits a real `edge` stage populated from those headers.
- **Honest degradation**: with no proxy in front (e.g. `uvicorn` direct in dev), the edge stage
  still fires but reports `proxied=false` and fabricates nothing — it labels itself "direct
  access".
- The parts that **cannot** run on a laptop (DNS, CDN, WAF, API gateway) render as clearly
  labelled **preview** segments inside the expanded box — they never fake a run.
- The edge is an **optional component** in the 061 Build popover, **default-on**, so the UI shows
  it by default while a bare API call (`edge` omitted) stays byte-for-byte with today.

## Non-goals

- Making CDN / WAF / DNS / API-gateway **execute** (they stay preview; each is a future spec).
- Real WAF rules, real CDN caching, real DNS resolution, or rate-limiting (rate-limit/auth is the
  separate roadmap seam).
- Promoting the preview sub-nodes to their own `stations`/`Stage`s (deferred — see below).
- Multi-replica load-balancing semantics (constitution §7 single-instance still holds; the LB is
  real but fronts one backend).

## User-facing behavior

- A new **Network Edge** station sits between the client and the backend. Collapsed it shows a
  compact tag (e.g. `nginx · TLS · LB`). Its **⊕** expands it inline to the chain
  **DNS → CDN → WAF → TLS / Load Balancer → API Gateway → Backend**.
- The **TLS / Load Balancer** segment is driven by **real data** from the current run (whether the
  request was proxied, the scheme `http`/`https`, the proxy identity, the forwarded client IP, the
  request id). The **DNS / CDN / WAF / API Gateway** segments are visibly marked **preview**.
- Hovering the new hops (client → edge, edge → backend) shows protocol + zone + controls like every
  other hop.
- In the **Build** popover the edge appears as a toggle (default-on); turning it off removes the box
  and stops sending `edge`, reproducing today's topology.
- The edge node appears in the **Inspector** (theory) and contributes a readout on the canvas tile.
- All new prose ships in **en + pt**; the tier/station carries a filled `clouds` map.

## Acceptance criteria

1. **AC1** — Given a chat request with `edge=true` whose HTTP request carries `X-Forwarded-For`,
   `X-Forwarded-Proto: https`, and `X-Request-Id`, when the turn runs, then the backend emits
   exactly one `edge` END event (a single observation, like `frontend`) ordered **before** the
   `backend` START event, whose `data` has `proxied=true`, `tls=true`, and `client_ip` /
   `request_id` equal to the header values (no fabricated fields). Because it fires before the agent
   boots, this is asserted **keyless** over SSE.
2. **AC2** — Given the same request with **no** forwarded headers (direct access), the `edge` event
   still fires with `proxied=false`, `tls=false`, `client_ip` falling back to the socket peer, and
   a label/readout that honestly says "direct" — it invents no proxy identity.
3. **AC3** — Given `edge=false` (or omitted), then **no** `edge` stage is emitted and every other
   stage's order and data are byte-for-byte identical to today (additive, opt-in protocol change).
4. **AC4** — `Stage.EDGE` exists in **both** `backend/app/schemas.py` and
   `frontend/src/types/events.ts` (protocol mirror, §1), and `ChatRequest.edge: bool` exists with
   default `False`.
5. **AC5** — `Stage.EDGE` is mapped to exactly one station (`edge`) in `STAGE_TO_STATION`, assigned
   a `TimelinePhase` in `STAGE_TO_PHASE`, and the existing exhaustiveness tests (e.g. the
   `phases.test.ts` parity check, the `Record<Stage, …>` maps) still compile and pass.
6. **AC6** — `visibleStationsFor` includes the `edge` station when `edge` is in the selection and
   excludes it otherwise; with the edge visible the **direct client→backend hop is absent** and the
   hops **client→edge** and **edge→backend** are present, each with a `zone` and a protocol
   (client→edge is `public` / `https`).
7. **AC7** — Collapsed, the edge station renders a compact tag; expanded (⊕) it renders the chain
   with the **TLS/LB** segment bound to the run's edge data and **DNS/CDN/WAF/API-Gateway** segments
   flagged as preview (a `comingSoon`-style marker), and a `case "edge"` exists in both `readoutFor`
   (FlowCanvas) and `renderDetail` (InspectorPanel) so the `StationId` switches stay exhaustive.
8. **AC8** — The edge tier and station carry a filled `clouds` map (`azure`/`aws`/`gcp`, §5) and
   every new user-facing string is present in **both** `en` and `pt` (§4) — asserted structurally.
9. **AC9** — `docker-compose` defines an `nginx` reverse-proxy service in front of the backend that
   injects the forwarded headers and proxies to it; a `nginx.conf` exists and the frontend's
   `VITE_API_BASE` targets the proxy. (Verified by config presence + a backend unit test of the
   header-parsing helper, since CI cannot stand up the full compose stack — see plan test strategy.)

## Protocol / stage impact

- New/changed `Stage`(s): **`EDGE = "edge"`** (one new stage, fires between `FRONTEND` and
  `BACKEND` when `edge=true`).
- New `ChatRequest` field: **`edge: bool = False`** (request-only input, like `rerank`/`hybrid`).
- Mirror in `frontend/src/types/events.ts`: **required** (`Stage` union + the request payload type).
- Station it maps to in `stations.ts`: **`edge`** (new station in a new **`edgeTier`**).

## Open questions (clarify before planning)

- [x] How real? → **Hybrid**: nginx reverse-proxy/LB/TLS real + header-evidenced; CDN/WAF/DNS preview.
- [x] Which reverse proxy? → **nginx**.
- [x] Expand UX? → **⊕ inline** (compact internals), reusing the `StationNode` pattern.
- [x] Default visibility? → optional Build component, **default-on**; `ChatRequest.edge` defaults
  `False` so API-direct stays byte-for-byte.

## Out of scope / deferred

- **CDN / WAF / DNS / API-gateway as real stations + their own `Stage`s** — each graduates from a
  preview segment to its own node in a later spec (network track in the roadmap).
- A **full-view overlay** for the edge (like `AgentDetail`/`RagDetail`) — start with ⊕ inline; add a
  drill-in later if the chain detail warrants it.
- Re-capturing the **GitHub Pages demo fixtures (058)** to include `edge` events — tracked as the
  standing demo-recapture directive; old fixtures simply show no edge activity (graceful fallback).
- A new **`network` track** in the roadmap matrix to home this and the deferred edge nodes.
