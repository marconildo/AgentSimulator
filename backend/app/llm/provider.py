"""LLM provider abstraction.

The agent never talks to OpenAI directly — it goes through an ``LLMProvider``.
The ABC stays as a thin seam, but there is exactly one implementation:
``get_provider()`` always returns the real :class:`OpenAIProvider`, and fails
fast with :class:`MissingAPIKeyError` when no key is configured. Tool
*execution* is always real (via MCP).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from ..config import MissingAPIKeyError, get_settings

if TYPE_CHECKING:
    from langchain_core.messages import AIMessage, AnyMessage


@dataclass
class ToolSpec:
    """A tool advertised to the model (derived from the MCP server)."""

    name: str
    description: str
    schema: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolCall:
    id: str
    name: str
    args: dict[str, Any]


@dataclass
class TokenUsage:
    """Real token usage reported by the provider for one model call.

    011-token-cost: every LLM call (each reasoning round's ``decide`` + the final
    ``stream_answer``) reports this; the agent records it on the trace so the LLM
    block can show real tokens and cost.
    """

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

    @classmethod
    def from_metadata(cls, md: dict[str, Any] | None) -> TokenUsage | None:
        """Build from LangChain ``usage_metadata`` (input/output/total tokens)."""
        if not md:
            return None
        return cls(
            prompt_tokens=int(md.get("input_tokens", 0)),
            completion_tokens=int(md.get("output_tokens", 0)),
            total_tokens=int(md.get("total_tokens", 0)),
        )


@dataclass
class Decision:
    """The model's choice: call tools, or (when empty) produce the answer."""

    # The raw AI message the model returned, carrying its ``tool_calls`` and/or
    # content. The agent appends it to the canonical thread when it routes to the
    # tools node, so the next reasoning round (and a LangSmith trace) sees the
    # standard AIMessage(tool_calls) → ToolMessage chain (026-agent-tool-autonomy).
    message: AIMessage
    tool_calls: list[ToolCall]
    # Everything we sent the model, surfaced in the UI inspector.
    prompt_preview: dict[str, Any]
    # Real token usage for this decide call (011); None if the provider omits it.
    usage: TokenUsage | None = None


class LLMProvider(ABC):
    name: str = "base"
    model_name: str = "base"
    # Usage of the most recent `stream_answer` call. A token generator can't also
    # return a value, so the streaming usage is surfaced here as a side-channel
    # the agent reads after the stream completes (011-token-cost).
    last_stream_usage: TokenUsage | None = None

    @abstractmethod
    async def decide(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        tools: list[ToolSpec],
        history: list[dict[str, str]] | None = None,
    ) -> Decision:
        """Reason over the running message thread and decide what to do next.

        ``thread`` is the canonical ReAct conversation so far (a HumanMessage,
        then AIMessage(tool_calls) → ToolMessage pairs). The provider prepends a
        SystemMessage (the prompt only) followed by the long-term-memory
        ``history`` rendered as **real alternating turns** (Human/AI), then binds
        ``tools`` and calls the model. The returned :class:`Decision` carries the
        raw ``AIMessage`` (with any ``tool_calls``) so the agent can append it to
        the thread. ``history`` is the long-term memory: prior {message, answer}
        turns — sent as conversation turns, never folded into the system prompt.
        """

    @abstractmethod
    def stream_answer(
        self,
        *,
        system: str,
        thread: list[AnyMessage],
        history: list[dict[str, str]] | None = None,
    ) -> AsyncIterator[str]:
        """Stream the final user-facing answer, token by token.

        Runs on the full thread (whose ToolMessages already carry any retrieved
        context / tool results), so the answer is grounded without stuffing
        results into the system prompt.
        """


def get_provider(*, model: str | None = None) -> LLMProvider:
    """Return the OpenAI provider, or fail fast if no key is configured.

    042-agent-anatomy: the optional ``model`` kwarg picks the OpenAI model for
    this run; the API layer validates it against the curated allowlist before
    calling. ``None`` keeps today's behavior (use ``settings.llm_model``).
    """
    settings = get_settings()
    if not settings.has_openai_key:
        raise MissingAPIKeyError()
    from .openai_provider import OpenAIProvider

    return OpenAIProvider(
        model=model or settings.llm_model,
        api_key=settings.openai_api_key,
    )
