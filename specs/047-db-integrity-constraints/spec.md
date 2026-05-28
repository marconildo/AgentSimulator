# Spec: DB integrity constraints — agent FK behaviour, immutable messages, value checks

| | |
|---|---|
| **ID** | 047-db-integrity-constraints |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> Hardens the SQLite schema against latent bugs the audit (046) surfaced:
> a missing `ON DELETE` rule on `sessions.agent_id`, an `INSERT OR
> REPLACE` on `messages` that can orphan join rows, and missing value
> `CHECK`s on `is_default` and `chunk_count`. Bumps `PRAGMA user_version`
> to 2; the migration rebuilds the affected tables (SQLite's only way
> to add a constraint after the fact) and copies data over.

## Problem / motivation

The 046 audit identified three latent bugs in the relational schema.
None is *currently triggered* by any code path, but each is a footgun
waiting for a future bug or fixture to step on:

- **G1 — `sessions.agent_id REFERENCES agents(id)` has no `ON DELETE`
  clause.** Today `_delete_agent_sync` explicitly UPDATEs sessions
  before deleting the agent, so this never blows up. But if anything
  ever deletes an agent row by another path (a test fixture, a
  future endpoint, a manual SQL one-liner), sessions end up with a
  dangling `agent_id` and the next read silently returns a session
  with `agent = None`. The schema should encode the invariant.

- **G2 — `_write_message_sync` uses `INSERT OR REPLACE INTO messages`.**
  Turns are append-only in practice: the FE generates a fresh UUID
  per turn, so REPLACE never fires. But REPLACE *also* leaves
  `message_documents` rows pointing at the (replaced, same-id) message
  intact — the join's `ON DELETE CASCADE` is bypassed because the
  message_id didn't change. If a re-written turn ever lands, its
  attached-doc state is the union of old + new chips. Plain `INSERT`
  is the correct semantics: turns are immutable; a duplicate id
  should be a hard failure.

- **G3 — `is_default` and `chunk_count` have no `CHECK` constraints.**
  Pydantic validates on the way in, but the DB itself accepts
  `is_default = 7` or `chunk_count = -1`. A real RDBMS would let the
  DB carry the invariant; SQLite supports `CHECK`, so we should use
  it.

All three are one-line fixes in the DDL, plus one short migration
that rebuilds the affected tables (SQLite cannot `ALTER TABLE ADD
CHECK` or `ADD/MODIFY` an FK — the table has to be recreated and the
rows copied).

## Goals

- **`sessions.agent_id REFERENCES agents(id) ON DELETE SET NULL`** —
  drop an agent ⇒ its sessions remain readable, just with no agent
  link. The read path (`_read_session_with_agent`) already handles
  `agent_id IS NULL` gracefully.
- **`messages` writes use plain `INSERT`** — duplicate id ⇒
  `sqlite3.IntegrityError`. The write path is updated; the orphan-join
  risk is closed.
- **`CHECK (is_default IN (0, 1))` on `agents`.**
- **`CHECK (chunk_count >= 0)` on `documents`.**
- **A versioned migration (`PRAGMA user_version = 2`)** that recreates
  `sessions`, `agents`, and `documents` with the new constraints and
  copies rows. Idempotent — second boot is a no-op.
- **046's audit + clear-coverage tests still pass** after the
  migration (the table set is unchanged; the reported counts are
  unchanged). 046 is a hard prerequisite.

## Non-goals

- **Adding new tables.** Schema shape (the 6 tables) is unchanged.
- **Changing column names, types, or order** beyond the additions
  above.
- **Real `schema_migrations` table** — deferred to a future spec 048.
- **UNIQUE constraint on `(session_id, filename)` in `documents`**
  (G7 in the audit). Same-named uploads are allowed by design today;
  changing that needs a UX decision the audit didn't surface as
  blocking.
