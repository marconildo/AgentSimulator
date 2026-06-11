// 050-replay-bubble-streaming — DOM-level assertions that the chat bubble of
// the LOADED turn (`loadedTraceId === message.id`) re-runs its "Reasoning… →
// streaming answer → final" path as the simulator cursor walks through the
// trace, mirroring what the live bubble already does during a real send.
//
// Scope is render-only (RTL + JSDOM). The pure-projection contract is
// already covered by `chatStatus.replay.test.ts`; this file pins the wiring:
// `<Thread>` reads events/cursor from `useSimulator` + `loadedTraceId` from
// `useChat`, computes the replay bubble via `replayBubble`, and the
// resulting `<StageStatus>` / answer-with-caret lands on the right DOM node.

import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", async () => {
  const actual = await vi.importActual<typeof import("../lib/chatApi")>("../lib/chatApi");
  return {
    ...actual,
    createSession: vi.fn(),
    deleteSession: vi.fn(),
    deleteDocument: vi.fn(),
    listSessions: vi.fn(),
    listMessages: vi.fn(),
    listDocuments: vi.fn(),
    listAgents: vi.fn(),
    setSessionAgent: vi.fn(),
    uploadDocument: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({
      default_system_prompt: "",
      default_top_k: 3,
      top_k_min: 1,
      top_k_max: 8,
      default_rerank_threshold: 0,
      rerank_threshold_step: 0.05,
      tools: [],
      scenarios: [],
      failure_modes: [],
    }),
  };
});

vi.mock("../lib/sse", () => ({
  API_BASE: "",
  consumeEventStream: vi.fn(),
  streamChat: vi.fn(),
  batchChat: vi.fn(),
  fetchTrace: vi.fn().mockRejectedValue(new Error("not needed in this test")),
}));

// Same pattern as the existing ChatPanel.*.test.tsx files: mock useHud so the
// component-level render doesn't trip the per-message fetchTrace fan-out.
const _zero = {
  turns: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  toolCalls: 0,
  ragHits: 0,
  partial: false,
};
vi.mock("../store/useHud", () => {
  const useHud = (selector: (s: unknown) => unknown) =>
    selector({ cumulative: _zero, loading: false });
  useHud.getState = () => ({ recompute: vi.fn().mockResolvedValue(undefined) });
  return { useHud };
});

import * as chatApi from "../lib/chatApi";
import type { ChatMessage } from "../lib/chatApi";
import type { Phase, Stage, TraceEvent } from "../types/events";
import { ChatPanel } from "./ChatPanel";
import { useChat } from "../store/useChat";
import { useSimulator } from "../store/useSimulator";

// ---------------------------------------------------------------------------
// Canned trace: same shape as the live one (012 stream mode) — token progress
// on llm.generate is what `view.answer` reassembles from.
// ---------------------------------------------------------------------------

let seq = 0;
function ev(stage: Stage, phase: Phase, data: Record<string, unknown> = {}): TraceEvent {
  return { trace_id: "t", seq: seq++, ts: 0, stage, phase, label: "", data, metrics: {} };
}

function streamTrace(): TraceEvent[] {
  seq = 0;
  return [
    ev("frontend", "end", { message: "hi" }),
    ev("backend", "start"),
    ev("db.read", "end", { recent: [] }),
    ev("agent.route", "end", { query: "hi" }),
    ev("rag.embed", "start"),
    ev("rag.retrieve", "end", { chunks: [] }),
    ev("agent.think", "start"),
    ev("agent.think", "end", { decision: "answer" }),
    ev("llm.generate", "start"),
    ev("llm.generate", "progress", { token: "Hel" }),
    ev("llm.generate", "progress", { token: "lo." }),
    ev("llm.generate", "end", { answer: "Hello." }),
    ev("respond", "end", { answer: "Hello." }),
    ev("db.write", "end", { operation: "INSERT", total_rows: 1 }),
    ev("backend", "end", { answer: "Hello.", delivery: "stream" }),
  ];
}

const PERSISTED = "PERSISTED FINAL — different on purpose";

const session = (id: string, messageCount: number) => ({
  id,
  title: "Test thread",
  created_at: 0,
  updated_at: 0,
  message_count: messageCount,
});

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  message: "hi",
  answer: PERSISTED,
  chunks: [],
  skills: [],
  documents: [],
  created_at: 0,
  ...overrides,
});

const idleBubble = { kind: "status" as const, phase: null };

function seedChat(opts: {
  messages: ChatMessage[];
  loadedTraceId: string | null;
  traceExpired?: boolean;
  pending?: string | null;
}) {
  useChat.setState({
    view: "thread",
    activeSessionId: "s1",
    sessions: [session("s1", opts.messages.length)],
    messages: opts.messages,
    pendingDocuments: [],
    pendingAttachments: [],
    pending: opts.pending ?? null,
    input: "",
    loading: false,
    sending: false,
    uploading: false,
    cancelled: false,
    loadedTraceId: opts.loadedTraceId,
    traceExpired: opts.traceExpired ?? false,
    error: null,
  });
}

