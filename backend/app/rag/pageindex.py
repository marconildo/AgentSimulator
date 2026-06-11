"""RAGLESS retrieval via PageIndex (056-ragless-pageindex).

A second, *reasoning-based* retrieval path that runs alongside Vector RAG when the
per-conversation ``ragless`` toggle is on (Intermediate rung only). Instead of
chunk → embed → vector similarity, PageIndex:

  1. builds a real hierarchical **tree** (table of contents) from the corpus markdown
     — headings nest; a heading's prose splits into paragraph leaf sections;
  2. has the **LLM navigate** that tree by reasoning (a single structured call) to
     select the relevant node(s);
  3. returns the selected sections' text as the grounding context.

No embeddings, no vector DB, no rerank. The tree is built deterministically from the
local corpus and cached in-process (the corpus is static — rebuilt on restart, like the
Chroma index). The navigation is the only model call. Three trace stages animate the
new ``pageindex`` station: ``pageindex.tree`` → ``pageindex.navigate`` → ``pageindex.select``.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any

from ..config import get_settings
from ..schemas import Stage
from ..trace import TraceEmitter

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
# Words pulled off a paragraph to label its leaf node in the tree outline.
_LABEL_WORDS = 8


@dataclass
class TreeNode:
    """One node of the PageIndex document tree.

    A heading node (``text`` empty) groups children; a paragraph node is a leaf
    section whose ``text`` is the prose the model can select as grounding context.
    """

    id: str
    title: str
    level: int
    source: str
    text: str = ""
    children: list[TreeNode] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Serialize for the trace (the FE renders this as the navigable ToC)."""
        node: dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "level": self.level,
            "source": self.source,
        }
        if self.text:
            # A short snippet is enough for the tree view; the full text travels on select.
            node["snippet"] = _snippet(self.text, 160)
        if self.children:
            node["children"] = [c.to_dict() for c in self.children]
        return node


def _snippet(text: str, n: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1].rstrip() + "…"


def _label(text: str) -> str:
    """A short human label for a paragraph leaf (first few words, markdown-stripped)."""
    plain = re.sub(r"[*_`#>]", "", " ".join(text.split()))
    words = plain.split()
    label = " ".join(words[:_LABEL_WORDS])
    return label + ("…" if len(words) > _LABEL_WORDS else "")


def _split_paragraphs(body: str) -> list[str]:
    """Blank-line-separated prose blocks, trimmed; empties dropped."""
    return [block.strip() for block in re.split(r"\n\s*\n", body) if block.strip()]


def _parse_file(stem: str, source: str, raw: str) -> TreeNode | None:
    """Parse one markdown file into a heading tree with paragraph leaf sections.

    Headings nest by level (a stack). Prose under a heading becomes paragraph leaves
    attached to that heading. Returns the file's top node (its ``#`` heading), or a
    synthesized node when the file has no heading.
    """
    lines = raw.splitlines()
    # Collect ("heading", level, title) / ("para", text) blocks in order.
    blocks: list[tuple[str, int, str]] = []
    buf: list[str] = []

    def flush_body() -> None:
        if buf:
            body = "\n".join(buf)
            for para in _split_paragraphs(body):
                blocks.append(("para", 0, para))
            buf.clear()

    for line in lines:
        m = _HEADING.match(line)
        if m:
            flush_body()
            blocks.append(("heading", len(m.group(1)), m.group(2).strip()))
        else:
            buf.append(line)
    flush_body()

    if not blocks:
        return None

    # Build the tree. A synthetic file root anchors files with no leading heading.
    root: TreeNode | None = None
    stack: list[TreeNode] = []
    h_count = 0
    p_count = 0

    def attach(node: TreeNode) -> None:
        if stack:
            stack[-1].children.append(node)

    for kind, level, content in blocks:
        if kind == "heading":
            node = TreeNode(id=f"{stem}-h{h_count}", title=content, level=level, source=source)
            h_count += 1
            # Pop deeper-or-equal headings so this one nests correctly.
            while stack and stack[-1].level >= level:
                stack.pop()
            if root is None:
                root = node
            else:
                attach(node)
            stack.append(node)
        else:  # paragraph leaf
            if root is None:
                # File opened with prose before any heading — synthesize a root.
                root = TreeNode(id=f"{stem}-h0", title=stem, level=1, source=source)
                h_count = 1
                stack.append(root)
            para = TreeNode(
                id=f"{stem}-p{p_count}",
                title=_label(content),
                level=(stack[-1].level + 1 if stack else 2),
                source=source,
                text=content,
            )
            p_count += 1
            attach(para)
    return root


@lru_cache(maxsize=1)
def build_tree() -> TreeNode:
    """Build (and cache) the corpus document tree — the PageIndex 'index'.

    Deterministic: files are read in sorted order and parsed into heading/paragraph
    nodes. Cached for the process lifetime (the corpus is static, like the Chroma
    index); a corpus change needs a restart.
    """
    corpus = get_settings().corpus_path
    root = TreeNode(id="root", title="Knowledge base", level=0, source="")
    if not corpus.exists():
        return root
    for path in sorted(corpus.glob("*.md")):
        node = _parse_file(path.stem, path.name, path.read_text(encoding="utf-8"))
        if node is not None:
            root.children.append(node)
    return root


