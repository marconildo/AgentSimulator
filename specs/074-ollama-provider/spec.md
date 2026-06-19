# Spec: Ollama local provider (real second LLM provider)

| | |
|---|---|
| **ID** | 074-ollama-provider |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-19 |

## Problem / motivation

Today the simulator runs **only** against OpenAI (constitution §2) and Ollama is a
deliberately **disabled preview** in the provider picker (065-provider-and-model-refresh):
the radio draws a "coming soon" box and cannot be chosen. Users who run models locally
with [Ollama](https://ollama.com) cannot point the agent at their own machine, and cannot
run the visualizer at all without an OpenAI key.

This spec turns Ollama into a **real, selectable second provider**. An agent can be bound
to Ollama, the user supplies their local server URL, the app **lists the models actually
installed on that server**, and the chosen provider + model are **persisted** so the choice
survives a reload/restart. Everything stays real (constitution §3) — Ollama execution is an
actual local LLM call, not a mock.

Because the app has been "single provider (OpenAI), required" since spec 003, this feature
**amends constitution §2** (multi-provider; OpenAI remains the default, Ollama is a real
opt-in alternative). The amendment is part of this change.

## Goals

- A user can choose **OpenAI** or **Ollama (local)** as the provider for an agent, from the
  "Configure agent" dialog. The choice is **per-agent** (consistent with model being
  per-agent since 042/044).
- When Ollama is selected, the user can enter the **local server URL** (default
  `http://localhost:11434`) and the app **lists the models installed on that server** for
  selection — no hardcoded model list.
- The provider + model selection is **persisted in the database** (per-agent), and the
  Ollama server URL is **persisted** (instance-global, DB-backed with an env default), so
  nothing is lost on reload/restart.
- When an agent is bound to Ollama, a chat runs against the **real** local Ollama server;
  an OpenAI key is **not** required for that run.
- OpenAI behavior is **byte-for-byte unchanged** when an agent stays on OpenAI (default).

## Non-goals

- No new pipeline `Stage` / `Phase` / `TraceEvent` — provider is a request-only input like
  `model` (042). The canvas, station map, and timeline are untouched (constitution §1/§6).
- No agent-node relabel by provider (the runtime radio still owns the agent label, 061).
- No automatic model download / `ollama pull` from the UI — we only **list** what is already
  installed and let the user pick.
- No change to the OpenAI demo build (058 `VITE_DEMO_MODE`); that showcase still replays
  captured traces and runs no provider.
- No embeddings-on-Ollama (RAG still embeds via OpenAI). Deferred — see *Out of scope*.

## User-facing behavior

In the **Configure agent** dialog:

- **Provider** section becomes interactive: a radio with **OpenAI** and **Ollama (local)**,
  both selectable. The selection is saved on the agent immediately.
- Selecting **Ollama (local)** reveals:
  - a **Server URL** text field (prefilled with the saved/instance-default URL); editing it
    saves the instance-wide Ollama URL.
  - a **Model** dropdown populated from the **live list of models installed on that server**.
    A small **Refresh** affordance re-queries the server. If the server is unreachable or has
    no models, a clear bilingual message explains how to fix it (start Ollama / `ollama pull`).
- Selecting **OpenAI** keeps the existing curated model dropdown (042/065).

Sending a message uses the agent's persisted provider + model. With an Ollama-bound agent and
no OpenAI key, the app still boots and the run succeeds against the local server.

All new prose ships in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1 (amendment)** — Constitution §2 is amended in this change to describe a default
   OpenAI provider plus a real opt-in Ollama provider; the "single provider" wording no
   longer stands. (Verified by review; the rest of the ACs are the testable behavior.)
2. **AC2 (provider factory)** — `get_provider(provider="ollama", model=…, base_url=…)`
   returns a real Ollama-backed `LLMProvider` **without** requiring `OPENAI_API_KEY`
   (no `MissingAPIKeyError`). `get_provider()` / `provider="openai"` is unchanged and still
   fails fast without a key. *(keyless test)*
3. **AC3 (per-agent persistence)** — The `agents` row carries a `provider` field
   (default `"openai"`); `POST /api/agents` and `PATCH /api/agents/{id}` accept and persist
   it; `GET /api/agents` returns it. Existing rows migrate to `"openai"`. *(keyless test)*
4. **AC4 (model allowlist scoped to OpenAI)** — `POST /api/chat` enforces the curated model
   allowlist **only** when the effective provider is OpenAI. For an Ollama-bound agent any
   non-empty model id is accepted (no 422); an empty model for either provider is rejected.
   *(keyless test)*
5. **AC5 (URL persistence)** — The Ollama server URL is persisted server-side
   (`GET /api/settings/ollama` returns it; `PUT /api/settings/ollama` updates it) and
   survives restart. Its default comes from env `OLLAMA_BASE_URL`
   (fallback `http://localhost:11434`). *(keyless test)*
6. **AC6 (model listing)** — `GET /api/ollama/models?base_url=…` returns the models installed
   on that server (proxying Ollama's `/api/tags`); an unreachable server yields a structured
   "not reachable" response (not a 500), with an honest error message. *(keyless test, HTTP
   mocked)*
7. **AC7 (real run, integration)** — With a reachable Ollama server and an installed model,
   an Ollama-bound chat fires the same structural stages as an OpenAI run and produces a
   non-empty answer. *(marked `@pytest.mark.ollama`, skipped when no server is configured —
   mirrors the `tavily` marker pattern.)*
8. **AC8 (FE provider+model)** — In the dialog, selecting **Ollama** persists
   `provider="ollama"` on the agent, reveals the Server URL field and a model dropdown
   populated from `GET /api/ollama/models`; an unreachable server shows the bilingual hint.
   Selecting **OpenAI** restores the curated dropdown. *(Vitest)*
9. **AC9 (bilingual)** — Every new string (provider notes, server-URL label/placeholder,
   refresh, unreachable/empty hints) exists in **both** `en` and `pt`. *(Vitest + review)*
10. **AC10 (OpenAI unchanged)** — With the default OpenAI agent, `/api/config`, `/api/chat`,
    and the dialog behave exactly as before (regression). *(existing suite stays green.)*

## Protocol / stage impact

- New/changed `Stage`(s): **none**. Provider is a request-only input (like `model`).
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none** (no new station/hop/tier).

## Open questions (clarify before planning)

- [x] Amend §2 or keep preview? → **Amend** (multi-provider). *(user, 2026-06-19)*
- [x] Per-agent or global provider? → **Per-agent** provider+model; **global** server URL. *(user)*
- [x] Persist where? → **DB** (per-agent `provider`; instance `app_config` URL) + env default. *(user)*

## Out of scope / deferred

- Ollama **embeddings** for RAG (keep OpenAI embeddings for now).
- One-click `ollama pull` / model management from the UI.
- Per-agent Ollama URL (URL stays instance-global this round).
- Reporting the active provider on `/api/health` and in the cloud overlay.
