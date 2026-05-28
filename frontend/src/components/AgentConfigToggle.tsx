// Header-level "Configure agent" button.
//
// History: spec 042-agent-anatomy originally surfaced the "Configure agent"
// action as a secondary button INSIDE the Agent station's expanded body. That
// kept it discoverable only after expanding the node — easy to miss. This
// component lifts the same action into the masthead, next to the existing
// ⚙ Config (ConfigToggle) toggle, so the dialog is one click away from any
// page (Simulator / Learn / Settings).
//
// Behaviour-preserving: it calls `useAgentAnatomy.openDialog()` exactly like
// the old card button. No new store, no new event, no new `Stage`.

import { useT } from "../i18n";
import { useAgentAnatomy } from "../lib/agentAnatomy";
import { BrainIcon } from "./icons";

export function AgentConfigToggle() {
  const t = useT().agentAnatomy;
  const openAnatomy = useAgentAnatomy((s) => s.openDialog);

  return (
    <button
      onClick={() => openAnatomy()}
      // Long label in the accessible name + tooltip; the visible text uses the
      // short `headerLabel` ("Agent" / "Agente") that fits between the divider
      // groups. The full action stays announced for screen readers.
      title={t.openButton}
      aria-label={t.openButton}
      data-testid="header-agent-config"
      className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--color-line)] px-2.5 text-[12px] font-medium text-[var(--color-text-soft)] transition hover:border-[var(--color-sky)] hover:text-[var(--color-sky-soft)]"
    >
      <BrainIcon className="h-3.5 w-3.5" />
      <span className="hidden lg:inline">{t.headerLabel}</span>
    </button>
  );
}
