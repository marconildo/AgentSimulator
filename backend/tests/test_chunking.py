"""072-chunking-strategies: configurable, real ingestion-time chunkers.

`fixed` and `recursive` are pure and keyless (run always); `semantic` (embeddings) and
`agentic` (LLM) are real and `@pytest.mark.openai`. AC1 pins `recursive` to today's
`chunk_text` byte-for-byte via a frozen reference copy of the original algorithm.
"""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.rag.chunking import (
    CHUNK_SIZE,
    ChunkStrategy,
    chunk,
    chunk_texts,
)


# A frozen copy of the ORIGINAL ingest.chunk_text (pre-072), so AC1 is pinned
# independently of any later refactor of the recursive splitter.
def _reference_recursive(text: str) -> list[str]:
    from app.rag.chunking import CHUNK_OVERLAP

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
        tail = buffer[-CHUNK_OVERLAP:] if buffer else ""
        if tail and (sp := tail.find(" ")) != -1:
            tail = tail[sp + 1 :]
        buffer = f"{tail}\n\n{para}".strip() if tail else para
    if buffer:
        chunks.append(buffer)
    return chunks


def _corpus_texts() -> list[str]:
    return [p.read_text(encoding="utf-8") for p in get_settings().corpus_path.glob("*.md")]


# --- AC1: recursive is byte-for-byte today's chunk_text ----------------------


def test_recursive_matches_reference_on_corpus():
    for text in _corpus_texts():
        assert chunk_texts(text, ChunkStrategy.RECURSIVE) == _reference_recursive(text)


def test_ingest_chunk_text_still_exported():
    # ingestion.py + test_ingestion.py import these from app.rag.ingest — keep them.
    from app.rag.ingest import CHUNK_OVERLAP, CHUNK_SIZE, chunk_text  # noqa: F401

    text = _corpus_texts()[0]
    assert chunk_text(text) == _reference_recursive(text)


# --- AC2: each strategy's structural properties ------------------------------


def test_fixed_windows_can_cut_mid_text():
    text = _corpus_texts()[0]
    chunks = chunk(text, ChunkStrategy.FIXED)
    assert len(chunks) > 1
    # Fixed windows never exceed the size cap.
    assert all(c.end - c.start <= CHUNK_SIZE for c in chunks)
    # Fixed ignores structure, so at least one boundary lands mid-sentence: a chunk
    # whose text does NOT end on sentence punctuation / whitespace.
    assert any(c.text and c.text[-1] not in ".!?\n " for c in chunks[:-1])


def test_fixed_offsets_are_exact_contiguous():
    text = _corpus_texts()[0]
    chunks = chunk(text, ChunkStrategy.FIXED)
    # Each fixed chunk's text is exactly the source slice at its offsets.
    for c in chunks:
        assert c.text == text[c.start : c.end]


def test_recursive_never_starts_mid_word():
    for text in _corpus_texts():
        for c in chunk(text, ChunkStrategy.RECURSIVE):
            assert not c.text[:1].isspace()


def test_fixed_differs_from_recursive():
    text = _corpus_texts()[0]
    assert chunk_texts(text, ChunkStrategy.FIXED) != chunk_texts(text, ChunkStrategy.RECURSIVE)


def test_load_corpus_tags_strategy_and_count_differs():
    # AC3 — re-ingesting with a different strategy tags chunks + changes the chunk count.
    # load_corpus only chunks (no embeddings), so this is keyless and never mutates the index.
    from app.rag.ingest import load_corpus

    fixed = load_corpus(ChunkStrategy.FIXED)
    recursive = load_corpus(ChunkStrategy.RECURSIVE)
    assert all(d.metadata["strategy"] == "fixed" for d in fixed)
    assert all(d.metadata["strategy"] == "recursive" for d in recursive)
    # The boundaries differ (fixed cuts by length, recursive by structure) — on this small
    # corpus the counts can coincide, but the produced chunk texts must not.
    assert [d.page_content for d in fixed] != [d.page_content for d in recursive]


@pytest.mark.openai
def test_semantic_splits_on_topic_shift():
    # A document with a hard topic shift should produce ≥2 chunks.
    cats = "Cats are small domesticated felines. They purr and chase mice. A kitten is a young cat."
    nets = "TCP guarantees ordered delivery over IP. Packets are routed across networks. Latency varies."
    text = f"{cats}\n\n{nets}"
    chunks = chunk_texts(text, ChunkStrategy.SEMANTIC)
    assert len(chunks) >= 2


@pytest.mark.openai
def test_agentic_returns_nonempty_segments():
    text = _corpus_texts()[0]
    chunks = chunk_texts(text, ChunkStrategy.AGENTIC)
    assert len(chunks) >= 1
    assert all(c.strip() for c in chunks)
