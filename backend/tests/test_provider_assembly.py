"""How the OpenAI provider assembles the message list it sends to the model.

Regression: conversation history must travel as **real alternating turns**
(``HumanMessage`` / ``AIMessage``) in the message list, not folded into the
system prompt as reference text. A run captured the thread sent to the model
as just ``[SystemMessage, HumanMessage("é claro")]`` — the prior turns were
buried inside the system block, so the model lost the live dialogue and could
not resolve short references ("é claro") to what it had just offered.

These are pure assembly tests — no API key, no network.
"""

from __future__ import annotations

from langchain_core.messages import (
    AIMessage,
    AnyMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)

from app.llm.openai_provider import _assemble

_HISTORY = [
    {"message": "voce pode consultar a internet", "answer": "Sim, posso. O que pesquisar?"},
    {"message": "qual a previsao da copa", "answer": "Aqui vai a projeção..."},
]


def test_history_becomes_real_alternating_turns_before_the_thread():
    """Each {message, answer} pair → HumanMessage then AIMessage, in order,
    placed between the system message and the current thread."""
    thread: list[AnyMessage] = [HumanMessage(content="é claro")]
    assembled = _assemble("SYS", thread, _HISTORY)

    # [System, H(prev1), A(prev1), H(prev2), A(prev2), H(current)]
    assert isinstance(assembled[0], SystemMessage)
    assert [type(m) for m in assembled[1:]] == [
        HumanMessage,
        AIMessage,
        HumanMessage,
        AIMessage,
        HumanMessage,
    ]
    assert assembled[1].content == "voce pode consultar a internet"
    assert assembled[2].content == "Sim, posso. O que pesquisar?"
    # The current turn stays last.
    assert assembled[-1].content == "é claro"


def test_history_is_not_folded_into_the_system_message():
    """The system block carries instructions only — never the history text."""
    assembled = _assemble("SYS", [HumanMessage(content="é claro")], _HISTORY)
    system = assembled[0]
    assert isinstance(system, SystemMessage)
    assert system.content == "SYS"
    assert "Recent conversation history" not in system.content
    assert "voce pode consultar a internet" not in system.content


def test_no_history_leaves_the_thread_untouched():
    """Without history: just [System, *thread] — today's behavior preserved."""
    thread: list[AnyMessage] = [HumanMessage(content="hi")]
    assert _assemble("SYS", thread, None) == [SystemMessage(content="SYS"), *thread]
    assert _assemble("SYS", thread, []) == [SystemMessage(content="SYS"), *thread]


def test_history_precedes_an_in_progress_react_thread():
    """Mid-loop the thread holds tool-call/observation messages; history still
    sits ahead of the whole current turn."""
    thread: list[AnyMessage] = [
        HumanMessage(content="é claro"),
        AIMessage(content="", additional_kwargs={"tool_calls": []}),
        ToolMessage(content="result", tool_call_id="1", name="search_knowledge_base"),
    ]
    assembled = _assemble("SYS", thread, _HISTORY)
    # The four history turns come right after the system message …
    assert [type(m) for m in assembled[1:5]] == [HumanMessage, AIMessage, HumanMessage, AIMessage]
    # … and the live thread follows intact, in order.
    assert assembled[5:] == thread
