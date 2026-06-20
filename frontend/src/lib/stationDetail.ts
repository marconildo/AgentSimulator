// 076-station-full-views — pure projections of the captured trace for the four
// "open full view" drill-ins that mirror the agent/llm/rag overlays: MCP Tools,
// App Database, Backend and Frontend. Each selector reads only the visible slice
// of `TraceEvent`s (events up to the cursor) the canvas already projects, so the
// overlays never diverge from the diagram across live streaming / step / replay.
//
// These selectors are the single source of truth shared by the overlays; the
// Inspector keeps its own (theory-first) rendering, so the two affordances stay
// independent but read the same underlying event data.

import type { DbQuery, JsonRpcFrames, RequestBody, TraceEvent } from "../types/events";
import { electedToolCalls } from "./usage";

// Last event matching the stage (+ optional phase), scanning newest-first — the
// same contract the Inspector's local `pick` uses.
export function pickLast(
  events: TraceEvent[],
  stage: TraceEvent["stage"],
  phase?: TraceEvent["phase"],
): TraceEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.stage === stage && (phase === undefined || e.phase === phase)) return e;
  }
  return undefined;
}

// --- MCP -------------------------------------------------------------------

export interface DiscoveredTool {
  name: string;
  description: string;
}

export interface McpToolCall {
  tool: string;
  args: unknown;
  result: string;
  jsonrpc?: JsonRpcFrames;
  simulated: boolean;
}

export interface LocalToolCall {
  tool: string;
  args: unknown;
}

export interface McpDetailData {
  transport?: string;
  tools: DiscoveredTool[];
  discoveryFrames?: JsonRpcFrames;
  calls: McpToolCall[];
  localCalls: LocalToolCall[];
}

export function selectMcp(events: TraceEvent[]): McpDetailData {
  const discover = pickLast(events, "mcp.discover", "end");
  const tools = (discover?.data.tools as DiscoveredTool[] | undefined) ?? [];
  const calls = events
    .filter((e) => e.stage === "mcp.call" && e.phase === "end")
    .map((e) => ({
      tool: String(e.data.tool ?? ""),
      args: e.data.args,
      result: String(e.data.result ?? ""),
      jsonrpc: e.data.jsonrpc as JsonRpcFrames | undefined,
      simulated: Boolean(e.data.simulated),
    }));
  // 067 — DeepAgents local tools (write_todos/write_file/…) run in-process, not
  // over the MCP transport, so they never emit `mcp.call`. Surface them too: an
  // elected tool call with no result and no retrieval summary is a local call.
  const localCalls = electedToolCalls(events)
    .filter((c) => c.result === undefined && c.retrievalSummary === undefined)
    .map((c) => ({ tool: c.tool, args: c.args }));
  return {
    transport: discover?.data.transport as string | undefined,
    tools,
    discoveryFrames: discover?.data.jsonrpc as JsonRpcFrames | undefined,
    calls,
    localCalls,
  };
}

// --- App Database ----------------------------------------------------------

export interface DbHistoryRow {
  message: string;
  answer: string;
}

export interface DbDetailData {
  read?: {
    table: string;
    sessionId: string;
    totalRows: number;
    recent: DbHistoryRow[];
    // 079-db-query-detail: the real SQL statements this read ran, ordered.
    queries: DbQuery[];
  };
  write?: {
    table: string;
    operation: string;
    rowId: string;
    sessionId: string;
    totalRows: number;
    // 079-db-query-detail: the real SQL statements this write ran, ordered.
    queries: DbQuery[];
  };
}

export function selectDatabase(events: TraceEvent[]): DbDetailData {
  const read = pickLast(events, "db.read", "end");
  const write = pickLast(events, "db.write", "end");
  return {
    read: read
      ? {
          table: String(read.data.table ?? "messages"),
          sessionId: String(read.data.session_id ?? ""),
          totalRows: Number(read.data.total_rows ?? 0),
          recent: (read.data.recent as DbHistoryRow[] | undefined) ?? [],
          queries: (read.data.queries as DbQuery[] | undefined) ?? [],
        }
      : undefined,
    write: write
      ? {
          table: String(write.data.table ?? "messages"),
          operation: String(write.data.operation ?? "INSERT"),
          rowId: String(write.data.row_id ?? "—"),
          sessionId: String(write.data.session_id ?? ""),
          totalRows: Number(write.data.total_rows ?? 0),
          queries: (write.data.queries as DbQuery[] | undefined) ?? [],
        }
      : undefined,
  };
}

