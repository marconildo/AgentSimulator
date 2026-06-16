// Minimal SSE client built on fetch + ReadableStream so we can POST the
// message (the native EventSource only supports GET). The low-level
// `consumeEventStream` is reused by both chat and PDF-upload streams.

import type { ChatOverrides } from "./experiment";
import type { DoneEvent, TraceEvent, TraceSummary } from "../types/events";
import { demoBatchChat, demoFetchTrace, demoStreamChat, isDemo } from "./demo";

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export interface ChatHandlers {
  onTrace: (event: TraceEvent) => void;
  onDone: (event: DoneEvent) => void;
}

/** Consume an SSE response body, invoking `onEvent(type, payload)` per message. */
export async function consumeEventStream(
  resp: Response,
  onEvent: (eventType: string, payload: unknown) => void,
): Promise<void> {
  if (!resp.ok || !resp.body) {
    throw new Error(`Request failed: ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // Normalize CRLF so message framing is transport-agnostic.
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawMessage = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatch(rawMessage, onEvent);
    }
  }
}

function dispatch(rawMessage: string, onEvent: (eventType: string, payload: unknown) => void): void {
  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of rawMessage.split("\n")) {
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  onEvent(eventType, JSON.parse(dataLines.join("\n")));
}

export async function streamChat(
  message: string,
  handlers: ChatHandlers,
  signal?: AbortSignal,
  sessionId?: string | null,
  overrides?: ChatOverrides,
  // 040-message-attachments: documents the composer was holding at the moment
  // of send. Forwarded as `attachment_document_ids` so the backend can link
  // them to the persisted message in the same `db.write` transaction. Omit
  // (or pass `[]`) to reproduce today's behavior.
  attachmentDocumentIds?: string[],
): Promise<void> {
  // 058-online-demo-mode: replay a real captured trace, no backend round-trip.
  if (isDemo()) {
    await demoStreamChat(message, handlers, signal, sessionId ?? "demo");
    return;
  }
  const resp = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Undefined override fields are dropped by JSON.stringify, so a default
    // (untouched) experiment sends nothing extra — today's behavior (AC5).
    body: JSON.stringify({
      message,
      session_id: sessionId ?? null,
      mode: "stream",
      ...overrides,
      ...(attachmentDocumentIds && attachmentDocumentIds.length > 0
        ? { attachment_document_ids: attachmentDocumentIds }
        : {}),
    }),
    signal,
  });
  await consumeEventStream(resp, (type, payload) => {
    if (type === "trace") handlers.onTrace(payload as TraceEvent);
    else if (type === "done") handlers.onDone(payload as DoneEvent);
  });
}

// Batch delivery: a single POST that blocks until the backend finishes, then
// returns the whole trace + answer as one JSON payload (synchronous
// request/response). The caller replays the trace to animate it.
export async function batchChat(
  message: string,
  signal?: AbortSignal,
  sessionId?: string | null,
  overrides?: ChatOverrides,
  attachmentDocumentIds?: string[],
): Promise<TraceSummary> {
  if (isDemo()) return demoBatchChat(message, sessionId ?? "demo");
  const resp = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      session_id: sessionId ?? null,
      mode: "batch",
      ...overrides,
      ...(attachmentDocumentIds && attachmentDocumentIds.length > 0
        ? { attachment_document_ids: attachmentDocumentIds }
        : {}),
    }),
    signal,
  });
  if (!resp.ok) throw new Error(`Chat request failed: ${resp.status}`);
  return (await resp.json()) as TraceSummary;
}

export async function fetchTrace(traceId: string): Promise<TraceSummary> {
  if (isDemo()) return demoFetchTrace(traceId);
  const resp = await fetch(`${API_BASE}/api/trace/${traceId}`);
  if (!resp.ok) throw new Error("trace not found");
  return (await resp.json()) as TraceSummary;
}
