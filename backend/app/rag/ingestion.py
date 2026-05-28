"""Online PDF ingestion: bytes -> text -> chunks -> embeddings -> Chroma.

Driven by the SSE upload endpoint (``POST /api/sessions/{id}/documents``), this
emits the three ``rag.ingest`` stages so the canvas animates the embedding
process in full — chunking strategy, per-chunk tokenization, the embedding
model/dimensions and a vector preview, then the store (002-interactive-chat, D4).

User documents land in the *same* Chroma collection as the corpus (D2), tagged
``corpus=False`` with the owning ``session_id`` / ``document_id`` so retrieval
can scope to "this conversation's uploads" and deletion can target exactly one
document's vectors.
"""

from __future__ import annotations

import asyncio
import io
from functools import lru_cache
from typing import Any

import tiktoken
from pypdf import PdfReader

from ..schemas import Stage
from ..storage.object_store import get_object
from ..trace import TraceEmitter
from .embeddings import embedding_model_name, get_embeddings
from .ingest import CHUNK_OVERLAP, CHUNK_SIZE, chunk_text
from .store import COLLECTION_NAME, get_vectorstore

# cl100k_base is the encoding shared by the text-embedding-3-* and gpt-4o-*
# families. Pin it (and cache the encoder) so token counts are deterministic and
# we never fetch an encoding file at request time.
_ENCODING = "cl100k_base"

# Metadata attached to every uploaded chunk; keep this in one place so the store
# stage can advertise the keys and retrieval/deletion can rely on them.
_METADATA_KEYS = ["corpus", "session_id", "document_id", "filename", "chunk"]


@lru_cache
def _encoder() -> tiktoken.Encoding:
    return tiktoken.get_encoding(_ENCODING)


def count_tokens(text: str) -> int:
    return len(_encoder().encode(text))


def extract_pdf_text(data: bytes) -> str:
    """Concatenate the extractable text of every page (pages separated by a
    blank line so the paragraph chunker sees page boundaries)."""
    reader = PdfReader(io.BytesIO(data))
    pages = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n\n".join(p for p in pages if p)


def delete_document_vectors(document_id: str) -> int:
    """Delete exactly the vectors for one document; returns how many were removed.

    Corpus vectors and other documents' vectors are untouched (AC3).
    """
    store = get_vectorstore()
    ids = store.get(where={"document_id": document_id}).get("ids", [])
    if ids:
        store.delete(ids=ids)
    return len(ids)


def delete_uploaded_vectors() -> int:
    """Delete every user-imported chunk (``corpus=False``); returns the count removed.

    The global companion to ``delete_document_vectors`` (025-clear-databases):
    it clears all uploaded-document vectors at once while leaving the built-in
    corpus (``corpus=True``) intact, so retrieval keeps working with no rebuild.

    Keyless-safe: opening the Chroma store needs the embedding function, which
    needs an ``OPENAI_API_KEY``. Without one, the store can't have any uploads
    to delete — so we report 0 instead of raising, matching the resilience
    pattern in ``rag/store.py::is_indexed`` and keeping the keyless
    ``POST /api/data/clear`` path (used by agent/reseed tests) working.
    """
    from ..config import MissingAPIKeyError

    try:
        store = get_vectorstore()
    except MissingAPIKeyError:
        return 0
    ids = store.get(where={"corpus": False}).get("ids", [])
    if ids:
        store.delete(ids=ids)
    return len(ids)


async def ingest_uploaded(
    storage_key: str,
    filename: str,
    session_id: str,
    document_id: str,
    emitter: TraceEmitter,
) -> dict[str, Any]:
    """Ingest a document the indexer reads back from object storage.

    The upload write-path (034-storage-ingestion-flow) persists the file to
    durable storage first; the indexer then reads it here — so storage is
    load-bearing, not decorative (a missing object raises ``FileNotFoundError``).
    """
    data = await asyncio.to_thread(get_object, storage_key)
    return await ingest_pdf(data, filename, session_id, document_id, emitter)


async def ingest_pdf(
    data: bytes,
    filename: str,
    session_id: str,
    document_id: str,
    emitter: TraceEmitter,
) -> dict[str, Any]:
    """Ingest one PDF into the vector store, emitting chunk -> embed -> store."""

    # 1) Extract + chunk + tokenize -------------------------------------------
    async with emitter.stage(
        Stage.RAG_INGEST_CHUNK, "Chunking the document", {"filename": filename}
    ) as rec:
        text = extract_pdf_text(data)
        chunks = chunk_text(text)
        token_counts = [count_tokens(c) for c in chunks]
        rec.data = {
            "strategy": "paragraph-packed, char-windowed with overlap",
            "chunk_size": CHUNK_SIZE,
            "chunk_overlap": CHUNK_OVERLAP,
            "num_chunks": len(chunks),
            "total_chars": len(text),
            "previews": [c[:160] for c in chunks[:4]],
            "token_counts": token_counts,
        }
        rec.metrics = {"num_chunks": float(len(chunks)), "total_tokens": float(sum(token_counts))}

    # 2) Embed every chunk -----------------------------------------------------
    async with emitter.stage(Stage.RAG_INGEST_EMBED, "Embedding the chunks") as rec:
        embeddings_fn = get_embeddings()
        vectors: list[list[float]] = (
            await asyncio.to_thread(embeddings_fn.embed_documents, chunks) if chunks else []
        )
        dim = len(vectors[0]) if vectors else 0
        rec.data = {
            "model": embedding_model_name(),
            "dim": dim,
            "num_vectors": len(vectors),
            "preview": [round(float(x), 4) for x in (vectors[0][:8] if vectors else [])],
        }
        rec.metrics = {"dim": float(dim), "num_vectors": float(len(vectors))}

    # 3) Store vectors with scoping metadata -----------------------------------
    async with emitter.stage(
        Stage.RAG_INGEST_STORE, "Storing vectors", {"filename": filename}
    ) as rec:
        store = get_vectorstore()
        ids = [f"{document_id}:{i}" for i in range(len(chunks))]
        metadatas = [
            {
                "corpus": False,
                "session_id": session_id,
                "document_id": document_id,
                "filename": filename,
                "chunk": i,
            }
            for i in range(len(chunks))
        ]
        if chunks:
            # We already computed the embeddings above — add them directly via the
            # underlying collection so we don't re-embed.
            await asyncio.to_thread(
                store._collection.add,
                ids=ids,
                documents=chunks,
                embeddings=vectors,
                metadatas=metadatas,
            )
        total = await asyncio.to_thread(store._collection.count)
        rec.data = {
            "collection": COLLECTION_NAME,
            "document_id": document_id,
            "filename": filename,
            "chunks_stored": len(chunks),
            "total_in_collection": int(total),
            "metadata_keys": _METADATA_KEYS,
        }
        rec.metrics = {"chunks_stored": float(len(chunks))}

    return {"document_id": document_id, "filename": filename, "chunk_count": len(chunks)}
