"""The LangGraph agent.

Topology (a bounded ReAct loop)::

    START -> route -> retrieve -> think --(tool calls?)--> tools --+
                                    ^                               |
                                    +-------------------------------+
                                    |
                                    +--(no tool calls)--> generate -> respond -> END

Each node emits trace stages through the :class:`TraceEmitter` it receives via
the runnable ``config``, so the whole run is observable from the frontend.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from ..llm.provider import LLMProvider, get_provider
from ..mcp.client import ToolRegistry, get_registry
from ..rag.retriever import retrieve as rag_retrieve
from ..schemas import Phase, Stage
from ..trace import TraceEmitter
from .prompts import SYSTEM_PROMPT
from .state import AgentState

MAX_ITERATIONS = 3


def _deps(config: RunnableConfig) -> tuple[TraceEmitter, LLMProvider, ToolRegistry]:
    c = config["configurable"]  # type: ignore[index]
    return c["emitter"], c["provider"], c["registry"]


async def route_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, registry = _deps(config)

    async with emitter.stage(Stage.AGENT_ROUTE, "Agent received the query") as rec:
        rec.data = {
            "query": state["message"],
            "plan": "Retrieve context from the knowledge base, then decide whether to call tools.",
            "memory_turns": len(state["history"]),
        }

    async with emitter.stage(Stage.MCP_DISCOVER, "Discovering MCP tools") as rec:
        rec.data = {
            "transport": registry.transport,
            "tools": [{"name": s.name, "description": s.description} for s in registry.specs()],
        }
    return {}


async def retrieve_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, _registry = _deps(config)
    context, chunks = await rag_retrieve(state["message"], state["top_k"], emitter)
    return {"context": context, "chunks": chunks}


async def think_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, registry = _deps(config)
    messages = [{"role": "user", "content": state["message"]}]
    used = set(state["used_tools"])

    async with emitter.stage(Stage.AGENT_THINK, "Agent reasoning") as rec:
        decision = await provider.decide(
            system=SYSTEM_PROMPT,
            messages=messages,
            context=state["context"],
            tools=registry.specs(),
            used_tools=used,
            history=state["history"],
        )
        rec.data = {
            "model": provider.model_name,
            "decision": "call_tools" if decision.tool_calls else "answer",
            "tool_calls": [{"name": tc.name, "args": tc.args} for tc in decision.tool_calls],
        }

    # Surface exactly what was assembled and sent to the model.
    await emitter.emit(
        Stage.LLM_PROMPT,
        Phase.END,
        "Prompt assembled",
        data=decision.prompt_preview,
    )

    pending = [{"id": tc.id, "name": tc.name, "args": tc.args} for tc in decision.tool_calls]
    return {"pending_tool_calls": pending, "iterations": state["iterations"] + 1}


async def tools_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, registry = _deps(config)
    results = list(state["tool_results"])
    used = list(state["used_tools"])

    for tc in state["pending_tool_calls"]:
        async with emitter.stage(
            Stage.MCP_CALL,
            f"Calling tool: {tc['name']}",
            start_data={"tool": tc["name"], "args": tc["args"]},
        ) as rec:
            output = await registry.call(tc["name"], tc["args"])
            rec.data = {"tool": tc["name"], "args": tc["args"], "result": output}
        results.append({"tool": tc["name"], "args": tc["args"], "result": output})
        used.append(tc["name"])

    return {"tool_results": results, "used_tools": used, "pending_tool_calls": []}


async def generate_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, _registry = _deps(config)
    messages = [{"role": "user", "content": state["message"]}]

    async with emitter.stage(Stage.LLM_GENERATE, "Generating the answer") as rec:
        tokens: list[str] = []
        async for token in provider.stream_answer(
            system=SYSTEM_PROMPT,
            messages=messages,
            context=state["context"],
            tool_results=state["tool_results"],
            history=state["history"],
        ):
            tokens.append(token)
            await emitter.emit(Stage.LLM_GENERATE, Phase.PROGRESS, data={"token": token})
        answer = "".join(tokens)
        rec.data = {"answer": answer, "model": provider.model_name}
        rec.metrics["tokens"] = float(len(tokens))

    return {"answer": answer}


async def respond_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, _registry = _deps(config)
    emitter.answer = state["answer"]
    async with emitter.stage(Stage.RESPOND, "Returning the answer to the user") as rec:
        rec.data = {"answer": state["answer"]}
    return {}


def _should_continue(state: AgentState) -> str:
    if state["pending_tool_calls"] and state["iterations"] <= MAX_ITERATIONS:
        return "tools"
    return "generate"


@lru_cache
def get_compiled_graph():
    builder = StateGraph(AgentState)
    builder.add_node("route", route_node)
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("think", think_node)
    builder.add_node("tools", tools_node)
    builder.add_node("generate", generate_node)
    builder.add_node("respond", respond_node)

    builder.add_edge(START, "route")
    builder.add_edge("route", "retrieve")
    builder.add_edge("retrieve", "think")
    builder.add_conditional_edges("think", _should_continue, {"tools": "tools", "generate": "generate"})
    builder.add_edge("tools", "think")
    builder.add_edge("generate", "respond")
    builder.add_edge("respond", END)
    return builder.compile()


async def run_agent(
    message: str,
    top_k: int,
    emitter: TraceEmitter,
    history: list[dict[str, str]] | None = None,
) -> str:
    """Run the full agent for one message, emitting trace events as it goes.

    ``history`` is long-term memory (prior turns) loaded from the application
    database; it is folded into the prompt context.
    """
    provider = get_provider()
    registry = await get_registry()
    graph = get_compiled_graph()

    initial: AgentState = {
        "message": message,
        "top_k": top_k,
        "context": "",
        "chunks": [],
        "history": history or [],
        "pending_tool_calls": [],
        "tool_results": [],
        "used_tools": [],
        "iterations": 0,
        "answer": "",
    }
    config: RunnableConfig = {
        "configurable": {"emitter": emitter, "provider": provider, "registry": registry},
        "recursion_limit": 25,
    }
    final_state = await graph.ainvoke(initial, config=config)
    return final_state["answer"]
