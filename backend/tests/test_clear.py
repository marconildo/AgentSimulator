"""Clear databases — the global reset for both stores (025-clear-databases).

A single action wipes all relational history (every session/message/document)
and removes every user-imported chunk from the vector store, while keeping the
built-in corpus so retrieval still works. The relational assertions are keyless
(pure SQLite); the vector-store / endpoint assertions need real embeddings and
are marked ``@pytest.mark.openai``. Assertions are structural (counts,
membership, ``indexed``) to tolerate model variability.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.db.store import ConversationStore
from app.main import app
from app.rag.ingestion import delete_uploaded_vectors, ingest_pdf
from app.rag.store import get_vectorstore, is_indexed
from app.trace import TraceEmitter

# --- AC1 / AC4 (relational, keyless) ----------------------------------------


async def test_clear_all_wipes_all_relational_history(tmp_path):
    # AC1 — every session, its messages and its documents are removed, and the
    # row counts that were deleted are reported back.
    store = ConversationStore(tmp_path / "app.sqlite3")
    s1 = (await store.create_session())["id"]
    s2 = (await store.create_session())["id"]
    await store.write_message(s1, "m1", "q1", "a1")
    await store.write_message(s1, "m2", "q2", "a2")
    await store.write_message(s2, "m3", "q3", "a3")
    await store.add_document(s1, "d1", "a.pdf", chunk_count=3)

    result = await store.clear_all()

    # 044-shared-agent-catalog: no per-session clones anymore — the test creates
    # 2 sessions but they share the single default agent, so `agents_deleted` is
    # 1 (the default itself is wiped and immediately re-seeded after).
    assert result == {
        "sessions_deleted": 2,
        "messages_deleted": 3,
        "documents_deleted": 1,
        "skills_deleted": 0,
        "agents_deleted": 1,
        # 048-persist-traces: this test doesn't emit any trace events itself
        # (it bypasses the chat endpoint), so the count is 0 — but the key
        # must be present per 046's `EXPECTED_CLEAR_KEYS` contract.
        "trace_events_deleted": 0,
    }
    assert await store.list_sessions() == []
    assert await store.list_messages(s1) == []
    assert await store.list_documents(s1) == []


async def test_clear_all_is_safe_and_idempotent_on_empty_store(tmp_path):
    # AC4 (relational side) — clearing an empty store, or clearing twice, returns
    # all-zero counts and raises nothing.
    store = ConversationStore(tmp_path / "app.sqlite3")
    # On a fresh store the migration ran (which seeds the default agent), so
    # `agents_deleted` starts at 1; the clear re-seeds it, so the second call
    # sees the same shape. The other counts are 0 (no user data).
    first = await store.clear_all()
    assert first == {
        "sessions_deleted": 0,
        "messages_deleted": 0,
        "documents_deleted": 0,
        "skills_deleted": 0,
        "agents_deleted": 1,
        "trace_events_deleted": 0,
    }
    assert await store.clear_all() == first


# --- AC2 (vector store keeps the corpus) ------------------------------------


def test_delete_uploaded_vectors_is_keyless_safe(monkeypatch):
    """Regression — without an ``OPENAI_API_KEY`` the function must report 0
    removed instead of raising ``MissingAPIKeyError``.

    ``delete_uploaded_vectors`` is called by ``POST /api/data/clear`` (which has
    keyless tests of its own, e.g. ``test_agents_table.py::
    test_clear_data_reports_agents_and_reseeds``). Opening the Chroma store
    needs the embedding function, which needs a key — but conceptually, with no
    key the store can't have any uploads to delete, so 0 is the truthful answer
    and mirrors the resilience pattern in ``rag/store.py::is_indexed``.
    """
    from app.config import get_settings
    from app.rag import store as rag_store

    monkeypatch.setenv("OPENAI_API_KEY", "")
    get_settings.cache_clear()
    rag_store.reset_vectorstore_cache()
    try:
        assert delete_uploaded_vectors() == 0
    finally:
        get_settings.cache_clear()
        rag_store.reset_vectorstore_cache()


@pytest.mark.openai
async def test_delete_uploaded_vectors_removes_uploads_but_keeps_corpus():
    # AC2 — only corpus=False (user-imported) vectors are removed; every corpus
    # vector remains, so retrieval still works (is_indexed stays True).
    from tests.test_ingestion import make_pdf

    sid = f"sess-{uuid.uuid4().hex}"
    did = uuid.uuid4().hex
    await ingest_pdf(
        make_pdf(["Imported knowledge here."]), "x.pdf", sid, did, TraceEmitter("t", "u")
    )

    store = get_vectorstore()
    corpus_before = len(store.get(where={"corpus": True})["ids"])
    uploaded_before = len(store.get(where={"corpus": False})["ids"])
    assert corpus_before > 0 and uploaded_before >= 1

    removed = delete_uploaded_vectors()

    assert removed == uploaded_before
    assert store.get(where={"corpus": False})["ids"] == []  # every upload gone
    assert len(store.get(where={"corpus": True})["ids"]) == corpus_before  # corpus untouched
    assert is_indexed()


# --- AC3 / AC4 (endpoint over HTTP) -----------------------------------------


@pytest.mark.openai
def test_clear_data_endpoint_clears_both_stores_and_keeps_corpus():
    # AC3 — the endpoint reports the four counts; afterward the relational store
    # is empty but the corpus survives (still indexed).
    from tests.test_ingestion import make_pdf

    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        pdf = make_pdf(["Some uploaded content for the vector store."])
        with client.stream(
            "POST",
            f"/api/sessions/{sid}/documents",
            files={"file": ("u.pdf", pdf, "application/pdf")},
        ) as resp:
            assert resp.status_code == 200
            for _ in resp.iter_lines():
                pass
        assert len(client.get("/api/sessions").json()) >= 1

        resp = client.post("/api/data/clear")
        assert resp.status_code == 200
        body = resp.json()
        assert {
            "sessions_deleted",
            "messages_deleted",
            "documents_deleted",
            "vectors_removed",
            "objects_deleted",
        } <= set(body)
        assert body["sessions_deleted"] >= 1
        assert body["documents_deleted"] >= 1
        assert body["vectors_removed"] >= 1
        # 034-storage-ingestion-flow — clearing also wipes the stored objects.
        assert body["objects_deleted"] >= 1

        assert client.get("/api/sessions").json() == []  # relational wiped
        assert client.get("/api/health").json()["indexed"] is True  # corpus survived


@pytest.mark.openai
def test_clear_data_endpoint_is_idempotent_on_empty():
    # AC4 — a second clear over already-empty stores returns all zeros, no error.
    with TestClient(app) as client:
        client.post("/api/data/clear")  # ensure empty
        resp = client.post("/api/data/clear")
        assert resp.status_code == 200
        # 043-persisted-agent: the default agent is re-seeded between clears,
        # so the second clear wipes exactly 1 agent every time.
        assert resp.json() == {
            "sessions_deleted": 0,
            "messages_deleted": 0,
            "documents_deleted": 0,
            "skills_deleted": 0,
            "agents_deleted": 1,
            "vectors_removed": 0,
            "objects_deleted": 0,
            # 048-persist-traces: the post-clear empty state also reports 0
            # trace events (matches the endpoint's count keyset).
            "trace_events_deleted": 0,
        }
