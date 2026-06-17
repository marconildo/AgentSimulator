// 063-mobile-demo-layout (AC1) — the matchMedia subscriber that gates the
// phone-only tab layout. SSR/no-matchMedia safe; updates when the query fires.

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./useIsMobile";

/** Install a controllable `window.matchMedia` mock; returns a `fire(matches)`
 *  to flip the media query and notify subscribers, mimicking a viewport resize. */
function installMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(max-width: 767px)",
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => mql),
  );
  return {
    fire(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb({ matches }));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useIsMobile", () => {
  it("returns false when the media query does not match", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when the media query matches", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when the media query fires a change event", () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => mm.fire(true));
    expect(result.current).toBe(true);
    act(() => mm.fire(false));
    expect(result.current).toBe(false);
  });

  it("is safe when matchMedia is absent (returns false)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
