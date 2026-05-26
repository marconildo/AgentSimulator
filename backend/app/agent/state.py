"""Shared state for the agent graph."""

from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict):
    message: str
    top_k: int
    context: str
    chunks: list[dict[str, Any]]
    # Long-term memory: prior {message, answer} turns from the application DB.
    history: list[dict[str, str]]
    pending_tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]
    used_tools: list[str]
    iterations: int
    answer: str
