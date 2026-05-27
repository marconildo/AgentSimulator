"""PDF ingestion: extract -> chunk + tokenize -> embed -> store (002, D4).

The pure text steps (extract / chunk / token-count) are keyless. The flow tests
(embed + store + retrieve) need real OpenAI embeddings and are marked
``@pytest.mark.openai``. Assertions are structural to tolerate model variability.
"""

import io
import uuid

import pytest

from app.rag.ingest import chunk_text
from app.rag.ingestion import (
    count_tokens,
    delete_document_vectors,
    extract_pdf_text,
    ingest_pdf,
)
from app.rag.retriever import retrieve
from app.rag.store import get_vectorstore
from app.trace import TraceEmitter


def make_pdf(paragraphs: list[str]) -> bytes:
    """A minimal, valid single-page PDF whose text pypdf can extract.

    One paragraph per text line; good enough to drive the real extract → chunk →
    embed → store path without pulling in a PDF-authoring dependency.
    """
    lines = ["BT", "/F1 12 Tf", "72 720 Td", "14 TL"]
    for i, p in enumerate(paragraphs):
        esc = p.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        if i > 0:
            lines.append("T*")
        lines.append(f"({esc}) Tj")
    lines.append("ET")
    content = "\n".join(lines).encode("latin-1")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref_pos = out.tell()
    n = len(objs) + 1
    out.write(b"xref\n0 %d\n" % n)
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (n, xref_pos))
    return out.getvalue()


# --- keyless: text extraction / chunking / tokenization (T10) ---------------


def test_extract_pdf_text_roundtrips():
    pdf = make_pdf(["Hello world from RAG.", "Embeddings are dense vectors."])
    text = extract_pdf_text(pdf)
    assert "Hello world from RAG." in text
    assert "Embeddings are dense vectors." in text


def test_chunk_and_token_counts_are_deterministic():
    pdf = make_pdf(["The quick brown fox.", "Jumps over the lazy dog."])
    text = extract_pdf_text(pdf)
    chunks = chunk_text(text)
    # The ingestion path chunks with exactly the corpus chunker.
    assert len(chunks) >= 1
    token_counts = [count_tokens(c) for c in chunks]
    assert len(token_counts) == len(chunks)
    assert all(n > 0 for n in token_counts)
    # tiktoken is deterministic: same text -> same count.
    assert count_tokens("The quick brown fox.") == count_tokens("The quick brown fox.")


# --- OpenAI: full ingest flow (T11) -----------------------------------------


@pytest.mark.openai
async def test_ingest_pdf_emits_stages_in_order_with_detail():
    # AC9 — chunk -> embed -> store, in order, each carrying its detail payload.
    sid = f"sess-{uuid.uuid4().hex}"
    did = uuid.uuid4().hex
    emitter = TraceEmitter("t", "upload")
    result = await ingest_pdf(
        make_pdf(["Vectors capture meaning.", "Cosine similarity ranks them."]),
        filename="notes.pdf",
        session_id=sid,
        document_id=did,
        emitter=emitter,
    )
    assert result["document_id"] == did
    assert result["chunk_count"] >= 1

    ends = [e for e in emitter.events if e.phase == "end"]
    order = [e.stage for e in ends if str(e.stage).startswith("rag.ingest")]
    assert order == ["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"]

    by_stage = {e.stage: e for e in ends}
    chunk = by_stage["rag.ingest.chunk"].data
    assert {
        "strategy",
        "chunk_size",
        "chunk_overlap",
        "num_chunks",
        "total_chars",
        "token_counts",
    } <= set(chunk)
    assert len(chunk["token_counts"]) == chunk["num_chunks"]

    embed = by_stage["rag.ingest.embed"].data
    assert embed["model"] and embed["dim"] > 0 and embed["num_vectors"] >= 1
    assert len(embed["preview"]) == 8

    store = by_stage["rag.ingest.store"].data
    assert store["document_id"] == did
    assert store["chunks_stored"] == result["chunk_count"]
    assert "session_id" in store["metadata_keys"] and "document_id" in store["metadata_keys"]

    delete_document_vectors(did)  # cleanup


@pytest.mark.openai
async def test_ingest_uploaded_reads_the_document_from_storage():
    # 034-storage-ingestion-flow AC4 — the indexer reads the stored object (it is
    # load-bearing): write to storage, ingest from it; remove it and ingestion has
    # nothing to read.
    from app.rag.ingestion import ingest_uploaded
    from app.storage.object_store import delete_object, object_key, put_object

    sid = f"sess-{uuid.uuid4().hex}"
    did = uuid.uuid4().hex
    key = object_key(sid, did, "notes.pdf")
    put_object(key, make_pdf(["Vectors capture meaning."]), "application/pdf")

    result = await ingest_uploaded(key, "notes.pdf", sid, did, TraceEmitter("t", "u"))
    assert result["document_id"] == did and result["chunk_count"] >= 1

    delete_object(key)  # the durable copy is gone
    with pytest.raises(FileNotFoundError):
        await ingest_uploaded(key, "notes.pdf", sid, uuid.uuid4().hex, TraceEmitter("t", "u"))

    delete_document_vectors(did)


