# Plan: Theme configuration (dark / light)

> The HOW. Written after `spec.md` is `clarified`. Decisions here must respect every
> principle in `.specify/constitution.md`; if one must bend, amend the constitution
> first and note it.

## Approach

Four moving parts, mirroring patterns that already exist in the codebase:

1. **Theme tokens via CSS variables.** `index.css` already declares the color tokens
   in a Tailwind v4 `@theme` block — those values become CSS custom properties on
   `:root`, and they are the **dark** values, so dark stays the default (AC2). We
   *expand* that token set to cover every color that is currently hardcoded, then add
   a plain-CSS `[data-theme="light"] { … }` block that overrides the theme-dependent
   tokens (surfaces + text) with light values. Switching theme = setting
   `document.documentElement.dataset.theme`. Nothing re-renders by hand; every surface
   that reads `var(--color-*)` recolors automatically.

2. **A theme store**, `lib/theme.ts` — a tiny Zustand store that is a near-copy of
   `i18n/index.ts` / `lib/cloud.ts`: `ThemeId = "dark" | "light"`, key
   `agentsim.theme`, default `dark`, an `isTheme` guard, `initialTheme()` reading
   `localStorage`, and `setTheme` that persists **and** sets `dataset.theme`. Like the
   language store, it applies the persisted choice once at module load.

3. **A header toggle**, `components/ThemeToggle.tsx` — a copy of `LanguageToggle`'s
   pill group (☀️ Light · 🌙 Dark), mounted in `App.tsx` next to the language/cloud
   toggles (AC1). Labels come from `t.app.*` (§4).

