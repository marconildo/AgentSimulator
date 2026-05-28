# Tasks: Agent Anatomy

> Red → green → refactor. Each implementation task is preceded by the
> test that drives it. Backend protocol moves first (so the FE has real
> shapes to mock), then the FE dialog, then the cleanup pass.

## Tasks

### Bootstrap

- [ ] **T0 — branch + spec bump.** Branch `042-agent-anatomy`; bump
  `spec.md` status `clarified → in-progress`. Add a memory pointer
  later (Definition of done).

### Backend — prompt layers + new constants

- [ ] **T1 — test first (AC1, AC5 defaults).** Add
  `backend/tests/test_agent_prompt_layers.py` with three subtests:
  (a) **defaults**: `_effective_system(state)` with no
  `system_prompt` and no `agent_prompt` overrides equals
  `GUARDRAILS_PROMPT + "\n\n" + AGENT_PROMPT` when the skills catalog
  is empty, and the same with a `+ "\n\n" + skills_block` suffix when
  it isn't; (b) **overrides**: non-blank overrides replace each layer
  independently; (c) **blank fallback**: a whitespace-only override
  falls back to the corresponding default. Fails: `GUARDRAILS_PROMPT`
  doesn't exist; `_effective_system` returns only `base + skills`.

- [ ] **T2 — implement.** In `backend/app/agent/prompts.py`:
  - Rename `SYSTEM_PROMPT` → `AGENT_PROMPT` (the role text stays
    word-for-word).
  - Add `GUARDRAILS_PROMPT` — a short, didactic guardrails string
    (5–8 lines: be helpful, ground claims in retrieved/tool results,
    refuse unsafe requests, prefer concise prose, ask back when
    underspecified).
  - Add `compose_system(guardrails: str, role: str, catalog: list)
    -> str` returning the 3-layer string.
  In `backend/app/agent/graph.py`:
  - Update `_system_parts(state)` to return
    `(guardrails, role, skills)`.
  - Update `_effective_system(state)` to compose via the new helper.
  - Helpers select `state["agent_prompt"]` over `AGENT_PROMPT`,
    `state["system_prompt"]` over `GUARDRAILS_PROMPT`.
  Update every existing test that imports `SYSTEM_PROMPT` to import
  `AGENT_PROMPT`. T1 green.

### Backend — schema + state + run wiring

- [ ] **T3 — test first (AC2).** Add
  `backend/tests/test_chat_request_model.py`:
  - (a) `ChatRequest(message="x", model=None)` validates ok and the
    resolved model after dispatch equals `settings.llm_model`.
  - (b) `model="gpt-4o-mini"` validates ok and is echoed verbatim.
  - (c) `model="not-a-real-model"` returns **HTTP 422** from
    `/api/chat` with a body referencing the allowlist. Fails:
    `ChatRequest` doesn't know about `model`.

- [ ] **T4 — implement.**
  - `backend/app/llm/models.py` **new**: `CuratedModel` dataclass /
    TypedDict (`id`, `label`, optional `description`);
    `CURATED_MODELS: list[CuratedModel]` starting with `gpt-4o-mini`,
    `gpt-4o`, `gpt-4.1`, `gpt-5-mini`, `gpt-5`; `model_ids() -> set[str]`
    helper. Add a startup sanity check (in `main.lifespan` or at
    `Settings` load) that `settings.llm_model in model_ids()`; raise a
    clear error if not.
  - `backend/app/schemas.py`: add `agent_prompt: str | None = …` (max
    2000) and `model: str | None = None` to `ChatRequest`.
  - `backend/app/main.py` `/api/chat`: when `req.model is not None and
    req.model not in model_ids()`, return `JSONResponse(status_code=422,
    content={"detail": "model not in allowlist", "allowed": sorted(...)})`.
  - `AgentState` (`state.py`) gets `agent_prompt` and `model` keys.
  - `run_agent` passes them through.
  - `OpenAIProvider.decide` and `stream_answer` accept a `model:
    str | None = None` kwarg and use it or `settings.llm_model`.
  - Nodes that call the provider read `state["model"]` and pass it.
  T3 green.

### Backend — `/api/config` advertisement

