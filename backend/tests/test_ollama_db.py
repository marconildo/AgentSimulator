"""074-ollama-provider — relational store: `agents.provider` + `app_config`.

Keyless: these exercise the SQLite store directly (no model/embeddings). Cover
the new per-agent `provider` column (AC3) and the instance-config key/value
round-trip used to persist the Ollama server URL (AC5), including the additive
migration on a pre-074 database.
"""

import sqlite3
from pathlib import Path

import pytest

from app.db.store import ConversationStore


@pytest.fixture
def store(tmp_path) -> ConversationStore:
    return ConversationStore(tmp_path / "t.sqlite3")


async def test_default_agent_provider_is_openai(store):
    # AC3 — a fresh DB's seed default agent reads back provider == "openai".
    agents = await store.list_agents()
    assert agents, "seed default agent should exist"
    assert all(a["provider"] == "openai" for a in agents)


async def test_update_agent_persists_provider(store):
    # AC3 — provider is an editable field; PATCH-equivalent round-trips it.
    [default] = await store.list_agents()
    updated = await store.update_agent(default["id"], {"provider": "ollama"})
    assert updated is not None
    assert updated["provider"] == "ollama"
    # And it survives a fresh handle on the same file (real persistence).
    again = ConversationStore(store.path)
    assert (await again.get_agent(default["id"]))["provider"] == "ollama"


async def test_app_config_round_trip_and_persistence(store):
    # AC5 — set/get a config key; a new store on the same file sees it.
    assert await store.get_config("ollama_base_url") is None
    await store.set_config("ollama_base_url", "http://host.docker.internal:11434")
    assert await store.get_config("ollama_base_url") == "http://host.docker.internal:11434"
    reopened = ConversationStore(store.path)
    assert await reopened.get_config("ollama_base_url") == "http://host.docker.internal:11434"


async def test_set_config_upserts(store):
    await store.set_config("ollama_base_url", "http://a:11434")
    await store.set_config("ollama_base_url", "http://b:11434")
    assert await store.get_config("ollama_base_url") == "http://b:11434"


def test_migration_adds_provider_to_pre074_db(tmp_path):
    # AC3 — a database created before 074 (no provider column, no app_config)
    # gains both on next open, with existing rows backfilled to "openai".
    path: Path = tmp_path / "old.sqlite3"
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE agents (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            system_prompt TEXT NOT NULL, agent_prompt TEXT NOT NULL, model TEXT NOT NULL,
            enabled_tools TEXT NOT NULL DEFAULT '[]', is_default INTEGER NOT NULL DEFAULT 0,
            created_at REAL NOT NULL, updated_at REAL NOT NULL
        );
        INSERT INTO agents VALUES ('a1','Old','','g','r','gpt-4.1-mini','[]',1,0,0);
        """
    )
    # Pre-074 schema version (post-048).
    conn.execute("PRAGMA user_version = 3")
    conn.commit()
    conn.close()

    store = ConversationStore(path)
    row = store._get_agent_sync("a1")
    assert row is not None
    assert row["provider"] == "openai"
    # app_config now exists and is usable.
    store._set_config_sync("ollama_base_url", "http://x:11434")
    assert store._get_config_sync("ollama_base_url") == "http://x:11434"
