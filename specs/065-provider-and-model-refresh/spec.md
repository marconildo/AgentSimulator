# Spec: Provider field + refreshed OpenAI model list

| | |
|---|---|
| **ID** | 065-provider-and-model-refresh |
| **Status** | done |
| **Author** | Reginaldo Silva |
| **Date** | 2026-06-17 |

## Problem / motivation

The Agent Anatomy dialog's Model picker advertises a stale curated list. It still
leads with the `gpt-4o` family and stops at `gpt-5`, so the current OpenAI
lineup the simulator should teach against (the `4.1` family and the full `5`
family, including `gpt-5.5`) is missing. A learner picking a model sees yesterday's
options.

Separately, the dialog has no notion of an LLM **provider**. The platform is
OpenAI-only today (constitution §2), but the story we want to tell is "you choose
a provider, then a model under it." Making the provider visible — with a second,
not-yet-built option clearly labelled as a preview — sets up that story without
pretending a second provider works (constitution §3: preview ≠ fake run).

## Goals

- Refresh the curated model list to the `gpt-4.1` family and the `gpt-5` family
  (including `gpt-5.5`); drop the `gpt-4o` family.
- Move the server default off the now-removed `gpt-4o-mini` to `gpt-4.1-mini`.
- Add a **Provider** field to the Agent Anatomy dialog: **OpenAI** (active, the
  default) and **Ollama (local)** (a disabled preview, "coming soon").
- Keep the online demo (`VITE_DEMO_MODE`) config fixture in sync.

## Non-goals

- Implementing a second provider. Ollama is a labelled preview only — selecting
  it is impossible (disabled control). No `LLMProvider` change, no backend
  provider routing. `get_provider()` still always returns `OpenAIProvider`.
- Persisting a `provider` on the agent row. There is exactly one usable provider,
  so there is nothing to store.
- Pricing for the `gpt-5` family. `pricing.py` intentionally returns `0.0` for an
  unlisted model ("prefers 0 over guessing"); we do not fabricate `gpt-5` list
  prices. Cost transparency for `gpt-5*` is therefore `$0` until real prices are
  added — documented, honest, deferred.

## User-facing behavior

- In the **Configure agent → Provider** section the user sees two options:
  - **OpenAI** — selected, marked as the default/active provider.
  - **Ollama (local)** — visibly disabled with a "coming soon" / preview badge;
    it cannot be selected.
- In **Configure agent → Model** the dropdown lists the refreshed models
  (`GPT-4.1 nano/mini/…`, `GPT-5 nano/mini/…`, `GPT-5.5`). The `gpt-4o` entries
  are gone. A fresh conversation pre-selects `gpt-4.1-mini`.
- All new prose (the Provider section title, help text, the "coming soon" badge,
  the OpenAI/Ollama option sublabels) ships in **en + pt** (constitution §4). The
  model ids/labels and the provider proper nouns ("OpenAI", "Ollama") stay plain
  strings.

## Acceptance criteria

1. **AC1** — `model_ids()` equals exactly
   `{gpt-4.1-nano, gpt-4.1-mini, gpt-4.1, gpt-5-nano, gpt-5-mini, gpt-5, gpt-5.5}`;
   neither `gpt-4o` nor `gpt-4o-mini` is present.
2. **AC2** — The server default model (`settings.llm_model`) is `gpt-4.1-mini`,
   and it is a member of `model_ids()` (a fresh `ChatRequest` with `model=None`
   resolves to a listed id).
3. **AC3** — `POST /api/chat` with `model="gpt-5.5"` is accepted (not a 422 from
   the allowlist guard); `model="gpt-4o-mini"` now returns **422** (no longer
   listed).
4. **AC4** — `GET /api/config` advertises a `providers` array containing exactly
   two rows: `openai` (with `available: true`) and `ollama` (with
   `available: false`), plus `default_provider == "openai"`, and the existing
   `models`/`default_model` keys stay present and mirror `model_ids()`.
5. **AC5** — The Agent Anatomy dialog renders a **Provider** section before the
   Model section; the Ollama option control is `disabled` and the OpenAI option
   is the selected one. (FE / RTL.)
6. **AC6** — Every new user-facing string in the Provider section exists in both
   `en` and `pt` (i18n parity test).
7. **AC7** — The demo fixture (`frontend/src/demo/fixtures/_config.json`) lists
   the same model ids as `model_ids()` and includes the `providers` payload, so
   the offline GitHub Pages build matches the live backend.

## Protocol / stage impact

- New/changed `Stage`(s): **none** — this is a request-input/config change, not a
  pipeline stage. No `TraceEvent`/`Phase`/station change.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **n/a**.

## Open questions (clarify before planning)

- [x] Keep or drop the `gpt-4o` family? → **Drop** (strictly 4.1-and-up).
- [x] Is Ollama functional? → **No**, preview/disabled only.
- [x] Where does the default move to? → `gpt-4.1-mini`.

## Out of scope / deferred

- Real `gpt-5*` pricing in `pricing.py`.
- A real Ollama (local) provider behind the preview toggle — its own future spec.
- Persisting the chosen provider on the agent.
