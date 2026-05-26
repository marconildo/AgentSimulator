import type { NodeProps } from "@xyflow/react";

import type { TierMeta } from "../../lib/stations";

export interface TierNodeData {
  meta: TierMeta;
  [key: string]: unknown;
}

// A non-interactive background box that visually groups stations into a
// deployable tier (container). Clicks pass through to the pane below.
export function TierNode(props: NodeProps) {
  const { meta } = props.data as TierNodeData;
  return (
    <div
      className="pointer-events-none h-full w-full rounded-2xl"
      style={{
        border: `1px dashed ${meta.accent}55`,
        background: `linear-gradient(180deg, ${meta.accent}0d 0%, transparent 60%)`,
      }}
    >
      <div className="flex items-baseline gap-2 px-3 pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: meta.accent }}>
          {meta.title}
        </span>
      </div>
      <div className="px-3 text-[10px] leading-tight text-[var(--color-muted)]">
        <span className="font-mono">{meta.azure}</span>
      </div>
    </div>
  );
}
