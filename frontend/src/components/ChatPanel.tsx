import { motion } from "framer-motion";
import { useEffect, useRef } from "react";

import { useT } from "../i18n";
import type { Strings } from "../i18n/strings";
import type { ChatChunk, ChatMessage, DocumentMeta, SessionMeta } from "../lib/chatApi";
import { useChat } from "../store/useChat";
import { useSimulator } from "../store/useSimulator";

interface ChatPanelProps {
  // The answer streaming back from the active run (derived from the trace log).
  liveAnswer: string;
}

export function ChatPanel({ liveAnswer }: ChatPanelProps) {
  const view = useChat((s) => s.view);

  // Load sessions (and open the most recent, or create one) on first mount.
  useEffect(() => {
    void useChat.getState().init();
  }, []);

  return view === "list" ? <ConversationList /> : <Thread liveAnswer={liveAnswer} />;
}

// --- conversation list ------------------------------------------------------

function ConversationList() {
  const t = useT();
  const sessions = useChat((s) => s.sessions);
  const openSession = useChat((s) => s.openSession);
  const newChat = useChat((s) => s.newChat);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="flex-1 text-sm font-semibold tracking-wide text-[var(--color-ink)]">
          {t.chat.conversations}
        </h2>
        <button
          onClick={() => void newChat()}
          className="rounded-lg bg-[var(--color-sky-strong)] px-2.5 py-1 text-[12px] font-semibold text-[var(--color-on-accent)] transition hover:bg-[var(--color-sky)]"
        >
          + {t.chat.newChat}
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {sessions.length === 0 ? (
          <p className="px-1 py-6 text-center text-[13px] text-[var(--color-label)]">
            {t.chat.empty}
          </p>
        ) : (
          sessions.map((s) => <ConversationRow key={s.id} session={s} onOpen={openSession} t={t} />)
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  session,
  onOpen,
  t,
}: {
  session: SessionMeta;
  onOpen: (id: string) => void;
  t: Strings;
}) {
  return (
    <button
      onClick={() => void onOpen(session.id)}
      className="flex w-full flex-col gap-0.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-left transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)]"
    >
      <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
        {session.title || t.chat.untitled}
      </span>
      <span className="text-[11px] text-[var(--color-muted)]">
        {t.chat.messages(session.message_count)}
      </span>
    </button>
  );
}

// --- open thread ------------------------------------------------------------

function Thread({ liveAnswer }: { liveAnswer: string }) {
  const t = useT();
  const messages = useChat((s) => s.messages);
  const documents = useChat((s) => s.documents);
  const pending = useChat((s) => s.pending);
  const input = useChat((s) => s.input);
  const sending = useChat((s) => s.sending);
  const error = useChat((s) => s.error);
  const setInput = useChat((s) => s.setInput);
  const send = useChat((s) => s.send);
  const showList = useChat((s) => s.showList);
  const clearConversation = useChat((s) => s.clearConversation);
  const status = useSimulator((s) => s.status);
  const streaming = status === "streaming";

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending, liveAnswer]);

  const empty = messages.length === 0 && !pending;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
        <button
          onClick={() => void showList()}
          className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[12px] text-[var(--color-muted)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
        >
          ‹ {t.chat.back}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => {
            if (window.confirm(t.chat.clearConfirm)) void clearConversation();
          }}
          className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[12px] text-[var(--color-muted)] transition hover:border-[var(--color-rose)] hover:text-[var(--color-rose-soft)]"
        >
          {t.chat.clear}
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {empty ? (
          <p className="px-2 py-8 text-center text-[13px] text-[var(--color-label)]">
            {t.chat.emptyThread}
          </p>
        ) : (
          <>
            {messages.map((m) => (
              <Exchange key={m.id} message={m} t={t} />
            ))}
            {pending && (
              <>
                <Bubble who="you" t={t}>
                  {pending}
                </Bubble>
                <Bubble who="agent" t={t}>
                  {liveAnswer ? (
                    <>
                      {liveAnswer}
                      {streaming && <span className="caret">▍</span>}
                    </>
                  ) : (
                    <span className="text-[var(--color-label)]">{t.chat.thinking}</span>
                  )}
                </Bubble>
              </>
            )}
          </>
        )}
      </div>

      <DocumentsBar documents={documents} t={t} />

      {error && <p className="px-3 pb-1 text-[11px] text-[var(--color-rose-soft)]">⚠ {error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 border-t border-[var(--color-line)] p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={t.chat.placeholder}
          disabled={sending}
          className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-label)] focus:border-[color-mix(in_srgb,var(--color-sky)_60%,transparent)]"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-xl bg-[var(--color-sky-strong)] px-3 py-2 text-sm font-semibold text-[var(--color-on-accent)] transition enabled:hover:bg-[var(--color-sky)] disabled:opacity-40"
        >
          {sending ? t.chat.running : t.chat.send}
        </button>
      </form>
    </div>
  );
}

