# Spec: OpenAI API key in the UI + dynamic model listing

| | |
|---|---|
| **ID** | 076-openai-key-ui |
| **Status** | planned |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

## Problem / motivation

Today the OpenAI key comes **only** from the environment (`OPENAI_API_KEY`). A user
running the simulator can't supply their key from the UI, and the model dropdown is a
hand-curated static list (042/065) that can drift from what their account actually
exposes. With 074/075 making Ollama a real key-free path, the OpenAI path should be just
as self-service: **enter the key in the app**, save it, **test the connection**, and on
success **list the OpenAI chat models live** from the account.

This **re-amends constitution §2**: the OpenAI key may now also be supplied via the UI and
persisted in the DB, with the DB value taking precedence over the env. The env stays a
**fallback** (so CI — which injects the key as a secret — and Docker keep working).

## Goals

- In the agent dialog's **Provider** section, when **OpenAI** is selected, show an **API
  key** field + **Save** action. The key is persisted (DB) and **never required from env**.
- On save, **test the connection**; on success, **list the OpenAI chat models live**
  (from `/v1/models`, filtered to chat-capable families) and populate the model dropdown.
- The effective key is **DB-first, env-fallback**: a UI-saved key wins; with none saved,
  the env key is used (unchanged behavior for CI/Docker).
- The key is **never returned in full** by any read endpoint (masked: `sk-…1234`).
- With a valid key (DB or env), chat + embeddings run exactly as before.

## Non-goals

- No encryption-at-rest / secrets vault — plaintext in the single-instance SQLite, same
  trust model as the rest of the local DB (documented under security). A real KMS is a
  later spec if the tool ever goes multi-tenant.
- No per-agent OpenAI key (the key is **instance-global**, like the Ollama URL).
- No removal of the env path (kept as fallback per the clarify decision).
- No change to the Ollama provider/embeddings (074/075).

## User-facing behavior

In **Provider → OpenAI** (agent dialog):

- An **API key** input (password-style; shows only a masked hint when one is already
  saved, e.g. `sk-…1234`, never the full value) + **Save** button.
- Saving shows a status: **testing… → connected ✓** (and the live model count) or a clear
  **error** (invalid key / unreachable), all bilingual.
- On a successful save the **Model** dropdown lists the account's live chat models; with no
  key / offline it falls back to the curated list. A blank key clears the saved key
  (reverting to the env fallback).

All new prose ships in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1 (effective key)** — `get_provider()` / `get_embeddings()` use the **DB** key when
   present, else the **env** key; with neither, they fail fast (`MissingAPIKeyError`).
   `/api/health.has_key` reflects the effective key. *(keyless + keyed tests)*
2. **AC2 (persist + mask)** — `PUT /api/settings/openai` saves the key (DB `app_config`);
   `GET /api/settings/openai` returns `{has_key, masked, source}` and **never the full
   key**. A blank `PUT` clears it (falls back to env). Survives restart. *(keyless test)*
3. **AC3 (connection test)** — `PUT /api/settings/openai` (or a dedicated test endpoint)
   reports whether the key authenticates against OpenAI; an invalid/unreachable key yields
   a structured non-500 error. *(test, HTTP mocked)*
4. **AC4 (dynamic model list)** — `GET /api/openai/models` returns the account's chat
   models (live `/v1/models`, filtered to gpt-*/o-* families) using the effective key; no
   key / failure → structured `{reachable:false, models:[]}` so the FE falls back to the
   curated list. *(test, HTTP mocked)*
5. **AC5 (validation relaxed)** — `/api/chat` + `PATCH /api/agents` accept any **non-empty**
   model for OpenAI (the live list is the source of truth now), not just the curated
   allowlist; an empty model is still rejected. *(test)*
6. **AC6 (UI)** — the Provider section shows the key field + Save + status; saving persists,
   tests, and on success the Model dropdown lists live models; the masked hint shows for a
   saved key; errors render bilingually. *(Vitest)*
7. **AC7 (bilingual)** — every new string exists in **en** and **pt**. *(Vitest + review)*
8. **AC8 (env fallback unchanged)** — with no DB key and the env key set, everything behaves
   exactly as today (CI stays green). *(existing suite green.)*

## Protocol / stage impact

- New/changed `Stage`(s): **none** (key + model listing are config, not pipeline stages).
- Mirror in `events.ts`: **n/a**. Station mapping: **none** new.

## Open questions (clarify before planning)

- [x] Env fallback or DB-only? → **DB precedes, env fallback.** *(user, 2026-06-19)*
- [x] Curated list or dynamic? → **Dynamic from the API**, curated as offline fallback.
  *(user)*
- [ ] Should the connection test live inside `PUT` (save-then-test, one round-trip) or be a
  separate `POST /api/settings/openai/test`? *(lean: test inside `PUT`, return the result.)*

## Out of scope / deferred

- Encryption-at-rest / secrets manager; per-agent keys; multi-provider cloud keys
  (Anthropic/etc.); rotating/expiry handling.
