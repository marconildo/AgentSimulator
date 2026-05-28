# Plan: Settings page

> Spec is `clarified`. This plan describes the relocation: a new `SettingsPage`,
> five extracted section components, a header `ConfigToggle` mirroring the
> existing `Book ↔ Back` Learn toggle, and removal of the popover container.
> No backend changes; no protocol changes.

## Approach

**One page, five sections, one header toggle.** Today `App.tsx` holds
`page: "sim" | "learn"`. We widen it to `"sim" | "learn" | "settings"`. The
header's ⚙️ button becomes a `ConfigToggle` (sibling of the existing
`LanguageToggle`, `ThemeToggle`, etc.) that *navigates* instead of *opens a
popover*: clicking it sets `page = page === "settings" ? "sim" : "settings"`.
The icon and label flip when active, exactly the same `Book ↔ Back` pattern
the Learn button already uses.

The current `SettingsPanel.tsx` is split into five small section components,
each a thin presentational wrapper around the same stores it already reads:

| Section | New component | Reads / mutates |
|---|---|---|
| Cloud overlay | `SettingsCloud` | `<CloudToggle alwaysLabels />` |
| Response delivery | `SettingsDelivery` | `useSettings` (mode) |
| Experiment | `SettingsExperiment` | `useExperiment`, `useChat`, `/api/config` |
| Clear databases | `SettingsClear` | `useChat.clearAll` |
| Skills | `SkillsSettings` (existing, unchanged) | `useSkills`, `/api/skills` |

The page itself (`SettingsPage`) is a thin layout: page header with a back
hint, then the five sections separated by the same `border-t border-line`
divider used in the popover today. Width is capped (~`max-w-3xl mx-auto`)
and the page is the scroll surface (not the section).

**Why not keep the popover and just bump z-index?** The Inspector overlap
report is the surface symptom; the structural issue is that ~545 lines of
controls live inside an `absolute` 320px dropdown. We've already bumped its
`max-h` once. The right answer is more space, not more layering — and the
app has the toggle precedent (Learn) that makes a page a low-cost move.

**Why not introduce `react-router`?** The Learn case set the precedent: a
`page` state is enough for the simulator's "one-of-three top-level views"
shape. Adding a router would invite URL design (`/settings/skills`,
`/settings/experiment?conv=…`) that isn't asked for and would conflict with
the per-conversation experiment model.

**Why extract five components instead of moving the body wholesale?** The
popover already mixes concerns (Cloud, delivery, experiment, clear, skills).
Each section has its own state lifecycle and its own bilingual strings; tests
are sharper when they target one section at a time. The page becomes
declarative.

**Alternatives considered:**

- **Full-screen modal (option 3 from the user prompt).** Rejected: still
  requires a backdrop, still steals focus, and the section count makes it
  effectively a page anyway. Pages compose better with the existing Learn
  pattern.
- **Slide-out drawer over the canvas.** Rejected: the user has explicitly
  reported the overlap is the problem; a drawer overlap is the same problem
  by another name.
- **Resize the popover to ~640px wide.** Rejected: the system prompt textarea
  alone wants 8+ rows; Skills CRUD wants real scrolling; adding two more
  sections (planned: documents manager, LLM gateway) would push it past
  what a popover can reasonably hold.

## Affected files

**Backend**
- None. This spec touches no Python, no schema, no endpoint, no test under
  `backend/`.

**Frontend**
- `frontend/src/settings/SettingsPage.tsx` — **new.** The page component
  (layout + section composition). Default export.
- `frontend/src/settings/SettingsCloud.tsx` — **new.** Section: cloud overlay
  label + `<CloudToggle alwaysLabels />`.
- `frontend/src/settings/SettingsDelivery.tsx` — **new.** Section: streaming
  vs batch radios, reading/writing `useSettings.mode`.
