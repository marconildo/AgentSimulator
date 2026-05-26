"""LLM provider abstraction.

The agent never talks to OpenAI directly — it goes through an ``LLMProvider``.
This is what lets the simulator run with zero API keys: ``get_provider()``
returns a deterministic :class:`MockProvider` in demo mode and the real
:class:`OpenAIProvider` otherwise. Tool *execution* is always real (via MCP);
only the model's reasoning/generation is swapped.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from ..config import get_settings


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
class Decision:
    """The model's choice: call tools, or (when empty) produce the answer."""

    tool_calls: list[ToolCall]
    # Everything we sent the model, surfaced in the UI inspector.
    prompt_preview: dict[str, Any]


class LLMProvider(ABC):
    name: str = "base"
    model_name: str = "base"

    @abstractmethod
    async def decide(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        context: str,
        tools: list[ToolSpec],
        used_tools: set[str],
    ) -> Decision:
        """Decide whether to call tools given the query + retrieved context."""

    @abstractmethod
    def stream_answer(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        context: str,
        tool_results: list[dict[str, Any]],
    ) -> AsyncIterator[str]:
        """Stream the final user-facing answer, token by token."""


def get_provider() -> LLMProvider:
    """Return the configured provider (mock in demo mode, OpenAI otherwise)."""
    settings = get_settings()
    if settings.is_demo:
        from .mock_provider import MockProvider

        return MockProvider()
    from .openai_provider import OpenAIProvider

    return OpenAIProvider(model=settings.llm_model, api_key=settings.openai_api_key)
