# Plan: Agent Anatomy

> Spec is `clarified`. This plan describes how the dialog gets wired up:
> two additive request fields (`agent_prompt`, `model`), one new column
> on the session row (`agent_name`), two new endpoints (`GET /api/corpus`,
> `PATCH /api/sessions/{id}`), the prompt composition split into two
> layers, the curated-models allowlist, and the React dialog itself.
> Document add/list/remove reuse 002's existing endpoints.

## Approach

**Three additive backend surfaces, one frontend dialog, zero new `Stage`.**

The dialog is a focused React component — `AgentAnatomyDialog` — opened
from inside the existing Agent `StationNode`. It composes seven section
components, one per anatomy element, each a thin wrapper over the store
slices and `/api/config` payload it needs. Live-edit + per-conversation
scope mirrors 006/041 exactly; closing the dialog never "saves"
anything (everything is already live).

On the backend, the protocol grows by two `ChatRequest` fields
(`agent_prompt: str | None`, `model: str | None`) and one
`ConversationStore` column (`agent_name`). `/api/config` advertises
`default_agent_prompt`, `models`, and `default_model`. The current
`SYSTEM_PROMPT` constant in `backend/app/agent/prompts.py` is **renamed
to `AGENT_PROMPT`** because it is, conceptually, the agent's role — and
a new **short, didactic `GUARDRAILS_PROMPT` constant becomes the new
`SYSTEM_PROMPT`**. The compose function changes from
`base + "\n\n" + skills` to
`guardrails + "\n\n" + role + "\n\n" + skills`.

The curated models list is a server constant (`backend/app/llm/models.py`),
not env-driven — the constitution wants single-instance, single-provider,
and a small fixed list keeps the test surface bounded. The default
remains `settings.llm_model` (the env value), but it must appear in the
constant list or the boot fails fast (defensive sanity check on startup,
not on every request).

**Alternatives considered**

- **Append `agent_prompt` to `system_prompt` instead of splitting**:
  rejected because it conflates two distinct concerns the spec is
  explicit about separating; would also make AC1/AC5 untestable as
  separate behaviors.
- **Per-conversation model + agent identity in `localStorage`** rather
  than in `ConversationStore`: rejected because conversations already
  persist server-side, and "the agent's name for this conversation" is
  a property of the conversation, not of the browser. Persisting it on
  the session row also survives reload.
- **A real "Agent registry" with named, savable agents**: rejected
  (spec non-goal). Adding it later is a separate spec; today's per-
  conversation model is enough.
- **Dropdown of *every* OpenAI model the API exposes**: rejected. We
  curate (3–5 models) to bound the test allowlist and avoid showing
  deprecated/non-chat models. Adding a model is one line in
  `llm/models.py`.

## Affected files

**Backend**

- `backend/app/schemas.py` — **edit.** Add `agent_prompt: str | None`
  and `model: str | None` to `ChatRequest`. Add a `model_validator` on
  `ChatRequest` that checks `model` against the curated allowlist (or
  defer the check to `main.chat()` to return a friendlier 422 — see
  Test strategy).
- `backend/app/llm/models.py` — **new.** Curated list constant
  `CURATED_MODELS: list[CuratedModel]` (id, label, optional description).
  Helper `model_ids() -> set[str]`. The list starts at: `gpt-4o-mini`
  (default), `gpt-4o`, `gpt-4.1`, `gpt-5-mini`, `gpt-5`. Final list is
  a one-time decision in T-implement.
- `backend/app/agent/prompts.py` — **edit.** Rename `SYSTEM_PROMPT` →
  `AGENT_PROMPT` (the current text becomes the agent-role default).
  Add a new short `GUARDRAILS_PROMPT` constant (~5 lines: be helpful,
  ground claims in retrieved/tool results, refuse unsafe requests,
  prefer concise prose, etc.). Add `compose_system(guardrails, role,
  catalog) -> str`; keep the existing `compose_system(base, catalog)`
  shape only if it has external callers (it does in `graph.py` —
  refactor there too). Drop `skills_block` re-export if unused.
