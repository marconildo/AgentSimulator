# Plan: Why this layer / What breaks without it

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Add two translatable fields — `why` and `whatBreaks` — to the station source data in
`stations.ts` (the single source of truth, constitution §6), authored as `{ en, pt }`
like the existing `blurb`. Resolve them in `resolveStation` so consumers get plain
strings per language. Render a new **"Why this layer · What breaks"** section in
`InspectorPanel` for the selected station, between the Overview/summary and the
tech/timing detail. Pure content + one render block — no execution, protocol, or layout
change. This mirrors how `blurb` already flows from source → resolver → Inspector.

**Important:** the section renders from the resolved `meta` (like `meta.blurb` at
`InspectorPanel.tsx:74`), **not** inside the exhaustive `renderDetail` switch. So this
spec does **not** add per-station `case`s to `renderDetail`/`readoutFor` — it's one block
driven by the two new meta fields, total over all stations by construction.

Alternative considered: putting the notes behind the node's ⊕ inline expansion. Rejected
— the "why" belongs next to the live data the learner is reading in the Inspector, and
inline expansion is already crowded with compact internals.

## Affected files

**Frontend**
- `frontend/src/lib/stations.ts` — add `why: Tr` and `whatBreaks: Tr` to `StationSrc`
  and resolved `StationMeta`; author both for the 7 executing stations (and optionally
  the previews); resolve in `resolveStation`.
- `frontend/src/components/InspectorPanel.tsx` — render the new section for the selected
  station; add the section labels via `useT`.
- `frontend/src/i18n/strings.ts` — section heading + sub-labels ("Why this exists",
  "What breaks without it") in `en` + `pt`.
- `frontend/src/lib/stations.test.ts` — extend with AC1/AC4 assertions.

**Backend** — none.

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent` touched; `STAGE_TO_STATION` / `STAGE_TO_PHASE`
  unchanged.

## Data model changes

- None (no Chroma / SQLite change).

## i18n strings (constitution §4)

Section chrome (in `strings.ts`):

| key / location | en | pt |
|---|---|---|
| `inspector.whyTitle` | Why this layer · What breaks without it | Por que esta camada · O que quebra sem ela |
| `inspector.whyLabel` | Why this exists | Por que existe |
| `inspector.whatBreaksLabel` | What breaks without it | O que quebra sem ela |

Per-station `why` / `whatBreaks` content lives in `stations.ts` as `{ en, pt }` (authored
for frontend, backend, agent, database, rag, mcp, llm). Wording drafted in the spec's
"User-facing behavior" examples; finalize at implementation, keeping each to 1–2
sentences and including the AC4 keywords (auth stub on the public edge; HTTP/SSE on MCP;
single-instance/pool on App DB).

## Cloud map (constitution §5)

- n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | every executing station resolves non-empty `why`/`whatBreaks` in en & pt | `frontend/src/lib/stations.test.ts` |
| AC4 | keyword presence: auth-stub (frontend/backend), HTTP/SSE (mcp), pool/single-instance (database), per language | `frontend/src/lib/stations.test.ts` |
| AC2/AC3 | Inspector renders the section and switches with selection/language | covered by type-check + a light render assertion (or manual + existing strings parity test) |
| AC5 | `STAGE_TO_STATION` / `STAGE_TO_PHASE` parity tests unchanged; `tsc --noEmit` green | existing `phases.test.ts` / `stations.test.ts` + `npm run build` |

## Risks / trade-offs

- Writing accurate, concise "what breaks" notes is the real work — keep them honest and
  short; avoid turning the Inspector into an essay.
- Don't duplicate `blurb`. `blurb` = what it does; `why`/`whatBreaks` = why it's separate
  and the failure mode. Review side-by-side when authoring.
