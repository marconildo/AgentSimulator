"""026-agent-tool-autonomy: retrieval-as-a-tool + the canonical message thread.

The agent must *decide* to call its tools — including knowledge-base retrieval —
and feed results back as ToolMessages on a canonical thread (not stuffed into the
system prompt). The config check is keyless (the tool list is independent of the
LLM); the thread check runs a real agent and asserts structurally.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, ToolMessage

from app.agent import run_agent_state
from app.main import app
from app.trace import TraceEmitter


def test_config_advertises_retrieval_tool():
    # AC1 — the retrieval tool is advertised alongside the MCP tools, with a
    # non-empty description, so the experiment panel lists every tool the agent
    # can choose. Inspectable without a key (the registry is LLM-independent).
    with TestClient(app) as client:
        resp = client.get("/api/config")
        assert resp.status_code == 200
        tools = {t["name"]: t["description"] for t in resp.json()["tools"]}
        assert "search_knowledge_base" in tools
        assert tools["search_knowledge_base"].strip()


@pytest.mark.openai
async def test_tool_run_produces_canonical_thread():
    # AC4 — after a tool-using run the message thread has an AIMessage with
    # non-empty tool_calls and a following ToolMessage carrying that tool's result
    # (results are fed back as ToolMessages, not concatenated into the prompt).
    emitter = TraceEmitter("t", "What is 2 + 2?")

    async def drain():
        events = []
        while True:
            ev = await emitter.queue.get()
            if ev is None:
                break
            events.append(ev)
        return events

    drainer = asyncio.create_task(drain())
    state = await run_agent_state("What is 2 + 2?", 3, emitter)
    await emitter.close()
    events = await drainer

    messages = state["messages"]
    ai_with_calls = [m for m in messages if isinstance(m, AIMessage) and m.tool_calls]
    assert ai_with_calls, "expected an AIMessage carrying tool_calls (an agent decision)"
    call_id = ai_with_calls[0].tool_calls[0]["id"]
    tool_msgs = [m for m in messages if isinstance(m, ToolMessage)]
    assert tool_msgs, "expected a ToolMessage feeding the result back"
    assert any(m.tool_call_id == call_id for m in tool_msgs), "ToolMessage must answer the call"

    # The result was NOT stuffed into the system prompt (the old behavior).
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert "# Tool results" not in prompt.data["system"]
    assert state["answer"].strip()
