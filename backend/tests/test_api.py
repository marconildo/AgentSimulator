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


def test_unknown_trace_returns_404():
    with TestClient(app) as client:
        assert client.get("/api/trace/nope").status_code == 404
