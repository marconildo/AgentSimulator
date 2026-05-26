"""AC2 / AC3 [offline] — demo mode is gone from the codebase.

No `demo_mode`/`is_demo` on Settings, no `MockProvider`/`MockEmbeddings`, and the
`DEMO_MODE` env / demo symbols no longer appear anywhere under `app/`. These run
without a key.
"""

import importlib
from pathlib import Path

import pytest

import app.rag.embeddings as embeddings_mod
from app.config import Settings

APP_DIR = Path(__file__).resolve().parent.parent / "app"
# Symbols that must not survive anywhere in the backend source.
FORBIDDEN = ("demo_mode", "is_demo", "DEMO_MODE", "MockProvider", "MockEmbeddings")


def test_settings_has_no_demo_attributes():
    s = Settings(openai_api_key="x", _env_file=None)
    assert not hasattr(s, "demo_mode")
    assert not hasattr(s, "is_demo")
    assert "demo_mode" not in Settings.model_fields


def test_mock_provider_module_is_gone():
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("app.llm.mock_provider")


def test_mock_embeddings_symbol_is_gone():
    assert not hasattr(embeddings_mod, "MockEmbeddings")


def test_no_demo_symbols_left_in_backend_source():
    offenders: list[str] = []
    for path in APP_DIR.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for token in FORBIDDEN:
            if token in text:
                offenders.append(f"{path.relative_to(APP_DIR)} contains {token!r}")
    assert not offenders, "demo references still present:\n" + "\n".join(offenders)
