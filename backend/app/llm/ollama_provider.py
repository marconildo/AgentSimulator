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

import json
from collections.abc import AsyncIterator
from typing import Any

from langchain_core.messages import AnyMessage

from .openai_provider import _assemble, _preview, _to_openai_tool
from .provider import Decision, LLMProvider, TokenUsage, ToolCall, ToolSpec

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

# Keys a leaked tool-call blob uses for its argument object, most specific first.
_TOOL_CALL_ARG_KEYS = ("params", "parameters", "arguments", "args")
# Keys that, inside that argument object, tend to hold the actual answer text.
_TOOL_CALL_TEXT_KEYS = ("text", "answer", "response", "content", "output")


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
        # Small local models sometimes emit a function call as literal JSON text
        # instead of a structured tool_call, leaking a `{"name": ...}` blob (with
        # escaped unicode) into the answer. The stripper drops a leaked leading
        # blob — keeping trailing prose, or unwrapping the inner text — while
        # streaming a normal answer through untouched, token by token.
        stripper = _LeadingToolCallStripper()
        async for chunk in client.astream(lc_messages):
            usage = TokenUsage.from_metadata(getattr(chunk, "usage_metadata", None))
            if usage:
                self.last_stream_usage = usage
            text: Any = chunk.content
            if isinstance(text, str) and text:
                cleaned = stripper.feed(text)
                if cleaned:
                    yield cleaned
        tail = stripper.flush()
        if tail:
            yield tail


def _json_object_end(text: str) -> int | None:
    """Index just past the first balanced ``{...}`` object in ``text`` (which
    must start with ``{``), respecting strings + escapes. ``None`` if the object
    has not closed yet (the blob may still be arriving across stream chunks)."""
    depth = 0
    in_str = False
    esc = False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i + 1
    return None


def _looks_like_tool_call(blob: str) -> bool:
    """True when ``blob`` parses as a ``{"name": ..., "<args>": ...}`` object —
    the shape a model uses when it emits a function call as text by mistake."""
    try:
        obj = json.loads(blob)
    except (ValueError, TypeError):
        return False
    return isinstance(obj, dict) and "name" in obj and any(k in obj for k in _TOOL_CALL_ARG_KEYS)


def _extracted_text(blob: str) -> str:
    """Best-effort answer text from a leaked tool-call ``blob`` (``""`` if none).

    ``json.loads`` decodes the escaped unicode (``\\u00e7`` → ``ç``) for free, so
    the unwrapped text is clean prose, not the raw escaped payload.
    """
    try:
        obj = json.loads(blob)
    except (ValueError, TypeError):
        return ""
    if not isinstance(obj, dict):
        return ""
    for key in _TOOL_CALL_ARG_KEYS:
        args = obj.get(key)
        if isinstance(args, dict):
            for tk in _TOOL_CALL_TEXT_KEYS:
                val = args.get(tk)
                if isinstance(val, str) and val.strip():
                    return val
        elif isinstance(args, str) and args.strip():
            return args
    return ""


def _clean_leaked_tool_call(text: str) -> str:
    """Drop a leaked leading tool-call JSON blob from an Ollama answer.

    If prose follows the blob, return just that prose; if the whole answer was
    wrapped, unwrap the inner text. Anything that is not a tool-call-shaped blob
    (plain prose, or JSON the model legitimately produced) is returned untouched.
    """
    stripped = text.lstrip()
    if not stripped.startswith("{"):
        return text
    end = _json_object_end(stripped)
    if end is None:
        return text  # never closed — not a recognizable blob, leave as-is
    blob = stripped[:end]
    if not _looks_like_tool_call(blob):
        return text  # genuine JSON content, not a leaked tool call
    rest = stripped[end:].lstrip()
    # Prefer trailing prose; else the unwrapped inner text. Both may be empty for
    # a contentless spurious call — return "" rather than re-dumping the JSON.
    return rest or _extracted_text(blob)


class _LeadingToolCallStripper:
    """Stream filter that removes a leaked leading tool-call JSON blob.

    A normal answer never starts with ``{``, so it streams straight through with
    no buffering. When the answer *does* start with ``{`` we buffer it (it is
    almost certainly the broken blob path) and clean the whole thing on
    :meth:`flush`. ``feed`` returns the text to yield now (possibly empty).
    """

    _MAX_BUFFER = 1_000_000

    def __init__(self) -> None:
        self._buf = ""
        self._passthrough = False

    def feed(self, text: str) -> str:
        if self._passthrough:
            return text
        self._buf += text
        lead = self._buf.lstrip()
        if not lead:
            return ""  # only whitespace so far — keep buffering
        if lead.startswith("{") and len(self._buf) <= self._MAX_BUFFER:
            return ""  # looks like a JSON blob — buffer the whole answer
        # Plain prose (or a runaway buffer): stream from here on.
        self._passthrough = True
        out, self._buf = self._buf, ""
        return out

    def flush(self) -> str:
        if not self._buf:
            return ""
        out = self._buf if self._passthrough else _clean_leaked_tool_call(self._buf)
        self._buf = ""
        self._passthrough = True
        return out
