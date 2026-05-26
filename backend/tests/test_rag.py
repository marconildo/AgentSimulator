"""Retrieval returns scored chunks and ranks the obviously-relevant doc first.

Uses real OpenAI embeddings, so the whole module needs a key (AC6).
"""

import pytest

from app.rag.retriever import retrieve
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai


async def test_retrieve_returns_scored_chunks():
    emitter = TraceEmitter("t", "q")
    context, chunks = await retrieve(
        "What is RAG and how does retrieval work?", k=3, emitter=emitter
    )

    assert chunks, "expected at least one chunk"
    assert all("score" in c and "source" in c and "text" in c for c in chunks)
    assert all(0.0 <= c["score"] <= 1.0 for c in chunks)
    assert context.strip()
    # The RAG document should win for a RAG query.
    assert chunks[0]["source"] == "rag.md"


async def test_retrieve_honors_top_k():
    # AC4 (006) — a top_k override is honored: at most k chunks, and the
    # rag.retrieve event reflects the requested k.
    emitter = TraceEmitter("t", "q")
    _, chunks = await retrieve("What is RAG?", k=2, emitter=emitter)
    assert len(chunks) <= 2
    retrieve_ev = next(e for e in emitter.events if e.stage == "rag.retrieve" and e.phase == "end")
    assert retrieve_ev.data["k"] == 2


async def test_retrieve_emits_rag_stages():
    emitter = TraceEmitter("t", "q")
    await retrieve("embeddings and cosine similarity", k=2, emitter=emitter)
    stages = [e.stage for e in emitter.events]
    assert "rag.embed" in stages
    assert "rag.search" in stages
    assert "rag.retrieve" in stages


async def test_retrieve_chunks_expose_distance_similarity_rank():
    # AC4 (007-numeric-transparency) — each top-k chunk carries the raw `distance`,
    # `similarity = 1 − distance`, and a stable `rank` ascending by distance, so the
    # RAG inspector can render a ranked similarity table.
    emitter = TraceEmitter("t", "q")
    _, chunks = await retrieve("What is RAG and how does retrieval work?", k=3, emitter=emitter)

    assert chunks
    for c in chunks:
        assert "distance" in c and "similarity" in c and "rank" in c
        # similarity and distance are exact inverses (both rounded to 4 dp).
        assert c["similarity"] == round(1.0 - c["distance"], 4)

    ranks = [c["rank"] for c in chunks]
    assert ranks == list(range(1, len(chunks) + 1))  # stable, 1-based
    distances = [c["distance"] for c in chunks]
    assert distances == sorted(distances)  # ascending by distance


async def test_retrieve_with_session_filter_still_returns_corpus():
    # D3 — a session with no uploads still retrieves the base corpus through the
    # `corpus == true OR session_id == active` filter (corpus tagged corpus=True).
    emitter = TraceEmitter("t", "q")
    _, chunks = await retrieve(
        "What is RAG and how does retrieval work?",
        k=3,
        emitter=emitter,
        session_id="session-with-no-docs",
    )
    assert chunks, "the corpus must remain retrievable under the session filter"
    assert chunks[0]["source"] == "rag.md"
