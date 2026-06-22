# Tasks: Chunk overlap highlight

> Red → green → refactor. Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC1/AC2)**: failing `frontend/src/lib/chunkOverlap.test.ts` for
  `overlapPrefixLen` (longest suffix==prefix; 0 when none/undefined; fixed-overlap O → O).
- [x] **T2 — implement**: added `frontend/src/lib/chunkOverlap.ts::overlapPrefixLen`, T1 green.
- [x] **T3 — test first (AC3/AC4)**: extended `IngestionPipelinePanel.test.tsx` — selecting a
  chunk with overlap shows a highlighted prefix whose text + remainder == full text; first
  chunk shows no highlight.
- [x] **T4 — implement**: render highlighted overlap prefix + plain remainder + legend in
  `ChunkFullText` (IngestionPipelinePanel.tsx) + `Scroll` `testid` passthrough; T3 green.
- [x] **T5 — i18n (AC5)**: added `ingestionDetail.overlapLegend` (en + pt) to type + both langs.
- [x] **T6 — refactor**: clean; full Vitest (662) + build green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green — 662 passed
- [x] No protocol change (verified — no `Stage`/`events.ts` edit)
- [x] `overlapLegend` exists in en **and** pt
- [x] `spec.md` status updated to `done`
