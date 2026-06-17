"""Online retrieval: embed the query, search Chroma, return top-k chunks.

Each step emits a trace stage so the UI can show the query vector, the search,
and the retrieved chunks with their similarity scores.
"""

from __future__ import annotations

from typing import Any

from ..config import get_settings
from ..schemas import Stage
from ..trace import TraceEmitter
from .embeddings import embedding_model_name
from .reranker import rerank as rerank_chunks
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


def _to_chunk(doc, distance, rank: int) -> dict[str, Any]:
    """Normalize a (doc, distance) search hit into the chunk dict the UI consumes."""
    dist = round(float(distance), 4)
    # similarity = 1 − distance (cosine). `score` keeps the existing clamped-at-0
    # value used for the bar; `similarity` is the raw inverse of `distance` so the
    # inspector's ranked table can show both as exact complements (007).
    similarity = round(1.0 - dist, 4)
    return {
        "text": doc.page_content,
        "source": doc.metadata.get("source") or doc.metadata.get("filename", ""),
        "title": doc.metadata.get("title", ""),
        "score": round(max(0.0, similarity), 4),
        "distance": dist,
        "similarity": similarity,
        "rank": rank,
        # True for user-uploaded PDFs, False for the built-in corpus — lets the UI
        # badge a chunk as coming from the user's document.
        "uploaded": not doc.metadata.get("corpus", False),
    }


async def retrieve(
    query: str,
    k: int,
    emitter: TraceEmitter,
    session_id: str | None = None,
    *,
    rerank: bool = False,
    rerank_threshold: float = 0.0,
) -> tuple[str, list[dict[str, Any]]]:
    store = get_vectorstore()
    where = _scope_filter(session_id)

    # 054-rag-block-expansion: reranking is opt-in per request (061-scenario-builder
    # replaced the ``scenario == "intermediate"`` gate with the explicit ``rerank``
    # flag). When on, it fetches a WIDER candidate pool (so the cross-encoder sees more
    # than it returns), re-scores it, and trims back to top-k. Off, it searches exactly
    # top-k and skips rerank entirely — byte-for-byte with the Simple run.
    rerank_on = rerank
    settings = get_settings()
    fetch_k = max(k, settings.rerank_fetch_k) if rerank_on else k

    async with emitter.stage(Stage.RAG_EMBED, "Embedding the query") as rec:
        query_vec = store.embeddings.embed_query(query)
        rec.data = {
            "model": embedding_model_name(),
            "dim": len(query_vec),
            # A slice of the real query vector for the Embedding drill-in's vector
            # strip (054). 64 dims is enough to look like a vector without shipping
            # all 1536; the UI shows the first ~12 as numbers + a heatmap strip.
            "preview": [round(float(x), 4) for x in query_vec[:64]],
        }
        rec.metrics["dim"] = float(len(query_vec))

    async with emitter.stage(Stage.RAG_SEARCH, "Searching the vector store") as rec:
        # Re-embeds the query internally; fine for a small-k educational demo.
        results = _search_with_recovery(query, k=fetch_k, where=where)
        # Chroma returns results sorted by ascending distance, so the enumeration
        # index is a stable pre-rerank rank (1-based).
        candidates = [
            _to_chunk(doc, dist, rank) for rank, (doc, dist) in enumerate(results, start=1)
        ]
        rec.data = {
            "metric": "cosine",
            "k": fetch_k,
            "candidates": len(results),
            "scope": "corpus + this conversation's uploads" if session_id else "corpus",
            # The full candidate pool the vector search found (fetch_k wide on the
            # Intermediate rung). The Retrieval drill-in shows these; the reranker
            # then trims to top-k (054). On Simple this pool IS the returned top-k.
            "chunks": candidates,
        }

    if rerank_on:
        async with emitter.stage(Stage.RAG_RERANK, "Reranking candidates") as rec:
            result = rerank_chunks(query, candidates, top_k=k)
            # 055-rerank-score-threshold: after trimming to top-k, drop chunks whose
            # cross-encoder score is below the threshold — precision over recall, so a
            # clearly-irrelevant chunk never reaches the prompt. `0` filters nothing.
            selected = [c for c in result.ranked if c["rerank_score"] >= rerank_threshold]
            rec.data = {
                "model": settings.rerank_model,
                "k": k,
                "fetch_k": fetch_k,
                "threshold": rerank_threshold,
                # Per-candidate rank movement (prev_rank → new_rank + score) for the
                # inspector's before/after view.
                "candidates": result.movement,
            }
            if selected:
                rec.metrics["top_score"] = float(selected[0]["rerank_score"])
    else:
        selected = candidates[:k]

    async with emitter.stage(Stage.RAG_RETRIEVE, "Selecting top-k chunks") as rec:
        # Re-rank the selected chunks 1..n so `rank` reflects the final (post-rerank)
        # order regardless of which path produced them.
        chunks: list[dict[str, Any]] = [
            {**c, "rank": rank} for rank, c in enumerate(selected, start=1)
        ]
        rec.data = {"chunks": chunks, "k": k}
        if chunks:
            rec.metrics["top_score"] = chunks[0]["score"]

    context = "\n\n".join(f"[{c['source']}] {c['text']}" for c in chunks)
    return context, chunks
