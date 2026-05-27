# Tasks: Clear databases — reset control in Settings

> The work, ordered, as a TDD checklist. Each implementation task is preceded by the test that
> should fail first (red → green → refactor). Check boxes as you go.

## Tasks

- [x] **T1 — test first (AC1)**: in `backend/tests/test_clear.py`, seed ≥2 sessions with
  messages and ≥1 document, then assert `ConversationStore.clear_all()` empties the store and
  returns `{sessions_deleted, messages_deleted, documents_deleted}` matching the seeded counts.
- [x] **T2 — implement (AC1)**: add `_clear_all_sync()` + `async clear_all()` to
  `backend/app/db/store.py` (count rows, `DELETE FROM sessions`, return counts). Make T1 pass.
- [x] **T3 — test first (AC2)**: in `test_clear.py`, build the corpus index and add a handful of
  `corpus=False` vectors, then assert `delete_uploaded_vectors()` returns their count, removes
  all `corpus=False` vectors, and leaves every `corpus=True` corpus vector (`is_indexed()` True).
  Mark `@pytest.mark.openai`.
- [x] **T4 — implement (AC2)**: add `delete_uploaded_vectors() -> int` to
  `backend/app/rag/ingestion.py` (mirror of `delete_document_vectors`, `where={"corpus":
  False}`). Make T3 pass.
- [x] **T5 — test first (AC3 + AC4)**: in `test_clear.py`, via FastAPI `TestClient`, seed data
  then `POST /api/data/clear` → 200 with the four counts; assert `GET /api/sessions` == `[]` and
  `GET /api/health` `indexed` is True; then call clear again on the empty stores → 200 with all
  counts `0` (AC4). Mark the corpus-touching part `@pytest.mark.openai`.
- [x] **T6 — implement (AC3 + AC4)**: add `POST /api/data/clear` to `backend/app/main.py`
  (off-thread `delete_uploaded_vectors`, then `get_store().clear_all()`, merged response). Make
  T5 pass.
- [x] **T7 — test first (AC5)**: add `frontend/src/store/useChat.clear.test.ts` — mock
  `../lib/chatApi`, populate the store (sessions/messages/documents/activeSessionId), call
  `clearAll()`, assert `clearData` called once and the store reset to a fresh draft
  (`sessions == []`, `activeSessionId == null`, `messages == []`, `documents == []`).
- [x] **T8 — implement (AC5)**: add `ClearResult` + `clearData()` to
  `frontend/src/lib/chatApi.ts`, and the `clearAll()` action to `frontend/src/store/useChat.ts`
  (call `clearData`, `set({ sessions: [] })`, `newChat()`). Make T7 pass.
- [x] **T9 — i18n (AC6, §4)**: add the `settings.data` block (type + en + pt) to
  `frontend/src/i18n/strings.ts`, and extend `frontend/src/i18n/strings.test.ts` to pin
  `settings.data` en/pt leaf-key parity + non-empty values.
- [x] **T10 — UI**: add the "Data" section to `frontend/src/components/SettingsPanel.tsx` — the
  **Clear databases** button with an inline confirm/cancel gate and a transient
  clearing/result line built from the `ClearResult` (interpolating `{sessions}`/`{chunks}`).
- [x] **T11 — refactor**: clean up, keep every test green; run the gates.

## Definition of done

- [x] Every acceptance criterion in `spec.md` maps to a passing test
- [x] `ruff check .` clean · `ruff format .` (changed files)
- [x] `pytest -q` green — keyless suite (60) green incl. AC1/AC4-relational; `test_clear.py`
      run isolated 5/5 incl. the `@openai` AC2/AC3/AC4-endpoint; `--collect-only` clean
- [x] `npm run build` passes (`tsc --noEmit` + build)
- [x] `npm test` (Vitest) green (193)
- [x] No protocol change — `schemas.py` ↔ `events.ts` mirror untouched; every `Stage` still
      mapped to a station (no `Stage` added)
- [x] All new user-facing text exists in en **and** pt
- [x] `spec.md` status updated to `done`
