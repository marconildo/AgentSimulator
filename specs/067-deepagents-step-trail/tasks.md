# Tasks: DeepAgents step trail in the Agent drill-in

## Tasks

- [x] **T1 — test first**: failing tests for `deriveDeepAgentsSteps` (AC1–AC4) in
  `frontend/src/lib/deepagents.test.ts` — order+kind, per-step todos, fs/delegate fields,
  `[]` on Simple.
- [x] **T2 — implement**: add `DeepAgentsStep` + `deriveDeepAgentsSteps()` to
  `frontend/src/lib/deepagents.ts`; make T1 green.
- [x] **T3 — i18n**: add `steps`/`stepsHint`/`wroteFile`/`readFile` to `agentDetail` in en + pt.
- [x] **T4 — implement (AC5)**: Plan panel in `AgentDetail.tsx` renders the chronological
  trail; swap `deriveTodos`/`deriveDelegations` usage for the trail; keep VFS sub-section.
- [x] **T5 — refactor**: keep the lib functions still used by their tests; tidy imports.
- [x] **T6 — test first (AC6)**: a DeepAgents run with no `task` yields no `delegate` step
  (drives the "no sub-agent" note) in `deepagents.test.ts`.
- [x] **T7 — implement (AC6)**: STEPS panel shows the explicit "no sub-agent" line when no
  delegate step; `noSubagent` string en + pt.
- [x] **T8 — implement (AC7)**: truncate long tool-call args in the Senses · hands panel with
  a "Read more" / "Leia mais" toggle; `readMore`/`readLess` strings en + pt.
- [x] **T9 — test first (AC8)**: `_finalize_plan` marks remaining todos completed + emits a
  closing `agent.plan`; no-op when already complete / no plan (`tests/test_deepagents.py`).
- [x] **T10 — implement (AC8)**: `_finalize_plan` in `graph.py`, called at the end of
  `generate_node`; returns the reconciled `plan` as a state update.
- [x] **T11 — implement (AC9)**: `VfsContent` collapses VFS file content behind Read more.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (AC1–AC4, AC6 unit; AC5/AC7 structural + build)
- [x] `npm test` (Vitest) green
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] No protocol change (`schemas.py` ↔ `events.ts` untouched)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
