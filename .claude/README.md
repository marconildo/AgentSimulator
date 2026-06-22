# Claude Code assets for contributors

This folder equips [Claude Code](https://claude.com/claude-code) to help contributors follow AgentSimulator's non-negotiable patterns (SDD + TDD, protocol-as-contract, exhaustive maps, bilingual en/pt, cloud map). The **canonical rules live elsewhere** — `.specify/constitution.md`, `specs/README.md`, and `CLAUDE.md`. These skills/agents are thin workflows that point at those; they don't restate the law.

## Skills — invoke to *do* (`/skill-name` or ask Claude)

| Skill | When |
|---|---|
| `new-spec` | New feature / behavior change / new Stage / new station — **before any code** (SDD §10). Scaffolds `specs/NNN-*/` from the template. |
| `add-stage` | Adding/changing a pipeline `Stage` — the ~7-place protocol checklist that `tsc` only half-catches. |
| `add-mcp-tool` | New agent-callable MCP tool — the dual-registration (server.py + client.py) gotcha. |
| `add-db-table` | Schema change to the relational SQLite store — keeps `_SCHEMA`, docs, schema-audit test, and the migration ritual in sync. |
| `verify-gates` | Before "done"/PR — runs the local CI mirror + the cross-cutting constitution gates. |

## Agents — spawn to *check* (read-only reviewers)

| Agent | Reviews |
|---|---|
| `protocol-guardian` | schemas.py ↔ events.ts parity; every Stage wired through `STAGE_TO_STATION`, `STAGE_TO_PHASE`, `readoutFor`, `renderDetail`. |
| `backend-reviewer` | async, trace-emitter pattern, DI-not-globals, MCP dual-reg, schema sync, structural tests. |
| `frontend-reviewer` | pure projection, geometry/content separation, exhaustive switches, cloud overlay, clean types. |
| `ai-engineering-reviewer` | honesty (real vs preview), bounded ReAct loop, honest retrieval, prompt layering, RAG correctness. |
| `i18n-auditor` | en/pt parity for every user-facing string (§4). |

A good pre-PR routine: run the relevant `add-*` skill while building → `verify-gates` → spawn `protocol-guardian` + `i18n-auditor` + the domain reviewer for the area you touched.

## Codex parity

For contributors using OpenAI Codex, the same standards are mirrored under [`../AGENTS.md`](../AGENTS.md) (the twin of `CLAUDE.md`) and [`../.codex/prompts/`](../.codex/prompts/) (the `/new-spec`, `/add-stage`, `/add-mcp-tool`, `/add-db-table`, `/verify-gates` workflows + the five `/review-*` prompts). **Keep the two sides in sync:** `CLAUDE.md` ↔ `AGENTS.md`, and each skill/agent here ↔ its `.codex/prompts/` counterpart, whenever a rule changes.
