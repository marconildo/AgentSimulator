# Spec: Public-internet boundary & flow direction polish

| | |
|---|---|
| **ID** | 032-network-boundary |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Open questions resolved during clarify (2026-05-27): public frontier drawn as a
> **thin labeled dashed line**, **generic** (no per-cloud label); return cue reuses the
> existing `reverse`/`stream` data; persistence emphasis via a minimum dwell.

## Problem / motivation

The canvas already draws the **private network** (VNet/VPC) as a boundary behind the
tiers — a strong teaching device. But the *other* half of the most important network
concept is invisible: the **public-internet / egress** frontier between the public client
tier and everything private. Today that split is implied only by the "HTTPS · TLS" edge
label. Drawing the public frontier explicitly makes the single most important network
idea — *what is exposed vs what is not* — legible at a glance.

Two smaller flow-direction touches sharpen the request lifecycle. (Both are **partly
present already** and this spec only strengthens them — stated honestly so we don't
re-build what exists):

- The **streaming return** on the frontend↔backend leg already renders as a dashed
  magenta line with a reverse-running packet (`stream` in `FlowEdge`); the **internal**
  return legs (`respond` walking agent→backend→frontend) animate a reverse packet but
  have no persistent "this is the return" cue. We make the active **return** legible
  beyond the transient packet.
- The **persistence** (`db.write`, the last stage) emphasis is so brief at the end of a
  run that a learner misses it; we give it a minimum dwell.

## Goals

- Draw an explicit **public-internet / egress** frontier — a **thin, labeled, dashed
  line** — between the client tier and the private-network boundary, so the learner sees
  two zones: public edge vs private interior.
- Keep the frontier **generic** (cloud-agnostic): its label does not change with the
  active cloud provider (edge controls like WAF/Front Door/CloudFront/Cloud Armor already
  live on the client tier and the frontend→backend hop, so we don't duplicate them here).
- Make an **active return** leg visually distinct (a return/dashed cue derived from the
  existing `reverse`/`stream` flags), reinforcing "sync request, async streamed response."
- Give the **persistence** (`db.write`) emphasis a **minimum dwell** so it's noticed.
- All new text ships in **English and Portuguese** (constitution §4).
- Pure presentation: no protocol/stage change; the projection already knows hop direction
  (`reverse`), streaming, and the active station — this consumes that, it adds nothing.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent`, **no new station/hop/tier**. The public frontier is
  a drawn **boundary** (like the private `BOUNDARY_SRC`), not a station — so
  `visibleStationIdsFor` and the "today's stations" guard are **unchanged**.
- Not reworking the edge-animation system; we reuse `FlowEdge`'s existing `reverse`/
  `stream` handling.
- Not adding per-cloud names to the frontier (resolved: generic).
- Not animating failures/retries (that's 017).

## User-facing behavior

- A labeled **"Public internet / egress"** dashed line sits in the gap between the client
  tier (left column) and the private-network boundary box — visually echoing the VNet/VPC
  perimeter so the two zones read at a glance. The label stays the same in every cloud.
- On an active **return** leg, the edge reads as a return (e.g. dashed / reverse-styled
  stroke while the reverse packet runs), distinct from the outbound request. In batch
  mode (no SSE return) the outbound stays a plain request.
- After a run completes, the **persist** step's emphasis lingers briefly (a minimum dwell)
  rather than vanishing on the next cursor tick.

All new prose in **en + pt**.

## Acceptance criteria

> Front-end; assert on layout/derivation/style-selection, not pixels.

1. **AC1 — Public frontier in the layout.** `computeLayout` exposes a public-frontier
   geometry positioned **between** the client tier's right edge and the private
   boundary's left edge, spanning the boundary's vertical extent; it does not overlap the
   private boundary box or the client tier box. It exists in every scenario.
2. **AC2 — Frontier label is bilingual and cloud-generic.** The frontier renders a label
   from `{ en, pt }`; the rendered label is identical for `generic`, `azure`, `aws` and
   `gcp` (no `cloudValue` provider resolution on this element).
3. **AC3 — Active return leg is distinct.** The edge style-selection for an active hop
   with `reverse === true` (or `stream === true`) yields a distinct "return" style versus
   a plain outbound request; the derived edge data continues to carry `reverse`/`stream`
   correctly for the `respond`/SSE legs.
4. **AC4 — Persistence emphasis dwells.** For a run ending in `db.write`, at the final
   cursor the projection emphasizes the `database` station (it is the `activeStation` /
   emphasized at run end), i.e. the persist is not cleared the instant the event passes;
   the live ticker gives `db.write` a non-zero dwell.
5. **AC5 — Bilingual (§4).** The frontier label has en + pt parity, non-empty.
6. **AC6 — No protocol/visual-model drift.** No `Stage`/protocol change; `deriveView` and
   the `STAGE_TO_STATION`/`STAGE_TO_PHASE` parity tests are unchanged; `tsc` build green;
   `visibleStationIdsFor("simple")` and the today's-stations guard are **unchanged** (the
   frontier is a boundary, not a station).

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- `stations.ts`: a new **boundary** (`PUBLIC_BOUNDARY_SRC`, generic, bilingual label, no
  cloud resolution) analogous to `BOUNDARY_SRC`; geometry added to `layout.ts`. No
  station/hop/tier added.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Filled zone vs line?** → **Thin labeled dashed line** (a labeled vertical
  frontier between the columns), to avoid clutter on an already-dense canvas.
- [x] **Per-cloud or generic label?** → **Generic** ("Public internet / egress"); edge
  controls already appear on the client tier and the frontend→backend hop.
- [x] **Return cue: reuse `reverse` or add new?** → **Reuse** the existing `reverse`/
  `stream` data in `FlowEdge`; add a distinct return *style*, not new projection state.
  Batch mode shows no SSE return (unchanged).
- [x] **Persistence dwell: linger vs pulse?** → A **minimum dwell** (the persist stays
  emphasized at run end + a non-zero live-ticker dwell), the simplest deterministic
  approach; no new pulse animation needed.

## Out of scope / deferred

- A full filled public zone (rejected for clutter).
- Reworking the edge-animation engine.
- Per-hop "controls running here" callouts (the hop tooltip already covers controls).
