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

# 021-abstain-badge: the single, owned sentinel for a knowledge-base miss. Both
# the not-found return and the `found_for` classifier reference it, so the two
# can never drift (and it is not a fuzzy "No … found" heuristic — it is this
# module's exact, declared not-found result).
_KB_MISS_PREFIX = "No glossary entry found for"


def _kb_lookup(topic: str) -> str:
    key = topic.strip().lower()
    for k, v in _KB.items():
        if k in key:
            return v
    return f"{_KB_MISS_PREFIX} '{topic}'."


# --- skills (027-skills) -----------------------------------------------------

# Wire name the model calls and the UI lists; a proper noun, not translated.
LOAD_SKILL_TOOL = "load_skill"

# Functional description sent to the model (English, like the other tools).
LOAD_SKILL_DESCRIPTION = (
    "Load the full instructions (body) of a named skill from the catalog. Call this "
    "with the exact `name` of a skill from the advertised skills list when it fits the "
    "user's request, then follow the loaded instructions."
)


def _load_skill(name: str) -> str:
    """Return the body of the named skill, or an ``error:`` string if unknown.

    Reads the relational store directly. This runs both in the stdio MCP server
    subprocess (which inherits ``APP_DB_PATH``, so it opens the same SQLite file)
    and via the in-process fallback — both see the same catalog.
    """
    from ..db.store import get_store

    skill = get_store()._get_skill_by_name_sync((name or "").strip())
    if skill is None:
        return f"error: skill '{name}' not found"
    return skill["body"]


# --- web search (052-web-search-tool) ----------------------------------------

# Wire name the model calls and the UI lists; a proper noun, not translated.
WEB_SEARCH_TOOL = "web_search"

# Functional description sent to the model (English, like the other tools).
WEB_SEARCH_DESCRIPTION = (
    "Search the live internet for current or external information and return a short "
    "synthesized answer plus the top sources (title, URL, snippet). This is the right "
    "tool for ANY question outside AI engineering — real-world facts, current events, "
    "news, sports, people, prices, specific documentation. Prefer it over "
    "`search_knowledge_base` whenever the question is not about LLMs, embeddings, RAG, "
    "agents, MCP, or prompting. Pass a focused natural-language `query`."
)

# How many sources to fold into the model's observation.
_WEB_SEARCH_MAX_RESULTS = 5
# Trim each source snippet so the observation stays compact.
_WEB_SEARCH_SNIPPET_CHARS = 240


def _web_search(query: str) -> str:
    """Perform a real Tavily web search and return answer + sources as text.

    Degrades honestly: with no ``TAVILY_API_KEY`` configured it returns an
    ``error:`` string the model can read (never raises), so the agent keeps
    running even though the tool is unavailable. ``TavilyClient`` is imported
    lazily so importing this module — and the keyless guard tests — never
    requires the package to be installed or a key to be set.
    """
    from ..config import get_settings

    key = get_settings().tavily_api_key.strip()
    if not key:
        return "error: web search is unavailable — TAVILY_API_KEY is not configured"

    try:
        from tavily import TavilyClient

        client = TavilyClient(api_key=key)
        response = client.search(
            query=query,
            max_results=_WEB_SEARCH_MAX_RESULTS,
            include_answer=True,
        )
    except Exception as exc:  # noqa: BLE001 - return error text to the model
        return f"error: {exc}"

    answer = (response.get("answer") or "").strip()
    results = response.get("results") or []

    lines: list[str] = []
    if answer:
        lines.append(f"Answer: {answer}")
        lines.append("")
    if results:
        lines.append("Sources:")
        for i, r in enumerate(results, start=1):
            title = (r.get("title") or "").strip() or "(untitled)"
            url = (r.get("url") or "").strip()
            snippet = " ".join((r.get("content") or "").split())[:_WEB_SEARCH_SNIPPET_CHARS]
            lines.append(f"{i}. {title} — {url}")
            if snippet:
                lines.append(f"   {snippet}")

    text = "\n".join(lines).strip()
    return text or f"No web results found for '{query}'."


def found_for(name: str, content: str) -> bool:
    """Structured not-found signal for a tool result — the single source of truth.

    021-abstain-badge: a well-behaved agent **abstains** when a tool reports
    nothing (e.g. ``kb_lookup`` for an unknown topic) instead of inventing an
    answer. This classifier marks that case as ``found=False`` so the trace can
    record a robust, structured flag on the ``mcp.call`` ``data`` (the frontend
    badges ``found is False`` — no string matching on the client).

    It is computed at the registry/observation boundary because the MCP-stdio
    transport flattens a tool's structured output (the langchain-mcp adapter
    drops ``structuredContent`` / a ``dict`` return would pollute the model's
    observation with JSON), so a ``dict``-typed wire result is not viable. Both
    transports yield the *same clean text*, so this classifier gives identical
    results on either path (a parity test pins it). Only ``kb_lookup`` can miss;
    an empty result from any tool also counts as not-found.
    """
    text = (content or "").strip()
    if not text:
        return False
    if name == "kb_lookup":
        return not text.startswith(_KB_MISS_PREFIX)
    return True


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


@mcp.tool()
def load_skill(name: str) -> str:
    """Load the full instructions (body) of a named skill from the catalog.

    Call this with the exact `name` of a skill from the advertised skills list when
    it fits the user's request, then follow the loaded instructions.
    """
    return _load_skill(name)


@mcp.tool()
def web_search(query: str) -> str:
    """Search the live internet and return a synthesized answer plus top sources.

    This is the right tool for ANY question outside AI engineering — real-world
    facts, current events, news, sports, people, prices, specific documentation.
    Prefer it over `search_knowledge_base` whenever the question is not about LLMs,
    embeddings, RAG, agents, MCP, or prompting. Pass a focused natural-language
    `query`.
    """
    return _web_search(query)


if __name__ == "__main__":
    mcp.run(transport="stdio")