def flatten(node: TreeNode) -> list[TreeNode]:
    """All descendant nodes (depth-first), excluding the synthetic root."""
    out: list[TreeNode] = []

    def walk(n: TreeNode) -> None:
        for child in n.children:
            out.append(child)
            walk(child)

    walk(node)
    return out


def _by_id(node: TreeNode) -> dict[str, TreeNode]:
    return {n.id: n for n in flatten(node)}


def outline(node: TreeNode) -> str:
    """A compact, indented outline of the tree the model navigates (ids + labels)."""
    lines: list[str] = []

    def walk(n: TreeNode, depth: int) -> None:
        for child in n.children:
            indent = "  " * depth
            tag = f"[{child.id}]"
            label = child.title
            if child.text:
                lines.append(f"{indent}{tag} {label} — {_snippet(child.text, 100)}")
            else:
                lines.append(f"{indent}{tag} {label}")
            walk(child, depth + 1)

    walk(node, 0)
    return "\n".join(lines)


# --- Navigation (the single reasoning LLM call) ------------------------------------


_NAV_SYSTEM = (
    "You are a retrieval navigator. You are given a table of contents (a tree of "
    "document sections, each tagged with an [id]) and a user question. Choose the "
    "section id(s) whose text best answers the question — reason about the structure, "
    "do not guess. Prefer leaf sections (the ones with text). Return STRICT JSON: "
    '{"selected": ["id", ...], "reasoning": "one short sentence"}. Select 1–3 ids.'
)


def _parse_selection(content: str, valid_ids: set[str]) -> tuple[list[str], str]:
    """Parse the model's JSON selection defensively; keep only ids that exist."""
    try:
        # Tolerate code fences / stray prose around the JSON object.
        match = re.search(r"\{.*\}", content, re.DOTALL)
        payload = json.loads(match.group(0) if match else content)
        selected = [s for s in payload.get("selected", []) if s in valid_ids]
        reasoning = str(payload.get("reasoning", "")).strip()
    except (json.JSONDecodeError, AttributeError, TypeError):
        selected, reasoning = [], ""
    return selected, reasoning


async def _navigate(query: str, tree: TreeNode) -> tuple[list[str], str]:
    """One structured LLM call: pick relevant node id(s) from the tree outline."""
    from langchain_openai import ChatOpenAI

    settings = get_settings()
    client = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openai_api_key,
        temperature=0,
    )
    prompt = f"Question: {query}\n\nTable of contents:\n{outline(tree)}"
    resp = await client.ainvoke(
        [("system", _NAV_SYSTEM), ("human", prompt)],
    )
    content = resp.content if isinstance(resp.content, str) else str(resp.content)
    leaves = {n.id for n in flatten(tree)}
    selected, reasoning = _parse_selection(content, leaves)
    if not selected:
        # Fallback: never come back empty — pick the first leaf section so the path
        # still grounds (mirrors the vector retriever always returning its closest hit).
        first_leaf = next((n.id for n in flatten(tree) if n.text), "")
        selected = [first_leaf] if first_leaf else []
        reasoning = reasoning or "fallback: no explicit match, picked the first section"
    return selected, reasoning


def _to_chunk(node: TreeNode, rank: int) -> dict[str, Any]:
    """Normalize a selected node into the chunk dict the UI/citations consume."""
    return {
        "text": node.text,
        "source": node.source,
        "title": node.title,
        "node_id": node.id,
        "rank": rank,
        # PageIndex has no similarity score — grounding is by reasoning, not distance.
        "score": 1.0,
        "uploaded": False,
    }


async def pageindex_retrieve(
    query: str,
    emitter: TraceEmitter,
    session_id: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Reasoning-based retrieval: build/load the tree, navigate it, select sections.

    Emits ``pageindex.tree`` → ``pageindex.navigate`` → ``pageindex.select`` and
    returns ``(context, chunks)`` — the grounding context the model answers from when
    RAGLESS is active (no embeddings involved).
    """
    async with emitter.stage(Stage.PAGEINDEX_TREE, "Building the document tree") as rec:
        tree = build_tree()
        all_nodes = flatten(tree)
        rec.data = {
            "tree": tree.to_dict(),
            "nodes": len(all_nodes),
            "files": len(tree.children),
            "leaves": sum(1 for n in all_nodes if n.text),
        }
        rec.metrics["nodes"] = float(len(all_nodes))

    async with emitter.stage(Stage.PAGEINDEX_NAVIGATE, "Navigating by reasoning") as rec:
        selected_ids, reasoning = await _navigate(query, tree)
        rec.data = {
            "model": get_settings().llm_model,
            "query": query,
            "reasoning": reasoning,
            "selected": selected_ids,
        }

    nodes = _by_id(tree)
    selected_nodes = [nodes[i] for i in selected_ids if i in nodes]
    chunks = [_to_chunk(n, rank) for rank, n in enumerate(selected_nodes, start=1)]

    async with emitter.stage(Stage.PAGEINDEX_SELECT, "Selecting sections") as rec:
        rec.data = {
            "chunks": chunks,
            "count": len(chunks),
            "reasoning": reasoning,
        }
        if chunks:
            rec.metrics["selected"] = float(len(chunks))

    context = "\n\n".join(f"[{c['source']}] {c['text']}" for c in chunks)
    return context, chunks
