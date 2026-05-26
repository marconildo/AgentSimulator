import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

interface FlowEdgeData {
  accent?: string;
  label?: string;
  secure?: boolean;
  active?: boolean;
  reverse?: boolean; // packet travels target → source
  stream?: boolean; // SSE response flowing back to the client
  [key: string]: unknown;
}

const STREAM_COLOR = "#7dd3fc";

export function FlowEdge(props: EdgeProps) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd } = props;
  const data = (props.data ?? {}) as FlowEdgeData;
  const accent = data.accent ?? "#38bdf8";
  const active = Boolean(data.active);
  const stream = Boolean(data.stream);
  const lit = active || stream;

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const strokeColor = stream ? STREAM_COLOR : active ? accent : "var(--color-line)";

  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: strokeColor,
          strokeWidth: lit ? 2.5 : 1.5,
          strokeDasharray: stream ? "5 5" : undefined,
          opacity: lit ? 1 : 0.6,
          filter: lit ? `drop-shadow(0 0 6px ${strokeColor})` : "none",
          transition: "stroke 0.2s ease",
        }}
      />

      {active && <Packet path={path} color={accent} reverse={Boolean(data.reverse)} />}
      {stream && <Packet path={path} color={STREAM_COLOR} reverse />}

      {data.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 rounded-md border px-1.5 py-px font-mono text-[9.5px] leading-none"
            style={{
              left: labelX,
              top: labelY,
              borderColor: lit ? strokeColor : "var(--color-line)",
              background: "color-mix(in srgb, var(--color-base) 88%, transparent)",
              color: lit ? strokeColor : "var(--color-muted)",
            }}
          >
            {data.secure ? "🔒 " : ""}
            {stream ? "SSE stream ↩" : data.label}
          </div>
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
