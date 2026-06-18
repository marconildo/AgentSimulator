// 058-online-demo-mode — registry of REAL captured traces for the backend-less
// showcase build (constitution §3: these are captured real runs, not fabricated
// data). Re-capture with `scripts/capture_demo_traces.py` against a live backend
// if the event protocol (§1) changes.
//
// Each fixture is a verbatim `TraceSummary` returned by `POST /api/chat` in batch
// mode: `{ trace_id, message, answer, events }`. Filenames encode the lookup key
// `<qid>.<scenario>.<lang>` so a curated question maps to (scenario × language).
//
// Fixtures are AUTO-DISCOVERED via `import.meta.glob`, so adding a captured scenario
// (e.g. `deepagents`) is just a re-capture — no edit here, and a missing file never
// breaks the build (the lookup falls back; see `selectDemoTrace`).

import type { TraceSummary } from "../types/events";
import type { AppConfig } from "../lib/chatApi";

import config from "./fixtures/_config.json";

/** The `/api/config` snapshot, so the demo prefills the same defaults the live
 *  backend would (models, tools, top-k bounds, scenarios, …). Read-only. */
export const DEMO_CONFIG = config as unknown as AppConfig;

export interface DemoTrace {
  qid: string;
  scenario: string; // "simple" | "intermediate" | "ragless" | "deepagents"
  lang: string; // "en" | "pt"
  fixture: TraceSummary;
}

// Eagerly bundle every captured trace JSON. `_config.json` is the /api/config
// snapshot (not a trace) and is excluded by the `<qid>.<scenario>.<lang>` parse.
const modules = import.meta.glob<{ default: unknown }>("./fixtures/*.json", {
  eager: true,
});

export const DEMO_TRACES: DemoTrace[] = Object.entries(modules)
  .map(([path, mod]) => ({
    name: path.split("/").pop()!.replace(/\.json$/, ""),
    mod,
  }))
  .filter(({ name }) => name.split(".").length === 3) // <qid>.<scenario>.<lang>, skips _config
  .map(({ name, mod }) => {
    const [qid, scenario, lang] = name.split(".");
    return { qid, scenario, lang, fixture: mod.default as unknown as TraceSummary };
  });
