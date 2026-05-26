"""End-to-end agent runs against OpenAI emit the expected stage sequence.

Assertions are structural (stages fired, tool used, answer non-empty, history
carried) so they tolerate model variability. The whole module needs a key.
"""

import asyncio

import pytest

from app.agent import run_agent
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai


async def _run(message: str, top_k: int = 3, history=None, system_prompt=None, enabled_tools=None):
    emitter = TraceEmitter("test", message)

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    answer = await run_agent(
        message,
        top_k,
        emitter,
        history=history,
        system_prompt=system_prompt,
        enabled_tools=enabled_tools,
    )
    await emitter.close()
    events = await drainer
    return answer, events


async def test_pipeline_emits_all_core_stages():
    answer, events = await _run("What is RAG?")
    stages = {e.stage for e in events}
    for required in [
        "agent.route",
        "mcp.discover",
        "rag.embed",
        "rag.search",
        "rag.retrieve",
        "agent.think",
        "llm.prompt",
        "llm.generate",
        "respond",
    ]:
        assert required in stages, f"missing stage {required}"
    assert answer.strip()


async def test_sequence_numbers_are_monotonic():
    _answer, events = await _run("What is MCP?")
    seqs = [e.seq for e in events]
    assert seqs == sorted(seqs)
    assert len(seqs) == len(set(seqs))


async def test_math_question_invokes_calculator_tool():
    answer, events = await _run("What is 2 + 2?")
    calls = [e for e in events if e.stage == "mcp.call" and e.phase == "end"]
    assert calls, "expected a tool call"
    assert calls[0].data["tool"] == "calculator"
    assert "4" in calls[0].data["result"]
    assert "4" in answer


async def test_tool_call_carries_jsonrpc_frames():
    # AC2 (007) — a tool-calling chat yields non-empty request AND response
    # JSON-RPC frames on the mcp.call event (whatever transport is active).
    _answer, events = await _run("What is 2 + 2?")
    call = next(e for e in events if e.stage == "mcp.call" and e.phase == "end")
    jr = call.data["jsonrpc"]
    assert jr["request"]["method"] == "tools/call"
    assert jr["request"]["params"]  # non-empty request frame
    assert jr["response"]["result"]  # non-empty response frame
    assert isinstance(jr["reconstructed"], bool)


async def test_llm_generate_streams_tokens():
    _answer, events = await _run("What is an embedding?")
    progress = [e for e in events if e.stage == "llm.generate" and e.phase == "progress"]
    assert len(progress) > 1
    assert all("token" in e.data for e in progress)


async def test_history_is_carried_into_the_prompt():
    history = [{"message": "What is RAG?", "answer": "RAG grounds an LLM in retrieved docs."}]
    _answer, events = await _run("And what about embeddings?", history=history)
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert prompt.data["history"] == history
    route = next(e for e in events if e.stage == "agent.route" and e.phase == "end")
    assert route.data["memory_turns"] == 1


# --- Experiment overrides (006-interactive-experiments) ---------------------


async def test_system_prompt_override_reaches_the_prompt():
    # AC1 — the override shows up in the assembled prompt's `system` block.
    marker = "UNIQUE-PERSONA-MARKER-XYZ"
    override = f"You are {marker}. Answer in one short sentence."
    answer, events = await _run("Say hello.", system_prompt=override)
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert marker in prompt.data["system"]
    assert answer.strip()


async def test_blank_system_prompt_falls_back_to_default():
    # AC1 — a blank/whitespace override is ignored; the default prompt is used.
    _answer, events = await _run("What is RAG?", system_prompt="   ")
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert "AI Agent Simulator" in prompt.data["system"]


async def test_disabling_calculator_re_plans_without_it():
    # AC2 — calculator off + a math question ⇒ discover lists only enabled tools
    # and the agent never calls the calculator (it answers some other way).
    enabled = ["current_time", "kb_lookup"]
    answer, events = await _run("What is 2 + 2?", enabled_tools=enabled)
    discover = next(e for e in events if e.stage == "mcp.discover" and e.phase == "end")
    discovered = {t["name"] for t in discover.data["tools"]}
    assert discovered == set(enabled)
    assert "calculator" not in discovered
    calls = [e for e in events if e.stage == "mcp.call" and e.phase == "end"]
    assert all(c.data["tool"] != "calculator" for c in calls)
    assert answer.strip()


async def test_all_tools_disabled_makes_no_tool_calls():
    # AC3 — enabled_tools=[] ⇒ no discovery, no mcp.call, answer still returned.
    answer, events = await _run("What is 2 + 2?", enabled_tools=[])
    discover = next(e for e in events if e.stage == "mcp.discover" and e.phase == "end")
    assert discover.data["tools"] == []
    assert not [e for e in events if e.stage == "mcp.call"]
    assert answer.strip()


async def test_no_overrides_discovers_all_three_tools_with_default_prompt():
    # AC5 — regression guard: no overrides ⇒ today's structure.
    _answer, events = await _run("What is MCP?")
    discover = next(e for e in events if e.stage == "mcp.discover" and e.phase == "end")
    discovered = {t["name"] for t in discover.data["tools"]}
    assert {"calculator", "current_time", "kb_lookup"} == discovered
    prompt = next(e for e in events if e.stage == "llm.prompt" and e.phase == "end")
    assert "AI Agent Simulator" in prompt.data["system"]
