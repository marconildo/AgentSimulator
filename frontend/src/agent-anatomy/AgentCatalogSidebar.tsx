// 044-shared-agent-catalog (UX iteration) · the catalog as a left **sidebar**
// inside the Agent Anatomy dialog, replacing the original compact header strip.
// Inspired by the Lumis-style left rail: a vertical list of agents with their
// names + a small initial-circle "avatar", a "+ New" affordance at the top,
// and an inline delete confirm at the bottom.
//
// 064-agent-catalog-focus: clicking a row, creating, or deleting all move the
// dialog's **focus** (`useAgentCatalog.focusedId`) — the agent the editor edits
// — regardless of the 045 session lock. Selecting/creating *also* re-binds the
// conversation's agent **only when it is not locked** (you can't swap the agent
// of a conversation that already has messages). When locked the catalog is still
// fully editable; only the session binding is fixed.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import { useAgentCatalog } from "../lib/agentCatalog";
import {
  createAgent,
  deleteAgent,
  setSessionAgent,
  type AgentMeta,
} from "../lib/chatApi";
import { useChat } from "../store/useChat";

const MAX_VISIBLE = 10;

export function AgentCatalogSidebar() {
  const t = useT().agentAnatomy.catalog;
  const sessionAgent = useChat((c) => {
    const id = c.activeSessionId;
    if (!id) return null;
    return c.sessions.find((s) => s.id === id)?.agent ?? null;
  });
  // 045-composer-agent-selector: locked if the active conversation has at
  // least one persisted message. With 064 this only gates the *session
  // re-binding* below — rows stay selectable for editing.
  const locked = useChat((c) => {
    const id = c.activeSessionId;
    if (!id) return false;
    const count = c.sessions.find((s) => s.id === id)?.message_count ?? 0;
    return count > 0;
  });
  const replaceSession = useChat((c) => c.replaceSession);
  const ensureSession = useChat((c) => c.ensureSession);

  // 064: shared catalog store — single source of truth for list + focus.
  const catalog = useAgentCatalog((s) => s.agents);
  const focusedId = useAgentCatalog((s) => s.focusedId);
  const refresh = useAgentCatalog((s) => s.refresh);
  const setFocused = useAgentCatalog((s) => s.setFocused);
  const upsert = useAgentCatalog((s) => s.upsert);
  const removeLocal = useAgentCatalog((s) => s.remove);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (catalog === null) void refresh();
  }, [catalog, refresh]);

  // The highlighted row follows the focus first, then the conversation's bound
  // agent, then the catalog default (matches `useActiveAgent`'s resolution).
  const activeId =
    focusedId ?? sessionAgent?.id ?? catalog?.find((a) => a.is_default)?.id ?? null;
  const focusedAgent: AgentMeta | null =
    catalog?.find((a) => a.id === activeId) ?? sessionAgent ?? null;

  async function onSelect(nextId: string) {
    if (!nextId || nextId === activeId) return;
    // 064: always focus the row for editing — the editor follows the focus.
    setFocused(nextId);
    // Re-binding the conversation's agent is what the 045 lock forbids. When
    // locked, focusing is enough; we leave the session's running agent intact.
    if (locked) return;
    setBusy(true);
    try {
      // Lazy-persist the conversation if the user is still on a draft. Picking
      // an agent (or creating one) is a meaningful action — commit the draft.
      const sid = await ensureSession();
      if (!sid) return;
      const updated = await setSessionAgent(sid, nextId);
      if (updated) replaceSession(updated);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    setBusy(true);
    try {
      const cloneFrom = activeId ?? undefined;
      const created = await createAgent({ clone_from: cloneFrom });
      // 064: surface the new agent into the list and focus it so the editor
      // immediately shows (and can edit) it — even while the session is locked.
      upsert(created);
      setFocused(created.id);
      // Re-bind the conversation to the new agent only when it isn't locked.
      if (!locked) {
        const sid = await ensureSession();
        if (sid) {
          const updated = await setSessionAgent(sid, created.id);
          if (updated) replaceSession(updated);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!focusedAgent || focusedAgent.is_default) return;
    setBusy(true);
    try {
      const result = await deleteAgent(focusedAgent.id);
      removeLocal(focusedAgent.id);
      setFocused(null);
      // Re-point the conversation to the default only when it isn't locked; a
      // locked conversation keeps its binding (the server's ON DELETE repoint
      // is the accepted edge if the deleted agent was its bound one).
      if (!locked) {
        const sid = await ensureSession();
        if (sid) {
          const updated = await setSessionAgent(sid, result.default_agent_id);
          if (updated) replaceSession(updated);
        }
      }
      await refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const rows: AgentMeta[] = catalog ?? (sessionAgent ? [sessionAgent] : []);
  const visible = rows.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, rows.length - MAX_VISIBLE);

  return (
    <aside
      aria-label={t.label}
      className="flex w-44 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-panel-2)]"
    >
      {/* Header: title + "+ Novo" */}
      <div className="flex items-center justify-between gap-1.5 border-b border-[var(--color-line)] px-3 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          {t.label}
        </span>
        <button
          onClick={() => void onCreate()}
          disabled={busy}
          data-testid="agent-catalog-new"
          title={t.newTooltip}
          className="grid h-5 w-5 place-items-center rounded-md border border-[var(--color-line)] text-[12px] font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-panel)] disabled:opacity-50"
        >
          +
        </button>
      </div>

      {/* Agent list */}
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
        {catalog === null ? (
          <li className="px-2 py-1.5 text-[11px] text-[var(--color-muted)]">
            {t.loading}
          </li>
        ) : visible.length === 0 ? (
          <li className="px-2 py-1.5 text-[11px] italic text-[var(--color-label)]">
            {t.empty}
          </li>
        ) : (
          <>
            {visible.map((a) => {
              const isActive = a.id === activeId;
              return (
                <li key={a.id}>
                  <button
                    onClick={() => void onSelect(a.id)}
                    disabled={busy}
                    data-testid={`agent-catalog-row-${a.id}`}
                    title={a.name}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--color-ink)] transition hover:bg-[var(--color-panel)] disabled:cursor-not-allowed disabled:opacity-60"
                    style={{
                      background: isActive ? "var(--color-panel)" : "transparent",
                      borderLeft: isActive
                        ? "2px solid var(--color-accent)"
                        : "2px solid transparent",
                    }}
                  >
                    <Avatar name={a.name} />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    {a.is_default && (
                      <span
                        className="shrink-0 rounded border border-[var(--color-line)] px-1 py-px font-mono text-[8.5px] uppercase text-[var(--color-muted)]"
                        title={t.defaultSuffix}
                      >
                        ★
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {overflow > 0 && (
              <li className="px-2 py-1 text-[10px] italic text-[var(--color-label)]">
                +{overflow} {t.more}
              </li>
            )}
          </>
        )}
      </ul>

      {/* 064: when the conversation is locked, editing the catalog still works —
          only the conversation's running agent is fixed. Make that explicit so
          selecting a row (which edits but doesn't re-bind) isn't confusing. */}
      {locked && (
        <p
          data-testid="agent-catalog-locked-hint"
          className="border-t border-[var(--color-line)] px-3 py-2 text-[10px] leading-snug text-[var(--color-label)]"
        >
          {t.lockedEditHint}
        </p>
      )}

      {/* Delete footer — only when a non-default agent is focused */}
      {focusedAgent && !focusedAgent.is_default && (
        <div className="border-t border-[var(--color-line)] px-2 py-2">
          {confirming ? (
            <div className="space-y-1.5">
              <p className="text-[10.5px] leading-snug text-[var(--color-muted)]">
                {t.confirm}
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => void onConfirmDelete()}
                  disabled={busy}
                  data-testid="agent-catalog-delete-confirm"
                  className="flex-1 rounded-md border border-[var(--color-rose)] px-2 py-1 text-[10.5px] font-semibold text-[var(--color-rose-soft)] transition hover:bg-[var(--color-panel)] disabled:opacity-50"
                >
                  {t.confirmYes}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-md border border-[var(--color-line)] px-2 py-1 text-[10.5px] text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
                >
                  {t.confirmCancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              data-testid="agent-catalog-delete"
              title={t.deleteTooltip}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] transition hover:text-[var(--color-rose-soft)] disabled:opacity-50"
            >
              🗑 {t.deleteLabel}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

// A tiny initial-circle avatar — the dialog doesn't ship real avatars (deferred
// per 042 non-goals), but a visual anchor on each row lets the eye scan the
// list quickly the same way the Lumis sidebar does.
function Avatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  // Stable color per name (cheap djb2-style hash) so re-renders don't flicker.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) % 360;
  const bg = `hsl(${hash}, 70%, 85%)`;
  const fg = `hsl(${hash}, 50%, 30%)`;
  return (
    <span
      aria-hidden
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
      style={{ background: bg, color: fg }}
    >
      {initial}
    </span>
  );
}
