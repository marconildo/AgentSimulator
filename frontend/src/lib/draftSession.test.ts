// A tiny localStorage flag that survives a refresh and remembers the user
// clicked "New conversation". Without it, init() opens the latest session on
// reload, undoing the user's explicit intent to start fresh.

import { beforeEach, describe, expect, it } from "vitest";

import {
  DRAFT_PENDING_KEY,
  clearDraftPending,
  isDraftPending,
  markDraftPending,
} from "./draftSession";

describe("draft-session pending flag", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("is absent by default", () => {
    expect(isDraftPending()).toBe(false);
  });

  it("markDraftPending persists across a fresh read (simulates a reload)", () => {
    markDraftPending();
    expect(localStorage.getItem(DRAFT_PENDING_KEY)).toBeTruthy();
    expect(isDraftPending()).toBe(true);
  });

  it("clearDraftPending removes the flag", () => {
    markDraftPending();
    clearDraftPending();
    expect(isDraftPending()).toBe(false);
  });
});
