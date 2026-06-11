// 045-composer-agent-selector — the new composer mini agent chip (left of 📎)
// and its locked-after-first-turn behaviour. Covers AC5 / AC6 / AC7 / AC8 / AC9.
//
// Test scope is render-level (RTL + JSDOM): the chip exists in the toolbar in
// the right DOM order, clicking opens the floating menu when unlocked, calling
// `setSessionAgent` patches the active session, and the chip flips disabled
// the moment `message_count` becomes > 0. The store-level stale-tab 409 path
// has its own test in `useChat.agentLock.test.ts`.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Re-export ApiError + isAgentLockedError so the AC12 path can construct a
// real 409 reject value identical to what `jsonApi` would throw at runtime.
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

// 040 set the precedent: mock useHud so the panel render doesn't trip the
// fetchTrace fan-out per message. The chip + lock state come from useChat only.
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
import { ApiError, type AgentMeta } from "../lib/chatApi";
import { ChatPanel } from "./ChatPanel";
import { useChat } from "../store/useChat";

const agent = (id: string, name: string, isDefault = false): AgentMeta => ({
  id,
  name,
  description: "",
  system_prompt: "g",
  agent_prompt: "a",
  model: "gpt-4o-mini",
  enabled_tools: [],
  is_default: isDefault,
  created_at: 0,
  updated_at: 0,
});

const ALICE = agent("a1", "Alice", true);
const BOB = agent("a2", "Bob");

type Seed = {
  active: AgentMeta;
  messageCount: number;
  messages?: Array<unknown>;
};

const makeSession = (opts: Seed) => ({
  id: "s1",
  title: "Test thread",
  created_at: 0,
  updated_at: 0,
  message_count: opts.messageCount,
  agent: opts.active,
});

const seedThread = (opts: Seed) => {
  const session = makeSession(opts);
  useChat.setState({
    view: "thread",
    activeSessionId: "s1",
    sessions: [session],
    messages: (opts.messages ?? []) as never,
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
  // Mirror the seed in listSessions so ChatPanel.init() doesn't clobber the
  // state with [] → newChat → fresh draft. After init resolves, the store
  // still carries our seeded session (init's openSession path preserves it).
  vi.mocked(chatApi.listSessions).mockResolvedValue([session]);
};

const bubble = { kind: "answer" as const, text: "", streaming: false };

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof Element.prototype.scrollTo !== "function") {
    Element.prototype.scrollTo = () => undefined;
  }
  vi.mocked(chatApi.listSessions).mockResolvedValue([]);
  vi.mocked(chatApi.listMessages).mockResolvedValue([]);
  vi.mocked(chatApi.listDocuments).mockResolvedValue([]);
  vi.mocked(chatApi.listAgents).mockResolvedValue([ALICE, BOB]);
  vi.mocked(chatApi.setSessionAgent).mockImplementation(async (sid, aid) => ({
    id: sid,
    title: "Test thread",
    created_at: 0,
    updated_at: 0,
    message_count: 0,
    agent: aid === ALICE.id ? ALICE : BOB,
  }));
  vi.mocked(chatApi.createSession).mockResolvedValue({
    id: "s1",
    title: null,
    created_at: 0,
    updated_at: 0,
    message_count: 0,
  });
});

afterEach(() => {
  cleanup();
});

