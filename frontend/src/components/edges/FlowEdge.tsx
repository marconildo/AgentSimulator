import { BaseEdge, EdgeLabelRenderer, getBezierPath, useViewport, type EdgeProps } from "@xyflow/react";
import { useState } from "react";

import { useT } from "../../i18n";
import { returnStyleFor } from "../../lib/edgeStyle";

interface FlowEdgeData {
  accent?: string;
  label?: string;
  secure?: boolean;
  zone?: "public" | "private"; // public internet vs inside the VNet/VPC
  protocol?: string;
  detail?: string;
  controls?: string;
  comm?: "sync" | "async"; // blocking request/response vs streamed response
  commDetail?: string; // human explanation of the comm style (mode-aware)
  active?: boolean; // currently animating (gets a moving packet)
  reverse?: boolean; // packet travels target → source
  stream?: boolean; // SSE response flowing back to the client
  [key: string]: unknown;
}

const STREAM_COLOR = "var(--color-sky-soft)";
const SYNC_COLOR = "var(--color-sync)";
// Px of headroom the tooltip needs above the edge; below this it flips downward.
const TOOLTIP_CLEARANCE = 180;

export function FlowEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props;
  const data = (props.data ?? {}) as FlowEdgeData;
  const t = useT();
  const i = t.inspector;
  const [hovered, setHovered] = useState(false);
  const { y: viewportY, zoom } = useViewport();

  const accent = data.accent ?? "var(--color-sky)";
  const active = Boolean(data.active);
  const stream = Boolean(data.stream);
  const lit = active || stream; // currently animating; quiet once the packet passes
  const comm = data.comm;
  const commColor = comm === "async" ? STREAM_COLOR : SYNC_COLOR;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // 032-network-boundary: an active reverse leg (internal respond walk) reads as
  // a return — dashed, stream color — distinct from an outbound request.
  const stroke = returnStyleFor(active, Boolean(data.reverse), stream, accent);
  const strokeColor = stroke.color;

  // The tooltip normally sits above the edge; if the label is too close to the
  // top of the pane (e.g. the Backend↔App Database hop), "up" gets clipped by
  // the toolbar — flip it below in that case. screenY is the label's on-screen Y.
  const screenY = labelY * zoom + viewportY;
  const flipBelow = screenY < TOOLTIP_CLEARANCE;

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth: lit ? 2.5 : 1.5,
          strokeDasharray: stroke.dashed ? "5 5" : undefined,
          opacity: lit ? 1 : hovered ? 0.9 : 0.6,
          filter: lit ? `drop-shadow(0 0 6px ${strokeColor})` : "none",
          transition: "stroke 0.2s ease, opacity 0.2s ease",
        }}
      />

      {/* Transparent wide hit area so the thin edge is easy to hover. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ pointerEvents: "stroke", cursor: "help" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />

      {active && <Packet path={path} color={accent} reverse={Boolean(data.reverse)} />}
      {stream && <Packet path={path} color={STREAM_COLOR} reverse />}

      {data.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
            style={{ left: labelX, top: labelY }}
          >
            <div
              className="rounded-md border px-1.5 py-px font-mono text-[9.5px] leading-none"
              style={{
                borderColor: lit ? strokeColor : "var(--color-line)",
                background: "color-mix(in srgb, var(--color-base) 88%, transparent)",
                color: lit ? strokeColor : "var(--color-muted)",
              }}
            >
              {data.zone === "public" ? "🛡️ " : data.secure ? "🔒 " : ""}
              {stream ? "SSE stream ↩" : data.label}
            </div>
            {comm && (
              <span
                className="rounded-full px-1 font-mono text-[8px] uppercase leading-tight tracking-wide"
                style={{
                  color: commColor,
                  background: "color-mix(in srgb, var(--color-base) 80%, transparent)",
                }}
              >
                {comm === "async" ? "⇅ " : "⇄ "}
                {comm}
              </span>
            )}
          </div>

          {hovered && (
            <div
              className={`nodrag nopan pointer-events-none absolute z-50 w-56 -translate-x-1/2 rounded-lg border border-[var(--color-line)] p-2 shadow-xl ${
                flipBelow ? "" : "-translate-y-full"
              }`}
              style={{
                left: labelX,
                top: flipBelow ? labelY + 16 : labelY - 12,
                background: "color-mix(in srgb, var(--color-panel) 96%, transparent)",
              }}
            >
              {data.protocol && (
                <div className="font-mono text-[11px] font-semibold" style={{ color: accent }}>
                  {data.secure ? "🔒 " : ""}
                  {data.protocol}
                </div>
              )}
              {data.detail && (
                <p className="mt-1 text-[10.5px] leading-snug text-[var(--color-text-soft)]">{data.detail}</p>
              )}
              {comm && (
                <div className="mt-1.5 flex items-start gap-1.5 text-[10px] leading-snug">
                  <span
                    className="shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] uppercase tracking-wide"
                    style={{ color: commColor, borderColor: commColor }}
                  >
                    {comm === "async" ? "⇅ " : "⇄ "}
                    {comm}
                  </span>
                  {data.commDetail && <span className="text-[var(--color-text-soft)]">{data.commDetail}</span>}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9.5px] text-[var(--color-muted)]">
                <span className="rounded-full border border-[var(--color-line)] px-1.5 py-px">
                  {data.zone === "public" ? `🛡️ ${i.zonePublic}` : `🔒 ${i.zonePrivate}`}
                </span>
                {data.controls && <span className="font-mono">{data.controls}</span>}
              </div>
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function Packet({ path, color, reverse }: { path: string; color: string; reverse: boolean }) {
  return (
    <circle r={4.5} fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }}>
      <animateMotion
        dur="0.9s"
        repeatCount="indefinite"
        path={path}
        keyPoints={reverse ? "1;0" : "0;1"}
        keyTimes="0;1"
        calcMode="linear"
      />
    </circle>
  );
}
