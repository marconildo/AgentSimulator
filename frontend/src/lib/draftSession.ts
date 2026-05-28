// A tiny localStorage flag, mirroring lib/onboarding.ts: remember that the user
// is sitting in an empty "New conversation" draft so a page refresh doesn't
// silently revert to the most recent session. Draft state is otherwise purely
// in-memory (no session row is created until the first send / upload), so
// without this flag init() always reopens the latest conversation and loses
// the user's explicit intent to start fresh.
//
// Per-browser UI state, never shared server state (constitution §8 single-instance).

export const DRAFT_PENDING_KEY = "agentsim.draftPending";

/** True when the user clicked "New conversation" and hasn't yet sent / uploaded. */
export function isDraftPending(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(DRAFT_PENDING_KEY) !== null;
}

/** Record that we're in a draft state (survives a refresh). */
export function markDraftPending(): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(DRAFT_PENDING_KEY, "1");
}

/** Drop the flag — called the moment the draft becomes a real session, or the
 *  user explicitly opens another conversation from the sidebar. */
export function clearDraftPending(): void {
  if (typeof localStorage !== "undefined") localStorage.removeItem(DRAFT_PENDING_KEY);
}
