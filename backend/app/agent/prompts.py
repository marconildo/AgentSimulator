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

On top of those, :func:`identity_block` renders the **identity layer**:
``"You are {name}. {description}"`` resolved from the bound agent row
(``agents.name`` / ``agents.description``, 043/044). Without it the model has
no way to answer "what is your name?" — only the chat bubble label did.

The composed system message sent to the model is therefore
``[identity + "\\n\\n" +] GUARDRAILS_PROMPT + "\\n\\n" + AGENT_PROMPT
[+ "\\n\\n" + skills_block]`` (identity is prepended only when ``name`` is
non-blank, so a run without an agent row reproduces today's three-layer
assembly byte-for-byte; the skills block is appended by 027-skills only
when applicable). The guardrails / role layers accept request-level
overrides (006-style) — blank/whitespace falls back to the default for
that layer.
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


def identity_block(name: str | None, description: str | None) -> str:
    """Render the agent's self-identity as a leading prompt line.

    Returns ``""`` when ``name`` is blank/None — the prior 042-anatomy
    composition (``guardrails + role [+ skills]``) is then preserved
    byte-for-byte, so callers that never resolve an agent row keep today's
    behavior. With ``name`` present and ``description`` blank the block is
    just ``"You are {name}."``; with both present it is
    ``"You are {name}. {description}"`` on a single line.

    The text is intentionally English-only (a platform convention shared with
    ``GUARDRAILS_PROMPT`` / ``AGENT_PROMPT``); ``name`` and ``description``
    themselves are free text the user wrote in whatever language and pass
    through unchanged.
    """
    if not name or not name.strip():
        return ""
    name = name.strip()
    if description and description.strip():
        return f"You are {name}. {description.strip()}"
    return f"You are {name}."


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


def compose_system(
    guardrails: str,
    role: str,
    catalog: list[dict[str, str]],
    *,
    identity: str = "",
) -> str:
    """Compose the assembled system message.

    Returns ``[identity + "\\n\\n" +] guardrails + "\\n\\n" + role`` plus, when
    the catalog yields a non-empty block, ``"\\n\\n" + skills``. ``identity``
    is keyword-only and defaults to ``""`` so existing callers (and the
    042-anatomy 2-layer composition tests) keep working unchanged; a non-empty
    string is prepended at the very top. This is the canonical assembly
    helper; ``graph._effective_system`` calls it after resolving each layer.
    """
    base = f"{guardrails}\n\n{role}"
    block = skills_block(catalog)
    composed = f"{base}\n\n{block}" if block else base
    return f"{identity}\n\n{composed}" if identity else composed
