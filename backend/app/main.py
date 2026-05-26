"""FastAPI entrypoint.

Exposes a single streaming endpoint (``POST /api/chat``) that runs the agent
and emits the lifecycle as Server-Sent Events, plus a replay endpoint
(``GET /api/trace/{id}``) and a health check.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .agent import run_agent
from .config import get_settings
from .db.store import get_store
from .rag.ingest import build_index
from .rag.store import index_matches_model, is_indexed, reset_vectorstore_cache
from .schemas import ChatRequest, Phase, Stage
from .trace import TraceEmitter, trace_store


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

    async def producer() -> None:
        try:
            await emitter.emit(
                Stage.FRONTEND, Phase.END, "User sent a message", {"message": req.message}
            )
            async with emitter.stage(
                Stage.BACKEND, "API received the request", {"message": req.message}
            ) as rec:
                store = get_store()
                # Read recent history from the application database (system of record).
                # This is the agent's long-term memory, folded into the prompt context.
                async with emitter.stage(
                    Stage.DB_READ, "Loading recent history", {"table": "conversations"}
                ) as db_rec:
                    history = await store.read_history()
                    db_rec.data = history

                await run_agent(
                    req.message, top_k, emitter, history=history["recent"], mode=req.mode
                )

                # Persist the finished conversation — separate from the RAG vector store.
                async with emitter.stage(Stage.DB_WRITE, "Persisting the conversation") as db_rec:
                    db_rec.data = await store.write(trace_id, req.message, emitter.answer)

                rec.data = {
                    "answer": emitter.answer,
                    "delivery": req.mode,
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
            "data": json.dumps({"trace_id": trace_id, "answer": emitter.answer}),
        }

    return EventSourceResponse(event_stream())


@app.get("/api/trace/{trace_id}")
async def get_trace(trace_id: str):
    summary = trace_store.get(trace_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return summary
