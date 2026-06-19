// 072-chunking-strategies · 📚 Knowledge base section.
// Pick the corpus chunking strategy and re-ingest. The re-ingest streams the ingestion
// trace into the simulator store, so the canvas animates chunk → embed → store (reusing
// the upload ingestion flow — no new station). Read-only comparison of strategies lives
// in the Vector DB drill-in's Chunking playground; this is the real rebuild.

import { useEffect, useMemo, useState } from "react";

import { useT } from "../i18n";
import { getConfig, reindexCorpus, type AppConfig, type ChunkParamSpec } from "../lib/chatApi";
import { useSimulator } from "../store/useSimulator";

const STRATEGIES = ["recursive", "fixed", "semantic", "agentic"];

function label(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

// 081-chunking-config — per-strategy parameter values, keyed by strategy then param.
type ParamState = Record<string, Record<string, number>>;

/** Seed every strategy's params from the config defaults, so switching strategy always
 *  shows sensible values (and the controls render only the relevant keys). */
function seedParams(specs: AppConfig["chunk_params"]): ParamState {
  const out: ParamState = {};
  for (const [strat, params] of Object.entries(specs ?? {})) {
    out[strat] = Object.fromEntries(Object.entries(params).map(([k, s]) => [k, s.default]));
  }
  return out;
}

export function SettingsKnowledgeBase() {
  const kb = useT().settings.kb;

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [active, setActive] = useState<string>("recursive");
  const [chosen, setChosen] = useState<string>("recursive");
  const [params, setParams] = useState<ParamState>({});
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setConfig(c);
        setParams(seedParams(c.chunk_params));
        const a = c.chunk_strategy ?? "recursive";
        setActive(a);
        setChosen(a);
      })
      .catch(() => {});
  }, []);

  const strategies = config?.chunk_strategies ?? STRATEGIES;

  // The relevant param controls for the currently-selected strategy (in config order).
  const fields = useMemo<[string, ChunkParamSpec][]>(
    () => Object.entries(config?.chunk_params?.[chosen] ?? {}),
    [config, chosen],
  );

  const labels: Record<string, { label: string; hint: string; step: number }> = {
    chunk_size: { label: kb.params.chunkSize, hint: kb.params.sizeHint, step: 1 },
    chunk_overlap: { label: kb.params.chunkOverlap, hint: kb.params.overlapHint, step: 1 },
    semantic_threshold: {
      label: kb.params.threshold,
      hint: kb.params.thresholdHint,
      step: 0.05,
    },
    max_segments: { label: kb.params.maxSegments, hint: kb.params.maxSegmentsHint, step: 1 },
  };

  function setParam(key: string, raw: string, isFloat: boolean) {
    const value = isFloat ? parseFloat(raw) : parseInt(raw, 10);
    setParams((prev) => ({
      ...prev,
      [chosen]: { ...prev[chosen], [key]: Number.isNaN(value) ? 0 : value },
    }));
  }

  async function reingest() {
    if (busy) return;
    setBusy(true);
    setDoneCount(null);
    const sim = useSimulator.getState();
    const signal = sim.beginRun();
    try {
      await reindexCorpus(
        chosen,
        {
          onTrace: (e) => useSimulator.getState().pushTrace(e),
          onDone: (d) => {
            useSimulator.getState().endRun();
            setActive(d.strategy);
            setDoneCount(d.num_chunks);
          },
        },
        signal,
        params[chosen],
      );
    } catch (err) {
      useSimulator.getState().failRun((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--color-ink)]">
        <span aria-hidden>📚</span>
        {kb.title}
      </div>
      <p className="mb-2 text-[10.5px] leading-snug text-[var(--color-muted)]">{kb.hint}</p>

      <div className="mb-1 text-[11px] font-semibold text-[var(--color-ink)]">{kb.strategy}</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {strategies.map((s) => {
          const isChosen = s === chosen;
          return (
            <button
              key={s}
              onClick={() => setChosen(s)}
              aria-pressed={isChosen}
              disabled={busy}
              className="rounded-lg border px-2.5 py-1.5 text-[11px] transition"
              style={{
                borderColor: isChosen ? "var(--color-accent)" : "var(--color-line)",
                background: isChosen ? "var(--color-panel-2)" : "transparent",
                color: isChosen ? "var(--color-indigo-soft)" : "var(--color-ink)",
              }}
            >
              {label(s)}
              {s === active && (
                <span className="ml-1 text-[9px] text-[var(--color-faint)]">· {kb.active}</span>
              )}
            </button>
          );
        })}
      </div>

      {fields.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[11px] font-semibold text-[var(--color-ink)]">
            {kb.params.title}
          </div>
          <div className="flex flex-col gap-2.5">
            {fields.map(([key, spec]) => {
              const meta = labels[key] ?? { label: key, hint: "", step: 1 };
              const isFloat = meta.step < 1;
              return (
                <label key={key} className="flex flex-col gap-0.5">
                  <span className="flex items-center justify-between text-[11px] text-[var(--color-ink)]">
                    {meta.label}
                    <input
                      type="number"
                      data-testid={`kb-param-${key}`}
                      value={params[chosen]?.[key] ?? spec.default}
                      min={spec.min}
                      max={spec.max}
                      step={meta.step}
                      disabled={busy}
                      onChange={(e) => setParam(key, e.target.value, isFloat)}
                      className="w-24 rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1 text-right text-[11px] text-[var(--color-ink)] disabled:opacity-50"
                    />
                  </span>
                  {meta.hint && (
                    <span className="text-[9.5px] leading-snug text-[var(--color-muted)]">
                      {meta.hint} ({spec.min}–{spec.max})
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={reingest}
          disabled={busy || !config}
          data-testid="settings-reingest"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-panel)] disabled:opacity-50"
        >
          {busy ? kb.reingesting : kb.reingest}
        </button>
        {doneCount !== null && (
          <span className="text-[10.5px] text-[var(--color-ok-soft)]">{kb.done(doneCount)}</span>
        )}
      </div>
    </section>
  );
}
