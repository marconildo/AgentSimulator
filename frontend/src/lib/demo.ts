// 058-online-demo-mode — the backend-less showcase build.
//
// A BUILD-TIME mode (`VITE_DEMO_MODE`), not a runtime toggle: the normal local
// build never enters any branch here (`isDemo()` is false), so it talks to the
// backend exactly as today — byte-for-byte. When the flag is on, every network
// read the app makes on boot/send is served from bundled REAL captured traces
// (see `demo/fixtures.ts`, constitution §3) plus a tiny per-tab in-memory session
// store. Nothing is persisted and nothing leaves the browser — hundreds of
// concurrent visitors get fully independent sessions because it's just a static
// bundle. The full, key-required live tool stays the GitHub-local route.

import type {
  AgentMeta,
  AppConfig,
  ChatChunk,
  ChatMessage,
  ClearResult,
  CorpusListing,
  DocumentMeta,
  SessionMeta,
  Skill,
} from "./chatApi";
import type { DoneEvent, TraceEvent, TraceSummary } from "../types/events";
import { useLang } from "../i18n";
import { DEMO_CONFIG, DEMO_TRACES } from "../demo/fixtures";

/** GitHub repo the demo banner points visitors at for the full live version. */
export const DEMO_REPO_URL = "https://github.com/reginaldosilva27/AgentSimulator";

/** True only in a `VITE_DEMO_MODE` build. A normal build never branches on this. */
export function isDemo(): boolean {
  const flag = import.meta.env.VITE_DEMO_MODE as string | undefined;
  return flag === "1" || flag === "true";
}

// --- curated sample questions ----------------------------------------------

// The fixed set a demo visitor can send — the same prompts as the empty-state
// examples. Each maps to a stable `id` that keys the captured-trace registry.
export interface DemoQuestion {
  id: string;
  label: { en: string; pt: string };
}

export const DEMO_QUESTIONS: DemoQuestion[] = [
  { id: "rag", label: { en: "What is RAG and how does retrieval work?", pt: "O que é RAG e como funciona a recuperação?" } },
  { id: "math", label: { en: "What is 12 * (3 + 1)?", pt: "Quanto é 12 * (3 + 1)?" } },
  { id: "mcp", label: { en: "How do MCP tools work?", pt: "Como funcionam as ferramentas MCP?" } },
  { id: "time", label: { en: "What time is it right now?", pt: "Que horas são agora?" } },
];

/** Map a sent message back to a curated question id (matches either language). */
export function qidForMessage(message: string): string | null {
  const norm = message.trim().toLowerCase();
  for (const q of DEMO_QUESTIONS) {
    if (q.label.en.toLowerCase() === norm || q.label.pt.toLowerCase() === norm) return q.id;
  }
  return null;
}

/**
 * Resolve the captured trace for a (question, scenario, language) triple, with
 * graceful fallback so the demo never dead-ends (AC6): try the exact match, then
 * the same question in `en`, then in `simple`, then any capture for that question,
 * then the first `rag` capture as a last resort.
 */
export function selectDemoTrace(
  qid: string | null,
  scenario: string,
  lang: string,
): TraceSummary {
  const id = qid ?? "rag";
  const pick = (s: string, l: string) =>
    DEMO_TRACES.find((t) => t.qid === id && t.scenario === s && t.lang === l)?.fixture;
  const fixture =
    pick(scenario, lang) ??
    pick(scenario, "en") ??
    pick("simple", lang) ??
    DEMO_TRACES.find((t) => t.qid === id)?.fixture ??
    DEMO_TRACES[0].fixture;
  return fixture;
}

// --- in-memory per-tab store -----------------------------------------------

// One default read-only agent, derived from the captured `/api/config` defaults
// so the Agent station / dialog show coherent values with no backend.
const demoAgent: AgentMeta = {
  id: "demo-agent",
  name: "Agent Simulator",
  description: "Demo agent — replays real captured runs.",
  system_prompt: DEMO_CONFIG.default_system_prompt,
  agent_prompt: DEMO_CONFIG.default_agent_prompt,
  model: DEMO_CONFIG.default_model,
  enabled_tools: DEMO_CONFIG.tools.map((t) => t.name),
  is_default: true,
  created_at: 0,
  updated_at: 0,
};

interface DemoStore {
  sessions: SessionMeta[];
  messages: Map<string, ChatMessage[]>;
  traces: Map<string, TraceSummary>;
  counter: number;
}

const store: DemoStore = { sessions: [], messages: new Map(), traces: new Map(), counter: 0 };

function freshId(prefix: string): string {
  store.counter += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2);
  return `${prefix}-${store.counter}-${rand}`.slice(0, 40);
}

const now = () => Date.now() / 1000;

/** The chunks the agent retrieved this turn, reconstructed from the captured
 *  trace so a demo message carries its "Sources used" just like a live one
 *  (mirrors the backend's `_retrieved_chunks`): prefer the vector `rag.retrieve`
 *  END event, then fall back to the RAGLESS `pageindex.select` END event. */
function retrievedChunks(events: TraceEvent[]): ChatChunk[] {
  const pick = (stage: string) => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev.stage === stage && ev.phase === "end") {
        return (ev.data.chunks as ChatChunk[] | undefined) ?? [];
      }
    }
    return null;
  };
  return pick("rag.retrieve") ?? pick("pageindex.select") ?? [];
}

/** Build (and record) a demo turn: clone the captured trace under a fresh id so
 *  repeated sends never collide, append the message to the in-memory thread, and
 *  index the cloned trace so `fetchTrace(message.id)` can revisit it. */
