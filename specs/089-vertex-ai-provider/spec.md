# Spec: Vertex AI provider (real third LLM provider)

|            |                        |
| ------------| ------------------------|
| **ID**     | 089-vertex-ai-provider |
| **Status** | done                     |
| **Author** | Elizeu Reis            |
| **Date**   | 2026-06-23             |

## Problem / motivation

Currently, the simulator runs against OpenAI or Ollama (local). OpenAI requires an OpenAI API key. Ollama requires a local Ollama server running. There is no support for Google Cloud's Vertex AI provider, which hosts the Gemini model family. Google Cloud is a major platform where developers build agentic workflows, and showing how an agent runs against Vertex AI completes the developer-facing options.

This spec introduces Google **Vertex AI** as a **real, selectable third provider**. An agent can be bound to Vertex AI, the user configures the GCP Project ID, Location, and the mandatory service account key JSON, and the app runs the agentic loop against real Gemini models.

Because the app has been "two providers (OpenAI, Ollama)" since spec 074, this feature **amends constitution §2** to include Vertex AI a real opt-in alternative. The amendment is part of this change.

## Goals

- A user can choose **Vertex AI** as the provider for an agent from the "Configure agent" dialog. The choice is **per-agent**.
- Selecting **Vertex AI** allows the user to configure instance-wide credentials in the settings card:
  - **GCP Project ID**: The GCP project where Vertex AI is enabled.
  - **GCP Location/Region**: The region to call (default: `global`, e.g. `us-central1`).
  - **Credentials JSON**: The service account JSON key credentials. This field is **mandatory** and cannot be blank.
- The credentials/project/location are **persisted** in the relational store (`app_config` key-value table) and survive restart.
- Selecting Vertex AI provides a curated list of Gemini chat models:
  - `gemini-3.1-pro-preview` (Gemini 3.1 Pro)
  - `gemini-3.5-flash` (Gemini 3.5 Flash)
  - `gemini-3-flash-preview` (Gemini 3 Flash)
  - `gemini-2.5-flash-lite` (Gemini 2.5 Flash Lite)
  - `gemini-2.5-flash` (Gemini 2.5 Flash)
  - `gemini-2.5-pro` (Gemini 2.5 Pro)
- When an agent is bound to Vertex AI, a chat runs against the real Google Vertex AI API; an OpenAI key is **not** required for that run.
- Existing OpenAI and Ollama behaviors are **byte-for-byte unchanged**.

## Non-goals

- No new pipeline `Stage` / `Phase` / `TraceEvent` — provider is a request-only input like `model`. The canvas, station map, and timeline are untouched (constitution §1/§6).
- No change to the online demo build (`VITE_DEMO_MODE`); that showcase still replays captured traces and runs no provider.
- No embeddings-on-Vertex AI (RAG still embeds via OpenAI or Ollama depending on settings).
- Dynamic model listing via the Vertex AI API (the dropdown will list a curated, static set of Gemini models).

## User-facing behavior

In the **Configure agent** dialog:
- **Provider** section displays a third radio option: **Vertex AI**.
- Selecting **Vertex AI** reveals a configuration box containing:
  - **GCP Project ID**: Prefilled with the saved Project ID (or loaded from backend environment default).
  - **GCP Location**: Prefilled with the saved Location (default `global`).
  - **Credentials JSON**: A textarea/password field for entering a Google service account key JSON. If credentials exist and have been saved, the field is prefilled with the service account's `client_email` for security and reference. If the user only updates the project or location, they do not need to re-enter the credentials JSON (saving with the prefilled `client_email` or blank string correctly reuses the saved credentials).
  - An **info tooltip icon (ℹ️)** next to the "Google Service Account Key JSON" label containing step-by-step instructions for generating the JSON key in the Google Cloud Console.
  - A **Save & test** button. Clicking it saves the settings and performs a connection check (an invocation check or validation). If successful, a green "Connected" status appears. If failed, a red error message is shown.
- **Model** section shows a curated dropdown populated with Gemini models (`Gemini 2.5 Flash Lite`, etc.) when Vertex AI is selected.

All new prose/labels ship in **en + pt** (constitution §4).

## Acceptance criteria

1. **AC1 (amendment)** — Constitution §2 is amended in this change to describe a default OpenAI provider plus real opt-in Ollama and Vertex AI providers. (Verified by review).
2. **AC2 (provider factory)** — `get_provider(provider="vertexai", model=...)` returns a real Vertex AI-backed `LLMProvider` using `langchain_google_vertexai`. It handles system prompt assembly, tool binding, message streaming, and token usage parsing. It does **not** require `OPENAI_API_KEY`.
3. **AC3 (per-agent persistence)** — The `agents` row supports `provider="vertexai"`; `POST /api/agents` and `PATCH /api/agents/{id}` accept and persist it; `GET /api/agents` returns it.
4. **AC4 (model validation)** — `POST /api/chat` validates `ChatRequest.model` against the curated Gemini list when the effective provider is Vertex AI.
5. **AC5 (GCP settings persistence)** — The GCP project, location, and credentials JSON are persisted server-side (`GET /api/settings/vertexai` returns them with credentials masked; `PUT /api/settings/vertexai` updates them) and survive restart. Env defaults are loaded when DB records are empty.
6. **AC6 (test connection)** — `PUT /api/settings/vertexai` validates the connection by making a very simple API call (e.g. predicting a single token from the model) to verify credentials, project, and location configuration.
7. **AC7 (real run, integration)** — With valid Vertex AI settings, a Vertex AI-bound chat fires the same structural stages as other providers and produces a non-empty answer. (marked `@pytest.mark.vertexai`, skipped when no credentials are set).
8. **AC8 (FE provider+settings)** — In the dialog, selecting Vertex AI persists `provider="vertexai"` on the agent, reveals the project, location, and credentials fields, and updates the model dropdown to list the curated Gemini models.
9. **AC9 (bilingual)** — Every new string (labels, notes, placeholders, status messages) exists in **both** `en` and `pt`.
10. **AC10 (regression)** — Existing OpenAI and Ollama configurations behave exactly as before.

## Protocol / stage impact

- New/changed `Stage`(s): **none**.
- Mirror in `frontend/src/types/events.ts`: **n/a**.
- Station it maps to in `stations.ts`: **none**.

## Open questions (clarify before planning)

- [x] How should credentials be validated? → Make a very simple API call (e.g., predicting a single token from the model) to verify credentials, project, and region.
- [x] Should we use `langchain-google-vertexai` or `langchain-google-genai`? → Vertex AI uses `langchain-google-vertexai`.

## Out of scope / deferred

- Vertex AI embeddings for RAG.
- Google AI Studio (Gemini API via Developer Key) provider.
