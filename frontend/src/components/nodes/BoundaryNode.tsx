import type { NodeProps } from "@xyflow/react";

import type { BoundaryMeta } from "../../lib/stations";

export interface BoundaryNodeData {
  meta: BoundaryMeta;
  service: string; // resolved for the active cloud (VNet / VPC …)
  [key: string]: unknown;
}

// A non-interactive perimeter drawn behind the tier boxes: the private network
// (VNet / VPC) that contains every tier except the public client. Makes the
// public-vs-private split — and where the firewall/WAF sits — visible.
export function BoundaryNode(props: NodeProps) {
  const { meta, service } = props.data as BoundaryNodeData;
  return (
    <div
      className="pointer-events-none h-full w-full rounded-3xl"
      style={{
        border: `1.5px dashed color-mix(in srgb, ${meta.accent} 40%, transparent)`,
        background: `radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, ${meta.accent} 6%, transparent) 0%, transparent 55%)`,
      }}
    >
      <div className="flex items-center gap-1.5 px-4 pt-1.5">
        <span className="text-[11px]" aria-hidden>
          🛡️
        </span>
        <span
          className="text-[10.5px] font-semibold uppercase tracking-wider"
          style={{ color: meta.accent }}
        >
          {meta.label}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-muted)]">· {service}</span>
      </div>
    </div>
  );
}
