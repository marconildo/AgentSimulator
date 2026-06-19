# Plan: Ingestion pipeline — merge Object Storage, expose phases

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Two moves, kept independent so each is small and testable.

**1) Backend — split two real phases out of the existing ingest path.** In
`rag/ingestion.py::ingest_pdf` the per-chunk token counting already happens
inside the `rag.ingest.chunk` stage, and the per-chunk metadata is built inline
inside the `rag.ingest.store` stage. Promote each to its own stage:

- `rag.ingest.chunk` keeps chunking only (strategy, sizes, previews, num_chunks).
- **`rag.ingest.tokenize`** (new) counts tokens per chunk (`count_tokens`, the
  existing cl100k encoder) and emits the per-chunk list + `total_tokens`.
- `rag.ingest.embed` unchanged.
- **`rag.ingest.metadata`** (new) builds the per-chunk metadata records
  (reuse the heading/section helpers from `ingest.py` where applicable; for PDFs
  emit `chunk` index, `position` `i of N`, `doc_type`, `char range`, plus the
  scoping keys) and emits them. The **same** records are then handed to the store
  step, so what the stage reports is exactly what is persisted (AC3 — real, not
  decorative).
- `rag.ingest.store` consumes the metadata from the previous step and writes.

Also fix the **hardcoded chunker** (AC10): `ingest_pdf` currently calls
`chunk_text(text)` (== `recursive`, ignoring the 072 picker). Switch it to
`chunk_texts(text, active_chunk_strategy())` so per-PDF uploads use the same
strategy the live index was built with, and report that strategy in the
`rag.ingest.chunk` END `data.strategy`. The corpus path already honors the
strategy — this brings upload into line with it.

`storage.upload` is unchanged where it's emitted (`main.py`, before
`ingest_uploaded`); only its *station mapping* changes on the frontend. The
corpus rebuild path (`reingest_corpus`) gets the same two new stages so the
canvas animates a rebuild identically.

**2) Frontend — merge the two stations, add the drill-in.** Delete the `storage`
station; move `storage.upload` into the `ingestion` station's `stages` array as
the first phase and fold the storage blurb/cloud names into the Ingestion node's
"Object store" phase content. Rewire the two hops that pointed at `storage`
(remove `backend → storage`; keep `backend → ingestion` + `ingestion → rag`).
Add an "Open ingestion pipeline" drill-in modeled on `RagPipelinePanel.tsx`
(selectors in a new `lib/ingestionPipeline.ts`, mirroring `lib/ragPipeline.ts`),
projecting the six phases purely from the event log.

Alternative considered: keep `storage` as a station but visually nest it — rejected,
the user explicitly wants one block with object storage *as a phase*, and a nested
station fights the layout engine (`computeLayout` lays stations out, not phases).

## Affected files

**Backend**
- `backend/app/schemas.py` — add `RAG_INGEST_TOKENIZE`, `RAG_INGEST_METADATA` to
  `Stage`; update the ingestion comment block.
- `backend/app/rag/ingestion.py` — split `ingest_pdf` into the six-stage sequence;
  emit the two new stages with real per-chunk data; pass metadata to the store;
  **use `chunk_texts(text, active_chunk_strategy())`** instead of the hardcoded
  `chunk_text` so uploads honor the active 072 strategy (AC10).
- `backend/app/rag/ingest.py` — `reingest_corpus` emits the two new stages too
  (keep corpus + upload animations in lockstep).

**Frontend**
- `frontend/src/types/events.ts` — mirror the two new `Stage` enum members.
- `frontend/src/lib/stations.ts` — remove the `storage` station; add the four
  ingest stages (`storage.upload` + tokenize + metadata) to the `ingestion`
  station's `stages`; merge storage blurb/tech/cloud into ingestion content;
  drop the `backend → storage` hop; update `UPLOAD_ONLY_STATIONS` → `{ ingestion }`;
  keep `STAGE_TO_STATION` total.
- `frontend/src/lib/phases.ts` — assign a `TimelinePhase` to each new `Stage`.
- `frontend/src/lib/ingestionPipeline.ts` — **new** selectors (mirror
  `lib/ragPipeline.ts`) projecting the six ordered phases from events.