// --- Backend ---------------------------------------------------------------

export interface BackendDetailData {
  received: boolean;
  requestMessage?: string;
  answered: boolean;
  answer?: string;
  delivery?: string;
  sessionId?: string;
  latencyMs?: number;
}

export function selectBackend(events: TraceEvent[]): BackendDetailData {
  const start = pickLast(events, "backend", "start");
  const end = pickLast(events, "backend", "end");
  return {
    received: start !== undefined,
    requestMessage: start?.data.message as string | undefined,
    answered: end !== undefined && end.data.answer !== undefined,
    answer: end?.data.answer as string | undefined,
    delivery: end?.data.delivery as string | undefined,
    sessionId: end?.data.session_id as string | undefined,
    latencyMs: end?.metrics.latency_ms,
  };
}

// 077-backend-lifecycle-flow — the Backend is the orchestrator; this projects
// the five ordered steps it coordinates for the turn (payload received → load
// history → agent invoked → persist → response streamed), each with its real
// data + per-step latency. A pure projection of the visible cursor slice; the
// agent step is a *summary* that points at the Agent/LLM/MCP full views.
export interface BackendFlow {
  started: boolean;
  receive?: { message?: string; request?: RequestBody };
  history?: { table: string; rowsLoaded: number; latencyMs?: number };
  agent?: { reasoningRounds: number; toolCalls: string[]; retrievals: number };
  persist?: { operation: string; rowId: string; totalRows: number; latencyMs?: number };
  respond?: { answer?: string; delivery?: string; sessionId?: string; latencyMs?: number };
}

export function selectBackendFlow(events: TraceEvent[]): BackendFlow {
  const backendStart = pickLast(events, "backend", "start");
  const frontend = pickLast(events, "frontend", "end");
  const read = pickLast(events, "db.read", "end");
  const write = pickLast(events, "db.write", "end");
  const backendEnd = pickLast(events, "backend", "end");
  const respond = pickLast(events, "respond", "end");

  const thinks = events.filter((e) => e.stage === "agent.think" && e.phase === "end");
  const route = pickLast(events, "agent.route", "end");
  const retrievals = events.filter((e) => e.stage === "rag.retrieve" && e.phase === "end").length;
  const toolCalls = electedToolCalls(events).map((c) => c.tool);
  const agentRan = route !== undefined || thinks.length > 0 || toolCalls.length > 0;

  const message = (backendStart?.data.message ?? frontend?.data.message) as string | undefined;
  const request = frontend?.data.request as RequestBody | undefined;

  return {
    started: backendStart !== undefined || frontend !== undefined,
    receive: message !== undefined || request !== undefined ? { message, request } : undefined,
    history: read
      ? {
          table: String(read.data.table ?? "messages"),
          rowsLoaded: ((read.data.recent as unknown[] | undefined) ?? []).length,
          latencyMs: read.metrics.latency_ms,
        }
      : undefined,
    agent: agentRan
      ? { reasoningRounds: thinks.length, toolCalls, retrievals }
      : undefined,
    persist: write
      ? {
          operation: String(write.data.operation ?? "INSERT"),
          rowId: String(write.data.row_id ?? "—"),
          totalRows: Number(write.data.total_rows ?? 0),
          latencyMs: write.metrics.latency_ms,
        }
      : undefined,
    respond:
      backendEnd || respond
        ? {
            answer: (backendEnd?.data.answer ?? respond?.data.answer) as string | undefined,
            delivery: backendEnd?.data.delivery as string | undefined,
            sessionId: backendEnd?.data.session_id as string | undefined,
            latencyMs: backendEnd?.metrics.latency_ms,
          }
        : undefined,
  };
}

