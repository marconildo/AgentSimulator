# Spec: Composer agent selector — one agent per chat, locked after the first turn

| | |
|---|---|
| **ID** | 045-composer-agent-selector |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> Adds a second, always-visible entry point for picking the conversation's
> agent (right next to the 📎 attach button in the composer) **and** turns
> "one agent per chat" into a real invariant by locking that choice once
> the conversation has produced at least one persisted turn. Both the new
> composer mini-selector and the existing 044 dialog selector honour the
> lock.

## Problem / motivation

After 044 shipped the shared agent catalog and inlined a selector inside
the Agent-Anatomy dialog header, the dialog is still the *only* place a
user can swap an agent before starting the conversation — and even
*after* hours of back-and-forth, nothing prevents accidentally changing
the agent mid-thread. Two pains:

- **Discoverability.** A first-time user types their first message and
  sends without realising they could have picked a different agent. The
  catalog UX is two clicks away (open Agent Anatomy → header strip), so
  the choice is effectively hidden.
- **Coherence.** A "conversation" implies a continuous relationship with
  *one* agent — history, prompt, model, tools all factor into the
  ongoing dialogue. Letting the agent silently swap halfway through
  breaks every mental model the visualizer is trying to teach (working
  memory, long-term memory, the prompt that's actually being assembled
  for *this* agent). The chat bubble's `agentName` label would suddenly
  point at a different brain mid-thread.

A composer-side mini-selector right next to the 📎 fixes both: the
choice is in the spot where the user is *already looking* before typing,
and once they commit (first send → first persisted message) the choice
becomes immutable for the lifetime of the conversation. To switch
agents, the user creates a new chat — same model as every other major
agent product (ChatGPT, Claude, Lumis, …).

## Goals

- **A second, prominent entry point.** Render an agent selector inside
  the composer toolbar, immediately to the left of the 📎 attach
  button. Same dropdown, same catalog (`GET /api/agents`) as the 044
  dialog header.
- **Lock the selection after the first persisted turn.** A conversation
  with `message_count > 0` cannot swap its agent — from *either* entry
  point (composer mini-selector AND the existing 044 dialog selector).
  Both controls become disabled with the same tooltip.
- **The lock is the agent-id only, not the agent's contents.** Editing
  the linked agent's prompt / model / tools (per 044's universal
  catalog model) is still allowed and still propagates — only the
  `sessions.agent_id` link is frozen.
