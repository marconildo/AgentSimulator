# Plan: Chunking strategies (configurable, visual, ingestion-time)

> HOW for [`spec.md`](spec.md). Respects the constitution: no new `Stage` (§1 — reuses ingestion
> stages), everything real (§3 — real splitters, real embeddings/LLM, real rebuilt index, honest
> read-only playground), bilingual (§4), existing stations only (§6), single-instance (§7).

## Approach

Extract chunking into a **strategy module** with one interface and four implementations. `recursive`
*is* today's `chunk_text` (moved verbatim, so AC1 is trivially true). `fixed` is a naive
length-window splitter (the "bad" baseline to contrast against). `semantic` embeds sentences and
opens a new chunk where adjacent-sentence cosine similarity drops below a threshold. `agentic` sends
the document to the LLM and asks for topical segments. `ingest.build_index(strategy=…)` selects the
splitter and tags each chunk's metadata with the `strategy`.

Two UI surfaces, deliberately separate:
1. **Playground** — a read-only `POST /api/rag/chunk-preview` that runs the splitter(s) over a sample
   (or supplied) document and returns boundaries only. The Chunking drill-in renders the chosen
   strategy **beside fixed** so the contrast is the lesson. Instant, no side effects.
2. **Re-ingest** — an action that rebuilds the corpus index with the chosen strategy and **streams
   the existing ingestion stages** so the canvas animates Storage → Ingestion → Vector DB (reuses
   the 034 flow). Aggregated per-corpus (counts), not per-chunk, for legibility.

Alternatives considered: a new `rag.chunk` query-stage — rejected, chunking is ingestion-time, not
query-time, and the ingestion stages already exist. A live "chunk every keystroke" preview — rejected
as scope; a sample-document compare is enough to teach the difference.

## Affected files

**Backend**
- `backend/app/rag/chunking.py` *(new)* — `ChunkStrategy` enum + `chunk(text, strategy) -> list[Chunk]`;
  `_fixed`, `_recursive` (moved from `ingest.chunk_text`), `_semantic` (embeddings), `_agentic` (LLM);
  each returns chunks with `start`/`end`/`text`.
- `backend/app/rag/ingest.py` — `build_index(strategy: ChunkStrategy | None = None)`; `load_corpus`
  uses the strategy; chunk metadata gains `strategy`. `chunk_text` re-exported from `chunking` for
  back-compat (AC1).
- `backend/app/config.py` — `chunk_strategy: ChunkStrategy = recursive` (env `CHUNK_STRATEGY`) +
  any strategy constants (semantic threshold, agentic max segments).
- `backend/app/main.py` — `POST /api/rag/chunk-preview` (read-only); a re-ingest trigger that runs
  `build_index(strategy)` inside a trace and streams the ingestion stages; `/api/config` reports
  `chunk_strategy` + the available strategies (id + label).
- `backend/app/trace.py` / ingestion emit path — emit aggregated `rag.ingest.*` for the corpus
  rebuild (reuse the upload ingestion emit helpers).

**Frontend**
- `frontend/src/components/SettingsPage.tsx` (+ a `KnowledgeBaseSettings` section) — strategy picker
  + Re-ingest button; wire the re-ingest action through the SSE client so the canvas animates.
- `frontend/src/components/RagStageDetail.tsx` — the Chunking stage becomes the playground (strategy
  selector + boundary compare view, fixed alongside; mid-sentence cuts flagged).
- `frontend/src/lib/ragPipeline.ts` — carry the `strategy` (+ boundary stats) from
  `rag.ingest.chunk` into the Chunking stage data.
- `frontend/src/lib/api.ts` (or chat/config api) — `chunkPreview(strategy, text?)` + reindex trigger.
- `frontend/src/i18n/strings.ts` — Settings + playground + glossary strings (en + pt).

## Protocol changes (constitution §1)

