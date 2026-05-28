# Spec: Data-model documentation + schema-audit guard

| | |
|---|---|
| **ID** | 046-data-model-docs |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> Foundation pass over the relational store: writes down the schema in one
> authoritative place (a real ERD + bilingual-aware doc) and adds CI-level
> guards that fail-loud when (a) the table set drifts away from the
> documented one, or (b) `clear_all` ever leaves rows behind in any
> user-data table. **No schema change in this spec** — that is 047.

## Problem / motivation

The DB has grown organically across nine specs (002 / 025 / 027 / 040 /
042 / 043 / 044). Six tables (`sessions`, `agents`, `messages`,
`documents`, `message_documents`, `skills`) plus a layered cleanup path
that crosses three stores (SQLite + Chroma + object store). Two
real-world problems surfaced:

1. **Mental model drift.** The user listed expected tables as
   `chat_history` / `agent` / `configs` / `skills` / `tools`. Reality:
   `messages` (not `chat_history`), `agents` (plural), no `configs`
   table at all (settings live in env vars and browser localStorage),
   no `tools` table (tools are MCP code definitions; `agents.enabled_tools`
   is just a JSON list of *names*). The schema is fine; the docs
   aren't.

2. **Cleanup contract is implicit.** Today `_clear_all_sync` wipes
   every user-data table (documents → messages → sessions → skills →
   agents, then re-seeds the default). It works. But there's **no
   automated check** that a future spec which adds a new table will
   also extend `clear_all` — that contract lives in code review, not
   in CI. The user's exact concern: *"inclusive na operação de
   limpeza tem que limpar todas elas"* — make that a property, not
   a habit.

A single doc + two regression tests close both gaps without touching
the schema itself.

## Goals

- **One canonical schema doc.** `docs/data-model.md` with an ERD,
  every table's columns + meaning, FK semantics + cascade rules, and
  a "what's NOT a table" note disambiguating tools (code) and configs
  (env / localStorage). Linked from `CLAUDE.md`.
- **A schema-audit test.** Introspect `sqlite_master` after migrations
  run; assert the set of user tables is **exactly** the documented
  set. A future PR that adds a table without updating the docs +
  this test fails CI.
- **A clear-coverage test.** Seed at least one row in every user-data
  table; call `clear_all`; assert every user-data table is empty
  (except the re-seeded default agent). A future PR that adds a
  table but forgets to wipe it in `clear_all` fails CI.
- **A reported-counts contract test.** Assert `clear_all` returns a
  count key for every user-data table (`<table>_deleted`). Future
  tables must extend the return shape.
- **No code-path / API change.** This is doc + tests only; behaviour
  on the wire stays identical.

## Non-goals

- **Changing the schema.** No new tables, no FK changes, no
  constraints. That is spec 047.
- **A real `schema_migrations` table.** Deferred (would be a spec 048
  if we ever want it).
- **Migrating any existing data.** Pure additive.
- **Frontend changes.** No store, no component, no i18n string.
- **A `/api/schema` endpoint.** No new HTTP surface. The doc is the
  reference; the tests are the guard.
- **Snapshot of every column type** (parsing `PRAGMA table_info` and
  pinning every default + nullability). Too noisy; the table-set
  guard is enough for drift detection.

## User-facing behavior

- **Devs / readers** open `docs/data-model.md` and see the ERD + table
  reference. Same shape as `docs/architecture.md` and
  `docs/how-it-works.md`. The doc is English-only (it's developer
  reference material, same as the constitution and the existing docs
  in `docs/` — bilingual rule §4 covers user-visible UI prose, not
  internal docs).
- **CI** is unchanged in name but newly enforces two properties:
  the table-set is the documented set, and `clear_all` zeroes every
  user-data table.
- **End users** see no change.

## Acceptance criteria

### Documentation

