# Tasks: DB integrity constraints

> Schema-touching. Order = TDD; the migration is built test-first so
> each step has a failing assertion before the code lands. Hard
> prerequisite: spec 046 done + green.

## Tasks

### Pre-flight

- [ ] **T0 — verify 046 is done + green**. Run
      `pytest -q backend/tests/test_schema_audit.py
      backend/tests/test_clear_coverage.py`. Both files must exist
      and pass before starting 047.

### CHECK constraints (AC3, AC4)

- [ ] **T1 — test first**:
      `test_agents_is_default_check_rejects_non_boolean` (AC3). Create
      a fresh `ConversationStore`, attempt raw
      `INSERT INTO agents (..., is_default, ...) VALUES (..., 2, ...)`,
      assert `sqlite3.IntegrityError`. Also assert `is_default = 0` and
      `= 1` both succeed.
      → **red** (CHECK not yet in DDL).
- [ ] **T2 — test first**:
      `test_documents_chunk_count_check_rejects_negative` (AC4).
      Insert `chunk_count = -1` → IntegrityError. `0` allowed.
      → **red**.
- [ ] **T3 — implement (partial)**: in `_SCHEMA` in `store.py`, add:
      - `agents.is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1))`
      - `documents.chunk_count INTEGER NOT NULL DEFAULT 0 CHECK (chunk_count >= 0)`
      Fresh DBs (test fixtures use `tmp_path`) pick this up
      immediately — T1 and T2 turn **green** for new DBs. They will
      still fail against an *existing* pre-047 DB, which is what the
      migration (T8) addresses.

### FK ON DELETE SET NULL (AC1, AC2)

- [ ] **T4 — test first**:
      `test_sessions_agent_id_fk_is_set_null` (AC1). On a fresh
      store, run `PRAGMA foreign_key_list(sessions)`; assert one row
      has `from = 'agent_id'` and `on_delete = 'SET NULL'`.
      → **red**.
- [ ] **T5 — test first**:
      `test_raw_delete_agent_nulls_dependent_sessions` (AC2). Create
      a non-default agent + a session pointing at it; raw
      `DELETE FROM agents WHERE id = ?`; assert the session still
      exists and `agent_id IS NULL`.
      → **red**.
- [ ] **T6 — implement (partial)**: in `_SCHEMA`, change
      `agent_id TEXT REFERENCES agents(id)` →
      `agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL`.
      Fresh DBs: T4 + T5 **green**. Existing DBs still need the
      migration (T8).

### Messages: drop INSERT OR REPLACE (AC5)

- [ ] **T7 — test first**:
      `test_write_message_rejects_duplicate_id` (AC5). Call
      `store.write_message(sid, "m1", ..., ...)` twice with the SAME
      `message_id`; assert second call raises `sqlite3.IntegrityError`
      (or a wrapped form thereof — verify whether the async wrapper
      surfaces it directly).
      → **red** (today's REPLACE silently succeeds).
- [ ] **T7b — implement**: in `_write_message_sync`, change `INSERT
      OR REPLACE INTO messages` to `INSERT INTO messages`. T7 turns
      **green**. Verify no other code or test relies on REPLACE
      semantics (grep `INSERT OR REPLACE` in `backend/` for any
      sibling case we want to leave alone).

### Migration (AC6, AC7, AC8, AC9)

- [ ] **T8 — test first**:
      `test_user_version_bumps_to_2_idempotently` (AC7).
      - Create a fresh store at `tmp_path/a.sqlite3` (it auto-migrates
        to `user_version = 2`).
      - Open a second connection, manually set `PRAGMA user_version =
        1`, close.
      - Construct a new `ConversationStore` against the same path —
        the migration must detect v1 and bump to v2.
      - Re-construct again: still v2, no double-run.
      → **red**.
- [ ] **T9 — test first**:
      `test_migration_preserves_existing_rows` (AC8). Build a pre-047
      DB by writing the OLD `_SCHEMA` (without CHECKs, without ON
      DELETE SET NULL) directly via `sqlite3.connect`, plus `PRAGMA
      user_version = 1`. Seed a session, two messages, a document,
      and a `message_documents` link. Open it as a
      `ConversationStore`; the migration runs. Assert all rows
      survive (ids, FKs, timestamps intact).
      → **red**.
- [ ] **T10 — test first**:
      `test_migration_cleans_orphan_message_documents` (AC6). Same
      pre-047 fixture as T9 but ALSO insert an orphan
      `message_documents` row (a `message_id` that doesn't exist in
      `messages`). Run migration. Assert the orphan is gone but the
      legitimate join row survives.
      → **red**.
- [ ] **T11 — test first**:
      `test_migration_runs_exactly_once` (AC9). Use
      `monkeypatch.setattr` on a module-level migration helper to
      count calls. Construct two stores against the same path; assert
      the rebuild helper was called once.
      → **red**.
- [ ] **T12 — implement**: in `store.py`:
      - Add `_SCHEMA_VERSION_INTEGRITY_CONSTRAINTS = 2` constant.
      - Add `_migrate_to_integrity_constraints(conn)` staticmethod
        doing the documented dance: foreign_keys OFF → BEGIN →
        rebuild `sessions` with the SET NULL FK → rebuild `agents`
        with the CHECK → rebuild `documents` with the CHECK →
        orphan cleanup on `message_documents` → indexes recreated
        → foreign_key_check sanity → set `PRAGMA user_version = 2`
        → COMMIT → foreign_keys ON.
      - In `_migrate`, call the new helper after
        `_migrate_to_shared_catalog`, gated by `user_version <
        _SCHEMA_VERSION_INTEGRITY_CONSTRAINTS`.
      T8–T11 turn **green**.

### Compatibility with 046 + the seed (AC10, AC11)

- [ ] **T13 — test first**:
      `test_clear_all_reseeds_default_under_check` (AC11). Call
      `clear_all`; the re-seeded default has `is_default = 1` — the
      CHECK accepts it; one `agents` row exists.
      → **green** against today's seed (regression guard).
- [ ] **T14 — verify**: re-run
      `pytest -q backend/tests/test_schema_audit.py
      backend/tests/test_clear_coverage.py` from 046 — both still
      green (table set unchanged; clear shape unchanged). AC10.
- [ ] **T15 — update doc**: edit `docs/data-model.md`:
      - In the "Relationships + cascade rules" section, change the
        `sessions → agents` line to "no cascade today" → "ON DELETE
        SET NULL".
      - Under `agents`: note `CHECK (is_default IN (0, 1))`.
      - Under `documents`: note `CHECK (chunk_count >= 0)`.
      - Add a one-line note: "migration `user_version = 2` (047)
        rebuilds these three tables on first boot after upgrade".

### Quality gate (AC12, AC13)

- [ ] **T16 — gate**: full `ruff check backend/` clean,
      `ruff format backend/` no-op,
      `pytest -q` green end-to-end.
- [ ] **T17 — memory + status**: bump `MEMORY.md` pointer for spec
      047 to "DONE & green" with the test counts; update the spec's
      `Status` to `done`.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test.
- [ ] `ruff check .` clean, `pytest -q` green (full suite).
- [ ] 046's audit + clear-coverage tests still green (table set +
      clear shape unchanged).
- [ ] `docs/data-model.md` updated to reflect the new constraints +
      `user_version = 2`.
- [ ] Protocol mirror unchanged (no Stage / TraceEvent change).
- [ ] No new user-facing text.
- [ ] `spec.md` status updated to `done`.
- [ ] Memory pointer for 047 updated.
