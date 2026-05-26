# Plan: Timeline navigable by phase

> The HOW for `spec.md` (status `done`). Respects `.specify/constitution.md`.
> Frontend-only; no protocol or backend change.

## Approach

Introduce a small **pure phase module** that mirrors the shape of the existing
station model: a `TimelinePhase` union, a `STAGE_TO_PHASE` map (exhaustive over
`Stage`), and two pure deriver functions — `phaseMarkers(events)` and
`activePhase(events, cursor)`. `Timeline.tsx` consumes them to render a labeled,
clickable phase rail and reuses the store's existing `setCursor` for
jump-to-phase. No change to `deriveView` (canvas projection is independent), no
backend, no protocol.

*Alternative considered:* deriving phases by time-bucketing the trace timestamps
— rejected; stage→phase is deterministic and survives variable latencies, and
keeps the "pure projection of the event log" property (§7).

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/phases.ts` *(new)* — `TimelinePhase`, `STAGE_TO_PHASE`,
  `PHASE_ORDER`, `phaseMarkers(events)`, `activePhase(events, cursor)`,
  `phaseLabelsFor(lang)` (cached per language).
- `frontend/src/components/Timeline.tsx` — render the phase rail from
  `phaseMarkers`; mark the `activePhase` chip; `onClick → setCursor(index)`.
  (Decide per Q4 whether to keep the fine ticks.)
- `frontend/src/i18n/strings.ts` — `timeline.phases: Record<TimelinePhase,string>`
  (en + pt).
- `frontend/src/lib/phases.test.ts` *(new)* — the AC tests.

## Protocol changes (constitution §1)

None. `STAGE_TO_PHASE` is a frontend grouping over the existing `Stage` enum and
does not touch `schemas.py`, `events.ts`, `deriveView`, or `STAGE_TO_STATION`.
Note: "timeline phase" is distinct from the protocol `Phase` (START/PROGRESS/END).

## Data model changes

None.

## i18n strings (constitution §4)

Phase labels (final set pending Q1). All en **and** pt.

| key / location | en | pt |
|---|---|---|
| `timeline.phases.request` | Request | Requisição |
| `timeline.phases.memory` | Memory | Memória |
| `timeline.phases.route` | Route | Roteamento |
| `timeline.phases.retrieve` | Retrieve | Recuperação |
| `timeline.phases.reason` | Reason | Raciocínio |
| `timeline.phases.tools` | Tools | Ferramentas |
| `timeline.phases.generate` | Generate | Geração |
| `timeline.phases.respond` | Respond | Resposta |
| `timeline.phases.persist` | Persist | Persistência |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Pure logic in `phases.ts`, tested with Vitest (no rendering needed).

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | every `Stage` maps to exactly one phase; coverage is exhaustive | `frontend/src/lib/phases.test.ts` |
| AC2 | `phaseMarkers` returns occurring phases in run order with the first-event index | `phases.test.ts` |
| AC3 | clicking a marker calls `setCursor(index)` (store action; unit-testable via the marker→index value) | `phases.test.ts` |
| AC4 | `activePhase(events, cursor)` returns the phase at the cursor | `phases.test.ts` |
| AC5 | every `TimelinePhase` has en + pt labels | `phases.test.ts` |
| AC6 | derivers are pure (no fetch); `deriveView`/protocol untouched (assert imports/shape) | `phases.test.ts` |

The rendered rail itself is guarded by `tsc --noEmit` + `npm run build` and
verified manually (no RTL in the repo today).

## Risks / trade-offs

- **ReAct repeats** (Q3): collapsing to first-occurrence is simplest but hides
  loop iterations; the canvas/agent-detail already show iteration count, so the
  rail can stay collapsed.
- **Layout**: the phase rail competes for horizontal space with the controls on
  narrow screens; chips may need to wrap or abbreviate.
- Keeping `STAGE_TO_PHASE` separate from `STAGE_TO_STATION` means **two**
  exhaustive maps to maintain when a `Stage` is added — call this out in the
  station/Stage checklist so a future stage gets both.
