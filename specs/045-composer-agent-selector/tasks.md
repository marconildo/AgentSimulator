# Tasks: Composer agent selector + lock-after-first-turn

> Two surfaces (composer chip + 044 dialog selector), one invariant
> (`message_count > 0` ⇒ locked), one server-side guard (409). TDD
> order = backend first (cheapest feedback), then frontend (chip),
> then dialog sync.

## Tasks

### Pre-flight

- [ ] **T0 — decide ordering**. Recommended: ship 046 + 047 first.
      045 doesn't depend on them, but the audit tests from 046 are
      a useful safety net during 045's small store changes.

### Backend — server-side lock (AC1–AC4)

- [ ] **T1 — test first**:
      `test_session_meta_exposes_message_count` (AC4). Create a session,
      assert `GET /api/sessions/{id}` returns a body with
      `message_count: 0`; write one message; assert `message_count:
      1`. Same for `GET /api/sessions` list.
      → if this is **green** already (the list endpoint exposes it
      today), AC4 is a regression guard; if the single-session
      endpoint doesn't expose it, the test is **red** and T2 fixes it.
- [ ] **T2 — implement (if needed)**: in `store.py`, ensure
      `_get_session_sync` / `_read_session_with_agent` add
      `message_count` to the returned dict (mirror the LIST endpoint's
      subquery). Re-run T1 → green.
- [ ] **T3 — test first**:
      `test_patch_session_agent_returns_409_when_started` (AC1). Use
      `TestClient`: create session → write a message → PATCH a
      different (created) agent_id → assert 409 with body
      `{"detail": "agent_locked", "message_count": 1}` and the session
      still points at the original agent.
      → **red**.
- [ ] **T4 — test first**:
      `test_patch_session_agent_succeeds_when_empty` (AC1 happy path).
      Create session → PATCH agent_id → 200; session's agent_id
      updated.
      → **green** today; regression guard.
- [ ] **T5 — test first**:
      `test_patch_agent_unaffected_by_session_message_count` (AC3).
      Create session + write message; PATCH the linked agent's
      `agent_prompt`; assert 200; `GET /api/sessions/{id}` shows the
      updated agent prompt.
      → **green** today; regression guard (proves the lock is on
      session-agent LINK, not agent EDIT).
- [ ] **T6 — implement**: add `class AgentLocked(ValueError)` in
      `store.py` alongside `CannotDeleteDefaultAgent`. Extend
      `_set_session_agent_sync` to first SELECT
      `COUNT(*) FROM messages WHERE session_id = ?`; if > 0 and the
      incoming `agent_id` differs from the current, raise
      `AgentLocked(message_count)`. Plain `agent_id == current` is a
      no-op (no need to 409 — the user "changed" to the same agent).
- [ ] **T7 — implement**: in `main.py` `patch_session`, import
      `AgentLocked`; wrap the existing `set_session_agent` call in a
      `try/except AgentLocked` → `HTTPException(status_code=409,
      detail={"detail": "agent_locked", "message_count":
      exc.message_count})`. T3 turns **green**.

### Frontend — chatApi typed error (AC12 plumbing)

- [ ] **T8 — implement (no test first; type sugar)**: in
      `frontend/src/lib/chatApi.ts`, add a `isAgentLockedError(e:
      unknown): e is AgentLockedError` predicate that inspects the
      thrown Response error from `jsonApi` for `status === 409` and
      `detail === "agent_locked"`. (The shape is small and easy to
      verify by inspection; we'll cover the behaviour in T20's store
      test.)

### Frontend — i18n (AC13)

- [ ] **T9 — test first**: extend `i18n/strings.test.ts` (or add a
      tight new file) — `test_agent_selector_strings_have_en_and_pt`
      asserts every key under `chat.agentSelector` (or wherever they
      end up) exists in both EN and PT and is non-empty.
      → **red**.
- [ ] **T10 — implement**: add the six bilingual strings (see plan's
      i18n table) to `i18n/strings.ts`. T9 turns **green**.

### Frontend — composer chip (AC5–AC9)

- [ ] **T11 — test first**:
      `test_composer_renders_agent_chip_left_of_attach` (AC5). Mount
      `ChatPanel` with a thread + session whose `agent.name = "X"` +
      `message_count = 0`. Assert the chip is present, shows "X",
      and appears BEFORE the 📎 button in DOM order.
      → **red**.
- [ ] **T12 — test first**:
      `test_unlocked_chip_click_opens_menu` (AC6). Mock `listAgents`
      to return 2 agents. Click the chip → menu appears with both
      rows.
      → **red**.
- [ ] **T13 — test first**:
      `test_selecting_agent_patches_session_and_updates_store` (AC7).
      Mock `setSessionAgent` to resolve with the new agent. Click a
      menu row → assert mock was called with `(sessionId, newAgentId)`;
      after the promise resolves, `useChat.getState().sessions.find
      (active).agent.id` is the new id; the chip label re-renders.
      → **red**.
