# Plan: OpenAI-only (remove demo mode)

> HOW for `spec.md` (`clarified`). Amends constitution §2/§3 (task T0) and supersedes
> spec 000 AC11 — both land in this change.

## Approach

Collapse the dual-mode swap into a single OpenAI path and delete the mock half. The
`LLMProvider` ABC stays as a thin seam (one implementation), but `Settings.is_demo`,
`demo_mode`, the `DEMO_MODE` env, `MockProvider` and `MockEmbeddings` all go. `get_provider()`
/ `get_embeddings()` construct the OpenAI implementations unconditionally and **fail fast**
with a clear error when the key is missing. The frontend drops the demo badge and demo-only
strings/readouts. CI is reconfigured to provide the key as a secret and tests shift to
structural assertions.

*Alternative considered (rejected by owner):* keep mocks as test-only doubles so CI stays
offline/free. The owner chose real OpenAI in tests (D2/D3); recorded cassettes are parked in
*Out of scope* as the way to recover free/deterministic CI later.

## Affected files

**Backend**
- `backend/app/config.py` — remove `demo_mode` field + `is_demo` property; add a required
  `openai_api_key` validation (empty → error surfaced at use). Keep `llm_model`,
  `embedding_model`.
- `backend/app/llm/provider.py` — `get_provider()` always returns `OpenAIProvider`; raise a
  clear error if no key. Drop the demo docstring/branch.
- `backend/app/llm/mock_provider.py` — **delete**.
- `backend/app/rag/embeddings.py` — remove `MockEmbeddings` + the `is_demo` branch;
  `get_embeddings()` always OpenAI; `embedding_model_name()` returns the OpenAI model.
- `backend/app/rag/ingest.py` — drop the `demo=` print.
- `backend/app/main.py` — `/api/health` drops `demo_mode`; remove `demo_mode` from the
  `backend` stage `data`. Optionally a startup check that fails fast without a key.
- `backend/tests/conftest.py` — stop setting `DEMO_MODE`; require `OPENAI_API_KEY` (skip the
  key-dependent suite if absent, except AC1's guard test).

**Frontend**
- `frontend/src/App.tsx` — remove the `demo_mode` health field + the badge branch; always show
  the OpenAI model.
- `frontend/src/i18n/strings.ts` — remove `app.demoMode`, `app.demoTitle`, `inspector.demoModeKey`
  (and any now-unused). Keep `liveTitle` or fold into a single model label.
- `frontend/src/components/InspectorPanel.tsx` + `nodes/StationNode.tsx` — remove the
  `demo_mode` readout rows.

**Infra / docs**
- `.github/workflows/ci.yml` — backend job: drop `DEMO_MODE`, add
  `OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}`.
- `CLAUDE.md` (+ `docs/*`) — update demo-mode wording to "OpenAI-only".
- `specs/000-core-pipeline/spec.md` — mark AC11 superseded by 003 (D5).
- `.specify/constitution.md` — amend §2/§3 + quality gates (T0).

## Protocol changes (constitution §1)

None. `Stage`/`Phase`/`TraceEvent` unchanged; only the non-protocol `/api/health` and
`backend` stage `data` lose `demo_mode`.

## Data model changes

None (vector store + relational DB unchanged). Note: the persisted Chroma index, if it was
built by the old mock embeddings (512-dim), is rebuilt at OpenAI dim on first boot via the
existing `index_matches_model()` path — no code change needed.

## i18n strings (constitution §4)

Net removal. No new strings; delete `demoMode`/`demoTitle`/`demoModeKey` (en + pt) and any
demo-only prose. Keep the model label shown in the header.

| key / location | change |
|---|---|
| `app.demoMode`, `app.demoTitle`, `inspector.demoModeKey` | removed (en + pt) |
| `app.liveTitle` / model label | kept; shown unconditionally |

## Cloud map (constitution §5)

n/a — no tier/station added or removed.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 `[offline]` | no key → `get_provider()` raises a clear typed error | `tests/test_provider_required.py` (new) |
| AC2 `[offline]` | no `demo_mode`/`is_demo` on `Settings`; `DEMO_MODE` unused (grep/attr guard) | `tests/test_no_demo.py` (new) |
| AC3 `[offline]` | `import app.llm.mock_provider` fails; `MockEmbeddings` absent | `tests/test_no_demo.py` |
| AC4 `[offline]` | `/api/health` has no `demo_mode` key (TestClient, no model call needed) | `tests/test_api.py` |
| AC5 `[openai]` | with key, `get_provider()` is `OpenAIProvider`; pipeline runs (structural) | `tests/test_api.py`, `tests/test_agent.py` |
| AC6 `[openai]` | real-embedding retrieval ranks the relevant corpus doc first | `tests/test_rag.py` |

Existing tests are revised to remove `DEMO_MODE` assumptions and assert **structurally** (D4).
Frontend: `npm run build` (tsc) + `npm test` (Vitest) stay green after removing demo strings.

## Risks / trade-offs (owner-accepted)

- **CI cost + flakiness + fork PRs** — real OpenAI in CI (D3). Mitigate with a cheap model,
  low `max_tokens`, structural assertions; revisit with recorded cassettes (out of scope).
- **Health/readout regression** — removing `demo_mode` touches two FE readouts and the health
  payload; the `tsc` build + Vitest guard them.
- **Index dimension** — a stale 512-dim mock index is auto-rebuilt at OpenAI dim on boot; no
  manual migration, but the first boot after the switch rebuilds the corpus.
