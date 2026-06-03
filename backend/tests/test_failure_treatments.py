"""051-failure-treatments: the failure simulator now shows the *treatment*.

017 only showed the system breaking; 051 makes it recover (or degrade gracefully):
``llm_timeout`` now exercises a real **retry → exponential backoff → circuit-breaker
→ fallback** ladder, and ``tool_error``'s abstain is labelled a graceful-degradation
treatment. All surfaced as additive keys on the existing END-event ``data`` (the 017
pattern) — **no new Stage**.

Keyless unit tests pin the backoff curve; the ``@pytest.mark.openai`` run-level tests
assert structurally (attempt count, increasing backoff, circuit open, treatment label)
to tolerate model variability.
"""

import pytest
from fastapi.testclient import TestClient

from app.agent.resilience import (
    BACKOFF_BASE_MS,
    CIRCUIT_OPEN,
    MAX_RETRIES,
    TREATMENT_FALLBACK,
    TREATMENT_GRACEFUL,
    backoff_ms,
)
from app.main import app

# --- AC3 (pure, keyless): the backoff curve --------------------------------


def test_backoff_is_exponential_and_increasing():
    # AC3 — each wait is strictly longer than the previous one (gives a struggling
    # dependency progressively more room), and all are positive.
    waits = [backoff_ms(a) for a in range(1, MAX_RETRIES + 1)]
    assert all(w > 0 for w in waits)
    assert waits == sorted(waits)
    assert all(b > a for a, b in zip(waits, waits[1:], strict=False))


def test_backoff_doubles_from_the_base():
    assert backoff_ms(1) == BACKOFF_BASE_MS
    assert backoff_ms(2) == BACKOFF_BASE_MS * 2
    assert backoff_ms(3) == BACKOFF_BASE_MS * 4


def test_backoff_rejects_zero_or_negative_attempt():
    with pytest.raises(ValueError):
        backoff_ms(0)


def test_treatment_constants_are_distinct_stable_strings():
    # These are written onto event data + matched by the UI; pin them.
    assert TREATMENT_FALLBACK == "fallback"
    assert TREATMENT_GRACEFUL == "graceful_degradation"
    assert CIRCUIT_OPEN == "open"


# --- AC2: llm_timeout retries (more than one attempt span) ------------------


@pytest.mark.openai
def test_llm_timeout_retries_with_growing_backoff():
    # AC2 + AC3 — the model call is retried MAX_RETRIES times (each its own
    # llm.prompt span, simulated), and the recorded backoff strictly increases.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={"message": "What is RAG?", "mode": "batch", "simulate_failure": "llm_timeout"},
        )
        assert resp.status_code == 200  # no 500/crash
        events = resp.json()["events"]
        attempts = [
            e
            for e in events
            if e["stage"] == "llm.prompt" and e["phase"] == "end" and e["data"].get("simulated")
        ]
        assert len(attempts) == MAX_RETRIES, "expected one simulated llm.prompt span per retry"
        # Incrementing attempt index 1..MAX_RETRIES.
        assert [a["data"].get("attempt") for a in attempts] == list(range(1, MAX_RETRIES + 1))
        assert all(a["data"].get("max_retries") == MAX_RETRIES for a in attempts)
        # The recorded backoffs (on the attempts that are followed by a wait) increase.
        backoffs = [a["data"]["backoff_ms"] for a in attempts if "backoff_ms" in a["data"]]
        assert len(backoffs) >= 1
        assert all(b > a for a, b in zip(backoffs, backoffs[1:], strict=False))


@pytest.mark.openai
def test_llm_timeout_attempts_are_separated_in_time_by_the_backoff():
    # AC3 — the backoff is *real*: consecutive attempt spans start at least the
    # recorded backoff apart (real asyncio.sleep, §3). Loose tolerance for jitter.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={"message": "What is RAG?", "mode": "batch", "simulate_failure": "llm_timeout"},
        )
        starts = [
            e for e in resp.json()["events"] if e["stage"] == "llm.prompt" and e["phase"] == "start"
        ]
        assert len(starts) == MAX_RETRIES
        for i in range(MAX_RETRIES - 1):
            gap_ms = (starts[i + 1]["ts"] - starts[i]["ts"]) * 1000
            assert gap_ms >= backoff_ms(i + 1) * 0.8, "attempts not separated by the backoff"


# --- AC4: circuit opens → labelled fallback --------------------------------


@pytest.mark.openai
def test_llm_timeout_opens_circuit_and_falls_back():
    # AC4 — once retries are exhausted, the agent.think END records the breaker
    # OPEN + a fallback treatment, the run terminates on a degraded answer, and no
    # real generation happened (the run short-circuits to respond).
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={"message": "What is RAG?", "mode": "batch", "simulate_failure": "llm_timeout"},
        )
        assert resp.status_code == 200
        body = resp.json()
        events = body["events"]
        think_end = next(
            e for e in reversed(events) if e["stage"] == "agent.think" and e["phase"] == "end"
        )
        assert think_end["data"].get("circuit") == CIRCUIT_OPEN
        assert think_end["data"].get("treatment") == TREATMENT_FALLBACK
        # Terminal, handled state: respond fired, an answer is set, nothing generated.
        assert any(e["stage"] == "respond" and e["phase"] == "end" for e in events)
        assert body["answer"].strip()
        assert not [e for e in events if e["stage"] == "llm.generate"]


# --- AC5: tool_error abstain labelled graceful degradation ------------------


@pytest.mark.openai
def test_tool_error_is_labelled_graceful_degradation():
    # AC5 — a failed tool's END carries the treatment label (distinct from a
    # no-failure run, which has none), and the run reaches a terminal state.
    with TestClient(app) as client:
        resp = client.post(
            "/api/chat",
            json={
                "message": "What is 2 + 2?",
                "mode": "batch",
                "simulate_failure": "tool_error",
            },
        )
        assert resp.status_code == 200
        events = resp.json()["events"]
        failed = [
            e
            for e in events
            if e["stage"] in ("mcp.call", "rag.retrieve")
            and e["phase"] == "end"
            and e["data"].get("simulated")
        ]
        assert failed, "expected a simulated tool failure to label"
        assert any(e["data"].get("treatment") == TREATMENT_GRACEFUL for e in failed)


@pytest.mark.openai
def test_no_failure_run_carries_no_treatment_keys():
    # AC1 — the no-failure path is unchanged: no treatment/attempt/backoff/circuit
    # keys leak onto any event when simulate_failure is omitted.
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "What is 2 + 2?", "mode": "batch"})
        assert resp.status_code == 200
        for e in resp.json()["events"]:
            for key in ("attempt", "max_retries", "backoff_ms", "circuit", "treatment"):
                assert key not in e["data"], f"unexpected {key} on a no-failure run"
