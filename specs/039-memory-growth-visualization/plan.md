# Plan: Memory growth — the honest occupation of the context window across turns

> The HOW. Respects `.specify/constitution.md`: §1 (additive `TraceEvent` data,
> mirrored), §3 (everything real — real tokenizer, real history), §6 (one source
> of truth for the budget), §9 (TDD), §4 (en+pt).

## Approach

The per-pair token weights are **computed once, server-side, with the same
`tiktoken` encoder as the Memory budget category**, emitted as additive data on
the existing `db.read` END event. The frontend never re-estimates — it renders a
pure projection (cursor-aware: latest `db.read` ≤ cursor). This keeps §6 honest
(the Memory growth rows and the Memory budget slice can never disagree) and §3
honest (the numbers are *real* tiktoken counts, not chars/4).

The "next to fall out (limit N)" signal is computed at render time from the
emitted `limit` (already on `db.read` data) and the recent-array length — no
new state, no FE constant.

Alternative considered — compute on the frontend with the already-deployed
`js-tiktoken`. Rejected: it uses `o200k_base` while the backend's budget uses
`cl100k_base`, so the per-turn rows would not sum to the `Memory (long-term)`
budget slice. §6 wants one source.

## Affected files

**Backend**
- `backend/app/llm/context.py` — **add** `history_pair_tokens(history) -> list[int]`
  reusing the existing `_encoder()` and `_render_history()` helpers (the
  `Memory` budget category is `_count(_render_history(history))`; this returns
  the count of `_render_history([pair])` per pair so the sum reconciles).
- `backend/app/main.py` — in the `db.read` span, after `read_history`, attach
  `recent_tokens` onto `db_rec.data` alongside the existing `recent` + `limit`
  fields.
- `backend/app/schemas.py` — doc note only: `db.read` END `data` now also
  carries `recent_tokens` (no new `Stage`, no new model field; `data` is open).

**Frontend**
- `frontend/src/lib/memoryGrowth.ts` — **new, pure.** `deriveMemoryGrowth(events,
  cursor)` → `{ rows: [{turn, message, answer, tokens}], totalTokens,
  nextToFallOut: number | null, limit: number, available: boolean }`. Reads the
  latest `db.read` END ≤ cursor; `available=false` when `recent_tokens` is
  missing (AC7 — older traces still render the existing flat list, no growth
  section).
- `frontend/src/components/AgentDetail.tsx` — inside the Long-term-Memory panel,
  add a *Memory growth* sub-section below the existing flat history list,
  rendered only when `growth.available && growth.rows.length > 0`. Bars are
  divs with width `tokens / max(tokens, 1) * 100%`.
- `frontend/src/i18n/strings.ts` — new keys under `agentDetail`: `memoryGrowth`,
  `memoryGrowthHint`, `currentlyInWindow`, `nextToFallOut` (builder taking the
  limit number), `thisTurnNotStored`, `memoryLesson`. All en + pt.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — no new `Stage`/model; `db.read` END `data` gains
  `recent_tokens: list[int]` (same order/length as `recent`). Documented in the
  `TraceEvent` comment block.
- `frontend/src/types/events.ts` — no required type change. The data map is
  open (`Record<string, unknown>`); `memoryGrowth.ts` reads via an optional cast
  (`event.data.recent_tokens as number[] | undefined`).
- Emitted in: `backend/app/main.py` (the `db.read` span).
- Mapped to station in `stations.ts`: **unchanged** — `db.read` already →
  `database`; `STAGE_TO_STATION` / `STAGE_TO_PHASE` untouched, stay total.
- `readoutFor` / `renderDetail` case added: **no** (no new `StationId`). Richer
  render is in `AgentDetail`'s existing Long-term-Memory panel.

## Data model changes

None. No vector-store or relational (`ConversationStore`) change; no migration.
The growth view is derived from data already in the run + the existing
`{message, answer}` pairs persisted by `db.write`.

## i18n strings (constitution §4)

| key (`agentDetail.*`) | en | pt |
|---|---|---|
| `memoryGrowth` | `Memory growth` | `Crescimento da memória` |
| `memoryGrowthHint` | `What carries forward from each prior turn — only the visible text.` | `O que carrega de cada turno anterior — só o texto visível.` |
| `currentlyInWindow` (total) | `Currently in window: {total} tokens` | `Atualmente na janela: {total} tokens` |
| `nextToFallOut` (limit) | `Next to fall out (limit {limit}): T{turn}` | `Próxima a cair (limite {limit}): T{turn}` |
| `thisTurnNotStored` | `(this turn — not yet stored)` | `(este turno — ainda não salvo)` |
| `memoryLesson` | `Only your message + the assistant's final answer carries forward; reasoning, tool calls and observations don't.` | `Só sua mensagem + a resposta final do assistente carrega; raciocínio, tool calls e observações não.` |

(Reuses the existing `agentDetail.longTermMemory` as the panel title and
`conversationHistory` for the flat-list label.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `history_pair_tokens([])==[]`; pair-by-pair counts >0; empty pair → framing-only count | `backend/tests/test_context_budget.py` (keyless) |
| AC2 | `sum(history_pair_tokens(pairs)) ≈ context_budget(history=pairs).memory ±2` | `backend/tests/test_context_budget.py` (keyless) |
| AC3 | a real `db.read` END from `main.py` carries `recent_tokens` aligned with `recent`; STAGE_TO_STATION/PHASE still total | `backend/tests/test_main.py` (keyless) + existing exhaustiveness check |
| AC4 | `deriveMemoryGrowth` returns rows/total/nextToFallOut from latest db.read ≤ cursor; empty before any db.read | `frontend/src/lib/memoryGrowth.test.ts` |
| AC5 | bar widths proportional; the max-weight row reaches 100% | `frontend/src/lib/memoryGrowth.test.ts` |
| AC6 | nextToFallOut is the oldest row's turn iff `recent.length === limit`, else null | `frontend/src/lib/memoryGrowth.test.ts` |
| AC7 | a db.read without `recent_tokens` → `available=false`, rows empty | `frontend/src/lib/memoryGrowth.test.ts` |
| AC8 | en/pt parity for the 6 new keys (non-empty) | `frontend/src/i18n/strings.test.ts` (extend the 036 parity block) |
| AC9 | `tsc --noEmit` green via `npm run build` | CI gate |

Tests assert **structurally** (lengths match, ordering oldest→newest, total ==
Σrows, fall-out is the oldest when length==limit) so the test stays stable when
tiktoken versions drift; exact token magnitudes are not pinned (only relative
/ within ±2).

## Risks / trade-offs

- **Tokenizer drift between BE (`cl100k_base`) and FE (`o200k_base`).**
  Resolved: the growth rows are computed on the backend so they reconcile with
  the Memory budget slice. The FE's `js-tiktoken` is untouched and continues to
  serve the pre-send hint (a different scope, already labelled).
- **`limit=5` is hard-coded** in `read_history`. We surface it from
  `db.read.data.limit` (already there) so a future env-driven limit (out of
  scope here) won't require a FE change.
- **The "this turn" placeholder** could mislead a learner into thinking the
  growth view is *also* mid-stream live. Mitigation: explicit `(this turn —
  not yet stored)` copy, in bilingual; no bar; no weight. The row exists only
  to make the *next* turn's growth feel continuous.
- **Single-instance / determinism.** Pure derivation from the event log + the
  bounded recent window; no new shared state. Mirrors `pricing.py` /
  `context.py` patterns.
