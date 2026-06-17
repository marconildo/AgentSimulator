# Tasks: Mobile layout for the demo build

> Ordered TDD checklist. Each implementation task is preceded by the test that should fail
> first (red → green → refactor). FE-only; no backend tasks. Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC1)**: `frontend/src/lib/useIsMobile.test.ts` — stub
  `window.matchMedia`; assert the hook returns `false`/`true` per `matches`, updates on a
  `change` event, and returns `false` when `matchMedia` is absent. (red)
- [x] **T2 — implement (AC1)**: `frontend/src/lib/useIsMobile.ts` — `matchMedia('(max-width:
  767px)')` subscriber, SSR/no-`matchMedia` safe. (green)

- [x] **T3 — test first (AC3, AC4, AC5)**: `frontend/src/components/MobileShell.test.tsx` —
  render `MobileShell` with three labelled pane children + a tab bar; assert default active =
  Diagram (AC5), exactly one pane visible while the other two stay in the DOM hidden (AC3),
  and clicking a tab switches the visible pane + sets `aria-selected` (AC4). (red)
- [x] **T4 — implement (AC3–AC5)**: `frontend/src/components/MobileShell.tsx` — single-pane
  shell, bottom `role="tablist"`, local `active` state default `"canvas"`, inactive panes
  hidden via CSS (never unmounted). (green)

- [x] **T5 — test first (AC6)**: extend `MobileShell.test.tsx` — selecting a station (store
  `select(id)`) switches the active tab to Inspector. (red)
- [x] **T6 — implement (AC6)**: `useEffect` on `selected` → set `active = "inspector"` when
  non-null. (green)

- [x] **T7 — test first (AC7)**: extend `MobileShell.test.tsx` — each tab control carries the
  ≥44px min-height class. (red)
- [x] **T8 — implement (AC7)**: apply `min-h-[44px]` (and touch sizing) to tab controls. (green)

- [x] **T9 — test first (AC2, AC8, AC10)**: `frontend/src/App.mobile.test.tsx` — with
  `VITE_DEMO_MODE` stubbed on + `matchMedia` mobile, the mobile shell/tab bar renders and the
  header has `flex-wrap` (AC2, AC8); with demo on + desktop width, the three-column layout
  renders, no tab bar (AC2); with demo off at mobile width, three-column layout, no shell
  (AC2/AC10). (red)
- [x] **T10 — implement (AC2, AC8, AC10)**: `App.tsx` — compute `mobileDemo = isDemo() &&
  useIsMobile()`; wrap the Sim branch in `mobileDemo ? <MobileShell …/> : <three-column>`
  (existing JSX moved verbatim into the `else`); add conditional `flex-wrap` to the header. (green)

- [x] **T11 — i18n (AC9)**: add `mobile.tab.{canvas,chat,inspector}` to `strings.ts` in
  **en + pt**; wire them as the tab labels; add/extend a test asserting both languages exist.
- [x] **T12 — refactor**: tidy `MobileShell` (canvas re-`fitView`/`resize` on reveal), keep all
  tests green; manual check on a phone-width viewport (Diagram fits, tabs switch, tapping a
  node opens Inspector).

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` — n/a: zero backend files touched (FE-only change)
- [x] `pytest -q` — n/a: zero backend files touched (event protocol untouched)
- [x] `npm run build` passes (`tsc --noEmit` + build), incl. a `VITE_DEMO_MODE=1` build
- [x] `npm test` (Vitest) green — 521 tests, 77 files
- [x] Protocol mirror unaffected (`schemas.py` ↔ `events.ts` untouched); every Stage still
      mapped to a station
- [x] All new user-facing text exists in en **and** pt
- [x] Live (non-demo) build verified unchanged at desktop **and** mobile widths (AC10 test)
- [x] `spec.md` status updated to `in-progress` → `done`
