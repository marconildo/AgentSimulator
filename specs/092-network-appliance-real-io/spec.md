# Spec: Network appliance drill-in — real IN (the request that entered), not prose

| | |
|---|---|
| **ID** | 092-network-appliance-real-io |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-23 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

After 091 the appliance drill-ins show rich **OUT** evidence, but the **IN**
section is still a generic *description* instead of the **real input**:

- DNS IN reads "A service name to resolve." (the actual host, `backend`, is buried
  in a row) — the input *is* the hostname, so it should lead.
- CDN / WAF / TLS-LB / API-GW IN all read generic prose ("The raw request to
  inspect.", "The routed API call.") — none shows the **actual request** that
  traversed the appliance.

The user's point: each box should show **what really entered, how it processed,
and what came out** — so you can study the real flow, not a caption. The real
inbound request (`POST /api/chat` + the user's message + the request body) is
**already in the trace** (the `frontend` event), so we can show it honestly without
any backend change.

## Goals

- Replace the generic IN prose with the **real inbound request** in each appliance
  drill-in, derived purely from the existing trace (`frontend` event / request body).
- For DNS, lead with the **real hostname queried** (the actual input to a resolver),
  not a generic sentence.
- Keep the 091 OUT evidence, reconstructed log and verbatim headers intact; keep the
  honest empty state and the pure-projection / step-replay contract.
- No new `Stage`/`Phase`/`TraceEvent`, no backend change, no new request field.

## Non-goals

- Capturing the **WAF 403 block** in the visualization. A blocked request returns
  403 at the edge and **never reaches the backend**, so there is no trace for it —
  surfacing it needs the edge to report the block and the FE to handle a chain-level
  rejection. Deferred to its own spec (see Out of scope).
- Showing per-appliance request *mutations* that aren't in the trace (e.g. the exact
  bytes HAProxy re-wrote) — we show the real request + each appliance's real OUT
  evidence, not a fabricated diff.
- Any backend / infra / protocol change.

## User-facing behavior

Opening "Open full view" on an ingress appliance shows, top to bottom:

1. **What it did** — the role (unchanged).
2. **In** — the **real input**:
   - DNS → the hostname queried (`backend`), as the headline value.
   - CDN / WAF / TLS-LB / API-GW → the real request line (`POST /api/chat`) and the
     user's message (truncated), from the trace.
3. **Out** — the appliance's real evidence (unchanged from 091).
4. **Access log (reconstructed)** + **Forwarded headers (verbatim)** — unchanged.

All new/changed labels ship in **en + pt**.

## Acceptance criteria

1. **AC1 — real request as IN (HTTP appliances)** — For `cdn`/`waf`/`lb`/`apigw`,
   given a trace whose `frontend` event carries a message + request body, the IN
   section renders the real request line (`POST /api/chat`) and the user's message —
   not the old generic sentence.
2. **AC2 — hostname as IN (DNS)** — The DNS IN leads with the real host queried
   (e.g. `backend`) as its primary value, with no generic descriptive sentence as
   the main content.
3. **AC3 — pure projection** — The IN is derived only from existing trace events
   (the `frontend` event / request body); no new `Stage`, no new event field, no
   fetch. It respects the cursor (step/replay safe).
4. **AC4 — honest empty/partial** — When the appliance isn't seen, or no request is
   present yet at the cursor, the IN shows the honest empty/placeholder state and
   fabricates nothing.
5. **AC5 — OUT + log + headers unchanged** — The 091 OUT rows, reconstructed log
   and verbatim headers still render exactly as before.
6. **AC6 — bilingual + default unchanged** — Every new/changed label exists in en +
   pt; with `network` off nothing about the canvas changes.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a** (reuses existing `frontend`
  event data).
- Station mapping in `stations.ts`: unchanged.

## Open questions (clarify before planning)

- (resolved) Include the WAF 403 capture? → **No**, deferred to its own spec (a
  blocked request leaves no backend trace; it's a separate, heavier mechanism).
- How much of the request body to show in IN? → the request line + the message
  (truncated); a couple of key request fields (e.g. `top_k`, `model`) are optional —
  decide in the plan, keep it compact.

## Out of scope / deferred

- **WAF 403 block visualization** — its own future spec: the edge must report the
  rejection (the request never reaches the backend/trace), and the FE must render a
  chain-level "blocked at the WAF" state. Tied to the user's "examples that get
  blocked" exploration.
- A live container log tail (091 already settled this as a reconstructed line).
