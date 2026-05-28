# How it works — a message's journey

Follow one message, `"What is 12 * (3 + 1)?"`, through every station. Open the inspector on the
right of the app and click each station to see the real data described below.

> Header toggles change what you see without changing the pipeline: **language** (EN/PT),
> **cloud provider** (Generic / Azure / AWS / GCP — swaps the example service names on each tier),
> the **maturity ladder** (Simple / Intermediate / Advanced — picks how much of a production
> pipeline the diagram shows; only Simple executes today), and the ⚙️ **Settings page**
> (041-settings-page), where you pick how the backend delivers the result — **Streaming (SSE)**
> or **Batch (JSON)** (see step 1) — and configure the experiment (top-k, simulated failures).
> The Agent node itself opens a **Configure agent** dialog (042-agent-anatomy → 044-shared-agent-catalog)
> with the agent's identity, system / agent prompts, model and enabled tools — persisted in the
> shared `agents` catalog so edits propagate to every conversation using that agent. Note the
> dashed **private-network boundary** (VNet / VPC) around every tier except the Client: only the
> public ingress crosses it. Each edge also shows whether the call is **sync** (blocking
> request/response) or **async** (a streamed response).

## 1. Frontend — the message leaves the browser

You type and hit send. The frontend POSTs `{ "message": "...", "mode": "stream" | "batch", … }` to
`/api/chat`. The request also carries any per-conversation overrides (the active agent from the
shared catalog, `top_k`, `simulate_failure`, scenario, attachments). The **mode** (from the
Settings page) decides the delivery contract:

- **Streaming** — the frontend immediately reads a **Server-Sent Events** stream; from here on
  everything you see is driven by events arriving in real time, and the answer types itself out.
  The client↔API edge is **async**.
- **Batch** — one blocking request: the frontend waits for a single JSON response carrying the
  whole trace + answer, then **replays** it on the canvas. The answer appears at once. The
  client↔API edge is **sync**.

## 2. Backend — FastAPI runs the pipeline

The API creates a `trace_id` and builds a `TraceEmitter`. In **streaming** mode it returns an
`EventSourceResponse`, runs the agent as a background task, and forwards each emitted event to the
browser. In **batch** mode it runs the whole pipeline to completion and returns the finished trace
as one JSON payload. Either way it stores the full trace so you can replay it with the timeline.

## 2b. App database — reading recent history (`db.read`)

Before invoking the agent, the backend queries its **application database** — a real SQLite store
(a managed SQL service in production), separate from the RAG vector DB. The App Database station's
inspector shows how many conversations are stored and the most recent messages. This is the
transactional system of record: users, chat history, sessions.

## 3. Agent — routing and reasoning (LangGraph)

A LangGraph state machine drives the run. The **route** node announces the plan and discovers the
available tools — including the native `search_knowledge_base` tool that wraps RAG retrieval
(026-agent-tool-autonomy). The **think** node then calls the LLM to decide: *answer now, or call a
tool?* This is a bounded **ReAct** loop — if the model asks for a tool, we run it and come back to
think again, up to a small step limit. **There is no automatic retrieval step**: if the model
decides the question doesn't need grounding (e.g. a pure math question), it never calls
`search_knowledge_base` and the RAG station stays dark — an honest agent decision visible as the
standard tool-call chain.

## 4. RAG — turning the query into context (when the agent asks for it)

When the model calls `search_knowledge_base`, three sub-steps fire in order:

- **embed** — the query becomes a vector. The inspector shows the embedding model, the number of
  dimensions, and a preview of the first values.
- **search** — that vector is compared against the knowledge base in Chroma using **cosine
  similarity**.
- **retrieve** — the top-k closest chunks are selected. The inspector shows each chunk, its
  source file, and a **similarity score** (1.0 = identical direction). These chunks become the
  context for the prompt.

The knowledge base is a small set of Markdown notes about AI engineering in
[`backend/app/data/corpus`](../backend/app/data/corpus) — they double as the corpus *and* as
learning material.

## 5. MCP tools — discovery and calls

Tools are exposed by a real **MCP server** (FastMCP) and loaded by the agent over stdio using
`langchain-mcp-adapters`. The MCP server advertises four tools — `calculator`, `current_time`,
`kb_lookup`, `load_skill` (027-skills) — and the registry also exposes one **native** agent tool,
`search_knowledge_base`, that wraps the RAG retriever (the model can't tell the difference; both
appear as discovered tools). The inspector's **discovered tools** section lists each tool with
its description and the transport in use (`mcp-stdio` or `local-fallback`). For a math question
the model chooses `calculator`, and the **tool call** section shows the exact arguments
(`{"expression": "12 * (3 + 1)"}`) and the result (`48`); for a question like *"What is cosine
similarity?"* the model picks `search_knowledge_base` instead, lighting up the RAG station with
the matching chunks. Tool execution is always real — the model (OpenAI) only decides *which*
tool to call.

## 6. LLM — prompt assembly and generation

Before generating, the **assembled system message** (three layers — guardrails + the agent's role
+ the loaded skills catalog, 042-agent-anatomy · 027-skills), the retrieved context, and any tool
results are stitched into a single prompt — visible in full in the **assembled prompt** section,
along with the per-category context-window budget (036-context-window-budget). How the answer
comes back depends on the delivery mode: in **streaming** mode the model streams the answer one
token at a time (each token a `progress` event), which is why the answer types itself out in the
chat panel and the LLM station shows a live token count plus TTFT / tokens-per-second
(029-ttft-throughput); in **batch** mode it's a single non-streaming completion, so the whole
answer arrives at once (the agent→LLM edge reads **sync**).

## 7. Response — back to the user

The final answer is emitted and rendered in the chat, closing the loop that started with your
message. On the canvas it travels the real return path through the hubs — `llm → agent → backend →
frontend` — rather than jumping straight to the browser.

## 8. App database — persisting the conversation (`db.write`)

Finally the backend writes the finished conversation (message + answer) back to the application
database, so it outlives the request and could be shared across replicas. The App Database station
lights up a second time, and its inspector shows the `INSERT` and the new row count.

## Bonus — uploading a PDF (the write-path)

The same canvas also animates the **upload** half of RAG. Drop a PDF on the composer and the
frontend `POST`s it to `/api/sessions/{id}/documents` (040-message-attachments pins it to the
turn that introduced it). Two stations that stay dark on a normal chat now light up
(035-conditional-upload-nodes reveals them on demand):

- **Object Storage** (`storage.upload`, 034) — the API writes the original file to durable object
  storage **first**, so "received" is decoupled from "indexed" and the file can be re-chunked
  later when the embedding model changes.
- **Ingestion / Indexer** (`rag.ingest.chunk → rag.ingest.embed → rag.ingest.store`, 033) — the
  indexer reads the file back, splits it into chunks, embeds each one, and upserts the vectors
  into the same Chroma collection the corpus lives in. From the next chat turn on, the agent's
  `search_knowledge_base` tool can ground answers on your document.

## Replay it

After a run completes, use the **timeline** at the bottom to scrub, step (`⏮`/`⏭`), or replay
(`▶`) the captured trace. Because the entire view is derived from "events up to a cursor", you can
freeze on any moment and inspect exactly what each station knew at that point — no re-running
required. Traces are persisted to the `trace_events` SQLite table (048-persist-traces), so you can
still replay a session after a restart.