- `backend/app/agent/graph.py` — **edit.** In `_system_parts(state)`,
  return `(guardrails, role, skills)` instead of `(base, skills)`. In
  `_effective_system(state)`, compose the three. In the helpers that
  pick the agent role: use `state["agent_prompt"]` (new key) when
  non-blank else `AGENT_PROMPT`; use `state["system_prompt"]` (now the
  guardrails layer) when non-blank else `GUARDRAILS_PROMPT`. The
  provider call passes the composed string verbatim (no provider
  change — it still takes one `system=`).
- `backend/app/agent/state.py` — **edit.** Add `agent_prompt: str | None`
  and `model: str | None` to `AgentState` so the nodes can read them.
- `backend/app/agent/run.py` (or `runtime.py` — wherever `run_agent`
  builds the initial state) — **edit.** Pass `agent_prompt` and `model`
  through to `AgentState`. The provider is constructed per-request
  (or its `decide`/`stream_answer` accept a `model=` override) — see
  the provider edit below.
- `backend/app/llm/provider.py` — **edit.** Add `model: str | None`
  param (default `None`) to `decide(...)` and `stream_answer(...)` on
  the ABC. `OpenAIProvider` uses the override or falls back to
  `settings.llm_model`. This is additive; tests that pass no `model`
  continue to work.
- `backend/app/main.py` — **edits.**
  - In `/api/config`: add `default_agent_prompt: AGENT_PROMPT`,
    `default_system_prompt: GUARDRAILS_PROMPT` (replacing the prior
    `default_system_prompt: SYSTEM_PROMPT` — same key, new content),
    `models: [CuratedModel...]`, `default_model: settings.llm_model`.
  - In `/api/chat`: when `req.model` is provided, validate against
    `model_ids()` (422 with `{detail: "model not in allowlist", ...}`
    if it isn't); echo the **resolved** model onto `request.body`;
    pass it through to `run_agent`.
  - Add `GET /api/corpus` handler: enumerate
    `settings.corpus_path.glob("*.md")`, return
    `{files: [{filename, size_bytes, preview}]}`. `preview` =
    `_preview_md(text, 240)` (whitespace-collapsed, first 240 chars).
  - Add `PATCH /api/sessions/{session_id}` handler: parses
    `{agent_name?: str}`; calls a new
    `ConversationStore.update_session(session_id, agent_name=…)`; 404
    when unknown id; 422 when value over-cap.
- `backend/app/db/store.py` — **edit.**
  - Migration: `ALTER TABLE sessions ADD COLUMN agent_name TEXT`
    (idempotent — wrap in a `try/except sqlite3.OperationalError`).
  - `_get_session_sync` / `_list_sessions_sync` / `_ensure_session_sync`
    / `_create_session_sync` all return rows that now carry
    `agent_name` (defaulting to `None`).
  - New `_update_session_sync(session_id, *, agent_name=…)`.
  - New `async update_session(session_id, **fields)` wrapper.
- `backend/app/data/corpus/...` — **no change.** Read-only listing.
- `backend/tests/test_agent_prompt_layers.py` — **new.** Unit test on
  `_effective_system` / `compose_system` for AC1 + AC5 (defaults,
  overrides, blank-fallback).
- `backend/tests/test_chat_request_model.py` — **new.** Pydantic + API
  tests for AC2 (omit / valid / invalid).
- `backend/tests/test_config_endpoint.py` — **new (or extend
  existing)**. Asserts `/api/config` shape for AC3 + AC4.
- `backend/tests/test_corpus_endpoint.py` — **new.** AC7 fixture-based.
- `backend/tests/test_session_patch.py` — **new.** AC10 cases.
- `backend/tests/test_request_body_echo.py` — **new (or extend
  existing test_main.py)**. AC6 unit on the echo function.
- `backend/tests/test_agent_e2e_overrides.py` — **new (marked
  `@pytest.mark.openai`)**. AC22 happy path.

**Frontend**

- `frontend/src/components/AgentAnatomyDialog.tsx` — **new.** The
  dialog shell (backdrop + Esc handling + ✕ + left nav + scroll
  column). Composes seven section components below.
- `frontend/src/agent-anatomy/Identity.tsx` — **new.** Name + short
  description inputs; debounced PATCH to `/api/sessions/{id}`.
- `frontend/src/agent-anatomy/SystemPromptSection.tsx` — **new.**
  Guardrails textarea; reads/writes
  `useExperiment.byConv[c].systemPrompt`; Reset to default; help blurb.
- `frontend/src/agent-anatomy/AgentPromptSection.tsx` — **new.** Role
  textarea; reads/writes `useExperiment.byConv[c].agentPrompt`; Reset;
  help blurb.
- `frontend/src/agent-anatomy/ModelSection.tsx` — **new.** Dropdown
  bound to `/api/config.models`; reads/writes
  `useExperiment.byConv[c].model`; "Use default" link; resolved-value
  line.
- `frontend/src/agent-anatomy/ToolsSection.tsx` — **new.** Reuses the
  existing tools-checkbox list (extracted into a small shared
  component if helpful) so the 041 `SettingsExperiment` and this
  section share one source of truth.
- `frontend/src/agent-anatomy/KnowledgeSection.tsx` — **new.** Two
  blocks. **Corpus**: fetches `/api/corpus` once; renders read-only
  rows with lock icon. **Uploads**: fetches
  `GET /api/sessions/{id}/documents`; renders rows with remove ✕
  (calls existing `DELETE` endpoint); **Add document** button reuses
  the composer's upload hook (the same hook 040 wired into the
  composer; if it's coupled to the composer today, extract it into
  `lib/uploads.ts`).
