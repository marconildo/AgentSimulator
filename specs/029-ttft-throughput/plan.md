# Plan: Time-to-first-token & generation throughput

> The HOW. Written after `spec.md` is `clarified`.

## Approach

In `generate_node` (`backend/app/agent/graph.py`), wrap the existing `async for token in
provider.stream_answer(...)` loop with a monotonic clock: record `t0` at stage start,
capture `t_first` on the first token, and `t_last` after the loop. Compute
`ttft_ms = (t_first - t0) * 1000` and `tokens_per_sec = len(tokens) / max(t_last -
t_first, ε)`, and add both to `rec.metrics` (which already carries `tokens` and the 011
usage/cost). Because `stream_answer` yields tokens in both stream and batch mode (batch
only suppresses the PROGRESS emits), the measurement works in both — satisfying AC3.

Frontend: extend `deriveView` (or the LLM readout path) to read `ttft_ms` /
`tokens_per_sec` off the `llm.generate` END metrics and expose them; render two extra
rows in the LLM station readout / Inspector when present. For the HUD, the usage
projection (`lib/usage.ts`) already tallies `promptTokens` / `completionTokens` — render
the input/output split in `ConversationHud` from those existing fields. All additive and
guarded by presence so legacy traces replay cleanly.

Alternative considered: a dedicated `llm.first_token` PROGRESS marker event. Rejected —
the first PROGRESS token already exists in stream mode, and a summary metric on the END
event is simpler, works in batch mode, and avoids any protocol-type churn.

## Affected files

**Backend**
- `backend/app/agent/graph.py` — measure `ttft_ms` + `tokens_per_sec` in
  `generate_node`, add to `rec.metrics`.

**Frontend**
- `frontend/src/lib/derive.ts` — surface `ttft_ms` / `tokens_per_sec` from the
  `llm.generate` END metrics into the view (or read in the readout).
- `frontend/src/components/FlowCanvas.tsx` (`readoutFor`) and/or
  `frontend/src/components/InspectorPanel.tsx` — render TTFT + throughput rows for the
  LLM station when present.
- `frontend/src/components/ConversationHud.tsx` — input/output token split from
  `usage.promptTokens` / `usage.completionTokens`.
- `frontend/src/lib/cost.ts` — reuse `formatTokens`; add a `formatTps` / `formatMs`
  helper if needed.
- `frontend/src/i18n/strings.ts` — labels (en + pt).
- Tests: `backend/tests/test_agent.py` (or a focused `test_metrics.py`),
  `frontend/src/lib/derive.usage.test.ts` / a new derive test.

## Protocol changes (constitution §1)

- Additive `metrics` keys on `llm.generate` END: `ttft_ms`, `tokens_per_sec`. No
  `Stage`/`Phase`/`TraceEvent` *type* change; `events.ts` `metrics` is already an open
  numeric map → no mirror edit required. Document the keys in the schema docstring.
- Mapped station: existing **LLM** (`llm.generate` already maps there). No
  `readoutFor`/`renderDetail` *case* added (LLM case already exists) — only fields within.

## Data model changes

- None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `readout.ttft` | time to first token | tempo até o 1º token |
| `readout.throughput` | throughput | vazão |
| `hud.tokensIn` | in | entrada |
| `hud.tokensOut` | out | saída |

(Units `s` / `tok/s` / `ms` are symbols, not translated.)

## Cloud map (constitution §5)

- n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `[openai]` streamed run → `ttft_ms>0`, `tokens_per_sec>0` on generate END | `backend/tests/test_agent.py` |
| AC2 | `[openai]` `ttft_ms ≤ latency_ms`; tps consistent within tolerance | same |
| AC3 | `[openai]` batch-mode run still records both metrics | same |
| AC4 | derive surfaces metrics; readout renders rows iff present | `frontend/src/lib/derive*.test.ts` |
| AC5 | HUD input+output split sums to total; absent with no usage | `frontend/src/lib/usage.test.ts` + render |
| AC6 | strings parity (en/pt leaf keys, non-empty) | `frontend/src/i18n/strings.test.ts` |
| AC7 | parity tests + `test_token_cost` unchanged; legacy trace replays | existing suites |

## Risks / trade-offs

- **Throughput denominator**: if only one token streams, `t_last - t_first ≈ 0` — guard
  with an ε floor and treat a single-token answer as tps = tokens (or omit). Pin the
  edge case in a test.
- Monotonic clock only (`time.perf_counter`), never wall-clock, to avoid NTP skew.
- Keep tolerances loose in `[openai]` assertions (model speed varies) — assert ordering
  and positivity, not absolute values.
