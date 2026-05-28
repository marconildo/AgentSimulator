# Spec: Agent Anatomy — open the agent's identity from the Agent node

| | |
|---|---|
| **ID** | 042-agent-anatomy |
| **Status** | done · *persistence superseded by 043+044* |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-28 |

> ⚠️ **Follow-up note (2026-05-28).** The *dialog* and the *seven sections*
> shipped here are still alive and exactly as designed. Two of the
> persistence-layer choices below were **superseded** the same week:
>
> - The **in-memory Zustand store** that held system_prompt / agent_prompt /
>   model / enabled_tools was promoted to SQLite by
>   [043-persisted-agent](../043-persisted-agent/spec.md) (table `agents`).
> - The `PATCH /api/sessions/{id}` endpoint with the `agent_name` body
>   was removed by 043; agent edits now PATCH `/api/agents/{id}` directly,
>   and 044-shared-agent-catalog made those edits **shared** across every
>   conversation that uses the same agent row.
>
> Everything else (the 7-section dialog, the two prompt layers, the model
> dropdown, the `ChatRequest.agent_prompt` + `model` overrides, the curated
> allowlist) stayed.

> The HOW is in `plan.md`. This spec introduces an **"Anatomia do Agente"**
> dialog opened from the Agent station that exposes — and lets the user edit —
> the seven things that compose this particular agent: name, two prompt layers
> (guardrails + role), language model, tools, knowledge base, and skills.
> Companion to 041-settings-page: 041 is *how the simulator runs*; 042 is
> *what makes this agent be this agent*.

## Problem / motivation

The simulator already exposes most of the levers that define an agent's
behavior — system prompt, enabled tools, RAG top-k, skills catalog. But they
are scattered across a Settings page and the Skills CRUD, never shown
**together as the agent's identity**, and never reachable **from the Agent
node itself**. A learner looking at the Agent station on the canvas cannot
ask the natural question — *"so what exactly is this agent?"* — and get one
view that answers it.

Concretely, today:

- There is **no agent name** at all (the node is always labelled "Agent").
- There is **one prompt** (`system_prompt`), conflating two ideas that
  production teams keep separate — **guardrails** (environment-level rules,
  safety, formatting that everyone in the platform follows) and the **agent's
  role / instructions** (what *this* agent is supposed to be and do).
- The **model** is fixed via `OPENAI_MODEL` env and invisible to the user,
  even though swapping models is the single biggest knob a real team turns.
- The **knowledge base** the agent searches is implicit: the static corpus
  files plus whatever PDFs/MDs the user uploaded — but no one place lists
  what the agent *can actually retrieve from*.
- **Tools** and **skills** are editable in two separate places (Settings page
  sections), with no shared framing as "what the agent can do".

Production agent platforms (the user's screenshots show a representative
example) consolidate exactly these seven items into one **"Edit Agent"**
dialog opened from the agent itself. The simulator should mirror that
mental model — not because we are copying a SaaS, but because the
distinction *"the simulator's behavior"* vs *"the agent's identity"* is
real, didactic, and currently missing.

What this spec delivers:

- A **dialog reachable from the Agent station** ("Configurar agente" button
  alongside "Open full view"). The dialog visualizes the agent's anatomy as
  seven labelled sections and lets the user edit each — live, no save
  button, per-conversation scope identical to the 006 experiment overrides.
- A **two-layer prompt model** in the protocol: `system_prompt` keeps its
  current meaning (guardrails, environment-wide); a new `agent_prompt`
  carries the role/instructions. Both are optional request fields; both
  default to server-provided values; the backend composes them as
  `system_prompt + "\n\n" + agent_prompt + "\n\n" + skills_block`. Omitting
  both reproduces today's behavior exactly.
- A **per-conversation model override** — a dropdown of curated OpenAI
  chat models (e.g. `gpt-4o-mini`, `gpt-4o`, `gpt-5`), whose values come
  from `/api/config` so nothing is hardcoded client-side. The override
  threads through `ChatRequest → AgentState → provider` exactly like the
  006 experiment knobs.
- An **agent name** persisted **per conversation** (in the existing
  `ConversationStore`), defaulting to a localized "Agent" / "Agente" and
  shown both in the Agent station header and in the dialog. Not a global
  agent registry — this is "what's the agent in *this* chat called?" — so it
  fits the existing per-conversation override model without inventing a new
  agent-catalog concept.
