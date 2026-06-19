"""Configurable ingestion-time chunking strategies (072-chunking-strategies).

Chunking is **upstream of every retrieval metric** — bad boundaries cap how good rerank (054),
hybrid (070) or the metrics (071) can ever look. This module turns the single fixed splitter
into a *strategy*, so the user can pick one and *see* the difference:

  - ``fixed``     — naive fixed-length character windows; ignores structure, so it happily cuts
                    a sentence in half (the "bad baseline" to contrast against).
  - ``recursive`` — today's default: pack paragraphs into overlapping windows, never starting a
                    chunk mid-word. ``chunk_texts(text, RECURSIVE)`` is byte-for-byte the old
                    ``ingest.chunk_text`` (regression-pinned).
  - ``semantic``  — embed sentences and open a new chunk where adjacent-sentence similarity drops
                    (a topic shift). Real, uses OpenAI embeddings (keyed).
  - ``agentic``   — ask the LLM to segment the document into coherent topical units. Real (keyed);
                    falls back to ``recursive`` on a malformed response (logged, honest).

Everything is real (constitution §3): ``fixed``/``recursive`` are keyless; ``semantic``/``agentic``
use OpenAI and raise ``MissingAPIKeyError`` with no key — no fake fallback.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from enum import StrEnum

logger = logging.getLogger(__name__)

# Chunking parameters (characters). Small corpus -> modest chunks with overlap.
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150

# Semantic chunking: open a new chunk when the cosine similarity between adjacent
# sentences drops below this (a topic shift), or the running chunk exceeds CHUNK_SIZE.
SEMANTIC_THRESHOLD = 0.5

# Agentic chunking: cap how many segments we ask the LLM for, to bound cost/latency.
AGENTIC_MAX_SEGMENTS = 12

_SENTENCE = re.compile(r"(?<=[.!?])\s+")


class ChunkStrategy(StrEnum):
    FIXED = "fixed"
    RECURSIVE = "recursive"
    SEMANTIC = "semantic"
    AGENTIC = "agentic"


@dataclass
class Chunk:
    """One produced chunk + its (best-effort) char span in the source document.

    ``start``/``end`` are exact for ``fixed`` (it slices the source directly) and best-effort
    for the others (located by a forward-scanning probe), which is plenty for the playground's
    boundary visualization.
    """

    text: str
    index: int
    start: int
    end: int


# --- the four strategies (text-only cores) -----------------------------------


def _recursive_texts(text: str) -> list[str]:
    """Pack paragraphs into overlapping windows. The canonical default (== old chunk_text)."""
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
        # Carry an overlap tail so ideas spanning a boundary aren't lost, starting at a
        # word boundary so chunks never begin mid-word.
        tail = buffer[-CHUNK_OVERLAP:] if buffer else ""
        if tail and (sp := tail.find(" ")) != -1:
            tail = tail[sp + 1 :]
        buffer = f"{tail}\n\n{para}".strip() if tail else para
    if buffer:
        chunks.append(buffer)
    return chunks


def _fixed_spans(text: str) -> list[tuple[str, int, int]]:
    """Naive fixed-length windows with overlap — ignores structure (cuts mid-sentence)."""
    spans: list[tuple[str, int, int]] = []
    n = len(text)
    i = 0
    while i < n:
        end = min(i + CHUNK_SIZE, n)
        spans.append((text[i:end], i, end))
        if end >= n:
            break
        i = end - CHUNK_OVERLAP
    return spans


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE.split(text) if s.strip()]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def _semantic_texts(text: str) -> list[str]:
    """Open a new chunk where adjacent-sentence similarity drops (topic shift). Real embeddings."""
    sentences = _split_sentences(text)
    if len(sentences) <= 1:
        return [text.strip()] if text.strip() else []

    from .embeddings import get_embeddings

    embeddings = get_embeddings().embed_documents(sentences)
    chunks: list[str] = []
    current = [sentences[0]]
    current_len = len(sentences[0])
    for i in range(1, len(sentences)):
        sim = _cosine(embeddings[i - 1], embeddings[i])
        if sim < SEMANTIC_THRESHOLD or current_len + len(sentences[i]) > CHUNK_SIZE:
            chunks.append(" ".join(current))
            current = [sentences[i]]
            current_len = len(sentences[i])
        else:
            current.append(sentences[i])
            current_len += len(sentences[i]) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks


def _agentic_texts(text: str) -> list[str]:
    """Ask the LLM to segment the document into coherent units; fall back to recursive."""
    from ..config import get_settings

    settings = get_settings()
    try:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key, temperature=0)
        prompt = (
            "Split the document below into at most "
            f"{AGENTIC_MAX_SEGMENTS} coherent, self-contained topical segments. "
            "Preserve the original wording; do not summarize. "
            'Return ONLY a JSON array of strings, e.g. ["segment one", "segment two"].\n\n'
            f"Document:\n{text}"
        )
        raw = llm.invoke(prompt).content
        if isinstance(raw, list):  # some models return content parts
            raw = "".join(part if isinstance(part, str) else "" for part in raw)
        segments = json.loads(_strip_code_fence(str(raw)))
        cleaned = [s.strip() for s in segments if isinstance(s, str) and s.strip()]
        if cleaned:
            return cleaned[:AGENTIC_MAX_SEGMENTS]
        raise ValueError("empty segmentation")
    except Exception as exc:  # noqa: BLE001 - any malformed response → honest fallback
        logger.warning("agentic chunking failed (%s); falling back to recursive", exc)
        return _recursive_texts(text)


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n?", "", s)
        s = re.sub(r"\n?```$", "", s)
    return s.strip()


# --- public interface --------------------------------------------------------

_TEXT_CORES = {
    ChunkStrategy.RECURSIVE: _recursive_texts,
    ChunkStrategy.SEMANTIC: _semantic_texts,
    ChunkStrategy.AGENTIC: _agentic_texts,
}


def _locate(text: str, texts: list[str]) -> list[Chunk]:
    """Best-effort char spans for strategies that rebuild text (recursive/semantic/agentic)."""
    out: list[Chunk] = []
    cursor = 0
    for i, ct in enumerate(texts):
        probe = ct.strip()[:30]
        pos = text.find(probe, cursor) if probe else cursor
        if pos < 0:
            pos = text.find(probe)
        start = pos if pos >= 0 else cursor
        end = min(start + len(ct), len(text))
        out.append(Chunk(text=ct, index=i, start=start, end=end))
        cursor = max(cursor, start + 1)
    return out


def chunk(text: str, strategy: ChunkStrategy = ChunkStrategy.RECURSIVE) -> list[Chunk]:
    """Split ``text`` with ``strategy``, returning chunks + their (best-effort) char spans."""
    if strategy == ChunkStrategy.FIXED:
        return [
            Chunk(text=t, index=i, start=s, end=e) for i, (t, s, e) in enumerate(_fixed_spans(text))
        ]
    return _locate(text, _TEXT_CORES[strategy](text))


def chunk_texts(text: str, strategy: ChunkStrategy = ChunkStrategy.RECURSIVE) -> list[str]:
    """The chunk texts only — what ingestion stores."""
    if strategy == ChunkStrategy.FIXED:
        return [t for t, _s, _e in _fixed_spans(text)]
    return _TEXT_CORES[strategy](text)


# Back-compat: the canonical recursive splitter, kept under its old name so
# ingestion.py / test_ingestion.py keep importing it from app.rag.ingest.
def chunk_text(text: str) -> list[str]:
    return _recursive_texts(text)
