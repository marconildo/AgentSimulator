# Spec: Shared Agent Catalog — agents are universal, conversations pick one

| | |
|---|---|
| **ID** | 044-shared-agent-catalog |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> Direction correction on top of 043. The 1:1 clone-on-create model that 043
> shipped surprised the user — they expected the agent to be **universal**
> across conversations (edit once, every conversation sees the change). This
> spec converts the relationship to **N conversations : 1 agent**, opens the
> `agents` table as a real catalog (create/list/delete), and adds the small
> UX to pick which agent a conversation uses.

## Problem / motivation

After shipping 043, the user reported: *"I edited the agent's name and when
I switched conversations the change wasn't there"* — exactly the
edit-isolation guarantee 043 made explicit. Talking it through, the desired
mental model is:

- **The agent is global state, like the skills catalog.** One "Hotel
  Analyst" agent — edit it once, every conversation that uses it sees the
  edit. This matches the SaaS pattern in the reference screenshots (Lumis).
- A conversation **picks** an agent (selector); it doesn't *own* one.

So this spec flips two 043 invariants:

- **Clone-on-create → link to existing.** `POST /api/sessions` no longer
  clones the default; it links the session to it (or to whichever agent the
  client passes).
- **Delete-session cascade → no cascade.** Deleting a conversation no
  longer touches the agent (it's shared).

Plus it ships the minimum catalog UX that makes the universal model usable
day to day:

- A list of agents (with name + description) the user can pick from.
- A way to create a new agent (cloned from any existing one — usually the
  default).
- A way to delete an agent (everything that wasn't the default; sessions
  that pointed to it fall back to the default).
- A way to switch a conversation's agent.

## Goals

- **One agent row drives N conversations.** Editing the agent (any field)
  propagates instantly to every conversation pointing to it (a refresh +
  WebSocket-less store update — the FE patches the cached session list).
- **A real catalog table.** `agents` keeps every row the user creates; only
  the default is server-seeded + protected. Each row carries the same shape
  043 defined (id, name, description, system_prompt, agent_prompt, model,
  enabled_tools, is_default).
- **Catalog UX in the dialog header.** The 042 dialog gains a small header
  strip with:
  - A **selector** listing every agent in the catalog (active row marked).
  - **+ New agent** (clones the active one — preserves the prompts the user
    just edited).
  - **🗑 Delete** (only on non-default rows, with inline confirm).
  Selecting an agent switches the active conversation's `agent_id`.
- **Migration is destructive but unambiguous.** Every clone the 043 model
  created (`is_default=0` rows) is deleted; every existing session is
  re-pointed to the default. Edits the user made on per-conversation clones
  are lost (they were locked into the 1:1 model). No surprise data
  preservation that would muddle the universal contract.
- **Delete-session no longer cascades to the agent.** The agent survives.
- **Settings page (041) unchanged from 043.** The redirect to the dialog is
  the only entry point for editing prompts/model/tools.
- **No new `Stage`. Protocol additive only.**

## Non-goals

- **Per-conversation "hot override".** Once a conversation picks an agent,
  edits to that agent are global. If the user wants a different prompt for
  one conversation, they create a new agent and point that conversation
  at it. (This is the Lumis model exactly — no per-conversation forks.)
- **Avatar / scheduling / learnings tabs.** Still out of scope (042's
  non-goal carries forward).
- **Agent versioning, history, rollback.** Edits overwrite.
- **Sharing across browser sessions.** Single-instance (§8) — the catalog
  is server-side SQLite, so it survives reload, but there's no "share this
  agent with someone else" concept.
- **A "scope" toggle** (private vs shared) like in the Lumis screenshot.
  Every agent is shared (it's the whole point); no permission model.
- **Renaming the default agent itself.** The default is the always-there
  fallback when an agent is deleted. Renaming it is allowed but the
  `is_default=1` flag stays; the "Agent Simulator" identity is just a
  starting seed value, not a hard label.
- **Locking the default against editing.** The user can edit the default
  too — it's the same UX as any other agent. Only **deletion** is
  protected.
- **Importing / exporting agents.** No JSON drop, no copy-paste.

## User-facing behavior

### Dialog header (new)

A thin strip above the 7 sections:

```
[ Agente ▾ Hotel Analyst        ]  [+ Novo]   [🗑]
```

- The **dropdown** lists every agent (`GET /api/agents`); the active one is
  the conversation's. Selecting another sets `sessions.agent_id` on the
  active conversation. The 7 sections refresh to that agent's values.
- **+ Novo** clones the *active* agent into a new row (so the user can
  duplicate "Hotel Analyst" and tweak it without losing the original).
  The new agent gets a unique name (`"<original name> (cópia)"`); the
  user can rename in the Identity section. The active conversation's
  `agent_id` is updated to the new agent.
- **🗑** is visible only when the active agent is not the default
  (`is_default = 0`). Click → inline confirm; on yes, the agent is
  deleted, every conversation that pointed to it is re-linked to the
  default, and the active conversation is one of them.

### Chat bubble + station header

Unchanged from 043 — both already read `session.agent?.name`. The only
difference is the propagation: editing the name in conversation A is now
visible in conversation B's chat the next time B is opened (or
immediately if it's already mounted — the store patches every session
that shares the agent's id).

### Migration

On startup, the migration:
1. Deletes every `is_default=0` row in `agents` (the 043 per-conversation
   clones).
2. Re-points every session whose `agent_id` is now dangling (or null) to
   the default's id.
3. Idempotent — re-running yields no changes once done.

### New conversation

`POST /api/sessions` returns a session whose `agent_id` is the default's
id; the FE renders the same Agent Anatomy dialog as before. The seed
default's "Agent Simulator" name is what the chat bubble shows until the
user renames it.

### What does NOT change

- The dialog's 7 sections.
- The flush-on-blur + flush-on-unmount bug fix (the 042 regression — still
  alive in `useActiveAgent`).
- The `/api/chat` fallback (request omits ⇒ read from agent row;
  request sends ⇒ override wins for that turn).
- 042's request-level overrides on `ChatRequest`.

## Acceptance criteria

### Backend — schema + endpoints

1. **AC1 — Migration drops all clones, re-points sessions to the default.**
   On startup against a DB with N `is_default=0` rows, after the migration
   `agents` has exactly 1 row (the default) and every `sessions.agent_id`
   equals the default's id. Idempotent — second startup is a no-op. Tested
   via `PRAGMA` + row count.

2. **AC2 — `POST /api/sessions` links to the default; no clone.** After
   the call, `agents` row count is unchanged (no new row); the new
   session's `agent_id` equals the default's. Tested by counting rows
   before/after.

3. **AC3 — `DELETE /api/sessions/{id}` does NOT delete the agent.**
   Create a session, delete it, assert `agents` row count is unchanged.
   Tested with the default + with a non-default catalog row.

4. **AC4 — `GET /api/agents` returns the full catalog.** Shape:
   `list[AgentOut]` ordered by `is_default DESC, name ASC` so the default
   comes first. Tested by seeding 2 agents + asserting the list.

5. **AC5 — `POST /api/agents` creates a new agent.** Body:
   `{name?: str, description?: str, clone_from?: str}` (every field
   optional; defaults: clone the default, name = `<source>.name + " (cópia)"`).
   Returns the new `AgentOut`. The new row has `is_default=0`. Tested
   with: omit-all, name override, clone-from another agent.

6. **AC6 — `DELETE /api/agents/{id}` deletes a non-default agent and
   re-points sessions.** 404 on unknown id, 409 (conflict) on the default
   (can't delete it). Sessions that pointed to the deleted agent now
   point to the default. Tested with both error paths + the happy path.

7. **AC7 — `PATCH /api/sessions/{id}` accepts `agent_id`.**
   Body: `{agent_id: str}`; on success the session's `agent_id` is
   updated and the response includes the new inline agent. 422 if
   `agent_id` doesn't exist. Tested with both.

8. **AC8 — Editing an agent propagates to every session using it.**
   Create 2 sessions A + B; both point to the default. PATCH the default's
   `agent_prompt`. `GET /api/sessions` returns both A and B with the
   updated agent's `agent_prompt`. Tested with one PATCH + one re-fetch.

### Frontend — header strip + propagation

9. **AC9 — Dialog header shows the agent dropdown + buttons.** Open the
   dialog: a selector renders listing every agent from `/api/agents`,
   pre-selected on the active conversation's agent. **+ Novo** and **🗑**
   buttons are present (🗑 only when the active agent is non-default).
   Tested by mounting the dialog with two seeded agents.

10. **AC10 — Selecting an agent switches the conversation's link.**
    Click an option in the dropdown → assert
    `PATCH /api/sessions/{id}` was called with the new `agent_id`;
    `useChat.sessions[active].agent` reflects the new row. The 7
    sections re-render with the new agent's values.

11. **AC11 — + Novo creates an agent cloned from the active one.**
    Click **+ Novo** → assert `POST /api/agents` was called with
    `{clone_from: <active id>}`; the active conversation's `agent_id`
    is updated to the new row; the Identity name input shows the
    suggested copy name; the dropdown now includes the new agent.

12. **AC12 — 🗑 deletes the active non-default agent and falls back to
    the default.** Click 🗑 → confirm → assert `DELETE /api/agents/{id}`;
    on success, the active session's `agent_id` is the default's;
    the dropdown no longer lists the deleted agent; the 7 sections
    show the default's values.

13. **AC13 — 🗑 is hidden for the default agent.** When the active
    agent has `is_default=true`, the delete button isn't rendered.

14. **AC14 — Editing one conversation's agent appears in another's chat.**
    Two conversations both linked to the default; PATCH the agent's
    name; both conversations' `session.agent.name` updates in the
    store (the FE re-patches every session sharing that agent_id on
    success, no extra round-trip). Tested by asserting the store after
    a mocked `patchAgent` resolves.

15. **AC15 — Bilingual (§4).** The new UI labels (selector heading,
    "New agent", "Delete agent", confirm "Are you sure?", "(cópia)" /
    "(copy)" suffix) ship en + pt.

16. **AC16 — TypeScript clean.** `npm run build` is green.
    `SessionMeta.agent?: AgentMeta` is unchanged; `AgentMeta` gains
    no new field; new `listAgents`, `createAgent`, `deleteAgent`,
    `setSessionAgent` API surfaces in `chatApi.ts`.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.**
- Cloud map (§5): **unchanged.**
- New endpoints:
  - `GET /api/agents` — list catalog
  - `POST /api/agents` — create (optionally cloning)
  - `DELETE /api/agents/{id}` — delete + repoint
- Modified endpoints:
  - `POST /api/sessions` — links to default (no clone)
  - `DELETE /api/sessions/{id}` — no longer cascades to agent
  - `PATCH /api/sessions/{id}` — accepts `agent_id` (replaces the
    042 `agent_name` body that 043 dropped)

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Universal vs catalog?** → **Catalog** (multiple shared agents).
- [x] **Existing clones?** → **Drop them.** Migrate sessions to default.
- [x] **Per-conversation override?** → **No.** Edit = global. New agent
  if you want different behavior.
- [x] **Default deletion?** → **Protected** (409).
- [x] **Default renaming?** → **Allowed**; flag stays.
- [x] **Where does the catalog UX live?** → **Dialog header strip**
  (selector + create + delete). No sidebar / no separate page yet.
- [x] **What does + Novo clone?** → **The active agent** (so a user
  who edited "Hotel Analyst" can fork "Hotel Analyst v2" without
  redoing the work).
- [x] **What happens to sessions when their agent is deleted?** →
  Re-pointed to the default (no orphans, no broken sessions).

## Out of scope / deferred

- A real "agents" page / sidebar (this spec uses a compact header strip).
- Sharing agents across users / instances.
- Per-conversation hot overrides on top of the shared agent (use 006
  request-level overrides if needed; the FE doesn't expose them).
- Agent templates / community catalog.
- Search / filter in the catalog (today the list is small enough).
- Renaming protection on the default.
- Export / import.
