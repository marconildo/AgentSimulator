# Spec: Skills — a global, agent-loadable skill catalog

| | |
|---|---|
| **ID** | 027-skills |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The simulator teaches how a production agent actually works. A pattern that is now
core to real agents — **Skills**: small, named bundles of instructions the model
discovers cheaply (by name + description) and **loads on demand** only when the
context calls for it — is not yet shown. This is exactly the *progressive-disclosure*
idea the visualizer already champions for the canvas, applied to the **prompt**: you
do not pour every instruction into the system prompt up front; you advertise a
catalog and let the agent **decide** to pull in the full body of a skill when it is
relevant.

Today the only way to shape behavior is the single system-prompt override (006). There
is no notion of a reusable, named instruction bundle, and no way for the agent to
*choose* to apply one. Adding Skills closes that gap and makes the agent's behavior
visibly the result of its own decisions: the learner sees a skill get **loaded** (a
real tool call) and then sees, on the answer, **which skills were applied**.

## Goals

- A **global skill catalog** — a skill is `{ name, description, body }` — persisted in
  the relational application database, managed through a **registration UI** where the
  user can create, edit and delete skills.
- The agent's **system prompt always advertises the catalog cheaply**: every skill's
  `name` + `description` (never the body) is listed, so the model knows what skills
  exist and when each is relevant — without paying for every body on every turn.
