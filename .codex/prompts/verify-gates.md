---
description: Run the local mirror of CI plus the cross-cutting constitution gates, and report pass/fail.
---

Run AgentSimulator's "definition of done" — the local mirror of `.github/workflows/ci.yml` plus the constitution's cross-cutting gates — then report a concise ✅/❌ summary. **Do not claim done if anything is red; paste the failing output and propose the fix.**

## Backend (from `backend/`)

Needs `OPENAI_API_KEY` (keyless guard tests still run; `[openai]`-marked tests skip without it).

```bash
ruff check .            # lint — line-length 100, E501 ignored
ruff format --check .   # formatting (run `ruff format .` to fix)
pytest -q               # all tests, Python 3.12, structural assertions
```

## Frontend (from `frontend/`)

```bash
npm run build           # tsc --noEmit + vite build (type errors are gate failures)
npm test                # Vitest — *.test.ts(x) under src/
```

## Cross-cutting gates (inspect the diff — tools won't fully catch these)

- **§1 protocol mirror** — if `backend/app/schemas.py` changed `Stage`/`Phase`/`TraceEvent`, did `frontend/src/types/events.ts` change to match, in the same commit?
- **§6 every Stage maps to a station** — any new `Stage` in exactly one station's `stages` (stations.ts) and in `STAGE_TO_PHASE` (phases.ts)? `readoutFor`/`renderDetail` switches updated?
- **§4 bilingual** — every new user-facing string has both `en` and `pt`? (Run `/review-i18n` for a thorough sweep.)
- **§5 cloud map** — any new tier/station fills `azure`/`aws`/`gcp`?
- **§9/§10 SDD/TDD** — a feature has a spec under `specs/`; a behavior change was driven by a test that failed first.

## Reporting

A ✅/❌ checklist per gate. On failure: name the gate, paste the relevant output, propose the fix. If `ruff format --check` fails, offer to run `ruff format .`.