- **Empty conversations stay switchable.** New chats with zero messages
  (or chats whose only history is the optimistic in-flight bubble that
  hasn't persisted yet) can still pick freely. The lock fires when a
  full turn lands and is saved.
- **No backend enforcement gap.** `PATCH /api/sessions/{id}` with
  `agent_id` on a started conversation returns `409 Conflict` —
  belt-and-braces so a stale UI tab can't bypass the lock.
- **Bilingual + accessibility.** All new prose ships en + pt
  (constitution §4). The locked control announces its state to
  screen readers (`aria-disabled`, `title`).

## Non-goals

- **A real "switch agent" feature mid-conversation.** No "fork the
  conversation onto a different agent" path. To talk to a different
  agent, create a new chat.
- **Migrating existing conversations.** Sessions already started before
  this spec ships just become locked at their current agent —
  retroactive, but with no data change required (the lock derives from
  `message_count`, which is already persisted).
- **Removing the 044 dialog selector.** It stays — but becomes locked
  in sync with the composer one. The catalog management bits
  (+ Novo / 🗑) still work for the catalog itself; they just no longer
  re-link a started conversation.
- **Catalog management in the composer.** The composer mini-selector is
  picker-only — no "+ New agent" or "🗑 Delete" inline. Those stay in
  the dialog (one place for catalog ops is enough).
- **A "force unlock" escape hatch.** No admin override. The constraint
  is the whole point.
- **Showing the agent's avatar / colour in the composer.** Text-only
  chip; visual identity of agents is out of scope (carries forward
  from 042's non-goals).
- **New `Stage` / `Phase` / `TraceEvent`.** This is a request-link
  invariant + a UI surface, not a pipeline change.

## User-facing behavior

### Composer mini-selector (new)

A compact dropdown sits inside the composer toolbar, immediately to the
left of the 📎 attach button. It looks like:

```
[ 🤖 Hotel Analyst ▾ ]  [📎]  [textarea …]  [⏹] [➤]
                       ^ attach (40)         ^ cancel / send
```

- **Trigger** — a chip-shaped button showing the current agent's name,
  preceded by a small 🤖 / brain glyph. Truncates with ellipsis past
  ~14 characters; full name in `title`.
- **Open** — clicking opens a small floating menu (same data as the
  044 dialog selector) listing every agent from `/api/agents`. The
  current one is marked. Selecting another calls
  `PATCH /api/sessions/{id}` with the new `agent_id` and updates the
  store the same way the dialog selector already does.
- **Disabled state (locked)** — when the active conversation has
  `message_count > 0`, the chip renders disabled (greyed, non-clickable,
  `cursor-not-allowed`); the chevron is hidden so it no longer reads
  as a dropdown. Hover / focus reveals a tooltip:
  *"Agent locked after the conversation's first message. Start a new
  chat to use a different agent."* / pt:
  *"Agente travado após a primeira mensagem da conversa. Inicie um
  novo chat para usar outro agente."*
- The button keeps showing the agent's name so the user can confirm
  which agent they're talking to without leaving the composer.

### 044 dialog selector — now locked in sync

The agent dropdown in the Agent-Anatomy header strip (044) becomes
disabled with the same tooltip when `message_count > 0`. The
**+ Novo** and **🗑** buttons stay enabled — those operate on the
catalog, not on this session's link. Editing the active agent's
prompts / model / tools is still allowed and still propagates per 044.

### Empty conversations

A brand-new chat (`message_count === 0`) has the composer selector
fully enabled. Once the user sends and the turn persists
(`message_count` becomes `1`), the selector flips to locked on the
next store refresh — no extra round-trip needed (the session reload
that already happens after a turn finishes carries the new count).

### What does NOT change

- The chat bubble's `agentName` label (043).
- The Agent-Anatomy dialog's 7 sections.
- 044's catalog CRUD (`GET/POST/DELETE /api/agents`).
- 042's request-level overrides (`ChatRequest.agent_prompt`, `model`).
- Scenario gating (`canSend(scenario)`) — orthogonal.
- The attach 📎 control's behaviour and layout (the new chip sits to
  its left, the toolbar reflows once).

## Acceptance criteria

### Backend — server-side lock (belt-and-braces)

1. **AC1 — `PATCH /api/sessions/{id}` with `agent_id` returns 409 on a
   started conversation.** Given a session with `message_count > 0`,
   when the client PATCHes `{agent_id: <other>}`, the server returns
   `409 Conflict` with a structured error body
   (`{detail: "agent_locked", message_count: <n>}`). The session's
   `agent_id` is unchanged. Tested with: started → 409, empty → 200,
   wrong agent_id on empty → 422 (existing 044 behaviour preserved).

2. **AC2 — Other `PATCH /api/sessions/{id}` fields still work after
   start.** A started session can still be renamed (or any future
   non-`agent_id` field can be PATCHed). Only the `agent_id` change
   is rejected. Tested with a mixed-body PATCH:
   `{title: "x", agent_id: "y"}` → 409, neither field updated.

3. **AC3 — Editing the linked agent itself is unaffected.** A started
   session links to agent X. `PATCH /api/agents/{X}` with new
   `agent_prompt` succeeds (no 409). The session's next `GET` sees the
   updated prompt. Tested by chaining `POST /api/chat` → `PATCH agent`
   → `GET /api/sessions`.

4. **AC4 — `SessionMeta` exposes `message_count` reliably.**
   `GET /api/sessions` and `GET /api/sessions/{id}` both populate
   `message_count` (an integer ≥ 0), so the FE can derive the lock
   without an extra request. Tested by asserting the field is present
   and matches the number of `chat_messages` rows.

### Frontend — composer mini-selector

5. **AC5 — Composer renders an agent chip to the LEFT of 📎.** Open a
   thread: the toolbar shows, in order, `[agent chip] [📎] [textarea] [⏹] [➤]`.
   The chip displays the active agent's name (from `session.agent.name`)
   and a 🤖 / brain glyph. Tested by mounting `ChatPanel` with a seeded
   session.

6. **AC6 — Unlocked: clicking the chip opens the agent menu.** With
   `message_count === 0`, clicking the chip opens a floating menu
   listing every agent from `useChat.agents` (already fetched by 044).
   Each row is keyboard-navigable. Tested with two seeded agents.

7. **AC7 — Selecting a new agent updates the session.** With the menu
   open on an empty conversation, clicking a different agent calls
   `setSessionAgent(sessionId, newAgentId)` (the existing 044 API
   surface), the store's active session reflects the new `agent.id`,
   and the menu closes. The agent chip's label updates to the new
   name.

8. **AC8 — Locked: the chip renders disabled with the lock tooltip.**
   With `message_count > 0`, the chip has `aria-disabled="true"`,
   `cursor-not-allowed`, no chevron, and `title` matches the bilingual
   lock string. Clicking it does NOT open the menu. Tested by mounting
   a thread with one persisted message and asserting click is a no-op.

9. **AC9 — Lock flips after the first turn persists.** With an empty
   conversation, mount the composer (chip enabled). After a send
   finishes and the session reloads with `message_count = 1`, the
   chip's `aria-disabled` becomes `true` and the chevron disappears.
   Tested by toggling the session's `message_count` in the store and
   re-rendering.

### Frontend — 044 dialog selector follows the same lock

10. **AC10 — 044 dialog selector is disabled on a started
    conversation.** Open the Agent-Anatomy dialog on a session with
    `message_count > 0`: the header agent dropdown is disabled with
    the same lock tooltip. The Identity / Prompts / etc. sections
    still render normally (read-write — 044 edits propagate). The
    + Novo and 🗑 buttons remain enabled (they operate on the
    catalog).

11. **AC11 — 044 dialog selector stays free on an empty
    conversation.** With `message_count === 0`, the dialog selector
    behaves exactly as 044 shipped — full dropdown, switches the
    session's `agent_id` on selection.

12. **AC12 — Server 409 on stale tab is surfaced gracefully.** If the
    composer is rendered against a stale store (the chip thinks the
    conversation is empty but the server already counted one
    message), selecting a new agent triggers a `setSessionAgent` call
    that gets 409. The store does NOT update the session's `agent_id`,
    the chip falls back to the locked state on the next refresh, and
    a transient toast / inline note tells the user the agent is now
    locked (en + pt). Tested with a mocked 409 from the API.

### Quality + i18n + style

13. **AC13 — Bilingual (§4).** Every new string ships en + pt:
    - Agent chip aria-label / title (unlocked + locked variants).
    - Lock tooltip body.
    - 409 inline / toast message.
    - Floating menu heading ("Choose an agent" / "Escolher um agente").

14. **AC14 — TypeScript clean.** `npm run build` passes
    (`tsc --noEmit` + build). The composer's selector component lives
    next to `ChatPanel.tsx` and reuses `chatApi.setSessionAgent` +
    `useChat.agents`.

15. **AC15 — `ruff check .` clean, `pytest -q` green.** Backend AC1–AC4
    each have at least one test in `backend/tests/`. Frontend AC5–AC12
    each have at least one test (Vitest + RTL) in
    `frontend/src/components/` or `frontend/src/lib/`.

16. **AC16 — Visual fit on a narrow chat panel.** On a chat panel as
    narrow as 320 px (the smallest currently supported), the toolbar
    row does not wrap or overflow horizontally — the agent chip
    truncates with ellipsis, the 📎 and send buttons stay visible.
    Verified by inspecting the rendered widths in a Vitest layout
    test (computed `getBoundingClientRect` via JSDOM is unreliable,
    so this is asserted via Tailwind class composition + a max-width
    cap on the chip).

## Protocol / stage impact

- New/changed `Stage`(s): **none.** (Constitution §1 unchanged.)
- `TraceEvent` change (§1): **none.**
- `STAGE_TO_STATION` / `STAGE_TO_PHASE` (§6): **unchanged.**
- Cloud map (§5): **unchanged** (no new tier/station/boundary).
- New endpoints: **none.**
- Modified endpoints:
  - `PATCH /api/sessions/{id}` — now returns `409 Conflict` for an
    `agent_id` change on a started session. Other field changes still
    work. The 044 happy path (empty session) is unchanged.
- Modified response shapes:
  - `SessionMeta.message_count` — already populated by `GET /api/sessions`
    today; this spec adds it to `GET /api/sessions/{id}` too if it
    isn't already. (To be confirmed in the plan; if it's already there,
    AC4 becomes a regression test rather than new code.)

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Lock trigger?** → **First persisted message** (`message_count > 0`).
- [x] **Dialog scope?** → **Both surfaces lock** — composer mini-selector
  *and* the 044 dialog selector.
- [x] **Locked UX?** → **Disabled dropdown with the agent name still
  visible** + hover tooltip. Chevron hidden to remove the dropdown
  affordance.
- [x] **Backend enforcement?** → **Yes** — `PATCH` returns 409 if the
  session has started. Belt-and-braces against a stale tab.
- [x] **Catalog management in the composer?** → **No.** Only the picker.
  + Novo / 🗑 stay in the 044 dialog.
- [x] **Force-unlock escape hatch?** → **No.** Create a new chat.

## Out of scope / deferred

- A "fork conversation onto a different agent" feature (a separate
  spec — would clone the message history into a new session linked
  to the new agent).
- Showing each agent's avatar / colour in the composer chip.
- Multi-agent conversations (orchestrator + sub-agents in the same
  thread). The Advanced rung's roadmap already covers this as a
  *visual* preview; the executable version is its own future spec.
- A composer-side "+ Novo" or "🗑" affordance.
- Per-conversation hot overrides (use 006 request-level overrides if
  needed; not exposed in the UI).
- Persisting "the agent at the time of each turn" — today the agent
  is the conversation's current link; with the lock that becomes
  effectively immutable, so no historical snapshotting is required.