- `frontend/src/agent-anatomy/SkillsSection.tsx` — **new.** Thin
  wrapper: a callout (bilingual "shared across conversations") + the
  existing `<SkillsSettings />` component.
- `frontend/src/components/nodes/AgentNode.tsx` (or wherever the
  Agent station body is rendered — find via `stations.ts` agent
  entry) — **edit.** Add the **"Configurar agente"** button next to
  the existing "Open full view →" link; both open dedicated views
  (the new dialog vs `AgentDetail`). Render the conversation's
  `agent_name` (when set) next to the station title; show a small
  ✏️ that also opens the dialog (scrolled to Identity).
- `frontend/src/lib/experiment.ts` — **edit.** Extend `ConvExperiment`
  with `agentPrompt: string | null` and `model: string | null`; add
  setters `setAgentPrompt`, `setModel`; update `DEFAULT_EXPERIMENT`;
  include both in the `reset` clear set.
- `frontend/src/lib/chatApi.ts` — **edit.** Send
  `agent_prompt` and `model` from the active experiment on every
  `POST /api/chat` (same null-elision rule the others follow).
  Add `getCorpus()`, `patchSession(id, body)` thin wrappers.
- `frontend/src/lib/sessionsApi.ts` — **new or extend.** Wrappers
  for the conversation PATCH endpoint and reading session metadata
  (the dialog Identity section needs the current `agent_name`).
- `frontend/src/types/api.ts` (or wherever `AppConfig` lives — likely
  inline today) — **edit.** Add `default_agent_prompt`, `models`,
  `default_model` to `AppConfig`.
- `frontend/src/types/events.ts` — **edit.** Extend the
  `ChatRequestBody` echo type with `agent_prompt?: string` and
  `model?: string` (the protocol mirror, §1).
- `frontend/src/i18n/strings.ts` — **edit.** Add `agentAnatomy.*`
  namespace (titles, helps, callouts, button labels). En + pt for
  every key.
- `frontend/src/settings/SettingsExperiment.tsx` — **edit (small).**
  Reuse the same store; no behavior change but the existing system-
  prompt textarea continues to write `systemPrompt` (now = guardrails
  layer). Optional: add a small banner explaining the split *(left to
  the implementer — the agent dialog is the canonical place to edit
  these, but Settings can still expose them as a convenience)*.
