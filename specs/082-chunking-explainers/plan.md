# Plan: Chunking strategy explainers in Settings

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Add a **"How it works"** block to `SettingsKnowledgeBase.tsx`, below the strategy
radio + params, that reacts to the already-tracked `chosen` strategy. It has two
parts, both reusing existing infrastructure:

1. **Explanation** — a per-strategy bilingual blurb. Richer, teaching-oriented
   copy in new `kb.explain.{fixed,recursive,semantic,agentic}` strings (the
   existing one-line `rag.chunkStrat*` are terse comparison captions; the Settings
   explainer wants a fuller "how it works"). Resolved by the `chosen` id.
2. **Live example** — call the real `chunkPreview(chosen)` (already in `chatApi.ts`,
   supports a single strategy) and render the produced chunks. **Reuse the render**
   from `RagStageDetail.tsx`: export its `ChunkColumn` (currently module-private)
   and render a single column for the selected strategy (the Settings explainer is
   per-method, not a fixed-vs-chosen compare — the compare stays in the Vector DB
   playground). The column already handles the `error` case (AC3) and char counts.

A **"see full comparison →"** button opens the Vector DB Chunking playground: set
the simulator `detail` to `rag` (the RAG drill-in hosts the playground), via the
existing `openDetail`/`useSimulator` path — no new playground (AC4).

Fetch on `chosen` change (debounced/guarded with an `alive` flag, mirroring the
existing playground effect), so switching strategy refreshes the example.

Alternatives considered: (a) extract the playground into a shared component used by
both — heavier refactor, deferred; exporting `ChunkColumn` is the minimal reuse.
(b) static schematic — rejected by the user in favour of the real preview.

## Affected files

**Backend**
- none (the `/api/rag/chunk-preview` endpoint already serves single-strategy
  previews with honest per-strategy errors).

**Frontend**
- `frontend/src/components/RagStageDetail.tsx` — **export** `ChunkColumn` (+ the
  `cutsMidSentence` helper if needed) so Settings can reuse the exact render.
- `frontend/src/settings/SettingsKnowledgeBase.tsx` — add the "How it works" block:
  per-strategy explanation + a live `chunkPreview(chosen)` example (reusing
  `ChunkColumn`) + a "see full comparison" button that `openDetail("rag")`.
- `frontend/src/i18n/strings.ts` — new `kb.explain.*` (4 strategies) + the
  "How it works" / "see full comparison" / loading labels, en + pt.

## Protocol changes (constitution §1)

None. No `Stage`, no `events.ts` change, no station change.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| kb.explain.title | How it works | Como funciona |
| kb.explain.fixed | Cuts the text into fixed-length character windows (with overlap), ignoring sentence and paragraph boundaries — fast but it happily splits a sentence in half. | Corta o texto em janelas de tamanho fixo (com sobreposição), ignorando limites de frase e parágrafo — rápido, mas corta frases ao meio. |
| kb.explain.recursive | Packs whole paragraphs into overlapping windows, never starting a chunk mid-word — keeps each thought intact. The default. | Empacota parágrafos inteiros em janelas com sobreposição, sem começar um chunk no meio de uma palavra — mantém cada ideia inteira. O padrão. |
| kb.explain.semantic | Embeds each sentence and opens a new chunk where adjacent-sentence similarity drops (a topic shift) — boundaries follow meaning, not length. Uses OpenAI embeddings. | Gera embedding de cada frase e abre um novo chunk onde a similaridade entre frases vizinhas cai (mudança de tópico) — os limites seguem o significado, não o tamanho. Usa embeddings da OpenAI. |
| kb.explain.agentic | Asks the LLM to read the document and segment it into coherent topical units — the model decides the boundaries. Uses OpenAI; falls back to Recursive on a bad response. | Pede à LLM para ler o documento e segmentá-lo em unidades temáticas coerentes — o modelo decide os limites. Usa OpenAI; recai em Recursive se a resposta falhar. |
| kb.explain.example | Live example (real chunks on a sample) | Exemplo ao vivo (chunks reais numa amostra) |
| kb.explain.loading | Chunking the sample… | Dividindo a amostra… |
| kb.explain.seeFull | See full comparison → | Ver comparação completa → |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | selecting each strategy shows its distinct explanation | `frontend/src/settings/SettingsKnowledgeBase.test.tsx` |
| AC2 | the selected strategy's live example renders chunks from a mocked `chunkPreview` | same |
| AC3 | a preview `error` renders the honest message, no chunks | same |
| AC4 | the "see full comparison" control calls `openDetail("rag")` | same |
| AC5 | en + pt parity for the new strings | tsc `{en,pt}` typing + existing strings tests |
| AC6 | additive only — no protocol/Stage change | covered by no diff to `schemas.py`/`events.ts` |

## Risks / trade-offs

- **Keyed strategies in tests:** Semantic/Agentic hit OpenAI in production; tests
  mock `chunkPreview` so they stay keyless + deterministic (the live call only
  happens in the running app, like the existing playground).
- **Extra fetches on selection:** each strategy switch fetches `chunkPreview(chosen)`;
  guard with an `alive` flag and only fetch the single chosen strategy (cheaper
  than the playground's `"all"`). Acceptable for a settings panel.
- **Reuse coupling:** exporting `ChunkColumn` couples Settings to `RagStageDetail`;
  acceptable and intentional (single source of the chunk render). If it grows,
  extract to a shared `components/chunks/` module (deferred).
