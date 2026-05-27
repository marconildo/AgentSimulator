# Tasks: Inline citations / provenance in the answer

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is preceded
> by the test that must fail first (red → green → refactor). Advance the spec status
> (`planned → in-progress → done`).
>
> **Clarify resolved** — deterministic lexical overlap (frontend-only) · sentence-level ·
> both sources (`spec.md`, 2026-05-27). Frontend-only; honest by construction (§real).

## Phase 1 — Pure citations function (AC1, AC2, AC3)

- [x] **T1 — test first**: `frontend/src/lib/citations.test.ts` — a sentence that shares
  a ≥N-word significant n-gram with a source gets a citation to that source (AC1);
  ties resolve to the longest shared n-gram.
- [x] **T2 — test first (negative)**: a sentence with no qualifying overlap gets **no**
  citation — proving no fabrication (AC2).
- [x] **T3 — test first**: each emitted citation carries the hover payload (source
  kind/id, tool args or chunk score, snippet) (AC3).
- [x] **T4 — implement**: `frontend/src/lib/citations.ts` — `Citation`/`CitationSource`,
  `sourcesFromEvents(events)` (tool results + retrieved chunks), and
  `citations(answer, sources)` with the documented n-gram rule + named threshold.

## Phase 2 — i18n (AC4, §4)

- [x] **T5 — test first**: parity — `citation.*` chrome exists in en **and** pt.
- [x] **T6 — implement**: add the strings to `frontend/src/i18n/strings.ts` (en + pt).
  Tool args / chunk snippets / proper nouns stay verbatim.

## Phase 3 — Render in Agent anatomy

- [x] **T7 — implement**: in `frontend/src/components/AgentDetail.tsx`, render the answer
  sentence-by-sentence; cited sentences get a `[n]` chip with a hover showing the source
  detail; uncited sentences render plain. Tokens only (theme guard).

## Phase 4 — Verify & refactor

- [x] **T8 — gates**: `npm test` (Vitest) · `npm run build` — green. Function stays pure;
  protocol untouched.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test (AC1–AC4)
- [x] Negative test proves no fabricated citations (honest by construction)
- [x] No protocol change; reads existing `mcp.call` / `rag.retrieve` data only
- [x] Citation chrome exists in en **and** pt; args/snippets verbatim
- [x] `spec.md` status updated to `done`
