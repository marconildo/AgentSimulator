# Tasks: Interactive experiments (prompt, tools, top-k)

> Ordered TDD checklist for `spec.md` + `plan.md`. Each implementation task is
> preceded by the test that must fail first (red → green → refactor). Check boxes
> as you go and advance the spec status (`clarified → in-progress → done`).
>
> Backend tests run against **OpenAI** (CI key secret) with structural assertions.
> Clarify is **done** (Q1–Q6 resolved in `spec.md`).

## Phase 1 — Request inputs (schema)

- [x] **T1 — test first**: in `backend/tests/test_protocol.py`, assert
  `ChatRequest` accepts optional `system_prompt` (≤2000) and `enabled_tools`,
  bounds `top_k` to `1..8` (out-of-range rejected), and that omitting them keeps
  today's defaults (AC5 seed).
- [x] **T2 — implement**: add `system_prompt: str | None` (`max_length=2000`),
  `enabled_tools: list[str] | None`, tighten `top_k` (`ge=1, le=8`) in
  `schemas.py`; add `system_prompt`/`enabled_tools` to `AgentState`.

## Phase 2 — Tool toggles (AC2, AC3)

- [x] **T3 — test first**: in `test_mcp.py`, `registry.specs(None)` is all three,
  `specs(["calculator"])` is only calculator, `specs([])` is empty; a disabled
  tool `call()` is refused. In `test_agent.py` (`[openai]`): `calculator`
  disabled + a math question ⇒ `mcp.discover` lists only enabled and **no
  `mcp.call` to calculator**; `enabled_tools=[]` ⇒ no `mcp.call`, answer
  non-empty.
- [x] **T4 — implement**: `ToolRegistry.specs(enabled=None)` filtered view +
  `call()` guard (`mcp/client.py`); `route`/`think` read `state["enabled_tools"]`
  and thread it from `run_agent`.

## Phase 3 — System prompt (AC1)

- [x] **T5 — test first** (`test_agent.py`, `[openai]`): a `system_prompt`
  override makes the `llm.prompt` END `data["system"]` contain the override (not
  the default); a blank override falls back to the default; answer non-empty.
- [x] **T6 — implement**: thread `system_prompt` through `run_agent` → state;
  `think`/`generate` pass `override or SYSTEM_PROMPT` (blank ⇒ default) as
  `system=`. No provider change needed.

## Phase 4 — top-k (AC4) + endpoint wiring (AC5, AC6)

- [x] **T7 — test first**: `test_rag.py`/`test_api.py` — a `top_k` override makes
  `rag.retrieve` return ≤ k chunks and the event reflect k; no-override run keeps
  default prompt, 3 tools, default top-k (regression). `test_api.py` —
  `GET /api/config` returns `default_system_prompt`, `tools`, `default_top_k`,
  `top_k_min/max`.
- [x] **T8 — implement**: `main.py` passes `system_prompt`/`enabled_tools`/`top_k`
  into the single `run_agent` call (stream + batch share it); add `GET
  /api/config`.

## Phase 5 — Frontend store + plumbing (AC7)

- [x] **T9 — test first** (`frontend/src/lib/experiment.test.ts`, Vitest):
  `useExperiment` — defaults are "unsent" sentinels; `toggleTool` off then back
  on normalizes to all-enabled (null); per-conversation isolation (edit A doesn't
  touch B); `adopt("__draft__", id)` migrates; `reset` clears.
- [x] **T10 — implement**: `lib/experiment.ts` store; `chatApi.getConfig()` +
  `AppConfig`; `sse.ts` `streamChat`/`batchChat` accept+send `overrides`;
  `useChat.send` reads overrides, `ensureSession` adopts the draft.

## Phase 6 — Frontend controls + i18n (AC6, §4)

- [x] **T11 — implement**: widen + scroll `SettingsPanel`; add System prompt
  (textarea + reset), Tools (checkboxes) and Retrieval (top-k slider) scoped to
  `useChat.activeSessionId`; **remove the SOON Tools/RAG rows**.
- [x] **T12 — i18n + test**: add `settings.experiment.*` strings (incl. per-tool
  labels) en **and** pt; drop `soon`/`tools`/`rag`/`moreSoon`. `strings.test.ts`
  asserts en/pt key parity for the new block.

## Phase 7 — Verify & refactor

- [x] **T13 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (with
  `OPENAI_API_KEY`) · `npm run build` · `npm test`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` (AC1–AC7) maps to a passing test
- [x] `ruff` clean · `pytest -q` green (with `OPENAI_API_KEY`)
- [x] `npm run build` + `npm test` pass
- [x] No new `Stage`; `ChatRequest` fields optional; no `events.ts` mirror needed
- [x] Backwards compatible: no overrides ⇒ today's behavior (AC5 green)
- [x] No "SOON" rows remain for features that are real
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
