"""011-token-cost — deterministic pricing (AC1). No OpenAI key needed."""

from app.llm.pricing import cost_usd, usage_metrics
from app.llm.provider import TokenUsage


def test_cost_usd_is_the_price_table_dot_product():
    # gpt-4o-mini: input $0.15 / 1M, output $0.60 / 1M.
    assert cost_usd("gpt-4o-mini", 1_000_000, 0) == 0.15
    assert cost_usd("gpt-4o-mini", 0, 1_000_000) == 0.60
    assert cost_usd("gpt-4o-mini", 1_000_000, 1_000_000) == 0.75


def test_unknown_model_prices_at_zero():
    assert cost_usd("some-unlisted-model", 1_000_000, 1_000_000) == 0.0


def test_no_tokens_costs_nothing():
    assert cost_usd("gpt-4o-mini", 0, 0) == 0.0


def test_usage_metrics_shape():
    m = usage_metrics(
        "gpt-4o-mini", TokenUsage(prompt_tokens=1000, completion_tokens=500, total_tokens=1500)
    )
    assert m["prompt_tokens"] == 1000.0
    assert m["completion_tokens"] == 500.0
    assert m["total_tokens"] == 1500.0
    # 1000/1e6*0.15 + 500/1e6*0.60 = 0.00015 + 0.0003 = 0.00045
    assert abs(m["cost_usd"] - 0.00045) < 1e-9
    assert all(isinstance(v, float) for v in m.values())
