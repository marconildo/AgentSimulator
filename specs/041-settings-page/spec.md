# Spec: Settings page — promote the ⚙️ popover to a top-level view

| | |
|---|---|
| **ID** | 041-settings-page |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> The HOW is in `plan.md`. This spec promotes the existing ⚙️ Config dropdown
> into a **dedicated top-level page** that replaces the popover, mirroring how
> the Learn page already works. No protocol, no `Stage` change, no backend.

## Problem / motivation

The ⚙️ Config affordance started as a small popover next to the gear button.
Six specs later, it has grown into a stack of independently sized sections —
**Cloud overlay, Response delivery, Experiment** (system prompt, tools toggle,
RAG top-k, failure injection), **Clear databases**, **Skills catalog (CRUD)**.
The popover is now ~545 lines (`SettingsPanel.tsx` + `SkillsSettings.tsx`),
caps at `max-h-[min(78vh,40rem)]`, and on common viewports it **overlaps the
right-hand Inspector panel** (the user-reported regression — both live on the
right side of the header). The system prompt textarea alone needs ~8 lines to
be edited comfortably; the Skills CRUD list demands real scrolling space.

This is the same growth that justified extracting **Learn** into its own page
back in 005/023. The simulator already has a precedent for "navigate to a
sibling view": `App.tsx` flips a `page: "sim" | "learn"` state and the header
houses one toggle button (gear → book / arrow back). Settings has now crossed
that threshold and should follow the same pattern.

What this spec wants to deliver:

- **No overlap.** The Inspector and the Config view cannot collide because they
  live on **different pages**, not overlapping z-layers.
- **More room.** Sections breathe: system prompt is comfortable to edit,
  Skills list scrolls inside a real column, future sections (e.g. a planned
  document manager, an LLM gateway pane) have room to land.
- **Same controls, same semantics.** Every behavior shipped in 006/017/025/027
  works exactly as before — cloud, delivery, experiment, clear, skills. This
  spec is a **relocation**, not a feature redesign.

## Goals

- Clicking ⚙️ in the header **routes** to a full-page `Config` view (replacing
  `page: "sim" | "learn"` with `page: "sim" | "learn" | "settings"`), the same
  way the Book button routes to Learn.
- The page lives in `frontend/src/settings/SettingsPage.tsx`, composed of the
  same section components that already exist (Cloud, Delivery, Experiment,
  Clear databases, Skills) — extracted from `SettingsPanel.tsx` as small
  presentational siblings so the page reads as five clear blocks, not one
  ~360-line component.
- The Inspector and the chat panel only exist on the simulator page; Settings
  does not render either, so the overlap regression cannot recur.
- The header ⚙️ button uses the **same toggle pattern as Learn** (gear icon
  when off-page, back-arrow when on-page, same `border + color` "active" styling).
  Only one of {Learn, Settings} can be the open page at a time.
- All section semantics are preserved: per-conversation experiment scope, draft
  composer key, inline confirm for clear, cached `/api/config`, dirty/reset.
- Bilingual: any new prose (page title, back/breadcrumb, empty-state) ships en + pt.

## Non-goals

- **No real router** (`react-router` or otherwise). The codebase already opts for
  a simple `useState` toggle for Learn; Settings inherits the same pattern. URL
  deep-linking, browser-back, sharable links are explicitly out of scope.
- **No new controls.** Cloud overlay, delivery toggle, experiment knobs, clear,
  skills — all unchanged in shape and behavior. No new fields on `ChatRequest`,
  no new endpoints, no new `Stage`.
- **No persistence change.** Experiment overrides remain per-conversation
  in-memory (`useExperiment`), draft prefs remain in the `useSettings`
  localStorage slice. The Settings page reads the **same** stores.
- **No simultaneous Settings + Inspector.** This spec deliberately moves
  Settings off the canvas; an "in-canvas drawer" design was rejected because
  the popover already proved it doesn't scale.
- **No animations / route transitions** beyond what already exists for
  Sim ↔ Learn (which is to say: an instant swap).
- **No relocation of the inline header CloudToggle.** The compact `<CloudToggle />`
  that sits in the header at lg+ stays where it is; the **full** Cloud section
  on the new page mirrors what was inside the popover.
- **No spec-driven mobile redesign.** The page lays out as a single column on
  narrow screens (sections stack), but a tablet/phone-specific layout pass is
  not in scope.

## User-facing behavior

