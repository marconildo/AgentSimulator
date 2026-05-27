"""The agent's tool list (026-agent-tool-autonomy).

The agent decides, autonomously, which tools to call. Two kinds are advertised:

- ``search_knowledge_base`` — a **native** agent tool whose body is the real RAG
  pipeline (embed → search → top-k). It is *not* an MCP server tool: the stdio
  server has no access to the app's Chroma store or per-session document scoping.
  When the agent elects to call it, it animates the **RAG station** (``rag.*``),
  not the MCP station.
- the MCP tools (``calculator``, ``current_time``, ``kb_lookup``) loaded by the
  :class:`~app.mcp.client.ToolRegistry`, which animate the **MCP station**
  (``mcp.call``).

This module is the single source of truth for *which* tools the agent sees, shared
by the graph's discovery node and ``GET /api/config`` so nothing is hardcoded twice.
The ``enabled_tools`` experiment override (006) gates the retrieval tool exactly
like any MCP tool: ``None`` = all (default), ``[]`` = none, a list = only those.
"""

from __future__ import annotations

from ..llm.provider import ToolSpec
from ..mcp.client import ToolRegistry

# Wire name the model calls and the UI lists; a proper noun, not translated.
RETRIEVAL_TOOL = "search_knowledge_base"

# Functional description sent to the model (English, like the MCP descriptions).
RETRIEVAL_DESCRIPTION = (
    "Search the knowledge base (vector RAG) for passages relevant to a query. "
    "Use this to ground answers about concepts, definitions, or documented topics."
)

RETRIEVAL_SCHEMA = {
    "type": "object",
    "properties": {
        "query": {
            "type": "string",
            "description": "The search query to embed and match against the knowledge base.",
        }
    },
    "required": ["query"],
}


def retrieval_spec() -> ToolSpec:
    """The retrieval tool as advertised to the model and the inspector."""
    return ToolSpec(name=RETRIEVAL_TOOL, description=RETRIEVAL_DESCRIPTION, schema=RETRIEVAL_SCHEMA)


def is_retrieval(name: str) -> bool:
    return name == RETRIEVAL_TOOL


def agent_tool_specs(registry: ToolRegistry, enabled: list[str] | None) -> list[ToolSpec]:
    """The full tool list the agent sees: the retrieval tool plus the MCP tools.

    ``enabled`` gates every tool uniformly (006-interactive-experiments): ``None``
    advertises all; a list keeps only the named tools; ``[]`` advertises none. The
    retrieval tool follows the same rule, so disabling all tools also disables
    retrieval (an honest LLM-only run with no grounding).
    """
    specs: list[ToolSpec] = []
    if enabled is None or RETRIEVAL_TOOL in enabled:
        specs.append(retrieval_spec())
    specs.extend(registry.specs(enabled))
    return specs
