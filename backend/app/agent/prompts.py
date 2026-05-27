"""System prompt for the agent."""

from __future__ import annotations

SYSTEM_PROMPT = """You are the assistant inside an "AI Agent Simulator", a teaching tool \
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

Guidelines:
- Answer the user's question clearly and concisely.
- When you used retrieved context or a tool result, rely on it and say so.
- If you still don't have enough information, say so plainly instead of inventing facts.
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


def compose_system(base: str, catalog: list[dict[str, str]]) -> str:
    """Append the skills block to a base system prompt (or return it unchanged)."""
    block = skills_block(catalog)
    return f"{base}\n\n{block}" if block else base
