# Plan: Ollama local provider

> HOW for `spec.md` (074). Respects the constitution **after** the §2 amendment shipped in
> this same change (multi-provider; OpenAI default + real opt-in Ollama).

## Approach

Keep the existing `LLMProvider` ABC seam (Strategy). Add a second concrete implementation,
`OllamaProvider`, that mirrors `OpenAIProvider` over `langchain_ollama.ChatOllama` (same
`decide`/`stream_answer` shape, same `TokenUsage.from_metadata`, same prompt assembly
helpers reused). `get_provider` gains a `provider` discriminator (+ `base_url`) and routes:
`"openai"` → today's path (still fails fast without a key); `"ollama"` → `OllamaProvider`
(no OpenAI key needed).

Provider is **per-agent** state, parallel to `model` (042/044): a new `agents.provider`
column, threaded through `/api/chat` → `run_agent` → `get_provider` exactly like `model` is.
The model allowlist (`model_ids()`) is **scoped to OpenAI** — for Ollama any non-empty model
string is accepted (the live server is the source of truth, not a curated list).

The Ollama **server URL** is instance-global and DB-backed: a tiny `app_config` key-value
table (seeded from env `OLLAMA_BASE_URL`, default `http://localhost:11434`), read/written via
`/api/settings/ollama`. A `GET /api/ollama/models` endpoint proxies the server's `/api/tags`
so the FE never deals with CORS/reachability and the **backend** (which actually calls Ollama)
is the one probing it.

No protocol change: provider rides as a request-only input, like `model`. No new Stage,
station, hop, or tier.

**Alternatives considered:** (a) global single provider — rejected, breaks the N-agents
catalog where each agent owns its model; (b) localStorage-only URL — rejected, the backend
is the caller and needs the URL; (c) per-agent URL — deferred (most users run one local
server), kept instance-global for simplicity.

## Affected files

**Backend**
- `.specify/constitution.md` — **amend §2** (multi-provider) in this same change.
- `backend/app/llm/models.py` — flip `Provider(id="ollama", available=True)`; keep
  `model_ids()` as the **OpenAI** allowlist; add a helper to gate validation by provider.
- `backend/app/llm/provider.py` — `get_provider(*, provider="openai", model=None,
  base_url=None)`; route to OpenAI/Ollama; OpenAI path fails fast as today.
- `backend/app/llm/ollama_provider.py` — **new** `OllamaProvider` over `ChatOllama`
  (lazy import; reuse `_assemble`/`_to_openai_tool`/`_preview` from `openai_provider`).
- `backend/app/config.py` — `ollama_base_url: str = "http://localhost:11434"` (env default).
- `backend/app/db/store.py` — new `app_config(key TEXT PK, value TEXT)` table; `agents.provider`
  column (`DEFAULT 'openai'`); migration `user_version` 3→4 (additive `ADD COLUMN` + create
  table); `get_config`/`set_config`; agent row adapter exposes `provider`; `clear_all` leaves
  `app_config` (config, not data) — decide + document.
- `backend/app/main.py` — `/api/config` advertises ollama available + default URL;
  `/api/chat` resolves `effective_provider`, scopes allowlist check to OpenAI, threads
  provider+base_url; new `GET/PUT /api/settings/ollama`; new `GET /api/ollama/models`
  (httpx → `/api/tags`); `POST`/`PATCH /api/agents` accept `provider`.
- `backend/app/agent/graph.py` — `run_agent`/`run_agent_state` gain `provider`+`base_url`,
  pass to `get_provider`.
- `backend/app/schemas.py` — `ChatRequest.provider` (optional); agent in/out models gain
  `provider`.
- `backend/requirements.txt` — add `langchain-ollama` (+ `httpx` if not already present).
- `backend/tests/` — new `test_ollama_provider.py`, `test_app_config.py`,
  `test_ollama_endpoints.py`; extend `test_schema_audit.py` (EXPECTED_TABLES += `app_config`).
- `backend/docs/data-model.md` (repo `docs/data-model.md`) — document `app_config` + the new
  `agents.provider` column.

**Frontend**
- `frontend/src/agent-anatomy/ProviderSection.tsx` — interactive radio; persist
  `updateAgent({provider})`; when ollama, render the Server-URL field + Refresh.
- `frontend/src/agent-anatomy/ModelSection.tsx` — provider-aware: ollama → live model list
  from `/api/ollama/models`; openai → curated `/api/config.models` (today).
- `frontend/src/lib/chatApi.ts` — `getOllamaModels(baseUrl)`, `getOllamaSettings`,
  `setOllamaSettings`; `AppConfig` gets ollama default URL; agent type gets `provider`.
- `frontend/src/lib/agentAccess.ts` (`useActiveAgent`) — carry/patch `provider`.
- `frontend/src/i18n/strings.ts` (+ `en`/`pt`) — new `agentAnatomy.provider.*` /
  `.ollama.*` strings.
