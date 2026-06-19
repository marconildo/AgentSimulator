"""Real Ollama-backed provider (074-ollama-provider).

Mirrors :class:`OpenAIProvider` over LangChain's ``ChatOllama``, talking to a
**local** Ollama server (``base_url``). ``decide`` binds the advertised tools and
lets the model choose, reasoning over the running message *thread*;
``stream_answer`` streams the final grounded answer token by token. The prompt
assembly, tool shaping, and preview are shared with the OpenAI provider so the
two behave identically from the agent's perspective — only the transport differs.

No OpenAI key is required for an Ollama run (constitution §2, amended by 074).
``langchain_ollama`` is imported lazily so the dependency is only needed when an
agent is actually bound to Ollama.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AnyMessage

from .openai_provider import _assemble, _preview, _to_openai_tool
from .provider import Decision, LLMProvider, TokenUsage, ToolCall, ToolSpec

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, model: str, base_url: str | None = None) -> None:
        self.model_name = model
        self._base_url = base_url or DEFAULT_OLLAMA_BASE_URL
        self.last_stream_usage: TokenUsage | None = None

    def _client(self):
        # Lazy import: only required when an agent is bound to Ollama.
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=self.model_name,
            base_url=self._base_url,
            temperature=0,
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
        client = self._client()

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
        client = self._client()
        self.last_stream_usage = None
        async for chunk in client.astream(lc_messages):
            usage = TokenUsage.from_metadata(getattr(chunk, "usage_metadata", None))
            if usage:
                self.last_stream_usage = usage
            text: Any = chunk.content
            if isinstance(text, str) and text:
                yield text
