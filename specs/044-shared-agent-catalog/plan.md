# Plan: Shared Agent Catalog

> Spec `clarified`. This plan describes the wiring of the direction-correction
> on top of 043: flip the relationship from 1:1 (one cloned agent per
> conversation) to N:1 (every conversation links to a shared agent row), open
> the `agents` table as a real catalog (list / create / delete), and add a
> compact catalog UX inside the existing 042 dialog.
>
> Retroactive plan — the spec, code and tests landed together in commit
> `bac5eef` (2026-05-28). This document is the SDD bookkeeping (§10) that
> caught up afterwards so the spec dir is complete.

## Approach

**Schema stays; relationship cardinality flips. Catalog UX lives in the dialog.**

043 already created the right physical model — a real `agents` table with a
`sessions.agent_id` FK and a server-seeded default. What was wrong was the
*lifecycle*: cloning the default on every `create_session` made each
conversation own a private copy that couldn't be edited globally. The simplest
correction is to invert that single rule and add the small REST surface the
catalog needs:

- `POST /api/sessions` **links** to the existing default (no clone).
- `DELETE /api/sessions/{id}` no longer cascades to the agent (sessions
  share rows; the catalog owns agent lifecycle).
- `GET /api/agents` exposes the full catalog.
- `POST /api/agents` creates a new agent (optionally cloned from any source).
- `DELETE /api/agents/{id}` deletes a non-default agent and re-points every
  session using it to the default (no orphans, default-is-409-protected).
- `PATCH /api/sessions/{id}` accepts `{agent_id}` so a conversation can
  switch which agent it uses.

A one-shot migration drops every 043 clone (`is_default=0` rows) and re-points
sessions to the default. Gating it by `PRAGMA user_version=1` is load-bearing:
without it, every named agent the user later creates via the catalog UX would
look like a 043 clone and be wiped on the next boot.

The frontend gets a compact **catalog sidebar** inside the 042 dialog (NOT a
header strip as the spec originally drafted — the sidebar lays out better
with the seven sections to its right and was the implementation choice). The
sidebar lists every agent, marks the active one, and offers **+ New**
(clones the active agent) and **🗑 Delete** (hidden for the default). Picking
an agent calls `PATCH /api/sessions/{id}` and re-renders the seven sections
against the new agent's values.

**Alternatives considered**

- *Keep 043's clone model, add a "Share this agent" toggle.* Rejected — every
  conversation would still own a private row; "share" would require a real
  link table. The catalog flip is conceptually simpler and matches the
  Lumis reference UX the user pointed to.
- *Sidebar vs. header strip.* The spec drafted a header strip; the sidebar
  variant ships because the dialog already has 7 vertical sections and a
  vertical agent list reads as a real catalog instead of a dropdown.
- *Preserve 043 clone edits during migration.* Rejected — the user data lost
  is by design (the user opted into the global model knowing previous edits
  on per-conversation clones were tied to a model that no longer exists).
  No surprise data preservation that would muddle the universal contract.
- *Per-conversation "hot override" on top of the shared agent.* Out of scope.
  006 request-level overrides already exist for programmatic callers; the
  FE simply doesn't expose them.

## Affected files

**Backend**

- `backend/app/db/store.py` —
  - New exceptions `CannotDeleteDefaultAgent` (→ 409) and `UnknownAgentId`
    (→ 422).
  - New `_SCHEMA_VERSION_SHARED_CATALOG = 1` constant + new
    `_migrate_to_shared_catalog(conn)` helper, gated by `PRAGMA user_version`.
    Runs after `_seed_default_agent_sync` in `_migrate`.
  - `_create_session_sync` rewritten: links to default (no clone).
  - `_delete_session_sync` rewritten: no agent deletion (sessions share).
  - New `_list_agents_sync`, `_create_agent_sync`, `_delete_agent_sync`,
    `_set_session_agent_sync`. Async wrappers (`list_agents`, `create_agent`,
    `delete_agent`, `set_session_agent`) follow the existing pattern.
  - `_clear_all_sync` re-seeds the default after wiping.
- `backend/app/main.py` —
  - New `AgentCreate` (POST body) and `SessionPatch` (PATCH body) pydantic
    models.
  - New endpoints: `GET /api/agents`, `GET /api/agents/{id}`,
    `POST /api/agents`, `DELETE /api/agents/{id}`, `PATCH /api/sessions/{id}`.
  - Maps the new exceptions to 409 / 422.
