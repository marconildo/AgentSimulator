# Tasks: Persisted Agent

> Red → green → refactor. Backend first (so the FE has real shapes to bind to),
> then the FE rewires its sections to PATCH the agent, then cleanup.

## Tasks

### Backend — schema & seed

- [ ] **T0 — branch + spec bump.** Status `clarified → in-progress`.
- [ ] **T1 — test first (AC1, AC3, AC11).** `test_agents_table.py`:
  table exists with the documented columns; seed idempotency; clear+reseed.
- [ ] **T2 — implement.** Add `agents` table to `_SCHEMA`, idempotent
  migration, `seed_default_agent()` in `db/seed.py`, wired in `lifespan`.
  `_clear_all_sync` deletes agents (except default) and the lifespan
  re-seeds. T1 green.

### Backend — sessions clone + inline agent

- [ ] **T3 — test first (AC2, AC4, AC5, AC8, AC12).**
  `test_agents_endpoint.py`:
  - POST /api/sessions clones default; returns inline agent.
  - GET list/single include `agent`.
  - DELETE session cascades to the cloned agent; default remains.
  - `sessions.agent_name` is dropped after migration.
- [ ] **T4 — implement.** `_create_session_sync` clones default;
  `_get_session_sync`/`_list_sessions_sync` JOIN agents; `_delete_session_sync`
  drops the agent row first (when non-default); migration step drops
  `agent_name` after backfill. T3 green.

### Backend — PATCH /api/agents/{id}

- [ ] **T5 — test first (AC6, AC7).** `test_agents_endpoint.py`:
  - PATCH partial fields, return updated row.
  - over-cap → 422, unlisted model → 422, unknown id → 404.
  - two sessions, PATCH one's agent, the other unchanged (isolation).
- [ ] **T6 — implement.** Pydantic `AgentPatch`/`AgentOut` in `schemas.py`;
  `_update_agent_sync` + async wrapper; `PATCH /api/agents/{id}` handler
  (allowlist for `model`, bound validation). T5 green.

### Backend — chat reads from agent

- [ ] **T7 — test first (AC9, AC10).** `test_chat_uses_agent.py`
  (`@pytest.mark.openai`):
  - PATCH agent.agent_prompt → run chat with empty overrides → trace's
    llm.prompt.system contains the new role.
  - Same agent, but send `system_prompt` in the request → override wins
    (keep the agent untouched in DB).
- [ ] **T8 — implement.** In `/api/chat`, when any of the 4 fields is
  None on the request, fall back to `session.agent.*`. Compose accordingly.
  T7 green.

### Frontend — types + store reshape

- [ ] **T9 — implement (no separate test; covered by AC13, AC20 + tsc).**
  - `lib/chatApi.ts`: new `AgentMeta` interface; `SessionMeta.agent?: AgentMeta`;
    `patchAgent(id, body)`.
  - `lib/experiment.ts`: drop `systemPrompt`, `agentPrompt`, `model`,
    `enabledTools` from `ConvExperiment` + setters + from `overridesFor`.
- [ ] **T10 — test first (AC17, AC13).** `useChat.agent.test.ts`:
  loading sessions with agent inline exposes them; `replaceSession`
  updates inline agent. Existing experiment tests updated for the
  smaller `ConvExperiment` shape.
- [ ] **T11 — implement.** `useChat.ts` propagates the inline `agent`
  through `replaceSession` (already does via spread merge). New
  `lib/agentAccess.ts` exporting `useActiveAgent()` (returns
  `{ agent, updateAgent(patch), flush }`) — same debounce/flush pattern
  as the 042 Identity fix. T10 green.

### Frontend — sections rewired

- [ ] **T12 — test first (AC14 Identity).** `Identity.test.tsx` updated:
  blur/unmount flush still works; PATCH URL is `/api/agents/{id}` now.
- [ ] **T13 — implement.** `Identity.tsx` uses `useActiveAgent`. Description
  finally persists alongside name. Old `patchSession` for `agent_name`
  removed.
- [ ] **T14 — test first (AC14 prompts/model/tools).**
  `Prompts.test.tsx`, `Model.test.tsx`, `Tools.test.tsx`:
  typing triggers `patchAgent({…})`; reset clears server-side back to
  the seed value? No — the section's "Reset" is gone in this spec
  (no more "override vs default" duality; the row IS the truth).
- [ ] **T15 — implement.**
  `SystemPromptSection.tsx`, `AgentPromptSection.tsx`, `ModelSection.tsx`,
  `ToolsSection.tsx` all switch from `useExperiment.*` to `useActiveAgent`.
  Remove Reset buttons (no override concept anymore). T14 green.

### Frontend — chat name + station

- [ ] **T16 — test first (AC15).** `ChatPanel.agentName.test.tsx`:
  render a thread with a session whose `agent.name = "Hotel Analyst"` —
  assistant header reads that, not "Agent".
- [ ] **T17 — implement.** `ChatPanel.tsx` reads `session.agent?.name`
  with the localized fallback. `StationNode.tsx` reads from
  `activeSession?.agent?.name` (replaces the 042 `activeSession?.agent_name`).
  T16 green.

### Frontend — Settings redirect + i18n

- [ ] **T18 — test first (AC18, AC19).** `SettingsExperiment.test.tsx`:
  no system-prompt textarea; redirect note + button present. i18n
  parity test includes the new keys.
- [ ] **T19 — implement.** Drop the textarea + reset; add the redirect
  block with the bilingual note + the "Open Agent Anatomy" button
  (calls `useAgentAnatomy.openDialog`). T18 green.

### Wiring + cleanup

- [ ] **T20 — sweep existing tests.** Any test that constructed a
  SessionMeta literal can stay (agent is optional). Any test that
  imported `useExperiment.setSystemPrompt` etc. needs the section
  test instead. Run `npm run build` until clean.
- [ ] **T21 — manual smoke.** Edit name + each prompt + model + tools in
  a fresh conversation; reload; reopen dialog; values are there. Chat
  bubble shows the agent's name. Settings → Experiment shows the
  redirect, not the textarea.
- [ ] **T22 — memory pointer.** Add `spec-043-persisted-agent.md`.

## Definition of done

- [ ] Every AC maps to ≥1 passing test.
- [ ] `ruff check .` + `ruff format --check .` clean.
- [ ] `pytest -m "not openai"` green; `@openai` happy path green with key.
- [ ] `npm run build` (`tsc --noEmit` + vite) green.
- [ ] `npm test` (Vitest) green.
- [ ] Protocol mirror in sync (no Stage/Phase change).
- [ ] en + pt parity for new strings.
- [ ] `sessions.agent_name` dropped; `agents` table populated.
- [ ] Default agent always exists (seeded at startup; re-seeded after clear).
- [ ] `spec.md` status updated to `done`.
- [ ] Memory pointer added.
