---
description: Scaffold a new Spec-Driven-Development spec under specs/NNN-feature-name/ before writing any feature code.
argument-hint: <feature name>
---

You are working in the **AgentSimulator** repo, which is **spec-first (SDD)** and **test-first (TDD)** — non-negotiable, even when not asked (see `AGENTS.md` "How we build here" and `.specify/constitution.md` §9/§10). A new feature, behavior change, new `Stage`/`Phase`, or new station/hop/tier gets a **spec before code**. When unsure (gray zone), write the spec.

The feature to spec: **$ARGUMENTS**

If the user asked for code directly and skipped the spec, **stop and remind them**, then do this:

1. **Find the next number** — list `specs/`, take the highest `NNN-` prefix + 1, zero-padded, sequential (never reuse).
2. **Copy the template** — `cp -r specs/_template specs/NNN-feature-name/` (kebab-case, short).
3. **Fill `spec.md`** — WHAT + WHY only, **no implementation detail** (if you name a file or function, it belongs in `plan.md`). Numbered, **testable** acceptance criteria (each becomes a failing test). Fill the "Protocol / stage impact" block. `Status: draft`.
4. **Resolve every open question** in the "Open questions (clarify)" list *with the user* before continuing — empty it to reach `clarified`.
5. **Fill `plan.md`** — HOW: approach, affected files, protocol/i18n/cloud impact, and a test strategy mapping **each AC → a test**.
6. **Fill `tasks.md`** — ordered TDD checklist; each implement task preceded by the failing test that drives it.
7. Advance status as you go: `draft → clarified → planned → in-progress → done`.

Call out the relevant constitution guardrails in the spec when they apply: §1 protocol mirror (a new `Stage` changes `backend/app/schemas.py` AND `frontend/src/types/events.ts` same commit), §4 bilingual en/pt, §5 cloud map (azure/aws/gcp), §6 every Stage maps to a station.

Canonical references: `specs/README.md` (the workflow), `specs/000-core-pipeline/` (a worked example), `.specify/constitution.md`. **Do not start production code from this prompt** — finish the spec to `clarified`/`planned`, then implement red→green→refactor (use `/add-stage` for protocol changes, `/verify-gates` before done).
