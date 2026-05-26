import { useEffect, useRef, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { type DeliveryMode, useSettings } from "../lib/settings";
import { useChat } from "../store/useChat";

// Gear button in the header that opens a small panel of architecture options:
// the response-delivery mode (streaming SSE vs batch JSON) and the live
// "Experiment" controls (006) — edit the system prompt, toggle MCP tools, and
// set RAG top-k, scoped to the active conversation. These replaced the old
// "SOON" Tools/RAG placeholders (those features are real).
export function SettingsPanel() {
  const mode = useSettings((s) => s.mode);
  const setMode = useSettings((s) => s.setMode);
  const t = useT();
  const s = t.settings;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The conversation these experiment settings belong to (per-conversation, AC7).
  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);

  // Agent defaults (prompt text, tool list, top-k bounds) — fetched once so the
  // panel prefills without hardcoding anything client-side.
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    if (!open || config) return;
    getConfig().then(setConfig).catch(() => {});
  }, [open, config]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const options: { code: DeliveryMode; label: string; hint: string }[] = [
    { code: "stream", label: s.streaming, hint: s.streamingHint },
    { code: "batch", label: s.batch, hint: s.batchHint },
  ];

  const ex = s.experiment;
  const exp_ = useExperiment.getState(); // stable action handles
  const allTools = config?.tools.map((tool) => tool.name) ?? [];
  const enabled = exp.enabledTools ?? allTools; // null ⇒ all on
  const topK = exp.topK ?? config?.default_top_k ?? 4;
  const promptValue = exp.systemPrompt ?? config?.default_system_prompt ?? "";
  const dirty =
    exp.systemPrompt !== null || exp.enabledTools !== null || exp.topK !== null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        title={s.open}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] transition"
        style={{
          borderColor: open ? "var(--color-accent)" : "var(--color-line)",
          color: open ? "var(--color-indigo-soft)" : "var(--color-muted)",
        }}
      >
        <span aria-hidden>⚙️</span>
        {/* Surface the current delivery mode right on the button, so it's
            discoverable that this is where SSE ↔ Batch is switched. */}
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide">
          {mode === "stream" ? "SSE" : "Batch"}
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 max-h-[min(78vh,40rem)] w-80 overflow-y-auto rounded-xl border border-[var(--color-line)] p-3 shadow-2xl"
          style={{ background: "color-mix(in srgb, var(--color-panel) 98%, transparent)" }}
        >
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
            <span aria-hidden>⚙️</span>
            {s.title}
          </div>

          <div className="mb-1 text-[11px] font-semibold text-[var(--color-ink)]">{s.delivery}</div>
          <p className="mb-2 text-[10.5px] leading-snug text-[var(--color-muted)]">
            {s.deliveryHint}
          </p>

          <div className="flex flex-col gap-1.5">
            {options.map((o) => {
              const active = mode === o.code;
              return (
                <button
                  key={o.code}
                  onClick={() => setMode(o.code)}
                  aria-pressed={active}
                  className="rounded-lg border px-2.5 py-2 text-left transition"
                  style={{
                    borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                    background: active ? "var(--color-panel-2)" : "transparent",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border"
                      style={{ borderColor: active ? "var(--color-sky-soft)" : "var(--color-muted)" }}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-sky-soft)]" />}
                    </span>
                    <span
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: active ? "var(--color-indigo-soft)" : "var(--color-ink)" }}
                    >
                      {o.label}
                    </span>
                  </div>
                  <p className="mt-1 pl-5 text-[10px] leading-snug text-[var(--color-muted)]">
                    {o.hint}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="my-2.5 border-t border-[var(--color-line)]" />

          {/* --- Experiment controls (006) -------------------------------- */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-ink)]">
              <span aria-hidden>🧪</span>
              {ex.title}
            </div>
            {dirty && (
              <button
                onClick={() => exp_.reset(conv)}
                className="rounded-full border border-[var(--color-line)] px-1.5 py-px text-[9.5px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
              >
                {ex.reset}
              </button>
            )}
          </div>

          {/* System prompt */}
          <label className="mb-1 block text-[10.5px] font-semibold text-[var(--color-ink)]">
            {ex.systemPrompt}
          </label>
          <p className="mb-1.5 text-[10px] leading-snug text-[var(--color-muted)]">{ex.promptHint}</p>
          <textarea
            value={promptValue}
            onChange={(e) => exp_.setSystemPrompt(conv, e.target.value)}
            rows={5}
            maxLength={2000}
            disabled={!config}
            spellCheck={false}
            className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 font-mono text-[10.5px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />

          {/* Tools */}
          <div className="mt-3 mb-1 text-[10.5px] font-semibold text-[var(--color-ink)]">
            {ex.tools}
          </div>
          <p className="mb-1.5 text-[10px] leading-snug text-[var(--color-muted)]">{ex.toolsHint}</p>
          <div className="flex flex-col gap-1">
            {config?.tools.map((tool) => {
              const on = enabled.includes(tool.name);
              return (
                <label
                  key={tool.name}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11px] text-[var(--color-ink)]"
                  title={tool.description}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => exp_.toggleTool(conv, tool.name, allTools)}
                    className="accent-[var(--color-accent)]"
                  />
                  <span className={on ? "" : "text-[var(--color-muted)] line-through"}>
                    {ex.toolLabels[tool.name] ?? tool.name}
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-[var(--color-muted)]">
                    {tool.name}
                  </span>
                </label>
              );
            })}
          </div>

          {/* top-k */}
          <div className="mt-3 mb-1 flex items-center justify-between text-[10.5px] font-semibold text-[var(--color-ink)]">
            <span>{ex.topK}</span>
            <span className="font-mono text-[var(--color-indigo-soft)]">{topK}</span>
          </div>
          <p className="mb-1.5 text-[10px] leading-snug text-[var(--color-muted)]">{ex.topKHint}</p>
          <input
            type="range"
            min={config?.top_k_min ?? 1}
            max={config?.top_k_max ?? 8}
            value={topK}
            disabled={!config}
            onChange={(e) => exp_.setTopK(conv, Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
      )}
    </div>
  );
}
