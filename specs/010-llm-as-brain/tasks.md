# Tasks: The LLM is the brain

> TDD checklist for `010-llm-as-brain`. Red → green → refactor. Depends on 011.

## Tasks

- [x] **T1 — test first (AC1)**: in `backend/tests/test_agent.py`, assert a run's
      `llm.prompt` events include **both** `start` and `end`, and the `start`
      precedes the round's `mcp.call`. (Fails today: `llm.prompt` is end-only.)
- [x] **T2 — implement (A)**: `graph.py` `think_node` — nest `provider.decide` in an
      `LLM_PROMPT` span (start/end) inside `agent.think`; the `end` carries the
      prompt preview; `agent.think/end` keeps decision/tool_calls + 011 usage. → T1.
- [x] **T3 — test first (AC2)**: `derive.test.ts` — a reasoning round's events
      (`agent.think/start` → `llm.prompt/start`→`/end` → `agent.think/end`) ⇒ llm
      active during the span; `agent→llm` then `llm→agent` active hop.
- [x] **T4 — verify**: confirm `deriveView` already satisfies T3 (no projection
      change expected); adjust only if red.
- [x] **T5 — regression (AC3)**: existing `test_history_is_carried_into_the_prompt`
      / `test_system_prompt_override_reaches_the_prompt` still green (preview shape).
- [x] **T6 — implement (B)**: redesign `AgentDetail.tsx` as anatomy; consume
      `view.usage` for real rounds/tokens/cost; label the context bar as approximate.
- [x] **T7 — i18n (AC6)**: add en + pt `agentDetail` anatomy labels; parity green.
- [x] **T8 — gates (AC4/AC5)**: `ruff check .` · `pytest -q` · `npm test` ·
      `npm run build` all green.
- [x] **T9 — refactor**: tidy; spec/tasks status → done.

## Definition of done

- [x] Every acceptance criterion maps to a passing test
- [x] `ruff check .` clean · `pytest -q` green (with `OPENAI_API_KEY`)
- [x] `npm test` green · `npm run build` passes
- [x] No new `Stage`/`Phase`; `schemas.py` ↔ `events.ts` in sync; every Stage mapped + phased
- [x] All new anatomy labels exist en **and** pt
- [x] `spec.md` status → `done`
