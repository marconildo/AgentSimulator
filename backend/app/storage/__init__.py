"""Object storage (034-storage-ingestion-flow).

A real, durable store that uploaded documents land in *before* the indexer
reads them back to chunk/embed/store. Locally it is plain filesystem I/O — a
stand-in for managed object storage (Azure Blob / Amazon S3 / Cloud Storage),
exactly as the SQLite ``ConversationStore`` stands in for a managed SQL service
and Chroma for a managed vector database.
"""