- [ ] **T5 — test first (AC3, AC4).** Add (or extend)
  `backend/tests/test_config_endpoint.py`:
  - `GET /api/config` body has `default_agent_prompt: str`
    non-empty, `default_system_prompt: str` non-empty (now the
    guardrails text), `models: list[dict]` non-empty (every entry has
    `id`, `label`), `default_model: str` and it is in `[m.id for m in
    models]`. Fails: keys are missing.

- [ ] **T6 — implement.** In `main.config()`:
  - `default_system_prompt = GUARDRAILS_PROMPT`
  - `default_agent_prompt = AGENT_PROMPT`
  - `models = [asdict(m) for m in CURATED_MODELS]`
  - `default_model = settings.llm_model`
  T5 green.

### Backend — echo `model` on request body + on `llm.prompt`

- [ ] **T7 — test first (AC6).** Add (or extend)
  `backend/tests/test_request_body_echo.py`:
  - A unit test that builds the echoed `request.body` dict given a
    `ChatRequest(model="gpt-4o")` and asserts the dict contains
    `"model": "gpt-4o"`. Also: with `model=None` the dict contains
    `"model": settings.llm_model` (the resolved value, not None).
  - Skip the live `llm.prompt.data.model` check here — covered by AC22.
  Fails: echo doesn't include `model`.

- [ ] **T8 — implement.** In `main.chat()` `producer()` (and the
  batch branch if separate), insert `request_body["model"] = req.model
  or settings.llm_model`. Add `request_body["agent_prompt"] = …` when
  set (mirror the existing `system_prompt` conditional). T7 green.

### Backend — corpus listing endpoint

- [ ] **T9 — test first (AC7).** Add
  `backend/tests/test_corpus_endpoint.py`:
  - Use a temp corpus fixture (override `settings.corpus_dir`); drop
    two `.md` files with known headers.
  - `GET /api/corpus` returns `{"files": [...]}` with both filenames,
    `size_bytes > 0`, and previews containing the first words of each
    file (whitespace-collapsed, ≤ 240 chars).
  Fails: endpoint doesn't exist.

- [ ] **T10 — implement.** Add the `GET /api/corpus` handler in
  `main.py`:
  - Enumerate `settings.corpus_path.glob("*.md")` sorted by filename.
  - For each, read once, strip whitespace, collapse internal whitespace,
    cap at 240 chars → `preview`.
  - Return `{"files": [{"filename": p.name, "size_bytes": p.stat().st_size,
    "preview": prev}, ...]}`.
  T9 green.

### Backend — `agent_name` column + PATCH session

- [ ] **T11 — test first (AC10).** Add
  `backend/tests/test_session_patch.py`:
  - **set**: create a session; `PATCH /api/sessions/{id}` with
    `{"agent_name": "Hotel Analyst"}` returns 200, body has
    `agent_name == "Hotel Analyst"`. A subsequent `GET` (via the
    existing session-read path) reflects it.
  - **overwrite**: PATCH again with a different name persists the new
    name.
  - **clear**: PATCH with `{"agent_name": ""}` (or `null`) clears
    (`agent_name is None`).
  - **over-cap**: 61+ chars → 422.
  - **invalid id**: `PATCH /api/sessions/does-not-exist` → 404.
  Fails: endpoint doesn't exist; column doesn't exist.

- [ ] **T12 — implement.**
  - `backend/app/db/store.py`:
    - In `_migrate`, idempotent
      `ALTER TABLE sessions ADD COLUMN agent_name TEXT` (try/except
      `sqlite3.OperationalError`).
    - Sessions row helpers include `agent_name` in their dict shape
      (defaulting to `None`).
    - Add `_update_session_sync(session_id, *, agent_name=...)` with
      a sentinel for "do not touch" vs "clear" (use a module-level
      `_UNSET = object()` or accept `Optional[str | None]` with an
      explicit clear flag).
    - Add `async update_session(session_id, **fields)`.
  - `backend/app/main.py`: add `PATCH /api/sessions/{session_id}` with
    a pydantic body `SessionPatch(agent_name: str | None = Field(...,
    max_length=60))`; strip; treat `""` as clear; 404 when the session
    doesn't exist; return the updated row.
  T11 green.

### Backend — e2e overrides (one happy path)

