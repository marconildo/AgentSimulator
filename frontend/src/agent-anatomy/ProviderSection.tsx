// 065-provider-and-model-refresh · 074-ollama-provider · 🔌 Provider picker.
// Reads /api/config.providers so the provider names are never hardcoded. Both
// OpenAI and Ollama are now real, selectable providers (074 made Ollama real;
// it was a disabled preview under 065). The choice is per-agent — it persists on
// the agent row via `updateAgent({ provider })`.
//
// When Ollama is selected the section also shows the local **server URL** field
// (instance-global, persisted server-side via /api/settings/ollama) and a live
// **model dropdown** populated from that server's installed models. An
// unreachable server / empty install shows a bilingual hint instead of failing.

import { useCallback, useEffect, useState } from "react";

import { useT } from "../i18n";
import { useActiveAgent } from "../lib/agentAccess";
import { useHealth } from "../lib/health";
import {
  getConfig,
  getOllamaModels,
  getOllamaSettings,
  getOpenAISettings,
  getVertexAISettings,
  setOllamaSettings,
  setOpenAISettings,
  setVertexAISettings,
  type AppConfig,
  type OllamaModelsResult,
} from "../lib/chatApi";

export function ProviderSection() {
  const t = useT().agentAnatomy.provider;
  const { agent, updateAgent, flush } = useActiveAgent();

  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => {});
  }, []);

  const providers = config?.providers ?? [];
  const provider = agent?.provider ?? config?.default_provider ?? "openai";
  const isOllama = provider === "ollama";
  const isVertexAI = provider === "vertexai";

  // Ollama server URL — loaded once when the Ollama branch first shows.
  const [baseUrl, setBaseUrl] = useState("");
  const [urlLoaded, setUrlLoaded] = useState(false);
  useEffect(() => {
    if (!isOllama || urlLoaded) return;
    getOllamaSettings()
      .then((s) => {
        setBaseUrl(s.base_url);
        setUrlLoaded(true);
      })
      .catch(() => setUrlLoaded(true));
  }, [isOllama, urlLoaded]);

  // Live model list from the server (backend proxies /api/tags).
  const [models, setModels] = useState<OllamaModelsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const loadModels = useCallback((url: string) => {
    setLoading(true);
    getOllamaModels(url)
      .then(setModels)
      .catch(() => setModels({ reachable: false, base_url: url, models: [], error: "error" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (isOllama && urlLoaded) loadModels(baseUrl);
    // Only re-list when the branch opens / URL first loads — not on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOllama, urlLoaded]);

  // Vertex AI Settings
  const [vertexProject, setVertexProject] = useState("");
  const [vertexLocation, setVertexLocation] = useState("global");
  const [vertexCreds, setVertexCreds] = useState("");
  const [vertexCredsStatus, setVertexCredsStatus] = useState<{
    has_credentials: boolean;
    masked_credentials: string | null;
  } | null>(null);
  const [vertexState, setVertexState] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  const [vertexSettingsLoaded, setVertexSettingsLoaded] = useState(false);

  useEffect(() => {
    if (!isVertexAI || vertexSettingsLoaded) return;
    getVertexAISettings()
      .then((s) => {
        setVertexProject(s.project);
        setVertexLocation(s.location || "global");
        setVertexCredsStatus({
          has_credentials: s.has_credentials,
          masked_credentials: s.masked_credentials,
        });
        if (s.masked_credentials) {
          setVertexCreds(s.masked_credentials);
        }
        setVertexSettingsLoaded(true);
      })
      .catch(() => setVertexSettingsLoaded(true));
  }, [isVertexAI, vertexSettingsLoaded]);

  function saveVertexAI() {
    setVertexState("testing");
    const model = agent?.model ?? "gemini-2.5-flash";
    setVertexAISettings(vertexProject.trim(), vertexLocation.trim(), vertexCreds.trim(), model)
      .then((r) => {
        setVertexCredsStatus({
          has_credentials: r.has_credentials,
          masked_credentials: r.masked_credentials,
        });
        if (r.ok && r.masked_credentials) {
          setVertexCreds(r.masked_credentials);
        }
        setVertexState(r.ok ? "connected" : "failed");
        void useHealth.getState().load();
      })
      .catch(() => setVertexState("failed"));
  }

  function selectProvider(id: string) {
    if (id === provider) return;
    // 074/078 fix: switching the provider must reconcile the model — leaving an
    // Ollama model on the OpenAI provider was the real "backend error 14/14" bug
    // (OpenAI 404s on `phi4-mini`). Switching to OpenAI resets to the curated
    // default; switching to Ollama, the model dropdown below forces a valid pick.
    if (id === "openai") {
      updateAgent({ provider: id, model: config?.default_model || "gpt-4.1-mini" });
    } else if (id === "vertexai") {
      updateAgent({ provider: id, model: "gemini-2.5-flash" });
    } else {
      updateAgent({ provider: id });
    }
    flush(); // a discrete choice should persist immediately (no blur to wait for)
  }

  // When the Ollama model list loads and the agent's current model isn't installed
  // (e.g. a leftover OpenAI id after switching to Ollama), default the dropdown's
  // selection to the first installed model so the displayed value is always valid.
  const ollamaModelValue =
    isOllama && models?.reachable && models.models.length > 0
      ? models.models.some((m) => m.id === (agent?.model ?? ""))
        ? (agent?.model ?? "")
        : models.models[0].id
      : (agent?.model ?? "");

  function saveUrl() {
    const url = baseUrl.trim();
    if (!url) return;
    setOllamaSettings(url)
      .then(() => loadModels(url))
      .catch(() => {});
  }

  function selectModel(id: string) {
    updateAgent({ model: id });
    flush();
  }

  // 078-openai-key-ui: the OpenAI key, entered here + saved server-side.
  const isOpenAI = provider === "openai";
  const [keyStatus, setKeyStatus] = useState<{ has_key: boolean; masked: string | null } | null>(
    null,
  );
  const [keyInput, setKeyInput] = useState("");
  const [keyState, setKeyState] = useState<"idle" | "testing" | "connected" | "failed">("idle");
  useEffect(() => {
    if (!isOpenAI) return;
    getOpenAISettings()
      .then((s) => setKeyStatus({ has_key: s.has_key, masked: s.masked }))
      .catch(() => {});
  }, [isOpenAI]);

  function saveKey() {
    setKeyState("testing");
    setOpenAISettings(keyInput.trim())
      .then((r) => {
        setKeyStatus({ has_key: r.has_key, masked: r.masked });
        setKeyInput("");
        setKeyState(r.tested ? (r.ok ? "connected" : "failed") : "idle");
        // Refresh health so the no-key banner clears without a reload.
        void useHealth.getState().load();
      })
      .catch(() => setKeyState("failed"));
  }

  return (
    <section data-anatomy-section="provider" className="space-y-2">
      <p className="text-[11px] leading-snug text-[var(--color-muted)]">{t.help}</p>
      <div className="space-y-1.5">
        {providers.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-[12px] text-[var(--color-ink)]"
          >
            <input
              type="radio"
              name="agent-anatomy-provider"
              data-testid={`agent-anatomy-provider-${p.id}`}
              value={p.id}
              checked={provider === p.id}
              onChange={() => selectProvider(p.id)}
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">{p.label}</span>
              <span className="text-[10.5px] leading-snug text-[var(--color-muted)]">
                {p.id === "ollama"
                  ? t.ollamaNote
                  : p.id === "vertexai"
                    ? t.vertexaiNote
                    : t.activeNote}
              </span>
            </span>
          </label>
        ))}
      </div>

      {isOllama && (
        <div className="space-y-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-[var(--color-ink)]">
              {t.serverUrlLabel}
            </span>
            <input
              type="text"
              data-testid="agent-anatomy-ollama-url"
              value={baseUrl}
              placeholder={t.serverUrlPlaceholder}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={saveUrl}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <p className="text-[10.5px] leading-snug text-[var(--color-muted)]">{t.serverUrlHelp}</p>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-[var(--color-ink)]">{t.modelLabel}</span>
            <button
              type="button"
              data-testid="agent-anatomy-ollama-refresh"
              onClick={() => loadModels(baseUrl)}
              className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[10.5px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              {t.refresh}
            </button>
          </div>

          {loading ? (
            <p className="text-[11px] text-[var(--color-muted)]">{t.loadingModels}</p>
          ) : models && !models.reachable ? (
            <p data-testid="agent-anatomy-ollama-hint" className="text-[11px] text-[var(--color-warn,#c0392b)]">
              {t.unreachable}
            </p>
          ) : models && models.models.length === 0 ? (
            <p data-testid="agent-anatomy-ollama-hint" className="text-[11px] text-[var(--color-muted)]">
              {t.noModels}
            </p>
          ) : (
            <select
              aria-label={t.modelLabel}
              data-testid="agent-anatomy-ollama-model"
              value={ollamaModelValue}
              onChange={(e) => selectModel(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            >
              {(models?.models ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {isVertexAI && (
        <div className="space-y-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-[var(--color-ink)]">
              {t.projectLabel}
            </span>
            <input
              type="text"
              data-testid="agent-anatomy-vertexai-project"
              value={vertexProject}
              placeholder={t.projectPlaceholder}
              onChange={(e) => setVertexProject(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-[var(--color-ink)]">
              {t.locationLabel}
            </span>
            <input
              type="text"
              data-testid="agent-anatomy-vertexai-location"
              value={vertexLocation}
              placeholder={t.locationPlaceholder}
              onChange={(e) => setVertexLocation(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-ink)]">
              {t.credentialsLabel}
              <span
                title={t.credentialsTooltip}
                className="cursor-help text-[10px] text-[var(--color-muted)] underline decoration-dotted"
              >
                (ℹ️)
              </span>
            </span>
            <textarea
              data-testid="agent-anatomy-vertexai-credentials"
              value={vertexCreds}
              placeholder={t.credentialsPlaceholder}
              onChange={(e) => setVertexCreds(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] resize-none"
            />
          </label>

          {vertexCredsStatus?.has_credentials && vertexCredsStatus.masked_credentials && (
            <p className="text-[10.5px] text-[var(--color-muted)]">
              {t.credentialsSavedHint}
            </p>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="agent-anatomy-vertexai-save"
              onClick={saveVertexAI}
              disabled={vertexState === "testing"}
              className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50"
            >
              {t.vertexaiSave}
            </button>
            {vertexState === "testing" && (
              <span className="text-[10.5px] text-[var(--color-muted)]">{t.vertexaiTesting}</span>
            )}
            {vertexState === "connected" && (
              <span data-testid="agent-anatomy-vertexai-status" className="text-[10.5px] text-[var(--color-ok,#2e7d32)]">
                {t.vertexaiConnected}
              </span>
            )}
            {vertexState === "failed" && (
              <span data-testid="agent-anatomy-vertexai-status" className="text-[10.5px] text-[var(--color-warn,#c0392b)]">
                {t.vertexaiFailed}
              </span>
            )}
          </div>
        </div>
      )}

      {isOpenAI && (
        <div className="space-y-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2.5">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-[var(--color-ink)]">{t.keyLabel}</span>
            <input
              type="password"
              data-testid="agent-anatomy-openai-key"
              value={keyInput}
              placeholder={t.keyPlaceholder}
              onChange={(e) => setKeyInput(e.target.value)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          {keyStatus?.has_key && keyStatus.masked && (
            <p className="text-[10.5px] text-[var(--color-muted)]">
              {t.keySavedHint} <span className="font-mono">{keyStatus.masked}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="agent-anatomy-openai-save"
              onClick={saveKey}
              disabled={keyState === "testing"}
              className="rounded-md border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-ink)] hover:border-[var(--color-accent)] disabled:opacity-50"
            >
              {t.keySave}
            </button>
            {keyState === "testing" && (
              <span className="text-[10.5px] text-[var(--color-muted)]">{t.keyTesting}</span>
            )}
            {keyState === "connected" && (
              <span data-testid="agent-anatomy-openai-status" className="text-[10.5px] text-[var(--color-ok,#2e7d32)]">
                {t.keyConnected}
              </span>
            )}
            {keyState === "failed" && (
              <span data-testid="agent-anatomy-openai-status" className="text-[10.5px] text-[var(--color-warn,#c0392b)]">
                {t.keyFailed}
              </span>
            )}
          </div>
          <p className="text-[10.5px] leading-snug text-[var(--color-muted)]">{t.keyEnvNote}</p>
        </div>
      )}
    </section>
  );
}
