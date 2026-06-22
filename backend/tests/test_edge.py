"""084-network-edge: the network edge stage (reverse proxy / LB / TLS).

The edge is real (an nginx proxy fronts the backend in docker-compose) but the
backend reports only the *evidence* the proxy injects via forwarded headers. The
``edge`` event fires before the agent boots — like ``frontend`` — so the whole
suite is **keyless** (no OpenAI key needed). The header parser (``read_edge``) is
pure and unit-tested; the emission is asserted over SSE.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.requests import Request

from app.edge import EdgeInfo, read_edge
from app.main import app
from app.schemas import ChatRequest, Stage, TraceEvent

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _make_request(
    headers: dict[str, str], *, client=("203.0.113.7", 54321), scheme="http"
) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/chat",
        "headers": raw,
        "query_string": b"",
        "scheme": scheme,
        "server": ("testserver", 80),
        "client": client,
    }
    return Request(scope)


# --- AC4: protocol surface --------------------------------------------------


def test_stage_edge_serializes_as_dotted_string():
    assert Stage.EDGE == "edge"
    payload = TraceEvent(trace_id="t", seq=1, stage=Stage.EDGE).model_dump_json()
    assert '"stage":"edge"' in payload


def test_chat_request_edge_defaults_true():
    # 2026-06-22 — the edge is always-on platform behaviour now: it defaults True
    # (emits the edge event), and can be explicitly opted out with edge=False.
    assert ChatRequest(message="hi").edge is True
    assert ChatRequest(message="hi", edge=False).edge is False


def test_chat_request_rejects_non_bool_edge():
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", edge="definitely")


# --- AC1/AC2: the pure header parser ---------------------------------------


def test_read_edge_with_forwarded_headers():
    req = _make_request(
        {
            "X-Forwarded-For": "198.51.100.42, 10.0.0.1",
            "X-Forwarded-Proto": "https",
            "X-Request-Id": "req-abc-123",
            "X-Forwarded-Host": "agentsim.example.com",
            "X-Edge-Proxy": "nginx",
        }
    )
    info = read_edge(req)
    assert isinstance(info, EdgeInfo)
    assert info.proxied is True
    assert info.tls is True
    assert info.scheme == "https"
    # The real client is the FIRST entry of X-Forwarded-For, not the socket peer.
    assert info.client_ip == "198.51.100.42"
    assert info.request_id == "req-abc-123"
    assert info.forwarded_host == "agentsim.example.com"
    assert info.proxy_server == "nginx"


def test_read_edge_direct_access_fabricates_nothing():
    req = _make_request({}, client=("203.0.113.7", 54321), scheme="http")
    info = read_edge(req)
    assert info.proxied is False
    assert info.tls is False
    assert info.scheme == "http"
    # Falls back to the socket peer — never invents a forwarded client.
    assert info.client_ip == "203.0.113.7"
    assert info.request_id is None
    assert info.proxy_server is None
    assert info.forwarded_host is None


def test_read_edge_as_data_is_jsonable_and_complete():
    info = read_edge(_make_request({"X-Forwarded-For": "1.2.3.4", "X-Forwarded-Proto": "https"}))
    data = info.as_data()
    assert set(data) == {
        "proxied",
        "tls",
        "scheme",
        "client_ip",
        "request_id",
        "proxy_server",
        "forwarded_host",
    }
    json.dumps(data)  # must be serializable


# --- AC1/AC3: emission over SSE (keyless: fires before the agent boots) ------


def _trace_events(client: TestClient, body: dict, headers: dict | None = None) -> list[dict]:
    events: list[dict] = []
    with client.stream("POST", "/api/chat", json=body, headers=headers or {}) as resp:
        assert resp.status_code == 200, resp.text
        current = None
        for line in resp.iter_lines():
            if line.startswith("event:"):
                current = line.split(":", 1)[1].strip()
            elif line.startswith("data:") and current == "trace":
                events.append(json.loads(line.split(":", 1)[1].strip()))
    return events


def test_chat_emits_edge_before_backend_by_default():
    headers = {
        "X-Forwarded-For": "198.51.100.42",
        "X-Forwarded-Proto": "https",
        "X-Request-Id": "req-xyz",
        "X-Edge-Proxy": "nginx",
    }
    with TestClient(app) as client:
        # No `edge` field — it is on by default now.
        events = _trace_events(client, {"message": "hi", "mode": "stream"}, headers)

    edge = [e for e in events if e["stage"] == "edge"]
    assert len(edge) == 1, "exactly one edge event"
    ev = edge[0]
    assert ev["phase"] == "end"
    assert ev["data"]["proxied"] is True
    assert ev["data"]["tls"] is True
    assert ev["data"]["client_ip"] == "198.51.100.42"
    assert ev["data"]["request_id"] == "req-xyz"

    # Ordered before the backend stage (the edge is the first hop after the client).
    backend_seq = min(e["seq"] for e in events if e["stage"] == "backend")
    assert ev["seq"] < backend_seq


def test_chat_emits_no_edge_event_when_opted_out():
    with TestClient(app) as client:
        # Explicit opt-out: edge=False suppresses the edge event.
        events = _trace_events(client, {"message": "hi", "mode": "stream", "edge": False})
    stages = {e["stage"] for e in events}
    assert "edge" not in stages
    # The rest of the head-of-pipeline is unchanged.
    assert "frontend" in stages
    assert "backend" in stages


def test_request_echo_carries_edge_by_default_and_omits_when_off():
    with TestClient(app) as client:
        # Default run: the edge ran, so the echo carries edge=true.
        events = _trace_events(client, {"message": "hi", "mode": "stream"})
        fe = next(e for e in events if e["stage"] == "frontend")
        assert fe["data"]["request"].get("edge") is True

    with TestClient(app) as client:
        events = _trace_events(client, {"message": "hi", "mode": "stream", "edge": False})
        fe = next(e for e in events if e["stage"] == "frontend")
        assert "edge" not in fe["data"]["request"]


# --- AC9: the real proxy is wired into the deployment -----------------------


def test_nginx_config_present_and_sets_forwarded_headers():
    conf = _REPO_ROOT / "infra" / "nginx" / "nginx.conf"
    assert conf.exists(), "infra/nginx/nginx.conf must exist (the real edge proxy)"
    text = conf.read_text(encoding="utf-8").lower()
    assert "x-forwarded-for" in text
    assert "x-forwarded-proto" in text
    assert "x-request-id" in text
    assert "proxy_pass" in text


def test_compose_defines_edge_service():
    compose = _REPO_ROOT / "docker-compose.yml"
    assert compose.exists()
    text = compose.read_text(encoding="utf-8")
    assert "nginx" in text, "docker-compose must run the nginx edge proxy"