- `frontend/src/components/AgentAnatomyDialog.*.test.tsx` — extend provider test.

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` added or changed. `STAGE_TO_STATION` /
`STAGE_TO_PHASE` stay total and untouched.

## Data model changes

Relational store (SQLite `ConversationStore`):
- **New table** `app_config(key TEXT PRIMARY KEY, value TEXT NOT NULL)` — key/value instance
  config; first key `ollama_base_url`. Documented in `docs/data-model.md`; `EXPECTED_TABLES`
  extended in lockstep (schema-audit test).
- **New column** `agents.provider TEXT NOT NULL DEFAULT 'openai'`.
- **Migration** `PRAGMA user_version` 3 → 4: `CREATE TABLE IF NOT EXISTS app_config` +
  `ALTER TABLE agents ADD COLUMN provider …` (both additive, no table rebuild). Existing
  agents backfill to `'openai'` via the column default.
- `clear_all`: `app_config` is **configuration, not conversation data** → not wiped by
  "Clear databases" (documented; `EXPECTED_CLEAR_KEYS` unchanged for it).

Vector store (Chroma): unchanged (embeddings stay OpenAI).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `agentAnatomy.provider.ollamaNote` | Runs against your local Ollama server. No OpenAI key needed. | Roda no seu servidor Ollama local. Não precisa de chave da OpenAI. |
| `agentAnatomy.provider.serverUrlLabel` | Ollama server URL | URL do servidor Ollama |
| `agentAnatomy.provider.serverUrlPlaceholder` | http://localhost:11434 | http://localhost:11434 |
| `agentAnatomy.provider.serverUrlHelp` | The backend connects to this address. In Docker use `host.docker.internal`. | O backend conecta neste endereço. No Docker use `host.docker.internal`. |
| `agentAnatomy.provider.refresh` | Refresh models | Atualizar modelos |
| `agentAnatomy.provider.unreachable` | Couldn't reach the Ollama server. Is it running? | Não foi possível acessar o servidor Ollama. Ele está rodando? |
| `agentAnatomy.provider.noModels` | No models installed. Run `ollama pull <model>` first. | Nenhum modelo instalado. Rode `ollama pull <modelo>` primeiro. |
| `agentAnatomy.provider.loadingModels` | Listing installed models… | Listando modelos instalados… |

(Proper nouns "OpenAI" / "Ollama (local)" come from `/api/config.providers`, not translated.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary. (Ollama is a provider choice inside the existing LLM
station, not a new visual element.)

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC2 | `get_provider(provider="ollama", …)` returns OllamaProvider, no key needed; openai still fails fast | `backend/tests/test_ollama_provider.py` (keyless) |
| AC3 | `agents.provider` column + default; POST/PATCH/GET round-trip provider | `backend/tests/test_db.py` / `test_agents_api.py` (keyless) |
| AC4 | `/api/chat` 422 on bad model only for openai; ollama accepts any non-empty; empty rejected | `backend/tests/test_ollama_endpoints.py` (keyless) |
| AC5 | `GET/PUT /api/settings/ollama` round-trip + restart persistence; env default | `backend/tests/test_app_config.py` (keyless) |
| AC6 | `GET /api/ollama/models` parses `/api/tags` (httpx mocked); unreachable → structured non-500 | `backend/tests/test_ollama_endpoints.py` (keyless) |
| AC7 | real Ollama run fires structural stages + non-empty answer | `backend/tests/test_ollama_provider.py::…` `@pytest.mark.ollama` (skipped w/o server) |
| AC8 | select Ollama → persists provider, shows URL field + live model dropdown; unreachable hint | `frontend/src/components/AgentAnatomyDialog.provider.test.tsx` |
| AC9 | new strings present in en + pt | Vitest strings test + review |
| AC10 | OpenAI default path unchanged | existing backend + FE suites stay green |

Add a `ollama` marker to `pytest.ini`/`pyproject` mirroring the `tavily` marker; the
integration test skips unless an Ollama server is configured (env probe), so CI (no Ollama)
stays green while local dev can exercise the real path.

## Risks / trade-offs

- **CI can't run real Ollama** → AC7 is marker-gated/skipped; the rest assert structurally
  with HTTP mocked, consistent with the `tavily` precedent (052).
- **Docker reachability** — `localhost` inside the backend container ≠ the host's Ollama;
  surfaced via the `serverUrlHelp` string (`host.docker.internal`), not silently broken.
- **Tool calling on Ollama** varies by model — small models may not emit tool calls. Out of
  scope to fix; the agent loop already tolerates a no-tool decision (goes straight to answer).
- **Constitution amendment** is load-bearing: §2 changes meaning. Done in this same change
  per the amendment process; existing specs (003, 058) reconciled by note, not rewrite.
- **Single-instance (§8)** still holds — `app_config` is one row set, no cross-replica state.
