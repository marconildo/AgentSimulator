"""072-chunking-strategies: the read-only chunk-preview playground + config exposure.

AC4 (playground is read-only; `all` returns every strategy; fixed≠recursive) and AC8
(`/api/config` reports the active strategy + the available list) are keyless — they don't
embed or mutate the index. The `semantic`/`agentic` strategies need a key, so in `all` they
may come back with an `error` marker; the request still succeeds with all four entries.
"""

from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

from app.main import app
from app.rag.chunking import ChunkStrategy

# A document with long paragraphs, so fixed-size windows must cut where recursive wouldn't.
_LONG = ("Sentence one is here. " * 60) + "\n\n" + ("Second paragraph follows along. " * 60)


def test_chunk_preview_all_returns_every_strategy():
    with TestClient(app) as client:
        body = client.post("/api/rag/chunk-preview", json={"strategy": "all", "text": _LONG}).json()
    strategies = {p["strategy"] for p in body["previews"]}
    assert strategies == {s.value for s in ChunkStrategy}


def test_chunk_preview_fixed_differs_from_recursive():
    with TestClient(app) as client:
        body = client.post("/api/rag/chunk-preview", json={"strategy": "all", "text": _LONG}).json()
    by = {p["strategy"]: p for p in body["previews"]}
    fixed_texts = [c["text"] for c in by["fixed"]["chunks"]]
    recursive_texts = [c["text"] for c in by["recursive"]["chunks"]]
    assert fixed_texts != recursive_texts
    # Fixed offsets are exact slices of the source.
    assert all(c["chars"] == c["end"] - c["start"] for c in by["fixed"]["chunks"])


def test_chunk_preview_single_strategy():
    with TestClient(app) as client:
        body = client.post(
            "/api/rag/chunk-preview", json={"strategy": "fixed", "text": _LONG}
        ).json()
    assert len(body["previews"]) == 1
    assert body["previews"][0]["strategy"] == "fixed"
    assert body["previews"][0]["count"] >= 1


def test_chunk_preview_unknown_strategy():
    with TestClient(app) as client:
        body = client.post("/api/rag/chunk-preview", json={"strategy": "bogus"}).json()
    assert body["previews"] == []
    assert "error" in body


def test_config_reports_chunk_strategy_and_list():
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    assert body["chunk_strategy"] in {s.value for s in ChunkStrategy}
    assert set(body["chunk_strategies"]) == {s.value for s in ChunkStrategy}


async def test_reingest_streams_stages_and_updates_active():
    # AC5 — re-ingest emits chunk → embed → store in order, rebuilds via the proven
    # build_index(strategy) path, and updates the active-strategy readout. The actual Chroma
    # write IS build_index (covered by its own tests + conftest); here we mock build_index,
    # the embeddings and the vector store so this asserts reingest's ORCHESTRATION
    # deterministically — no Chroma churn (which can flake under repeated in-process rebuilds),
    # keyless, fast. The keyless metadata-tagging is pinned in test_chunking.py.
    from unittest.mock import MagicMock, patch

    from app.rag import ingest as ingest_mod
    from app.trace import TraceEmitter

    async def drain(emitter):
        events = []
        while True:
            e = await emitter.queue.get()
            if e is None:
                break
            events.append(e)
        return events

    fake_embeddings = MagicMock()
    fake_embeddings.embed_documents.return_value = [[0.1, 0.2, 0.3]]
    fake_store = MagicMock()
    fake_store._collection.count.return_value = 12

    original = ingest_mod._active_strategy
    try:
        with (
            patch.object(ingest_mod, "build_index", return_value=12) as mock_build,
            patch.object(ingest_mod, "get_embeddings", return_value=fake_embeddings),
            patch.object(ingest_mod, "get_vectorstore", return_value=fake_store),
        ):
            emitter = TraceEmitter("reindex-test", "reindex")
            drainer = asyncio.create_task(drain(emitter))
            await ingest_mod.reingest_corpus(ChunkStrategy.FIXED, emitter)
            await emitter.close()
            events = await drainer

        ingest_ends = [
            e.stage for e in events if e.phase == "end" and str(e.stage).startswith("rag.ingest.")
        ]
        assert ingest_ends == ["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"]
        # The store stage delegates to the proven build_index with the chosen strategy
        # and the applied params (081 defaults when none supplied).
        from app.rag.chunking import ChunkParams

        mock_build.assert_called_once_with(ChunkStrategy.FIXED, ChunkParams())
        # The chunk stage tagged the corpus with the chosen strategy and counted files.
        chunk_end = next(e for e in events if e.stage == "rag.ingest.chunk" and e.phase == "end")
        assert chunk_end.data["strategy"] == "fixed"
        assert chunk_end.data["num_chunks"] > 0
        assert ingest_mod.active_chunk_strategy() == "fixed"
    finally:
        ingest_mod._active_strategy = original
