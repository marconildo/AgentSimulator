"""Offline ingestion: corpus files -> chunks -> embeddings -> Chroma.

Run directly to (re)build the index::

    python -m app.rag.ingest

It is idempotent: the collection is reset before loading so re-running always
produces a clean index.
"""

from __future__ import annotations

from langchain_core.documents import Document

from ..config import get_settings
from .embeddings import embedding_model_name
from .store import COLLECTION_NAME, get_vectorstore

# Chunking parameters (characters). Small corpus -> modest chunks with overlap.
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150


def chunk_text(text: str) -> list[str]:
    """Split on blank lines, then pack paragraphs into overlapping windows."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buffer = ""
    for para in paragraphs:
        candidate = f"{buffer}\n\n{para}".strip() if buffer else para
        if len(candidate) <= CHUNK_SIZE:
            buffer = candidate
            continue
        if buffer:
            chunks.append(buffer)
        # Carry an overlap tail so ideas spanning a boundary aren't lost,
        # starting at a word boundary so chunks never begin mid-word.
        tail = buffer[-CHUNK_OVERLAP:] if buffer else ""
        if tail and (sp := tail.find(" ")) != -1:
            tail = tail[sp + 1 :]
        buffer = f"{tail}\n\n{para}".strip() if tail else para
    if buffer:
        chunks.append(buffer)
    return chunks


def load_corpus() -> list[Document]:
    settings = get_settings()
    corpus_dir = settings.corpus_path
    docs: list[Document] = []
    for path in sorted(corpus_dir.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        title = text.lstrip("# ").splitlines()[0] if text else path.stem
        for i, chunk in enumerate(chunk_text(text)):
            docs.append(
                Document(
                    page_content=chunk,
                    metadata={"source": path.name, "title": title, "chunk": i},
                )
            )
    return docs


def build_index() -> int:
    """Reset and rebuild the vector index. Returns the number of chunks.

    We clear the collection through Chroma's API (not by deleting files): the
    persisted directory is a mounted volume in Docker, and deleting it out from
    under an open client causes "device busy" / "readonly database" errors.
    """
    settings = get_settings()
    store = get_vectorstore()

    try:
        store.reset_collection()
    except Exception:  # noqa: BLE001 - fall back to deleting existing ids
        existing = store.get().get("ids", [])
        if existing:
            store.delete(ids=existing)

    docs = load_corpus()
    if not docs:
        print(f"No .md files found in {settings.corpus_path}")
        return 0

    store.add_documents(docs)
    return len(docs)


def main() -> None:
    settings = get_settings()
    print(f"Embedding model : {embedding_model_name()} (demo={settings.is_demo})")
    print(f"Corpus          : {settings.corpus_path}")
    print(f"Collection      : {COLLECTION_NAME} @ {settings.chroma_path}")
    count = build_index()
    print(f"Indexed {count} chunks.")


if __name__ == "__main__":
    main()
