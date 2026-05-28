"""036-context-window-budget — the real token budget of the assembled prompt.

A **labelled teaching approximation** (like ``pricing.py``): the per-category
split is a real ``tiktoken`` count of the real assembled inputs, attributed to the
``/context``-style categories the frontend renders. It is honestly an *estimate* —
OpenAI's exact tool-call framing overhead is not public — so the authoritative
*used* total stays the real billed ``prompt_tokens`` (recorded on the
``agent.think`` END, 011); this only proportions the window.

The model→window map is static like the price table. An unknown model falls back
to :data:`DEFAULT_CONTEXT_WINDOW` (never 0 — a 0-width window would break the grid).
"""

from __future__ import annotations

import json
from collections.abc import Collection, Mapping, Sequence
from functools import lru_cache
from typing import Any

import tiktoken

from .provider import ToolSpec

# cl100k_base is the encoding shared by the gpt-4o-* / gpt-4.1-* families; pin it
# (and cache the encoder) so counts are deterministic and we never fetch an
# encoding file at request time. Mirrors ``rag/ingestion.py``.
_ENCODING = "cl100k_base"

# Real context-window sizes (total tokens) per model. Public figures as of the
# 2026 knowledge cutoff; a labelled teaching approximation, not a billing contract
# (windows drift — keep this in sync as OpenAI ships/retires models). Since the app
# is OpenAI-only, swapping ``LLM_MODEL`` in the env renders the right window here;
# anything unlisted falls back to ``DEFAULT_CONTEXT_WINDOW`` (128k).
MODEL_CONTEXT_WINDOW: dict[str, int] = {
    # GPT-5.5 frontier (April 2026) — 1.05M context. No mini line as of release.
    "gpt-5.5": 1_050_000,
    "gpt-5.5-pro": 1_050_000,
    # GPT-5.4 (April 2026) — base/pro at 1.05M; mini at 400k.
    "gpt-5.4": 1_050_000,
    "gpt-5.4-pro": 1_050_000,
    "gpt-5.4-mini": 400_000,
    # GPT-5.1 / 5.2 / 5 family — 400k.
    "gpt-5.2": 400_000,
    "gpt-5.1": 400_000,
    "gpt-5": 400_000,
    "gpt-5-mini": 400_000,
    "gpt-5-nano": 400_000,
    # GPT-4.1 family — 1,047,576 (1M) long context.
    "gpt-4.1": 1_047_576,
    "gpt-4.1-mini": 1_047_576,
    "gpt-4.1-nano": 1_047_576,
    # GPT-4o family — 128k.
    "gpt-4o": 128_000,
    "gpt-4o-mini": 128_000,
    # Reasoning o-series — 200k (o1-mini is 128k).
    "o1": 200_000,
    "o1-preview": 128_000,
    "o1-mini": 128_000,
    "o3": 200_000,
    "o3-mini": 200_000,
    "o4-mini": 200_000,
    # Legacy GPT-4 / 3.5.
    "gpt-4-turbo": 128_000,
    "gpt-4-32k": 32_768,
    "gpt-4": 8_192,
    "gpt-3.5-turbo": 16_385,
}

# Fallback for an unlisted model — a sane, non-zero window (the modern default).
DEFAULT_CONTEXT_WINDOW = 128_000

# The six "used" categories, in render order. "Free space" (window − used) is
# derived on the frontend, not a key here. Mirrored by ``ContextBudget`` in
# ``frontend/src/types/events.ts``.
BUDGET_CATEGORIES = (
    "system",
    "tool_defs",
    "skills",
    "memory",
    "retrieved",
    "messages",
)


@lru_cache
def _encoder() -> tiktoken.Encoding:
    return tiktoken.get_encoding(_ENCODING)


def _count(text: str) -> int:
    return len(_encoder().encode(text)) if text else 0


