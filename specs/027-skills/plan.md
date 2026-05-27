# Plan: Skills — a global, agent-loadable skill catalog

> The HOW. Written after `spec.md` is `clarified`. Decisions here respect every
> principle in `.specify/constitution.md`.

## Approach

A skill is a row `{ id, name (unique), description, body, created_at, updated_at }` in
the **relational store** (the same SQLite `ConversationStore` that holds conversations —
skills are transactional app state, not embeddings). Three moving parts wire it in:

1. **Catalog advertised cheaply in the prompt.** Before the graph runs we read the
   catalog (name + description only) and thread it into `AgentState`. `_effective_system`
   appends a clearly-delimited **"Available skills"** block listing each `name` +
   `description`. Bodies are never put here — only on demand.

2. **`load_skill` as a real MCP tool.** Registered in `app/mcp/server.py`
   (`@mcp.tool() load_skill(name)` + a plain `_load_skill`) and mirrored in
   `app/mcp/client.py._load_local`. Both look the skill up in `get_store()` and return
   its **body** (or an `error:`-prefixed string for an unknown name). Because the tool is
   static (a single `name` param) the cached registry needs no per-skill rebuild; the
   *dynamic* part (which skills exist) lives in the prompt block, read fresh per request.
   `load_skill` flows through `agent_tool_specs` exactly like the MCP tools, so the 006
   `enabled_tools` gate applies and it shows in `mcp.discover` / `GET /api/config`.

   - When `load_skill` is **not** advertised (e.g. `enabled_tools=[]`), the prompt's
     skills block is omitted (honest — nothing can be loaded).

3. **"Applied skills" derived + persisted.** A skill is "applied" when a `load_skill`
   `mcp.call` returned a non-error body. `main.py` extracts the distinct applied names
   from the emitter (a `_applied_skills(emitter)` helper, sibling to `_retrieved_chunks`)
   and persists them on the message (new `messages.skills` JSON column, mirroring
   `chunks`). `list_messages` returns them; the frontend reads `message.skills` for the
   footer badge. A pure `lib/skills.ts` derivation from trace events backs the badge for
   any live/inspector use and is unit-tested.

**Alternatives considered.** (a) `load_skill` as a *native* agent tool like
`search_knowledge_base` (026) — rejected: the user asked for it in MCP, and unlike
Chroma/session-scoping there is no per-process obstacle (the stdio subprocess inherits
`APP_DB_PATH`). (b) A new `skill.load` `Stage` — rejected: it would add protocol surface
and a station for no gain; `mcp.call` already models "agent called a tool, here is the
result". (c) A separate skills DB/store — rejected: skills are relational app state; the
existing `ConversationStore` is the right home and makes the 025 clear trivial to extend.

## Affected files

**Backend**
- `app/db/store.py` — `skills` table in `_SCHEMA`; sync+async CRUD
  (`create_skill`, `list_skills`, `get_skill`, `get_skill_by_name`, `update_skill`,
  `delete_skill`); `_clear_all_sync` also counts+wipes `skills` (returns new
  `skills_deleted` key). Add `skills` column to `messages` + thread it through
  `write_message` / `_list_messages_sync` (mirror `chunks`).
