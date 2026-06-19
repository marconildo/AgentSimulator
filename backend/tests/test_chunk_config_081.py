"""081-chunking-config: per-strategy chunking parameters over the API.

Keyless throughout — `fixed`/`recursive` need no key, and the validation/clamping +
`/api/config` exposure are pure. Semantic/agentic param *behavior* is pinned in
test_chunking.py (`@pytest.mark.openai`); here we assert the request plumbing + bounds.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.rag.chunking import CHUNK_PARAM_BOUNDS, ChunkStrategy

_LONG = ("Sentence one is here. " * 60) + "\n\n" + ("Second paragraph follows along. " * 60)


# --- AC1: /api/config exposes per-strategy param descriptors -----------------


def test_config_reports_chunk_params_bounds():
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    params = body["chunk_params"]
    assert set(params) == {s.value for s in ChunkStrategy}
    # Fixed exposes size + overlap, each with default/min/max.
    fixed = params["fixed"]
    assert set(fixed) == {"chunk_size", "chunk_overlap"}
    for spec in fixed.values():
        assert {"default", "min", "max"} <= set(spec)
        assert spec["min"] <= spec["default"] <= spec["max"]
    # Semantic exposes threshold + size; agentic exposes only max_segments.
    assert set(params["semantic"]) == {"semantic_threshold", "chunk_size"}
    assert set(params["agentic"]) == {"max_segments"}


# --- AC7: chunk-preview honors params ----------------------------------------


def test_chunk_preview_honors_chunk_size():
    with TestClient(app) as client:
        big = client.post(
            "/api/rag/chunk-preview",
            json={"strategy": "fixed", "text": _LONG, "params": {"chunk_size": 900}},
        ).json()
        small = client.post(
            "/api/rag/chunk-preview",
            json={"strategy": "fixed", "text": _LONG, "params": {"chunk_size": 200}},
        ).json()
    assert small["previews"][0]["count"] > big["previews"][0]["count"]


# --- AC6: reindex applies + reports params; omitting reproduces 072 ----------


async def test_reindex_reports_applied_params():
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

    import asyncio

    fake_embeddings = MagicMock()
    fake_embeddings.embed_documents.return_value = [[0.1, 0.2, 0.3]]
    fake_store = MagicMock()
    fake_store._collection.count.return_value = 9

    original = ingest_mod._active_strategy
    try:
        with (
            patch.object(ingest_mod, "build_index", return_value=9),
            patch.object(ingest_mod, "get_embeddings", return_value=fake_embeddings),
            patch.object(ingest_mod, "get_vectorstore", return_value=fake_store),
        ):
            from app.rag.chunking import ChunkParams

            emitter = TraceEmitter("reindex-081", "reindex")
            drainer = asyncio.create_task(drain(emitter))
            await ingest_mod.reingest_corpus(
                ChunkStrategy.FIXED, emitter, params=ChunkParams(chunk_size=300, chunk_overlap=20)
            )
            await emitter.close()
            events = await drainer
        chunk_end = next(e for e in events if e.stage == "rag.ingest.chunk" and e.phase == "end")
        assert chunk_end.data["chunk_size"] == 300
        assert chunk_end.data["chunk_overlap"] == 20
    finally:
        ingest_mod._active_strategy = original


# --- AC8: out-of-bounds params are rejected (422) ----------------------------


def test_reindex_rejects_out_of_bounds_param():
    too_big = CHUNK_PARAM_BOUNDS[ChunkStrategy.FIXED]["chunk_size"][2] + 1
    with TestClient(app) as client:
        resp = client.post(
            "/api/rag/reindex",
            json={"strategy": "fixed", "params": {"chunk_size": too_big}},
        )
    assert resp.status_code == 422


def test_preview_rejects_out_of_bounds_param():
    with TestClient(app) as client:
        resp = client.post(
            "/api/rag/chunk-preview",
            json={"strategy": "fixed", "text": _LONG, "params": {"chunk_overlap": 99999}},
        )
    assert resp.status_code == 422
