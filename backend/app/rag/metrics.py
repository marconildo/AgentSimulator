"""Retrieval-quality metrics: Precision@k · Recall@k · MRR (071-retrieval-metrics).

The reranker (054) and hybrid search (070) *claim* they improve retrieval; this module
*measures* it. A small hand-authored **golden set** (``data/retrieval_golden.json``) labels a
query with the corpus file(s) that are *relevant*; when a run's query matches an entry we can
score the retrieved chunks against the ground truth.

Honesty first (constitution §3): metrics only exist where there is ground truth. An unlabelled
query gets **no** metrics — the caller attaches nothing and the UI says so plainly. Relevance is
at the **source-file** granularity: a retrieved chunk counts as relevant iff its ``source`` is in
the entry's ``relevant_sources``.

All functions here are pure and keyless (no embeddings, no OpenAI), so the math is unit-tested
directly; the retriever wires ``evaluate`` onto the ``rag.retrieve`` END for labelled queries.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any

_GOLDEN_PATH = Path(__file__).resolve().parents[1] / "data" / "retrieval_golden.json"
_WS = re.compile(r"\s+")


def precision_at_k(ranked_sources: Sequence[str], relevant: Iterable[str], k: int) -> float:
    """Of the top-k retrieved chunks, the fraction whose source is relevant.

    Chunk-level: the denominator is how many chunks were actually considered (``min(k, n)``),
    so a run that returned fewer than ``k`` chunks (e.g. after a rerank threshold) isn't
    understated. Returns ``0.0`` when nothing was retrieved.
    """
    rel = set(relevant)
    top = list(ranked_sources)[:k]
    if not top:
        return 0.0
    return sum(1 for s in top if s in rel) / len(top)


def recall_at_k(ranked_sources: Sequence[str], relevant: Iterable[str], k: int) -> float:
    """Of all relevant sources, the fraction that appear in the top-k. ``0.0`` if no ground truth."""
    rel = set(relevant)
    if not rel:
        return 0.0
    top = set(list(ranked_sources)[:k])
    return len(rel & top) / len(rel)


def mrr(ranked_sources: Sequence[str], relevant: Iterable[str]) -> float:
    """Reciprocal rank of the first relevant chunk: ``1/rank`` (1-based), else ``0.0``."""
    rel = set(relevant)
    for rank, source in enumerate(ranked_sources, start=1):
        if source in rel:
            return 1.0 / rank
    return 0.0


def evaluate(ranked_sources: Sequence[str], relevant: Iterable[str], k: int) -> dict[str, Any]:
    """The ``eval`` payload attached to ``rag.retrieve`` for a labelled query.

    Carries the three headline metrics plus the context the UI needs to render the "why":
    which relevant sources exist, and which were **missed** (relevant but not in the top-k).
    """
    rel = list(dict.fromkeys(relevant))  # de-dupe, preserve order
    rel_set = set(rel)
    top = list(ranked_sources)[:k]
    return {
        "precision_at_k": round(precision_at_k(ranked_sources, rel_set, k), 4),
        "recall_at_k": round(recall_at_k(ranked_sources, rel_set, k), 4),
        "mrr": round(mrr(ranked_sources, rel_set), 4),
        "k": k,
        "relevant_count": len(rel),
        "relevant_sources": rel,
        "missed": sorted(rel_set - set(top)),
    }


@lru_cache(maxsize=1)
def load_golden() -> list[dict[str, Any]]:
    """The labelled query → relevant-source set, loaded once from the data file."""
    if not _GOLDEN_PATH.exists():
        return []
    return json.loads(_GOLDEN_PATH.read_text(encoding="utf-8"))


def _normalise(query: str) -> str:
    return _WS.sub(" ", query.strip().lower())


def match_golden(query: str) -> dict[str, Any] | None:
    """The golden entry whose query matches (case/whitespace-insensitive), or ``None``.

    Benchmark chips send the exact string, so the normalised equality match is reliable; a
    free-form / paraphrased query simply doesn't match and gets no metrics (honest).
    """
    target = _normalise(query)
    for entry in load_golden():
        if _normalise(entry["query"]) == target:
            return entry
    return None


def benchmark_queries() -> list[dict[str, str]]:
    """The id + query pairs exposed via ``/api/config`` for one-click benchmark chips."""
    return [{"id": e["id"], "query": e["query"]} for e in load_golden()]