- A **knowledge-base section** that lists what the agent can retrieve from
  — the static corpus files (read-only) **and** the user-uploaded documents
  (with remove buttons, reusing 040's per-message attachment plumbing).
  Adding a document from this section uploads through the existing
  ingestion path (002).

## Goals

- The Agent station has a clearly labelled **"Configurar agente"** button
  that opens the anatomy dialog. The existing **"Open full view"** button
  is unchanged — it opens `AgentDetail` (ReAct + Memory + Context); these
  are two complementary surfaces (runtime vs identity).
- The dialog renders **seven sections** in a fixed order, each one
  reflecting one piece of the agent's anatomy. Every editable control is
  **live** (no Save button) and scoped **per conversation** — the same
  scope rule 006 already established.
- The **prompt model becomes two layers** with clear semantics:
  - **System prompt** (`system_prompt`) — *environment-wide rules*. Where
    the platform owner enforces safety, format, refusal patterns. Default
    is a short, didactic guardrails string (new).
  - **Agent prompt** (`agent_prompt`) — *this agent's role/instructions*.
    Where you say "you are a hotel-data analyst" or "you are a customer
    support agent". Default is the current `SYSTEM_PROMPT` (which is
    role-like already) renamed and exposed as the agent prompt.
- A **model dropdown** lists a curated set of OpenAI chat models from
  `/api/config`, with the active server default pre-selected. Selecting a
  different model overrides the per-conversation `model` field, threaded
  through `ChatRequest`. The override is bounded — only values the server
  advertises are accepted (defense in depth).
- A **knowledge-base section** lists every document the agent can retrieve
  from for this conversation: the **corpus** (read-only, server-shipped MDs)
  and the **uploads** (managed). Adding a document calls the existing
  upload + ingestion endpoint; removing one calls a new
  `DELETE /api/documents/{id}` endpoint that drops the document from the
  store and re-indexes (or invalidates) just its chunks.
- The dialog is **bilingual** (§4): every new prose string ships en + pt.
- **Single source of truth** for the visual model is unchanged (§6) — this
  is a new dialog component, not a new station, hop, or tier. No new
  `Stage`, no new `Phase`. `STAGE_TO_STATION` / `STAGE_TO_PHASE` are
  untouched.

## Non-goals

- **No global agent registry.** "The agent" remains the singular runtime
  the simulator embodies; the dialog edits **this conversation's** view of
  it. We do not introduce a sidebar of multiple named agents the user can
  switch between — that would imply multi-agent runtime, which the Simple
  scenario does not have.
- **No avatar picker, groups, scheduling, or learnings tabs** from the
  reference screenshots. Those are SaaS workflow features irrelevant to
  the educational story we tell.
- **No new model providers.** The curated list is OpenAI-only; the
  constitution §3 still holds. Other providers are deferred to a future
  spec that would touch the `LLMProvider` ABC.
- **No "save and apply" workflow.** Edits are live and per-conversation,
  consistent with 006 and 041; reset-to-default per field is the only
  affordance needed.
- **No new `Stage`.** The two-layer prompt is composed server-side and
  emitted via the existing `llm.prompt` event (the prompt-preview already
  reflects whatever was composed). The model used is already on
  `llm.prompt` data.
- **No mid-stream model swap.** Changing the model only affects the
  **next** turn; the current turn (if any) finishes on the model it
  started with. This avoids re-engineering the provider for hot swaps.
- **No persistent knowledge-base versioning / "knowledge sets" / multiple
  named collections.** The corpus is still one collection (`ai_engineering`);
  the dialog only **visualizes** what is in it and lets the user add/remove
  uploads as before.
- **No bulk-document import** or folder upload from the dialog. The same
  upload mechanism the composer already uses is reused as-is.
- **No new keyboard shortcut, drag-handle, or pinning behavior.**

## User-facing behavior

### Where it opens from

Inside the **Agent station** (the `StationNode` for `agent`), a second
discreet button appears below the existing **"Open full view →"** affordance,
labelled **"Configurar agente"** (en: *"Configure agent"*). Clicking it
opens the **Agent Anatomy** dialog as a centered modal over the canvas,
roughly 720–800px wide, with a backdrop dimmer. The dialog can be closed
by Esc, by clicking the backdrop, or by an ✕ in the top-right; nothing in
it requires a Save action.

