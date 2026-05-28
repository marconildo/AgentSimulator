// 037-first-visit-onboarding — a tiny first-visit flag, mirroring lib/scenario.ts:
// a single localStorage key, read live. It drives two first-impression touches —
// the one-shot auto-tour and the canvas-first (collapsed Inspector) opening frame.
// Per-browser UI state, never shared server state (constitution §8 single-instance).

export const ONBOARDED_KEY = "agentsim.onboarded";

/** True until the visitor has been onboarded once (the flag is absent). */
export function isFirstVisit(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ONBOARDED_KEY) === null;
}

/** Record that onboarding has happened, so it never auto-fires again (refresh,
 *  new conversation, later visits). */
export function markOnboarded(): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(ONBOARDED_KEY, "1");
}

/** Whether the app should auto-start the guided tour — first visit only. */
export function shouldAutoOnboard(): boolean {
  return isFirstVisit();
}

/** The Inspector starts collapsed on the first visit only, so the canvas leads
 *  the eye; later visits keep the expanded default. */
export function initialInspectorCollapsed(): boolean {
  return isFirstVisit();
}
