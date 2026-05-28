# Plan: Context-window budget — the `/context`-style token grid

> The HOW. Respects `.specify/constitution.md`: §1 (additive `TraceEvent` data, mirrored),
> §3 (everything real — real tokenizer, real window, real used-total), §6 (one source of
> truth for the budget), §9 (TDD), §4 (en+pt).

## Approach

The budget is **computed once, server-side, with the real `tiktoken` encoder** at the
prompt-assembly point, and emitted as additive data on the existing `llm.prompt` END
event. The frontend never re-estimates — it **renders a pure projection** of the emitted
numbers, cursor-aware (latest `llm.prompt` ≤ cursor). This kills three birds: it adds the
window ceiling, it makes the split real (not `chars/4`), and it removes the estimate-vs-real
divergence the current bar has with the cost block.

- **Used / max** is authoritative-real: "used" = the latest reasoning round's real
  `prompt_tokens` (already on the `agent.think` END metrics, 011); "max" = the model's real
  context window (a new static map, mirroring `pricing.py`). "Free" = max − used.
- **Per-category split** is a labelled `tiktoken` estimate (OpenAI's exact tool-call framing
  overhead is not public), reconciled into the used total — exactly the honesty stance
  `/context` takes ("Estimated usage by category").
- **The grid** is allocated by a pure function (`gridCells`) so cell layout is unit-testable
  without rendering.

Alternative considered — compute in the frontend with `js-tiktoken` (already a dep, used by
the pre-send hint). Rejected: it would re-create a second token-counting path that can drift
from the billed total and from the backend's view of the assembled prompt; §6 wants one
source, and the backend is the only place that sees the *real* assembled inputs (tool schemas,
folded history, the thread).

## Affected files

**Backend**
- `backend/app/llm/context.py` — **new.** `MODEL_CONTEXT_WINDOW` map + `DEFAULT_CONTEXT_WINDOW`;
  `context_window(model) -> int`; `context_budget(system, tools, skills_catalog, history,
  retrieved_context, thread) -> dict[str,int]` using `tiktoken` (reuse the `rag/ingestion.py`
  encoder pattern). A labelled teaching approximation (module docstring says so, like `pricing.py`).
- `backend/app/agent/graph.py` — in `think_node`, on the `llm.prompt` span (`prompt_rec.data`),
  add `context_window` + `context_budget` alongside the existing `prompt_preview`/`context`.
  Inputs are already in hand there: `_effective_system(state)`, `specs`, `state["skills_catalog"]`,
  `state["history"]`, `state["context"]`, `state["messages"]`.
- `backend/app/schemas.py` — doc note only: `llm.prompt` END `data` now also carries
  `context_window`/`context_budget` (no new `Stage`, no new model field; `data` is an open map).

**Frontend**
- `frontend/src/types/events.ts` — extend `PromptPreview` with optional `context_window?: number`
  and `context_budget?: ContextBudget` (the per-category map). Optional ⇒ old traces still type-check (AC9).
- `frontend/src/lib/contextBudget.ts` — **new, pure.** `deriveBudget(events, cursor)` →
  `{ window, used, free, pct, categories: {key,label-key,tokens,pctOfWindow}[] }`, reading the
  latest `llm.prompt` ≤ cursor for `context_budget`/`context_window` and the latest `agent.think`
  ≤ cursor for real `prompt_tokens`; falls back to `chars/4` (reusing `turnDiff.contextSections`)
  + `DEFAULT` window when the new fields are absent (AC9), with an `estimated` flag.
  `gridCells(categories, free, total, cellCount)` → an ordered cell→color array (AC7).
- `frontend/src/lib/turnDiff.ts` — `contextSections` prefers the emitted `context_budget` (maps to
  the new section set), `chars/4` fallback; update `Section` to the new category keys (AC8).
- `frontend/src/components/AgentDetail.tsx` — replace the composition bar (lines ~254–291) with
  the grid + headline + legend driven by `deriveBudget`; keep `TurnCompare`.
- `frontend/src/i18n/strings.ts` — new `agentDetail` labels (table below), en + pt.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — no new `Stage`/model; `llm.prompt` END `data` gains
  `context_window` (int) + `context_budget` (token-int map). Documented in the `TraceEvent`
  comment block.
- `frontend/src/types/events.ts` — mirrored: `PromptPreview.context_window?`,
  `PromptPreview.context_budget?` (+ `ContextBudget` type). Both optional.
