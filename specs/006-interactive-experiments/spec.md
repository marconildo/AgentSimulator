# Spec: Interactive experiments (prompt, tools, top-k)

| | |
|---|---|
| **ID** | 006-interactive-experiments |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-26 |

> Turn the simulator from an **observer** into an **experimenter**, the way the
> Transformer Explainer lets you change the input and watch the weights react.
> Let the user (1) **edit the system prompt** and see the assembled prompt change,
> (2) **toggle individual MCP tools** on/off and watch the agent re-plan,
> (3) **change top-k** for RAG — then send and watch the pipeline recompute. This
> also **removes the misleading "SOON" tags**: Tools (MCP) and RAG retrieval are
> already real, so they become real controls instead of fake "coming soon" rows.

## Problem / motivation

The pipeline is fully real but **read-only**: the user can watch a request, but
can't change *how* it runs. Worse, the ⚙️ panel advertises "Tools (MCP)" and "RAG
retrieval" as **SOON** even though both are fully implemented and animated today
— which reads as a placeholder/unfinished product. The highest-leverage
educational upgrade is to let the learner *intervene*: tighten the system prompt
and see `llm.prompt` change; disable the calculator and watch a math question get
answered (or refused) without the tool; drop top-k to 1 and see retrieval narrow.
That makes cause-and-effect tangible and turns the misleading "SOON" rows into
working features.

## Goals

- **System-prompt override** — an editable system prompt sent with the request;
  the agent uses it, and the `llm.prompt` event's `system` preview reflects it.
- **Per-tool toggles** — enable/disable each MCP tool (`calculator`,
  `current_time`, `kb_lookup`); a disabled tool is **not** discovered or callable,
  so the agent genuinely re-plans without it (everything is real — §3).
- **top-k control** — a slider/stepper for RAG `top_k` (the field already exists
  on `ChatRequest`); retrieval honors it.
- **Remove the "SOON" placeholders** in `SettingsPanel`; Tools and RAG become the
  real controls above (or move to a dedicated experiment panel).
- **Backwards compatible** — with no overrides, behavior is exactly as today
  (default system prompt, all tools enabled, default top-k).
- All new controls/labels **bilingual** (en + pt) — §4.

## Non-goals

- No new `Stage`/`Phase`/`TraceEvent` (these are **request inputs**, not new
  pipeline stations).
- No persistence of experiment settings across sessions/users (single instance,
  §8) beyond in-memory client state — settings are kept **per conversation** in
  memory and reset on reload (clarify Q4).
- No arbitrary tool authoring/upload — only toggling the existing three tools.
- No model/temperature switching (could be a later spec).

## User-facing behavior

The existing ⚙️ panel (Q5 — **extend it**, no separate panel) gains three real
sections below the delivery-mode toggle: **System prompt** (a textarea
pre-filled with the current default, **fully editable** — the textarea *is* the
whole system prompt — with a reset; blank ⇒ default; capped at 2000 chars, Q3),
**Tools** (a checkbox per MCP tool), and **Retrieval** (a top-k slider, **1–8**,
default `rag_top_k`, Q6). The "Tools (MCP)" and "RAG retrieval" SOON rows are
**replaced** by these real controls. Settings are scoped **per conversation**
(Q4): switching threads shows that thread's overrides; a draft's settings follow
it when the conversation is first persisted. On the next send, the overrides flow
with the request: the assembled-prompt drill-in shows the edited system prompt,
the MCP station shows only the enabled tools, and the RAG station retrieves top-k
chunks. Resetting returns to defaults (no overrides sent).

*(All new prose ships in English **and** Portuguese — §4.)*

## Acceptance criteria

> Numbered and testable. Backend ACs run against **OpenAI** (per `003-openai-only`,
> CI key secret) and assert **structurally** (prompt preview contains the
> override, no `mcp.call` to a disabled tool, top-k honored) to tolerate model
> variability.

