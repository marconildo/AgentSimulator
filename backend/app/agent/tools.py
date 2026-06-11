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
# Scoped to the corpus's actual subject so the model does not treat it as a
# general search engine: the RAG retriever always returns the nearest top-k
# (it never comes back empty), so a vague description invites off-domain calls
# that surface irrelevant passages. Off-domain / current-events questions must
# go to `web_search` instead.
RETRIEVAL_DESCRIPTION = (
    "Search the curated AI-engineering documentation corpus (vector RAG). It covers "
    "ONLY these topics: large language models and tokens, embeddings and vector search, "
    "retrieval-augmented generation (RAG), AI agents and the ReAct loop, the Model "
    "Context Protocol (MCP), and prompt engineering — plus any documents the user has "
    "uploaded. Use it to ground answers about those subjects. Do NOT use it for "
    "real-world facts, current events, news, sports, people, prices, or anything outside "
    "AI engineering — for those, use `web_search`. This corpus always returns its "
    "closest passages even when nothing is truly relevant, so only call it on-topic."
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


# --- DeepAgents tools (057-deepagents-runtime) -------------------------------------
# The DeepAgents pattern is *model-driven*: planning, a virtual file system and
# sub-agent delegation are **tools the agent elects to call inside its ReAct loop**
# (like ``search_knowledge_base``, 026) — not a forced preamble. They are advertised
# only on the Intermediate rung (and suppressed when RAGLESS is on; the two are
# separate experiments that don't compose). A greeting never triggers them because the
# model just answers — which is the whole point of making them honest agent decisions.
WRITE_TODOS = "write_todos"
WRITE_FILE = "write_file"
READ_FILE = "read_file"
EDIT_FILE = "edit_file"
LS = "ls"
TASK = "task"

DEEPAGENTS_TOOLS = frozenset({WRITE_TODOS, WRITE_FILE, READ_FILE, EDIT_FILE, LS, TASK})


def is_deepagents_tool(name: str) -> bool:
    return name in DEEPAGENTS_TOOLS


def deepagents_specs() -> list[ToolSpec]:
    """The DeepAgents tools advertised to the model (Intermediate rung)."""
    return [
        ToolSpec(
            name=WRITE_TODOS,
            description=(
                "Record or update an ordered todo list for a multi-step task. Call this "
                "FIRST, before acting, whenever the request needs more than a single step, "
                "then call it again to mark items in_progress / completed as you go. Skip it "
                "for simple questions or greetings."
            ),
            schema={
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "The full todo list (replaces the previous one).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {"type": "string", "description": "The step."},
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "in_progress", "completed"],
                                    "description": "Defaults to pending.",
                                },
                            },
                            "required": ["content"],
                        },
                    }
                },
                "required": ["todos"],
            },
        ),
        ToolSpec(
            name=WRITE_FILE,
            description=(
                "Write a file to your virtual scratchpad so intermediate findings survive "
                "across steps (beyond the context window). Use it to stash research notes "
                "or partial work."
            ),
            schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File name, e.g. research.md."},
                    "content": {"type": "string", "description": "The file contents."},
                },
                "required": ["path", "content"],
            },
        ),
        ToolSpec(
            name=READ_FILE,
            description="Read a file back from your virtual scratchpad by path.",
            schema={
                "type": "object",
                "properties": {"path": {"type": "string", "description": "The file to read."}},
                "required": ["path"],
            },
        ),
        ToolSpec(
            name=EDIT_FILE,
            description=(
                "Edit a scratchpad file in place: replace the first occurrence of "
                "old_string with new_string (append new_string if old_string is empty)."
            ),
            schema={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The file to edit."},
                    "old_string": {"type": "string", "description": "Text to replace."},
                    "new_string": {"type": "string", "description": "Replacement text."},
                },
                "required": ["path", "new_string"],
            },
        ),
        ToolSpec(
            name=LS,
            description="List the files currently in your virtual scratchpad.",
            schema={"type": "object", "properties": {}},
        ),
        ToolSpec(
            name=TASK,
            description=(
                "Delegate a focused sub-task to a sub-agent that runs with its own isolated "
                "context and tools, and returns only its final result — so the gathering "
                "never clutters your own context. Use it for self-contained research."
            ),
            schema={
                "type": "object",
                "properties": {
                    "description": {
                        "type": "string",
                        "description": "The self-contained task for the sub-agent to carry out.",
                    },
                    "subagent_type": {
                        "type": "string",
                        "enum": ["researcher"],
                        "description": "Which sub-agent to spawn (default: researcher).",
                    },
                },
                "required": ["description"],
            },
        ),
    ]


def agent_tool_specs(
    registry: ToolRegistry,
    enabled: list[str] | None,
    *,
    with_deepagents: bool = False,
) -> list[ToolSpec]:
    """The full tool list the agent sees: the retrieval tool plus the MCP tools.

    ``enabled`` gates every tool uniformly (006-interactive-experiments): ``None``
    advertises all; a list keeps only the named tools; ``[]`` advertises none. The
    retrieval tool follows the same rule, so disabling all tools also disables
    retrieval (an honest LLM-only run with no grounding).

    ``with_deepagents`` (057) appends the DeepAgents tools — the caller passes ``True``
    only on the Intermediate rung (and not when RAGLESS is active). They obey the same
    ``enabled`` gate; since they are not in ``/api/config``'s base list they default to
    on when ``enabled is None``.
    """
    specs: list[ToolSpec] = []
    if enabled is None or RETRIEVAL_TOOL in enabled:
        specs.append(retrieval_spec())
    specs.extend(registry.specs(enabled))
    if with_deepagents:
        for s in deepagents_specs():
            if enabled is None or s.name in enabled:
                specs.append(s)
    return specs
