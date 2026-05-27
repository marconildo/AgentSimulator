// 031-tool-catalog-clarity — AC3: the Settings → Tools list renders one toggle
// per item in /api/config's tool set (none hidden), each showing the friendly
// label and the raw model-facing handle. `toolRows` is the pure view-model the
// panel maps over, so a future filter can't silently drop a tool unnoticed.

import { describe, expect, it } from "vitest";

import { UI } from "../i18n/strings";
import { toolRows } from "./tools";

// A fixture mirroring /api/config's canonical agent tool set.
const CONFIG_TOOLS = [
  { name: "search_knowledge_base", description: "Vector RAG over the corpus + your PDFs." },
  { name: "calculator", description: "Evaluate an arithmetic expression." },
  { name: "current_time", description: "Return the current time." },
  { name: "kb_lookup", description: "A tiny canned glossary." },
  { name: "load_skill", description: "Load a named skill's instructions." },
];

describe("toolRows (031-tool-catalog-clarity)", () => {
  it("renders one row per config tool — none hidden (AC3)", () => {
    const rows = toolRows(CONFIG_TOOLS, UI.en.settings.experiment.toolLabels);
    expect(rows).toHaveLength(CONFIG_TOOLS.length);
    expect(rows.map((r) => r.name)).toEqual(CONFIG_TOOLS.map((t) => t.name));
  });

  it("each row carries a friendly label and the raw handle (AC1/AC3)", () => {
    const rows = toolRows(CONFIG_TOOLS, UI.en.settings.experiment.toolLabels);
    for (const row of rows) {
      expect(row.label.trim()).toBeTruthy();
      expect(row.label).not.toBe(row.name); // friendly, not bare snake_case
      expect(row.name).toMatch(/^[a-z_]+$/); // raw handle preserved verbatim
    }
  });

  it("falls back to the raw handle for an unknown tool", () => {
    const rows = toolRows([{ name: "mystery_tool", description: "" }], {});
    expect(rows[0].label).toBe("mystery_tool");
  });
});
