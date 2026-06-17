"""056-ragless-pageindex (T6): RAGLESS runs alongside Vector RAG and grounds the answer.

Drives the agent through the graph so the toggle's real wiring is exercised. Structural
assertions tolerate model variability. Needs a key (the agent calls the model), so the
module is ``@pytest.mark.openai``.

Guarantees (061-scenario-builder decoupled the toggle from the rung — ``ragless`` now
fires on its own flag, no ``scenario`` condition; 066-retrieval-strategy-radio made
retrieval a radio, so RAGLESS *replaces* the vector path instead of running alongside it):
  - AC7: ``ragless=False`` (default) never emits ``pageindex.*`` (byte-for-byte off), and
    the vector ``rag.*`` path runs.
  - 061 AC5: ``ragless=True`` emits ``pageindex.*`` regardless of any rung.
  - 066 AC6: ``ragless=True`` emits ONLY ``pageindex.*`` (no ``rag.*`` — the vector path is
    skipped), and the retrieval observation fed to the model is the PageIndex context.
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
    # AC7 — default is byte-for-byte: never a pageindex.* stage; the vector path runs.
    _state, events = await _run(ragless=False)
    stages = _stages(events)
    assert not any(s.startswith("pageindex.") for s in stages)
    assert "rag.search" in stages, "the vector path runs when ragless is off"


async def test_ragless_on_fires_regardless_of_rung():
    # 061 AC5 — the toggle is decoupled from the maturity rung: ragless=True alone
    # (no scenario input exists anymore) emits the PageIndex path.
    _state, events = await _run(ragless=True)
    assert any(s.startswith("pageindex.") for s in _stages(events))


async def test_ragless_on_skips_vector_path_and_pageindex_grounds():
    # 066 AC6 — retrieval is a radio: RAGLESS REPLACES the vector path. PageIndex runs
    # and grounds the answer; no rag.* stage is emitted.
    state, events = await _run(ragless=True)
    stages = _stages(events)
    # The vector path is skipped entirely (no embed/search/retrieve).
    assert not any(s.startswith("rag.") for s in stages), (
        "vector path must be skipped under RAGLESS"
    )
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
