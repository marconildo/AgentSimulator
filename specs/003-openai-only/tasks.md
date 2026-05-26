# Tasks: OpenAI-only (remove demo mode)

> Ordered TDD checklist for `spec.md` + `plan.md`. Test first (red → green → refactor).
> `[offline]` runs without a key; `[openai]` needs a key. Check boxes as you go.

## Phase 0 — Governance

- [x] **T0 — amend constitution + supersede**: rewrite `.specify/constitution.md` §2 and §3
  and the quality gates (text in `spec.md` → *Constitution impact*); mark `specs/000-core-pipeline/spec.md`
  AC11 as superseded by 003. *(No test — governance.)*

## Phase 1 — Fail fast without a key (AC1)

- [x] **T1 — test first `[offline]`**: `tests/test_provider_required.py` — with
  `OPENAI_API_KEY` empty, `get_provider()` raises a clear, typed error naming the key.
- [x] **T2 — implement**: `get_provider()` raises when no key; remove the `is_demo` branch.

## Phase 2 — Remove demo from config + providers (AC2, AC3)

- [x] **T3 — test first `[offline]`**: `tests/test_no_demo.py` — `Settings` has no
  `demo_mode`/`is_demo`; `import app.llm.mock_provider` raises `ModuleNotFoundError`;
  `MockEmbeddings` is absent from `app.rag.embeddings`.
- [x] **T4 — implement**: delete `llm/mock_provider.py`; remove `MockEmbeddings` + `is_demo`
  branch from `rag/embeddings.py`; remove `demo_mode`/`is_demo` from `config.py`; drop the
  `demo=` print in `rag/ingest.py`. `get_embeddings()` / `embedding_model_name()` are
  OpenAI-only.

## Phase 3 — Health + frontend cleanup (AC4)

- [x] **T5 — test first `[offline]`**: in `tests/test_api.py`, assert `/api/health` has **no**
  `demo_mode` key (and reports the live model).
- [x] **T6 — implement (backend)**: remove `demo_mode` from `/api/health` and from the
  `backend` stage `data` in `main.py`.
- [x] **T7 — implement (frontend)**: remove the demo badge + `demo_mode` health field in
  `App.tsx`; remove the `demo_mode` readout rows in `InspectorPanel.tsx` + `StationNode.tsx`;
  delete `demoMode`/`demoTitle`/`demoModeKey` strings (en + pt) in `strings.ts`. Keep the
  model label. `tsc`/Vitest green.

## Phase 4 — Pipeline against real OpenAI (AC5, AC6)

- [x] **T8 — test first `[openai]`**: revise `tests/test_api.py` / `test_agent.py` /
  `test_rag.py` to assert **structurally** (stages fire, tool used, answer non-empty, relevant
  doc ranks first) and remove `DEMO_MODE` assumptions.
- [x] **T9 — implement**: update `conftest.py` (drop `DEMO_MODE`, require key / skip
  `[openai]` suite when absent, build index with OpenAI embeddings); make tests pass with a
  key locally.

## Phase 5 — CI + docs

- [x] **T10 — CI**: `ci.yml` backend job drops `DEMO_MODE`, adds `OPENAI_API_KEY:
  ${{ secrets.OPENAI_API_KEY }}`. ⚠️ **Manual owner step:** add the `OPENAI_API_KEY` secret in
  GitHub repo *Settings → Secrets and variables → Actions* (cannot be done from code).
- [x] **T11 — docs**: update `CLAUDE.md` + `docs/*` demo-mode wording to OpenAI-only.

## Phase 6 — Verify

- [x] **T12 — gates**: `ruff check .` · `ruff format .` · `pytest -q` (AC1–AC4 pass without a
  key; AC5/AC6 with a key) · `npm run build` · `npm test`.

## Definition of done

- [x] Every acceptance criterion maps to a passing test (`[openai]` verified with a key)
- [x] `ruff check .` clean · `npm run build` + `npm test` green
- [x] `pytest -q` green (AC1–AC4 keyless; AC5/AC6 with `OPENAI_API_KEY`)
- [x] No `demo_mode`/`is_demo`/`DEMO_MODE`/`MockProvider`/`MockEmbeddings` left in the repo
- [x] Constitution §2/§3 + gates amended; spec 000 AC11 marked superseded
- [x] CLAUDE.md / docs updated; `ci.yml` uses the key secret
- [x] `spec.md` status updated to `done`
