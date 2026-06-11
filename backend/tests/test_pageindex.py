"""056-ragless-pageindex (T4): the real PageIndex retrieval path.

Needs a real key (the navigation is an LLM call), so the module is ``@pytest.mark.openai``.
Drives ``pageindex_retrieve`` directly (deterministic — doesn't depend on the model
electing the tool). Asserts structurally to tolerate model variability: the three stages
fire in order, a section is selected, the grounding context is non-empty, and **no
embedding** happens inside the PageIndex path (reasoning retrieval, not vector search).
"""

import asyncio

import pytest

from app.rag.pageindex import pageindex_retrieve
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai

_Q = "How does chunking affect retrieval quality in a RAG pipeline?"


async def _collect(make_coro):
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
    result = await make_coro(emitter)
    await emitter.close()
    return result, await drainer


def _end_stages(events):
    return [str(e.stage) for e in events if e.phase == "end"]


async def test_pageindex_emits_tree_navigate_select_in_order():
    (_context, _chunks), events = await _collect(lambda em: pageindex_retrieve(_Q, em))
    pi = [s for s in _end_stages(events) if s.startswith("pageindex.")]
    assert pi == ["pageindex.tree", "pageindex.navigate", "pageindex.select"]


async def test_pageindex_selects_a_section_and_grounds():
    (context, chunks), _events = await _collect(lambda em: pageindex_retrieve(_Q, em))
    assert chunks, "navigation should select at least one section"
    assert context.strip(), "selected sections become non-empty grounding context"
    # Each selected chunk carries the section it came from and its node id.
    assert all(c.get("node_id") and c.get("source") for c in chunks)


async def test_pageindex_path_never_embeds():
    # The whole point of RAGLESS: no embeddings, no vector search, no rerank.
    _result, events = await _collect(lambda em: pageindex_retrieve(_Q, em))
    stages = {str(e.stage) for e in events}
    assert not any(s.startswith("rag.") for s in stages)


async def test_pageindex_navigate_carries_reasoning():
    _result, events = await _collect(lambda em: pageindex_retrieve(_Q, em))
    nav = next(e for e in events if str(e.stage) == "pageindex.navigate" and e.phase == "end")
    # "Why this passage?" is an explainable reasoning trace, not a cosine score.
    assert "reasoning" in nav.data
    assert isinstance(nav.data.get("selected"), list)
