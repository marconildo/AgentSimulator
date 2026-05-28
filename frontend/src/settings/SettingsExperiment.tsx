// 041-settings-page · 🧪 Experiment section, lifted out of the popover.
// Behavior is identical (per-conversation overrides via `useExperiment`,
// tools list from /api/config, top-k slider, failure-mode selector); the
// textarea defaults to 8 rows since vertical space is no longer scarce.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, type AppConfig } from "../lib/chatApi";
import { DEFAULT_EXPERIMENT, DRAFT_KEY, useExperiment } from "../lib/experiment";
import { toolRows } from "../lib/tools";
import { useChat } from "../store/useChat";

export function SettingsExperiment() {
  const t = useT();
  const ex = t.settings.experiment;

  const conv = useChat((c) => c.activeSessionId);
  const exp = useExperiment((e) => e.byConv[conv ?? DRAFT_KEY] ?? DEFAULT_EXPERIMENT);
  const exp_ = useExperiment.getState();

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    if (config) return;
    getConfig().then(setConfig).catch(() => {});
  }, [config]);

  const allTools = config?.tools.map((tool) => tool.name) ?? [];
  const enabled = exp.enabledTools ?? allTools; // null ⇒ all on
  const topK = exp.topK ?? config?.default_top_k ?? 4;
  const promptValue = exp.systemPrompt ?? config?.default_system_prompt ?? "";
  const failureModes = config?.failure_modes ?? ["none"];
  const simulateFailure = exp.simulateFailure ?? "none";
  const dirty =
    exp.systemPrompt !== null ||
    exp.enabledTools !== null ||
    exp.topK !== null ||
    simulateFailure !== "none";

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
          <span aria-hidden>🧪</span>
          {ex.title}
        </div>
        {dirty && (
          <button
            onClick={() => exp_.reset(conv)}
            className="rounded-full border border-[var(--color-line)] px-2 py-px text-[10px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
          >
            {ex.reset}
          </button>
        )}
      </div>

      {/* System prompt */}
      <label
        htmlFor="exp-system-prompt"
        className="mb-1 block text-[11px] font-semibold text-[var(--color-ink)]"
      >
        {ex.systemPrompt}
      </label>
      <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">
        {ex.promptHint}
      </p>
      <textarea
        id="exp-system-prompt"
        aria-label={ex.systemPrompt}
        value={promptValue}
        onChange={(e) => exp_.setSystemPrompt(conv, e.target.value)}
        rows={8}
        maxLength={2000}
        disabled={!config}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 font-mono text-[11px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
      />

      {/* Tools */}
      <div className="mt-3 mb-1 text-[11px] font-semibold text-[var(--color-ink)]">
        {ex.tools}
      </div>
      <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">{ex.toolsHint}</p>
      <div className="flex flex-col gap-1">
        {toolRows(config?.tools ?? [], ex.toolLabels).map((tool) => {
          const on = enabled.includes(tool.name);
          return (
            <label
              key={tool.name}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-ink)]"
              title={tool.description}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => exp_.toggleTool(conv, tool.name, allTools)}
                className="accent-[var(--color-accent)]"
              />
              <span className={on ? "" : "text-[var(--color-muted)] line-through"}>
                {tool.label}
              </span>
              <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">
                {tool.name}
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--color-label)]">
        {ex.toolsDisambig}
      </p>

      {/* top-k */}
      <div className="mt-3 mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--color-ink)]">
        <span>{ex.topK}</span>
        <span className="font-mono text-[var(--color-indigo-soft)]">{topK}</span>
      </div>
      <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">{ex.topKHint}</p>
      <input
        type="range"
        min={config?.top_k_min ?? 1}
        max={config?.top_k_max ?? 8}
        value={topK}
        disabled={!config}
        onChange={(e) => exp_.setTopK(conv, Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />

      {/* Simulate failure (017). */}
      <div className="mt-3 mb-1 text-[11px] font-semibold text-[var(--color-ink)]">
        {ex.failure.label}
      </div>
      <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">
        {ex.failure.hint}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {failureModes.map((m) => {
          const active = simulateFailure === m;
          return (
            <button
              key={m}
              onClick={() => exp_.setSimulateFailure(conv, m)}
              aria-pressed={active}
              disabled={!config}
              className="rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition"
              style={{
                borderColor: active ? "var(--color-accent)" : "var(--color-line)",
                background: active ? "var(--color-panel-2)" : "transparent",
                color: active ? "var(--color-indigo-soft)" : "var(--color-ink)",
              }}
            >
              {ex.failure.modes[m] ?? m}
            </button>
          );
        })}
      </div>
    </section>
  );
}
