"""Filesystem object store — the real durable store for uploaded documents.

The upload write-path (034-storage-ingestion-flow) persists each PDF here first;
the indexer then reads it back to chunk/embed/store. Keys are
``<session_id>/<document_id>/<filename>``, every segment sanitized so a crafted
filename can never escape the storage root. Everything is plain, real file I/O
(no API key) — the local stand-in for managed object storage.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path

from ..config import get_settings

# Keep keys filesystem-friendly and traversal-proof: collapse each segment to its
# last path component and allow only a safe character class.
_SAFE = re.compile(r"[^A-Za-z0-9._-]")


def storage_root() -> Path:
    """The object-store root (created on first use). Read from settings each call
    so test overrides (a throwaway temp dir) and env config take effect."""
    root = get_settings().storage_path
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe(segment: str) -> str:
    name = segment.replace("\\", "/").split("/")[-1].strip()
    if name in ("", ".", ".."):
        name = "_"
    return _SAFE.sub("_", name)


def object_key(session_id: str, document_id: str, filename: str) -> str:
    """The storage key for one uploaded document — each segment sanitized."""
    return "/".join((_safe(session_id), _safe(document_id), _safe(filename)))


def _path_for(key: str) -> Path:
    return storage_root() / key


def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Write ``data`` under ``key`` and return its ``file://`` URI. ``content_type``
    is accepted for API parity (and surfaced in the trace) but needs no sidecar."""
    path = _path_for(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path.resolve().as_uri()


def get_object(key: str) -> bytes:
    """Read the object's bytes; raises ``FileNotFoundError`` if it is gone."""
    return _path_for(key).read_bytes()


def delete_object(key: str) -> bool:
    """Delete one object; ``True`` if it existed, ``False`` if already gone."""
    path = _path_for(key)
    if path.is_file():
        path.unlink()
        return True
    return False


def delete_document_objects(session_id: str, document_id: str) -> int:
    """Delete every object stored for one document; returns how many files removed.

    Keys are ``<session>/<document>/<filename>``, so one document owns a single
    sub-directory — removing it drops exactly that document's objects."""
    doc_dir = storage_root() / _safe(session_id) / _safe(document_id)
    if not doc_dir.is_dir():
        return 0
    count = sum(1 for p in doc_dir.rglob("*") if p.is_file())
    shutil.rmtree(doc_dir)
    return count


def delete_session_objects(session_id: str) -> int:
    """Delete every object owned by one session; returns how many files removed."""
    session_dir = storage_root() / _safe(session_id)
    if not session_dir.is_dir():
        return 0
    count = sum(1 for p in session_dir.rglob("*") if p.is_file())
    shutil.rmtree(session_dir)
    return count


def clear_objects() -> int:
    """Delete every stored object (025-clear-databases reach); returns the count.

    Idempotent — a second call over an empty store returns 0 and raises nothing.
    The root directory itself is kept so subsequent uploads need no re-create."""
    root = storage_root()
    count = sum(1 for p in root.rglob("*") if p.is_file())
    for child in root.iterdir():
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    return count
