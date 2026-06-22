# Spec: Hop detail enrichment (per-hop "why" + nginx role + visible expand affordance)

| | |
|---|---|
| **ID** | 086-hop-detail-enrichment |
| **Status** | draft → clarified → planned → in-progress → **done** |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

## Problem / motivation

085 made every arrow clickable → a hop detail in the Inspector. On review two gaps surfaced:

1. The arrows' **theory is thin** — protocol + a one-line detail + controls, but not *why* the
   communication is shaped this way (why mTLS, why a private endpoint, what the role is). The honest
   "Nothing crossed this hop on this run" run-data state is correct, but the static explanation is
   shallow — which undercuts the educational point.
2. The **`frontend→backend` (edge) detail** shows the request went through nginx but never says
   nginx **is a reverse proxy**, what that role does, or that a reverse proxy can do more than
   proxying (TLS termination, load balancing, caching, gzip, rate-limiting, static serving, routing).
3. There is **no visible affordance** that an arrow is clickable — users don't discover the network
   detail behind it.

## Goals

- Each network hop carries a bilingual **`why`** explainer (role + reasoning), rendered in the hop
  detail under the theory.
- The edge hop's `why` explicitly frames **nginx as a reverse proxy** and lists what it does here +
  what a reverse proxy can also do.
- Every edge on the canvas shows a **visible "expand" affordance** (a ⊕ on the label) that opens the
  hop detail, so the network info is discoverable.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent`, no station/tier/hop added — pure content + a UI affordance.
- No backend change.
- Not changing the run-data ("On this run") logic from 085 — only adding the static `why`.

## User-facing behavior

- Clicking an arrow (or its new ⊕ button) opens the hop detail; below the protocol/detail/controls a
  **"Why this hop"** paragraph explains the role and reasoning.
- The `frontend→backend` hop's `why` explains the reverse proxy (nginx) role + extras.
- Each edge label shows a small, always-visible ⊕ icon (emphasised on hover/selected) titled
  "Network details" — clicking it selects the hop.
- All new prose ships in **en + pt**.

## Acceptance criteria

1. **AC1** — Every network hop in `stations.ts` has a non-empty bilingual `why`; the hop detail
   renders it (a "Why this hop" section) when present.
2. **AC2** — The `frontend→backend` hop's `why` (en + pt) mentions a reverse proxy and at least the
   TLS-termination + load-balancing roles, and notes a reverse proxy can do more (e.g. cache / rate
   limit / static).
3. **AC3** — Each edge renders a visible ⊕ expand control on its label; activating it calls
   `selectHop(edgeId)` (opening the hop detail). It has a bilingual title/aria-label.
4. **AC4** — No protocol change: `schemas.py` / `events.ts` untouched, no new `Stage`; the
   `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity + schema-mirror tests stay green.
5. **AC5** — All new user-facing strings exist in **both** `en` and `pt`.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `events.ts`: **n/a**.
- Station mapping: **n/a** (hops).

## Open questions (clarify before planning)

- [x] How far to enrich? → **All hops** + the nginx role.
- [x] Expand affordance? → **Always-visible ⊕** on the label (emphasised on hover/selected).

## Out of scope / deferred

- Per-segment tooltips on the edge chain pipeline.
- Real CDN/WAF/DNS/API-gateway nodes (each its own future spec under the Network track).
