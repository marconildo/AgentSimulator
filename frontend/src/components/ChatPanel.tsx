import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useLang, useT, type Lang } from "../i18n";
import type { Strings } from "../i18n/strings";
import { CancelButton } from "./CancelButton";
import { ConversationHud } from "./ConversationHud";
import {
  isAgentLockedError,
  listAgents,
  setSessionAgent,
  type AgentMeta,
  type ChatChunk,
  type ChatMessage,
  type DocumentMeta,
  type SessionMeta,
} from "../lib/chatApi";
import { isFlowSettled, type PendingBubble, replayBubble } from "../lib/chatStatus";
import { formatTokens, formatUsd } from "../lib/cost";
import { DEMO_QUESTIONS, isDemo } from "../lib/demo";
import { deriveView } from "../lib/derive";
import { useHealth } from "../lib/health";
import { activePhase, type TimelinePhase } from "../lib/phases";
import { formatClock, formatRelative } from "../lib/time";
import { estimateInputCostUsd, estimateTokens } from "../lib/tokenize";
import { useChat } from "../store/useChat";
import { useHud } from "../store/useHud";
import { useSimulator } from "../store/useSimulator";

interface ChatPanelProps {
  // What the in-flight agent bubble shows, projected from the paced playhead (012):
  // a live stage status until the answer exists, then the streaming/whole answer.
  bubble: PendingBubble;
}

export function ChatPanel({ bubble }: ChatPanelProps) {
  const view = useChat((s) => s.view);

  // Load sessions (and open the most recent, or create one) on first mount.
  useEffect(() => {
    void useChat.getState().init();
  }, []);

  return view === "list" ? <ConversationList /> : <Thread bubble={bubble} />;
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

function ChevronDownIcon({ className }: IconProps) {
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
      data-testid="composer-agent-chevron"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// 045-composer-agent-selector: small "🤖" mark on the agent chip.
function BrainIcon({ className }: IconProps) {
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
      <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.6V16a3 3 0 0 0 4 2.83V20a2 2 0 0 0 4 0V4a2 2 0 0 0-4 0z" />
      <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 1 5.6V16a3 3 0 0 1-4 2.83" />
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
          <span
            title={session.title || t.chat.untitled}
            className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-ink)]"
          >
            {session.title || t.chat.untitled}
          </span>
          <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--color-faint)]">
            {formatRelative(session.updated_at, lang)}
          </span>
        </span>
        <span className="mt-0.5 block text-[11px] text-[var(--color-muted)]">
          {t.chat.messages(session.message_count ?? 0)}
        </span>
      </span>
    </button>
  );
}

// --- open thread ------------------------------------------------------------

