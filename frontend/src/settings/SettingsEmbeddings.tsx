// 075-ollama-embeddings · Embeddings (RAG) section.
//
// Instance-wide choice of which provider produces embeddings — OpenAI (cloud,
// needs a key) or a local Ollama model (no key). NOT per-agent: one Chroma
// collection has one vector dimension. Changing the model changes the embedding
// space, so the index rebuilds on the next startup / re-ingest (the backend
// stamps + compares an embedding signature). Saving persists to the DB.

import { useEffect, useState } from "react";

import { useT } from "../i18n";
import {
  getEmbeddingSettings,
  getOllamaModels,
  setEmbeddingSettings,
  getVertexAISettings,
  getConfig,
  type OllamaModelsResult,
  type ModelInfo,
} from "../lib/chatApi";
import { useHealth } from "../lib/health";

export function SettingsEmbeddings() {
  const t = useT().settings.embeddings;

  const [provider, setProvider] = useState<string>("openai");
  const [model, setModel] = useState<string>("");
  const [saved, setSaved] = useState(false);
  const [ollama, setOllama] = useState<OllamaModelsResult | null>(null);
  const [vertexAIModels, setVertexAIModels] = useState<ModelInfo[]>([]);
  const [hasVertexAICreds, setHasVertexAICreds] = useState<boolean>(true);

  useEffect(() => {
    getEmbeddingSettings()
      .then((s) => {
        setProvider(s.provider);
        setModel(s.model);
      })
      .catch(() => { });

    // Fetch config for Vertex AI embedding models
    getConfig()
      .then((cfg) => {
        if (cfg.vertexai_embedding_models) {
          setVertexAIModels(cfg.vertexai_embedding_models);
        }
      })
      .catch(() => { });

    // Check if GCP credentials are saved
    getVertexAISettings()
      .then((v) => {
        setHasVertexAICreds(v.has_credentials);
      })
      .catch(() => { });
  }, []);

  // When Ollama is selected, list the installed models (reuses the 074 proxy).
  useEffect(() => {
    if (provider !== "ollama") return;
    getOllamaModels()
      .then(setOllama)
      .catch(() => setOllama({ reachable: false, base_url: "", models: [] }));
  }, [provider]);

  function persist(next: { provider?: string; model?: string }) {
    setSaved(false);
    setEmbeddingSettings(next)
      .then((s) => {
        setProvider(s.provider);
        setModel(s.model);
        setSaved(true);
        useHealth.getState().load().catch(() => {});
      })
      .catch(() => { });
  }

  function pickProvider(p: string) {
    setProvider(p);
    const isDropdown = p === "vertexai" || p === "ollama";
    const nextModel = isDropdown ? model : "";
    if (nextModel !== model) {
      setModel(nextModel);
      persist({ provider: p, model: nextModel });
    } else {
      persist({ provider: p });
    }
  }

  return (
    <section>
      <div className="mb-1 text-[12px] font-semibold text-[var(--color-ink)]">{t.title}</div>
      <p className="mb-2 text-[11px] leading-snug text-[var(--color-muted)]">{t.hint}</p>

      <div className="space-y-1.5">
        {[
          { id: "openai", note: t.openai },
          { id: "ollama", note: t.ollama },
          { id: "vertexai", note: t.vertexai },
        ].map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-[12px] text-[var(--color-ink)]"
          >
            <input
              type="radio"
              name="settings-embedding-provider"
              data-testid={`settings-embedding-provider-${p.id}`}
              value={p.id}
              checked={provider === p.id}
              onChange={() => pickProvider(p.id)}
              className="mt-0.5"
            />
            <span className="text-[10.5px] leading-snug text-[var(--color-muted)]">{p.note}</span>
          </label>
        ))}
      </div>

      <div className="mt-2 space-y-1">
        <span className="text-[11px] font-medium text-[var(--color-ink)]">{t.model}</span>
        {provider === "vertexai" && !hasVertexAICreds && (
          <p data-testid="settings-embedding-hint" className="text-[11px] text-[var(--color-warn,#c0392b)] mb-1 leading-snug">
            {t.vertexaiHint}
          </p>
        )}

        {provider === "ollama" && ollama && !ollama.reachable ? (
          <p data-testid="settings-embedding-hint" className="text-[11px] text-[var(--color-warn,#c0392b)]">
            {t.unreachable}
          </p>
        ) : provider === "ollama" && ollama && ollama.models.length > 0 ? (
          <select
            aria-label={t.model}
            data-testid="settings-embedding-model"
            value={model}
            onChange={(e) => persist({ model: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          >
            {model && !ollama.models.some((m) => m.id === model) && (
              <option value={model}>{model}</option>
            )}
            {ollama.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </select>
        ) : provider === "vertexai" && vertexAIModels.length > 0 ? (
          <select
            aria-label={t.model}
            data-testid="settings-embedding-model"
            value={model}
            onChange={(e) => persist({ model: e.target.value })}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          >
            {model && !vertexAIModels.some((m) => m.id === model) && (
              <option value={model}>{model}</option>
            )}
            {vertexAIModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            data-testid="settings-embedding-model"
            value={model}
            placeholder={t.modelPlaceholder}
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => persist({ model })}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
          />
        )}
      </div>

      <p className="mt-1.5 text-[10.5px] leading-snug text-[var(--color-muted)]">{t.rebuildNote}</p>
      {saved && <p className="mt-1 text-[10.5px] text-[var(--color-ok,#2e7d32)]">{t.saved}</p>}
    </section>
  );
}