**Header toggle.** The ⚙️ button keeps its current position (between
`LanguageToggle` and the `Divider`). When `page === "settings"`, the icon flips
to a back-arrow and the label reads **"Simulator"** (the same label the Book
button uses when on Learn). Clicking it returns to `page = "sim"`. Both the
Learn button and the ⚙️ button are mutually exclusive: clicking Learn while on
Settings (and vice-versa) swaps to the other page, not back to Sim.

**Page layout.** A single scrollable column, max-width comfortable for reading
(≈ 900–1000px), centered, with a discreet **page header** that reuses the
existing settings title + gear glyph and shows a short tagline ("Pipeline
options, experiment knobs, and data controls"). Below the header, five
sections in this fixed order, separated by the same hairline divider used
inside the popover today:

1. **Cloud overlay** — `<CloudToggle alwaysLabels />` with its own label.
2. **Response delivery** — Streaming (SSE) vs Batch (JSON), unchanged radios.
3. **🧪 Experiment** — system prompt, tools, top-k, simulate failure. The
   prompt textarea defaults to **8 rows** (vs the popover's 5) since vertical
   space is no longer scarce.
4. **🗑️ Clear databases** — inline confirm, unchanged semantics.
5. **🎓 Skills** — the existing `<SkillsSettings />` CRUD list, rendered with
   no `max-h-72` cap (the page itself scrolls).

**Inspector & chat panels** are not rendered on the Settings page. The page
fills the area below the header (and below the optional health banner). The
existing **first-visit auto-tour** (037) is unaffected: it only fires on
`page === "sim"`, so opening Settings does not start a tour, and entering
Settings during a tour does not break it (the tour is paused while off-page;
returning to Sim resumes wherever it was).

**Health banner & header chrome** remain visible on the Settings page
(consistent with how Learn already behaves) — the user must always see whether
the backend is reachable and whether the API key is configured, no matter
which page they're on.

## Acceptance criteria

> Tests use Vitest + React Testing Library (already wired by spec 040). No
> backend test changes — this is FE-only and adds no protocol surface, so
> `STAGE_TO_STATION` / `STAGE_TO_PHASE` exhaustiveness tests stay green
> without modification.

1. **AC1 — Clicking ⚙️ routes to the Settings page (no popover).** Given
   the App on `page === "sim"`, when the user clicks the ⚙️ Config button in
   the header, the simulator canvas, chat panel, and Inspector are no longer
   rendered, and a region with `role="region"` (or test id `settings-page`)
   containing the Cloud, Delivery, Experiment, Clear, and Skills section
   headings is rendered. **The legacy popover dropdown is not rendered**
   (assert by absence of its previous content within a popover element).
2. **AC2 — A second click on ⚙️ returns to the simulator.** Given
   `page === "settings"`, clicking the ⚙️ button (now showing the back-arrow
   icon + "Simulator" label) restores the canvas + Inspector + chat layout
   and removes the Settings region.
3. **AC3 — Learn and Settings are mutually exclusive.** Given
   `page === "settings"`, clicking the Learn (📖) button switches the page to
   `learn`, the Settings region disappears, and the `LearnPage` renders.
   Symmetrically, given `page === "learn"`, clicking the ⚙️ Config button
   switches to `settings`, the LearnPage disappears, and the Settings region
   renders. Only one of {Sim, Learn, Settings} is mounted at any time.
4. **AC4 — Header toggle icon flips per active page.** When `page === "sim"`,
   the ⚙️ button shows the gear icon and the label "Config" (en) /
   "Configurações" (pt). When `page === "settings"`, it shows a back-arrow
   icon and the label "Simulator" (en) / "Simulador" (pt) — exactly the same
   labels the Learn toggle already uses on its side. Active border/colour
   styling matches the Learn button's active state.
5. **AC5 — All five existing sections render on the page.** The Settings page
   renders, in this order: the **Cloud** section, the **Response delivery**
   section, the **🧪 Experiment** section (system prompt textarea + tools list
   + top-k slider + failure modes), the **🗑️ Clear databases** section
   (inline confirm), and the **🎓 Skills** section (the existing
   `<SkillsSettings />`). Each section's heading is present in the DOM and
   matches the bilingual strings already in `i18n/strings.ts`.
6. **AC6 — Section behavior is identical to the popover (regression).**
   (a) Setting `delivery=batch` flips `useSettings.mode` to `"batch"`.
   (b) Typing into the system prompt textarea updates
   `useExperiment.byConv[conv].systemPrompt`; the **Reset** button appears
   when dirty and clears the override on click. (c) Unchecking a tool removes
   it from `enabledTools` for the active conversation; re-checking restores it.
   (d) Changing the top-k slider updates `byConv[conv].topK`.
   (e) The **Clear databases** button enters confirm mode, `Yes, clear` calls
   `useChat.clearAll()` once, and the success line renders with the returned
   counts. (f) Skills CRUD continues to work via `<SkillsSettings />`
   (covered by its own existing tests; this spec only asserts the component
   mounts on the page).
7. **AC7 — Experiment scope stays per-conversation.** Given two conversations
   c1 and c2, setting `systemPrompt = "x"` on the Settings page while c1 is
   active stores it under `byConv[c1]`; switching to c2 (the page does **not**
   own the active conversation, the existing store does) shows c2's value, not
   "x". The page reads the active conversation id from `useChat`, the same
   way the popover did.
8. **AC8 — First-visit auto-tour only fires on the Sim page.** Opening the
   app fresh with `shouldAutoOnboard()` true does not call `startTour()` if
   `page === "settings"` at mount (this is hypothetical; default mount is
   `"sim"`, so the test just pins that the tour effect depends on page or
   that opening Settings later does not re-trigger `startTour`). The intent:
   ⚙️ never starts a tour and never restarts one.
9. **AC9 — The legacy `SettingsPanel` popover is gone.** `App.tsx` does not
   render `<SettingsPanel />` anywhere; the file is either deleted or its
   default export is replaced with the page entry component (per the plan).
   The header ⚙️ button is a thin `ConfigToggle` sibling of the Learn button,
   not a popover container.
10. **AC10 — Bilingual (§4).** Every new user-facing string introduced by this
    spec — the page title, the page tagline, the back-to-simulator label
    (reuses `t.app.simulator`), the optional ⚙️ button label `t.app.config`
    (en: "Config" / pt: "Configurações") — has non-empty en **and** pt entries
    in `i18n/strings.ts`. No string ships in only one language.
11. **AC11 — TypeScript clean, protocol untouched.** `tsc --noEmit` is green;
    `Stage` / `Phase` / `TraceEvent` are unchanged; `STAGE_TO_STATION` and
    `STAGE_TO_PHASE` remain total without edits; no new exports from
    `backend/app/schemas.py`.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.**
- Mirror in `frontend/src/types/events.ts`: **n/a.**
- Station mapping (`stations.ts`): **unchanged.**
- Backend touched: **none** (no schema, no endpoint, no test).

This spec is entirely a **frontend relocation**.

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Popover or page?** → **Page.** The popover overlap with the Inspector
  is the proximate trigger; the section count is the structural reason. The
  app already has a one-toggle precedent (Learn).
- [x] **Router or `page` state?** → **`page` state.** Matches Learn; no new
  dependency, no URL design discussion. Deep-linking is out of scope.
- [x] **One toggle or two?** → **One toggle (mutually exclusive).** Clicking
  Learn while on Settings goes to Learn (not back to Sim). Symmetric for ⚙️
  while on Learn. Simpler mental model.
- [x] **Extract section components, or keep one big file?** → **Extract.**
  Five `SettingsCloud`, `SettingsDelivery`, `SettingsExperiment`,
  `SettingsClear`, plus the existing `SkillsSettings`. Each is a small file
  exporting one component. The page is then a thin composition + page chrome.
- [x] **Should the page have a "Save" / "Apply" button?** → **No.** Every
  control is already live-updating (this is how the popover behaves); a Save
  button would invent semantics that don't exist.
- [x] **Should Settings show the canvas behind it (drawer / modal)?** → **No.**
  The whole point is to give sections room; a backdrop concedes the point.
- [x] **Where does the section order come from?** → **Same order as today's
  popover** (Cloud, Delivery, Experiment, Clear, Skills). The popover order
  is the contract; reordering is a separate UX call.
- [x] **Does Settings appear in the keyboard tour (014)?** → **No.** The tour
  is about the executable lifecycle on the canvas; Settings is configuration.
  No tour step touches it; opening Settings pauses the tour playback (the
  tour state remains; returning to Sim resumes it).

## Out of scope / deferred

- A real client-side router with URL deep-linking (would unlock
  shareable settings links and browser-back, but is a separate concern).
- A section-anchor TOC sidebar inside the Settings page (the page is short
  enough to scroll today; revisit when a sixth/seventh section lands).
- A documents/files manager section (would be its own spec; the page leaves
  room for it).
- A Settings search / quick filter affordance.
- Mobile (sub-md) layout polish — a separate UX pass when the simulator
  itself gains a mobile design.
- A "what changed" diff between the user's experiment overrides and defaults
  (interesting but feature-creep for this relocation).
- A keyboard shortcut for ⚙️ (no existing shortcut for Learn either).
