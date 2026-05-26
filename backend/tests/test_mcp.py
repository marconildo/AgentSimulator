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


# --- Tool toggles (006-interactive-experiments) -----------------------------


async def test_specs_unfiltered_returns_all_tools():
    registry = await get_registry()
    names = {s.name for s in registry.specs()}
    assert {"calculator", "current_time", "kb_lookup"} <= names
    # None means "no override" — same as unfiltered.
    assert {s.name for s in registry.specs(None)} == names


async def test_specs_filtered_to_enabled_tools():
    registry = await get_registry()
    specs = registry.specs(["calculator"])
    assert [s.name for s in specs] == ["calculator"]


async def test_specs_empty_list_disables_all_tools():
    registry = await get_registry()
    assert registry.specs([]) == []


async def test_call_refuses_a_disabled_tool():
    # Defense in depth: even if a disabled tool were somehow requested, the
    # registry refuses it (the agent only ever sees the filtered specs).
    registry = await get_registry()
    result = await registry.call("calculator", {"expression": "2 + 2"}, enabled=["current_time"])
    assert "error" in result.lower()
    # Still callable when enabled (or with no filter).
    assert (
        await registry.call("calculator", {"expression": "2 + 2"}, enabled=["calculator"])
    ).strip() == "4"
