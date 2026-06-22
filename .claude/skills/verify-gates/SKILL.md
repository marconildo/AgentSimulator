---
name: verify-gates
description: Run the full local mirror of CI (the project's "definition of done") and report what passes/fails. Use before declaring any change done, before opening a PR, or when the user asks to verify. Mirrors .github/workflows/ci.yml plus the cross-cutting constitution gates.
---

A change is **done** only when these are green (constitution "Quality gates"; mirrors `.github/workflows/ci.yml`). Run them, then report a concise pass/fail summary — do not claim done if anything is red; paste the failing output.

## Backend (from `backend/`)

Needs `OPENAI_API_KEY` (keyless guard tests still run without one; `[openai]`-marked tests skip).

```bash
ruff check .            # lint — line-length 100, E501 ignored
ruff format --check .   # formatting (use `ruff format .` to fix)
pytest -q               # all tests, Python 3.12, structural assertions
```

## Frontend (from `frontend/`)

```bash
npm run build           # tsc --noEmit + vite build (type errors are gate failures)
npm test                # Vitest — *.test.ts(x) under src/
```

## Cross-cutting gates (the ones tools won't fully catch)

Check these by inspecting the diff — they are constitution principles, not just CI steps:

- **§1 protocol mirror** — if `backend/app/schemas.py` changed `Stage`/`Phase`/`TraceEvent`, did `frontend/src/types/events.ts` change to match, in the same commit?
- **§6 every Stage maps to a station** — any new `Stage` present in exactly one station's `stages` in `stations.ts` (and in `STAGE_TO_PHASE`)? The exhaustive `readoutFor`/`renderDetail` switches updated?
- **§4 bilingual** — every new user-facing string has both `en` and `pt`? (Delegate to the `i18n-auditor` agent for a thorough sweep.)
- **§5 cloud map** — any new tier/station fills `azure`/`aws`/`gcp`?
- **§9/§10 SDD/TDD** — a feature has a spec under `specs/`; a behavior change was driven by a test that failed first.

## Reporting

Summarize as a checklist with ✅/❌ per gate. On failure: name the gate, paste the relevant output, and propose the fix — don't silently move on. If `ruff format --check` fails, offer to run `ruff format .`.
