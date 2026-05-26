"""The application database is a real SQLite store, separate from the vector DB.

002-interactive-chat replaces the single global ``conversations`` table with
session-scoped ``sessions`` + ``messages`` + ``documents`` (D8). These tests are
keyless (pure SQLite) and pin the relational behavior the chat UI depends on.
"""

from app.db.store import ConversationStore


async def test_create_list_and_delete_sessions(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")

    assert await store.list_sessions() == []

    a = await store.create_session()
    b = await store.create_session()
    assert a["id"] != b["id"]

    sessions = await store.list_sessions()
    # AC5/AC6 — most-recent-first; the freshly created one leads.
    assert [s["id"] for s in sessions] == [b["id"], a["id"]]
    assert all("message_count" in s for s in sessions)
    assert sessions[0]["message_count"] == 0

    await store.delete_session(a["id"])
    assert [s["id"] for s in await store.list_sessions()] == [b["id"]]
    assert await store.get_session(a["id"]) is None


async def test_write_message_and_read_history_are_session_scoped(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    s1 = (await store.create_session())["id"]
    s2 = (await store.create_session())["id"]

    await store.write_message(s1, "m1", "What is RAG?", "RAG grounds an LLM.")
    await store.write_message(s1, "m2", "And embeddings?", "Vectors of meaning.")
    await store.write_message(s2, "m3", "Other thread", "Different answer.")

    h1 = await store.read_history(s1)
    assert h1["total_rows"] == 2
    # Oldest-first so it reads as a transcript.
    assert [r["message"] for r in h1["recent"]] == ["What is RAG?", "And embeddings?"]

    h2 = await store.read_history(s2)
    assert h2["total_rows"] == 1
    assert h2["recent"][-1]["answer"] == "Different answer."


async def test_message_chunks_round_trip(tmp_path):
    # D5 — each message persists the chunks retrieved for it.
    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]

    chunks = [
        {"text": "RAG retrieves context.", "source": "rag.md", "title": "RAG", "score": 0.91},
        {
            "text": "Embeddings are vectors.",
            "source": "embeddings.md",
            "title": "Emb",
            "score": 0.42,
        },
    ]
    await store.write_message(sid, "m1", "q", "a", chunks=chunks)

    msgs = await store.list_messages(sid)
    assert len(msgs) == 1
    assert msgs[0]["message"] == "q"
    assert msgs[0]["chunks"] == chunks  # JSON round-trips intact
    # A message stored without chunks defaults to an empty list.
    await store.write_message(sid, "m2", "q2", "a2")
    assert (await store.list_messages(sid))[-1]["chunks"] == []


async def test_first_message_sets_session_title(tmp_path):
    # D7 — a conversation is labeled by its first user message (truncated).
    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]
    assert (await store.get_session(sid))["title"] is None

    await store.write_message(sid, "m1", "What is RAG and how does retrieval work?", "…")
    title = (await store.get_session(sid))["title"]
    assert title and title.startswith("What is RAG")

    # A later message must not overwrite the title.
    await store.write_message(sid, "m2", "second message", "…")
    assert (await store.get_session(sid))["title"] == title


async def test_delete_session_cascades_to_messages_and_documents(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]
    await store.write_message(sid, "m1", "q", "a")
    await store.add_document(sid, "d1", "paper.pdf", chunk_count=7)

    assert len(await store.list_messages(sid)) == 1
    assert len(await store.list_documents(sid)) == 1

    await store.delete_session(sid)

    # Cascade: rows for the deleted session are gone (AC4 — DB side).
    assert await store.list_messages(sid) == []
    assert await store.list_documents(sid) == []


async def test_document_add_list_delete(tmp_path):
    # AC2/AC3 — DB side of document tracking (vector deletion is tested separately).
    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]

    await store.add_document(sid, "d1", "a.pdf", chunk_count=3)
    await store.add_document(sid, "d2", "b.pdf", chunk_count=5)

    docs = await store.list_documents(sid)
    assert {d["document_id"] for d in docs} == {"d1", "d2"}
    assert {d["filename"] for d in docs} == {"a.pdf", "b.pdf"}
    assert next(d for d in docs if d["document_id"] == "d2")["chunk_count"] == 5

    await store.delete_document(sid, "d1")
    assert {d["document_id"] for d in await store.list_documents(sid)} == {"d2"}


async def test_write_message_is_idempotent_per_id(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    sid = (await store.create_session())["id"]
    await store.write_message(sid, "dup", "hi", "a")
    await store.write_message(sid, "dup", "hi", "b")  # same id replaces, not appends
    assert (await store.read_history(sid))["total_rows"] == 1


async def test_ensure_session_is_lazy(tmp_path):
    # The chat endpoint lazy-creates a session when the client sends an unknown id.
    store = ConversationStore(tmp_path / "app.sqlite3")
    created = await store.ensure_session("client-chosen-id")
    assert created["id"] == "client-chosen-id"
    # Calling again is a no-op (does not duplicate).
    again = await store.ensure_session("client-chosen-id")
    assert again["id"] == "client-chosen-id"
    assert len(await store.list_sessions()) == 1
