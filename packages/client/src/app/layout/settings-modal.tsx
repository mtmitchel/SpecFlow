import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { normalizeConfig } from "../../config-normalization.js";
import type { Config, ConfigSavePayload } from "../../types.js";
import { useToast } from "../context/toast.js";
import { ModelCombobox } from "../components/model-combobox.js";

const PROVIDER_OPTIONS: { value: Config["provider"]; label: string }[] = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
];

const DEFAULT_PROVIDER_MODELS: Record<Config["provider"], string> = {
  anthropic: "claude-opus-4-5",
  openai: "gpt-5-mini",
  openrouter: "openrouter/auto"
};

interface SettingsModalProps {
  config: Config | null;
  onSave: (next: ConfigSavePayload, apiKey?: string) => Promise<void>;
}

export const SettingsModal = ({ config, onSave }: SettingsModalProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const isOpen = location.pathname === "/settings";

  const [form, setForm] = useState<Config | null>(() => normalizeConfig(config));
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [modelsGeneration, setModelsGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [activeSection, setActiveSection] = useState<'general' | 'providers'>('providers');
  const overlayRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty) {
      setForm(normalizeConfig(config));
      setApiKeyInput("");
    }
  }, [config, dirty]);

  const close = useCallback(() => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  if (!form) {
    return (
      <div className="settings-modal-overlay" onClick={close}>
        <div className="settings-modal-panel" onClick={(e) => e.stopPropagation()}>
          <p>We couldn't load settings. Check the terminal for details.</p>
        </div>
      </div>
    );
  }

  const selectedProviderHasApiKey = form.providerKeyStatus[form.provider] ?? false;

  return (
    <div
      ref={overlayRef}
      className="settings-modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) close(); }}
      aria-modal="true"
      role="dialog"
      aria-label="Settings"
    >
      <div className="settings-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div>
            <h2 className="heading-reset settings-modal-heading">Providers &amp; Agents</h2>
            <p className="text-muted-sm" style={{ margin: '0.2rem 0 0' }}>Configure LLM providers and model preferences</p>
          </div>
          <button type="button" className="settings-modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="settings-modal-body">
          <nav className="settings-modal-nav">
            <button
              className={`settings-modal-nav-item ${activeSection === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveSection('providers')}
            >
              LLM Providers
            </button>
            <button
              className={`settings-modal-nav-item ${activeSection === 'general' ? 'active' : ''}`}
              onClick={() => setActiveSection('general')}
            >
              General
            </button>
            <button className="settings-modal-nav-item disabled" disabled>
              More options coming later
            </button>
          </nav>

          <div className="settings-modal-content">
            <form
              className="settings-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (saving) return;
                const { hasApiKey: _hasApiKey, providerKeyStatus: _providerKeyStatus, ...rest } = form;
                const trimmedApiKey = apiKeyInput.trim();
                const hadKeyInput = Boolean(trimmedApiKey);
                const payload: ConfigSavePayload = rest;
                setSaving(true);
                void onSave(payload, trimmedApiKey || undefined)
                  .then(() => {
                    showSuccess("Settings saved.");
                    setDirty(false);
                    setApiKeyInput("");
                    if (hadKeyInput) {
                      setModelsGeneration((n) => n + 1);
                    }
                  })
                  .catch((err) => {
                    showError((err as Error).message ?? "We couldn't save settings.");
                  })
                  .finally(() => setSaving(false));
              }}
            >
              {activeSection === 'providers' ? (
                <>
                  <div className="settings-provider-grid" ref={providerRef}>
                    {PROVIDER_OPTIONS.map((opt) => {
                      const isSelected = form.provider === opt.value;
                      const hasKey = form.providerKeyStatus[opt.value] ?? false;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          className={`settings-provider-card${isSelected ? " settings-provider-card-selected" : ""}`}
                          onClick={() => {
                            setDirty(true);
                            const nextHasApiKey = form.providerKeyStatus[opt.value] ?? false;
                            setForm({
                              ...form,
                              provider: opt.value,
                              model: opt.value === form.provider ? form.model : DEFAULT_PROVIDER_MODELS[opt.value],
                              hasApiKey: nextHasApiKey,
                            });
                          }}
                        >
                          <span className="settings-provider-card-icon" aria-hidden="true">
                            {opt.label.slice(0, 2).toUpperCase()}
                          </span>
                          <strong>{opt.label}</strong>
                          <span className="settings-provider-card-status">
                            {hasKey ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "Not configured"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <label>
                    API key
                    <input
                      type="password"
                      placeholder={selectedProviderHasApiKey ? "(key set -- leave blank to keep)" : "Paste your API key"}
                      value={apiKeyInput}
                      onChange={(event) => { setDirty(true); setApiKeyInput(event.target.value); }}
                    />
                    <span className="settings-readonly-hint">
                      {selectedProviderHasApiKey
                        ? "Leave this blank to keep the saved key, or paste a new one."
                        : "Paste a key to load models and run planning."}
                    </span>
                  </label>
                  <label>
                    Model
                    <ModelCombobox
                      provider={form.provider}
                      hasApiKey={selectedProviderHasApiKey}
                      value={form.model}
                      onSelect={(modelId) => { setDirty(true); setForm({ ...form, model: modelId }); }}
                      modelsGeneration={modelsGeneration}
                    />
                  </label>
                </>
              ) : (
                <>
                  <p className="settings-readonly-hint settings-general-hint">
                    Host and port are set in the CLI.
                  </p>
                  <label>
                    Host
                    <div className="settings-readonly">
                      <span className="settings-readonly-value">{form.host}</span>
                    </div>
                  </label>
                  <label>
                    Port
                    <div className="settings-readonly">
                      <span className="settings-readonly-value">{String(form.port)}</span>
                    </div>
                  </label>
                </>
              )}
              <div className="settings-button-row">
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button type="button" className="settings-cancel" onClick={close}>
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
