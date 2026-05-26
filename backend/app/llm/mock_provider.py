"""Deterministic, offline LLM provider.

No network, no keys. It uses simple heuristics to *decide* tool calls and
composes a grounded answer from the retrieved context + tool results, then
streams it word by word so the UI animation looks identical to the real path.
"""

from __future__ import annotations

import asyncio
import re
import uuid
from collections.abc import AsyncIterator
from typing import Any

from .provider import Decision, LLMProvider, ToolCall, ToolSpec

# A run of numbers/parens joined by at least one arithmetic operator,
# e.g. "12 * (3 + 1)" or "2 + 2".
_MATH_RE = re.compile(r"[\d().]+(?:\s*[-+*/%]\s*[\d().]+)+")
_TIME_RE = re.compile(r"\b(time|date|today|now|hour|clock)\b", re.IGNORECASE)


class MockProvider(LLMProvider):
    name = "mock"
    model_name = "mock-llm"

    async def decide(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        context: str,
        tools: list[ToolSpec],
        used_tools: set[str],
    ) -> Decision:
        query = messages[-1]["content"] if messages else ""
        available = {t.name for t in tools}
        tool_calls: list[ToolCall] = []

        # Each tool is used at most once, mirroring a bounded ReAct loop.
        if "calculator" in available and "calculator" not in used_tools:
            m = _MATH_RE.search(query)
            if m:
                tool_calls.append(
                    ToolCall(id=_id(), name="calculator", args={"expression": m.group(0)})
                )

        if not tool_calls and "current_time" in available and "current_time" not in used_tools:
            if _TIME_RE.search(query):
                tool_calls.append(ToolCall(id=_id(), name="current_time", args={}))

        prompt_preview = _preview(system, context, messages, tools)
        return Decision(tool_calls=tool_calls, prompt_preview=prompt_preview)

    async def stream_answer(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        context: str,
        tool_results: list[dict[str, Any]],
    ) -> AsyncIterator[str]:
        answer = _compose_answer(messages, context, tool_results)
        for token in _tokenize(answer):
            await asyncio.sleep(0.012)  # pace it so streaming is visible
            yield token


def _compose_answer(
    messages: list[dict[str, str]],
    context: str,
    tool_results: list[dict[str, Any]],
) -> str:
    query = messages[-1]["content"] if messages else ""
    parts: list[str] = [f'You asked: "{query.strip()}".']

    if tool_results:
        for tr in tool_results:
            parts.append(f"Using the {tr['tool']} tool, I got: {tr['result']}.")

    snippet = _first_sentence(context)
    if snippet:
        parts.append(
            f"Based on the retrieved knowledge base, here is the most relevant note: {snippet}"
        )
    else:
        parts.append("I could not find relevant context in the knowledge base.")

    parts.append(
        "(This answer was generated in demo mode — set OPENAI_API_KEY and "
        "DEMO_MODE=false for a real LLM response.)"
    )
    return " ".join(parts)


def _first_sentence(context: str) -> str:
    """First substantive line of the retrieved context (skips headings)."""
    for line in context.strip().splitlines():
        line = re.sub(r"^\[[^\]]+\]\s*", "", line).strip()
        if not line or line.startswith("#"):
            continue
        if len(line) > 220:
            line = line[:220].rsplit(" ", 1)[0] + "…"
        return line
    return ""


def _tokenize(text: str) -> list[str]:
    # Keep trailing spaces on tokens so the stream reassembles cleanly.
    return re.findall(r"\S+\s*", text)


def _preview(
    system: str, context: str, messages: list[dict[str, str]], tools: list[ToolSpec]
) -> dict[str, Any]:
    return {
        "system": system,
        "context": context,
        "messages": messages,
        "tools": [t.name for t in tools],
    }


def _id() -> str:
    return f"call_{uuid.uuid4().hex[:8]}"
