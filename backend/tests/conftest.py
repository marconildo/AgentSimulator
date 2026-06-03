"""Test configuration: isolate generated data and gate the OpenAI-backed suite.

The app is OpenAI-only. Tests that exercise the model or embeddings are marked
``@pytest.mark.openai`` and are skipped when no ``OPENAI_API_KEY`` is configured;
the keyless guard tests (AC1–AC4) always run. The application database and the
vector store are pointed at throwaway temp paths so test runs never touch a
developer's local data.
"""

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.gettempdir())
os.environ["APP_DB_PATH"] = str(_TMP / "agentsim_test.sqlite3")
os.environ["CHROMA_DIR"] = str(_TMP / "agentsim_test_chroma")
os.environ["STORAGE_DIR"] = str(_TMP / "agentsim_test_storage")


def _has_openai_key() -> bool:
    from app.config import get_settings

    return get_settings().has_openai_key


def _has_tavily_key() -> bool:
    from app.config import get_settings

    return get_settings().has_tavily_key


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "openai: test needs a real OPENAI_API_KEY (skipped without one)"
    )
    config.addinivalue_line(
        "markers", "tavily: test needs a real TAVILY_API_KEY (skipped without one)"
    )

    from app.config import get_settings
    from app.db.store import get_store

    get_settings.cache_clear()
    get_store.cache_clear()
    db_path = get_settings().app_db_path_abs
    if db_path.exists():
        db_path.unlink()

    # Build a fresh vector index once per session — but only when we can reach
    # OpenAI embeddings. Without a key the index build is skipped and the
    # [openai] suite is skipped too (see pytest_collection_modifyitems).
    if get_settings().has_openai_key:
        from app.rag.ingest import build_index
        from app.rag.store import get_vectorstore, reset_vectorstore_cache

        reset_vectorstore_cache()
        # build_index only clears corpus vectors (it must preserve user uploads in
        # production); for a hermetic test run, fully reset the throwaway
        # collection first so uploaded vectors from a prior run don't linger.
        try:
            get_vectorstore().reset_collection()
        except Exception:  # noqa: BLE001 - empty/new collection is fine
            pass
        build_index()


def pytest_collection_modifyitems(config, items):
    has_openai = _has_openai_key()
    has_tavily = _has_tavily_key()
    skip_openai = pytest.mark.skip(reason="needs OPENAI_API_KEY (OpenAI-only app)")
    skip_tavily = pytest.mark.skip(reason="needs TAVILY_API_KEY (optional web search)")
    for item in items:
        if not has_openai and "openai" in item.keywords:
            item.add_marker(skip_openai)
        if not has_tavily and "tavily" in item.keywords:
            item.add_marker(skip_tavily)
