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
