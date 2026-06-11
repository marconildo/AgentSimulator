FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal; chromadb ships prebuilt wheels.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Pre-download the FlashRank reranker model (054-rag-block-expansion) into the
# configured cache dir so the first Intermediate rerank never fetches at runtime.
RUN python -c "from app.config import get_settings; from flashrank import Ranker; s = get_settings(); Ranker(model_name=s.rerank_model, cache_dir=s.rerank_cache_dir)"

EXPOSE 8000

# The app builds the vector index on first boot (only if empty) via its
# startup hook, so the persisted volume is reused across restarts.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
