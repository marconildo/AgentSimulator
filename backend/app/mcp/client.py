"""Tool registry backed by the MCP server.

Primary path: connect to the FastMCP server over stdio via
``langchain-mcp-adapters`` and load its tools. If that transport is
unavailable for any reason, we transparently fall back to calling the server's
tool functions in-process — the agent behaves identically and the UI still
shows the same MCP stages. The registry is built once and cached.
"""

from __future__ import annotations

import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from ..llm.provider import ToolSpec
from . import server as local_server


@dataclass
class RegisteredTool:
    name: str
    description: str
    schema: dict[str, Any]
    runner: Callable[[dict[str, Any]], Awaitable[str]]


class ToolRegistry:
    def __init__(self, tools: list[RegisteredTool], transport: str) -> None:
        self._tools = {t.name: t for t in tools}
        self.transport = transport

    def specs(self) -> list[ToolSpec]:
        return [ToolSpec(name=t.name, description=t.description, schema=t.schema) for t in self._tools.values()]

    def names(self) -> list[str]:
        return list(self._tools)

    async def call(self, name: str, args: dict[str, Any]) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return f"error: unknown tool '{name}'"
        return await tool.runner(args)


_registry: ToolRegistry | None = None


async def get_registry() -> ToolRegistry:
    global _registry
    if _registry is None:
        _registry = await _build_registry()
    return _registry


def _stringify(result: Any) -> str:
    """Normalize an MCP tool result (which may be content blocks) to text."""
    if isinstance(result, str):
        return result
    if isinstance(result, list):
        parts = [str(item.get("text", item)) if isinstance(item, dict) else str(item) for item in result]
        return "\n".join(parts)
    return str(result)


async def _build_registry() -> ToolRegistry:
    try:
        return await _load_via_mcp()
    except Exception as exc:  # noqa: BLE001 - degrade gracefully, never crash the app
        print(f"[mcp] stdio transport unavailable ({exc!r}); using local fallback.")
        return _load_local()


async def _load_via_mcp() -> ToolRegistry:
    from langchain_mcp_adapters.client import MultiServerMCPClient

    client = MultiServerMCPClient(
        {
            "simulator": {
                "command": sys.executable,
                "args": ["-m", "app.mcp.server"],
                "transport": "stdio",
            }
        }
    )
    lc_tools = await client.get_tools()

    tools: list[RegisteredTool] = []
    for t in lc_tools:
        schema = {"type": "object", "properties": dict(getattr(t, "args", {}) or {})}

        async def runner(args: dict[str, Any], _tool=t) -> str:
            return _stringify(await _tool.ainvoke(args))

        tools.append(
            RegisteredTool(
                name=t.name,
                description=(t.description or "").strip(),
                schema=schema,
                runner=runner,
            )
        )
    return ToolRegistry(tools, transport="mcp-stdio")


def _load_local() -> ToolRegistry:
    """In-process fallback that mirrors the MCP tools exactly."""

    def wrap(fn: Callable[..., str]) -> Callable[[dict[str, Any]], Awaitable[str]]:
        async def runner(args: dict[str, Any]) -> str:
            return fn(**args)

        return runner

    tools = [
        RegisteredTool(
            name="calculator",
            description="Evaluate a basic arithmetic expression, e.g. '2 + 2'.",
            schema={"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]},
            runner=wrap(local_server._calculator),
        ),
        RegisteredTool(
            name="current_time",
            description="Return the current date and time in UTC.",
            schema={"type": "object", "properties": {}},
            runner=wrap(lambda: local_server._current_time()),
        ),
        RegisteredTool(
            name="kb_lookup",
            description="Look up a one-line glossary definition for an AI engineering topic.",
            schema={"type": "object", "properties": {"topic": {"type": "string"}}, "required": ["topic"]},
            runner=wrap(local_server._kb_lookup),
        ),
    ]
    return ToolRegistry(tools, transport="local-fallback")