function seedSimulator(
  events: TraceEvent[],
  cursor: number,
  opts: { playing?: boolean; status?: "idle" | "streaming" | "done" | "error" | "cancelled" } = {},
) {
  useSimulator.setState({
    events,
    cursor,
    status: opts.status ?? "done",
    playing: opts.playing ?? false,
    following: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // JSDOM polyfills required across the ChatPanel test suite (see attachments test).
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => undefined;
  }
  vi.mocked(chatApi.listSessions).mockResolvedValue([]);
  vi.mocked(chatApi.listMessages).mockResolvedValue([]);
  vi.mocked(chatApi.listDocuments).mockResolvedValue([]);
  // listAgents may be called by the composer chip on first render; resolve to []
  // so the chip degrades gracefully and the test doesn't accidentally await.
  vi.mocked(chatApi.listAgents).mockResolvedValue([]);
  vi.mocked(chatApi.createSession).mockResolvedValue({
    id: "draft",
    title: null,
    created_at: 0,
    updated_at: 0,
    message_count: 0,
  });
  useSimulator.getState().reset();
});

afterEach(() => {
  cleanup();
  useSimulator.getState().reset();
});

// ---------------------------------------------------------------------------
// Helpers — locate the loaded turn's agent bubble in the rendered thread.
// ---------------------------------------------------------------------------

// The persisted-text node has `whitespace-pre-wrap` + role="button" via onSelect.
// Find a stable wrapper for the loaded message by its title (clickToLoad/loaded).
function getLoadedAgentBubble(messageText: string): HTMLElement {
  // The persisted Exchange always passes the title="Click to replay this turn"
  // (or "Currently shown"); we find any role=button containing the bubble body.
  const candidates = screen.queryAllByRole("button");
  for (const node of candidates) {
    // The agent bubble's text content includes the answer OR the status label.
    // Pick the one whose closest ancestor isn't the composer / nav.
    if (node.textContent && node.classList.contains("whitespace-pre-wrap")) {
      return node;
    }
    // Replay bubble that is still in a status state has a different class set
    // (no whitespace-pre-wrap on inner span). Walk to its bubble container.
    const inner = node.querySelector(".whitespace-pre-wrap");
    if (inner) return node;
    if (node.textContent?.includes(messageText)) return node;
  }
  // Fall back to the first match by accessible name (used only if title shifts).
  throw new Error("loaded agent bubble not found in rendered thread");
}

