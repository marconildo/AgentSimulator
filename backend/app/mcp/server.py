"""A real MCP server (FastMCP) exposing three demo tools over stdio.

Run standalone for a quick check::

    python -m app.mcp.server   # speaks MCP over stdio; Ctrl-C to stop

The tool logic lives in plain ``_`` functions so the client can also call them
directly as a fallback when the MCP transport is unavailable.
"""

from __future__ import annotations

import ast
import operator
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("simulator")

# --- safe arithmetic ---------------------------------------------------------

_OPS: dict[type, Callable[..., Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


def _eval(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.left), _eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval(node.operand))
    raise ValueError("Only basic arithmetic (+ - * / % **) is allowed.")


def _calculator(expression: str) -> str:
    try:
        tree = ast.parse(expression, mode="eval")
        result = _eval(tree.body)
        return str(int(result) if isinstance(result, float) and result.is_integer() else result)
    except Exception as exc:  # noqa: BLE001 - return error text to the model
        return f"error: {exc}"


def _current_time() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")


_KB = {
    "rag": "Retrieval-Augmented Generation grounds an LLM in retrieved documents.",
    "embedding": "An embedding is a vector capturing the meaning of text.",
    "agent": "An agent is an LLM in a loop that can call tools and observe results.",
    "mcp": "The Model Context Protocol standardizes how apps connect to tools.",
    "token": "A token is a chunk of text; LLMs read and write in tokens.",
    "prompt": "A prompt is the full input assembled and sent to the model.",
}


def _kb_lookup(topic: str) -> str:
    key = topic.strip().lower()
    for k, v in _KB.items():
        if k in key:
            return v
    return f"No glossary entry found for '{topic}'."


# --- MCP tool registrations --------------------------------------------------


@mcp.tool()
def calculator(expression: str) -> str:
    """Evaluate a basic arithmetic expression, e.g. '2 + 2' or '12 * (3 + 1)'."""
    return _calculator(expression)


@mcp.tool()
def current_time() -> str:
    """Return the current date and time in UTC."""
    return _current_time()


@mcp.tool()
def kb_lookup(topic: str) -> str:
    """Look up a one-line glossary definition for an AI engineering topic."""
    return _kb_lookup(topic)


if __name__ == "__main__":
    mcp.run(transport="stdio")
