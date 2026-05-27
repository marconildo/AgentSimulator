# Tasks: Skills — a global, agent-loadable skill catalog

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the
> test that should fail first (red → green → refactor). Check boxes as you go.

## Backend — persistence & seeding

- [x] **T1 — test (AC1)**: failing test for skill CRUD round-trip + unique-name
  rejection in `backend/tests/test_skills.py`.
- [x] **T2 — implement (AC1)**: `skills` table in `_SCHEMA` + sync/async CRUD on
  `ConversationStore` (`create/list/get/get_by_name/update/delete`), `name` UNIQUE.
- [x] **T3 — test (AC8)**: failing test that `seed_skills()` populates an empty catalog
  with ≥1 valid example skill and is idempotent.
- [x] **T4 — implement (AC8)**: `app/db/seed.py` with the three seeded example skills
  defined in `plan.md` (`resumo-em-bullets`, `explicar-para-iniciante`,
  `glossario-ao-final`); seed-if-empty; call from lifespan.
- [x] **T5 — test (AC7)**: failing test that `clear_all()` reports `skills_deleted` and
  empties the catalog; update the 025 exact-equality assertions in `test_clear.py`.
- [x] **T6 — implement (AC7)**: `_clear_all_sync` counts+wipes `skills`; add
  `skills_deleted` to the endpoint response.

## Backend — the `load_skill` tool

- [x] **T7 — test (AC4)**: failing test that the registry's `load_skill` returns a known
  skill's body, returns `error:` for an unknown name, and that the `mcp.call` `data`
  shape is `{tool: "load_skill", args:{name}, result}` (assert over both transports).
- [x] **T8 — implement (AC4)**: `_load_skill` + `@mcp.tool() load_skill` in `server.py`;
  mirror in `client.py._load_local`; both read body via `get_store()`.
- [x] **T9 — test (AC3)**: failing test that `agent_tool_specs` includes `load_skill`
  with a non-empty description and that `enabled_tools=[]` drops it.
- [x] **T10 — implement (AC3)**: ensure `load_skill` flows through `agent_tool_specs` /
  `GET /api/config` / `mcp.discover` like the other MCP tools (no extra code if the
  registry mirror is correct; add the config assertion).

## Backend — prompt catalog & applied-skills

- [x] **T11 — test (AC2)**: failing test that `skills_block`/`compose_system` includes
  every skill's name + description and **excludes** any body; and (AC3) that the block is
  omitted when `load_skill` is not advertised.
- [x] **T12 — implement (AC2/AC3)**: `skills_block(catalog)` + `compose_system` in
  `prompts.py`; `AgentState.skills_catalog`; `run_agent[_state]` seeds it; main.py reads
  name+desc before the run; `_effective_system` appends the block only when `load_skill`
  is in the advertised specs.
- [x] **T13 — test (AC6)**: failing test that applied skill names persist on the message
  (`write_message` + `_list_messages_sync`) and that `_applied_skills(emitter)` returns
  the distinct successful `load_skill` names.
- [x] **T14 — implement (AC6)**: `messages.skills` column (mirror `chunks`) + `ALTER
  TABLE` guard; `_applied_skills` in main.py; persist on `write_message`; return on
  `list_messages`.

## Backend — REST & end-to-end agent

- [x] **T15 — test (AC1 endpoint)**: failing API test for `GET/POST /api/skills` and
  `PUT/DELETE /api/skills/{id}` (create→list→update→delete; duplicate name ⇒ 4xx).
- [x] **T16 — implement (AC1 endpoint)**: `SkillIn`/`SkillOut` schemas + the four routes
  in `main.py`.
- [x] **T17 — test (AC5, `[openai]`)**: failing structural test — a question matching a
  seeded skill's description triggers a `load_skill` `mcp.call`; answer non-empty.
- [x] **T18 — implement (AC5)**: only wiring/prompt tuning if needed to make the agent
  reliably discover+load the matching skill (no forcing).
- [x] **T19 — test (AC11)**: failing guard — empty catalog ⇒ no skills block, no
  `load_skill` calls, no persisted applied skills; existing `test_agent.py`/`test_mcp.py`
  stay green.
- [x] **T20 — implement (AC11)**: ensure the empty-catalog path is byte-for-byte today's
  behavior (block omitted, no extra prompt text).

## Frontend

- [x] **T21 — test (AC6)**: failing `frontend/src/lib/skills.test.ts` for
  `appliedSkills(events)` (distinct successful `load_skill` names; empty when none).
- [x] **T22 — implement (AC6)**: `lib/skills.ts`; `ChatMessage.skills`,
  `ClearResult.skills_deleted`, `Skill` type + CRUD client in `chatApi.ts`.
- [x] **T23 — implement (badge, AC6)**: `SkillsBadge` in `ChatPanel.tsx` agent footer
  (count + hover list of `message.skills`); render only when non-empty.
- [x] **T24 — implement (UI, AC1)**: Skills section in `SettingsPanel.tsx` — list +
  inline editor (name/description/body, Save/Delete/Cancel/New) wired to the CRUD client.
- [x] **T25 — test (AC10)**: extend `strings.test.ts` expectations; **implement** the
  `settings.skills.*` + `chat.skills*` strings in en + pt (identical leaf keys).

## Cross-cutting

- [x] **T26 — protocol/parity (AC9)**: confirm no new `Stage`; `test_protocol.py`,
  `phases.test.ts`, `stations.test.ts` all green (no changes expected).
- [x] **T27 — refactor**: clean up, keep all tests green; move `spec.md` status to
  `done`.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format .`
- [x] `pytest -q` green (with `OPENAI_API_KEY`; keyless guard tests still run)
- [x] `npm run build` passes (`tsc --noEmit` + build) · `npm test` (Vitest) green
- [x] Protocol mirror unchanged (`schemas.py` ↔ `events.ts`), every `Stage` still mapped
  to a station + a phase
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
