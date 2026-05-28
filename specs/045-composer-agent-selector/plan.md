# Plan: Composer agent selector + lock-after-first-turn

> Two surfaces, one invariant. New composer mini-selector (chip left
> of 📎). Backend gains a 409 on PATCH-agent-of-started-session. The
> 044 dialog selector also locks. Reuses every existing API + store
> field — no new endpoints, no protocol change.

## Approach

The lock state derives from one field already on the wire:
`SessionMeta.message_count`. The chip is a small Zustand-aware
component that reads the active session, decides locked-vs-unlocked,
and either opens a floating menu (`<ul>` rendered as a positioned
popover) or sits there as a static-looking disabled chip.

Catalog loading: lazy on first menu open (mirrors what
`AgentCatalogSidebar.tsx` does — local `useState<AgentMeta[] | null>`
+ a one-shot `listAgents()` call). The composer chip and the 044
sidebar can co-exist with two independent caches; both load the same
data from one cheap endpoint. (If duplication becomes a problem, a
later refactor lifts the catalog into `useChat`; not required for
this spec.)

Server-side guard: `patch_session` checks `message_count` via the
store before flipping `agent_id`. The store gains a new `_message_count_sync`
helper (a `SELECT COUNT(*)` already inlined in `_list_sessions_sync`'s
subquery — make it reusable). When the count is > 0, the endpoint
raises `HTTPException(409, detail={"detail": "agent_locked",
"message_count": n})`. A new `AgentLocked` exception in the store
keeps the layering clean (same pattern as `CannotDeleteDefaultAgent`
+ `UnknownAgentId`).

The 044 dialog's `AgentCatalogSidebar` already calls
`setSessionAgent`; it gains a disabled state when the active
session's `message_count > 0`. The catalog management buttons
(+ Novo, 🗑) stay enabled — they operate on the catalog, not the
session-agent link.

## Affected files

**Backend code**
- `backend/app/db/store.py`:
  - New exception `class AgentLocked(ValueError)` next to the existing
    catalog exceptions.
  - New `_get_message_count_sync(session_id)` helper + async
    `get_message_count(session_id)` (or extend
    `_set_session_agent_sync` to consult the count and raise).
- `backend/app/main.py`:
  - `patch_session` — branch on count; raise 409 on lock.
  - Import the new exception.

**Backend tests (new)**
- `backend/tests/test_session_agent_lock.py` — covers AC1, AC2, AC3,
  AC4.

**Frontend code**
- `frontend/src/components/ChatPanel.tsx`:
  - Lift the current toolbar row in `Composer` to host a new agent
    chip + a floating menu, both kept inside a small new
    `<AgentChip>` component placed in the same file (or a sibling
    `ComposerAgentChip.tsx` if file size grows).
- `frontend/src/lib/chatApi.ts`:
  - No new export; `setSessionAgent` already exists. Add a typed
    error shape for the 409 (a small helper `isAgentLockedError(e)`).
- `frontend/src/store/useChat.ts`:
  - On a 409 from `setSessionAgent`, surface the lock with an inline
    transient note + force a session refetch so the chip flips to
    locked. The existing error-handling pattern (toast/inline) is
    reused.
- `frontend/src/agent-anatomy/AgentCatalogSidebar.tsx`:
  - Read `useChat((s) => s.sessions.find(active).message_count)`;
    when `> 0`, render the agent rows disabled with the lock tooltip.
    Don't disable + Novo / 🗑.
- `frontend/src/i18n/strings.ts`:
  - Add bilingual strings (see table below).

**Frontend tests (new)**
- `frontend/src/components/ChatPanel.agentSelector.test.tsx` — AC5–AC9
  (composer behaviour).
- `frontend/src/agent-anatomy/AgentCatalogSidebar.locked.test.tsx` —
  AC10, AC11 (dialog selector follows the lock).
- `frontend/src/store/useChat.agentLock.test.ts` — AC12 (stale-tab
  409 handling).

**Frontend tests (touch)**
- Any existing test that mounts a thread with `message_count > 0`
  and asserts the composer/sidebar layout — verify no regression.

## Protocol changes (constitution §1)

None. No `Stage`, no `TraceEvent`. `PATCH /api/sessions/{id}` keeps
its body and 200 shape; gains a 409 path with a structured detail.
That's "additive status code", not "protocol change".

- `backend/app/schemas.py` — no change.
- `frontend/src/types/events.ts` — no change.
- Emitted in: n/a.
- Mapped to station in `stations.ts`: n/a.

## Data model changes

None. `SessionMeta.message_count` is already populated. No new tables,
columns, indices, or constraints.

(If 047 ships first, this spec runs unchanged on top of `user_version
= 2`. No coupling.)

## i18n strings (constitution §4)

Every new string ships en + pt. Lives under
`frontend/src/i18n/strings.ts` in a new `chat.agentSelector`
sub-object (or a similar slot — pick the cleanest fit during impl).

