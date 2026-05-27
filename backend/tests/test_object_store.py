"""Object storage — the real durable store uploaded files land in before the
indexer reads them (034-storage-ingestion-flow).

A filesystem stand-in for Blob/S3 (just as SQLite stands in for managed SQL and
Chroma for a managed vector DB). All keyless — plain file I/O, no OpenAI.
"""

import uuid

import pytest

from app.storage.object_store import (
    clear_objects,
    delete_object,
    delete_session_objects,
    get_object,
    object_key,
    put_object,
    storage_root,
)


def test_put_then_get_roundtrips_bytes():
    # AC3 — what is written is read back byte-identical, under a real file.
    key = object_key(f"sess-{uuid.uuid4().hex}", uuid.uuid4().hex, "doc.pdf")
    data = b"%PDF-1.4 hello storage \x00\x01\x02"
    uri = put_object(key, data, content_type="application/pdf")

    assert uri.startswith("file://")
    assert (storage_root() / key).is_file()
    assert get_object(key) == data


def test_delete_object_removes_one_and_reports():
    key = object_key(f"sess-{uuid.uuid4().hex}", uuid.uuid4().hex, "x.pdf")
    put_object(key, b"bytes")
    assert delete_object(key) is True
    assert (storage_root() / key).exists() is False
    # A second delete is a no-op (idempotent), reported as False.
    assert delete_object(key) is False
    with pytest.raises(FileNotFoundError):
        get_object(key)


def test_delete_session_objects_removes_only_that_session():
    sid = f"sess-{uuid.uuid4().hex}"
    other = f"sess-{uuid.uuid4().hex}"
    put_object(object_key(sid, "d1", "a.pdf"), b"a")
    put_object(object_key(sid, "d2", "b.pdf"), b"b")
    put_object(object_key(other, "d3", "c.pdf"), b"c")

    removed = delete_session_objects(sid)

    assert removed == 2
    assert get_object(object_key(other, "d3", "c.pdf")) == b"c"  # untouched
    delete_session_objects(other)  # cleanup


def test_clear_objects_wipes_everything_and_is_idempotent():
    clear_objects()  # start from empty
    put_object(object_key("s1", "d1", "a.pdf"), b"a")
    put_object(object_key("s2", "d2", "b.pdf"), b"b")

    assert clear_objects() == 2
    assert clear_objects() == 0  # idempotent, no error


def test_object_key_has_no_path_traversal():
    # Keys are sanitized so a crafted filename can't escape the storage root.
    key = object_key("../../etc", "..", "../passwd")
    target = (storage_root() / key).resolve()
    assert str(target).startswith(str(storage_root().resolve()))