- **Backend API change.** The shape returned by every endpoint is
  identical (the only thing a stale tab could notice is that
  attempting to delete an agent that has dangling references now
  succeeds; this path isn't reachable from the UI).
- **Frontend change.** No store, no component, no i18n string.
- **A new `Stage` / `Phase` / `TraceEvent`.**
- **CASCADE on the agent FK.** SET NULL is preferred — deleting an
  agent shouldn't silently wipe every conversation that used it.

## User-facing behavior

- **End users** see no change.
- **Devs running against an existing dev DB** see one boot-time
  migration: `user_version` flips from 1 to 2, the affected tables
  are rebuilt with the new constraints, rows are copied. Migration
  is idempotent + fast (the dev DB is tiny).
- **A future bug** that tries to insert a duplicate `messages.id`,
  or set `is_default = 5`, or insert a negative `chunk_count`, now
  fails loudly with `sqlite3.IntegrityError` instead of corrupting
  silently.

## Acceptance criteria

### Schema constraints

1. **AC1 — `sessions.agent_id` FK is `ON DELETE SET NULL` after the
   migration.** Verify via `PRAGMA foreign_key_list(sessions)` →
   the row for `agent_id` has `on_delete = 'SET NULL'`. Test in
   `backend/tests/test_schema_integrity.py`.

2. **AC2 — Deleting an agent via raw SQL nulls dependent sessions.**
   Insert a session pointing to a non-default agent; raw-SQL
   `DELETE FROM agents WHERE id = ?`; assert the session row still
   exists and `agent_id IS NULL`. (The app code path
   `_delete_agent_sync` still re-points to the default — this test
   only proves the schema-level fallback works.)

3. **AC3 — `agents.is_default CHECK (is_default IN (0, 1))` is
   enforced.** `INSERT INTO agents (..., is_default, ...) VALUES (..., 2, ...)`
   raises `sqlite3.IntegrityError`. Verify the CHECK exists via
   `PRAGMA table_info` / the table's SQL.

4. **AC4 — `documents.chunk_count CHECK (chunk_count >= 0)` is
   enforced.** Inserting `chunk_count = -1` raises
   `sqlite3.IntegrityError`. Zero is allowed (empty doc); positive
   values work as before.

### Message write semantics

5. **AC5 — `_write_message_sync` uses plain `INSERT`, not `INSERT OR
   REPLACE`.** Inspect the source / behaviour: writing two messages
   with the **same** `message_id` raises `sqlite3.IntegrityError`.
   The existing happy path (fresh ids per turn) still works
   end-to-end.

6. **AC6 — No orphan `message_documents` rows after the migration.**
   The migration includes a one-shot
   `DELETE FROM message_documents WHERE message_id NOT IN (SELECT id FROM messages)`
   and the symmetric `document_id NOT IN (SELECT id FROM documents)`
   so any existing orphans from the pre-fix `INSERT OR REPLACE`
   period are cleaned up. Tested by inserting an orphan join row
   manually, running the migration, asserting it's gone.

### Migration mechanics

7. **AC7 — `PRAGMA user_version` is `2` after the migration runs on
   a `user_version = 1` DB.** Tested by manually setting
   `PRAGMA user_version = 1`, re-initialising the store, asserting
   the value is `2`. Re-init again: still `2` (idempotent).

8. **AC8 — Existing data survives the table rebuild.** Pre-fill the
   pre-migration DB with N sessions (linked to agents) + M messages
   + K documents; run the migration; assert every row is still
   present with every column preserved (id, fks, timestamps).

9. **AC9 — The migration runs once per boot, never twice.** Asserted
   by spying on the helper that does the rebuild — second boot
   calls it zero times.

### 046 compatibility

10. **AC10 — 046's audit tests still pass.** The table set
    (`sqlite_master`) is unchanged. The `clear_all` return-shape is
    unchanged. The clear-coverage test still finds every user-data
    table empty after wipe.

11. **AC11 — Default agent is still re-seeded after `clear_all`** —
    the new CHECK constraint doesn't break the seed path (the seed
    inserts `is_default = 1`, which is valid).

### Quality

12. **AC12 — `ruff check .` clean, `pytest -q` green.** New test file
    `backend/tests/test_schema_integrity.py` plus updates as needed
    to existing tests.

13. **AC13 — No new `Stage` / `TraceEvent` / endpoint / FE string.**
    Constitution §1, §4, §5, §6 all unaffected.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.**
- `STAGE_TO_STATION` / `STAGE_TO_PHASE`: **unchanged.**
- Cloud map (§5): **unchanged.**
- HTTP endpoints: **unchanged.**
- DB schema:
  - `sessions.agent_id` FK gains `ON DELETE SET NULL`.
  - `agents.is_default` gains `CHECK (is_default IN (0, 1))`.
  - `documents.chunk_count` gains `CHECK (chunk_count >= 0)`.
  - `PRAGMA user_version` bumps from 1 → 2.

## Open questions (resolved during clarify — 2026-05-28)

- [x] **CASCADE vs SET NULL on `sessions.agent_id`?** → **SET NULL.**
  Deleting an agent should never silently wipe conversations. The
  app code re-points to the default; the schema-level SET NULL is
  belt-and-braces against any other deletion path.
- [x] **Hard-fail on duplicate `messages.id`?** → **Yes.** Turns are
  immutable in this codebase; a duplicate id is a real bug, not a
  race we should paper over.
- [x] **Migration strategy?** → **Per-table rebuild + copy**
  (SQLite's documented approach). The dev DB is tiny so the cost is
  negligible.
- [x] **Backfill existing orphan joins?** → **Yes** — defensive
  one-shot cleanup in the migration (AC6).
- [x] **Bump `user_version` to 2 vs use a real `schema_migrations`
  table?** → **Bump.** A real migrations table is spec 048 (deferred).
- [x] **Roll back path?** → **None.** Forward-only migration; the dev
  habit is "wipe DB if confused" (`/api/data/clear` exists).

## Out of scope / deferred

- A real `schema_migrations` table (spec 048 if wanted).
- UNIQUE `(session_id, filename)` on `documents` (audit G7 — design
  decision needed).
- Per-column NOT NULL audit (audit G6 — covered enough by current
  schema).
- Renaming `is_default INTEGER` to `BOOLEAN` (SQLite has no real
  BOOLEAN type; INTEGER + CHECK is the canonical pattern).
- Moving the agent-delete code path to rely on SET NULL instead of
  the explicit UPDATE (the app-level re-point to the default is a
  better default UX — SET NULL is the backstop).
- Adding indices on FK columns that don't have one (today every
  FK column already has an index).
