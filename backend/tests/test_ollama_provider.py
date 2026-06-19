"""074-ollama-provider — the Ollama provider factory + real-run integration.

The keyless tests assert the **routing** in ``get_provider``: choosing the Ollama
provider must NOT require an ``OPENAI_API_KEY`` (constitution §2, amended by 074),
while the OpenAI path still fails fast without a key. They run without any key.

``test_real_ollama_run`` is marked ``@pytest.mark.ollama`` and is skipped unless a
local Ollama server is configured (env ``OLLAMA_TEST_SERVER`` / ``OLLAMA_TEST_MODEL``),
mirroring the ``tavily`` marker pattern — CI has no Ollama, so it skips there.
"""

import os

import pytest

from app.config import MissingAPIKeyError, Settings
from app.llm import provider as provider_mod


def _keyless() -> Settings:
    # Empty key wins over the OS env var and .env, so this stays keyless in CI.
    return Settings(openai_api_key="", _env_file=None)


def test_get_provider_ollama_does_not_require_openai_key(monkeypatch):
    # AC2 — an Ollama-bound run needs no OpenAI key; the factory returns a real
    # provider named "ollama" instead of raising MissingAPIKeyError.
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    p = provider_mod.get_provider(
        provider="ollama", model="llama3.1", base_url="http://localhost:11434"
    )
    assert p.name == "ollama"
    assert p.model_name == "llama3.1"


def test_get_provider_openai_still_fails_fast_without_key(monkeypatch):
    # AC2 (regression) — the default/OpenAI path is unchanged: no key ⇒ typed error.
    monkeypatch.setattr(provider_mod, "get_settings", _keyless)
    with pytest.raises(MissingAPIKeyError):
        provider_mod.get_provider()
    with pytest.raises(MissingAPIKeyError):
        provider_mod.get_provider(provider="openai", model="gpt-4.1-mini")


@pytest.mark.ollama
async def test_real_ollama_run():
    # AC7 — a real Ollama call streams a non-empty answer over the canonical thread.
    from langchain_core.messages import HumanMessage

    server = os.environ["OLLAMA_TEST_SERVER"]
    model = os.environ["OLLAMA_TEST_MODEL"]
    p = provider_mod.get_provider(provider="ollama", model=model, base_url=server)
    chunks = []
    async for tok in p.stream_answer(
        system="You are a helpful assistant. Answer in one short sentence.",
        thread=[HumanMessage(content="Say hello.")],
    ):
        chunks.append(tok)
    assert "".join(chunks).strip()
