"""The application database is a real SQLite store, separate from the vector DB."""

from app.db.store import ConversationStore


async def test_write_then_read_roundtrip(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")

    empty = await store.read_history()
    assert empty["total_rows"] == 0
    assert empty["recent"] == []

    write = await store.write("t1", "What is RAG?", "RAG grounds an LLM in retrieved docs.")
    assert write["operation"] == "INSERT"
    assert write["total_rows"] == 1

    history = await store.read_history()
    assert history["total_rows"] == 1
    assert "What is RAG?" in history["recent"]


async def test_write_is_idempotent_per_trace(tmp_path):
    store = ConversationStore(tmp_path / "app.sqlite3")
    await store.write("dup", "hi", "a")
    await store.write("dup", "hi", "b")  # same id replaces, not appends
    history = await store.read_history()
    assert history["total_rows"] == 1
