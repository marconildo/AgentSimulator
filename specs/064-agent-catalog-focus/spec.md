# Spec: Agent catalog edit-focus (decouple editing from the session lock)

| | |
|---|---|
| **ID** | 064-agent-catalog-focus |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

The "Configure agent" dialog (042/044/045) conflates two different ideas behind a
single derived value (`sessions[active].agent`):

1. **Which agent the dialog is editing** (the catalog *focus*), and
2. **Which agent the current conversation runs** (the *session binding*).

Spec 045 correctly locks the session binding once a conversation has at least one
persisted message — you cannot swap a running conversation's agent (server-enforced,
409 `agent_locked`). But because the dialog reads the agent it edits from that same
session binding, the lock leaks into the **shared catalog** (044, N sessions : 1 agent)
and breaks catalog management entirely:

- Clicking **+ New** calls `createAgent` (the row really is created server-side — this
  is the source of the "duplicate agents after reload" the user sees), then tries to
  `setSessionAgent` on the locked session. That re-bind is refused, so the brand-new
  agent is **never focused in the editor** — it becomes an orphan the user can't reach.
- Every other catalog row is rendered `disabled` when the conversation is locked, so the
  user cannot select another agent to **edit** or **delete** it either.

Net effect, exactly as reported: clicking **+** appears to do nothing editable; after a
reload the catalog shows duplicated agents; and none of them can be edited or deleted.

The catalog is shared and independent of any single conversation. Editing, creating, and
deleting a catalog agent must always be possible; only **re-binding a started
conversation's agent** stays locked.

## Goals

- Give the dialog a **focused agent** that is independent of the session binding.
  Selecting a catalog row focuses that agent in the editor (all sections read/write it).
- **+ New** creates an agent and immediately focuses it for editing.
- Deleting operates on the focused agent and is allowed regardless of lock state.
- Selecting a row **also re-binds the session** only when the conversation is *not*
  locked (preserves 045 for the binding); when locked, selecting still focuses for
  editing but leaves the conversation's running agent untouched.
- Focus resets when the dialog closes, so re-opening starts on the conversation's agent
  (or the catalog default on a draft).

## Non-goals

- No change to the composer agent selector chip lock (045) — a started conversation's
  running agent stays locked there; that surface is about the *binding*, not editing.
- No backend/protocol change. No new `Stage`/station/hop/tier. The existing
  `GET/POST/DELETE /api/agents` + `PATCH /api/sessions/{id}` endpoints are sufficient.

## Acceptance criteria

1. With a **locked** conversation (`message_count > 0`), clicking a non-active catalog
   row **focuses** that agent: the dialog's editor sections now read that agent's
   fields, and `setSessionAgent` is **not** called (the conversation's binding is
   unchanged). *(supersedes 045 AC10's "row disabled / click is a no-op")*
2. With an **unlocked** conversation (`message_count === 0`), clicking a row focuses it
   **and** re-binds the session (`setSessionAgent` is called). *(045 AC11 preserved)*
3. Clicking **+ New** while locked creates an agent (`createAgent`) and focuses it; the
   newly-created agent's fields are shown in the editor and are editable. `setSessionAgent`
   is not called while locked.
4. Clicking **+ New** while unlocked creates the agent, focuses it, **and** re-binds the
   session to it.
5. With a non-default agent focused, the delete affordance is available and deleting it
   succeeds regardless of lock state; after delete, focus returns to the default agent.
6. Editing fields of a focused (non-session) agent PATCHes that agent's id and the change
   is reflected locally (the editor keeps showing the edited values; any session bound to
   that agent updates too).
7. Closing the dialog resets the focus; re-opening shows the conversation's bound agent
   (or the catalog default when on a draft).
8. The catalog list shown in the sidebar and the agent shown by the editor sections are
   always consistent (one source of truth) — a freshly created agent appears in the list
   and is the focused one in the same interaction, with no reload.

## Out of scope / risks

- Deleting the agent the *locked* conversation is bound to will still repoint that
  conversation to the default server-side (pre-existing `ON DELETE SET NULL` + repoint
  behavior). This is an accepted edge; the lock governs explicit re-binding, not catalog
  deletion.
