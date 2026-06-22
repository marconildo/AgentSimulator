# Codex assets for contributors

This folder equips [OpenAI Codex](https://developers.openai.com/codex) to help contributors follow
AgentSimulator's non-negotiable patterns (SDD + TDD, protocol-as-contract, exhaustive maps,
bilingual EN/PT, cloud map). The **canonical rules live elsewhere** — [`.specify/constitution.md`](../.specify/constitution.md),
[`specs/README.md`](../specs/README.md), and [`AGENTS.md`](../AGENTS.md). These prompts are thin
workflows that point at those; they don't restate the law.

This is the **Codex twin** of the Claude Code assets in [`.claude/`](../.claude/). Same standards,
two front doors. Keep `AGENTS.md` ↔ `CLAUDE.md` and these prompts ↔ `.claude/skills`+`.claude/agents`
in sync when the rules change.

## Always-on instructions

Codex reads [`AGENTS.md`](../AGENTS.md) at the repo root automatically — that's the equivalent of
`CLAUDE.md` for Claude Code. Nothing to install.

## Prompts — invoke with `/<name>` in Codex

| Prompt | Use it for |
|---|---|
| `/new-spec` | Scaffold `specs/NNN-*/` before any feature code (SDD §10). |
| `/add-stage` | The ~7-place checklist for adding/changing a pipeline `Stage`. |
| `/add-mcp-tool` | A new agent-callable MCP tool (dual-registration gotcha). |
| `/add-db-table` | A schema change to the relational SQLite store (sync + migration). |
| `/verify-gates` | Run the local CI mirror + cross-cutting constitution gates before a PR. |
| `/review-protocol` | Audit `schemas.py` ↔ `events.ts` parity + exhaustive Stage maps. |
| `/review-backend` | Audit backend conventions (async, emitter, DI, MCP, schema). |
| `/review-frontend` | Audit frontend conventions (pure projection, geometry/content, types). |
| `/review-ai-engineering` | Audit AI honesty (real vs preview), bounded ReAct, RAG correctness. |
| `/review-i18n` | Audit EN/PT parity of every user-facing string (§4). |

Codex has no native sub-agents (unlike Claude Code), so the `review-*` prompts are run manually —
think of them as read-only checklists you invoke before opening a PR.

### Where Codex looks for prompts

Depending on your Codex version, custom prompts are read from the **global** prompt dir
(`$CODEX_HOME/prompts`, default `~/.codex/prompts/`) and/or a **project** `.codex/prompts/`. If your
Codex only sees the global dir, link or copy these in once:

```bash
mkdir -p ~/.codex/prompts
# symlink so they stay in sync with the repo:
ln -sf "$(pwd)/.codex/prompts/"*.md ~/.codex/prompts/
```

Either way the files double as plain Markdown checklists you can read directly.

## Recommended flow for a contribution

1. **Plan** → `/new-spec` and resolve the open questions before code.
2. **Build** → red→green→refactor; reach for `/add-stage` · `/add-mcp-tool` · `/add-db-table`.
3. **Self-review** → run the relevant `/review-*` prompts for the area you touched (always `/review-protocol` + `/review-i18n`).
4. **Verify** → `/verify-gates`; open the PR only when it's all green.

This mirrors exactly what CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) enforces.
