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


def test_storage_upload_stage_serializes_as_dotted_string():
    # 034-storage-ingestion-flow — the upload write-path adds one stage on the
    # new object-storage station, between BACKEND and the rag.ingest.* stages.
    assert Stage.STORAGE_UPLOAD == "storage.upload"
    payload = TraceEvent(trace_id="t", seq=1, stage=Stage.STORAGE_UPLOAD).model_dump_json()
    assert '"stage":"storage.upload"' in payload


def test_chat_request_accepts_session_id():
    from app.schemas import ChatRequest

    req = ChatRequest(message="hi", session_id="sess-123")
    assert req.session_id == "sess-123"
    # session_id is optional (lazy-created server-side when absent).
    assert ChatRequest(message="hi").session_id is None


def test_chat_request_accepts_experiment_overrides():
    # 006-interactive-experiments — request-only inputs for the experiment panel.
    from app.schemas import ChatRequest

    req = ChatRequest(
        message="hi",
        system_prompt="You are a pirate.",
        enabled_tools=["calculator"],
        top_k=2,
    )
    assert req.system_prompt == "You are a pirate."
    assert req.enabled_tools == ["calculator"]
    assert req.top_k == 2


def test_chat_request_experiment_overrides_are_optional():
    # AC5 seed — omitting them keeps today's defaults (no overrides sent).
    from app.schemas import ChatRequest

    req = ChatRequest(message="hi")
    assert req.system_prompt is None
    assert req.enabled_tools is None
    assert req.top_k is None


def test_chat_request_top_k_is_bounded():
    # Q6 — the slider is 1..8; the backend validates the range.
    import pytest
    from pydantic import ValidationError

    from app.schemas import ChatRequest

    assert ChatRequest(message="hi", top_k=8).top_k == 8
    assert ChatRequest(message="hi", top_k=1).top_k == 1
    for bad in (0, 9, -1):
        with pytest.raises(ValidationError):
            ChatRequest(message="hi", top_k=bad)


def test_chat_request_system_prompt_is_length_capped():
    # Q3 — full replace allowed, but capped at 2000 chars.
    import pytest
    from pydantic import ValidationError

    from app.schemas import ChatRequest

    assert ChatRequest(message="hi", system_prompt="x" * 2000).system_prompt
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", system_prompt="x" * 2001)
