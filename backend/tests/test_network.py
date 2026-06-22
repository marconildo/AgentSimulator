"""088-network-layer: the real ingress chain (DNS · CDN · WAF · TLS/LB · API-GW).

The chain is real (five appliance containers come up with ``docker compose up``)
but the backend reports only the *evidence* each appliance injects via forwarded
headers — the ``edge.py`` honesty seam, extended in ``network.py``. The five
events fire before the agent boots — like ``frontend``/``edge`` — so this suite is
**keyless** (no OpenAI key). The header parsers are pure and unit-tested; the
emission and the ``network_available`` gate are asserted over the API.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import get_settings
from app.main import app
from app.network import (
    network_available,
    read_apigw,
    read_cdn,
    read_dns,
    read_lb,
    read_waf,
)
from app.schemas import ChatRequest, Stage, TraceEvent

_REPO_ROOT = Path(__file__).resolve().parents[2]
_NETWORK_STAGES = ["dns", "cdn", "waf", "lb", "apigw"]


# --- AC8: protocol surface --------------------------------------------------


def test_network_stages_serialize_as_strings():
    for stage, value in (
        (Stage.DNS, "dns"),
        (Stage.CDN, "cdn"),
        (Stage.WAF, "waf"),
        (Stage.LB, "lb"),
        (Stage.APIGW, "apigw"),
    ):
        assert stage == value
        payload = TraceEvent(trace_id="t", seq=1, stage=stage).model_dump_json()
        assert f'"stage":"{value}"' in payload


def test_chat_request_network_defaults_false():
    assert ChatRequest(message="hi").network is False
    assert ChatRequest(message="hi", network=True).network is True


def test_chat_request_rejects_non_bool_network():
    with pytest.raises(ValidationError):
        ChatRequest(message="hi", network="sometimes")


# --- AC5: the pure header parsers (real evidence in, honest "not seen" out) --


def test_parsers_read_real_appliance_headers():
    dns = read_dns(
        {"x-dns-host": "backend.internal", "x-dns-address": "10.0.0.5", "x-dns-ttl": "30"}
    )
    assert (
        dns.seen and dns.host == "backend.internal" and dns.address == "10.0.0.5" and dns.ttl == 30
    )

    cdn = read_cdn({"x-cache": "MISS", "age": "0", "x-cache-server": "varnish"})
    assert cdn.seen and cdn.cache == "MISS" and cdn.age == 0 and cdn.server == "varnish"

    waf = read_waf(
        {
            "x-waf-status": "clean",
            "x-waf-rules": "0",
            "x-waf-anomaly": "0",
            "x-waf-engine": "modsecurity",
        }
    )
    assert waf.seen and waf.status == "clean" and waf.rules == 0 and waf.engine == "modsecurity"

    lb = read_lb(
        {
            "x-lb-tls-version": "TLSv1.3",
            "x-forwarded-proto": "https",
            "x-lb-upstream": "backend:8000",
        }
    )
    assert (
        lb.seen
        and lb.tls_version == "TLSv1.3"
        and lb.scheme == "https"
        and lb.upstream == "backend:8000"
    )

    gw = read_apigw({"x-kong-route": "chat", "x-ratelimit-remaining": "59", "x-gateway": "kong"})
    assert gw.seen and gw.route == "chat" and gw.rate_limit_remaining == 59 and gw.gateway == "kong"


def test_parsers_report_not_seen_without_the_chain():
    for info in (read_dns({}), read_cdn({}), read_lb({}), read_apigw({})):
        assert info.seen is False
    # The WAF defaults to a clean pass when absent (a blocked request never reaches us),
    # but reports it never saw the appliance.
    waf = read_waf({})
    assert waf.seen is False and waf.status == "clean"


def test_as_data_is_jsonable():
    for info in (
        read_dns({"x-dns-host": "h"}),
        read_cdn({"x-cache": "HIT"}),
        read_waf({"x-waf-status": "clean"}),
        read_lb({"x-lb-upstream": "u"}),
        read_apigw({"x-gateway": "kong"}),
    ):
        json.dumps(info.as_data())  # must serialize


# --- AC3/AC11: the availability gate ----------------------------------------


def test_network_available_reflects_the_setting(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("NETWORK_CHAIN", "false")
    get_settings.cache_clear()
    assert network_available() is False
    monkeypatch.setenv("NETWORK_CHAIN", "true")
    get_settings.cache_clear()
    assert network_available() is True
    monkeypatch.delenv("NETWORK_CHAIN", raising=False)
    get_settings.cache_clear()


def test_config_exposes_network_available():
    with TestClient(app) as client:
        cfg = client.get("/api/config").json()
    assert "network_available" in cfg
    assert isinstance(cfg["network_available"], bool)


# --- AC5/AC10/AC12: emission (keyless: fires before the agent boots) ---------


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


def test_chat_emits_five_network_stages_in_order_when_on():
    headers = {
        "X-DNS-Host": "backend.internal",
        "X-DNS-Ttl": "30",
        "X-Cache": "MISS",
        "X-Waf-Status": "clean",
        "X-Lb-Tls-Version": "TLSv1.3",
        "X-Lb-Upstream": "backend:8000",
        "X-Kong-Route": "chat",
        "X-Ratelimit-Remaining": "59",
    }
    with TestClient(app) as client:
        events = _trace_events(
            client, {"message": "hi", "mode": "stream", "network": True}, headers
        )

    seqs = {}
    for stage in _NETWORK_STAGES:
        hits = [e for e in events if e["stage"] == stage]
        assert len(hits) == 1, f"exactly one {stage} event"
        seqs[stage] = hits[0]["seq"]

    # Ordered DNS → CDN → WAF → TLS/LB → API-GW, all before BACKEND.
    ordered = [seqs[s] for s in _NETWORK_STAGES]
    assert ordered == sorted(ordered)
    backend_seq = min(e["seq"] for e in events if e["stage"] == "backend")
    assert max(ordered) < backend_seq

    # Real evidence flowed through (not placeholder constants).
    waf = next(e for e in events if e["stage"] == "waf")
    assert waf["data"]["status"] == "clean"
    cdn = next(e for e in events if e["stage"] == "cdn")
    assert cdn["data"]["cache"] == "MISS"


def test_chat_off_by_default_emits_no_network_stages():
    with TestClient(app) as client:
        events = _trace_events(client, {"message": "hi", "mode": "stream"})
    stages = {e["stage"] for e in events}
    for stage in _NETWORK_STAGES:
        assert stage not in stages
    # The head-of-pipeline is unchanged (baseline).
    assert "frontend" in stages and "backend" in stages


# --- AC11: the real appliance containers are wired into the deployment -------


def test_compose_defines_the_five_appliance_containers():
    compose = _REPO_ROOT / "docker-compose.yml"
    assert compose.exists()
    text = compose.read_text(encoding="utf-8").lower()
    for image in ("coredns", "varnish", "modsecurity", "haproxy", "kong"):
        assert image in text, f"docker-compose must define the real {image} appliance"
