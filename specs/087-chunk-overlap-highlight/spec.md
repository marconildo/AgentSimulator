# Spec: Chunk overlap highlight

| | |
|---|---|
| **ID** | 087-chunk-overlap-highlight |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-22 |

## Problem / motivation

The ingestion drill-in (083) lets you open a chunk's full text, and the Chunking phase
reports a `chunk_overlap` knob — but the overlap is invisible. The user cannot *see* which
characters of a chunk were carried over from the previous chunk. Overlap is one of the most
important and least intuitive chunking ideas (it's why an idea spanning a boundary isn't
lost); making it visible turns an abstract number into something you can read on the page.

## Goals

- In the chunk full-text view, visually mark the leading region of a chunk that overlaps
  the previous chunk (a text highlight), so the carried-over text is obvious at a glance.
- Keep it an honest, real projection — the highlight reflects the *actual* overlapping text
  between consecutive chunks, not a fabricated `chunk_overlap`-length guess.

## Non-goals

- No backend change, no new `Stage`, no new trace field. The full text of every chunk is
  already in the trace (083 `chunk_texts`); the overlap is derivable from it.
- Not highlighting the *trailing* overlap on the previous chunk (only the leading overlap on
  the selected chunk). Deferred.
- Not changing how chunking produces overlap (that is the separate #1 recursive-size fix).

## User-facing behavior

When a chunk is selected in the ingestion Chunking table and its full text is shown, the
leading characters that also appear at the end of the previous chunk (the overlap) are
rendered with a distinct highlight color. A small bilingual legend labels the highlight as
"overlap" / "sobreposição". The first chunk (no previous chunk) shows no highlight. Chunks
with no real overlap (e.g. semantic/agentic strategies) show no highlight.

## Acceptance criteria

1. **AC1** — A pure helper `overlapPrefixLen(prev, cur)` returns the length of the longest
   suffix of `prev` that is also a prefix of `cur` (the carried overlap), `0` when there is
   none or `prev` is `undefined`/empty.
2. **AC2** — For fixed-window chunks produced with overlap `O` (consecutive chunks sharing
   their `O` boundary characters), `overlapPrefixLen(chunk[i-1], chunk[i]) === O`.
3. **AC3** — When the selected chunk has an overlap prefix of length `n > 0`, the full-text
   view renders the first `n` characters inside a highlighted element and the remaining text
   plain; the concatenation of both still equals the chunk's full text exactly (no characters
   added or dropped).
4. **AC4** — The first chunk (index `0`) renders its full text with no highlighted region.
5. **AC5** — A bilingual legend label for the highlight exists in both `en` and `pt`
   (`overlapLegend`), shown only when a highlight is present.

## Protocol / stage impact

- New/changed `Stage`(s): **none**
- Mirror in `frontend/src/types/events.ts`: **n/a**
- Station it maps to in `stations.ts`: **n/a** (pure frontend projection of existing data)

## Open questions (clarify before planning)

- (resolved) Compute overlap in the frontend (pure projection) rather than add a trace field —
  the chunk texts are already present, and the architecture favors pure projection.
- (resolved) Highlight only the leading overlap of the selected chunk (simplest, clearest).

## Out of scope / deferred

- Highlighting the matching trailing region on the previous chunk simultaneously.
- A per-row overlap indicator in the chunk table (only the opened full text gets the highlight).
