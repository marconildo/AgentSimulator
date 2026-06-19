"""AC1 [offline] — OpenAI is required; with no key the app fails fast.

These tests run *without* a key (they force an empty one), so they are part of
the keyless guard suite. `get_provider()` / `get_embeddings()` must raise a
clear, typed error that names the missing environment variable rather than
silently starting in a mock/fallback mode.
"""

import pytest

import app.config as config_mod
from app.config import MissingAPIKeyError, Settings
from app.db.store import get_store
from app.llm import provider as provider_mod
from app.rag import embeddings as embeddings_mod


def _keyless() -> Settings:
    # Explicit init arg wins over both the OS env var and the .env file, so this
    # is empty even when CI sets OPENAI_API_KEY as a real secret.
    return Settings(openai_api_key="", _env_file=None)


def _force_keyless(monkeypatch):
    # 078-openai-key-ui: "no key" now means no DB key AND no env key. Patch the
    # config-level get_settings (which `effective_openai_key` reads) and clear any
    # UI-saved DB key so the fail-fast guard genuinely has nothing to fall back on.
    # 075-ollama-embeddings: `embeddings.py` no longer imports `get_settings`
    # (it resolves via the config-level `effective_*` helpers), so patching the
    # config-level one is what makes both the provider AND embeddings keyless.
    monkeypatch.setattr(config_mod, "get_settings", _keyless)
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    # Embeddings must resolve to the OpenAI provider for the keyless guard to fire;
    # clear any leftover DB embedding provider so it doesn't pick Ollama.
    get_store()._set_config_sync("openai_api_key", "")
    get_store()._set_config_sync("embedding_provider", "")
    get_store()._set_config_sync("embedding_model", "")


def test_get_provider_without_key_raises_typed_error(monkeypatch):
    _force_keyless(monkeypatch)
    with pytest.raises(MissingAPIKeyError) as exc:
        provider_mod.get_provider()
    assert "OPENAI_API_KEY" in str(exc.value)


def test_get_embeddings_without_key_raises_typed_error(monkeypatch):
    _force_keyless(monkeypatch)
    with pytest.raises(MissingAPIKeyError) as exc:
        embeddings_mod.get_embeddings()
    assert "OPENAI_API_KEY" in str(exc.value)
