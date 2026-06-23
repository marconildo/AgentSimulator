"""End-to-end agent scenarios through the *real* ingress chain.

Each test POSTs to the chain's front door (Varnish, ``:8090``) so the request
genuinely transits DNS · CDN · TLS/LB · WAF · API-GW before the backend runs the
LangGraph agent (RAG → MCP → LLM) against real OpenAI. This is the release
regression net: if a future change breaks the wiring (a container, a forwarded
header, the agent loop, a tool), one of these turns red.

Assertions are **structural** — stages fired, a tool was used, the answer is
non-empty, the real chain stamped its evidence — never semantic, so model
variability never makes them flaky.

These are opt-in (``-m integration``) and assume the stack is already up; see this
package's ``conftest.py`` (the ``live_stack`` fixture waits for health first).
"""

from __future__ import annotations

import pytest

from ._sse import answer_text, stream_chat

pytestmark = pytest.mark.integration

# The five appliance stages a request crosses through the :8090 front door, in
# transit order (090-waf-after-lb: the WAF inspects already-decrypted HTTP).
_NETWORK_STAGES = ["dns", "cdn", "lb", "waf", "apigw"]


def _chat(base_url: str, message: str, **extra) -> tuple[list[dict], dict]:
    body = {"message": message, "mode": "stream", "network": True, **extra}
    return stream_chat(base_url, body)


# --- the agent actually answers, end to end ---------------------------------


def test_basic_chat_answers_through_the_real_chain(base_url: str):
    events, done = _chat(base_url, "Hello! In one sentence, what can you do?")

    stages = {e["stage"] for e in events}
    # The full head-of-pipeline crossed the real edge before the agent ran.
    assert "frontend" in stages and "edge" in stages and "backend" in stages
    # The agent reasoned and produced an answer.
    assert "llm.generate" in stages
    assert any(e["stage"] == "respond" and e["phase"] == "end" for e in events)
    assert answer_text(events, done).strip(), "agent returned an empty answer"


# --- the evidence was stamped by the REAL containers, not injected ----------


def test_chain_evidence_is_stamped_by_the_real_containers(base_url: str):
    """The five network stages fire, in order, with evidence only the running
    appliances could have produced (this is what a hand-injected header test
    cannot prove)."""
    events, _ = _chat(base_url, "ping")

    seqs: dict[str, int] = {}
    for stage in _NETWORK_STAGES:
        hits = [e for e in events if e["stage"] == stage]
        assert len(hits) == 1, f"expected exactly one {stage} event, got {len(hits)}"
        seqs[stage] = hits[0]["seq"]

    # Ordered DNS → CDN → TLS/LB → WAF → API-GW, all before the backend.
    ordered = [seqs[s] for s in _NETWORK_STAGES]
    assert ordered == sorted(ordered), f"network stages out of order: {seqs}"
    backend_seq = min(e["seq"] for e in events if e["stage"] == "backend")
    assert max(ordered) < backend_seq

    by_stage = {e["stage"]: e for e in events if e["stage"] in _NETWORK_STAGES}
    # Varnish: the chat API is uncacheable → a real BYPASS (never a coincidental MISS).
    assert by_stage["cdn"]["data"]["cache"] == "BYPASS"
    # ModSecurity cleared the request (reaching Kong proves it passed the WAF).
    assert by_stage["waf"]["data"]["status"] == "clean"
    # HAProxy balanced onto the real backend pool.
    assert "backend" in (by_stage["lb"]["data"].get("upstream") or "")
    # Kong routed the chat path and identified itself.
    assert by_stage["apigw"]["data"]["route"] == "chat"
    assert by_stage["apigw"]["data"]["gateway"] == "kong"


# --- a tool-using scenario (MCP calculator) ---------------------------------


def test_math_question_uses_the_calculator_tool(base_url: str):
    events, done = _chat(base_url, "What is 23 * 19? Use a tool to be sure.")

    calls = [e for e in events if e["stage"] == "mcp.call" and e["phase"] == "end"]
    assert any(c["data"].get("tool") == "calculator" for c in calls), (
        "the agent should elect the calculator for an arithmetic question"
    )
    assert answer_text(events, done).strip()


# --- a retrieval scenario (RAG via search_knowledge_base) -------------------


def test_knowledge_question_retrieves_from_the_kb(base_url: str):
    events, done = _chat(
        base_url,
        "According to the knowledge base, what is retrieval-augmented generation?",
    )

    # The agent elected the native search_knowledge_base tool...
    elected = any(
        tc.get("name") == "search_knowledge_base"
        for e in events
        for tc in e.get("data", {}).get("tool_calls", [])
    )
    # ...and the retriever actually returned chunks.
    retrieved = next(
        (e for e in events if e["stage"] == "rag.retrieve" and e["phase"] == "end"), None
    )
    assert elected or retrieved, "expected an agent-elected knowledge-base retrieval"
    if retrieved is not None:
        assert retrieved["data"].get("chunks"), "rag.retrieve returned no chunks"
    assert answer_text(events, done).strip()
