# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

<!--
Add entries here as you merge changes. When you cut a release, move them under a
new version heading and tag it (`git tag vX.Y.Z && git push origin vX.Y.Z`),
which triggers the Release workflow.

Use these categories: Added · Changed · Deprecated · Removed · Fixed · Security.
-->

### Added

- Automated GitHub Release workflow (`.github/workflows/release.yml`): pushing a
  `vX.Y.Z` tag creates a Release with an auto-generated changelog; pre-release
  tags (`-rc`, `-beta`) are flagged as pre-releases.
- This `CHANGELOG.md`.

## [1.0.0] - 2026-06-22

First tagged release. An educational visualizer of an agentic AI request
lifecycle: the backend runs a real LangGraph agent (RAG → MCP tools → LLM) and
emits every stage as a stream of trace events; the frontend animates them across
a graph of "stations" and lets you inspect the real data at each one. Runs only
against OpenAI (with an optional local Ollama provider for LLM/embeddings).

### Added

- **Real agentic pipeline** — bounded ReAct loop (`route → think ⇄ tools →
  generate → respond`) over a canonical message thread; retrieval is an
  agent-elected tool, not a hardcoded stage.
- **Event protocol as the contract** — every stage emits `TraceEvent`s streamed
  over SSE and replayable; the frontend is a pure projection of the event log.
- **RAG** — Chroma vector store with configurable chunking strategies
  (fixed/recursive/semantic/agentic), embedding, retrieval, local FlashRank
  reranking, hybrid BM25 + vector RRF fusion, and retrieval metrics
  (Precision@k / Recall@k / MRR).
- **RAGLESS / PageIndex** — alternative retrieval strategy selectable as a radio
  against Vector RAG.
- **MCP tools** — real FastMCP server (`calculator`, `current_time`, `kb_lookup`,
  `load_skill`, `web_search`) over stdio with in-process fallback.
- **Agent runtimes** — ReAct and a real DeepAgents runtime (planner + virtual
  file system + sub-agent delegation); multi-agent preview.
- **Persistence** — SQLite relational store (sessions, agents, messages,
  documents, skills, persisted trace events) alongside the vector store.
- **Shared agent catalog** — configurable agent identity, prompts, model, tools,
  and skills; shared across sessions.
- **Scenario builder** — à-la-carte architecture composition with a derived
  maturity badge (simple/intermediate/advanced).
- **Visualization** — progressive-disclosure canvas, station drill-ins,
  execution-trace span tree, context-window token budget, memory-growth view,
  timeline phases, guided tour, and failure-injection treatments.
- **Cloud overlay** — cloud-agnostic model with Azure/AWS/GCP example services.
- **i18n** — full English + Portuguese for all user-facing text.
- **Online demo** — backend-less GitHub Pages build replaying captured traces.
- **Local Ollama provider** — optional per-agent LLM and embeddings without an
  OpenAI key.

[Unreleased]: https://github.com/reginaldosilva27/AgentSimulator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/reginaldosilva27/AgentSimulator/releases/tag/v1.0.0
