# Architecture

The simulator is two apps connected by a streaming event protocol.

```
┌──────────────────────── Browser (React + Vite + TS) ─────────────────────────┐
│  ChatPanel ── POST /api/chat ──▶                                              │
│  FlowCanvas (React Flow)  ◀── Server-Sent Events ── stream of TraceEvents     │
│  InspectorPanel · Timeline · zustand store (derive view from events+cursor)   │
└───────────────────────────────────────────────────────────────────────────────┘
                                     │  SSE (text/event-stream)
┌──────────────────────── Backend (FastAPI, Python 3.12) ──────────────────────┐
│  POST /api/chat   → create trace_id, open EventSourceResponse                 │
│  GET  /api/trace/{id} → replay a finished trace                               │
│  GET  /api/health → demo/openai mode, model, index status                     │
│                                                                               │
│  TraceEmitter  → normalizes every stage into TraceEvents (queue + store)      │
│                                                                               │
│  LangGraph StateGraph (a bounded ReAct loop):                                 │
│     route → retrieve → think ──(tool calls?)──▶ tools ──┐                      │
│                          ▲                              │                      │
│                          └──────────────────────────────┘                     │
│                          └──(no tool calls)──▶ generate → respond              │
│       │                      │          │                                     │
│   RAG retriever         MCP client   LLM provider                             │
│   (Chroma + cosine)   (langchain-mcp- (OpenAI | Mock)                         │
│                        adapters, stdio)                                       │
│                            │                                                  │
│                      MCP server (FastMCP): calculator, current_time, kb_lookup │
└───────────────────────────────────────────────────────────────────────────────┘
```

## The event protocol

Defined once in [`backend/app/schemas.py`](../backend/app/schemas.py) and mirrored in
[`frontend/src/types/events.ts`](../frontend/src/types/events.ts).

```jsonc
{
  "trace_id": "uuid",
  "seq": 12,                  // monotonic order within the trace
  "ts": 1690000000.123,
  "stage": "rag.search",      // which station emitted it
  "phase": "start|progress|end",
  "label": "Searching the vector store",
  "data": { /* stage-specific payload */ },
  "metrics": { "latency_ms": 42, "top_score": 0.82 }
}
```

Stages: `frontend → backend → agent.route → rag.embed → rag.search → rag.retrieve →
agent.think → llm.prompt → (mcp.discover, mcp.call) → llm.generate → respond`.

## How events are produced and consumed

- **Produced**: every node in the LangGraph receives a `TraceEmitter` (via the runnable
  `config`). The `emitter.stage(...)` context manager emits a `start` event on enter and an
  `end` event on exit, timing the body. `llm.generate` additionally emits one `progress` event
  per streamed token. See [`backend/app/trace.py`](../backend/app/trace.py) and
  [`backend/app/agent/graph.py`](../backend/app/agent/graph.py).
- **Streamed**: `POST /api/chat` runs the graph as a background task and relays events from the
  emitter's queue over SSE, then emits a final `done` event and saves the trace.
- **Consumed**: the frontend's SSE client ([`lib/sse.ts`](../frontend/src/lib/sse.ts)) pushes
  each event into a zustand store. The view is a **pure projection** of `events` up to a
  `cursor` ([`lib/derive.ts`](../frontend/src/lib/derive.ts)) — which is exactly why live
  streaming and step/replay share one code path: replay is just a smaller cursor.

## Stations, tiers and network hops

The canvas shows six **stations** (Frontend, Backend, Agent, RAG, MCP, LLM). Each station
aggregates one or more protocol **stages** — for example the RAG station covers `rag.embed`,
`rag.search`, and `rag.retrieve`, and the Frontend station covers both `frontend` (request out)
and `respond` (answer back).

Stations are grouped into **tiers** — deployable containers that communicate over the network:

| Tier | Stations | Example Azure hosting |
|---|---|---|
| Client | Frontend | Azure Static Web Apps + Front Door |
| API | Backend | Azure Container Apps (public ingress) |
| Agent | Agent | Azure Container Apps (internal) |
| AI & Data Services | RAG, MCP, LLM | Azure OpenAI · AI Search / Chroma |

Each **hop** between stations carries a protocol (HTTPS/TLS 1.3, in-cluster mTLS, TCP, MCP/stdio)
and is drawn with a lock when encrypted. The agent loop animates **back and forth** on the same
edge (e.g. agent ⇄ MCP), and the SSE response **streams back** along the client↔API edge. Tiers,
hops, technical detail and the Azure mapping are all centralized in
[`frontend/src/lib/stations.ts`](../frontend/src/lib/stations.ts) — cloud-agnostic in concept,
with Azure shown as a concrete example.

## Demo mode vs. OpenAI mode

Only the **LLM reasoning/generation and embeddings** are swapped between modes
([`backend/app/llm`](../backend/app/llm), [`backend/app/rag/embeddings.py`](../backend/app/rag/embeddings.py)).
Everything else — the LangGraph loop, the Chroma vector store, the MCP server and tool
execution — is real in both modes. Mode is chosen in
[`backend/app/config.py`](../backend/app/config.py): explicit `DEMO_MODE` wins, otherwise it is
inferred from the presence of `OPENAI_API_KEY`.
