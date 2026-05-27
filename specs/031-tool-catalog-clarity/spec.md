# Spec: Tool catalog clarity

| | |
|---|---|
| **ID** | 031-tool-catalog-clarity |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-05-27 |

> Fill the WHAT and the WHY. **No implementation detail here** — that belongs in
> `plan.md`.

## Problem / motivation

The agent advertises five tools — `search_knowledge_base` (the real RAG retrieval tool,
026), `calculator`, `current_time`, `kb_lookup` (a tiny canned glossary), and
`load_skill` (027). `GET /api/config` already returns all five, and the ⚙️ Settings
panel already renders a toggle for each. But the **presentation is inconsistent and
confusing**:

- Only three tools have friendly labels (`Calculator`, `Current time`, `Glossary
  lookup`); `search_knowledge_base` and `load_skill` fall back to their raw snake_case
  names, so the list mixes "Calculator" with "search_knowledge_base".
- `search_knowledge_base` (full vector RAG over the corpus + uploaded PDFs) and
  `kb_lookup` (a one-line canned glossary for a few basic terms) **look like duplicates**
  of the same idea — a reviewer literally read them as "two names for the same thing."
- There's no honest one-liner that disabling `search_knowledge_base` means **no RAG
  grounding** — that the retrieval tool is a tool the agent elects like any other.

This is a small, high-clarity fix: give every advertised tool a consistent, friendly,
bilingual label, and disambiguate the retrieval tool from the glossary so the learner
understands they are different jobs.

## Goals

- **Every tool** the agent can use — exactly the set `GET /api/config` returns — renders
  in the Settings panel with a **friendly, bilingual label** (no raw snake_case in the
  primary label; the raw name may still show as a secondary mono hint).
- **`search_knowledge_base` and `kb_lookup` are clearly distinct**: their labels and a
  short hint make plain that one is full vector retrieval (corpus + uploaded PDFs) and
  the other is a trivial canned glossary.
- The panel is **honest about toggling**: all advertised tools (including retrieval) can
  be turned off, and turning off `search_knowledge_base` is an LLM-only, ungrounded run —
  not an "always-on" tool. (Correct the assumption that some tools are non-toggleable.)
- All new prose ships in **English and Portuguese** (constitution §4).
- No backend behavior change: the advertised tool set, gating, and the agent's autonomy
  (026) are untouched — this is labelling + a hint.

## Non-goals

- **No new tool, no renamed tool, no new `Stage`/protocol change.** The tool *handles*
  (`search_knowledge_base`, `kb_lookup`, …) are the model-facing contract and stay
  exactly as they are; this changes only the **display label** and helper text.
- Not adding per-tool enable defaults or categories beyond a sensible display order.
- Not merging `kb_lookup` into `search_knowledge_base` (they are intentionally different —
  the glossary demonstrates a cheap canned tool vs real retrieval).
- Not changing `enabled_tools` semantics (006) — uniform gating stays.

## User-facing behavior

In ⚙️ Settings → Tools, the toggle list shows **all** advertised tools, each with a
friendly label and the raw handle as a secondary mono hint, e.g.:

- **Knowledge base search** · `search_knowledge_base` — *full vector RAG over the
  knowledge base and your uploaded PDFs.*
- **Glossary lookup** · `kb_lookup` — *a tiny canned one-line glossary for a few basic
  terms (not the RAG).*
- **Calculator** · `calculator`
- **Current time** · `current_time`
- **Load skill** · `load_skill` — *pulls a named skill's full instructions on demand.*

A short section hint clarifies that **every** tool can be turned off, and that disabling
**Knowledge base search** makes the run ungrounded (LLM-only). The per-tool description
the backend already provides continues to show on hover.

All labels and hints ship in **en + pt**. The raw tool handles and the model-facing tool
names are verbatim, not translated.

## Acceptance criteria

> Front-end assertions over `/api/config`'s tool list (or a fixture mirroring it).

1. **AC1 — Every advertised tool has a friendly bilingual label.** For each tool name in
   the canonical agent tool set (`search_knowledge_base`, `calculator`, `current_time`,
   `kb_lookup`, `load_skill`), `toolLabels` resolves a non-empty label in **both** `en`
   and `pt` (no fallback to the raw snake_case name for these known tools).
2. **AC2 — Retrieval vs glossary are disambiguated.** The labels for
   `search_knowledge_base` and `kb_lookup` are distinct, and the panel surfaces a hint
   (per language) that distinguishes full RAG retrieval from the canned glossary.
3. **AC3 — All config tools render a toggle.** The Tools list renders one toggle per item
   in `config.tools` (none hidden), each showing the friendly label and the raw handle.
4. **AC4 — Honest toggling copy.** The Tools section hint states (per language) that any
   tool can be disabled and that disabling knowledge-base search yields an ungrounded
   run. (Keyword/substring assertion so wording can evolve.)
5. **AC5 — Bilingual parity (§4).** All new `settings`/tool strings have identical leaf
   keys in `en` and `pt`, each non-empty.
6. **AC6 — No backend/protocol drift.** `GET /api/config` still returns the same tool set
   with the same handles; no `Stage`/protocol change; `test_agent`/`test_mcp` unchanged.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none** — labelling lives in `i18n/strings.ts`
  (`settings.toolLabels`) and the Settings panel; the MCP station model is unchanged.

## Open questions (resolved during clarify — 2026-05-27)

- [x] **Are some tools "always on"?** → **No.** `enabled_tools` (006) gates every tool
  uniformly, including retrieval. The assessment's premise was wrong; the fix is to *say
  so* honestly, not to mark anything always-on.
- [x] **Rename `kb_lookup` / `search_knowledge_base`?** → **No.** Those are the
  model-facing contract; only the display label changes. (`kb_lookup` already reads
  "Glossary lookup" — extend the same treatment to the other two unlabeled tools.)
- [x] **Where do descriptions come from?** → The backend tool `description` already
  rides each `/api/config` tool and shows on hover; this spec adds the friendly *label*
  + a section hint, not new backend descriptions.

## Out of scope / deferred

- Tool categories / grouping headers, per-tool default-off presets.
- Showing each tool's JSON schema in the panel.
- A "tools used this run vs available" reconciliation view (overlaps with the event
  console, 030, and the MCP inspector).
