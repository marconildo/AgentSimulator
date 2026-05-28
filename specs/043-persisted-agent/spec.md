# Spec: Persisted Agent — the agent becomes a real, saved entity per conversation

| | |
|---|---|
| **ID** | 043-persisted-agent |
| **Status** | done · *partially superseded by 044-shared-agent-catalog* |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> ⚠️ **Direction correction — read this first.** Two of the headline invariants
> below were **deliberately reverted** by [044-shared-agent-catalog](../044-shared-agent-catalog/spec.md)
> on 2026-05-28, the day this spec shipped, after the user reported that the
> 1:1 model was the wrong mental model. The 043 schema (the `agents` table,
> the `sessions.agent_id` FK, the live-edit dialog flow, the persisted
> default seed, the chat-bubble name, the `PATCH /api/agents/{id}` endpoint)
> all stay — what changed is the relationship cardinality and lifecycle:
>
> - **Clone-on-create is GONE.** `POST /api/sessions` no longer clones the
>   default agent into a fresh row; it **links** the session to the existing
>   default. Sessions now share the same agent row (N sessions : 1 agent).
> - **Delete-session no longer cascades to the agent.** The agent survives;
>   the catalog is the single owner of agent lifecycle.
> - The 044 migration (gated by `PRAGMA user_version = 1`) drops every
>   `is_default=0` row this spec created and re-points every session to the
>   default.
>
> See `specs/044-shared-agent-catalog/spec.md` for the new contract.
> The Goals/AC text below is kept verbatim as a historical record of what
> 043 originally shipped; everything *except* the clone semantics and the
> delete-session cascade is still in force.

> Follow-up to 042-agent-anatomy. The Agent Anatomy dialog already exposed the
> seven items that compose an agent, but four of them (system prompt, agent
> prompt, model, enabled tools) lived only in an **in-memory** Zustand store —
> they survived navigation but were lost on reload. This spec promotes the
> agent to a **real, SQLite-persisted entity** with its own table and a 1:1
> link to each conversation, so edits survive forever and the chat reflects the
> agent's name. The dialog stays live-edit; nothing in the request protocol is
> removed (overrides still work) — the **persistence is now the source of truth**.

## Problem / motivation

Spec 042 introduced the right *visual* model: name, two prompt layers, model,
tools, knowledge, skills — all in one dialog opened from the Agent station.
But the *storage* model lagged behind:

- Only the **name** persisted (in `sessions.agent_name`, added by 042). The
  prompts, model and tool selection lived in `useExperiment.byConv[conv]` —
  a Zustand slice cleared on reload.
- A user testing the feature reported the natural symptom: *"I edited the
  agent's name and when I left the dialog it didn't save."* The bug behind
  that specific report (a debounced PATCH cancelled by the unmount cleanup)
  is fixed by a small TDD regression. But the underlying mental model — *"I
  edited my agent, I expect it to be there next time I open the app"* — is
  what this spec addresses end-to-end for **every** anatomy field.
- The chat bubble label is hard-coded to "Agent" / "Agente" (the i18n
  `t.chat.agent` string). Even when a user has named their agent, the
  conversation still reads "Agent". This breaks the illusion the dialog is
  selling.
- There is no notion of an agent *default* — a fresh conversation comes up
  with empty Identity (no name, no description), and the user has to "fill
  the forms" before the agent feels real.

This spec closes those four gaps by promoting the agent to its own table.

## Goals

- **Every field in the Agent Anatomy dialog persists in SQLite.** Name,
  description, system prompt, agent prompt, model, enabled tools — all
  survive reload. Knowledge / skills already persist.
- **Each conversation has its own agent.** No surprise edits to other
  conversations: a "clone-on-create" model means `create_session` makes a
  new `agents` row by cloning the default, and the session points to it.
  The default is never mutated; it stays the seed for future conversations.
- **A default agent exists.** Server-seeded on startup (idempotent): name
  *"Agent Simulator"*, a short description, the existing GUARDRAILS / role
  prompts, the configured model, and all tools enabled. Every new
  conversation inherits this exactly — no empty forms.
- **The chat shows the agent's name.** The assistant-side bubble's label
  reads the agent's `name` (falling back to the localized default *only*
  when the row is missing, which should not happen in practice).
- **Live-edit, no Save button.** The 042 UX stays. Edits debounce 500 ms
  and PATCH the agent row; an explicit blur or dialog close flushes any
  pending edit (per the 042 bug fix).
- **No new `Stage`. No protocol change to `TraceEvent`.** The request
  protocol still accepts the 006 request-level overrides for back-compat,
  but the FE no longer sends them — the agent's persisted values are
  loaded server-side from `sessions.agent_id → agents.*` before the run.

