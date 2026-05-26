// Visual model of the architecture: stations (the moving parts), grouped into
// tiers (deployable containers), connected by network hops (with protocols).
// Each station carries an educational blurb plus concrete technical detail and
// an example Azure service mapping — all centralized here so it's easy to edit.

import type { Stage } from "../types/events";

export type StationId = "frontend" | "backend" | "agent" | "rag" | "mcp" | "llm";
export type TierId = "client" | "api" | "agent" | "services";

export interface TechRow {
  k: string;
  v: string;
}

export interface StationMeta {
  id: StationId;
  tier: TierId;
  title: string;
  subtitle: string;
  icon: string;
  accent: string;
  tag: string; // tiny pill shown on the node, at-a-glance tech
  blurb: string;
  azure: string; // example managed service
  tech: TechRow[];
  stages: Stage[];
  position: { x: number; y: number };
}

export interface TierMeta {
  id: TierId;
  title: string;
  azure: string; // example: what hosts this container/tier
  generic: string; // cloud-agnostic description
  accent: string;
  box: { x: number; y: number; w: number; h: number };
}

// Tiers = separate deployable units (containers). Network crosses their borders.
export const TIERS: TierMeta[] = [
  {
    id: "client",
    title: "Client Tier",
    azure: "Azure Static Web Apps + Front Door",
    generic: "Static hosting / CDN + WAF",
    accent: "#38bdf8",
    box: { x: 8, y: 150, w: 272, h: 236 },
  },
  {
    id: "api",
    title: "API Tier",
    azure: "Azure Container Apps (public ingress)",
    generic: "Containerized web service",
    accent: "#a78bfa",
    box: { x: 312, y: 150, w: 272, h: 236 },
  },
  {
    id: "agent",
    title: "Agent Tier",
    azure: "Azure Container Apps (internal)",
    generic: "Private agent runtime service",
    accent: "#f472b6",
    box: { x: 616, y: 150, w: 272, h: 236 },
  },
  {
    id: "services",
    title: "AI & Data Services",
    azure: "Azure OpenAI · AI Search / Chroma",
    generic: "Managed AI + vector database",
    accent: "#34d399",
    box: { x: 956, y: 20, w: 300, h: 540 },
  },
];

