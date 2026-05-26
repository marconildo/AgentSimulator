// Curated learning content for the "Learn" page — a roadmap.sh-style map that
// explains this project's architecture, the software & Gen-AI concepts it uses
// (and why), security per layer, networking/infra, and databases.
//
// Everything is grounded in the actual codebase, so it doubles as documentation.

export interface Topic {
  id: string;
  title: string;
  what: string; // what it is
  why: string; // why it's used here
  where?: string; // where to find it in the project
}

export interface Section {
  id: string;
  title: string;
  icon: string;
  accent: string;
  intro: string;
  topics: Topic[];
}

export const SECTIONS: Section[] = [
  {
    id: "architecture",
    title: "Architecture & Layers",
    icon: "🏛️",
    accent: "#38bdf8",
    intro:
      "The app is split into independent layers (tiers). Each is a separate container that can be built, deployed, scaled and secured on its own.",
    topics: [
      {
        id: "project-structure",
        title: "Project structure",
        what: "A monorepo with backend/ (FastAPI + LangGraph agent, RAG, MCP), frontend/ (React + Vite), and docs/.",
        why: "Keeping backend and frontend in one repo with clear folders makes the system easy to read, build, test and deploy independently — while sharing one event contract.",
        where: "repository root · backend/ · frontend/ · docs/",
      },
      {
        id: "tiers",
        title: "Tiered architecture",
        what: "Four tiers: Client (browser), API (gateway), Agent (orchestrator), and AI & Data Services (vector DB, tools, LLM).",
        why: "Separating tiers gives you independent scaling, clear security boundaries (only the API is public), and the freedom to change one layer without touching the others.",
        where: "frontend/src/lib/stations.ts (TIERS)",
      },
      {
        id: "client-tier",
        title: "Client tier",
        what: "A React single-page app running entirely in the user's browser, served as static files.",
        why: "Static assets are cheap to host on a CDN and infinitely scalable; the heavy lifting (state, animation) happens on the user's device, not your servers.",
        where: "frontend/ · served by nginx in Docker",
      },
      {
        id: "api-tier",
        title: "API tier (gateway)",
        what: "A FastAPI service: the single public entrypoint. It terminates TLS, validates input, runs the agent, and streams events back.",
        why: "A gateway centralizes cross-cutting concerns (auth, CORS, rate limits, TLS) and is the only component exposed to the internet.",
        where: "backend/app/main.py",
      },
      {
        id: "agent-tier",
        title: "Agent tier",
        what: "The LangGraph agent runtime, on a private network — not reachable from the internet.",
        why: "Isolating the agent protects model API keys and tools behind the API, and lets you scale the (CPU/latency-heavy) AI logic separately from the web layer.",
        where: "backend/app/agent/",
      },
      {
        id: "services-tier",
        title: "AI & data services",
        what: "Stateful or managed dependencies: the vector database, the MCP tool server, and the LLM endpoint.",
        why: "Stateless app tiers stay simple and disposable; state and external capabilities live in dedicated services you can manage and back up independently.",
        where: "backend/app/rag/ · backend/app/mcp/ · backend/app/llm/",
      },
    ],
  },
  {
    id: "software",
    title: "Software Engineering",
    icon: "🧩",
    accent: "#a78bfa",
    intro:
      "The patterns that keep the system clean: an event contract, swappable providers, an explicit state machine, type safety, tests and containers.",
    topics: [
      {
        id: "event-driven",
        title: "Event-driven streaming",
        what: "Every stage emits a TraceEvent; the backend streams them to the browser over Server-Sent Events (SSE).",
        why: "Events decouple the pipeline (producer) from the UI (consumer), enable real-time visualization, and let the same log drive live view and replay.",
        where: "backend/app/trace.py · backend/app/main.py",
      },
      {
        id: "contract",
        title: "Shared event contract",
        what: "The event schema is defined once with Pydantic and mirrored as TypeScript types.",
        why: "A single source of truth for the backend↔frontend protocol eliminates a whole class of integration bugs and makes the wire format self-documenting.",
        where: "backend/app/schemas.py ↔ frontend/src/types/events.ts",
      },
      {
        id: "provider-pattern",
        title: "Provider pattern (Strategy)",
        what: "An LLMProvider interface with two implementations: real OpenAI and a deterministic mock.",
        why: "The Strategy pattern lets the agent stay identical while you swap the model out — that's what makes the app run offline with zero keys.",
        where: "backend/app/llm/provider.py",
      },
      {
        id: "state-machine",
        title: "State machine orchestration",
        what: "The agent is a LangGraph StateGraph with explicit nodes and edges, not ad-hoc control flow.",
        why: "Modeling the loop as a graph makes it legible, testable, and easy to extend (add memory, retries, human-in-the-loop) without spaghetti.",
        where: "backend/app/agent/graph.py",
      },
      {
        id: "type-safety",
        title: "End-to-end type safety",
        what: "Pydantic models on the backend, strict TypeScript on the frontend.",
        why: "Types catch mistakes at the boundaries (request bodies, event payloads) before runtime and serve as living documentation.",
        where: "pydantic models · tsconfig strict mode",
      },
      {
        id: "testing-demo",
        title: "Deterministic tests & demo mode",
        what: "A mock provider + mock embeddings let the whole pipeline run offline; pytest covers the protocol, RAG, MCP and the agent.",
        why: "CI runs with no API keys and no network — fast, free and reproducible. Demo mode is also what lets anyone clone and run instantly.",
        where: "backend/tests/ · backend/app/llm/mock_provider.py",
      },
      {
        id: "config",
        title: "12-factor configuration",
        what: "Config comes from environment variables / .env via pydantic-settings; nothing is hardcoded.",
        why: "The same container image runs in every environment; secrets are injected at runtime, never committed. Mode auto-detects from the presence of a key.",
        where: "backend/app/config.py · .env.example",
      },
      {
        id: "containers",
        title: "Containerization",
        what: "Each service has a Dockerfile; docker-compose runs the whole stack with one command.",
        why: "Containers give reproducible builds and dev/prod parity, and are the unit of deployment for the tiers above.",
        where: "backend/Dockerfile · frontend/Dockerfile · docker-compose.yml",
      },
    ],
  },
  {
    id: "genai",
    title: "Gen AI Concepts",
    icon: "🤖",
    accent: "#f472b6",
    intro:
      "The AI building blocks: tokens, embeddings, retrieval, agents, tools and streaming — and why each one is used here.",
    topics: [
      {
        id: "tokens",
        title: "Tokens & LLMs",
        what: "An LLM predicts the next token; both prompt and answer are measured in tokens, which drives cost and latency.",
        why: "Understanding tokens explains why context is budgeted and why longer answers take longer — the model does one forward pass per token.",
        where: "knowledge corpus: llm-basics.md",
      },
      {
        id: "embeddings",
        title: "Embeddings",
        what: "A vector that captures the meaning of text; similar meanings map to nearby vectors.",
        why: "Embeddings power semantic search — finding relevant text even when it shares no exact words with the query.",
        where: "backend/app/rag/embeddings.py",
      },
      {
        id: "vector-search",
        title: "Vector search & cosine",
        what: "Comparing the query vector to stored vectors with cosine similarity to find the closest matches.",
        why: "Cosine ignores magnitude and captures direction (meaning), which is the standard, robust metric for text retrieval.",
        where: "backend/app/rag/retriever.py",
      },
      {
        id: "rag",
        title: "Retrieval-Augmented Generation",
        what: "Retrieve relevant chunks at query time and put them in the prompt as grounding context.",
        why: "RAG lets the model answer about private or recent data it never trained on, and reduces hallucinations by grounding answers in real sources.",
        where: "backend/app/rag/",
      },
      {
        id: "chunking",
        title: "Chunking",
        what: "Splitting documents into overlapping pieces before embedding them.",
        why: "Chunk size trades off relevance vs. context: too big dilutes, too small loses meaning. Overlap keeps ideas from being cut in half.",
        where: "backend/app/rag/ingest.py",
      },
      {
        id: "agents-react",
        title: "Agents & the ReAct loop",
        what: "An LLM in a loop that can reason, call a tool, observe the result, and decide again — with a step limit.",
        why: "Looping lets the agent gather information before answering; the bounded limit prevents runaway cost and latency.",
        where: "backend/app/agent/graph.py",
      },
      {
        id: "tool-calling",
        title: "Tool calling & MCP",
        what: "The model chooses a tool and arguments; tools are exposed via the Model Context Protocol (MCP).",
        why: "Tools give the model real capabilities (math, time, lookups). MCP standardizes how apps connect to tools so they're reusable and swappable.",
        where: "backend/app/mcp/",
      },
      {
        id: "prompt",
        title: "Prompt / context engineering",
        what: "Assembling the system prompt + retrieved context + tool results into the final input.",
        why: "What you send shapes the output. Inspecting the assembled prompt is one of the most useful debugging skills in AI engineering.",
        where: "backend/app/agent/prompts.py · llm providers",
      },
      {
        id: "streaming",
        title: "Streaming generation",
        what: "The model emits the answer one token at a time, streamed to the UI as it's produced.",
        why: "Streaming makes responses feel instant and lets the user start reading before generation finishes.",
        where: "stream_answer() in llm providers → SSE",
      },
    ],
  },
  {
    id: "security",
    title: "Security per Layer",
    icon: "🛡️",
    accent: "#34d399",
    intro:
      "Security is layered: encryption in transit, private boundaries, validated input, managed secrets and safe tool execution.",
    topics: [
      {
        id: "tls",
        title: "TLS / HTTPS at the edge",
        what: "The browser↔API connection is encrypted with HTTPS (TLS 1.3), terminated at the ingress.",
        why: "TLS protects the message and the streamed answer from eavesdropping and tampering on the public internet.",
        where: "Client ↔ API hop",
      },
      {
        id: "private-net",
        title: "Private network & mTLS",
        what: "API↔Agent traffic stays on a private, in-cluster network, optionally with mutual TLS.",
        why: "Internal services should never be internet-exposed; keeping them private shrinks the attack surface to the single API gateway.",
        where: "API ↔ Agent hop",
      },
      {
        id: "cors",
        title: "CORS",
        what: "The API only accepts browser requests from configured origins.",
        why: "Cross-Origin Resource Sharing rules prevent arbitrary websites from calling your API on a user's behalf.",
        where: "CORSMiddleware in backend/app/main.py",
      },
      {
        id: "secrets",
        title: "Secrets management",
        what: "API keys come from environment variables; .env is git-ignored and never committed.",
        why: "Hardcoded secrets leak through source control. Injecting them at runtime keeps them out of the image and the repo.",
        where: "backend/app/config.py · .gitignore",
      },
      {
        id: "validation",
        title: "Input validation",
        what: "Incoming requests are validated and bounded by Pydantic models (e.g. message length).",
        why: "Validating at the boundary rejects malformed or oversized input early, before it reaches the agent.",
        where: "ChatRequest in backend/app/schemas.py",
      },
      {
        id: "safe-tools",
        title: "Safe tool execution",
        what: "The calculator tool parses an AST and evaluates only arithmetic — it never calls eval().",
        why: "Running model-chosen input through eval() is a remote-code-execution risk; a whitelisted AST evaluator is safe by construction.",
        where: "backend/app/mcp/server.py",
      },
    ],
  },
  {
    id: "infra",
    title: "Networking & Infrastructure",
    icon: "🌐",
    accent: "#fbbf24",
    intro:
      "How the pieces talk and run: containers, network hops, long-lived connections, stateless scaling and an example cloud mapping.",
    topics: [
      {
        id: "hops",
        title: "Network hops",
        what: "Each arrow between tiers is a real network call with its own protocol (HTTPS, in-cluster HTTP, TCP, MCP/stdio).",
        why: "Seeing the hops makes the real cost and complexity of a distributed app visible — every boundary adds latency and a failure point.",
        where: "frontend/src/lib/stations.ts (HOPS)",
      },
      {
        id: "ingress",
        title: "Ingress & egress",
        what: "Ingress is inbound traffic to the API; egress is the agent's outbound calls (to the LLM, tools).",
        why: "Controlling ingress/egress is how you firewall a system: only the API takes ingress; only the agent makes egress to model providers.",
        where: "API tier (ingress) · Agent tier (egress)",
      },
      {
        id: "sse-http",
        title: "SSE over HTTP",
        what: "Server-Sent Events stream many messages over a single long-lived HTTP response.",
        why: "SSE is simpler than WebSockets for one-way server→client streaming and rides over ordinary HTTP/HTTPS infrastructure.",
        where: "EventSourceResponse · frontend/src/lib/sse.ts",
      },
      {
        id: "stateless-scaling",
        title: "Stateless services & scaling",
        what: "The API and agent hold no per-user state between requests, so you can run many replicas behind a load balancer.",
        why: "Statelessness is what makes horizontal scaling (and zero-downtime deploys) possible; state is pushed to the data tier.",
        where: "API & Agent tiers",
      },
      {
        id: "reverse-proxy",
        title: "Reverse proxy",
        what: "In production the React build is served by nginx, which also handles SPA routing.",
        why: "A small static web server is fast, cache-friendly and the standard way to ship a front-end build.",
        where: "frontend/nginx.conf · frontend/Dockerfile",
      },
      {
        id: "azure",
        title: "Cloud mapping (Azure example)",
        what: "Client → Static Web Apps + Front Door; API & Agent → Container Apps; vector DB → AI Search / Chroma; LLM → Azure OpenAI.",
        why: "The tier model is cloud-agnostic; this is one concrete mapping showing how each container becomes a managed service.",
        where: "frontend/src/lib/stations.ts (azure fields)",
      },
    ],
  },
  {
    id: "data",
    title: "Data & Databases",
    icon: "🗄️",
    accent: "#2dd4bf",
    intro:
      "Where data lives: the vector database for retrieval, persistence, and the application database the backend would connect to.",
    topics: [
      {
        id: "vector-db",
        title: "Vector database (Chroma)",
        what: "Chroma stores chunk embeddings + text + metadata and serves nearest-neighbor search.",
        why: "A purpose-built vector store makes semantic retrieval fast and is the storage half of the RAG pipeline.",
        where: "backend/app/rag/store.py",
      },
      {
        id: "ann-index",
        title: "ANN index (HNSW)",
        what: "An approximate nearest-neighbor index (HNSW) finds close vectors without scanning every record.",
        why: "Brute-force comparison doesn't scale; an index keeps retrieval fast as the corpus grows to millions of chunks.",
        where: "Chroma collection (hnsw:space = cosine)",
      },
      {
        id: "persistence",
        title: "Persistence & volumes",
        what: "The Chroma index is persisted to disk and mounted as a Docker volume, surviving restarts.",
        why: "Re-embedding on every boot is slow and (with a real model) costly; persisting the index reuses it across restarts.",
        where: "docker-compose.yml (chroma-data volume)",
      },
      {
        id: "app-db",
        title: "Application database",
        what: "A relational/document DB the backend connects to for users, chat history and sessions. This demo keeps traces in an in-memory store; a real deployment would use Postgres, Azure SQL or Cosmos DB.",
        why: "Conversations, accounts and audit logs must outlive a process and be shared across replicas — that's exactly what a managed database provides.",
        where: "backend/app/trace.py (TraceStore — in-memory today)",
      },
      {
        id: "in-memory",
        title: "In-memory state & trade-offs",
        what: "Traces live in a bounded in-memory dict, so they're lost on restart and not shared between replicas.",
        why: "In-memory is perfect for a single-instance demo (zero setup), but it's the first thing you'd replace with a database to scale out.",
        where: "TraceStore in backend/app/trace.py",
      },
    ],
  },
];

export const ALL_TOPICS: Record<string, { topic: Topic; section: Section }> = SECTIONS.reduce(
  (acc, section) => {
    for (const topic of section.topics) acc[topic.id] = { topic, section };
    return acc;
  },
  {} as Record<string, { topic: Topic; section: Section }>,
);
