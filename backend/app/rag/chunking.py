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
from collections.abc import Mapping
from dataclasses import dataclass, replace
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

# Separator ladder for sub-splitting a paragraph that is itself larger than
# chunk_size (real recursive splitting): try the largest structural break first,
# fall through to ever-smaller ones, and finally a hard character cut so the cap
# is always honored. "\n\n" is consumed by _recursive_texts before this runs.
_RECURSIVE_SEPARATORS = ["\n", ". ", " "]


class ChunkStrategy(StrEnum):
    FIXED = "fixed"
    RECURSIVE = "recursive"
    SEMANTIC = "semantic"
    AGENTIC = "agentic"


# --- 081-chunking-config: per-strategy tunable parameters --------------------
#
# The four chunkers used to read the module constants directly; now they read a
# `ChunkParams`. The DEFAULT params equal the constants exactly, so the default
# path is byte-for-byte unchanged (a regression test pins this).


@dataclass(frozen=True)
class ChunkParams:
    """The tunable knobs for chunking. Each strategy reads only the ones relevant to it
    (fixed/recursive: size+overlap; semantic: threshold+size; agentic: max_segments)."""

    chunk_size: int = CHUNK_SIZE
    chunk_overlap: int = CHUNK_OVERLAP
    semantic_threshold: float = SEMANTIC_THRESHOLD
    max_segments: int = AGENTIC_MAX_SEGMENTS


# The default-parameter singleton (frozen) — the cores read this when no params are
# supplied, so the default path is byte-for-byte unchanged.
DEFAULT_PARAMS = ChunkParams()


# Single source of truth for which params each strategy exposes + their (default, min, max).
# Used by both the API validator (422 on violation / clamp) and `/api/config` so the UI
# bounds and the server bounds can never drift.
CHUNK_PARAM_BOUNDS: dict[ChunkStrategy, dict[str, tuple[float, float, float]]] = {
    ChunkStrategy.FIXED: {
        "chunk_size": (CHUNK_SIZE, 100, 4000),
        "chunk_overlap": (CHUNK_OVERLAP, 0, 1000),
    },
    ChunkStrategy.RECURSIVE: {
        "chunk_size": (CHUNK_SIZE, 100, 4000),
        "chunk_overlap": (CHUNK_OVERLAP, 0, 1000),
    },
    ChunkStrategy.SEMANTIC: {
        "semantic_threshold": (SEMANTIC_THRESHOLD, 0.0, 1.0),
        "chunk_size": (CHUNK_SIZE, 100, 4000),
    },
    ChunkStrategy.AGENTIC: {
        "max_segments": (AGENTIC_MAX_SEGMENTS, 1, 50),
    },
}


def param_in_bounds(strategy: ChunkStrategy, key: str, value: float) -> bool:
    """Whether ``value`` is within ``key``'s configured bounds for ``strategy``."""
    bounds = CHUNK_PARAM_BOUNDS.get(strategy, {})
    if key not in bounds:
        return True
    _default, lo, hi = bounds[key]
    return lo <= value <= hi


def clamp_params(
    strategy: ChunkStrategy, overrides: Mapping[str, float | int | None]
) -> ChunkParams:
    """Build a ``ChunkParams`` from ``overrides``, applying only the keys relevant to
    ``strategy`` and clamping each to its configured bounds (defensive; the API also
    rejects out-of-bounds with a 422). Irrelevant/None values fall back to defaults."""
    bounds = CHUNK_PARAM_BOUNDS.get(strategy, {})
    values: dict[str, float] = {}
    for key, raw in overrides.items():
        if raw is None or key not in bounds:
            continue
        _default, lo, hi = bounds[key]
        coerced = float(raw) if key == "semantic_threshold" else int(raw)
        values[key] = min(max(coerced, lo), hi)
    return replace(ChunkParams(), **values) if values else ChunkParams()


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


def _split_oversized(segment: str, limit: int, separators: list[str]) -> list[str]:
    """Recursively break a segment longer than ``limit`` into <= ``limit`` pieces,
    walking the separator ladder and falling back to a hard character cut so the
    cap is always honored. Segments already within ``limit`` are returned as-is."""
    if len(segment) <= limit:
        return [segment]
    for i, sep in enumerate(separators):
        if sep not in segment:
            continue
        pieces: list[str] = []
        buffer = ""
        for part in segment.split(sep):
            candidate = f"{buffer}{sep}{part}" if buffer else part
            if len(candidate) <= limit:
                buffer = candidate
                continue
            if buffer:
                pieces.append(buffer)
            if len(part) > limit:
                pieces.extend(_split_oversized(part, limit, separators[i + 1 :]))
                buffer = ""
            else:
                buffer = part
        if buffer:
            pieces.append(buffer)
        return pieces
    # No separator present — hard character cut (last resort, never exceeds limit).
    return [segment[j : j + limit] for j in range(0, len(segment), limit)]


