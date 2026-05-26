// Auto-layout for the canvas. The diagram is three columns — client, the
// middle stack (API over Agent), and the data services column — each stacked
// top-down. Nodes can be collapsed (compact) or expanded (taller, showing
// inner detail); expanding one reflows the ones below it in its column. Tier
// boxes wrap their stations and the private-network boundary wraps the private
// tiers, all recomputed from the current expand state.
//
// Geometry lives here; identity/content (titles, clouds, hops) lives in
// stations.ts. Keeping the two apart is what makes expand/collapse a pure
// re-layout.

import type { StationId, TierId } from "./stations";

export const NODE_WIDTH = 212;

const COLLAPSED_H = 108;
// Expanded heights are tuned per station to fit their inner content.
const EXPANDED_H: Record<StationId, number> = {
  frontend: 176,
  backend: 188,
  agent: 268,
  database: 184,
  rag: 236,
  mcp: 208,
  llm: 208,
};

interface Column {
  x: number;
  gap: number; // vertical gap between stacked stations in this column
  members: StationId[];
}

// Middle column stacks the API tier above the Agent tier (a bigger gap keeps
// their two boxes visually separate). The data column is one tier, four rows.
const COLUMNS: Column[] = [
  { x: 40, gap: 44, members: ["frontend"] },
  // Big gap between the API and Agent tiers: the vertical Backend→Agent edge
  // label needs to clear the Agent tier's header, which sits above the node.
  { x: 372, gap: 168, members: ["backend", "agent"] },
  { x: 1016, gap: 36, members: ["database", "rag", "mcp", "llm"] },
];

const TOP = 120;

const TIER_OF: Record<StationId, TierId> = {
  frontend: "client",
  backend: "api",
  agent: "agent",
  database: "services",
  rag: "services",
  mcp: "services",
  llm: "services",
};

const PAD = 16; // padding between a tier box and its stations
const LABEL_TOP = 54; // extra room above the top station for the tier label (title + service line)
const BOUND_PAD = 22;
const BOUND_LABEL = 34;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutResult {
  positions: Record<StationId, { x: number; y: number }>;
  heights: Record<StationId, number>;
  tierBoxes: Record<TierId, Box>;
  boundary: Box;
}

export function heightOf(id: StationId, expanded: ReadonlySet<StationId>): number {
  return expanded.has(id) ? EXPANDED_H[id] : COLLAPSED_H;
}

export function computeLayout(expanded: ReadonlySet<StationId>): LayoutResult {
  const positions = {} as Record<StationId, { x: number; y: number }>;
  const heights = {} as Record<StationId, number>;

  for (const col of COLUMNS) {
    let y = TOP;
    for (const id of col.members) {
      const h = heightOf(id, expanded);
      positions[id] = { x: col.x, y };
      heights[id] = h;
      y += h + col.gap;
    }
  }

  const tierMembers: Record<TierId, StationId[]> = {
    client: [],
    api: [],
    agent: [],
    services: [],
  };
  for (const id of Object.keys(positions) as StationId[]) tierMembers[TIER_OF[id]].push(id);

  const tierBoxes = {} as Record<TierId, Box>;
  for (const tid of Object.keys(tierMembers) as TierId[]) {
    const ids = tierMembers[tid];
    const minX = Math.min(...ids.map((i) => positions[i].x));
    const minY = Math.min(...ids.map((i) => positions[i].y));
    const maxX = Math.max(...ids.map((i) => positions[i].x + NODE_WIDTH));
    const maxY = Math.max(...ids.map((i) => positions[i].y + heights[i]));
    tierBoxes[tid] = {
      x: minX - PAD,
      y: minY - LABEL_TOP,
      w: maxX - minX + 2 * PAD,
      h: maxY - (minY - LABEL_TOP) + PAD,
    };
  }

  // The private network wraps every tier except the public client.
  const priv: TierId[] = ["api", "agent", "services"];
  const bx = Math.min(...priv.map((t) => tierBoxes[t].x));
  const by = Math.min(...priv.map((t) => tierBoxes[t].y));
  const bMaxX = Math.max(...priv.map((t) => tierBoxes[t].x + tierBoxes[t].w));
  const bMaxY = Math.max(...priv.map((t) => tierBoxes[t].y + tierBoxes[t].h));
  const boundary: Box = {
    x: bx - BOUND_PAD,
    y: by - BOUND_LABEL,
    w: bMaxX - bx + 2 * BOUND_PAD,
    h: bMaxY - by + BOUND_LABEL + BOUND_PAD,
  };

  return { positions, heights, tierBoxes, boundary };
}
