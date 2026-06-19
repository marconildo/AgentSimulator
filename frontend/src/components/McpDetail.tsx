import { useMemo } from "react";

import { useT } from "../i18n";
import { selectMcp } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { Caption, DetailShell, JsonRpcView, KeyVal, Mono, Section } from "./DetailShell";

// 076-station-full-views — MCP Tools "open full view". Lists the tool discovery
// and EVERY tool call of the turn — name, arguments, result and the raw JSON-RPC
// request/response frames — where the Inspector keeps the theory. Pure projection
// of the captured trace, driven by the same cursor as the canvas (step/replay safe).

const MCP = "var(--color-warn)";

export function McpDetail({ onClose }: { onClose: () => void }) {
  const t = useT();
  const d = t.mcpDetail;
  const ins = t.inspector;

  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );
  const mcp = useMemo(() => selectMcp(visible), [visible]);

  const empty = mcp.tools.length === 0 && mcp.calls.length === 0 && mcp.localCalls.length === 0;
  const rpcLabels = {
    jsonrpc: ins.jsonrpc,
    reconstructed: ins.reconstructed,
    request: ins.request,
    response: ins.response,
  };

  return (
    <DetailShell
      accent={MCP}
      icon="🔧"
      title={d.title}
      subtitle={d.subtitle}
      back={d.back}
      onClose={onClose}
      empty={empty}
      emptyText={d.empty}
    >
      {mcp.tools.length > 0 && (
        <Section title={ins.discoveredTools} accent={MCP}>
          <KeyVal k={ins.transport} v={mcp.transport ?? "—"} />
          <div className="mt-1.5 space-y-1.5">
            {mcp.tools.map((tool) => (
              <div key={tool.name}>
                <div className="font-mono text-[12px] text-[var(--color-ink)]">{tool.name}</div>
                <div className="text-[11px] text-[var(--color-muted)]">{tool.description}</div>
              </div>
            ))}
          </div>
          {mcp.discoveryFrames && <JsonRpcView frames={mcp.discoveryFrames} labels={rpcLabels} />}
        </Section>
      )}

      {mcp.calls.map((call, idx) => (
        <Section key={idx} title={`${ins.toolCall} ${idx + 1}`} accent={MCP}>
          {call.simulated && (
            <p
              className="mb-1.5 rounded-lg border border-dashed px-2 py-1 text-[11px] font-medium"
              style={{ borderColor: MCP, color: MCP }}
            >
              {ins.simulatedError}
            </p>
          )}
          <KeyVal k={ins.tool} v={call.tool} />
          <Caption>{ins.args}</Caption>
          <Mono>{JSON.stringify(call.args, null, 2)}</Mono>
          <Caption>{ins.result}</Caption>
          <Mono>{call.result}</Mono>
          {call.jsonrpc && <JsonRpcView frames={call.jsonrpc} labels={rpcLabels} />}
        </Section>
      ))}

      {mcp.localCalls.length > 0 && (
        <Section title={ins.localToolCalls} accent={MCP}>
          <p className="mb-1.5 text-[11px] text-[var(--color-muted)]">{ins.localToolCallsHint}</p>
          <div className="space-y-1.5">
            {mcp.localCalls.map((call, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2"
              >
                <KeyVal k={ins.tool} v={call.tool} />
                <Caption>{ins.args}</Caption>
                <Mono>{JSON.stringify(call.args, null, 2)}</Mono>
              </div>
            ))}
          </div>
        </Section>
      )}
    </DetailShell>
  );
}
