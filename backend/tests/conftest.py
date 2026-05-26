"""Test configuration: force demo mode and a temporary vector index.

All tests run fully offline (mock LLM + mock embeddings), so CI needs no keys.
"""

import os

os.environ["DEMO_MODE"] = "true"


def pytest_configure(config):
    # Build a fresh index once before the test session.
    from app.config import get_settings
    from app.rag.ingest import build_index

    get_settings.cache_clear()
    build_index()
