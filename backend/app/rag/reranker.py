"""Local cross-encoder reranking (054-rag-block-expansion).

The Intermediate rung re-scores the wider candidate pool from the vector search with a
local FlashRank cross-encoder, so the most relevant chunks lead before the top-k is
trimmed and handed to the model as grounding. FlashRank runs locally (ONNX, no ``torch``,
no API key) and is deterministic, so the rerank is **real** (constitution §3) without a
new required secret. The model is loaded lazily and cached process-wide; the first
Intermediate rerank pays the one-time load, the Simple path never does.

The ``rerank`` helper is provider-agnostic: it takes plain candidate dicts (each with a
``text`` plus any pass-through metadata) and returns a :class:`RerankResult` carrying the
trimmed reordered top-k *and* the full rank movement for the trace, so the UI can show
each candidate's pre- vs post-rerank position.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from ..config import get_settings


@dataclass
class RerankResult:
    """The outcome of one rerank pass.

    ``ranked`` is the kept top-k, reordered, each candidate dict enriched with a 1-based
    ``rank`` and its ``rerank_score``. ``movement`` covers *every* scored candidate
    (not just the kept ones) with ``prev_rank`` (the vector-search order) and ``new_rank``
    (the rerank order) so the inspector can draw the reordering.
    """

    ranked: list[dict[str, Any]]
    movement: list[dict[str, Any]]


@lru_cache(maxsize=1)
def _ranker():
    """The FlashRank cross-encoder, loaded once and cached (lazy import keeps the heavy
    onnxruntime model off the Simple path and out of app startup)."""
    from flashrank import Ranker

    settings = get_settings()
    return Ranker(model_name=settings.rerank_model, cache_dir=settings.rerank_cache_dir)


def rerank(query: str, candidates: list[dict[str, Any]], top_k: int) -> RerankResult:
    """Re-score ``candidates`` against ``query`` and return the reordered top-k + movement.

    ``candidates`` are in vector-search order (so the list index is the pre-rerank rank).
    Each must carry a ``text``; other keys (``source``/``title``/``score``/…) pass through
    onto the ranked dicts unchanged.
    """
    if not candidates:
        return RerankResult(ranked=[], movement=[])

    from flashrank import RerankRequest

    passages = [{"id": i, "text": c.get("text", "")} for i, c in enumerate(candidates)]
    scored = _ranker().rerank(RerankRequest(query=query, passages=passages))

    movement: list[dict[str, Any]] = []
    ranked: list[dict[str, Any]] = []
    for new_rank, item in enumerate(scored, start=1):
        idx = int(item["id"])
        cand = candidates[idx]
        score = round(float(item["score"]), 6)
        movement.append(
            {
                "prev_rank": idx + 1,
                "new_rank": new_rank,
                "score": score,
                # The original vector-search cosine similarity, so the UI can show
                # "cosine → rerank" side by side (they're different metrics/scales).
                "similarity": cand.get("similarity", cand.get("score")),
                "source": cand.get("source", ""),
                "title": cand.get("title", ""),
            }
        )
        if new_rank <= top_k:
            ranked.append({**cand, "rank": new_rank, "rerank_score": score})

    return RerankResult(ranked=ranked, movement=movement)