- `frontend/src/components/IngestionPipelinePanel.tsx` — **new** drill-in overlay
  (mirror `RagPipelinePanel.tsx`), opened from the Ingestion node.
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor` case for `ingestion`
  still total after the merge; wire the "Open ingestion pipeline" button.
- `frontend/src/components/InspectorPanel.tsx` — `renderDetail` case for the
  (still-present) `ingestion` station; remove the `storage` case.
- `frontend/src/i18n/strings.ts` (or station `{en,pt}` blocks) — new phase labels,
  drill-in headings, glossary entries.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `RAG_INGEST_TOKENIZE = "rag.ingest.tokenize"`,
  `RAG_INGEST_METADATA = "rag.ingest.metadata"`.
- `frontend/src/types/events.ts` — mirror both members in the `Stage` union.
- Emitted in: `backend/app/rag/ingestion.py::ingest_pdf` (and
  `ingest.py::reingest_corpus`).
- Mapped to station in `stations.ts`: both → **`ingestion`**; `storage.upload`
  re-mapped from `storage` → `ingestion`.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel): `ingestion` case
  retained/extended; `storage` case removed. Both switches stay exhaustive over
  `StationId` after `storage` leaves the union.
- `STAGE_TO_PHASE` (`phases.ts`): both new stages assigned the same ingestion
  `TimelinePhase` the existing `rag.ingest.*` stages use.

## Data model changes

None to schemas. The metadata the new `rag.ingest.metadata` stage builds is the
**same** dict already attached to uploaded chunks today (`corpus`, `session_id`,
`document_id`, `filename`, `chunk`), optionally enriched with `position` /
`doc_type` / char-range for display — written to Chroma chunk metadata as before
(no new SQLite table, no migration).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| ingestion phase: object store | Object store | Armazenamento de objetos |
| ingestion phase: chunking | Chunking | Divisão em chunks |
| ingestion phase: tokenization | Tokenization | Tokenização |
| ingestion phase: embedding | Embedding | Embedding |
| ingestion phase: metadata | Metadata extraction | Extração de metadados |
| ingestion phase: save | Save to vector DB | Salvar no banco vetorial |
| node action | Open ingestion pipeline | Abrir pipeline de ingestão |
| drill-in title | Ingestion pipeline | Pipeline de ingestão |
| glossary: tokenization | Counting the tokens in each chunk (cl100k) | Contagem de tokens de cada chunk (cl100k) |
| glossary: metadata extraction | Per-chunk metadata attached before indexing | Metadados por chunk anexados antes da indexação |

(Storage blurb/why/whatBreaks already exist bilingually on the removed `storage`
station — reused verbatim on the "Object store" phase, no new translation needed.)

## Cloud map (constitution §5)

No new tier/station (`ingestion` already exists with azure/aws/gcp filled, and
`storage`'s cloud names are folded into its "Object store" phase content). The
table below records the object-storage names preserved on the phase so nothing is
lost when the standalone station is removed.

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| Object store phase | Object / blob storage | Azure Blob Storage | Amazon S3 | Cloud Storage |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | upload emits the 6 stages in order (START+END) | `backend/tests/test_ingestion.py` |
| AC2 | tokenize END: per-chunk list len == num_chunks, total metric == sum | `backend/tests/test_ingestion.py` |
| AC3 | metadata END list len == num_chunks; persisted Chroma metadata matches | `backend/tests/test_ingestion.py` |
| AC4 | no-upload chat fires none of storage/ingest stages | `backend/tests/test_agent.py` (existing guard, extend) |
| AC5 | `STAGE_TO_STATION` + `STAGE_TO_PHASE` total & parity over `Stage` | `frontend/src/lib/storage-stages.test.ts`, `ingest-stages.test.ts`, `phases.test.ts` |
| AC6 | no `storage` station; `UPLOAD_ONLY_STATIONS === {ingestion}`; single node on upload | `frontend/src/lib/storage-stages.test.ts` |
| AC7 | drill-in projects 6 ordered phases from events, no fetch | `frontend/src/components/IngestionPipelinePanel.test.tsx`, `lib/ingestionPipeline.test.ts` |
| AC8 | `visibleHopsFor` yields no hop with a missing endpoint; backend→ingestion + ingestion→rag present | `frontend/src/lib/stations` hop test |
| AC9 | every new string has en + pt | covered by tsc `{en,pt}` typing + a strings parity test |
| AC10 | upload uses active strategy; `fixed` vs `recursive` differ; chunk END reports strategy | `backend/tests/test_ingestion.py` |

## Risks / trade-offs

- **Exhaustive-switch churn:** removing `storage` from `StationId` ripples through
  every `Record<StationId, …>` and `switch (id)` (FlowCanvas `readoutFor`,
  InspectorPanel `renderDetail`, layout). `tsc` will flag each — work the compiler
  errors to zero. Low risk, mechanical.
- **Stage-count change in existing tests:** any test asserting an exact ingest
  stage *count* (was 3, now 5 + storage) must be updated; assert structurally
  (presence + order), not magic numbers, per the project's test convention.
- **Determinism:** token counts (cl100k) and metadata are deterministic given the
  same chunks, so the new assertions are stable across model variability.
- **Single-instance (§7):** unchanged — the active-strategy/global state in
  `ingest.py` is untouched.
- **Demo fixtures (058):** the captured upload trace changes shape (new stages);
  flag a re-capture per the standing GitHub Pages directive after merge.
