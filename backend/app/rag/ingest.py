"""Offline ingestion: corpus files -> chunks -> embeddings -> Chroma.

Run directly to (re)build the index::

    python -m app.rag.ingest

It is idempotent: the collection is reset before loading so re-running always
produces a clean index.
"""

from __future__ import annotations

import asyncio
import re

from langchain_core.documents import Document

from ..config import get_settings
from ..schemas import Stage
from ..trace import TraceEmitter
from .chunking import CHUNK_OVERLAP, CHUNK_SIZE, ChunkStrategy, chunk, chunk_text
from .embeddings import embedding_model_name, get_embeddings
from .store import COLLECTION_NAME, get_vectorstore

# 072-chunking-strategies: the chunking parameters + the default recursive splitter now
# live in `chunking.py`. Re-exported here so existing importers (ingestion.py,
# test_ingestion.py) keep working unchanged.
__all__ = [
    "CHUNK_OVERLAP",
    "CHUNK_SIZE",
    "chunk_text",
    "build_index",
    "load_corpus",
    "reingest_corpus",
    "active_chunk_strategy",
    "main",
]

# 072-chunking-strategies: the strategy the *live index* was last built with, so the UI
# can show which chunker the corpus actually uses (honest active-state readout). Set by
# every (re)build; defaults to the configured strategy. Process-local (single-instance, §7).
_active_strategy: str | None = None


def active_chunk_strategy() -> str:
    """The chunking strategy the live corpus index was last built with."""
    return _active_strategy or get_settings().chunk_strategy


_HEADING = re.compile(r"^#{1,6}\s+(.*)$", re.MULTILINE)


def _headings(text: str) -> list[tuple[int, str]]:
    """(offset, heading text) for every markdown heading, in document order."""
    return [(m.start(), m.group(1).strip()) for m in _HEADING.finditer(text)]


def _section_for(offset: int, headings: list[tuple[int, str]]) -> str:
    """The nearest markdown heading at or before ``offset`` (the chunk's section)."""
    section = ""
    for off, head in headings:
        if off <= offset:
            section = head
        else:
            break
    return section


