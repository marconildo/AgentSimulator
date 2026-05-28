"""Trace plumbing.

``TraceEmitter`` is handed to every stage of the pipeline. Stages push
``TraceEvent``s into an async queue (consumed by the SSE endpoint) while the
emitter also keeps the full list so a finished trace can be replayed later via
``TraceStore``.

048-persist-traces: every event also lands in a real SQLite table
(``trace_events``) via :meth:`TraceEmitter._persist`. The DB write is awaited
*before* the event reaches the SSE queue so AC5 stays tight (row count == event
count). Failures are logged + swallowed so a temporary DB hiccup never breaks
the live stream.
"""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

from .schemas import Phase, Stage, TraceEvent, TraceSummary

_log = logging.getLogger(__name__)


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

    def __init__(
        self,
        trace_id: str,
        message: str,
        *,
        session_id: str | None = None,
        on_event: Callable[[TraceEvent, str | None], Awaitable[None]] | None = None,
    ) -> None:
        self.trace_id = trace_id
        self.message = message
        self.answer = ""
        self.events: list[TraceEvent] = []
        self.queue: asyncio.Queue[TraceEvent | None] = asyncio.Queue()
        self._seq = 0
        # 048-persist-traces: the session this trace belongs to. Optional at
        # construction time — the chat / upload endpoint sets it as soon as
        # the session is adopted. Events emitted *before* it's set persist
        # with `session_id = NULL`.
        self.session_id = session_id
        # Optional override (tests + future alternative sinks). When unset,
        # `_persist` falls back to the default store write below.
        self._on_event = on_event

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
        # 048-persist-traces: persist BEFORE the SSE consumer sees the event,
        # so AC5 stays tight (row count == event count once the SSE caller
        # has received the event). Failures are logged + swallowed.
        await self._persist(event)
        await self.queue.put(event)
        return event

    async def _persist(self, event: TraceEvent) -> None:
        """Write one row to ``trace_events`` (or call the override).

        Errors are caught and logged — the trace must keep flowing even if the
        DB is temporarily unhappy (constitution §3 / AC8). Imported lazily so
        the trace module stays independent of the store at import time.
        """
        try:
            if self._on_event is not None:
                await self._on_event(event, self.session_id)
                return
            from .db.store import get_store

            await get_store().write_trace_event(
                {
                    "trace_id": event.trace_id,
                    "seq": event.seq,
                    "ts": event.ts,
                    "session_id": self.session_id,
                    "stage": event.stage.value if hasattr(event.stage, "value") else event.stage,
                    "phase": event.phase.value if hasattr(event.phase, "value") else event.phase,
                    "label": event.label,
                    "data": event.data,
                    "metrics": event.metrics,
                }
            )
        except Exception as exc:  # noqa: BLE001 - never break the live stream
            _log.warning(
                "persist trace_event failed (trace_id=%s seq=%s stage=%s): %s",
                event.trace_id,
                event.seq,
                getattr(event.stage, "value", event.stage),
                exc,
            )

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
