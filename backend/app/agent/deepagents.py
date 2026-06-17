"""DeepAgents runtime (057-deepagents-runtime): the four pillars, hand-built.

DeepAgents is the agent pattern behind LangChain's ``deepagents`` library: a lead agent
that plans explicitly, offloads work to a **virtual file system**, and **delegates to
sub-agents** that run with their own isolated context ("context quarantine"). It is
*model-driven* — these are tools the agent elects inside its ReAct loop, not a scripted
preamble. This module hand-builds that architecture on our instrumented graph (so the
whole visualizer keeps working) rather than adopting the library as a black box.

The pillars, each a tool the lead agent calls (advertised on the Intermediate rung in
:mod:`.tools`):

  1. **Planning** — ``write_todos`` records an ordered todo list with per-item *status*
     (``pending`` / ``in_progress`` / ``completed``) in ``AgentState["plan"]`` → ``agent.plan``.
  2. **Virtual file system** — ``write_file`` / ``read_file`` / ``edit_file`` / ``ls`` over
     ``AgentState["vfs"]`` (an in-memory ``dict``) → ``agent.fs.write`` / ``agent.fs.read``.
  3. **Sub-agents** — ``task`` spawns a **real bounded sub-agent**: its own system prompt,
     its own tool subset, its own message thread and ReAct loop. Only its final result
     returns to the lead agent (context quarantine) → ``agent.delegate`` wrapping the
     sub-agent's nested tool stages.
  4. **Detailed prompt** — ``DEEPAGENTS_PROMPT`` (in :mod:`.prompts`) tells the lead agent
     how/when to use all of the above, and to skip them for trivial requests.

Summarization (the library's context-compaction middleware) is deferred — it is a
context-management optimization, not a visible pillar, and would add a new ``Stage``.
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from ..llm.provider import LLMProvider, ToolSpec
from ..mcp.client import ToolRegistry
from ..rag.retriever import retrieve as rag_retrieve
from ..schemas import Stage
from ..trace import TraceEmitter
from .tools import (
    EDIT_FILE,
    LS,
    READ_FILE,
    TASK,
    WRITE_FILE,
    WRITE_TODOS,
    is_retrieval,
    retrieval_spec,
)

# Bound on a sub-agent's own ReAct loop — keeps the delegated work (and cost) finite.
SUBAGENT_MAX_ITERS = 2

# The one sub-agent type shipped today: a researcher that gathers + digests context. The
# Advanced rung's researcher/coder/critic trio is a later spec; the registry below is the
# seam it will extend.
_SUBAGENT_PROMPTS: dict[str, str] = {
    "researcher": (
        "You are a researcher sub-agent working under a lead agent. Investigate the task "
        "using your tools (search the knowledge base; if it is off-topic, web search). "
        "Reason over what you find, then return a concise factual findings report (3 to 6 "
        "sentences) the lead agent can act on. Do not address the user directly."
    ),
}

VALID_STATUSES = ("pending", "in_progress", "completed")


def _norm_todos(raw: Any) -> list[dict[str, str]]:
    """Normalize the ``write_todos`` payload into ``[{content, status}]``.

    Accepts plain strings (status defaults to ``pending``) or ``{content, status}``
    objects, so the model can either lay out a fresh plan or update item statuses.
    """
    todos: list[dict[str, str]] = []
    for item in raw or []:
        if isinstance(item, dict):
            content = str(item.get("content", "")).strip()
            status = str(item.get("status", "pending")).strip() or "pending"
        else:
            content, status = str(item).strip(), "pending"
        if status not in VALID_STATUSES:
            status = "pending"
        if content:
            todos.append({"content": content, "status": status})
    return todos


# --- The sub-agent runtime (pillar 3) ----------------------------------------------


def _subagent_tools(subagent_type: str, registry: ToolRegistry) -> list[ToolSpec]:
    """The tool subset a sub-agent of this type may use (its isolated capability set)."""
    if subagent_type == "researcher":
        web = [s for s in registry.specs(None) if s.name == "web_search"]
        return [retrieval_spec(), *web]
    return [retrieval_spec()]


async def _subagent_exec(
    name: str,
    args: dict[str, Any],
    state: dict[str, Any],
    emitter: TraceEmitter,
    registry: ToolRegistry,
) -> str:
    """Run one tool call inside a sub-agent, animating the relevant station."""
    if is_retrieval(name):
        query = args.get("query") or state.get("message") or ""
        context, _chunks = await rag_retrieve(
            query,
            state.get("top_k", 3),
            emitter,
            session_id=state.get("session_id"),
            rerank=state.get("rerank", False),
            rerank_threshold=state.get("rerank_threshold", 0.0),
        )
        return context or "(no relevant passages found)"
    return await registry.call(name, args)


async def run_subagent(
    description: str,
    *,
    subagent_type: str,
    emitter: TraceEmitter,
    provider: LLMProvider,
    registry: ToolRegistry,
    state: dict[str, Any],
) -> str:
    """Spawn a real bounded sub-agent and return only its final result.

    The sub-agent runs its **own** ReAct loop over its **own** message thread with its
    **own** tool subset — its intermediate reasoning never enters the lead agent's thread
    (context quarantine). The ``agent.delegate`` span wraps the whole hand-off; the nested
    retrieval/tool stages animate their stations as the sub-agent works.
    """
    sub_tools = _subagent_tools(subagent_type, registry)
    system = _SUBAGENT_PROMPTS.get(subagent_type, _SUBAGENT_PROMPTS["researcher"])
    thread: list[Any] = [HumanMessage(content=description)]
    steps: list[str] = []

    async with emitter.stage(
        Stage.AGENT_DELEGATE, f"Delegating to {subagent_type} sub-agent"
    ) as rec:
        rec.data = {"subagent": subagent_type, "subtask": description}
        result = ""
        for _ in range(SUBAGENT_MAX_ITERS):
            decision = await provider.decide(system=system, thread=thread, tools=sub_tools)
            if not decision.tool_calls:
                result = _text(decision.message)
                break
            thread.append(decision.message)
            for tc in decision.tool_calls:
                obs = await _subagent_exec(tc.name, tc.args, state, emitter, registry)
                steps.append(tc.name)
                thread.append(ToolMessage(content=str(obs), tool_call_id=tc.id, name=tc.name))
        else:
            # Iteration bound hit while still calling tools — ask for a final synthesis
            # with no tools so the sub-agent always returns a result (never a dangling call).
            final = await provider.decide(
                system=f"{system}\n\nStop researching and write your final findings now.",
                thread=thread,
                tools=[],
            )
            result = _text(final.message)
        rec.data = {
            "subagent": subagent_type,
            "subtask": description,
            "result": result,
            # The sub-agent's tool trail — what it did, shown in the delegation drill-in.
            "steps": steps,
            "rounds": len(steps),
            # Kept for the existing drill-in / tests that read a `digest`.
            "digest": result,
        }
    return result or "(the sub-agent returned no findings)"


def _text(message: AIMessage) -> str:
    content = message.content
    return (content if isinstance(content, str) else str(content)).strip()


# --- Tool dispatch (called from graph.tools_node) ----------------------------------


async def run_deepagents_tool(
    name: str,
    args: dict[str, Any],
    state: dict[str, Any],
    emitter: TraceEmitter,
    vfs: dict[str, str],
    plan: list[dict[str, str]],
    *,
    provider: LLMProvider,
    registry: ToolRegistry,
) -> str:
    """Execute one DeepAgents tool, emitting its stage and mutating ``vfs`` / ``plan``.

    ``vfs`` and ``plan`` are the caller's working copies (from ``tools_node``); this
    mutates them in place and the node returns them as state updates. Returns the string
    observation fed back to the model as the ToolMessage.
    """
    if name == WRITE_TODOS:
        todos = _norm_todos(args.get("todos"))
        async with emitter.stage(Stage.AGENT_PLAN, "Updating the plan") as rec:
            rec.data = {
                "todos": todos,
                "steps": [t["content"] for t in todos],  # back-compat for the drill-in
                "count": len(todos),
            }
            rec.metrics["steps"] = float(len(todos))
        plan[:] = todos
        done = sum(1 for t in todos if t["status"] == "completed")
        return f"Plan updated: {len(todos)} todos ({done} completed)." if todos else "Plan cleared."

    if name == WRITE_FILE:
        path = str(args.get("path") or "").strip()
        content = str(args.get("content") or "")
        return await _fs_write(path, content, vfs, emitter)

    if name == EDIT_FILE:
        path = str(args.get("path") or "").strip()
        old = str(args.get("old_string") or "")
        new = str(args.get("new_string") or "")
        if path not in vfs:
            async with emitter.stage(Stage.AGENT_FS_WRITE, f"Editing {path or '(unnamed)'}") as rec:
                rec.data = {"path": path, "content": "", "bytes": 0, "files": sorted(vfs)}
            return f"error: no such file '{path}'"
        if old and old not in vfs[path]:
            return f"error: old_string not found in '{path}'"
        edited = vfs[path].replace(old, new) if old else (vfs[path] + new)
        return await _fs_write(path, edited, vfs, emitter)

    if name == READ_FILE:
        path = str(args.get("path") or "").strip()
        async with emitter.stage(Stage.AGENT_FS_READ, f"Reading {path or '(unnamed)'}") as rec:
            content = vfs.get(path, "")
            found = path in vfs
            rec.data = {"path": path, "content": content, "found": found}
        return content if found else f"error: no such file '{path}'"

    if name == LS:
        files = sorted(vfs)
        async with emitter.stage(Stage.AGENT_FS_READ, "Listing scratchpad files") as rec:
            rec.data = {"path": ".", "content": "\n".join(files), "files": files, "found": True}
        return "\n".join(files) if files else "(scratchpad is empty)"

    if name == TASK:
        description = str(args.get("description") or args.get("topic") or "").strip()
        subagent_type = str(args.get("subagent_type") or "researcher").strip() or "researcher"
        return await run_subagent(
            description,
            subagent_type=subagent_type,
            emitter=emitter,
            provider=provider,
            registry=registry,
            state=state,
        )

    return f"error: unknown DeepAgents tool '{name}'"


async def _fs_write(path: str, content: str, vfs: dict[str, str], emitter: TraceEmitter) -> str:
    async with emitter.stage(Stage.AGENT_FS_WRITE, f"Writing {path or '(unnamed)'}") as rec:
        if path:
            vfs[path] = content
        rec.data = {"path": path, "content": content, "bytes": len(content), "files": sorted(vfs)}
        rec.metrics["bytes"] = float(len(content))
    return f"Wrote {len(content)} bytes to {path}." if path else "error: a path is required."
