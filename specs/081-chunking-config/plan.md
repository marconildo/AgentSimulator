# Plan: Per-strategy chunking configuration

> The HOW. Respects the constitution: no new Stage (§1/§6), everything real (§3),
> bilingual (§4), single-instance (§7), TDD (§9), this spec under `specs/` (§10).

## Approach

Introduce a small, validated **`ChunkParams`** value object in `chunking.py` that carries
the four tunables (`chunk_size`, `chunk_overlap`, `semantic_threshold`, `max_segments`)
with their defaults pulled from the existing module constants. The four strategy cores
(`_recursive_texts`, `_fixed_spans`, `_semantic_texts`, `_agentic_texts`) currently read
module-level constants; thread a `ChunkParams` through them instead, **defaulting to the
constants so the default path is byte-for-byte unchanged** (AC2 regression pin).

`chunk(...)` / `chunk_texts(...)` gain an optional `params: ChunkParams | None`. `None`
means "defaults" → identical to today. `load_corpus` / `build_index` / `reingest_corpus`
forward an optional `params`. The reindex + chunk-preview request models gain optional
per-parameter fields; `main.py` validates them against bounds (422 on violation), builds a
`ChunkParams`, and forwards it.

`/api/config` ships a `chunk_params` descriptor (per-strategy `{default, min, max}`) so the
frontend renders controls and bounds without hardcoding. The FE `SettingsKnowledgeBase`
keeps per-strategy param state, renders only the selected strategy's controls, and includes
the values in the `reindexCorpus` call.

Alternatives considered: (a) persist params in `app_config` — rejected as a non-goal
(adds migration + statefulness for little teaching value now); (b) one flat `{size, overlap}`
for all strategies — rejected as dishonest for semantic/agentic (chosen scope is
per-strategy-relevant).

## Affected files

**Backend**
- `backend/app/rag/chunking.py` — add `@dataclass ChunkParams` (with `from_overrides`/clamp +
  defaults from the constants); thread `params` through `_recursive_texts`, `_fixed_spans`,
  `_semantic_texts`, `_agentic_texts`, `chunk`, `chunk_texts`. Add `CHUNK_PARAM_BOUNDS`
  (per-strategy `{param: (default, min, max)}`) as the single source of truth.
- `backend/app/rag/ingest.py` — `load_corpus(strategy, params=None)`,
  `build_index(strategy, params=None)`, `reingest_corpus(strategy, emitter, params=None)`;
  emit the applied params in the `rag.ingest.chunk` stage `data`.
- `backend/app/main.py` — extend `ChunkPreviewRequest` with optional param fields (or a
  nested `params` object); validate against `CHUNK_PARAM_BOUNDS` (422); build `ChunkParams`
  and forward in `chunk_preview` + `reindex_corpus`. Add `chunk_params` to `/api/config`.

**Frontend**
- `frontend/src/lib/chatApi.ts` — `AppConfig.chunk_params` type; `reindexCorpus` and
  `chunkPreview` accept an optional params object and serialize it.
- `frontend/src/settings/SettingsKnowledgeBase.tsx` — per-strategy params state seeded from
  config; render the relevant controls for the selected strategy; pass params on re-ingest.
- `frontend/src/i18n/strings.ts` — `settings.kb.params.*` labels/helper text (en + pt).

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` shape change — parameters are additive `data` keys on
the existing `rag.ingest.chunk` stage, and optional request fields. `events.ts` untouched.

## Data model changes

None. No new vectors metadata beyond what 072/073 already store (`strategy`); no SQLite
schema change. The live index just reflects the last build's parameters (process-local
active state, §7).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `settings.kb.params.title` | "Parameters" | "Parâmetros" |
| `settings.kb.params.chunkSize` | "Chunk size (chars)" | "Tamanho do bloco (caracteres)" |
| `settings.kb.params.chunkOverlap` | "Overlap (chars)" | "Sobreposição (caracteres)" |
| `settings.kb.params.threshold` | "Similarity threshold" | "Limiar de similaridade" |
| `settings.kb.params.maxSegments` | "Max segments" | "Máx. de segmentos" |
| `settings.kb.params.sizeHint` | "Larger chunks keep more context; smaller chunks retrieve more precisely." | "Blocos maiores preservam mais contexto; blocos menores recuperam com mais precisão." |
| `settings.kb.params.overlapHint` | "Overlap carries ideas across chunk boundaries." | "A sobreposição mantém ideias entre os limites dos blocos." |
| `settings.kb.params.thresholdHint` | "Higher = split on smaller topic shifts (more, smaller chunks)." | "Maior = divide em mudanças de tópico menores (mais blocos, menores)." |
| `settings.kb.params.maxSegmentsHint` | "Caps how many topical segments the model may return." | "Limita quantos segmentos temáticos o modelo pode retornar." |

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `/api/config` includes `chunk_params` with default/min/max per strategy | `backend/tests/test_config.py` (or `test_main.py`) |
| AC2 | recursive default == current output; `chunk_text` unchanged | `backend/tests/test_chunking.py` |
| AC3 | fixed honors size/overlap (smaller size ⇒ more chunks) | `backend/tests/test_chunking.py` |
| AC4 | semantic honors threshold + size cap | `backend/tests/test_chunking.py` (`@pytest.mark.openai`) |
| AC5 | agentic caps at `max_segments` | `backend/tests/test_chunking.py` (`@pytest.mark.openai`) |
| AC6 | reindex applies params; `rag.ingest.chunk` data reports them; omit ⇒ 072 behavior | `backend/tests/test_reindex.py` |
| AC7 | chunk-preview accepts params | `backend/tests/test_chunk_preview.py` |
| AC8 | over-bounds ⇒ 422 (or clamped) | `backend/tests/test_reindex.py` |
| AC9 | selecting a strategy renders its controls, seeded from config | `frontend/src/settings/SettingsKnowledgeBase.test.tsx` |
| AC10 | editing a param + re-ingest sends it | `frontend/src/settings/SettingsKnowledgeBase.test.tsx` |

(Test file names are indicative — reuse the existing chunking/reindex/preview test modules
where they already exist.)

## Risks / trade-offs

- **Regression risk on the default path** — mitigated by AC2's byte-for-byte pin; the
  default `ChunkParams` must equal the current constants exactly (and `chunk_text` stays a
  zero-arg recursive call).
- **Validation surface** — keep one source of truth (`CHUNK_PARAM_BOUNDS`) for bounds used
  by both the 422 check and `/api/config`, so the UI and the validator never drift.
- **Keyed strategies** — semantic/agentic param tests are `@pytest.mark.openai` (skipped
  without a key); the keyless structural assertions cover fixed/recursive fully.
- **No persistence** — params reset to defaults on strategy switch / reload, by design
  (§7, Non-goals); the active-strategy readout already conveys what the live index used.
