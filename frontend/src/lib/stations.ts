// Visual model of the architecture: stations (the moving parts), grouped into
// tiers (deployable containers), connected by network hops (with protocols).
// Each station carries an educational blurb plus concrete technical detail and
// an example Azure service mapping — all centralized here so it's easy to edit.
//
// Translatable prose is written as `{ en, pt }`; values that are the same in
// every language (code, protocols, proper nouns) stay plain strings. Use the
// `*For(lang)` builders to get fully-resolved, plain-string structures; results
// are cached per language so references stay stable across renders.

import type { Lang } from "../i18n";
import type { Stage } from "../types/events";

export type StationId = "frontend" | "backend" | "agent" | "rag" | "mcp" | "llm";
export type TierId = "client" | "api" | "agent" | "services";

/** A translatable string: either identical across languages, or per-language. */
type Tr = string | { en: string; pt: string };
const r = (v: Tr, lang: Lang): string => (typeof v === "string" ? v : v[lang]);

// --- Resolved (public) types — what components consume, all plain strings ----

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

export interface HopMeta {
  source: StationId;
  target: StationId;
  label: string; // short label on the edge
  protocol: string; // full protocol description (inspector)
  detail: string;
  secure: boolean; // draw a lock
}

// --- Source data (translatable fields as `Tr`) -------------------------------

interface TechRowSrc {
  k: Tr;
  v: string;
}
type StationSrc = Omit<StationMeta, "subtitle" | "blurb" | "tech"> & {
  subtitle: Tr;
  blurb: Tr;
  tech: TechRowSrc[];
};
type TierSrc = Omit<TierMeta, "title" | "generic"> & { title: Tr; generic: Tr };
type HopSrc = Omit<HopMeta, "label" | "protocol" | "detail"> & {
  label: Tr;
  protocol: Tr;
  detail: Tr;
};

// Tiers = separate deployable units (containers). Network crosses their borders.
const TIERS_SRC: TierSrc[] = [
  {
    id: "client",
    title: { en: "Client Tier", pt: "Camada Cliente" },
    azure: "Azure Static Web Apps + Front Door",
    generic: { en: "Static hosting / CDN + WAF", pt: "Hospedagem estática / CDN + WAF" },
    accent: "#38bdf8",
    box: { x: 8, y: 150, w: 272, h: 236 },
  },
  {
    id: "api",
    title: { en: "API Tier", pt: "Camada de API" },
    azure: "Azure Container Apps (public ingress)",
    generic: { en: "Containerized web service", pt: "Serviço web em container" },
    accent: "#a78bfa",
    box: { x: 312, y: 150, w: 272, h: 236 },
  },
  {
    id: "agent",
    title: { en: "Agent Tier", pt: "Camada do Agente" },
    azure: "Azure Container Apps (internal)",
    generic: { en: "Private agent runtime service", pt: "Serviço de runtime privado do agente" },
    accent: "#f472b6",
    box: { x: 616, y: 150, w: 272, h: 236 },
  },
  {
    id: "services",
    title: { en: "AI & Data Services", pt: "Serviços de IA e Dados" },
    azure: "Azure OpenAI · AI Search / Chroma",
    generic: { en: "Managed AI + vector database", pt: "IA gerenciada + banco vetorial" },
    accent: "#34d399",
    box: { x: 956, y: 20, w: 300, h: 540 },
  },
];

