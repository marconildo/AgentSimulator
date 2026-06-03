"""The `web_search` MCP tool (052-web-search-tool).

A real internet search via Tavily, exposed as a normal MCP tool. The keyless
guard test (AC3) always runs; the live test (AC4) is gated behind a real
``TAVILY_API_KEY`` with ``@pytest.mark.tavily``.
"""

import pytest

from app.mcp.client import _load_local, get_registry
from app.mcp.server import WEB_SEARCH_TOOL, _web_search


async def test_registry_exposes_web_search():
    # AC1 — advertised in names() and specs(), on whichever transport is active.
    registry = await get_registry()
    assert WEB_SEARCH_TOOL in registry.names()
    assert WEB_SEARCH_TOOL in {s.name for s in registry.specs()}


def test_web_search_schema_has_query():
    # AC2 — the tool takes a single required string `query`.
    registry = _load_local()
    spec = next(s for s in registry.specs() if s.name == WEB_SEARCH_TOOL)
    props = spec.schema["properties"]
    assert props["query"]["type"] == "string"
    assert spec.schema["required"] == ["query"]


def test_web_search_without_key_returns_error(monkeypatch):
    # AC3 (keyless guard, always runs) — no key ⇒ honest error string, no raise.
    from app import config

    monkeypatch.setattr(config.get_settings(), "tavily_api_key", "", raising=False)
    result = _web_search("anything at all")
    assert isinstance(result, str)
    assert result.strip().lower().startswith("error")


async def test_web_search_respects_toggle():
    # AC5 — honors the experiment toggle, like every other tool.
    registry = await get_registry()
    assert [s.name for s in registry.specs([WEB_SEARCH_TOOL])] == [WEB_SEARCH_TOOL]
    refused = await registry.call(WEB_SEARCH_TOOL, {"query": "x"}, enabled=["calculator"])
    assert "error" in refused.lower()


@pytest.mark.tavily
def test_web_search_real_returns_sources():
    # AC4 — a real Tavily call returns a non-empty result with at least one URL.
    result = _web_search("What is the Model Context Protocol?")
    assert result.strip()
    assert "http" in result.lower()