The **Agent station header** also shows the agent's name when one has been
set for this conversation (defaults to "Agent" / "Agente"), so the name
isn't only visible inside the dialog. A small ✏️ next to the name in the
station also opens the dialog directly to the **Identity** section.

### Dialog layout

The dialog has a header (icon + agent name + close), a left-rail nav (the
seven section anchors), and a scrollable content column. Sections, in
order:

1. **🪪 Identity** — agent **Name** (text input, 1–60 chars), short
   **Description** (textarea, 0–240 chars). Both editable.
2. **🧱 System prompt** — *guardrails*. Multi-line textarea (8 rows),
   pre-filled with the conversation's override or the server default
   shown as placeholder. Live "Reset to default" appears when dirty.
   Help blurb in two sentences: what guardrails are vs. agent prompt.
3. **🎭 Agent prompt** — *role / instructions*. Same shape as the system
   prompt textarea, with its own placeholder (the server default) and
   reset. Help blurb: what the agent IS and what it should do.
4. **🧠 Model** — dropdown of curated OpenAI chat models from
   `/api/config`. Default selection = the configured server model.
   Selecting a different value sets the per-conversation override; a
   "Use default" link clears it. A tiny line below the dropdown shows
   the resolved value for transparency (e.g. *"This conversation will
   use: gpt-4o-mini"*).
5. **🛠️ Tools** — checkbox list of the agent's tools, identical to the
   existing 006 Experiment tools list (incl. `load_skill`,
   `search_knowledge_base`, `calculator`, `current_time`, `kb_lookup`).
   Same per-conversation `enabled_tools` semantics. **Read-only count
   badge** in the section header (e.g. *"4 of 5 enabled"*).
6. **📚 Knowledge base** — two subsections:
   - **Corpus** (read-only) — a flat list of the static MD files
     shipped in `backend/app/data/corpus/*.md`, each with the filename
     and a 1-line preview. A lock icon clarifies these cannot be removed
     (system-shipped). A new endpoint exposes this list.
   - **Uploads** — every document the user has uploaded to this
     conversation (the same uploads 040 introduced). Each row: filename,
     size, uploaded-at, and a **Remove** button. An **Add document**
     button at the top of the subsection opens the same upload affordance
     the composer already uses. Removing a document calls
     `DELETE /api/documents/{id}` and shrinks the list optimistically.
7. **🎓 Skills** — embeds the existing `<SkillsSettings />` CRUD
   component (027). The catalog is **global** (shared across
   conversations) — a callout in this section's header makes that
   explicit (*"Skills are shared across all conversations"*) so the
   per-conversation framing is not violated by misreading.

The **"Configurar agente"** button is the same affordance whether the
station is collapsed or expanded; in the expanded view it sits at the
bottom of the station body (above the existing "Open full view" link, or
side-by-side on wider canvases — final layout is a `plan.md` concern).

### Per-conversation scope (same rule as 006)

Every editable field except **Skills** is per-conversation. Switching to
another conversation while the dialog is open updates every field's
displayed value to that conversation's overrides; closing and reopening
the dialog on the same conversation restores its values. The store is
the existing `useExperiment` slice, extended with two fields
(`agentPrompt`, `model`). The name lives in `useChat` (the conversation
record itself), since it is descriptive metadata of the conversation,
not an experiment knob.

### Bilingual

Every new label, blurb, button text, help string, error message ships
in **en + pt** under `i18n/strings.ts` (under a new namespace
`agentAnatomy`). The **prompt defaults** (system prompt guardrails text,
agent prompt role text) ship as **English-only strings** by deliberate
choice — they are server-shipped *content* the user can replace, not UI
chrome (the same way `SYSTEM_PROMPT` ships in English today). The UI
**around** the textareas is bilingual.

### What does NOT change

- The 006 Settings page (041) keeps every section. The **Experiment**
  section there continues to expose `system_prompt`, tools, top-k, and
  failure modes for users who prefer to drive from there — the anatomy
  dialog is an alternative entry point with extra fields, not a
  replacement. The two stay in sync by reading the same store.
- The `AgentDetail` overlay ("Open full view") is unchanged: it remains
  the runtime view (ReAct loop, memory growth, context budget).
- The static corpus is unchanged; the index is unchanged; the ingestion
  pipeline is unchanged.

## Acceptance criteria

> Tests use Vitest + React Testing Library on the frontend and pytest
> on the backend. The protocol mirror (`schemas.py` ↔ `events.ts`) must
> stay in sync (§1). Backend tests assert structurally and skip the
> model-dependent path without an OpenAI key.

### Backend — protocol & endpoints

1. **AC1 — `ChatRequest.agent_prompt` is an optional, bounded field.**
   `ChatRequest` accepts an optional `agent_prompt: str | None` (default
   `None`, max 2000 chars, same bound as `system_prompt`). Omitting it
   reproduces today's behavior byte-for-byte (default `SYSTEM_PROMPT` is
   used as the agent prompt, then the skills block is composed onto it).
   Tested by a unit test that builds the prompt with `agent_prompt=None`
   and asserts the composed string equals the current behavior.

