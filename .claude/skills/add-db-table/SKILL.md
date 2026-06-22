---
name: add-db-table
description: Add or alter a table/column in the relational application database (SQLite ConversationStore). Use for any schema change to the system-of-record DB. Schema changes have several synchronized sources of truth and a versioned migration ritual; this skill keeps the schema-audit test, the docs, and the clear-databases coverage from drifting.
---

The relational store is `backend/app/db/store.py` (`ConversationStore`) — the transactional system of record, distinct from the RAG *vector* store. Seven tables today (`sessions`, `agents`, `messages`, `documents`, `message_documents`, `skills`, `trace_events`). A schema change is a **feature → spec first** (run `new-spec`) and TDD.

## Synchronized sources of truth (update all, in lockstep)

1. **`_SCHEMA` in `store.py`** — the source of truth for DDL.
2. **`docs/data-model.md`** — the canonical human reference (ERD, columns, cascade rules, "what's NOT a table"). A test pins it to the code.
3. **`backend/tests/test_schema_audit.py`** — `EXPECTED_TABLES` must include any new table (diff-style failure if not).
4. **`backend/tests/test_schema_integrity.py`** — assert FKs, `CHECK`s, cascade behavior you added.
5. If the table holds user data wiped by "Clear databases" (025): update `clear_all` to delete it, and extend `EXPECTED_CLEAR_KEYS` in **`test_clear_coverage.py`** + return the new `*_deleted` count.

## Migration ritual (existing DBs must upgrade)

Schema is versioned with `PRAGMA user_version`. Don't hardcode the number — read the current max and add the next migration:

- Bump `user_version` by one and write a migration function guarded by it (see `_migrate_to_integrity_constraints` / `_rebuild_for_integrity_constraints` in `store.py` for the pattern).
- Additive change (new table/column) → additive migration, no rebuild (see spec 048).
- Constraint change on an existing table → the table-rebuild dance: FKs off → `BEGIN` → create new → copy → drop/rename → `foreign_key_check` → commit (see spec 047). Sweep orphans if a relationship changes.

## Conventions

- All SQLite calls run via `asyncio.to_thread` so they never block the event loop. Match that.
- `message_id == trace_id` invariant is exploited elsewhere — don't add a redundant column without checking.
- No new `Stage` for a pure schema change (it rides the existing `db.read` / `db.write` inside the `BACKEND` stage). If you surface new data in the UI, that may still need bilingual strings (§4).

## Finish

Run the schema-audit + integrity + clear-coverage tests specifically, then the full `verify-gates` skill. Reference: `docs/data-model.md` and the `_SCHEMA`/migration code in `store.py`.
