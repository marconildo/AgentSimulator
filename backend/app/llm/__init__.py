"""LLM provider layer (OpenAI; fails fast without a key)."""

from .provider import Decision, LLMProvider, ToolCall, ToolSpec, get_provider

__all__ = ["Decision", "LLMProvider", "ToolCall", "ToolSpec", "get_provider"]
