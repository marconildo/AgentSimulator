# Plan: 064-agent-catalog-focus

## Approach

Introduce a single source of truth for the dialog's catalog state: a small Zustand
store `frontend/src/lib/agentCatalog.ts` (`useAgentCatalog`) holding the fetched
`agents` list plus the `focusedId`. Both the `AgentCatalogSidebar` (the list / +New /
delete UI) and `useActiveAgent` (what the editor sections read/write) consume it, so a
freshly created agent is visible and focused in the same interaction with no reload, and
edits reflect everywhere (AC8, AC6).

`focusedId` is the new "which agent the editor edits" pointer, decoupled from the session
binding. Resolution order for the active/edited agent becomes:

```
focusedAgent (agents.find(focusedId))  ??  sessionAgent  ??  catalog default
```

Selecting a row sets `focusedId` always; it additionally `setSessionAgent`s **only when
the conversation is not locked**. Creating sets `focusedId` to the new agent (always) and
re-binds only when unlocked. Deleting acts on the focused agent (always allowed) and
resets focus to the default.

Focus is cleared on dialog close so re-opening starts from the session/default (AC7).

## Affected files

- **new** `frontend/src/lib/agentCatalog.ts` — `useAgentCatalog` store: `agents`,
  `focusedId`, `refresh()`, `setFocused()`, `upsert(row)`, `remove(id)`.
- `frontend/src/agent-anatomy/AgentCatalogSidebar.tsx` — read list + focus from the
  store; rows no longer `disabled` by lock (they focus); `onSelect`/`onCreate` re-bind
  only when unlocked; delete operates on the focused agent. Keep a subtle lock hint
  (the existing `draftHint`/`locked` string) instead of disabling.
- `frontend/src/lib/agentAccess.ts` (`useActiveAgent`) — resolve the edited agent from
  the shared store (`focusedId` first), ensure the catalog is loaded, and `upsert` the
  PATCH result into the store (still reflecting onto matching sessions for live sync).
- `frontend/src/components/AgentAnatomyDialog.tsx` — clear `focusedId` when the dialog
  closes/unmounts (AC7).
- `frontend/src/i18n/strings.ts` — if any new user-facing string is needed for the lock
  hint, add it in **en + pt** (reuse existing `catalog.draftHint` / `agentSelector.locked`
  where possible).

## Protocol / i18n / cloud impact

- **Protocol:** none. No `schemas.py` / `events.ts` change, no new `Stage`.
- **i18n:** no new prose expected (reuse existing `locked` / `draftHint`); if added, en+pt.
- **Cloud:** none.

## Test strategy (maps each AC → test)

All frontend (Vitest + RTL). No backend diff, so `pytest` is untouched.

- `AgentCatalogSidebar.focus.test.tsx` (new):
  - AC1: locked + click row → focus changes, `setSessionAgent` NOT called.
  - AC2: unlocked + click row → `setSessionAgent` called.
  - AC3: locked + "+" → `createAgent` called, focus = created id, `setSessionAgent` not called.
  - AC4: unlocked + "+" → `createAgent` + `setSessionAgent(created.id)`.
  - AC5: non-default focused → delete affordance shown + `deleteAgent` fires while locked;
    focus returns to default.
- Update `AgentCatalogSidebar.locked.test.tsx` (045 AC10) to the new contract: locked rows
  are selectable-for-edit (focus) and do NOT call `setSessionAgent`; +New / delete enabled.
- `agentAccess.test.tsx` (new or extended): AC6 — with a `focusedId` set, `useActiveAgent`
  returns the focused agent and `updateAgent` PATCHes that id + upserts the store.
- `AgentAnatomyDialog.test.tsx`: AC7 — closing the dialog clears `focusedId`.
- AC8 is structurally guaranteed by the shared store (covered by the create test asserting
  the new agent is both in the list and focused).

## Sequence (TDD red → green)

1. Write the failing `AgentCatalogSidebar.focus.test.tsx` + update `*.locked.test.tsx`.
2. Add `useAgentCatalog`.
3. Rewire `useActiveAgent` to the store; add focus reset on close.
4. Rewire the sidebar; make rows focus instead of disable; gate re-bind on lock.
5. Green + `ruff`/`tsc`/`vite build`/`npm test`.
