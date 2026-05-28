"""Tests for the agent's self-identity layer in the system prompt.

Background: 042-agent-anatomy made the agent's ``name`` and ``description``
editable per-agent (later persisted by 043/044), but neither field ever
reached the model — ``_effective_system`` only emitted ``guardrails + role
[+ skills]``. So when a user asked "what is your name?" the agent answered
generically ("I'm a virtual assistant, I don't have a proper name"), even
though the chat bubble label said "Agent Simulator".

This module pins the fix:

- :func:`identity_block` renders ``"You are {name}. {description}"`` (or just
  ``"You are {name}."`` when description is blank) and returns ``""`` when
  ``name`` is blank/None, so a request without identity reproduces the prior
  three-layer assembly byte-for-byte.
- :func:`compose_system` accepts the rendered block via a keyword-only
  ``identity`` argument and prepends it (plus ``"\\n\\n"``) when non-empty,
  yielding ``identity + "\\n\\n" + guardrails + "\\n\\n" + role [+ skills]``.
- :func:`app.agent.graph._effective_system` reads ``agent_name`` /
  ``agent_description`` from :class:`AgentState` and feeds them through.
- An ``[openai]`` end-to-end run with ``agent_name="Lumis"`` answers the
  identity question with the chosen name. The assertion is structural (name
  appears in the answer) to tolerate model variability.
"""

from __future__ import annotations

import asyncio

import pytest

from app.agent import run_agent
from app.agent.graph import _effective_system
from app.agent.prompts import (
    AGENT_PROMPT,
    GUARDRAILS_PROMPT,
    compose_system,
    identity_block,
)
from app.trace import TraceEmitter

_LUMIS_NAME = "Lumis"
_LUMIS_DESC = "An assistant that helps with home and family logistics."


def _state(
    *,
    agent_name: str | None = None,
    agent_description: str | None = None,
    system_prompt: str | None = None,
    agent_prompt: str | None = None,
    catalog: list[dict[str, str]] | None = None,
    enabled_tools: list[str] | None = None,
) -> dict:
    """Mirror the helper in ``test_agent_prompt_layers.py`` but with identity fields."""
    return {
        "agent_name": agent_name,
        "agent_description": agent_description,
        "system_prompt": system_prompt,
        "agent_prompt": agent_prompt,
        "enabled_tools": enabled_tools,
        "skills_catalog": catalog if catalog is not None else [],
    }


# -- identity_block ------------------------------------------------------------


def test_identity_block_renders_name_and_description():
    """Both fields present ⇒ a single 'You are {name}. {description}' line."""
    rendered = identity_block(_LUMIS_NAME, _LUMIS_DESC)
    assert rendered == f"You are {_LUMIS_NAME}. {_LUMIS_DESC}"


def test_identity_block_renders_name_only_when_description_blank():
    """Description blank/None ⇒ omit the second sentence; keep the first."""
    assert identity_block(_LUMIS_NAME, None) == f"You are {_LUMIS_NAME}."
    assert identity_block(_LUMIS_NAME, "") == f"You are {_LUMIS_NAME}."
    assert identity_block(_LUMIS_NAME, "   ") == f"You are {_LUMIS_NAME}."


@pytest.mark.parametrize("blank_name", [None, "", "   ", "\t"])
def test_identity_block_returns_empty_when_name_blank(blank_name):
    """No name ⇒ no identity layer (the prior 3-layer assembly is unchanged)."""
    assert identity_block(blank_name, _LUMIS_DESC) == ""


# -- compose_system ------------------------------------------------------------


def test_compose_system_prepends_identity_when_provided():
    """identity kwarg lands at the very top, separated by '\\n\\n'."""
    composed = compose_system("G", "R", [], identity="You are Lumis. Helpful.")
    assert composed == "You are Lumis. Helpful.\n\nG\n\nR"


def test_compose_system_without_identity_unchanged():
    """Default identity='' reproduces the prior 042-agent-anatomy composition."""
    assert compose_system("G", "R", []) == "G\n\nR"
    assert compose_system("G", "R", [], identity="") == "G\n\nR"


def test_compose_system_identity_plus_skills_block_order():
    """Order is identity → guardrails → role → skills (skills stays on top)."""
    catalog = [{"name": "skill-x", "description": "Do X."}]
    composed = compose_system("G", "R", catalog, identity="You are Lumis.")
    assert composed.startswith("You are Lumis.\n\nG\n\nR\n\n")
    assert "skill-x" in composed


# -- _effective_system (state-driven) ------------------------------------------


def test_effective_system_includes_identity_from_state():
    """State carries agent_name/agent_description ⇒ identity block precedes guardrails."""
    composed = _effective_system(
        _state(agent_name=_LUMIS_NAME, agent_description=_LUMIS_DESC)  # type: ignore[arg-type]
    )
    assert composed.startswith(f"You are {_LUMIS_NAME}. {_LUMIS_DESC}\n\n")
    assert composed.endswith(f"{GUARDRAILS_PROMPT}\n\n{AGENT_PROMPT}")


def test_effective_system_without_identity_matches_today():
    """No agent_name in state ⇒ byte-for-byte today's composition (regression guard)."""
    assert _effective_system(_state()) == f"{GUARDRAILS_PROMPT}\n\n{AGENT_PROMPT}"  # type: ignore[arg-type]


def test_effective_system_identity_name_only():
    """Blank description ⇒ identity is just 'You are {name}.', no trailing space."""
    composed = _effective_system(
        _state(agent_name=_LUMIS_NAME, agent_description="")  # type: ignore[arg-type]
    )
    assert composed.startswith(f"You are {_LUMIS_NAME}.\n\n")


# -- end-to-end against OpenAI -------------------------------------------------


@pytest.mark.openai
async def test_agent_with_custom_name_answers_identity_question():
    """An agent named 'Lumis' answering 'what is your name?' must say 'Lumis'.

    Structural assertion (substring match) to tolerate model variability.
    Disables tools so the answer comes straight from the system prompt rather
    than a tool detour, keeping the test fast and focused on identity.
    """
    emitter = TraceEmitter("test", "what is your name?")

    async def drain():
        events = []
        while True:
            event = await emitter.queue.get()
            if event is None:
                break
            events.append(event)
        return events

    drainer = asyncio.create_task(drain())
    answer = await run_agent(
        "what is your name?",
        top_k=3,
        emitter=emitter,
        agent_name=_LUMIS_NAME,
        agent_description=_LUMIS_DESC,
        enabled_tools=[],
    )
    await emitter.close()
    await drainer

    assert _LUMIS_NAME.lower() in answer.lower(), (
        f"expected the agent to name itself 'Lumis', got: {answer!r}"
    )
