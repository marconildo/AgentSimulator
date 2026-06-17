"""FastAPI entrypoint.

Exposes a streaming chat endpoint (``POST /api/chat``) that runs the agent and
emits the lifecycle as Server-Sent Events, a trace-replay endpoint
(``GET /api/trace/{id}``), a health check, and the session / message / document
REST surface that backs the interactive chat (002-interactive-chat).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .agent import run_agent
from .agent.prompts import AGENT_PROMPT, GUARDRAILS_PROMPT
from .agent.tools import agent_tool_specs
from .config import get_settings
from .db.seed import seed_default_agent, seed_skills
from .db.store import (
    AgentLocked,
    CannotDeleteDefaultAgent,
    DuplicateSkillName,
    UnknownAgentId,
    get_store,
)
from .llm.context import history_pair_tokens
from .llm.models import DEFAULT_PROVIDER, model_ids, models_payload, providers_payload
from .mcp.client import get_registry
from .rag.ingest import build_index
from .rag.ingestion import delete_document_vectors, delete_uploaded_vectors, ingest_uploaded
from .rag.store import index_matches_model, is_indexed, reset_vectorstore_cache
from .schemas import ChatRequest, Phase, SimulateFailure, SkillIn, SkillOut, Stage
from .storage.object_store import (
    clear_objects,
    delete_document_objects,
    object_key,
    put_object,
)
from .trace import TraceEmitter, trace_store


def _retrieved_chunks(emitter: TraceEmitter) -> list[dict[str, Any]]:
    """The chunks the agent retrieved this run, persisted with the message (D5/AC8).

    Prefers the vector ``rag.retrieve`` END event. 066-retrieval-strategy-radio: under
    the RAGLESS strategy the vector path is skipped (no ``rag.retrieve``), so fall back
    to the PageIndex-selected sections (``pageindex.select`` END) — those are what
    actually grounded the answer, so "Sources used" stays honest."""
    for ev in reversed(emitter.events):
        if ev.stage == Stage.RAG_RETRIEVE and ev.phase == Phase.END:
            return list(ev.data.get("chunks", []))
    for ev in reversed(emitter.events):
        if ev.stage == Stage.PAGEINDEX_SELECT and ev.phase == Phase.END:
            return list(ev.data.get("chunks", []))
    return []


def _applied_skills(emitter: TraceEmitter) -> list[str]:
    """The distinct skills the agent loaded this run (027-skills): the ``name`` arg
    of each successful ``load_skill`` ``mcp.call``. Persisted with the message so
    the "skills applied" badge survives reload/replay (a pure projection of the
    trace — no new Stage)."""
    applied: list[str] = []
    for ev in emitter.events:
        if ev.stage != Stage.MCP_CALL or ev.phase != Phase.END:
            continue
        if ev.data.get("tool") != "load_skill":
            continue
        result = ev.data.get("result", "")
        name = (ev.data.get("args") or {}).get("name")
        if name and isinstance(result, str) and not result.startswith("error:"):
            if name not in applied:
                applied.append(name)
    return applied


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Build the vector index on first boot if it's missing, or rebuild it if the
    # persisted index was built with a different embedding model (e.g. EMBEDDING_MODEL
    # changed, so the persisted dimension no longer matches the live one).
    try:
        if not is_indexed():
            count = build_index()
            print(f"[startup] Built vector index ({count} chunks).")
        elif not index_matches_model():
            reset_vectorstore_cache()  # drop any stale collection handle first
            count = build_index()
            print(f"[startup] Embedding model changed — rebuilt index ({count} chunks).")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not build index: {exc!r}")
    # 027-skills: seed the example skill catalog when it's empty (idempotent).
    try:
        added = await seed_skills()
        if added:
            print(f"[startup] Seeded {added} example skills.")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not seed skills: {exc!r}")
    # 043-persisted-agent: ensure the default "Agent Simulator" exists so the
    # first `create_session` after boot has something to clone.
    try:
        if await seed_default_agent():
            print("[startup] Seeded default agent.")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not seed default agent: {exc!r}")
    # 056-ragless-pageindex: pre-build the PageIndex document tree (cached) so the
    # RAGLESS path is "pre-indexed" like the vector store, not built on first request.
    try:
        from .rag.pageindex import build_tree

        tree = build_tree()
        print(f"[startup] Built PageIndex tree ({len(tree.children)} documents).")
    except Exception as exc:  # noqa: BLE001 - app should still start
        print(f"[startup] Could not build PageIndex tree: {exc!r}")
    yield


app = FastAPI(title="AI Agent Simulator", version="0.1.0", lifespan=lifespan)

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict:
    # Read the model straight from settings so health stays inspectable even
    # without a key (constructing the provider would fail fast). `has_key` lets
    # the frontend surface a clear "OpenAI key required" state.
    settings = get_settings()
    return {
        "status": "ok",
        "llm_provider": "openai",
        "llm_model": settings.llm_model,
        "has_key": settings.has_openai_key,
        "indexed": is_indexed(),
    }


# The maturity ladder (008-scenario-framework). The bilingual name/blurb live
# here so the scenario switcher prefills from /api/config (like the tools and the
# default prompt) — nothing about the ladder is hardcoded client-side. Only the
# `simple` rung executes today; the upper rungs are non-executing previews until
# their own specs (009+) light up their real nodes (`available` flips then).
SCENARIOS: list[dict[str, Any]] = [
    {
        "id": "simple",
        "name": {"en": "Simple", "pt": "Simples"},
        "blurb": {
            "en": "ReAct + vector RAG + MCP tools, bounded loop — today's app.",
            "pt": "ReAct + RAG vetorial + ferramentas MCP, loop limitado — o app de hoje.",
        },
        "available": True,
    },
    {
        "id": "intermediate",
        "name": {"en": "Intermediate", "pt": "Intermediário"},
        "blurb": {
            "en": "Adds reranking, hybrid search and real token/cost accounting.",
            "pt": "Adiciona reranking, busca híbrida e contagem real de tokens/custo.",
        },
        # 054-rag-block-expansion lit up the first real Intermediate node — a local
        # cross-encoder reranker on the RAG path — so the rung now executes.
        "available": True,
    },
    {
        "id": "advanced",
        "name": {"en": "Advanced", "pt": "Avançado"},
        "blurb": {
            "en": "Production AI-Ops: gateway, guardrails, cache, evals, observability.",
            "pt": "AI-Ops de produção: gateway, guardrails, cache, evals, observabilidade.",
        },
        "available": False,
    },
]


@app.get("/api/config")
async def config() -> dict:
    """Defaults the experiment panel (006-interactive-experiments) prefills with,
    so nothing about the agent is hardcoded client-side. Like ``/api/health`` it
    is inspectable without an OpenAI key (the registry is independent of the LLM).
    The top-k bounds mirror ``ChatRequest.top_k`` (1..8); ``scenarios`` is the
    008 maturity ladder."""
    settings = get_settings()
    registry = await get_registry()
    return {
        # 042-agent-anatomy split the prior single prompt into two layers.
        # ``default_system_prompt`` now ships the **guardrails** text; the prior
        # role text is exposed separately as ``default_agent_prompt`` so the FE
        # can prefill each textarea independently.
        "default_system_prompt": GUARDRAILS_PROMPT,
        "default_agent_prompt": AGENT_PROMPT,
        "default_top_k": settings.rag_top_k,
        "top_k_min": 1,
        "top_k_max": 8,
        # 055-rerank-score-threshold — the minimum rerank-score slider (Intermediate).
        "default_rerank_threshold": settings.rerank_threshold_default,
        "rerank_threshold_step": 0.05,
        # 056-ragless-pageindex — default state of the RAGLESS (PageIndex) toggle.
        "ragless_default": False,
        # The full tool list the agent sees — knowledge-base retrieval plus the
        # MCP tools (026-agent-tool-autonomy) — so the experiment panel lists every
        # tool the agent can choose, not just the MCP ones.
        "tools": [
            {"name": s.name, "description": s.description} for s in agent_tool_specs(registry, None)
        ],
        "scenarios": SCENARIOS,
        # 017-failure-injection: the allowed values for the "Simulate failure"
        # selector, so the frontend never hardcodes them (AC4).
        "failure_modes": [m.value for m in SimulateFailure],
        # 042-agent-anatomy: the curated OpenAI chat-model list the Agent
        # Anatomy dialog renders, plus the server's resolved default. The FE
        # never hardcodes model ids; the API validates ``ChatRequest.model``
        # against this list. Keep the payload shape stable — frontend types
        # mirror it.
        "models": models_payload(),
        "default_model": settings.llm_model,
        # 065-provider-and-model-refresh: the LLM providers the dialog advertises.
        # OpenAI is the one usable provider; Ollama is a disabled preview. The FE
        # never hardcodes provider proper nouns.
        "providers": providers_payload(),
        "default_provider": DEFAULT_PROVIDER,
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    settings = get_settings()
    # 042-agent-anatomy: validate the optional model override against the
    # curated allowlist *before* doing any heavy work. An unlisted id is a
    # 422, not a runtime surprise from the OpenAI client.
    if req.model is not None and req.model not in model_ids():
        raise HTTPException(
            status_code=422,
            detail={
                "error": "model not in allowlist",
                "model": req.model,
                "allowed": sorted(model_ids()),
            },
        )
    top_k = req.top_k or settings.rag_top_k
    # 055-rerank-score-threshold: explicit `is None` so a deliberate 0 from the FE
    # isn't overridden by a (future) non-zero default.
    rerank_threshold = (
        settings.rerank_threshold_default if req.rerank_threshold is None else req.rerank_threshold
    )
    trace_id = uuid.uuid4().hex
    emitter = TraceEmitter(trace_id, req.message)

    store = get_store()
    # Adopt the conversation this message belongs to, lazy-creating one if the
    # client didn't send a session_id. The id is echoed on the SSE `done` event.
    session = await store.ensure_session(req.session_id or uuid.uuid4().hex)
    session_id = session["id"]
    # 048-persist-traces: pin the session on the emitter so every subsequent
    # `emit` denormalizes session_id onto its trace_events row.
    emitter.session_id = session_id
    # 043-persisted-agent: the session always carries an inline agent (clone
    # of the seed default). Request-level overrides (006) still win when set
    # — falling back to the agent row only fills in the absent fields. So a
    # programmatic caller sending `system_prompt="X"` keeps today's behavior.
    agent = session.get("agent")
    effective_system_prompt = req.system_prompt
    effective_agent_prompt = req.agent_prompt
    effective_enabled_tools = req.enabled_tools
    effective_model = req.model
    # 049-agent-self-identity: name + description are server-resolved from the
    # bound agent row (not a 006 hot-override — the FE edits them via
    # PATCH /api/agents and they propagate to every session sharing the agent,
    # 044-shared-agent-catalog). Both stay None when no agent is bound, which
    # makes the prompt's identity layer collapse to the prior 042-anatomy
    # 3-layer assembly byte-for-byte.
    effective_agent_name: str | None = None
    effective_agent_description: str | None = None
    if agent is not None:
        if effective_system_prompt is None:
            effective_system_prompt = agent["system_prompt"]
        if effective_agent_prompt is None:
            effective_agent_prompt = agent["agent_prompt"]
        if effective_enabled_tools is None and agent["enabled_tools"]:
            # The agent stores `enabled_tools` as a concrete list (the FE writes
            # exactly the tools the user kept on). An empty list means "no tools
            # disabled" from the FE's perspective today — match that semantic by
            # leaving the override at None (fall through to "all tools").
            effective_enabled_tools = list(agent["enabled_tools"])
        if effective_model is None:
            effective_model = agent["model"]
        effective_agent_name = agent.get("name")
        effective_agent_description = agent.get("description")
    resolved_model = effective_model or settings.llm_model

    # The resolved POST body the backend actually acted on, echoed onto the
    # frontend event so the client/backend inspector can show it verbatim
    # (007-numeric-transparency, Q2). top_k is the resolved value (default when
    # omitted); the 006 overrides are included only when the client sent them, so
    # the body reflects exactly what executed.
    request_body: dict[str, Any] = {
        "message": req.message,
        "session_id": session_id,
        "top_k": top_k,
        "rerank_threshold": rerank_threshold,
        "mode": req.mode,
        "runtime": req.runtime.value,
        # 042-agent-anatomy: always echo the **resolved** model (override or
        # configured default) so the FE can show what actually ran without
        # having to know about the server default. Resolves AC6.
        "model": resolved_model,
    }
    if req.system_prompt is not None:
        request_body["system_prompt"] = req.system_prompt
    if req.agent_prompt is not None:
        request_body["agent_prompt"] = req.agent_prompt
    if req.enabled_tools is not None:
        request_body["enabled_tools"] = req.enabled_tools
    # Include the forced failure only when set (017) — a `none` run echoes nothing
    # extra, so the body still reflects exactly what executed (AC1).
    if req.simulate_failure != SimulateFailure.NONE:
        request_body["simulate_failure"] = req.simulate_failure.value
    # 061-scenario-builder: echo the reranker flag only when on, so a default run's
    # body stays minimal (mirrors the ragless echo below).
    if req.rerank:
        request_body["rerank"] = True
    # 056-ragless-pageindex: echo the toggle only when on, so a default run's body
    # is byte-for-byte unchanged (AC1).
    if req.ragless:
        request_body["ragless"] = True

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.FRONTEND,
                Phase.END,
                "User sent a message",
                {"message": req.message, "session_id": session_id, "request": request_body},
            )
            async with emitter.stage(
                Stage.BACKEND, "API received the request", {"message": req.message}
            ) as rec:
                # Read this conversation's recent history from the application
                # database (system of record) — the agent's long-term memory,
                # folded into the prompt context.
                async with emitter.stage(
                    Stage.DB_READ,
                    "Loading recent history",
                    {"table": "messages", "session_id": session_id},
                ) as db_rec:
                    history = await store.read_history(session_id)
                    # 039-memory-growth-visualization: per-pair token counts so
                    # the Agent's Long-term-Memory panel can draw the honest
                    # turn-by-turn growth of what re-enters the model's window
                    # next turn (only the visible text — never the compute).
                    db_rec.data = {
                        **history,
                        "recent_tokens": history_pair_tokens(history["recent"]),
                    }

                # 027-skills: advertise the global catalog to the agent by
                # name + description (the body is loaded on demand via load_skill).
                skills_catalog = [
                    {"name": s["name"], "description": s["description"]}
                    for s in await store.list_skills()
                ]

                await run_agent(
                    req.message,
                    top_k,
                    emitter,
                    history=history["recent"],
                    mode=req.mode,
                    session_id=session_id,
                    # 043-persisted-agent: fall back to the session's agent row
                    # when the request omits the field; the request's value
                    # still wins when present (006 hot-override).
                    system_prompt=effective_system_prompt,
                    agent_prompt=effective_agent_prompt,
                    enabled_tools=effective_enabled_tools,
                    rerank=req.rerank,
                    runtime=req.runtime.value,
                    simulate_failure=req.simulate_failure,
                    skills_catalog=skills_catalog,
                    model=effective_model,
                    rerank_threshold=rerank_threshold,
                    # 056-ragless-pageindex: run the reasoning-based PageIndex path
                    # alongside Vector RAG (Intermediate rung only; no-op otherwise).
                    ragless=req.ragless,
                    # 049-agent-self-identity: server-resolved from the bound
                    # agent row above; never a request override.
                    agent_name=effective_agent_name,
                    agent_description=effective_agent_description,
                )

                # Persist the finished message + the chunks retrieved for it
                # (D5) — separate from the RAG vector store. 040-message-
                # attachments: pass through the composer's pending document ids
                # so the relational link `message ↔ document` is written in the
                # same transaction (cross-session ids and already-linked ids
                # are filtered inside the store).
                async with emitter.stage(Stage.DB_WRITE, "Persisting the conversation") as db_rec:
                    db_rec.data = await store.write_message(
                        session_id,
                        trace_id,
                        req.message,
                        emitter.answer,
                        chunks=_retrieved_chunks(emitter),
                        skills=_applied_skills(emitter),
                        attached_document_ids=req.attachment_document_ids,
                    )

                rec.data = {
                    "answer": emitter.answer,
                    "delivery": req.mode,
                    "session_id": session_id,
                }
        except Exception as exc:  # noqa: BLE001 - report to the client, don't hang
            await emitter.emit(Stage.BACKEND, Phase.END, "error", {"error": str(exc)})
        finally:
            trace_store.save(emitter)
            await emitter.close()

    # Batch delivery: run the whole pipeline to completion, then return the
    # finished trace + answer as one JSON response. The client replays it. This
    # is the synchronous request/response contract — no live streaming.
    if req.mode == "batch":
        await producer()
        return emitter.summary()

    # Streaming delivery: fan trace events out over SSE as they happen.
    async def event_stream():
        task = asyncio.create_task(producer())
        done_seen = False
        try:
            while True:
                event = await emitter.queue.get()
                if event is emitter.DONE:
                    done_seen = True
                    break
                yield {"event": "trace", "data": event.model_dump_json()}
        finally:
            if done_seen:
                await task
            else:
                # The consumer was torn down before the producer finished — the
                # client disconnected (016-cancel-stream). Cancel the producer so
                # the in-flight agent run is genuinely interrupted *before*
                # db.write, discarding the turn. CancelledError is a
                # BaseException, so the producer's `except Exception` does not
                # swallow it; its `finally` still saves the partial trace and
                # closes the emitter (the queue is unbounded → the final put can't
                # deadlock with no reader).
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        # Reached only on normal completion; on disconnect the GeneratorExit
        # propagates out of the finally above and skips this farewell event.
        yield {
            "event": "done",
            "data": json.dumps(
                {"trace_id": trace_id, "answer": emitter.answer, "session_id": session_id}
            ),
        }

    return EventSourceResponse(event_stream())


@app.get("/api/trace/{trace_id}")
async def get_trace(trace_id: str):
    """Return a finished trace's summary.

    048-persist-traces: layered read. The bounded in-memory `TraceStore`
    (cap=50) serves the hot path; on a miss (older traces, restart, another
    instance) we reconstruct the same `TraceSummary` shape from
    `trace_events` + `messages`. Identical JSON shape on both paths.
    """
    summary = trace_store.get(trace_id)
    if summary is not None:
        return summary
    db_summary = await get_store().get_trace_summary(trace_id)
    if db_summary is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return db_summary


@app.get("/api/corpus")
async def list_corpus() -> dict:
    """List the shipped corpus files (042-agent-anatomy).

    Read-only metadata for the Agent Anatomy dialog's Knowledge Base subsection:
    filename, size in bytes, and a whitespace-collapsed first-240-chars preview.
    Only ``*.md`` files in :attr:`Settings.corpus_path` are returned, sorted by
    filename. Independent of the OpenAI key (the corpus is on disk, not in the
    LLM)."""
    corpus_dir = get_settings().corpus_path
    files: list[dict[str, Any]] = []
    if corpus_dir.exists():
        for path in sorted(corpus_dir.glob("*.md")):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            # Whitespace-collapsed first 240 chars — keeps the JSON small while
            # giving the FE enough to render a 1–2 line teaser.
            preview = " ".join(text.split())[:240]
            files.append(
                {
                    "filename": path.name,
                    "size_bytes": path.stat().st_size,
                    "preview": preview,
                }
            )
    return {"files": files}


@app.post("/api/data/clear")
async def clear_data():
    """Reset both stores (025-clear-databases): remove every user-imported chunk
    from the vector store (the built-in corpus is kept, so retrieval still works
    with no rebuild), wipe all relational history, and delete every stored object.
    Returns the counts removed: ``sessions_deleted`` / ``messages_deleted`` /
    ``documents_deleted`` / ``vectors_removed`` / ``objects_deleted``. Idempotent —
    a second call returns all zeros."""
    vectors_removed = await asyncio.to_thread(delete_uploaded_vectors)
    objects_deleted = await asyncio.to_thread(clear_objects)
    counts = await get_store().clear_all()
    return {**counts, "vectors_removed": vectors_removed, "objects_deleted": objects_deleted}


# --- Sessions / messages / documents (002-interactive-chat) -----------------


@app.post("/api/sessions")
async def create_session():
    """Start a fresh, empty conversation (AC6)."""
    return await get_store().create_session()


@app.get("/api/sessions")
async def list_sessions():
    """Recent-first conversation list, each labeled by its first message (AC5)."""
    return await get_store().list_sessions()


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Single session lookup including the inlined agent + `message_count`
    (045-composer-agent-selector). The FE composer chip derives the lock
    state from `message_count`; this endpoint lets it refetch a single
    session after a 409 without listing the whole catalog."""
    row = await get_store().get_session(session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return row


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a conversation + its messages (keeps PDF embeddings — D6, AC4)."""
    return await get_store().delete_session(session_id)


class AgentPatch(BaseModel):
    """Body of ``PATCH /api/agents/{id}``.

    Partial update: every field is optional. The PATCH only touches the columns
    actually present in the request — sending ``{"name": "X"}`` leaves the
    prompts and model alone. Field bounds:

    - ``name``: 1..60 chars (after strip)
    - ``description``: 0..240 chars
    - ``system_prompt`` / ``agent_prompt``: ≤ 2000 chars each
    - ``model``: must be in the curated allowlist (`app/llm/models.py`)
    - ``enabled_tools``: list of tool names (subset of the advertised tools)
    """

    name: str | None = Field(default=None, min_length=1, max_length=60)
    description: str | None = Field(default=None, max_length=240)
    system_prompt: str | None = Field(default=None, max_length=2000)
    agent_prompt: str | None = Field(default=None, max_length=2000)
    model: str | None = Field(default=None, max_length=120)
    enabled_tools: list[str] | None = Field(default=None)


class AgentCreate(BaseModel):
    """Body of ``POST /api/agents`` (044-shared-agent-catalog).

    Every field optional. ``clone_from`` picks the source agent (defaults to
    the seed default when absent). ``name`` defaults to ``"<source> (cópia)"``
    so consecutive clicks of "+ Novo" produce visually unique entries.
    """

    name: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=240)
    clone_from: str | None = Field(default=None)


class SessionPatch(BaseModel):
    """Body of ``PATCH /api/sessions/{id}`` (044-shared-agent-catalog).

    Today only the agent link is editable. Future fields go here (color,
    pinned, etc.) — they would be additive."""

    agent_id: str | None = Field(default=None)


@app.get("/api/agents")
async def list_agents():
    """The full agent catalog (044-shared-agent-catalog). Default first, then
    user-created agents alphabetically. The dialog header strip renders this."""
    return await get_store().list_agents()


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str):
    """Direct read of an agent row (convenience). Sessions already include
    the agent inline, so the FE rarely calls this."""
    row = await get_store().get_agent(agent_id)
    if row is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return row


@app.post("/api/agents")
async def create_agent(body: AgentCreate):
    """Create a new agent in the catalog (044-shared-agent-catalog).

    Cloned from ``body.clone_from`` (or the default when absent). The new
    row is non-default (``is_default=0``). The FE typically follows up with
    a ``PATCH /api/sessions/{id}`` to point the active conversation at it.
    """
    name = body.name.strip() if isinstance(body.name, str) else None
    desc = body.description.strip() if isinstance(body.description, str) else None
    return await get_store().create_agent(name=name, description=desc, clone_from=body.clone_from)


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete a non-default agent and re-point any sessions using it to the
    default (044-shared-agent-catalog).

    409 when the target is the default (the always-there fallback); 404 when
    the id is unknown.
    """
    try:
        result = await get_store().delete_agent(agent_id)
    except CannotDeleteDefaultAgent as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return result


@app.patch("/api/sessions/{session_id}")
async def patch_session(session_id: str, body: SessionPatch):
    """Update per-conversation metadata. Today: just the agent link
    (044-shared-agent-catalog). Future additive fields land here.
    """
    if body.agent_id is None:
        raise HTTPException(status_code=422, detail="agent_id is required")
    try:
        row = await get_store().set_session_agent(session_id, body.agent_id)
    except UnknownAgentId as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AgentLocked as exc:
        # 045-composer-agent-selector: the conversation is started; swapping
        # the agent at this point would break "one agent per chat". Structured
        # detail so a stale FE tab can recover gracefully (it shows the lock
        # tooltip + refreshes the session list to flip the chip locked).
        raise HTTPException(
            status_code=409,
            detail={"detail": "agent_locked", "message_count": exc.message_count},
        ) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="session not found")
    return row


