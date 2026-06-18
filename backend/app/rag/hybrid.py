"""Sparse (BM25) lane + Reciprocal Rank Fusion (070-hybrid-search).

Vector RAG retrieves by *meaning* (cosine over embeddings) and misses exact, rare tokens —
codes, acronyms, proper nouns, error identifiers — where the literal term carries the signal.
Hybrid search adds a **sparse keyword lane** (BM25) alongside the dense one and **fuses** the
two ranked lists with **Reciprocal Rank Fusion (RRF)**.

Both helpers are pure functions over plain chunk dicts (each with a ``text`` plus pass-through
metadata), mirroring :mod:`app.rag.reranker`. BM25 runs locally via ``rank_bm25`` (pure-python,
deterministic, no API key), so the run stays real (constitution §3) without a new secret. RRF is
**rank-based** (``score = Σ 1/(rrf_k + rank)``) so it never has to reconcile the incompatible
score scales — cosine (0..1) vs BM25 (unbounded): a chunk that ranks well in *either* lane
floats up; a chunk that ranks well in *both* wins.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# Keep underscores/digits so identifiers like ``RAG_RERANK`` survive as one rare token — that
# exact-term match is the whole reason the sparse lane earns its keep.
_TOKEN = re.compile(r"[a-z0-9_]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def _key(chunk: dict[str, Any]) -> tuple[str, str]:
    """A stable identity for a chunk across both lanes (same text ⇒ same chunk)."""
    return (chunk.get("source", ""), chunk.get("text", ""))


@dataclass
class HybridResult:
    """The outcome of one hybrid fusion.

    ``fused`` is the RRF-ordered candidate pool, each chunk dict enriched with a 1-based
    ``rank`` and its ``rrf_score`` (and the per-lane ranks). ``movement`` covers *every* fused
    chunk with its ``vector_rank`` / ``bm25_rank`` (``None`` when a lane didn't rank it) and the
    ``rrf_score``, so the inspector can draw the Vector | BM25 | → RRF view.
    """

    fused: list[dict[str, Any]]
    movement: list[dict[str, Any]]


def bm25_rank(query: str, chunks: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    """Rank ``chunks`` against ``query`` with BM25, returning the reordered top-k.

    Each returned dict is the original chunk plus a 1-based ``rank``. Deterministic: ties keep
    the input order (``sorted`` is stable). Returns ``[]`` for no chunks.
    """
    if not chunks:
        return []

    from rank_bm25 import BM25Okapi

    corpus = [_tokenize(c.get("text", "")) for c in chunks]
    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(_tokenize(query))
    order = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)
    ranked: list[dict[str, Any]] = []
    for rank, idx in enumerate(order[:top_k], start=1):
        ranked.append({**chunks[idx], "rank": rank, "bm25_score": round(float(scores[idx]), 6)})
    return ranked


def rrf_fuse(
    vector_ranked: list[dict[str, Any]],
    bm25_ranked: list[dict[str, Any]],
    rrf_k: int,
) -> HybridResult:
    """Fuse the two ranked lists with RRF.

    Both inputs are in their own rank order, each chunk carrying a 1-based ``rank``. A chunk is
    matched across lanes by ``(source, text)``. The fused order is ``sort desc by Σ 1/(rrf_k +
    rank_lane)`` over the lanes that ranked it.
    """
    vec_rank = {_key(c): c["rank"] for c in vector_ranked}
    bm_rank = {_key(c): c["rank"] for c in bm25_ranked}
    # Prefer the vector-lane dict (it carries similarity/score metadata); fall back to bm25.
    chunk_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for c in bm25_ranked:
        chunk_by_key[_key(c)] = c
    for c in vector_ranked:
        chunk_by_key[_key(c)] = c

    scored: list[tuple[float, int, dict[str, Any]]] = []
    for key, chunk in chunk_by_key.items():
        vr = vec_rank.get(key)
        br = bm_rank.get(key)
        score = 0.0
        if vr is not None:
            score += 1.0 / (rrf_k + vr)
        if br is not None:
            score += 1.0 / (rrf_k + br)
        score = round(score, 6)
        # Secondary key (best lane rank) keeps ties deterministic.
        best = min(r for r in (vr, br) if r is not None)
        scored.append((score, best, {**chunk, "vector_rank": vr, "bm25_rank": br}))

    scored.sort(key=lambda t: (-t[0], t[1]))

    fused: list[dict[str, Any]] = []
    movement: list[dict[str, Any]] = []
    for new_rank, (score, _best, chunk) in enumerate(scored, start=1):
        fused.append({**chunk, "rank": new_rank, "rrf_score": score})
        movement.append(
            {
                "source": chunk.get("source", ""),
                "title": chunk.get("title", ""),
                "vector_rank": chunk["vector_rank"],
                "bm25_rank": chunk["bm25_rank"],
                "rrf_score": score,
                "new_rank": new_rank,
                # The original dense cosine similarity, so the UI can show it beside the fusion.
                "similarity": chunk.get("similarity", chunk.get("score")),
            }
        )
    return HybridResult(fused=fused, movement=movement)
