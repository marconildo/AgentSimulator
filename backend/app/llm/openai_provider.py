"""Real OpenAI-backed provider.

Uses LangChain's ``ChatOpenAI``. ``decide`` binds the advertised tools and lets
the model choose, reasoning over the running message *thread* (the canonical
ReAct conversation); ``stream_answer`` makes a streaming call over that same
thread to produce the final, grounded answer token by token. Tool results live
in the thread as ``ToolMessage``s — they are never stuffed into the system prompt
(026-agent-tool-autonomy).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from .provider import Decision, LLMProvider, TokenUsage, ToolCall, ToolSpec


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, model: str, api_key: str) -> None:
        self.model_name = model
        self._api_key = api_key
        self.last_stream_usage: TokenUsage | None = None

    def _client(self, *, streaming: bool) -> ChatOpenAI:
        return ChatOpenAI(
            model=self.model_name,
            api_key=self._api_key,
            temperature=0,
            streaming=streaming,
            # Ask the streaming API to report token usage on a final chunk so the
            # agent can record real completion tokens while still streaming (011).
            stream_usage=streaming,
        )

    async def decide(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        tools: list[ToolSpec],
        history: list[dict[str, str]] | None = None,
    ) -> Decision:
        lc_messages = _assemble(system, thread, history)
        client = self._client(streaming=False)

        if tools:
            openai_tools = [_to_openai_tool(t) for t in tools]
            client = client.bind_tools(openai_tools)

        result = await client.ainvoke(lc_messages)
        raw_calls = getattr(result, "tool_calls", None) or []

        tool_calls = [
            ToolCall(id=tc.get("id", ""), name=tc["name"], args=tc.get("args", {}))
            for tc in raw_calls
        ]
        return Decision(
            message=result,
            tool_calls=tool_calls,
            prompt_preview=_preview(system, thread, tools, history or []),
            usage=TokenUsage.from_metadata(getattr(result, "usage_metadata", None)),
        )

    async def stream_answer(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[str]:
        lc_messages = _assemble(system, thread, history)
        client = self._client(streaming=True)
        self.last_stream_usage = None
        async for chunk in client.astream(lc_messages):
            # Usage rides a final chunk (stream_usage=True); capture it so the
            # agent can record real generation tokens after the stream (011).
            usage = TokenUsage.from_metadata(getattr(chunk, "usage_metadata", None))
            if usage:
                self.last_stream_usage = usage
            text = chunk.content
            if isinstance(text, str) and text:
                yield text


def _system_block(system: str, history: list[dict[str, str]] | None) -> str:
    """The system prompt, with long-term-memory history folded in (if any).

    Retrieved context and tool results are NOT injected here anymore — they live
    in the thread as ToolMessages (026), so the model sees them as observations of
    its own tool calls, not as pre-supplied prompt text.
    """
    block = system
    if history:
        rendered = "\n".join(f"- user: {h['message']}\n  assistant: {h['answer']}" for h in history)
        block += f"\n\n# Recent conversation history (long-term memory)\n{rendered}"
    return block


def _assemble(
    system: str, thread: list[AnyMessage], history: list[dict[str, str]] | None
) -> list[Any]:
    return [SystemMessage(content=_system_block(system, history)), *thread]


def _to_openai_tool(tool: ToolSpec) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.schema or {"type": "object", "properties": {}},
        },
    }


def _preview(
    system: str,
    thread: list[AnyMessage],
    tools: list[ToolSpec],
    history: list[dict[str, str]],
) -> dict[str, Any]:
    """The assembled prompt, surfaced verbatim in the inspector.

    ``messages`` keeps just the user turns from the thread (what the inspector's
    message list shows); the retrieved-context readout (``context``) is added by
    the agent node from state, since the thread carries it as a ToolMessage.
    """
    user_turns = [
        {"role": "user", "content": m.content} for m in thread if isinstance(m, HumanMessage)
    ]
    return {
        "system": system,
        "messages": user_turns,
        "tools": [t.name for t in tools],
        "history": history,
    }
