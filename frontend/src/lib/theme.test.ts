// AC2 — the theme choice persists in localStorage, is restored on reload, and
// defaults to dark when nothing is stored. The store is a near-copy of the
// language/cloud stores; these tests pin the behavior that the rest of the app
// (and the light theme) depends on.

import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "agentsim.theme";

// The store applies the persisted choice at module load, so each test imports a
// fresh copy (resetModules re-runs that side effect) after seeding localStorage
// and resetting the DOM.
async function freshStore(stored?: string) {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  if (stored !== undefined) localStorage.setItem(STORAGE_KEY, stored);
  vi.resetModules();
  return import("./theme");
}

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to dark when nothing is stored", async () => {
    const { initialTheme, useTheme } = await freshStore();
    expect(initialTheme()).toBe("dark");
    expect(useTheme.getState().theme).toBe("dark");
  });

  it("restores a persisted choice on reload", async () => {
    const { initialTheme, useTheme } = await freshStore("light");
    expect(initialTheme()).toBe("light");
    expect(useTheme.getState().theme).toBe("light");
  });

  it("falls back to dark for junk in storage", async () => {
    const { initialTheme } = await freshStore("chartreuse");
    expect(initialTheme()).toBe("dark");
  });

  it("setTheme persists the choice and reflects it on <html data-theme>", async () => {
    const { useTheme } = await freshStore();
    useTheme.getState().setTheme("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    useTheme.getState().setTheme("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the persisted choice to <html data-theme> at module load", async () => {
    const { useTheme } = await freshStore("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(useTheme.getState().theme).toBe("light");
  });

  it("isTheme guards the union", async () => {
    const { isTheme } = await freshStore();
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("solar")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});
