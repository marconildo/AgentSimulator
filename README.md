<div align="center">

# 🧭 AI Agent Simulator

### Watch a chat message travel through a real AI agent — live, stage by stage.

An interactive, educational visualization of a modern **agentic AI application**: from the user's
message in the frontend, through the backend, into a **LangGraph** agent that runs a **RAG**
pipeline, calls **MCP tools**, and talks to an **LLM** — and back again. Inspired by
[Transformer Explainer](https://github.com/poloclub/transformer-explainer), but for *AI Engineering*.

[![CI](https://github.com/reginaldosilva27/AgentSimulator/actions/workflows/ci.yml/badge.svg)](https://github.com/reginaldosilva27/AgentSimulator/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.12-blue)
![Node](https://img.shields.io/badge/node-20-green)
![License](https://img.shields.io/badge/license-MIT-black)

<img src="docs/images/hero.png" alt="AI Agent Simulator — the request flow with the RAG inspector open" width="860"/>

<sub>Tip: record a short screen capture into <code>docs/images/demo.gif</code> to show the live animation.</sub>

</div>

---

## ✨ What it does

You type a message. The app then **animates the full request lifecycle** across a graph of
"stations", and lets you **click any station to inspect the real data** flowing through it:

| Station | Tier | What you see |
|---|---|---|
| **Frontend** | Client | The message leaving the browser over HTTPS — and the answer streaming back to it. |
| **Backend (API)** | API | FastAPI terminates TLS, opens an SSE stream, and relays every stage. Shows routes & protocols. |
| **Agent (LangGraph)** | Agent | The ReAct loop deciding whether to retrieve, call a tool, or answer — going back and forth. |
| **RAG pipeline** | Services | Query embedding → vector search in Chroma → top-k chunks **with similarity scores**. |
| **MCP tools** | Services | Tool discovery + the exact arguments and results of each tool call. |
| **LLM** | Services | The assembled prompt (system + context + tools), streamed tokens and token usage. |

A **timeline** lets you play / pause / step / replay the captured trace, so you can study each
stage without re-running anything.

The pipeline is drawn as **deployable tiers (containers)** — Client, API, Agent, and AI & Data
Services — that talk over the **network**, with each hop labeled by its protocol (`🔒 HTTPS/TLS`,
in-cluster mTLS, MCP/stdio, …) and an example **Azure** service mapping. You can see the
infrastructure, the hops, and the agent loop going back and forth.

<p align="center">
  <img src="docs/images/inspector-backend.png" alt="Backend tier: protocols, routes and network hops" width="420"/>
  <img src="docs/images/inspector-mcp.png" alt="Inspecting discovered MCP tools" width="420"/>
</p>
<p align="center"><sub>Click a station to inspect the real data — protocols, routes &amp; network hops (left) and discovered MCP tools (right).</sub></p>

## 🗺️ Learn mode

Click **📚 Learn** in the header for an interactive, roadmap.sh-style **content map**. It explains
the whole stack — architecture & layers, the software and Gen-AI concepts used (and *why*),
security at each layer, networking/infrastructure/containers, and where data lives — with a
"what it is / why it's used here / where in the project" breakdown for every topic.

<p align="center">
  <img src="docs/images/learn.png" alt="Learn mode — interactive content map of the whole stack" width="860"/>
</p>

## 🎓 What you'll learn

- How a request becomes an **agent run**, and where the latency actually goes.
- How **RAG** retrieval works in practice (chunks, embeddings, cosine similarity, top-k).
- How **MCP** exposes tools to an agent and how tool calls are wired into the loop.
- How a **system prompt + retrieved context + tool results** are composed before the LLM call.

## 🏗️ Architecture

```
Browser (React + Vite + TS)            Backend (FastAPI, Python 3.12)
  ChatPanel ─ POST /api/chat ─────────▶ /api/chat ─ creates trace, opens SSE
  FlowCanvas ◀──── SSE events ───────── TraceEmitter (normalize + persist)
  InspectorPanel / Timeline                 │
                                       LangGraph: route ▶ think ▶ [rag | mcp] ▶ generate ▶ respond
                                            │            │      │
                                       RAG (Chroma)   MCP client   LLM provider (OpenAI | Mock)
                                                         │
                                                   MCP server (FastMCP): calculator, time, kb_lookup
```

See [`docs/architecture.md`](docs/architecture.md) and [`docs/how-it-works.md`](docs/how-it-works.md)
for the full walkthrough.

## 🚀 Quickstart

### Option A — Docker (one command)

```bash
docker compose up --build
# Frontend: http://localhost:5173   Backend: http://localhost:8000/docs
```

Runs in **demo mode** by default (deterministic mock LLM + mock embeddings — no API key needed).

### Option B — Local dev

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # optional: add OPENAI_API_KEY for real mode
python -m app.rag.ingest        # build the local vector index
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

## 🔌 Demo mode vs. OpenAI mode

| | Demo mode (default) | OpenAI mode |
|---|---|---|
| API key | none | `OPENAI_API_KEY` required |
| LLM | deterministic mock | `gpt-4o-mini` (streaming) |
| Embeddings | deterministic hash vectors | `text-embedding-3-small` |
| Cost | free | spends tokens |

Set the mode in `backend/.env` (`DEMO_MODE=true|false`). If unset, it auto-detects from the
presence of `OPENAI_API_KEY`.

## 🧱 Tech stack

**Backend:** FastAPI · LangGraph · langchain-openai · langchain-mcp-adapters · Chroma · sse-starlette
**Frontend:** React · Vite · TypeScript · React Flow · Framer Motion · Zustand · Tailwind CSS

## 📁 Project layout

```
backend/   FastAPI + LangGraph agent, RAG, MCP server/client, LLM providers
frontend/  React + Vite visualization (React Flow canvas, inspector, timeline)
docs/      architecture & how-it-works
```

## 🤝 Contributing & license

PRs and issues welcome — this is a learning resource. Licensed under [MIT](LICENSE).
