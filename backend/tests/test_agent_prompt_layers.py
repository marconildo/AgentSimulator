"""Tests for the 2-layer prompt composition (042-agent-anatomy).

The system message sent to the model is the composition of:

1. ``GUARDRAILS_PROMPT`` (the **system prompt** layer — environment-wide
   rules, safety, format).
2. ``AGENT_PROMPT`` (the **agent prompt** layer — this agent's role and
   instructions).
3. The skills catalog block (027-skills) — only when advertised + non-empty.

Each layer is independently overridable per request (006-style): a non-blank
``system_prompt`` override replaces the guardrails layer; a non-blank
``agent_prompt`` override replaces the role layer. Blank/whitespace overrides
fall back to the corresponding default (so the override field is a tri-state:
None = no override, blank = explicit clear → fall back, non-blank = replace).
"""

from __future__ import annotations

import pytest

from app.agent.graph import _effective_system, _system_parts
from app.agent.prompts import (
    AGENT_PROMPT,
    GUARDRAILS_PROMPT,
    compose_system,
)

_CATALOG = [
    {"name": "resumo-em-bullets", "description": "Summarize in bullets."},
]


def _state(
    *,
    system_prompt: str | None = None,
    agent_prompt: str | None = None,
    catalog: list[dict[str, str]] | None = None,
    enabled_tools: list[str] | None = None,
) -> dict:
    return {
        "system_prompt": system_prompt,
        "agent_prompt": agent_prompt,
        "enabled_tools": enabled_tools,
        "skills_catalog": catalog if catalog is not None else [],
    }


def test_defaults_compose_guardrails_then_role():
    """AC1 / AC5 — defaults: guardrails + role, no skills."""
    composed = _effective_system(_state())  # type: ignore[arg-type]
    assert composed == f"{GUARDRAILS_PROMPT}\n\n{AGENT_PROMPT}"


def test_defaults_with_skills_block_appended():
    """AC5 — non-empty catalog + load_skill advertised ⇒ third layer appended."""
    composed = _effective_system(_state(catalog=_CATALOG))  # type: ignore[arg-type]
    assert composed.startswith(f"{GUARDRAILS_PROMPT}\n\n{AGENT_PROMPT}\n\n")
    assert "resumo-em-bullets" in composed


def test_system_prompt_override_replaces_guardrails():
    """AC1 — `system_prompt` override fully replaces the guardrails layer."""
    composed = _effective_system(
        _state(system_prompt="NEW GUARDRAILS")  # type: ignore[arg-type]
    )
    assert composed == f"NEW GUARDRAILS\n\n{AGENT_PROMPT}"


def test_agent_prompt_override_replaces_role():
    """AC1 — `agent_prompt` override fully replaces the role layer."""
    composed = _effective_system(
        _state(agent_prompt="You are a tour guide for Lisbon.")  # type: ignore[arg-type]
    )
    assert composed == f"{GUARDRAILS_PROMPT}\n\nYou are a tour guide for Lisbon."


def test_both_overrides_replace_both_layers():
    """AC5 — both layers overridable in the same run; skills appended on top."""
    composed = _effective_system(
        _state(system_prompt="GUARDS", agent_prompt="ROLE")  # type: ignore[arg-type]
    )
    assert composed == "GUARDS\n\nROLE"


@pytest.mark.parametrize("blank", ["", "   ", "\n\n", "\t"])
def test_blank_overrides_fall_back_to_defaults(blank):
    """AC5 — whitespace-only overrides fall back to the corresponding defaults."""
    composed = _effective_system(
        _state(system_prompt=blank, agent_prompt=blank)  # type: ignore[arg-type]
    )
    assert composed == f"{GUARDRAILS_PROMPT}\n\n{AGENT_PROMPT}"


def test_compose_system_three_layers_helper():
    """compose_system(guardrails, role, catalog) → 'g\\n\\nr[\\n\\nskills]'."""
    plain = compose_system("G", "R", [])
    assert plain == "G\n\nR"
    with_skills = compose_system("G", "R", _CATALOG)
    assert with_skills.startswith("G\n\nR\n\n")
    assert "resumo-em-bullets" in with_skills


def test_system_parts_returns_three_values():
    """_system_parts → (guardrails, role, skills) so 036's budget can split."""
    g, r, s = _system_parts(_state(catalog=_CATALOG))  # type: ignore[arg-type]
    assert g == GUARDRAILS_PROMPT
    assert r == AGENT_PROMPT
    assert "resumo-em-bullets" in s


def test_default_constants_are_non_empty():
    """Both defaults must be non-empty server-shipped strings."""
    assert isinstance(GUARDRAILS_PROMPT, str) and GUARDRAILS_PROMPT.strip()
    assert isinstance(AGENT_PROMPT, str) and AGENT_PROMPT.strip()
    # They must be distinct (catching a bug where one alias the other).
    assert GUARDRAILS_PROMPT != AGENT_PROMPT


def test_agent_prompt_routes_real_world_questions_to_web_search():
    """Regression: real-world / current-events questions ("quem fez os gols?")
    must route to ``web_search``, not ``search_knowledge_base``.

    The knowledge base is an **AI-engineering** corpus only; the role prompt used
    to demand ``search_knowledge_base`` for "anything that could be documented"
    and never mentioned ``web_search`` (052), so the agent forced football
    questions through RAG and abstained. Pin that the role now advertises
    ``web_search`` with current-events guidance.
    """
    text = AGENT_PROMPT.lower()
    assert "web_search" in text
    assert "current events" in text
    # And the KB tool is scoped to its actual domain, not "anything documented".
    assert "ai engineering" in text or "ai-engineering" in text


def test_guardrails_forbid_deferring_the_deliverable():
    """Regression: the agent must deliver in this turn, never promise it for 'later'.

    A complex request ("monte um relatório completo …") used to come back as a
    bare promise — "Vou preparar isso para você. Aguarde um momento." — and the
    turn ended with no deliverable. The ReAct loop was fine; the *prompt* never
    forbade deferral, and there is no 'later' (the turn ends when the agent
    answers). The platform guardrail now instructs single-turn delivery, so pin
    that the instruction ships.
    """
    text = GUARDRAILS_PROMPT.lower()
    # It frames the run as a single turn …
    assert "single turn" in text
    # … and explicitly tells it not to defer / ask the user to wait.
    assert "wait" in text
