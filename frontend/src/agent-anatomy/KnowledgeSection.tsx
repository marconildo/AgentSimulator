// 042-agent-anatomy · 📚 Knowledge base.
//
// Two subsections:
//   • **Corpus** — read-only system-shipped MD files (GET /api/corpus).
//   • **Uploads** — per-conversation user uploads (GET/POST/DELETE
//     /api/sessions/{id}/documents — the existing 002/040 endpoints).

import { useEffect, useRef, useState } from "react";

import { useT } from "../i18n";
import {
  deleteDocument,
  getCorpus,
  listDocuments,
  uploadDocument,
  type CorpusFile,
  type DocumentMeta,
} from "../lib/chatApi";
import { useChat } from "../store/useChat";

export function KnowledgeSection() {
  const t = useT().agentAnatomy.knowledge;
  const sessionId = useChat((c) => c.activeSessionId);

  const [corpus, setCorpus] = useState<CorpusFile[] | null>(null);
  const [docs, setDocs] = useState<DocumentMeta[] | null>(null);
  const [busy, setBusy] = useState(false);

  // Corpus is cached app-wide (getCorpus memoizes).
  useEffect(() => {
    getCorpus().then((c) => setCorpus(c.files)).catch(() => setCorpus([]));
  }, []);

  // Per-session uploads — refetch on conversation change.
  useEffect(() => {
    if (!sessionId) {
      setDocs([]);
      return;
    }
    listDocuments(sessionId).then(setDocs).catch(() => setDocs([]));
  }, [sessionId]);

  const fileInput = useRef<HTMLInputElement | null>(null);

  async function onPick(file: File) {
    if (!sessionId) return;
    setBusy(true);
    try {
      await uploadDocument(sessionId, file, {
        onTrace: () => {},
        onDone: (ev) => {
          // Append the new doc optimistically; a follow-up listDocuments would
          // also yield it, but we avoid that round-trip with the done frame.
          setDocs((cur) => [
            ...(cur ?? []),
            {
              document_id: ev.document_id,
              filename: ev.filename,
              chunk_count: ev.chunk_count,
              created_at: Date.now() / 1000,
            },
          ]);
        },
      });
    } catch {
      // Surface upload errors quietly here; the composer is the canonical
      // upload affordance (which has full error UX).
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(documentId: string) {
    if (!sessionId) return;
    await deleteDocument(sessionId, documentId).catch(() => {});
    setDocs((cur) => (cur ?? []).filter((d) => d.document_id !== documentId));
  }

  return (
    <section data-anatomy-section="knowledge" className="space-y-3">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>

      {/* Corpus (read-only) */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-ink)]">
          <span aria-hidden>🔒</span>
          {t.corpus}
        </div>
        <p className="mb-1.5 text-[10.5px] leading-snug text-[var(--color-label)]">
          {t.corpusLockHint}
        </p>
        <ul className="flex flex-col gap-1">
          {corpus === null ? (
            <li className="text-[11px] text-[var(--color-muted)]">{t.loading}</li>
          ) : (
            corpus.map((f) => (
              <li
                key={f.filename}
                className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[12px] text-[var(--color-ink)]">{f.filename}</span>
                  <span className="font-mono text-[10px] text-[var(--color-muted)]">
                    {f.size_bytes.toLocaleString()} B
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[var(--color-muted)]">
                  {f.preview}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Uploads (CRUD) */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{t.uploads}</span>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={!sessionId || busy}
            data-testid="agent-anatomy-add-document"
            className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[10.5px] text-[var(--color-ink)] transition hover:bg-[var(--color-panel-2)] disabled:opacity-50"
          >
            + {t.add}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              if (fileInput.current) fileInput.current.value = "";
            }}
          />
        </div>
        {docs === null || docs.length === 0 ? (
          <p className="text-[11px] italic text-[var(--color-label)]">{t.uploadsEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {docs.map((d) => (
              <li
                key={d.document_id}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px]"
              >
                <span className="truncate font-mono text-[12px] text-[var(--color-ink)]">
                  {d.filename}
                </span>
                <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">
                  {d.chunk_count} chunks
                </span>
                <button
                  onClick={() => onRemove(d.document_id)}
                  data-testid={`agent-anatomy-remove-${d.document_id}`}
                  aria-label={t.remove}
                  className="rounded-md border border-[var(--color-line)] px-1.5 py-px text-[10px] text-[var(--color-muted)] transition hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