- [ ] **T13 — test first (AC22, marked `openai`).** Add
  `backend/tests/test_agent_e2e_overrides.py`:
  - `@pytest.mark.openai`. Send `POST /api/chat` with a non-default
    `agent_prompt` (e.g. "You are a tour guide for Lisbon.") and
    `model = "gpt-4o-mini"` (any allowlisted model).
  - Drain SSE; collect events; find the `llm.prompt` END.
  - Assert `data.prompt_preview.system` contains the new
    `agent_prompt` substring **and** the new `GUARDRAILS_PROMPT`
    substring (composition order is enforced).
  - Assert the event's `data.model` equals `"gpt-4o-mini"`.
  - Assert the final answer is non-empty (structural, not semantic).
  Fails until T2–T8 land.

- [ ] **T14 — implement (incremental).** Most of this passes once
  T2/T4/T6/T8 are green. Address any drift between the
  `prompt_preview` shape today and what AC5/AC22 expect (e.g. if
  `prompt_preview.system` doesn't already carry the composed system
  message, ensure it does). T13 green.

### Frontend — store + types

- [ ] **T15 — test first (extends existing `experiment` tests).**
  Add subtests asserting `DEFAULT_EXPERIMENT.agentPrompt === null`,
  `DEFAULT_EXPERIMENT.model === null`; `setAgentPrompt(conv, "x")`
  writes; blank value clears (mirror `setSystemPrompt`); `setModel`
  writes / clears; `reset(conv)` returns to default.

- [ ] **T16 — implement.** In
  `frontend/src/lib/experiment.ts`: add `agentPrompt` and `model` to
  `ConvExperiment`, `DEFAULT_EXPERIMENT`, the `ExperimentState`
  interface, and the setters. In
  `frontend/src/lib/chatApi.ts`: send `agent_prompt` and `model` from
  the active experiment when non-null; add `getCorpus()` and
  `patchSession(id, body)` thin wrappers. In
  `frontend/src/types/events.ts`: extend `ChatRequestBody` with
  `agent_prompt?: string` and `model?: string`. In `AppConfig`: add
  `default_agent_prompt`, `models`, `default_model`. T15 green.

### Frontend — Identity section

- [ ] **T17 — test first (AC13).** Add
  `frontend/src/agent-anatomy/Identity.test.tsx`:
  - Mock `chatApi.patchSession`.
  - Render `<Identity />` inside a wrapper that provides a fixed
    `useChat.activeSessionId`.
  - Type into the Name input; advance fake timers past the debounce
    window; assert `patchSession` was called with `{agent_name: "X"}`
    and the active session id.
  Fails: component doesn't exist.

- [ ] **T18 — implement.** Create
  `frontend/src/agent-anatomy/Identity.tsx`:
  - Reads the current `agent_name` from `useChat`'s session record
    (fetch on mount if missing).
  - Debounced PATCH on change.
  - Description input (local-only for now; same debounce, but not
    persisted by the backend until a future spec — keep the field
    visible but document the limitation in code; **alternative**:
    persist alongside `agent_name` as `agent_description` if it's a
    one-line addition. **Decision deferred to implementation**; the
    spec's AC13 only requires the name to round-trip).
  T17 green.

### Frontend — Prompt sections (system + agent)

- [ ] **T19 — test first (AC14).** Add
  `frontend/src/agent-anatomy/Prompts.test.tsx`:
  - Mock `getConfig` to return both defaults.
  - Render system + agent prompt sections; type a value into each →
    assert the corresponding `useExperiment.byConv[c]` field updates.
  - Click **Reset** on each → assert override goes back to `null`.
  - Switch active conversation id → assert displayed values reflect
    the new conversation's overrides (or defaults).
  Fails: components don't exist.

- [ ] **T20 — implement.** Create
  `frontend/src/agent-anatomy/SystemPromptSection.tsx` and
  `AgentPromptSection.tsx`:
  - Each renders a textarea (rows=8) prefilled with the override or
    a placeholder = the server default.
  - "Reset to default" button visible only when dirty.
  - Help blurb above the textarea (en + pt).
  T19 green.

### Frontend — Model section

- [ ] **T21 — test first (AC15).** Add
  `frontend/src/agent-anatomy/Model.test.tsx`:
  - Mock `getConfig` to return `models = [{id:"a", label:"A"},
    {id:"b", label:"B"}]`, `default_model = "a"`.
  - Render `<ModelSection />`; assert dropdown lists both options;
    select "b" → assert `useExperiment.byConv[c].model === "b"`;
    click "Use default" → assert `model === null`.
  - Resolved-value line reads `"a"` initially and `"b"` after select.
  Fails: component doesn't exist.

- [ ] **T22 — implement.** Create
  `frontend/src/agent-anatomy/ModelSection.tsx`. T21 green.

### Frontend — Tools section (mirrors Experiment tools)

- [ ] **T23 — test first (AC16).** Add subtests inside the dialog
  test (or a small `Tools.test.tsx`):
  - Mock `getConfig.tools = [{name:"x", description:"d1"},
    {name:"y", description:"d2"}]`.
  - Toggle a checkbox off → `useExperiment.byConv[c].enabledTools`
    excludes it; re-toggle → returns to `null` (all enabled).
  - Count badge reads `"All enabled"` initially, then `"1 of 2
    enabled"` after one is toggled off.
  Fails: component doesn't exist (or doesn't render the badge).

