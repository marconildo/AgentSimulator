# Plan: Persisted Agent

> Spec is `clarified`. This plan describes the wiring: a new `agents` table
> with idempotent seed + clone-on-create, an inline `agent` object on session
> reads, a single `PATCH /api/agents/{id}` endpoint, and a frontend that drops
> the four in-memory `useExperiment` fields in favor of direct PATCH calls.

## Approach

**One new entity, server-side authority, FE goes thin.**

The agent moves from a Zustand slice to a SQLite row. Each conversation owns
its own agent (clone-on-create from the default), so edits are local to the
conversation — exactly the mental model the dialog already implies. The
dialog sections stop writing to `useExperiment.byConv[…]` and start
PATCHing the agent row directly (same 500 ms debounce + flush-on-blur +
flush-on-unmount as 042's fix). Sessions read the agent inline, so the chat
sidebar / station / dialog all render from one shape with no extra
round-trip.

The 006 `ChatRequest` request-level overrides stay on the protocol (so
programmatic callers and tests keep working) — the FE simply stops sending
them for the chat path, and the backend's `/api/chat` falls back to the
session's agent row when they're absent.

**Alternatives considered**

- Adding 4 columns to `sessions` instead of a separate table: less code today,
  but blocks the 044 catalog spec. Cost of separate table is one ALTER + one
  JOIN; benefit is conceptual cleanliness + open door for catalog.
- Catalog (shared agents): rejected — separate spec (044). Today's clone
  model is simpler and matches user expectation.
- Fork-on-edit: redundant with clone-on-create.
- Saving button: rejected (live-edit is the 042 contract; the bug fix
  already makes it safe).

## Affected files

**Backend**

- `backend/app/db/store.py` — new `agents` table in `_SCHEMA`; idempotent
  migration (`ALTER TABLE sessions ADD COLUMN agent_id`; backfill loop; DROP
  COLUMN `agent_name` after migration where the column is unreferenced);
  new sync helpers (`_create_agent_sync`, `_clone_default_agent_sync`,
  `_get_agent_sync`, `_update_agent_sync`, `_list_sessions_sync`/`_get_session_sync`
  now JOIN `agents`); seed function; cascade on session delete.
- `backend/app/db/seed.py` — `seed_default_agent()` (idempotent) alongside
  the existing `seed_skills()`. Called from `lifespan` on startup.
- `backend/app/main.py` — modify `POST /api/sessions` to clone; modify
  GET sessions endpoints to embed `agent`; `PATCH /api/agents/{id}`;
  `/api/chat` reads agent from the session when the request omits the
  four fields; `/api/data/clear` reports `agents_deleted` and re-seeds.
- `backend/app/schemas.py` — `AgentOut` (response), `AgentPatch` (PATCH body).
- `backend/tests/test_agents_table.py` — AC1, AC3, AC7, AC8, AC11.
- `backend/tests/test_agents_endpoint.py` — AC4, AC5, AC6.
- `backend/tests/test_chat_uses_agent.py` — AC9, AC10 (one `@pytest.mark.openai`).
- Existing tests updated where they assumed `sessions.agent_name`.

**Frontend**

- `frontend/src/lib/chatApi.ts` — new `AgentMeta` type; `SessionMeta.agent?`;
  `patchAgent(id, body)`; `listSessions`/`getSession` continue to return
  inline agent.
- `frontend/src/lib/experiment.ts` — drop `systemPrompt`, `agentPrompt`,
  `model`, `enabledTools` from `ConvExperiment`; drop their setters;
  `overridesFor` no longer sends them. `topK` + `simulateFailure` stay.
- `frontend/src/lib/agentAccess.ts` — **new.** Small helper hook
  `useActiveAgent()` returning the session's agent row + an `updateAgent`
  fn that debounces 500 ms / flushes on demand, mirroring the 042 Identity
  pattern but reusable across all sections.
- `frontend/src/agent-anatomy/Identity.tsx` — PATCHes via `useActiveAgent`
  (still writes `agent.name`); description finally persists (`agent.description`).
- `frontend/src/agent-anatomy/SystemPromptSection.tsx` — reads/writes
  `agent.system_prompt` via `useActiveAgent`.
- `frontend/src/agent-anatomy/AgentPromptSection.tsx` — same for
  `agent.agent_prompt`.
- `frontend/src/agent-anatomy/ModelSection.tsx` — same for `agent.model`.
- `frontend/src/agent-anatomy/ToolsSection.tsx` — same for
  `agent.enabled_tools` (list of strings; `[]` = none, full list = all).
  Note: the JSON column convention is `enabled_tools: string[]` always —
  there's no `null = all enabled` (the FE infers "all on" when the array
  length equals the total tools count, exactly like 006).
- `frontend/src/components/nodes/StationNode.tsx` — read from
  `session.agent?.name` instead of `session.agent_name`.
- `frontend/src/components/ChatPanel.tsx` — assistant-side bubble header
  reads `session.agent?.name` (fallback `t.chat.agent`).
- `frontend/src/store/useChat.ts` — `SessionMeta.agent` flows through;
  `replaceSession` still updates the row; no behavior change beyond shape.
- `frontend/src/settings/SettingsExperiment.tsx` — drop the system-prompt
  textarea + its label/hint; replace with a one-line redirect note linking
  to the Agent Anatomy dialog (opens it via `useAgentAnatomy.openDialog`).
- `frontend/src/i18n/strings.ts` — new `agentAnatomy.settingsRedirect`
  (en + pt); the seed agent name/description ship server-side, not here.
