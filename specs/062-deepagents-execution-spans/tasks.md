# Tasks: DeepAgents steps in the execution trace

## Tasks

- [x] **T1 — test first**: failing tests in `executionTree.test.ts` for AC1–AC5
  (plan/fs/delegate spans, repeated plans, Simple-rung unchanged).
- [x] **T2 — implement**: extend `TraceNode`, add the DeepAgents stage→node map,
  `detail`/`count` on `TraceSpan`, delegate-window handling + children from `steps`.
- [x] **T3 — test first**: extend the AC6 bilingual test for the new node labels +
  `planTodos`.
- [x] **T4 — i18n**: add `nodes.{plan,delegate,fs-write,fs-read}` + `planTodos` to
  the `execTrace` type and both `en`/`pt` blocks.
- [x] **T5 — render**: show the parent-row tag from `detail`/`count` in
  `ExecutionTraces.tsx`.
- [x] **T6 — refactor**: clean up, keep tests green.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `npm test` (Vitest) green
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] No protocol change; no backend diff
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