def _recursive_texts(text: str, params: ChunkParams = DEFAULT_PARAMS) -> list[str]:
    """Pack paragraphs into overlapping windows. The canonical default (== old chunk_text).

    A single paragraph larger than ``chunk_size`` is first sub-split via the separator
    ladder (``_split_oversized``) so it can never become one oversized chunk — real
    recursive splitting. Paragraphs that already fit are untouched, so on a corpus where
    no paragraph exceeds ``chunk_size`` the output is byte-for-byte the original.
    """
    paragraphs: list[str] = []
    for raw in text.split("\n\n"):
        para = raw.strip()
        if not para:
            continue
        if len(para) > params.chunk_size:
            paragraphs.extend(_split_oversized(para, params.chunk_size, _RECURSIVE_SEPARATORS))
        else:
            paragraphs.append(para)
    chunks: list[str] = []
    buffer = ""
    for para in paragraphs:
        candidate = f"{buffer}\n\n{para}".strip() if buffer else para
        if len(candidate) <= params.chunk_size:
            buffer = candidate
            continue
        if buffer:
            chunks.append(buffer)
        # Carry an overlap tail so ideas spanning a boundary aren't lost, starting at a
        # word boundary so chunks never begin mid-word.
        tail = buffer[-params.chunk_overlap :] if buffer and params.chunk_overlap else ""
        if tail and (sp := tail.find(" ")) != -1:
            tail = tail[sp + 1 :]
        buffer = f"{tail}\n\n{para}".strip() if tail else para
    if buffer:
        chunks.append(buffer)
    return chunks


def _fixed_spans(text: str, params: ChunkParams = DEFAULT_PARAMS) -> list[tuple[str, int, int]]:
    """Naive fixed-length windows with overlap — ignores structure (cuts mid-sentence)."""
    spans: list[tuple[str, int, int]] = []
    n = len(text)
    # Guard against a non-advancing window when overlap >= size (clamp keeps it sane).
    step = max(1, params.chunk_size - params.chunk_overlap)
    i = 0
    while i < n:
        end = min(i + params.chunk_size, n)
        spans.append((text[i:end], i, end))
        if end >= n:
            break
        i += step
    return spans


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENTENCE.split(text) if s.strip()]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def _semantic_texts(text: str, params: ChunkParams = DEFAULT_PARAMS) -> list[str]:
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
        if sim < params.semantic_threshold or current_len + len(sentences[i]) > params.chunk_size:
            chunks.append(" ".join(current))
            current = [sentences[i]]
            current_len = len(sentences[i])
        else:
            current.append(sentences[i])
            current_len += len(sentences[i]) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks


def _agentic_texts(text: str, params: ChunkParams = DEFAULT_PARAMS) -> list[str]:
    """Ask the LLM to segment the document into coherent units; fall back to recursive."""
    from ..config import get_settings

    settings = get_settings()
    max_segments = params.max_segments
    try:
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key, temperature=0)
        prompt = (
            "Split the document below into at most "
            f"{max_segments} coherent, self-contained topical segments. "
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
            return cleaned[:max_segments]
        raise ValueError("empty segmentation")
    except Exception as exc:  # noqa: BLE001 - any malformed response → honest fallback
        logger.warning("agentic chunking failed (%s); falling back to recursive", exc)
        return _recursive_texts(text, params)


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


def chunk(
    text: str,
    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE,
    params: ChunkParams | None = None,
) -> list[Chunk]:
    """Split ``text`` with ``strategy``, returning chunks + their (best-effort) char spans."""
    params = params or ChunkParams()
    if strategy == ChunkStrategy.FIXED:
        return [
            Chunk(text=t, index=i, start=s, end=e)
            for i, (t, s, e) in enumerate(_fixed_spans(text, params))
        ]
    return _locate(text, _TEXT_CORES[strategy](text, params))


def chunk_texts(
    text: str,
    strategy: ChunkStrategy = ChunkStrategy.RECURSIVE,
    params: ChunkParams | None = None,
) -> list[str]:
    """The chunk texts only — what ingestion stores."""
    params = params or ChunkParams()
    if strategy == ChunkStrategy.FIXED:
        return [t for t, _s, _e in _fixed_spans(text, params)]
    return _TEXT_CORES[strategy](text, params)


# Back-compat: the canonical recursive splitter, kept under its old name so
# ingestion.py / test_ingestion.py keep importing it from app.rag.ingest.
def chunk_text(text: str) -> list[str]:
    return _recursive_texts(text)