function Thread({ bubble }: { bubble: PendingBubble }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const messages = useChat((s) => s.messages);
  // 040-message-attachments: chips in the composer = pendingDocuments (next
  // send); chips on a sent user bubble = message.documents (persisted join).
  const pendingDocuments = useChat((s) => s.pendingDocuments);
  const pending = useChat((s) => s.pending);
  // The optimistic-bubble chip snapshot (captured at send time).
  const pendingAttachments = useChat((s) => s.pendingAttachments);
  const input = useChat((s) => s.input);
  const sending = useChat((s) => s.sending);
  const cancelled = useChat((s) => s.cancelled);
  // 022-message-trace-link: revisit a past turn's trace on the canvas.
  const selectMessage = useChat((s) => s.selectMessage);
  const loadedTraceId = useChat((s) => s.loadedTraceId);
  const traceExpired = useChat((s) => s.traceExpired);
  const error = useChat((s) => s.error);
  const setInput = useChat((s) => s.setInput);
  const send = useChat((s) => s.send);
  const showList = useChat((s) => s.showList);
  const newChat = useChat((s) => s.newChat);
  const activeId = useChat((s) => s.activeSessionId);
  const sessions = useChat((s) => s.sessions);

  // 050-replay-bubble-streaming: the loaded turn's bubble follows the paced
  // playhead (status → streaming answer → settled persisted text). Reads the
  // same simulator state the canvas does so the chat + canvas walk in lockstep
  // under step/replay. Re-derives `view` and `phase` here (cheap, pure) rather
  // than threading them down from App — App already passes `bubble`; this is
  // the parallel projection scoped to the loaded message.
  const events = useSimulator((s) => s.events);
  const cursor = useSimulator((s) => s.cursor);
  const simStatus = useSimulator((s) => s.status);
  const playing = useSimulator((s) => s.playing);
  const replayView = useMemo(() => deriveView(events, cursor), [events, cursor]);
  const replayPhase = useMemo(() => activePhase(events, cursor), [events, cursor]);
  const replayIsSettled = isFlowSettled({ events, cursor, status: simStatus, playing });
  // `traceExpired` short-circuits to the persisted answer (no events to project
  // from); same fall-through `replayBubble` does when `hasEvents=false`.
  const replayHasEvents = !traceExpired && events.length > 0;

  const activeSession = sessions.find((s) => s.id === activeId);
  const activeTitle = activeSession?.title;
  // 043-persisted-agent: the conversation's agent name labels every assistant
  // bubble (replaces the generic "Agent" / "Agente"). Empty/missing ⇒ fallback
  // to the bilingual default inside AgentMessage.
  const agentName = activeSession?.agent?.name ?? null;

  // Re-scroll on any meaningful change to the live bubble (stage label or answer).
  const bubbleKey = bubble.kind === "answer" ? bubble.text : `status:${bubble.phase}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending, bubbleKey]);

  // 018-cumulative-hud: re-derive the running totals whenever the active
  // conversation's turns change — a turn completed (messages reloaded) or we
  // switched conversations (a different message set). Scoped to these messages,
  // so the HUD always reflects only the active conversation.
  useEffect(() => {
    void useHud.getState().recompute(messages);
  }, [messages]);

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
        <h2
          title={activeTitle || t.chat.untitled}
          className="min-w-0 flex-1 truncate text-center text-[13px] font-semibold text-[var(--color-ink)]"
        >
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

      <ConversationHud />

      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {empty ? (
          <EmptyThread t={t} />
        ) : (
          <div className="space-y-4 px-3 py-4">
            {messages.map((m) => (
              <Exchange
                key={m.id}
                message={m}
                t={t}
                lang={lang}
                onSelect={() => void selectMessage(m.id)}
                active={m.id === loadedTraceId}
                agentName={agentName}
                // 050-replay-bubble-streaming: the canvas projection scoped to
                // this turn. Only the active (loaded) bubble consumes it —
                // others render `message.answer` verbatim regardless.
                replayView={replayView}
                replayPhase={replayPhase}
                replayHasEvents={replayHasEvents}
                replayIsSettled={replayIsSettled}
              />
            ))}
            {pending && (
              <div className="space-y-3">
                <UserMessage
                  text={pending}
                  documents={pendingAttachments}
                  t={t}
                  lang={lang}
                  ts={null}
                />
                <AgentMessage t={t} lang={lang} ts={null} agentName={agentName}>
                  <BubbleBody bubble={bubble} t={t} />
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

      {/* 016-cancel-stream: a non-error note after the user stops a run. The
          partial trace stays on the canvas (replayable); this just says why the
          answer never arrived. Transient — cleared on the next send / switch. */}
      {cancelled && !sending && (
        <p className="mx-3 mb-1.5 rounded-lg bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--color-muted)]">
          ⏹ {t.chat.cancelled}
        </p>
      )}

      {/* 022-message-trace-link: the latest/selected turn's trace was evicted from
          the bounded in-memory store — explain it, no crash; the message stays
          clickable so a still-cached turn can be loaded instead. */}
      {traceExpired && !sending && (
        <p className="mx-3 mb-1.5 rounded-lg bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--color-muted)]">
          ⏳ {t.trace.expired}
        </p>
      )}

      {/* 045-composer-agent-selector: transient note after a stale-tab 409.
          Auto-clears via the store's setAgentLockedNote timeout. */}
      <AgentLockNote />

      <Composer
        input={input}
        sending={sending}
        pendingDocuments={pendingDocuments}
        onChange={setInput}
        onSend={() => void send()}
        t={t}
      />
    </div>
  );
}

function EmptyThread({ t }: { t: Strings }) {
  const send = useChat((s) => s.send);
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
            onClick={() => void send(ex)}
            className="truncate rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-left text-[12px] text-[var(--color-text-soft)] transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] hover:text-[var(--color-sky-soft)]"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function Exchange({
  message,
  t,
  lang,
  onSelect,
  active,
  agentName,
  replayView,
  replayPhase,
  replayHasEvents,
  replayIsSettled,
}: {
  message: ChatMessage;
  t: Strings;
  lang: Lang;
  // 022-message-trace-link: clicking the agent bubble loads this turn's trace
  // onto the canvas; `active` marks the turn currently shown there.
  onSelect: () => void;
  active: boolean;
  // 043-persisted-agent: label every assistant bubble with the conversation's
  // agent name (falls back to the localized "Agent" / "Agente" inside).
  agentName?: string | null;
  // 050-replay-bubble-streaming: the canvas projection inputs, scoped to this
  // turn. Consumed only when this turn is the active (loaded) one and the
  // simulator hasn't settled at the tail; otherwise we render `message.answer`
  // verbatim, byte-for-byte identical to today's frame.
  replayView: ReturnType<typeof deriveView>;
  replayPhase: TimelinePhase | null;
  replayHasEvents: boolean;
  replayIsSettled: boolean;
}) {
  // The replay branch fires only when (a) this is the loaded turn AND (b) the
  // simulator is mid-trace (events to project from + not settled at the tail).
  // `replayBubble` itself handles the no-events / settled fall-through, but we
  // gate the call site so non-loaded turns never re-derive on every cursor tick.
  const replayActive = active && replayHasEvents && !replayIsSettled;
  return (
    <div className="space-y-3">
      <UserMessage
        text={message.message}
        // 040-message-attachments: the chip row, if any, lives on the user
        // bubble (the persisted turn that introduced the files).
        documents={message.documents}
        t={t}
        lang={lang}
        ts={message.created_at}
      />
      <AgentMessage
        t={t}
        lang={lang}
        ts={message.created_at}
        agentName={agentName}
        below={
          <>
            {/* 027-skills: which skills the agent loaded for this turn. */}
            {message.skills.length > 0 && <SkillsBadge skills={message.skills} t={t} />}
            {message.chunks.length > 0 && <Sources chunks={message.chunks} t={t} />}
          </>
        }
        onClick={onSelect}
        title={active ? t.trace.loaded : t.trace.clickToLoad}
        active={active}
      >
        {replayActive ? (
          <BubbleBody
            bubble={replayBubble(replayView, replayPhase, {
              hasEvents: replayHasEvents,
              isSettled: replayIsSettled,
              persistedAnswer: message.answer,
            })}
            t={t}
          />
        ) : (
          message.answer
        )}
      </AgentMessage>
    </div>
  );
}

// 050-replay-bubble-streaming — shared renderer for a `PendingBubble`. Used by
// (a) the live optimistic in-flight bubble (012, while `useChat.pending` is
// set) and (b) the loaded turn's bubble during replay. Same DOM either way —
// the projection helper picks which state to show.
function BubbleBody({ bubble, t }: { bubble: PendingBubble; t: Strings }) {
  if (bubble.kind === "answer") {
    return (
      <>
        {bubble.text}
        {bubble.streaming && <span className="caret">▍</span>}
      </>
    );
  }
  return <StageStatus phase={bubble.phase} t={t} />;
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
  documents,
  t,
  lang,
  ts,
}: {
  text: string;
  // 040-message-attachments: docs the user attached to this specific turn
  // (the composer's pending list at send time). Omitted/empty = no chip row.
  documents?: DocumentMeta[];
  t: Strings;
  lang: Lang;
  ts: number | null;
}) {
  const chips = documents ?? [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-end gap-1"
    >
      {chips.length > 0 && (
        <div
          className="flex max-w-[85%] flex-wrap justify-end gap-1.5"
          title={t.chat.attachedToThisMessage}
        >
          {chips.map((d) => (
            <MessageAttachmentChip key={d.document_id} doc={d} />
          ))}
        </div>
      )}
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--color-sky-strong)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-on-accent)] shadow-sm">
        {text}
      </div>
      <span className="pr-1">
        <Stamp ts={ts} lang={lang} t={t} />
      </span>
    </motion.div>
  );
}

// 040-message-attachments: a committed chip on a sent user message. Mirrors
// the composer's DocChip layout (icon · filename · chunk count) but has no
// remove control — the file's link to this turn is the persisted answer to
// "which message introduced it", and removing it would break that audit.
function MessageAttachmentChip({ doc }: { doc: DocumentMeta }) {
  return (
    <span
      data-testid="attached-doc-chip"
      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-[11px]"
    >
      <FileIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-ok-soft)]" />
      <span className="min-w-0 max-w-[130px] truncate text-[var(--color-ink)]">{doc.filename}</span>
      <span className="shrink-0 font-mono text-[9.5px] text-[var(--color-muted)]">
        {doc.chunk_count}
      </span>
    </span>
  );
}

function AgentMessage({
  t,
  lang,
  ts,
  children,
  below,
  onClick,
  title,
  active = false,
  agentName,
}: {
  t: Strings;
  lang: Lang;
  ts: number | null;
  children: ReactNode;
  below?: ReactNode;
  // 022-message-trace-link: when set, the bubble loads this turn's trace on click;
  // `active` highlights the turn currently shown on the canvas.
  onClick?: () => void;
  title?: string;
  active?: boolean;
  // 043-persisted-agent: the conversation's agent name (replaces the generic
  // "Agent" / "Agente" label on the assistant bubble). Falls back to the
  // bilingual default when the session hasn't loaded its agent yet.
  agentName?: string | null;
}) {
  const clickable = Boolean(onClick);
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
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">
            {agentName?.trim() || t.chat.agent}
          </span>
          <Stamp ts={ts} lang={lang} t={t} />
        </div>
        <div
          onClick={onClick}
          title={title}
          role={clickable ? "button" : undefined}
          className={`max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border bg-[var(--color-panel-2)] px-3 py-2 text-[13px] leading-relaxed text-[var(--color-ink)] ${
            clickable
              ? "cursor-pointer transition hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)]"
              : ""
          } ${
            active
              ? "border-[color-mix(in_srgb,var(--color-sky)_70%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-sky)_28%,transparent)]"
              : "border-[var(--color-line)]"
          }`}
        >
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

// 012-chat-flow-sync: while the flow runs (before the answer exists), the bubble
// names the current pipeline stage, in step with the lit station on the canvas —
// the typing dots plus the stage label (or the generic "Thinking…" fallback).
function StageStatus({ phase, t }: { phase: TimelinePhase | null; t: Strings }) {
  const label = phase ? t.chat.stage[phase] : t.chat.thinking;
  return (
    <span className="inline-flex items-center gap-2 text-[var(--color-muted)]">
      <TypingDots />
      <span className="text-[12.5px]">{label}</span>
    </span>
  );
}

// 027-skills: a compact badge on the answer footer — a spark + the count of
// skills the agent applied, with a hover popover listing them (mirrors the
// reference image). The set is `message.skills`, persisted server-side, so it
// survives reload/replay; `lib/skills.appliedSkills` derives the same set live.
function SkillsBadge({ skills, t }: { skills: string[]; t: Strings }) {
  return (
    <div className="group relative mt-2 inline-flex">
      <button
        type="button"
        aria-label={t.chat.skillsBadge}
        className="inline-flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-2 py-0.5 text-[10.5px] font-semibold text-[var(--color-indigo-soft)] transition hover:brightness-110"
      >
        <SparkIcon className="h-3 w-3" />
        {skills.length}
      </button>
      <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-max max-w-[240px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-2 shadow-xl group-hover:block">
        <div className="mb-1 text-[10.5px] font-semibold text-[var(--color-ink)]">
          {t.chat.skillsApplied(skills.length)}
        </div>
        <ul className="space-y-0.5">
          {skills.map((s) => (
            <li key={s} className="font-mono text-[10px] leading-snug text-[var(--color-muted)]">
              • {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
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
  pendingDocuments,
  onChange,
  onSend,
  t,
}: {
  input: string;
  sending: boolean;
  // 040-message-attachments: composer-staged chips that will travel with the
  // NEXT send. Each chip is removable here (the file/blob/vectors are wiped
  // by the existing delete endpoint); once the user sends, the chip moves to
  // the user bubble (no remove control there).
  pendingDocuments: DocumentMeta[];
  onChange: (value: string) => void;
  onSend: () => void;
  t: Strings;
}) {
  const uploading = useChat((s) => s.uploading);
  const uploadPdf = useChat((s) => s.uploadPdf);
  const removeDocument = useChat((s) => s.removeDocument);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a cap, the way modern composers do.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const canSend = input.trim().length > 0 && !sending;

  // 058-online-demo-mode: the backend-less showcase locks free text + upload and
  // offers only the curated sample questions (each replays a real captured run).
  if (isDemo()) return <DemoComposer t={t} />;

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
        {pendingDocuments.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            <span className="px-1 text-[10.5px] text-[var(--color-faint)]">
              {t.chat.pendingAttachmentsHint}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {pendingDocuments.map((d) => (
                <DocChip
                  key={d.document_id}
                  doc={d}
                  onRemove={() => void removeDocument(d.document_id)}
                  t={t}
                />
              ))}
            </div>
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
          placeholder={t.chat.placeholder}
          disabled={sending}
          className="block max-h-[140px] w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-label)] disabled:opacity-50"
        />

        <div className="mt-1 flex items-center gap-2">
          {/* 045-composer-agent-selector: agent chip + dropdown, to the LEFT
              of 📎. Locks itself when the conversation has any persisted
              message (one agent per chat — to swap, start a new chat). */}
          <ComposerAgentChip t={t} />

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
            style={{ color: "var(--color-faint)" }}
          >
            {uploading ? (
              t.chat.uploading
            ) : input.trim() ? (
              <PreSendHint text={input} t={t} />
            ) : (
              t.chat.enterToSend
            )}
          </span>

          {/* 016-cancel-stream: stop control, present only while a run streams. */}
          <CancelButton />

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

// 058-online-demo-mode: the demo composer. No free text, no upload — a disabled
// input communicates "pick a sample" and the curated questions sit below as
// one-click chips; clicking one replays its captured trace (real run, no backend).
function DemoComposer({ t }: { t: Strings }) {
  const send = useChat((s) => s.send);
  const sending = useChat((s) => s.sending);
  const lang = useLang((s) => s.lang);
  return (
    <div className="px-3 pb-3 pt-1">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 shadow-sm">
        <textarea
          rows={1}
          disabled
          readOnly
          value=""
          placeholder={t.demo.composerHint}
          aria-label={t.demo.composerHint}
          className="block w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-[var(--color-ink)] outline-none placeholder:text-[var(--color-label)] disabled:opacity-50"
        />
        <div className="mt-1.5 flex flex-col gap-1.5">
          <span className="px-1 text-[10.5px] uppercase tracking-wide text-[var(--color-faint)]">
            {t.demo.sampleBarLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_QUESTIONS.map((q) => (
              <button
                key={q.id}
                type="button"
                disabled={sending}
                onClick={() => void send(q.label[lang])}
                className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-left text-[12px] text-[var(--color-text-soft)] transition enabled:hover:border-[color-mix(in_srgb,var(--color-sky)_55%,transparent)] enabled:hover:text-[var(--color-sky-soft)] disabled:opacity-40"
              >
                {q.label[lang]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 018-cumulative-hud: the pre-send estimate of the next turn's input size. It
// encodes the composed input with the REAL tokenizer (js-tiktoken, loaded lazily
// on first keystroke) and prices it at the active model's input rate. Explicitly
// an ESTIMATE — the real, billed prompt is assembled server-side and reported in
// the trace; the tokenizer in play is surfaced on hover.
function PreSendHint({ text, t }: { text: string; t: Strings }) {
  const model = useHealth((s) => s.llmModel);
  const [tokens, setTokens] = useState(0);

  useEffect(() => {
    let alive = true;
    void estimateTokens(text).then((n) => {
      if (alive) setTokens(n);
    });
    return () => {
      alive = false;
    };
  }, [text]);

  const cost = estimateInputCostUsd(tokens, model);
  return (
    <span title={t.glossary.tiktoken} className="cursor-help">
      ≈ {formatTokens(tokens)} {t.hud.tokens} · ≈ {formatUsd(cost)} · {t.hud.estimate}
    </span>
  );
}

function DocChip({ doc, onRemove, t }: { doc: DocumentMeta; onRemove: () => void; t: Strings }) {
  return (
    <span
      data-testid="pending-doc-chip"
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

// 045-composer-agent-selector: transient "agent locked" note after a stale-tab
// 409. Auto-cleared by the store after a short timeout.
function AgentLockNote() {
  const note = useChat((s) => s.agentLockedNote);
  if (!note) return null;
  return (
    <p className="mx-3 mb-1.5 rounded-lg bg-[var(--color-panel-2)] px-2.5 py-1.5 text-[11px] text-[var(--color-muted)]">
      🔒 {note}
    </p>
  );
}

// 045-composer-agent-selector: mini agent picker (chip + dropdown) that sits
// to the LEFT of 📎 in the composer toolbar. The chip shows the active agent's
// name; clicking opens a floating menu listing every agent in the catalog
// (lazy-loaded on first open). Locks itself the moment the active conversation
// has at least one persisted turn — locked state renders disabled, hides the
// chevron, and surfaces the lock tooltip. The 044 dialog catalog sidebar
// follows the same lock (see `AgentCatalogSidebar.tsx`).
function ComposerAgentChip({ t }: { t: Strings }) {
  const activeSessionId = useChat((s) => s.activeSessionId);
  const session = useChat((s) =>
    activeSessionId ? s.sessions.find((row) => row.id === activeSessionId) : null,
  );
  // 045 draft fix: in a draft (no `activeSessionId`), there is no session row
  // to read the agent from yet. Fall back to the draftAgent seeded by `init` /
  // `newChat` (the catalog default) so the chip never goes blank and the user
  // can switch it before the first send.
  const draftAgent = useChat((s) => s.draftAgent);
  const replaceSession = useChat((s) => s.replaceSession);
  const setDraftAgent = useChat((s) => s.setDraftAgent);
  const setLockedNote = useChat((s) => s.setAgentLockedNote);

  const agent = session?.agent ?? draftAgent;
  const messageCount = session?.message_count ?? 0;
  // A draft never has messages yet, so it can never be locked. The lock only
  // bites once the session is persisted and a turn has landed.
  const locked = messageCount > 0;

  // Catalog is lazy-loaded on first menu open and refreshed on each subsequent
  // open so a new agent created elsewhere (044 dialog) shows up here too.
  const [menuOpen, setMenuOpen] = useState(false);
  const [catalog, setCatalog] = useState<AgentMeta[] | null>(null);
  const [busy, setBusy] = useState(false);

  const name = agent?.name ?? "—";
  const tooltip = locked
    ? t.chat.agentSelector.locked
    : t.chat.agentSelector.ariaLabel(name);

  async function openMenu() {
    if (locked || busy) return;
    setMenuOpen(true);
    try {
      setCatalog(await listAgents());
    } catch {
      setCatalog([]);
    }
  }

  async function onSelect(nextId: string) {
    // 045 draft fix: in a draft (no `activeSessionId`), nothing to PATCH yet —
    // remember the choice locally so the chip reflects it; `ensureSession`
    // will switch the freshly-created session to this agent on the first send.
    // Done BEFORE the same-id check so the draft path still works during the
    // brief window where the catalog has loaded but `draftAgent` hasn't been
    // seeded yet (init race).
    if (!activeSessionId) {
      const picked = (catalog ?? []).find((a) => a.id === nextId) ?? null;
      if (picked) setDraftAgent(picked);
      setMenuOpen(false);
      return;
    }
    if (!agent || nextId === agent.id) {
      setMenuOpen(false);
      return;
    }
    setBusy(true);
    try {
      const updated = await setSessionAgent(activeSessionId, nextId);
      if (updated) replaceSession(updated);
      setMenuOpen(false);
    } catch (err) {
      // 045 AC12 — server-side lock fired (stale tab). Don't mutate the
      // session's agent; surface the lock and refresh sessions so the chip
      // flips locked on the next render.
      if (isAgentLockedError(err)) {
        setLockedNote(t.chat.agentSelector.lockedInlineNote);
        await useChat.getState().showList();
      }
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  }

  // The button itself: text label + chevron when unlocked, no chevron when
  // locked. Native `disabled` blocks clicks correctly; `title=` shows the
  // bilingual tooltip on hover/focus.
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => void openMenu()}
        disabled={locked || busy}
        aria-disabled={locked || undefined}
        aria-label={
          locked
            ? t.chat.agentSelector.lockedAriaLabel(name)
            : t.chat.agentSelector.ariaLabel(name)
        }
        title={tooltip}
        data-testid="composer-agent-chip"
        className="inline-flex h-8 max-w-[160px] items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2 text-[11.5px] text-[var(--color-ink)] transition enabled:hover:bg-[var(--color-panel-2)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <BrainIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-sky-strong)]" />
        <span className="min-w-0 truncate">{name}</span>
        {!locked && <ChevronDownIcon className="h-3 w-3 shrink-0 opacity-60" />}
      </button>

      {menuOpen && !locked && (
        <div
          data-testid="composer-agent-menu"
          role="menu"
          className="absolute bottom-full left-0 mb-1 min-w-[180px] max-w-[260px] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] py-1 text-[12px] shadow-lg"
        >
          <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            {t.chat.agentSelector.menuHeading}
          </div>
          {catalog === null ? (
            <div className="px-2.5 py-1.5 text-[var(--color-muted)]">…</div>
          ) : catalog.length === 0 ? (
            <div className="px-2.5 py-1.5 italic text-[var(--color-label)]">—</div>
          ) : (
            catalog.map((a) => {
              const isActive = a.id === agent?.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  onClick={() => void onSelect(a.id)}
                  disabled={busy}
                  data-testid={`composer-agent-menu-row-${a.id}`}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left transition enabled:hover:bg-[var(--color-panel-2)] disabled:opacity-50"
                  style={{
                    background: isActive ? "var(--color-panel-2)" : "transparent",
                  }}
                >
                  <BrainIcon className="h-3.5 w-3.5 shrink-0 text-[var(--color-sky-strong)]" />
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  {a.is_default && (
                    <span
                      className="shrink-0 rounded border border-[var(--color-line)] px-1 py-px font-mono text-[8.5px] uppercase text-[var(--color-muted)]"
                      title={a.name}
                    >
                      ★
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </span>
  );
}
