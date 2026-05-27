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
- Specs are an **append-only decision record** (like ADRs/RFCs): kept permanently, never
  renumbered or deleted. When a decision is replaced, write a new spec and mark the old
  one `superseded` with a link — don't edit history. The current *state* of the system
  lives in [`../docs/architecture.md`](../docs/architecture.md), not here.

## Index

The registry of every spec and where it stands. Keep this in sync when you add a spec or
move one along the lifecycle.

Legend: ✅ done · 🔧 in-progress · 📋 planned · 🔍 clarified · ✏️ draft

| # | Feature | Status |
|---|---|---|
| 000 | [Core agentic request pipeline](000-core-pipeline/spec.md) | ✅ done |
| 001 | [Theme configuration (dark / light)](001-theme-configuration/spec.md) | ✅ done |
| 002 | [Interactive chat](002-interactive-chat/spec.md) | ✅ done |
| 003 | [OpenAI-only (remove demo mode)](003-openai-only/spec.md) | ✅ done |
| 004 | [Timeline navigable by phase](004-timeline-phases/spec.md) | ✅ done |
| 005 | [Guided tour (storytelling)](005-guided-tour/spec.md) | ✅ done |
| 006 | [Interactive experiments (prompt, tools, top-k)](006-interactive-experiments/spec.md) | ✅ done |
| 007 | [Deeper numeric transparency](007-numeric-transparency/spec.md) | ✅ done |
| 008 | [Scenario framework (maturity ladder)](008-scenario-framework/spec.md) | ✅ done |
| 009 | [Live pacing](009-live-pacing/spec.md) | ✅ done |
| 010 | [The LLM is the brain](010-llm-as-brain/spec.md) | ✅ done |
| 011 | [Real token + cost accounting](011-token-cost/spec.md) | ✅ done |
| 012 | [Chat bubble lockstep with paced flow](012-chat-flow-sync/spec.md) | ✅ done |
| 013 | [Reclaim canvas space + sharpen disclosure](013-canvas-space-disclosure/spec.md) | ✅ done |
| 014 | [Scripted, anchored guided tour](014-tour-scripted/spec.md) | ✅ done |
| 015 | [Per-phase latency waterfall](015-latency-waterfall/spec.md) | ✅ done |
| 016 | [Cancel an in-flight run](016-cancel-stream/spec.md) | ✅ done |
| 017 | [Failure injection](017-failure-injection/spec.md) | ✅ done |
| 018 | [Cumulative HUD + pre-send estimate](018-cumulative-hud/spec.md) | ✅ done |
| 019 | [Inline citations / provenance](019-inline-citations/spec.md) | ✅ done |
| 020 | [Diff the context window between turns](020-turn-diff/spec.md) | ✅ done |
| 021 | [Abstain / empty-result badge](021-abstain-badge/spec.md) | ✅ done |
| 022 | [Revisit a turn's trace (message ↔ trace)](022-message-trace-link/spec.md) | ✅ done |
| 023 | [Learn content enrichment & cloud-awareness](023-learn-content-enrichment/spec.md) | ✅ done |
| 024 | [Cloud-aware Learn map — "Build on {cloud}" column](024-learn-cloud-column/spec.md) | ✅ done |
| 025 | [Clear databases — reset control in Settings](025-clear-databases/spec.md) | ✅ done |
| 026 | [Agent tool autonomy — canonical ReAct](026-agent-tool-autonomy/spec.md) | ✅ done |
| 027 | [Skills — global, agent-loadable catalog](027-skills/spec.md) | ✅ done |
| 028 | [Why this layer / what breaks without it](028-why-this-layer/spec.md) | 🔍 clarified |
| 029 | [Time-to-first-token & generation throughput](029-ttft-throughput/spec.md) | 🔍 clarified |

## How SDD + TDD show up together

The acceptance criteria in `spec.md` are the bridge: each one is a testable statement,
and each becomes a test under `backend/tests/` (or a frontend type/behavior check). A
finished feature can point from every criterion to the test that proves it.
