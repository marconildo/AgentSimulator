"""Test configuration: force demo mode and isolate generated data.

All tests run fully offline (mock LLM + mock embeddings), so CI needs no keys.
The application database is pointed at a throwaway file so test runs never
touch a developer's local data.
"""

import os
import tempfile
from pathlib import Path

os.environ["DEMO_MODE"] = "true"
os.environ["APP_DB_PATH"] = str(Path(tempfile.gettempdir()) / "agentsim_test.sqlite3")


def pytest_configure(config):
    # Build a fresh index once before the test session.
    from app.config import get_settings
    from app.db.store import get_store
    from app.rag.ingest import build_index

    get_settings.cache_clear()
    get_store.cache_clear()
    db_path = get_settings().app_db_path_abs
    if db_path.exists():
        db_path.unlink()
    build_index()