- Tests: a small `Identity.test.tsx` regression update; one
  `Prompts.test.tsx` PATCH wiring; one `Model.test.tsx`; one
  `Tools.test.tsx`; one `ChatPanel.agentName.test.tsx`; one
  `useChat.agent.test.ts` for the inline shape.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `AgentOut`, `AgentPatch` (new pydantic models),
  not part of `TraceEvent`.
- `frontend/src/types/events.ts` — **no change.** The `ChatRequestBody`
  echo type already accepts `system_prompt?` / `agent_prompt?` / `model?` /
  `enabled_tools?`; the FE just stops sending them.
- No new `Stage` / `Phase` / station / hop / tier.

## Data model changes

- New table `agents` (see AC1). Indexed by `is_default` for the seed lookup.
- `sessions.agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL` —
  actually we want the **reverse** cascade: deleting a session should
  delete its agent (the clone), so the FK lives on `sessions` and the
  delete cascade is handled in `_delete_session_sync` (delete agent
  after the session row is gone; the default row is protected by an
  `is_default` guard).
- `sessions.agent_name` is dropped after the migration backfills
  `agents.name`.
- New seed: `agents(is_default=1, name="Agent Simulator", …)` row, kept
  by `_clear_all_sync` (the default re-seeds after the wipe).

## i18n strings (constitution §4)

| key | en | pt |
|---|---|---|
| `agentAnatomy.settingsRedirect` | `The system prompt now lives in the Agent Anatomy dialog (open it from the Agent node).` | `O prompt de sistema agora fica no diálogo Anatomia do agente (abra a partir do nó Agent).` |
| `agentAnatomy.openFromSettings` | `Open Agent Anatomy` | `Abrir Anatomia do agente` |

The seed default's `name` and `description` are **English-only
server-shipped strings** (like `AGENT_PROMPT` / `GUARDRAILS_PROMPT`);
they can be replaced by the user via the dialog.

## Cloud map (constitution §5)

n/a — no new tier, station, or boundary.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 (table exists) | `PRAGMA table_info(agents)` | `backend/tests/test_agents_table.py` |
| AC2 (sessions.agent_id) | `PRAGMA table_info(sessions)` after migration + backfill | same |
| AC3 (seed) | seed twice ⇒ 1 default row | same |
| AC4 (clone on create_session) | POST + inspect | `backend/tests/test_agents_endpoint.py` |
| AC5 (sessions include agent inline) | GET shape | same |
| AC6 (PATCH agent + validation) | set/over-cap/invalid-model/404 | same |
| AC7 (edit isolation) | two sessions, diff one, other unchanged | same |
| AC8 (delete cascade) | delete session, agent row gone, default kept | `test_agents_table.py` |
| AC9 (chat reads from agent) | `@openai`, PATCH role, run, assert `llm.prompt.system` | `test_chat_uses_agent.py` |
| AC10 (006 overrides still work) | two runs, one override, one no — composition diffs | same |
| AC11 (clear includes agents) | clear, count, re-seed | `test_agents_table.py` |
| AC12 (sessions.agent_name dropped) | PRAGMA table_info(sessions) | same |
| AC13 (useExperiment shape) | type check via vitest read | `experiment.test.ts` (existing extended) |
| AC14 (sections PATCH) | one per section: type, fire, assert PATCH URL | `agent-anatomy/*.test.tsx` |
| AC15 (chat bubble name) | render thread, assert label | `ChatPanel.agentName.test.tsx` |
| AC16 (fresh conv has seed) | render after POST, assert header shows seed name | covered by AC15 + a smoke test |
| AC17 (reload preserves) | mock listSessions returning agent → dialog reflects it | `useChat.agent.test.ts` |
| AC18 (settings page redirect) | textarea gone, redirect link present | `SettingsExperiment.test.tsx` (extend) |
| AC19 (i18n parity) | extend agentAnatomy i18n test | existing |
| AC20 (tsc clean) | CI gate | — |

## Risks / trade-offs

- **Migration safety.** `sessions.agent_name` exists in dev DBs from 042;
  before dropping, we must backfill into `agents.name`. The migration
  steps in `_migrate` must be ordered: (1) create `agents` if missing,
  (2) seed default, (3) add `agent_id` column if missing, (4) backfill
  every session lacking an agent (clone default → set agent_id),
  (5) copy `sessions.agent_name → agents.name` where it was non-null
  (overwrite the clone's name), (6) drop `sessions.agent_name` (SQLite
  3.35+). Each step is idempotent and gated by `PRAGMA` checks.
- **Default re-seed after `clear_all`.** `_clear_all_sync` must re-seed
  the default *after* wiping, or future `create_session` calls fail.
- **Backwards-compat with the 006 overrides.** Kept on purpose: existing
  tests (`test_chat_request_model.py`) pass system_prompt etc. and
  expect them to flow through. We do not break them. The `/api/chat`
  composition is: agent's value if request omits the field; request's
  value if the request set it.
- **Pydantic `AgentOut`.** `enabled_tools` is `list[str]` (stored as JSON
  in SQLite); we serialize/deserialize on the store boundary.
- **Existing FE tests that constructed SessionMeta literals.** They now
  need the optional `agent` field. Since `agent?` is optional, most
  literals don't need updating; the dialog tests get the new mock fields.
- **Chat sidebar.** When the agent's name is long (60 chars), the
  conversation list row still shows the conversation title; only the
  station header / chat bubble surface the agent name. No truncation
  issue.
- **`top_k` stays in experiment.** Intentional — top_k is a per-run
  knob, not an attribute of the agent identity.