@app.patch("/api/agents/{agent_id}")
async def patch_agent(agent_id: str, body: AgentPatch):
    """Partial-update an agent (044-shared-agent-catalog).

    The agent is shared across every conversation that points to it, so this
    PATCH propagates immediately (the FE patches its in-memory session list
    on success). Validates ``model`` against the curated allowlist.
    """
    patch = body.model_dump(exclude_unset=True)
    # Validate `model` against the same allowlist used by /api/chat (defense in
    # depth — the FE dropdown also filters, but a programmatic caller might not).
    if "model" in patch and patch["model"] not in model_ids():
        raise HTTPException(
            status_code=422,
            detail={
                "error": "model not in allowlist",
                "model": patch["model"],
                "allowed": sorted(model_ids()),
            },
        )
    # Normalize name (strip), reject post-strip emptiness explicitly so 1..60
    # actually means "1..60 visible characters".
    if "name" in patch and isinstance(patch["name"], str):
        patch["name"] = patch["name"].strip()
        if not patch["name"]:
            raise HTTPException(status_code=422, detail="name cannot be blank")
    row = await get_store().update_agent(agent_id, patch)
    if row is None:
        raise HTTPException(status_code=404, detail="agent not found")
    return row


@app.get("/api/sessions/{session_id}/messages")
async def list_messages(session_id: str):
    """A conversation's history, each message carrying its retrieved chunks (AC8)."""
    return await get_store().list_messages(session_id)


