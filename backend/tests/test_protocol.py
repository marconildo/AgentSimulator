"""The event protocol must serialize with stable, frontend-friendly values."""

from app.schemas import Phase, Stage, TraceEvent


def test_stage_and_phase_serialize_as_dotted_strings():
    event = TraceEvent(
        trace_id="abc",
        seq=1,
        stage=Stage.RAG_SEARCH,
        phase=Phase.END,
        label="searching",
        data={"k": 4},
        metrics={"latency_ms": 12.5},
    )
    payload = event.model_dump_json()
    assert '"stage":"rag.search"' in payload
    assert '"phase":"end"' in payload
    assert '"seq":1' in payload


def test_all_stages_have_dotted_or_simple_ids():
    # Frontend keys nodes by these exact strings.
    values = {s.value for s in Stage}
    assert "agent.route" in values
    assert "llm.generate" in values
    assert "respond" in values


def test_ingestion_stages_serialize_as_dotted_strings():
    # 002-interactive-chat — PDF ingestion adds three stages on the rag station.
    assert Stage.RAG_INGEST_CHUNK == "rag.ingest.chunk"
    assert Stage.RAG_INGEST_EMBED == "rag.ingest.embed"
    assert Stage.RAG_INGEST_STORE == "rag.ingest.store"
    for stage in (Stage.RAG_INGEST_CHUNK, Stage.RAG_INGEST_EMBED, Stage.RAG_INGEST_STORE):
        payload = TraceEvent(trace_id="t", seq=1, stage=stage).model_dump_json()
        assert f'"stage":"{stage.value}"' in payload


def test_chat_request_accepts_session_id():
    from app.schemas import ChatRequest

    req = ChatRequest(message="hi", session_id="sess-123")
    assert req.session_id == "sess-123"
    # session_id is optional (lazy-created server-side when absent).
    assert ChatRequest(message="hi").session_id is None
