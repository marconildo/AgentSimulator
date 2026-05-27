# Plan: Ingestion / Indexer node (the offline RAG pipeline)

> **Option A** (resolved): a real `ingestion` station owns `rag.ingest.*`, visible in all
> scenarios. The HOW below is concrete and ready to drive TDD.

## Approach

Add an `ingestion` station to the single source of truth (`stations.ts`) in the
`services` tier, and **move** the three `rag.ingest.*` stages from the `rag` station's
`stages` array into it. Because `STAGE_TO_STATION` is derived from each station's
`stages`, this re-routes ingest events to `ingestion` automatically; `deriveView` (pure
projection) then lights the new node with no projection-code change. `STAGE_TO_PHASE`
(`phases.ts`) is untouched — the ingest stages keep their `retrieve` timeline phase
(phase is independent of station), so phase parity holds.

The InspectorPanel `rag` case currently branches into `IngestionDetail` when ingest
events are present; that branch **moves** to a new `ingestion` case (reusing the existing
`IngestionDetail` component) and is **removed** from the `rag` case (which keeps only
query embedding + retrieved chunks). FlowCanvas `readoutFor` gains an `ingestion` case.
The layout adds `ingestion` to the `services` column (after `rag`); the tier box
auto-grows from stacked member heights. The `scenario.test.ts` `TODAY_STATIONS` guard and
the `ingest-stages.test.ts` station expectation are updated (both encode the old "ingest
→ rag" reality and are intentionally changed by this spec).

Alternative considered: Option B (keep stages on `rag`, add a `comingSoon` explainer).
Rejected by the user — ingestion is real, so the node should be real (§3).

## Affected files

**Frontend**
- `frontend/src/lib/stations.ts` —
  - add `"ingestion"` to the `StationId` union;
  - add the `ingestion` `StationSrc` (tier `services`, bilingual title/subtitle/blurb,
    tech rows, cloud map, `stages: ["rag.ingest.chunk","rag.ingest.embed","rag.ingest.store"]`,
    default `scenarios` = all);
  - **remove** those three stages from the `rag` station's `stages` (rag keeps
    `rag.embed`/`rag.search`/`rag.retrieve`).
- `frontend/src/lib/layout.ts` — add `ingestion: "services"` to `COLUMN_OF`; order it
  after `rag` in the services column; confirm the tier box recomputes.
- `frontend/src/components/InspectorPanel.tsx` — add `case "ingestion":` rendering
  `IngestionDetail` (when ingest events present) plus the offline-concept Section
  (chunking 900/150, trigger/timing, refresh/staleness); **remove** the ingestion branch
  from `case "rag":`.
- `frontend/src/components/FlowCanvas.tsx` — add `case "ingestion":` to `readoutFor`
  (compact: e.g. "chunked N · embedded N · stored N", else an idle "offline indexer").
- `frontend/src/i18n/strings.ts` — inspector labels for the offline-concept rows
  (chunking / trigger / refresh) in en + pt.
- Tests:
  - `frontend/src/lib/ingest-stages.test.ts` — change expectations from `rag` →
    `ingestion` (AC2/AC3).
  - `frontend/src/lib/scenario.test.ts` — `TODAY_STATIONS += "ingestion"` (AC7).
  - `frontend/src/lib/stations.test.ts` — AC1/AC9 (fields + cloud map + scenarios).

**Backend**
- Optionally expose `CHUNK_SIZE` / `CHUNK_OVERLAP` via `/api/config` so the inspector reads
  the true values rather than duplicating literals. If skipped, hardcode the documented
  900/150 in the bilingual content and add a comment pointing at `rag/ingest.py` so they
  can't silently drift. (Lean: small `/api/config` addition for honesty.)

## Protocol changes (constitution §1)

