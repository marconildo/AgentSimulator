#!/usr/bin/env python3
"""058-online-demo-mode — capture REAL traces for the backend-less showcase build.

Runs the four curated sample questions through the live backend (batch mode) for
each executing scenario (simple, intermediate, ragless, deepagents) and each language
(en, pt), saving the verbatim `TraceSummary` JSON into `frontend/src/demo/fixtures/`. Also
snapshots `/api/config`. These captures are what the GitHub Pages demo replays — they
are real runs of this pipeline (constitution §3), never hand-authored.

061-scenario-builder / 066-retrieval-strategy-radio removed the coarse `scenario`
field from `ChatRequest`; the rung behaviours are now explicit per-feature inputs.
So each demo "scenario" maps to the concrete request flags that reproduce it:
`intermediate` → `rerank: true` (cross-encoder reranker), `ragless` → `ragless: true`
(reasoning-based PageIndex retrieval).

Usage:
    # 1. start the backend with a real OPENAI_API_KEY (and a built Chroma index):
    cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8011
    # 2. in another shell:
    python scripts/capture_demo_traces.py --base http://localhost:8011

Re-run whenever the event protocol (§1) changes.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "demo" / "fixtures"

QUESTIONS = [
    ("rag", {"en": "What is RAG and how does retrieval work?", "pt": "O que é RAG e como funciona a recuperação?"}),
    ("math", {"en": "What is 12 * (3 + 1)?", "pt": "Quanto é 12 * (3 + 1)?"}),
    ("mcp", {"en": "How do MCP tools work?", "pt": "Como funcionam as ferramentas MCP?"}),
    ("time", {"en": "What time is it right now?", "pt": "Que horas são agora?"}),
]
# Each demo scenario → the request flags that make the live backend reproduce it.
SCENARIOS: dict[str, dict] = {
    "simple": {},
    "intermediate": {"rerank": True},
    "ragless": {"ragless": True},
    # The real DeepAgents runtime (planner + virtual file system + multi-search RAG), so
    # the demo replays the plan/step-trail, the local DeepAgents tool calls, and the
    # per-search "Sources used" grouping just like a live run.
    "deepagents": {"runtime": "deepagents"},
}


def _get(base: str, path: str) -> dict:
    with urllib.request.urlopen(base + path, timeout=30) as r:
        return json.load(r)


def _post(base: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        base + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:8011")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    json.dump(_get(args.base, "/api/config"), (OUT / "_config.json").open("w"), ensure_ascii=False)
    print("saved _config.json")

    for qid, langs in QUESTIONS:
        for lang, text in langs.items():
            for scenario, flags in SCENARIOS.items():
                body = {"message": text, "mode": "batch", **flags}
                t0 = time.time()
                data = _post(args.base, "/api/chat", body)
                name = f"{qid}.{scenario}.{lang}.json"
                json.dump(data, (OUT / name).open("w"), ensure_ascii=False)
                stages = {e["stage"] for e in data["events"]}
                print(f"{name:26} events={len(data['events']):3} "
                      f"rerank={'rag.rerank' in stages} "
                      f"ragless={'pageindex.select' in stages} {round(time.time() - t0, 1)}s")


if __name__ == "__main__":
    main()