2. **AC2 — `ChatRequest.model` is an optional, server-validated field.**
   `ChatRequest` accepts an optional `model: str | None`. The server
   accepts only values that appear in the `/api/config` curated models
   list (a `model_allowlist` set built from that list). Any other value
   yields a 422 with a clear error referencing the allowlist. Omitting
   it falls back to `settings.llm_model`. Tested with three cases: omit
   (default used), valid override (used verbatim), invalid override
   (422).

3. **AC3 — `/api/config` advertises `models` and `default_model`.** The
   response includes `models: [{id, label, description?}]` (curated
   OpenAI chat models) and `default_model: str` (the server default).
   Tested by a JSON-shape assertion on the endpoint response: `models`
   is a non-empty list, every entry has at least `id` and `label`,
   `default_model` is an `id` present in `models`.

4. **AC4 — `/api/config` advertises `default_agent_prompt`.** Alongside
   the existing `default_system_prompt`, the response carries
   `default_agent_prompt: str`. The current `SYSTEM_PROMPT` (renamed
   conceptually to "agent prompt") becomes `default_agent_prompt`; a
   new, short, didactic **guardrails** string becomes
   `default_system_prompt`. Tested by string-presence assertions on the
   endpoint response.

5. **AC5 — Composed system message is `system + "\n\n" + agent + "\n\n" + skills`.**
   The backend's `_effective_system(state)` (the function that builds
   the actual system message sent to the model) returns this composition,
   in this order, when all three parts are non-empty. When the
   `agent_prompt` override is blank/whitespace, the default agent prompt
   is used. When the `system_prompt` override is blank/whitespace, the
   default guardrails are used. The `llm.prompt` END event's
   `prompt_preview` reflects this composition. Tested with a unit test
   that drives `_effective_system` (or its replacement) with three
   states (defaults, overrides, blank overrides) and asserts the exact
   string composition.

6. **AC6 — The resolved model is echoed on the request body and on
   `llm.prompt`.** The `request.body` object the backend echoes onto the
   client (in `producer()` / batch response) carries `model: str` (the
   resolved model — override or default). The `llm.prompt` END event's
   `data` already carries `model` per 011; this AC pins that it equals
   the resolved request body's `model` (no drift). Tested with one
   end-to-end backend test (real OpenAI marker) and one unit test on
   the echo function.

7. **AC7 — `GET /api/corpus` lists shipped corpus files.** A new
   endpoint returns `{files: [{filename, size_bytes, preview: str}]}`
   for the files under `settings.corpus_path` (only `*.md`). `preview`
   is the first 240 chars of the file (whitespace-collapsed). Tested
   with a temp-dir corpus fixture.

8. **AC8 — The dialog reuses the existing
   `GET /api/sessions/{id}/documents` endpoint to list session uploads.**
   No new endpoint is added — the 002/040 endpoint already returns the
   shape the Knowledge section needs. Tested by asserting the dialog's
   effect calls that exact URL when it opens (frontend test); the
   existing backend list test stays green untouched.