- Emitted in: `backend/app/agent/graph.py` `think_node` (the `llm.prompt` span).
- Mapped to station in `stations.ts`: **unchanged** — `llm.prompt` already → `llm`;
  `STAGE_TO_STATION`/`STAGE_TO_PHASE` untouched, stay total.
- `readoutFor` / `renderDetail` case added: **no** (no new `StationId`). Richer render is in
  `AgentDetail`'s existing panel.

## Data model changes

None. No vector-store or relational (`ConversationStore`) change; no migration. The budget is
derived from data already in the run and is not persisted beyond the existing trace store.
(The 020 turn-compare loads the prior trace via 022 as today.)

## i18n strings (constitution §4)

| key (`agentDetail.*`) | en | pt |
|---|---|---|
| `windowOf` (model, size) | `{model} · {size} window` | `{model} · janela de {size}` |
| `usedOfMax` (used, max, pct) | `used {used} / {max} ({pct})` | `usados {used} / {max} ({pct})` |
| `estimatedByCategory` | `Estimated usage by category` | `Uso estimado por categoria` |
| `catSystemPrompt` | `System prompt` | `Prompt de sistema` |
| `catToolDefs` | `Tool definitions` | `Definições de ferramentas` |
| `catSkills` | `Skills` | `Skills` |
| `catMemory` | `Memory (long-term)` | `Memória (longo prazo)` |
| `catRetrieved` | `Retrieved context` | `Contexto recuperado` |
| `catMessages` | `Messages` | `Mensagens` |
| `freeSpace` | `Free space` | `Espaço livre` |
| `windowHint` | `The model's finite context window — used vs. free this turn.` | `A janela de contexto finita do modelo — usado × livre neste turno.` |
| `estimatedNote` | `Per-category split is an estimate; used/max is the real billed total.` | `A divisão por categoria é uma estimativa; usado/máx é o total real cobrado.` |

(Reuses existing `agentDetail.contextWindow` as the panel title.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `context_window` known models + unknown→DEFAULT (≠0) | `backend/tests/test_context_budget.py` (keyless) |
| AC2 | `context_budget` returns the 6 used keys via tiktoken; empty→0 | `backend/tests/test_context_budget.py` (keyless) |
| AC3 | tool-defs category >0 with tools, =0 with `enabled_tools=[]`; distinct from messages | `backend/tests/test_context_budget.py` (keyless) |
| AC4 | a real run's `llm.prompt` END carries `context_window`+`context_budget`; no new Stage; maps total | `backend/tests/test_agent.py` `[openai]` + keyless map-parity assert |
| AC5 | used == real `prompt_tokens`; free == window−used; pct correct | `frontend/src/lib/contextBudget.test.ts` |
| AC6 | latest `llm.prompt` ≤ cursor; cursor before any prompt ⇒ 0 used, all free | `frontend/src/lib/contextBudget.test.ts` |
| AC7 | `gridCells` allocates colored cells + free remainder; legend lists non-zero cats | `frontend/src/lib/contextBudget.test.ts` |
| AC8 | `contextSections` prefers emitted budget; fallback to chars/4; diff parity | `frontend/src/lib/turnDiff.test.ts` (updated) |
| AC9 | trace lacking the fields renders via fallback, `estimated` flag, no crash | `frontend/src/lib/contextBudget.test.ts` |
| AC10 | en/pt parity for all new keys (non-empty) | existing i18n parity test / `strings` check |

Tests assert **structurally** (keys present, monotonic ordering, free = max−used, category
distinctness) to tolerate model variability; token *counts* are asserted as `>0` / `==0` /
relative, never as exact magic numbers (tiktoken versions drift).

## Risks / trade-offs

- **Tool-token fidelity.** `tiktoken` on the serialized schemas ≠ OpenAI's exact tool framing
  overhead. Mitigation: label the split "estimated" and anchor the headline to the **real**
  `prompt_tokens`; the residual (real − Σestimate) is absorbed so categories never exceed used.
- **Two events per round.** `context_budget`/`context_window` ride `llm.prompt`; the real
  `prompt_tokens` rides `agent.think`. The projection correlates "latest ≤ cursor" of each —
  same round in practice. Documented in `contextBudget.ts`.
- **020 coupling.** Changing `Section` keys touches the 020 turn-diff + its test. Contained: one
  `Section` rename + the parity test update; the diff math is unchanged.
- **Single-instance / determinism.** Pure derivation from the event log; no new shared state. The
  window map is static like `pricing.py`. Unknown models fall back deterministically.
