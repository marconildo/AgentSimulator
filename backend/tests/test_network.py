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
    resolve_dns,
)
from app.schemas import ChatRequest, Stage, TraceEvent

_REPO_ROOT = Path(__file__).resolve().parents[2]
# 090-waf-after-lb: transit order is DNS → CDN → TLS/LB → WAF → API-GW (the WAF
# inspects already-decrypted HTTP, so it sits after the LB terminates TLS).
_NETWORK_STAGES = ["dns", "cdn", "lb", "waf", "apigw"]


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

    # 090: the uncacheable chat API is a pass-through — Varnish stamps BYPASS, which
    # the parser surfaces verbatim (no coincidental "MISS").
    bypass = read_cdn({"x-cache": "BYPASS", "x-cache-server": "varnish"})
    assert bypass.seen and bypass.cache == "BYPASS"

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
        # 090: the dynamic chat API is uncacheable, so the CDN reports a BYPASS
        # (pass-through), never a coincidental cache MISS.
        "X-Cache": "BYPASS",
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

    # Ordered DNS → CDN → TLS/LB → WAF → API-GW, all before BACKEND.
    ordered = [seqs[s] for s in _NETWORK_STAGES]
    assert ordered == sorted(ordered)
    backend_seq = min(e["seq"] for e in events if e["stage"] == "backend")
    assert max(ordered) < backend_seq

    # The LB is emitted before the WAF (the WAF inspects decrypted HTTP).
    assert seqs["lb"] < seqs["waf"]

    # Real evidence flowed through (not placeholder constants).
    waf = next(e for e in events if e["stage"] == "waf")
    assert waf["data"]["status"] == "clean"
    cdn = next(e for e in events if e["stage"] == "cdn")
    assert cdn["data"]["cache"] == "BYPASS"


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


# --- 090-waf-after-lb: the real chain order matches the canvas ----------------
# CI does not run Docker, so the transit order is pinned by auditing the infra
# config files. This is the honesty guard (§2): the picture (WAF after LB) can
# never silently drift from the real containers (varnish → haproxy → modsecurity
# → kong → backend), and the "WAF cleared" attestation must be stamped by the hop
# downstream of the WAF (Kong), not by HAProxy which is now upstream of it.


def test_real_chain_forwards_waf_after_the_load_balancer():
    varnish = (_REPO_ROOT / "infra/varnish/default.vcl").read_text(encoding="utf-8")
    haproxy = (_REPO_ROOT / "infra/haproxy/haproxy.cfg").read_text(encoding="utf-8")
    compose = (_REPO_ROOT / "docker-compose.yml").read_text(encoding="utf-8")

    # Varnish (CDN) forwards to HAProxy (TLS/LB), not to the WAF.
    assert 'host = "haproxy"' in varnish
    assert 'host = "modsecurity"' not in varnish
    # HAProxy (TLS/LB) forwards to ModSecurity (WAF), not straight to Kong.
    assert "modsecurity:8080" in haproxy
    assert "kong:8000" not in haproxy
    # ModSecurity (WAF) forwards to Kong (API-GW).
    assert "http://kong:8000" in compose


def test_waf_cleared_attestation_is_stamped_downstream_of_the_waf():
    haproxy = (_REPO_ROOT / "infra/haproxy/haproxy.cfg").read_text(encoding="utf-8").lower()
    kong = (_REPO_ROOT / "infra/kong/kong.yml").read_text(encoding="utf-8").lower()
    # Kong is the first hop past ModSecurity, so reaching it proves the WAF cleared.
    assert "x-waf-status" in kong
    # HAProxy is now upstream of the WAF — it must not *stamp* a WAF-cleared header
    # (a comment explaining the absence is fine; a set-header directive is not).
    assert "set-header x-waf-status" not in haproxy


def test_varnish_reports_bypass_for_the_uncacheable_api():
    varnish = (_REPO_ROOT / "infra/varnish/default.vcl").read_text(encoding="utf-8")
    assert "BYPASS" in varnish


# --- 091-network-appliance-detail-enrichment: richer real evidence -----------


