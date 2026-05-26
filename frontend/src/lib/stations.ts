// Visual model of the architecture: stations (the moving parts), grouped into
// tiers (deployable containers), connected by network hops (with protocols),
// all sitting inside a private network boundary (VNet / VPC).
//
// The model is cloud-agnostic: every tier/station/hop carries a `generic` role
// (the thing that matters, translatable) plus a `clouds` map of concrete
// example services per provider (Azure / AWS / GCP — proper nouns, not
// translated). The active provider is chosen in lib/cloud.ts; use `cloudValue`
// to resolve a label for it.
//
// Translatable prose is written as `{ en, pt }`; values identical in every
// language (code, protocols, proper nouns) stay plain strings. Use the
// `*For(lang)` builders to get fully-resolved, plain-string structures; results
// are cached per language so references stay stable across renders.

import type { Lang } from "../i18n";
import type { Stage } from "../types/events";
import type { CloudMap } from "./cloud";

export type StationId = "frontend" | "backend" | "agent" | "rag" | "mcp" | "llm" | "database";
export type TierId = "client" | "api" | "agent" | "services";
export type NetworkZone = "public" | "private";

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
  generic: string; // cloud-agnostic role (the thing that matters)
  clouds: CloudMap; // concrete example service per provider
  tech: TechRow[];
  stages: Stage[];
  position: { x: number; y: number };
}

export interface TierMeta {
  id: TierId;
  title: string;
  alias: string; // canonical n-tier name (Presentation / Application / Data …)
  generic: string; // cloud-agnostic description
  clouds: CloudMap; // example: what hosts this container/tier per provider
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
  zone: NetworkZone; // public internet vs inside the private network
  controls: string; // network/security controls on this hop (WAF, mTLS, …)
}

export interface BoundaryMeta {
  id: string;
  label: string; // e.g. "Private network"
  generic: string;
  clouds: CloudMap; // VNet / VPC / VPC
  accent: string;
  box: { x: number; y: number; w: number; h: number };
}

// --- Source data (translatable fields as `Tr`) -------------------------------

interface TechRowSrc {
  k: Tr;
  v: string;
}
type StationSrc = Omit<StationMeta, "title" | "subtitle" | "blurb" | "generic" | "tech"> & {
  title: Tr;
  subtitle: Tr;
  blurb: Tr;
  generic: Tr;
  tech: TechRowSrc[];
};
type TierSrc = Omit<TierMeta, "title" | "alias" | "generic"> & {
  title: Tr;
  alias: Tr;
  generic: Tr;
};
type HopSrc = Omit<HopMeta, "label" | "protocol" | "detail" | "controls"> & {
  label: Tr;
  protocol: Tr;
  detail: Tr;
  controls: Tr;
};
type BoundarySrc = Omit<BoundaryMeta, "label" | "generic"> & { label: Tr; generic: Tr };

// Tiers = separate deployable units (containers). Network crosses their borders.
// `alias` is the canonical n-tier name so the friendly label stays market-aligned.
const TIERS_SRC: TierSrc[] = [
  {
    id: "client",
    title: { en: "Client Tier", pt: "Camada Cliente" },
    alias: { en: "Presentation tier", pt: "Camada de apresentação" },
    generic: { en: "Static hosting / CDN + WAF", pt: "Hospedagem estática / CDN + WAF" },
    clouds: {
      azure: "Azure Static Web Apps + Front Door",
      aws: "S3 + CloudFront + WAF",
      gcp: "Cloud Storage + Cloud CDN + Cloud Armor",
    },
    accent: "#38bdf8",
    box: { x: 8, y: 150, w: 272, h: 236 },
  },
  {
    id: "api",
    title: { en: "API Tier", pt: "Camada de API" },
    alias: { en: "Application tier", pt: "Camada de aplicação" },
    generic: { en: "Containerized web service", pt: "Serviço web em container" },
    clouds: {
      azure: "Azure Container Apps (public ingress)",
      aws: "App Runner / ECS Fargate + ALB",
      gcp: "Cloud Run (HTTPS LB)",
    },
    accent: "#a78bfa",
    box: { x: 312, y: 150, w: 272, h: 236 },
  },
  {
    id: "agent",
    title: { en: "Agent Tier", pt: "Camada do Agente" },
    alias: { en: "Compute / worker (private)", pt: "Compute / worker (privado)" },
    generic: { en: "Private agent runtime service", pt: "Serviço de runtime privado do agente" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private subnet)",
      gcp: "Cloud Run (internal ingress)",
    },
    accent: "#f472b6",
    box: { x: 616, y: 150, w: 272, h: 236 },
  },
  {
    id: "services",
    title: { en: "AI & Data Services", pt: "Serviços de IA e Dados" },
    alias: { en: "Data tier", pt: "Camada de dados" },
    generic: { en: "Managed AI + databases", pt: "IA gerenciada + bancos de dados" },
    clouds: {
      azure: "Azure OpenAI · AI Search · SQL",
      aws: "Bedrock · OpenSearch · RDS",
      gcp: "Vertex AI · Vector Search · Cloud SQL",
    },
    accent: "#34d399",
    box: { x: 956, y: 20, w: 300, h: 560 },
  },
];

