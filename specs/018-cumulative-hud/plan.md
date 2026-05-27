# Plan: Cumulative conversation HUD + pre-send estimate

> The HOW for `spec.md` (status `planned`). Respects `.specify/constitution.md`.
> Frontend-only; pure aggregation of existing usage data. **Depends on 022** for the
> per-message trace source. No backend, no protocol, no new `Stage`.

## Approach

Two pure functions + a thin store + two small UI pieces:

1. **Per-turn usage tally.** Extract a pure `tallyUsage(events)` →
   `{ promptTokens, completionTokens, totalTokens, costUsd, toolCalls, ragHits }`. Tokens
   and cost reuse the *exact* logic `deriveView` already runs (sum over `agent.think` +
   `llm.generate` END metrics, 011) — refactor that block out of `derive.ts` into a
   shared helper so the two never drift. `toolCalls` = count of `mcp.call` END events;
   `ragHits` = number of retrieved chunks on the `rag.retrieve` END data (AC: counting
   rules).
2. **Cumulative fold.** `cumulativeUsage(records: TurnUsage[])` → cumulative totals
   (`turns`, summed tokens/cost, summed toolCalls/ragHits) — the pure AC1 function,
   independent of any data source.
3. **Source (via 022).** A per-conversation HUD selector loads each persisted message's
   trace through 022's mechanism (`fetchTrace`/cache), tallies it, and folds. An evicted
   trace (404) is **skipped** and flips a `partial` flag (AC: graceful eviction).
4. **Pre-send estimate.** A lazily-imported `js-tiktoken` (`o200k_base`) encodes the
   composed input to an approximate token count; cost ≈ tokens × the prompt rate used in
   011. Rendered in the composer, explicitly labelled an **estimate** with the tokenizer
   name. `import()`-ed on first focus so it stays out of the initial bundle.

The HUD sits near the conversation header and **reflects only the active conversation**
(keyed by `activeSessionId`), recomputing when a turn completes or the conversation
switches (AC2).

*Alternatives considered:* (a) live in-memory accumulation — rejected in clarify
(loses history on reload); re-derive is the single source of truth. (b) chars/4 estimate
— rejected: can't honestly claim a tokenizer name. (c) a relevance threshold for "RAG
hit" — rejected: arbitrary constant; count actual chunks.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/usage.ts` *(new)* — `TurnUsage`, `tallyUsage(events)`,
  `cumulativeUsage(records)` (pure).
- `frontend/src/lib/derive.ts` — refactor the inline usage tally to call the shared
  `tallyUsage` (no behavior change; a test pins parity).
- `frontend/src/lib/usage.test.ts` *(new)* — AC1 fold + counting-rules + eviction-skip.
- `frontend/src/lib/tokenize.ts` *(new)* — lazy `js-tiktoken` loader + `estimateTokens`.
- `frontend/src/store/useHud.ts` *(new)* or a slice in `useChat` — per-conversation HUD
  state, recompute on turn-complete / conversation switch, `partial` flag.
- `frontend/src/components/ConversationHud.tsx` *(new)* — the compact running totals near
  the header (via `formatTokens`/`formatUsd`).
- `frontend/src/components/ChatPanel.tsx` — mount the HUD; add the composer pre-send hint.
- `frontend/src/i18n/strings.ts` — HUD labels + estimate/tokenizer strings (en + pt).

## Protocol changes (constitution §1)

None. Reads existing event `metrics`/`data`; no `Stage`/`Phase`/`TraceEvent` change.

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `hud.turns` | turns | turnos |
| `hud.tokens` | tokens | tokens |
| `hud.cost` | cost | custo |
| `hud.toolCalls` | tool calls | chamadas de ferramenta |
| `hud.ragHits` | RAG hits | acertos de RAG |
| `hud.partial` | partial (some traces expired) | parcial (alguns traces expiraram) |
| `hud.estimate` | ≈ estimate · not billed | ≈ estimativa · não cobrado |
| `hud.tokenizer` | tiktoken · o200k_base | tiktoken · o200k_base |

## Cloud map (constitution §5)

No new tier/station. → **n/a**.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `cumulativeUsage` folds turn records → correct sums/counts | `frontend/src/lib/usage.test.ts` |
| AC1b | `tallyUsage` matches `deriveView`'s usage (parity) + counts `mcp.call` / chunks | `usage.test.ts` |
| AC2 | HUD reflects only the active conversation; updates on completion; eviction → `partial`, no crash | `usage.test.ts` (fold over a record list with a gap) |
| AC3 | `estimateTokens` returns an approximate count (lazy tokenizer) labelled an estimate | `tokenize.test.ts` |
| AC4 | rendering reuses `formatTokens`/`formatUsd`; tokenizer label shown | (guarded by build + manual; parity test for the label) |
| AC5 | all HUD strings exist in en **and** pt | i18n parity test |

## Risks / trade-offs

- **Depends on 022.** The re-derive source needs 022's per-message trace loading; 018
  schedules strictly after 022.
- **TraceStore eviction.** The bounded in-memory store may 404 an old trace; the HUD
  skips it and shows `partial` — never fakes a number (§everything-is-real).
- **Bundle weight.** `js-tiktoken` ranks are sizeable; lazy `import()` keeps them off the
  initial load. The pre-send number is an estimate (the real prompt is assembled
  server-side) and is labelled as such.
- **N trace fetches.** Re-deriving a long conversation refetches each turn's trace; cache
  per message (reuse 022's cache) to avoid refetch storms.