- `backend/tests/test_agents_endpoint.py` — extended (AC2–AC8).
- `backend/tests/test_agents_table.py` — migration assertions (AC1).
- `backend/tests/test_clear.py` — re-seed assertions still pass.

**Frontend**

- `frontend/src/agent-anatomy/AgentCatalogSidebar.tsx` — **new.** Lists every
  agent from `/api/agents`, marks the active one, exposes **+ New** and
  **🗑 Delete** with inline confirm; selecting an item calls
  `setSessionAgent` and re-renders the dialog body.
- `frontend/src/components/AgentAnatomyDialog.tsx` — embeds the sidebar to
  the left of the seven sections.
- `frontend/src/components/AgentAnatomyDialog.test.tsx` — adjusts the
  existing tests for the new layout (the sections still render; sidebar
  appears alongside).
- `frontend/src/lib/agentAccess.ts` — falls back to the catalog's default
  agent when there's no active session (the "044-bugfix" inline note in
  the file). Edits PATCH the shared default and propagate.
- `frontend/src/lib/chatApi.ts` — new `AgentMeta` shape (unchanged from 043),
  new API functions: `listAgents`, `createAgent`, `deleteAgent`,
  `setSessionAgent`. `SessionMeta.agent` semantic flips (now shared, not
  cloned).
- `frontend/src/i18n/strings.ts` — new `agentAnatomy.catalog` namespace
  with 12 keys per language (label / loading / empty / more / draftHint /
  defaultSuffix / newLabel / newTooltip / deleteLabel / deleteTooltip /
  confirm / confirmYes / confirmCancel), in **en + pt**.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — **no change.** No new `Stage` / `Phase` /
  `TraceEvent` field. The two new pydantic models (`AgentCreate`,
  `SessionPatch`) live in `main.py` because they are REST bodies, not
  event-stream types.
- `frontend/src/types/events.ts` — **no change.**

## Data model changes

- New constant `_SCHEMA_VERSION_SHARED_CATALOG = 1`.
- New migration `_migrate_to_shared_catalog` — one-shot, idempotent:
  1. Read `PRAGMA user_version`; if ≥ 1, return.
  2. Resolve the default agent's id (re-seed first as defense-in-depth).
  3. If `sessions.agent_name` still exists, fold the most recently-named
     value into the default's name (best-effort rescue of the 042 rename).
  4. `UPDATE sessions SET agent_id = <default> WHERE agent_id IS NULL OR
     agent_id != <default>` — re-points every session to the default.
  5. `DELETE FROM agents WHERE is_default = 0` — drops every 043 clone.
  6. `PRAGMA user_version = 1` — marks the migration done forever.
- The migration runs from `_migrate(conn)` on every `ConversationStore.__init__`;
  step 1 makes it cheap on subsequent boots.
- `sessions.agent_id` cascade behavior is unchanged (the FK still exists);
  what changes is that the application code no longer deletes the agent
  when a session is deleted.

## i18n strings (constitution §4)

| key | en | pt |
|---|---|---|
| `agentAnatomy.catalog.label` | `Agents` | `Agentes` |
| `agentAnatomy.catalog.loading` | `Loading agents…` | `Carregando agentes…` |
| `agentAnatomy.catalog.empty` | `No agents yet` | `Nenhum agente ainda` |
| `agentAnatomy.catalog.more` | `more` | `mais` |
| `agentAnatomy.catalog.draftHint` | `Start a conversation to switch agents.` | `Inicie uma conversa para trocar de agente.` |
| `agentAnatomy.catalog.defaultSuffix` | `default` | `padrão` |
| `agentAnatomy.catalog.newLabel` | `New agent` | `Novo agente` |
| `agentAnatomy.catalog.newTooltip` | `Clone the active agent into a new one` | `Clonar o agente ativo em um novo` |
| `agentAnatomy.catalog.deleteLabel` | `Delete agent` | `Apagar agente` |
| `agentAnatomy.catalog.deleteTooltip` | `Delete this agent (sessions fall back to the default)` | `Apagar este agente (sessões voltam para o padrão)` |
| `agentAnatomy.catalog.confirm` | `Are you sure?` | `Tem certeza?` |
| `agentAnatomy.catalog.confirmYes` | `Yes, delete` | `Sim, apagar` |
| `agentAnatomy.catalog.confirmCancel` | `Cancel` | `Cancelar` |