- `frontend/src/settings/SettingsExperiment.tsx` — **new.** Section: system
  prompt textarea, tools toggles, top-k slider, failure-mode selector.
  Identical logic to the popover's experiment block; textarea defaults to 8
  rows instead of 5.
- `frontend/src/settings/SettingsClear.tsx` — **new.** Section: inline
  confirm + result line; same `clearAll` call.
- `frontend/src/components/SkillsSettings.tsx` — **edit.** Drop the internal
  `max-h-72 overflow-y-auto` cap so the list scrolls with the page instead of
  inside a fixed-height window.
- `frontend/src/components/ConfigToggle.tsx` — **new.** Replaces the
  popover-launching `SettingsPanel` in the header. Same visual styling as the
  Learn toggle, gear ↔ back icon flip.
- `frontend/src/components/SettingsPanel.tsx` — **delete** (or reduce to a
  re-export stub if tests reference it; the prior implementation is gone).
- `frontend/src/App.tsx` — **edit.** Widen `page` union to
  `"sim" | "learn" | "settings"`; render `<SettingsPage />` when
  `page === "settings"`; swap the `SettingsPanel` slot for `<ConfigToggle />`;
  ensure Learn click also resets `settings` and vice versa (mutual exclusion).
- `frontend/src/i18n/strings.ts` — **edit.** Add `app.config` (en: "Config",
  pt: "Configurações") if not already used elsewhere; add
  `settings.pageTitle` and `settings.pageTagline` for the page header. All
  pre-existing `settings.*` strings are reused untouched.
- `frontend/src/components/SettingsPage.test.tsx` — **new.** AC1, AC2, AC3,
  AC4 (toggle behavior + mutual exclusion + icon/label flip) and AC5 (all five
  section headings present).
- `frontend/src/settings/SettingsExperiment.test.tsx` — **new.** AC6
  regression coverage for the experiment block (b, c, d).
- `frontend/src/settings/SettingsClear.test.tsx` — **new.** AC6 regression
  for clear-databases inline confirm and result line.
- `frontend/src/settings/SettingsDelivery.test.tsx` — **new.** AC6
  regression for `mode === "batch"` toggle.
