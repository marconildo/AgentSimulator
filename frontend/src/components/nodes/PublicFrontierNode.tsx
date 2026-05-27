import type { NodeProps } from "@xyflow/react";

export interface PublicFrontierNodeData {
  label: string;
  [key: string]: unknown;
}

// 032-network-boundary — a thin, labeled dashed vertical line marking the
// public-internet / egress frontier between the public client tier and the
// private interior. Cloud-generic (the label never changes per provider) and
// non-interactive (drawn behind the stations).
export function PublicFrontierNode(props: NodeProps) {
  const { label } = props.data as PublicFrontierNodeData;
  return (
    <div className="pointer-events-none relative h-full w-full">
      {/* The dashed frontier line, centered in the node's narrow column. */}
      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          borderLeft: "1.5px dashed color-mix(in srgb, var(--color-warn) 55%, transparent)",
        }}
      />
      {/* A small vertical label riding the line, centered on the frontier so it
          clears the horizontal API↔Agent hop arrow near the top (the gap is too
          narrow for horizontal text). */}
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wider"
        style={{
          borderColor: "color-mix(in srgb, var(--color-warn) 40%, transparent)",
          background: "color-mix(in srgb, var(--color-base) 88%, transparent)",
          color: "var(--color-warn)",
          writingMode: "vertical-rl",
        }}
      >
        🛡️ {label}
      </span>
    </div>
  );
}
