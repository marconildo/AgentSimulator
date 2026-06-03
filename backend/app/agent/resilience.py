"""051-failure-treatments — the (real) resilience policy the failure simulator exercises.

017-failure-injection only ever showed the system *breaking*. This module holds the
small, fixed policy that makes the agent *recover* (or degrade gracefully) under an
injected failure: a bounded number of retries with **exponential backoff**, then a
**circuit breaker** that opens and hands off to a **fallback** (graceful degradation).

The policy is real control flow (the agent really retries and really waits); only the
underlying failure is injected (constitution §3). Constants are fixed and didactic —
small enough that the backoff ladder is observable in timing without making the demo
slow (200 → 400 → 800 ms). Kept pure + sync so the curve is unit-testable without a key.
"""

from __future__ import annotations

# Total model-call attempts before the breaker opens (so MAX_RETRIES - 1 waits).
MAX_RETRIES = 3
# Base backoff; doubles each attempt (exponential): 200, 400, 800 ms.
BACKOFF_BASE_MS = 200

# Treatment names surfaced on event ``data`` (mirrored by the bilingual UI labels).
TREATMENT_FALLBACK = "fallback"  # retries exhausted → degraded answer
TREATMENT_GRACEFUL = "graceful_degradation"  # tool failed → agent abstains
# Circuit-breaker state surfaced on the agent.think END once retries are exhausted.
CIRCUIT_OPEN = "open"


def backoff_ms(attempt: int) -> int:
    """Exponential backoff (ms) to wait **after** a failed ``attempt`` (1-based).

    ``backoff_ms(1) < backoff_ms(2) < …`` — each wait is longer than the last, so a
    struggling dependency gets progressively more breathing room. The returned value
    is exactly what the agent sleeps (displayed == slept — honest).
    """
    if attempt < 1:
        raise ValueError("attempt is 1-based")
    return BACKOFF_BASE_MS * (2 ** (attempt - 1))
