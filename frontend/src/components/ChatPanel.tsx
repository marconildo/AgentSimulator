import { motion } from "framer-motion";

import { useT } from "../i18n";
import { useSimulator } from "../store/useSimulator";

interface ChatPanelProps {
  answer: string;
}

export function ChatPanel({ answer }: ChatPanelProps) {
  const t = useT();
  const input = useSimulator((s) => s.input);
  const status = useSimulator((s) => s.status);
  const error = useSimulator((s) => s.error);
  const setInput = useSimulator((s) => s.setInput);
  const send = useSimulator((s) => s.send);

  const streaming = status === "streaming";

  const runExample = (text: string) => {
    setInput(text);
    // send() reads input from the store on the next tick.
    setTimeout(() => useSimulator.getState().send(), 0);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-[var(--color-ink)]">
          {t.chat.title}
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">{t.chat.subtitle}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-col gap-2"
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
          rows={3}
          placeholder={t.chat.placeholder}
          disabled={streaming}
          className="resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[#5b688c] focus:border-sky-400/60"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-[#04122a] transition enabled:hover:bg-sky-400 disabled:opacity-40"
        >
          {streaming ? t.chat.running : t.chat.send}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {t.chat.examples.map((ex) => (
          <button
            key={ex}
            onClick={() => runExample(ex)}
            disabled={streaming}
            className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-muted)] transition enabled:hover:border-sky-400/60 enabled:hover:text-sky-300 disabled:opacity-40"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          {t.chat.answer}
        </div>
        {error ? (
          <p className="text-sm text-rose-300">⚠ {error}</p>
        ) : answer ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)]"
          >
            {answer}
            {streaming && <span className="caret">▍</span>}
          </motion.p>
        ) : (
          <p className="text-sm text-[#5b688c]">
            {streaming ? t.chat.thinking : t.chat.answerHint}
          </p>
        )}
      </div>
    </div>
  );
}