// --- Frontend --------------------------------------------------------------

export interface FrontendDetailData {
  sent: boolean;
  message?: string;
  request?: RequestBody;
  answer?: string;
}

export function selectFrontend(events: TraceEvent[]): FrontendDetailData {
  const frontend = pickLast(events, "frontend", "end");
  const respond = pickLast(events, "respond", "end");
  return {
    sent: frontend !== undefined,
    message: frontend?.data.message as string | undefined,
    request: frontend?.data.request as RequestBody | undefined,
    answer: respond?.data.answer as string | undefined,
  };
}

// --- Ingestion (080-ingestion-pipeline-merge) --------------------------------
//
// The offline indexer write-path, projected as six ordered phases for the
// "Open ingestion pipeline" drill-in (mirrors the RAG pipeline overlay). The
// Object Storage node was folded in (080), so its durable write is the first
// phase here. Each phase reads only the visible cursor slice (step/replay safe);
// a phase is `present` iff its END event has fired by the cursor.

export interface IngestionPhases {
  objectStore?: { filename?: string; key?: string; sizeBytes?: number; contentType?: string };
  chunking?: {
    strategy?: string;
    numChunks?: number;
    chunkSize?: number;
    chunkOverlap?: number;
    totalChars?: number;
    previews: string[];
  };
  tokenization?: { encoding?: string; tokenCounts: number[]; totalTokens?: number };
  embedding?: { model?: string; dim?: number; numVectors?: number; preview: number[] };
  metadata?: {
    docType?: string;
    metadataKeys: string[];
    numRecords?: number;
    records: Record<string, unknown>[];
  };
  store?: { collection?: string; chunksStored?: number; totalInCollection?: number };
  /** True iff at least one phase has data — drives the overlay's empty state. */
  any: boolean;
}

export function selectIngestion(events: TraceEvent[]): IngestionPhases {
  const up = pickLast(events, "storage.upload", "end");
  const chunk = pickLast(events, "rag.ingest.chunk", "end");
  const tok = pickLast(events, "rag.ingest.tokenize", "end");
  const embed = pickLast(events, "rag.ingest.embed", "end");
  const meta = pickLast(events, "rag.ingest.metadata", "end");
  const store = pickLast(events, "rag.ingest.store", "end");

  return {
    objectStore: up && {
      filename: up.data.filename as string | undefined,
      key: up.data.key as string | undefined,
      sizeBytes: up.data.size_bytes as number | undefined,
      contentType: up.data.content_type as string | undefined,
    },
    chunking: chunk && {
      strategy: chunk.data.strategy as string | undefined,
      numChunks: chunk.data.num_chunks as number | undefined,
      chunkSize: chunk.data.chunk_size as number | undefined,
      chunkOverlap: chunk.data.chunk_overlap as number | undefined,
      totalChars: chunk.data.total_chars as number | undefined,
      previews: (chunk.data.previews as string[] | undefined) ?? [],
    },
    tokenization: tok && {
      encoding: tok.data.encoding as string | undefined,
      tokenCounts: (tok.data.token_counts as number[] | undefined) ?? [],
      totalTokens: tok.data.total_tokens as number | undefined,
    },
    embedding: embed && {
      model: embed.data.model as string | undefined,
      dim: embed.data.dim as number | undefined,
      numVectors: embed.data.num_vectors as number | undefined,
      preview: (embed.data.preview as number[] | undefined) ?? [],
    },
    metadata: meta && {
      docType: meta.data.doc_type as string | undefined,
      metadataKeys: (meta.data.metadata_keys as string[] | undefined) ?? [],
      numRecords: meta.data.num_records as number | undefined,
      records: (meta.data.records as Record<string, unknown>[] | undefined) ?? [],
    },
    store: store && {
      collection: store.data.collection as string | undefined,
      chunksStored: store.data.chunks_stored as number | undefined,
      totalInCollection: store.data.total_in_collection as number | undefined,
    },
    any: Boolean(up || chunk || tok || embed || meta || store),
  };
}
