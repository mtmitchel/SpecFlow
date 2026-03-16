import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Config, ConfigSavePayload } from "../../types.js";
import { useToast } from "../context/toast.js";
import { ModelCombobox } from "../components/model-combobox.js";

interface SettingsModalProps {
  config: Config | null;
  onSave: (next: ConfigSavePayload) => Promise<void>;
}

export const SettingsModal = ({ config, onSave }: SettingsModalProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const isOpen = location.pathname === "/settings";

  const [form, setForm] = useState<Config | null>(config);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [modelsGeneration, setModelsGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dirty) {
      setForm(config);
      setApiKeyInput("");
    }
  }, [config]);

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
          <p>Settings could not be loaded. Check the terminal for errors.</p>
        </div>
      </div>
    );
  }

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
          <h2 className="heading-reset" style={{ fontSize: "1.1rem" }}>Settings</h2>
          <button type="button" className="settings-modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="settings-modal-body">
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (saving) return;
              const { hasApiKey, ...rest } = form;
              const hadKeyInput = !!apiKeyInput;
              const payload: ConfigSavePayload = {
                ...rest,
                ...(apiKeyInput ? { apiKey: apiKeyInput } : {})
              };
              setSaving(true);
              void onSave(payload)
                .then(() => {
                  showSuccess("Settings saved");
                  setDirty(false);
                  setApiKeyInput("");
                  if (hadKeyInput) {
                    setModelsGeneration((n) => n + 1);
                  }
                })
                .catch((err) => {
                  showError((err as Error).message ?? "Failed to save settings");
                })
                .finally(() => setSaving(false));
            }}
          >
            <label>
              Provider
              <select value={form.provider} onChange={(event) => { setDirty(true); setForm({ ...form, provider: event.target.value as Config["provider"] }); }}>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label>
              Model
              <ModelCombobox
                provider={form.provider}
                hasApiKey={form.hasApiKey ?? false}
                value={form.model}
                onSelect={(modelId) => { setDirty(true); setForm({ ...form, model: modelId }); }}
                modelsGeneration={modelsGeneration}
              />
            </label>
            <label>
              API key
              <input
                type="password"
                placeholder={form.hasApiKey ? "(key set -- leave blank to keep)" : "Paste your API key"}
                value={apiKeyInput}
                onChange={(event) => { setDirty(true); setApiKeyInput(event.target.value); }}
              />
              <span className="settings-readonly-hint">
                {form.hasApiKey
                  ? "Leave this blank to keep the saved key, or paste a new one."
                  : "Paste a key to load models and run planning."}
              </span>
            </label>
            <label>
              Host <span className="settings-readonly-hint">(set in the CLI)</span>
              <div className="settings-readonly">
                <span className="settings-readonly-value">{form.host}</span>
              </div>
            </label>
            <label>
              Port <span className="settings-readonly-hint">(set in the CLI)</span>
              <div className="settings-readonly">
                <span className="settings-readonly-value">{String(form.port)}</span>
              </div>
            </label>
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
  );
};