## Non-goals

- **No shared catalog of agents.** The future "pick from / save as" UX
  (the Lumis-style screenshot) is **deferred to spec 044**. This spec
  delivers 1:1 conversation:agent, which is the unambiguous model that
  matches "edit this agent without surprising other conversations".
- **No agent fork-on-edit semantics.** Because clone-on-create already
  guarantees per-conversation isolation, fork-on-edit would be redundant
  complexity.
- **No avatar picker.** The reference screenshots show one; the dialog
  has room for it but the simulator's didactic goal does not require it.
- **No agent versioning / history.** Edits overwrite in place. The trace
  history (each turn carries the prompt preview that was *actually*
  composed for that turn) is the audit log of "what the agent was at the
  time"; the agent row itself is the *current* shape.
- **No removal of the existing request-level overrides** in `ChatRequest`
  (`system_prompt`, `agent_prompt`, `model`, `enabled_tools`). Tests and
  programmatic callers still rely on them; the FE just stops sending them
  for the chat path because the server now reads from the agent row. A
  caller that does send them keeps the prior 006 semantics: they override
  the agent's persisted value for that one run.
- **No change to RAG retrieval / corpus / uploads / skills.** Knowledge
  Base + Skills already persist (corpus on disk, uploads in `documents` +
  Chroma, skills in `skills`). Those sections stay byte-for-byte.
- **No change to the request `top_k` slider.** It's a knob of *retrieval*
  for that one run, not an attribute of the agent's identity.
- **`useExperiment` keeps `simulateFailure` and `topK`.** Both are
  per-run experiment levers, not agent attributes.

## User-facing behavior

### A new conversation comes up "ready"

When the user clicks **New chat**, `POST /api/sessions` creates a session
**and** a fresh agent row by cloning the default. The Agent station's
header reads *"Agent Simulator"*; opening the dialog shows the seed prompts,
model and tool list — all editable, all already persisted. There is no
"empty form" state.

### Edits persist immediately

Each section continues to write through the same store hooks; the hooks
now call `PATCH /api/agents/{id}` (debounced 500 ms; flushed on blur and
on dialog close) instead of mutating the in-memory `useExperiment` slice.
Closing the dialog and reopening it later — even after a reload — shows
the saved values.

### The chat shows the agent's name

The assistant-side message header in the thread reads the conversation's
agent name (e.g. *"Hotel Analyst"* instead of *"Agent"*). On a fresh
conversation, this reads *"Agent Simulator"* because that's the default
the row was cloned from. The bilingual fallback (`t.chat.agent` =
*"Agent" / "Agente"*) is only used when the agent row is genuinely
missing — which the backend prevents by always creating one.

### Existing conversations get adopted, not erased

When the migration runs against a DB that has sessions but no `agents`
table, every existing session gets a freshly-cloned default agent (a new
agent row per session). Their content is the *current* server defaults
(the GUARDRAILS + role prompts), exactly as if the user had just created
those conversations today. No data is lost; no surprise prompt rewrites
for already-running conversations.

### What does NOT change

- The 042 dialog is the same. The seven sections, their layout, the
  bilingual strings, the ✕ / Esc close handlers, the ✏️ shortcut.
- The Knowledge Base section's behavior is unchanged (corpus + uploads).
- The Skills section is unchanged.
- The Settings page (041) still works; the `🧪 Experiment` section's
  system-prompt textarea is **deprecated** in this spec (now a thin link
  *"This lives in the Agent Anatomy dialog"* — the textarea is removed
  there to avoid two sources of truth for the same field).

## Acceptance criteria

> Tests use Vitest + RTL on the frontend and pytest on the backend.
> The protocol mirror stays in sync (§1). Backend tests assert structurally.

### Backend — schema, seed, endpoints

1. **AC1 — A new `agents` table exists.** Columns: `id TEXT PRIMARY KEY`,
   `name TEXT NOT NULL`, `description TEXT NOT NULL`, `system_prompt TEXT
   NOT NULL`, `agent_prompt TEXT NOT NULL`, `model TEXT NOT NULL`,
   `enabled_tools TEXT NOT NULL DEFAULT '[]'` (JSON; empty array = all on
   client-side; the value `null` is not used to keep the JSON cast safe),
   `is_default INTEGER NOT NULL DEFAULT 0`, `created_at REAL NOT NULL`,
   `updated_at REAL NOT NULL`. Migration is idempotent (re-runs are
   no-ops). Tested with `PRAGMA table_info(agents)`.

