// 030-event-console — a tiny clipboard seam so copy actions are unit-testable
// and degrade gracefully when the async Clipboard API is unavailable (older
// browsers, insecure origin). Components call `copyText(value)`; tests can spy
// on it or assert on the value handed in.

/** Copy `value` to the clipboard, best-effort. Returns whether it succeeded. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  return false;
}
