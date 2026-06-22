---
name: new-spec
description: Scaffold a new Spec-Driven-Development spec under specs/NNN-feature-name/ from the template. Use this whenever the user asks for a new feature, a behavior change, a new Stage/Phase, a new station/hop/tier, or any event-protocol change — BEFORE writing any code. This project is spec-first (constitution §10); jumping to code is the #1 process violation.
---

This project is **spec-first (SDD)** and **test-first (TDD)** — non-negotiable, even when the user does not ask for it (`.specify/constitution.md` §9, §10; `CLAUDE.md` "How we build here"). A new feature, a new user-facing behavior, a new `Stage`/`Phase`, a new station/hop/tier, or any event-protocol change gets a **spec before code**. When unsure (gray zone), write the spec.

If the user skipped the spec and asked for code directly, **stop and remind them**, then run this skill.

## Steps

1. **Find the next number.** List `specs/` and take the highest `NNN-` prefix + 1, zero-padded (`001`, `002`, …). Sequential, never reuse.
2. **Copy the template.** `cp -r specs/_template specs/NNN-feature-name/` (kebab-case, short, descriptive).
3. **Fill `spec.md`** — WHAT + WHY only. No implementation detail (if you name a file or a function, it belongs in `plan.md`). Numbered, **testable** acceptance criteria (each becomes a failing test). Fill the "Protocol / stage impact" block. Set `Status: draft`.
4. **Resolve every open question** in the "Open questions (clarify)" list *with the user* before moving on — empty that list to reach `clarified`.
5. **Fill `plan.md`** — HOW: approach, affected files, protocol/i18n/cloud impact, and a test strategy mapping **each AC → a test**.
6. **Fill `tasks.md`** — ordered TDD checklist; each implement task is preceded by the failing test that drives it.
7. Move status along as you go: `draft → clarified → planned → in-progress → done`.

## Guardrails from the constitution (call these out in the spec when relevant)

- **§1 protocol-is-the-contract** — a new `Stage` must change `backend/app/schemas.py` AND `frontend/src/types/events.ts` in the same commit. (Then use the `add-stage` skill to implement.)
- **§4 bilingual** — every new user-facing string ships `en` + `pt`. Note this in "User-facing behavior".
- **§5 cloud map** — a new tier/station fills `azure`/`aws`/`gcp`.
- **§6 every Stage maps to a station** in `stations.ts`.

The canonical references are `specs/README.md` (the workflow), `specs/000-core-pipeline/` (a worked example where every AC points at a passing test), and `.specify/constitution.md`. Read them rather than re-deriving the rules.

Do **not** start writing production code from this skill — finish the spec, get it to `clarified`/`planned`, then implement red→green→refactor (see the `add-stage` skill for protocol changes, and the `verify-gates` skill before calling anything done).
