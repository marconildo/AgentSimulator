"""FastAPI entrypoint.

Exposes a streaming chat endpoint (``POST /api/chat``) that runs the agent and
emits the lifecycle as Server-Sent Events, a trace-replay endpoint
(``GET /api/trace/{id}``), a health check, and the session / message / document
REST surface that backs the interactive chat (002-interactive-chat).
"""

from __future__ import annotations

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .agent import run_agent
from .config import get_settings
from .db.store import get_store
from .rag.ingest import build_index
from .rag.ingestion import delete_document_vectors, ingest_pdf
from .rag.store import index_matches_model, is_indexed, reset_vectorstore_cache
from .schemas import ChatRequest, Phase, Stage
from .trace import TraceEmitter, trace_store


def _retrieved_chunks(emitter: TraceEmitter) -> list[dict[str, Any]]:
    """The chunks the agent retrieved this run, taken from the rag.retrieve END
    event so they can be persisted with the message (D5/AC8)."""
    for ev in reversed(emitter.events):
        if ev.stage == Stage.RAG_RETRIEVE and ev.phase == Phase.END:
            return list(ev.data.get("chunks", []))
    return []


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

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.FRONTEND,
                Phase.END,
                "User sent a message",
                {"message": req.message, "session_id": session_id},
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
                    db_rec.data = history

                await run_agent(
                    req.message,
                    top_k,
                    emitter,
                    history=history["recent"],
                    mode=req.mode,
                    session_id=session_id,
                )

                # Persist the finished message + the chunks retrieved for it
                # (D5) — separate from the RAG vector store.
                async with emitter.stage(Stage.DB_WRITE, "Persisting the conversation") as db_rec:
                    db_rec.data = await store.write_message(
                        session_id,
                        trace_id,
                        req.message,
                        emitter.answer,
                        chunks=_retrieved_chunks(emitter),
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
                result = await ingest_pdf(data, filename, session_id, document_id, emitter)
                # Track the document relationally (the vectors live in Chroma).
                await store.add_document(session_id, document_id, filename, result["chunk_count"])
                rec.data = result
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
                {"trace_id": trace_id, "document_id": document_id, "filename": filename}
            ),
        }

    return EventSourceResponse(event_stream())


@app.delete("/api/sessions/{session_id}/documents/{document_id}")
async def delete_document(session_id: str, document_id: str):
    """Remove a document: delete exactly its vectors, then its relational row (AC3)."""
    removed = await asyncio.to_thread(delete_document_vectors, document_id)
    row = await get_store().delete_document(session_id, document_id)
    return {**row, "vectors_removed": removed}