- `frontend/src/components/AgentAnatomyDialog.test.tsx` — **new.**
  AC11–AC18 + AC21.
- `frontend/src/agent-anatomy/Identity.test.tsx` — **new.** AC13.
- `frontend/src/agent-anatomy/Prompts.test.tsx` — **new.** AC14.
- `frontend/src/agent-anatomy/Model.test.tsx` — **new.** AC15.
- `frontend/src/agent-anatomy/Knowledge.test.tsx` — **new.** AC17 +
  AC8 (URL assertion) + AC9 (delete URL assertion) + AC18 (upload
  reuses composer path).
- `frontend/src/agent-anatomy/Skills.test.tsx` — **new (small).**
  AC19 callout + `<SkillsSettings />` mounts.
- `frontend/src/i18n/agentAnatomy.test.ts` — **new.** AC20 en/pt
  parity.

## Protocol changes (constitution §1)

- `backend/app/schemas.py` — `ChatRequest` gains:
  - `agent_prompt: str | None = Field(default=None, max_length=2000)`
  - `model: str | None = Field(default=None)`
- `frontend/src/types/events.ts` — the `ChatRequestBody` echo type
  gains `agent_prompt?: string` and `model?: string`. This is the
  client-side mirror of the resolved body the backend echoes on each
  trace; not a new `data` key on any event.
- No new `Stage` / `Phase`. `STAGE_TO_STATION`, `STAGE_TO_PHASE`
  remain total without edits. `phases.test.ts` stays green
  untouched.
- No new station / hop / tier in `stations.ts`. The dialog is anchored
  to the existing `agent` station.

## Data model changes

**Relational store (`ConversationStore`, SQLite).**

- New column `agent_name TEXT` on `sessions`. Added by an idempotent
  `ALTER TABLE` inside `_migrate`. Defaults to `NULL`; existing rows
  read `agent_name = None`.
- No change to `messages`, `documents`, `message_documents`, or
  `skills` tables.

**Vector store (Chroma).**

- No change. The corpus is unchanged; the `ai_engineering` collection
  is unchanged. The Knowledge section is a **read-only listing** of
  what is already there.

**Curated models constant.**

- New module `backend/app/llm/models.py` carries the
  `CURATED_MODELS` list. Not persisted; reloaded on import. Adding a
  model is a one-line code change.

## i18n strings (constitution §4)

> New `agentAnatomy.*` namespace. The prompt **default texts**
> themselves (`AGENT_PROMPT`, `GUARDRAILS_PROMPT`) remain
> English-only server-side content (same rule the current
> `SYSTEM_PROMPT` follows — they're shippable defaults the user can
> replace, not UI chrome).

| key / location | en | pt |
|---|---|---|
| `agentAnatomy.openButton` | `Configure agent` | `Configurar agente` |
| `agentAnatomy.dialogTitle` | `Agent anatomy` | `Anatomia do agente` |
| `agentAnatomy.identity.title` | `Identity` | `Identidade` |
| `agentAnatomy.identity.nameLabel` | `Name` | `Nome` |
| `agentAnatomy.identity.descLabel` | `Short description` | `Descrição curta` |
| `agentAnatomy.identity.namePlaceholder` | `Agent` | `Agente` |
| `agentAnatomy.system.title` | `System prompt` | `Prompt de sistema` |
| `agentAnatomy.system.help` | `Environment-wide rules (guardrails, safety, formatting). Applies before the agent's role.` | `Regras do ambiente (guardrails, segurança, formato). Aplica-se antes do papel do agente.` |
| `agentAnatomy.agent.title` | `Agent prompt` | `Prompt do agente` |
| `agentAnatomy.agent.help` | `Who this agent is and what it should do.` | `Quem é este agente e o que ele deve fazer.` |
| `agentAnatomy.model.title` | `Model` | `Modelo` |
| `agentAnatomy.model.resolved` | `This conversation will use:` | `Esta conversa usará:` |
| `agentAnatomy.model.useDefault` | `Use default` | `Usar padrão` |
| `agentAnatomy.tools.title` | `Tools` | `Ferramentas` |
| `agentAnatomy.tools.countAll` | `All enabled` | `Todas habilitadas` |
| `agentAnatomy.tools.countSome` | `{n} of {m} enabled` | `{n} de {m} habilitadas` |
| `agentAnatomy.knowledge.title` | `Knowledge base` | `Base de conhecimento` |
| `agentAnatomy.knowledge.corpus` | `Corpus (shipped)` | `Corpus (do sistema)` |
| `agentAnatomy.knowledge.corpusLockHint` | `Read-only — bundled with the simulator.` | `Somente leitura — embutido no simulador.` |
| `agentAnatomy.knowledge.uploads` | `Your uploads` | `Seus uploads` |
| `agentAnatomy.knowledge.add` | `Add document` | `Adicionar documento` |
| `agentAnatomy.knowledge.empty` | `No documents uploaded yet.` | `Nenhum documento enviado ainda.` |
| `agentAnatomy.skills.title` | `Skills` | `Skills` |
| `agentAnatomy.skills.shared` | `Skills are shared across all conversations.` | `Skills são compartilhadas entre todas as conversas.` |
| `agentAnatomy.reset` | `Reset to default` | `Restaurar padrão` |
| `agentAnatomy.close` | `Close` | `Fechar` |

