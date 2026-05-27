"""The LangGraph agent — a canonical, tool-calling ReAct loop.

Topology::

    START -> route -> think --(tool calls?)--> tools --+
                        ^                                |
                        +--------------------------------+
                        |
                        +--(no tool calls)--> generate -> respond -> END

The agent reasons over a **canonical message thread** (``AgentState.messages``):
the model is bound to the advertised tools and *chooses* what to call; its
``AIMessage(tool_calls=…)`` is appended to the thread and each tool's result
returns as a ``ToolMessage`` (026-agent-tool-autonomy). Every tool call —
including **knowledge-base retrieval**, which is just another tool
(``search_knowledge_base``) — is therefore an honest agent decision, visible as
the standard tool-calling chain in a LangSmith trace.

Each node emits trace stages through the :class:`TraceEmitter` it receives via
the runnable ``config``, so the whole run is observable from the frontend.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, cast

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from ..llm.pricing import usage_metrics
from ..llm.provider import LLMProvider, get_provider
from ..mcp.client import ToolRegistry, get_registry, jsonrpc_frames
from ..mcp.server import found_for
from ..rag.retriever import retrieve as rag_retrieve
from ..schemas import Phase, Stage
from ..trace import TraceEmitter
from .prompts import SYSTEM_PROMPT
from .state import AgentState
from .tools import agent_tool_specs, is_retrieval

MAX_ITERATIONS = 3

# 017-failure-injection — deterministic, clearly-labelled *simulated* failures.
# The observation fed back to the model uses the MCP error convention
# (``error:`` prefix, like a real failed call) so the agent reasons over it and
# degrades/abstains. Labelled ``simulated: true`` on the event so it is honest.
SIMULATED_TOOL_ERROR = "error: simulated tool failure (injected by the failure simulator)"
SIMULATED_TIMEOUT = "simulated LLM timeout (injected by the failure simulator)"
# The degraded answer when the model "times out": a system fallback (the model
# produced nothing), surfaced on the trace + persisted. The bilingual badge the
# UI shows around it lives in the frontend i18n (constitution §4).
DEGRADED_TIMEOUT_ANSWER = "The model timed out — no answer this turn."


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
            "plan": "Decide which tools to call — search the knowledge base, run a "
            "calculation, check the time — then answer.",
            "memory_turns": len(state["history"]),
        }

    async with emitter.stage(Stage.MCP_DISCOVER, "Discovering available tools") as rec:
        specs = agent_tool_specs(registry, state["enabled_tools"])
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


async def think_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, registry = _deps(config)
    specs = agent_tool_specs(registry, state["enabled_tools"])

    async with emitter.stage(Stage.AGENT_THINK, "Agent reasoning") as rec:
        # The agent reasons by *calling the model* — the LLM is its brain, used on
        # every round, not just to write the final answer. Wrap the decide call in
        # an llm.prompt span so the LLM station is observably active while it thinks
        # and the Agent → LLM round-trip animates (010-llm-as-brain). The span's END
        # still carries the assembled prompt preview the inspector shows.
        try:
            async with emitter.stage(Stage.LLM_PROMPT, "Reasoning with the model") as prompt_rec:
                # 017-failure-injection: a deterministic, *simulated* model timeout.
                if state.get("simulate_failure") == "llm_timeout":
                    prompt_rec.data = {"error": SIMULATED_TIMEOUT, "simulated": True}
                    raise TimeoutError(SIMULATED_TIMEOUT)
                decision = await provider.decide(
                    system=_effective_system(state),
                    thread=state["messages"],
                    tools=specs,
                    history=state["history"],
                )
                # The retrieved-context readout (the inspector's "context window")
                # comes from state — the thread carries it as a ToolMessage.
                prompt_rec.data = {**decision.prompt_preview, "context": state["context"]}
        except TimeoutError as exc:
            # Only the *injected* timeout degrades here; a real model timeout
            # propagates unchanged to main.py's handler (preserves prior behavior).
            if state.get("simulate_failure") != "llm_timeout":
                raise
            rec.data = {
                "model": provider.model_name,
                "decision": "error",
                "error": str(exc),
                "simulated": True,
            }
            # Degrade cleanly: set the fallback answer and route straight to
            # respond (_should_continue), skipping tools + a real generation.
            return {
                "iterations": state["iterations"] + 1,
                "answer": DEGRADED_TIMEOUT_ANSWER,
            }
        rec.data = {
            "model": provider.model_name,
            "decision": "call_tools" if decision.tool_calls else "answer",
            "tool_calls": [{"name": tc.name, "args": tc.args} for tc in decision.tool_calls],
        }
        # This reasoning round is a real LLM call — record its token usage + cost
        # so the LLM block can total rounds, tokens and US$ (011-token-cost).
        if decision.usage:
            rec.metrics.update(usage_metrics(provider.model_name, decision.usage))

    # Continue the loop only when there are tool calls AND we are within the
    # iteration bound. We append the tool-calling AIMessage to the thread *only*
    # when we will actually execute it, so the thread never ends with a dangling
    # AIMessage(tool_calls) that has no matching ToolMessage (which OpenAI rejects).
    iterations = state["iterations"] + 1
    continue_loop = bool(decision.tool_calls) and iterations <= MAX_ITERATIONS
    update: dict[str, Any] = {"iterations": iterations}
    if continue_loop:
        update["messages"] = [decision.message]
    return update


async def _run_mcp_tool(
    name: str,
    args: dict[str, Any],
    state: AgentState,
    registry: ToolRegistry,
    emitter: TraceEmitter,
    fail_tool: bool,
) -> str:
    """Execute an MCP tool, animating the MCP station (mcp.call)."""
    async with emitter.stage(
        Stage.MCP_CALL,
        f"Calling tool: {name}",
        start_data={"tool": name, "args": args},
    ) as rec:
        if fail_tool:
            output = SIMULATED_TOOL_ERROR
        else:
            output = await registry.call(name, args, enabled=state["enabled_tools"])
        is_error = str(output).startswith("error:")
        rec.data = {
            "tool": name,
            "args": args,
            "result": output,
            # 021-abstain-badge: a structured not-found signal on the open `data`
            # record (no new Stage). False = the tool returned empty/not-found, so
            # a well-behaved agent abstains on this sub-query; the UI badges it.
            # A simulated failure is an *error* (017), not an abstention, so it
            # keeps found=True (the error badge covers that case).
            "found": True if fail_tool else found_for(name, output),
            # The actual JSON-RPC tool-call exchange (007): a `tools/call` request
            # and a CallToolResult response with text content.
            "jsonrpc": jsonrpc_frames(
                "tools/call",
                {"name": name, "arguments": args},
                {"content": [{"type": "text", "text": output}], "isError": is_error},
                reconstructed=registry.transport == "local-fallback",
            ),
        }
        if fail_tool:
            rec.data["error"] = SIMULATED_TOOL_ERROR
            rec.data["simulated"] = True
    return output


async def _run_retrieval_tool(
    args: dict[str, Any],
    state: AgentState,
    emitter: TraceEmitter,
    fail_tool: bool,
) -> tuple[str, str, list[dict[str, Any]]]:
    """Execute the knowledge-base retrieval tool, animating the RAG station.

    Returns ``(observation, context, chunks)``: the observation becomes the
    ToolMessage fed back to the model; context + chunks update the display mirrors.
    """
    query = args.get("query") or state["message"]
    if fail_tool:
        # 017: surface the injected failure on a rag.retrieve END (so it is visible
        # on the RAG station) without running the real search.
        async with emitter.stage(Stage.RAG_RETRIEVE, "Selecting top-k chunks") as rec:
            rec.data = {
                "chunks": [],
                "k": state["top_k"],
                "error": SIMULATED_TOOL_ERROR,
                "simulated": True,
            }
        return SIMULATED_TOOL_ERROR, state["context"], state["chunks"]

    context, chunks = await rag_retrieve(
        query, state["top_k"], emitter, session_id=state["session_id"]
    )
    observation = context or "(no relevant passages found in the knowledge base)"
    return observation, context, chunks


async def tools_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, registry = _deps(config)
    # The pending calls are the tool_calls on the AIMessage think just appended.
    last = state["messages"][-1]
    pending = getattr(last, "tool_calls", None) or []

    used = list(state["used_tools"])
    context = state["context"]
    chunks = list(state["chunks"])
    fail_tool = state.get("simulate_failure") == "tool_error"

    tool_messages: list[ToolMessage] = []
    for tc in pending:
        name = tc["name"]
        args = tc.get("args", {}) or {}
        call_id = tc.get("id", "")
        if is_retrieval(name):
            output, context, chunks = await _run_retrieval_tool(args, state, emitter, fail_tool)
        else:
            output = await _run_mcp_tool(name, args, state, registry, emitter, fail_tool)
        # Feed the observation back as a ToolMessage so the next reasoning round
        # (and the trace) sees the canonical AIMessage(tool_calls) → ToolMessage
        # chain — the result is never stuffed into the system prompt.
        tool_messages.append(ToolMessage(content=str(output), tool_call_id=call_id, name=name))
        used.append(name)

    return {
        "messages": tool_messages,
        "used_tools": used,
        "context": context,
        "chunks": chunks,
    }


async def generate_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, provider, _registry = _deps(config)

    # In stream mode each token is emitted as a PROGRESS event so the UI types
    # the answer out live; in batch mode we collect them silently and surface
    # the whole answer at once on the END event (the synchronous contract).
    streaming = state["mode"] != "batch"
    async with emitter.stage(Stage.LLM_GENERATE, "Generating the answer") as rec:
        tokens: list[str] = []
        async for token in provider.stream_answer(
            system=_effective_system(state),
            thread=state["messages"],
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

    # Close the canonical thread with the final assistant message.
    return {"answer": answer, "messages": [AIMessage(content=answer)]}


async def respond_node(state: AgentState, config: RunnableConfig) -> dict[str, Any]:
    emitter, _provider, _registry = _deps(config)
    emitter.answer = state["answer"]
    async with emitter.stage(Stage.RESPOND, "Returning the answer to the user") as rec:
        rec.data = {"answer": state["answer"]}
    return {}


def _should_continue(state: AgentState) -> str:
    # 017-failure-injection: a simulated LLM timeout in think_node degrades the run
    # — skip tools + generation and go straight to respond with the fallback answer.
    if state.get("simulate_failure") == "llm_timeout":
        return "respond"
    # think appends the tool-calling AIMessage only when it intends to loop, so a
    # trailing AIMessage with tool_calls is the signal to execute them.
    messages = state["messages"]
    if messages:
        last = messages[-1]
        if isinstance(last, AIMessage) and getattr(last, "tool_calls", None):
            return "tools"
    return "generate"


@lru_cache
def get_compiled_graph():
    builder = StateGraph(AgentState)
    builder.add_node("route", route_node)
    builder.add_node("think", think_node)
    builder.add_node("tools", tools_node)
    builder.add_node("generate", generate_node)
    builder.add_node("respond", respond_node)

    builder.add_edge(START, "route")
    builder.add_edge("route", "think")
    builder.add_conditional_edges(
        "think",
        _should_continue,
        # "respond" is the 017 degraded path (simulated llm_timeout): skip tools +
        # generation and return the fallback answer set in think_node.
        {"tools": "tools", "generate": "generate", "respond": "respond"},
    )
    builder.add_edge("tools", "think")
    builder.add_edge("generate", "respond")
    builder.add_edge("respond", END)
    return builder.compile()


async def run_agent_state(
    message: str,
    top_k: int,
    emitter: TraceEmitter,
    history: list[dict[str, str]] | None = None,
    mode: str = "stream",
    session_id: str | None = None,
    system_prompt: str | None = None,
    enabled_tools: list[str] | None = None,
    scenario: str = "simple",
    simulate_failure: str = "none",
) -> AgentState:
    """Run the agent for one message and return the final graph state.

    Exposed (alongside :func:`run_agent`) so tests can inspect the canonical
    message thread (``state["messages"]``) the run produced.
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
        "simulate_failure": simulate_failure,
        "history": history or [],
        "messages": [HumanMessage(content=message)],
        "context": "",
        "chunks": [],
        "used_tools": [],
        "iterations": 0,
        "answer": "",
    }
    config: RunnableConfig = {
        "configurable": {"emitter": emitter, "provider": provider, "registry": registry},
        "recursion_limit": 25,
    }
    return cast(AgentState, await graph.ainvoke(initial, config=config))


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
    simulate_failure: str = "none",
) -> str:
    """Run the full agent for one message, emitting trace events as it goes.

    ``history`` is long-term memory (prior turns) loaded from the application
    database; it is folded into the prompt context. ``mode`` controls delivery
    of the answer: ``"stream"`` emits per-token events, ``"batch"`` produces it
    in one shot. ``session_id`` scopes RAG retrieval to the base corpus plus this
    conversation's uploaded documents.

    006-interactive-experiments request-only overrides (all optional; omitting
    them reproduces today's behavior): ``system_prompt`` fully replaces the
    default prompt (blank ⇒ default); ``enabled_tools`` restricts which tools are
    discovered and callable — including knowledge-base retrieval
    (``None`` = all, ``[]`` = none).
    """
    final_state = await run_agent_state(
        message,
        top_k,
        emitter,
        history=history,
        mode=mode,
        session_id=session_id,
        system_prompt=system_prompt,
        enabled_tools=enabled_tools,
        scenario=scenario,
        simulate_failure=simulate_failure,
    )
    return final_state["answer"]
