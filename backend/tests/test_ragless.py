"""056-ragless-pageindex (T6): RAGLESS runs alongside Vector RAG and grounds the answer.

Drives the agent through the graph so the toggle's real wiring is exercised. Structural
assertions tolerate model variability. Needs a key (the agent calls the model), so the
module is ``@pytest.mark.openai``.

Guarantees:
  - AC1: ``ragless=False`` (default) never emits ``pageindex.*`` (byte-for-byte off).
  - AC2: ``ragless=True`` but ``scenario="simple"`` never emits ``pageindex.*`` (no-op).
  - AC4: ``ragless=True, scenario="intermediate"`` emits BOTH ``rag.*`` (display) and
    ``pageindex.*`` (grounding), and the retrieval observation fed to the model is the
    PageIndex context, not the vector one.
"""

import asyncio

import pytest
from langchain_core.messages import ToolMessage

from app.agent.graph import run_agent_state
from app.agent.tools import RETRIEVAL_TOOL
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai

# On-topic corpus-detail question that reliably elects search_knowledge_base.
_Q = "Why does chunk size matter in a RAG pipeline, and what is top-k?"


async def _run(**kwargs):
    emitter = TraceEmitter("test", _Q)

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    state = await run_agent_state(_Q, 3, emitter, **kwargs)
    await emitter.close()
    return state, await drainer


def _stages(events):
    return {str(e.stage) for e in events}


async def test_ragless_off_emits_no_pageindex_stages():
    # AC1 — default is byte-for-byte: never a pageindex.* stage.
    _state, events = await _run(scenario="intermediate", ragless=False)
    assert not any(s.startswith("pageindex.") for s in _stages(events))


async def test_ragless_on_simple_rung_is_a_noop():
    # AC2 — the toggle only has effect on the Intermediate rung.
    _state, events = await _run(scenario="simple", ragless=True)
    assert not any(s.startswith("pageindex.") for s in _stages(events))


async def test_ragless_intermediate_runs_both_paths_and_pageindex_grounds():
    # AC4 — both retrieval paths animate; PageIndex is the grounding fed to the model.
    state, events = await _run(scenario="intermediate", ragless=True)
    stages = _stages(events)
    # Vector RAG ran for display...
    assert "rag.search" in stages, "vector path should run for side-by-side display"
    # ...and PageIndex ran for grounding.
    assert {"pageindex.tree", "pageindex.navigate", "pageindex.select"} <= stages

    # The grounding observation (the retrieval ToolMessage) is the PageIndex context.
    select = next(e for e in events if str(e.stage) == "pageindex.select" and e.phase == "end")
    pi_context = "\n\n".join(f"[{c['source']}] {c['text']}" for c in select.data["chunks"])
    retrieval_obs = [
        m.content
        for m in state["messages"]
        if isinstance(m, ToolMessage) and m.name == RETRIEVAL_TOOL
    ]
    assert retrieval_obs, "the agent should have called the retrieval tool"
    assert retrieval_obs[-1] == pi_context, "PageIndex context must be what grounds the answer"