## Cloud map (constitution §5)

n/a — no new tier, station, or boundary. The dialog is a UI affordance
anchored to the existing `agent` station; no infra noun is introduced.

## Test strategy (constitution §9 — TDD)

> Each AC maps to at least one failing test that drives the
> implementation. Backend tests are async pytest (`asyncio_mode=auto`),
> use the existing `tests/conftest.py` (temp DB + reset Chroma).
> Frontend tests use Vitest + RTL (the setup 040 added); stores reset
> via `setState` in `beforeEach`.

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 (`agent_prompt` field; default behavior unchanged) | unit on `_effective_system` with default state | `backend/tests/test_agent_prompt_layers.py` |
| AC2 (`model` field; allowlist) | three subtests: omit / valid / invalid → 422 | `backend/tests/test_chat_request_model.py` |
| AC3 (`/api/config.models`, `default_model`) | JSON-shape assertions | `backend/tests/test_config_endpoint.py` |
| AC4 (`/api/config.default_agent_prompt`) | JSON-shape assertions | same file |
| AC5 (composed system = guardrails+role+skills) | three subtests: defaults / overrides / blank fallback | `backend/tests/test_agent_prompt_layers.py` |
| AC6 (resolved `model` echoed on body + `llm.prompt`) | unit on echo helper + e2e mark check | `backend/tests/test_request_body_echo.py` + e2e |
| AC7 (`GET /api/corpus`) | temp corpus dir fixture, asserts files + previews | `backend/tests/test_corpus_endpoint.py` |
| AC8 (FE reuses `GET /api/sessions/{id}/documents`) | RTL: open dialog, assert fetch URL | `Knowledge.test.tsx` |
| AC9 (FE reuses `DELETE /api/sessions/{id}/documents/{doc}`) | RTL: click remove, assert fetch URL | `Knowledge.test.tsx` |
| AC10 (`PATCH /api/sessions/{id}`) | set / overwrite / clear / over-cap / 404 | `backend/tests/test_session_patch.py` |
| AC11 (button opens dialog with 7 headings) | RTL render simulator, click button | `AgentAnatomyDialog.test.tsx` |
| AC12 (Esc + backdrop + ✕ close) | three fire events | same file |
| AC13 (Identity edits → PATCH + station header updates) | mock `chatApi.patchSession`; assert call | `Identity.test.tsx` |
| AC14 (prompt textareas per-conv + reset) | type → store; reset → store cleared | `Prompts.test.tsx` |
| AC15 (model dropdown wired) | mock `getConfig`; select → store; "Use default" clears | `Model.test.tsx` |
| AC16 (tools mirror Experiment tools) | toggle checkbox → `enabledTools` update | `AgentAnatomyDialog.test.tsx` (or `Tools.test.tsx` if extracted) |
| AC17 (Knowledge lists corpus + uploads) | mock `getCorpus`, `listDocuments`; assert rows | `Knowledge.test.tsx` |
| AC18 (add-document reuses composer path) | spy on the shared upload hook | `Knowledge.test.tsx` |
| AC19 (Skills callout + `<SkillsSettings />` mounts) | RTL find callout + component test id | `Skills.test.tsx` |
| AC20 (en + pt parity for `agentAnatomy.*`) | iterate keys, assert both non-empty | `i18n/agentAnatomy.test.ts` |
| AC21 (tsc clean, `STAGE_TO_STATION` unchanged) | `npm run build` in CI + existing `phases.test.ts` stays green | existing gates |
| AC22 (e2e with overrides, marked `openai`) | one happy-path chat with `agent_prompt` + `model` overrides; assert composed system + `model` echo | `backend/tests/test_agent_e2e_overrides.py` |

