# Plan: Storage → Ingestion write-path (the upload pipeline)

> **Resolved**: a real `storage` station owning a new `storage.upload` stage, wired with
> three hops, visible in all scenarios. The HOW below is concrete and ready to drive TDD.

## Approach

Add one new `Stage` (`storage.upload`), one new station (`storage`) and three new hops to
wire the upload write-path so the Ingestion node is no longer floating. The Storage step is
**real**: a small object-store module writes the uploaded bytes to a real local directory
(a stand-in for Blob/S3, mirroring how the SQLite `ConversationStore` stands in for managed
SQL and Chroma for a managed vector DB), and the ingestion **reads the document back from
storage**, so the step is load-bearing.

Backend: the upload endpoint emits `frontend → backend` as today, then a new
`storage.upload` stage (writes the object), then calls `ingest_pdf` which now reads its
bytes from the object store. Because `STAGE_TO_STATION` is derived from each station's
`stages`, assigning `storage.upload` to the new `storage` station routes the event there
automatically and `deriveView` (pure projection) lights it with no projection-code change.

Frontend: add the `storage` station to `stations.ts` (services tier), give it a layout
slot, add the three hops, add the two exhaustive `case`s (`readoutFor`, `renderDetail`),
add a `storage.upload → persist` entry to `STAGE_TO_PHASE`, and update the
`TODAY_STATIONS` guard.

Alternative considered: visual-preview-only Storage (`comingSoon`, byte-path unchanged).
Rejected by the user — ingestion is already real, so a decorative storage step would be
dishonest (§3).

