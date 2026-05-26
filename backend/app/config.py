"""Application configuration.

Loads settings from environment / `.env`. The app runs **only** against OpenAI
and requires an `OPENAI_API_KEY`; there is no offline/mock mode. When the key is
missing, the provider/embedding factories fail fast with :class:`MissingAPIKeyError`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parent of the `app` package).
BACKEND_DIR = Path(__file__).resolve().parent.parent


class MissingAPIKeyError(RuntimeError):
    """Raised when an OpenAI-backed component is used without an API key.

    The app is OpenAI-only: rather than silently starting in a mock/fallback
    mode, the provider and embedding factories raise this so the failure is
    clear and names the variable to set.
    """

    def __init__(self) -> None:
        super().__init__(
            "OPENAI_API_KEY is required — this app runs only against OpenAI and has "
            "no offline/demo mode. Set OPENAI_API_KEY in backend/.env (or the "
            "environment) and restart."
        )


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM / embeddings ---
    openai_api_key: str = ""
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
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key.strip())

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