describe("ChatPanel — composer agent selector (045)", () => {
  it("renders the agent chip in the composer toolbar to the LEFT of attach", () => {
    // AC5
    seedThread({ active: ALICE, messageCount: 0 });
    render(<ChatPanel bubble={bubble} />);
    const chip = screen.getByTestId("composer-agent-chip");
    const attach = screen.getByLabelText(/attach a pdf/i);
    expect(chip).toBeTruthy();
    expect(within(chip).getByText("Alice")).toBeTruthy();
    // DOM order: chip before attach.
    expect(chip.compareDocumentPosition(attach) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("opens the menu when clicked while unlocked, showing every agent", async () => {
    // AC6
    seedThread({ active: ALICE, messageCount: 0 });
    render(<ChatPanel bubble={bubble} />);
    fireEvent.click(screen.getByTestId("composer-agent-chip"));
    const menu = await screen.findByTestId("composer-agent-menu");
    expect(within(menu).getByText("Alice")).toBeTruthy();
    expect(within(menu).getByText("Bob")).toBeTruthy();
  });

  it("calls setSessionAgent and updates the store on selection", async () => {
    // AC7
    seedThread({ active: ALICE, messageCount: 0 });
    render(<ChatPanel bubble={bubble} />);
    fireEvent.click(screen.getByTestId("composer-agent-chip"));
    // Wait for the row (catalog-loaded state) rather than the menu shell —
    // findByTestId on the row blocks until listAgents resolves and renders.
    const bobRow = await screen.findByTestId(`composer-agent-menu-row-${BOB.id}`);
    fireEvent.click(bobRow);

    await vi.waitFor(() => {
      expect(chatApi.setSessionAgent).toHaveBeenCalledWith("s1", BOB.id);
    });
    await vi.waitFor(() => {
      const row = useChat.getState().sessions.find((s) => s.id === "s1");
      expect(row?.agent?.id).toBe(BOB.id);
    });
    // Menu closes after selection.
    await vi.waitFor(() => {
      expect(screen.queryByTestId("composer-agent-menu")).toBeNull();
    });
  });

  it("renders the chip disabled with the lock tooltip when message_count > 0", () => {
    // AC8
    seedThread({ active: ALICE, messageCount: 1 });
    render(<ChatPanel bubble={bubble} />);
    const chip = screen.getByTestId("composer-agent-chip");
    expect(chip.hasAttribute("disabled")).toBe(true);
    expect(chip.getAttribute("title") ?? "").toMatch(/locked after the conversation/i);
    // No chevron when locked.
    expect(within(chip).queryByTestId("composer-agent-chevron")).toBeNull();
    // Click is a no-op — the menu never opens.
    fireEvent.click(chip);
    expect(screen.queryByTestId("composer-agent-menu")).toBeNull();
  });

  it("surfaces the lock note and refreshes sessions when the server returns 409 (AC12)", async () => {
    // Stale tab: the chip thinks the conversation is empty, but the server
    // already counted a turn. setSessionAgent rejects with the structured
    // agent_locked detail; the store catches it, sets the locked note, and
    // calls showList() to refresh the sessions list (which then flips the
    // chip locked on next render).
    seedThread({ active: ALICE, messageCount: 0 });
    vi.mocked(chatApi.setSessionAgent).mockRejectedValueOnce(
      new ApiError(409, "POST /api/sessions/s1 failed: 409", {
        detail: { detail: "agent_locked", message_count: 1 },
      }),
    );
    // First listSessions call (during ChatPanel.init) sees the empty
    // conversation so the chip starts unlocked. After the 409, the store's
    // showList refetches — that one should return the locked count so the
    // chip flips locked on the next render.
    const unlockedSession = makeSession({ active: ALICE, messageCount: 0 });
    const lockedSession = makeSession({ active: ALICE, messageCount: 1 });
    vi.mocked(chatApi.listSessions)
      .mockResolvedValueOnce([unlockedSession])
      .mockResolvedValue([lockedSession]);

    render(<ChatPanel bubble={bubble} />);
    fireEvent.click(screen.getByTestId("composer-agent-chip"));
    const bobRow = await screen.findByTestId(`composer-agent-menu-row-${BOB.id}`);
    fireEvent.click(bobRow);

    await vi.waitFor(() => {
      expect(useChat.getState().agentLockedNote).toMatch(
        /agent is locked/i,
      );
    });
    // The session's agent is NOT changed (lock fired before mutation).
    expect(useChat.getState().sessions.find((s) => s.id === "s1")?.agent?.id).toBe(
      ALICE.id,
    );
  });

  it("flips locked when message_count becomes 1 after a turn lands", () => {
    // AC9
    seedThread({ active: ALICE, messageCount: 0 });
    const { rerender } = render(<ChatPanel bubble={bubble} />);
    expect(screen.getByTestId("composer-agent-chip").hasAttribute("disabled")).toBe(false);

    // Simulate the post-send reload: useChat refetches sessions, the row gets
    // message_count = 1. Just mutate the store and re-render.
    useChat.setState((s) => ({
      sessions: s.sessions.map((row) =>
        row.id === "s1" ? { ...row, message_count: 1 } : row,
      ),
    }));
    rerender(<ChatPanel bubble={bubble} />);
    expect(screen.getByTestId("composer-agent-chip").hasAttribute("disabled")).toBe(true);
  });

  // --- Draft-state regression: a fresh `+ New chat` (no session row yet) ---
  // The two bugs reported on 2026-05-28:
  //   1) Chip showed "—" instead of the catalog's default agent.
  //   2) Selecting from the menu was a no-op because onSelect early-returned
  //      on `!activeSessionId`.
  // Both fixed by seeding `draftAgent` in init/newChat + treating selection on
  // a draft as a local mutation that `ensureSession` applies on first send.
  describe("draft state (no activeSessionId yet)", () => {
    const seedDraft = (draftAgent: AgentMeta | null) => {
      useChat.setState({
        view: "thread",
        activeSessionId: null,
        sessions: [],
        messages: [],
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
        draftAgent,
      });
    };

    it("shows the default agent on the chip (not '—') and is unlocked", () => {
      seedDraft(ALICE);
      render(<ChatPanel bubble={bubble} />);
      const chip = screen.getByTestId("composer-agent-chip");
      expect(within(chip).getByText("Alice")).toBeTruthy();
      expect(chip.hasAttribute("disabled")).toBe(false);
    });

    it("lets the user pick a different agent — updates draftAgent without an API call", async () => {
      seedDraft(ALICE);
      render(<ChatPanel bubble={bubble} />);
      fireEvent.click(screen.getByTestId("composer-agent-chip"));
      const bobRow = await screen.findByTestId(`composer-agent-menu-row-${BOB.id}`);
      fireEvent.click(bobRow);

      await vi.waitFor(() => {
        expect(useChat.getState().draftAgent?.id).toBe(BOB.id);
      });
      // No PATCH in draft state — the session doesn't exist yet.
      expect(chatApi.setSessionAgent).not.toHaveBeenCalled();
      // The chip now reflects the new choice.
      await vi.waitFor(() => {
        const chip = screen.getByTestId("composer-agent-chip");
        expect(within(chip).getByText("Bob")).toBeTruthy();
      });
    });
  });
});
