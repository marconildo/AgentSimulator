// 027-skills — pure derivation of which skills a turn applied, read from its
// trace. A skill is "applied" when the agent successfully loaded it: a
// `load_skill` mcp.call END whose result is the skill body (not an `error:`
// string). The distinct names, in first-load order, back the "skills applied"
// badge — the same set the backend persists on the message (parity is the AC).

import type { TraceEvent } from "../types/events";

const LOAD_SKILL = "load_skill";

/** Distinct skill names successfully loaded in this trace, in first-load order. */
export function appliedSkills(events: TraceEvent[]): string[] {
  const applied: string[] = [];
  for (const ev of events) {
    if (ev.phase !== "end" || ev.stage !== "mcp.call") continue;
    if (ev.data.tool !== LOAD_SKILL) continue;
    const result = typeof ev.data.result === "string" ? ev.data.result : "";
    if (!result || result.startsWith("error:")) continue; // not-found / failed load
    const args = (ev.data.args as Record<string, unknown> | undefined) ?? {};
    const name = typeof args.name === "string" ? args.name : "";
    if (name && !applied.includes(name)) applied.push(name);
  }
  return applied;
}
