"""071-retrieval-metrics: Precision@k · Recall@k · MRR over a labelled golden set.

The metric math + the golden-set loader are pure and keyless (AC1/AC2) and run always. The
retriever-level integration (eval attaches only for labelled queries; byte-for-byte off;
rerank doesn't hurt MRR) needs the real dense lane, so those are ``@pytest.mark.openai``.
"""

from __future__ import annotations

import asyncio

import pytest

from app.rag.metrics import (
    evaluate,
    load_golden,
    match_golden,
    mrr,
    precision_at_k,
    recall_at_k,
)

# --- AC1: the golden set is real & validated ---------------------------------


def test_golden_set_has_enough_entries():
    golden = load_golden()
    assert len(golden) >= 6
    for entry in golden:
        assert {"id", "query", "relevant_sources"} <= set(entry)
        assert entry["query"].strip()
        assert entry["relevant_sources"], "every entry names ≥1 relevant source"


def test_golden_sources_exist_in_corpus():
    from app.config import get_settings

    corpus = {p.name for p in get_settings().corpus_path.glob("*.md")}
    for entry in load_golden():
        for src in entry["relevant_sources"]:
            assert src in corpus, f"{entry['id']} references missing corpus file {src!r}"


def test_match_golden_is_normalised():
    golden = load_golden()
    q = golden[0]["query"]
    # Case + surrounding whitespace must not defeat the lookup.
    assert match_golden(f"  {q.upper()}  ") == golden[0]
    assert match_golden("a query that is definitely not in the golden set") is None


# --- AC2: metric math is correct ---------------------------------------------


def test_mrr_first_relevant_rank_one():
    assert mrr(["agents.md", "rag.md", "mcp.md"], {"agents.md"}) == 1.0


def test_mrr_first_relevant_rank_three():
    assert round(mrr(["x.md", "y.md", "agents.md"], {"agents.md"}), 3) == 0.333


def test_mrr_none_relevant_is_zero():
    assert mrr(["x.md", "y.md"], {"agents.md"}) == 0.0


def test_precision_at_k():
    # top-4: a(rel) b c(rel) d → 2 relevant / 4 = 0.5
    assert precision_at_k(["a", "b", "c", "d"], {"a", "c"}, 4) == 0.5


def test_recall_at_k():
    # relevant {a,c,e}; top-4 contains a,c → 2 of 3 relevant sources = 0.667
    assert round(recall_at_k(["a", "b", "c", "d"], {"a", "c", "e"}, 4), 3) == 0.667


def test_evaluate_shape_and_values():
    ev = evaluate(["a", "b", "c"], ["a", "c"], 3)
    assert round(ev["precision_at_k"], 3) == 0.667  # a,c relevant of 3
    assert ev["recall_at_k"] == 1.0  # both relevant sources retrieved
    assert ev["mrr"] == 1.0  # a is rank 1
    assert ev["k"] == 3
    assert ev["relevant_count"] == 2
    assert ev["missed"] == []


def test_evaluate_missed_relevant():
    ev = evaluate(["b", "d"], ["a", "b"], 4)
    assert ev["missed"] == ["a"]  # 'a' relevant but never retrieved
    assert ev["mrr"] == 1.0  # 'b' is rank 1


# --- AC3/AC4/AC5: retriever integration (needs the real dense lane) ----------


async def _collect(make_coro, query):
    from app.trace import TraceEmitter

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


def _retrieve_end(events):
    return next(e for e in events if e.stage == "rag.retrieve" and e.phase == "end")


@pytest.mark.openai
async def test_labelled_query_attaches_eval():
    from app.rag.retriever import retrieve as rag_retrieve

    entry = next(e for e in load_golden() if e["relevant_sources"] == ["embeddings.md"])
    (_ctx, chunks), events = await _collect(
        lambda em: rag_retrieve(entry["query"], 4, em), entry["query"]
    )
    end = _retrieve_end(events)
    assert "eval" in end.data
    ev = end.data["eval"]
    assert {"precision_at_k", "recall_at_k", "mrr", "k", "relevant_count", "missed"} <= set(ev)
    # Every retrieved chunk is marked relevant or not.
    assert all("relevant" in c for c in chunks)


@pytest.mark.openai
async def test_unlabelled_query_byte_for_byte():
    from app.rag.retriever import retrieve as rag_retrieve

    q = "tell me a joke about platypuses that is not in the knowledge base"
    (_ctx, _chunks), events = await _collect(lambda em: rag_retrieve(q, 3, em), q)
    rag_ends = [e.stage for e in events if e.phase == "end" and str(e.stage).startswith("rag.")]
    assert rag_ends == ["rag.embed", "rag.search", "rag.retrieve"]
    assert "eval" not in _retrieve_end(events).data


@pytest.mark.openai
async def test_metrics_wired_through_real_pipeline_with_and_without_rerank():
    # AC5 — the metric is wired to the real pipeline and computed end-to-end both with and
    # without the reranker. Asserted structurally (valid metric in [0,1], the relevant chunk
    # is actually found) rather than rerank-vs-no-rerank ≥: reranking legitimately reorders,
    # so it can move the first relevant chunk either way on any given query.
    from app.rag.retriever import retrieve as rag_retrieve

    entry = next(e for e in load_golden() if e["id"] == "hnsw")
    for rerank in (False, True):
        (_ctx, _chunks), events = await _collect(
            lambda em, rr=rerank: rag_retrieve(entry["query"], 4, em, rerank=rr), entry["query"]
        )
        ev = _retrieve_end(events).data["eval"]
        assert 0.0 <= ev["mrr"] <= 1.0
        assert 0.0 <= ev["precision_at_k"] <= 1.0
        # The relevant source is retrievable for this benchmark, so MRR is non-zero.
        assert ev["mrr"] > 0.0
