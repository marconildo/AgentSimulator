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

## [1.1.0] - 2026-06-24

This release adds a **real network edge** (the production ingress chain an agent
request crosses, as actual Docker containers) and a **third LLM provider, Google
Vertex AI**.

> **Heads up:** the network edge runs as containers — bring it up with
> `docker compose up`. Local dev (uvicorn + `npm run dev`) talks to the backend
> directly and does not exercise the chain.

### Added

- **Real network edge / ingress chain** — the front door a request crosses before
  the backend, as **real Docker containers**, not a diagram: **DNS** (CoreDNS) ·
  **CDN/cache** (Varnish) · **TLS/Load balancer** (HAProxy, single TLS-1.3
  termination) · **WAF** (OWASP Core Rule Set on ModSecurity) · **API gateway**
  (Kong, with real rate limiting). Each appliance reports real evidence —
  forwarded headers, cache HIT/BYPASS, LB pool/algorithm, WAF paranoia level +
  anomaly threshold, gateway route + rate-limit policy — surfaced in the
  `frontend→backend` hop detail and in per-appliance "open full view" drill-ins.
- **WAF block visualization** — a request blocked by the WAF (an OWASP CRS rule
  match → 403) is shown honestly: the path lights up to the WAF, the station goes
  *blocked*, a 403 badge appears, and the drill-in explains **why** (the matched
  rule), with a bilingual chat note.
- **Google Vertex AI provider** (PR [#4](https://github.com/reginaldosilva27/AgentSimulator/pull/4),
  by new contributor [@elizeureisl](https://github.com/elizeureisl)) — a real,
  opt-in third LLM provider alongside OpenAI and Ollama. Bind an agent to Vertex
  AI, configure the GCP project/location and a service-account key (persisted,
  masked on read, with a step-by-step help tooltip), pick a curated **Gemini**
  model, and run the agentic loop against real Gemini — **no OpenAI key required**
  for that run. "Save & test" validates the credentials with a live call. Amends
  constitution §2 (now OpenAI + Ollama + Vertex AI). Bilingual EN/PT throughout.
- **Chunk overlap highlighting** — the chunk full-text view highlights the carried
  overlap prefix; the recursive chunker now sub-splits oversized paragraphs.
- **Playwright integration tests** — browser E2E driving the live Docker stack
  through the network chain (manual `integration.yml` workflow).

### Fixed

- **WAF blocked the app's own REST calls** — the OWASP CRS default
  `allowed_methods` (`GET HEAD POST OPTIONS`) returned a 403 for `PATCH` / `PUT` /
  `DELETE`, breaking agent rename, provider switch, settings save and agent delete
  *through the chain*. The WAF now allows those verbs (`ALLOWED_METHODS`).

### Security

- **Scoped WAF exclusion for secret-carrying settings endpoints** — `/api/settings/*`
  legitimately carry opaque secrets (the service-account JSON private key, API
  keys) whose field names trip the CRS LFI rule family (e.g. the `credentials`
  field matched rule `930120`, alone exceeding the anomaly threshold → 403). A
  **narrow, path-scoped** exclusion drops only those LFI rules on those endpoints;
  the rest of the API keeps full CRS coverage and real attacks stay blocked.

## [1.0.1] - 2026-06-22

### Added

- Table of contents (📑) to `README.md` and `README.pt-BR.md` for quick navigation.
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

[Unreleased]: https://github.com/reginaldosilva27/AgentSimulator/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/reginaldosilva27/AgentSimulator/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/reginaldosilva27/AgentSimulator/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/reginaldosilva27/AgentSimulator/releases/tag/v1.0.0
