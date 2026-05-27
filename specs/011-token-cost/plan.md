# Plan: Real token + cost accounting

> HOW for `011-token-cost`. Usage is additive `metrics` on existing events
> (no `Stage` change, §1); pricing is an explicit backend table; the projection
> aggregates (§7).

## Approach

Three seams:
1. **Capture** — the provider already calls OpenAI; read the usage metadata it
   returns. `decide` (a blocking `ainvoke`) exposes `result.usage_metadata`;
   streaming `astream` exposes it on the final chunk when `stream_usage=True`.
2. **Price** — a tiny `pricing.py` table (USD per 1M input/output tokens) +
   `cost_usd(model, prompt, completion)`; unknown model ⇒ 0.
3. **Aggregate + show** — emit usage on each call's END event `metrics`; the pure
   `deriveView` sums it into a `usage` total (rounds + tokens + cost) the LLM node
   and inspector render.

Decide usage travels on `agent.think/end`; generate usage on `llm.generate/end`.
The projection treats both as LLM calls, so "rounds through the LLM" = decide
rounds + the one generate call — matching the user's mental model that the LLM is
the brain hit on every round.

## Affected files

**Backend**
- `backend/app/llm/pricing.py` — **new.** `MODEL_PRICES: dict[str, tuple[float,
  float]]` (input, output per 1M), `cost_usd(model, prompt, completion) -> float`,
  `usage_metrics(model, usage) -> dict[str, float]` (prompt/completion/total/cost).
- `backend/app/llm/provider.py` — `TokenUsage` dataclass (+ `from_metadata`);
  `Decision` gains `usage: TokenUsage | None = None`; `LLMProvider` gains a
  `last_stream_usage: TokenUsage | None = None` class attr (the streaming call's
  usage side-channel, since a token generator can't also return a value).
- `backend/app/llm/openai_provider.py` — `decide` reads `result.usage_metadata`
  into `Decision.usage`; `_client(streaming=True)` sets `stream_usage=True`;
  `stream_answer` captures the final chunk's `usage_metadata` into
  `self.last_stream_usage` (reset at the top of the call).
- `backend/app/agent/graph.py` — `think_node` adds `usage_metrics(model, usage)` to
  the `agent.think` END `metrics` when `decision.usage`; `generate_node` adds it
  from `provider.last_stream_usage` to the `llm.generate` END `metrics`.

**Frontend**
- `frontend/src/lib/derive.ts` — `DerivedView.usage: UsageTotals` (`rounds`,
  `promptTokens`, `completionTokens`, `totalTokens`, `costUsd`), accumulated in the
  existing visible-events loop from `agent.think/end` + `llm.generate/end` metrics.
- `frontend/src/lib/cost.ts` — **new.** `formatTokens(n)` (e.g. `1.2k`),
  `formatUsd(n)` (e.g. `$0.0003`, `<$0.0001`) — number formatting, not prose.
- `frontend/src/components/nodes/StationNode.tsx` — `innerRows` llm case: rows for
  rounds / tokens / cost from the aggregate (passed via node data or recomputed
  from events — see note).
- `frontend/src/components/FlowCanvas.tsx` — `readoutFor` llm: once usage exists,
  show `formatTokens(total) · formatUsd(cost)`; keep the live "streaming · N tok".
  Pass `view.usage` into node data so the node can render totals.
- `frontend/src/components/InspectorPanel.tsx` — llm `renderDetail`: a "usage &
  cost" section (rounds, prompt, completion, total, US$).
- `frontend/src/i18n/strings.ts` — new labels (see i18n table).

**Tests**
- `backend/tests/test_pricing.py` — **new** (AC1, no key).
- `backend/tests/test_agent.py` — add AC2 (`[openai]`).
- `frontend/src/lib/derive.usage.test.ts` — **new** (AC3, pure).

> Note on node data: `readoutFor`/`innerRows` currently take `StationRuntime`
> (per-station events). The aggregate spans the agent + llm stations, so the
> simplest path is to thread `view.usage` into the llm node's `data` in FlowCanvas
> and read it in `StationNode` (the node already receives computed `readout`). Keep
> the exhaustive switches `tsc`-clean.

## Protocol changes (constitution §1)

- `schemas.py` — **no enum change.** New `metrics` keys are additive floats.
- `events.ts` — **no change** (`metrics: Record<string, number>` already typed).
- Emitted in: `think_node` (`agent.think/end`), `generate_node` (`llm.generate/end`).
- Station mapping: unchanged; LLM node aggregates via `deriveView`.
- `readoutFor` + `innerRows` + `renderDetail` llm cases updated (still exhaustive).

## Data model changes

None — no Chroma / SQLite change. Cost is derived, not stored.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `inspector.rounds` | `LLM rounds` | `Rodadas da LLM` |
| `inspector.promptTokens` | `prompt tokens` | `tokens de prompt` |
| `inspector.completionTokens` | `completion tokens` | `tokens de resposta` |
| `inspector.totalTokens` | `total tokens` | `tokens totais` |
| `inspector.costUsd` | `cost (USD)` | `custo (US$)` |
| `inspector.usageCost` (section) | `Usage & cost` | `Uso e custo` |
| `node.rounds` (inner row) | `rounds` | `rodadas` |
| `node.cost` (inner row) | `cost` | `custo` |

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 pricing | `cost_usd` table dot-product + unknown ⇒ 0 | `backend/tests/test_pricing.py` |
| AC2 real usage | `[openai]` run ⇒ think/generate ends carry tokens + cost | `backend/tests/test_agent.py` |
| AC3 aggregate | events w/ usage ⇒ `deriveView().usage` sums + rounds | `frontend/src/lib/derive.usage.test.ts` |
| AC4 render | exhaustive `readoutFor`/`renderDetail`; build green | `npm run build` (tsc) |
| AC5 back-compat | no-usage run aggregates to zeros; existing tests pass | existing suites |
| AC6 bilingual | strings present en + pt | `i18n/strings.test.ts` parity |

## Risks / trade-offs

- **Prices drift.** The table is a labelled teaching approximation, not a billing
  source of truth; unknown models price at 0 to avoid lying. Documented in code.
- **Usage metadata absence.** If a model/SDK path omits `usage_metadata`, metrics
  are simply absent and the aggregate reads 0 — no crash (AC5).
- **`stream_usage` cost.** Requesting streamed usage adds a final usage-only chunk;
  negligible, and the only honest way to get real completion tokens while streaming.
- **Aggregate spanning two stations.** Threading `view.usage` into the llm node
  keeps the projection the single source; avoid recomputing in components.
