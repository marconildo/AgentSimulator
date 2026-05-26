"""Application configuration.

Loads settings from environment / `.env`. The single most important decision
here is *demo mode*: when on, the app uses deterministic mock implementations
for the LLM and embeddings so the whole simulator runs with zero API keys.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parent of the `app` package).
BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM / embeddings ---
    openai_api_key: str = ""
    # Tri-state: None means "auto-detect from openai_api_key".
    demo_mode: bool | None = None
    llm_model: str = "gpt-4o-mini"
    embedding_model: str = "text-embedding-3-small"

    # --- RAG ---
    rag_top_k: int = 4
    chroma_dir: str = "app/data/chroma"
    corpus_dir: str = "app/data/corpus"

    # --- Application database (relational system of record) ---
    app_db_path: str = "app/data/app.sqlite3"

    # --- HTTP ---
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def is_demo(self) -> bool:
        """Whether to use mock LLM/embeddings.

        Explicit ``DEMO_MODE`` wins; otherwise we infer it from the presence
        of an API key (no key -> demo).
        """
        if self.demo_mode is not None:
            return self.demo_mode
        return not bool(self.openai_api_key.strip())

    @property
    def chroma_path(self) -> Path:
        return self._abs(self.chroma_dir)

    @property
    def app_db_path_abs(self) -> Path:
        return self._abs(self.app_db_path)

    @property
    def corpus_path(self) -> Path:
        return self._abs(self.corpus_dir)

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @staticmethod
    def _abs(value: str) -> Path:
        p = Path(value)
        return p if p.is_absolute() else BACKEND_DIR / p


@lru_cache
def get_settings() -> Settings:
    return Settings()
