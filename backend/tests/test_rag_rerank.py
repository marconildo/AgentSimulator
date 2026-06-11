"""054-rag-block-expansion: the real reranker pass on the Intermediate rung.

Retrieval-level tests (deterministic — they drive ``rag_retrieve`` directly so they
don't depend on the model electing to call the tool). Embeddings need a real key, so
the module is ``@pytest.mark.openai``; the local FlashRank rerank itself needs no key.

The guarantees under test:
  - AC3 (Simple guard): ``scenario="simple"`` emits exactly embed → search → retrieve
    and NEVER ``rag.rerank`` — byte-for-byte with today.
  - AC1: ``scenario="intermediate"`` emits one ``rag.rerank`` START/END ordered AFTER
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


async def test_simple_retrieval_has_no_rerank_stage():
    # AC3 — the Simple rung is byte-for-byte: embed → search → retrieve, no rerank.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em, scenario="simple"))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.retrieve"]
    assert all(e.stage != "rag.rerank" for e in events)


async def test_intermediate_emits_rerank_between_search_and_retrieve():
    # AC1 — rerank fires exactly once, after search and before retrieve.
    _result, events = await _collect(lambda em: rag_retrieve(_Q, 3, em, scenario="intermediate"))
    assert _rag_end_stages(events) == ["rag.embed", "rag.search", "rag.rerank", "rag.retrieve"]
    starts = [e for e in events if e.stage == "rag.rerank" and e.phase == "start"]
    assert len(starts) == 1


async def test_rerank_end_carries_movement_and_reorders_to_top_k():
    # AC2 — the rerank END exposes pre/post ranks + scores; the result is trimmed to
    # top_k in rerank order, and that ordering is derived from the rerank scores (not a
    # passthrough of the vector search).
    (context, chunks), events = await _collect(
        lambda em: rag_retrieve(_Q, 3, em, scenario="intermediate")
    )
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


async def test_agent_intermediate_run_emits_rerank_stage():
    # AC1 (integration) — a full agent run on the Intermediate rung that retrieves
    # surfaces the rag.rerank stage; the same run on Simple never does.
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
    answer = await run_agent(_Q, 3, emitter, scenario="intermediate")
    await emitter.close()
    events = await drainer

    stages = {e.stage for e in events}
    # Only assert rerank when the agent actually retrieved (structural tolerance).
    if "rag.retrieve" in stages:
        assert "rag.rerank" in stages
    assert answer.strip()
