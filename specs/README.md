# Specs — Spec-Driven Development (SDD)

This project is built **spec-first**: the intent is written and reviewed *before* the
code, and the spec stays the source of truth. SDD answers *what* and *why*; TDD proves
*it works*. The two interlock — acceptance criteria in a spec become failing tests.

Governing principles live in [`../.specify/constitution.md`](../.specify/constitution.md).

## Layout

```
.specify/
  constitution.md          # project principles (written once, amended on purpose)
specs/
  README.md                # this file — the workflow
  _template/               # copy this to start a feature
    spec.md                # WHAT + WHY + acceptance criteria
    plan.md                # HOW — technical approach, affected files
    tasks.md               # the work, as a TDD checklist
  NNN-feature-name/        # one folder per feature (001-, 002-, ...)
```

## Workflow

For each new feature:

1. **Specify** — copy `_template/` to `specs/NNN-feature-name/` and fill `spec.md`.
   Describe behavior and acceptance criteria; **no implementation detail yet**.
2. **Clarify** — resolve every open question before planning. This is the "grill me"
   step: an interview that removes ambiguity. (Ask Claude to grill you on the spec.)
3. **Plan** — fill `plan.md`: approach, files touched, protocol/i18n/cloud impact,
   test strategy.
4. **Tasks** — fill `tasks.md`: ordered checklist, each item paired with its test.
5. **Implement (TDD)** — for each task: write the failing test (red) → implement
   (green) → refactor. Check the box.
6. **Verify** — all quality gates pass (`ruff`, `pytest`, `npm run build`) and every
   acceptance criterion maps to a passing test.

```
spec.md ──clarify──> plan.md ──> tasks.md ──TDD──> code + tests ──> gates green
  WHAT/WHY            HOW          WORK             red→green→refactor
```

## Numbering & status

- Folders are zero-padded, sequential: `001-`, `002-`, …
- Each `spec.md` carries a status: `draft → clarified → planned → in-progress → done`.

## How SDD + TDD show up together

The acceptance criteria in `spec.md` are the bridge: each one is a testable statement,
and each becomes a test under `backend/tests/` (or a frontend type/behavior check). A
finished feature can point from every criterion to the test that proves it.
