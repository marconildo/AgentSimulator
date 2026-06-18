# Plan: LLM rounds history (per-call drill-in)

> HOW. Respects the constitution: pure projection (§3 honesty — every call shown is a
> real model call from the trace), one source of truth for the visual model (§6 — the
> LLM station gains a drill-in like the Agent, no new station), bilingual (§4), and
> single source of truth for derivation (a tested pure helper, like `deriveView`).

## Approach

The trace already contains everything: `think_node` emits **one `llm.prompt` END and
one `agent.think` END per reasoning round**, and `generate_node` emits one
`llm.generate` END. The Inspector only shows the last because `pick()` returns the most
recent match. So this is a **rendering/derivation** gap, not a data gap.

1. Add a **pure helper** `deriveLlmRounds(events)` in `frontend/src/lib/llmRounds.ts`
   that walks the event log (the same `visible` slice the canvas uses) and returns an
   ordered `LlmCall[]`:
   - One entry per `agent.think` END = a **reasoning round**. Pair it with the
     `llm.prompt` END that closed *within that round* (the last `llm.prompt` END whose
     `seq` is below this think END's `seq` and above the previous think END's `seq` —
     robust to the `llm_timeout` mode's multiple attempt spans, which simply become
     prompt-only rounds with no token row). From the `llm.prompt` END take the
     `PromptPreview` (system/history/context/tools/messages) + `latency_ms`; from the
     `agent.think` END take `prompt_tokens`/`completion_tokens`/`total_tokens`/`cost_usd`
     + `decision` + `tool_calls` + `model`.
   - One final entry per `llm.generate` END = the **generation call**: `answer`/`model`
     from `data`, `latency_ms`/`ttft_ms`/`tokens_per_sec` + token metrics from `metrics`.
   - Empty/partial logs yield a partial list (AC4): the walk only emits an entry when its
     END is present.
   This isolates the logic so it's unit-testable without React (AC1–AC4).

2. Add a focused overlay **`frontend/src/components/LLMDetail.tsx`**, a sibling of
   `AgentDetail` (same shell: fixed overlay over `<main>`, `← back`/`✕`, reads
   `events`+`cursor` from `useSimulator`, projects via `deriveLlmRounds`). Renders the
   call list; each reasoning round is an expandable row (label · latency · tokens · cost,
   decision/tool chips, then the full prompt sections reusing the same labels the
   Inspector uses — system / history / retrieved context / tools / message). The
   generation row shows answer + ttft/throughput. Keep it presentational; all numbers go
   through the existing `formatLatency`/`formatTokens`/`formatUsd` helpers.

3. Wire the **open/close** like the Agent drill-in (no store change needed — `detail`
   already accepts any `StationId`):
   - `frontend/src/components/nodes/StationNode.tsx`: add `llm: true` to `HAS_DETAIL`
     (the existing button already falls back to `t.node.openFull` for non-rag/pageindex
     ids, so no label branch needed).
   - `frontend/src/App.tsx`: render `{detail === "llm" && <LLMDetail view={view}
     onClose={closeDetail} />}` beside the `AgentDetail` line.

4. **i18n**: a new `llmDetail` block in `strings.ts` (title, "reasoning round N",
   "generation", "decision: called tools / answered", section headings if not reused
   from `agentDetail`/inspector), en + pt.

### Alternatives considered
- *Inline section in the Inspector LLM detail* (accordion of rounds): less code, but the
  Inspector panel is narrow and the per-round prompts are long; the user explicitly chose
  the full-view overlay. Rejected.
- *New backend per-round aggregate event*: unnecessary — the data is already streamed;
  adding a Stage would violate "don't add protocol you don't need" and §3.

## Affected files

**Backend**
- none.

**Frontend**
- `frontend/src/lib/llmRounds.ts` — **new** pure helper `deriveLlmRounds` + `LlmCall` type.
- `frontend/src/lib/llmRounds.test.ts` — **new** unit tests (AC1–AC4).
- `frontend/src/components/LLMDetail.tsx` — **new** drill-in overlay.
- `frontend/src/components/nodes/StationNode.tsx` — `HAS_DETAIL.llm = true`.
- `frontend/src/App.tsx` — mount `LLMDetail` when `detail === "llm"`.
- `frontend/src/i18n/strings.ts` — `llmDetail` strings (en + pt) + type.

## Protocol changes (constitution §1)

- none. No `schemas.py` / `events.ts` change. `PromptPreview` (already mirrored) is reused.
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` unchanged (no new `Stage`).

## Data model changes

- none (no vector store, no SQLite change).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `llmDetail.title` | LLM · calls this turn | LLM · chamadas deste turno |
| `llmDetail.subtitle` | Every model call of this turn — prompt, latency and tokens | Cada chamada ao modelo neste turno — prompt, latência e tokens |
| `llmDetail.reasoningRound` | Reasoning round {n} | Rodada de raciocínio {n} |
| `llmDetail.generation` | Answer generation | Geração da resposta |
| `llmDetail.decisionCalledTools` | called tools | chamou ferramentas |
| `llmDetail.decisionAnswered` | answered | respondeu |
| `llmDetail.latency` | latency | latência |
| `llmDetail.noCalls` | No LLM calls yet — step forward to watch the rounds appear. | Nenhuma chamada ao LLM ainda — avance para ver as rodadas surgirem. |
| `llmDetail.promptForRound` | Assembled prompt | Prompt montado |

(Prompt-section labels — system / history / retrieved context / tools / message — and
ttft/throughput labels are reused from the existing `inspector`/`agentDetail` blocks.)

## Cloud map (constitution §5)

n/a — no new tier/station (the `llm` station already carries its cloud map).

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | N think + 1 generate → N+1 ordered calls, kinds correct | `frontend/src/lib/llmRounds.test.ts` |
| AC2 | round 1 vs round 2 expose distinct prompt text + latency + tokens (not the last) | `frontend/src/lib/llmRounds.test.ts` |
| AC3 | generation entry carries answer + latency + ttft + tps | `frontend/src/lib/llmRounds.test.ts` |
| AC4 | empty log → []; partial log → only ended calls | `frontend/src/lib/llmRounds.test.ts` |
| AC5 | `HAS_DETAIL.llm` truthy + App mounts `LLMDetail` on `detail==="llm"` (render/smoke) | `frontend/src/components/LLMDetail.test.tsx` (or assert HAS_DETAIL + open contract) |
| AC6 | en & pt both define every `llmDetail` key (parity) | extend existing strings-parity test if present, else a small `strings` test |

Tests assert **structurally** over synthetic `TraceEvent[]` fixtures (no OpenAI needed);
this is FE-only, so `pytest` is unaffected.

## Risks / trade-offs

- **Round pairing under `llm_timeout`**: the failure mode emits several `llm.prompt`
  attempt spans inside one `think`. The seq-window pairing keeps them as the round's
  prompt(s) without inventing token rows — acceptable and honest (out of scope to chart
  the backoff here). Covered by a guard in the helper, not a hard requirement.
- **Cursor consistency**: the overlay must read the same `visible` slice as the canvas
  (events.slice(0, cursor+1)) so step/replay stays coherent — mirror `AgentDetail`.
- Low risk overall: additive, no protocol, no backend, no existing-test churn beyond the
  new files.
