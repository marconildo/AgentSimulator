import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useT } from "../i18n";
import {
  COMPONENT_IS_REAL,
  type ComponentId,
  isLocked,
  REQUIRES_VECTOR,
  RETRIEVAL_STRATEGIES,
  type RetrievalStrategy,
  RUNTIMES,
  RUNTIME_IS_REAL,
  type Runtime,
  useMaturity,
  useSelection,
} from "../lib/selection";

// 061-scenario-builder — the à-la-carte component palette. Replaces the maturity-ladder
// segmented control + the track switcher: the user composes the architecture by toggling
// components, and the maturity rung is shown as a DERIVED badge (never an input). Two
// zones are made legible per item (a "preview · won't run" pill on non-executing nodes),
// honouring §3 (a preview never fakes a run; the skeleton always executes).

// 066-retrieval-strategy-radio — the retrieval group leads with a strategy radio
// (Vector RAG ⊻ RAGLESS); rerank/hybrid are vector-only sub-features below it.
const GROUPS: { id: "retrieval" | "agent" | "aiops"; components: ComponentId[] }[] = [
  { id: "retrieval", components: ["rerank", "hybrid"] },
  { id: "agent", components: ["mcp", "summarization"] },
  { id: "aiops", components: ["gateway", "guardrails", "cache", "eval", "observability"] },
];

function PreviewPill({ label }: { label: string }) {
  return (
    <span className="ml-auto shrink-0 rounded border border-dashed border-[var(--color-line)] px-1 py-px text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
      {label}
    </span>
  );
}

export function ScenarioBuilder() {
  const t = useT();
  const b = t.builder;
  const enabled = useSelection((s) => s.enabled);
  const runtime = useSelection((s) => s.runtime);
  const retrieval = useSelection((s) => s.retrieval);
  const toggle = useSelection((s) => s.toggle);
  const setRuntime = useSelection((s) => s.setRuntime);
  const setRetrieval = useSelection((s) => s.setRetrieval);
  const canToggle = useSelection((s) => s.canToggle);
  const maturity = useMaturity();

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Anchor the (portaled) popover under the trigger button. The popover is rendered
  // into document.body so it escapes the header's `backdrop-blur` stacking context —
  // otherwise the canvas (a sibling of the header) paints over it and steals clicks.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
  }, [open]);

  // Close on outside click / Escape. Outside = not the trigger and not the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={b.title}
        className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 text-[11px] font-medium text-[var(--color-text-soft)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
      >
        <span aria-hidden>🧩</span>
        <span className="hidden sm:inline">{b.label}</span>
        <span className="rounded bg-[var(--color-panel)] px-1 py-px text-[10px] text-[var(--color-indigo-soft)]">
          {b.maturityNames[maturity]}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 1000 }}
            className="w-72 rounded-xl border border-[var(--color-line)] bg-[var(--color-base)] p-3 shadow-2xl"
          >
            <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-[12px] font-semibold text-[var(--color-ink)]">{b.title}</h3>
            <span className="rounded bg-[var(--color-panel-2)] px-1.5 py-px text-[10px] font-medium text-[var(--color-indigo-soft)]">
              {b.maturity}: {b.maturityNames[maturity]}
            </span>
          </div>
          <p className="mb-2 text-[10.5px] leading-snug text-[var(--color-muted)]">{b.subtitle}</p>

          {/* Agent runtime — a radio (exactly one). */}
          <div className="mb-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              {b.runtimeHeading}
            </div>
            <div className="inline-flex w-full gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-0.5">
              {RUNTIMES.map((rt: Runtime) => {
                const active = runtime === rt;
                // A preview runtime (not implemented) is not selectable — selecting it
                // would let the user send a message claiming a runtime that doesn't run.
                const real = RUNTIME_IS_REAL[rt];
                return (
                  <button
                    key={rt}
                    onClick={() => real && setRuntime(rt)}
                    disabled={!real}
                    aria-pressed={active}
                    aria-disabled={!real}
                    title={b.runtimes[rt].blurb}
                    className={`flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium leading-none transition ${
                      active
                        ? "bg-[var(--color-panel)] text-[var(--color-indigo-soft)] shadow-sm"
                        : real
                          ? "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                          : "cursor-not-allowed text-[var(--color-muted)] opacity-50"
                    }`}
                  >
                    {b.runtimes[rt].name}
                    {!real && (
                      <span className="rounded border border-dashed border-[var(--color-line)] px-1 text-[8px] uppercase tracking-wide">
                        {b.runtimeSoon}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Component groups (the categories the old tracks named). */}
          {GROUPS.map((group) => (
            <div key={group.id} className="mb-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                {b.groups[group.id]}
              </div>

              {/* 066 — the retrieval group leads with the strategy radio (exactly one). */}
              {group.id === "retrieval" && (
                <div className="mb-1.5">
                  <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {b.retrievalHeading}
                  </div>
                  <div className="inline-flex w-full gap-0.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-0.5">
                    {RETRIEVAL_STRATEGIES.map((rs: RetrievalStrategy) => {
                      const active = retrieval === rs;
                      return (
                        <button
                          key={rs}
                          onClick={() => setRetrieval(rs)}
                          aria-pressed={active}
                          title={b.retrievalStrategies[rs].blurb}
                          className={`flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium leading-none transition ${
                            active
                              ? "bg-[var(--color-panel)] text-[var(--color-indigo-soft)] shadow-sm"
                              : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                          }`}
                        >
                          {b.retrievalStrategies[rs].name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-0.5">
                {group.components.map((id) => {
                  const locked = isLocked(id);
                  const on = locked || enabled.has(id);
                  const dep = REQUIRES_VECTOR.has(id);
                  // Dependency-blocked (e.g. reranker without Vector RAG) ⇒ dimmed + unclickable.
                  // Locked (fundamental) ⇒ checked + unclickable but NOT dimmed.
                  const depBlocked = !on && !canToggle(id);
                  return (
                    <button
                      key={id}
                      onClick={() => !locked && !depBlocked && toggle(id)}
                      disabled={locked || depBlocked}
                      title={dep && depBlocked ? b.requiresRag : b.components[id].blurb}
                      className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition ${
                        depBlocked
                          ? "cursor-not-allowed opacity-45"
                          : locked
                            ? "cursor-default"
                            : "hover:bg-[var(--color-panel-2)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px] ${
                          on
                            ? "border-[var(--color-sky)] bg-[var(--color-sky)] text-white"
                            : "border-[var(--color-line)]"
                        }`}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--color-ink)]">
                        {b.components[id].name}
                      </span>
                      {locked ? (
                        <span
                          className="ml-auto shrink-0 text-[10px] text-[var(--color-muted)]"
                          title={b.skeletonNote}
                        >
                          🔒
                        </span>
                      ) : (
                        !COMPONENT_IS_REAL[id] && <PreviewPill label={b.zonePreview} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

            <p className="mt-1 border-t border-[var(--color-line)] pt-1.5 text-[9.5px] leading-snug text-[var(--color-muted)]">
              {b.skeletonNote}
            </p>

            {/* The selection applies (and persists) live on each toggle, so this just
                closes the popover without a round-trip back to the trigger icon. */}
            <button
              onClick={() => setOpen(false)}
              className="mt-2 w-full rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
            >
              {b.done}
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
