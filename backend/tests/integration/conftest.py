"""Fixtures for the opt-in integration suite (black-box, against the live stack).

These tests assume the Docker stack is already up (``docker compose up -d``) and
hit it through the ingress chain's front door (Varnish, ``:8090``) so every
request genuinely crosses DNS · CDN · TLS/LB · WAF · API-GW before the backend.

Override the entry point with ``CHAIN_BASE_URL`` (default ``http://localhost:8090``).
The ``live_stack`` fixture waits for the whole chain to report healthy before any
test runs, and **fails loudly** (never silently skips) if it cannot — a green run
must mean the real stack answered, not that it was absent.
"""

from __future__ import annotations

import os
import time

import httpx
import pytest

DEFAULT_BASE_URL = "http://localhost:8090"
_HEALTH_TIMEOUT_S = 180.0
_HEALTH_POLL_S = 3.0


@pytest.fixture(scope="session")
def base_url() -> str:
    return os.environ.get("CHAIN_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


@pytest.fixture(scope="session", autouse=True)
def live_stack(base_url: str) -> str:
    """Block until the chain front door proxies a healthy backend, or fail.

    ``/api/health`` is routed straight through Kong (path ``/``) to the backend,
    so a 200 with ``status == ok`` proves the whole chain (varnish → haproxy →
    modsecurity → kong → backend) is up. ``has_key`` must be true — the e2e
    scenarios run a real OpenAI call.
    """
    deadline = time.monotonic() + _HEALTH_TIMEOUT_S
    last_err: str = "no attempt made"
    health_url = f"{base_url}/api/health"
    while time.monotonic() < deadline:
        try:
            resp = httpx.get(health_url, timeout=5.0)
            if resp.status_code == 200:
                body = resp.json()
                if body.get("status") == "ok":
                    if not body.get("has_key"):
                        pytest.fail(
                            f"{health_url} is up but has_key=false — set OPENAI_API_KEY "
                            "for the stack before running the integration suite."
                        )
                    return base_url
                last_err = f"status={body.get('status')!r}"
            else:
                last_err = f"HTTP {resp.status_code}"
        except Exception as exc:  # noqa: BLE001 — report any transport failure verbatim
            last_err = f"{type(exc).__name__}: {exc}"
        time.sleep(_HEALTH_POLL_S)

    pytest.fail(
        f"ingress chain not healthy at {health_url} within {_HEALTH_TIMEOUT_S:.0f}s "
        f"(last error: {last_err}).\nIs the stack up? `docker compose up -d --build`."
    )
