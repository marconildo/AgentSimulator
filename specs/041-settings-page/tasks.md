# Tasks: Settings page

> Red → green → refactor. Each implementation task is preceded by the failing
> test that drives it. Pure FE work, no backend.

## Tasks

### Bootstrap

- [ ] **T0 — branch + spec bump**: branch `041-settings-page`; bump
  `spec.md` status to `in-progress`.

### Section extraction (groundwork, behavior-preserving)

- [ ] **T1 — test first (AC6a)**: `SettingsDelivery.test.tsx` mounts
  `<SettingsDelivery />` (does not yet exist) and asserts clicking "Batch"
  flips `useSettings.getState().mode` to `"batch"`. Fails because the file is
  missing.
- [ ] **T2 — implement**: create `frontend/src/settings/SettingsDelivery.tsx`
  by lifting the delivery block out of `SettingsPanel.tsx`. T1 green.

- [ ] **T3 — test first (AC6b, AC6c, AC6d)**:
  `SettingsExperiment.test.tsx` mounts `<SettingsExperiment />` and asserts:
  (b) typing the textarea writes `byConv[conv].systemPrompt`; the **Reset**
  button appears when dirty and clears the override; (c) unchecking a tool
  removes it from `enabledTools` and rechecking restores; (d) changing the
  range slider updates `byConv[conv].topK`. Mocks `getConfig` to return a
  fixed `AppConfig`. Fails because the file is missing.
- [ ] **T4 — implement**: create `frontend/src/settings/SettingsExperiment.tsx`
  by lifting the 🧪 Experiment block; bump textarea `rows={8}`. T3 green.

- [ ] **T5 — test first (AC6e)**: `SettingsClear.test.tsx` clicks "Clear
  databases", asserts the inline confirm appears, clicks "Yes, clear", spies
  on `useChat.clearAll` (returns a `ClearResult` stub), and asserts the
  result line renders the returned counts. Fails because the file is missing.
- [ ] **T6 — implement**: create `frontend/src/settings/SettingsClear.tsx`
  by lifting the 🗑️ block. T5 green.

- [ ] **T7 — implement (no separate test)**: create
  `frontend/src/settings/SettingsCloud.tsx` as a thin wrapper around
  `<CloudToggle alwaysLabels />` with its label. (Behavior is asserted by
  AC5 in the page test below.)

- [ ] **T8 — refactor `SkillsSettings`**: remove the internal
  `max-h-72 overflow-y-auto` cap (or move it behind a `compact` prop with
  default `false`); existing Skills tests stay green.

### Page + header toggle (the user-visible move)

- [ ] **T9 — test first (AC1, AC2, AC4, AC9)**: `SettingsPage.test.tsx`
  mounts `<App />`; asserts a button with the "Config" label (gear icon)
  exists; clicking it renders `data-testid="settings-page"` and unmounts the
  canvas; the button's label flips to "Simulator" and shows the back-arrow
  icon; clicking again restores the canvas and the gear icon; the legacy
  popover root (`SettingsPanel` content) is never queryable. Fails because
  the toggle still opens a popover.
- [ ] **T10 — implement**: create `frontend/src/components/ConfigToggle.tsx`
  as a sibling of `LanguageToggle`, mirroring the Learn button styling. Wire
  `page` state in `App.tsx`: widen the union to
  `"sim" | "learn" | "settings"`, render the new `SettingsPage` when
  `"settings"`, replace `<SettingsPanel />` in the header with
  `<ConfigToggle page={page} setPage={setPage} />`. T9 green.

- [ ] **T11 — test first (AC5)**: in `SettingsPage.test.tsx`, assert the
  page contains the five section headings (Cloud, Delivery, 🧪 Experiment,
  🗑️ Clear, 🎓 Skills) and the page header title + tagline. Fails until the
  page composition exists.
- [ ] **T12 — implement**: create `frontend/src/settings/SettingsPage.tsx`
  composing the five section components in order, with the page header
  (title + tagline) and hairline dividers. T11 green.

