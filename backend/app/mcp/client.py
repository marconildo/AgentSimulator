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


def jsonrpc_frames(
    method: str,
    params: dict[str, Any],
    result: Any,
    *,
    reconstructed: bool,
    request_id: int = 1,
) -> dict[str, Any]:
    """Build canonical JSON-RPC 2.0 request/response frames for an MCP exchange.

    Returns ``{request, response, reconstructed}`` (007-numeric-transparency), the
    shape the inspector renders. ``langchain-mcp-adapters`` abstracts the stdio
    transport and does not surface the literal wire bytes, so even on the
    ``mcp-stdio`` path these frames are *assembled* from the real exchange
    (method/params/result) — they are faithful to the MCP protocol (``tools/list``,
    ``tools/call``). ``reconstructed`` is ``True`` only for the in-process local
    fallback, where nothing actually travelled; the UI badges that case so it
    never masquerades as real wire traffic (constitution §3 — honesty).
    """
    return {
        "request": {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params,
        },
        "response": {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result,
        },
        "reconstructed": reconstructed,
    }


class ToolRegistry:
    def __init__(self, tools: list[RegisteredTool], transport: str) -> None:
        self._tools = {t.name: t for t in tools}
        self.transport = transport

    def specs(self, enabled: list[str] | None = None) -> list[ToolSpec]:
        """Tools advertised to the agent.

        ``enabled`` is the experiment override (006): ``None`` means no override
        (all tools); a list keeps only those tools (order-preserving); ``[]``
        advertises none. The cached registry is never mutated — filtering is a
        per-request view so ``mcp.discover`` honestly lists only enabled tools.
        """
        tools = self._tools.values()
        if enabled is not None:
            allowed = set(enabled)
            tools = [t for t in tools if t.name in allowed]
        return [ToolSpec(name=t.name, description=t.description, schema=t.schema) for t in tools]

    def names(self) -> list[str]:
        return list(self._tools)

    async def call(self, name: str, args: dict[str, Any], enabled: list[str] | None = None) -> str:
        # Defense in depth: the agent only ever sees the filtered specs, but a
        # disabled tool is refused here too so "everything is real" holds (§3).
        if enabled is not None and name not in set(enabled):
            return f"error: tool '{name}' is disabled"
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
        parts = [
            str(item.get("text", item)) if isinstance(item, dict) else str(item) for item in result
        ]
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
            schema={
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"],
            },
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
            schema={
                "type": "object",
                "properties": {"topic": {"type": "string"}},
                "required": ["topic"],
            },
            runner=wrap(local_server._kb_lookup),
        ),
    ]
    return ToolRegistry(tools, transport="local-fallback")
