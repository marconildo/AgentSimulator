"""Application database — the relational system of record.

This is the *transactional* store (conversations, history), kept separate from
the RAG vector store. See :mod:`app.db.store`.
"""

from .store import ConversationStore, get_store

__all__ = ["ConversationStore", "get_store"]
