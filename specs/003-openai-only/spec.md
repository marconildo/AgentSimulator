# Spec: OpenAI-only (remove demo mode)

| | |
|---|---|
| **ID** | 003-openai-only |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Make **OpenAI mandatory** and **remove the offline demo mode entirely** — one
> provider, one code path, no mocks. The app requires an `OPENAI_API_KEY` to run;
> reasoning, embeddings, vector store, relational DB and MCP are all real. This is a
> deliberate platform decision to stop maintaining two modes. It **amends constitution
> §2 and §3** and **supersedes spec 000 AC11** (offline demo mode).

## Problem / motivation

The app currently ships two interchangeable modes — a deterministic offline **demo**
(mock LLM + mock embeddings, no key) and a **live OpenAI** mode — swapped behind
`Settings.is_demo`. Maintaining both doubles the surface: two providers, two embedding
paths, dimension-mismatch handling when switching, demo-only UI (badge/settings), and
mock-shaped test assertions. The owner wants a single, real OpenAI path to simplify the
codebase and the mental model. Demo mode is removed; OpenAI is required.

## Goals

- The app runs **only** against OpenAI; an `OPENAI_API_KEY` is **required**.
- With no key configured, the app **fails fast** at startup with a clear, actionable error
  (it does not silently start or fall back).
- Remove `MockProvider` and `MockEmbeddings` and every `demo_mode` / `is_demo` / `DEMO_MODE`
  branch from backend and frontend.
- `get_provider()` / `get_embeddings()` always return the OpenAI implementations.
- Remove the demo badge / demo-only UI; the header shows the live model.
- Tests run against **real OpenAI** (CI uses an `OPENAI_API_KEY` secret); assertions are
  **structural** (stages fired, tool used, answer non-empty, relevant doc ranks first) to
  tolerate model variability.

## Non-goals

- Multi-provider abstraction beyond OpenAI (the `LLMProvider` ABC may stay as a seam, but
  there is only one implementation).
- Changing the agent topology, RAG, MCP, or the event protocol.
- Caching/recording OpenAI responses for deterministic CI (deferred — see Out of scope).

## User-facing behavior

The header no longer shows a "demo mode" badge — it always shows the OpenAI model in use.
There is no offline experience: opening the app without a configured key surfaces a clear
"OpenAI key required" state instead of a working mock. Everything else (the canvas, the
chat, inspection, replay) behaves exactly as before, now always backed by OpenAI.

*(Any changed user-facing strings ship en **and** pt — constitution §4.)*

## Decisions (clarified)

- **D1 — OpenAI required to run.** No key → fail fast at startup with a clear error.
- **D2 — Mocks removed entirely.** Delete `mock_provider.py` and `MockEmbeddings`; no test
  doubles remain in the codebase. Tests call the real provider (owner's explicit choice).
- **D3 — CI uses a secret key.** `ci.yml` injects `OPENAI_API_KEY` from GitHub secrets and
  drops `DEMO_MODE`. Accept the cost and that fork PRs without the secret can't run the
  backend suite.
- **D4 — Structural assertions.** Existing/!new tests assert behavior structurally, not exact
  generated text, to tolerate model nondeterminism.
- **D5 — Supersede 000 AC11.** Spec 000's "Offline demo mode" criterion is marked superseded
  by this spec.

## Acceptance criteria

> `[offline]` here means "runs without a key" (the guard test); everything else needs a key.

1. **AC1 `[offline]`** — With no `OPENAI_API_KEY`, app startup (or `get_provider()`) raises a
   clear, typed error naming the missing key; the app does not start in a mock/fallback mode.
2. **AC2 `[offline]`** — `config.Settings` has no `demo_mode`/`is_demo`; `DEMO_MODE` is not
   read anywhere (grep guard test asserts the symbols are gone).
3. **AC3 `[offline]`** — `MockProvider` and `MockEmbeddings` no longer exist in the codebase
   (import of `app.llm.mock_provider` fails; `MockEmbeddings` symbol absent).
4. **AC4 `[offline]`** — `/api/health` no longer exposes `demo_mode`; the frontend has no demo
   badge/strings (type-check + grep guard).
5. **AC5 `[openai]`** — With a key, `get_provider()` returns `OpenAIProvider` and the full
   pipeline runs end to end (structural assertions: core stages fire, answer non-empty).
6. **AC6 `[openai]`** — RAG with real embeddings still ranks the obviously-relevant corpus doc
   first for a clear query.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- `DoneEvent`/`TraceEvent` shapes unchanged. `/api/health` payload drops `demo_mode`
  (not part of the trace protocol). The `backend` END `data.demo_mode` field is removed.

## Constitution impact (amendment in scope)

Lands in the same change (amendment process):

- **§2 (was "Demo mode is deterministic and offline")** → replace with **"Single provider
  (OpenAI), required."**: *"The app runs only against OpenAI and requires an `OPENAI_API_KEY`;
  there is no offline/mock mode. Tests exercise the real provider (CI provides the key as a
  secret) and assert structurally to tolerate model variability."*
- **§3 (was "Mock only reasoning and embeddings")** → replace with **"Everything is real."**:
  *"Reasoning, embeddings, the vector store, the relational database and MCP execution are all
  real. Nothing is mocked."*
- **Quality gates** — `pytest -q` is no longer "offline (`DEMO_MODE=true`)"; it runs with
  `OPENAI_API_KEY` set. Keep `ruff`, `npm run build`, `npm test`.
- Update `CLAUDE.md` references to demo mode (docs follow in the same change).

## Open questions (clarify before planning)

None — resolved; see **Decisions**.

## Out of scope / deferred

- Recording/replaying OpenAI responses (VCR-style cassettes) for deterministic, free CI — a
  good future option to undo the cost/flakiness trade-off without reintroducing demo mode.
- Supporting other providers (Azure OpenAI, Bedrock, Vertex) behind the same seam.
- Rewriting long-form docs beyond the demo-mode references.

## Risks / trade-offs (owner-accepted)

- **CI now costs money and can be flaky** (real model calls); fork PRs without the secret
  can't run the backend suite. Mitigated by structural assertions (D4) and a cheap model.
- **No more zero-key try-it** — the headline "runs fully offline" property is gone; this is
  intentional.