@app.get("/api/sessions/{session_id}/documents")
async def list_documents(session_id: str):
    """The PDFs uploaded to this conversation."""
    return await get_store().list_documents(session_id)


@app.post("/api/sessions/{session_id}/documents")
async def upload_document(session_id: str, file: Annotated[UploadFile, File()]):
    """Ingest a PDF into the vector store, streaming the ingestion stages over
    SSE so the canvas animates chunk -> embed -> store (D4, AC2, AC9)."""
    data = await file.read()
    filename = file.filename or "document.pdf"
    document_id = uuid.uuid4().hex
    trace_id = uuid.uuid4().hex
    emitter = TraceEmitter(trace_id, f"upload:{filename}")

    store = get_store()
    await store.ensure_session(session_id)
    # 048-persist-traces: pin the session on the upload emitter too, so every
    # ingestion event carries it through to `trace_events.session_id`.
    emitter.session_id = session_id
    # 040-message-attachments: captured by the producer below, read by the
    # done frame so the FE composer can stage the freshly-ingested doc as a
    # chip without a follow-up `GET /documents` round-trip. ``-1`` if the
    # producer never reaches the ingest result (early crash).
    ingest_result: dict[str, Any] = {"chunk_count": -1}

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.FRONTEND,
                Phase.END,
                "User uploaded a PDF",
                {"filename": filename, "session_id": session_id},
            )
            async with emitter.stage(
                Stage.BACKEND, "API received the upload", {"filename": filename}
            ) as rec:
                # 034-storage-ingestion-flow — persist the file to durable object
                # storage first, then let the indexer read it back. The write is
                # real (filesystem stand-in for Blob/S3), so the step is load-bearing.
                content_type = file.content_type or "application/pdf"
                key = object_key(session_id, document_id, filename)
                async with emitter.stage(
                    Stage.STORAGE_UPLOAD, "Storing the upload", {"filename": filename}
                ) as srec:
                    uri = await asyncio.to_thread(put_object, key, data, content_type)
                    srec.data = {
                        "key": key,
                        "uri": uri,
                        "filename": filename,
                        "size_bytes": len(data),
                        "content_type": content_type,
                    }
                    srec.metrics = {"size_bytes": float(len(data))}
                result = await ingest_uploaded(key, filename, session_id, document_id, emitter)
                # Track the document relationally (the vectors live in Chroma).
                await store.add_document(session_id, document_id, filename, result["chunk_count"])
                rec.data = result
                ingest_result["chunk_count"] = int(result["chunk_count"])
        except Exception as exc:  # noqa: BLE001 - report to the client, don't hang
            await emitter.emit(Stage.BACKEND, Phase.END, "error", {"error": str(exc)})
        finally:
            trace_store.save(emitter)
            await emitter.close()

    async def event_stream():
        task = asyncio.create_task(producer())
        try:
            while True:
                event = await emitter.queue.get()
                if event is emitter.DONE:
                    break
                yield {"event": "trace", "data": event.model_dump_json()}
        finally:
            await task
        yield {
            "event": "done",
            "data": json.dumps(
                {
                    "trace_id": trace_id,
                    "document_id": document_id,
                    "filename": filename,
                    "chunk_count": ingest_result["chunk_count"],
                }
            ),
        }

    return EventSourceResponse(event_stream())