4. **Tokenize the colors.** Replace the hardcoded hexes (~102 occurrences) and the
   Tailwind palette utility classes (~23, e.g. `text-sky-300`) across the components
   with `var(--color-*)` so the whole UI flips (AC3–AC7). Station accent hues in
   `stations.ts` become token strings (`"var(--color-sky)"`), and the alpha-concat
   trick in `StationNode` (`` `${accent}66` ``) is rewritten with `color-mix` (a
   `var(...)` can't take a hex-alpha suffix).

**Alternative considered:** a Tailwind `dark:` variant / `class="dark"` strategy.
Rejected — the app uses arbitrary `var(--color-*)` values, not palette utilities, so a
single set of overridable CSS variables is far less churn than rewriting every class
into `dark:`-prefixed pairs.

### Token set

Theme-dependent (flip between modes):

| token | dark (default) | light |
|---|---|---|
| `--color-base` | `#070b16` | `#f4f6fb` |
| `--color-panel` | `#0e1424` | `#ffffff` |
| `--color-panel-2` | `#131b2e` | `#eef2fb` |
| `--color-line` | `#1f2a44` | `#d6deed` |
| `--color-ink` | `#e6ecff` | `#0f1830` |
| `--color-muted` | `#8694b8` | `#54618a` |
| `--color-faint` | `#3a466b` | `#9aa6c4` |
| `--color-text-soft` | `#aab6d8` | `#46527a` |
| `--color-glow` | `#14203b` | `#dbe6fb` |
| `--color-edge-soft` | `#2a3658` | `#c4cee3` |

Accents / semantic (hue constant; light values deepened for contrast on white — I pick
sensible values per the approved clarification, no per-color sign-off):
`--color-accent` (#5b7cfa), `--color-sky` (#38bdf8), `--color-sky-soft` (#7dd3fc, also
the edge **stream** color), `--color-sync` (#8aa0c8), `--color-violet` (#a78bfa),
`--color-violet-soft` (#c4b5fd), `--color-indigo-soft` (#a5b4fc), `--color-pink`
(#f472b6), `--color-blue` (#60a5fa), `--color-ok` (#34d399), `--color-ok-soft`
(#6ee7b7), `--color-warn` (#fbbf24), `--color-orange` (#fb923c).

## Affected files

**Backend**
- None. This is a frontend-only change.

**Frontend**
- `frontend/src/index.css` — expand the `@theme` token set; add the
  `[data-theme="light"]` override block; tokenize the `body` gradient, scrollbars and
  `.react-flow__attribution` color.
- `frontend/src/lib/theme.ts` *(new)* — the theme store (mirror of `cloud.ts`).
- `frontend/src/components/ThemeToggle.tsx` *(new)* — header pill toggle.
- `frontend/src/App.tsx` — mount `<ThemeToggle/>`; tokenize the header chrome hexes
  (Learn button, demo/live badge, links).
- `frontend/src/i18n/strings.ts` — add `app.theme` / `app.themeDark` / `app.themeLight`
  (en + pt) and extend the `app` interface.
- `frontend/src/lib/stations.ts` — station/tier `accent` literals → token strings.
- `frontend/src/components/edges/FlowEdge.tsx` — `STREAM_COLOR` / `SYNC_COLOR` and the
  tooltip text hexes → tokens.
- `frontend/src/components/nodes/StationNode.tsx` — `#3a466b` / `#8694b8` / `#5b688c`
  → tokens; `` `${accent}66` `` / `` `${accent}55` `` → `color-mix(in srgb, …)`.
- `frontend/src/components/{InspectorPanel,AgentDetail,Timeline,ChatPanel,SettingsPanel,LanguageToggle,CloudToggle}.tsx`
  — replace hardcoded hexes + palette utility classes with tokens.
- `frontend/src/learn/{content.ts,TopicDetail.tsx,LearnMap.tsx}` — same.
- `frontend/package.json` — add `vitest` devDependency + `"test": "vitest run"` script.
- `frontend/src/lib/theme.test.ts` *(new)* — store unit test (AC2).
- `frontend/src/lib/no-hardcoded-colors.test.ts` *(new)* — guard test (AC7).
- `.github/workflows/ci.yml` — add a frontend `npm test` step.

## Protocol changes (constitution §1)
None. No `Stage`/`Phase`/`TraceEvent` is added or changed; `schemas.py` ↔ `events.ts`
untouched; no station mapping changes. (Frontend-only.)

## Data model changes
None. Neither the Chroma vector store nor the SQLite `ConversationStore` is touched.
The only persisted state is the theme choice in `localStorage` (client-side).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `app.theme` (toggle aria/title) | `Theme` | `Tema` |
| `app.themeDark` (mode label) | `Dark` | `Escuro` |
| `app.themeLight` (mode label) | `Light` | `Claro` |

## Cloud map (constitution §5)
n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

Introduces the project's first frontend test runner (**Vitest**). Pure-logic ACs are
unit-tested; visual ACs are guarded where cheap and otherwise verified manually.

| Acceptance criterion | Test | File |
|---|---|---|
| AC2 (persist + default dark + guard) | unit: `initialTheme` defaults to dark with empty storage; `setTheme` writes `localStorage` and `dataset.theme`; `isTheme` rejects junk | `frontend/src/lib/theme.test.ts` |
| AC7 (no hardcoded colors) | guard: greps themed component files for `#rrggbb` and fails if any remain (allowlist: token *definitions* in `index.css`) | `frontend/src/lib/no-hardcoded-colors.test.ts` |
| AC1 (toggle switches theme) | manual verification (skill `run`/`verify`): click toggle → `data-theme` flips, UI recolors | — |
| AC3–AC6 (screens/stations/hops/messages) | manual verification: walk each surface in light mode; partially backstopped by the AC7 guard | — |

All tests run offline and deterministically (§2). No backend tests change.

## Risks / trade-offs

- **`var()` + hex-alpha is invalid CSS.** `StationNode` builds `` `${accent}66` `` to
  fade accents; once `accent` is a `var(...)`, that breaks. Must switch to
  `color-mix(in srgb, var(--color-…) 40%, transparent)`. Same for any other
  `${hex}NN` concatenation found during migration.
- **Light-mode accent contrast.** WCAG AA is explicitly out of scope (spec Q7), but
  accents must not vanish on white — hence the deepened light accent values. Judgement
  call, verified visually, not asserted.
- **Guard-test brittleness.** The `no-hardcoded-colors` grep needs a tight allowlist
  (only `index.css` token definitions) or it false-positives. Keep its scope to the
  themed `components/`, `learn/`, `App.tsx`, `stations.ts` surface set.
- **First FE test runner.** Adds `vitest` + a CI step; small, but it is new infra and
  must stay fast/offline.
- **Determinism / single-instance (§2, §8).** Unaffected — frontend-only, no backend
  or cross-replica state.
