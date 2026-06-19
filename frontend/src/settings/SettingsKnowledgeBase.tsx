// 072-chunking-strategies · 📚 Knowledge base section.
// Pick the corpus chunking strategy and re-ingest. The re-ingest streams the ingestion
// trace into the simulator store, so the canvas animates chunk → embed → store (reusing
// the upload ingestion flow — no new station). Read-only comparison of strategies lives
// in the Vector DB drill-in's Chunking playground; this is the real rebuild.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { getConfig, reindexCorpus, type AppConfig } from "../lib/chatApi";
import { useSimulator } from "../store/useSimulator";

const STRATEGIES = ["recursive", "fixed", "semantic", "agentic"];

function label(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export function SettingsKnowledgeBase() {
  const kb = useT().settings.kb;

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [active, setActive] = useState<string>("recursive");
  const [chosen, setChosen] = useState<string>("recursive");
  const [busy, setBusy] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setConfig(c);
        const a = c.chunk_strategy ?? "recursive";
        setActive(a);
        setChosen(a);
      })
      .catch(() => {});
  }, []);

  const strategies = config?.chunk_strategies ?? STRATEGIES;

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
