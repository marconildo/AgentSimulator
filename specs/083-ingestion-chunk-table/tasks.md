# Tasks: 083-ingestion-chunk-table (TDD)

- [x] **T1 (red)** — `test_ingestion.py`: assert `rag.ingest.chunk` data carries
  `chunk_texts`, length == `num_chunks`, each the full chunk string. → AC1/AC3
- [x] **T2 (green)** — `ingestion.py`: add `"chunk_texts": chunks` to the
  `RAG_INGEST_CHUNK` `rec.data`.
- [x] **T3 (red)** — `IngestionPipelinePanel.test.tsx`: a row per chunk (#, chars);
  clicking a row shows full text; clicking another swaps it; previews-only
  fallback renders without crash. Extend `selectIngestion` test for `chunks`.
- [x] **T4 (green)** — `stationDetail.ts`: `chunking.chunks` from `chunk_texts`
  (fallback to `previews`). `IngestionPipelinePanel.tsx`: `ChunkTable` + selection
  state + full-text panel. `strings.ts`: 7 new keys × en/pt.
- [x] **T5 (refactor + gates)** — `ruff check .` ✓, `ruff format` ✓, backend
  `pytest` ✓, `npm run build` ✓, `npm test` ✓ for this feature (7/7 new green).
  Pre-existing unrelated `SettingsPage.test.tsx` failures (082 `chunkPreview`
  mock gap) confirmed independent via stash. Status → done.

## Demo (058) note
After green, flag whether the GitHub Pages captured fixtures need re-capture so
the demo's ingestion drill-in shows the new table (old fixtures lack
`chunk_texts` → exercises the AC4 fallback, so not strictly required).
