"""Real OpenAI-backed provider.

Uses LangChain's ``ChatOpenAI``. ``decide`` binds the advertised tools and lets
the model choose; ``stream_answer`` makes a tool-free streaming call to produce
the final, grounded answer token by token.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
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
        messages: list[dict[str, str]],
        context: str,
        tools: list[ToolSpec],
        used_tools: set[str],
        history: list[dict[str, str]] | None = None,
    ) -> Decision:
        lc_messages = _build_messages(system, context, messages, history=history)
        client = self._client(streaming=False)

        if tools:
            openai_tools = [_to_openai_tool(t) for t in tools]
            client = client.bind_tools(openai_tools)

        result = await client.ainvoke(lc_messages)
        raw_calls = getattr(result, "tool_calls", None) or []

        tool_calls = [
            ToolCall(id=tc.get("id", ""), name=tc["name"], args=tc.get("args", {}))
            for tc in raw_calls
            if tc["name"] not in used_tools
        ]
        return Decision(
            tool_calls=tool_calls,
            prompt_preview=_preview(system, context, messages, tools, history or []),
            usage=TokenUsage.from_metadata(getattr(result, "usage_metadata", None)),
        )

    async def stream_answer(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        context: str,
        tool_results: list[dict[str, Any]],
        history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[str]:
        lc_messages = _build_messages(system, context, messages, tool_results, history)
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


def _build_messages(
    system: str,
    context: str,
    messages: list[dict[str, str]],
    tool_results: list[dict[str, Any]] | None = None,
    history: list[dict[str, str]] | None = None,
) -> list[Any]:
    system_block = system
    if history:
        rendered = "\n".join(f"- user: {h['message']}\n  assistant: {h['answer']}" for h in history)
        system_block += f"\n\n# Recent conversation history (long-term memory)\n{rendered}"
    if context.strip():
        system_block += f"\n\n# Retrieved context\n{context}"
    if tool_results:
        rendered = "\n".join(
            f"- {tr['tool']}({tr['args']}) -> {tr['result']}" for tr in tool_results
        )
        system_block += f"\n\n# Tool results\n{rendered}"

    out: list[Any] = [SystemMessage(content=system_block)]
    for m in messages:
        if m["role"] == "user":
            out.append(HumanMessage(content=m["content"]))
        else:
            out.append(AIMessage(content=m["content"]))
    return out


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
    context: str,
    messages: list[dict[str, str]],
    tools: list[ToolSpec],
    history: list[dict[str, str]],
) -> dict[str, Any]:
    return {
        "system": system,
        "context": context,
        "messages": messages,
        "tools": [t.name for t in tools],
        "history": history,
    }
