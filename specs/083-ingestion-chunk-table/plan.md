# Plan: 083-ingestion-chunk-table

## Approach

Two small, additive changes — one backend (emit the data), one frontend (render
the table + full-text panel). No `Stage`, no protocol enum, no timeline change.

### Backend — emit full chunk texts (real data)

`backend/app/rag/ingestion.py`, `ingest_pdf`, the `RAG_INGEST_CHUNK` stage: add
`"chunk_texts": chunks` to `rec.data` (the full text of every chunk — the same
list already chunked one line above; `previews` stays for back-compat). This is
the only new payload; everything downstream is unchanged.

### Frontend — project + render

- `frontend/src/lib/stationDetail.ts` — `IngestionPhases.chunking` gains
  `chunks: string[]`, read from `chunk.data.chunk_texts` (default `[]`). When
  absent, fall back to the existing `previews` so legacy/demo traces still list
  rows (AC4).
- `frontend/src/components/IngestionPipelinePanel.tsx` — replace the
  free-text "chunk previews" `<Mono>` with a `ChunkTable`: a header row + one
  selectable button-row per chunk (#, chars, tokens from
  `tokenization.tokenCounts[i]` when present, snippet). Local `useState` holds the
  selected index; below the table a full-text `<Scroll>` shows the selected
  chunk. Default selection: none (a hint line) until the user clicks — keeps the
  view calm. Reuse `Caption`/`Scroll` from `DetailShell`.
- `frontend/src/i18n/strings.ts` — new `ingestionDetail` keys (interface + en +
  pt): `chunkTableCaption`, `colNum`, `colChars`, `colTokens`, `colSnippet`,
  `selectChunkHint`, `fullChunkText`.

## Affected files

- `backend/app/rag/ingestion.py` (1 line)
- `frontend/src/lib/stationDetail.ts` (interface + selector)
- `frontend/src/components/IngestionPipelinePanel.tsx` (table + selection state)
- `frontend/src/i18n/strings.ts` (3 blocks: interface + en + pt)
- Tests: `backend/tests/test_ingestion.py`,
  `frontend/src/components/IngestionPipelinePanel.test.tsx`

## Protocol / i18n / cloud impact

- **Protocol**: additive `data` key only; `schemas.py`/`events.ts` enums
  unchanged. No `STAGE_TO_STATION` / `STAGE_TO_PHASE` change.
- **i18n**: 7 new strings × en/pt.
- **Cloud**: none (no new tier/station).

## Test strategy (AC → test)

- **AC1** → backend: `rag.ingest.chunk` data includes `chunk_texts` with length
  `num_chunks`, each entry the full chunk string. FE: panel renders `num_chunks`
  rows each with its index + char count.
- **AC2** → FE: clicking a row reveals that chunk's full text; clicking another
  swaps it. (RTL `fireEvent.click`.)
- **AC3** → backend test asserts `chunk_texts` are the real chunks (join ==
  original-ish / each non-empty, count matches). FE projection reads the cursor
  slice (existing pattern).
- **AC4** → FE: a chunking phase with only `previews` (no `chunk_texts`) renders
  rows from previews without crashing.
- **AC5** → strings present in en + pt (tsc enforces the shared interface).
- **AC6** → no enum/protocol diff; `previews` retained.
