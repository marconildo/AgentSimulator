"""054-rag-block-expansion: unit test for the local FlashRank reranker.

No OpenAI key needed — FlashRank runs locally — so this test always runs and pins
the reranker's contract deterministically: given candidates whose vector-search order
buries the truly relevant passage, the cross-encoder rerank promotes it to rank 1 and
trims to ``top_k``, exposing each candidate's pre/post rank for the trace.
"""

from app.rag.reranker import rerank


def _candidates():
    # Vector-search order (prev_rank 1..3) deliberately puts the on-topic passage LAST,
    # so a passthrough of the search order would fail this test.
    return [
        {
            "text": "The Amazon rainforest is home to many species of birds and insects.",
            "source": "a",
        },
        {"text": "Stock prices fell sharply on Tuesday amid inflation fears.", "source": "b"},
        {
            "text": "To bake sourdough bread, feed the starter, autolyse the flour, then "
            "proof and bake at high heat.",
            "source": "c",
        },
    ]


def test_rerank_promotes_relevant_passage_and_trims_to_top_k():
    query = "How do I bake sourdough bread at home?"
    result = rerank(query, _candidates(), top_k=2)

    # Trimmed to top_k, re-ranked 1..k.
    assert len(result.ranked) == 2
    assert [c["rank"] for c in result.ranked] == [1, 2]
    # The baking passage (search rank 3) is promoted to the top by the cross-encoder.
    assert result.ranked[0]["source"] == "c"
    # Each ranked item keeps a numeric rerank score and carries through its fields.
    assert all("rerank_score" in c for c in result.ranked)


def test_rerank_movement_covers_all_candidates_with_pre_and_post_ranks():
    query = "How do I bake sourdough bread at home?"
    result = rerank(query, _candidates(), top_k=2)

    # `movement` reports every scored candidate (not just the kept top_k) so the UI can
    # draw rank movement; prev_rank is the search order, new_rank the rerank order.
    assert len(result.movement) == 3
    assert {m["prev_rank"] for m in result.movement} == {1, 2, 3}
    by_new = sorted(result.movement, key=lambda m: m["new_rank"])
    assert [m["new_rank"] for m in by_new] == [1, 2, 3]
    scores = [m["score"] for m in by_new]
    assert scores == sorted(scores, reverse=True)
    # The baking passage moved from search rank 3 to rerank rank 1.
    baking = next(m for m in result.movement if m["source"] == "c")
    assert baking["prev_rank"] == 3
    assert baking["new_rank"] == 1
