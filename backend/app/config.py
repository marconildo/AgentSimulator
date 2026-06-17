"""Application configuration.

Loads settings from environment / `.env`. The app runs **only** against OpenAI
and requires an `OPENAI_API_KEY`; there is no offline/mock mode. When the key is
missing, the provider/embedding factories fail fast with :class:`MissingAPIKeyError`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parent of the `app` package).
BACKEND_DIR = Path(__file__).resolve().parent.parent

# The single `.env` both pydantic-settings and `load_env_file` read.
ENV_FILE = BACKEND_DIR / ".env"


def load_env_file(path: Path = ENV_FILE) -> None:
    """Bridge the whole `.env` into ``os.environ``.

    :class:`Settings` only maps the keys it declares; every other key in the
    file falls under ``extra="ignore"`` and never reaches ``os.environ``.
    Libraries that read the environment directly — notably LangSmith tracing
    (``LANGSMITH_TRACING`` / ``LANGSMITH_API_KEY`` / ``LANGSMITH_PROJECT``) —
    would then never see values placed in `backend/.env`. Loading the file here
    makes them visible while preserving precedence: ``override=False`` keeps any
    variable already present in the real environment (env > .env), matching how
    pydantic-settings resolves the same keys. A missing file is a no-op.
    """
    load_dotenv(path, override=False)


# Load eagerly on import so anything reading ``os.environ`` (LangSmith's tracer
# included) sees `.env` before the agent graph is built or the first run starts.
load_env_file()


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
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- LLM / embeddings ---
    openai_api_key: str = ""
    llm_model: str = "gpt-4.1-mini"
    embedding_model: str = "text-embedding-3-small"

    # --- Web search (052-web-search-tool) ---
    # Optional. Enables the `web_search` MCP tool (real Tavily search). Unlike
    # OPENAI_API_KEY this is NOT required: with no key the tool returns an honest
    # error string and the rest of the app runs unchanged.
    tavily_api_key: str = ""

    # --- RAG ---
    rag_top_k: int = 4
    chroma_dir: str = "app/data/chroma"
    corpus_dir: str = "app/data/corpus"

    # --- Reranker (054-rag-block-expansion) ---
    # The Intermediate rung re-scores a wider candidate pool with a local FlashRank
    # cross-encoder (ONNX, no torch, no API key) before trimming to top-k. The model
    # is downloaded once into `rerank_cache_dir` and cached process-wide; pre-bake it
    # into the image so runtime/CI never fetch it. `rerank_fetch_k` is the wider pool
    # the reranker sees (must exceed `rag_top_k` for reranking to add value).
    rerank_model: str = "ms-marco-MiniLM-L-12-v2"
    rerank_cache_dir: str = "app/data/flashrank"
    rerank_fetch_k: int = 10
    # 055-rerank-score-threshold: the default minimum rerank score. Ships ON at 0.05 so
    # near-zero-score chunks (e.g. an off-topic greeting that matches nothing) are dropped
    # from the grounding context by default — precision over recall on the Intermediate
    # rung. 0 = no filter (the 054 behavior). The UI slider overrides it per conversation.
    rerank_threshold_default: float = 0.05

    # --- Application database (relational system of record) ---
    app_db_path: str = "app/data/app.sqlite3"

    # --- Object storage (034-storage-ingestion-flow) ---
    # Durable store uploaded documents land in before the indexer reads them. A
    # local filesystem stand-in for Blob/S3 (a mounted Docker volume, like chroma).
    storage_dir: str = "app/data/storage"

    # --- HTTP ---
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def has_openai_key(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def has_tavily_key(self) -> bool:
        return bool(self.tavily_api_key.strip())

    @property
    def chroma_path(self) -> Path:
        return self._abs(self.chroma_dir)

    @property
    def app_db_path_abs(self) -> Path:
        return self._abs(self.app_db_path)

    @property
    def storage_path(self) -> Path:
        return self._abs(self.storage_dir)

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