export const STATIONS: StationMeta[] = [
  {
    id: "frontend",
    tier: "client",
    title: "Frontend",
    subtitle: "React UI · browser",
    icon: "🖥️",
    accent: "#38bdf8",
    tag: "TLS 1.3",
    blurb:
      "Runs in the user's browser. It POSTs the message over HTTPS and holds open a Server-Sent Events connection, rendering each stage — and the streamed answer — as events arrive.",
    azure: "Azure Static Web Apps",
    tech: [
      { k: "runtime", v: "React + Vite (browser)" },
      { k: "request", v: "POST /api/chat" },
      { k: "payload", v: "application/json" },
      { k: "response", v: "text/event-stream (SSE)" },
      { k: "security", v: "HTTPS · TLS 1.3" },
    ],
    stages: ["frontend", "respond"],
    position: { x: 40, y: 250 },
  },
  {
    id: "backend",
    tier: "api",
    title: "Backend",
    subtitle: "FastAPI · ASGI",
    icon: "⚙️",
    accent: "#a78bfa",
    tag: "ASGI",
    blurb:
      "A FastAPI web service terminates TLS at the ingress, validates the request, opens an SSE response, and invokes the agent — relaying every trace event back to the browser as it happens.",
    azure: "Azure Container Apps",
    tech: [
      { k: "server", v: "uvicorn (ASGI)" },
      { k: "framework", v: "FastAPI" },
      { k: "streaming", v: "EventSourceResponse" },
      { k: "middleware", v: "CORS" },
    ],
    stages: ["backend"],
    position: { x: 340, y: 250 },
  },
  {
    id: "agent",
    tier: "agent",
    title: "Agent",
    subtitle: "LangGraph runtime",
    icon: "🧠",
    accent: "#f472b6",
    tag: "ReAct",
    blurb:
      "A LangGraph state machine on a private network. It retrieves context, then loops: reason → maybe call a tool → observe → reason again, until it can answer. This is the agent loop.",
    azure: "Azure Container Apps (internal)",
    tech: [
      { k: "runtime", v: "LangGraph StateGraph" },
      { k: "pattern", v: "bounded ReAct loop" },
      { k: "flow", v: "route → retrieve → think ⇄ tools → generate" },
      { k: "state", v: "in-process per request" },
    ],
    stages: ["agent.route", "agent.think"],
    position: { x: 640, y: 250 },
  },
  {
    id: "rag",
    tier: "services",
    title: "RAG · Vector DB",
    subtitle: "Chroma",
    icon: "📚",
    accent: "#34d399",
    tag: "cosine",
    blurb:
      "Embeds the query and runs an approximate nearest-neighbor search over the knowledge base using cosine similarity, returning the most relevant top-k chunks as grounding context.",
    azure: "Azure AI Search / Chroma on ACA",
    tech: [
      { k: "store", v: "Chroma (persistent)" },
      { k: "index", v: "HNSW" },
      { k: "metric", v: "cosine similarity" },
      { k: "embeddings", v: "text-embedding-3-small / mock" },
    ],
    stages: ["rag.embed", "rag.search", "rag.retrieve"],
    position: { x: 980, y: 90 },
  },
  {
    id: "mcp",
    tier: "services",
    title: "MCP Tools",
    subtitle: "Model Context Protocol",
    icon: "🔧",
    accent: "#fbbf24",
    tag: "MCP",
    blurb:
      "An MCP server exposes tools to the agent. The agent discovers them, and when the model chooses one, the call and its result travel over the MCP transport (here, stdio / JSON-RPC).",
    azure: "Sidecar container / ACA",
    tech: [
      { k: "protocol", v: "Model Context Protocol" },
      { k: "transport", v: "stdio (JSON-RPC)" },
      { k: "tools", v: "calculator, current_time, kb_lookup" },
    ],
    stages: ["mcp.discover", "mcp.call"],
    position: { x: 980, y: 250 },
  },
  {
    id: "llm",
    tier: "services",
    title: "LLM",
    subtitle: "Chat completions",
    icon: "✨",
    accent: "#fb923c",
    tag: "stream",
    blurb:
      "Receives the assembled prompt (system + context + tool results) over HTTPS and streams the answer back token by token — which is why the response types itself out in the chat.",
    azure: "Azure OpenAI",
    tech: [
      { k: "model", v: "gpt-4o-mini / mock" },
      { k: "api", v: "Chat Completions" },
      { k: "output", v: "streamed token-by-token" },
      { k: "security", v: "HTTPS · TLS" },
    ],
    stages: ["llm.prompt", "llm.generate"],
    position: { x: 980, y: 410 },
  },
];

export interface HopMeta {
  source: StationId;
  target: StationId;
  label: string; // short label on the edge
  protocol: string; // full protocol description (inspector)
  detail: string;
  secure: boolean; // draw a lock
}

// Network hops between stations. Cross-tier hops are real network calls.
export const HOPS: HopMeta[] = [
  {
    source: "frontend",
    target: "backend",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS 1.3",
    detail: "POST /api/chat → text/event-stream (SSE over one kept-alive connection)",
    secure: true,
  },
  {
    source: "backend",
    target: "agent",
    label: "internal",
    protocol: "Private network · HTTP (mTLS)",
    detail: "In-cluster service-to-service call, not exposed to the internet",
    secure: true,
  },
  {
    source: "agent",
    target: "rag",
    label: "TCP",
    protocol: "TCP",
    detail: "Vector similarity query against the embedding index",
    secure: false,
  },
  {
    source: "agent",
    target: "mcp",
    label: "MCP",
    protocol: "MCP · stdio (JSON-RPC)",
    detail: "Tool discovery and invocation over the Model Context Protocol",
    secure: false,
  },
  {
    source: "agent",
    target: "llm",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS",
    detail: "Chat Completions request to the managed model endpoint",
    secure: true,
  },
];

export const STAGE_TO_STATION: Record<Stage, StationId> = STATIONS.reduce(
  (acc, station) => {
    for (const stage of station.stages) acc[stage] = station.id;
    return acc;
  },
  {} as Record<Stage, StationId>,
);

export const STATION_BY_ID: Record<StationId, StationMeta> = STATIONS.reduce(
  (acc, s) => {
    acc[s.id] = s;
    return acc;
  },
  {} as Record<StationId, StationMeta>,
);

export const TIER_BY_ID: Record<TierId, TierMeta> = TIERS.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<TierId, TierMeta>,
);
