# Spec: Theme configuration (dark / light)

| | |
|---|---|
| **ID** | 001-theme-configuration |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

Apply a theme configuration across the app's screens, with two modes — dark and
light — so the UI is comfortable for users who find a dark-only interface too dark.

## Problem / motivation
Today the app ships only a Dark mode, which can be too dark for some people. A light
mode gives them a comfortable alternative without forcing the existing dark look on
everyone.

## Goals
- Build a theme system that lets the user switch between dark and light mode.
- Drive every color from theme variables (no hardcoded colors), so switching the
  theme re-colors every surface of the app consistently.

## Non-goals
- More than two themes — only **dark** and **light**.
- Per-user custom palettes or color customization.
- A "system/auto" mode that follows the OS `prefers-color-scheme`.
- Theming the backend `/docs` (FastAPI/Swagger) page.

## User-facing behavior
The user can switch between dark and light mode by clicking a **Theme** toggle in the
UI, placed alongside the existing language and cloud toggles. On first visit (nothing
stored) the app defaults to **dark** — today's look. The choice persists across reloads.

## Acceptance criteria
1. **AC1** — The user can switch between dark and light mode by clicking the Theme toggle in the UI.
2. **AC2** — The selected mode is persisted in `localStorage`, restored on reload, and defaults to **dark** when nothing is stored.
3. **AC3** — The theme is applied across all screens of the app.
4. **AC4** — The theme is applied to all stations.
5. **AC5** — The theme is applied to all hops.
6. **AC6** — The theme is applied to all messages.
7. **AC7** — No hardcoded color values remain on themed surfaces: every color resolves from a theme variable, so switching theme leaves no surface stuck in the other theme's colors.

## Protocol / stage impact
Frontend-only change. No reasoning/data lifecycle is touched.

- New/changed `Stage`(s): none
- Mirror in `frontend/src/types/events.ts`: n/a
- Station it maps to in `stations.ts`: none

## i18n note (constitution §4)
The Theme toggle ships its label/tooltip in both languages: **en** `Theme` / **pt** `Tema`
(plus the mode names — `Dark`/`Light` ↔ `Escuro`/`Claro`).

## Open questions (clarify before planning)
_All resolved (Q1–Q7) and folded into Goals / Non-goals / Acceptance criteria above._

## Out of scope / deferred
- A "system/auto" theme following the OS `prefers-color-scheme`.
- WCAG AA contrast guarantees for the light theme.
- Re-tuning / desaturating the existing **dark** palette — the dark theme stays as-is.