function Exchange({ message, t }: { message: ChatMessage; t: Strings }) {
  return (
    <>
      <Bubble who="you" t={t}>
        {message.message}
      </Bubble>
      <Bubble who="agent" t={t}>
        {message.answer}
        {message.chunks.length > 0 && <Sources chunks={message.chunks} t={t} />}
      </Bubble>
    </>
  );
}

function Bubble({
  who,
  t,
  children,
}: {
  who: "you" | "agent";
  t: Strings;
  children: React.ReactNode;
}) {
  const isYou = who === "you";
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={isYou ? "flex flex-col items-end" : "flex flex-col items-start"}
    >
      <span className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-label)]">
        {isYou ? t.chat.you : t.chat.agent}
      </span>
      <div
        className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed"
        style={
          isYou
            ? { background: "var(--color-sky-strong)", color: "var(--color-on-accent)" }
            : {
                background: "var(--color-panel-2)",
                color: "var(--color-ink)",
                border: "1px solid var(--color-line)",
              }
        }
      >
        {children}
      </div>
    </motion.div>
  );
}

function Sources({ chunks, t }: { chunks: ChatChunk[]; t: Strings }) {
  return (
    <details className="mt-2 rounded-lg border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] p-2">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {t.chat.sources} ({chunks.length})
      </summary>
      <div className="mt-1.5 space-y-1.5">
        {chunks.map((c, idx) => (
          <div key={idx} className="rounded-md bg-[var(--color-panel)] p-1.5">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="truncate font-mono text-[var(--color-text-soft)]">{c.source}</span>
              <div className="flex shrink-0 items-center gap-1">
                {c.uploaded && (
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--color-ok)_22%,transparent)] px-1.5 py-px text-[9px] font-semibold uppercase text-[var(--color-ok-soft)]">
                    {t.chat.fromDoc}
                  </span>
                )}
                <span className="font-mono text-[var(--color-ok-soft)]">{c.score.toFixed(2)}</span>
              </div>
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-[var(--color-muted)]">
              {c.text}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}

function DocumentsBar({ documents, t }: { documents: DocumentMeta[]; t: Strings }) {
  const uploading = useChat((s) => s.uploading);
  const uploadPdf = useChat((s) => s.uploadPdf);
  const removeDocument = useChat((s) => s.removeDocument);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="border-t border-[var(--color-line)] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {t.chat.documents}
        </span>
        <div className="flex-1" />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadPdf(file);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted)] transition enabled:hover:border-[color-mix(in_srgb,var(--color-ok)_55%,transparent)] enabled:hover:text-[var(--color-ok-soft)] disabled:opacity-50"
        >
          {uploading ? t.chat.uploading : `↥ ${t.chat.uploadPdf}`}
        </button>
      </div>

      {documents.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {documents.map((d) => (
            <div
              key={d.document_id}
              className="flex items-center gap-2 rounded-md bg-[var(--color-panel-2)] px-2 py-1 text-[11px]"
            >
              <span className="text-[12px]">📄</span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-ink)]">{d.filename}</span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)]">
                {t.chat.chunksStored(d.chunk_count)}
              </span>
              <button
                onClick={() => void removeDocument(d.document_id)}
                title={t.chat.removeDoc}
                aria-label={t.chat.removeDoc}
                className="shrink-0 rounded px-1 text-[var(--color-label)] transition hover:text-[var(--color-rose-soft)]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