1. **AC1** — A chat request carrying a `system_prompt` override produces an
   `llm.prompt` END event whose `system` preview **contains the override text**
   (and not the default), and the agent still returns a non-empty answer.
2. **AC2** — A request with `enabled_tools` excluding `calculator` produces an
   `mcp.discover` event listing **only the enabled tools**, and a math question
   yields **no `mcp.call` to `calculator`** (the agent re-plans without it).
3. **AC3** — A request with all tools disabled (`enabled_tools=[]`) emits no
   `mcp.call` at all and still returns an answer (LLM-only path).
4. **AC4** — A `top_k` override is honored by retrieval: `rag.retrieve` returns at
   most `top_k` chunks and the event reflects the requested `k`.
5. **AC5** — With **no overrides** sent, the run is byte-for-byte equivalent in
   structure to today (default prompt, all three tools discovered, default top-k)
   — a regression guard for backwards compatibility.
6. **AC6** — the ⚙️ `SettingsPanel` exposes the prompt editor, per-tool
   checkboxes and the top-k control, with **no "SOON"** row for Tools/RAG; all
   labels exist en + pt. Defaults (default prompt text, tool list, default/bounds
   for top-k) come from a `GET /api/config` endpoint so nothing is hardcoded
   client-side.
7. **AC7** — Experiment settings are **per conversation**: editing them on one
   thread, then switching to another, shows the second thread's own settings
   (defaults if untouched); a draft's settings carry over once it is persisted.

## Protocol / stage impact

§1 & §6.

- New/changed `Stage`(s): **none**.
- `ChatRequest` gains **request-only** fields: `system_prompt: str | None`
  (max 2000), `enabled_tools: list[str] | None`. `top_k` exists, now bounded
  `1..8`. These are **not** `TraceEvent` fields, so no `events.ts` mirror is
  required — but the request schema is part of the API contract (documented in
  `plan.md`).
- A new read-only `GET /api/config` endpoint exposes the default system prompt,
  the available tools, and the top-k default/bounds (so the UI prefills without
  hardcoding backend constants). It is not part of the *event* protocol.
- Station mapping: **unchanged** (overrides change *what* the existing `mcp`,
  `rag` and `llm` stations do, not the set of stations).

## Clarifications (resolved 2026-05-26)

- [x] **Q1 — Tool filtering point.** **Filter in `ToolRegistry`** — disabled
  tools are not discovered, so `mcp.discover` honestly lists only the enabled
  ones (AC2). The cached registry is never mutated; the enabled set is passed
  per request to `specs(enabled)`.
- [x] **Q2 — Disabled-tool semantics.** Accept whatever the model does with the
  calculator off; tests assert **only** "no `mcp.call` to calculator" — never the
  exact math (structural assertions tolerate model variability).
- [x] **Q3 — System-prompt editing.** **Full replace** — the textarea is the
  entire system prompt and is rewritten freely. Tool use is driven by OpenAI
  function-calling (`bind_tools`), **not** by prompt text, so a full replace does
  not break tool discovery/calling. Guards: a blank/whitespace override falls
  back to the default `SYSTEM_PROMPT`; length capped at **2000 chars**.
- [x] **Q4 — Settings scope.** **Per conversation**, in memory only (no
  `localStorage`). Each conversation keeps its own `{systemPrompt, enabledTools,
  topK}`; a draft's settings are adopted by the conversation when it is first
  persisted; everything resets to defaults on reload.
- [x] **Q5 — UI home.** **Extend the existing ⚙️ `SettingsPanel`** (widened +
  scrollable). No separate panel; the SOON rows are replaced by the real
  controls.
- [x] **Q6 — top-k bounds.** Slider **1–8**, default `settings.rag_top_k` (4);
  the backend validates the range (`ge=1, le=8`).

## Out of scope / deferred

- Model / temperature / max-tokens controls.
- Authoring or uploading new tools.
- Saving/sharing experiment presets.
- Showing a side-by-side diff of two runs (could be a later "compare" spec).
