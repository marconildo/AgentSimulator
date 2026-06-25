"""011-token-cost — model pricing.

A small, explicit table of provider list prices (US$ per 1M tokens, input/output)
for OpenAI and Google Vertex AI (Gemini) models. It is a **labelled teaching
approximation**, not a billing source of truth — list prices drift, so the goal is
to make the *shape* of cost visible (rounds × tokens × rate), not to be
invoice-accurate. An unlisted model prices at 0 rather than guessing.
"""

from __future__ import annotations

from .provider import TokenUsage

# USD per 1,000,000 tokens: (input, output). Public list prices (2025-2026).
# A **labelled teaching approximation** — see module docstring.
MODEL_PRICES: dict[str, tuple[float, float]] = {
    # --- OpenAI ---
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    # --- Vertex AI / Gemini ---
    "gemini-2.5-flash-lite": (0.10, 0.40),
    "gemini-2.5-flash": (0.30, 2.50),
    "gemini-2.5-pro": (1.25, 10.00),
    "gemini-3-flash-preview": (0.50, 3.00),
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.1-pro-preview": (2.00, 12.00),
}


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Cost of a call in US$ from the price table; unknown model ⇒ 0.0."""
    input_rate, output_rate = MODEL_PRICES.get(model, (0.0, 0.0))
    cost = prompt_tokens / 1_000_000 * input_rate + completion_tokens / 1_000_000 * output_rate
    return round(cost, 6)


def usage_metrics(model: str, usage: TokenUsage) -> dict[str, float]:
    """Trace ``metrics`` for one LLM call: tokens + priced cost (all floats)."""
    return {
        "prompt_tokens": float(usage.prompt_tokens),
        "completion_tokens": float(usage.completion_tokens),
        "total_tokens": float(usage.total_tokens),
        "cost_usd": cost_usd(model, usage.prompt_tokens, usage.completion_tokens),
    }
