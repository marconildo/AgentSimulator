"""HTTP surface: health, streaming chat, and trace replay."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app


def test_health_reports_live_model_and_no_demo():
    # AC4 [offline] — health is inspectable without a key; demo mode is gone.
    with TestClient(app) as client:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert "demo_mode" not in body
        assert body["llm_provider"] == "openai"
        assert body["llm_model"]


def test_config_endpoint_exposes_experiment_defaults():
    # AC6 (006) — the experiment panel prefills from here (no hardcoded backend
    # constants); inspectable without a key, like health.
    with TestClient(app) as client:
        resp = client.get("/api/config")
        assert resp.status_code == 200
        body = resp.json()
        assert body["default_system_prompt"].strip()
        assert body["default_top_k"] >= 1
        assert (body["top_k_min"], body["top_k_max"]) == (1, 8)
        names = {t["name"] for t in body["tools"]}
        assert {"calculator", "current_time", "kb_lookup"} <= names


def test_chat_rejects_out_of_range_top_k():
    # Q6 — the slider is 1..8; the API validates (422 on out-of-range).
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "hi", "top_k": 99})
        assert resp.status_code == 422


@pytest.mark.openai
def test_chat_streams_events_then_done_and_replays():
    with TestClient(app) as client:
        trace_id = None
        saw_trace_event = False

        with client.stream("POST", "/api/chat", json={"message": "What is RAG?"}) as resp:
            assert resp.status_code == 200
            current_event = None
            for line in resp.iter_lines():
                if line.startswith("event:"):
                    current_event = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    payload = json.loads(line.split(":", 1)[1].strip())
                    if current_event == "trace":
                        saw_trace_event = True
                        trace_id = payload["trace_id"]
                    elif current_event == "done":
                        assert payload["answer"].strip()

        assert saw_trace_event
        assert trace_id

        # The finished trace is replayable.
        replay = client.get(f"/api/trace/{trace_id}")
        assert replay.status_code == 200
        data = replay.json()
        assert data["trace_id"] == trace_id
        assert len(data["events"]) > 5


@pytest.mark.openai
def test_chat_emits_database_stages():
    with TestClient(app) as client:
        stages = set()
        with client.stream("POST", "/api/chat", json={"message": "What is RAG?"}) as resp:
            current_event = None
            for line in resp.iter_lines():
                if line.startswith("event:"):
                    current_event = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and current_event == "trace":
                    stages.add(json.loads(line.split(":", 1)[1].strip())["stage"])
        assert "db.read" in stages
        assert "db.write" in stages


@pytest.mark.openai
def test_batch_returns_full_trace_in_one_json_response():
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is RAG?", "mode": "batch"})
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("application/json")
        body = resp.json()
        assert body["answer"].strip()
        stages = {e["stage"] for e in body["events"]}
        # The whole pipeline still ran...
        assert {"agent.route", "rag.retrieve", "llm.generate", "respond"} <= stages
        # ...but the answer is delivered in one shot — no per-token streaming.
        progress = [
            e for e in body["events"] if e["stage"] == "llm.generate" and e["phase"] == "progress"
        ]
        assert progress == []
        # The batch trace is still replayable by id.
        assert client.get(f"/api/trace/{body['trace_id']}").status_code == 200


@pytest.mark.openai
def test_frontend_event_carries_resolved_request_body():
    # AC3 (007) — the frontend event echoes the resolved POST body the backend
    # acted on: message, session_id, top_k, mode, plus the 006 overrides when sent.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={
                "message": "What is RAG?",
                "mode": "batch",
                "top_k": 2,
                "enabled_tools": ["calculator"],
                "system_prompt": "You are concise.",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        fe = next(e for e in body["events"] if e["stage"] == "frontend")
        rb = fe["data"]["request"]
        assert rb["message"] == "What is RAG?"
        assert rb["session_id"]
        assert rb["top_k"] == 2
        assert rb["mode"] == "batch"
        assert rb["enabled_tools"] == ["calculator"]
        assert rb["system_prompt"] == "You are concise."


@pytest.mark.openai
def test_frontend_request_body_resolves_default_top_k_and_omits_absent_overrides():
    # AC3 — top_k resolves to the configured default when omitted; overrides that
    # weren't sent are not echoed (the body reflects exactly what the server used).
    from app.config import get_settings

    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is RAG?", "mode": "batch"})
        body = resp.json()
        fe = next(e for e in body["events"] if e["stage"] == "frontend")
        rb = fe["data"]["request"]
        assert rb["top_k"] == get_settings().rag_top_k
        assert rb["mode"] == "batch"  # faithfully echoes the mode that executed
        assert "system_prompt" not in rb
        assert "enabled_tools" not in rb


def test_unknown_trace_returns_404():
    with TestClient(app) as client:
        assert client.get("/api/trace/nope").status_code == 404


# --- 002-interactive-chat: sessions / messages / documents ------------------


def _stream_chat(client, body):
    """POST /api/chat (stream) and return (trace_ids, done_payload)."""
    done = None
    trace_id = None
    with client.stream("POST", "/api/chat", json=body) as resp:
        assert resp.status_code == 200
        current = None
        for line in resp.iter_lines():
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                payload = json.loads(line.split(":", 1)[1].strip())
                if current == "trace":
                    trace_id = payload["trace_id"]
                elif current == "done":
                    done = payload
    return trace_id, done


def test_session_crud_endpoints():
    # AC5/AC6/AC4 (DB-free) — create, list recent-first, delete.
    with TestClient(app) as client:
        a = client.post("/api/sessions").json()
        b = client.post("/api/sessions").json()
        assert a["id"] and b["id"] and a["id"] != b["id"]

        listed = client.get("/api/sessions").json()
        ids = [s["id"] for s in listed]
        # Both present, newest first.
        assert ids.index(b["id"]) < ids.index(a["id"])
        assert all(
            {"id", "title", "created_at", "updated_at", "message_count"} <= set(s) for s in listed
        )

        assert client.delete(f"/api/sessions/{a['id']}").status_code == 200
        assert a["id"] not in [s["id"] for s in client.get("/api/sessions").json()]


def test_messages_and_documents_endpoints_empty_for_new_session():
    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        assert client.get(f"/api/sessions/{sid}/messages").json() == []
        assert client.get(f"/api/sessions/{sid}/documents").json() == []


@pytest.mark.openai
def test_chat_in_session_persists_message_chunks_and_title():
    # AC1 + AC8 + D7 — a sent message and its retrieved chunks are persisted under
    # the session, and the first message titles the conversation.
    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        _, done = _stream_chat(client, {"message": "What is RAG?", "session_id": sid})
        assert done is not None
        assert done["session_id"] == sid  # done echoes the session
        assert done["answer"].strip()

        msgs = client.get(f"/api/sessions/{sid}/messages").json()
        assert len(msgs) == 1
        assert msgs[0]["message"] == "What is RAG?"
        assert msgs[0]["answer"].strip()
        # AC8 — the chunks retrieved for the message are persisted with it.
        assert isinstance(msgs[0]["chunks"], list) and len(msgs[0]["chunks"]) >= 1
        assert all({"text", "source", "score"} <= set(c) for c in msgs[0]["chunks"])

        # D7 — the session is now titled by its first message; count reflects it.
        sess = next(s for s in client.get("/api/sessions").json() if s["id"] == sid)
        assert sess["title"] and sess["title"].startswith("What is RAG")
        assert sess["message_count"] == 1


@pytest.mark.openai
def test_clear_session_deletes_messages():
    # AC4 (API side) — deleting the session removes its messages.
    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        _stream_chat(client, {"message": "What is RAG?", "session_id": sid})
        assert len(client.get(f"/api/sessions/{sid}/messages").json()) == 1

        assert client.delete(f"/api/sessions/{sid}").status_code == 200
        # The session is gone; its messages return empty.
        assert client.get(f"/api/sessions/{sid}/messages").json() == []
        assert sid not in [s["id"] for s in client.get("/api/sessions").json()]


@pytest.mark.openai
def test_chat_lazy_creates_session_when_absent():
    # The endpoint creates a session if the client sends none, echoing its id.
    with TestClient(app) as client:
        _, done = _stream_chat(client, {"message": "What is RAG?"})
        assert done["session_id"]
        # The lazy-created session is listed and holds the message.
        assert done["session_id"] in [s["id"] for s in client.get("/api/sessions").json()]
        assert len(client.get(f"/api/sessions/{done['session_id']}/messages").json()) == 1


@pytest.mark.openai
def test_upload_document_streams_ingestion_stages_and_lists_it():
    # AC9 + AC2 (over HTTP) — the upload endpoint streams chunk -> embed -> store
    # and the PDF then appears in the conversation's document list.
    from tests.test_ingestion import make_pdf

    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        pdf = make_pdf(["Grounding context improves answers."])

        stages, done = [], None
        with client.stream(
            "POST",
            f"/api/sessions/{sid}/documents",
            files={"file": ("notes.pdf", pdf, "application/pdf")},
        ) as resp:
            assert resp.status_code == 200
            current = None
            for line in resp.iter_lines():
                if line.startswith("event:"):
                    current = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    payload = json.loads(line.split(":", 1)[1].strip())
                    if current == "trace":
                        stages.append(payload["stage"])
                    elif current == "done":
                        done = payload

        # The three ingest stages fire, in order (each appears as START + END).
        ingest_ends = [s for s in stages if s.startswith("rag.ingest")]
        first_seen = list(dict.fromkeys(ingest_ends))
        assert first_seen == ["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"]
        assert done and done["document_id"]

        docs = client.get(f"/api/sessions/{sid}/documents").json()
        assert len(docs) == 1
        assert docs[0]["filename"] == "notes.pdf"
        assert docs[0]["chunk_count"] >= 1

        # AC3 — removing the document drops its row and its vectors.
        resp = client.delete(f"/api/sessions/{sid}/documents/{done['document_id']}")
        assert resp.status_code == 200
        assert resp.json()["vectors_removed"] >= 1
        assert client.get(f"/api/sessions/{sid}/documents").json() == []


# --- 040-message-attachments ------------------------------------------------


def test_chat_request_validates_attachment_document_ids_bounds():
    # AC5 (schema, keyless) — the new request field is optional, accepts a list
    # of strings, and is bounded to 16 ids so the chip strip + the JSON body
    # stay reasonable.
    from app.schemas import ChatRequest

    # Default is None (today's behavior preserved, the field is opt-in).
    assert ChatRequest(message="hi").attachment_document_ids is None
    # An empty list is fine — explicitly no attachments.
    assert ChatRequest(message="hi", attachment_document_ids=[]).attachment_document_ids == []
    # Up to 16 ids round-trip.
    ids = [f"d{i}" for i in range(16)]
    assert ChatRequest(message="hi", attachment_document_ids=ids).attachment_document_ids == ids

    # 17 is rejected by Pydantic validation.
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ChatRequest(message="hi", attachment_document_ids=[f"d{i}" for i in range(17)])


def test_list_messages_returns_documents_field_keyless():
    # AC6 (REST surface, keyless) — /api/sessions/{sid}/messages exposes the
    # `documents` array on every message; defaulting to [] for messages written
    # without attachments. Bypasses the chat endpoint by writing directly to
    # the store, so this exercises only the REST→DB read path.
    import asyncio

    from app.db.store import get_store

    store = get_store()

    async def _seed():
        sid = (await store.create_session())["id"]
        await store.add_document(sid, "doc-aa", "a.pdf", chunk_count=2)
        await store.write_message(sid, "m-bare", "q1", "a1")
        await store.write_message(sid, "m-att", "q2", "a2", attached_document_ids=["doc-aa"])
        return sid

    sid = asyncio.run(_seed())

    with TestClient(app) as client:
        msgs = client.get(f"/api/sessions/{sid}/messages").json()
        by_id = {m["id"]: m for m in msgs}
        assert by_id["m-bare"]["documents"] == []
        attached = by_id["m-att"]["documents"]
        assert [d["document_id"] for d in attached] == ["doc-aa"]
        assert attached[0]["filename"] == "a.pdf"
        assert attached[0]["chunk_count"] == 2


@pytest.mark.openai
def test_chat_request_attaches_documents_through_endpoint():
    # AC5 (integration) — POST /api/chat with attachment_document_ids persists
    # the link via db.write; list_messages then reflects it. Uses batch mode so
    # the assertion is direct (one JSON response).
    import asyncio

    from app.db.store import get_store

    store = get_store()

    async def _seed_doc(sid):
        await store.add_document(sid, "doc-z9", "z.pdf", chunk_count=1)

    with TestClient(app) as client:
        sid = client.post("/api/sessions").json()["id"]
        asyncio.run(_seed_doc(sid))

        resp = client.post(
            "/api/chat",
            json={
                "message": "What is RAG?",
                "session_id": sid,
                "mode": "batch",
                "attachment_document_ids": ["doc-z9"],
            },
        )
        assert resp.status_code == 200

        msgs = client.get(f"/api/sessions/{sid}/messages").json()
        assert len(msgs) == 1
        assert [d["document_id"] for d in msgs[0]["documents"]] == ["doc-z9"]
