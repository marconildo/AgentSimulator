// 042-agent-anatomy — the "Configure agent" modal opened from the Agent
// station. Renders seven sections in a fixed order (identity / system /
// agent / model / tools / knowledge / skills), each one a small component
// from `src/agent-anatomy/`. The dialog itself owns only: backdrop, Esc
// handling, focus management, optional initial-section scroll.

import { useEffect, useRef } from "react";

import { AgentCatalogSidebar } from "../agent-anatomy/AgentCatalogSidebar";
import { Identity } from "../agent-anatomy/Identity";
import { SystemPromptSection } from "../agent-anatomy/SystemPromptSection";
import { AgentPromptSection } from "../agent-anatomy/AgentPromptSection";
import { ProviderSection } from "../agent-anatomy/ProviderSection";
import { ModelSection } from "../agent-anatomy/ModelSection";
import { ToolsSection } from "../agent-anatomy/ToolsSection";
import { KnowledgeSection } from "../agent-anatomy/KnowledgeSection";
import { SkillsSection } from "../agent-anatomy/SkillsSection";
import { useT } from "../i18n";
import { useAgentAnatomy } from "../lib/agentAnatomy";
import { useAgentCatalog } from "../lib/agentCatalog";
import {
  SECTION_ICONS,
  SECTION_ORDER,
  type AgentAnatomySection,
} from "../lib/agentAnatomySections";

export function AgentAnatomyDialog() {
  const t = useT().agentAnatomy;
  const open = useAgentAnatomy((s) => s.open);
  const initialSection = useAgentAnatomy((s) => s.initialSection);
  const close = useAgentAnatomy((s) => s.closeDialog);
  const setFocusedAgent = useAgentCatalog((s) => s.setFocused);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // 064-agent-catalog-focus: the dialog's edit-focus is per-open. Clear it when
  // the dialog unmounts so re-opening starts on the conversation's bound agent
  // (or the catalog default on a draft) rather than the last-edited agent.
  useEffect(() => {
    if (!open) return;
    return () => setFocusedAgent(null);
  }, [open, setFocusedAgent]);

  // Esc closes — bound at document level so the focus inside textarea doesn't
  // swallow the keypress.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Scroll the requested section into view on open.
  useEffect(() => {
    if (!open || !initialSection || !dialogRef.current) return;
    const target = dialogRef.current.querySelector(
      `[data-anatomy-section="${initialSection}"]`,
    );
    target?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [open, initialSection]);

  if (!open) return null;

  return (
    <div
      // Backdrop — clicking it closes (the inner card stops propagation).
      onClick={close}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="presentation"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.dialogTitle}
        data-testid="agent-anatomy-dialog"
        className="relative flex max-h-[88vh] w-[min(95vw,1040px)] flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--color-ink)]">
            <span aria-hidden>🧠</span>
            {t.dialogTitle}
          </div>
          <button
            onClick={close}
            aria-label={t.close}
            data-testid="agent-anatomy-close"
            className="rounded-md border border-[var(--color-line)] px-2 py-1 text-[12px] text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* 044-shared-agent-catalog: leftmost rail — pick/clone/delete agent
              from the catalog (Lumis-style). Sits before the section nav so
              the agent identity is the first thing the user sees. */}
          <AgentCatalogSidebar />
          {/* Left rail — section anchors. */}
          <nav className="hidden w-44 shrink-0 border-r border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 sm:block">
            <ul className="flex flex-col gap-0.5">
              {SECTION_ORDER.map((id) => (
                <li key={id}>
                  <a
                    href={`#agent-anatomy-${id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const target = dialogRef.current?.querySelector(
                        `[data-anatomy-section="${id}"]`,
                      );
                      target?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-[12px] text-[var(--color-ink)] transition hover:bg-[var(--color-panel)]"
                  >
                    <span aria-hidden>{SECTION_ICONS[id]}</span>
                    {sectionTitle(t, id)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Scrollable content column. */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-6">
              {SECTION_ORDER.map((id) => (
                <SectionBlock key={id} id={id} title={sectionTitle(t, id)}>
                  {renderSection(id)}
                </SectionBlock>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sectionTitle(
  t: ReturnType<typeof useT>["agentAnatomy"],
  id: AgentAnatomySection,
): string {
  switch (id) {
    case "identity":
      return t.identity.title;
    case "system":
      return t.system.title;
    case "agent":
      return t.agent.title;
    case "provider":
      return t.provider.title;
    case "model":
      return t.model.title;
    case "tools":
      return t.tools.title;
    case "knowledge":
      return t.knowledge.title;
    case "skills":
      return t.skills.title;
  }
}

function renderSection(id: AgentAnatomySection) {
  switch (id) {
    case "identity":
      return <Identity />;
    case "system":
      return <SystemPromptSection />;
    case "agent":
      return <AgentPromptSection />;
    case "provider":
      return <ProviderSection />;
    case "model":
      return <ModelSection />;
    case "tools":
      return <ToolsSection />;
    case "knowledge":
      return <KnowledgeSection />;
    case "skills":
      return <SkillsSection />;
  }
}

function SectionBlock({
  id,
  title,
  children,
}: {
  id: AgentAnatomySection;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div id={`agent-anatomy-${id}`}>
      <h3 className="mb-2 flex items-center gap-2 border-b border-[var(--color-line)] pb-1 text-[12.5px] font-semibold text-[var(--color-ink)]">
        <span aria-hidden>{SECTION_ICONS[id]}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}
