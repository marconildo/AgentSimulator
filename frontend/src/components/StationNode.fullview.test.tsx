/** @vitest-environment jsdom */
// 076-station-full-views — AC1/AC2: the four remaining real stations (mcp /
// database / backend / frontend) grow the "Open full view" button, clicking it
// toggles the store `detail`, and a preview / non-detail station has no button.

import { ReactFlowProvider } from "@xyflow/react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import { StationNode, type StationNodeData } from "./nodes/StationNode";
import { stationByIdFor, type StationId } from "../lib/stations";
import { useSimulator } from "../store/useSimulator";

const stations = stationByIdFor("en");

function nodeData(id: StationId, comingSoon = false): StationNodeData {
  return {
    meta: stations[id],
    runtime: { status: "idle", events: [] },
    isActive: false,
    readout: "",
    isSelected: false,
    expanded: false,
    height: 120,
    comingSoon,
  };
}

function renderNode(id: StationId, comingSoon = false): void {
  // NodeProps carries many xyflow-internal fields; the component only reads
  // `data`, so a cast keeps the test focused on behavior.
  const props = { data: nodeData(id, comingSoon) } as unknown as Parameters<typeof StationNode>[0];
  render(
    <ReactFlowProvider>
      <StationNode {...props} />
    </ReactFlowProvider> as ReactNode,
  );
}

afterEach(() => {
  cleanup();
  useSimulator.setState({ detail: null, selected: null });
});

describe("StationNode — full-view button (076)", () => {
  it.each<StationId>(["mcp", "database", "backend", "frontend"])(
    "renders the Open full view button for %s",
    (id) => {
      renderNode(id);
      expect(screen.getByText(/Open full view/i)).toBeTruthy();
    },
  );

  it("renders no full-view button for a non-detail station", () => {
    renderNode("storage");
    expect(screen.queryByText(/Open full view/i)).toBeNull();
  });

  it("renders no full-view button for a coming-soon preview station", () => {
    renderNode("mcp", true);
    expect(screen.queryByText(/Open full view/i)).toBeNull();
  });

  it("toggles the store detail open and closed when clicked", () => {
    renderNode("mcp");
    const btn = screen.getByText(/Open full view/i);
    fireEvent.click(btn);
    expect(useSimulator.getState().detail).toBe("mcp");
    fireEvent.click(screen.getByText(/Open full view/i));
    expect(useSimulator.getState().detail).toBeNull();
  });
});