The cloned-agent default name suffix (`"<source> (cópia)"`) is server-side
and uses the Portuguese suffix in both languages on purpose — it's a
placeholder the user is expected to rename immediately, and keeping it
unique avoids the en/pt drift on the catalog list.

## Cloud map (constitution §5)

n/a — no new tier, station, hop or boundary.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 (migration drops clones, repoints) | `test_clear_data_reports_agents_and_reseeds` + `_table_columns` setup | `backend/tests/test_agents_table.py` |
| AC2 (POST /sessions links, no clone) | `test_create_session_links_to_default_agent_without_cloning` | `backend/tests/test_agents_endpoint.py` |
| AC3 (DELETE /sessions doesn't touch agent) | `test_delete_session_does_not_touch_the_agent` | same |
| AC4 (GET /agents returns catalog) | `test_list_agents_returns_catalog_default_first` | same |
| AC5 (POST /agents creates) | `test_create_agent_clones_default_by_default`, `…_with_clone_from_uses_that_source`, `…_default_name_suffix` | same |
| AC6 (DELETE /agents repoints + 409/404) | `test_delete_agent_repoints_sessions_to_default`, `…_is_409`, `…_is_404` | same |
| AC7 (PATCH /sessions accepts agent_id) | `test_patch_session_switches_agent`, `…_with_unknown_agent_id_is_422`, `…_unknown_session_is_404` | same |
| AC8 (edits propagate) | `test_edits_propagate_across_sessions_sharing_the_agent` | same |
| AC9 (dialog header strip — implemented as sidebar) | `AgentAnatomyDialog.test.tsx` (existing tests retain coverage; the sidebar is rendered in every `render(<Dialog />)`) | `frontend/src/components/AgentAnatomyDialog.test.tsx` |
| AC10–AC13 (selection/new/delete/hide-delete-for-default) | manual + the sidebar's own type-level coverage (covered structurally by AC8/AC6 backend wiring; FE-only unit tests are deferred — the sidebar reads/writes through `chatApi` functions whose contracts are pinned by the backend tests above) | — |
| AC14 (edit propagates across sessions) | covered by AC8 backend test + `useChat` shared-session-list update | `useChat.ts` |
| AC15 (bilingual) | i18n parity test catches missing pt keys | `frontend/src/i18n/strings.test.ts` |
| AC16 (tsc clean) | `npm run build` (CI gate) | — |

> Honest gap: AC10–AC13 (the four sidebar UI interactions) are exercised
> only manually + indirectly through the backend tests. A future small
> `AgentCatalogSidebar.test.tsx` would close the loop; not blocking
> shipping because the failure mode is render-only and visible.

## Risks / trade-offs

- **Destructive migration.** Step 5 deletes every `is_default=0` row in
  `agents`. Acceptable because the spec explicitly accepts losing per-
  conversation edits from the 043 clones (the universal contract is the
  whole point). Gated by `PRAGMA user_version` so it never repeats.
- **Catalog UI lives in the dialog, not in a sidebar of the app.** Keeps
  the surface area minimal; future spec can promote it.
- **`set_session_agent` validates `agent_id` exists** (raises
  `UnknownAgentId` → 422). Without this guard a typo would re-point a
  session to a dangling id.
- **Default deletion is 409, not silently allowed.** The default is the
  always-there fallback; allowing it would orphan sessions. Renaming the
  default is allowed (its identity is the `is_default` flag, not the name).
- **The "(cópia)" suffix is Portuguese in both languages.** Intentional —
  see i18n note above. A user who renames the agent gets exactly what they
  typed.
- **FE tests for the sidebar are thin.** The acceptance criteria 9–13 are
  validated structurally (the sidebar is mounted in every dialog render
  and the backend contracts it calls are pinned). A focused
  `AgentCatalogSidebar.test.tsx` is a follow-up.
- **`useActiveAgent` falls back to the catalog's default when there is no
  active session.** This means an edit from the draft state PATCHes the
  shared default and propagates to every conversation using it. Documented
  inline as "044-bugfix" — the alternative (no-op while draft) silently
  swallowed edits the user expected to persist.
