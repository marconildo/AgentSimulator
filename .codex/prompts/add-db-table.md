---
description: Add or alter a table/column in the relational SQLite store, keeping the schema sources of truth and migration in sync.
argument-hint: <table / column change>
---

You are changing the relational application database in **AgentSimulator**: **$ARGUMENTS**

The store is `backend/app/db/store.py` (`ConversationStore`) — the transactional system of record, distinct from the RAG *vector* store. Seven tables today (`sessions`, `agents`, `messages`, `documents`, `message_documents`, `skills`, `trace_events`). A schema change is a **feature → spec first** (run `/new-spec`) and TDD.

## Synchronized sources of truth (update all, in lockstep)

1. **`_SCHEMA` in `store.py`** — the source of truth for DDL.
2. **`docs/data-model.md`** — the canonical human reference (ERD, columns, cascade rules, "what's NOT a table"). A test pins it to the code.
3. **`backend/tests/test_schema_audit.py`** — `EXPECTED_TABLES` must include any new table (diff-style failure otherwise).
4. **`backend/tests/test_schema_integrity.py`** — assert the FKs, `CHECK`s, and cascade behavior you added.
5. If the table holds user data wiped by "Clear databases" (025): update `clear_all` to delete it, extend `EXPECTED_CLEAR_KEYS` in **`test_clear_coverage.py`**, and return the new `*_deleted` count.

## Migration ritual (existing DBs must upgrade)

Schema is versioned with `PRAGMA user_version`. Read the current max and add the next migration (don't hardcode the number):

- Bump `user_version` by one and write a migration guarded by it (pattern: `_migrate_to_integrity_constraints` / `_rebuild_for_integrity_constraints` in `store.py`).
- Additive change (new table/column) → additive migration, no rebuild (spec 048).
- Constraint change on an existing table → the table-rebuild dance: FKs off → `BEGIN` → create new → copy → drop/rename → `foreign_key_check` → commit (spec 047). Sweep orphans if a relationship changes.

## Conventions

- All SQLite calls run via `asyncio.to_thread` so they never block the event loop. Match that.
- The `message_id == trace_id` invariant is exploited elsewhere — don't add a redundant column without checking.
- No new `Stage` for a pure schema change (it rides the existing `db.read` / `db.write` inside `BACKEND`). If you surface new data in the UI, that may still need bilingual strings (§4).

## Finish

Run the schema-audit + integrity + clear-coverage tests specifically, then `/verify-gates`. Reference: `docs/data-model.md` and the `_SCHEMA`/migration code in `store.py`.
