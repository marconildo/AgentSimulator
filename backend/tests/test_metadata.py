"""073-metadata-first-class: rich chunk metadata + the retrieval filter seam.

Deliberately keyless/deterministic (dodges the flaky chromadb query path): metadata extraction
runs over the real corpus files (no embeddings), the chunk-dict carry is tested via `_to_chunk`
with a fake document, and the filter is tested at the `_with_filters` merge level. The live
filter restriction over Chroma is the seam self-querying will exercise end-to-end.
"""

from __future__ import annotations

from app.rag.chunking import ChunkStrategy
from app.rag.ingest import load_corpus
from app.rag.retriever import _scope_filter, _to_chunk, _with_filters

# --- AC1: rich extraction at ingest ------------------------------------------


def test_load_corpus_attaches_rich_metadata():
    docs = load_corpus(ChunkStrategy.RECURSIVE)
    assert docs
    for d in docs:
        m = d.metadata
        assert m["source"].endswith(".md")
        assert m["doc_type"] == "markdown"
        assert isinstance(m["section"], str)  # nearest heading (may be the title)
        assert isinstance(m["total_chunks"], int) and m["total_chunks"] >= 1
        assert 0 <= m["chunk"] < m["total_chunks"]


def test_section_is_nearest_heading():
    # agents.md opens under the H1 "AI Agents and the ReAct Loop"; its first chunk's
    # section should be that heading.
    docs = [d for d in load_corpus(ChunkStrategy.RECURSIVE) if d.metadata["source"] == "agents.md"]
    assert docs
    assert "Agent" in docs[0].metadata["section"]


# --- AC2/AC5: chunk dict carries metadata, degrades for a poor doc -----------


class _FakeDoc:
    def __init__(self, page_content: str, metadata: dict):
        self.page_content = page_content
        self.metadata = metadata


def test_to_chunk_carries_metadata():
    doc = _FakeDoc(
        "cosine similarity…",
        {
            "corpus": True,
            "source": "embeddings.md",
            "title": "Embeddings",
            "section": "Vector Search",
            "doc_type": "markdown",
            "chunk": 2,
            "total_chunks": 5,
        },
    )
    c = _to_chunk(doc, 0.25, rank=1)
    assert c["section"] == "Vector Search"
    assert c["doc_type"] == "markdown"
    assert c["position"] == "3/5"  # 1-based index / total


def test_to_chunk_degrades_for_metadata_poor_doc():
    # A legacy chunk (pre-073 index) lacking the new fields must not crash.
    doc = _FakeDoc("legacy", {"corpus": True, "source": "old.md"})
    c = _to_chunk(doc, 0.5, rank=1)
    assert c["source"] == "old.md"
    assert c["section"] == ""
    assert c["doc_type"] == ""
    assert c["position"] == ""


# --- AC3/AC4/AC7: the filter seam (where-merge), keyless ---------------------


def test_with_filters_none_is_scope_unchanged():
    scope = _scope_filter("sess-1")
    assert _with_filters(scope, None) == scope
    assert _with_filters(scope, {}) == scope


def test_with_filters_ands_metadata_with_scope():
    scope = _scope_filter(None)  # {"corpus": True}
    merged = _with_filters(scope, {"source": "rag.md"})
    assert merged == {"$and": [{"corpus": True}, {"source": "rag.md"}]}


def test_with_filters_multiple_fields():
    scope = _scope_filter(None)
    merged = _with_filters(scope, {"source": "rag.md", "doc_type": "markdown"})
    assert merged["$and"][0] == {"corpus": True}
    rest = merged["$and"][1:]
    assert {"source": "rag.md"} in rest and {"doc_type": "markdown"} in rest