> The existing tests for `SkillsSettings`, `useExperiment` (will need
> to be updated to acknowledge the two new fields' defaults — that's
> a regression coverage update, not a behavior change), the existing
> `/api/sessions/{id}/documents` endpoints, and `phases.test.ts`
> continue to pass.

## Risks / trade-offs

- **Renaming `SYSTEM_PROMPT` → `AGENT_PROMPT` is a churny edit** that
  touches `graph.py`, `main.py`, several tests, and the public
  `default_system_prompt` key on `/api/config`. We keep the existing
  `default_system_prompt` key name (now carrying the guardrails text
  instead of the role text) so the 041 Settings page's "system prompt"
  textarea **does not silently become a different field** — it
  remains the guardrails layer, which is the cleaner semantic. The
  agent prompt has its own new key. This is a **content swap** of
  `default_system_prompt` (guardrails replace the prior role text).
  Risk: anyone with a personal override of `system_prompt` saved
  in-memory will keep it (overrides are in-memory only, per 006). On
  reload the default is the new guardrails — intentional.
- **Per-conversation model override is real**; if the chosen model
  doesn't exist for the account's API key, OpenAI returns an error.
  We surface this as a normal `respond` error / failure mode in the
  trace, not a pre-flight check (a pre-flight `models.list` call adds
  cost and latency for limited benefit). The Risk register acknowledges
  this.
- **The curated list might drift behind OpenAI**. Maintained as a
  short constant. Adding a model is one line; tests are stable because
  they reference `model_ids()` not specific strings.
- **`agent_name` migration on a fresh production DB is trivial**, but
  on a long-lived dev DB the `ALTER TABLE` must be idempotent (already
  the pattern in `_migrate` for prior columns). The migration test
  asserts running `_migrate` twice is a no-op.
- **Settings page (041) keeps showing `system_prompt`** — the
  Experiment section's textarea will now edit the guardrails layer,
  not the role. We add a one-line clarifying label there (en + pt) so
  users coming from 041 know the role lives in the Agent dialog.
- **Dialog overlay during streaming** — the user could open the
  dialog while a turn is in flight. Editable controls remain
  responsive; the **next** turn picks up the new values; the current
  turn is not interrupted (the agent already has its system message).
  No spinner overlay needed; if the dialog asks for a refetch of the
  config the cached value is fine.
- **Single source of truth**: the tools list is now read by both
  `SettingsExperiment` and `ToolsSection`. We share `/api/config.tools`
  via the existing fetch+cache; behavior is identical. If we extract a
  `<ToolsChecklist />` to deduplicate JSX, we do it in T-refactor at
  the end, not up front.
- **Deep-linking the dialog** is out of scope. Opening the dialog is
  a click-only affordance. The ✏️ next to the name is a convenience
  shortcut to scroll the dialog to Identity; same dialog.
- **Frontend tests' fetch URL assertions are URL-string fragile**
  (anyone moving the endpoint shape would also break tests). This is
  the intended coupling: AC8/AC9 are *about* reusing the canonical
  URLs.
