// 041-settings-page · AC6e regression for the 🗑️ Clear-databases section.
// Pin the inline-confirm flow + the result line after the section is lifted
// out of the popover.

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsClear } from "./SettingsClear";
import { useChat } from "../store/useChat";

beforeEach(() => {
  useChat.setState({});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SettingsClear — AC6e", () => {
  it("enters confirm mode, calls clearAll() on Yes, and renders the result line", async () => {
    const clearAll = vi.spyOn(useChat.getState(), "clearAll").mockResolvedValue({
      sessions_deleted: 3,
      messages_deleted: 12,
      documents_deleted: 1,
      skills_deleted: 0,
      vectors_removed: 17,
    });

    render(<SettingsClear />);

    // Initial state — no confirm prompt visible.
    expect(screen.queryByRole("button", { name: /Yes, clear/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Clear databases/i }));

    // Confirm prompt now visible.
    const yes = await screen.findByRole("button", { name: /Yes, clear/i });
    fireEvent.click(yes);

    await waitFor(() => expect(clearAll).toHaveBeenCalledTimes(1));

    // Result line surfaces the returned counts.
    expect(await screen.findByText(/3.*conversations.*17.*chunks/i)).toBeTruthy();
  });

  it("Cancel exits confirm mode without calling clearAll()", async () => {
    const clearAll = vi.spyOn(useChat.getState(), "clearAll").mockResolvedValue({
      sessions_deleted: 0,
      messages_deleted: 0,
      documents_deleted: 0,
      skills_deleted: 0,
      vectors_removed: 0,
    });

    render(<SettingsClear />);
    fireEvent.click(screen.getByRole("button", { name: /Clear databases/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Cancel$/i }));

    expect(clearAll).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Yes, clear/i })).toBeNull();
  });
});