- No `Stage`/`Phase` added. Re-ingest emits the **existing** `rag.ingest.chunk` / `rag.ingest.embed`
  / `rag.ingest.store` (and optionally `storage.upload`). Additive `data` on `rag.ingest.chunk`
  (`strategy`, `num_chunks`, boundary stats) — open map, no `events.ts` type change required (may add
  an optional field for safety).
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` unchanged → no new `StationId` case in `readoutFor` /
  `renderDetail`. The Chunking card already exists in the RAG drill-in.

## Data model changes

- **Chroma**: chunk metadata gains `strategy` (and any boundary fields). Existing index lacks it →
  a **re-ingest is required** to populate it. Note the known *index schema drift* gotcha (memory:
  `chroma-index-schema-drift`): rebuild via `build_index()` (Chroma `reset`/delete-by-`corpus`), not
  file deletion. No SQLite change.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `settings.kb.title` | Knowledge base | Base de conhecimento |
| `settings.kb.strategy` | Chunking strategy | Estratégia de chunking |
| `settings.kb.reingest` | Re-ingest corpus | Reindexar corpus |
| `settings.kb.reingesting` | Re-ingesting… | Reindexando… |
| `settings.kb.done` | Re-indexed {n} chunks | {n} trechos reindexados |
| `chunking.fixed` | Fixed-size — splits by length; can cut a sentence in half. | Tamanho fixo — divide por comprimento; pode cortar uma frase ao meio. |
| `chunking.recursive` | Recursive — splits on paragraphs/sentences, with overlap. | Recursivo — divide por parágrafos/frases, com sobreposição. |
| `chunking.semantic` | Semantic — starts a new chunk when the topic shifts. | Semântico — inicia um novo trecho quando o tópico muda. |
| `chunking.agentic` | Agentic — an LLM segments the document into coherent units. | Agêntico — um LLM segmenta o documento em unidades coerentes. |
| `ragDetail.chunkingPlay.compareWithFixed` | Compared with fixed-size | Comparado com tamanho fixo |
| `ragDetail.chunkingPlay.midSentence` | cuts mid-sentence | corta no meio da frase |
| `ragDetail.chunkingPlay.why` | Better boundaries = better retrieval — chunking is upstream of every metric. | Melhores limites = melhor recuperação — o chunking está a montante de toda métrica. |
| glossary `Chunking` | Splitting documents into retrievable pieces before embedding. | Dividir documentos em pedaços recuperáveis antes do embedding. |

## Cloud map (constitution §5)

n/a — no new tier/station (reuses the existing Ingestion / Object Storage / Vector DB stations from
033/034, whose cloud maps are already filled).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `recursive` == today's `chunk_text` per corpus file | `backend/tests/test_chunking.py` |
| AC2 | each strategy's structural properties (`@openai` for semantic/agentic) | `backend/tests/test_chunking.py` |
| AC3 | config + `build_index(strategy)` tags + count differs | `backend/tests/test_chunking.py` |
| AC4 | `chunk-preview` read-only, `all` returns 4, fixed≠recursive | `backend/tests/test_api.py` |
| AC5 | re-ingest streams ingestion stages in order + index updates | `backend/tests/test_ingestion_flow.py` |
| AC6 | no new `Stage`; mappings unchanged | covered by existing exhaustiveness + `phases.test.ts` |
| AC7 | Chunking playground compare render | `frontend/src/components/RagStageDetail.chunking.test.tsx` |
| AC8 | `/api/config` reports active strategy + list | `backend/tests/test_api.py` |
| AC9 | i18n parity | existing strings parity test |

## Risks / trade-offs

- **Semantic/agentic cost & determinism** — both make real API calls; structural assertions only
  (no exact boundaries), and they're opt-in (default `recursive`). Playground over a *sample*
  document bounds the cost; full-corpus only runs on explicit Re-ingest.
- **Re-ingest blocks the index briefly** — single-instance (§7), acceptable; do it via
  `asyncio.to_thread` and animate so the user sees progress.
- **Index schema drift** — populating `strategy` needs a rebuild; the active-strategy readout (AC8)
  prevents a confusing "picked semantic but index is still recursive" state.
- **Agentic output shape** — must validate/repair the LLM's segmentation (non-empty, covers the
  text); fall back to `recursive` on a malformed response (logged, honest), tested structurally.
