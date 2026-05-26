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


async def test_retrieve_emits_rag_stages():
    emitter = TraceEmitter("t", "q")
    await retrieve("embeddings and cosine similarity", k=2, emitter=emitter)
    stages = [e.stage for e in emitter.events]
    assert "rag.embed" in stages
    assert "rag.search" in stages
    assert "rag.retrieve" in stages