1. **AC1 — `docs/data-model.md` exists** with: (a) a Mermaid or ASCII
   ERD; (b) a section per table listing every column, type, nullability,
   and a one-line meaning; (c) a "Relationships + cascades" section
   spelling out which FKs cascade vs which don't (today: `sessions →
   messages` CASCADE, `sessions → documents` CASCADE, `messages ↔
   message_documents ← documents` CASCADE both sides, `sessions →
   agents` no cascade); (d) a "What's NOT a table" section calling
   out tools (MCP code) and configs (env + localStorage). Tested by
   asserting the file's path exists in a small `tests/test_docs.py`.

2. **AC2 — `CLAUDE.md` links to the new doc.** A bullet under the
   existing "Docs" section points at `docs/data-model.md`. Tested by
   asserting `data-model.md` is mentioned in `CLAUDE.md`.

3. **AC3 — `backend/app/db/store.py` module docstring references the
   doc.** A one-line pointer near the top of the docstring tells
   future readers where the canonical reference lives.

### Schema-audit test (the CI guard)

4. **AC4 — Table set is exactly the documented set.** A test in
   `backend/tests/test_schema_audit.py` reads `sqlite_master` from a
   freshly-initialised store and asserts the set of `type='table'`
   names — excluding SQLite-internal names like `sqlite_sequence` — is
   exactly `{sessions, agents, messages, documents, message_documents,
   skills}`. A drift in either direction (new undocumented table OR a
   table accidentally dropped) fails the test with a diff-style
   message.

5. **AC5 — Audit pinned constant is documented.** The expected-set
   constant lives at the top of the test file with a comment pointing
   readers at `docs/data-model.md` so the "what to update" path is
   obvious.

### Clear-coverage tests (the contract guard)

6. **AC6 — `clear_all` zeroes every user-data table.** Test in
   `backend/tests/test_clear_coverage.py`: seed a row in every table
   (a session with a message + a document + a message_documents link
   + a skill + a non-default agent); call `clear_all`; assert every
   user-data table has zero rows EXCEPT `agents` which has exactly
   one row (the re-seeded default). Tested via direct
   `SELECT COUNT(*)` per table.

7. **AC7 — `clear_all` reports a count key per user-data table.**
   The dict returned by `clear_all` has a `<table>_deleted` key for
   each user-data table (sessions, messages, documents, skills,
   agents) — `message_documents` is implicit via cascade and is
   tested in AC6 by row count, not a reported count. The dict's
   keyset is asserted to be **exactly** the documented set.

8. **AC8 — Re-seeded default agent matches the seed constants.**
   After `clear_all`, exactly one `agents` row exists with
   `id = DEFAULT_AGENT_ID`, `is_default = 1`, and the expected name +
   prompts. (Regression guard for the re-seed.)

### Quality

9. **AC9 — `ruff check .` clean. `pytest -q` green.** Three new
   test files, no Lint regressions.

10. **AC10 — No new `Stage` / `TraceEvent` / endpoint / FE string.**
    Constitution §1, §4, §5, §6 all unaffected.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.**
- `STAGE_TO_STATION` / `STAGE_TO_PHASE`: **unchanged.**
- Cloud map (§5): **unchanged.**
- HTTP endpoints: **unchanged.**
- DB schema: **unchanged.**

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Slice with spec 047?** → **Yes — separate PRs** (user request).
  046 ships the docs + guard tests *first* so 047's migration has a
  test to update.
- [x] **Bilingual doc?** → **No** — `docs/` is developer reference,
  same as `architecture.md` and `how-it-works.md`. The bilingual rule
  (§4) covers user-visible UI prose.
- [x] **ERD format?** → **Mermaid** preferred (GitHub renders it
  natively); ASCII fallback is fine if Mermaid is awkward.
- [x] **Include `sqlite_sequence` in the audit?** → **No** — it's a
  SQLite implementation detail; the audit filters it out (and any
  other `sqlite_*` prefix).
- [x] **Audit failure message style?** → **Diff-style** ("missing: …,
  unexpected: …") so the failing CI run tells the author exactly
  what to do.

## Out of scope / deferred

- Schema migrations table (a future spec 048 if/when we want it).
- Per-column type / default / nullability snapshot testing.
- A `/api/schema` introspection endpoint.
- Migrating settings (theme / cloud / language) into a `configs`
  table. They live in browser localStorage by design — that's the
  shape the visualizer needs.
- Promoting tools into a real `tools` table. Tools are MCP code
  definitions; making them DB-backed would be a much bigger spec.
- Pretty-printing the ERD as a generated SVG.
