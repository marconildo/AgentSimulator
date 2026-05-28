// REST client for the interactive chat: sessions, their messages, and uploaded
// documents (002-interactive-chat). The PDF upload streams the ingestion trace
// over SSE, reusing the same low-level reader as chat.

import type { TraceEvent } from "../types/events";
import type { Scenario } from "./scenario";
import { API_BASE, consumeEventStream } from "./sse";

export interface SessionMeta {
  id: string;
  title: string | null;
  created_at: number;
  updated_at: number;
  message_count: number;
}

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

export const listSessions = () => api<SessionMeta[]>("/api/sessions");
export const createSession = () => api<SessionMeta>("/api/sessions", { method: "POST" });

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
export const clearData = () => api<ClearResult>("/api/data/clear", { method: "POST" });
export const deleteSession = (id: string) =>
  api<unknown>(`/api/sessions/${id}`, { method: "DELETE" });
export const listMessages = (id: string) => api<ChatMessage[]>(`/api/sessions/${id}/messages`);
export const listDocuments = (id: string) => api<DocumentMeta[]>(`/api/sessions/${id}/documents`);
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

/** An HTTP error carrying its status so callers can branch (e.g. 409 = name taken). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function jsonApi<T>(path: string, method: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new ApiError(resp.status, `${method} ${path} failed: ${resp.status}`);
  return (await resp.json()) as T;
}

export const listSkills = () => api<Skill[]>("/api/skills");
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

export interface AppConfig {
  default_system_prompt: string;
  default_top_k: number;
  top_k_min: number;
  top_k_max: number;
  tools: { name: string; description: string }[];
  // 008-scenario-framework: the maturity ladder, so the switcher prefills here.
  scenarios: ScenarioInfo[];
  // 017-failure-injection: allowed values for the "Simulate failure" selector,
  // so the frontend never hardcodes them (AC4). e.g. ["none","tool_error",…].
  failure_modes: string[];
}

let _configPromise: Promise<AppConfig> | null = null;
/** Fetch (and cache) the agent's defaults: prompt, tools, top-k bounds. */
export const getConfig = (): Promise<AppConfig> => {
  if (!_configPromise) _configPromise = api<AppConfig>("/api/config");
  return _configPromise;
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
