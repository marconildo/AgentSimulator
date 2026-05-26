// Mirror of backend/app/schemas.py — keep the two in sync.

export type Stage =
  | "frontend"
  | "backend"
  | "agent.route"
  | "agent.think"
  | "rag.embed"
  | "rag.search"
  | "rag.retrieve"
  | "mcp.discover"
  | "mcp.call"
  | "llm.prompt"
  | "llm.generate"
  | "respond";

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
}

export interface TraceSummary {
  trace_id: string;
  message: string;
  answer: string;
  events: TraceEvent[];
}
