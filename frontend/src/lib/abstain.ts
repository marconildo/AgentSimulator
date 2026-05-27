// 021-abstain-badge: a pure, structural predicate over a tool call's event
// `data`. The backend records a `found` flag on every `mcp.call` END (false when
// the tool returned empty / not-found — e.g. `kb_lookup` for an unknown topic).
// A well-behaved agent **abstains** on such a sub-query instead of inventing an
// answer; the Agent anatomy badges that. Reading the structured signal (never
// string-matching the result) keeps the detection robust and i18n-proof.

import type { ToolResultData } from "../types/events";

/** True when a tool call honestly returned nothing (`found === false`). */
export function abstained(data: ToolResultData): boolean {
  // Only an explicit `found:false` badges — absence of the signal (an older
  // trace, or a non-tool event) is NOT abstention (honest by construction).
  return data.found === false;
}
