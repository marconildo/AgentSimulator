// 030-event-console — the expandable, scrollable trace log mounted next to the
// footer playback controls. Collapsed by default (the one-line status stays the
// "now" indicator); expanded it lists every event up to the cursor with relative
// time, stage/phase/label, payload size and latency, a per-event drill-down, and
// copy/export affordances. Pure projection over the store's events + cursor
// (lib/eventLog) — clicking a row seeks the cursor and selects the owning station.

import { useMemo, useState } from "react";

import { useT } from "../i18n";
import { copyText } from "../lib/clipboard";
import {
  eventJson,
  eventLog,
  formatRel,
  traceId,
  traceJson,
  type ConsoleRow,
} from "../lib/eventLog";
import { useSimulator } from "../store/useSimulator";

export function EventConsole() {
  const c = useT().console;
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const setCursor = useSimulator((s) => s.setCursor);
  const select = useSimulator((s) => s.select);

  const [open, setOpen] = useState(false);
  const [explained, setExplained] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const rows = useMemo(() => eventLog(events, cursor), [events, cursor]);

  if (events.length === 0) return null; // nothing to log yet

  const copy = async (key: string, value: string) => {
    await copyText(value);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1200);
  };

  const seek = (row: ConsoleRow) => {
    setCursor(row.index);
    select(row.station);
  };

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-md border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
        >
          <span aria-hidden>{open ? "▾" : "▸"}</span>
          {open ? c.collapse : c.expand}
          <span className="text-[var(--color-label)]">· {rows.length}</span>
        </button>
        {open && (
          <>
            <ToolButton onClick={() => copy("trace", traceJson(events))}>
              {copied === "trace" ? c.copied : c.copyTrace}
            </ToolButton>
            <ToolButton onClick={() => copy("id", traceId(events))}>
              {copied === "id" ? c.copied : c.copyId}
            </ToolButton>
          </>
        )}
      </div>

      {open && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1 font-mono text-[10px]">
          {rows.map((row) => {
            const isOpen = explained === row.index;
            return (
              <div key={row.seq} className="border-b border-[var(--color-line)] last:border-0">
                <div className="flex items-center gap-1.5 px-1 py-0.5">
                  <button
                    onClick={() => seek(row)}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 text-left transition ${
                      row.current
                        ? "text-[var(--color-sky-soft)]"
                        : "text-[var(--color-text-soft)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    <span className="w-14 shrink-0 tabular-nums text-[var(--color-label)]">
                      {formatRel(row.relMs)}
                    </span>
                    <span
                      className={`shrink-0 rounded px-1 ${
                        row.current
                          ? "bg-[var(--color-sky-strong)] text-[var(--color-on-accent)]"
                          : "bg-[var(--color-line)] text-[var(--color-muted)]"
                      }`}
                    >
                      {row.stage}
                    </span>
                    <span className="w-12 shrink-0 text-[var(--color-label)]">{row.phase}</span>
                    <span className="truncate text-[var(--color-muted)]">{row.label}</span>
                    <span className="ml-auto shrink-0 text-[var(--color-faint)]">
                      {row.latencyMs !== undefined ? `${Math.round(row.latencyMs)} ms · ` : ""}
                      {row.sizeBytes} B
                    </span>
                  </button>
                  <button
                    onClick={() => setExplained((e) => (e === row.index ? null : row.index))}
                    title={c.explain}
                    aria-label={c.explain}
                    className="shrink-0 rounded px-1 text-[var(--color-muted)] transition hover:text-[var(--color-sky-soft)]"
                  >
                    ⓘ
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-1 px-2 pb-1.5 pt-0.5 text-[var(--color-text-soft)]">
                    <div className="text-[var(--color-label)]">
                      {row.from
                        ? `${c.from} ${row.from} → ${c.to} ${row.to}`
                        : row.station}
                      {" · "}
                      {c.size}: {row.sizeBytes} B
                      {row.latencyMs !== undefined && ` · ${c.latency}: ${Math.round(row.latencyMs)} ms`}
                    </div>
                    <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--color-panel)] p-1.5 leading-snug">
                      {JSON.stringify(
                        {
                          data: events[row.index].data,
                          metrics: events[row.index].metrics,
                        },
                        null,
                        2,
                      )}
                    </pre>
                    <ToolButton onClick={() => copy(`ev-${row.index}`, eventJson(events[row.index]))}>
                      {copied === `ev-${row.index}` ? c.copied : c.copyEvent}
                    </ToolButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ToolButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
    >
      {children}
    </button>
  );
}
