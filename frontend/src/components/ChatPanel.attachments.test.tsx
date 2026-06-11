// 040-message-attachments: render-level assertions that uploaded chips live
// on the user message they were attached to (no X), not in the composer.
//
// The store-level tests (`useChat.test.ts`) cover AC1 / AC5 / AC9; this file
// pins the *visual contract* of AC7 + AC8 (FE side): a `ChatMessage.documents`
// row is rendered on the user bubble without a remove control, while the
// composer's pending chips keep their remove control.

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteDocument: vi.fn(),
  listSessions: vi.fn(),
  listMessages: vi.fn(),
  listDocuments: vi.fn(),
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
}));

vi.mock("../lib/sse", () => ({
  API_BASE: "",
  consumeEventStream: vi.fn(),
  streamChat: vi.fn(),
  batchChat: vi.fn(),
  fetchTrace: vi.fn().mockRejectedValue(new Error("not needed in this test")),
}));

// useHud.recompute fans out fetchTrace per message; bypass it so the
// component-render tests don't accidentally exercise the real network. The
// test only renders shape (chips on/off, X present/absent) — HUD totals are
// covered elsewhere. Mock the Zustand store as a callable + getState helper.
const _zeroCumulative = {
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
    selector({ cumulative: _zeroCumulative, loading: false });
  useHud.getState = () => ({ recompute: vi.fn().mockResolvedValue(undefined) });
  return { useHud };
});

import * as chatApi from "../lib/chatApi";
import type { ChatMessage, DocumentMeta } from "../lib/chatApi";
import { ChatPanel } from "./ChatPanel";
import { useChat } from "../store/useChat";

const session = (id: string) => ({
  id,
  title: "Test thread",
  created_at: 0,
  updated_at: 0,
  message_count: 1,
});

const doc = (id: string, filename: string, chunk_count = 4): DocumentMeta => ({
  document_id: id,
  filename,
  chunk_count,
  created_at: 0,
});

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  message: "Sobre qual curso fala esse doc?",
  answer: "O documento fala sobre Ciência da Computação.",
  chunks: [],
  skills: [],
  documents: [],
  created_at: 0,
  ...overrides,
});

const seedThread = (msgs: ChatMessage[], pending: DocumentMeta[] = []) => {
  useChat.setState({
    view: "thread",
    activeSessionId: "s1",
    sessions: [session("s1")],
    messages: msgs,
    pendingDocuments: pending,
    pendingAttachments: [],
    pending: null,
    input: "",
    loading: false,
    sending: false,
    uploading: false,
    cancelled: false,
    loadedTraceId: null,
    traceExpired: false,
    error: null,
  });
};

const bubble = { kind: "answer" as const, text: "", streaming: false };

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom doesn't implement Element.scrollTo; the Thread effect calls it
  // unconditionally after mount. Polyfill with a no-op so the render doesn't
  // throw inside React's commit phase.
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => undefined;
  }
  // ChatPanel.init() runs on mount; give every mocked endpoint a safe default
  // so an unconfigured mock doesn't throw inside the effect (we only care
  // about render shape — the store is seeded directly via setState).
  vi.mocked(chatApi.listSessions).mockResolvedValue([]);
  vi.mocked(chatApi.listMessages).mockResolvedValue([]);
  vi.mocked(chatApi.listDocuments).mockResolvedValue([]);
  vi.mocked(chatApi.createSession).mockResolvedValue({
    id: "draft",
    title: null,
    created_at: 0,
    updated_at: 0,
    message_count: 0,
  });
});

afterEach(() => {
  cleanup();
});

describe("ChatPanel — message attachments (AC7, AC8 FE)", () => {
  it("renders attached document chips above the user bubble WITHOUT a remove control", () => {
    seedThread([
      message({
        documents: [doc("d1", "ciência-da-comp.pdf"), doc("d2", "ementa.pdf", 7)],
      }),
    ]);

    render(<ChatPanel bubble={bubble} />);

    // Both filenames are present on the rendered turn.
    expect(screen.getByText(/ciência-da-comp\.pdf/i)).toBeTruthy();
    expect(screen.getByText(/ementa\.pdf/i)).toBeTruthy();

    // The chunk count is rendered alongside each chip.
    const cienceChip = screen.getByText(/ciência-da-comp\.pdf/i).closest(
      "[data-testid='attached-doc-chip']",
    ) as HTMLElement | null;
    expect(cienceChip).toBeTruthy();
    expect(within(cienceChip!).getByText(/^4$/)).toBeTruthy();
    // Attached chips are committed — no remove (X) control.
    expect(within(cienceChip!).queryByRole("button")).toBeNull();
  });

  it("renders no chip row when message.documents is empty", () => {
    seedThread([message({ documents: [] })]);

    render(<ChatPanel bubble={bubble} />);

    expect(screen.queryByTestId("attached-doc-chip")).toBeNull();
  });

  it("composer's pending chips DO expose a remove (X) button", () => {
    seedThread([], [doc("p1", "pending.pdf", 2)]);

    render(<ChatPanel bubble={bubble} />);

    const pendingChip = screen.getByTestId("pending-doc-chip");
    expect(within(pendingChip).getByText(/pending\.pdf/i)).toBeTruthy();
    // The composer chip carries the remove control (distinguishes it from the
    // attached, committed chips on a sent message).
    expect(within(pendingChip).getByRole("button")).toBeTruthy();
  });
});
