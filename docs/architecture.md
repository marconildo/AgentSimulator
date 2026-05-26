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
│  GET  /api/health → provider (openai), model, has_key, index status           │
│                                                                               │
│  TraceEmitter  → normalizes every stage into TraceEvents (queue + store)      │
│  App database (SQLite ConversationStore) → db.read history / db.write convo   │
│                                                                               │
│  LangGraph StateGraph (a bounded ReAct loop):                                 │
│     route → retrieve → think ──(tool calls?)──▶ tools ──┐                      │
│                          ▲                              │                      │
│                          └──────────────────────────────┘                     │
│                          └──(no tool calls)──▶ generate → respond              │
│       │                      │          │                                     │
│   RAG retriever         MCP client   LLM provider                             │
│   (Chroma + cosine)   (langchain-mcp- (OpenAI)                                │
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

Stages: `frontend → backend → db.read → agent.route → rag.embed → rag.search → rag.retrieve →
agent.think → llm.prompt → (mcp.discover, mcp.call) → llm.generate → respond → db.write`.
The backend reads recent history from the application database before running the agent and
persists the finished conversation after.

## How events are produced and consumed

- **Produced**: every node in the LangGraph receives a `TraceEmitter` (via the runnable
  `config`). The `emitter.stage(...)` context manager emits a `start` event on enter and an
  `end` event on exit, timing the body. `llm.generate` additionally emits one `progress` event
  per streamed token. See [`backend/app/trace.py`](../backend/app/trace.py) and
  [`backend/app/agent/graph.py`](../backend/app/agent/graph.py).
- **Delivered**: `POST /api/chat` takes a `mode` (chosen by the header's ⚙️ settings panel,
  [`lib/settings.ts`](../frontend/src/lib/settings.ts)):
  - `stream` (default) — runs the graph as a background task and relays events from the emitter's
    queue over SSE, then emits a final `done` event and saves the trace. The answer types out live.
  - `batch` — runs the whole pipeline to completion and returns the finished trace + answer as a
    single JSON response (a synchronous request/response; the model uses a non-streaming
    completion, so there are no per-token `progress` events). The client then **replays** the
    trace. Two delivery contracts, the same pipeline.
- **Consumed**: the frontend's SSE client ([`lib/sse.ts`](../frontend/src/lib/sse.ts)) pushes
  each event into a zustand store (batch loads them all at once, then auto-replays). The view is a
  **pure projection** of `events` up to a `cursor` ([`lib/derive.ts`](../frontend/src/lib/derive.ts))
  — which is exactly why live streaming and step/replay share one code path: replay is just a
  smaller cursor.

## Stations, tiers and network hops

The canvas shows seven **stations** (Frontend, Backend, Agent, App Database, RAG, MCP, LLM). Each
station aggregates one or more protocol **stages** — for example the RAG station covers
`rag.embed`, `rag.search`, and `rag.retrieve`; the Frontend station covers both `frontend`
(request out) and `respond` (answer back); and the App Database station covers `db.read` and
`db.write`.

Stations are grouped into **tiers** — deployable containers that communicate over the network.
Each tier keeps its friendly name plus the canonical **n-tier alias**, and maps to a concrete
service per cloud (the header's cloud toggle picks Generic / Azure / AWS / GCP):

| Tier (alias) | Stations | Azure | AWS | GCP |
|---|---|---|---|---|
| Client (Presentation) | Frontend | Static Web Apps + Front Door | S3 + CloudFront + WAF | Cloud Storage + Cloud CDN + Cloud Armor |
| API (Application) | Backend | Container Apps (public ingress) | App Runner / ECS Fargate + ALB | Cloud Run (HTTPS LB) |
| Agent (Compute) | Agent | Container Apps (internal) | ECS Fargate (private subnet) | Cloud Run (internal) |
| AI & Data Services (Data) | App Database, RAG, MCP, LLM | OpenAI · AI Search · SQL | Bedrock · OpenSearch · RDS | Vertex AI · Vector Search · Cloud SQL |

Every tier except the Client lives inside a **private-network boundary** (VNet / VPC), drawn as a
dashed perimeter on the canvas. Each **hop** carries a protocol (HTTPS/TLS 1.3, mTLS, TCP, SQL,
MCP/stdio), a `zone` (public vs private), its security `controls` (WAF · DDoS at the public edge;
mTLS, NSG / Security Group and Private Endpoints on the private hops), and a **communication
style** — `sync` (a blocking request/response: backend→agent, backend→database, agent→rag,
agent→mcp) or `async` (a streamed response: client↔API over SSE, and agent→LLM token streaming).
The two async hops flip to `sync` under **batch** delivery, shown as a chip on the edge and in the
inspector.

The six hops form a **hub-and-spoke tree** (backend and agent are the hubs), so two stations that
aren't directly wired animate the packet along the real path through their hub — e.g. `mcp → rag`
travels `mcp → agent → rag`, and the answer returning to the user travels `llm → agent → backend →
frontend` instead of teleporting. [`lib/derive.ts`](../frontend/src/lib/derive.ts) computes that
path (a BFS over the edge graph) so the agent loop still reads as **back and forth** on the same
edge (e.g. agent ⇄ MCP), while the SSE response also **streams back** along the client↔API edge.
The highlight is a **moving spotlight**: only the station the packet is at and the edge it's
crossing light up; everything else stays deactivated. Step through the **timeline** to re-light any
earlier stage — live play and step/replay are the same projection at a different cursor.

The visual model is **cloud-agnostic**: tiers, stations, hops, the boundary and their per-cloud
service names are centralized in
[`frontend/src/lib/stations.ts`](../frontend/src/lib/stations.ts), with the active provider chosen
in [`frontend/src/lib/cloud.ts`](../frontend/src/lib/cloud.ts). "Generic" shows the agnostic role;
Azure/AWS/GCP show concrete example services.

## OpenAI-only

The app runs **only against OpenAI** — there is no demo/mock mode. `get_provider()`
([`backend/app/llm/provider.py`](../backend/app/llm/provider.py)) and `get_embeddings()`
([`backend/app/rag/embeddings.py`](../backend/app/rag/embeddings.py)) always construct the OpenAI
implementations; with no `OPENAI_API_KEY` they raise `MissingAPIKeyError`
([`backend/app/config.py`](../backend/app/config.py)) so the app fails fast rather than falling
back. **Everything is real** — reasoning, embeddings, the LangGraph loop, the Chroma vector store,
the SQLite application database, the MCP server and tool execution.