// The private network (VNet / VPC) that wraps every tier except the public
// client — drawn as a boundary behind the tier boxes.
const BOUNDARY_SRC: BoundarySrc = {
  id: "vnet",
  label: { en: "Private network", pt: "Rede privada" },
  generic: { en: "Private network (VNet / VPC)", pt: "Rede privada (VNet / VPC)" },
  clouds: {
    azure: "Azure Virtual Network (VNet)",
    aws: "AWS VPC",
    gcp: "Google Cloud VPC",
  },
  accent: "#5b7cfa",
  box: { x: 298, y: 6, w: 972, h: 588 },
};

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
    generic: { en: "Browser SPA on static hosting + CDN", pt: "SPA no navegador em hosting estático + CDN" },
    clouds: {
      azure: "Azure Static Web Apps",
      aws: "S3 + CloudFront",
      gcp: "Cloud Storage + Cloud CDN",
    },
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
      en: "A FastAPI web service terminates TLS at the ingress, validates the request, reads recent history from the database, opens an SSE response, and invokes the agent — relaying every trace event back to the browser.",
      pt: "Um serviço web FastAPI encerra o TLS no ingress, valida a requisição, lê o histórico recente do banco, abre uma resposta SSE e invoca o agente — repassando cada evento de trace ao navegador.",
    },
    generic: { en: "Containerized API · public ingress", pt: "API em container · ingress público" },
    clouds: {
      azure: "Azure Container Apps",
      aws: "App Runner / ECS Fargate",
      gcp: "Cloud Run",
    },
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
    generic: { en: "Private container runtime", pt: "Runtime privado em container" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
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
    id: "database",
    tier: "services",
    title: { en: "App Database", pt: "Banco da Aplicação" },
    subtitle: { en: "Relational · app state", pt: "Relacional · estado da app" },
    icon: "🗄️",
    accent: "#60a5fa",
    tag: "SQL",
    blurb: {
      en: "The application's system of record — conversations and history. A real SQLite store here (separate from the RAG vector DB); in production a managed relational service. The backend reads recent history and persists each conversation.",
      pt: "O sistema de registro da aplicação — conversas e histórico. Aqui é um SQLite real (separado do vector DB do RAG); em produção, um serviço relacional gerenciado. O backend lê o histórico recente e persiste cada conversa.",
    },
    generic: { en: "Managed relational database", pt: "Banco relacional gerenciado" },
    clouds: {
      azure: "Azure SQL / Cosmos DB",
      aws: "Amazon RDS / Aurora",
      gcp: "Cloud SQL / AlloyDB",
    },
    tech: [
      { k: { en: "engine", pt: "engine" }, v: "SQLite (demo) / managed SQL" },
      { k: { en: "access", pt: "acesso" }, v: "backend · private network" },
      { k: { en: "data", pt: "dados" }, v: "conversations, history" },
      { k: { en: "isolation", pt: "isolamento" }, v: "per-request connection" },
    ],
    stages: ["db.read", "db.write"],
    position: { x: 980, y: 60 },
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
    generic: { en: "Managed vector database", pt: "Banco de dados vetorial gerenciado" },
    clouds: {
      azure: "Azure AI Search / Chroma",
      aws: "Amazon OpenSearch / Kendra",
      gcp: "Vertex AI Vector Search",
    },
    tech: [
      { k: { en: "store", pt: "armazenamento" }, v: "Chroma (persistent)" },
      { k: { en: "index", pt: "índice" }, v: "HNSW" },
      { k: { en: "metric", pt: "métrica" }, v: "cosine similarity" },
      { k: { en: "embeddings", pt: "embeddings" }, v: "text-embedding-3-small / mock" },
    ],
    stages: ["rag.embed", "rag.search", "rag.retrieve"],
    position: { x: 980, y: 195 },
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
    generic: { en: "Tool service (sidecar)", pt: "Serviço de ferramentas (sidecar)" },
    clouds: {
      azure: "Sidecar container / ACA",
      aws: "Sidecar / ECS task",
      gcp: "Sidecar / Cloud Run",
    },
    tech: [
      { k: { en: "protocol", pt: "protocolo" }, v: "Model Context Protocol" },
      { k: { en: "transport", pt: "transporte" }, v: "stdio (JSON-RPC)" },
      { k: { en: "tools", pt: "ferramentas" }, v: "calculator, current_time, kb_lookup" },
    ],
    stages: ["mcp.discover", "mcp.call"],
    position: { x: 980, y: 330 },
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
    generic: { en: "Managed model endpoint", pt: "Endpoint de modelo gerenciado" },
    clouds: {
      azure: "Azure OpenAI",
      aws: "Amazon Bedrock",
      gcp: "Vertex AI",
    },
    tech: [
      { k: { en: "model", pt: "modelo" }, v: "gpt-4o-mini / mock" },
      { k: { en: "api", pt: "api" }, v: "Chat Completions" },
      { k: { en: "output", pt: "saída" }, v: "streamed token-by-token" },
      { k: { en: "security", pt: "segurança" }, v: "HTTPS · TLS" },
    ],
    stages: ["llm.prompt", "llm.generate"],
    position: { x: 980, y: 465 },
  },
];

