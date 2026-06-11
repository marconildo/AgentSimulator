"""056-ragless-pageindex (T1): the PageIndex document tree.

No OpenAI key needed — the tree is built deterministically from the corpus markdown
(headings + paragraphs), so this test always runs and pins the tree contract:
a hierarchical table of contents the LLM later navigates by reasoning (no embeddings,
no vector DB). The flat corpus files (one ``#`` title + paragraphs) yield a 2-level
tree (file → paragraph sections); the parser also nests deeper headings when present.
"""

from app.rag.pageindex import build_tree, flatten, outline


def test_build_tree_has_one_node_per_corpus_file():
    root = build_tree()
    # The synthetic root collects one node per corpus file.
    assert root.children, "tree root should have file nodes"
    sources = {child.source for child in root.children}
    # The six known corpus files each become a top-level node.
    assert {"rag.md", "embeddings.md", "agents.md", "mcp.md", "llm-basics.md", "prompting.md"} <= {
        s for s in sources
    }


def test_file_nodes_carry_heading_title_and_paragraph_children():
    root = build_tree()
    rag = next(c for c in root.children if c.source == "rag.md")
    # Title comes from the markdown `#` heading.
    assert "RAG" in rag.title or "Retrieval" in rag.title
    # Flat files split into paragraph leaf sections, each with real prose.
    assert rag.children, "a flat file should split into paragraph sections"
    assert all(child.text.strip() for child in rag.children)


def test_node_ids_are_unique_and_stable():
    nodes = flatten(build_tree())
    ids = [n.id for n in nodes]
    assert len(ids) == len(set(ids)), "node ids must be unique"
    # Stable across builds (deterministic parse).
    assert ids == [n.id for n in flatten(build_tree())]


def test_outline_lists_node_ids_for_navigation():
    text = outline(build_tree())
    nodes = flatten(build_tree())
    # The outline the model navigates references every selectable node by id.
    leaf_ids = [n.id for n in nodes if not n.children]
    assert leaf_ids, "there should be selectable leaf sections"
    assert all(nid in text for nid in leaf_ids)
