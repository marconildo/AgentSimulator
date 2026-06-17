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
    # DeepAgents runtime (057-deepagents-runtime): on the Intermediate rung a preamble
    # runs *before* the ReAct loop — an explicit PLAN, a delegated researcher sub-agent,
    # and a virtual FILE SYSTEM (in-memory scratchpad) the orchestrator writes to and
    # reads back across steps. All four map to the `agent` station; the Simple rung never
    # emits them (byte-for-byte). Order: plan → fs.write → delegate → fs.write → fs.read.
    AGENT_PLAN = "agent.plan"
    AGENT_FS_WRITE = "agent.fs.write"
    AGENT_FS_READ = "agent.fs.read"
    AGENT_DELEGATE = "agent.delegate"
    AGENT_THINK = "agent.think"
    RAG_EMBED = "rag.embed"
    RAG_SEARCH = "rag.search"
    # Reranking (054-rag-block-expansion): the Intermediate rung re-scores the wider
    # candidate pool from rag.search with a local cross-encoder, then trims to top-k.
    # Fires only on the Intermediate branch, between rag.search and rag.retrieve; the
    # Simple rung never emits it (byte-for-byte). Maps to the `reranker` station.
    RAG_RERANK = "rag.rerank"
    RAG_RETRIEVE = "rag.retrieve"
    # RAGLESS / PageIndex (056-ragless-pageindex): a second, reasoning-based retrieval
    # path that runs alongside Vector RAG when the request's `ragless` toggle is on
    # (Intermediate rung only). It builds a document tree, the LLM navigates it, and the
    # selected sections become the grounding context — no embeddings, no vector DB. These
    # map to the `pageindex` station; the Simple rung (and ragless=False) never emit them.
    PAGEINDEX_TREE = "pageindex.tree"
    PAGEINDEX_NAVIGATE = "pageindex.navigate"
    PAGEINDEX_SELECT = "pageindex.select"
    # PDF ingestion (002-interactive-chat): chunk -> embed -> store. These animate
    # the same `rag` station as retrieval, but for *writing* user documents.
    RAG_INGEST_CHUNK = "rag.ingest.chunk"
    RAG_INGEST_EMBED = "rag.ingest.embed"
    RAG_INGEST_STORE = "rag.ingest.store"
    # Object-storage upload (034-storage-ingestion-flow): the API persists the
    # uploaded document to durable object storage *before* the indexer reads it
    # back to chunk/embed/store. Fires between BACKEND and the rag.ingest.* stages.
    STORAGE_UPLOAD = "storage.upload"
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


class Runtime(StrEnum):
    """The agent runtime (061-scenario-builder).

    A **request-only** input — *not* a ``TraceEvent`` field — selecting which
    agent loop runs. ``react`` is the canonical bounded ReAct loop (today's
    default, byte-for-byte); ``deepagents`` runs the DeepAgents preamble
    (planner + virtual FS + delegated sub-agent, 057); ``multiagent`` is a
    preview runtime (label-only until its own spec). Replaces the coarse 008
    ``Scenario`` enum as the gate for the DeepAgents preamble — maturity is now
    a *derived* client-side label, not a request input.
    """

    REACT = "react"
    DEEPAGENTS = "deepagents"
    MULTIAGENT = "multiagent"


class SimulateFailure(StrEnum):
    """Opt-in failure injection (017-failure-injection).

    A **request-only** input (like the 006 overrides / 008 ``Scenario``) — *not*
    a ``TraceEvent`` field — that forces a chosen failure on the next run so the
    learner can watch the agent degrade. ``none`` (the default) reproduces today's
    behavior byte-for-byte. The failure surfaces as an ``error`` key on the
    existing END-event ``data`` (``{error, simulated: true}``); no new ``Stage``.
    """

    NONE = "none"
    TOOL_ERROR = "tool_error"
    LLM_TIMEOUT = "llm_timeout"