9. **AC9 — The dialog reuses the existing
   `DELETE /api/sessions/{id}/documents/{document_id}` endpoint to
   remove an upload.** No new endpoint is added. The endpoint's
   existing semantics (row dropped, chunks unindexed, storage object
   removed) carry over; the dialog only invokes it. Tested by
   asserting the dialog's remove button calls the exact URL with the
   correct ids (frontend test).

10. **AC10 — `agent_name` is per-conversation, persisted, bounded.**
    The session row in `ConversationStore` gains an
    `agent_name: str | None` column (default `None`). A new
    `PATCH /api/sessions/{id}` accepts `{agent_name?: str}` (1–60 chars
    after `.strip()`; empty string clears the override), updates the
    row, returns the updated session object. Validation: 422 on
    over-cap; 404 on unknown id. Tested with set / overwrite / clear /
    over-cap / invalid id.

### Frontend — dialog UX

11. **AC11 — The "Configurar agente" button opens the dialog.** Given
    the simulator page with the Agent station rendered, clicking the
    `data-testid="open-agent-config"` button on the station opens a
    dialog with `role="dialog"` containing the seven section headings
    (Identity / System / Agent / Model / Tools / Knowledge / Skills) —
    asserted by their headings being in the DOM.

12. **AC12 — Esc and backdrop both close the dialog.** Pressing Esc
    or clicking the backdrop closes the dialog (the dialog element is
    no longer in the DOM). The ✕ button does the same.

13. **AC13 — Identity edits update the conversation's agent name.**
    Typing into the **Name** field calls
    `PATCH /api/conversations/{id}` (debounced 300ms in tests, mocked)
    and updates the Agent station header to display the new name.

14. **AC14 — System prompt + Agent prompt textareas are per-conversation
    overrides.** Typing into either textarea updates the matching field
    in `useExperiment.byConv[conv]` (`systemPrompt`, `agentPrompt`).
    A **Reset** button appears when the field is dirty (override is
    non-null) and clears the override on click. Switching to another
    conversation while the dialog is open updates the displayed values
    to that conversation's overrides.

15. **AC15 — Model dropdown lists `/api/config.models`.** The dropdown
    options come from the cached `/api/config` payload (same hook
    041/006 use). Selecting an option updates
    `useExperiment.byConv[conv].model`. A **Use default** link clears
    the override. The "resolved value" line below the dropdown reads
    the override or the server default.

16. **AC16 — Tools section mirrors the Experiment tools list.**
    The same checkbox list of `/api/config.tools` is rendered;
    toggling a tool updates `useExperiment.byConv[conv].enabledTools`.
    The section header shows a count badge `"N of M enabled"` (or
    "All enabled" when none have been disabled).

17. **AC17 — Knowledge base lists corpus + uploads.** The Knowledge
    section fetches `/api/corpus` and
    `/api/documents?session_id={conv}` once when the dialog opens
    (and on conversation change). Corpus rows are read-only with a
    lock indicator; upload rows have a remove ✕ that calls
    `DELETE /api/documents/{id}` and removes the row optimistically
    on success.

18. **AC18 — Add-document from Knowledge reuses the composer
    upload path.** Clicking **Add document** triggers the same file
    picker / upload + ingest sequence the composer uses (testable
    by asserting the same `useUploads` hook (or equivalent) is
    invoked).

19. **AC19 — Skills section embeds `<SkillsSettings />` with a
    "shared across conversations" callout.** The existing component
    mounts unchanged; a small bilingual callout text appears above
    it ("Skills are shared across all conversations" /
    "Skills são compartilhadas entre todas as conversas").

20. **AC20 — All new prose ships en + pt (§4).** Every label,
    button, blurb, help line, error string introduced by this spec
    has non-empty `en` and `pt` entries in
    `i18n/strings.ts` under `agentAnatomy.*`. A test that imports
    `agentAnatomy` and asserts no value is an empty string for
    either language (mirrors the existing en/pt parity tests).

21. **AC21 — TypeScript clean; protocol mirror in sync.** `tsc
    --noEmit` is green; `frontend/src/types/events.ts` mirrors any
    additive `data` keys (none expected, but `llm.prompt` keeps
    carrying `model`); the `Stage` enum is unchanged so
    `STAGE_TO_STATION` and `STAGE_TO_PHASE` remain total without
    edits.

### End-to-end (one happy path, `@pytest.mark.openai`)

