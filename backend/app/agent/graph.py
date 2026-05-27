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

from ..llm.pricing import usage_metrics
from ..llm.provider import LLMProvider, get_provider
from ..mcp.client import ToolRegistry, get_registry, jsonrpc_frames
from ..rag.retriever import retrieve as rag_retrieve
from ..schemas import Phase, Stage
from ..trace import TraceEmitter
from .prompts import SYSTEM_PROMPT
from .state import AgentState

MAX_ITERATIONS = 3


def _deps(config: RunnableConfig) -> tuple[TraceEmitter, LLMProvider, ToolRegistry]:
    c = config["configurable"]  # type: ignore[index]
    return c["emitter"], c["provider"], c["registry"]


def _effective_system(state: AgentState) -> str:
    """The system prompt actually sent to the model.

    006-interactive-experiments: a non-blank ``system_prompt`` override fully
    replaces the default; a blank/whitespace one (or absent) falls back to the
    default ``SYSTEM_PROMPT``.
    """
    override = state["system_prompt"]
    if override and override.strip():
        return override
    return SYSTEM_PROMPT


async def route_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, registry = _deps(config)

    async with emitter.stage(Stage.AGENT_ROUTE, "Agent received the query") as rec:
        rec.data = {
            "query": state["message"],
            "plan": "Retrieve context from the knowledge base, then decide whether to call tools.",
            "memory_turns": len(state["history"]),
        }

    async with emitter.stage(Stage.MCP_DISCOVER, "Discovering MCP tools") as rec:
        specs = registry.specs(state["enabled_tools"])
        rec.data = {
            "transport": registry.transport,
            "tools": [{"name": s.name, "description": s.description} for s in specs],
            # The actual JSON-RPC discovery exchange (007); reconstructed for the
            # in-process fallback, faithful to the wire for mcp-stdio.
            "jsonrpc": jsonrpc_frames(
                "tools/list",
                {},
                {
                    "tools": [
                        {
                            "name": s.name,
                            "description": s.description,
                            "inputSchema": s.schema,
                        }
                        for s in specs
                    ]
                },
                reconstructed=registry.transport == "local-fallback",
            ),
        }
    return {}


async def retrieve_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, _registry = _deps(config)
    context, chunks = await rag_retrieve(
        state["message"], state["top_k"], emitter, session_id=state["session_id"]
    )
    return {"context": context, "chunks": chunks}


async def think_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, registry = _deps(config)
    messages = [{"role": "user", "content": state["message"]}]
    used = set(state["used_tools"])

    async with emitter.stage(Stage.AGENT_THINK, "Agent reasoning") as rec:
        # The agent reasons by *calling the model* — the LLM is its brain, used on
        # every round, not just to write the final answer. Wrap the decide call in
        # an llm.prompt span so the LLM station is observably active while it thinks
        # and the Agent → LLM round-trip animates (010-llm-as-brain). The span's END
        # still carries the assembled prompt preview the inspector shows.
        async with emitter.stage(Stage.LLM_PROMPT, "Reasoning with the model") as prompt_rec:
            decision = await provider.decide(
                system=_effective_system(state),
                messages=messages,
                context=state["context"],
                tools=registry.specs(state["enabled_tools"]),
                used_tools=used,
                history=state["history"],
            )
            prompt_rec.data = decision.prompt_preview
        rec.data = {
            "model": provider.model_name,
            "decision": "call_tools" if decision.tool_calls else "answer",
            "tool_calls": [{"name": tc.name, "args": tc.args} for tc in decision.tool_calls],
        }
        # This reasoning round is a real LLM call — record its token usage + cost
        # so the LLM block can total rounds, tokens and US$ (011-token-cost).
        if decision.usage:
            rec.metrics.update(usage_metrics(provider.model_name, decision.usage))

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
            output = await registry.call(tc["name"], tc["args"], enabled=state["enabled_tools"])
            rec.data = {
                "tool": tc["name"],
                "args": tc["args"],
                "result": output,
                # The actual JSON-RPC tool-call exchange (007): a `tools/call`
                # request and a CallToolResult response with text content.
                "jsonrpc": jsonrpc_frames(
                    "tools/call",
                    {"name": tc["name"], "arguments": tc["args"]},
                    {
                        "content": [{"type": "text", "text": output}],
                        "isError": str(output).startswith("error:"),
                    },
                    reconstructed=registry.transport == "local-fallback",
                ),
            }
        results.append({"tool": tc["name"], "args": tc["args"], "result": output})
        used.append(tc["name"])

    return {"tool_results": results, "used_tools": used, "pending_tool_calls": []}


async def generate_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, _registry = _deps(config)
    messages = [{"role": "user", "content": state["message"]}]

    # In stream mode each token is emitted as a PROGRESS event so the UI types
    # the answer out live; in batch mode we collect them silently and surface
    # the whole answer at once on the END event (a single, non-incremental
    # delivery — the synchronous request/response contract).
    streaming = state["mode"] != "batch"
    async with emitter.stage(Stage.LLM_GENERATE, "Generating the answer") as rec:
        tokens: list[str] = []
        async for token in provider.stream_answer(
            system=_effective_system(state),
            messages=messages,
            context=state["context"],
            tool_results=state["tool_results"],
            history=state["history"],
        ):
            tokens.append(token)
            if streaming:
                await emitter.emit(Stage.LLM_GENERATE, Phase.PROGRESS, data={"token": token})
        answer = "".join(tokens)
        rec.data = {"answer": answer, "model": provider.model_name, "delivery": state["mode"]}
        rec.metrics["tokens"] = float(len(tokens))
        # Real generation usage + cost (011), captured from the streamed final chunk.
        if provider.last_stream_usage:
            rec.metrics.update(usage_metrics(provider.model_name, provider.last_stream_usage))

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
    builder.add_conditional_edges(
        "think", _should_continue, {"tools": "tools", "generate": "generate"}
    )
    builder.add_edge("tools", "think")
    builder.add_edge("generate", "respond")
    builder.add_edge("respond", END)
    return builder.compile()


async def run_agent(
    message: str,
    top_k: int,
    emitter: TraceEmitter,
    history: list[dict[str, str]] | None = None,
    mode: str = "stream",
    session_id: str | None = None,
    system_prompt: str | None = None,
    enabled_tools: list[str] | None = None,
    scenario: str = "simple",
) -> str:
    """Run the full agent for one message, emitting trace events as it goes.

    ``history`` is long-term memory (prior turns) loaded from the application
    database; it is folded into the prompt context. ``mode`` controls delivery
    of the answer: ``"stream"`` emits per-token events, ``"batch"`` produces it
    in one shot. ``session_id`` scopes RAG retrieval to the base corpus plus this
    conversation's uploaded documents.

    006-interactive-experiments request-only overrides (all optional; omitting
    them reproduces today's behavior): ``system_prompt`` fully replaces the
    default prompt (blank ⇒ default); ``enabled_tools`` restricts which MCP tools
    are discovered and callable (``None`` = all, ``[]`` = none).
    """
    provider = get_provider()
    registry = await get_registry()
    graph = get_compiled_graph()

    initial: AgentState = {
        "message": message,
        "session_id": session_id,
        "top_k": top_k,
        "mode": mode,
        "system_prompt": system_prompt,
        "enabled_tools": enabled_tools,
        "scenario": scenario,
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
