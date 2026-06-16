// 058-online-demo-mode (AC7) — in a demo build the composer is locked to the
// curated sample questions: the free-text textarea is disabled, the upload
// control is gone, and the sample-question chips render and are clickable.

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/chatApi", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteDocument: vi.fn(),
  listSessions: vi.fn().mockResolvedValue([]),
  listMessages: vi.fn().mockResolvedValue([]),
  listDocuments: vi.fn().mockResolvedValue([]),
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

import { ChatPanel } from "./ChatPanel";
import { DEMO_QUESTIONS } from "../lib/demo";
import { UI } from "../i18n/strings";
import { useChat } from "../store/useChat";

const bubble = { kind: "answer" as const, text: "", streaming: false };

beforeEach(() => {
  // Force the demo build for this suite; `isDemo()` reads import.meta.env.
  vi.stubEnv("VITE_DEMO_MODE", "1");
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => undefined;
  }
  // Seed a non-empty thread so the locked composer (not the empty state) renders.
  useChat.setState({
    view: "thread",
    activeSessionId: "s1",
    sessions: [{ id: "s1", title: "Demo", created_at: 0, updated_at: 0, message_count: 1 }],
    messages: [
      {
        id: "m1",
        message: "What is RAG and how does retrieval work?",
        answer: "RAG grounds an LLM in retrieved documents.",
        chunks: [],
        skills: [],
        documents: [],
        created_at: 0,
      },
    ],
    pendingDocuments: [],
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
});

afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

describe("ChatPanel — demo composer lockdown (AC7)", () => {
  it("disables the free-text textarea", () => {
    render(<ChatPanel bubble={bubble} />);
    const hint = UI.en.demo.composerHint;
    const textarea = screen.getByPlaceholderText(hint) as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it("does not render an upload control", () => {
    render(<ChatPanel bubble={bubble} />);
    expect(screen.queryByLabelText(/attach|anexar/i)).toBeNull();
  });

  it("renders the curated sample questions as clickable chips", () => {
    render(<ChatPanel bubble={bubble} />);
    for (const q of DEMO_QUESTIONS) {
      const chip = screen.getByRole("button", { name: q.label.en }) as HTMLButtonElement;
      expect(chip).toBeTruthy();
      expect(chip.disabled).toBe(false);
    }
  });
});