- A real tool, **`load_skill`**, exposed through MCP: when the agent decides a skill
  fits the current context, it **calls `load_skill`** and the skill's **full body** is
  fed back into the conversation (as the tool's observation) — the agent then follows
  those instructions. This is an honest agent decision, visible as a normal tool call.
- When a turn applies one or more skills, the chat surfaces a **"skills applied" badge**
  on the answer (a count + the list of applied skill names), in addition to the
  `load_skill` call showing in the tool-call trace.
- Skills are **user data**: the "Clear databases" reset (025) also **wipes the skill
  catalog**, reporting how many were removed.
- A small set of **seeded example skills** ships so the feature is demonstrable out of
  the box (idempotent — seeded once when the catalog is empty).
- Everything stays **real** (constitution §3) and **OpenAI-only** (§2); omitting skills
  (empty catalog / `load_skill` disabled) reproduces today's behavior exactly.

## Non-goals

- **No new `Stage`/`Phase`/`TraceEvent` and no new canvas station/hop/tier.** A skill
  load rides on the existing `mcp.call` stage (the MCP station); the "skills applied"
  badge is a pure projection of the trace, persisted with the message — the protocol
  surface and the `stations.ts` model are untouched (like 019-citations / 021-abstain).
- Not a versioned/forkable skill system, no skill categories, no per-skill enable
  toggle, no import/export — just create / edit / delete of a flat catalog.
- Not per-conversation skills — the catalog is **global** (clarified below). Skills are
  independent of the 006 per-conversation experiment overrides.
- No change to RAG, the corpus, `db.read`/`db.write` semantics (beyond persisting the
  applied-skill names alongside the existing retrieved chunks), or the existing MCP
  tools (`calculator`, `current_time`, `kb_lookup`).
- The model is **not forced** to load any skill — applying a skill is always its own
  decision, exactly like any other tool call.

## User-facing behavior

**Managing skills (⚙️ Settings → Skills).** A new **"Skills"** section in the existing
gear panel lists the catalog. Each row shows the skill `name` (and an inline edit
control); a **"New skill"** action opens an inline editor with three fields —
**Name**, **Description**, **Body** — plus **Save**, **Delete** and **Cancel**. The
list reflects creates/edits/deletes immediately.

**During a run.** The agent already sees the catalog (name + description) in its system
prompt. When it judges a skill relevant, it calls **`load_skill`** — which appears in
the tool-call trace like `calculator`/`kb_lookup` — and the skill's body comes back as
the tool result and shapes the answer.

**On the answer.** When at least one skill was loaded in a turn, a small **spark badge**
sits on the agent message footer (next to the existing sources control) showing the
**count** of applied skills; hovering reveals the heading **"N skills applied in this
response"** and the bullet list of applied skill names (mirrors the reference image).

**Clearing data.** The ⚙️ "Clear databases" action also empties the skill catalog and
its result line accounts for the skills removed.

All new prose (the Skills section labels, the editor field labels/buttons, the badge
heading) ships in **English and Portuguese** (constitution §4). Seeded *skill content*
(the example skills' names/descriptions/bodies) is example data, like the `data/corpus`
markdown — not UI chrome — so it is not subject to the bilingual rule.

## Acceptance criteria

> Backend tests that need the model are marked `[openai]` and assert **structurally**
> to tolerate variability (constitution §9); everything else is keyless.

1. **AC1 — Skill catalog CRUD persists.** Given the relational store, when a skill
   `{name, description, body}` is created, it appears in the catalog listing with an
   `id` and `created_at`/`updated_at`; updating it changes its fields (`updated_at`
   advances); deleting it removes it; creating a second skill with an existing `name`
   is rejected (the catalog keeps `name` unique).
2. **AC2 — The system prompt advertises name + description, never the body.** Given a
   non-empty catalog and `load_skill` enabled, the system prompt actually assembled for
   the model contains every skill's `name` and `description` and **does not contain any
   skill `body`** (bodies are loaded on demand only).
3. **AC3 — `load_skill` is an advertised tool.** The tool list the model sees (the
   `mcp.discover` END `tools` and `GET /api/config` `tools`) includes `load_skill` with
   a non-empty description. With `enabled_tools=[]`, `load_skill` is absent **and** the
   skill catalog block is omitted from the system prompt (no skills can be loaded, so
   nothing is advertised — honest).
4. **AC4 — `load_skill` returns the body via the canonical chain.** Given a skill named
   `S`, when `load_skill(name="S")` runs, its result is `S`'s **full body**; on an agent
   call it is fed back as a `ToolMessage` and an `mcp.call` END event records
   `{tool: "load_skill", args: {name: "S"}, result: <body>}`. An unknown name yields an
   `error:`-prefixed result (no crash).
5. **AC5 — A relevant question makes the agent apply a skill** `[openai]`. Given a skill
   whose `description` matches the user's request, when the agent runs, it elects to
   call `load_skill` for that skill (an `mcp.call` with `tool == "load_skill"` is
   emitted), the run completes with a non-empty answer, and the applied-skills set
   (distinct successful `load_skill` names) is non-empty.
6. **AC6 — Applied skills persist on the message and surface on the answer.** Given a
   turn that loaded ≥1 skill, the persisted message row carries the applied skill names;
   `GET /api/sessions/{id}/messages` returns them on that message; and the frontend
   derivation yields the same set, so the footer badge's count equals the number of
   distinct applied skills (and no badge renders when none were applied).
7. **AC7 — "Clear databases" wipes the catalog.** Given ≥1 skill, when `POST
   /api/data/clear` runs, the skills are removed and the response reports
   `skills_deleted` (> 0 when seeded); afterward the catalog listing is empty. It stays
   idempotent (a second call reports `skills_deleted: 0`) and still **keeps the built-in
   corpus** (025 behavior preserved: `indexed: true`).
8. **AC8 — Example skills are seeded idempotently.** Given an empty catalog, when the
   seed runs, ≥1 example skill exists, each with non-empty `name`/`description`/`body`;
   running the seed again does not duplicate or overwrite an already-populated catalog.
9. **AC9 — Protocol surface unchanged; visual-model parity holds.** No new
   `Stage`/`Phase`/`TraceEvent` type is added; `STAGE_TO_STATION` and `STAGE_TO_PHASE`
   are unchanged and their parity tests still pass; a run that loads a skill projects
   through `deriveView` with no unmapped events (the `load_skill` call animates the
   **MCP station** via `mcp.call`).
10. **AC10 — Bilingual UI strings (§4).** The new `settings.skills` and chat
    skills-badge UI strings have **identical leaf keys** in `en` and `pt` and every value
    is a **non-empty** string.
11. **AC11 — Backward compatible.** With an empty catalog (or `load_skill` disabled),
    a run reproduces prior behavior: no skill-catalog block in the prompt, no
    `load_skill` calls, no skills badge; the existing `test_agent.py` / `test_mcp.py`
    assertions still pass.

## Protocol / stage impact

- New/changed `Stage`(s): **none**. `load_skill` is an MCP tool and emits the existing
  `mcp.call` stage.
- Mirror in `frontend/src/types/events.ts`: **n/a** (no `Stage`/event-type change). The
  only TS shape change is additive REST data: `ChatMessage` gains a `skills: string[]`
  field (a persisted REST field, not a `TraceEvent`).
- Station it maps to in `stations.ts`: **none new** — `load_skill` animates the existing
  **MCP** station via `mcp.call`.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Where does the registration UI live?** → A **section inside the ⚙️ Settings
  panel** (inline list + editor), alongside the experiment/data controls — not a
  separate top-level page. (User decision.)
- [x] **Skill scope?** → **Global catalog**: skills are shared across all conversations;
  every skill's name + description is always advertised in the system prompt; the
  catalog is wiped by "Clear databases". (User decision.)
- [x] **Where does `load_skill` live?** → A **real MCP tool** (honoring "tool dentro do
  MCP"): registered in the FastMCP server and mirrored in the in-process fallback, both
  reading the skill body from the same relational store. The stdio subprocess inherits
  `APP_DB_PATH`, so it opens the same SQLite file — unlike RAG (026), there is no
  per-process scoping obstacle, so it need not be a native agent tool.
- [x] **New `Stage` for "skill applied"?** → **No.** A load rides on `mcp.call`; the
  "applied" badge is derived from the trace and persisted with the message (mirrors
  019-citations / 021-abstain). The protocol surface stays unchanged.
- [x] **Is the catalog injected when `load_skill` is disabled?** → **No** — if the tool
  is not advertised, the catalog block is omitted (the agent could not load anything,
  so advertising would be dishonest).

## Out of scope / deferred

- Per-skill enable/disable toggles, skill tags/folders, search over a large catalog.
- Skill versioning, import/export, sharing, or templating of bodies.
- Exposing skills as a first-class canvas node or a new `Stage` (would be its own spec
  if ever desired).
- Re-seeding example skills after a clear (a clear leaves the catalog empty until the
  next startup seed-if-empty; this matches "clear wipes user data").
- Letting a skill body carry its own tools/sub-agents (that is the DeepAgents direction
  noted in CLAUDE.md, a separate future spec).
