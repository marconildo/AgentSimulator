# Spec: First-visit onboarding — auto-tour, calmer pacing, canvas-first frame

| | |
|---|---|
| **ID** | 037-first-visit-onboarding |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Status: **done** (full TDD; 322 Vitest pass — +11 new, `tsc`/`vite build` green; no backend
> change). Manual browser confirm of the first-visit auto-tour + collapsed Inspector + ◀ ▶
> pacing still recommended.
>
> Resolved (clarify, 2026-05-27): **auto-tour only** (no welcome modal); Inspector starts
> collapsed **only on the first visit**; tour pacing gets a **longer dwell (~7 s) + manual
> ◀ ▶** that pause auto-play. Frontend-only, no protocol/`Stage`/text-model change.

## Problem / motivation

The first time a junior opens the app they see three panels + the diagram + nine phase
pills + the slider + the log all at once — too much, with no obvious entry point. The
guided tour (005 → 014) that would orient them already exists, but it only fires when the
user *clicks* "Preview the journey", so a newcomer never discovers it. Two smaller frictions
compound it: the Inspector opens expanded and competes with the canvas for the first glance,
and each tour stop advances on a fixed ~3.5 s timer — too fast to read the balloon, scan the
canvas, and absorb a phase before it moves on, with no way to step at your own pace.

## Goals

- **On the very first visit**, the app **auto-starts the guided tour** so the journey
  through the pipeline plays itself, unprompted — the newcomer sees what the app *does*
  before being asked to do anything.
- Auto-onboarding fires **at most once, ever** (per browser): a page refresh, starting a new
  conversation, or any later visit does **not** re-trigger it. Tracked by a `localStorage`
  flag, mirroring `useScenario`/`useCloud`/`useTheme`.
- **On the first visit only**, the Inspector starts **collapsed** so the canvas is the hero
  of the first frame; on every later visit it keeps today's expanded default.
- The tour is **readable at a human pace**: a longer per-stop dwell (~7 s) **and** manual
  ◀ ▶ controls to step forward/back; using a manual control **pauses** the auto-play so the
  visitor reads on their own schedule (pause/resume/stop stay as today).
- Bilingual (en + pt) for every new label; no protocol, `Stage`, or backend change.

## Non-goals

- **No welcome modal / overlay** and no spatial "1) type here, 2) watch, 3) click" callouts
  (the rejected onboarding option) — orientation is delivered by the existing scripted tour
  alone.
- No change to **what** the tour narrates, the phases it walks, or the canned trace it uses
  (014 stands); this only changes **when** it starts and **how fast** it advances.
- No persisted "remember my Inspector open/closed choice" across visits (the rejected
  Inspector option) — the collapse is strictly a first-visit default.
- No new `Stage`/`Phase`/`TraceEvent`, no new station/hop/tier, no backend.

## User-facing behavior

- **First ever visit (clean browser):** the simulator loads with the **Inspector collapsed**
  (canvas takes the space), and the **guided tour starts on its own** — it loads the bundled
  canned trace and walks Request → Memory → Route → … → Persist with the balloon narration,
  one stop every ~7 s. The visitor can ⏸ pause, ◀ ▶ step, or ⏹ stop at any time. The moment
  onboarding starts, the "seen it" flag is written, so **refreshing or starting a new
  conversation will not auto-start it again**.
- **The collapsed Inspector during the tour:** it **stays collapsed** while the tour runs —
  the tour highlights stations and the balloons teach; the panel is not forced open. (A
  manual station **click** still re-opens the Inspector, exactly as today.)
- **Later visits / refresh:** no auto-tour; the Inspector opens expanded (today's behavior).
  The "▶ Tour" / "Preview the journey" button works exactly as before.
- **Tour transport (any time the tour runs):** alongside ⏸/▶ (pause/resume) and ⏹ (stop)
  there are now **◀ (previous phase)** and **▶ (next phase)** buttons. Pressing either jumps
  one stop and **pauses** the auto-advance; ◀ at the first stop and ▶ at the last stop are
  no-ops (clamped). Auto-advance, when playing, now dwells ~7 s per stop.

New strings: the ◀ / ▶ control labels (`tour.prev`, `tour.next`) — en + pt.

## Acceptance criteria

> All pure-projection / store FE tests (Vitest) — no `[openai]` needed.

1. **AC1 — First-visit detection persists.** `isFirstVisit()` returns `true` when no
   onboarding flag is in `localStorage`, and `false` after `markOnboarded()` has run; the
   flag survives a reload (it is written to `localStorage`).
2. **AC2 — Auto-onboard fires at most once.** `shouldAutoOnboard()` is `true` only on the
   first visit and `false` after `markOnboarded()`, so a refresh or a new conversation never
   re-triggers the auto-tour.
3. **AC3 — Inspector collapsed on first visit only.** `initialInspectorCollapsed()` is
   `true` on a first visit and `false` once onboarded; the simulator store initializes
   `inspectorCollapsed` from it.
4. **AC4 — The tour preserves canvas emphasis.** Selecting a station *via the tour* sets the
   selected station **without** forcing the Inspector open (a collapsed Inspector stays
   collapsed); a manual station click (`select(id)`, default reveal) still re-opens it (013
   AC3 unchanged).
5. **AC5 — Calmer dwell.** `TOUR_PACE_MS` is ≥ 7000 ms (raised from 3500), so a tour stop
   stays on screen long enough to read.
6. **AC6 — Manual step forward/back, paused.** `tourNext(state)` advances one stop (clamped
   at the last) and `tourPrev(state)` retreats one (clamped at the first); **both set status
   to `paused`**; both are inert when the tour is `idle`/`done`.
7. **AC7 — No protocol / Stage / text-model change; bilingual.** No `Stage`/`events.ts`
   change; `STAGE_TO_STATION` and `STAGE_TO_PHASE` stay total; `tsc --noEmit` + `vite build`
   pass; `tour.prev` and `tour.next` exist in **en and pt**.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station mapping: unchanged. This is UI orchestration (a first-visit guard, store init, two
  pure tour reducers, a pacing constant) — it only *reads* existing tour/projection state.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Onboarding format?** → **Auto-tour only**, no welcome modal. (Rejected: welcome
  modal with 1/2/3 spatial guide; modal-then-tour.)
- [x] **Inspector collapse scope?** → **First visit only**; later visits keep today's
  expanded default. (Rejected: persisted open/closed preference.)
- [x] **Tour pacing?** → **Longer dwell (~7 s) + manual ◀ ▶**; manual use pauses auto-play.
  (Rejected: longer dwell only; manual only.)
- [x] **Does the auto-tour fight the collapsed Inspector?** → No — the tour selects stations
  **without** the reveal side-effect, so the canvas-first frame holds through the tour; the
  balloon narration does the teaching. Manual clicks still reveal.

## Out of scope / deferred

- A "replay the intro" entry point for returning users (the manual ▶ Tour already covers
  this).
- Any welcome-modal / coach-mark onboarding — parked unless the auto-tour proves
  insufficient.
- Persisting the Inspector open/closed choice across sessions.
