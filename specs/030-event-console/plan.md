# Plan: Structured event console (expandable trace log)

> The HOW. Written after `spec.md` is `clarified`.

## Approach

A pure-projection front-end feature. Add a `lib/eventLog.ts` that maps the store's event
list (+ cursor) into console rows: `{ seq, relMs, stage, phase, label, station,
sizeBytes, latencyMs?, fromTo? }`. The component (`EventConsole`) reads `events` +
`cursor` from `useSimulator` (same source as `deriveView`), renders a collapsed control
near the footer status line, and expands into a scrollable list. Clicking a row seeks the
cursor (existing store action used by the timeline) and selects the owning station via
`STAGE_TO_STATION`. A per-row "explain" toggle reveals the drill-down + pretty-printed
`data`/`metrics`. Copy buttons hand JSON / trace id to a small clipboard helper.

Reuse, don't reinvent: relative time and the cursor model already exist (the timeline and
`chatStatus` consume the same data); `STAGE_TO_STATION` and `HOP_PAIRS` give station +
direction; `metrics.latency_ms` is already emitted by the stage emitter.

Alternative considered: a separate "logs" route/page. Rejected — the value is seeing the
log *next to* the canvas and playback, so it lives in the footer area.

## Affected files

**Frontend**
- `frontend/src/lib/eventLog.ts` *(new)* — pure projection: events + cursor → console
  rows + per-event drill-down; relative time, payload size, latency, from→to.
- `frontend/src/lib/eventLog.test.ts` *(new)* — AC1–AC4 unit tests over a fixture trace.
- `frontend/src/components/EventConsole.tsx` *(new)* — the expandable panel + rows +
  drill-down + copy buttons.
- `frontend/src/components/Timeline.tsx` / footer area (wherever `chatStatus` renders) —
  mount the console toggle alongside the one-line status.
- `frontend/src/lib/clipboard.ts` *(new or existing helper)* — `copyText(value)` seam so
  the copy actions are unit-testable.
- `frontend/src/store/useSimulator.ts` — reuse the existing cursor-seek action (no new
  state beyond a local `expanded` toggle, which can live in the component).
- `frontend/src/i18n/strings.ts` — console chrome (en + pt).

**Backend** — none.

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent` change; `STAGE_TO_STATION`/`STAGE_TO_PHASE`
  untouched. The console only *reads* the model.

## Data model changes

- None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `console.title` | Event log | Log de eventos |
| `console.expand` | Show log | Mostrar log |
| `console.collapse` | Hide log | Ocultar log |
| `console.explain` | Explain this event | Explicar este evento |
| `console.copyEvent` | Copy JSON | Copiar JSON |
| `console.copyTrace` | Copy full trace | Copiar trace completo |
| `console.copyId` | Copy request id | Copiar id da requisição |
| `console.size` | payload | payload |
| `console.latency` | latency | latência |
| `console.from` / `console.to` | from / to | de / para |

## Cloud map (constitution §5)

- n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | rows in `seq` order, relative time from first event | `frontend/src/lib/eventLog.test.ts` |
| AC2 | cursor → "current" row; never past cursor | `eventLog.test.ts` |
| AC3 | station via `STAGE_TO_STATION`, byte size, latency, from→to | `eventLog.test.ts` |
| AC4 | copy event/trace/id hand the exact value to the clipboard seam | `eventLog.test.ts` / component test |
| AC5 | collapsed by default, toggles | component render test |
| AC6 | strings parity (en/pt) | `frontend/src/i18n/strings.test.ts` |
| AC7 | `deriveView` + parity tests unchanged; `tsc` green | existing suites + `npm run build` |

## Risks / trade-offs

- **Long traces**: 100+ events — render the list virtualized or cap height with scroll;
  avoid re-deriving on every token (memoize on `events.length` + `cursor`).
- Clicking-to-seek must not fight live streaming — only allow seek when not actively
  streaming, or accept that seeking pauses the live cursor (match existing timeline
  behavior).
- Clipboard API needs a graceful fallback / a seam (`copyText`) so tests don't depend on
  the browser API.
