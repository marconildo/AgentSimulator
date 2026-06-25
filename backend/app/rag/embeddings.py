"""Embedding model.

Embeddings come from the configured **embedding provider** (075-ollama-embeddings):
OpenAI by default (needs a key — UI/DB or env, 078) or a local **Ollama** model
(no key needed). The choice is instance-global because one Chroma collection has
one vector dimension. With OpenAI selected and no effective key, :func:`get_embeddings`
fails fast with :class:`MissingAPIKeyError` rather than falling back to a mock.
"""

from __future__ import annotations

from langchain_core.embeddings import Embeddings

from ..config import (
    MissingAPIKeyError,
    effective_embedding_model,
    effective_embedding_provider,
    effective_ollama_base_url,
    effective_openai_key,
)


def get_embeddings() -> Embeddings:
    provider = effective_embedding_provider()
    model = effective_embedding_model()

    # 075-ollama-embeddings: a local embedding model — no OpenAI key required.
    if provider == "ollama":
        from langchain_ollama import OllamaEmbeddings

        return OllamaEmbeddings(model=model, base_url=effective_ollama_base_url())

    # 094-vertex-ai-embeddings: Google Vertex AI embeddings — no OpenAI key required.
    if provider == "vertexai":
        import json

        from langchain_google_vertexai import VertexAIEmbeddings

        from ..config import (
            MissingVertexAICredentialsError,
            effective_vertexai_credentials,
            effective_vertexai_location,
            effective_vertexai_project,
        )

        project = effective_vertexai_project()
        location = effective_vertexai_location()
        if not location:
            location = "global"
        creds_json = effective_vertexai_credentials()

        if not creds_json:
            raise MissingVertexAICredentialsError()

        gcp_creds = None
        try:
            import google.auth

            creds_data = json.loads(creds_json)
            gcp_creds, _ = google.auth.load_credentials_from_dict(
                creds_data,
                scopes=["https://www.googleapis.com/auth/cloud-platform"],
            )
        except Exception:
            pass

        class PatchedVertexAIEmbeddings(VertexAIEmbeddings):
            def embed_documents(
                self,
                texts: list[str],
                *,
                embeddings_task_type="RETRIEVAL_DOCUMENT",
            ) -> list[list[float]]:
                if not texts:
                    return []
                from concurrent.futures import ThreadPoolExecutor

                def _embed_one(t: str) -> list[float]:
                    return self.embed([t], embeddings_task_type, dimensions=self.dimensions)[0]

                with ThreadPoolExecutor(max_workers=8) as executor:
                    return list(executor.map(_embed_one, texts))

        PatchedVertexAIEmbeddings.__name__ = "VertexAIEmbeddings"

        return PatchedVertexAIEmbeddings(
            model_name=model,
            project=project or None,
            location=location or None,
            credentials=gcp_creds,
            dimensions=1536,
        )

    # 078-openai-key-ui: the key may come from the UI/DB (DB precedes env).
    key = effective_openai_key()
    if not key:
        raise MissingAPIKeyError()
    from langchain_openai import OpenAIEmbeddings

    return OpenAIEmbeddings(model=model, api_key=key)


def embedding_model_name() -> str:
    return effective_embedding_model()