- [ ] **T24 — implement.** Create
  `frontend/src/agent-anatomy/ToolsSection.tsx`. If the JSX is
  near-identical to `SettingsExperiment`'s tools block, extract a
  shared `<ToolsChecklist />` component now (DRY). T23 green.

### Frontend — Knowledge section

- [ ] **T25 — test first (AC8, AC9, AC17, AC18).** Add
  `frontend/src/agent-anatomy/Knowledge.test.tsx`:
  - Mock `fetch` (or the API wrappers) so:
    - `GET /api/corpus` returns two corpus files.
    - `GET /api/sessions/{id}/documents` returns one upload.
  - Render `<KnowledgeSection />`.
  - Assert corpus rows render with lock indicator (no remove
    button) and the bilingual hint.
  - Assert upload row renders with the filename and a remove ✕.
  - Click ✕ → assert `DELETE /api/sessions/{id}/documents/{doc}` was
    called with the right ids; row disappears (optimistic).
  - Click **Add document** → assert the shared upload hook (or
    `fetch POST .../documents`) is invoked when a file is supplied.
  Fails: component doesn't exist; `getCorpus` doesn't exist.

- [ ] **T26 — implement.** Create
  `frontend/src/agent-anatomy/KnowledgeSection.tsx`:
  - `useEffect` on mount + on `activeSessionId` change:
    `getCorpus()` (cache once per app load), `listDocuments(sid)`.
  - Corpus block: read-only rows with lock icon + filename + preview
    + size.
  - Uploads block: rows with filename + size + uploaded-at + ✕
    button; **Add document** button at the top.
  - The Add button reuses the same upload hook the composer uses (if
    coupled, extract into `frontend/src/lib/uploads.ts` first and
    update both call sites).
  T25 green.

### Frontend — Skills section

- [ ] **T27 — test first (AC19).** Add
  `frontend/src/agent-anatomy/Skills.test.tsx`:
  - Render `<SkillsSection />`; assert the bilingual "shared across
    conversations" callout text is in the DOM (find by visible text).
  - Assert a `data-testid` (or hostname element) from
    `<SkillsSettings />` is present. Fails: component doesn't exist.

- [ ] **T28 — implement.** Create
  `frontend/src/agent-anatomy/SkillsSection.tsx`. T27 green.

### Frontend — the Dialog (shell + open button)

- [ ] **T29 — test first (AC11, AC12, AC16 outer).** Add
  `frontend/src/components/AgentAnatomyDialog.test.tsx`:
  - Render the simulator at the Agent station; find
    `data-testid="open-agent-config"`; click → assert
    `role="dialog"` mounts and contains the seven section headings
    (find by visible text matching the bilingual `agentAnatomy.*`
    titles).
  - Press Esc → dialog unmounts. Re-open, click backdrop → unmounts.
    Re-open, click ✕ → unmounts.
  - Toggle a tool inside the dialog → `useExperiment.byConv[c].
    enabledTools` updates (AC16 outer pass).
  Fails: dialog and button don't exist.