- No new `Stage` type. `rag.ingest.*` re-assigned `rag` → `ingestion` (visual-model §6).
- `STAGE_TO_STATION`: auto-derived, now routes ingest → `ingestion`. Stays total.
- `STAGE_TO_PHASE` (`phases.ts`): **unchanged** (ingest stages keep `retrieve`); parity
  with `STAGE_TO_STATION` still holds (every `Stage` in both maps).
- Exhaustive switches: add `ingestion` `case` to `readoutFor` + `renderDetail` (AC6).

## Data model changes

- None (ingestion already writes to Chroma; this is presentation only).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| ingestion title | Ingestion / Indexer | Ingestão / Indexador |
| ingestion subtitle | Offline index build | Construção offline do índice |
| ingestion blurb | Builds the knowledge base offline: split documents into chunks, embed them, and upsert the vectors into the index. Runs on startup (if missing), on each PDF upload, and rebuilds when the embedding model/dimension changes. | Constrói a base de conhecimento offline: divide documentos em chunks, gera embeddings e faz upsert dos vetores no índice. Roda na inicialização (se ausente), a cada upload de PDF e reconstrói quando o modelo/dimensão de embedding muda. |
| inspector chunking | Chunking | Chunking |
| inspector chunkingValue | 900-char windows · 150 overlap · paragraph-packing | janelas de 900 chars · 150 de sobreposição · empacotamento por parágrafo |
| inspector trigger | Trigger | Gatilho |
| inspector triggerValue | startup build-if-missing · on PDF upload · rebuild on dimension drift | build na inicialização se ausente · no upload de PDF · rebuild ao mudar a dimensão |
| inspector refresh | Index refresh | Atualização do índice |
| inspector refreshValue | A stale or badly-chunked index quietly degrades answer quality — re-embed when the model or corpus changes. | Um índice desatualizado ou mal chunkado degrada silenciosamente a qualidade — re-embedde quando o modelo ou o corpus muda. |

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| ingestion | Offline indexing / ingestion job | Azure AI Search indexer / Functions | OpenSearch Ingestion / Glue | Vertex AI Pipelines / Dataflow |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | ingestion station: fields + cloud map + scenarios | `frontend/src/lib/stations.test.ts` |
| AC2 | `STAGE_TO_STATION[ingest.*]==="ingestion"`, rag has only query stages; `STAGE_TO_PHASE` parity | `ingest-stages.test.ts` + `phases.test.ts` |
| AC3 | `deriveView` routes ingest events to `ingestion` (status done, activeStation) | `ingest-stages.test.ts` |
| AC4 | `[openai]` real ingestion emits `rag.ingest.*`, node reflects | `backend/tests/test_rag*.py` + derive check |
| AC5 | `ingestion` renderDetail shows IngestionDetail + chunking/trigger/refresh (bilingual) | `stations.test.ts` / render |
| AC6 | both switches exhaustive; `tsc --noEmit` green | `npm run build` |
| AC7 | `TODAY_STATIONS` includes ingestion; ladder still cumulative | `scenario.test.ts` |
| AC8 | rag still shows query view; layout has no overlap | `stations.test.ts` / `layout.test.ts` |
| AC9 | strings parity en/pt; cloud azure/aws/gcp | `strings.test.ts` / `stations.test.ts` |

## Risks / trade-offs

- **Re-mapping blast radius**: two existing tests (`ingest-stages`, `scenario`) encode the
  old behavior and must change — that's expected (the spec changes the visual model);
  keep the changes surgical and reviewed.
- **Layout crowding**: the services column gains a 5th node in Simple; verify the tier box
  height and the private-network boundary reflow cleanly (no overlap with AI-Ops column in
  advanced).
- **Chunk-param drift**: prefer exposing 900/150 via `/api/config` over hardcoding in two
  places; if hardcoded, comment-link `rag/ingest.py`.
- The `rag` node losing its ingestion branch must not regress the PDF-upload UX — the
  ingestion now shows on the new node; confirm the upload flow points the inspector there.
