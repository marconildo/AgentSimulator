# Plan: Data-model documentation + schema-audit guard

> Pure docs + tests. **No schema change**, no API change, no FE change.
> Bumps the test count, not the constraint count. Foundation for 047.

## Approach

Two artefacts, three test files:

1. **`docs/data-model.md`** — written once, by hand, mirroring the style of
   `docs/architecture.md` (developer reference, English, real headings,
   short paragraphs). The ERD is a Mermaid `erDiagram` block (GitHub
   renders it natively; an ASCII fallback below for terminals).
2. **`backend/tests/test_schema_audit.py`** — introspects `sqlite_master`
   on a fresh store + asserts the table set is exactly the pinned
   constant. Diff-style failure message so a drift PR's CI log tells the
   author *exactly* what to do.
3. **`backend/tests/test_clear_coverage.py`** — seeds one row in every
   user-data table (including a non-default agent + a message_documents
   link) then calls `clear_all` and asserts: (a) every user-data table
   is empty (default agent re-seeded → `agents` = 1); (b) the return
   shape has exactly the documented `<table>_deleted` keys.

Alternative considered + rejected: a generated SVG of the ERD. Too much
toolchain for too little signal — Mermaid in Markdown is enough.

## Affected files

**Documentation (new)**
- `docs/data-model.md` — the new authoritative reference.

**Documentation (touch)**
- `CLAUDE.md` — one bullet under the existing "Docs" section pointing at
  the new file.
- `backend/app/db/store.py` — one-line pointer in the module docstring
  to `docs/data-model.md` ("Canonical schema reference: …").

**Backend tests (new)**
- `backend/tests/test_schema_audit.py` — the CI guard against table-set
  drift.
- `backend/tests/test_clear_coverage.py` — the CI guard against
  cleanup omissions.

**Backend code**
- None. (No production code changes.)

**Frontend**
- None.

## Protocol changes (constitution §1)

None. No new `Stage`, no `TraceEvent` shape change, no endpoint.

## Data model changes

None. The schema is unchanged. This spec *describes* the schema; spec
047 changes it.

## i18n strings (constitution §4)

None. `docs/data-model.md` is developer reference (English-only, same
as `architecture.md`, `how-it-works.md`, `roadmap.md`). The bilingual
rule (§4) covers user-visible UI prose.

| key / location | en | pt |
|---|---|---|
| — | — | — |

## Cloud map (constitution §5)

n/a — no new tier or station.

## Test strategy (constitution §9 — TDD)

Each acceptance criterion maps to at least one test. Order = TDD order
(test first, then implement; for docs, "implement" means "write the
file the test asserts exists").

| AC | Test | File |
|---|---|---|
| AC1 — data-model.md exists with ERD + per-table sections | `test_docs_data_model_present` | `backend/tests/test_schema_audit.py` |
| AC2 — CLAUDE.md links to data-model.md | `test_claude_md_links_data_model` | `backend/tests/test_schema_audit.py` |
| AC3 — store.py docstring references data-model.md | `test_store_docstring_references_data_model` | `backend/tests/test_schema_audit.py` |
| AC4 — table set is exactly the documented set | `test_schema_tables_exactly_match_documented_set` | `backend/tests/test_schema_audit.py` |
| AC5 — expected-set constant carries a comment pointing at the doc | by inspection of AC4's constant; covered by AC4 |
| AC6 — clear_all zeroes every user-data table | `test_clear_all_zeroes_every_user_data_table` | `backend/tests/test_clear_coverage.py` |
| AC7 — clear_all returns exactly the documented count keys | `test_clear_all_return_shape_is_exactly_documented` | `backend/tests/test_clear_coverage.py` |
| AC8 — default agent re-seeded with the right id + flag | `test_clear_all_reseeds_default_agent_correctly` | `backend/tests/test_clear_coverage.py` |
| AC9 — ruff + pytest green | CI gate; no specific test |
| AC10 — no Stage/Phase/protocol change | covered by AC4 (table set) + AC7 (return shape); no protocol mirror needed |

Pinned constants live at the top of each test file with a comment
pointing at `docs/data-model.md` so the "what to update when this fails"
path is in the failing message.

Failure messages (AC4 + AC7) use Python `set` diffs:
`missing: {…}, unexpected: {…}` — readable in CI logs without scrolling.

## Risks / trade-offs

- **Doc rot.** `docs/data-model.md` could drift from reality if a future
  PR adds a column without updating the doc. The audit test catches
  *new tables* but not *new columns*. Acceptable trade-off — column
  drift is caught by the existing per-feature tests (each spec writes
  tests that touch its new columns). If column drift becomes a problem,
  spec 048 (real `schema_migrations` table) can extend the audit.
- **`sqlite_sequence` filter.** SQLite auto-creates `sqlite_sequence`
  on the first `AUTOINCREMENT`. Our schema uses TEXT PRIMARY KEYs so
  it never appears today, but the audit filters anything starting with
  `sqlite_` just to be safe — documented in the test.
- **Mermaid rendering.** GitHub renders Mermaid; some Markdown viewers
  don't. Include an ASCII fallback ERD below the Mermaid block so the
  doc is readable in either world.
- **Test isolation.** Both new test files create their own
  `ConversationStore(tmp_path / "x.sqlite3")` — they don't touch the
  shared throwaway DB from `conftest.py`, so order-independence is
  free.
- **AC3 wording.** The "store.py docstring references the doc" test
  asserts the literal string `docs/data-model.md` appears in the
  module's `__doc__`. If we ever rename the doc, both fail at once
  → forcing the cross-reference to stay in sync.
