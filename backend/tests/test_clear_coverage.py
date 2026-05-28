"""Clear-coverage guard (046-data-model-docs).

The contract: ``ConversationStore.clear_all`` wipes every user-data
table and reports a count key per table in its return shape. This file
encodes that contract as two pinned constants + regression tests so a
future PR that adds a new table without extending ``clear_all`` (or
forgets to wipe an existing one) fails CI.

Pinned constants live at the top with a comment pointing at
``docs/data-model.md`` — the same "what to update when this fails"
path the schema-audit test surfaces.
"""

from __future__ import annotations

import sqlite3

from app.agent.prompts import AGENT_PROMPT, GUARDRAILS_PROMPT
from app.db.store import (
    DEFAULT_AGENT_ID,
    DEFAULT_AGENT_NAME,
    ConversationStore,
)

# Every user-data table the `clear_all` contract pins. `message_documents`
# is implicit via CASCADE — it has no `<table>_deleted` count key (its
# rows are dropped when the parent message or document goes); AC6 checks
# its emptiness directly via SELECT COUNT(*).
# Update this AND `docs/data-model.md` in the same PR when the schema
# changes.
EXPECTED_CLEAR_KEYS: set[str] = {
    "sessions_deleted",
    "messages_deleted",
    "documents_deleted",
    "skills_deleted",
    "agents_deleted",
    # 048-persist-traces: every emitted event persists; the global reset wipes
    # them too. The CASCADE from `sessions.id` would cover most rows, but the
    # explicit count is the contract surface for the FE / future tooling.
    "trace_events_deleted",
}


async def _seed_one_of_everything(store: ConversationStore) -> str:
    """Insert at least one row in every user-data table; return the
    session id for any follow-up reads."""
    session = await store.create_session()
    sid = session["id"]
    # 040-message-attachments: a real attachment join — link a document to
    # the message that "introduced" it so the cascade path is exercised.
    await store.add_document(sid, "doc-1", "a.pdf", chunk_count=2)
    await store.write_message(
        sid,
        "msg-1",
        "hello",
        "hi back",
        chunks=[{"text": "x", "score": 0.9}],
        skills=["s1"],
        attached_document_ids=["doc-1"],
    )
    await store.create_skill("s1", "a skill", "the body")
    # 044-shared-agent-catalog: at least one non-default agent so the
    # delete-all path is exercised; the default is re-seeded after.
    await store.create_agent(name="Test Agent", description="audited")
    # 048-persist-traces: at least one row in `trace_events` so the cleanup
    # contract test exercises the new column too.
    await store.write_trace_event(
        {
            "trace_id": "msg-1",
            "seq": 1,
            "ts": 0.0,
            "session_id": sid,
            "stage": "backend",
            "phase": "end",
            "label": "",
            "data": {},
            "metrics": {},
        }
    )
    return sid


def _count_rows(db_path, table: str) -> int:
    with sqlite3.connect(db_path) as conn:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]


async def test_clear_all_zeroes_every_user_data_table(tmp_path):
    """AC6 — after `clear_all`, every user-data table is empty EXCEPT
    `agents`, which has exactly one row (the re-seeded default)."""
    path = tmp_path / "clear.sqlite3"
    store = ConversationStore(path)
    await _seed_one_of_everything(store)

    # Sanity-check the seed actually populated things.
    assert _count_rows(path, "sessions") >= 1
    assert _count_rows(path, "messages") >= 1
    assert _count_rows(path, "documents") >= 1
    assert _count_rows(path, "message_documents") >= 1
    assert _count_rows(path, "skills") >= 1
    assert _count_rows(path, "agents") >= 2  # default + the test agent
    assert _count_rows(path, "trace_events") >= 1

    await store.clear_all()

    assert _count_rows(path, "sessions") == 0
    assert _count_rows(path, "messages") == 0
    assert _count_rows(path, "documents") == 0
    assert _count_rows(path, "message_documents") == 0  # cascade
    assert _count_rows(path, "skills") == 0
    assert _count_rows(path, "trace_events") == 0
    # Default re-seeded → exactly one agent row left.
    assert _count_rows(path, "agents") == 1


async def test_clear_all_return_shape_is_exactly_documented(tmp_path):
    """AC7 — the dict returned by `clear_all` has *exactly* the
    documented keys. Diff-style failure so a future PR that forgets a
    new table's count key tells the author what to add."""
    store = ConversationStore(tmp_path / "shape.sqlite3")
    await _seed_one_of_everything(store)

    result = await store.clear_all()
    keys = set(result.keys())
    missing = EXPECTED_CLEAR_KEYS - keys
    unexpected = keys - EXPECTED_CLEAR_KEYS
    assert not missing and not unexpected, (
        f"clear_all return-shape drift — update `EXPECTED_CLEAR_KEYS` + "
        f"`docs/data-model.md` together.\n"
        f"  missing: {sorted(missing)}\n"
        f"  unexpected: {sorted(unexpected)}"
    )
    # Each count is a non-negative int (would catch a tuple/None regression).
    for k, v in result.items():
        assert isinstance(v, int) and v >= 0, f"{k} should be a non-negative int, got {v!r}"


async def test_clear_all_reseeds_default_agent_correctly(tmp_path):
    """AC8 — exactly one `agents` row after clear_all, matching the
    seed constants (id, is_default flag, name, prompts)."""
    path = tmp_path / "reseed.sqlite3"
    store = ConversationStore(path)
    await _seed_one_of_everything(store)
    await store.clear_all()

    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT id, name, system_prompt, agent_prompt, is_default FROM agents"
        ).fetchall()
    assert len(rows) == 1
    row = rows[0]
    assert row["id"] == DEFAULT_AGENT_ID
    assert row["name"] == DEFAULT_AGENT_NAME
    assert row["system_prompt"] == GUARDRAILS_PROMPT
    assert row["agent_prompt"] == AGENT_PROMPT
    assert row["is_default"] == 1
