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
    # Vector run: rag.retrieve END present ⇒ vector chunks win (precedence unchanged).
    em = _emitter_with(
        _event(Stage.PAGEINDEX_SELECT, _PAGEINDEX_CHUNKS),
        _event(Stage.RAG_RETRIEVE, _VECTOR_CHUNKS),
    )
    assert _retrieved_chunks(em) == _VECTOR_CHUNKS


def test_empty_when_neither_path_ran():
    assert _retrieved_chunks(_emitter_with()) == []
