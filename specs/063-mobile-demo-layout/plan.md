# Plan: Mobile layout for the demo build

> The HOW. Respects `.specify/constitution.md`. No constitution amendment needed: this is
> a presentation-only change gated behind the existing `VITE_DEMO_MODE` carve-out (058);
> the live build is untouched, and "everything is real / single provider" (§2/§3) only
> ever applied to the live build.

## Approach

Two small, additive seams, both gated on `isDemo() && useIsMobile()` so neither the live
build nor demo-on-desktop changes:

1. **`useIsMobile()` hook** (`frontend/src/lib/useIsMobile.ts`) — a tiny `matchMedia`
   subscriber for `(max-width: 767px)`. SSR/no-`matchMedia` safe (returns `false`). This is
   the only new viewport primitive; no other code reads window width.

2. **`MobileShell` component** (`frontend/src/components/MobileShell.tsx`) — a single-pane,
   tabbed container. It receives the **same** three children App renders today (the Chat
   panel, the canvas `main` content, the Inspector panel) plus the Timeline, keeps **all of
   them mounted**, and shows exactly one via CSS (`hidden` on the inactive panes — never
   unmount, to honor the App-level comment that unmounting `ChatPanel` resets the canvas
   trace). A bottom tab bar (`role="tablist"`) flips a local `active: "canvas"|"chat"|
   "inspector"` state, defaulting to `"canvas"`. A `useEffect` on the store's `selected`
   switches `active` to `"inspector"` when a station is selected (AC6), mirroring 013.

App chooses the shell at the top of the Sim view:

```
const mobileDemo = isDemo() && useIsMobile();
…
page === "sim" && (mobileDemo ? <MobileShell …/> : <existing three-column block/>)
```

The existing three-column JSX is **unchanged**; we only wrap the Sim branch in a chooser.
The header gets a conditional `flex-wrap` (applied only when `mobileDemo`) so it wraps
instead of overflowing; the controls already gated behind `xl:`/`lg:` stay hidden.

**React Flow re-fit on reveal.** A hidden (`display:none`) canvas pane has zero size, so
React Flow can't `fitView` until it's shown. When the Diagram tab becomes active, dispatch
a `resize` event (and/or call the React Flow instance's `fitView`) so the graph fits the
phone width. Handled inside `MobileShell` on the `active === "canvas"` transition.

### Alternatives considered

- **Stacked vertical scroll (option B)** — simpler, but buries the canvas in a scroll well
  and forces long scrolling on the smallest screens. Rejected in favor of tabs.
- **Reusing the `SidePanel` 44px rail collapse on mobile** — two 44px rails plus a squeezed
  canvas is still cramped on a phone; the rail metaphor doesn't scale down. The tab bar
  replaces the rails on mobile.
- **A Zustand store field for the active tab** — unnecessary; the active pane is pure local
  view state with one cross-read (`selected`). Kept as component `useState` to avoid
  polluting the shared store.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/useIsMobile.ts` — **new**: `matchMedia('(max-width: 767px)')` hook.
- `frontend/src/lib/useIsMobile.test.ts` — **new**: AC1.
- `frontend/src/components/MobileShell.tsx` — **new**: tabbed single-pane shell + bottom
  tab bar; keeps panes mounted; canvas re-fit on reveal; auto-switch to Inspector on select.
- `frontend/src/components/MobileShell.test.tsx` — **new**: AC3–AC7.
- `frontend/src/App.tsx` — wrap the Sim branch in the `mobileDemo ? <MobileShell/> :
  <three-column>` chooser; conditional `flex-wrap` on the header. The three-column JSX is
  moved verbatim into the `else` branch (no behavioral change).
- `frontend/src/App.test.tsx` (or a focused `App.mobile.test.tsx`) — AC2, AC10 (gating +
  non-demo regression).
- `frontend/src/i18n/strings.ts` — three tab labels in en + pt.

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent` added or changed; `events.ts` mirror untouched;
  `STAGE_TO_STATION` / `STAGE_TO_PHASE` untouched.

## Data model changes

- None (no vector store, no SQLite). FE-only, no backend reachable in the demo build.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `mobile.tab.canvas` | Diagram | Diagrama |
| `mobile.tab.chat` | Chat | Chat |
| `mobile.tab.inspector` | Inspector | Inspetor |

(Final nesting decided in implementation; e.g. under a `mobile` group in `strings.ts`.
"Chat" is intentionally identical in both languages — it's the established term in the app.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

All tests are Vitest (FE-only). `matchMedia` is not implemented by jsdom, so tests stub
`window.matchMedia` (a small `vi.fn()` returning `{ matches, addEventListener, … }`); demo
gating tests stub `import.meta.env.VITE_DEMO_MODE` via `vi.stubEnv` (same pattern as
`ChatPanel.demo.test.tsx`). App-level tests reuse the existing `ResizeObserver` + `scrollTo`
polyfills already added for spec 041.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | hook returns matches; updates on `change`; false without `matchMedia` | `frontend/src/lib/useIsMobile.test.ts` |
| AC2 | mobile shell only when `isDemo()` && mobile; not in non-demo@mobile nor demo@desktop | `frontend/src/App.mobile.test.tsx` |
| AC3 | one pane visible, other two still in the DOM (hidden) | `frontend/src/components/MobileShell.test.tsx` |
| AC4 | clicking a tab switches the visible pane + sets active | `MobileShell.test.tsx` |
| AC5 | default active tab is Diagram | `MobileShell.test.tsx` |
| AC6 | selecting a station switches active tab to Inspector | `MobileShell.test.tsx` |
| AC7 | tab controls have ≥44px min-height class | `MobileShell.test.tsx` |
| AC8 | header has `flex-wrap` when demo+mobile | `App.mobile.test.tsx` |
| AC9 | tab labels present in en + pt | `frontend/src/i18n/strings.test.ts` (or MobileShell test) |
| AC10 | non-demo build renders the two `SidePanel`s, no mobile shell | `App.mobile.test.tsx` |

## Risks / trade-offs

- **React Flow fit on hidden→shown.** A `display:none` pane has no measurable size; React
  Flow won't lay out until revealed. Mitigation: dispatch `resize` / call `fitView` on the
  `active === "canvas"` transition (handled in `MobileShell`). Verified manually on a phone
  viewport.
- **Keep panes mounted.** Unmounting `ChatPanel` re-runs `init() → openSession() →
  useSimulator.reset()`, wiping the live trace (documented in `App.tsx`). The shell must hide
  inactive panes with CSS, never conditionally unmount them. Pinned by AC3.
- **jsdom lacks `matchMedia`.** Tests must stub it; the hook itself guards
  `typeof window.matchMedia` so production SSR/old-browser paths don't throw.
- **Determinism / single-instance (§7).** Unaffected — pure client view state, no shared
  state, no persistence.
- **Scope creep.** Settings/Learn pages are explicitly out of scope; only the Sim view's
  three-column block is swapped. The header tweak is a single conditional class.