Alternative phase mapping: `storage.upload → retrieve` (group with the ingest stages so an
upload trace's phase rail stays contiguous). Rejected — "Retrieve" mislabels a write;
`persist` is truthful. The only cost is a cosmetic ordering quirk on upload-only traces
(persist appears after retrieve in the canonical `PHASE_ORDER` rail), which is acceptable.

## Affected files

**Backend**
- `backend/app/schemas.py` — add `STORAGE_UPLOAD = "storage.upload"` to `Stage` (after the
  `rag.ingest.*` block, before `MCP_DISCOVER` — keep it in pipeline order).
- `backend/app/config.py` — add `storage_dir: str = "app/data/storage"` and a
  `storage_path` property (`self._abs(self.storage_dir)`), mirroring `chroma_dir` /
  `chroma_path` (a mounted Docker volume like chroma).
- `backend/app/storage/object_store.py` — **new** module: `put_object(key, data,
  content_type) -> str` (writes `storage_path/<key>`, returns a `file://…` URI), `get_object(key)
  -> bytes`, `delete_object(key) -> bool`, `delete_session_objects(session_id) -> int`,
  `clear_objects() -> int`. Plain, real filesystem I/O — no API key needed. Key shape:
  `"{session_id}/{document_id}/{filename}"`.
- `backend/app/rag/ingestion.py` — `ingest_pdf` reads the document from storage instead of
  receiving raw bytes: change its signature to take a `storage_key` (or keep `data` but
  fetch via `get_object` first inside the function) so the storage step is load-bearing.
  `delete_document_vectors` / `delete_uploaded_vectors` get storage-side companions (or the
  endpoints call `delete_object` / `delete_session_objects`).
- `backend/app/main.py` —
  - upload endpoint (`POST /api/sessions/{id}/documents`): after the `BACKEND` stage,
    emit `async with emitter.stage(Stage.STORAGE_UPLOAD, "Storing the upload", {...})`
    calling `put_object`; record `{key, uri, size_bytes, content_type}` on `rec.data` and
    `{size_bytes}` on `rec.metrics`; then call `ingest_pdf` with the storage key.
  - `delete_document`: also `delete_object(key)` for the document.
  - clear-databases endpoint (025): also `clear_objects()` and add `objects_deleted` to the
    response payload.

**Frontend**
- `frontend/src/types/events.ts` — add `"storage.upload"` to the `Stage` union (mirror of
  §1).
- `frontend/src/lib/stations.ts` —
  - add `"storage"` to the `StationId` union;
  - add the `storage` `StationSrc` (tier `services`, bilingual title/subtitle/blurb, tech
    rows, cloud map, `stages: ["storage.upload"]`, default `scenarios` = all);
  - add the three hops to `HOPS_SRC`: `backend→storage`, `storage→ingestion`,
    `ingestion→rag` (see Hops table below).
- `frontend/src/lib/layout.ts` —
  - add `storage: COLLAPSED_H` (or a tuned `EXPANDED_H`, ~196) to `EXPANDED_H`;
  - insert `"storage"` into the data column `members` immediately **above** `"ingestion"`:
    `["database","rag","storage","ingestion","mcp","llm","reranker"]` so the write-path
    reads top-down (storage → ingestion) and ingestion→rag is a short upward edge; tune
    handles for clean edges;
  - add `storage: "services"` to `TIER_OF`.
- `frontend/src/lib/phases.ts` — add `"storage.upload": "persist"` to `STAGE_TO_PHASE`.
- `frontend/src/components/FlowCanvas.tsx` — add `case "storage":` to `readoutFor` (compact:
  e.g. "stored {filename} · {size}", else idle "object storage").
- `frontend/src/components/InspectorPanel.tsx` — add `case "storage":` to `renderDetail`
  (stored-object key/URI, size, content type when present + bilingual "why object storage"
  Section + cloud examples).
- `frontend/src/i18n/strings.ts` — inspector labels for the storage rows + the "why" note.

**Tests**
- `backend/tests/test_object_store.py` — **new**, keyless: put/get/delete/clear round-trip.
- `backend/tests/test_upload*.py` (or extend the existing upload test) — `[openai]`: order
  of stages, object exists after, ingestion read from storage; delete + clear remove objects.
- `frontend/src/lib/stations.test.ts` — AC1/AC6/AC11 (fields, cloud map, scenarios, hops).
- `frontend/src/lib/phases.test.ts` — AC2 parity (already pins `STAGE_TO_PHASE` ⇔
  `STAGE_TO_STATION` key sets; passes once both gain `storage.upload`).
- a stage→station test (extend `ingest-stages.test.ts` or new `storage-stages.test.ts`) —
  AC2/AC5 projection: `STAGE_TO_STATION["storage.upload"]==="storage"`, `deriveView` lights
  storage then ingestion.
- `frontend/src/lib/scenario.test.ts` — AC8 `TODAY_STATIONS += "storage"`.
- `frontend/src/lib/layout.test.ts` — AC7 layout: storage placed, services tier grows, no
  overlap.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `Stage.STORAGE_UPLOAD = "storage.upload"`.
- `frontend/src/types/events.ts` — mirrored `"storage.upload"` in the `Stage` union.
- Emitted in: `backend/app/main.py` upload endpoint (between `BACKEND` and `rag.ingest.*`).
- Mapped to station in `frontend/src/lib/stations.ts`: new `storage` station
  (`stages: ["storage.upload"]`). `STAGE_TO_STATION` auto-derives; `STAGE_TO_PHASE` gains
  `"storage.upload": "persist"`.
- `readoutFor` (FlowCanvas) + `renderDetail` (InspectorPanel) `storage` case added: **yes**.

## Data model changes

- **New object store** under `storage_path` (real filesystem; a mounted volume in Docker
  like chroma). Not a database migration — a new on-disk artifact keyed by
  `session/document/filename`. No change to Chroma (vectors) or the relational store schema;
  the upload now writes to storage **and** Chroma, delete/clear remove from both.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| storage title | Object Storage | Armazenamento de objetos |
| storage subtitle | Uploaded documents | Documentos enviados |
| storage blurb | Durable object storage for uploaded files. On upload the API writes the document here first; the indexer then reads it to chunk, embed and upsert. Storing the original decouples "received" from "indexed" and lets the file be re-chunked when the embedding model changes. | Armazenamento de objetos durável para arquivos enviados. No upload, a API grava o documento aqui primeiro; o indexador então o lê para chunkar, embeddar e fazer upsert. Guardar o original desacopla "recebido" de "indexado" e permite re-chunkar o arquivo quando o modelo de embedding muda. |
| storage generic | Object / blob storage | Armazenamento de objetos / blobs |
| inspector storedObject | Stored object | Objeto armazenado |
| inspector size | Size | Tamanho |
| inspector contentType | Content type | Tipo de conteúdo |
| inspector whyStorage | Why object storage | Por que armazenamento de objetos |
| inspector whyStorageValue | Persisting the original decouples upload from indexing: the file is safely stored before (and independently of) being chunked, can be re-indexed if the model changes, and never touches the public internet. | Persistir o original desacopla o upload da indexação: o arquivo é guardado com segurança antes de (e independentemente de) ser chunkado, pode ser reindexado se o modelo mudar, e nunca passa pela internet pública. |
| hop backend→storage label | object PUT | PUT de objeto |
| hop backend→storage detail | The API uploads the received file to object storage over a private endpoint | A API envia o arquivo recebido ao armazenamento de objetos por um endpoint privado |
| hop backend→storage controls | Private Endpoint · TLS · IAM | Private Endpoint · TLS · IAM |
| hop backend→ingestion label | ingest | ingestão |
| hop backend→ingestion detail | Having persisted the file, the API calls the indexer with the object key; the indexer reads the stored object and builds the index | Após persistir o arquivo, a API chama o indexador com a chave do objeto; o indexador lê o objeto armazenado e constrói o índice |
| hop backend→ingestion controls | mTLS · NSG / Security Group | mTLS · NSG / Security Group |
| hop ingestion→rag label | upsert | upsert |
| hop ingestion→rag detail | The indexer upserts the chunk embeddings into the vector index | O indexador faz upsert dos embeddings dos chunks no índice vetorial |
| hop ingestion→rag controls | Private Endpoint | Private Endpoint |

## Cloud map (constitution §5)

| element | generic | azure | aws | gcp |
|---|---|---|---|---|
| storage | Object / blob storage | Azure Blob Storage | Amazon S3 | Cloud Storage |

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | storage station: fields + cloud map + scenarios | `frontend/src/lib/stations.test.ts` |
| AC2 | `Stage` mirror parity; `STAGE_TO_STATION`/`STAGE_TO_PHASE` total + parity | `frontend/src/lib/phases.test.ts` + stage→station test |
| AC3 | object store put/get/delete/clear round-trip (keyless) | `backend/tests/test_object_store.py` |
| AC4 | `[openai]` upload: stage order, object exists, ingestion reads from storage | `backend/tests/test_upload*.py` |
| AC5 | `deriveView` lights `storage` then `ingestion` from an upload event list | stage→station / derive test |
| AC6 | three hops present, bilingual, private; `ingestion` no longer hop-less | `frontend/src/lib/stations.test.ts` |
| AC7 | `readoutFor` + `renderDetail` `storage` cases; `tsc --noEmit` green | `npm run build` + render test |
| AC8 | `TODAY_STATIONS` includes storage; ladder cumulative | `frontend/src/lib/scenario.test.ts` |
| AC9 | delete + clear remove objects (+ `objects_deleted` count) | `backend/tests/test_upload*.py` / clear test |
| AC10 | normal chat emits no `storage.upload`; rag query path unaffected | `backend/tests/test_agent.py` (existing) + derive test |
| AC11 | strings parity en/pt; cloud azure/aws/gcp non-empty | `stations.test.ts` |

## Hops (added to `HOPS_SRC`)

| source → target | label | protocol | comm | zone | handles |
|---|---|---|---|---|---|
| `backend → storage` | object PUT | HTTPS / TLS | sync | private | backend `right` → storage `left` |
| `backend → ingestion` | ingest | private network · invoke indexer (in-process / mTLS) | sync | private | backend `right` → ingestion `left` |
| `ingestion → rag` | upsert | TCP | sync | private | ingestion `bottom` → rag `top` |

> Amendment (post-review): the indexer is invoked by the Backend, not by the storage —
> `storage → ingestion` became `backend → ingestion`. The storage↔ingestion leg animates
> through the backend hub (deriveView's BFS), matching "the API calls the indexer after the
> write" and the real `main.py` flow (`put_object` → `ingest_uploaded`).

## Risks / trade-offs

- **Layout crowding**: the data column gains a 6th node in Simple, and the data tier now
  has *internal* vertical edges (storage→ingestion, ingestion→rag) plus the existing
  agent→rag read edge into the same `rag` node. Verify handles/edges don't cross or overlap
  and that the tier box + private-network boundary reflow cleanly (also in advanced, beside
  the AI-Ops column).
- **Two edges into `rag`** (read from `agent`, write from `ingestion`): pedagogically good
  (read vs write path) but make sure both target handles are distinct so the edges read
  clearly.
- **Phase-rail order quirk** on upload-only traces (`persist` before `retrieve` in the
  canonical rail) — accepted; documented above.
- **Volume / persistence**: `storage_path` must be a mounted volume in `docker-compose.yml`
  (like chroma) or uploads vanish on restart; `conftest.py` must point it at a throwaway
  temp dir so tests don't leak files.
- **Clear/delete completeness**: object deletion must stay in lockstep with vector + row
  deletion, or orphaned files accumulate; the clear test pins `objects_deleted`.
- **Backward compatibility**: `ingest_pdf`'s signature change ripples to the upload
  endpoint and any test calling it directly — update call sites in the same task.
