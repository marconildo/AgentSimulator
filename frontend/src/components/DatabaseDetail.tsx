import { useMemo } from "react";

import { useT } from "../i18n";
import { selectDatabase } from "../lib/stationDetail";
import { useSimulator } from "../store/useSimulator";
import type { TraceEvent } from "../types/events";
import { Caption, DetailShell, KeyVal, Mono, Section } from "./DetailShell";

// 076-station-full-views — App Database "open full view". Shows BOTH SQL
// operations of the turn — db.read (load recent history) and db.write (persist
// the conversation) — each with its real payload, where the Inspector keeps the
// theory. Pure projection of the captured trace (same cursor as the canvas).

const DB = "var(--color-blue)";

export function DatabaseDetail({ onClose }: { onClose: () => void }) {
  const t = useT();
  const d = t.dbDetail;
  const ins = t.inspector;

  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const visible = useMemo<TraceEvent[]>(
    () => (cursor >= 0 ? events.slice(0, cursor + 1) : []),
    [events, cursor],
  );
  const db = useMemo(() => selectDatabase(visible), [visible]);

  const empty = !db.read && !db.write;

  return (
    <DetailShell
      accent={DB}
      icon="🗄️"
      title={d.title}
      subtitle={d.subtitle}
      back={d.back}
      onClose={onClose}
      empty={empty}
      emptyText={d.empty}
    >
      {db.read && (
        <Section title={ins.historyRead} accent={DB}>
          <KeyVal k={ins.operation} v="SELECT" />
          <KeyVal k={d.session} v={db.read.sessionId || "—"} />
          <KeyVal k={ins.totalRows} v={String(db.read.totalRows)} />
          {db.read.recent.length > 0 ? (
            <>
              <Caption>{ins.recentMessages}</Caption>
              <div className="space-y-1">
                {db.read.recent.map((row, idx) => (
                  <Mono key={idx}>▸ {row.message}</Mono>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--color-label)]">{ins.noHistory}</p>
          )}
        </Section>
      )}

      {db.write && (
        <Section title={ins.persisted} accent={DB}>
          <KeyVal k={ins.operation} v={db.write.operation} />
          <KeyVal k={d.rowId} v={db.write.rowId} />
          <KeyVal k={d.session} v={db.write.sessionId || "—"} />
          <KeyVal k={ins.totalRows} v={String(db.write.totalRows)} />
        </Section>
      )}
    </DetailShell>
  );
}
