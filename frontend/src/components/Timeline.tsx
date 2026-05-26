import type { ReactNode } from "react";

import { useSimulator } from "../store/useSimulator";

export function Timeline() {
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const playing = useSimulator((s) => s.playing);
  const following = useSimulator((s) => s.following);
  const status = useSimulator((s) => s.status);
  const setCursor = useSimulator((s) => s.setCursor);
  const step = useSimulator((s) => s.step);
  const togglePlay = useSimulator((s) => s.togglePlay);

  const total = events.length;
  const hasEvents = total > 0;
  const current = cursor >= 0 ? events[cursor] : undefined;
  const live = status === "streaming" && following;

  return (
    <div className="flex items-center gap-3 border-t border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5">
      <div className="flex items-center gap-1">
        <TButton onClick={() => step(-1)} disabled={!hasEvents} title="Step back">
          ⏮
        </TButton>
        <TButton onClick={togglePlay} disabled={!hasEvents} title={playing ? "Pause" : "Replay"}>
          {playing ? "⏸" : "▶"}
        </TButton>
        <TButton onClick={() => step(1)} disabled={!hasEvents} title="Step forward">
          ⏭
        </TButton>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={cursor < 0 ? 0 : cursor}
        disabled={!hasEvents}
        onChange={(e) => setCursor(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-line)] accent-sky-400 disabled:opacity-40"
      />

      <div className="flex w-[360px] shrink-0 items-center justify-end gap-2 font-mono text-[11px] text-[var(--color-muted)]">
        {live && (
          <span className="flex items-center gap-1 text-rose-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" /> LIVE
          </span>
        )}
        {current ? (
          <span className="truncate">
            <span className="text-sky-300">{current.stage}</span>
            {current.label ? ` · ${current.label}` : ""}
          </span>
        ) : (
          <span>idle</span>
        )}
        <span className="tabular-nums text-[#5b688c]">
          {hasEvents ? `${cursor + 1}/${total}` : "0/0"}
        </span>
      </div>
    </div>
  );
}

function TButton({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-8 items-center justify-center rounded-md border border-[var(--color-line)] text-xs text-[var(--color-ink)] transition enabled:hover:border-sky-400/60 enabled:hover:text-sky-300 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
