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
from sse_starlette.sse import EventSourceResponse

from .agent import run_agent
from .agent.prompts import SYSTEM_PROMPT
from .agent.tools import agent_tool_specs
from .config import get_settings
from .db.seed import seed_skills
from .db.store import DuplicateSkillName, get_store
from .llm.context import history_pair_tokens
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
    """The chunks the agent retrieved this run, taken from the rag.retrieve END
    event so they can be persisted with the message (D5/AC8)."""
    for ev in reversed(emitter.events):
        if ev.stage == Stage.RAG_RETRIEVE and ev.phase == Phase.END:
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
        "available": False,
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
        "default_system_prompt": SYSTEM_PROMPT,
        "default_top_k": settings.rag_top_k,
        "top_k_min": 1,
        "top_k_max": 8,
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
    }


@app.post("/api/chat")
async def chat(req: ChatRequest):
    settings = get_settings()
    top_k = req.top_k or settings.rag_top_k
    trace_id = uuid.uuid4().hex
    emitter = TraceEmitter(trace_id, req.message)

    store = get_store()
    # Adopt the conversation this message belongs to, lazy-creating one if the
    # client didn't send a session_id. The id is echoed on the SSE `done` event.
    session = await store.ensure_session(req.session_id or uuid.uuid4().hex)
    session_id = session["id"]

    # The resolved POST body the backend actually acted on, echoed onto the
    # frontend event so the client/backend inspector can show it verbatim
    # (007-numeric-transparency, Q2). top_k is the resolved value (default when
    # omitted); the 006 overrides are included only when the client sent them, so
    # the body reflects exactly what executed.
    request_body: dict[str, Any] = {
        "message": req.message,
        "session_id": session_id,
        "top_k": top_k,
        "mode": req.mode,
        "scenario": req.scenario.value,
    }
    if req.system_prompt is not None:
        request_body["system_prompt"] = req.system_prompt
    if req.enabled_tools is not None:
        request_body["enabled_tools"] = req.enabled_tools
    # Include the forced failure only when set (017) — a `none` run echoes nothing
    # extra, so the body still reflects exactly what executed (AC1).
    if req.simulate_failure != SimulateFailure.NONE:
        request_body["simulate_failure"] = req.simulate_failure.value

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
                    system_prompt=req.system_prompt,
                    enabled_tools=req.enabled_tools,
                    scenario=req.scenario,
                    simulate_failure=req.simulate_failure,
                    skills_catalog=skills_catalog,
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
    summary = trace_store.get(trace_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return summary


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


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    """Delete a conversation + its messages (keeps PDF embeddings — D6, AC4)."""
    return await get_store().delete_session(session_id)


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
