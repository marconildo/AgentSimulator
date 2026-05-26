# Development workflow — SDD + TDD

This project is built **spec-first** and **test-first**. Those two disciplines are not optional
extras and not something we turn on only for big features — they are how *every* change is made
here, whether or not anyone asks for them.

- **SDD (Spec-Driven Development)** answers *what* and *why*. The intent is written and reviewed
  before the code, and the spec stays the source of truth.
- **TDD (Test-Driven Development)** proves *it works*. Acceptance criteria become failing tests,
  then code makes them pass, then we refactor.

They interlock: each acceptance criterion in a spec is a testable statement, and each becomes a
test. A finished feature can point from every criterion to the test that guards it.

The binding rules live in two places — read them before starting work:

- [`../.specify/constitution.md`](../.specify/constitution.md) — the project's 10 non-negotiable
  principles, the quality gates, and the amendment process. **The constitution wins on conflict.**
- [`../specs/README.md`](../specs/README.md) — the SDD workflow and folder layout.

This document is the contributor-facing companion to those two. (Like the other developer docs and
the specs, it is written in English; the *app's* user-facing text is bilingual en/pt — see
constitution §4.)

---

## The loop

```
spec.md ──clarify──> plan.md ──> tasks.md ──TDD──> code + tests ──> gates green
  WHAT/WHY            HOW          WORK             red→green→refactor
```

For each new feature:

1. **Specify** — copy [`../specs/_template/`](../specs/_template) to
   `specs/NNN-feature-name/` (zero-padded, sequential) and fill `spec.md`: the problem, goals,
   non-goals, user-facing behavior, and **numbered, testable acceptance criteria**. No
   implementation detail yet — if you catch yourself naming a file or function, it belongs in the
   plan.
2. **Clarify** — resolve every open question before planning. This is the "grill me" step: an
   interview that removes ambiguity. Empty the *Open questions* list, then set the status to
   `clarified`.
3. **Plan** — fill `plan.md`: the approach (and alternatives considered), affected files, protocol
   / i18n / cloud impact, data-model changes, and a **test strategy** that maps each acceptance
   criterion to at least one test.
4. **Tasks** — fill `tasks.md`: an ordered checklist where each implement task is preceded by the
   failing test that should drive it.
5. **Implement (TDD)** — for each task: write the failing test (**red**) → implement (**green**) →
   **refactor**. Check the box. Tests run against real OpenAI (`OPENAI_API_KEY` set) and assert
   structurally; mark model/embedding-dependent tests `@pytest.mark.openai` (skipped without a key).
6. **Verify** — all quality gates pass and every acceptance criterion maps to a passing test. Move
   the spec's status to `done`.

A spec's status walks `draft → clarified → planned → in-progress → done`.

**Worked example:** [`../specs/000-core-pipeline/`](../specs/000-core-pipeline) is a *retroactive*
spec of the core system that already shipped — its `plan.md` maps all 11 acceptance criteria to the
existing tests. Use it as the reference for shape and tone.

---

## Does a change need a spec?

A spec is for **features and behavior changes**, not for every edit. **TDD, on the other hand,
applies to anything that changes behavior** — including bug fixes.

| Change | Spec? | TDD? |
|---|---|---|
| New feature, new user-facing behavior, **new `Stage` / `Phase`**, new station / hop / tier, any event-protocol change | **Yes** — full `spec → plan → tasks` | Yes |
| Bug fix · small adjustment · behavior-preserving refactor | **No** | **Yes** — write a failing regression test that reproduces it, *then* fix |
| Docs · comments · formatting · dependency bumps · pure chores | No | n/a |

So: **bugs, fixes, and small adjustments don't need a spec folder** — but they still get a test
first (a regression test that fails on the bug, passes after the fix). The discipline you skip for
small changes is SDD, never TDD.

**Gray-zone rule:** if a change touches the event protocol (constitution §1), adds or removes a
`Stage`, or adds a station / hop / tier, treat it as a **feature → spec required**, however small it
looks — those are exactly the changes the contract and the visual model depend on. When in doubt,
write the spec; it's cheap and it's the record of intent.

---

## Quality gates (must be green before "done")

These mirror [`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

```bash
# Backend (from backend/)
ruff check .          # lint — line-length 100, E501 ignored
ruff format .         # formatting
pytest -q             # tests, Python 3.12, with OPENAI_API_KEY (keyless guards still run)

# Frontend (from frontend/)
npm run build         # tsc --noEmit + vite build, Node 20
npm test              # Vitest
```

Plus the cross-cutting gates from the constitution:

- **Protocol mirror (§1)** — `backend/app/schemas.py` ↔ `frontend/src/types/events.ts` changed in
  the same commit.
- **Every `Stage` maps to a station (§6)** — listed in exactly one station's `stages` array in
  `frontend/src/lib/stations.ts`, with a `case` added in both `readoutFor` (FlowCanvas) and
  `renderDetail` (InspectorPanel).
- **Bilingual (§4)** — every new user-facing string ships in both `en` and `pt`.
- **Cloud map (§5)** — any new tier/station fills all three of `azure` / `aws` / `gcp`.

---

## See also

- [`architecture.md`](architecture.md) — the two apps and the streaming event protocol.
- [`how-it-works.md`](how-it-works.md) — a single message's journey through every station.
- [`../.specify/constitution.md`](../.specify/constitution.md) — the principles these gates enforce.
- [`../specs/README.md`](../specs/README.md) — the SDD workflow in full.
