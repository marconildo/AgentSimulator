// REST client for the interactive chat: sessions, their messages, and uploaded
// documents (002-interactive-chat). The PDF upload streams the ingestion trace
// over SSE, reusing the same low-level reader as chat.

import type { TraceEvent } from "../types/events";
import type { Maturity as Scenario } from "./selection";
import {
  demoClearData,
  demoCreateSession,
  demoGetConfig,
  demoGetCorpus,
  demoListAgents,
  demoListDocuments,
  demoListMessages,
  demoListSessions,
  demoListSkills,
  demoSetSessionAgent,
  isDemo,
} from "./demo";
import { API_BASE, consumeEventStream } from "./sse";

// 043-persisted-agent: the agent is a real SQLite row, cloned from the server
// default on each `create_session`. The dialog edits this row via
// `PATCH /api/agents/{id}`; edits in one conversation never affect another.
export interface AgentMeta {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  agent_prompt: string;
  model: string;
  enabled_tools: string[];
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

export interface SessionMeta {
  id: string;
  title: string | null;
  // 043-persisted-agent: the conversation's agent, inlined on session reads
  // so the FE never needs a follow-up `GET /api/agents/{id}` round-trip.
  // Optional because some legacy test fixtures don't seed it; live backends
  // always set it (the session-create path clones the default agent).
  agent?: AgentMeta | null;
  created_at: number;
  updated_at: number;
  message_count?: number;
}

export type AgentPatchBody = Partial<
  Pick<
    AgentMeta,
    "name" | "description" | "system_prompt" | "agent_prompt" | "model" | "enabled_tools"
  >
>;

export interface ChatChunk {
  text: string;
  source: string;
  title?: string;
  score: number;
  uploaded?: boolean;
}

export interface ChatMessage {
  id: string;
  message: string;
  answer: string;
  chunks: ChatChunk[];
  // 027-skills: names of the skills the agent loaded for this turn (badge source).
  skills: string[];
  // 040-message-attachments: documents the user attached to this specific turn
  // (the composer's pending list at send time). Empty for turns sent without
  // any attached file; survives reload/replay because it's persisted in the
  // `message_documents` join.
  documents: DocumentMeta[];
  created_at: number;
}

export interface DocumentMeta {
  document_id: string;
  filename: string;
  chunk_count: number;
  created_at: number;
}

export interface UploadDone {
  trace_id: string;
  document_id: string;
  filename: string;
  // 040-message-attachments: backend returns the freshly-ingested chunk count
  // so the composer can stage the new doc as a `DocumentMeta` chip without a
  // round-trip back to `listDocuments` for that single field.
  chunk_count: number;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, init);
  if (!resp.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${resp.status}`);
  return (await resp.json()) as T;
}

// 058-online-demo-mode: in a backend-less build, the catalog/boot reads resolve
// from bundled fixtures + the per-tab in-memory store. A normal build (isDemo()
// false) takes the existing `api(...)` fetch path unchanged.
export const listSessions = () =>
  isDemo() ? demoListSessions() : api<SessionMeta[]>("/api/sessions");
export const createSession = () =>
  isDemo() ? demoCreateSession() : api<SessionMeta>("/api/sessions", { method: "POST" });
// 043-persisted-agent: edit an agent (shared by every session pointing to it
// in 044). The backend validates bounds and the `model` allowlist (422). The
// PATCH is partial — only the keys in `body` are touched.
export const patchAgent = (id: string, body: AgentPatchBody) =>
  jsonApi<AgentMeta>(`/api/agents/${id}`, "PATCH", body);

// 044-shared-agent-catalog: the catalog surface used by the dialog header.
export const listAgents = () =>
  isDemo() ? demoListAgents() : api<AgentMeta[]>("/api/agents");
export interface AgentCreateBody {
  name?: string;
  description?: string;
  clone_from?: string;
}
export const createAgent = (body: AgentCreateBody = {}) =>
  jsonApi<AgentMeta>("/api/agents", "POST", body);
export interface AgentDeleteResult {
  deleted: boolean;
  id: string;
  sessions_repointed: number;
  default_agent_id: string;
}
export const deleteAgent = (id: string) =>
  jsonApi<AgentDeleteResult>(`/api/agents/${id}`, "DELETE");
/** Switch which agent a session uses (044). */
export const setSessionAgent = (sessionId: string, agentId: string) =>
  isDemo()
    ? demoSetSessionAgent(sessionId)
    : jsonApi<SessionMeta>(`/api/sessions/${sessionId}`, "PATCH", { agent_id: agentId });

// 025-clear-databases: the global reset. Counts of what was removed from both
// stores — relational rows + user-imported vectors (the built-in corpus is kept).
export interface ClearResult {
  sessions_deleted: number;
  messages_deleted: number;
  documents_deleted: number;
  // 027-skills: the global skill catalog is wiped by the reset too.
  skills_deleted: number;
  vectors_removed: number;
}
/** Wipe all relational history + imported vectors (keeps the built-in corpus). */
export const clearData = () =>
  isDemo() ? demoClearData() : api<ClearResult>("/api/data/clear", { method: "POST" });
export const deleteSession = (id: string) =>
  api<unknown>(`/api/sessions/${id}`, { method: "DELETE" });
export const listMessages = (id: string) =>
  isDemo() ? demoListMessages(id) : api<ChatMessage[]>(`/api/sessions/${id}/messages`);
export const listDocuments = (id: string) =>
  isDemo() ? demoListDocuments() : api<DocumentMeta[]>(`/api/sessions/${id}/documents`);
export const deleteDocument = (id: string, documentId: string) =>
  api<unknown>(`/api/sessions/${id}/documents/${documentId}`, { method: "DELETE" });

// --- Skills catalog (027-skills) --------------------------------------------

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  created_at: number;
  updated_at: number;
}
export type SkillInput = { name: string; description: string; body: string };

/** An HTTP error carrying its status + optional parsed JSON body so callers
 *  can branch (e.g. 409 = name taken, 409 = agent_locked, …). The body is
 *  attached when the server returned valid JSON with a `detail` field; that
 *  lets a structured detail like `{detail: "agent_locked", message_count: 3}`
 *  flow through to the FE without a separate fetch. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 045-composer-agent-selector: typed predicate for the lock 409. Stable
 *  surface so call-sites stay readable: `if (isAgentLockedError(e)) …`. */
export function isAgentLockedError(e: unknown): e is ApiError {
  if (!(e instanceof ApiError) || e.status !== 409) return false;
  const detail = (e.body as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === "object" && detail !== null) {
    return (detail as { detail?: string }).detail === "agent_locked";
  }
  return false;
}

async function jsonApi<T>(path: string, method: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    // Try to surface the structured `detail` body (e.g. 409 agent_locked) so
    // callers can branch on it without a second round-trip. Best-effort: if
    // the body isn't JSON, we still raise with status alone.
    let parsed: unknown;
    try {
      parsed = await resp.json();
    } catch {
      parsed = undefined;
    }
    throw new ApiError(resp.status, `${method} ${path} failed: ${resp.status}`, parsed);
  }
  return (await resp.json()) as T;
}

export const listSkills = () =>
  isDemo() ? demoListSkills() : api<Skill[]>("/api/skills");
export const createSkill = (s: SkillInput) => jsonApi<Skill>("/api/skills", "POST", s);
export const updateSkill = (id: string, s: SkillInput) =>
  jsonApi<Skill>(`/api/skills/${id}`, "PUT", s);
export const deleteSkill = (id: string) => jsonApi<{ deleted: boolean }>(`/api/skills/${id}`, "DELETE");

// Agent defaults the experiment panel prefills from (006-interactive-experiments)
// so nothing about the backend is hardcoded client-side. Fetched once on demand.
export interface ScenarioInfo {
  id: Scenario;
  name: { en: string; pt: string };
  blurb: { en: string; pt: string };
  available: boolean;
}

// 042-agent-anatomy: one curated OpenAI chat model the FE Agent Anatomy dialog
// renders in its Model dropdown. The id is the OpenAI model id; the label is
// what the user sees. Proper noun → not translated.
export interface ModelInfo {
  id: string;
  label: string;
  description: string;
}

// 065-provider-and-model-refresh: one LLM provider advertised by /api/config.
// `available` gates whether it can run — OpenAI is true, Ollama is a disabled
// preview. The id/label are proper nouns → not translated.
export interface ProviderInfo {
  id: string;
  label: string;
  available: boolean;
}

export interface AppConfig {
  // 042-agent-anatomy split the prior single prompt into two server-shipped
  // defaults; the FE Agent Anatomy dialog prefills each textarea independently.
  default_system_prompt: string; // guardrails layer
  default_agent_prompt: string; // role layer
  default_top_k: number;
  top_k_min: number;
  top_k_max: number;
  // 055-rerank-score-threshold — the min rerank-score slider (Intermediate rung).
  default_rerank_threshold: number;
  rerank_threshold_step: number;
  tools: { name: string; description: string }[];
  // 008-scenario-framework: the maturity ladder, so the switcher prefills here.
  scenarios: ScenarioInfo[];
  // 017-failure-injection: allowed values for the "Simulate failure" selector,
  // so the frontend never hardcodes them (AC4). e.g. ["none","tool_error",…].
  failure_modes: string[];
  // 042-agent-anatomy: curated OpenAI chat models the Agent Anatomy dialog
  // lets the user pick from, plus the resolved server default. Server-side
  // allowlist validation prevents an unlisted id from reaching the agent.
  models: ModelInfo[];
  default_model: string;
  // 065-provider-and-model-refresh: the LLM providers the dialog advertises.
  // OpenAI is active; Ollama is a disabled preview.
  providers: ProviderInfo[];
  default_provider: string;
}

let _configPromise: Promise<AppConfig> | null = null;
/** Fetch (and cache) the agent's defaults: prompt, tools, top-k bounds. */
export const getConfig = (): Promise<AppConfig> => {
  if (!_configPromise) _configPromise = isDemo() ? demoGetConfig() : api<AppConfig>("/api/config");
  return _configPromise;
};

// 042-agent-anatomy: corpus listing for the Knowledge Base section.
export interface CorpusFile {
  filename: string;
  size_bytes: number;
  preview: string;
}
export interface CorpusListing {
  files: CorpusFile[];
}
let _corpusPromise: Promise<CorpusListing> | null = null;
/** Fetch (and cache) the shipped corpus files. Read-only. */
export const getCorpus = (): Promise<CorpusListing> => {
  if (!_corpusPromise) _corpusPromise = isDemo() ? demoGetCorpus() : api<CorpusListing>("/api/corpus");
  return _corpusPromise;
};

export interface UploadHandlers {
  onTrace: (event: TraceEvent) => void;
  onDone: (event: UploadDone) => void;
}

/** Upload a PDF (multipart in) and stream the ingestion trace (SSE out). */
export async function uploadDocument(
  sessionId: string,
  file: File,
  handlers: UploadHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${API_BASE}/api/sessions/${sessionId}/documents`, {
    method: "POST",
    body: form,
    signal,
  });
  await consumeEventStream(resp, (type, payload) => {
    if (type === "trace") handlers.onTrace(payload as TraceEvent);
    else if (type === "done") handlers.onDone(payload as UploadDone);
  });
}