describe("ChatPanel — replay-aware bubble (050)", () => {
  it("AC2 — shows the Reasoning… status while cursor sits inside agent.think", () => {
    const events = streamTrace();
    const thinkEndIdx = events.findIndex(
      (e) => e.stage === "agent.think" && e.phase === "end",
    );

    seedChat({ messages: [message({ id: "m1" })], loadedTraceId: "m1" });
    seedSimulator(events, thinkEndIdx, { playing: true, status: "done" });

    render(<ChatPanel bubble={idleBubble} />);

    // The localized "Reasoning…" / "Raciocinando…" label is in the bubble; the
    // persisted text must NOT be shown while the cursor is mid-think.
    expect(screen.getByText(/Reasoning|Raciocinando/)).toBeTruthy();
    expect(screen.queryByText(PERSISTED)).toBeNull();
  });

  it("AC3 — streams partial answer with a blinking caret mid-llm.generate", () => {
    const events = streamTrace();
    // Cursor on the SECOND token progress — view.answer reassembles to "Hello.".
    const secondToken = events.findIndex(
      (e, idx) =>
        e.stage === "llm.generate" &&
        e.phase === "progress" &&
        events.slice(0, idx).filter((p) => p.stage === "llm.generate" && p.phase === "progress")
          .length === 1,
    );
    expect(secondToken).toBeGreaterThan(0); // sanity

    seedChat({ messages: [message({ id: "m1" })], loadedTraceId: "m1" });
    seedSimulator(events, secondToken, { playing: true, status: "done" });

    const { container } = render(<ChatPanel bubble={idleBubble} />);

    // Partial reassembled text — "Hel" + "lo." = "Hello." (both tokens consumed
    // at this cursor). The persisted answer (different text) is NOT rendered.
    expect(screen.getByText(/Hello\./)).toBeTruthy();
    expect(screen.queryByText(PERSISTED)).toBeNull();
    // The blinking caret element from the live-bubble snippet is reused here.
    expect(container.querySelector(".caret")).not.toBeNull();
  });

  it("AC4 — settles to the persisted answer (no caret) once the cursor reaches the tail", () => {
    const events = streamTrace();

    seedChat({ messages: [message({ id: "m1" })], loadedTraceId: "m1" });
    seedSimulator(events, events.length - 1, { playing: false, status: "done" });

    const { container } = render(<ChatPanel bubble={idleBubble} />);

    expect(screen.getByText(PERSISTED)).toBeTruthy();
    expect(container.querySelector(".caret")).toBeNull();
  });

  it("AC5 — non-loaded turns never re-animate during replay of another turn", () => {
    const turn1 = message({ id: "m1", message: "first", answer: "FIRST-ANSWER" });
    const turn2 = message({ id: "m2", message: "second", answer: "SECOND-ANSWER" });
    const events = streamTrace();
    // Cursor mid-replay of turn2's trace.
    const thinkEndIdx = events.findIndex(
      (e) => e.stage === "agent.think" && e.phase === "end",
    );

    seedChat({ messages: [turn1, turn2], loadedTraceId: "m2" });
    seedSimulator(events, thinkEndIdx, { playing: true, status: "done" });

    render(<ChatPanel bubble={idleBubble} />);

    // turn1 stays static — its persisted answer is fully rendered (it is NOT
    // the loaded turn, so the replay branch never activates for it).
    expect(screen.getByText("FIRST-ANSWER")).toBeTruthy();
    // turn2 is mid-replay → status bubble; its persisted answer must NOT be
    // shown at this cursor (the projection wins for the loaded turn).
    expect(screen.queryByText("SECOND-ANSWER")).toBeNull();
    expect(screen.getByText(/Reasoning|Raciocinando/)).toBeTruthy();
  });

  it("AC6 — live `pending` path is unchanged: in-flight bubble owns the animation", () => {
    // A live send is in flight: `pending !== null`, no persisted message yet.
    // The bubble prop passed to ChatPanel drives the in-flight render exactly
    // as today; the new replay branch must not activate because no persisted
    // `messages` row has `m.id === loadedTraceId` (the row doesn't exist yet).
    seedChat({ messages: [], loadedTraceId: null, pending: "user typed this" });
    seedSimulator([], -1, { playing: false, status: "streaming" });

    const liveBubble = { kind: "answer" as const, text: "streaming-token", streaming: true };
    const { container } = render(<ChatPanel bubble={liveBubble} />);

    // The optimistic user bubble + the streaming token both render.
    expect(screen.getByText("user typed this")).toBeTruthy();
    expect(screen.getByText("streaming-token")).toBeTruthy();
    // The caret is the live-bubble's, identical to what 012 ships.
    expect(container.querySelector(".caret")).not.toBeNull();
  });

  it("AC7 — traceExpired falls back to the persisted answer", () => {
    seedChat({
      messages: [message({ id: "m1" })],
      loadedTraceId: "m1",
      traceExpired: true,
    });
    // No events available to project from (expired) — the simulator has nothing.
    seedSimulator([], -1, { playing: false, status: "done" });

    const { container } = render(<ChatPanel bubble={idleBubble} />);

    expect(screen.getByText(PERSISTED)).toBeTruthy();
    expect(container.querySelector(".caret")).toBeNull();
    // No status label sneaks in either — the bubble is pure persisted text.
    expect(screen.queryByText(/Reasoning|Raciocinando/)).toBeNull();
  });
});

// One end-to-end progression sanity check: step the cursor through the trace
// inside one render and observe the bubble walks status → partial → final.
// Complements the projection-level monotone test in chatStatus.replay.test.ts.
describe("ChatPanel — stepped cursor (050 wiring)", () => {
  it("walks status → streamed-with-caret → settled-persisted across cursor steps", () => {
    const events = streamTrace();

    seedChat({ messages: [message({ id: "m1" })], loadedTraceId: "m1" });
    seedSimulator(events, 0, { playing: true, status: "done" });

    const { container } = render(<ChatPanel bubble={idleBubble} />);

    // Frame 1: cursor at start → status bubble, no caret.
    expect(container.querySelector(".caret")).toBeNull();
    expect(screen.queryByText(PERSISTED)).toBeNull();

    // Step to the first llm.generate progress → partial answer + caret.
    const firstToken = events.findIndex(
      (e) => e.stage === "llm.generate" && e.phase === "progress",
    );
    act(() => {
      useSimulator.setState({ cursor: firstToken });
    });
    expect(container.querySelector(".caret")).not.toBeNull();

    // Step to the tail with playing=false → settled, persisted, no caret.
    act(() => {
      useSimulator.setState({ cursor: events.length - 1, playing: false });
    });
    expect(screen.getByText(PERSISTED)).toBeTruthy();
    expect(container.querySelector(".caret")).toBeNull();
  });
});

// Touch-the-fixture: silence "unused" warnings for symbols that the AC4
// re-anchor helper would consume if a future revision needs to walk the DOM
// across multiple turns. Keeping the helper around avoids re-deriving the
// brittle "find the agent bubble by title" pattern when adding tests.
void getLoadedAgentBubble;
void within;
