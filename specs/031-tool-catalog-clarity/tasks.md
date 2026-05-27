# Tasks: Tool catalog clarity

> The work, ordered, as a TDD checklist (red → green → refactor).

## Tasks

- [x] **T1 — test first (AC1/AC5)**: extend `strings.test.ts` to assert
  `settings.toolLabels` resolves a non-empty label, in en **and** pt, for every name in
  the canonical tool set (`search_knowledge_base`, `calculator`, `current_time`,
  `kb_lookup`, `load_skill`). (Red: two labels missing.)
- [x] **T2 — implement**: add `search_knowledge_base` + `load_skill` labels to
  `settings.toolLabels` (en + pt). (Green T1.)
- [x] **T3 — test first (AC2/AC4)**: assert a Tools disambiguation hint exists per
  language and mentions retrieval-vs-glossary and the "any tool can be disabled /
  ungrounded" truth (keyword assertion).
- [x] **T4 — implement**: add `settings.toolsDisambig` (en + pt) and render it in the
  Tools section of `SettingsPanel`. (Green T3.)
- [x] **T5 — test first (AC3)**: panel renders one toggle per `config.tools` entry
  (fixture with all 5), each showing label + raw handle.
- [x] **T6 — implement**: confirm/adjust the `config.tools.map` render and a stable
  display order (retrieval first). (Green T5.)
- [x] **T7 — parity (AC6)**: `/api/config` tool set + handles unchanged; `test_agent` /
  `test_mcp` still green.
- [x] **T8 — refactor**: keep the hint concise (tooltip for the long form if needed).

## Definition of done

- [ ] Every acceptance criterion maps to a passing test
- [ ] `ruff check .` clean (n/a — no backend change)
- [ ] `pytest -q` green
- [ ] `npm run build` passes (`tsc --noEmit` + build) and `npm test` green
- [ ] No protocol change; tool handles unchanged
- [ ] All new user-facing text exists in en **and** pt
- [ ] `spec.md` status updated to `done`
