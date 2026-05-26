"""Online retrieval: embed the query, search Chroma, return top-k chunks.

Each step emits a trace stage so the UI can show the query vector, the search,
and the retrieved chunks with their similarity scores.
"""

from __future__ import annotations

from typing import Any

from ..schemas import Stage
from ..trace import TraceEmitter
from .embeddings import embedding_model_name
from .store import get_vectorstore


async def retrieve(query: str, k: int, emitter: TraceEmitter) -> tuple[str, list[dict[str, Any]]]:
    store = get_vectorstore()

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
        results = store.similarity_search_with_score(query, k=k)
        rec.data = {"metric": "cosine", "k": k, "candidates": len(results)}

    async with emitter.stage(Stage.RAG_RETRIEVE, "Selecting top-k chunks") as rec:
        chunks: list[dict[str, Any]] = []
        for doc, distance in results:
            similarity = round(max(0.0, 1.0 - float(distance)), 4)
            chunks.append(
                {
                    "text": doc.page_content,
                    "source": doc.metadata.get("source", ""),
                    "title": doc.metadata.get("title", ""),
                    "score": similarity,
                }
            )
        rec.data = {"chunks": chunks, "k": k}
        if chunks:
            rec.metrics["top_score"] = chunks[0]["score"]

    context = "\n\n".join(f"[{c['source']}] {c['text']}" for c in chunks)
    return context, chunks