| key | en | pt |
|---|---|---|
| `chat.agentSelector.label` | "Agent" | "Agente" |
| `chat.agentSelector.menuHeading` | "Choose an agent" | "Escolher um agente" |
| `chat.agentSelector.ariaLabel(agentName)` | "Active agent: ${name}. Click to change." | "Agente ativo: ${name}. Clique para trocar." |
| `chat.agentSelector.locked` | "Agent locked after the conversation's first message. Start a new chat to use a different agent." | "Agente travado após a primeira mensagem da conversa. Inicie um novo chat para usar outro agente." |
| `chat.agentSelector.lockedAriaLabel(agentName)` | "Active agent: ${name}. Locked after the first message." | "Agente ativo: ${name}. Travado após a primeira mensagem." |
| `chat.agentSelector.lockedInlineNote` | "The agent is locked because this conversation already has messages." | "O agente está travado porque esta conversa já tem mensagens." |

## Cloud map (constitution §5)

n/a — no new tier or station; no canvas change at all.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 — PATCH with agent_id on started session → 409 | `test_patch_session_agent_returns_409_when_started` | `backend/tests/test_session_agent_lock.py` |
| AC2 — non-agent_id PATCH fields still work (today there are none, so this is "agent_id change rejected, other fields ignored if present") | `test_patch_session_with_agent_id_409_does_not_partially_apply` | same |
| AC3 — editing the linked agent itself is unaffected | `test_patch_agent_unaffected_by_session_message_count` | same |
| AC4 — `message_count` exposed on `GET /api/sessions/{id}` (and list) | `test_session_meta_exposes_message_count` | same |
| AC5 — composer renders chip left of 📎 | `test_composer_renders_agent_chip_left_of_attach` | `ChatPanel.agentSelector.test.tsx` |
| AC6 — unlocked: clicking opens the menu | `test_unlocked_chip_click_opens_menu` | same |
| AC7 — selecting agent calls setSessionAgent + updates store | `test_selecting_agent_patches_session_and_updates_store` | same |
| AC8 — locked: chip disabled, no chevron, tooltip set | `test_locked_chip_is_disabled_with_tooltip` | same |
| AC9 — chip flips locked after first turn persists | `test_chip_locks_when_message_count_becomes_one` | same |
| AC10 — 044 sidebar disabled on started conv | `test_catalog_sidebar_disabled_when_locked` | `AgentCatalogSidebar.locked.test.tsx` |
| AC11 — sidebar stays free on empty conv | `test_catalog_sidebar_active_when_message_count_zero` | same |
| AC12 — server 409 surfaces gracefully on stale tab | `test_set_session_agent_409_falls_back_to_locked` | `useChat.agentLock.test.ts` |
| AC13 — bilingual strings present | `test_agent_selector_strings_have_en_and_pt` | `i18n/strings.test.ts` (extend existing file) |
| AC14 — `npm run build` clean | CI gate |
| AC15 — `ruff` + `pytest` green | CI gate |
| AC16 — narrow-panel layout | covered by AC5's Tailwind class assertions + a max-width cap on the chip; smoke test |

Backend tests construct a `TestClient(app)` for the HTTP-level
assertions; the lock semantics also have a pure-store unit test for
fast feedback.

Frontend tests use the existing RTL setup (added by spec 040) +
`useHud` mock + `ResizeObserver` / `scrollTo` polyfills (the gotcha
documented under [[spec-040-message-attachments]] /
[[spec-041-settings-page]]).

## Risks / trade-offs

- **Catalog duplication.** The chip and the 044 sidebar each load
  the catalog independently on open. Two HTTP GETs across the
  session is fine; if the user opens the sidebar, then the chip,
  they hit `/api/agents` twice. Cheap and the catalog is tiny.
  Document this; lift if it ever matters.
- **Stale tab + 409.** Edge case worth UX care: if Tab A is empty
  and Tab B sends a message, then Tab A tries to swap agents, it
  gets 409. The store handles this by (a) NOT updating `agent_id`,
  (b) refetching the session (which now shows `message_count = 1`),
  (c) flashing an inline note. We don't auto-retry — the chip just
  becomes locked.
- **`disabled` button vs `aria-disabled` div.** A real `<button
  disabled>` blocks click correctly; that's the approach. The
  tooltip is `title=` (native browser tooltip) — same pattern as
  the canvas jargon tooltips ([[canvas-jargon-tooltips]]).
- **Floating menu positioning.** The composer toolbar sits at the
  bottom of the chat panel; the menu opens **upwards** to avoid
  clipping. Absolute positioning with `bottom: 100%` + a small
  `mb-1` gap. No portal needed (the composer's stacking context
  is fine).
- **Test pyramid balance.** Each AC has at least one test; some
  pure-UI ACs (AC5, AC8) collapse to assertion-of-DOM-shape. The
  full E2E flow (compose → first send → next click on chip is
  locked) needs an integration-style test with the store mock; AC9
  covers it.
- **No `disabled` propagation to `+ Novo` / `🗑`.** AC10
  explicitly says these stay enabled — they affect the catalog,
  not the session-agent link. The user CAN create / delete agents
  while the active conversation is locked; they just can't *swap*
  the active conversation's agent.
- **i18n test coverage.** The existing `i18n/strings.test.ts`
  iterates EN/PT for parity; extend it (or add a small new test)
  to assert the new keys exist on both sides.
