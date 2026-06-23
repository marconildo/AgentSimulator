"""Network-layer introspection (088-network-layer).

The production ingress is a chain of real, separately-deployed appliances the
request genuinely transits before the app sees it:

    browser → DNS (CoreDNS) → CDN/cache (Varnish) → WAF (ModSecurity/CRS)
            → TLS/LB (HAProxy) → API-GW (Kong) → backend

Each appliance injects a small evidence header on the way through; this module
reads those headers back out and reports **only what they prove** — the same
honesty seam as :mod:`app.edge` (``proxied`` there). With no chain in front (a
bare ``uvicorn`` run), the headers are absent and each reader reports an honest
"not seen" rather than fabricating a value.

The appliance containers come up with ``docker compose up``; the request's
``network`` toggle only controls whether the caller (``main.py``) *emits* the
five stages — this module never starts or stops anything. The parsers are pure
(no I/O) so they unit-test without a running chain or an OpenAI key.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from starlette.requests import Request

from .config import get_settings


def network_available() -> bool:
    """Whether the real ingress chain is present (the Docker network stack is up).

    A simple presence flag set by the compose stack (``NETWORK_CHAIN=1``) — not a
    Docker-daemon probe and never a control surface. The frontend gates its Build
    "Network" component on this (disabled when ``False``).
    """
    return get_settings().network_chain


def _get(headers: Mapping[str, str], name: str) -> str | None:
    """A trimmed header value, or None when absent/blank (case-insensitive)."""
    value = (headers.get(name) or "").strip()
    return value or None


def _first(value: str | None) -> str | None:
    """The first entry of a comma-joined forwarded header."""
    if not value:
        return None
    head = value.split(",")[0].strip()
    return head or None


@dataclass(frozen=True)
class DnsInfo:
    """DNS resolution evidence (the chain resolves the next hop via CoreDNS)."""

    seen: bool
    host: str | None
    address: str | None
    ttl: int | None

    def as_data(self) -> dict[str, Any]:
        return {"seen": self.seen, "host": self.host, "address": self.address, "ttl": self.ttl}


@dataclass(frozen=True)
class CdnInfo:
    """CDN / edge-cache evidence (Varnish ``X-Cache`` / ``Age``).

    091: ``hits`` (``obj.hits``) and ``reason`` (why the decision happened, e.g.
    "uncacheable method (POST)") make the HIT/MISS/BYPASS verdict legible — the app
    can say *whether* the cache was consulted and *why*, not just the outcome.
    """

    seen: bool
    cache: str | None  # "HIT" | "MISS" | "BYPASS" | None
    age: int | None
    server: str | None
    hits: int | None = None
    reason: str | None = None

    def as_data(self) -> dict[str, Any]:
        return {
            "seen": self.seen,
            "cache": self.cache,
            "age": self.age,
            "server": self.server,
            "hits": self.hits,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class WafInfo:
    """Web Application Firewall evidence (ModSecurity / OWASP CRS).

    A *blocked* request never reaches the backend (the WAF returns 403), so what
    the app observes is a clean pass. ``status`` is "clean" unless the WAF reports
    otherwise via its evidence header.
    """

    seen: bool
    status: str  # "clean" | "blocked"
    rules: int | None
    anomaly_score: int | None
    engine: str | None
    # 091: the verdict's basis — the inbound anomaly score vs the block threshold and
    # the active paranoia level, so a "clean" pass is legible (anomaly 0/5 · PL1).
    threshold: int | None = None
    paranoia: int | None = None

    def as_data(self) -> dict[str, Any]:
        return {
            "seen": self.seen,
            "status": self.status,
            "rules": self.rules,
            "anomaly_score": self.anomaly_score,
            "engine": self.engine,
            "threshold": self.threshold,
            "paranoia": self.paranoia,
        }


@dataclass(frozen=True)
class LbInfo:
    """TLS / load-balancer evidence (HAProxy terminates TLS, picks an upstream)."""

    seen: bool
    tls_version: str | None
    scheme: str | None
    upstream: str | None
    server: str | None
    # 091: the load-balancing picture — how many backends are in the pool, the
    # algorithm, and which backend this request was sent to. Honest §7 caveat: a
    # one-node pool here, so ``pool_size`` is 1 and the chosen backend is always it.
    pool_size: int | None = None
    algorithm: str | None = None
    backend: str | None = None

    def as_data(self) -> dict[str, Any]:
        return {
            "seen": self.seen,
            "tls_version": self.tls_version,
            "scheme": self.scheme,
            "upstream": self.upstream,
            "server": self.server,
            "pool_size": self.pool_size,
            "algorithm": self.algorithm,
            "backend": self.backend,
        }


@dataclass(frozen=True)
class ApiGwInfo:
    """API-gateway evidence (Kong route + rate-limit headers)."""

    seen: bool
    route: str | None
    rate_limit_remaining: int | None
    upstream_latency_ms: int | None
    gateway: str | None
    # 091: the enforced policy (e.g. "rate-limit: 60/min") — static + real, unlike
    # the live remaining count which is a response header and can't reach us upstream.
    policy: str | None = None

    def as_data(self) -> dict[str, Any]:
        return {
            "seen": self.seen,
            "route": self.route,
            "rate_limit_remaining": self.rate_limit_remaining,
            "upstream_latency_ms": self.upstream_latency_ms,
            "gateway": self.gateway,
            "policy": self.policy,
        }


@dataclass(frozen=True)
class NetworkInfo:
    """The whole chain's evidence — one sub-record per appliance, in transit order."""

    dns: DnsInfo
    cdn: CdnInfo
    waf: WafInfo
    lb: LbInfo
    apigw: ApiGwInfo

    @property
    def present(self) -> bool:
        """Whether *any* appliance left evidence (the request really crossed the chain)."""
        return any((self.dns.seen, self.cdn.seen, self.waf.seen, self.lb.seen, self.apigw.seen))


