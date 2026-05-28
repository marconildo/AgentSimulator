# Tasks: Shared Agent Catalog

> Red → green → refactor. Backend first (the FE binds to real shapes), then
> the sidebar UX, then cleanup.
>
> Retroactive bookkeeping — these tasks were executed during commit
> `bac5eef` (2026-05-28) but `tasks.md` wasn't checked in alongside `spec.md`.
> Listed here so the spec dir satisfies SDD §10 (`spec → plan → tasks`).

## Tasks

### Backend — migration + schema

- [x] **T0 — branch + spec bump.** Status `clarified → in-progress`.
- [x] **T1 — test first (AC1).** `backend/tests/test_agents_table.py`:
  after schema init, `PRAGMA user_version` is 1 and the second startup
  is a no-op; pre-existing `is_default=0` rows are gone; every session
  points to the default.
- [x] **T2 — implement.** In `db/store.py`:
  - Add `CannotDeleteDefaultAgent` and `UnknownAgentId` exceptions.
  - Add `_SCHEMA_VERSION_SHARED_CATALOG = 1` constant.
  - Add `_migrate_to_shared_catalog(conn)` — gated by `PRAGMA user_version`,
    folds any `sessions.agent_name` back into the default's name (best
    effort), re-points sessions to the default, deletes every
    `is_default=0` row, bumps `user_version`.
  - Wire the new migration into `_migrate(conn)` after
    `_seed_default_agent_sync`. T1 green.

### Backend — sessions link (no clone) + delete-no-cascade

- [x] **T3 — test first (AC2, AC3).**
  - `test_create_session_links_to_default_agent_without_cloning` — POST
    twice; `agents` row count stays at 1; both sessions point to the
    default's id.
  - `test_delete_session_does_not_touch_the_agent` — delete a session,
    assert `agents` row count unchanged.
- [x] **T4 — implement.**
  - Rewrite `_create_session_sync` to link to the default (no clone).
  - Rewrite `_delete_session_sync` to leave `agents` alone.
  - Defense-in-depth: `_create_session_sync` re-seeds the default first
    so a wiped store can still create a session. T3 green.

### Backend — catalog REST (GET / POST / DELETE /api/agents)

- [x] **T5 — test first (AC4, AC5, AC6).**
  - `test_list_agents_returns_catalog_default_first` — order is
    `is_default DESC, name ASC`.
  - `test_create_agent_clones_default_by_default` /
    `…_with_clone_from_uses_that_source` /
    `…_default_name_suffix` (`"<source> (cópia)"`).
  - `test_delete_agent_repoints_sessions_to_default`,
    `test_delete_default_agent_is_409`,
    `test_delete_unknown_agent_is_404`.
- [x] **T6 — implement.**
  - `_list_agents_sync`, `_create_agent_sync` (with `clone_from` resolved
    to default when absent; `is_default=0` on the new row),
    `_delete_agent_sync` (raises `CannotDeleteDefaultAgent` on the
    default; re-points sessions to the default before deleting; returns
    `sessions_repointed` count). Async wrappers (`list_agents`,
    `create_agent`, `delete_agent`).
  - In `main.py`: new `AgentCreate` pydantic body; new
    `GET /api/agents`, `GET /api/agents/{id}`, `POST /api/agents`,
    `DELETE /api/agents/{id}` handlers; map `CannotDeleteDefaultAgent`
    to 409. T5 green.

### Backend — PATCH /api/sessions/{id} (agent_id)

- [x] **T7 — test first (AC7).**
  - `test_patch_session_switches_agent` — PATCH succeeds, response
    includes the new inline agent.
  - `test_patch_session_with_unknown_agent_id_is_422`.
  - `test_patch_session_unknown_session_is_404`.
- [x] **T8 — implement.**
  - `_set_session_agent_sync` (raises `UnknownAgentId` if the id is
    unknown); async wrapper.
  - In `main.py`: new `SessionPatch` pydantic body;
    `PATCH /api/sessions/{id}` handler maps `UnknownAgentId` to 422
    and a missing session to 404. T7 green.

### Backend — shared edits propagate

- [x] **T9 — test first (AC8).**
  - `test_edits_propagate_across_sessions_sharing_the_agent` — create
    2 sessions, PATCH the default's `agent_prompt`, both sessions'
    embedded `agent.agent_prompt` reflect the new value.
