# Tasks: Scenario tracks (themes axis)

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). **Frontend-only**, view-only —
> there is **no backend, no `events.ts`, no `Stage`**.

> **Deviations from the plan (all simplifications, recorded for honesty):**
> 1. `track` is appended as the **last** positional arg of the visible-set builders
>    (after the existing `showUpload`/`showRagless`), not the 3rd — so every existing
>    call site compiles untouched (the plan flagged this option).
> 2. **`deriveView` was NOT modified** (planned T11). Following the 008 precedent,
>    `deriveView` inits every station idle and previews never receive events, so track
>    filtering is purely a render concern handled in `FlowCanvas` — less churn, safer.
> 3. **Hops are filtered by endpoint visibility**, not a per-hop `tracks` tag — a hop
>    disappears when either endpoint is hidden by the track (no new hop data needed).
> 4. Track **names/blurbs live in `i18n/strings.ts`** (they're translatable); `track.ts`
>    holds only the type + store (mirrors the `cloud.ts` split). The `blurb` doubles as
>    the hover tooltip (like `ScenarioToggle`), so no separate `glossary` keys were added.

## A. Track store (AC1)

- [x] **T1 — test first (AC1):** `frontend/src/lib/track.test.ts` — store defaults to
  `all`, persists/restores, junk → `all`, `isTrack` guard. *(red → green)*
- [x] **T2 — implement:** `frontend/src/lib/track.ts` (`Track` type, `TRACK_ORDER`,
  `ALL_TRACKS`, `useTrack`, `isTrack`).

## B. Track-aware visible-set builders (AC2, AC3, AC4, AC6)

- [x] **T3 — test first (AC2 — Simple immune):** every track ⇒ same station/hop/tier set
  as `("simple","all")`.
- [x] **T4 — test first (AC3 — previews only):** comingSoon-security hidden under
  `aiops`, shown under `security`/`all`; real + base stations shown under every track.
- [x] **T5 — test first (AC4 — Advanced clusters):** security/aiops/agent each show their
  cluster and hide the others; `all` = today's advanced.
- [x] **T6 — test first (AC6 — no empty tiers):** the `aiops` tier disappears under
  `track=agent`.
- [x] **T7 — implement (types + tags):** `tracks?: Track[]` on `StationMeta`; tagged the
  8 previews (gateway/cache/eval/observability → `aiops`, guardrails → `security`,
  researcher/coder/critic → `agent`).
- [x] **T8 — implement (builders):** widened `visibleStationsFor`/`visibleHopsFor`/
  `visibleTiersFor`/`visibleStationIdsFor` with `track = "all"`; `passesTrack` safety
  rule (hide only `comingSoon`); `visibleTiersFor` drops zero-station tiers; added
  `tracksForScenario`.

## C. Layout + projection (AC5, AC6)

- [x] **T9 — test first (AC5):** `phases.test.ts` parity unchanged + `track.test.ts`
  asserts no executing-rung stage owner is hidden by any track.
- [x] **T10 — implement (layout):** `computeLayout(expanded, scenario, showUpload,
  showRagless, track = "all")` threads `track`; existing empty-tier skip + boundary
  recompute already generalize (`layout.test.ts` stays green).
- [x] **T11 — derive: no change needed** (see deviation #2). `deriveView` stays untouched.

## D. UI wiring (AC7)

- [x] **T12 — test first (AC7):** `tracksForScenario("simple").length <= 1`,
  `("advanced") = {agent,aiops,security}`, never includes `all`.
- [x] **T13 — implement (toggle):** `components/TrackToggle.tsx` — self-hides when
  `tracksForScenario(scenario).length <= 1`; resets to `all` when leaving a rung that
  offered the active theme; mounted in `App.tsx` beside `<ScenarioToggle/>`.
- [x] **T14 — implement (canvas):** `FlowCanvas` reads `useTrack`, passes `track` into
  `computeLayout`/`visible*For`.

## E. i18n (AC8)

- [x] **T15 — test first (AC8):** every theme + `all` has `name`/`blurb` in en + pt.
- [x] **T16 — implement (strings):** `t.track` block (label + 6 name/blurb pairs), en + pt.

## F. Close out

- [x] **T17 — refactor + verify:** `npm run build` clean (tsc), full Vitest **526/526**
  green. **Visually verified** via `scripts/shot-tracks.mjs` (Playwright): Simple has no
  track toggle; Advanced shows the segmented selector; `all` renders the full preview,
  `security`/`aiops`/`agent` each collapse to one cluster with the AI-Ops tier dropping
  cleanly (no empty box) and the boundary recomputing. Simple unchanged.
- [x] **T18 — status:** `spec.md` → **done**; `docs/roadmap.md` matrix already points
  here; `MEMORY.md` pointer updated.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (AC1–AC8) — `track.test.ts` (19) +
  `phases.test.ts`/`layout.test.ts` extensions
- [x] `npm run build` passes (`tsc --noEmit` + build) and `npm test` (Vitest) green
- [x] **No backend change** — `events.ts`/`schemas.py` untouched; every `Stage` still
  mapped to one station (§6) and one timeline phase
- [x] Every new user-facing string exists in en **and** pt (§4); no new tier/station
  (so no new `clouds` map — §5 unaffected)
- [x] `simple` is byte-for-byte equivalent under every track value (regression, AC2)
- [x] `spec.md` status updated to `done`
