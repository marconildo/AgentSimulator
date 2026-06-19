import { type ReactNode } from "react";

import type { JsonRpcFrames } from "../types/events";

// 076-station-full-views — shared chrome + presentational primitives for the
// MCP / App Database / Backend / Frontend drill-ins. Mirrors the look of
// AgentDetail / LLMDetail (same backdrop, back button, header) but factored out
// so the four new overlays don't each hand-roll it. Pure presentation — no store
// access, no projection logic (that lives in `lib/stationDetail.ts`).

interface DetailShellProps {
  accent: string;
  icon: string;
  title: string;
  subtitle: string;
  back: string;
  onClose: () => void;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}

export function DetailShell({
  accent,
  icon,
  title,
  subtitle,
  back,
  onClose,
  empty,
  emptyText,
  children,
}: DetailShellProps) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[color-mix(in_srgb,var(--color-base)_94%,transparent)] backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-3">
        <button
          onClick={onClose}
          className="rounded-full border px-3 py-1 text-[12px] font-medium transition hover:bg-[var(--color-panel-2)]"
          style={{ borderColor: accent, color: accent }}
        >
          ← {back}
        </button>
        <span className="text-2xl">{icon}</span>
        <div>
          <div className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</div>
          <div className="text-[11px] text-[var(--color-muted)]">{subtitle}</div>
        </div>
      </div>

      {empty ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-[var(--color-muted)]">
          {emptyText}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
      )}
    </div>
  );
}

// --- presentational primitives (shared by the four overlays) ----------------

export function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-[color-mix(in_srgb,var(--color-panel)_70%,transparent)] p-3"
      style={{ borderColor: accent ? `color-mix(in srgb, ${accent} 30%, var(--color-line))` : "var(--color-line)" }}
    >
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

export function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12px]">
      <span className="shrink-0 text-[var(--color-muted)]">{k}</span>
      <span className="break-all text-right font-mono text-[var(--color-ink)]">{v}</span>
    </div>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-[var(--color-ink)]">
      {children}
    </p>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 mt-2 text-[10px] uppercase tracking-wider text-[var(--color-label)] first:mt-0">
      {children}
    </div>
  );
}

export function Scroll({ children }: { children: ReactNode }) {
  return (
    <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-text-soft)]">
      {children}
    </pre>
  );
}

// Collapsible JSON-RPC request/response frames. Open by default in the full view
// (the whole point of the MCP drill-in is to read the wire frames); the
// `reconstructed` badge keeps the in-process local-fallback frames honest.
export function JsonRpcView({
  frames,
  labels,
}: {
  frames: JsonRpcFrames;
  labels: { jsonrpc: string; reconstructed: string; request: string; response: string };
}) {
  return (
    <details open className="mt-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)]">
      <summary className="cursor-pointer select-none px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {labels.jsonrpc}
        {frames.reconstructed && (
          <span className="ml-1.5 rounded-full border border-[var(--color-line)] px-1.5 py-px text-[9px] font-normal normal-case tracking-normal text-[var(--color-label)]">
            {labels.reconstructed}
          </span>
        )}
      </summary>
      <div className="space-y-1 px-2 pb-2">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-label)]">
          {labels.request}
        </div>
        <Scroll>{JSON.stringify(frames.request, null, 2)}</Scroll>
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-label)]">
          {labels.response}
        </div>
        <Scroll>{JSON.stringify(frames.response, null, 2)}</Scroll>
      </div>
    </details>
  );
}
