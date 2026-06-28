"""Real Google Vertex AI-backed provider.

Mirrors :class:`OpenAIProvider` over LangChain's ``ChatVertexAI``, talking to
Google Cloud Vertex AI. No OpenAI key is required (constitution §2, amended by 089).
``langchain_google_vertexai`` is imported lazily so the dependency is only needed when
an agent is actually bound to Vertex AI.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AnyMessage

from .openai_provider import _assemble, _preview, _to_openai_tool
from .provider import Decision, LLMProvider, TokenUsage, ToolCall, ToolSpec


class VertexAIProvider(LLMProvider):
    name = "vertexai"

    def __init__(
        self,
        model: str,
        project: str | None = None,
        location: str | None = None,
        credentials: str | None = None,
    ) -> None:
        self.model_name = model
        self._project = project
        self._location = location
        self._credentials = credentials
        self.last_stream_usage: TokenUsage | None = None

    def _client(self) -> Any:
        # Lazy imports so we don't import GCP/Google libs unless needed at runtime.
        import json

        from langchain_google_vertexai import ChatVertexAI

        gcp_creds = None
        if self._credentials and self._credentials.strip():
            try:
                import google.auth

                creds_data = json.loads(self._credentials.strip())
                gcp_creds, _ = google.auth.load_credentials_from_dict(
                    creds_data,
                    scopes=["https://www.googleapis.com/auth/cloud-platform"],
                )
            except Exception:
                # If credentials are not valid JSON, let it fall back or try to raise later
                pass

        return ChatVertexAI(
            model=self.model_name,
            project=self._project or None,
            location=self._location or None,
            credentials=gcp_creds,
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
            text = chunk.content
            if isinstance(text, str) and text:
                yield text