function buildTurn(sessionId: string, message: string): TraceSummary {
  const scenario = readScenario();
  const lang = useLang.getState().lang;
  const base = selectDemoTrace(qidForMessage(message), scenario, lang);
  const id = freshId("demo");
  const events: TraceEvent[] = base.events.map((e) => ({ ...e, trace_id: id }));
  const trace: TraceSummary = { trace_id: id, message, answer: base.answer, events };
  store.traces.set(id, trace);

  const msg: ChatMessage = {
    id,
    message,
    answer: base.answer,
    chunks: retrievedChunks(events),
    skills: [],
    documents: [],
    created_at: now(),
  };
  const list = store.messages.get(sessionId) ?? [];
  list.push(msg);
  store.messages.set(sessionId, list);

  const session = store.sessions.find((s) => s.id === sessionId);
  if (session) {
    session.message_count = list.length;
    session.updated_at = now();
    if (!session.title) session.title = message.length > 60 ? `${message.slice(0, 57)}…` : message;
  }
  return trace;
}

// The captured demo fixtures are keyed by maturity rung. 061-scenario-builder made
// maturity a DERIVED label, so we read the global component selection (localStorage)
// and classify it — keeping the demo's (qid × rung × lang) lookup working. Read lazily
// from localStorage to avoid a hard import cycle at module load.
function readScenario(): string {
  if (typeof localStorage === "undefined") return "simple";
  try {
    const raw = localStorage.getItem("agentsim.selection");
    if (raw) {
      const parsed = JSON.parse(raw);
      const enabled: string[] = parsed.enabled ?? [];
      const runtime: string = parsed.runtime ?? "react";
      // 066-retrieval-strategy-radio — RAGLESS moved from `enabled` to the strategy radio.
      const retrieval: string = parsed.retrieval ?? (enabled.includes("ragless") ? "ragless" : "vector");
      // RAGLESS is its own captured pipeline (pageindex.*, no vector path) and is
      // mutually exclusive with the vector-only rerank, so it keys its own fixture
      // — check it before the rerank-driven "intermediate" bucket.
      if (retrieval === "ragless") return "ragless";
      const advanced = ["gateway", "guardrails", "cache", "eval", "observability"];
      if (runtime === "multiagent" || enabled.some((c) => advanced.includes(c))) return "advanced";
      const intermediate = ["rerank", "hybrid", "summarization"];
      if (runtime === "deepagents" || enabled.some((c) => intermediate.includes(c)))
        return "intermediate";
    }
  } catch {
    // fall through to the default rung
  }
  return "simple";
}

// --- demo network surface (mirrors chatApi / sse / health) ------------------

export function demoHealth() {
  return {
    status: "ok" as const,
    llmProvider: "openai",
    llmModel: DEMO_CONFIG.default_model,
    hasKey: true,
  };
}

export const demoGetConfig = (): Promise<AppConfig> => Promise.resolve(DEMO_CONFIG);
export const demoListAgents = (): Promise<AgentMeta[]> => Promise.resolve([demoAgent]);
export const demoListSessions = (): Promise<SessionMeta[]> =>
  Promise.resolve([...store.sessions].sort((a, b) => b.updated_at - a.updated_at));
export const demoListMessages = (id: string): Promise<ChatMessage[]> =>
  Promise.resolve(store.messages.get(id) ?? []);
export const demoListDocuments = (): Promise<DocumentMeta[]> => Promise.resolve([]);
export const demoListSkills = (): Promise<Skill[]> => Promise.resolve([]);
export const demoGetCorpus = (): Promise<CorpusListing> => Promise.resolve({ files: [] });

export const demoCreateSession = (): Promise<SessionMeta> => {
  const session: SessionMeta = {
    id: freshId("sess"),
    title: null,
    agent: demoAgent,
    created_at: now(),
    updated_at: now(),
    message_count: 0,
  };
  store.sessions.push(session);
  return Promise.resolve(session);
};

export const demoSetSessionAgent = (id: string): Promise<SessionMeta> => {
  const s = store.sessions.find((x) => x.id === id);
  return Promise.resolve(
    s ?? { id, title: null, agent: demoAgent, created_at: now(), updated_at: now(), message_count: 0 },
  );
};

export const demoClearData = (): Promise<ClearResult> => {
  store.sessions = [];
  store.messages.clear();
  store.traces.clear();
  return Promise.resolve({
    sessions_deleted: 0,
    messages_deleted: 0,
    documents_deleted: 0,
    skills_deleted: 0,
    vectors_removed: 0,
  });
};

export const demoFetchTrace = (traceId: string): Promise<TraceSummary> => {
  const trace = store.traces.get(traceId);
  if (!trace) return Promise.reject(new Error("trace not found"));
  return Promise.resolve(trace);
};

export interface DemoChatHandlers {
  onTrace: (event: TraceEvent) => void;
  onDone: (event: DoneEvent) => void;
}

/** Stream-mode demo send: emit every captured event (the simulator paces the
 *  reveal exactly like a live run), then `done`. No backend, no key. */
export async function demoStreamChat(
  message: string,
  handlers: DemoChatHandlers,
  signal: AbortSignal | undefined,
  sessionId: string,
): Promise<void> {
  const trace = buildTurn(sessionId, message);
  for (const event of trace.events) {
    if (signal?.aborted) return;
    handlers.onTrace(event);
  }
  handlers.onDone({ trace_id: trace.trace_id, answer: trace.answer, session_id: sessionId });
}

/** Batch-mode demo send: build the turn and hand back the whole captured trace. */
export async function demoBatchChat(message: string, sessionId: string): Promise<TraceSummary> {
  return buildTurn(sessionId, message);
}
