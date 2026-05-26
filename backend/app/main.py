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
from .llm.provider import get_provider
from .rag.ingest import build_index
from .rag.store import is_indexed
from .schemas import ChatRequest, Phase, Stage
from .trace import TraceEmitter, trace_store


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Build the vector index on first boot if it's missing.
    try:
        if not is_indexed():
            count = build_index()
            print(f"[startup] Built vector index ({count} chunks).")
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
    settings = get_settings()
    provider = get_provider()
    return {
        "status": "ok",
        "demo_mode": settings.is_demo,
        "llm_provider": provider.name,
        "llm_model": provider.model_name,
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
                await run_agent(req.message, top_k, emitter)
                rec.data = {"answer": emitter.answer, "demo_mode": settings.is_demo}
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
            "data": json.dumps({"trace_id": trace_id, "answer": emitter.answer}),
        }

    return EventSourceResponse(event_stream())


@app.get("/api/trace/{trace_id}")
async def get_trace(trace_id: str):
    summary = trace_store.get(trace_id)
    if summary is None:
        raise HTTPException(status_code=404, detail="trace not found")
    return summary