2. **AC2 — `sessions.agent_id TEXT` column exists** as a FK to `agents.id`.
   Forward-only migration. Existing rows are backfilled with a fresh
   per-session clone of the default agent. Tested with one fresh + one
   migrated session and asserting `agent_id` is non-null on both.

3. **AC3 — Default agent is seeded on startup.** A row with
   `is_default=1`, `name="Agent Simulator"`, a non-empty `description`,
   and `system_prompt = GUARDRAILS_PROMPT` / `agent_prompt = AGENT_PROMPT`
   / `model = settings.llm_model` / `enabled_tools = '[]'`. Idempotent
   (running seed twice yields one row). Tested by calling the seed twice
   and asserting `COUNT(*) WHERE is_default = 1 == 1`.

4. **AC4 — `POST /api/sessions` clones the default into a new agent.**
   After the call, `sessions.agent_id` is non-null and points to an agent
   row distinct from the default (its `is_default=0`). The cloned row's
   prompts/model/tools match the default's at clone time. Tested with one
   POST + one inspection of the resulting row.

5. **AC5 — Session-read endpoints include `agent` inline.** Both
   `GET /api/sessions` (list) and `GET /api/sessions/{id}` (single)
   return the agent inline as `{agent: {id, name, description, model,
   ...}}` — no extra round-trip. Tested by JSON-shape assertions.

6. **AC6 — `PATCH /api/agents/{id}`** accepts a partial body with any of
   `{name, description, system_prompt, agent_prompt, model, enabled_tools}`
   and returns the updated row. Bounds: name 1..60, description 0..240,
   prompts each ≤ 2000, model in the curated allowlist (`llm/models.py`),
   `enabled_tools` is a list of strings. Over-cap / unlisted-model ⇒ 422.
   404 on unknown id. Tested for each bound.

7. **AC7 — Editing one conversation's agent does NOT affect another.**
   Create sessions A + B; PATCH A's agent with new prompts; GET B's
   agent — its prompts are unchanged (the seed defaults). Tested with two
   sessions and a diff.

8. **AC8 — Deleting a session deletes its agent (cascade).** Wired by
   `ON DELETE CASCADE` on `sessions(agent_id) → agents(id)` — except for
   the default agent, which is preserved (the cascade triggers from
   `sessions` to `agents`, and the default has no incoming session row).
   Tested by creating a session, deleting it, asserting the cloned agent
   row is gone but the default remains.

9. **AC9 — The chat run reads the agent from the session.** When
   `POST /api/chat` runs and the request body omits `system_prompt`,
   `agent_prompt`, `model`, `enabled_tools`, the backend loads them from
   the session's agent row and composes the effective system /
   advertises the right tools / picks the right model. Tested with one
   `@pytest.mark.openai` happy path that PATCHes the agent prompt to a
   custom role and then asserts the trace's `llm.prompt.system` contains it.