- [ ] **T13 — test first (AC3 mutual exclusion)**: from
  `page === "settings"`, click the Learn button → assert `LearnPage` mounts
  and the settings region unmounts. Symmetric: from `page === "learn"`,
  click ⚙️ → assert settings region mounts and `LearnPage` unmounts. Fails
  if Learn click toggles back to Sim instead of going to Learn.
- [ ] **T14 — implement**: tighten the Learn button's `onClick` to set
  `page = "learn"` (not toggle to sim) when not already on Learn; symmetric
  for ConfigToggle. T13 green.

- [ ] **T15 — test first (AC7 per-conversation)**: render the page with
  conv c1 active, type a prompt; switch `useChat.activeSessionId` to c2;
  re-render and assert the textarea is the default (c2 has no override),
  not c1's text. Fails until the page reads `useChat` like the popover did.
- [ ] **T16 — implement**: ensure `SettingsExperiment` reads `useChat`'s
  `activeSessionId` (it already does via the lift in T4). T15 green.

- [ ] **T17 — test first (AC8 tour not auto-started by Settings)**:
  mock `startTour`; assert that navigating Sim → Settings → Sim does not
  call `startTour()` (the auto-onboard effect should not re-fire). Fails if
  the effect lacks the right dependency check.
- [ ] **T18 — implement**: confirm the existing `useEffect`'s `[startTour]`
  dependency + `markOnboarded()` idempotency is sufficient; no code change
  expected. T17 green.

### Wiring + cleanup

- [ ] **T19 — i18n (AC10)**: add `app.config`, `settings.pageTitle`,
  `settings.pageTagline`, `settings.backToSim` with non-empty `en` and `pt`
  values to `frontend/src/i18n/strings.ts`. Add an
  `i18n.settings041.test.ts` that asserts both languages are populated.
- [ ] **T20 — protocol-mirror sanity (AC11)**: run `phases.test.ts` and the
  existing `STAGE_TO_STATION` parity check; assert untouched. (Should be
  green automatically.)
- [ ] **T21 — delete `SettingsPanel.tsx`**: remove the popover file from
  `frontend/src/components/SettingsPanel.tsx`; ensure no remaining imports.
  Confirm `npm run build` (`tsc --noEmit`) is clean.
- [ ] **T22 — refactor pass**: remove dead helpers; collapse near-duplicate
  CSS class lists where the page allows breathing room; verify the page
  reads as five clear blocks. Tests stay green.
- [ ] **T23 — manual smoke (verify skill)**: load the app; click ⚙️ from
  Sim (expects: page mounts); click again (expects: back to canvas);
  navigate Learn ↔ Settings (mutual exclusion); send a chat → Inspector +
  canvas behave as before; system prompt edit, tool toggle, top-k, failure
  mode, clear-DB, skill CRUD all still work. Confirm no overlap regression
  on a 1024px-wide window.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test.
- [ ] `ruff check .` clean (no backend changes; still part of the gate).
- [ ] `pytest -q` green with `OPENAI_API_KEY` (unchanged; this spec adds no
  backend tests but the gate must stay green).
- [ ] `npm run build` passes (`tsc --noEmit` + build).
- [ ] `npm test` green (Vitest, including the new files).
- [ ] Protocol mirror in sync (`schemas.py` ↔ `events.ts`); every `Stage`
  mapped to a station; both maps unchanged.
- [ ] All new user-facing text exists in en **and** pt.
- [ ] `SettingsPanel.tsx` deleted; no orphan imports; `App.tsx` uses
  `ConfigToggle` + `SettingsPage`.
- [ ] No `Inspector` ↔ `Settings` overlap reproducible on default desktop
  widths (regression closed).
- [ ] `spec.md` status updated to `done`.
- [ ] Memory updated (new entry: `spec-041-settings-page.md`) once shipped.
