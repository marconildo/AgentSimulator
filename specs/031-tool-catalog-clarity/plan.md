# Plan: Tool catalog clarity

> The HOW. Written after `spec.md` is `clarified`.

## Approach

Pure front-end labelling. `SettingsPanel` already maps `config.tools` to toggles
(`config?.tools.map(...)`, label = `ex.toolLabels[tool.name] ?? tool.name`, hover =
`tool.description`). Two gaps: `toolLabels` only covers `calculator` / `current_time` /
`kb_lookup`, and there's no disambiguation hint. Fix by (1) adding bilingual labels for
`search_knowledge_base` and `load_skill` to `settings.toolLabels`, (2) adding a short
per-language hint that distinguishes retrieval from the glossary and states the
toggle-everything / ungrounded-if-off truth, and (3) keeping the raw handle visible as a
secondary mono hint (already rendered). No backend change — `/api/config` already returns
all five tools via `agent_tool_specs(registry, None)`.

Alternative considered: hardcode a tool→label map in the panel. Rejected — labels are
user-facing prose and belong in `strings.ts` under the existing `settings.toolLabels`
(bilingual, parity-tested).

## Affected files

**Frontend**
- `frontend/src/i18n/strings.ts` — add `search_knowledge_base` + `load_skill` to
  `settings.toolLabels` (en + pt); add/extend the Tools section hint (`toolsHint` or a
  new `toolsDisambig`) clarifying RAG vs glossary and the toggle truth.
- `frontend/src/components/SettingsPanel.tsx` — render the disambiguation hint; ensure
  the secondary mono handle shows for every tool (already present at the `{tool.name}`
  line). Optional: a stable display order (retrieval first).
- `frontend/src/i18n/strings.test.ts` — extend to assert `toolLabels` covers the
  canonical tool set in both languages (AC1/AC5).

**Backend** — none. (Optionally tighten the `kb_lookup` backend description so the hover
text reinforces "canned glossary, not the RAG", but the label/hint already cover AC2.)

## Protocol changes (constitution §1)

- None. No `Stage`/`Phase`/`TraceEvent`; `/api/config` tool set + handles unchanged.

## Data model changes

- None.

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `settings.toolLabels.search_knowledge_base` | Knowledge base search | Busca na base de conhecimento |
| `settings.toolLabels.load_skill` | Load skill | Carregar skill |
| `settings.toolsDisambig` | Knowledge base search is full vector retrieval over the corpus and your PDFs; Glossary lookup is a tiny canned term list. Any tool can be turned off — disabling Knowledge base search makes the run ungrounded (LLM-only). | A Busca na base de conhecimento é recuperação vetorial completa sobre o corpus e seus PDFs; a Consulta ao glossário é uma lista canned de termos. Qualquer tool pode ser desligada — desligar a Busca na base de conhecimento deixa a execução sem fundamentação (só o LLM). |

(`calculator` / `current_time` / `kb_lookup` labels already exist.)

## Cloud map (constitution §5)

- n/a — no new tier/station.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `toolLabels` covers the canonical 5 tools, non-empty in en & pt | `frontend/src/i18n/strings.test.ts` |
| AC2 | retrieval vs glossary labels distinct; disambig hint present per language | `strings.test.ts` |
| AC3 | panel renders one toggle per `config.tools` item | component test / existing experiment test |
| AC4 | toggle-everything / ungrounded keyword present per language | `strings.test.ts` |
| AC5 | strings parity (en/pt leaf keys) | `strings.test.ts` |
| AC6 | `/api/config` tool set unchanged; `test_agent`/`test_mcp` pass | existing backend suites |

## Risks / trade-offs

- Keep the hint short — the Tools section is compact; a long paragraph hurts more than
  the snake_case did. Consider a tooltip for the longer disambiguation.
- Don't accidentally change the tool *handles* anywhere (model contract). Labels only.
