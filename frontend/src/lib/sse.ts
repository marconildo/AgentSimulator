// Minimal SSE client built on fetch + ReadableStream so we can POST the
// message (the native EventSource only supports GET).

import type { DoneEvent, TraceEvent, TraceSummary } from "../types/events";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export interface ChatHandlers {
  onTrace: (event: TraceEvent) => void;
  onDone: (event: DoneEvent) => void;
}

export async function streamChat(
  message: string,
  handlers: ChatHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`Chat request failed: ${resp.status}`);
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
      dispatch(rawMessage, handlers);
    }
  }
}

function dispatch(rawMessage: string, handlers: ChatHandlers): void {
  let eventType = "message";
  const dataLines: string[] = [];

  for (const line of rawMessage.split("\n")) {
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line.startsWith("event:")) eventType = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;

  const payload = JSON.parse(dataLines.join("\n"));
  if (eventType === "trace") handlers.onTrace(payload as TraceEvent);
  else if (eventType === "done") handlers.onDone(payload as DoneEvent);
}

export async function fetchTrace(traceId: string): Promise<TraceSummary> {
  const resp = await fetch(`${API_BASE}/api/trace/${traceId}`);
  if (!resp.ok) throw new Error("trace not found");
  return (await resp.json()) as TraceSummary;
}
