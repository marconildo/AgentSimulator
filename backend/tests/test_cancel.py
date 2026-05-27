"""016-cancel-stream — server-aware cancellation (AC4, AC6).

A client disconnect mid-stream must cancel the in-flight producer task *before*
``db.write``, so the agent run is genuinely interrupted and the turn is never
persisted (discard).

httpx's ASGITransport (and Starlette's TestClient built on it) buffers the whole
response — it runs the app to completion before the caller sees a byte — so it
cannot model a mid-stream disconnect. Instead we drive the ``EventSourceResponse``
body iterator directly and close it early: that is exactly what sse_starlette
does when the client goes away (it cancels the streaming task, which finalizes
the async generator via ``aclose()``, raising ``GeneratorExit`` at its suspension
point — the same path our ``event_stream`` cleanup handles).
"""

import json
import uuid

import pytest

from app.db.store import get_store
from app.main import chat
from app.schemas import ChatRequest
from app.trace import trace_store


@pytest.mark.openai
async def test_disconnect_mid_stream_cancels_producer_and_discards_turn():
    store = get_store()
    session = await store.ensure_session(uuid.uuid4().hex)
    sid = session["id"]

    resp = await chat(ChatRequest(message="What is RAG?", session_id=sid))
    agen = resp.body_iterator

    # Read a couple of live trace events, then disconnect mid-stream. These early
    # events (frontend / backend / db.read) fire well before the agent loop, so
    # cancellation lands squarely inside the in-flight run — before db.write.
    first = await agen.__anext__()
    second = await agen.__anext__()
    trace_id = json.loads(first["data"])["trace_id"]
    early_stages = {json.loads(e["data"])["stage"] for e in (first, second)}
    assert "db.write" not in early_stages

    # Disconnect. Closing the generator is what the SSE machinery does when the
    # client goes away — it must neither hang nor raise.
    await agen.aclose()

    # AC4 — the cancelled turn is discarded: no message was persisted for it.
    assert await store.list_messages(sid) == []

    # AC6 — the producer was genuinely interrupted before db.write. Its finally
    # still saved the *partial* trace (a clean terminal state, no 500), but that
    # trace reached neither persistence nor a respond stage.
    summary = trace_store.get(trace_id)
    assert summary is not None
    stages = {e.stage for e in summary.events}
    assert "db.write" not in stages
    assert "respond" not in stages
