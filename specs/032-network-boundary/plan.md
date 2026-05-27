# Plan: Public-internet boundary & flow direction polish

> Resolved: thin labeled dashed line · generic · reuse `reverse`/`stream` · min dwell.
> Three independent sub-features, shippable separately; the **public frontier is the
> primary deliverable**.

## Approach

**1. Public frontier (primary).** Add a `PUBLIC_BOUNDARY_SRC` to `stations.ts` — a
boundary-like element with a bilingual `label` and a `generic` role, **without** cloud
resolution (the label is the same in every cloud). In `layout.ts`, compute its geometry
in the gap between the client tier's right edge and the private boundary's left edge
(today: client box ends ~x280, private boundary starts x298 → a vertical frontier at
~x≈289 spanning the boundary's y-extent). Render it in `FlowCanvas` as a dashed vertical
line + a small rotated/positioned "Public internet / egress" label (a lightweight variant
of `BoundaryNode`, or a dedicated `PublicFrontierNode`). It is non-interactive,
`pointerEvents: none`, behind the stations.

**2. Return-leg distinctness (refinement — partly present).** `FlowEdge` already draws
the SSE return (`stream`) as a dashed magenta line with a reverse packet, and `deriveView`
marks return legs `reverse: true`. Extract the stroke/dash decision into a small pure
helper (`returnStyleFor(active, reverse, stream)`) so it's unit-testable, and extend it so
an **active reverse** (internal `respond` legs) also reads as a return (dashed/return
stroke), not just a moving packet.

**3. Persistence dwell (refinement).** Ensure a run ending in `db.write` keeps the
`database` station emphasized at the final cursor (it already is the last `activeStation`;
add a test to pin it) and give `db.write` a non-zero dwell in the live ticker
(`pacing.ts`) so it doesn't zip past during live streaming.

Alternative considered: a filled public zone box. Rejected (clutter) per the resolved
open question.

## Affected files

**Frontend**
- `frontend/src/lib/stations.ts` — `PUBLIC_BOUNDARY_SRC` (bilingual label, generic, no
  `clouds`); a `publicBoundaryFor(lang)` resolver (no `cloudValue`).
- `frontend/src/lib/layout.ts` — compute the public-frontier `Box`/line geometry between
  the client column and the private boundary; add it to `LayoutResult`.
- `frontend/src/components/FlowCanvas.tsx` — render the frontier node (dashed line +
  label); insert behind stations.
- `frontend/src/components/nodes/BoundaryNode.tsx` (or new `PublicFrontierNode.tsx`) — the
  dashed-line + label presentation.
- `frontend/src/components/edges/FlowEdge.tsx` — extract `returnStyleFor(...)`; apply the
  return style on active reverse legs.
- `frontend/src/lib/derive.ts` — (only if needed) confirm/raise the `db.write` end stays
  the emphasized station at run end.
- `frontend/src/lib/pacing.ts` — a non-zero dwell for `db.write` in the live ticker.
- `frontend/src/i18n/strings.ts` — frontier label (en + pt).
- Tests: `layout.test.ts`, `derive.test.ts`, a small `flowEdge`/`returnStyle` test,
  `strings.test.ts`.

**Backend** — none.

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent`; `STAGE_TO_STATION`/`STAGE_TO_PHASE` untouched. The
  frontier is a boundary, not a station — `visibleStationIdsFor`/today's-stations guard
  unchanged.

## Data model changes

- None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| public frontier label | Public internet / egress | Internet pública / egress |

(`generic` role text, if surfaced anywhere, mirrors the label.)

## Cloud map (constitution §5)

- **n/a — generic only.** The frontier is not cloud-resolved (resolved open question); it
  carries no `clouds` map, so the cloud toggle never changes its label.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | layout exposes a frontier between client right edge and private box left edge, no overlap, all scenarios | `frontend/src/lib/layout.test.ts` |
| AC2 | resolved label identical across generic/azure/aws/gcp (no `cloudValue`) | `stations.test.ts` |
| AC3 | `returnStyleFor` returns a distinct style for active `reverse`/`stream`; derive marks return legs reverse | `flowEdge`/`returnStyle` test + `derive.test.ts` |
| AC4 | run ending in `db.write` → `database` emphasized at final cursor; pacing dwell > 0 | `derive.test.ts` + `pacing.test.ts` |
| AC5 | frontier label en/pt parity | `strings.test.ts` |
| AC6 | parity tests + `tsc` green; `visibleStationIdsFor("simple")` unchanged | existing suites |

## Risks / trade-offs

- **Canvas crowding** — keep the frontier subtle (a single dashed line + small label), not
  a competing box; verify it doesn't collide with the private boundary at x≈298.
- **Return style vs existing stream style** — don't double-style the SSE leg; the helper
  must keep the current `stream` look and only add the internal-reverse case.
- **Dwell vs replay** — keep the dwell in the live ticker (`pacing.ts`) and/or as an
  end-of-run emphasis; don't make `deriveView` time-dependent (it must stay a pure
  function of events + cursor).
