"""Server-side seed data (idempotent).

Today this module covers two seeds, both running on startup:

- **Skills** (027-skills): a few demonstrable example skills. Like the RAG
  corpus, these are example data, not UI chrome — so they're not subject to
  the bilingual rule (§4). Each body tells the model to answer in the user's
  language, so a PT or EN prompt both work. Re-runs are no-ops once the
  catalog has skills.

- **Default agent** (043-persisted-agent): the "Agent Simulator" row every
  fresh conversation clones from. The actual insert lives in `store.py`
  (sharing one sync helper with the migration); this module re-exports the
  name constants + a thin async wrapper so callers don't reach into store
  internals.
"""

from __future__ import annotations

import asyncio

from .store import (
    DEFAULT_AGENT_DESCRIPTION,
    DEFAULT_AGENT_NAME,
    ConversationStore,
    _seed_default_agent_sync,
    get_store,
)

__all__ = [
    "DEFAULT_AGENT_DESCRIPTION",
    "DEFAULT_AGENT_NAME",
    "seed_default_agent",
    "seed_skills",
    "SEED_SKILLS",
]

# Three simple, simulator-appropriate skills, each easy to trigger by an explicit
# user phrasing and each producing a visibly different answer (plan.md).
SEED_SKILLS: list[dict[str, str]] = [
    {
        "name": "resumo-em-bullets",
        "description": "Use quando o usuário pedir um resumo, 'em tópicos' ou bullet points.",
        "body": (
            "Reescreva a resposta como uma lista de no máximo 5 bullet points curtos (•), "
            "uma ideia por item, sem parágrafos longos. Responda no idioma da pergunta."
        ),
    },
    {
        "name": "explicar-para-iniciante",
        "description": (
            "Use quando o usuário pedir uma explicação simples, 'para iniciante', "
            "'sem jargão' ou 'como se eu tivesse 5 anos'."
        ),
        "body": (
            "Explique o conceito em linguagem simples e sem jargão: comece com uma analogia "
            "do cotidiano e só então conecte ao termo técnico em uma frase. "
            "Responda no idioma da pergunta."
        ),
    },
    {
        "name": "glossario-ao-final",
        "description": (
            "Use quando o usuário pedir um glossário ou quando a resposta usar termos técnicos."
        ),
        "body": (
            'Ao final da resposta, adicione uma seção "📖 Glossário" com cada termo técnico '
            "citado seguido de uma definição de uma única linha. Responda no idioma da pergunta."
        ),
    },
]


async def seed_default_agent(store: ConversationStore | None = None) -> bool:
    """Insert the default 'Agent Simulator' row when missing (043-persisted-agent).

    Idempotent — safe to call on every startup. The actual insert is the
    shared sync helper :func:`_seed_default_agent_sync` (used by the migration
    + by `clear_all`'s re-seed). Returns True when a row was inserted.
    """
    store = store or get_store()
    return await asyncio.to_thread(_seed_in_own_connection, store)


def _seed_in_own_connection(store: ConversationStore) -> bool:
    with store._connect() as conn:  # noqa: SLF001 - module-internal helper
        return _seed_default_agent_sync(conn)


async def seed_skills(store: ConversationStore | None = None) -> int:
    """Insert the example skills when the catalog is empty; return how many were
    added (0 if the catalog already has skills). Safe to call on every startup."""
    store = store or get_store()
    if await store.list_skills():
        return 0
    for s in SEED_SKILLS:
        await store.create_skill(s["name"], s["description"], s["body"])
    return len(SEED_SKILLS)