// Network hops between stations. Cross-tier hops are real network calls; each
// carries its security `zone` and the `controls` enforced on it.
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
    zone: "public",
    controls: { en: "WAF · DDoS · TLS 1.3", pt: "WAF · DDoS · TLS 1.3" },
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
    zone: "private",
    controls: { en: "mTLS · NSG / Security Group", pt: "mTLS · NSG / Security Group" },
  },
  {
    source: "backend",
    target: "database",
    label: "SQL",
    protocol: { en: "TCP · SQL (TLS)", pt: "TCP · SQL (TLS)" },
    detail: {
      en: "Reads recent history and persists each conversation over a private connection",
      pt: "Lê o histórico recente e persiste cada conversa por uma conexão privada",
    },
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · NSG", pt: "Private Endpoint · NSG" },
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
    zone: "private",
    controls: { en: "Private Endpoint", pt: "Private Endpoint" },
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
    zone: "private",
    controls: { en: "local IPC (stdio)", pt: "IPC local (stdio)" },
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
    zone: "private",
    controls: { en: "Private Endpoint · TLS (egress)", pt: "Private Endpoint · TLS (egress)" },
  },
];

// --- Resolvers + per-language caches -----------------------------------------

function resolveStation(s: StationSrc, lang: Lang): StationMeta {
  return {
    ...s,
    title: r(s.title, lang),
    subtitle: r(s.subtitle, lang),
    blurb: r(s.blurb, lang),
    generic: r(s.generic, lang),
    tech: s.tech.map((t) => ({ k: r(t.k, lang), v: t.v })),
  };
}

function resolveTier(t: TierSrc, lang: Lang): TierMeta {
  return {
    ...t,
    title: r(t.title, lang),
    alias: r(t.alias, lang),
    generic: r(t.generic, lang),
  };
}

function resolveHop(h: HopSrc, lang: Lang): HopMeta {
  return {
    ...h,
    label: r(h.label, lang),
    protocol: r(h.protocol, lang),
    detail: r(h.detail, lang),
    controls: r(h.controls, lang),
  };
}

function resolveBoundary(b: BoundarySrc, lang: Lang): BoundaryMeta {
  return { ...b, label: r(b.label, lang), generic: r(b.generic, lang) };
}

const stationsCache: Partial<Record<Lang, StationMeta[]>> = {};
const stationByIdCache: Partial<Record<Lang, Record<StationId, StationMeta>>> = {};
const tiersCache: Partial<Record<Lang, TierMeta[]>> = {};
const tierByIdCache: Partial<Record<Lang, Record<TierId, TierMeta>>> = {};
const hopsCache: Partial<Record<Lang, HopMeta[]>> = {};
const boundaryCache: Partial<Record<Lang, BoundaryMeta>> = {};

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

export function boundaryFor(lang: Lang): BoundaryMeta {
  return (boundaryCache[lang] ??= resolveBoundary(BOUNDARY_SRC, lang));
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
