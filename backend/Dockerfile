FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal; chromadb ships prebuilt wheels.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# The app builds the vector index on first boot (only if empty) via its
# startup hook, so the persisted volume is reused across restarts.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
