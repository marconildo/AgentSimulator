# Plan: Per-phase latency waterfall

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> Frontend-only; pure projection of existing event durations. No backend, no protocol,
> no new `Stage`. Builds on `004` (`STAGE_TO_PHASE`, `phaseMarkers`) and `007`
> (`formatLatency`).

## Approach

A new pure function `waterfallSegments(events)` (in `frontend/src/lib/waterfall.ts`)
folds the event log into an **ordered list of `{ phase, label, durationMs, offsetMs }`
segments**, one per contiguous phase occurrence (so a ReAct loop yields `reason` twice —
AC2), plus a final reconciling **`overhead`** segment. A `TimingPanel` renders the list
as proportional bars beside the phase rail in the Timeline.

**Timing model (the honest part — AC3).** Events carry `ts` (Unix seconds; normalize
with `toMs`) and per-END `latency_ms`. To avoid the nesting trap (the wrapping `backend`
stage's `latency_ms` ≈ the whole run, and `agent.think` may wrap `llm.prompt`):

- **Total = wall-clock span** = `toMs(lastEvent.ts) − toMs(firstEvent.ts)`.
- **Segments** are built from contiguous runs of `STAGE_TO_PHASE[stage]` in `seq` order
  (the same grouping `phaseMarkers` uses, but one entry **per occurrence**, not merged).
  Each segment's `offsetMs` = its first event's `ts` − run start; its `durationMs` =
  the span of that segment's own events (first START → last END within the run),
  cross-checked against the sum of that segment's leaf `latency_ms`.
- The **wrapping `backend` stage is excluded** from the bars (it is the envelope, not a
  phase) so the total is never double-counted.
- **Reconciliation:** `overhead = max(0, total − Σ segment durations)` → one
  `"overhead/transit"` bar. This keeps `Σ bars === total` (AC3) without inventing where
  the unattributed time went. If segments overlap (nesting) the remainder floors at 0.

*Alternatives considered:* (a) summing every END `latency_ms` as the total — rejected:
double-counts the `backend`/`agent.think` wrappers. (b) per-stage granularity — rejected
in clarify (noisier; phase reads cleaner). (c) live mid-stream waterfall — deferred;
this renders on a settled trace (the panel simply re-derives as the cursor advances, but
the lesson lands on a finished run).

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/waterfall.ts` *(new)* — `WaterfallSegment` type +
  `waterfallSegments(events): { segments: WaterfallSegment[]; totalMs: number }`. Pure;
  reuses `STAGE_TO_PHASE` and `toMs`.
- `frontend/src/lib/waterfall.test.ts` *(new)* — AC1–AC4 tests on hand-built event logs.
- `frontend/src/components/TimingPanel.tsx` *(new)* — the bar list (label · bar ·
  `formatLatency`), header, total, and the `overhead/transit` bar. Tokens only.
- `frontend/src/components/Timeline.tsx` — mount `TimingPanel` in the Timeline area
  (collapsible section beside/under the phase rail); reads `events` from the store.
- `frontend/src/i18n/strings.ts` — `timeline.timing.*` (header, total, overhead label);
  phase names reuse `phaseLabelsFor`.

## Protocol changes (constitution §1)

None. Reads existing `ts` / `latency_ms` / `stage`; writes nothing.

## Data model changes

None.

## i18n strings (constitution §4)

Phase bar names reuse `phaseLabelsFor(lang)` (already en + pt). New chrome:

| key / location | en | pt |
|---|---|---|
| `timeline.timing.title` | Timing breakdown | Quebra de tempo |
| `timeline.timing.total` | Total | Total |
| `timeline.timing.overhead` | overhead / transit | sobrecarga / trânsito |
| `timeline.timing.empty` | Run a turn to see where the time went. | Rode um turno para ver para onde foi o tempo. |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

Pure function with Vitest; the panel guarded by `tsc` / `npm run build` + manual verify.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | maps an event log → ordered `{ label, durationMs, offsetMs }` segments in run order | `frontend/src/lib/waterfall.test.ts` |
| AC2 | a phase occurring N times → N separate segments, order preserved (`reason ×2`) | `waterfall.test.ts` |
| AC3 | reported total == wall-clock span (last ts − first ts) within rounding; durations from event timings; remainder = `overhead/transit`; `backend` envelope excluded | `waterfall.test.ts` |
| AC4 | durations format via `formatLatency` (`<1 ms` floor; whole ms) | `waterfall.test.ts` |
| AC5 | header + overhead label exist in en **and** pt | `waterfall.test.ts` (parity) |

## Risks / trade-offs

- **Nesting / overlap.** `backend` wraps the run and `agent.think` may wrap `llm.prompt`.
  The model excludes the `backend` envelope and attributes by per-occurrence span; if
  inner overlaps make `Σ segments > total`, the overhead bar floors at 0 (documented,
  not faked). A test pins a realistic nested log.
- **Single-decimal latency.** Backend rounds `latency_ms` to one decimal; sub-ms bars
  read `<1 ms` (AC4), never `0 ms`.
- **Settled vs live.** Renders honestly on any cursor; the teaching value is on a
  finished trace. Not animating mid-stream is intentional (deferred).
