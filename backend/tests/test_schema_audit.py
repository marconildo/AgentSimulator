"""Schema-audit guard (046-data-model-docs).

A small set of CI-level guards over the relational store's *shape*. The
two properties pinned here are:

1. The set of user tables in the SQLite database matches the documented
   set exactly. A future PR that adds a table without updating the
   docs + this constant fails CI loudly.
2. ``docs/data-model.md`` exists and is cross-referenced from
   ``CLAUDE.md`` + ``app/db/store.py``'s module docstring, so anyone
   touching the schema sees the same authoritative reference.

Failure messages are diff-style (``missing: {…}, unexpected: {…}``) so
the failing CI run tells the author exactly what to fix.

Pinned constant: **`EXPECTED_TABLES`** — update *together* with
``docs/data-model.md`` when the schema changes. Either side moving
without the other is a bug.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import app.db.store as store_module
from app.db.store import ConversationStore

# The canonical user-data table set. Update this AND `docs/data-model.md`
# in the same PR when the schema changes; the audit fails otherwise.
EXPECTED_TABLES: set[str] = {
    "sessions",
    "agents",
    "messages",
    "documents",
    "message_documents",
    "skills",
    # 048-persist-traces: every `TraceEvent` lives in a real SQLite table now,
    # so the in-memory `TraceStore` is just a fast cache layered over this.
    "trace_events",
}

# Repo root = backend/tests/<this>.py → up two levels → backend/ → up one more → repo.
_REPO_ROOT = Path(__file__).resolve().parents[2]


def _list_user_tables(db_path: Path) -> set[str]:
    """Return every non-``sqlite_*`` table name in the DB.

    SQLite auto-creates internal tables like ``sqlite_sequence`` on the
    first ``AUTOINCREMENT``. Our schema uses TEXT primary keys so it
    never appears today, but the filter is belt-and-braces.
    """
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    return {name for (name,) in rows if not name.startswith("sqlite_")}


def test_schema_tables_exactly_match_documented_set(tmp_path):
    """AC4 — drift in either direction (new undocumented table OR a
    table accidentally dropped) fails with a diff-style message."""
    ConversationStore(tmp_path / "audit.sqlite3")  # triggers schema + migration
    actual = _list_user_tables(tmp_path / "audit.sqlite3")
    missing = EXPECTED_TABLES - actual
    unexpected = actual - EXPECTED_TABLES
    assert not missing and not unexpected, (
        f"schema drift detected — update `EXPECTED_TABLES` + "
        f"`docs/data-model.md` together.\n"
        f"  missing: {sorted(missing)}\n"
        f"  unexpected: {sorted(unexpected)}"
    )


def test_docs_data_model_present():
    """AC1 — ``docs/data-model.md`` exists and names every documented
    table; mentions ERD + ``What's NOT a table`` to keep the section
    set stable."""
    doc = _REPO_ROOT / "docs" / "data-model.md"
    assert doc.exists(), f"missing canonical schema doc at {doc}"
    text = doc.read_text(encoding="utf-8")
    missing = {t for t in EXPECTED_TABLES if t not in text}
    assert not missing, f"docs/data-model.md does not mention: {sorted(missing)}"
    assert "ERD" in text, "docs/data-model.md must include an ERD section"
    assert "What's NOT a table" in text, (
        "docs/data-model.md must include a 'What's NOT a table' section "
        "disambiguating tools (MCP code) + configs (env / localStorage)"
    )


def test_claude_md_links_data_model():
    """AC2 — ``CLAUDE.md`` cross-references the canonical doc so anyone
    landing on the repo's onboarding file finds the schema reference."""
    claude_md = _REPO_ROOT / "CLAUDE.md"
    assert claude_md.exists()
    assert "docs/data-model.md" in claude_md.read_text(encoding="utf-8"), (
        "CLAUDE.md must link to docs/data-model.md (under the Docs section)"
    )


def test_store_docstring_references_data_model():
    """AC3 — the store's module docstring points at the canonical
    reference so future readers don't reinvent the table set."""
    docstring = store_module.__doc__ or ""
    assert "docs/data-model.md" in docstring, (
        "app/db/store.py module docstring must reference docs/data-model.md "
        "as the canonical schema reference"
    )
