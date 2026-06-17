# Spec: Mobile layout for the demo build

| | |
|---|---|
| **ID** | 063-mobile-demo-layout |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

The online showcase (the `VITE_DEMO_MODE` GitHub Pages build, 058) is a portfolio
piece meant to be opened by anyone, anywhere — and a large share of that traffic is
mobile (a link shared on LinkedIn/X, opened on a phone). But the simulator's layout
is a **fixed three-column desktop grid**: a 340px Chat panel + the canvas + a 372px
Inspector panel side by side, with a horizontal Timeline below. On a ~375px phone the
two side panels alone are 712px wide and are `shrink-0`, so they overflow and the
canvas is crushed to near-zero. The header is a single non-wrapping control row. The
result on a phone is unusable.

We want the **demo build only** to present a phone-friendly layout, while the live,
key-required app (the GitHub-local route) stays **byte-for-byte unchanged**. The demo
is the right place to invest in mobile because it is the public, link-shared surface;
the live tool is a developer/desktop experience.

This combines two approaches discussed: **(A)** a single-pane, tabbed mobile layout
that shows one of {Chat · Diagram · Inspector} at a time via a bottom tab bar, and
**(C)** header cleanup (wrapping + dropping non-essential controls) plus a
canvas-first default — so the diagram, the heart of the showcase, leads.

## Goals

- On a narrow viewport **in the demo build**, replace the three-column layout with a
  single-pane, tabbed layout (bottom tab bar: Chat · Diagram · Inspector) so each
  surface gets the full screen width.
- Keep the diagram canvas-first: the Diagram tab is the default on load.
- Tidy the header on mobile (wrap instead of overflow; non-essential controls hidden).
- Touch-friendly controls (tab bar targets ≥ 44px).
- **Zero change to the live (non-demo) build, and zero change to the demo build on a
  desktop-width viewport** — the new layout is gated on `isDemo()` **and** a mobile
  viewport together.

## Non-goals

- No change to the live/local key-required build at any width.
- No new pipeline `Stage`, `Phase`, or `TraceEvent`; no backend change (FE-only).
- Not a general responsive redesign of the desktop app — desktop stays the three-column
  layout. Narrowing a desktop *non-demo* window does **not** trigger the mobile layout.
- No new canvas geometry — the existing `computeLayout` + React Flow `fitView` are reused.
- The Timeline playback rail is not redesigned; it rides with the Diagram pane.

## User-facing behavior

In the **demo build on a phone-width viewport** (the live build and demo-on-desktop are
unaffected):

- The three side-by-side panels are replaced by **one visible pane at a time**, chosen
  by a **bottom tab bar** with three tabs: **Diagram**, **Chat**, **Inspector**.
- The **Diagram** tab is active on first load (canvas-first); React Flow `fitView`s the
  graph to the full phone width.
- Tapping a **Chat** sample-question chip works as today; the answer streams. Tapping a
  **station node** on the Diagram automatically switches to the **Inspector** tab so the
  tapped node's data is revealed (mirrors today's "selecting a station opens the
  Inspector" behavior, 013).
- The Timeline playback rail appears with the **Diagram** tab.
- The header **wraps** rather than overflowing; controls already hidden below the `xl`
  breakpoint stay hidden, so the masthead stays one-or-two tidy rows.

In a normal build, or in the demo build at desktop width, none of the above appears and
the existing three-column layout renders exactly as today.

## Acceptance criteria

1. **AC1** — `useIsMobile()` returns `false` when `matchMedia('(max-width: 767px)').matches`
   is `false` and `true` when it is `true`, updates when the media query fires a `change`
   event, and is SSR/no-`matchMedia` safe (returns `false` when `matchMedia` is absent).
2. **AC2** — The mobile tab layout renders **only** when `isDemo()` **and** the viewport is
   mobile. In a non-demo build at mobile width, the existing three-column layout
   (`SidePanel` · `main` · `SidePanel`) renders and **no** tab bar is present. In a demo
   build at desktop width, likewise the three-column layout renders and no tab bar appears.
3. **AC3** — In the demo+mobile layout, exactly **one** of the three panes (Diagram, Chat,
   Inspector) is visible at a time, while the other two remain **mounted** in the DOM
   (hidden via CSS, not unmounted) — so the mounted `ChatPanel` never re-runs its init and
   the live canvas trace is never reset.
4. **AC4** — Clicking a tab in the bottom tab bar switches the visible pane to that tab's
   content and marks that tab active (`aria-selected="true"` / pressed); the other tabs are
   inactive.
5. **AC5** — On first render of the demo+mobile layout, the active tab is **Diagram**.
6. **AC6** — Selecting a station node while in the demo+mobile layout switches the active tab
   to **Inspector** (the tapped node's data is shown without a manual tab change).
7. **AC7** — Each bottom tab-bar control has a touch target of at least 44px tall
   (asserted via the applied min-height class/style).
8. **AC8** — In the demo+mobile layout the header container applies `flex-wrap`, so controls
   wrap to a second row instead of overflowing; the non-`xl` controls stay hidden.
9. **AC9** — Every new user-facing string (the three tab labels) exists in both `en` and `pt`.
10. **AC10** — Regression: with `isDemo()` false (normal build), `App` renders the existing
    two `SidePanel`s + `main` structure and never mounts the mobile shell — at any width.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — FE layout only; the event protocol is untouched.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a** (no new station; reuses existing canvas).

## Open questions (clarify before planning)

- [x] Combine A (tabbed single-pane) + C (header cleanup + canvas-first)? → **Yes** (user
  decision).
- [x] Demo-only, or also live at narrow width? → **Demo-only**: gated on `isDemo() && mobile`;
  the live build is unchanged at every width (user decision).
- [x] Breakpoint? → **767px** (`max-width: 767px`, i.e. below Tailwind `md`) — phones/small
  tablets get the tab layout; ≥768px keeps the three-column desktop layout.
- [x] Default tab? → **Diagram** (canvas-first), per approach C.

## Out of scope / deferred

- A responsive redesign for the **live** build (would be its own spec).
- Landscape-specific tuning / split view on larger tablets.
- Per-pane swipe gestures between tabs (tap-only for now).
- Mobile-specific tuning of the Settings / Learn pages (this spec covers the Sim view).