def _int(value: str | None) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except ValueError:
        return None


def read_dns(headers: Mapping[str, str]) -> DnsInfo:
    host = _get(headers, "x-dns-host")
    address = _get(headers, "x-dns-address")
    ttl = _int(_get(headers, "x-dns-ttl"))
    return DnsInfo(seen=any((host, address, ttl is not None)), host=host, address=address, ttl=ttl)


def read_cdn(headers: Mapping[str, str]) -> CdnInfo:
    cache = _get(headers, "x-cache")  # Varnish: "HIT" / "MISS" / "BYPASS"
    age = _int(_get(headers, "age"))
    server = _get(headers, "x-cache-server")
    hits = _int(_get(headers, "x-cache-hits"))
    reason = _get(headers, "x-cache-reason")
    return CdnInfo(
        seen=cache is not None, cache=cache, age=age, server=server, hits=hits, reason=reason
    )


def read_waf(headers: Mapping[str, str]) -> WafInfo:
    status = (_get(headers, "x-waf-status") or "clean").lower()
    rules = _int(_get(headers, "x-waf-rules"))
    anomaly = _int(_get(headers, "x-waf-anomaly"))
    engine = _get(headers, "x-waf-engine")
    threshold = _int(_get(headers, "x-waf-threshold"))
    paranoia = _int(_get(headers, "x-waf-paranoia"))
    seen = any(
        (
            _get(headers, "x-waf-status"),
            rules is not None,
            anomaly is not None,
            engine,
            threshold is not None,
            paranoia is not None,
        )
    )
    return WafInfo(
        seen=seen,
        status=status,
        rules=rules,
        anomaly_score=anomaly,
        engine=engine,
        threshold=threshold,
        paranoia=paranoia,
    )


def read_lb(headers: Mapping[str, str]) -> LbInfo:
    tls_version = _get(headers, "x-lb-tls-version")
    scheme = _first(_get(headers, "x-forwarded-proto"))
    upstream = _get(headers, "x-lb-upstream")
    server = _get(headers, "x-lb-server")
    pool_size = _int(_get(headers, "x-lb-pool-size"))
    algorithm = _get(headers, "x-lb-algorithm")
    backend = _get(headers, "x-lb-backend")
    return LbInfo(
        seen=any((tls_version, upstream, server, pool_size is not None, algorithm, backend)),
        tls_version=tls_version,
        scheme=scheme,
        upstream=upstream,
        server=server,
        pool_size=pool_size,
        algorithm=algorithm,
        backend=backend,
    )


def read_apigw(headers: Mapping[str, str]) -> ApiGwInfo:
    route = _get(headers, "x-kong-route") or _get(headers, "x-gateway-route")
    remaining = _int(_get(headers, "x-ratelimit-remaining"))
    upstream_latency = _int(_get(headers, "x-kong-upstream-latency"))
    gateway = _get(headers, "x-gateway") or _first(_get(headers, "via"))
    policy = _get(headers, "x-gateway-policy")
    return ApiGwInfo(
        seen=any((route, remaining is not None, upstream_latency is not None, gateway, policy)),
        route=route,
        rate_limit_remaining=remaining,
        upstream_latency_ms=upstream_latency,
        gateway=gateway,
        policy=policy,
    )


# The real CoreDNS in the compose chain (docker-compose assigns it this fixed IP),
# and the origin service name the edge fronts. Both overridable for other deploys.
COREDNS_ADDR = os.getenv("COREDNS_ADDR", "172.28.0.53")
DNS_ORIGIN_HOST = os.getenv("DNS_ORIGIN_HOST", "backend")


def resolve_dns(host: str, server: str | None = None, timeout: float = 0.5) -> DnsInfo:
    """Resolve ``host`` to an A record + TTL with a **real** DNS query.

    Honesty seam (§2/§3): a genuine lookup against the running CoreDNS (the chain's
    real resolver) — not a fabricated value. On any failure (no chain, timeout,
    NXDOMAIN) it returns ``seen=False`` with null address/ttl; the caller keeps the
    header-derived host and the UI says the address wasn't resolved. Bounded by
    ``timeout`` so it never stalls the request pipeline.
    """
    try:
        import dns.resolver  # lazy: only needed when the chain is exercised

        resolver = dns.resolver.Resolver(configure=False)
        resolver.nameservers = [server or COREDNS_ADDR]
        resolver.lifetime = timeout
        resolver.timeout = timeout
        answer = resolver.resolve(host, "A")
        address = answer[0].address
        ttl = int(answer.rrset.ttl) if answer.rrset is not None else None
        return DnsInfo(seen=True, host=host, address=address, ttl=ttl)
    except Exception:  # noqa: BLE001 - any resolver failure is an honest "not resolved"
        return DnsInfo(seen=False, host=host, address=None, ttl=None)


def read_network(request: Request) -> NetworkInfo:
    """Derive the whole chain's :class:`NetworkInfo` from a request's headers.

    Pure over the headers: reports honest "not seen" sub-records when the chain is
    absent (each appliance's evidence header is missing).
    """
    headers = request.headers  # case-insensitive multidict
    return NetworkInfo(
        dns=read_dns(headers),
        cdn=read_cdn(headers),
        waf=read_waf(headers),
        lb=read_lb(headers),
        apigw=read_apigw(headers),
    )
