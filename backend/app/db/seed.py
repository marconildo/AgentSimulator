"""Seed the skill catalog with a few demonstrable examples (027-skills).

Like the RAG corpus, these are **example data**, not UI chrome — so they are not
subject to the bilingual rule (§4). Each body tells the model to answer in the
user's language, so a PT or EN prompt both work. Seeding only runs when the
catalog is empty (idempotent), mirroring how the vector index is built on first
boot. After a "Clear databases" reset the catalog is left empty until the next
startup re-seeds it.
"""

from __future__ import annotations

from .store import ConversationStore, get_store

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


async def seed_skills(store: ConversationStore | None = None) -> int:
    """Insert the example skills when the catalog is empty; return how many were
    added (0 if the catalog already has skills). Safe to call on every startup."""
    store = store or get_store()
    if await store.list_skills():
        return 0
    for s in SEED_SKILLS:
        await store.create_skill(s["name"], s["description"], s["body"])
    return len(SEED_SKILLS)