22. **AC22 — Overriding agent prompt + model changes the run
    structurally.** Given a chat request with a non-default
    `agent_prompt` and a non-default `model`, the resulting trace's
    `llm.prompt` END event carries the composed system message
    (asserts the new agent_prompt substring is present) and the
    `model` field equals the override. The answer is non-empty.

## Protocol / stage impact

- New/changed `Stage`(s): **none.** The two-layer prompt is a
  composition concern; both layers feed the existing system message
  that `llm.prompt` already previews. The model is a request-level
  field already echoed on the request body and present on
  `llm.prompt.data.model`.
- `TraceEvent` change (§1): **additive only.** `ChatRequest` gains
  `agent_prompt` and `model`. No new `data` keys are required; the
  echoed `request.body` carries `model` (and `agent_prompt` when
  set), exactly the way it carries `system_prompt` today.
- Mirror in `frontend/src/types/events.ts`: the `ChatRequestBody`
  echo type gains `agent_prompt?: string` and `model?: string`.
- Station mapping (`stations.ts`): **unchanged.** No new station,
  hop, or tier. The dialog is a new component anchored to the
  existing `agent` station.
- Cloud map (§5): **unchanged.** No new infra noun.
- New endpoints (additive, no protocol change to TraceEvent):
  - `GET /api/corpus` — list shipped corpus files (new)
  - `PATCH /api/sessions/{id}` — set/clear `agent_name` (new)
- Reused endpoints (no shape change):
  - `GET /api/sessions/{id}/documents` — list session uploads (002)
  - `POST /api/sessions/{id}/documents` — add an upload (002)
  - `DELETE /api/sessions/{id}/documents/{document_id}` — remove (002)

## Open questions (resolved during clarify — 2026-05-28)

- [x] **Where does the dialog open from?** → New **"Configurar
  agente"** button inside the Agent station + a ✏️ next to the
  station's name label. The existing "Open full view" stays.
- [x] **One prompt or two?** → **Two layers.** `system_prompt` for
  guardrails, `agent_prompt` for role. Composed server-side. Both
  optional in the request, with separate server defaults.
- [x] **Editable model picker?** → **Yes**, dropdown from a curated
  OpenAI list advertised by `/api/config`. Per-conversation
  override.
- [x] **Edit scope** → **Everything editable** (incl. model and
  KB add/remove). Read-only items in the KB section: shipped
  corpus files only.
- [x] **Where does the agent name live?** → On the **conversation
  row** in `ConversationStore`. Per-conversation, not global.
- [x] **Is there a global agent catalog?** → **No.** One agent per
  conversation; the dialog edits this conversation's view of it.
- [x] **Does this duplicate 041?** → No — 041 is the simulator's
  config (delivery, cloud, clear DBs, skills catalog, *the
  experiment knobs the user can still use from there*). 042 is the
  agent's identity, anchored on the Agent station, with extra
  fields (name, agent prompt, model, KB). Shared store keeps them
  in sync.
- [x] **Save button?** → **No**, live edits, consistent with 006 +
  041.
- [x] **Hot model swap?** → No, model override takes effect on the
  **next** turn.
- [x] **New `Stage`?** → No. Everything fits in the existing
  `llm.prompt` event surface and additive request fields.

## Out of scope / deferred

- ~~A **global agent registry** with multiple named agents, an
  agent picker in the header, switching between agents mid-session.~~
  **Shipped later as [044-shared-agent-catalog](../044-shared-agent-catalog/spec.md)**
  (catalog header strip with selector + clone + delete).
- **Avatar picker** and the SaaS-only tabs (groups, scheduling,
  learnings).
- A **non-OpenAI provider** dropdown (would require touching the
  `LLMProvider` ABC and is a constitution-level decision under §3).
- **Versioning of agent definitions** (snapshot, diff, rollback).
- A **system-prompt linter / template gallery** (interesting, but
  separate concern).
- **Drag-and-drop reorder** of tools or skills.
- A **per-conversation skills allowlist** (today skills are global,
  any conversation can load any catalog skill).
- **Search across the corpus from the dialog** — the Knowledge
  section only lists; deep inspection stays in the Inspector for
  the existing RAG station readout.
- **Telemetry** on which fields users edit most (would inform a
  later UX pass).
