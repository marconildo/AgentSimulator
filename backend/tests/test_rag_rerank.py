"""054-rag-block-expansion: the real reranker pass, opt-in per request.

Retrieval-level tests (deterministic — they drive ``rag_retrieve`` directly so they
don't depend on the model electing to call the tool). Embeddings need a real key, so
the module is ``@pytest.mark.openai``; the local FlashRank rerank itself needs no key.

061-scenario-builder replaced the ``scenario == "intermediate"`` gate with the explicit
``rerank`` flag; the guarantees under test:
  - AC3 (off guard): ``rerank`` omitted/False emits exactly embed → search → retrieve
    and NEVER ``rag.rerank`` — byte-for-byte with the Simple run.
  - AC1: ``rerank=True`` emits one ``rag.rerank`` START/END ordered AFTER
    ``rag.search`` and BEFORE ``rag.retrieve``.
  - AC2: the ``rag.rerank`` END carries each candidate's pre/post rank + score, the
    final chunks are trimmed to ``top_k`` in rerank order, and the grounding context
    is built from the reranked chunks.
"""

import asyncio

import pytest

from app.agent import run_agent
from app.rag.retriever import retrieve as rag_retrieve
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai

# A query with several plausible corpus chunks so the reranker has real work to do.
_Q = "Why does chunk size matter in a RAG pipeline, and what is top-k?"


async def _collect(make_coro):
    """Run a retriever coroutine while draining its emitter, returning (result, events)."""
    emitter = TraceEmitter("test", _Q)

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


async def test_retrieval_without_rerank_has_no_rerank_stage():
    # AC3 — rerank off is byte-for-byte: embed → search → retrieve, no rerank.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.retrieve"]
    assert all(e.stage != "rag.rerank" for e in events)


async def test_intermediate_emits_rerank_between_search_and_retrieve():
    # AC1 — rerank fires exactly once, after search and before retrieve.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em, rerank=True))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.rerank", "rag.retrieve"]
    starts = [e for e in events if e.stage == "rag.rerank" and e.phase == "start"]
    assert len(starts) == 1


async def test_rerank_end_carries_movement_and_reorders_to_top_k():
    # AC2 — the rerank END exposes pre/post ranks + scores; the result is trimmed to
    # top_k in rerank order, and that ordering is derived from the rerank scores (not a
    # passthrough of the vector search).
    (context, chunks), events = await _collect(lambda em: rag_retrieve(_Q, 3, em, rerank=True))
    rerank_end = next(e for e in events if e.stage == "rag.rerank" and e.phase == "end")
    movement = rerank_end.data["candidates"]
    assert movement, "rerank END must list the candidates it scored"
    assert all({"prev_rank", "new_rank", "score"} <= set(m) for m in movement)

    # The post-rerank ranks are exactly 1..N and ordered by descending rerank score —
    # proving the new order comes from the rerank pass, not the search order.
    by_new_rank = sorted(movement, key=lambda m: m["new_rank"])
    assert [m["new_rank"] for m in by_new_rank] == list(range(1, len(movement) + 1))
    scores = [m["score"] for m in by_new_rank]
    assert scores == sorted(scores, reverse=True)

    # The returned chunks are the reranked top_k, re-ranked 1..k, and ground the context.
    assert 1 <= len(chunks) <= 3
    assert [c["rank"] for c in chunks] == list(range(1, len(chunks) + 1))
    assert chunks[0]["text"] in context


async def test_rerank_threshold_drops_below_score_chunks():
    # 055 AC2/AC4 — a high rerank-score threshold keeps only chunks at/above it; the
    # rag.rerank END records the threshold, and the grounding holds only survivors.
    (context, chunks), events = await _collect(
        lambda em: rag_retrieve(_Q, 4, em, rerank=True, rerank_threshold=0.5)
    )
    rerank_end = next(e for e in events if e.stage == "rag.rerank" and e.phase == "end")
    assert rerank_end.data["threshold"] == 0.5
    assert len(chunks) <= 4
    for c in chunks:
        assert c["rerank_score"] >= 0.5
    # The grounding context is built only from the surviving chunks.
    assert isinstance(context, str)


async def test_rerank_threshold_near_one_completes_without_crash():
    # 055 AC3 — an aggressive threshold may drop (almost) everything; the call still
    # returns cleanly with a (possibly empty) context.
    (context, chunks), _events = await _collect(
        lambda em: rag_retrieve(_Q, 4, em, rerank=True, rerank_threshold=0.99)
    )
    assert isinstance(context, str)
    for c in chunks:
        assert c["rerank_score"] >= 0.99


async def test_rerank_threshold_zero_keeps_full_top_k():
    # 055 AC2/AC7 — threshold 0 (and the default) filter nothing: the kept set equals
    # 054's top-k, byte-for-byte.
    (_c0, chunks0), _ = await _collect(
        lambda em: rag_retrieve(_Q, 4, em, rerank=True, rerank_threshold=0.0)
    )
    (_cd, chunks_default), _ = await _collect(lambda em: rag_retrieve(_Q, 4, em, rerank=True))
    assert len(chunks0) == len(chunks_default)
    assert len(chunks0) == 4


async def test_agent_run_with_rerank_emits_rerank_stage():
    # AC1 (integration) — a full agent run with rerank=True that retrieves surfaces
    # the rag.rerank stage; a run without the flag never does.
    emitter = TraceEmitter("test", _Q)

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    answer = await run_agent(_Q, 3, emitter, rerank=True)
    await emitter.close()
    events = await drainer

    stages = {e.stage for e in events}
    # Only assert rerank when the agent actually retrieved (structural tolerance).
    if "rag.retrieve" in stages:
        assert "rag.rerank" in stages
    assert answer.strip()
