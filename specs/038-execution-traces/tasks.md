# Tasks: Execution Traces (hierarchical span tree)

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implement task is preceded
> by the failing test that drives it (red → green → refactor). Advance the spec
> status (`planned → in-progress → done`). Supersedes 015.
>
> Builds on `004` (`STAGE_TO_PHASE`), `007`/`B4` (`formatLatency`), `011`
> (token/cost metrics). **Clarify resolved** — replace 015 in the Overview ·
> 2-level tree (no `_should_continue`) · duration + tokens + proportional bar
> (`spec.md`, 2026-05-27).

## Phase 1 — Pure projection (AC1, AC2, AC3, AC4, AC5)

- [x] **T1 — test first** (`lib/executionTree.test.ts`): linear log → ordered
  parent spans `route, think, generate, respond`; request envelope excluded (AC1).
- [x] **T2 — test first**: ReAct log → `think`×2 and `tools`×2 as separate spans,
  order preserved (AC2).
- [x] **T3 — test first**: think/generate → one `ChatOpenAI` child (model when
  present); tools → one child per tool call named by the tool; retrieve → rag
  sub-steps; route/respond/memory/persist leaf (AC3).
- [x] **T4 — test first**: durations = wall-clock footprint; think/generate carry
  tokens+cost; root totals = sums + wall-clock span (AC4).
- [x] **T5 — test first**: bar geometry — offset/width ∈ [0,1]; child ⊆ parent (AC5).
- [x] **T6 — implement** (`lib/executionTree.ts`): `TraceSpan`/`SpanChild` +
  `executionTree(events)`. T1–T5 green (11/11).

## Phase 2 — Panel + Inspector wiring (AC5)

- [x] **T7 — implement** (`components/ExecutionTraces.tsx`): collapsible tree —
  root line (total duration + tokens + cost), one row per span (proportional bar),
  expandable children, empty state. Tokens-only theme (color guard passes).
- [x] **T8 — implement** (`components/InspectorPanel.tsx`): replaced `TimingPanel`
  import + `<TimingPanel />` with `ExecutionTraces` in `Overview`.

## Phase 3 — i18n (AC6, §4)

- [x] **T9 — test first**: `timeline.execTrace.{title,root,empty,total}` + `nodes.*`
  + `child.*` exist in both en and pt (folded into `executionTree.test.ts`).
- [x] **T10 — implement** (`i18n/strings.ts`): renamed `timeline.timing` →
  `timeline.execTrace` with the new shape (en + pt); updated the `Strings` type.

## Phase 4 — Supersede 015 + cleanup

- [x] **T11 — remove** superseded files: `components/TimingPanel.tsx`,
  `lib/waterfall.ts`, `lib/waterfall.test.ts` (no dangling refs).
- [x] **T12 — docs**: `specs/015-latency-waterfall/spec.md` marked **superseded by
  038**; this spec set to **done** (the 036 migration that had held the build red
  has since landed).

## Phase 5 — Placement iteration (2026-05-27, post-review)

> Feedback: the inline panel at the top of the Overview was too cramped. Make it a
> list entry that opens as a full-width overlay. `executionTree` (the projection)
> is unchanged — presentation only; new logic limited to a store flag + i18n.

- [x] **T13 — store**: `tracesOpen` boolean + `openTraces`/`closeTraces`;
  `openTraces` clears `selected`, `select` clears `tracesOpen` (mutually
  exclusive body views). Off `StationId`; reset on clear.
- [x] **T14 — detail (rev.)**: `components/ExecutionTraces.tsx` →
  `ExecutionTracesDetail` rendered **inside the Inspector body** like a station
  detail (`← Overview` back button, header + total chips, compact rows). An
  earlier draft mounted a full-width overlay over `<main>`; reverted on review.
- [x] **T15 — list row + branch**: `InspectorPanel` Overview lists an "Execution
  traces" row that calls `openTraces`; `if (tracesOpen) return
  <ExecutionTracesDetail/>` short-circuits the body. Inline panel removed; App
  overlay removed.
- [x] **T16 — i18n**: `execTrace.subtitle` added (en + pt); the unused `back`
  / `root` / `total` keys were dropped on the second pass (back reuses the
  station-detail's `inspector.overviewBack`); AC6 parity test updated.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (`executionTree.test.ts`).
- [ ] `ruff check .` / `pytest -q` — n/a to 038 (no backend change); not re-run.
- [x] `npm test` (Vitest) green — **344/344**.
- [x] `npm run build` green (`tsc --noEmit` + vite). The 036 break that had held it
      red has since landed, so the combined working tree builds clean.
- [x] No new `Stage`; `schemas.py` ↔ `events.ts` unchanged; every `Stage` still
      mapped in `STAGE_TO_PHASE`.
- [x] All new user-facing text exists in en **and** pt.
- [x] 015 marked superseded.
