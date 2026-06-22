"""Network edge introspection (084-network-edge).

A real reverse proxy (nginx, in docker-compose) sits in front of the backend: it
terminates TLS, load-balances, and adds the standard ``X-Forwarded-*`` /
``X-Request-Id`` headers before proxying the request on. This module reads those
headers back out and reports **only what they prove** — exactly like the
``mcp-stdio`` vs ``local-fallback`` honesty seam elsewhere in the app.

When no proxy is in front (e.g. ``uvicorn`` direct in dev), the headers are
absent: :func:`read_edge` then reports ``proxied=False`` and falls back to the
socket peer, fabricating no proxy identity. The caller (``main.py``) emits this
as a single ``edge`` event before the ``backend`` stage, only when the request's
``edge`` toggle is on.

The header parser is intentionally pure (no I/O) so it is unit-testable without a
running server or an OpenAI key.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from starlette.requests import Request

# Header that the edge proxy sets to announce itself (nginx.conf adds it). We
# report a proxy identity only when the proxy explicitly named itself — never
# guessed. Spoofable like any forwarded header; this is an educational signal,
# not a security boundary.
_PROXY_NAME_HEADER = "x-edge-proxy"

# Any of these, when present, is evidence the request crossed a proxy.
_FORWARD_EVIDENCE = ("x-forwarded-for", "x-forwarded-proto", "x-real-ip", "forwarded", "via")


@dataclass(frozen=True)
class EdgeInfo:
    """What the network edge did to this request, per the forwarded headers."""

    proxied: bool
    tls: bool
    scheme: str
    client_ip: str | None
    request_id: str | None
    proxy_server: str | None
    forwarded_host: str | None

    def as_data(self) -> dict[str, Any]:
        """The ``edge`` event ``data`` payload (mirrors ``EdgeData`` in events.ts)."""
        return {
            "proxied": self.proxied,
            "tls": self.tls,
            "scheme": self.scheme,
            "client_ip": self.client_ip,
            "request_id": self.request_id,
            "proxy_server": self.proxy_server,
            "forwarded_host": self.forwarded_host,
        }


def _first(value: str | None) -> str | None:
    """The first entry of a comma-joined forwarded header (the original client)."""
    if not value:
        return None
    head = value.split(",")[0].strip()
    return head or None


def read_edge(request: Request) -> EdgeInfo:
    """Derive :class:`EdgeInfo` from a request's forwarded headers.

    Pure: reads headers + the socket peer only. Reports ``proxied=False`` and the
    direct connection's scheme/peer when no forwarding evidence is present.
    """
    headers = request.headers  # case-insensitive multidict
    proxied = any(headers.get(h) for h in _FORWARD_EVIDENCE)

    # The real client: first X-Forwarded-For entry, then X-Real-IP, then the
    # socket peer. Never invented.
    client_ip = _first(headers.get("x-forwarded-for")) or _first(headers.get("x-real-ip"))
    if client_ip is None and request.client is not None:
        client_ip = request.client.host

    # The scheme the *client* used: the proxy reports it via X-Forwarded-Proto
    # (since it terminated TLS); otherwise it's the direct connection's scheme.
    scheme = _first(headers.get("x-forwarded-proto")) or request.url.scheme
    request_id = (headers.get("x-request-id") or "").strip() or None
    proxy_server = (headers.get(_PROXY_NAME_HEADER) or "").strip() or None
    forwarded_host = (headers.get("x-forwarded-host") or "").strip() or None

    return EdgeInfo(
        proxied=proxied,
        tls=scheme == "https",
        scheme=scheme,
        client_ip=client_ip,
        request_id=request_id,
        proxy_server=proxy_server,
        forwarded_host=forwarded_host,
    )
