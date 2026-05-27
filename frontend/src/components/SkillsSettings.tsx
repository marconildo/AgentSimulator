import { useEffect, useState } from "react";

import { useT } from "../i18n";
import {
  ApiError,
  createSkill,
  deleteSkill,
  listSkills,
  updateSkill,
  type Skill,
} from "../lib/chatApi";

// 027-skills: the global skill-catalog CRUD, hosted as a section in the ⚙️ Settings
// panel. A skill is {name, description, body}: the agent advertises name+description
// in its system prompt and loads the body on demand via the `load_skill` tool.
// Component-local state (list ↔ inline editor); the REST client does the work.

type Draft = { id: string | null; name: string; description: string; body: string };
const EMPTY: Draft = { id: null, name: "", description: "", body: "" };

const fieldClass =
  "w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2 text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]";

export function SkillsSettings() {
  const s = useT().settings.skills;
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null); // null = list view
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () =>
    listSkills()
      .then(setSkills)
      .catch(() => setSkills([]));
  useEffect(() => {
    void load();
  }, []);

  const startNew = () => {
    setErr(null);
    setDraft({ ...EMPTY });
  };
  const startEdit = (sk: Skill) => {
    setErr(null);
    setDraft({ id: sk.id, name: sk.name, description: sk.description, body: sk.body });
  };
  const cancel = () => {
    setErr(null);
    setDraft(null);
  };

  const save = async () => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      body: draft.body.trim(),
    };
    setBusy(true);
    setErr(null);
    try {
      if (draft.id) await updateSkill(draft.id, payload);
      else await createSkill(payload);
      await load();
      setDraft(null);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 409 ? s.nameTaken : s.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) {
      cancel();
      return;
    }
    setBusy(true);
    try {
      await deleteSkill(draft.id);
      await load();
      setDraft(null);
    } finally {
      setBusy(false);
    }
  };

  const canSave = Boolean(
    draft && draft.name.trim() && draft.description.trim() && draft.body.trim() && !busy,
  );

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-ink)]">
        <span aria-hidden>✨</span>
        {s.title}
      </div>
      <p className="mb-2 text-[10px] leading-snug text-[var(--color-muted)]">{s.hint}</p>

      {draft ? (
        <div className="space-y-1.5 rounded-lg border border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-panel)_60%,transparent)] p-2">
          <label className="block text-[10px] font-semibold text-[var(--color-ink)]">
            {s.name}
          </label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={s.namePlaceholder}
            maxLength={80}
            spellCheck={false}
            className={fieldClass}
          />
          <label className="block text-[10px] font-semibold text-[var(--color-ink)]">
            {s.description}
          </label>
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={s.descPlaceholder}
            maxLength={400}
            className={fieldClass}
          />
          <label className="block text-[10px] font-semibold text-[var(--color-ink)]">
            {s.body}
          </label>
          <textarea
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            placeholder={s.bodyPlaceholder}
            rows={5}
            maxLength={8000}
            className={`${fieldClass} resize-y font-mono text-[10.5px] leading-snug`}
          />

          {err && <p className="text-[10px] font-medium text-[var(--color-rose-soft)]">⚠ {err}</p>}

          <div className="flex gap-1.5 pt-0.5">
            <button
              onClick={() => void save()}
              disabled={!canSave}
              className="rounded-lg border border-[var(--color-accent)] px-2.5 py-1.5 text-[10.5px] font-semibold text-[var(--color-indigo-soft)] transition disabled:opacity-50"
            >
              {s.save}
            </button>
            {draft.id && (
              <button
                onClick={() => void remove()}
                disabled={busy}
                className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[10.5px] text-[var(--color-rose-soft)] transition disabled:opacity-50"
              >
                {s.delete}
              </button>
            )}
            <button
              onClick={cancel}
              disabled={busy}
              className="ml-auto rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[10.5px] text-[var(--color-muted)] transition disabled:opacity-50"
            >
              {s.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills && skills.length === 0 && (
            <p className="px-0.5 text-[10.5px] text-[var(--color-label)]">{s.empty}</p>
          )}
          {skills?.map((sk) => (
            <button
              key={sk.id}
              onClick={() => startEdit(sk)}
              title={sk.description}
              className="flex w-full items-center gap-2 rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-left text-[11px] text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{sk.name}</span>
              <span className="shrink-0 text-[9.5px] text-[var(--color-muted)]">✎</span>
            </button>
          ))}
          <button
            onClick={startNew}
            className="w-full rounded-lg border border-dashed border-[var(--color-line)] px-2.5 py-1.5 text-[10.5px] font-semibold text-[var(--color-indigo-soft)] transition hover:border-[var(--color-accent)]"
          >
            + {s.new}
          </button>
        </div>
      )}
    </div>
  );
}