- `app/db/seed.py` *(new)* — `seed_skills()`: insert the example skills (see "Seeded
  example skills" below) when the catalog is empty (idempotent). Called from `main.py`
  lifespan.
- `app/mcp/server.py` — `_load_skill(name)` + `@mcp.tool() load_skill`; reads body via
  `get_store()`. Returns the body or `error: skill '<name>' not found`.
- `app/mcp/client.py` — mirror `load_skill` in `_load_local` (same `get_store()` lookup),
  so both transports behave identically (CLAUDE.md rule for adding a tool).
- `app/agent/prompts.py` — `skills_block(catalog)` builder + a `compose_system(base,
  catalog)` that appends the block (used by `_effective_system`).
- `app/agent/state.py` — `AgentState` gains `skills_catalog: list[dict]` (name+desc).
- `app/agent/graph.py` — `run_agent_state`/`run_agent` accept `skills_catalog`; seed it
  into state; `_effective_system` appends the block only when `load_skill` is in the
  advertised specs. `_applied_skills` lives in `main.py` (reads emitter events).
- `app/main.py` — read the catalog (name+desc) before `run_agent`, pass it in; persist
  applied skills on `write_message`; `POST /api/data/clear` returns `skills_deleted`;
  new REST: `GET/POST /api/skills`, `PUT/DELETE /api/skills/{id}`; lifespan seeds skills.
- `app/schemas.py` — `SkillIn` (create/update body: name/description/body) + `SkillOut`
  (adds id/timestamps). **No `Stage`/`TraceEvent` change.**

**Frontend**
- `src/lib/chatApi.ts` — `ChatMessage.skills: string[]`; `Skill` type + CRUD client
  (`listSkills`/`createSkill`/`updateSkill`/`deleteSkill`); `ClearResult.skills_deleted`.
- `src/lib/skills.ts` *(new)* + `skills.test.ts` — `appliedSkills(events)` (distinct
  successful `load_skill` names from `mcp.call`), used by the badge.
- `src/components/SettingsPanel.tsx` — a **Skills** section: list + inline editor
  (name/description/body, Save/Delete/Cancel/New). Local component state; calls the CRUD
  client; refreshes the list.
- `src/components/ChatPanel.tsx` — a `SkillsBadge` in the agent message footer (next to
  `Sources`): spark icon + count, hover popover listing `message.skills`.
- `src/i18n/strings.ts` — `settings.skills.*` and `chat.skills*` strings, en + pt.

## Protocol changes (constitution §1)

**None.** No `Stage`/`Phase`/`TraceEvent` added or changed, so `events.ts` needs no
mirrored change. `load_skill` emits the existing `mcp.call`. The only TS additions are
REST shapes (`Skill`, `ChatMessage.skills`, `ClearResult.skills_deleted`). The two
exhaustive maps (`STAGE_TO_STATION`, `STAGE_TO_PHASE`) are untouched.

## Data model changes

Relational store (`ConversationStore`) only — the **vector** store is unchanged:
- New `skills` table: `id TEXT PK, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
  body TEXT NOT NULL, created_at REAL, updated_at REAL`.
- `messages` gains `skills TEXT NOT NULL DEFAULT '[]'` (JSON list of applied skill names),
  mirroring the existing `chunks` column. `CREATE TABLE IF NOT EXISTS` + the additive
  `DEFAULT` keep it forward-only; tests use a throwaway DB so no migration is needed for
  CI, and an existing dev DB picks up the new column lazily (a one-line `ALTER TABLE …
  ADD COLUMN skills` guard in `__init__` covers a pre-existing `messages` table).
- `_clear_all_sync` returns one extra key `skills_deleted`. **This changes the 025 clear
  contract** → the two exact-equality assertions in `backend/tests/test_clear.py`
  (`store.clear_all()` and the idempotent endpoint body) are updated to include
  `skills_deleted` as part of this work (driven by AC7's test).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `settings.skills.title` | Skills | Skills |
| `settings.skills.hint` | Named instruction bundles the agent loads on demand. | Pacotes de instruções nomeados que o agente carrega sob demanda. |
| `settings.skills.new` | New skill | Nova skill |
| `settings.skills.name` | Name | Nome |
| `settings.skills.description` | Description | Descrição |
| `settings.skills.body` | Body | Conteúdo |
| `settings.skills.save` | Save | Salvar |
| `settings.skills.delete` | Delete | Excluir |
| `settings.skills.cancel` | Cancel | Cancelar |
| `settings.skills.empty` | No skills yet. | Nenhuma skill ainda. |
| `settings.skills.nameTaken` | A skill with this name already exists. | Já existe uma skill com esse nome. |
| `chat.skillsApplied(n)` | `${n} skills applied in this response` | `${n} skills aplicadas nesta resposta` |
| `chat.skillsBadge` | Skills applied | Skills aplicadas |

> Seeded *skill content* (example names/descriptions/bodies) is demo data like the
> corpus markdown, not UI chrome — outside the bilingual rule (noted in spec).

## Cloud map (constitution §5)

n/a — no new tier/station/boundary. Skills persist in the existing relational store,
whose cloud mapping (managed SQL: Azure SQL / RDS / Cloud SQL) already exists.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | skill CRUD round-trip + unique-name rejection (keyless) | `backend/tests/test_skills.py` |
| AC2 | `compose_system`/`skills_block` includes name+desc, excludes body (keyless) | `backend/tests/test_skills.py` |
| AC3 | `agent_tool_specs` lists `load_skill`; `enabled_tools=[]` drops it + omits block (keyless) | `backend/tests/test_skills.py` |
| AC4 | `load_skill` via registry returns body; unknown ⇒ `error:`; `mcp.call` data shape (keyless) | `backend/tests/test_skills.py` |
| AC5 | `[openai]` run with a matching skill emits a `load_skill` `mcp.call`; answer non-empty | `backend/tests/test_skills.py` |
| AC6 | applied-skills persisted on message + returned by `list_messages` (keyless); FE `appliedSkills` parity | `backend/tests/test_skills.py`, `frontend/src/lib/skills.test.ts` |
| AC7 | `clear_all`/`POST /api/data/clear` report `skills_deleted`, catalog empty, corpus kept, idempotent (keyless); update 025 assertions | `backend/tests/test_skills.py`, `backend/tests/test_clear.py` |
| AC8 | `seed_skills` on empty ⇒ ≥1 skill; second run no duplication (keyless) | `backend/tests/test_skills.py` |
| AC9 | protocol parity tests still green; no new `Stage` | `backend/tests/test_protocol.py`, `frontend/src/lib/phases.test.ts`, `stations.test.ts` |
| AC10 | en/pt leaf-key parity + non-empty for new strings | `frontend/src/i18n/strings.test.ts` |
| AC11 | empty catalog ⇒ no block, no `load_skill`; existing tool tests pass | `backend/tests/test_agent.py`, `test_mcp.py`, new guard in `test_skills.py` |

CRUD UI (the Settings editor) is component-local state with no React test harness in
this project (as 025 noted) — exercised via the CRUD client + verified by `tsc`/manual;
not given its own automated test. The badge is covered by `lib/skills.test.ts` + `tsc`.

## Seeded example skills

Three **simple, simulator-appropriate** skills, each easy to trigger by an explicit user
phrasing and each producing a **visibly different** answer — enough to demonstrate the
feature without distracting from it. Seed content is example data (not UI chrome), so it
is not subject to the bilingual rule; the bodies tell the model to answer in the user's
language so a PT or EN prompt both work.

| name (slug) | description (advertised in the prompt) | body (loaded on demand) |
|---|---|---|
| `resumo-em-bullets` | Use quando o usuário pedir um resumo, "em tópicos" ou bullet points. | Reescreva a resposta como uma lista de no máximo 5 bullet points curtos (•), uma ideia por item, sem parágrafos longos. Responda no idioma da pergunta. |
| `explicar-para-iniciante` | Use quando o usuário pedir uma explicação simples, "para iniciante", "sem jargão" ou "como se eu tivesse 5 anos". | Explique o conceito em linguagem simples e sem jargão: comece com uma analogia do cotidiano e só então conecte ao termo técnico em uma frase. Responda no idioma da pergunta. |
| `glossario-ao-final` | Use quando o usuário pedir um glossário ou quando a resposta usar termos técnicos. | Ao final da resposta, adicione uma seção "📖 Glossário" com cada termo técnico citado seguido de uma definição de uma única linha. Responda no idioma da pergunta. |

Easy demo prompts: *"resuma o que é RAG em bullets"*, *"explique embeddings para um
iniciante"*, *"o que é um agente? inclua um glossário dos termos"*.

## Risks / trade-offs

- **`load_skill` reads the DB inside the MCP server process.** Fine over both transports
  because the stdio subprocess inherits `APP_DB_PATH`; the local-fallback shares the
  in-process `get_store()`. A parity assertion (body identical on either path) guards it.
- **Cached registry vs dynamic catalog.** The tool is static; the catalog is read per
  request for the prompt and per call for the body — no stale cache, no registry rebuild.
- **025 contract change.** Adding `skills_deleted` is additive but breaks two exact-dict
  assertions in `test_clear.py`; updating them is part of this work (TDD red→green), and
  the new key is documented on the endpoint.
- **Determinism of AC5.** The model must *choose* to load a skill; the test asserts
  structurally (a `load_skill` call happened, answer non-empty) with a description that
  strongly matches the prompt, never asserting exact answer text.
- **Prompt growth.** Many skills inflate the always-on catalog block; acceptable for an
  educational single-user tool and bounded by the small seeded set. (A future spec could
  rank/trim the catalog — out of scope.)
