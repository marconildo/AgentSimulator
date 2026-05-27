"""011-token-cost — model pricing.

A small, explicit table of OpenAI list prices (US$ per 1M tokens, input/output).
It is a **labelled teaching approximation**, not a billing source of truth — list
prices drift, so the goal is to make the *shape* of cost visible (rounds × tokens
× rate), not to be invoice-accurate. An unlisted model prices at 0 rather than
guessing.
"""

from __future__ import annotations

from .provider import TokenUsage

# USD per 1,000,000 tokens: (input, output). Public list prices (2025).
MODEL_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
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