@app.delete("/api/sessions/{session_id}/documents/{document_id}")
async def delete_document(session_id: str, document_id: str):
    """Remove a document: delete exactly its vectors, its stored object, then its
    relational row (AC3 · 034-storage-ingestion-flow)."""
    removed = await asyncio.to_thread(delete_document_vectors, document_id)
    objects_removed = await asyncio.to_thread(delete_document_objects, session_id, document_id)
    row = await get_store().delete_document(session_id, document_id)
    return {**row, "vectors_removed": removed, "objects_removed": objects_removed}


# --- Skills catalog (027-skills) --------------------------------------------


@app.get("/api/skills", response_model=list[SkillOut])
async def list_skills():
    """The global skill catalog, name-ordered — backs the ⚙️ Skills section."""
    return await get_store().list_skills()


@app.post("/api/skills", response_model=SkillOut)
async def create_skill(skill: SkillIn):
    """Create a skill. A duplicate ``name`` is a 409 (the handle must be unique)."""
    try:
        return await get_store().create_skill(skill.name, skill.description, skill.body)
    except DuplicateSkillName as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.put("/api/skills/{skill_id}", response_model=SkillOut)
async def update_skill(skill_id: str, skill: SkillIn):
    """Replace a skill's fields. 404 if it doesn't exist, 409 on a name clash."""
    try:
        row = await get_store().update_skill(skill_id, skill.name, skill.description, skill.body)
    except DuplicateSkillName as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(status_code=404, detail="skill not found")
    return row


@app.delete("/api/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """Delete a skill from the catalog."""
    return await get_store().delete_skill(skill_id)