const STATIONS_SRC: StationSrc[] = [
  {
    id: "frontend",
    tier: "client",
    title: "Frontend",
    subtitle: { en: "React UI · browser", pt: "UI React · navegador" },
    icon: "🖥️",
    accent: "#38bdf8",
    tag: "TLS 1.3",
    blurb: {
      en: "Runs in the user's browser. It POSTs the message over HTTPS and holds open a Server-Sent Events connection, rendering each stage — and the streamed answer — as events arrive.",
      pt: "Roda no navegador do usuário. Envia a mensagem via POST sobre HTTPS e mantém aberta uma conexão Server-Sent Events, renderizando cada etapa — e a resposta transmitida — conforme os eventos chegam.",
    },
    azure: "Azure Static Web Apps",
    tech: [
      { k: { en: "runtime", pt: "runtime" }, v: "React + Vite (browser)" },
      { k: { en: "request", pt: "requisição" }, v: "POST /api/chat" },
      { k: { en: "payload", pt: "payload" }, v: "application/json" },
      { k: { en: "response", pt: "resposta" }, v: "text/event-stream (SSE)" },
      { k: { en: "security", pt: "segurança" }, v: "HTTPS · TLS 1.3" },
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
    blurb: {
      en: "A FastAPI web service terminates TLS at the ingress, validates the request, opens an SSE response, and invokes the agent — relaying every trace event back to the browser as it happens.",
      pt: "Um serviço web FastAPI encerra o TLS no ingress, valida a requisição, abre uma resposta SSE e invoca o agente — repassando cada evento de trace ao navegador conforme acontece.",
    },
    azure: "Azure Container Apps",
    tech: [
      { k: { en: "server", pt: "servidor" }, v: "uvicorn (ASGI)" },
      { k: { en: "framework", pt: "framework" }, v: "FastAPI" },
      { k: { en: "streaming", pt: "streaming" }, v: "EventSourceResponse" },
      { k: { en: "middleware", pt: "middleware" }, v: "CORS" },
    ],
    stages: ["backend"],
    position: { x: 340, y: 250 },
  },
  {
    id: "agent",
    tier: "agent",
    title: "Agent",
    subtitle: { en: "LangGraph runtime", pt: "runtime LangGraph" },
    icon: "🧠",
    accent: "#f472b6",
    tag: "ReAct",
    blurb: {
      en: "A LangGraph state machine on a private network. It retrieves context, then loops: reason → maybe call a tool → observe → reason again, until it can answer. This is the agent loop.",
      pt: "Uma máquina de estados LangGraph em rede privada. Recupera contexto e então entra em loop: raciocinar → talvez chamar uma ferramenta → observar → raciocinar de novo, até poder responder. Este é o loop do agente.",
    },
    azure: "Azure Container Apps (internal)",
    tech: [
      { k: { en: "runtime", pt: "runtime" }, v: "LangGraph StateGraph" },
      { k: { en: "pattern", pt: "padrão" }, v: "bounded ReAct loop" },
      { k: { en: "flow", pt: "fluxo" }, v: "route → retrieve → think ⇄ tools → generate" },
      { k: { en: "state", pt: "estado" }, v: "in-process per request" },
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
    blurb: {
      en: "Embeds the query and runs an approximate nearest-neighbor search over the knowledge base using cosine similarity, returning the most relevant top-k chunks as grounding context.",
      pt: "Gera o embedding da consulta e executa uma busca aproximada por vizinhos mais próximos na base de conhecimento usando similaridade de cosseno, retornando os top-k trechos mais relevantes como contexto de fundamentação.",
    },
    azure: "Azure AI Search / Chroma on ACA",
    tech: [
      { k: { en: "store", pt: "armazenamento" }, v: "Chroma (persistent)" },
      { k: { en: "index", pt: "índice" }, v: "HNSW" },
      { k: { en: "metric", pt: "métrica" }, v: "cosine similarity" },
      { k: { en: "embeddings", pt: "embeddings" }, v: "text-embedding-3-small / mock" },
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
    blurb: {
      en: "An MCP server exposes tools to the agent. The agent discovers them, and when the model chooses one, the call and its result travel over the MCP transport (here, stdio / JSON-RPC).",
      pt: "Um servidor MCP expõe ferramentas ao agente. O agente as descobre e, quando o modelo escolhe uma, a chamada e seu resultado trafegam pelo transporte MCP (aqui, stdio / JSON-RPC).",
    },
    azure: "Sidecar container / ACA",
    tech: [
      { k: { en: "protocol", pt: "protocolo" }, v: "Model Context Protocol" },
      { k: { en: "transport", pt: "transporte" }, v: "stdio (JSON-RPC)" },
      { k: { en: "tools", pt: "ferramentas" }, v: "calculator, current_time, kb_lookup" },
    ],
    stages: ["mcp.discover", "mcp.call"],
    position: { x: 980, y: 250 },
  },
  {
    id: "llm",
    tier: "services",
    title: "LLM",
    subtitle: { en: "Chat completions", pt: "Chat completions" },
    icon: "✨",
    accent: "#fb923c",
    tag: "stream",
    blurb: {
      en: "Receives the assembled prompt (system + context + tool results) over HTTPS and streams the answer back token by token — which is why the response types itself out in the chat.",
      pt: "Recebe o prompt montado (sistema + contexto + resultados de ferramentas) sobre HTTPS e transmite a resposta de volta token a token — por isso a resposta vai sendo digitada no chat.",
    },
    azure: "Azure OpenAI",
    tech: [
      { k: { en: "model", pt: "modelo" }, v: "gpt-4o-mini / mock" },
      { k: { en: "api", pt: "api" }, v: "Chat Completions" },
      { k: { en: "output", pt: "saída" }, v: "streamed token-by-token" },
      { k: { en: "security", pt: "segurança" }, v: "HTTPS · TLS" },
    ],
    stages: ["llm.prompt", "llm.generate"],
    position: { x: 980, y: 410 },
  },
];

// Network hops between stations. Cross-tier hops are real network calls.
const HOPS_SRC: HopSrc[] = [
  {
    source: "frontend",
    target: "backend",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS 1.3",
    detail: {
      en: "POST /api/chat → text/event-stream (SSE over one kept-alive connection)",
      pt: "POST /api/chat → text/event-stream (SSE sobre uma única conexão mantida aberta)",
    },
    secure: true,
  },
  {
    source: "backend",
    target: "agent",
    label: { en: "internal", pt: "interno" },
    protocol: { en: "Private network · HTTP (mTLS)", pt: "Rede privada · HTTP (mTLS)" },
    detail: {
      en: "In-cluster service-to-service call, not exposed to the internet",
      pt: "Chamada serviço-a-serviço dentro do cluster, não exposta à internet",
    },
    secure: true,
  },
  {
    source: "agent",
    target: "rag",
    label: "TCP",
    protocol: "TCP",
    detail: {
      en: "Vector similarity query against the embedding index",
      pt: "Consulta de similaridade vetorial contra o índice de embeddings",
    },
    secure: false,
  },
  {
    source: "agent",
    target: "mcp",
    label: "MCP",
    protocol: "MCP · stdio (JSON-RPC)",
    detail: {
      en: "Tool discovery and invocation over the Model Context Protocol",
      pt: "Descoberta e invocação de ferramentas pelo Model Context Protocol",
    },
    secure: false,
  },
  {
    source: "agent",
    target: "llm",
    label: "HTTPS · TLS",
    protocol: "HTTPS / TLS",
    detail: {
      en: "Chat Completions request to the managed model endpoint",
      pt: "Requisição Chat Completions ao endpoint do modelo gerenciado",
    },
    secure: true,
  },
];

// --- Resolvers + per-language caches -----------------------------------------

function resolveStation(s: StationSrc, lang: Lang): StationMeta {
  return {
    ...s,
    subtitle: r(s.subtitle, lang),
    blurb: r(s.blurb, lang),
    tech: s.tech.map((t) => ({ k: r(t.k, lang), v: t.v })),
  };
}

function resolveTier(t: TierSrc, lang: Lang): TierMeta {
  return { ...t, title: r(t.title, lang), generic: r(t.generic, lang) };
}

function resolveHop(h: HopSrc, lang: Lang): HopMeta {
  return { ...h, label: r(h.label, lang), protocol: r(h.protocol, lang), detail: r(h.detail, lang) };
}

const stationsCache: Partial<Record<Lang, StationMeta[]>> = {};
const stationByIdCache: Partial<Record<Lang, Record<StationId, StationMeta>>> = {};
const tiersCache: Partial<Record<Lang, TierMeta[]>> = {};
const tierByIdCache: Partial<Record<Lang, Record<TierId, TierMeta>>> = {};
const hopsCache: Partial<Record<Lang, HopMeta[]>> = {};

export function stationsFor(lang: Lang): StationMeta[] {
  return (stationsCache[lang] ??= STATIONS_SRC.map((s) => resolveStation(s, lang)));
}

export function stationByIdFor(lang: Lang): Record<StationId, StationMeta> {
  return (stationByIdCache[lang] ??= stationsFor(lang).reduce(
    (acc, s) => {
      acc[s.id] = s;
      return acc;
    },
    {} as Record<StationId, StationMeta>,
  ));
}

export function tiersFor(lang: Lang): TierMeta[] {
  return (tiersCache[lang] ??= TIERS_SRC.map((t) => resolveTier(t, lang)));
}

export function tierByIdFor(lang: Lang): Record<TierId, TierMeta> {
  return (tierByIdCache[lang] ??= tiersFor(lang).reduce(
    (acc, t) => {
      acc[t.id] = t;
      return acc;
    },
    {} as Record<TierId, TierMeta>,
  ));
}

export function hopsFor(lang: Lang): HopMeta[] {
  return (hopsCache[lang] ??= HOPS_SRC.map((h) => resolveHop(h, lang)));
}

// Lang-independent structural exports (ids / endpoints) — for pure logic such
// as deriveView that has no language context.
export const STATION_IDS: StationId[] = STATIONS_SRC.map((s) => s.id);
export const HOP_PAIRS: { source: StationId; target: StationId }[] = HOPS_SRC.map((h) => ({
  source: h.source,
  target: h.target,
}));

// Lang-independent mapping from a trace stage to the station that owns it.
export const STAGE_TO_STATION: Record<Stage, StationId> = STATIONS_SRC.reduce(
  (acc, station) => {
    for (const stage of station.stages) acc[stage] = station.id;
    return acc;
  },
  {} as Record<Stage, StationId>,
);
