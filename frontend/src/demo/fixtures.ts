// 058-online-demo-mode — registry of REAL captured traces for the backend-less
// showcase build (constitution §3: these are captured real runs, not fabricated
// data). Re-capture with `scripts/capture_demo_traces.py` against a live backend
// if the event protocol (§1) changes.
//
// Each fixture is a verbatim `TraceSummary` returned by `POST /api/chat` in batch
// mode: `{ trace_id, message, answer, events }`. Filenames encode the lookup key
// `<qid>.<scenario>.<lang>` so a curated question maps to (scenario × language).

import type { TraceSummary } from "../types/events";
import type { AppConfig } from "../lib/chatApi";

import config from "./fixtures/_config.json";

import ragSimpleEn from "./fixtures/rag.simple.en.json";
import ragIntermediateEn from "./fixtures/rag.intermediate.en.json";
import ragRaglessEn from "./fixtures/rag.ragless.en.json";
import ragSimplePt from "./fixtures/rag.simple.pt.json";
import ragIntermediatePt from "./fixtures/rag.intermediate.pt.json";
import ragRaglessPt from "./fixtures/rag.ragless.pt.json";
import mathSimpleEn from "./fixtures/math.simple.en.json";
import mathIntermediateEn from "./fixtures/math.intermediate.en.json";
import mathRaglessEn from "./fixtures/math.ragless.en.json";
import mathSimplePt from "./fixtures/math.simple.pt.json";
import mathIntermediatePt from "./fixtures/math.intermediate.pt.json";
import mathRaglessPt from "./fixtures/math.ragless.pt.json";
import mcpSimpleEn from "./fixtures/mcp.simple.en.json";
import mcpIntermediateEn from "./fixtures/mcp.intermediate.en.json";
import mcpRaglessEn from "./fixtures/mcp.ragless.en.json";
import mcpSimplePt from "./fixtures/mcp.simple.pt.json";
import mcpIntermediatePt from "./fixtures/mcp.intermediate.pt.json";
import mcpRaglessPt from "./fixtures/mcp.ragless.pt.json";
import timeSimpleEn from "./fixtures/time.simple.en.json";
import timeIntermediateEn from "./fixtures/time.intermediate.en.json";
import timeRaglessEn from "./fixtures/time.ragless.en.json";
import timeSimplePt from "./fixtures/time.simple.pt.json";
import timeIntermediatePt from "./fixtures/time.intermediate.pt.json";
import timeRaglessPt from "./fixtures/time.ragless.pt.json";

/** The `/api/config` snapshot, so the demo prefills the same defaults the live
 *  backend would (models, tools, top-k bounds, scenarios, …). Read-only. */
export const DEMO_CONFIG = config as unknown as AppConfig;

export interface DemoTrace {
  qid: string;
  scenario: string; // "simple" | "intermediate" | "ragless"
  lang: string; // "en" | "pt"
  fixture: TraceSummary;
}

const f = (
  qid: string,
  scenario: string,
  lang: string,
  fixture: unknown,
): DemoTrace => ({ qid, scenario, lang, fixture: fixture as unknown as TraceSummary });

export const DEMO_TRACES: DemoTrace[] = [
  f("rag", "simple", "en", ragSimpleEn),
  f("rag", "intermediate", "en", ragIntermediateEn),
  f("rag", "ragless", "en", ragRaglessEn),
  f("rag", "simple", "pt", ragSimplePt),
  f("rag", "intermediate", "pt", ragIntermediatePt),
  f("rag", "ragless", "pt", ragRaglessPt),
  f("math", "simple", "en", mathSimpleEn),
  f("math", "intermediate", "en", mathIntermediateEn),
  f("math", "ragless", "en", mathRaglessEn),
  f("math", "simple", "pt", mathSimplePt),
  f("math", "intermediate", "pt", mathIntermediatePt),
  f("math", "ragless", "pt", mathRaglessPt),
  f("mcp", "simple", "en", mcpSimpleEn),
  f("mcp", "intermediate", "en", mcpIntermediateEn),
  f("mcp", "ragless", "en", mcpRaglessEn),
  f("mcp", "simple", "pt", mcpSimplePt),
  f("mcp", "intermediate", "pt", mcpIntermediatePt),
  f("mcp", "ragless", "pt", mcpRaglessPt),
  f("time", "simple", "en", timeSimpleEn),
  f("time", "intermediate", "en", timeIntermediateEn),
  f("time", "ragless", "en", timeRaglessEn),
  f("time", "simple", "pt", timeSimplePt),
  f("time", "intermediate", "pt", timeIntermediatePt),
  f("time", "ragless", "pt", timeRaglessPt),
];
