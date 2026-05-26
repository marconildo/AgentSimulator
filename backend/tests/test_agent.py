"""End-to-end agent runs in demo mode emit the expected stage sequence."""

import asyncio

from app.agent import run_agent
from app.trace import TraceEmitter


async def _run(message: str, top_k: int = 3, history=None):
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
    answer = await run_agent(message, top_k, emitter, history=history)
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