def test_parsers_surface_enriched_evidence():
    cdn = read_cdn(
        {"x-cache": "BYPASS", "x-cache-hits": "0", "x-cache-reason": "uncacheable method (POST)"}
    )
    assert cdn.hits == 0 and cdn.reason == "uncacheable method (POST)"

    waf = read_waf(
        {
            "x-waf-status": "clean",
            "x-waf-anomaly": "0",
            "x-waf-threshold": "5",
            "x-waf-paranoia": "1",
            "x-waf-rules": "0",
        }
    )
    assert waf.anomaly_score == 0 and waf.threshold == 5 and waf.paranoia == 1 and waf.rules == 0

    lb = read_lb(
        {"x-lb-pool-size": "1", "x-lb-algorithm": "roundrobin", "x-lb-backend": "modsecurity"}
    )
    assert lb.pool_size == 1 and lb.algorithm == "roundrobin" and lb.backend == "modsecurity"
    assert lb.seen is True

    gw = read_apigw({"x-gateway": "kong", "x-gateway-policy": "rate-limit: 60/min"})
    assert gw.policy == "rate-limit: 60/min"


def test_enriched_fields_are_present_in_as_data_even_when_absent():
    # The keys always exist (null when not stamped) so the FE can render an honest
    # "not reported" rather than a missing field. Everything stays JSON-serialisable.
    cdn = read_cdn({}).as_data()
    waf = read_waf({}).as_data()
    lb = read_lb({}).as_data()
    gw = read_apigw({}).as_data()
    for data in (cdn, waf, lb, gw):
        json.dumps(data)
    assert "hits" in cdn and "reason" in cdn
    assert "threshold" in waf and "paranoia" in waf
    assert "pool_size" in lb and "algorithm" in lb and "backend" in lb
    assert "policy" in gw


def test_resolve_dns_honest_fallback_on_unreachable_resolver():
    # No resolver at a TEST-NET address → honest "not resolved", never fabricated.
    info = resolve_dns("backend", server="203.0.113.1", timeout=0.2)
    assert info.seen is False
    assert info.address is None and info.ttl is None
    assert info.host == "backend"


def test_resolve_dns_returns_a_real_record_when_reachable():
    # Best-effort real query via a public resolver; skip if egress is unavailable so
    # CI stays deterministic. Proves the real A-record + TTL path (AC1).
    info = resolve_dns("one.one.one.one", server="1.1.1.1", timeout=1.0)
    if not info.seen:
        pytest.skip("no DNS egress in this environment")
    assert info.address and info.ttl is not None


def test_infra_stamps_enriched_evidence_headers():
    varnish = (_REPO_ROOT / "infra/varnish/default.vcl").read_text(encoding="utf-8").lower()
    haproxy = (_REPO_ROOT / "infra/haproxy/haproxy.cfg").read_text(encoding="utf-8").lower()
    kong = (_REPO_ROOT / "infra/kong/kong.yml").read_text(encoding="utf-8").lower()
    assert "x-cache-hits" in varnish and "x-cache-reason" in varnish
    assert "x-lb-pool-size" in haproxy
    assert "x-lb-algorithm" in haproxy
    assert "x-lb-backend" in haproxy
    assert "x-gateway-policy" in kong


def test_varnish_adds_cors_so_the_403_block_is_readable():
    # 093-waf-block-visualization: the WAF's 403 is cross-origin to the FE and would
    # be unreadable without CORS headers — Varnish adds Access-Control-Allow-Origin
    # (only when absent) so the FE can detect the block instead of a network error.
    varnish = (_REPO_ROOT / "infra/varnish/default.vcl").read_text(encoding="utf-8").lower()
    assert "access-control-allow-origin" in varnish


def test_kong_attests_the_waf_config_facts():
    # ModSecurity v3 can't forward its runtime anomaly score upstream, so Kong (the
    # first hop past the WAF) stamps the WAF's real config facts — the same
    # attestation pattern as X-Waf-Status. The per-request score stays unmeasured.
    kong = (_REPO_ROOT / "infra/kong/kong.yml").read_text(encoding="utf-8").lower()
    assert "x-waf-paranoia" in kong and "x-waf-threshold" in kong