def load_corpus(strategy: ChunkStrategy | None = None) -> list[Document]:
    settings = get_settings()
    strategy = ChunkStrategy(strategy or settings.chunk_strategy)
    corpus_dir = settings.corpus_path
    docs: list[Document] = []
    for path in sorted(corpus_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title = text.lstrip("# ").splitlines()[0] if text else path.stem
        # 073-metadata-first-class: chunk WITH offsets so each chunk's nearest preceding
        # heading becomes its `section`. `chunk(...)` wraps the same texts chunk_texts
        # produces (byte-for-byte page_content), plus best-effort char spans.
        chunks = chunk(text, strategy)
        headings = _headings(text)
        total = len(chunks)
        for c in chunks:
            docs.append(
                Document(
                    page_content=c.text,
                    # `corpus=True` distinguishes the built-in knowledge base from
                    # user-uploaded PDFs (tagged with a session_id). Retrieval and
                    # the corpus rebuild both key off this flag (D2/D3). `strategy`
                    # records which chunker produced this chunk (072). 073 adds rich
                    # metadata — `section` (nearest heading), `doc_type`, `total_chunks` —
                    # so the inspector can answer "why was this chunk retrieved?".
                    metadata={
                        "corpus": True,
                        "source": path.name,
                        "title": title,
                        "chunk": c.index,
                        "strategy": str(strategy),
                        "section": _section_for(c.start, headings),
                        "doc_type": "markdown",
                        "total_chunks": total,
                    },
                )
            )
    return docs


def build_index(strategy: ChunkStrategy | None = None) -> int:
    """(Re)build the corpus vectors with ``strategy``. Returns the number of corpus chunks.

    Deletes only ``where={"corpus": True}`` and re-adds the corpus, so rebuilding
    the built-in knowledge base never wipes user-uploaded documents that share
    the same collection (D2). We clear through Chroma's API (not by deleting
    files): the persisted directory is a mounted volume in Docker, and deleting
    it out from under an open client causes "device busy" errors.
    """
    settings = get_settings()
    store = get_vectorstore()

    try:
        existing = store.get(where={"corpus": True}).get("ids", [])
        if existing:
            store.delete(ids=existing)
    except Exception:  # noqa: BLE001 - empty/new collection has nothing to clear
        pass

    resolved = ChunkStrategy(strategy or settings.chunk_strategy)
    docs = load_corpus(resolved)
    if not docs:
        print(f"No .md files found in {settings.corpus_path}")
        return 0

    store.add_documents(docs)
    global _active_strategy
    _active_strategy = str(resolved)
    return len(docs)


async def reingest_corpus(
    strategy: ChunkStrategy | None, emitter: TraceEmitter
) -> dict[str, object]:
    """Rebuild the corpus index with ``strategy``, emitting the ingestion stages.

    Mirrors the per-PDF upload flow (``ingest_pdf``) but for the whole built-in corpus,
    so the canvas animates Chunking -> Embedding -> Storing once for the rebuild. Real:
    it clears the corpus vectors and re-adds them with the chosen chunker (uploads, tagged
    with a session_id, are untouched). Sets the active strategy on success.
    """
    settings = get_settings()
    resolved = ChunkStrategy(strategy or settings.chunk_strategy)
    store = get_vectorstore()

    async with emitter.stage(Stage.RAG_INGEST_CHUNK, "Chunking the corpus") as rec:
        docs = await asyncio.to_thread(load_corpus, resolved)
        texts = [d.page_content for d in docs]
        sources = {str(d.metadata.get("source", "")) for d in docs}
        rec.data = {
            "strategy": str(resolved),
            "num_chunks": len(texts),
            "num_files": len(sources),
            "chunk_size": CHUNK_SIZE,
            "chunk_overlap": CHUNK_OVERLAP,
            "previews": [t[:160] for t in texts[:4]],
        }
        rec.metrics = {"num_chunks": float(len(texts)), "num_files": float(len(sources))}

    async with emitter.stage(Stage.RAG_INGEST_EMBED, "Embedding the chunks") as rec:
        embeddings_fn = get_embeddings()
        vectors: list[list[float]] = (
            await asyncio.to_thread(embeddings_fn.embed_documents, texts) if texts else []
        )
        dim = len(vectors[0]) if vectors else 0
        rec.data = {
            "model": embedding_model_name(),
            "dim": dim,
            "num_vectors": len(vectors),
            "preview": [round(float(x), 4) for x in (vectors[0][:8] if vectors else [])],
        }
        rec.metrics = {"dim": float(dim), "num_vectors": float(len(vectors))}

    async with emitter.stage(Stage.RAG_INGEST_STORE, "Storing vectors") as rec:
        # Use the proven build_index path (delete-by-`corpus` + add_documents) for the
        # actual mutation — it preserves user uploads and keeps the HNSW index
        # consistent. (We re-embed inside add_documents; the corpus is tiny, so the
        # extra embed of ~dozen chunks is negligible and keeps the write path safe.)
        count = await asyncio.to_thread(build_index, resolved)
        total = await asyncio.to_thread(store._collection.count)
        rec.data = {
            "collection": COLLECTION_NAME,
            "strategy": str(resolved),
            "chunks_stored": count,
            "total_in_collection": int(total),
        }
        rec.metrics = {"chunks_stored": float(count)}

    global _active_strategy
    _active_strategy = str(resolved)
    return {"strategy": str(resolved), "num_chunks": len(texts)}


def main() -> None:
    settings = get_settings()
    print(f"Embedding model : {embedding_model_name()}")
    print(f"Corpus          : {settings.corpus_path}")
    print(f"Collection      : {COLLECTION_NAME} @ {settings.chroma_path}")
    count = build_index()
    print(f"Indexed {count} chunks.")


if __name__ == "__main__":
    main()
