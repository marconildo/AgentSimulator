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
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, init);
  if (!resp.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${resp.status}`);
  return (await resp.json()) as T;
}

export const listSessions = () => api<SessionMeta[]>("/api/sessions");
export const createSession = () => api<SessionMeta>("/api/sessions", { method: "POST" });
export const deleteSession = (id: string) =>
  api<unknown>(`/api/sessions/${id}`, { method: "DELETE" });
export const listMessages = (id: string) => api<ChatMessage[]>(`/api/sessions/${id}/messages`);
export const listDocuments = (id: string) => api<DocumentMeta[]>(`/api/sessions/${id}/documents`);
export const deleteDocument = (id: string, documentId: string) =>
  api<unknown>(`/api/sessions/${id}/documents/${documentId}`, { method: "DELETE" });

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
