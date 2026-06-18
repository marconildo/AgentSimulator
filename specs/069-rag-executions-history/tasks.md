# Tasks: RAG executions history

> TDD checklist, red → green → refactor. FE-only; no backend / pytest impact.

## Tasks

- [x] **T1 — test first (AC1/AC2/AC3/AC5)**: `frontend/src/lib/ragPipeline.executions.test.ts`
      — fixtures for two cycles (distinct query + top chunk), one cycle (== `deriveRagPipeline`),
      zero cycles (`[]`), and a partial second cycle (embedding active / retrieval pending).
- [x] **T2 — implement**: `deriveRagExecutions(events, cursor)` in `ragPipeline.ts` —
      `rag.embed` START boundaries + per-cycle filtered slice reusing `deriveRagPipeline`.
      Make T1 green.
- [x] **T3 — test first (AC4)**: `RagPipelinePanel.executions.test.tsx` — with 2 cycles the
      `‹ k / N ›` navigator renders and steps; with 1 cycle it does not.
- [x] **T4 — implement**: header navigator + `execIndex` state (default latest, clamped) in
      `RagPipelinePanel.tsx`; `pipeline = executions[execIndex]`. Make T3 green.
- [x] **T5 — i18n (AC6 / §4)**: add `ragDetail.execution*` strings (en + pt) + type to
      `strings.ts`.
- [x] **T6 — refactor**: clean up, keep all Vitest green; `tsc --noEmit` + build pass.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean (no backend change — trivially)
- [x] `pytest -q` green (unchanged — FE-only)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched); every `Stage` still mapped
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
