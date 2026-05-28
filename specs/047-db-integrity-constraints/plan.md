# Plan: DB integrity constraints

> Schema-touching follow-up to 046. Adds `ON DELETE SET NULL` to the
> agent FK, flips `INSERT OR REPLACE` on messages to plain `INSERT`,
> and adds two `CHECK` constraints. Bumps `PRAGMA user_version` to 2.
> SQLite's lack of `ALTER TABLE ADD CONSTRAINT` forces a table-rebuild
> migration for the affected tables; this plan spells it out.

## Approach

SQLite supports `ALTER TABLE ADD COLUMN` but not `ALTER TABLE ADD
CONSTRAINT` or `ALTER TABLE MODIFY`. The canonical workaround (in
SQLite's official docs) is a six-step dance:

1. `PRAGMA foreign_keys = OFF` for the duration.
2. `BEGIN TRANSACTION`.
3. Create `<table>_new` with the desired DDL.
4. `INSERT INTO <table>_new SELECT … FROM <table>` (every column,
   same order).
5. `DROP TABLE <table>` then `ALTER TABLE <table>_new RENAME TO <table>`.
6. `PRAGMA foreign_key_check` (sanity) → `COMMIT` → `PRAGMA foreign_keys
   = ON`.

We do this for **three tables**: `sessions` (the agent_id FK change),
`agents` (the is_default CHECK), and `documents` (the chunk_count
CHECK). The `messages` change is purely Python code (`INSERT OR REPLACE`
→ `INSERT`); no DDL touch. The `message_documents` table also gets a
one-shot orphan cleanup (`DELETE FROM message_documents WHERE
message_id NOT IN …`) as defensive housekeeping.

All wrapped in a new `_migrate_to_integrity_constraints` helper, gated
by `PRAGMA user_version >= 2` so re-runs are no-ops. The 044
`_SCHEMA_VERSION_SHARED_CATALOG = 1` constant gets a sibling
`_SCHEMA_VERSION_INTEGRITY_CONSTRAINTS = 2`.

The `_SCHEMA` string itself is also updated to match — fresh DBs skip
the migration (`PRAGMA user_version` starts at 0; the migration runs;
sets to 2; the constraints are present in the freshly-created tables
because `_SCHEMA` already includes them).

Alternative considered + rejected: shipping the constraints only in
`_SCHEMA` without a migration, on the theory that "dev DBs are
disposable, just `/api/data/clear`". Rejected because: (a) `clear`
only wipes data, not the schema; (b) it sets a bad precedent
("migrations are optional"); (c) the test asserting `PRAGMA
foreign_key_list(sessions)` would need different fixtures for fresh-vs-migrated paths, and that's
fragile.

## Affected files

**Backend code**
- `backend/app/db/store.py`:
  - `_SCHEMA` — update DDL for `sessions`, `agents`, `documents` to
    reflect the new constraints (so fresh DBs are correct from the
    start).
  - `_write_message_sync` — `INSERT OR REPLACE INTO messages` →
    `INSERT INTO messages`.
  - New `_migrate_to_integrity_constraints(conn)` static method —
    runs the table-rebuild dance, gated by `user_version`.
  - `_migrate` — wires the new step in after
    `_migrate_to_shared_catalog`.
  - New `_SCHEMA_VERSION_INTEGRITY_CONSTRAINTS = 2`.

**Backend tests (new)**
- `backend/tests/test_schema_integrity.py` — covers AC1–AC9 + AC11.
  Pure SQLite, keyless.

**Backend tests (touch)**
- `backend/tests/test_db.py` — if any existing test relies on
  `INSERT OR REPLACE` re-writing a message (unlikely, but verify).

**Documentation (touch)**
- `docs/data-model.md` — update the "Relationships + cascade rules"
  section: `sessions → agents` now `ON DELETE SET NULL`. Note the
  CHECK constraints under the relevant tables.
- 046's `test_schema_audit.py` — the table set is unchanged, so the
  audit is unaffected by name; but the migration runs and the test
  still passes. *No change required*; verify in T-last.

**Frontend**
- None.

## Protocol changes (constitution §1)

None. No `Stage`, `Phase`, or `TraceEvent` change. No endpoint shape
change. The only observable difference is that future buggy
duplicate-message-id writes fail loudly (where they previously corrupted
silently) — not a protocol change, a fail-louder.

## Data model changes

| Table | Change |
|---|---|
| `sessions` | `agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL` (was no ON DELETE clause) |
| `agents`   | + `CHECK (is_default IN (0, 1))` |
| `documents`| + `CHECK (chunk_count >= 0)` |
| `messages` | unchanged DDL; code switches `INSERT OR REPLACE` → `INSERT` |
| `message_documents` | unchanged DDL; migration does one-shot orphan cleanup |

`PRAGMA user_version`: 1 → 2 after the migration.

## i18n strings (constitution §4)

None. No user-facing prose.

| key / location | en | pt |
|---|---|---|
| — | — | — |

## Cloud map (constitution §5)

n/a — no new tier or station.

## Test strategy (constitution §9 — TDD)

| AC | Test | File |
|---|---|---|
| AC1 — sessions.agent_id FK is ON DELETE SET NULL | `test_sessions_agent_id_fk_is_set_null` | `backend/tests/test_schema_integrity.py` |
| AC2 — raw `DELETE FROM agents` nulls the session's agent_id | `test_raw_delete_agent_nulls_dependent_sessions` | `backend/tests/test_schema_integrity.py` |
| AC3 — `is_default = 2` rejected by CHECK | `test_agents_is_default_check_rejects_non_boolean` | `backend/tests/test_schema_integrity.py` |
| AC4 — `chunk_count = -1` rejected | `test_documents_chunk_count_check_rejects_negative` | `backend/tests/test_schema_integrity.py` |
| AC5 — duplicate `messages.id` raises IntegrityError | `test_write_message_rejects_duplicate_id` | `backend/tests/test_schema_integrity.py` |
| AC6 — orphan `message_documents` cleaned up by migration | `test_migration_cleans_orphan_message_documents` | `backend/tests/test_schema_integrity.py` |
| AC7 — `user_version` is 2 after migration, idempotent | `test_user_version_bumps_to_2_idempotently` | `backend/tests/test_schema_integrity.py` |
| AC8 — existing data survives the table rebuild | `test_migration_preserves_existing_rows` | `backend/tests/test_schema_integrity.py` |
| AC9 — migration runs once per boot | `test_migration_runs_exactly_once` (uses a monkeypatched spy on the rebuild helper) | `backend/tests/test_schema_integrity.py` |
| AC10 — 046 audit + clear-coverage still pass | covered by re-running the existing 046 tests; CI gate |
| AC11 — default agent re-seed still works under new CHECK | `test_clear_all_reseeds_default_under_check` | `backend/tests/test_schema_integrity.py` |
| AC12 — ruff + pytest green | CI gate |
| AC13 — no protocol/Stage/FE change | by inspection; no protocol mirror needed |

Several tests need a "DB created at the old version" fixture. Approach:
build a tiny in-test SQL string for the **pre-047 DDL**, write it via
raw `sqlite3.connect`, then construct `ConversationStore(path)` — which
triggers the migration. This is the same pattern 044's migration tests
would use; if no existing helper exists, this plan introduces one
(`_make_pre_047_db(path)`) inside the test file.

## Risks / trade-offs

- **Table rebuild on every existing dev DB on next boot.** Cost is
  negligible (dev DBs are tens of rows); the migration is idempotent
  and gated by `user_version`. Still, anyone with a precious dev DB
  should be aware. Document it in a one-line note in the spec's "User-
  facing behavior" section (already there).
- **`PRAGMA foreign_keys = OFF` during the rebuild.** Required because
  the rebuild's `DROP TABLE` would otherwise trip the FK from
  `messages.session_id`. The `foreign_key_check` PRAGMA at the end
  verifies no orphans were left behind.
- **The migration depends on the `agents` table existing** (added by
  the 042/043/044 migration chain). The migration order in `_migrate`
  already runs the shared-catalog migration first; the new step runs
  after it.
- **Connection-pooling assumption.** `_connect()` opens a fresh
  connection per call and enables foreign_keys. The migration must
  open *one* connection, disable FKs on it, do the dance in one
  transaction, re-enable. Don't reuse `_connect()` here.
- **Re-running 046's audit after this migration.** The table set is
  unchanged; the audit stays green. AC10 is a CI-level gate
  (re-running pytest), not a unit test.
- **AC2 vs the app code path.** The app's `_delete_agent_sync` still
  explicitly UPDATEs sessions before deleting (better UX — re-points
  to the default, not NULL). AC2 only proves the **schema-level
  fallback** works. Not a conflict; document the layering.
- **Renaming `messages.id` to be a true PK with rejection on dupe** —
  it already IS the PK (`id TEXT PRIMARY KEY`), so `INSERT INTO
  messages …` with a duplicate id naturally raises
  `sqlite3.IntegrityError`. We rely on the existing PK; we just stop
  papering over it with `OR REPLACE`.
