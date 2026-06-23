"""Black-box SSE client for the integration suite.

Unlike the in-process tests (which use Starlette's ``TestClient``), the
integration tests talk to the *running* stack over real HTTP — the request
crosses the whole ingress chain (varnish → haproxy → modsecurity → kong →
backend), exactly like a browser. So this helper deliberately imports **no**
application code: it is a pure HTTP client, asserting only on the bytes that
came back over the wire.
"""

from __future__ import annotations

import json

import httpx


def stream_chat(
    base_url: str, body: dict, *, timeout: float = 120.0
) -> tuple[list[dict], dict]:
    """POST ``/api/chat`` and collect the ``trace`` events + the ``done`` payload.

    Returns ``(events, done)`` where ``events`` is the list of ``TraceEvent``
    dicts streamed over SSE and ``done`` is the terminal payload (carries the
    settled ``answer``). Raises if the endpoint does not return 200.
    """
    events: list[dict] = []
    done: dict = {}
    url = f"{base_url.rstrip('/')}/api/chat"
    with httpx.Client(timeout=timeout) as client:
        with client.stream("POST", url, json=body) as resp:
            assert resp.status_code == 200, f"{resp.status_code}: {resp.text}"
            current: str | None = None
            for line in resp.iter_lines():
                if line.startswith("event:"):
                    current = line.split(":", 1)[1].strip()
                elif line.startswith("data:"):
                    payload = json.loads(line.split(":", 1)[1].strip())
                    if current == "trace":
                        events.append(payload)
                    elif current == "done":
                        done = payload
    return events, done


def answer_text(events: list[dict], done: dict) -> str:
    """The settled answer, from the ``done`` payload or the ``respond`` END."""
    if done.get("answer"):
        return done["answer"]
    respond = next(
        (e for e in events if e["stage"] == "respond" and e["phase"] == "end"), None
    )
    return (respond or {}).get("data", {}).get("answer", "") if respond else ""
