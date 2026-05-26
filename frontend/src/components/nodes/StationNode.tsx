import { Handle, Position, type NodeProps } from "@xyflow/react";
import { motion } from "framer-motion";

import type { StationRuntime } from "../../lib/derive";
import type { StationMeta } from "../../lib/stations";

export interface StationNodeData {
  meta: StationMeta;
  runtime: StationRuntime;
  readout: string;
  isSelected: boolean;
  [key: string]: unknown;
}

export function StationNode(props: NodeProps) {
  const { meta, runtime, readout, isSelected } = props.data as StationNodeData;
  const active = runtime.status === "active";
  const done = runtime.status === "done";
  const accent = meta.accent;

  const borderColor = active || done ? accent : "var(--color-line)";
  const dotColor = active ? accent : done ? accent : "#3a466b";

  return (
    <motion.div
      animate={{ scale: active ? 1.04 : 1 }}
      transition={{ type: "spring", stiffness: 280, damping: 18 }}
      className={active ? "station-pulse" : ""}
      style={{ color: accent, width: 196 }}
    >
      <div
        className="rounded-2xl px-4 py-3 backdrop-blur transition-colors"
        style={{
          background: "color-mix(in srgb, var(--color-panel) 92%, transparent)",
          border: `1.5px solid ${borderColor}`,
          boxShadow: isSelected ? `0 0 0 2px ${accent}` : active ? `0 8px 30px -12px ${accent}` : "none",
          opacity: runtime.status === "idle" ? 0.62 : 1,
        }}
      >
        <Handle type="target" position={Position.Left} style={{ opacity: 0, border: "none" }} />
        <Handle type="source" position={Position.Right} style={{ opacity: 0, border: "none" }} />

        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">
              {meta.title}
            </div>
            <div className="truncate text-[10px] text-[var(--color-muted)]">{meta.subtitle}</div>
          </div>
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: dotColor, boxShadow: active ? `0 0 8px ${accent}` : "none" }}
          />
        </div>

        <div className="mt-1.5 inline-flex rounded border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide"
          style={{ borderColor: `${accent}55`, color: accent }}>
          {meta.tag}
        </div>

        <div
          className="mt-2 h-[18px] truncate font-mono text-[10.5px]"
          style={{ color: readout ? accent : "transparent" }}
        >
          {readout || "·"}
        </div>
      </div>
    </motion.div>
  );
}
