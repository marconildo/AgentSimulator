"""066-retrieval-strategy-radio (AC8): `_retrieved_chunks` reflects the grounding.

Under the RAGLESS strategy the vector path is skipped, so no ``rag.retrieve`` event
exists. The chunks persisted with the message (→ the "Sources used" panel) must fall
back to the PageIndex-selected sections, so the bubble honestly shows what grounded the
answer instead of vector hits that never happened. Pure unit over a hand-built event
list — keyless, no model.
"""

from app.main import _retrieved_chunks
from app.schemas import Phase, Stage, TraceEvent
from app.trace import TraceEmitter

_VECTOR_CHUNKS = [{"text": "v", "source": "rag.md", "score": 0.7, "uploaded": False}]
_PAGEINDEX_CHUNKS = [
    {"text": "p", "source": "rag.md", "score": 1.0, "uploaded": False, "node_id": "n1"}
]


def _emitter_with(*events: TraceEvent) -> TraceEmitter:
    em = TraceEmitter("t", "q")
    em.events = list(events)
    return em


def _event(stage: Stage, chunks: list[dict]) -> TraceEvent:
    return TraceEvent(
        trace_id="t", seq=len(chunks), stage=stage, phase=Phase.END, data={"chunks": chunks}
    )


def test_falls_back_to_pageindex_select_when_no_rag_retrieve():
    # AC8 — RAGLESS run: only pageindex.select END exists ⇒ its sections are the sources.
    em = _emitter_with(_event(Stage.PAGEINDEX_SELECT, _PAGEINDEX_CHUNKS))
    assert _retrieved_chunks(em) == _PAGEINDEX_CHUNKS


def test_prefers_rag_retrieve_when_present():
    # Vector run: rag.retrieve END present ⇒ vector chunks win (precedence unchanged),
    # now tagged with their search index (and query, here absent ⇒ None).
    em = _emitter_with(
        _event(Stage.PAGEINDEX_SELECT, _PAGEINDEX_CHUNKS),
        _event(Stage.RAG_RETRIEVE, _VECTOR_CHUNKS),
    )
    out = _retrieved_chunks(em)
    assert [{k: v for k, v in c.items() if k not in ("query", "search")} for c in out] == (
        _VECTOR_CHUNKS
    )
    assert all(c["search"] == 1 for c in out)


def test_empty_when_neither_path_ran():
    assert _retrieved_chunks(_emitter_with()) == []


def _query_event(stage: Stage, query: str, chunks: list[dict]) -> TraceEvent:
    return TraceEvent(
        trace_id="t",
        seq=len(chunks),
        stage=stage,
        phase=Phase.END,
        data={"chunks": chunks, "query": query},
    )


def test_returns_every_chunk_from_every_search_tagged_by_search():
    # The agent may search the KB more than once (each search is its own rag.retrieve).
    # "Sources used" shows EVERY chunk from EVERY search, in order, each tagged with the
    # query + a 1-based search index — no dedup, so a chunk retrieved by both searches is
    # shown under both with each query's own score (the panel groups by search).
    search1 = [
        {"text": "def of rag", "source": "rag.md", "score": 0.80, "uploaded": False},
        {"text": "rag detail", "source": "rag.md", "score": 0.52, "uploaded": False},
    ]
    search2 = [
        {"text": "def of rag", "source": "rag.md", "score": 0.70, "uploaded": False},
        {"text": "retrieval works", "source": "rag.md", "score": 0.57, "uploaded": False},
    ]
    em = _emitter_with(
        _query_event(Stage.RAG_RETRIEVE, "what is rag", search1),
        _query_event(Stage.RAG_RETRIEVE, "how retrieval works", search2),
    )
    out = _retrieved_chunks(em)
    # all 4 chunks present (no dedup — the shared "def of rag" appears under both searches).
    assert [c["text"] for c in out] == ["def of rag", "rag detail", "def of rag", "retrieval works"]
    assert [c["search"] for c in out] == [1, 1, 2, 2]
    assert [c["query"] for c in out] == [
        "what is rag",
        "what is rag",
        "how retrieval works",
        "how retrieval works",
    ]
    # each instance keeps its own search's score (0.80 in search 1, 0.70 in search 2).
    assert out[0]["score"] == 0.80
    assert out[2]["score"] == 0.70
