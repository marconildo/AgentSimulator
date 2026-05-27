# Plan: The LLM is the brain

> HOW for `010-llm-as-brain`. Depends on `011-token-cost` (consumes `view.usage`).
> No new `Stage` (§1): the reasoning call reuses `llm.prompt` as a span.

## Approach

Two parts:

**A — make reasoning an observable LLM span (backend).** Today `think_node` wraps
`provider.decide` in the `agent.think` stage and then emits `llm.prompt` as a
trailing `end`-only marker. Restructure so the decide call runs **inside** an
`emitter.stage(LLM_PROMPT, …)` span nested in `agent.think`:

```
agent.think/start (agent)
  llm.prompt/start (llm)        ← the agent consults the model
    provider.decide(...)        ← real round-trip to the brain
  llm.prompt/end   (llm)        ← carries the prompt preview (unchanged shape)
agent.think/end   (agent)       ← carries decision + tool_calls + 011 usage
```

So the projection lights the **llm** station while the model decides and animates
`agent→llm` then `llm→agent` each round — without adding a `Stage` (llm.prompt
already maps to the llm station + a phase). 011's usage stays on `agent.think/end`.

**B — anatomy redesign (frontend).** Rebuild `AgentDetail` to read as an organism,
composed (as today) purely from the captured trace + `view.usage`:
- **Senses / input** — the user message (working memory).
- **Brain (LLM)** — centerpiece: "every reasoning round is a call to the model",
  model name, **real rounds / prompt / completion / total tokens / US$ cost** from
  `view.usage` (replacing the `len/4` estimate as the headline).
- **Reasoning loop** — reason → act → observe; each round + its decision.
- **Memory** — working (scratchpad: tool calls→results), long-term (history),
  vector recall (RAG chunks).
- **Hands / tools** — available tools + the calls made.
- **Speech / output** — the answer.
- **Context window** — the proportional bar stays, **explicitly labelled as an
  approximate proportion**; the real totals come from the Brain block.

## Affected files

**Backend**
- `backend/app/agent/graph.py` — `think_node`: nest the `provider.decide` call in
  an `LLM_PROMPT` span; move the prompt-preview onto its `end`; keep `agent.think`
  carrying decision/tool_calls + 011 usage.

**Frontend**
- `frontend/src/components/AgentDetail.tsx` — redesigned anatomy layout; consume
  `view.usage`; drop the headline reliance on the `len/4` estimate (keep the bar as
  a labelled proportion).
- `frontend/src/i18n/strings.ts` — `agentDetail` gains anatomy labels (brain,
  senses, hands, speech, "reason = a model call", real totals labels).
- `frontend/src/lib/derive.test.ts` (or a small new test) — AC2 round-trip
  projection regression (llm active during the prompt span; agent⇄llm hop).

**Tests**
- `backend/tests/test_agent.py` — AC1 (`[openai]`): `llm.prompt` has start+end and
  the start precedes the round's `mcp.call`s.
- `frontend/src/lib/derive.test.ts` — AC2 projection regression.

## Protocol changes (constitution §1)

- `schemas.py` — **no change** (no new `Stage`/`Phase`; `llm.prompt` gains a
  `start` phase at the call site only).
- `events.ts` — **no change.**
- Emitted in: `think_node` (restructured).
- Station mapping / `STAGE_TO_PHASE` / `readoutFor` / `renderDetail`: unchanged
  (same stages).

## Data model changes

None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `agentDetail.anatomyTitle` | `Agent — anatomy` | `Agente — anatomia` |
| `agentDetail.brain` | `Brain · the LLM` | `Cérebro · a LLM` |
| `agentDetail.brainHint` | `every reasoning round is a call to the model` | `cada rodada de raciocínio é uma chamada ao modelo` |
| `agentDetail.senses` | `Input · the message` | `Entrada · a mensagem` |
| `agentDetail.hands` | `Tools · the agent's hands` | `Ferramentas · as mãos do agente` |
| `agentDetail.speech` | `Answer · what it says` | `Resposta · o que ele diz` |
| `agentDetail.rounds` | `rounds` | `rodadas` |
| `agentDetail.promptTokens` | `prompt tokens` | `tokens de prompt` |
| `agentDetail.completionTokens` | `completion tokens` | `tokens de resposta` |
| `agentDetail.totalTokens` | `total tokens` | `tokens totais` |
| `agentDetail.cost` | `cost (USD)` | `custo (US$)` |
| `agentDetail.approxProportion` | `approx. proportion of the context` | `proporção aprox. do contexto` |

> Existing `agentDetail` keys (reactLoop, workingMemory, etc.) are reused; only the
> additions above are new. Final wording may be tuned during implementation, kept
> en+pt in lockstep.

## Cloud map (constitution §5)

n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 reasoning span | `[openai]` run ⇒ `llm.prompt` start+end, start before mcp.call | `backend/tests/test_agent.py` |
| AC2 round-trip projection | events of a round ⇒ llm active in span + agent⇄llm hop | `frontend/src/lib/derive.test.ts` |
| AC3 prompt still inspectable | `llm.prompt/end` carries system/context/tools/history | `backend/tests/test_agent.py` (existing) |
| AC4 anatomy real numbers | build clean; numbers come from tested `view.usage` | `npm run build` + 011 tests |
| AC5 protocol intact | no enum change; maps total; existing suites pass | existing suites |
| AC6 bilingual | strings present en + pt | `i18n/strings.test.ts` |

## Risks / trade-offs

- **Event ordering churn:** `llm.prompt` now precedes `agent.think/end`. Existing
  tests select `llm.prompt/end` by stage+phase (not position), so they hold; AC3
  pins the preview shape.
- **Nested latency:** `agent.think` latency now includes the `llm.prompt` span —
  expected and correct (the think *is* the model call).
- **Anatomy scope creep:** keep the redesign composed from existing trace +
  `view.usage`; no new requests (constitution §7 pure projection).
