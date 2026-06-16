# Tasks: Online demo mode (mocked, backend-less)

> TDD checklist. Tests run offline (no key).

## Tasks

- [x] **T1 — capture**: record 16 real traces + `_config.json` via the batch endpoint
  (`scripts/capture_demo_traces.py`) into `src/demo/fixtures/`.
- [x] **T2 — registry**: `src/demo/fixtures.ts` typed registry + `DEMO_CONFIG`.
- [x] **T3 — test first (AC1–AC6)**: failing `src/lib/demo.test.ts` for `isDemo`,
  `demoHealth`, catalog reads, `selectDemoTrace` (rerank on intermediate RAG + fallback),
  and a demo `send` turn.
- [x] **T4 — implement**: `src/lib/demo.ts` (flag, questions, selection, in-memory store,
  demo network surface) → make T3 pass.
- [x] **T5 — guards**: `isDemo()` short-circuits in `health.ts`, `chatApi.ts`, `sse.ts`
  (no-op when off → local byte-for-byte).
- [x] **T6 — test first (AC7)**: failing `ChatPanel.demo.test.tsx` (textarea disabled,
  no upload control, chips render).
- [x] **T7 — implement lockdown**: demo composer + persistent sample-question bar; hide
  upload; hide agent/clear/skills editing; `DemoBanner`.
- [x] **T8 — i18n (AC8)**: `demo.*` en + pt strings.
- [x] **T9 — build/deploy (AC9)**: `vite.config` base from env, `404.html`, Pages workflow.
- [x] **T10 — gates**: `npm run build` + `npm test` green; backend `ruff`/`pytest` unaffected.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC9 documented).
- [x] `ruff check .` clean (backend untouched)
- [x] `pytest -q` green (backend untouched)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
