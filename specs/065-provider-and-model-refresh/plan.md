# Plan: Provider field + refreshed OpenAI model list

## Approach

Two loosely-coupled changes that share the Agent Anatomy dialog:

1. **Model refresh** — replace `CURATED_MODELS` in `app/llm/models.py` with the
   `4.1` + `5` families, move the `config.py` default to `gpt-4.1-mini`, and mirror
   the list in the demo fixture. Validation (422), `/api/config.models`, and the
   FE dropdown already read from this single source, so the blast radius is the
   one tuple plus the env default.

2. **Provider field** — additive `providers` payload on `/api/config` (so the FE
   never hardcodes provider proper nouns, matching how `models` works) + a new,
   read-only **Provider** dialog section. OpenAI is the only enabled option;
   Ollama is rendered `disabled` with a "coming soon" badge (constitution §3 —
   it draws a labelled box, it never runs). No agent-state write, no backend
   provider routing.

Alternatives considered: putting Provider radios *inside* `ModelSection`. Rejected
— a dedicated section reads cleaner in the left-rail nav and keeps the model
picker single-purpose; the section machinery is cheap to extend.

## Affected files

**Backend**
- `backend/app/llm/models.py` — replace `CURATED_MODELS` (drop 4o, add 4.1-nano,
  5-nano, 5, 5-mini, 5.5). Add `PROVIDERS` + `providers_payload()` + `default_provider`.
- `backend/app/config.py` — `llm_model` default `gpt-4o-mini` → `gpt-4.1-mini`.
- `backend/app/main.py` — `/api/config` gains `providers` + `default_provider`.

**Frontend**
- `frontend/src/lib/agentAnatomySections.ts` — add `"provider"` to the union,
  `SECTION_ORDER` (before `"model"`), `SECTION_ICONS`.
- `frontend/src/agent-anatomy/ProviderSection.tsx` — **new**; reads
  `config.providers`, renders OpenAI (selected) + Ollama (disabled preview).
- `frontend/src/components/AgentAnatomyDialog.tsx` — `sectionTitle` + `renderSection`
  cases for `"provider"` (both switches are exhaustive over the union).
- `frontend/src/lib/chatApi.ts` — `AppConfig` gains `providers: ProviderInfo[]` +
  `default_provider: string`; new `ProviderInfo` interface.
- `frontend/src/i18n/strings.ts` — `agentAnatomy.provider` block (en + pt).
- `frontend/src/demo/fixtures/_config.json` — refreshed `models` + `providers`
  + `default_model` (already `gpt-4.1-mini`).

## Protocol changes (constitution §1)

None. No `Stage`/`Phase`/`TraceEvent` touched; `STAGE_TO_STATION` / `STAGE_TO_PHASE`
stay total and unchanged.

## Data model changes

None. No new column; provider is not persisted (one usable provider).

## i18n strings (constitution §4)

| key / location | en | pt |
|---|---|---|
| `agentAnatomy.provider.title` | Provider | Provedor |
| `agentAnatomy.provider.help` | The LLM provider this agent runs on. | O provedor de LLM que este agente utiliza. |
| `agentAnatomy.provider.comingSoon` | Coming soon | Em breve |
| `agentAnatomy.provider.openaiNote` | Default — active provider. | Padrão — provedor ativo. |
| `agentAnatomy.provider.ollamaNote` | Run models locally. Preview — not yet available. | Rode modelos localmente. Prévia — ainda não disponível. |

(Proper nouns "OpenAI", "Ollama (local)" and all model ids/labels stay plain strings.)

## Cloud map (constitution §5)

n/a — no new tier/station/boundary.

## Test strategy (constitution §9 — TDD)

| Acceptance criterion | Test | File |
|---|---|---|
| AC1 | `model_ids()` set equality; 4o absent | `backend/tests/test_models_065.py` |
| AC2 | `settings.llm_model == gpt-4.1-mini` ∈ `model_ids()` | `backend/tests/test_models_065.py` |
| AC3 | `/api/chat` accepts `gpt-5.5`, 422 on `gpt-4o-mini` | `backend/tests/test_models_065.py` |
| AC4 | `/api/config` providers shape + default_provider | `backend/tests/test_config_providers_065.py` |
| AC5 | dialog renders Provider section, Ollama disabled | `frontend/src/components/AgentAnatomyDialog.provider.test.tsx` |
| AC6 | en/pt parity for `agentAnatomy.provider.*` | `frontend/src/i18n/agentAnatomy.test.ts` (extend) |
| AC7 | demo fixture model ids == backend; providers present | `backend/tests/test_models_065.py` (read JSON) + FE |

AC3's `/api/chat` assertion uses the allowlist guard only (it can assert the 422
shape without a real OpenAI round-trip); the keyless guard path already returns
422 before any model call, so it runs without a key.

## Risks / trade-offs

- **`gpt-5*` shows `$0` cost** (deferred pricing). Documented in spec non-goals;
  honest per `pricing.py`'s "prefers 0 over guessing" design.
- **Default move breaks pinned tests** referencing `gpt-4o-mini` as the default
  (`test_request_body_echo.py`, `test_chat_request_model.py`). They use
  `settings.llm_model` indirectly in places but also literal `gpt-4o-mini` — audit
  and update any that assert the *default* specifically; leave ones that pass an
  explicit (still-valid? no — 4o-mini is now invalid) model. `gpt-4o-mini` literals
  in those tests must move to a listed id.
- **Preview honesty**: the Ollama control must be truly non-selectable, not a
  styled-but-clickable radio.
