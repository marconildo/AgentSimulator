"""Trace plumbing.

``TraceEmitter`` is handed to every stage of the pipeline. Stages push
``TraceEvent``s into an async queue (consumed by the SSE endpoint) while the
emitter also keeps the full list so a finished trace can be replayed later via
``TraceStore``.
"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from .schemas import Phase, Stage, TraceEvent, TraceSummary


@dataclass
class StageRecord:
    """Mutable handle yielded by :meth:`TraceEmitter.stage`.

    Stage code fills ``data``/``metrics``; they are attached to the END event.
    """

    data: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)


class TraceEmitter:
    """Collects and fans out events for a single request."""

    # Sentinel pushed onto the queue when the trace is complete.
    DONE = None

    def __init__(self, trace_id: str, message: str) -> None:
        self.trace_id = trace_id
        self.message = message
        self.answer = ""
        self.events: list[TraceEvent] = []
        self.queue: asyncio.Queue[TraceEvent | None] = asyncio.Queue()
        self._seq = 0

    async def emit(
        self,
        stage: Stage,
        phase: Phase = Phase.END,
        label: str = "",
        data: dict[str, Any] | None = None,
        metrics: dict[str, float] | None = None,
    ) -> TraceEvent:
        self._seq += 1
        event = TraceEvent(
            trace_id=self.trace_id,
            seq=self._seq,
            stage=stage,
            phase=phase,
            label=label,
            data=data or {},
            metrics=metrics or {},
        )
        self.events.append(event)
        await self.queue.put(event)
        return event

    @asynccontextmanager
    async def stage(self, stage: Stage, label: str = "", start_data: dict[str, Any] | None = None):
        """Emit START on enter and END on exit, timing the body automatically.

        Usage::

            async with emitter.stage(Stage.RAG_SEARCH, "Searching") as rec:
                rec.data["chunks"] = ...
        """
        await self.emit(stage, Phase.START, label, start_data or {})
        t0 = perf_counter()
        rec = StageRecord()
        try:
            yield rec
        finally:
            rec.metrics.setdefault("latency_ms", round((perf_counter() - t0) * 1000, 1))
            await self.emit(stage, Phase.END, label, rec.data, rec.metrics)

    async def close(self) -> None:
        await self.queue.put(self.DONE)

    def summary(self) -> TraceSummary:
        return TraceSummary(
            trace_id=self.trace_id,
            message=self.message,
            answer=self.answer,
            events=self.events,
        )


class TraceStore:
    """Bounded in-memory store of finished traces (newest kept)."""

    def __init__(self, max_traces: int = 50) -> None:
        self._traces: OrderedDict[str, TraceSummary] = OrderedDict()
        self._max = max_traces

    def save(self, emitter: TraceEmitter) -> None:
        self._traces[emitter.trace_id] = emitter.summary()
        self._traces.move_to_end(emitter.trace_id)
        while len(self._traces) > self._max:
            self._traces.popitem(last=False)

    def get(self, trace_id: str) -> TraceSummary | None:
        return self._traces.get(trace_id)


# Process-wide store; the simulator is single-instance by design.
trace_store = TraceStore()
