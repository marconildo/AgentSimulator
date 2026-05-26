import { motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

import { useLang, useT, type Lang } from "../i18n";
import type { Strings } from "../i18n/strings";
import type { ChatChunk, ChatMessage, DocumentMeta, SessionMeta } from "../lib/chatApi";
import { canSend as scenarioCanSend, useScenario } from "../lib/scenario";
import { formatClock, formatRelative } from "../lib/time";
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

// --- icons (inline SVG keeps it crisp + dependency-free) --------------------

type IconProps = { className?: string };

function SparkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2.2l1.8 5.3a4 4 0 0 0 2.5 2.5l5.3 1.8-5.3 1.8a4 4 0 0 0-2.5 2.5L12 21.4l-1.8-5.3a4 4 0 0 0-2.5-2.5L2.4 11.8l5.3-1.8a4 4 0 0 0 2.5-2.5L12 2.2z" />
    </svg>
  );
}

function PlusIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function SendIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

function AttachIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21.4 11.05l-8.5 8.49a5 5 0 0 1-7.07-7.07l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a2 2 0 0 1-2.83-2.83l7.78-7.78" />
    </svg>
  );
}

function FileIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Spinner({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className ?? ""}`} fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// --- conversation list ------------------------------------------------------

function ConversationList() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const sessions = useChat((s) => s.sessions);
  const openSession = useChat((s) => s.openSession);
  const newChat = useChat((s) => s.newChat);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="flex-1 text-[13px] font-semibold tracking-wide text-[var(--color-ink)]">
          {t.chat.conversations}
        </h2>
        <button
          onClick={() => void newChat()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-sky-strong)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-on-accent)] shadow-sm transition hover:brightness-110 active:scale-[.98]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {t.chat.newChat}
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <p className="px-2 py-10 text-center text-[13px] text-[var(--color-label)]">
            {t.chat.empty}
          </p>
        ) : (
          sessions.map((s) => (
            <ConversationRow key={s.id} session={s} onOpen={openSession} t={t} lang={lang} />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  session,
  onOpen,
  t,
  lang,
}: {
  session: SessionMeta;
  onOpen: (id: string) => void;
  t: Strings;
  lang: Lang;
}) {
  return (
    <button
      onClick={() => void onOpen(session.id)}
      className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--color-panel-2)]"
    >
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-sky)] opacity-60 transition group-hover:opacity-100" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-ink)]">
            {session.title || t.chat.untitled}
          </span>
          <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--color-faint)]">
            {formatRelative(session.updated_at, lang)}
          </span>
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
          {t.chat.messages(session.message_count)}
        </span>
      </span>
    </button>
  );
}

// --- open thread ------------------------------------------------------------

function Thread({ liveAnswer }: { liveAnswer: string }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const messages = useChat((s) => s.messages);
  const documents = useChat((s) => s.documents);
  const pending = useChat((s) => s.pending);
  const input = useChat((s) => s.input);
  const sending = useChat((s) => s.sending);
  const error = useChat((s) => s.error);
  const setInput = useChat((s) => s.setInput);
  const send = useChat((s) => s.send);
  const showList = useChat((s) => s.showList);
  const newChat = useChat((s) => s.newChat);
  const activeId = useChat((s) => s.activeSessionId);
  const sessions = useChat((s) => s.sessions);
  const status = useSimulator((s) => s.status);
  const streaming = status === "streaming";

  const activeTitle = sessions.find((s) => s.id === activeId)?.title;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending, liveAnswer]);

  const empty = messages.length === 0 && !pending;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 border-b border-[var(--color-line)] px-2 py-2">
        <button
          onClick={() => void showList()}
          aria-label={t.chat.back}
          title={t.chat.back}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-[var(--color-ink)]">
          {activeTitle || t.chat.untitled}
        </h2>
        <button
          onClick={() => void newChat()}
          aria-label={t.chat.newChat}
          title={t.chat.newChat}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-sky-soft)]"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {empty ? (
          <EmptyThread t={t} />
        ) : (
          <div className="space-y-4 px-3 py-4">
            {messages.map((m) => (
              <Exchange key={m.id} message={m} t={t} lang={lang} />
            ))}
            {pending && (
              <div className="space-y-3">
                <UserMessage text={pending} t={t} lang={lang} ts={null} />
                <AgentMessage t={t} lang={lang} ts={null}>
                  {liveAnswer ? (
                    <>
                      {liveAnswer}
                      {streaming && <span className="caret">▍</span>}
                    </>
                  ) : (
                    <TypingDots />
                  )}
                </AgentMessage>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mx-3 mb-1.5 rounded-lg bg-[color-mix(in_srgb,var(--color-rose)_14%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--color-rose-soft)]">
          ⚠ {error}
        </p>
      )}

      <Composer
        input={input}
        sending={sending}
        documents={documents}
        onChange={setInput}
        onSend={() => void send()}
        t={t}
      />
    </div>
  );
}

function EmptyThread({ t }: { t: Strings }) {
  const setInput = useChat((s) => s.setInput);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-sky)] to-[var(--color-accent)] text-[var(--color-on-accent)] shadow-md">
        <SparkIcon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[14px] font-semibold text-[var(--color-ink)]">{t.chat.title}</p>
        <p className="mx-auto mt-1 max-w-[26ch] text-[12px] leading-relaxed text-[var(--color-muted)]">
          {t.chat.subtitle}
        </p>
      </div>
      <div className="mt-1 flex w-full flex-col gap-1.5">
        {t.chat.examples.slice(0, 3).map((ex) => (
          <button
            key={ex}
            onClick={() => setInput(ex)}
            className="truncate rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-left text-[12px] text-[var(--color-text-soft)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function Exchange({ message, t, lang }: { message: ChatMessage; t: Strings; lang: Lang }) {
  return (
    <div className="space-y-3">
      <UserMessage text={message.message} t={t} lang={lang} ts={message.created_at} />
      <AgentMessage
        t={t}
        lang={lang}
        ts={message.created_at}
        below={message.chunks.length > 0 ? <Sources chunks={message.chunks} t={t} /> : null}
      >
        {message.answer}
      </AgentMessage>
    </div>
  );
}

// `ts === null` means the exchange is still in flight → render "now".
function Stamp({ ts, lang, t }: { ts: number | null; lang: Lang; t: Strings }) {
  return (
    <span className="text-[10.5px] tabular-nums text-[var(--color-faint)]">
      {ts != null ? formatClock(ts, lang) : t.chat.now}
    </span>
  );
}

function UserMessage({
  text,
  t,
  lang,
  ts,
}: {
  text: string;
  t: Strings;
  lang: Lang;
  ts: number | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-end gap-0.5"
    >
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--color-sky-strong)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-on-accent)] shadow-sm">
        {text}
      </div>
      <span className="pr-1">
        <Stamp ts={ts} lang={lang} t={t} />
      </span>
    </motion.div>
  );
}

function AgentMessage({
  t,
  lang,
  ts,
  children,
  below,
}: {
  t: Strings;
  lang: Lang;
  ts: number | null;
  children: ReactNode;
  below?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2"
    >
      <span className="mt-[18px] flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-sky)] to-[var(--color-accent)] text-[var(--color-on-accent)] shadow-sm">
        <SparkIcon className="h-[15px] w-[15px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start">
        <div className="mb-0.5 flex items-center gap-1.5 px-0.5">
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{t.chat.agent}</span>
          <Stamp ts={ts} lang={lang} t={t} />
        </div>
        <div className="max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-ink)]">
          {children}
        </div>
        {below}
      </div>
    </motion.div>
  );
}

function TypingDots() {
  // Reuses the `blink` keyframe (index.css); staggered → a "typing" indicator.
  return (
    <span className="inline-flex items-center gap-1 py-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)]"
          style={{ animation: "blink 1.2s ease-in-out infinite", animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

function Sources({ chunks, t }: { chunks: ChatChunk[]; t: Strings }) {
  return (
    <details className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] p-2">
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

// --- composer (attach + textarea + send, in one rounded field) --------------

function Composer({
  input,
  sending,
  documents,
  onChange,
  onSend,
  t,
}: {
  input: string;
  sending: boolean;
  documents: DocumentMeta[];
  onChange: (value: string) => void;
  onSend: () => void;
  t: Strings;
}) {
  const uploading = useChat((s) => s.uploading);
  const uploadPdf = useChat((s) => s.uploadPdf);
  const removeDocument = useChat((s) => s.removeDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // 008-scenario-framework: the upper rungs are view-only previews — sending is
  // gated to the executable (simple) rung.
  const scenario = useScenario((s) => s.scenario);
  const locked = !scenarioCanSend(scenario);

  // Auto-grow the textarea up to a cap, the way modern composers do.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const canSend = input.trim().length > 0 && !sending && !locked;

  return (
    <div className="px-3 pb-3 pt-1">
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
        className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 shadow-sm transition focus-within:border-[color-mix(in_srgb,var(--color-sky)_60%,transparent)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--color-sky)_20%,transparent)]"
      >
        {documents.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {documents.map((d) => (
              <DocChip
                key={d.document_id}
                doc={d}
                onRemove={() => void removeDocument(d.document_id)}
                t={t}
              />
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          rows={1}
          placeholder={locked ? t.scenario.sendDisabled : t.chat.placeholder}
          disabled={sending || locked}
          className="block max-h-[140px] w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-label)] disabled:opacity-50"
        />

        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label={t.chat.attachDoc}
            title={t.chat.attachDoc}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-muted)] transition enabled:hover:bg-[var(--color-line)] enabled:hover:text-[var(--color-ok-soft)] disabled:opacity-40"
          >
            {uploading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <AttachIcon className="h-[18px] w-[18px]" />
            )}
          </button>

          <span
            className="min-w-0 flex-1 truncate text-[10.5px]"
            style={{ color: locked ? "var(--color-warn)" : "var(--color-faint)" }}
          >
            {locked ? `⌛ ${t.scenario.sendDisabled}` : uploading ? t.chat.uploading : t.chat.enterToSend}
          </span>

          {/* Send button with a one-shot "ping" ring while the request is in
              flight, so the start of the journey (button → Frontend node) is
              unmistakable — kept from the original. */}
          <span className="relative shrink-0">
            {sending && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-[var(--color-sky-strong)] opacity-60"
              />
            )}
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t.chat.send}
              title={t.chat.send}
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-sky-strong)] text-[var(--color-on-accent)] transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? <Spinner className="h-4 w-4" /> : <SendIcon className="h-4 w-4" />}
            </button>
          </span>
        </div>
      </form>
    </div>
  );
}

function DocChip({ doc, onRemove, t }: { doc: DocumentMeta; onRemove: () => void; t: Strings }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] py-1 pl-2 pr-1 text-[11px]"
      title={t.chat.chunksStored(doc.chunk_count)}
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-ok-soft)]" />
      <span className="min-w-0 max-w-[130px] truncate text-[var(--color-ink)]">{doc.filename}</span>
      <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-muted)]">
        {doc.chunk_count}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t.chat.removeDoc}
        title={t.chat.removeDoc}
        className="shrink-0 rounded p-0.5 text-[var(--color-label)] transition hover:bg-[var(--color-line)] hover:text-[var(--color-rose-soft)]"
      >
        <CloseIcon className="h-3 w-3" />
      </button>
    </span>
  );
}
