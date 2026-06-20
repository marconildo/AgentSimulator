"""Regression: Ollama answers that leak a tool-call-shaped JSON blob.

Small local models sometimes emit a function call as **literal JSON text** in
the final answer (instead of a structured ``tool_calls`` entry), e.g.::

    {"name": "explicar-para-iniciante", "params": {"text": "Essa documentaç..."}}

The blob carries escaped unicode (``\\u00e7``) and looks like raw garbage in the
chat bubble. ``OllamaProvider.stream_answer`` must strip the leaked blob (keeping
any trailing prose) or, when the whole answer was wrapped, unwrap the inner text
— so the user sees clean, decoded prose. These tests are keyless (no Ollama, no
OpenAI): they drive the pure cleanup helpers + the streaming stripper directly.
"""

from __future__ import annotations

from app.llm.ollama_provider import (
    OllamaProvider,
    _clean_leaked_tool_call,
    _LeadingToolCallStripper,
)


def _drain(stripper: _LeadingToolCallStripper, chunks: list[str]) -> str:
    out = "".join(stripper.feed(c) for c in chunks)
    return out + stripper.flush()


# --- the pure cleaner -------------------------------------------------------


def test_strips_leaked_blob_keeps_trailing_prose():
    # The observed case: a leaked tool-call blob, a blank line, then the real
    # answer. Only the prose should survive.
    raw = (
        '{"name": "explicar-para-iniciante", "params": {"text": "ignored"}}\n\n'
        "A documentação explica o fluxo de trabalho do agente."
    )
    assert _clean_leaked_tool_call(raw) == "A documentação explica o fluxo de trabalho do agente."


def test_unwraps_inner_text_when_whole_answer_was_wrapped():
    # No trailing prose — fall back to the blob's inner text, unicode decoded.
    raw = '{"name": "explicar-para-iniciante", "params": {"text": "Essa documenta\\u00e7\\u00e3o explica."}}'
    assert _clean_leaked_tool_call(raw) == "Essa documentação explica."


def test_supports_arguments_and_parameters_key_variants():
    assert _clean_leaked_tool_call('{"name": "x", "arguments": {"text": "hi"}}') == "hi"
    assert _clean_leaked_tool_call('{"name": "x", "parameters": {"answer": "yo"}}') == "yo"


def test_leaves_plain_prose_untouched():
    prose = "A documentação explica o agente."
    assert _clean_leaked_tool_call(prose) == prose


def test_leaves_non_tool_call_json_untouched():
    # JSON the model legitimately produced (no name+args shape) is not garbage.
    payload = '{"result": 42, "ok": true}'
    assert _clean_leaked_tool_call(payload) == payload


# --- the streaming stripper -------------------------------------------------


def test_stripper_streams_plain_prose_immediately():
    # A normal answer must pass through token-by-token (no buffering stall).
    s = _LeadingToolCallStripper()
    first = s.feed("Hello ")
    assert first == "Hello "  # streamed at once, not held back
    assert _drain(_LeadingToolCallStripper(), ["The ", "agent ", "plans."]) == "The agent plans."


def test_stripper_strips_blob_split_across_chunks():
    # The blob may arrive across many tokens (incl. the escaped-unicode tokens).
    chunks = [
        '{"name": "explicar',
        '-para-iniciante", ',
        '"params": {"text": "x"}}',
        "\n\nResposta limpa ",
        "para o usuário.",
    ]
    assert _drain(_LeadingToolCallStripper(), chunks) == "Resposta limpa para o usuário."


def test_stripper_unwraps_fully_wrapped_answer():
    chunks = ['{"name": "x", "params": ', '{"text": "S\\u00f3 o texto."}}']
    assert _drain(_LeadingToolCallStripper(), chunks) == "Só o texto."


async def test_stream_answer_cleans_leaked_blob(monkeypatch):
    # End-to-end through stream_answer with a fake ChatOllama that emits the
    # leaked blob then the prose, proving the provider yields only clean text.
    class _Chunk:
        def __init__(self, content):
            self.content = content
            self.usage_metadata = None

    blob_then_prose = [
        '{"name": "explicar-para-iniciante", "params": {"text": "x"}}\n\n',
        "Resposta ",
        "limpa.",
    ]

    class _FakeClient:
        async def astream(self, _messages):
            for c in blob_then_prose:
                yield _Chunk(c)

    p = OllamaProvider(model="llama3.1", base_url="http://localhost:11434")
    monkeypatch.setattr(p, "_client", lambda: _FakeClient())

    out = []
    async for tok in p.stream_answer(system="s", thread=[]):
        out.append(tok)
    assert "".join(out) == "Resposta limpa."
    assert not any("{" in t for t in out)