10. **AC10 — Backwards-compat: when the request *does* include any
    override**, it wins for that turn (today's 006 semantics). The
    persisted agent row is untouched. Tested with two requests on the
    same session: one omits, one provides `system_prompt`; the second
    run's composed system uses the override, the first uses the agent.

11. **AC11 — `/api/data/clear` wipes agents too** (except the default,
    which is re-seeded). Counts reported include `agents_deleted`. Tested
    by creating a session (which creates an agent), clearing, asserting
    the row is gone and the default is back.

12. **AC12 — `sessions.agent_name` is removed** (the column added by
    042). Existing data is migrated into the agent row's `name`. The
    column drop is conditional (SQLite ALTER TABLE DROP works since
    3.35 — the test environment is on Python 3.12 / SQLite ≥ 3.35).
    Tested by `PRAGMA table_info(sessions)` not listing it.

### Frontend — store, dialog, chat

13. **AC13 — `useExperiment` no longer carries the four moved fields.**
    `systemPrompt`, `agentPrompt`, `model`, `enabledTools` are removed
    from `ConvExperiment`. The store keeps `topK` + `simulateFailure`
    (per-run experiment knobs, not agent attributes). Existing tests
    that referenced the moved fields are updated to read/write through
    the new agent API. Tested by `tsc --noEmit` (the type narrowing is
    enforced) and by the new section tests below.

14. **AC14 — Each section reads from and PATCHes the agent.**
    `SystemPromptSection`, `AgentPromptSection`, `ModelSection`,
    `ToolsSection`, `Identity` (Name) read from `session.agent.*` and
    persist via `patchAgent(agentId, { ... })`. Same 500 ms debounce as
    the 042 Identity fix, with the same flush-on-blur + flush-on-unmount.
    Tested per section.

15. **AC15 — The chat thread shows the agent's name.** The
    `ChatPanel`'s assistant-side message header reads
    `session.agent?.name` (fallback `t.chat.agent` only when missing).
    Tested by rendering a thread with a seeded agent named "Hotel
    Analyst" and asserting the bubble's header text.

16. **AC16 — A fresh conversation starts with the seed defaults
    visible.** After `New chat`, the Agent station header reads
    *"Agent Simulator"* (or the seed name in the active language) and
    opening the dialog shows the seed prompts, the configured model,
    and the full tools list pre-filled.

17. **AC17 — Reload preserves edits.** Edit the agent prompt to a known
    string, reload the page, reopen the dialog — the textarea shows
    that string. Tested by simulating a `listSessions` call after a
    PATCH and asserting the loaded session carries the edited agent.

18. **AC18 — Settings page (041) no longer shows the system prompt
    textarea.** The 🧪 Experiment section keeps the tools list, top-k
    slider, and simulate-failure selector; the system-prompt textarea
    is replaced by a one-line note + link directing the user to the
    Agent Anatomy dialog (en + pt).

19. **AC19 — Bilingual (§4).** Every new prose string (the "Saved"
    indicator if added, the seed agent name/description, the
    Settings → Anatomy redirect note) ships en + pt under
    `agentAnatomy.*` or the appropriate existing namespace.

20. **AC20 — TypeScript clean; protocol mirror in sync.**
    `tsc --noEmit` is green; the `SessionMeta` mirror gains
    `agent?: AgentRow`; `ChatRequestBody` (events.ts) is unchanged
    (overrides still allowed in the protocol, just not sent by the FE).
    No `Stage` / `Phase` change.

## Protocol / stage impact

- New/changed `Stage`(s): **none.**
- `TraceEvent` change (§1): **none.** The `frontend` END's
  `data.request` shape gains nothing — the FE just stops sending the 4
  moved fields, so they're absent on the echo. Backwards-compat path
  for callers that *do* send them is preserved.
- Mirror in `frontend/src/types/events.ts`: **none.**
- Station mapping (`stations.ts`): **unchanged.**
- Cloud map (§5): **unchanged.**
- New endpoints:
  - `PATCH /api/agents/{id}` — update agent fields
  - `GET /api/agents/{id}` (optional convenience — sessions include
    agent inline; this is for direct fetches if a future spec needs them)
- Modified endpoints:
  - `POST /api/sessions` — now also clones the default agent
  - `GET /api/sessions` / `GET /api/sessions/{id}` — include `agent` inline
  - `DELETE /api/sessions/{id}` — cascades to agent
  - `POST /api/data/clear` — clears agents (except default, which is
    re-seeded)
  - `POST /api/chat` — when request omits the 4 fields, loads them from
    the session's agent row
- Removed endpoints / columns:
  - `PATCH /api/sessions/{id}` — keeps shape but `agent_name` field is
    deprecated; new clients PATCH the agent instead. (Drop in a future
    spec once no callers remain.)
  - `sessions.agent_name` — dropped after migration backfills `agents.name`.

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Catalog model or 1:1?** → **1:1 (clone-on-create).** The catalog
  model is a separate, larger spec (044).
- [x] **Save button or live-edit?** → **Live-edit**, same as 042.
- [x] **Defaults from where?** → **From the `agents` table**, with a
  startup-seeded default row.
- [x] **Where does the chat read the name?** → **From
  `session.agent.name`** (FE), inlined on session reads so no round-trip.
- [x] **What happens to existing conversations on migration?** → Each
  gets its own cloned default agent (no shared default, preserving the
  edit-isolation guarantee).
- [x] **Should the request keep the 006 overrides?** → **Yes**, the
  protocol stays — but the FE stops sending them. A caller that does is
  using the per-run override (006) on top of the persisted agent.
- [x] **Should Settings page (041) keep the system-prompt textarea?** →
  **No**, to avoid two sources of truth. It becomes a one-line link.

## Out of scope / deferred

- A real shared catalog (multiple named agents, pick / clone / share) —
  the Lumis-style screenshot. Goes to **spec 044**.
- Avatar picker, scheduling, learnings tabs from the reference screenshots.
- Agent versioning, diff, rollback.
- An "Export / import agent" button.
- A per-conversation override for the **default** agent (e.g. "everyone
  starts as X" vs current behavior).
- A non-OpenAI provider switch (still constitution §3 territory).
- A description for the agent that the agent itself *uses*. Today's
  description is metadata for the user; not threaded into the prompt.