- [ ] **T30 — implement.** Create
  `frontend/src/components/AgentAnatomyDialog.tsx`:
  - Portal-mounted dialog with backdrop + Esc handler + focus trap
    (minimal; use existing patterns if any).
  - Left-rail anchor nav (anchor links to each section).
  - Compose the seven section components in order.
  Then wire the open button into `frontend/src/components/nodes/AgentNode.tsx`
  (or whatever renders the Agent station body):
  - Add a **"Configurar agente"** button next to "Open full view →".
  - Render the conversation's `agent_name` next to the station title
    when set; a small ✏️ next to it also opens the dialog (scrolled
    to Identity).
  T29 green.

### Frontend — i18n parity

- [ ] **T31 — test first (AC20).** Add
  `frontend/src/i18n/agentAnatomy.test.ts`:
  - Import `strings.en.agentAnatomy` and `strings.pt.agentAnatomy`.
  - Walk every leaf; assert both languages have a non-empty string.
  - Assert the two trees have identical key sets (no asymmetric
    additions).
  Fails: `agentAnatomy` doesn't exist.

- [ ] **T32 — implement.** Add the `agentAnatomy.*` keys to
  `frontend/src/i18n/strings.ts` per the plan's i18n table. T31 green.

### Wiring + cleanup

- [ ] **T33 — protocol-mirror sanity (AC21).** Re-run the existing
  `phases.test.ts` parity test and the `STAGE_TO_STATION`
  exhaustiveness check; assert both stay green untouched. `npm run
  build` (`tsc --noEmit`) clean.

- [ ] **T34 — keep 041 in sync.** In
  `frontend/src/settings/SettingsExperiment.tsx` (and its strings),
  rename the system-prompt textarea's label/blurb to make explicit it
  is the **guardrails** layer; mention that the agent role is editable
  from the Agent station. Bilingual. The store binding does not
  change (still `systemPrompt`).

- [ ] **T35 — refactor pass.** Extract `<ToolsChecklist />` if the
  duplicate JSX between `SettingsExperiment` and `ToolsSection` was
  shimmed in T24. Collapse any duplicate fetchers. Tests stay green.

- [ ] **T36 — manual smoke (verify skill).** Load the app. Open a
  fresh conversation. Click ⚙️ button on the Agent station — assert
  dialog mounts with seven sections. Set a name; agent station
  header reflects it. Edit each prompt; resets work. Switch model;
  send a turn; trace's `llm.prompt.model` equals the chosen value;
  the composed system message contains both guardrails and role.
  Upload a doc from Knowledge; verify it lands in the agent's
  retrievable set (next send retrieves from it). Remove a doc; chip
  / row updates. Switch conversation; values reset to that
  conversation's overrides. Confirm 041 Settings page still works.

- [ ] **T37 — memory pointer.** Add a `spec-042-agent-anatomy.md`
  memory file with the gotchas (prompt rename, allowlist, session
  column migration). Add a line in `MEMORY.md` (one-line index).

## Definition of done

- [ ] Every acceptance criterion in `spec.md` maps to at least one
  passing test.
- [ ] `ruff check .` clean.
- [ ] `ruff format .` clean.
- [ ] `pytest -q` green with `OPENAI_API_KEY` (the `@pytest.mark.openai`
  e2e test runs); keyless guard tests still pass without a key.
- [ ] `npm run build` passes (`tsc --noEmit` + build).
- [ ] `npm test` green (Vitest, including all new files).
- [ ] Protocol mirror in sync: `ChatRequest` ↔ `ChatRequestBody`
  echo type; no new `Stage` / `Phase`; `STAGE_TO_STATION` and
  `STAGE_TO_PHASE` remain total without edits.
- [ ] All new user-facing text exists in en **and** pt under
  `agentAnatomy.*`.
- [ ] `default_system_prompt` on `/api/config` carries the
  `GUARDRAILS_PROMPT` text; `default_agent_prompt` carries the
  `AGENT_PROMPT` text; both non-empty.
- [ ] `sessions` table has `agent_name` column; migration idempotent.
- [ ] `spec.md` status updated to `done`.
- [ ] Memory updated (new entry: `spec-042-agent-anatomy.md`) once
  shipped.