- `frontend/src/settings/SettingsPerConv.test.tsx` — **new.** AC7
  per-conversation experiment scope (page reads the active conversation id).

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — **no change.**
- `frontend/src/types/events.ts` — **no change.**
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` — **no change.**
- No `readoutFor` / `renderDetail` switches touched.

## Data model changes

- No vector store change.
- No relational store change (no migrations).
- No new request/response surfaces.

## i18n strings (constitution §4)

> Existing `settings.*` strings (title, delivery, experiment.\*, data.\*,
> skills.\*) remain unchanged and are reused on the new page. Only the
> page-level chrome below is new.

| key / location | en | pt |
|---|---|---|
| `app.config` | `Config` | `Configurações` |
| `settings.pageTitle` | `Settings` | `Configurações` |
| `settings.pageTagline` | `Pipeline options, experiment knobs, and data controls.` | `Opções do pipeline, controles de experimento e dados.` |
| `settings.backToSim` (aria-label on the header toggle when active) | `Back to Simulator` | `Voltar ao Simulador` |

Section headings reuse the existing strings:

- Cloud: `t.app.cloud`
- Delivery: `t.settings.delivery` + `t.settings.deliveryHint`
- Experiment: `t.settings.experiment.title`
- Clear: `t.settings.data.title` + `t.settings.data.clearHint`
- Skills: `t.settings.skills.title`

## Cloud map (constitution §5)

n/a — no new tier, station, or boundary.

## Test strategy (constitution §9 — TDD)

> Pure FE relocation → all Vitest. Tests use the existing RTL setup added by
> spec 040 (`@testing-library/react` + `scrollTo` polyfill + `useHud` mock,
> per `token-totals-four-way-parity` memory). Stores are reset via
> `useChat.setState` / `useExperiment.setState` / `useSettings.setState` in
> a `beforeEach`. `getConfig` is mocked via `vi.mock("../lib/chatApi", …)`.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 (click ⚙️ → page, popover gone) | renders `data-testid="settings-page"`; popover root absent | `frontend/src/components/SettingsPage.test.tsx` |
| AC2 (click ⚙️ again → back to sim) | settings region unmounts; canvas re-mounts | same file |
| AC3 (mutual exclusion with Learn) | click Learn while on Settings → Learn mounts; reverse | same file |
| AC4 (icon + label flip on the toggle) | button text reads "Config" then "Simulator"; aria-pressed flips | same file |
| AC5 (all five section headings present) | the five headings are queryable on the page | same file |
| AC6a (delivery batch wires) | click "Batch" → `useSettings.getState().mode === "batch"` | `SettingsDelivery.test.tsx` |
| AC6b (system prompt + reset) | type in textarea → store updates; reset button restores default | `SettingsExperiment.test.tsx` |
| AC6c (tool toggle) | unchecking removes from `enabledTools`; rechecking restores | same file |
| AC6d (top-k slider) | slider change updates `byConv[conv].topK` | same file |
| AC6e (clear databases) | click Clear → confirm → Yes; spy on `useChat.clearAll`; result line shown | `SettingsClear.test.tsx` |
| AC6f (Skills mounts) | a hostname element from `SkillsSettings` is rendered on the page | covered by AC5 |
| AC7 (per-conversation scope) | switch active conv → prompt textarea reflects per-conv state | `SettingsPerConv.test.tsx` |
| AC8 (tour not fired by Settings) | mock `startTour`; navigate Sim → Settings → Sim, assert it was not called by the navigation | `SettingsPage.test.tsx` |
| AC9 (legacy popover absent) | greedy grep-style assertion: no element with the popover's previous test id / className root | `SettingsPage.test.tsx` |
| AC10 (bilingual) | unit-level: every new key has non-empty `en` and `pt` values | `i18n.settings041.test.ts` |
| AC11 (tsc clean, no protocol drift) | `npm run build` in CI; `STAGE_TO_STATION` parity tests in `phases.test.ts` stay green untouched | existing gates |

> Existing tests for `SkillsSettings`, `useExperiment`, `useSettings`,
> `useChat.clearAll`, `<CloudToggle />`, and `phases.test.ts` continue to
> pass without modification (this is the regression contract).

## Risks / trade-offs

- **Lose the click-outside dismiss UX.** A page can't be "dismissed by
  clicking anywhere"; the user has to click ⚙️ again. We mitigate by making
  the toggle button visibly active (border + colour) so the path back is
  obvious — same affordance Learn already uses.
- **Lose the "configure while glancing at the canvas" trick.** This was
  technically possible with the popover (the canvas was visible beside it),
  though in practice the popover overlapped it. The page makes the trade-off
  explicit: configuration is not a glance. If a user reports missing this,
  a future spec can introduce a focused "quick settings" pill in the header
  for the 1–2 most-used controls.
- **`SkillsSettings` `max-h-72` removal might surprise anyone who liked the
  inner scroller.** The risk is small (the popover was already cramped); on
  the page the section now grows with content, and the page scrolls.
- **Mutual exclusion is asymmetric semantically.** Clicking Learn while on
  Settings jumps directly to Learn (not back to Sim first). Some users might
  expect a "back to Sim" intermediate state. We choose the symmetric +
  minimal-clicks behavior (it's how iOS tab bars work) and document it in
  AC3.
- **First-run hint.** Until users learn the toggle, they may not realize ⚙️
  has moved from "popover" to "page". The icon and proximity stay the same;
  the page's visible "Back to Simulator" affordance closes the loop. No tour
  step is added — the cost-to-benefit of a tour redesign is too high for
  this relocation.
- **No URL means deep-linking is impossible.** Acknowledged; deferred. The
  out-of-scope list captures this.
