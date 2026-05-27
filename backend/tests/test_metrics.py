"""029-ttft-throughput — the streaming generation records real TTFT + throughput.

[openai]: assertions are structural (presence + ordering bounds) so they tolerate
model speed variability — we assert positivity and that TTFT falls within the
stage's latency window, not absolute values.
"""

import asyncio

import pytest

from app.agent import run_agent
from app.trace import TraceEmitter

pytestmark = pytest.mark.openai


async def _run(message: str, mode: str = "stream"):
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
    await run_agent(message, 3, emitter, mode=mode)
    await emitter.close()
    return await drainer


def _generate_end(events):
    return next(e for e in events if e.stage == "llm.generate" and e.phase == "end")


async def test_generate_records_ttft_and_throughput():
    # AC1/AC2 — a streamed run records ttft_ms > 0 and tokens_per_sec > 0 on the
    # llm.generate END, with TTFT inside the stage's latency window.
    events = await _run("What is an embedding?")
    gen = _generate_end(events)
    assert gen.metrics["tokens"] >= 1
    assert gen.metrics["ttft_ms"] > 0
    assert gen.metrics["tokens_per_sec"] > 0
    # First token cannot arrive after the stage ends (small rounding slack).
    assert gen.metrics["ttft_ms"] <= gen.metrics["latency_ms"] + 1.0
    # Sanity ceiling — guards the single-token 1/ε blow-up; no real model
    # streams faster than a few thousand tok/s.
    assert gen.metrics["tokens_per_sec"] < 10000


async def test_throughput_consistent_with_window():
    # AC2 — tokens_per_sec is consistent with the token count over the
    # post-first-token window (generous tolerance — model speed varies).
    events = await _run("Explain RAG in two short sentences.")
    gen = _generate_end(events)
    tokens = gen.metrics["tokens"]
    window_s = (gen.metrics["latency_ms"] - gen.metrics["ttft_ms"]) / 1000
    if tokens >= 2 and window_s > 0.05:
        expected = tokens / window_s
        tps = gen.metrics["tokens_per_sec"]
        assert 0.2 * expected <= tps <= 5 * expected


async def test_batch_mode_still_records_metrics():
    # AC3 — a batch run (no PROGRESS token events) still records ttft_ms +
    # tokens_per_sec: the provider yields tokens regardless; only the per-token
    # UI streaming differs.
    events = await _run("What is MCP?", mode="batch")
    progress = [e for e in events if e.stage == "llm.generate" and e.phase == "progress"]
    assert not progress, "batch mode must not emit per-token PROGRESS events"
    gen = _generate_end(events)
    assert gen.metrics["ttft_ms"] > 0
    assert gen.metrics["tokens_per_sec"] > 0
