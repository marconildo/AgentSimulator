"""The MCP tool registry exposes the demo tools and executes them."""

from app.mcp.client import get_registry


async def test_registry_exposes_demo_tools():
    registry = await get_registry()
    names = set(registry.names())
    assert {"calculator", "current_time", "kb_lookup"} <= names
    assert registry.transport in {"mcp-stdio", "local-fallback"}


async def test_calculator_tool_executes():
    registry = await get_registry()
    result = await registry.call("calculator", {"expression": "6 * 7"})
    assert result.strip() == "42"


async def test_unknown_tool_is_handled():
    registry = await get_registry()
    result = await registry.call("does_not_exist", {})
    assert "error" in result.lower()
