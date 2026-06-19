# Plan: Metadata as a first-class citizen

> HOW for [`spec.md`](spec.md). Respects the constitution: no new `Stage` (§1), everything real
> (§3 — extracted from real files, real Chroma `where=` filtering), bilingual (§4), existing `rag`
> station only (§6), single-instance (§7). Builds on 072's re-ingest path; foundation for a future
> self-querying spec.

## Approach

At ingest, enrich each chunk's metadata: parse optional frontmatter, track the nearest preceding
markdown heading as `section`, set `doc_type` (from frontmatter or file convention), and `position`
(`index`/`total`). These ride the chunk through `rag.search`/`rag.retrieve` (the dicts already flow to
the UI). Add an optional `filters` argument to `retriever.retrieve` that is translated to a Chroma
`where=` and **AND-ed** with the existing `_scope_filter`, giving us the filter seam self-querying
will later drive — and a minimal manual filter exercises it today. The UI renders a metadata chip row
per retrieved chunk ("why retrieved"), degrading gracefully when fields are absent (legacy index).

Alternatives considered: a separate metadata sidecar store — rejected, Chroma metadata is the natural
home and supports `where=` natively. LLM metadata inference — rejected for this spec (non-deterministic,
not "real" structurally); deferred.

## Affected files

**Backend**
- `backend/app/rag/ingest.py` (+ `chunking.py` from 072) — extract `section`/`doc_type`/`position`/
  frontmatter while chunking; write them into `Document.metadata`. (Chunk boundaries come from 072;
  this adds the metadata enrichment on top.)
- `backend/app/rag/retriever.py` — `_to_chunk` / `_all_scoped_chunks` carry the new metadata into the
  chunk dict; `retrieve(..., filters: dict | None = None)` merges filters into the `where=` via a
  helper `_with_filters(scope, filters)` (AND of `_scope_filter` + metadata).
- `backend/app/schemas.py` — optional `retrieval_filters` on `ChatRequest` **only if** the manual
  filter ships as a chat input (kept minimal; default `None` ⇒ byte-for-byte). Doc comment on the
  additive chunk metadata.
- `backend/app/main.py` — pass `retrieval_filters` (if added) into the agent/retriever; otherwise the
  manual filter rides a read-side path.

**Frontend**
- `frontend/src/lib/ragPipeline.ts` — extend `PipelineChunk` with optional `section`/`doc_type`/
  `position`/frontmatter; carry through the projection.
- `frontend/src/types/events.ts` — mirror the optional metadata fields on the chunk type.
- `frontend/src/components/RagStageDetail.tsx` (Retrieval detail) + the Vector DB inspector
  (`InspectorPanel` `renderDetail` for `rag`) — render the metadata chip row + "why retrieved".
- The minimal filter control (RAG drill-in or Settings) + its api wiring.
- `frontend/src/i18n/strings.ts` — chip labels, "why retrieved", filter controls, glossary (en + pt).

## Protocol changes (constitution §1)

- No `Stage`/`Phase` change. Metadata are additive keys on the chunk dicts in `rag.search`/
  `rag.retrieve` `data` (open map). `events.ts` chunk type gains optional fields (additive).
- Optional `ChatRequest.retrieval_filters` (request-only, default `None` ⇒ unchanged) **iff** the
  filter is a chat input — otherwise no request change.
- `STAGE_TO_STATION`/`STAGE_TO_PHASE` unchanged → no new `StationId` case; the `rag` station's
  `renderDetail` is extended in place (existing case).

## Data model changes

- **Chroma**: chunk metadata gains `section`, `doc_type`, `position` (+ frontmatter fields). Requires
  a **re-ingest** (reuse 072's path) to populate; legacy chunks render degraded (AC5). Mind the known
  *index schema drift* gotcha (memory: `chroma-index-schema-drift`) — rebuild via `build_index()`,
  not file deletion; the new fields are additive so old queries still work, just without the chips.
- No SQLite change.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `ragDetail.meta.whyRetrieved` | Why retrieved | Por que foi recuperado |
| `ragDetail.meta.section` | section | seção |
| `ragDetail.meta.type` | type | tipo |
| `ragDetail.meta.position` | position | posição |
| `ragDetail.meta.source` | source | fonte |
| `ragDetail.filter.label` | Filter by metadata | Filtrar por metadados |
| `ragDetail.filter.all` | All sources | Todas as fontes |
| `ragDetail.filter.applied` | Filtered: {field} = {value} | Filtrado: {field} = {value} |
| glossary `Metadata` | Structured facts attached to each chunk (source, section, type, date) used to filter and debug retrieval. | Fatos estruturados anexados a cada trecho (fonte, seção, tipo, data) usados para filtrar e depurar a recuperação. |
| glossary `Metadata filtering` | Restricting retrieval to chunks whose metadata matches a condition — self-querying will later set it from natural language. | Restringir a recuperação a trechos cujos metadados satisfazem uma condição — o self-querying depois definirá isso a partir de linguagem natural. |

## Cloud map (constitution §5)

n/a — no new tier/station (existing Vector DB station).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | ingest extracts section/type/position/frontmatter for a known file | `backend/tests/test_metadata.py` |
| AC2 | metadata flows to UI via `deriveRagPipeline` | `frontend/src/lib/ragPipeline.metadata.test.ts` |
| AC3 | `retrieve(filters=…)` → `where=` restricts results, composes with scope | `backend/tests/test_metadata.py` (`@openai`) |
| AC4 | no-filter run byte-for-byte (stage sequence + shapes) | `backend/tests/test_metadata.py` |
| AC5 | legacy metadata-poor chunk renders/retrieves, no crash | `backend/tests/test_metadata.py` + frontend render test |
| AC6 | inspector + drill-in render chips, degrade gracefully | `frontend/src/components/RagStageDetail.metadata.test.tsx` |
| AC7 | manual filter round-trip | backend filter test + frontend wiring test |
| AC8 | no new `Stage`; mappings unchanged | existing exhaustiveness + `phases.test.ts` |
| AC9 | i18n parity | existing strings parity test |

## Risks / trade-offs

- **Re-ingest dependency** — chips appear only after a rebuild; the active state must be honest (tie
  to 072's active-strategy/version readout) so users aren't confused by a half-populated index.
- **Chroma `where=` semantics** — confirm AND-composition of `$or` scope + metadata equality; test
  explicitly so the filter never silently widens scope.
- **Scope creep toward self-query** — hold the line: this spec ships *one* working filter field + the
  seam, not the LLM step. The forward glossary note sets the expectation.
- Single-instance/§7 unaffected — read-side filtering + ingest-time enrichment only.
