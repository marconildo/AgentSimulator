"""System / agent prompts and the composition helper (042-agent-anatomy).

The simulator separates **environment-wide rules** from **the agent's role**
into two distinct prompt layers, each independently overridable per request:

- :data:`GUARDRAILS_PROMPT` — the **system prompt** layer. Platform-level rules
  every agent in the simulator inherits: safety, honesty, format. Edited by
  the platform owner; usually short.
- :data:`AGENT_PROMPT` — the **agent prompt** layer. *This* agent's role and
  instructions (what it is, how it should think, which tools it leans on).
  This is the layer end-users edit when they want to give the agent a new
  identity.

The composed system message sent to the model is
``GUARDRAILS_PROMPT + "\\n\\n" + AGENT_PROMPT [+ "\\n\\n" + skills_block]``
(the skills block is appended by 027-skills only when applicable). Both
layers accept request-level overrides (006-style) — blank/whitespace falls
back to the default for that layer.
"""

from __future__ import annotations

GUARDRAILS_PROMPT = """Platform guardrails (apply to every agent):
- Be helpful, accurate and concise.
- When you used retrieved context or a tool result, rely on it and say so; \
do not invent facts.
- If you do not have enough information, say so plainly rather than guess.
- Refuse to help with illegal, harmful, deceptive or unsafe requests.
- Prefer plain prose; use bullet lists only when the user asks for them or \
the content is genuinely a list.
"""


AGENT_PROMPT = """You are the assistant inside an "AI Agent Simulator", a teaching tool \
that visualizes how an agentic application works.

You have tools available and you decide, on your own, whether and when to call them:
- `search_knowledge_base` is your PRIMARY knowledge tool. For any question about a \
concept, how something works, a comparison, or anything that could be documented, \
you MUST call `search_knowledge_base` first and ground your answer in what it \
returns — do not answer such questions from memory alone.
- For arithmetic or numeric calculations, call the `calculator` tool instead of \
computing in your head.
- For the current date or time, call `current_time`.
- `kb_lookup` only returns a single canned one-line glossary string for a few basic \
terms; prefer `search_knowledge_base` for anything more than a trivial one-word \
definition.
"""


def skills_block(catalog: list[dict[str, str]]) -> str:
    """Render the skill catalog as a system-prompt block — **name + description only**.

    027-skills: the agent advertises the catalog cheaply and loads a skill's full
    instructions on demand via the ``load_skill`` tool. Returns ``""`` for an empty
    catalog; the body is never included here (only via the tool).
    """
    if not catalog:
        return ""
    lines = [
        "You also have access to these reusable Skills. When one fits the user's "
        "request, call the `load_skill` tool with its exact name to load its full "
        "instructions, then follow them:"
    ]
    lines += [f"- {s['name']}: {s['description']}" for s in catalog]
    return "\n".join(lines)


def compose_system(guardrails: str, role: str, catalog: list[dict[str, str]]) -> str:
    """Compose the 2-layer prompt with the optional skills block on top.

    Returns ``guardrails + "\\n\\n" + role`` plus, when the catalog yields a
    non-empty block, ``"\\n\\n" + skills``. This is the canonical assembly
    helper; ``graph._effective_system`` calls it after resolving each layer.
    """
    base = f"{guardrails}\n\n{role}"
    block = skills_block(catalog)
    return f"{base}\n\n{block}" if block else base
