"""Unit tests for the hybrid-search core (070-hybrid-search) — keyless & deterministic.

BM25 ranking and RRF fusion are pure functions over plain chunk dicts (no embeddings, no
OpenAI), so these run without a key and assert the fusion math directly. The retriever-level
integration (stage ordering, compose-with-rerank) is covered in test_retriever_hybrid.py.
"""

from __future__ import annotations

from app.rag.hybrid import bm25_rank, rrf_fuse


def _chunk(source: str, text: str) -> dict:
    return {"text": text, "source": source, "title": source, "similarity": 0.0, "score": 0.0}


def test_bm25_ranks_exact_token():
    """A chunk containing the rare literal query token outranks ones that don't."""
    chunks = [
        _chunk("a", "the agent reasons over a canonical message thread"),
        _chunk("b", "retrieval converts chroma distance into a cosine similarity"),
        _chunk("c", "the RAG_RERANK stage fires between search and retrieve"),
    ]
    ranked = bm25_rank("what is RAG_RERANK", chunks, top_k=3)
    # The chunk literally containing RAG_RERANK must lead the sparse lane.
    assert ranked[0]["source"] == "c"
    # Each ranked chunk carries a 1-based bm25 rank.
    assert [c["rank"] for c in ranked] == [1, 2, 3]


def test_rrf_is_rank_based_and_rewards_both_lanes():
    """RRF score = Σ 1/(rrf_k + rank); a chunk high in BOTH lanes beats one high in one."""
    rrf_k = 60
    # vector lane order: A, B, C   |   bm25 lane order: B, A, D
    vector_ranked = [
        {"source": "A", "text": "a", "rank": 1},
        {"source": "B", "text": "b", "rank": 2},
        {"source": "C", "text": "c", "rank": 3},
    ]
    bm25_ranked = [
        {"source": "B", "text": "b", "rank": 1},
        {"source": "A", "text": "a", "rank": 2},
        {"source": "D", "text": "d", "rank": 3},
    ]
    result = rrf_fuse(vector_ranked, bm25_ranked, rrf_k=rrf_k)

    by_source = {m["source"]: m for m in result.movement}
    # A: vector#1 + bm25#2 ; B: vector#2 + bm25#1 — both appear in both lanes.
    assert by_source["A"]["rrf_score"] == round(1 / (rrf_k + 1) + 1 / (rrf_k + 2), 6)
    assert by_source["B"]["rrf_score"] == round(1 / (rrf_k + 2) + 1 / (rrf_k + 1), 6)
    # C only in the vector lane, D only in the bm25 lane → single-term scores.
    assert by_source["C"]["bm25_rank"] is None
    assert by_source["C"]["rrf_score"] == round(1 / (rrf_k + 3), 6)
    assert by_source["D"]["vector_rank"] is None

    # A and B tie on score (symmetric), and both outrank C and D (one-lane only).
    fused_sources = [c["source"] for c in result.fused]
    assert set(fused_sources[:2]) == {"A", "B"}
    assert fused_sources.index("C") > 1 and fused_sources.index("D") > 1
    # Fused candidates are re-numbered 1..n and carry their rrf_score.
    assert [c["rank"] for c in result.fused] == [1, 2, 3, 4]
    assert all("rrf_score" in c for c in result.fused)


def test_rrf_empty_lanes():
    """No candidates in either lane → empty result, no crash."""
    result = rrf_fuse([], [], rrf_k=60)
    assert result.fused == [] and result.movement == []