- [ ] **T14 — test first**:
      `test_locked_chip_is_disabled_with_tooltip` (AC8). Mount with
      `message_count = 1`. Assert chip has `aria-disabled="true"` or
      `disabled` attribute, has `title=` matching the lock string,
      and the chevron icon is absent. Clicking is a no-op (menu
      doesn't open).
      → **red**.
- [ ] **T15 — test first**:
      `test_chip_locks_when_message_count_becomes_one` (AC9). Mount
      with `message_count = 0` (chip enabled). Mutate the store to
      `message_count = 1` (simulate a turn finishing). Re-render →
      chip becomes locked.
      → **red**.
- [ ] **T16 — implement**: inside
      `frontend/src/components/ChatPanel.tsx` (composer section),
      add a new local `<AgentChip>` component:
      - Reads `useChat((s) => s.sessions.find(s.activeSessionId)?.agent)`
        + `message_count`.
      - Disabled state: `<button disabled aria-disabled="true"
        title={t.chat.agentSelector.locked}>{name} 🤖</button>` —
        no chevron.
      - Enabled state: same button + a chevron + click handler that
        toggles a local `menuOpen` state.
      - Menu: positioned `absolute bottom-full mb-1`; lists agents
        from a local `useState<AgentMeta[] | null>` populated on
        first open via `listAgents()`. Each row → `setSessionAgent`
        + close menu + update store.
      - Place it in the `<div className="mt-1 flex items-center
        gap-2">` toolbar row, BEFORE the existing `📎` button.
      T11–T15 turn **green** in succession.

### Frontend — store stale-tab handling (AC12)

- [ ] **T17 — test first**:
      `test_set_session_agent_409_falls_back_to_locked` (AC12). Mock
      `setSessionAgent` to reject with the 409 shape. Trigger the
      "select another agent" action in the store. Assert: store's
      `session.agent.id` is NOT changed; a transient `error` (or
      `lockedNote`) field is set with the locked string;
      session-list is refetched (so the next render sees
      `message_count` updated).
      → **red**.
- [ ] **T18 — implement**: in `useChat.ts`'s `setActiveAgent`
      function (or wherever the chip dispatches; add one if absent),
      wrap `setSessionAgent` call in a `try/catch`. On
      `isAgentLockedError(e)`: do NOT mutate `sessions[i].agent`;
      set `state.error = t.chat.agentSelector.lockedInlineNote`;
      kick a `loadSessions()` refresh; clear the error after a
      short timeout (consistent with existing transient notes).
      T17 turns **green**.

### Frontend — dialog selector follows the lock (AC10, AC11)

- [ ] **T19 — test first**:
      `test_catalog_sidebar_disabled_when_locked` (AC10). Mount
      `AgentCatalogSidebar` against a session with `message_count
      = 1`. Each agent row has `aria-disabled="true"` (or the
      tooltip equivalent). The currently-active row stays
      highlighted. **+ Novo** and **🗑** buttons remain
      `enabled`.
      → **red**.
- [ ] **T20 — test first**:
      `test_catalog_sidebar_active_when_message_count_zero` (AC11).
      Same fixture with `message_count = 0`. Rows are enabled;
      clicking one calls `setSessionAgent`.
      → **green** today (regression guard).
- [ ] **T21 — implement**: in
      `agent-anatomy/AgentCatalogSidebar.tsx`:
      - Read the active session's `message_count` from `useChat`.
      - When `> 0`, render each agent row as a non-clickable item
        with `title={t.chat.agentSelector.locked}` and `aria-disabled
        ="true"`. Style: same as current but with `opacity-60
        cursor-not-allowed`, the click handler short-circuits.
      - Keep + Novo + 🗑 click handlers as-is.
      T19 turns **green**; T20 stays **green**.

### Quality gate (AC14, AC15)

- [ ] **T22 — gate**: `ruff check backend/` clean;
      `ruff format backend/` no-op; full `pytest -q` green.
- [ ] **T23 — gate**: `npm run build` green
      (`tsc --noEmit` + build); `npm test` green.
- [ ] **T24 — manual smoke**: load the app, send a message, observe
      the chip flips to locked, dialog selector also disabled; +
      Novo still creates a new agent; 🗑 still deletes a
      non-default. Verify the 409 path by opening two tabs.
- [ ] **T25 — memory + status**: bump `MEMORY.md` pointer for spec
      045 to "DONE & green" with the test counts; update the spec's
      `Status` to `done`.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
      (AC1–AC13) or is covered by gates (AC14, AC15, AC16).
- [ ] `ruff check .` clean, `pytest -q` green.
- [ ] `npm run build` clean (`tsc --noEmit` passes).
- [ ] `npm test` green.
- [ ] All new strings exist in BOTH EN and PT (`strings.test.ts`).
- [ ] No new `Stage` / `Phase` / `TraceEvent`.
- [ ] Manual smoke test confirms: chip visible, unlocked → locked
      transition works, 044 sidebar follows the lock, + Novo / 🗑
      still work.
- [ ] `spec.md` status updated to `done`.
- [ ] Memory pointer for 045 updated.
