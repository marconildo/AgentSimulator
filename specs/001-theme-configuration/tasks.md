# Tasks: Theme configuration (dark / light)

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC2)**: add Vitest infra (`vitest` devDep + `"test": "vitest run"`
      in `frontend/package.json`) and write failing `frontend/src/lib/theme.test.ts`:
      `initialTheme()` defaults to `dark` on empty `localStorage`; `setTheme` writes the
      `agentsim.theme` key and `document.documentElement.dataset.theme`; `isTheme` rejects
      invalid values.
- [x] **T2 — implement (AC2)**: create `frontend/src/lib/theme.ts` (Zustand store mirroring
      `lib/cloud.ts`) and apply the persisted theme at module load → make T1 green.
- [x] **T3 — implement (theme tokens)**: in `frontend/src/index.css`, expand the `@theme`
      token set (per plan table) and add the `[data-theme="light"]` override block;
      tokenize the `body` gradient, scrollbars and `.react-flow__attribution`.
- [x] **T4 — implement (AC1)**: create `frontend/src/components/ThemeToggle.tsx` (mirror
      `LanguageToggle`) and mount it in `App.tsx` next to the language/cloud toggles.
- [x] **T5 — i18n (§4)**: add `app.theme` / `app.themeDark` / `app.themeLight` in
      `i18n/strings.ts` (en **and** pt) and extend the `app` interface.
- [x] **T6 — test first (AC7)**: write failing `frontend/src/lib/no-hardcoded-colors.test.ts`
      that greps the themed surface set (`components/`, `learn/`, `App.tsx`, `stations.ts`)
      for `#rrggbb` and fails if any remain (allowlist: token definitions in `index.css`).
- [x] **T7 — implement (AC3–AC7)**: migrate hardcoded hexes + Tailwind palette utilities to
      `var(--color-*)` across `App.tsx`, `stations.ts`, `FlowEdge`, `StationNode`,
      `InspectorPanel`, `AgentDetail`, `Timeline`, `ChatPanel`, `SettingsPanel`,
      `LanguageToggle`, `CloudToggle`, `learn/*`. Rewrite `` `${accent}NN` `` →
      `color-mix(...)`. Make T6 green. (Also covered `FlowCanvas`, `TierNode`,
      `BoundaryNode`, `LearnNodes`, `LearnMap` — every file the grep flagged.)
- [x] **T8 — light palette**: finalize the light accent values; manually verify every
      surface (chrome, stations, hops, messages, Learn, overlays) flips correctly in light
      mode and reads well (skill `verify` — Chrome drove the real UI; all ACs PASS,
      screenshots captured for dark + light).
- [x] **T9 — CI**: add a frontend `npm test` step to `.github/workflows/ci.yml`.
- [x] **T10 — refactor**: clean up, keep tests green, confirm all quality gates.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test or recorded verification
- [x] `ruff check .` clean (backend untouched — sanity only)
- [x] `pytest -q` green (offline, `DEMO_MODE=true`) — unaffected (19 passed)
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` green (Vitest: theme store + no-hardcoded-colors guard)
- [x] Protocol mirror in sync (`schemas.py` ↔ `events.ts`) — n/a, no protocol change
- [x] All new user-facing text exists in en **and** pt (`app.theme*`)
- [x] Manual verification: toggle flips theme, choice persists across reload, default is dark
- [x] `spec.md` status updated to `done`
