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


def test_vertexai_gemini_models_have_nonzero_cost():
    """089-vertex-ai-provider bugfix: Gemini models must have pricing entries."""
    from app.llm.models import CURATED_VERTEXAI_MODELS
    from app.llm.pricing import MODEL_PRICES

    for model in CURATED_VERTEXAI_MODELS:
        assert model.id in MODEL_PRICES, f"Missing price for Vertex AI model: {model.id}"
        input_rate, output_rate = MODEL_PRICES[model.id]
        assert input_rate > 0 or output_rate > 0, f"Zero price for {model.id}"


def test_cost_usd_gemini_flash():
    """Regression: gemini-2.5-flash should return a real cost, not 0."""
    # gemini-2.5-flash: input $0.30 / 1M, output $2.50 / 1M.
    assert cost_usd("gemini-2.5-flash", 1_000_000, 0) == 0.30
    assert cost_usd("gemini-2.5-flash", 0, 1_000_000) == 2.50
    assert cost_usd("gemini-2.5-flash", 1_000_000, 1_000_000) == 2.80
