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
import type { Scenario } from "./scenario";

export type StationId =
  | "frontend"
  | "backend"
  | "agent"
  | "rag"
  | "ingestion" // 033-ingestion-node — the offline RAG indexer (owns rag.ingest.*)
  | "storage" // 034-storage-ingestion-flow — durable object storage for uploads
  | "mcp"
  | "llm"
  | "database"
  // 008-scenario-framework preview nodes (non-executing until their own spec):
  | "reranker" // intermediate
  | "gateway" // advanced — AI-Ops tier
  | "guardrails"
  | "cache"
  | "eval"
  | "observability"
  // Advanced-rung sub-agents (multi-agent preview): the orchestrator is the
  // relabelled `agent` node; these are the workers it delegates to. Non-executing
  // previews (label only) until a real multi-agent runtime ships in its own spec.
  | "researcher"
  | "coder"
  | "critic";
export type TierId = "client" | "api" | "agent" | "services" | "aiops";
export type NetworkZone = "public" | "private";

// Every element belongs to one or more rungs of the maturity ladder. Base
// elements (today's app) live in all three; a missing `scenarios` defaults to
// this set so existing data needs no annotation.
const ALL_SCENARIOS: Scenario[] = ["simple", "intermediate", "advanced"];

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
  blurb: string; // what this station does
  // 028-why-this-layer: why the layer is its own thing, and the concrete failure
  // mode if it were removed or merged. Authored on the executing stations;
  // preview nodes may omit them (nothing depends on it there).
  why?: string;
  whatBreaks?: string;
  generic: string; // cloud-agnostic role (the thing that matters)
  clouds: CloudMap; // concrete example service per provider
  tech: TechRow[];
  stages: Stage[];
  position: { x: number; y: number };
  // Maturity-ladder membership (008). A preview node (`comingSoon`) carries no
  // live `stages` — nothing fakes a run on it.
  scenarios: Scenario[];
  comingSoon?: boolean;
}

export interface TierMeta {
  id: TierId;
  title: string;
  alias: string; // canonical n-tier name (Presentation / Application / Data …)
  generic: string; // cloud-agnostic description
  clouds: CloudMap; // example: what hosts this container/tier per provider
  accent: string;
  box: { x: number; y: number; w: number; h: number };
  scenarios: Scenario[];
  comingSoon?: boolean;
}

// How a hop communicates: a blocking request/response, or an asynchronous
// streamed response. The two streaming-capable hops (frontend↔backend and
// agent→llm) flip to "sync" under batch delivery — the canvas overrides them.
export type HopComm = "sync" | "async";

export interface HopMeta {
  source: StationId;
  target: StationId;
  label: string; // short label on the edge
  protocol: string; // full protocol description (inspector)
  detail: string;
  comm: HopComm; // sync (blocking) vs async (streamed) — default for stream mode
  secure: boolean; // draw a lock
  zone: NetworkZone; // public internet vs inside the private network
  controls: string; // network/security controls on this hop (WAF, mTLS, …)
  // Which node handles the edge attaches to (the API↔Agent hop is vertical).
  sourceHandle: "right" | "bottom";
  targetHandle: "left" | "top";
  scenarios: Scenario[];
}

export interface BoundaryMeta {
  id: string;
  label: string; // e.g. "Private network"
  generic: string;
  clouds: CloudMap; // VNet / VPC / VPC
  accent: string;
  box: { x: number; y: number; w: number; h: number };
}

// 032-network-boundary — the public-internet / egress frontier between the public
// client tier and the private interior. Unlike the private boundary it is
// **cloud-generic**: no `clouds` map, so its label never changes with the active
// provider (edge controls already live on the client tier + the frontend→backend
// hop). Geometry is computed in layout.ts.
export interface PublicFrontierMeta {
  id: string;
  label: string;
}

// --- Source data (translatable fields as `Tr`) -------------------------------

interface TechRowSrc {
  k: Tr;
  v: string;
}
type StationSrc = Omit<
  StationMeta,
  "title" | "subtitle" | "blurb" | "why" | "whatBreaks" | "generic" | "tech" | "scenarios"
> & {
  title: Tr;
  subtitle: Tr;
  blurb: Tr;
  why?: Tr;
  whatBreaks?: Tr;
  generic: Tr;
  tech: TechRowSrc[];
  scenarios?: Scenario[]; // omitted ⇒ ALL_SCENARIOS (base element, in every rung)
};
type TierSrc = Omit<TierMeta, "title" | "alias" | "generic" | "scenarios"> & {
  title: Tr;
  alias: Tr;
  generic: Tr;
  scenarios?: Scenario[];
};
type HopSrc = Omit<HopMeta, "label" | "protocol" | "detail" | "controls" | "scenarios"> & {
  label: Tr;
  protocol: Tr;
  detail: Tr;
  controls: Tr;
  scenarios?: Scenario[];
};
type BoundarySrc = Omit<BoundaryMeta, "label" | "generic"> & { label: Tr; generic: Tr };

