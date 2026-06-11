// 057-deepagents-runtime — pure projections of the DeepAgents preamble events into
// what the Agent drill-in renders (the Plan panel + the Virtual file system panel).
// Like every other derive in this app, these read only their argument (the event log)
// — no requests, no state — so live and replay are the same code path.

import type { DelegateData, PlanData, TodoItem, TraceEvent, VfsOpData } from "../types/events";

/** One virtual-FS file, folded from its write/read ops this run. */
export interface VfsFile {
  path: string;
  content: string;
  bytes: number;
  wrote: boolean; // written at least once this run
  read: boolean; // read back at least once this run
}

/** A hand-off to a real sub-agent (the `task` tool), from an `agent.delegate` END. */
export interface Delegation {
  subagent: string;
  subtask: string;
  result: string;
  steps: string[];
  rounds: number;
}

const isEnd = (e: TraceEvent, stage: string): boolean => e.stage === stage && e.phase === "end";

/**
 * The ordered plan steps from the last `agent.plan` END, or `[]` when the run had no
 * DeepAgents preamble (the Simple rung). The last END wins so a replay cursor past the
 * planner shows the final plan.
 */
export function derivePlan(events: TraceEvent[]): string[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (isEnd(events[i], "agent.plan")) {
      const d = events[i].data as Partial<PlanData>;
      return Array.isArray(d.steps) ? d.steps.map(String) : [];
    }
  }
  return [];
}

/**
 * The todo list (with per-item status) from the last `agent.plan` END. Falls back to the
 * `steps` array (all `pending`) for older events that carry only content. `[]` when the
 * run had no planner.
 */
export function deriveTodos(events: TraceEvent[]): TodoItem[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (!isEnd(events[i], "agent.plan")) continue;
    const d = events[i].data as Partial<PlanData>;
    if (Array.isArray(d.todos) && d.todos.length) {
      return d.todos.map((t) => ({
        content: String(t.content ?? ""),
        status: t.status ?? "pending",
      }));
    }
    return Array.isArray(d.steps)
      ? d.steps.map((s) => ({ content: String(s), status: "pending" as const }))
      : [];
  }
  return [];
}

/**
 * The virtual file system this run, folded from the `agent.fs.write` / `agent.fs.read`
 * ENDs (in order, so the latest content for a path wins). Empty when no FS op fired.
 */
export function deriveVfs(events: TraceEvent[]): VfsFile[] {
  const byPath = new Map<string, VfsFile>();
  for (const e of events) {
    if (e.phase !== "end") continue;
    if (e.stage !== "agent.fs.write" && e.stage !== "agent.fs.read") continue;
    const d = e.data as Partial<VfsOpData>;
    if (!d.path) continue;
    const file = byPath.get(d.path) ?? {
      path: d.path,
      content: "",
      bytes: 0,
      wrote: false,
      read: false,
    };
    if (typeof d.content === "string") file.content = d.content;
    file.bytes = typeof d.bytes === "number" ? d.bytes : file.content.length;
    if (e.stage === "agent.fs.write") file.wrote = true;
    if (e.stage === "agent.fs.read") file.read = true;
    byPath.set(d.path, file);
  }
  return [...byPath.values()];
}

/** Every sub-agent delegation this run, in order (from `agent.delegate` ENDs). */
export function deriveDelegations(events: TraceEvent[]): Delegation[] {
  const out: Delegation[] = [];
  for (const e of events) {
    if (!isEnd(e, "agent.delegate")) continue;
    const d = e.data as Partial<DelegateData>;
    out.push({
      subagent: String(d.subagent ?? ""),
      subtask: String(d.subtask ?? ""),
      result: String(d.result ?? d.digest ?? ""),
      steps: Array.isArray(d.steps) ? d.steps.map(String) : [],
      rounds: typeof d.rounds === "number" ? d.rounds : 0,
    });
  }
  return out;
}

/** Whether this run ran the DeepAgents preamble at all (drives panel visibility). */
export function hasDeepAgents(events: TraceEvent[]): boolean {
  return events.some((e) => isEnd(e, "agent.plan"));
}