class TraceEvent(BaseModel):
    """A single observable moment in the lifecycle of one request.

    ``data`` is an open map; some stages enrich it additively (no new ``Stage``):
    the ``llm.prompt`` END carries the assembled-prompt preview and, since
    036-context-window-budget, ``context_window`` (int) + ``context_budget`` (a
    per-category token map: ``system``/``tool_defs``/``skills``/``memory``/
    ``retrieved``/``messages``). Mirrored by ``PromptPreview`` in
    ``frontend/src/types/events.ts``. The ``db.read`` END carries ``recent`` +
    ``limit`` and, since 039-memory-growth-visualization, ``recent_tokens``: a
    list of per-pair tiktoken counts aligned with ``recent`` (same order/length)
    that powers the Agent's turn-by-turn Memory growth panel.

    051-failure-treatments adds (additively, only under an injected failure) the
    *treatment* keys read by ``SimulatedError`` in ``events.ts``: a retried
    ``llm.prompt`` END carries ``attempt``/``max_retries`` (+ ``backoff_ms`` between
    attempts); the final ``agent.think`` END carries ``circuit``/``treatment``; a
    failed ``mcp.call``/``rag.retrieve`` END carries ``treatment``. No new ``Stage``.
    """

    trace_id: str
    seq: int = Field(..., description="Monotonic order within the trace.")
    ts: float = Field(default_factory=time)
    stage: Stage
    phase: Phase = Phase.END
    label: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
    # An open numeric map (no per-key type). Known keys include `latency_ms`
    # (every stage), `prompt_tokens`/`completion_tokens`/`total_tokens`/`cost_usd`
    # (011, on agent.think + llm.generate ENDs) and `tokens`/`ttft_ms`/
    # `tokens_per_sec` (029, on the llm.generate END). Adding keys is additive —
    # the frontend mirror needs no type change.
    metrics: dict[str, float] = Field(default_factory=dict)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    # Conversation this message belongs to. Optional: the backend lazy-creates a
    # session when absent and returns the id on the SSE ``done`` event.
    session_id: str | None = None
    # How to deliver the result; see ``DeliveryMode``. Defaults to streaming.
    mode: DeliveryMode = "stream"

    # --- Experiment overrides (006-interactive-experiments) ------------------
    # Request-only inputs that let the UI change *how* the run executes without
    # adding any pipeline stage. All optional: omitting them reproduces today's
    # behavior exactly (default prompts, all tools, default top-k, default model).
    #
    # 042-agent-anatomy split the prior single prompt into two layers, each
    # independently overridable. ``system_prompt`` now replaces the GUARDRAILS
    # layer (platform-wide rules); ``agent_prompt`` replaces the ROLE layer
    # (this agent's identity/instructions). Both are capped at 2000 chars to
    # bound the blast radius; blank/whitespace falls back to the corresponding
    # server default for that layer.
    system_prompt: str | None = Field(default=None, max_length=2000)
    agent_prompt: str | None = Field(default=None, max_length=2000)
    # Names of the MCP tools to expose this run. ``None`` = all tools (default);
    # ``[]`` = no tools (LLM-only path); a list = only those tools discovered.
    enabled_tools: list[str] | None = None
    # Lets the UI override RAG top-k for experimentation; bounded to the slider's
    # range (1..8). ``None`` = the configured default (``rag_top_k``).
    top_k: int | None = Field(default=None, ge=1, le=8)
    # Minimum rerank-score threshold (055-rerank-score-threshold). After the
    # Intermediate reranker trims to top-k, chunks scoring below this are dropped
    # from the grounding context (precision over recall). Bounded 0..1; ``None`` or
    # ``0`` = no filtering (054 behavior, byte-for-byte). Only the Intermediate rung
    # reranks, so it is a no-op on Simple.
    rerank_threshold: float | None = Field(default=None, ge=0, le=1)
    # Per-conversation OpenAI model override (042-agent-anatomy). The API
    # validates this against the curated allowlist (``app.llm.models``) and
    # returns 422 on an unlisted value, so the agent never sees an unvetted id.
    # ``None`` = use ``settings.llm_model`` (the configured default).
    model: str | None = Field(default=None, max_length=120)

    # --- Scenario builder per-feature inputs (061-scenario-builder) ----------
    # The maturity ladder (008) is retired as a request input: the client builder
    # composes an architecture and derives the rung label itself, sending only the
    # behaviours that actually execute. ``rerank`` turns on the cross-encoder
    # reranker (was gated by ``scenario == "intermediate"``, 054); ``runtime``
    # selects the agent loop (was the DeepAgents gate). Defaults reproduce today's
    # Simple run byte-for-byte (no rerank, ReAct loop).
    rerank: bool = False
    runtime: Runtime = Runtime.REACT

    # --- RAGLESS / PageIndex (056-ragless-pageindex) -------------------------
    # Opt-in reasoning-based retrieval that runs *alongside* Vector RAG so the
    # learner can compare them. When True the turn runs both the vector pipeline
    # (for display) and PageIndex (which builds a document tree, navigates it with
    # the LLM, and grounds the answer). Request-only; ``False`` (default)
    # reproduces today's behavior byte-for-byte (no ``pageindex.*`` stages).
    ragless: bool = False

    # --- Failure injection (017-failure-injection) ---------------------------
    # Forces a chosen failure on this run so the learner can watch the agent
    # degrade. Request-only, bounded enum; ``none`` (default) is unchanged.
    simulate_failure: SimulateFailure = SimulateFailure.NONE

    # --- Message attachments (040-message-attachments) -----------------------
    # Documents the composer was holding when the user pressed Send — the
    # backend links each (after a per-session validity check) to the message
    # persisted by ``db.write``, so the chip travels with the turn that
    # introduced it. Optional; omitting it reproduces today's behavior (no
    # link, no chip). Capped to bound the request size + chip-strip overflow.
    attachment_document_ids: list[str] | None = Field(default=None, max_length=16)


class SkillIn(BaseModel):
    """Create/update payload for a catalog skill (027-skills).

    ``name`` is the unique handle the model passes to ``load_skill``; the body is
    the instructions loaded on demand. Lengths are bounded to keep the always-on
    prompt catalog (name + description) and the loaded body reasonable.
    """

    name: str = Field(..., min_length=1, max_length=80)
    description: str = Field(..., min_length=1, max_length=400)
    body: str = Field(..., min_length=1, max_length=8000)


class SkillOut(SkillIn):
    """A persisted skill, as returned by the skills REST surface."""

    id: str
    created_at: float
    updated_at: float


class TraceSummary(BaseModel):
    """Returned by GET /api/trace/{id} for replay."""

    trace_id: str
    message: str
    answer: str
    events: list[TraceEvent]
