import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useMemo } from "react";

import type { DerivedView, StationRuntime } from "../lib/derive";
import {
  HOPS,
  STATIONS,
  STATION_BY_ID,
  TIERS,
  type StationId,
} from "../lib/stations";
import { FlowEdge } from "./edges/FlowEdge";
import { StationNode } from "./nodes/StationNode";
import { TierNode } from "./nodes/TierNode";

const nodeTypes = { station: StationNode, tier: TierNode };
const edgeTypes = { flow: FlowEdge };

interface FlowCanvasProps {
  view: DerivedView;
  selected: StationId | null;
  onSelect: (id: StationId | null) => void;
}

export function FlowCanvas({ view, selected, onSelect }: FlowCanvasProps) {
  const nodes: Node[] = useMemo(() => {
    const tierNodes: Node[] = TIERS.map((meta) => ({
      id: `tier-${meta.id}`,
      type: "tier",
      position: { x: meta.box.x, y: meta.box.y },
      data: { meta },
      style: { width: meta.box.w, height: meta.box.h, pointerEvents: "none" },
      selectable: false,
      draggable: false,
      zIndex: 0,
    }));

    const stationNodes: Node[] = STATIONS.map((meta) => ({
      id: meta.id,
      type: "station",
      position: meta.position,
      data: {
        meta,
        runtime: view.stations[meta.id],
        readout: readoutFor(meta.id, view.stations[meta.id]),
        isSelected: selected === meta.id,
      },
      draggable: false,
      zIndex: 1,
    }));

    return [...tierNodes, ...stationNodes];
  }, [view, selected]);

  const edges: Edge[] = useMemo(
    () =>
      HOPS.map((hop) => {
        const id = `${hop.source}-${hop.target}`;
        const active = view.activeHopId === id;
        return {
          id,
          source: hop.source,
          target: hop.target,
          type: "flow",
          data: {
            accent: STATION_BY_ID[hop.target].accent,
            label: hop.label,
            secure: hop.secure,
            active,
            reverse: active && view.hopReverse,
            stream: id === "frontend-backend" && view.streaming,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#2a3658" },
        };
      }),
    [view],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.1 }}
      minZoom={0.4}
      maxZoom={1.5}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      proOptions={{ hideAttribution: false }}
      onNodeClick={(_, node) => {
        if (node.type === "station") onSelect(node.id as StationId);
      }}
      onPaneClick={() => onSelect(null)}
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#1b2540" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function lastWith(events: StationRuntime["events"], pred: (e: StationRuntime["events"][number]) => boolean) {
  for (let i = events.length - 1; i >= 0; i--) if (pred(events[i])) return events[i];
  return undefined;
}

function readoutFor(id: StationId, rt: StationRuntime): string {
  switch (id) {
    case "frontend": {
      const respond = lastWith(rt.events, (e) => e.stage === "respond" && e.phase === "end");
      if (respond) return "answer received ✓";
      const msg = rt.events.find((e) => typeof e.data.message === "string")?.data.message as string | undefined;
      return msg ? `"${truncate(msg, 22)}"` : "";
    }
    case "backend":
      return rt.status === "idle" ? "" : "FastAPI · SSE stream";
    case "agent": {
      const think = lastWith(rt.events, (e) => e.stage === "agent.think" && e.phase === "end");
      if (think) {
        const calls = (think.data.tool_calls as Array<{ name: string }> | undefined) ?? [];
        return calls.length ? `call → ${calls.map((c) => c.name).join(", ")}` : "decision: answer";
      }
      return rt.status === "idle" ? "" : "routing…";
    }
    case "rag": {
      const ret = lastWith(rt.events, (e) => e.stage === "rag.retrieve" && e.phase === "end");
      if (ret) {
        const k = (ret.data.k as number | undefined) ?? (ret.data.chunks as unknown[] | undefined)?.length;
        const top = ret.metrics.top_score;
        return `top-${k}${typeof top === "number" ? ` · score ${top.toFixed(2)}` : ""}`;
      }
      return rt.status === "idle" ? "" : "embedding query…";
    }
    case "mcp": {
      const call = lastWith(rt.events, (e) => e.stage === "mcp.call" && e.phase === "end");
      if (call) return `${call.data.tool} → ${truncate(String(call.data.result), 14)}`;
      const disc = lastWith(rt.events, (e) => e.stage === "mcp.discover" && e.phase === "end");
      if (disc) return `${(disc.data.tools as unknown[] | undefined)?.length ?? 0} tools ready`;
      return "";
    }
    case "llm": {
      const tokens = rt.events.filter((e) => e.stage === "llm.generate" && e.phase === "progress").length;
      if (rt.status === "active" && tokens) return `streaming · ${tokens} tok`;
      if (tokens) return `${tokens} tokens`;
      if (lastWith(rt.events, (e) => e.stage === "llm.prompt")) return "prompt assembled";
      return rt.status === "idle" ? "" : "…";
    }
  }
}