// Tiers = separate deployable units (containers). Network crosses their borders.
// `alias` is the canonical n-tier name so the friendly label stays market-aligned.
const TIERS_SRC: TierSrc[] = [
  {
    id: "client",
    title: { en: "Client Tier", pt: "Camada Cliente" },
    alias: { en: "Presentation", pt: "Apresentação" },
    generic: { en: "Static hosting / CDN + WAF", pt: "Hospedagem estática / CDN + WAF" },
    clouds: {
      azure: "Azure Static Web Apps + Front Door",
      aws: "S3 + CloudFront + WAF",
      gcp: "Cloud Storage + Cloud CDN + Cloud Armor",
    },
    accent: "var(--color-sky)",
    box: { x: 8, y: 64, w: 272, h: 196 },
  },
  {
    id: "api",
    title: { en: "API Tier", pt: "Camada de API" },
    alias: { en: "Application", pt: "Aplicação" },
    generic: { en: "Containerized web service", pt: "Serviço web em container" },
    clouds: {
      azure: "Azure Container Apps (public ingress)",
      aws: "App Runner / ECS Fargate + ALB",
      gcp: "Cloud Run (HTTPS LB)",
    },
    accent: "var(--color-violet)",
    box: { x: 312, y: 64, w: 272, h: 196 },
  },
  {
    id: "agent",
    title: { en: "Agent Tier", pt: "Camada do Agente" },
    alias: { en: "Compute (private)", pt: "Compute (privado)" },
    generic: { en: "Private agent runtime service", pt: "Serviço de runtime privado do agente" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private subnet)",
      gcp: "Cloud Run (internal ingress)",
    },
    accent: "var(--color-pink)",
    box: { x: 312, y: 320, w: 272, h: 320 },
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
    accent: "var(--color-ok)",
    box: { x: 956, y: 64, w: 300, h: 586 },
  },
  // 008-scenario-framework: the "AI Ops" tier the assessment called for — the
  // control + observability plane of a production agent. Advanced rung only;
  // its nodes are previews (coming soon) until their own specs land.
  {
    id: "aiops",
    title: { en: "AI Ops", pt: "Operações de IA" },
    alias: { en: "Observability & control plane", pt: "Plano de observabilidade e controle" },
    generic: {
      en: "Gateway, guardrails, cache, evals and observability",
      pt: "Gateway, guardrails, cache, evals e observabilidade",
    },
    clouds: {
      azure: "API Management · AI Content Safety · Monitor",
      aws: "API Gateway · Bedrock Guardrails · CloudWatch",
      gcp: "Apigee · Model Armor · Cloud Monitoring",
    },
    accent: "var(--color-warn)",
    box: { x: 1320, y: 64, w: 300, h: 586 },
    scenarios: ["advanced"],
    comingSoon: true,
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
  accent: "var(--color-accent)",
  box: { x: 298, y: 6, w: 972, h: 656 },
};

// 032-network-boundary — the public-internet / egress frontier. Generic only:
// no `clouds` map, so the label is identical in every cloud (AC2).
const PUBLIC_BOUNDARY_SRC: { id: string; label: Tr } = {
  id: "public-internet",
  label: { en: "Public internet / egress", pt: "Internet pública / egress" },
};

