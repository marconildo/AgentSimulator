// Mirror of backend/app/schemas.py — keep the two in sync.

export type Stage =
  | "frontend"
  | "backend"
  | "db.read"
  | "agent.route"
  | "agent.think"
  | "rag.embed"
  | "rag.search"
  | "rag.retrieve"
  | "rag.ingest.chunk"
  | "rag.ingest.embed"
  | "rag.ingest.store"
  | "storage.upload"
  | "mcp.discover"
  | "mcp.call"
  | "llm.prompt"
  | "llm.generate"
  | "respond"
  | "db.write";

export type Phase = "start" | "progress" | "end";

export interface TraceEvent {
  trace_id: string;
  seq: number;
  ts: number;
  stage: Stage;
  phase: Phase;
  label: string;
  data: Record<string, unknown>;
  metrics: Record<string, number>;
}

export interface DoneEvent {
  trace_id: string;
  answer: string;
  session_id: string;
}

// 007-numeric-transparency — optional enrichments on existing event `data`
// payloads (no new Stage). `TraceEvent.data` stays an open record; these typed
// shapes let the inspector read the new fields safely.

// Canonical JSON-RPC frames for an MCP exchange, on mcp.discover / mcp.call.
// `reconstructed` is true only for the in-process local fallback (badged in UI).
export interface JsonRpcFrames {
  request: { jsonrpc: string; id: number; method: string; params: Record<string, unknown> };
  response: { jsonrpc: string; id: number; result: unknown };
  reconstructed: boolean;
}

// The resolved POST /api/chat body the backend acted on, echoed on the
// `frontend` event (top_k resolved; 006/042 overrides present only when sent;
// `model` is always the resolved value — override or configured default).
export interface RequestBody {
  message: string;
  session_id: string;
  top_k: number;
  mode: string;
  // 042-agent-anatomy: always present (resolved server-side from override or
  // default), so the inspector can show what actually ran without guessing.
  model: string;
  system_prompt?: string;
  // 042-agent-anatomy: agent prompt (role) override; echoed only when set.
  agent_prompt?: string;
  enabled_tools?: string[];
  // 017-failure-injection — present only when a failure was forced (≠ none).
  simulate_failure?: string;
}

// 017-failure-injection — an injected (simulated) failure, carried as an `error`
// key on the open `data` record of an existing END event (mcp.call / llm.prompt).
// No new Stage/Phase or TraceEvent type change; this shape lets the inspector
// read it safely (à la 007's JsonRpcFrames).
export interface SimulatedError {
  error: string;
  simulated: boolean;
}

// 021-abstain-badge — the structured not-found signal on an `mcp.call` END
// `data` record. `found === false` means the tool returned empty/not-found and
// the agent could honestly abstain. Optional (an older trace lacks it); `data`
// stays an open record (no required TraceEvent type change).
export interface ToolResultData {
  found?: boolean;
}

// 036-context-window-budget — the real per-category token split of the assembled
// prompt, computed server-side with tiktoken and emitted (additively) on the
// `llm.prompt` END `data`. Six "used" categories; Free space is derived on the
// client (window − used). Mirrors backend/app/llm/context.py BUDGET_CATEGORIES.
export interface ContextBudget {
  system: number;
  tool_defs: number;
  skills: number;
  memory: number;
  retrieved: number;
  messages: number;
}

// The assembled-prompt preview carried on the `llm.prompt` END `data` (the
// inspector reads it). 036 adds the real `context_window` (the model's max) +
// `context_budget` (the per-category split) alongside the existing fields. Both
// optional ⇒ older/replayed traces still type-check (AC9).
export interface PromptPreview {
  system?: string;
  context?: string;
  tools?: string[];
  messages?: { role: string; content: string }[];
  history?: { message: string; answer: string }[];
  context_window?: number;
  context_budget?: ContextBudget;
}

export interface TraceSummary {
  trace_id: string;
  message: string;
  answer: string;
  events: TraceEvent[];
}