@pytest.mark.openai
def test_upload_endpoint_stores_object_then_ingests_in_order():
    # 034-storage-ingestion-flow AC4 — the SSE upload emits storage.upload BEFORE
    # the rag.ingest.* stages, and the object lands in durable storage.
    import json

    from fastapi.testclient import TestClient

    from app.main import app
    from app.storage.object_store import delete_session_objects, storage_root

    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        pdf = make_pdf(["Cosine similarity ranks them."])
        order: list[str] = []
        current = None
        with client.stream(
            "POST",
            f"/api/sessions/{sid}/documents",
            files={"file": ("notes.pdf", pdf, "application/pdf")},
        ) as resp:
            assert resp.status_code == 200
            for line in resp.iter_lines():
                if line.startswith("event:"):
                    current = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and current == "trace":
                    ev = json.loads(line.split(":", 1)[1].strip())
                    if ev["phase"] == "end":
                        order.append(ev["stage"])

        assert "storage.upload" in order
        assert order.index("storage.upload") < order.index("rag.ingest.chunk")
        # The uploaded object really persisted under the session.
        from app.storage.object_store import _safe  # noqa: PLC0415

        assert (storage_root() / _safe(sid)).is_dir()
        delete_session_objects(sid)


@pytest.mark.openai
def test_delete_document_removes_its_stored_object():
    # 034-storage-ingestion-flow AC9 — deleting a document removes its stored
    # object (alongside its vectors + relational row).
    import json

    from fastapi.testclient import TestClient

    from app.main import app
    from app.storage.object_store import _safe, storage_root  # noqa: PLC0415

    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        pdf = make_pdf(["delete me from storage"])
        document_id = None
        current = None
        with client.stream(
            "POST",
            f"/api/sessions/{sid}/documents",
            files={"file": ("d.pdf", pdf, "application/pdf")},
        ) as resp:
            for line in resp.iter_lines():
                if line.startswith("event:"):
                    current = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and current == "done":
                    document_id = json.loads(line.split(":", 1)[1].strip())["document_id"]

        assert document_id
        doc_dir = storage_root() / _safe(sid) / _safe(document_id)
        assert doc_dir.is_dir()

        resp = client.delete(f"/api/sessions/{sid}/documents/{document_id}")
        assert resp.status_code == 200
        assert doc_dir.exists() is False


@pytest.mark.openai
async def test_ingest_tags_vectors_with_session_and_document():
    # AC2 — uploaded vectors are tagged session_id / document_id / corpus=False.
    sid = f"sess-{uuid.uuid4().hex}"
    did = uuid.uuid4().hex
    await ingest_pdf(
        make_pdf(["Retrieval augments generation."]),
        filename="a.pdf",
        session_id=sid,
        document_id=did,
        emitter=TraceEmitter("t", "u"),
    )
    got = get_vectorstore().get(where={"document_id": did})
    assert got["ids"], "expected stored vectors for the document"
    for md in got["metadatas"]:
        assert md["corpus"] is False
        assert md["session_id"] == sid
        assert md["document_id"] == did
        assert md["filename"] == "a.pdf"
    delete_document_vectors(did)


@pytest.mark.openai
async def test_delete_document_removes_only_its_vectors():
    # AC3 — deleting a document removes exactly its vectors; corpus + other docs intact.
    sid = f"sess-{uuid.uuid4().hex}"
    keep, drop = uuid.uuid4().hex, uuid.uuid4().hex
    await ingest_pdf(make_pdf(["Keep this around."]), "keep.pdf", sid, keep, TraceEmitter("t", "u"))
    await ingest_pdf(make_pdf(["Drop this one."]), "drop.pdf", sid, drop, TraceEmitter("t", "u"))

    store = get_vectorstore()
    corpus_before = len(store.get(where={"corpus": True})["ids"])

    removed = delete_document_vectors(drop)
    assert removed >= 1
    assert store.get(where={"document_id": drop})["ids"] == []  # gone
    assert store.get(where={"document_id": keep})["ids"]  # untouched
    assert len(store.get(where={"corpus": True})["ids"]) == corpus_before  # corpus untouched

    delete_document_vectors(keep)


@pytest.mark.openai
async def test_unified_retrieval_includes_session_and_excludes_others():
    # AC7 — a query in a session with PDFs returns a unified top-k over the corpus
    # AND that session's uploads, and never another session's uploads.
    sid_a = f"sess-{uuid.uuid4().hex}"
    sid_b = f"sess-{uuid.uuid4().hex}"
    did = uuid.uuid4().hex
    secret = "The Zorblax protocol communicates over port 8472."
    await ingest_pdf(make_pdf([secret]), "secret.pdf", sid_a, did, TraceEmitter("t", "u"))

    query = "What port does the Zorblax protocol use?"
    _, in_a = await retrieve(query, k=5, emitter=TraceEmitter("t", "q"), session_id=sid_a)
    _, in_b = await retrieve(query, k=5, emitter=TraceEmitter("t", "q"), session_id=sid_b)

    # Session A sees its own uploaded chunk...
    assert any(c.get("uploaded") and "Zorblax" in c["text"] for c in in_a)
    # ...session B must not see another session's upload.
    assert not any("Zorblax" in c["text"] for c in in_b)
    # ...and the base corpus is still retrievable in both (the filter is corpus OR session).
    assert in_b, "corpus chunks should still come back for a session with no uploads"

    delete_document_vectors(did)