const STATIONS_SRC: StationSrc[] = [
  {
    id: "frontend",
    tier: "client",
    title: "Frontend",
    subtitle: { en: "React UI · browser", pt: "UI React · navegador" },
    icon: "🖥️",
    accent: "var(--color-sky)",
    tag: "TLS 1.3",
    blurb: {
      en: "Runs in the user's browser. It POSTs the message over HTTPS and holds open a Server-Sent Events connection, rendering each stage — and the streamed answer — as events arrive.",
      pt: "Roda no navegador do usuário. Envia a mensagem via POST sobre HTTPS e mantém aberta uma conexão Server-Sent Events, renderizando cada etapa — e a resposta transmitida — conforme os eventos chegam.",
    },
    why: {
      en: "The UI is kept thin and client-side so a CDN can serve it globally while every secret and decision stays on the server — the browser is the only piece running on the user's device.",
      pt: "A UI é mantida fina e client-side para uma CDN servi-la globalmente enquanto todo segredo e decisão ficam no servidor — o navegador é a única peça rodando no dispositivo do usuário.",
    },
    whatBreaks: {
      en: "Put logic or keys in the browser and anyone can read them from devtools. Honest caveat: this demo has no real authentication — it is a stub; production needs login, sessions and rate limiting before the agent ever runs.",
      pt: "Coloque lógica ou chaves no navegador e qualquer um as lê pelo devtools. Ressalva honesta: esta demo não tem autenticação real — é um stub; produção precisa de login, sessões e rate limiting antes de o agente rodar.",
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
    position: { x: 40, y: 112 },
  },
  {
    id: "backend",
    tier: "api",
    title: "Backend",
    subtitle: "FastAPI · ASGI",
    icon: "⚙️",
    accent: "var(--color-violet)",
    tag: "ASGI",
    blurb: {
      en: "A FastAPI web service terminates TLS at the ingress, validates the request, reads recent history from the database, opens an SSE response, and invokes the agent — relaying every trace event back to the browser.",
      pt: "Um serviço web FastAPI encerra o TLS no ingress, valida a requisição, lê o histórico recente do banco, abre uma resposta SSE e invoca o agente — repassando cada evento de trace ao navegador.",
    },
    why: {
      en: "A thin, validated public edge is the only internet-facing surface: it terminates TLS, checks the request, and is the single door an attacker can knock on — keeping the agent runtime off the public internet.",
      pt: "Uma borda pública fina e validada é a única superfície voltada à internet: encerra o TLS, valida a requisição e é a única porta em que um atacante pode bater — mantendo o runtime do agente fora da internet pública.",
    },
    whatBreaks: {
      en: "Without a dedicated edge the agent runtime would face the internet directly. Honest caveat: this demo has no real auth — authentication is a stub; production needs authn/z, sessions and rate limiting at this layer before any agent work.",
      pt: "Sem uma borda dedicada o runtime do agente ficaria exposto direto à internet. Ressalva honesta: esta demo não tem autenticação real — é um stub; produção precisa de authn/z, sessões e rate limiting nesta camada antes de qualquer trabalho do agente.",
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
    position: { x: 340, y: 112 },
  },
  {
    id: "agent",
    tier: "agent",
    title: "Agent",
    subtitle: { en: "LangGraph runtime", pt: "runtime LangGraph" },
    icon: "🧠",
    accent: "var(--color-pink)",
    tag: "ReAct",
    blurb: {
      en: "A LangGraph state machine on a private network. It reasons in a loop: decide whether to call a tool — search the knowledge base, run a calculation, check the time — observe the result, and reason again, until it can answer. The agent owns every tool-call decision, including whether to retrieve.",
      pt: "Uma máquina de estados LangGraph em rede privada. Raciocina em loop: decidir se chama uma ferramenta — buscar na base de conhecimento, calcular, consultar a hora — observar o resultado e raciocinar de novo, até poder responder. O agente decide cada chamada de ferramenta, inclusive se vai recuperar contexto.",
    },
    why: {
      en: "The reasoning loop holds tool access and model credentials, so it runs on a private network the internet can't reach directly — least privilege at the most sensitive layer.",
      pt: "O loop de raciocínio detém o acesso às ferramentas e as credenciais do modelo, então roda numa rede privada que a internet não alcança diretamente — menor privilégio na camada mais sensível.",
    },
    whatBreaks: {
      en: "Put it in the public API container and a single web-tier compromise exposes every tool credential and the model egress — the blast radius becomes the whole system instead of one isolated service.",
      pt: "Coloque-o no container da API pública e um único comprometimento da camada web expõe todas as credenciais de ferramentas e a saída do modelo — o raio de impacto passa a ser o sistema inteiro em vez de um serviço isolado.",
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
      { k: { en: "flow", pt: "fluxo" }, v: "route → think ⇄ tools (search KB · calc · …) → generate" },
      { k: { en: "state", pt: "estado" }, v: "in-process per request" },
    ],
    stages: ["agent.route", "agent.think"],
    position: { x: 340, y: 430 },
  },
  {
    id: "database",
    tier: "services",
    title: { en: "App Database", pt: "Banco da Aplicação" },
    subtitle: { en: "Relational · app state", pt: "Relacional · estado da app" },
    icon: "🗄️",
    accent: "var(--color-blue)",
    tag: "SQL",
    blurb: {
      en: "The application's system of record — conversations and history. A real SQLite store here (separate from the RAG vector DB); in production a managed relational service. The backend reads recent history and persists each conversation.",
      pt: "O sistema de registro da aplicação — conversas e histórico. Aqui é um SQLite real (separado do vector DB do RAG); em produção, um serviço relacional gerenciado. O backend lê o histórico recente e persiste cada conversa.",
    },
    why: {
      en: "Transactional conversation state needs ACID guarantees and a different engine than vector search, so the relational store is its own service — reached over a pooled, TLS connection.",
      pt: "O estado transacional da conversa precisa de garantias ACID e de um motor diferente do da busca vetorial, então o banco relacional é um serviço próprio — acessado por uma conexão TLS com pool.",
    },
    whatBreaks: {
      en: "Merge it into the vector DB and you lose ACID or pay vector-search latency on every read. Honest caveat: this demo is single-instance (the trace store is in-memory, lost on restart, not shared across replicas); production fronts the DB with a connection pool and runs more than one replica.",
      pt: "Funda-o no banco vetorial e você perde o ACID ou paga a latência da busca vetorial em cada leitura. Ressalva honesta: esta demo é de instância única (o armazenamento de traces fica em memória, perdido ao reiniciar, não compartilhado entre réplicas); produção coloca um pool de conexões na frente do banco e roda mais de uma réplica.",
    },
    generic: { en: "Managed relational database", pt: "Banco relacional gerenciado" },
    clouds: {
      azure: "Azure SQL / Cosmos DB",
      aws: "Amazon RDS / Aurora",
      gcp: "Cloud SQL / AlloyDB",
    },
    tech: [
      { k: { en: "engine", pt: "engine" }, v: "SQLite (dev) / managed SQL" },
      { k: { en: "protocol", pt: "protocolo" }, v: "in-process driver / SQL wire · TLS" },
      { k: { en: "access", pt: "acesso" }, v: "backend · private network" },
      { k: { en: "data", pt: "dados" }, v: "conversations, history" },
      { k: { en: "isolation", pt: "isolamento" }, v: "per-request connection" },
    ],
    stages: ["db.read", "db.write"],
    position: { x: 980, y: 112 },
  },
  {
    id: "storage",
    tier: "services",
    title: { en: "Object Storage", pt: "Armazenamento de objetos" },
    subtitle: { en: "Uploaded documents", pt: "Documentos enviados" },
    icon: "🪣",
    accent: "var(--color-ok)",
    tag: "BLOB",
    blurb: {
      en: "Durable object storage for uploaded files. On upload the API writes the document here first; the indexer then reads it back to chunk, embed and upsert. Storing the original decouples “received” from “indexed” and lets the file be re-chunked when the embedding model changes.",
      pt: "Armazenamento de objetos durável para arquivos enviados. No upload, a API grava o documento aqui primeiro; o indexador então o lê de volta para chunkar, embeddar e fazer upsert. Guardar o original desacopla “recebido” de “indexado” e permite re-chunkar o arquivo quando o modelo de embedding muda.",
    },
    why: {
      en: "Uploading the file to durable object storage first decouples “received” from “indexed”: the original is safely stored before (and independently of) chunking, can be re-indexed when the embedding model changes, and is reached over a private endpoint rather than the public internet.",
      pt: "Enviar o arquivo primeiro para um armazenamento de objetos durável desacopla “recebido” de “indexado”: o original é guardado com segurança antes de (e independentemente de) ser chunkado, pode ser reindexado quando o modelo de embedding muda, e é acessado por um endpoint privado em vez da internet pública.",
    },
    whatBreaks: {
      en: "Skip object storage and ingestion has only the in-flight request bytes: if indexing fails there is nothing to retry from, you can't re-chunk after a model change, and a large upload must be held in memory instead of streamed from a durable store.",
      pt: "Pule o armazenamento de objetos e a ingestão só tem os bytes da requisição em trânsito: se a indexação falhar não há de onde repetir, você não consegue re-chunkar após uma troca de modelo, e um upload grande precisa ficar em memória em vez de ser lido de um store durável.",
    },
    generic: { en: "Object / blob storage", pt: "Armazenamento de objetos / blobs" },
    clouds: {
      azure: "Azure Blob Storage",
      aws: "Amazon S3",
      gcp: "Cloud Storage",
    },
    tech: [
      { k: { en: "store", pt: "armazenamento" }, v: "filesystem (Blob/S3 stand-in)" },
      { k: { en: "key", pt: "chave" }, v: "session / document / filename" },
      { k: { en: "order", pt: "ordem" }, v: "write-before-index" },
      { k: { en: "access", pt: "acesso" }, v: "private endpoint" },
    ],
    stages: ["storage.upload"],
    position: { x: 980, y: 280 },
  },
  {
    id: "rag",
    tier: "services",
    title: "RAG · Vector DB",
    subtitle: "Chroma",
    icon: "📚",
    accent: "var(--color-ok)",
    tag: "cosine",
    blurb: {
      en: "Embeds the query and runs an approximate nearest-neighbor search over the knowledge base using cosine similarity, returning the most relevant top-k chunks as grounding context. It also ingests user-uploaded PDFs — chunk → embed → store — so the agent can ground answers on your own documents.",
      pt: "Gera o embedding da consulta e executa uma busca aproximada por vizinhos mais próximos na base de conhecimento usando similaridade de cosseno, retornando os top-k trechos mais relevantes como contexto de fundamentação. Também faz a ingestão de PDFs enviados pelo usuário — dividir → incorporar → armazenar — para o agente fundamentar respostas nos seus próprios documentos.",
    },
    why: {
      en: "Approximate-nearest-neighbour search over embeddings is a distinct job from transactional storage: a vector index (HNSW, cosine) makes 'find the most similar chunks' fast — something a relational DB can't do efficiently.",
      pt: "A busca aproximada por vizinhos mais próximos sobre embeddings é um trabalho distinto do armazenamento transacional: um índice vetorial (HNSW, cosseno) torna rápido 'achar os trechos mais similares' — algo que um banco relacional não faz de forma eficiente.",
    },
    whatBreaks: {
      en: "Without a vector store the agent can't ground answers in your documents — it falls back to the model's parametric memory, which goes stale and hallucinates on facts outside its training.",
      pt: "Sem um banco vetorial o agente não consegue fundamentar respostas nos seus documentos — recai na memória paramétrica do modelo, que envelhece e alucina sobre fatos fora do treinamento.",
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
      { k: { en: "embeddings", pt: "embeddings" }, v: "text-embedding-3-small" },
      { k: { en: "query", pt: "consulta" }, v: "embed → search → retrieve top-k" },
    ],
    // 033-ingestion-node: the rag.ingest.* stages moved to the `ingestion`
    // station; the query-time RAG node keeps only embed/search/retrieve.
    stages: ["rag.embed", "rag.search", "rag.retrieve"],
    position: { x: 980, y: 320 },
  },
  {
    id: "ingestion",
    tier: "services",
    title: { en: "Ingestion / Indexer", pt: "Ingestão / Indexador" },
    subtitle: { en: "Offline index build", pt: "Construção offline do índice" },
    icon: "📥",
    accent: "var(--color-ok)",
    tag: "INDEX",
    blurb: {
      en: "Builds the knowledge base offline: split documents into chunks, embed them, and upsert the vectors into the index. Runs on startup (if missing), on each PDF upload, and rebuilds when the embedding model/dimension changes.",
      pt: "Constrói a base de conhecimento offline: divide documentos em chunks, gera embeddings e faz upsert dos vetores no índice. Roda na inicialização (se ausente), a cada upload de PDF e reconstrói quando o modelo/dimensão de embedding muda.",
    },
    why: {
      en: "Indexing is the offline half of RAG and a different job from query-time search: documents are chunked, embedded and upserted ahead of time so retrieval can be fast at request time. Chunking strategy and refresh policy live here, not on the query path.",
      pt: "A indexação é a metade offline do RAG e um trabalho diferente da busca em tempo de consulta: documentos são chunkados, embeddados e feito upsert com antecedência para a recuperação ser rápida na requisição. A estratégia de chunking e a política de atualização vivem aqui, não no caminho da consulta.",
    },
    whatBreaks: {
      en: "Skip the indexer and there is nothing to retrieve — the agent has no grounding. A stale or badly-chunked index quietly wrecks answer quality: chunks too big bury the answer, too small lose context, and an index not re-embedded after a model change silently mismatches the query vectors.",
      pt: "Pule o indexador e não há o que recuperar — o agente fica sem fundamentação. Um índice desatualizado ou mal chunkado destrói silenciosamente a qualidade: chunks grandes demais soterram a resposta, pequenos demais perdem contexto, e um índice não re-embeddado após troca de modelo descasa silenciosamente dos vetores da consulta.",
    },
    generic: { en: "Offline indexing / ingestion job", pt: "Job de indexação / ingestão offline" },
    clouds: {
      azure: "Azure AI Search indexer / Functions",
      aws: "OpenSearch Ingestion / Glue",
      gcp: "Vertex AI Pipelines / Dataflow",
    },
    tech: [
      { k: { en: "pipeline", pt: "pipeline" }, v: "docs → chunk → embed → upsert" },
      { k: { en: "chunking", pt: "chunking" }, v: "900 chars / 150 overlap" },
      { k: { en: "embeddings", pt: "embeddings" }, v: "text-embedding-3-small" },
      { k: { en: "trigger", pt: "gatilho" }, v: "startup · PDF upload · dim drift" },
    ],
    stages: ["rag.ingest.chunk", "rag.ingest.embed", "rag.ingest.store"],
    position: { x: 980, y: 400 },
  },
  {
    id: "mcp",
    tier: "services",
    title: "MCP Tools",
    subtitle: "Model Context Protocol",
    icon: "🔧",
    accent: "var(--color-warn)",
    tag: "MCP",
    blurb: {
      en: "An MCP server exposes tools to the agent. The agent discovers them, and when the model chooses one, the call and its result travel over the MCP transport (here, stdio / JSON-RPC).",
      pt: "Um servidor MCP expõe ferramentas ao agente. O agente as descobre e, quando o modelo escolhe uma, a chamada e seu resultado trafegam pelo transporte MCP (aqui, stdio / JSON-RPC).",
    },
    why: {
      en: "Tools sit behind a standard protocol (MCP) as a separate process so the agent doesn't hard-link tool code, secrets or dependencies — they can be swapped, sandboxed and scaled independently.",
      pt: "As ferramentas ficam atrás de um protocolo padrão (MCP) como processo separado para o agente não acoplar código, segredos ou dependências de ferramentas — podem ser trocadas, isoladas e escaladas de forma independente.",
    },
    whatBreaks: {
      en: "Inline the tools and every tool dependency and secret lives in the agent process. Note stdio is local-only — when tools must scale or run out-of-process, MCP also speaks HTTP/SSE as the transport.",
      pt: "Embuta as ferramentas e toda dependência e segredo de ferramenta passa a viver no processo do agente. Note que o stdio é apenas local — quando as ferramentas precisam escalar ou rodar fora do processo, o MCP também fala HTTP/SSE como transporte.",
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
    position: { x: 980, y: 430 },
  },
  {
    id: "llm",
    tier: "services",
    title: "LLM",
    subtitle: { en: "Chat completions", pt: "Chat completions" },
    icon: "✨",
    accent: "var(--color-orange)",
    tag: "stream",
    blurb: {
      en: "Receives the assembled prompt (system + context + tool results) over HTTPS and streams the answer back token by token — which is why the response types itself out in the chat.",
      pt: "Recebe o prompt montado (sistema + contexto + resultados de ferramentas) sobre HTTPS e transmite a resposta de volta token a token — por isso a resposta vai sendo digitada no chat.",
    },
    why: {
      en: "Generation runs on a managed model endpoint reached over TLS, not in your process: the weights are huge, GPU-bound and provider-operated, so you call them as a service.",
      pt: "A geração roda num endpoint de modelo gerenciado acessado por TLS, não no seu processo: os pesos são enormes, dependem de GPU e são operados pelo provedor, então você os chama como serviço.",
    },
    whatBreaks: {
      en: "Without a separate model endpoint you'd have to host and scale GPUs yourself; coupling it into the agent also removes the seam where a gateway can add routing, fallback, budgets and caching.",
      pt: "Sem um endpoint de modelo separado, você teria de hospedar e escalar GPUs por conta própria; acoplá-lo ao agente também remove o ponto onde um gateway pode adicionar roteamento, fallback, orçamentos e cache.",
    },
    generic: { en: "Managed model endpoint", pt: "Endpoint de modelo gerenciado" },
    clouds: {
      azure: "Azure OpenAI",
      aws: "Amazon Bedrock",
      gcp: "Vertex AI",
    },
    // The model is intentionally absent here: it's read live from /api/health and
    // injected by the inspector (B2), so it can never drift from the real env.
    tech: [
      { k: { en: "api", pt: "api" }, v: "Chat Completions" },
      { k: { en: "output", pt: "saída" }, v: "streamed token-by-token" },
      { k: { en: "security", pt: "segurança" }, v: "HTTPS · TLS" },
    ],
    stages: ["llm.prompt", "llm.generate"],
    position: { x: 980, y: 540 },
  },
  // --- 008-scenario-framework preview nodes (non-executing; stages: []) -------
  // Intermediate rung: RAG-quality upgrade beside the vector store.
  {
    id: "reranker",
    tier: "services",
    title: { en: "Reranker", pt: "Reranker" },
    subtitle: { en: "Cross-encoder", pt: "Cross-encoder" },
    icon: "🎚️",
    accent: "var(--color-ok)",
    tag: "RERANK",
    blurb: {
      en: "Re-scores the top candidates with a cross-encoder so the most relevant chunks lead.",
      pt: "Reordena os melhores candidatos com um cross-encoder para os trechos mais relevantes liderarem.",
    },
    generic: { en: "Cross-encoder reranker", pt: "Reranker cross-encoder" },
    clouds: {
      azure: "AI Search semantic ranker",
      aws: "Bedrock / Cohere Rerank",
      gcp: "Vertex Ranking API",
    },
    tech: [
      { k: { en: "model", pt: "modelo" }, v: "cross-encoder" },
      { k: { en: "input", pt: "entrada" }, v: "top-N candidates" },
    ],
    stages: [],
    position: { x: 980, y: 600 },
    scenarios: ["intermediate", "advanced"],
    comingSoon: true,
  },
  // Advanced rung: the AI-Ops control + observability plane.
  {
    id: "gateway",
    tier: "aiops",
    title: { en: "LLM Gateway", pt: "Gateway LLM" },
    subtitle: { en: "Router · fallback", pt: "Roteador · fallback" },
    icon: "🚦",
    accent: "var(--color-warn)",
    tag: "GATEWAY",
    blurb: {
      en: "A single egress for every model call: routing, retries, provider fallback and budget caps.",
      pt: "Uma saída única para toda chamada de modelo: roteamento, retries, fallback entre provedores e limites de orçamento.",
    },
    generic: { en: "LLM gateway / router", pt: "Gateway / roteador de LLM" },
    clouds: {
      azure: "API Management (AI gateway)",
      aws: "Bedrock + API Gateway",
      gcp: "Apigee / Vertex endpoints",
    },
    tech: [
      { k: { en: "role", pt: "papel" }, v: "router" },
      { k: { en: "features", pt: "recursos" }, v: "retry · fallback · budget" },
    ],
    stages: [],
    position: { x: 1340, y: 120 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  {
    id: "guardrails",
    tier: "aiops",
    title: { en: "Guardrails", pt: "Guardrails" },
    subtitle: { en: "Input / output safety", pt: "Segurança entrada/saída" },
    icon: "🛡️",
    accent: "var(--color-warn)",
    tag: "SAFETY",
    blurb: {
      en: "Checks prompts and answers for injection, PII and unsafe content before they pass.",
      pt: "Verifica prompts e respostas contra injection, PII e conteúdo inseguro antes de passarem.",
    },
    generic: { en: "Input/output safety filter", pt: "Filtro de segurança de entrada/saída" },
    clouds: {
      azure: "AI Content Safety",
      aws: "Bedrock Guardrails",
      gcp: "Model Armor",
    },
    tech: [{ k: { en: "checks", pt: "checagens" }, v: "injection · PII · toxicity" }],
    stages: [],
    position: { x: 1340, y: 240 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  {
    id: "cache",
    tier: "aiops",
    title: { en: "Semantic Cache", pt: "Cache Semântico" },
    subtitle: { en: "Prompt / embedding cache", pt: "Cache de prompt/embedding" },
    icon: "⚡",
    accent: "var(--color-warn)",
    tag: "CACHE",
    blurb: {
      en: "Returns a stored answer for semantically-near queries — big latency and cost savings.",
      pt: "Devolve uma resposta armazenada para consultas semanticamente próximas — grande economia de latência e custo.",
    },
    generic: { en: "Semantic / prompt cache", pt: "Cache semântico / de prompt" },
    clouds: {
      azure: "Azure Cache for Redis",
      aws: "ElastiCache (Redis)",
      gcp: "Memorystore (Redis)",
    },
    tech: [{ k: { en: "keys", pt: "chaves" }, v: "embedding similarity" }],
    stages: [],
    position: { x: 1340, y: 360 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  {
    id: "eval",
    tier: "aiops",
    title: { en: "Eval Runner", pt: "Eval Runner" },
    subtitle: { en: "RAGAS · LLM-judge", pt: "RAGAS · LLM-juiz" },
    icon: "🧪",
    accent: "var(--color-warn)",
    tag: "EVALS",
    blurb: {
      en: "Scores answers against a golden set (faithfulness, relevancy) and gates regressions in CI.",
      pt: "Pontua respostas contra um golden set (fidelidade, relevância) e barra regressões no CI.",
    },
    generic: { en: "Eval runner (RAGAS / LLM-judge)", pt: "Runner de avaliação (RAGAS / LLM-juiz)" },
    clouds: {
      azure: "Azure AI Evaluation",
      aws: "Bedrock model evaluation",
      gcp: "Vertex Gen AI evaluation",
    },
    tech: [{ k: { en: "metrics", pt: "métricas" }, v: "faithfulness · NDCG" }],
    stages: [],
    position: { x: 1340, y: 480 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  {
    id: "observability",
    tier: "aiops",
    title: { en: "Observability", pt: "Observabilidade" },
    subtitle: { en: "Traces · tokens · cost", pt: "Traces · tokens · custo" },
    icon: "📊",
    accent: "var(--color-warn)",
    tag: "OTEL",
    blurb: {
      en: "Captures every prompt, completion, token count, latency and cost as structured LLM traces.",
      pt: "Captura cada prompt, resposta, contagem de tokens, latência e custo como traces estruturados de LLM.",
    },
    generic: { en: "LLM trace / metrics sink", pt: "Coletor de traces/métricas de LLM" },
    clouds: {
      azure: "Azure Monitor / App Insights",
      aws: "CloudWatch / X-Ray",
      gcp: "Cloud Trace / Monitoring",
    },
    tech: [{ k: { en: "standard", pt: "padrão" }, v: "OpenTelemetry GenAI" }],
    stages: [],
    position: { x: 1340, y: 600 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  // --- Advanced-rung sub-agents (multi-agent preview) ------------------------
  // The orchestrator is the relabelled `agent` node ("DeepAgents + Multi-agents");
  // these are the specialized workers it delegates to. Label-only previews
  // (`stages: []`, comingSoon) so each agent is *visible as its own node* —
  // making clear there's a team, not one loop — without faking a run. A future
  // spec wires a real multi-agent runtime (and per-agent activation).
  {
    id: "researcher",
    tier: "agent",
    title: { en: "Researcher", pt: "Pesquisador" },
    subtitle: { en: "gathers context", pt: "reúne contexto" },
    icon: "🔎",
    accent: "var(--color-pink)",
    tag: "research",
    blurb: {
      en: "A sub-agent specialized in finding information: it runs retrieval and tool lookups, then hands a digest back to the orchestrator.",
      pt: "Um subagente especializado em achar informação: roda recuperação e consultas a ferramentas e devolve um resumo ao orquestrador.",
    },
    generic: { en: "Specialized retrieval sub-agent", pt: "Subagente de recuperação especializado" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [{ k: { en: "role", pt: "papel" }, v: "orchestrator–worker" }],
    stages: [],
    position: { x: 372, y: 700 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  {
    id: "coder",
    tier: "agent",
    title: { en: "Coder", pt: "Programador" },
    subtitle: { en: "executes steps", pt: "executa passos" },
    icon: "💻",
    accent: "var(--color-pink)",
    tag: "execute",
    blurb: {
      en: "A sub-agent that does the work — writing code, calling tools, transforming data — under the orchestrator's plan.",
      pt: "Um subagente que faz o trabalho — escrever código, chamar ferramentas, transformar dados — sob o plano do orquestrador.",
    },
    generic: { en: "Specialized execution sub-agent", pt: "Subagente de execução especializado" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [{ k: { en: "role", pt: "papel" }, v: "orchestrator–worker" }],
    stages: [],
    position: { x: 560, y: 700 },
    scenarios: ["advanced"],
    comingSoon: true,
  },
  {
    id: "critic",
    tier: "agent",
    title: { en: "Critic", pt: "Crítico" },
    subtitle: { en: "reviews output", pt: "revisa a saída" },
    icon: "⚖️",
    accent: "var(--color-pink)",
    tag: "review",
    blurb: {
      en: "A sub-agent that reviews the draft answer for errors and gaps before it ships, sending feedback to the orchestrator.",
      pt: "Um subagente que revisa a resposta rascunho em busca de erros e lacunas antes de sair, enviando feedback ao orquestrador.",
    },
    generic: { en: "Specialized review sub-agent", pt: "Subagente de revisão especializado" },
    clouds: {
      azure: "Azure Container Apps (internal)",
      aws: "ECS Fargate (private)",
      gcp: "Cloud Run (internal)",
    },
    tech: [{ k: { en: "role", pt: "papel" }, v: "orchestrator–worker" }],
    stages: [],
    position: { x: 748, y: 700 },
    scenarios: ["advanced"],
    comingSoon: true,
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
      en: "POST /api/chat — the public request that kicks off the whole pipeline",
      pt: "POST /api/chat — a requisição pública que dá início a todo o pipeline",
    },
    comm: "async", // SSE response (flips to sync in batch mode)
    secure: true,
    zone: "public",
    controls: { en: "WAF · DDoS · TLS 1.3", pt: "WAF · DDoS · TLS 1.3" },
    sourceHandle: "right",
    targetHandle: "left",
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
    comm: "sync", // backend awaits the agent run
    secure: true,
    zone: "private",
    controls: { en: "mTLS · NSG / Security Group", pt: "mTLS · NSG / Security Group" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  {
    source: "backend",
    target: "database",
    label: "SQL · TLS",
    protocol: {
      en: "Database connection — here a SQLite driver call (in-process, no socket); in production a SQL wire protocol (e.g. TDS for SQL Server, the PostgreSQL protocol) over TLS, through a connection pool",
      pt: "Conexão de banco — aqui uma chamada de driver SQLite (in-process, sem socket); em produção um protocolo de fio SQL (ex.: TDS no SQL Server, o protocolo do PostgreSQL) sobre TLS, via um pool de conexões",
    },
    detail: {
      en: "The backend reads recent history and persists each conversation. \"SQL\" is the query language; the transport differs by environment — an in-process file driver here, a pooled TLS connection to a managed SQL service in production.",
      pt: "O backend lê o histórico recente e persiste cada conversa. \"SQL\" é a linguagem de consulta; o transporte muda por ambiente — um driver de arquivo in-process aqui, uma conexão TLS com pool a um serviço SQL gerenciado em produção.",
    },
    comm: "sync", // blocking read / write
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · NSG", pt: "Private Endpoint · NSG" },
    sourceHandle: "right",
    targetHandle: "left",
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
    comm: "sync", // blocking similarity query
    secure: false,
    zone: "private",
    controls: { en: "Private Endpoint", pt: "Private Endpoint" },
    sourceHandle: "right",
    targetHandle: "left",
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
    comm: "sync", // request/response JSON-RPC tool call
    secure: false,
    zone: "private",
    controls: { en: "local IPC (stdio)", pt: "IPC local (stdio)" },
    sourceHandle: "right",
    targetHandle: "left",
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
    comm: "async", // streams tokens back (flips to sync in batch mode)
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · TLS (egress)", pt: "Private Endpoint · TLS (egress)" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  // 034-storage-ingestion-flow — the upload write-path. The Backend orchestrates:
  // it persists the file to storage (backend→storage), then calls the indexer
  // (backend→ingestion), which reads the stored object and upserts the vectors
  // (ingestion→rag). These animate only during a PDF upload; a normal chat leaves
  // them idle. (storage↔ingestion isn't a direct edge — that leg routes through
  // the backend hub, matching "backend calls the indexer after the write".)
  {
    source: "backend",
    target: "storage",
    label: { en: "object PUT", pt: "PUT de objeto" },
    protocol: {
      en: "HTTPS / TLS — object PUT to managed storage",
      pt: "HTTPS / TLS — PUT de objeto ao armazenamento gerenciado",
    },
    detail: {
      en: "The API uploads the received file to object storage over a private endpoint",
      pt: "A API envia o arquivo recebido ao armazenamento de objetos por um endpoint privado",
    },
    comm: "sync", // the API awaits the durable write before indexing
    secure: true,
    zone: "private",
    controls: { en: "Private Endpoint · TLS · IAM", pt: "Private Endpoint · TLS · IAM" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "backend",
    target: "ingestion",
    label: { en: "ingest", pt: "ingestão" },
    protocol: {
      en: "Private network · invoke the indexer (in-process / mTLS)",
      pt: "Rede privada · invoca o indexador (em processo / mTLS)",
    },
    detail: {
      en: "Having persisted the file, the API calls the indexer with the object key; the indexer reads the stored object and builds the index",
      pt: "Após persistir o arquivo, a API chama o indexador com a chave do objeto; o indexador lê o objeto armazenado e constrói o índice",
    },
    comm: "sync", // the API awaits the indexing before responding
    secure: true,
    zone: "private",
    controls: { en: "mTLS · NSG / Security Group", pt: "mTLS · NSG / Security Group" },
    sourceHandle: "right",
    targetHandle: "left",
  },
  {
    source: "ingestion",
    target: "rag",
    label: { en: "upsert", pt: "upsert" },
    protocol: { en: "Vector upsert (TCP)", pt: "Upsert de vetores (TCP)" },
    detail: {
      en: "The indexer upserts the chunk embeddings into the vector index",
      pt: "O indexador faz upsert dos embeddings dos chunks no índice vetorial",
    },
    comm: "sync",
    secure: false,
    zone: "private",
    controls: { en: "Private Endpoint", pt: "Private Endpoint" },
    sourceHandle: "bottom",
    targetHandle: "top",
  },
  // Orchestrator → sub-agents (advanced multi-agent preview). In-process
  // delegation, drawn as a small tree under the agent node. Advanced rung only.
  ...(["researcher", "coder", "critic"] as StationId[]).map(
    (target): HopSrc => ({
      source: "agent",
      target,
      label: { en: "delegates", pt: "delega" },
      protocol: {
        en: "In-process delegation (orchestrator → sub-agent)",
        pt: "Delegação em processo (orquestrador → subagente)",
      },
      detail: {
        en: "The orchestrator spawns the sub-agent with a focused task and tools, then collects its result. (Preview — not yet executed.)",
        pt: "O orquestrador cria o subagente com uma tarefa e ferramentas focadas e depois coleta o resultado. (Prévia — ainda não executado.)",
      },
      comm: "sync",
      secure: false,
      zone: "private",
      controls: { en: "In-process (same runtime)", pt: "Em processo (mesmo runtime)" },
      sourceHandle: "bottom",
      targetHandle: "top",
      scenarios: ["advanced"],
    }),
  ),
];

// --- Resolvers + per-language caches -----------------------------------------

function resolveStation(s: StationSrc, lang: Lang): StationMeta {
  return {
    ...s,
    title: r(s.title, lang),
    subtitle: r(s.subtitle, lang),
    blurb: r(s.blurb, lang),
    why: s.why ? r(s.why, lang) : undefined,
    whatBreaks: s.whatBreaks ? r(s.whatBreaks, lang) : undefined,
    generic: r(s.generic, lang),
    tech: s.tech.map((t) => ({ k: r(t.k, lang), v: t.v })),
    scenarios: s.scenarios ?? ALL_SCENARIOS,
  };
}

function resolveTier(t: TierSrc, lang: Lang): TierMeta {
  return {
    ...t,
    title: r(t.title, lang),
    alias: r(t.alias, lang),
    generic: r(t.generic, lang),
    scenarios: t.scenarios ?? ALL_SCENARIOS,
  };
}

function resolveHop(h: HopSrc, lang: Lang): HopMeta {
  return {
    ...h,
    label: r(h.label, lang),
    protocol: r(h.protocol, lang),
    detail: r(h.detail, lang),
    controls: r(h.controls, lang),
    scenarios: h.scenarios ?? ALL_SCENARIOS,
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

const publicBoundaryCache: Partial<Record<Lang, PublicFrontierMeta>> = {};

/** The public-internet / egress frontier label (cloud-generic — no cloud arg). */
export function publicBoundaryFor(lang: Lang): PublicFrontierMeta {
  return (publicBoundaryCache[lang] ??= {
    id: PUBLIC_BOUNDARY_SRC.id,
    label: r(PUBLIC_BOUNDARY_SRC.label, lang),
  });
}

// Lang-independent structural exports (ids / endpoints) — for pure logic such
// as deriveView that has no language context.
export const STATION_IDS: StationId[] = STATIONS_SRC.map((s) => s.id);
export const HOP_PAIRS: { source: StationId; target: StationId }[] = HOPS_SRC.map((h) => ({
  source: h.source,
  target: h.target,
}));

// Lang-independent mapping from a trace stage to the station that owns it.
// Preview nodes carry `stages: []`, so they contribute nothing here — the map
// stays total over the unchanged `Stage` enum (008 AC7).
export const STAGE_TO_STATION: Record<Stage, StationId> = STATIONS_SRC.reduce(
  (acc, station) => {
    for (const stage of station.stages) acc[stage] = station.id;
    return acc;
  },
  {} as Record<Stage, StationId>,
);

/**
 * The station that owns the event at `index`, via its stage (B5). Lets the
 * timeline jump the Inspector to the right node when a phase chip is clicked —
 * the same `STAGE_TO_STATION` affinity the guided tour uses.
 */
export function stationForEvent(events: { stage: Stage }[], index: number): StationId | undefined {
  const ev = events[index];
  return ev ? STAGE_TO_STATION[ev.stage] : undefined;
}

// --- Scenario scoping (008-scenario-framework) -------------------------------
// The visual model is scenario-aware: each element belongs to one or more rungs
// of the maturity ladder. These builders return only the active scenario's set,
// which the layout and the canvas render. `simple` reproduces today's set.

// Frontend-only label marker — NOT implemented, a visual reminder of the planned
// direction for the upper rungs. Intermediate reframes the agent runtime as
// DeepAgents; Advanced as DeepAgents + multi-agents. The node stays the same
// live `agent` station (same id, stages and identity) — only its displayed
// title/tag change. `simple` keeps today's "Agent" / "ReAct".
const AGENT_SCENARIO_LABEL: Partial<Record<Scenario, { title: Tr; tag: string }>> = {
  intermediate: { title: "DeepAgents", tag: "DeepAgents" },
  advanced: {
    title: { en: "DeepAgents + Multi-agents", pt: "DeepAgents + Multiagentes" },
    tag: "Multi-agent",
  },
};

// Apply the scenario-specific display label to the agent node (see
// AGENT_SCENARIO_LABEL). A no-op for every other station and for `simple`; never
// mutates the cached meta (returns a fresh object only when it overrides).
function relabelAgentForScenario(s: StationMeta, lang: Lang, scenario: Scenario): StationMeta {
  if (s.id !== "agent") return s;
  const override = AGENT_SCENARIO_LABEL[scenario];
  return override ? { ...s, title: r(override.title, lang), tag: override.tag } : s;
}

// 035-conditional-upload-nodes — the write-path nodes only matter during a PDF
// upload, so they (and any hop touching them) are hidden unless the current trace
// shows an upload (`showUpload`, derived from the event log by `hasUploadActivity`).
// They stay **real** stations (not `comingSoon`); this is render-gating only.
export const UPLOAD_ONLY_STATIONS: ReadonlySet<StationId> = new Set(["storage", "ingestion"]);

function isUploadOnlyHop(h: { source: StationId; target: StationId }): boolean {
  return UPLOAD_ONLY_STATIONS.has(h.source) || UPLOAD_ONLY_STATIONS.has(h.target);
}

export function visibleStationsFor(
  lang: Lang,
  scenario: Scenario,
  showUpload = false,
): StationMeta[] {
  return stationsFor(lang)
    .filter((s) => s.scenarios.includes(scenario))
    .filter((s) => showUpload || !UPLOAD_ONLY_STATIONS.has(s.id))
    .map((s) => relabelAgentForScenario(s, lang, scenario));
}

export function visibleHopsFor(lang: Lang, scenario: Scenario, showUpload = false): HopMeta[] {
  return hopsFor(lang)
    .filter((h) => h.scenarios.includes(scenario))
    .filter((h) => showUpload || !isUploadOnlyHop(h));
}

export function visibleTiersFor(lang: Lang, scenario: Scenario): TierMeta[] {
  return tiersFor(lang).filter((t) => t.scenarios.includes(scenario));
}

/** Lang-independent visible station ids for a scenario — used by the layout. */
export function visibleStationIdsFor(scenario: Scenario, showUpload = false): StationId[] {
  return STATIONS_SRC.filter((s) => (s.scenarios ?? ALL_SCENARIOS).includes(scenario))
    .filter((s) => showUpload || !UPLOAD_ONLY_STATIONS.has(s.id))
    .map((s) => s.id);
}
