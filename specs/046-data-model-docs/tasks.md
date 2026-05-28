# Tasks: Data-model documentation + schema-audit guard

> Pure docs + tests. Order = TDD (test first, doc/code second). Each
> "test first" step is `red` — the test will fail because the file or
> behaviour it asserts isn't there yet. The next step turns it green.

## Tasks

### Schema-audit guard (AC4, AC5, AC1, AC2, AC3)

- [ ] **T1 — test first**: create `backend/tests/test_schema_audit.py`
      with `test_schema_tables_exactly_match_documented_set` (AC4).
      Pin `EXPECTED_TABLES = {"sessions", "agents", "messages",
      "documents", "message_documents", "skills"}` with a comment
      pointing at `docs/data-model.md`. Read `sqlite_master`, filter
      `sqlite_*`, assert equality with a diff-style message.
      → **red** (file might already pass if the schema is the
      expected set; we deliberately also write the other tests below
      that DO start red).
- [ ] **T2 — test first**: in the same file, add
      `test_docs_data_model_present` (AC1) — asserts
      `(repo_root / "docs/data-model.md").exists()` and the file
      mentions every table name from `EXPECTED_TABLES`. Also asserts
      the strings "ERD" + "What's NOT a table" appear.
      → **red** (doc doesn't exist yet).
- [ ] **T3 — test first**: add `test_claude_md_links_data_model` (AC2)
      — asserts `"docs/data-model.md"` appears in
      `(repo_root / "CLAUDE.md").read_text()`.
      → **red**.
- [ ] **T4 — test first**: add
      `test_store_docstring_references_data_model` (AC3) — asserts
      `"docs/data-model.md"` appears in
      `app.db.store.__doc__`.
      → **red**.
- [ ] **T5 — implement**: write `docs/data-model.md`:
      - 1-paragraph intro: "this is the schema for the SQLite
        relational store; for the Chroma vector store see
        `architecture.md`".
      - Mermaid `erDiagram` showing the 6 tables + FKs (which CASCADE,
        which don't).
      - ASCII fallback ERD beneath (in a fenced code block).
      - One section per table, in order: sessions, agents, messages,
        documents, message_documents, skills. Each lists every column
        with type + nullability + one-line meaning.
      - "Relationships + cascade rules" section enumerating: session
        → messages (CASCADE), session → documents (CASCADE), message
        ↔ message_documents → documents (CASCADE both sides), session
        → agents (no cascade today; SET NULL after 047).
      - "What's NOT a table" section calling out tools (MCP code in
        `backend/app/mcp/server.py`; `agents.enabled_tools` is a JSON
        name-list) and configs (env via pydantic `Settings` +
        browser localStorage).
      - "How `clear_all` wipes everything" — bullet trace through
        `documents → messages → sessions → skills → agents → re-seed
        default`, plus the Chroma + object-store side via
        `delete_uploaded_vectors` + `clear_objects`.
      → T2 turns **green**.
- [ ] **T6 — implement**: append a one-line bullet to the **Docs**
      section of `CLAUDE.md` pointing at `docs/data-model.md`.
      → T3 turns **green**.
- [ ] **T7 — implement**: add a one-line pointer to
      `backend/app/db/store.py` module docstring (e.g.
      *"Canonical schema reference: `docs/data-model.md`."*).
      → T4 turns **green**. T1 stays green (the schema is the
      expected set today).

### Clear-coverage guard (AC6, AC7, AC8)

- [ ] **T8 — test first**: create
      `backend/tests/test_clear_coverage.py` with
      `test_clear_all_zeroes_every_user_data_table` (AC6). Seed: one
      session, one message, one document, one message_documents link
      (via `write_message(attached_document_ids=[…])`), one skill, one
      non-default agent (via `create_agent`). Call `clear_all`. Assert
      every user-data table is empty EXCEPT `agents` which has exactly
      one row matching `DEFAULT_AGENT_ID`.
      → **red** if you imagine a future broken `clear_all`; **green**
      against today's code (this is a *regression guard*, by design).
- [ ] **T9 — test first**: add
      `test_clear_all_return_shape_is_exactly_documented` (AC7) —
      pins `EXPECTED_CLEAR_KEYS = {"sessions_deleted", "messages_deleted",
      "documents_deleted", "skills_deleted", "agents_deleted"}` and
      asserts `set(await store.clear_all().keys()) == EXPECTED_CLEAR_KEYS`.
      Diff-style failure.
      → **green** against today's code; flips to **red** the moment a
      future spec adds a table and forgets a count key.
- [ ] **T10 — test first**: add
      `test_clear_all_reseeds_default_agent_correctly` (AC8) — after
      `clear_all`, the single `agents` row has `id = DEFAULT_AGENT_ID`,
      `is_default = 1`, `name = DEFAULT_AGENT_NAME`,
      `system_prompt == GUARDRAILS_PROMPT`,
      `agent_prompt == AGENT_PROMPT`.
      → **green** against today's code (regression guard for the
      re-seed path).
- [ ] **T11 — verify**: run `pytest -q backend/tests/test_clear_coverage.py
      backend/tests/test_schema_audit.py` — all 7 tests green; no
      production code change needed.

### Quality gate (AC9, AC10)

- [ ] **T12 — gate**: `ruff check backend/` clean,
      `ruff format backend/` no-op,
      `pytest -q` green end-to-end (with `OPENAI_API_KEY` set).
- [ ] **T13 — memory + status**: bump `MEMORY.md` pointer for spec 046
      to "DONE & green" with the test counts; update the spec's
      `Status` to `done`.

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to a passing test
      (AC1–AC8) or is covered by gates (AC9, AC10).
- [ ] `ruff check .` clean.
- [ ] `pytest -q` green (real `OPENAI_API_KEY`; the new tests are all
      keyless and run regardless).
- [ ] `npm run build` unaffected (no FE changes; no need to re-run, but
      double-check no doc-link drift broke anything).
- [ ] Protocol mirror unchanged (`schemas.py` ↔ `events.ts`); no new
      Stage to map to a station.
- [ ] No new user-facing text (en + pt unchanged).
- [ ] `spec.md` status updated to `done`.
- [ ] Memory pointer for 046 updated to reflect completion.
