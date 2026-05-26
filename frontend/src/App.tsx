import { useEffect, useMemo, useState } from "react";

import { AgentDetail } from "./components/AgentDetail";
import { ChatPanel } from "./components/ChatPanel";
import { CloudToggle } from "./components/CloudToggle";
import { FlowCanvas } from "./components/FlowCanvas";
import { InspectorPanel } from "./components/InspectorPanel";
import { LanguageToggle } from "./components/LanguageToggle";
import { SettingsPanel } from "./components/SettingsPanel";
import { ThemeToggle } from "./components/ThemeToggle";
import { Timeline } from "./components/Timeline";
import { useT } from "./i18n";
import { LearnPage } from "./learn/LearnPage";
import { deriveView } from "./lib/derive";
import { useSimulator } from "./store/useSimulator";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

interface Health {
  llm_provider: string;
  llm_model: string;
}

export default function App() {
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const selected = useSimulator((s) => s.selected);
  const select = useSimulator((s) => s.select);
  const detail = useSimulator((s) => s.detail);
  const closeDetail = useSimulator((s) => s.closeDetail);

  const view = useMemo(() => deriveView(events, cursor), [events, cursor]);
  const t = useT();

  const [page, setPage] = useState<"sim" | "learn">("sim");
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[var(--color-base)]">
      <header className="flex items-center gap-3 border-b border-[var(--color-line)] px-5 py-3">
        <span className="text-xl">🧭</span>
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold tracking-wide text-[var(--color-ink)]">
            AI Agent Simulator
          </h1>
          <p className="text-[11px] text-[var(--color-muted)]">{t.app.tagline}</p>
        </div>
        <CloudToggle />
        <LanguageToggle />
        <ThemeToggle />
        <SettingsPanel />
        <button
          onClick={() => setPage((p) => (p === "sim" ? "learn" : "sim"))}
          className="rounded-full border px-3 py-1 text-[12px] font-medium transition"
          style={{
            borderColor: page === "learn" ? "var(--color-sky)" : "var(--color-line)",
            color: page === "learn" ? "var(--color-sky-soft)" : "var(--color-text-soft)",
          }}
        >
          {page === "sim" ? `📚 ${t.app.learn}` : `← ${t.app.simulator}`}
        </button>
        {health && (
          <span
            className="rounded-full border px-2.5 py-1 font-mono text-[11px]"
            style={{ borderColor: "var(--color-ok)", color: "var(--color-ok-soft)" }}
            title={t.app.liveTitle}
          >
            {`openai · ${health.llm_model}`}
          </span>
        )}
        <a
          href="https://github.com/reginaldosilva27/AgentSimulator"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[12px] text-[var(--color-muted)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
        >
          GitHub ↗
        </a>
      </header>

      {page === "sim" ? (
        <>
          <div className="flex min-h-0 flex-1">
            <aside className="w-[340px] shrink-0 border-r border-[var(--color-line)] bg-[var(--color-panel)]">
              <ChatPanel liveAnswer={view.answer} />
            </aside>

            <main className="relative min-w-0 flex-1">
              <FlowCanvas view={view} selected={selected} onSelect={select} />
              {detail === "agent" && <AgentDetail view={view} onClose={closeDetail} />}
            </main>

            <aside className="w-[372px] shrink-0 border-l border-[var(--color-line)] bg-[var(--color-panel)]">
              <InspectorPanel selected={selected} view={view} onSelect={select} />
            </aside>
          </div>

          <Timeline />
        </>
      ) : (
        <LearnPage />
      )}
    </div>
  );
}