def context_window(model: str) -> int:
    """The model's real context window in tokens; unknown ⇒ DEFAULT (never 0)."""
    if model in MODEL_CONTEXT_WINDOW:
        return MODEL_CONTEXT_WINDOW[model]
    # Pinned snapshots (e.g. ``gpt-4o-mini-2024-07-18``, ``gpt-5-mini-2025-08-07``)
    # resolve to their family. Match the most specific (longest) prefix first so
    # the short ``gpt-4`` key never swallows ``gpt-4o`` / ``gpt-4.1`` / ``gpt-4-turbo``.
    for prefix in sorted(MODEL_CONTEXT_WINDOW, key=len, reverse=True):
        if model.startswith(prefix):
            return MODEL_CONTEXT_WINDOW[prefix]
    return DEFAULT_CONTEXT_WINDOW


def _serialized_tools(tools: Sequence[ToolSpec]) -> str:
    """The advertised tool schemas as sent to the model (name + desc + params).

    Mirrors ``openai_provider._to_openai_tool`` so the count reflects what the
    model actually receives every reasoning round — usually the biggest hidden
    slice of the prompt.
    """
    return json.dumps(
        [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.schema or {"type": "object", "properties": {}},
                },
            }
            for t in tools
        ]
    )


def _render_history(history: Sequence[Mapping[str, str]]) -> str:
    """Long-term memory as folded into the system block (mirrors the provider)."""
    return "\n".join(
        f"- user: {h.get('message', '')}\n  assistant: {h.get('answer', '')}" for h in history
    )


def _message_text(content: Any) -> str:
    """Best-effort text of a LangChain message content (str or content blocks)."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [p.get("text", "") if isinstance(p, dict) else str(p) for p in content]
        return "".join(parts)
    return str(content) if content else ""


def history_pair_tokens(history: Sequence[Mapping[str, str]]) -> list[int]:
    """Per-``{message, answer}``-pair token counts (039-memory-growth-visualization).

    Each pair is rendered with the same framing as :func:`_render_history`
    (``"- user: …\\n  assistant: …"``) and tokenized with the same encoder as the
    ``memory`` slice in :func:`context_budget`, so the per-pair sum reconciles
    with that slice within a tiny ±2-token BPE boundary effect across the
    inter-pair newline join. An empty pair still costs the framing prefix — the
    growth panel shows abstained / empty-answer turns honestly, not as 0.
    """
    return [_count(_render_history([p])) for p in history]


def context_budget(
    *,
    system: str,
    tools: Sequence[ToolSpec],
    skills: str,
    history: Sequence[Mapping[str, str]],
    retrieved: str,
    thread: Sequence[Any],
    retrieval_tools: Collection[str] = (),
    skill_tools: Collection[str] = (),
) -> dict[str, int]:
    """Per-category ``tiktoken`` token counts of the assembled prompt.

    Categories (the six :data:`BUDGET_CATEGORIES`):

    - ``system`` — the base instructions/persona (without the skills block).
    - ``tool_defs`` — the serialized advertised tool schemas (the "System tools").
    - ``skills`` — the 027 skill catalog block + any loaded-skill body in ``thread``.
    - ``memory`` — prior ``{message, answer}`` turns folded in from the DB.
    - ``retrieved`` — the RAG grounding observation (``retrieved``).
    - ``messages`` — the working thread (user turn + assistant tool-call messages +
      non-RAG, non-skill tool observations).

    ``retrieval_tools`` / ``skill_tools`` name the tools whose ``ToolMessage``
    observations belong to ``retrieved`` / ``skills`` respectively, so they are
    excluded from ``messages`` (no double counting).
    """
    retrieval_names = set(retrieval_tools)
    skill_names = set(skill_tools)

    messages_tokens = 0
    skill_body_tokens = 0
    for msg in thread:
        name = getattr(msg, "name", None)
        if getattr(msg, "type", "") == "tool" and name in retrieval_names:
            continue  # counted under `retrieved`
        text = _message_text(getattr(msg, "content", ""))
        if getattr(msg, "type", "") == "tool" and name in skill_names:
            skill_body_tokens += _count(text)  # the loaded skill body
        else:
            messages_tokens += _count(text)

    return {
        "system": _count(system),
        "tool_defs": _count(_serialized_tools(tools)) if tools else 0,
        "skills": _count(skills) + skill_body_tokens,
        "memory": _count(_render_history(history)),
        "retrieved": _count(retrieved),
        "messages": messages_tokens,
    }
