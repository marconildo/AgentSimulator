"""070-hybrid-search: the BM25 sparse lane + RRF fusion, opt-in per request.

Retrieval-level tests (deterministic order — they drive ``rag_retrieve`` directly). Embeddings
need a real key (the dense lane), so the module is ``@pytest.mark.openai``; BM25 + RRF
themselves need no key (covered standalone in test_hybrid_unit.py).

Guarantees under test:
  - AC4 (off guard): ``hybrid`` omitted/False NEVER emits ``rag.hybrid`` — byte-for-byte with
    today (with or without rerank).
  - AC1: ``hybrid=True`` emits one ``rag.hybrid`` START/END ordered AFTER ``rag.search`` and
    BEFORE ``rag.rerank``/``rag.retrieve``.
  - AC2: BM25 is real — a query built around an exact rare corpus token (``HNSW``) ranks that
    chunk #1 in the sparse lane, and fusion can only pull it up (never below its vector rank).
  - AC3: composes with rerank — order is embed → search → hybrid → rerank → retrieve, and the
    reranker scores the FUSED pool.
"""

import asyncio

import pytest

from app.rag.retriever import retrieve as rag_retrieve
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai

_Q = "Why does chunk size matter in a RAG pipeline, and what is top-k?"
# A query built around an exact, rare token that lives in exactly one corpus chunk.
_Q_RARE = "What is HNSW?"


async def _collect(make_coro, query=_Q):
    emitter = TraceEmitter("test", query)

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    result = await make_coro(emitter)
    await emitter.close()
    return result, await drainer


def _rag_end_stages(events):
    return [e.stage for e in events if e.phase == "end" and str(e.stage).startswith("rag.")]


async def test_off_emits_no_hybrid():
    # AC4 — hybrid off is byte-for-byte: embed → search → retrieve, no rag.hybrid.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.retrieve"]
    assert all(e.stage != "rag.hybrid" for e in events)


async def test_off_with_rerank_unchanged():
    # AC4 — hybrid omitted while reranking: still no rag.hybrid in the sequence.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em, rerank=True))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.rerank", "rag.retrieve"]
    assert all(e.stage != "rag.hybrid" for e in events)


async def test_hybrid_stage_fires_in_order():
    # AC1 — hybrid fires exactly once, after search and before retrieve.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em, hybrid=True))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.hybrid", "rag.retrieve"]
    starts = [e for e in events if e.stage == "rag.hybrid" and e.phase == "start"]
    assert len(starts) == 1


async def test_hybrid_end_carries_fusion_movement():
    # AC1/AC2 — the rag.hybrid END exposes per-candidate fusion (vector/bm25 rank + rrf score).
    (_context, _chunks), events = await _collect(lambda em: rag_retrieve(_Q, 4, em, hybrid=True))
    hybrid_end = next(e for e in events if e.stage == "rag.hybrid" and e.phase == "end")
    movement = hybrid_end.data["candidates"]
    assert movement, "rag.hybrid END must list the fused candidates"
    assert all({"vector_rank", "bm25_rank", "rrf_score", "new_rank"} <= set(m) for m in movement)
    assert hybrid_end.data["rrf_k"] == 60
    # At least one candidate is ranked by the sparse lane (BM25 actually ran).
    assert any(m["bm25_rank"] is not None for m in movement)


async def test_bm25_rare_token_surfaces_chunk():
    # AC2 — BM25 is real: the chunk containing the exact rare token "HNSW" is ranked #1 by the
    # sparse lane and survives fusion into the grounding; fusion never demotes it below its
    # dense rank (a #1 BM25 contribution can only help).
    (_context, chunks), _events = await _collect(
        lambda em: rag_retrieve(_Q_RARE, 8, em, hybrid=True), query=_Q_RARE
    )
    hnsw = next((c for c in chunks if "HNSW" in c["text"]), None)
    assert hnsw is not None, "the exact-token chunk should survive fusion into the top-k"
    assert hnsw["bm25_rank"] == 1, "BM25 must rank the only exact-token chunk first"
    if hnsw["vector_rank"] is not None:
        assert hnsw["rank"] <= hnsw["vector_rank"]


async def test_hybrid_then_rerank_order_and_pool():
    # AC3 — hybrid composes with rerank: order is embed → search → hybrid → rerank → retrieve,
    # and the reranker scores the FUSED pool (its movement covers the fused candidates).
    (_context, _chunks), events = await _collect(
        lambda em: rag_retrieve(_Q, 3, em, hybrid=True, rerank=True)
    )
    assert _rag_end_stages(events) == [
        "rag.embed",
        "rag.search",
        "rag.hybrid",
        "rag.rerank",
        "rag.retrieve",
    ]
    hybrid_end = next(e for e in events if e.stage == "rag.hybrid" and e.phase == "end")
    rerank_end = next(e for e in events if e.stage == "rag.rerank" and e.phase == "end")
    # The reranker's input pool is the fused set, so its movement count matches the fused count.
    assert len(rerank_end.data["candidates"]) == len(hybrid_end.data["candidates"])
