# Plan: Chunk overlap highlight

## Approach

Pure frontend projection. The overlap between two consecutive chunks is the longest suffix of
chunk `i-1` that is a prefix of chunk `i` — for fixed windows this is exactly the configured
`chunk_overlap`; for the recursive splitter it is the carried tail; for semantic/agentic
(no overlap) it is ~0. A small pure helper computes that length from the chunk texts already
in the trace (083 `chunk_texts`), and the full-text renderer splits the selected chunk into a
highlighted overlap prefix + a plain remainder. No backend, no protocol, no new state.

Alternative considered: emit a per-chunk overlap length from the backend chunkers. Rejected —
it adds a trace field for data that is fully derivable on the client, and the constitution
favors pure projection (the frontend already has every chunk's full text).

## Affected files

**Backend**
- none

**Frontend**
- `frontend/src/lib/chunkOverlap.ts` — **new** pure helper `overlapPrefixLen(prev, cur)`
  (longest suffix-of-prev == prefix-of-cur, capped scan for safety).
- `frontend/src/lib/chunkOverlap.test.ts` — **new** Vitest for AC1/AC2.
- `frontend/src/components/IngestionPipelinePanel.tsx` — in `ChunkTable`, when a chunk is
  selected, render its full text via the helper: highlighted overlap prefix + plain remainder
  + legend.
- `frontend/src/components/IngestionPipelinePanel.test.tsx` — assert AC3/AC4 rendering.
- `frontend/src/i18n/strings.ts` — add `ingestionDetail.overlapLegend` (en + pt) to the type
  and both language objects.

## Protocol changes (constitution §1)

- none.

## Data model changes

- none.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `ingestionDetail.overlapLegend` | overlap with previous chunk | sobreposição com o trecho anterior |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `overlapPrefixLen` longest suffix/prefix, 0 when none/undefined | `frontend/src/lib/chunkOverlap.test.ts` |
| AC2 | fixed-overlap O → helper returns O | `frontend/src/lib/chunkOverlap.test.ts` |
| AC3 | selected chunk renders highlighted prefix + plain rest; concat == full text | `frontend/src/components/IngestionPipelinePanel.test.tsx` |
| AC4 | first chunk → no highlight | `frontend/src/components/IngestionPipelinePanel.test.tsx` |
| AC5 | legend present in en + pt | covered by strings type + AC3 render (legend text) |

## Implementation note

`Scroll` (DetailShell) gained an optional `testid` passthrough so the full-text view can be
targeted in tests; the highlight is a `<mark>` styled with the accent color, and the legend
renders only when `overlapPrefixLen > 0`.

## Risks / trade-offs

- A coincidental long common suffix/prefix could over-report overlap. Mitigation: cap the
  scan (overlap is bounded by the `chunk_overlap` max, 1000) and the genuine carried tail is
  always a real match, so the result is at least the true overlap; pathological over-match on
  natural text is vanishingly unlikely. Honest enough for the teaching view.
- O(n·k) scan per opened chunk (k capped) — only runs for the single selected chunk, trivial.
