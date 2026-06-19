"""071-retrieval-metrics: ``/api/config`` advertises the benchmark queries (AC6).

The frontend renders these as one-click chips so a learner can fire a labelled query and watch
the retrieval metrics light up — without hardcoding the golden set client-side.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.rag.metrics import load_golden


def test_config_advertises_benchmark_queries():
    with TestClient(app) as client:
        body = client.get("/api/config").json()
    benchmarks = body["benchmark_queries"]
    assert len(benchmarks) == len(load_golden())
    assert all({"id", "query"} == set(b) for b in benchmarks)
    assert all(b["query"].strip() for b in benchmarks)
