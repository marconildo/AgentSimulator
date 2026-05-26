"""Online retrieval: embed the query, search Chroma, return top-k chunks.

Each step emits a trace stage so the UI can show the query vector, the search,
and the retrieved chunks with their similarity scores.
"""

from __future__ import annotations

from typing import Any

from ..schemas import Stage
from ..trace import TraceEmitter
from .embeddings import embedding_model_name
from .store import get_vectorstore, reset_vectorstore_cache

# Substrings Chroma raises when the cached collection handle is stale or its
# vectors no longer match the live embedding model. "does not exist" is the
# cross-process case (another process reset the collection); "not initialized"
# is the same-process case (the handle was cleared); "dimension" is a model swap.
_RECOVERABLE = ("does not exist", "not initialized", "dimension")


def _scope_filter(session_id: str | None) -> dict[str, Any]:
    """Restrict the search to the base corpus plus *this* conversation's uploads.

    A query retrieves a single top-k over ``corpus == true`` **OR**
    ``session_id == <active>`` (D3), so the built-in knowledge base and the
    documents the user uploaded to this conversation rank together — and other
    conversations' uploads are excluded. With no active session, only the corpus
    is in scope.
    """
    if session_id:
        return {"$or": [{"corpus": True}, {"session_id": session_id}]}
    return {"corpus": True}


def _search_with_recovery(query: str, k: int, where: dict[str, Any]):
    """Search, self-healing from a stale/mismatched collection.

    The cached Chroma handle pins a collection id; if that collection was reset
    or rebuilt by another process (or was built with a different embedding model),
    the search raises. We clear the cache, rebuild the index once, and retry so a
    live request recovers instead of returning a 500.
    """
    try:
        return get_vectorstore().similarity_search_with_score(query, k=k, filter=where)
    except Exception as exc:  # noqa: BLE001 - only recover from known causes
        if not any(sig in str(exc).lower() for sig in _RECOVERABLE):
            raise
        from .ingest import build_index  # local import avoids an import cycle

        reset_vectorstore_cache()
        build_index()
        return get_vectorstore().similarity_search_with_score(query, k=k, filter=where)


async def retrieve(
    query: str, k: int, emitter: TraceEmitter, session_id: str | None = None
) -> tuple[str, list[dict[str, Any]]]:
    store = get_vectorstore()
    where = _scope_filter(session_id)

    async with emitter.stage(Stage.RAG_EMBED, "Embedding the query") as rec:
        query_vec = store.embeddings.embed_query(query)
        rec.data = {
            "model": embedding_model_name(),
            "dim": len(query_vec),
            "preview": [round(float(x), 4) for x in query_vec[:8]],
        }
        rec.metrics["dim"] = float(len(query_vec))

    async with emitter.stage(Stage.RAG_SEARCH, "Searching the vector store") as rec:
        # Re-embeds the query internally; fine for a small-k educational demo.
        results = _search_with_recovery(query, k=k, where=where)
        rec.data = {
            "metric": "cosine",
            "k": k,
            "candidates": len(results),
            "scope": "corpus + this conversation's uploads" if session_id else "corpus",
        }

    async with emitter.stage(Stage.RAG_RETRIEVE, "Selecting top-k chunks") as rec:
        chunks: list[dict[str, Any]] = []
        # Chroma returns results already sorted by ascending distance (closest
        # first), so the enumeration index is a stable rank (1-based).
        for rank, (doc, distance) in enumerate(results, start=1):
            dist = round(float(distance), 4)
            # similarity = 1 − distance (cosine). `score` keeps the existing
            # clamped-at-0 value used for the bar; `similarity` is the raw inverse
            # of `distance` so the inspector's ranked table can show both as exact
            # complements (007-numeric-transparency).
            similarity = round(1.0 - dist, 4)
            chunks.append(
                {
                    "text": doc.page_content,
                    "source": doc.metadata.get("source") or doc.metadata.get("filename", ""),
                    "title": doc.metadata.get("title", ""),
                    "score": round(max(0.0, similarity), 4),
                    "distance": dist,
                    "similarity": similarity,
                    "rank": rank,
                    # True for user-uploaded PDFs, False for the built-in corpus —
                    # lets the UI badge a chunk as coming from the user's document.
                    "uploaded": not doc.metadata.get("corpus", False),
                }
            )
        rec.data = {"chunks": chunks, "k": k}
        if chunks:
            rec.metrics["top_score"] = chunks[0]["score"]

    context = "\n\n".join(f"[{c['source']}] {c['text']}" for c in chunks)
    return context, chunks
