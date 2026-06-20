# Tasks: Chunking strategy explainers in Settings

> Ordered TDD checklist. Each implementation task is preceded by the failing test.

## Tasks

- [x] **T1 — test first (AC1)**: in `SettingsKnowledgeBase.test.tsx`, assert that
  selecting each strategy renders its distinct, non-empty explanation, and that the
  text changes on selection. (Red — no explainer yet.)
- [x] **T2 — i18n**: add `kb.explain.*` strings (4 strategies + title/example/
  loading/seeFull) in en + pt (constitution §4).
- [x] **T3 — implement (AC1)**: render the per-strategy "How it works" explanation
  in `SettingsKnowledgeBase.tsx`, keyed off `chosen`; make T1 green.
- [x] **T4 — test first (AC2/AC3)**: mock `chunkPreview` to assert (a) the selected
  strategy's chunks render with char counts, and (b) a preview `error` renders the
  honest message with no chunk blocks. (Red.)
- [x] **T5 — reuse**: export `ChunkColumn` from `RagStageDetail.tsx`.
- [x] **T6 — implement (AC2/AC3)**: fetch `chunkPreview(chosen)` (alive-guarded) on
  selection and render the single chosen column via `ChunkColumn`; green.
- [x] **T7 — test first (AC4)**: assert the "see full comparison" control calls
  `openDetail("rag")` (mock `useSimulator`). (Red.)
- [x] **T8 — implement (AC4)**: wire the button to `openDetail("rag")`; green.
- [x] **T9 — refactor**: tidy, keep tests green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green for the touched files
- [x] All new user-facing text exists in en **and** pt
- [x] No `schemas.py` / `events.ts` / chunking-logic change (AC6)
- [x] `spec.md` status updated to `done`
