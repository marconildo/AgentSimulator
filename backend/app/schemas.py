"""The event protocol — the contract between backend and frontend.

Every stage of the pipeline emits ``TraceEvent``s. They are streamed to the
browser over SSE and also stored per-trace so the UI can replay them. The
TypeScript mirror of these types lives in ``frontend/src/types/events.ts`` —
keep the two in sync.
"""

from __future__ import annotations

from enum import StrEnum
from time import time
from typing import Any, Literal

from pydantic import BaseModel, Field

# How the backend delivers the result to the client:
#  - "stream": Server-Sent Events — trace + answer flow back live, token by token.
#  - "batch":  a single JSON response after the whole run finishes; the client
#              then replays the trace. The two model the same pipeline, different
#              delivery contracts (async streaming vs synchronous request/response).
DeliveryMode = Literal["stream", "batch"]


class Stage(StrEnum):
    """Pipeline stations, in roughly the order they fire."""

    FRONTEND = "frontend"
    BACKEND = "backend"
    DB_READ = "db.read"
    AGENT_ROUTE = "agent.route"
    AGENT_THINK = "agent.think"
    RAG_EMBED = "rag.embed"
    RAG_SEARCH = "rag.search"
    RAG_RETRIEVE = "rag.retrieve"
    MCP_DISCOVER = "mcp.discover"
    MCP_CALL = "mcp.call"
    LLM_PROMPT = "llm.prompt"
    LLM_GENERATE = "llm.generate"
    RESPOND = "respond"
    DB_WRITE = "db.write"


class Phase(StrEnum):
    START = "start"
    PROGRESS = "progress"
    END = "end"


class TraceEvent(BaseModel):
    """A single observable moment in the lifecycle of one request."""

    trace_id: str
    seq: int = Field(..., description="Monotonic order within the trace.")
    ts: float = Field(default_factory=time)
    stage: Stage
    phase: Phase = Phase.END
    label: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, float] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    # Optional: lets the UI override top_k for experimentation.
    top_k: int | None = None
    # How to deliver the result; see ``DeliveryMode``. Defaults to streaming.
    mode: DeliveryMode = "stream"


class TraceSummary(BaseModel):
    """Returned by GET /api/trace/{id} for replay."""

    trace_id: str
    message: str
    answer: str
    events: list[TraceEvent]
