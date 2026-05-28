// 042-agent-anatomy · 🪪 Identity section.
//
// Edits the conversation's `agent_name` (max 60 chars, debounced PATCH).
// The short description is a local-only field for now — the spec keeps it
// visible (it's part of the agent's anatomy mental model) but persistence is
// a follow-up if users actually start using it. AC13 only asks the name to
// round-trip.

import { useEffect, useRef, useState } from "react";

import { useT } from "../i18n";
import { patchSession } from "../lib/chatApi";
import { useChat } from "../store/useChat";

export function Identity() {
  const t = useT().agentAnatomy.identity;
  const reset = useT().agentAnatomy.reset;
  const sessionId = useChat((c) => c.activeSessionId);
  const sessions = useChat((c) => c.sessions);
  const replaceSession = useChat((c) => c.replaceSession);
  // The current name comes from the session record (server is source of truth).
  const session = sessions.find((s) => s.id === sessionId) ?? null;
  const remoteName = session?.agent_name ?? "";

  const [draft, setDraft] = useState<string>(remoteName);
  // Sync local draft when switching conversations (or after a remote refresh).
  useEffect(() => setDraft(remoteName), [sessionId, remoteName]);

  const [desc, setDesc] = useState<string>("");
  useEffect(() => setDesc(""), [sessionId]);

  // Debounced PATCH so every keystroke isn't a network round-trip. 300 ms is the
  // human-typing pause threshold (same window the cumulative HUD uses for its
  // debounced refreshes).
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sessionId) return;
    if (draft === remoteName) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      patchSession(sessionId, { agent_name: draft })
        .then((row) => {
          // Reflect the new name in the chat sidebar / station header.
          if (row) replaceSession(row);
        })
        .catch(() => {});
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, remoteName, sessionId, replaceSession]);

  const dirty = remoteName !== "";

  return (
    <section data-anatomy-section="identity" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.hint}</p>

      <div>
        <label
          htmlFor="agent-anatomy-name"
          className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--color-ink)]"
        >
          <span>{t.nameLabel}</span>
          {dirty && (
            <button
              onClick={() => {
                if (!sessionId) return;
                patchSession(sessionId, { agent_name: "" })
                  .then((row) => row && replaceSession(row))
                  .catch(() => {});
                setDraft("");
              }}
              className="rounded-full border border-[var(--color-line)] px-2 py-px text-[10px] font-normal text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            >
              {reset}
            </button>
          )}
        </label>
        <input
          id="agent-anatomy-name"
          aria-label={t.nameLabel}
          data-testid="agent-anatomy-name-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 60))}
          maxLength={60}
          placeholder={t.namePlaceholder}
          spellCheck={false}
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>

      <div>
        <label
          htmlFor="agent-anatomy-desc"
          className="mb-1 block text-[11px] font-semibold text-[var(--color-ink)]"
        >
          {t.descLabel}
        </label>
        <textarea
          id="agent-anatomy-desc"
          aria-label={t.descLabel}
          value={desc}
          onChange={(e) => setDesc(e.target.value.slice(0, 240))}
          maxLength={240}
          rows={2}
          placeholder={t.descPlaceholder}
          spellCheck={false}
          className="w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[12px] leading-snug text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    </section>
  );
}
