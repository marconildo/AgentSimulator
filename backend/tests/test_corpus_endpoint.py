"""``GET /api/corpus`` (042-agent-anatomy) — list the shipped corpus files
so the Agent Anatomy dialog can render the Knowledge Base "Corpus" subsection
without inventing what's in it.

The endpoint is read-only metadata only: filename, size, and a whitespace-
collapsed preview of the first 240 chars. Files are sorted by filename.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


@pytest.fixture
def temp_corpus(tmp_path: Path, monkeypatch):
    """Override the corpus dir with a throwaway directory."""
    # ``Settings`` caches via ``lru_cache``; clear it so the override is read.
    monkeypatch.setenv("CORPUS_DIR", str(tmp_path))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()


def test_corpus_endpoint_lists_md_files(temp_corpus: Path):
    """AC7 — every ``*.md`` in the corpus dir is returned with filename,
    size, and a non-empty preview."""
    (temp_corpus / "alpha.md").write_text(
        textwrap.dedent(
            """
            # Alpha
            This is the alpha corpus entry. It explains things.
            """
        ).strip()
    )
    (temp_corpus / "beta.md").write_text("# Beta\nShort one.")

    with TestClient(app) as client:
        body = client.get("/api/corpus").json()

    assert isinstance(body["files"], list)
    by_name = {row["filename"]: row for row in body["files"]}
    assert set(by_name) == {"alpha.md", "beta.md"}
    for row in body["files"]:
        assert isinstance(row["size_bytes"], int) and row["size_bytes"] > 0
        # Preview is non-empty and whitespace-collapsed (no double newlines).
        assert row["preview"].strip()
        assert "\n\n" not in row["preview"]
    # The preview captures the first words.
    assert "Alpha" in by_name["alpha.md"]["preview"]


def test_corpus_endpoint_sorts_by_filename(temp_corpus: Path):
    """File order is deterministic (sorted) so the FE rows are stable."""
    for name in ("zeta.md", "alpha.md", "mu.md"):
        (temp_corpus / name).write_text(f"# {name}\nhello")

    with TestClient(app) as client:
        body = client.get("/api/corpus").json()

    names = [row["filename"] for row in body["files"]]
    assert names == sorted(names)


def test_corpus_endpoint_caps_preview_length(temp_corpus: Path):
    """Preview is bounded — long files don't blow up the JSON."""
    (temp_corpus / "long.md").write_text("x" * 1000)

    with TestClient(app) as client:
        body = client.get("/api/corpus").json()

    assert len(body["files"][0]["preview"]) <= 240


def test_corpus_endpoint_ignores_non_markdown(temp_corpus: Path):
    """Only ``*.md`` files are listed; other files are silently skipped."""
    (temp_corpus / "real.md").write_text("# Real\nhello")
    (temp_corpus / "ignored.txt").write_text("text")
    (temp_corpus / "config.json").write_text("{}")

    with TestClient(app) as client:
        body = client.get("/api/corpus").json()

    assert [row["filename"] for row in body["files"]] == ["real.md"]