- [x] **T10 — implement.** Nothing new — AC8 is a direct consequence of
  the catalog model. The test pins it. T9 green.

### Backend — clear behavior

- [x] **T11 — test first (AC1 follow-up).**
  - `test_clear_data_reports_agents_and_reseeds` — clear, then
    `agents` has exactly 1 row (the re-seeded default); `user_version`
    is preserved (the schema doesn't change on clear).
- [x] **T12 — implement.** `_clear_all_sync` already re-seeded; verify
  the count includes `agents_deleted` and the default is back. T11 green.

### Frontend — chatApi surface

- [x] **T13 — implement (covered by AC16 + tsc).**
  - `lib/chatApi.ts`: new `listAgents()`, `createAgent({clone_from?, name?, description?})`,
    `deleteAgent(id)`, `setSessionAgent(sessionId, agentId)`. `AgentMeta`
    shape unchanged from 043 (still `id` / `name` / `description` /
    `system_prompt` / `agent_prompt` / `model` / `enabled_tools` /
    `is_default` / `created_at` / `updated_at`).

### Frontend — useActiveAgent fallback

- [x] **T14 — implement (the "044-bugfix" inline note).**
  - `lib/agentAccess.ts`: when there's no active session (draft), fall
    back to the catalog's default agent. Edits PATCH the shared default
    and propagate to every conversation using it.
  - Keep the 500 ms debounce + flush-on-blur + flush-on-unmount from
    042's regression fix.

### Frontend — Catalog sidebar

- [x] **T15 — implement (AC9 — sidebar instead of header strip).**
  - **New** `agent-anatomy/AgentCatalogSidebar.tsx` — lists every agent
    via `listAgents()`, marks the active one, shows the default's
    `defaultSuffix` chip. Exposes:
    - row click → `setSessionAgent(active.id, row.id)` → patches
      `useChat.sessions[active]` with the new inline agent.
    - **+ New** button → `createAgent({clone_from: active.id})` →
      pushes the new row into the list + sets it active.
    - **🗑 Delete** button (hidden when active is `is_default`) →
      inline confirm → `deleteAgent(active.id)` → on success the
      session falls back to the default automatically.
- [x] **T16 — integrate.** `components/AgentAnatomyDialog.tsx` renders
  `<AgentCatalogSidebar />` to the left of the seven sections.
  Existing dialog tests still pass (the sidebar appears inside every
  rendered dialog).

### i18n

- [x] **T17 — strings.**
  - `frontend/src/i18n/strings.ts`: new `agentAnatomy.catalog`
    namespace (13 keys) with both `en` and `pt` blocks; the type
    declaration includes all keys so missing-key drift fails `tsc`.
  - i18n parity test (`strings.test.ts`) catches any missed key.

### Wiring + cleanup

- [x] **T18 — sweep tests.** Update `test_clear.py` for the agents
  re-seed claim; update `AgentAnatomyDialog.test.tsx` so the new
  sidebar's presence doesn't break the seven-section assertion.
- [x] **T19 — gates.** `ruff check .` clean · `ruff format` clean ·
  `pytest -q` green · `npm run build` green · `npm test` green.
- [x] **T20 — manual smoke.** Edit the default agent in conversation A;
  open conversation B; the name + prompts reflect the edit. Create a
  new agent from A, switch B to it; B uses the new agent. Delete that
  new agent from A; B falls back to the default.
- [x] **T21 — memory pointer.** Add `spec-044-shared-agent-catalog.md`
  and update the [[spec-043-persisted-agent]] memory to note 044's
  reversal.

## Definition of done

- [x] Every AC maps to ≥1 passing test (AC10–AC13 covered structurally —
  see plan.md "Honest gap").
- [x] `ruff check .` + `ruff format --check .` clean.
- [x] `pytest -q` green (216 passing).
- [x] `npm run build` (`tsc --noEmit` + vite) green.
- [x] `npm test` (Vitest) green (404 passing).
- [x] Protocol mirror in sync (no Stage/Phase change — additive REST
  endpoints only).
- [x] en + pt parity for the 13 new strings.
- [x] Migration is idempotent (gated by `PRAGMA user_version`).
- [x] Default agent always exists (seeded at startup; re-seeded after
  clear).
- [x] `spec.md` status updated to `done`.
- [x] Memory pointer added; 043's memory entry notes the reversal.
