"""AC1 [offline] — OpenAI is required; with no key the app fails fast.

These tests run *without* a key (they force an empty one), so they are part of
the keyless guard suite. `get_provider()` / `get_embeddings()` must raise a
clear, typed error that names the missing environment variable rather than
silently starting in a mock/fallback mode.
"""

import pytest

from app.config import MissingAPIKeyError, Settings
from app.llm import provider as provider_mod
from app.rag import embeddings as embeddings_mod


def _keyless() -> Settings:
    # Explicit init arg wins over both the OS env var and the .env file, so this
    # is empty even when CI sets OPENAI_API_KEY as a real secret.
    return Settings(openai_api_key="", _env_file=None)


def test_get_provider_without_key_raises_typed_error(monkeypatch):
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    with pytest.raises(MissingAPIKeyError) as exc:
        provider_mod.get_provider()
    assert "OPENAI_API_KEY" in str(exc.value)


def test_get_embeddings_without_key_raises_typed_error(monkeypatch):
    monkeypatch.setattr(embeddings_mod, "get_settings", _keyless)
    with pytest.raises(MissingAPIKeyError) as exc:
        embeddings_mod.get_embeddings()
    assert "OPENAI_API_KEY" in str(exc.value)
