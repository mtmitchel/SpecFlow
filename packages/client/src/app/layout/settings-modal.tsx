import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { fetchProviderModels } from "../../api.js";
import type { Config, ConfigSavePayload, ProviderModel } from "../../types.js";

interface SettingsModalProps {
  config: Config | null;
  onSave: (next: ConfigSavePayload) => Promise<void>;
}

export const SettingsModal = ({ config, onSave }: SettingsModalProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isOpen = location.pathname === "/settings";

  const [form, setForm] = useState<Config | null>(config);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const comboRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setForm(config);
    setApiKeyInput("");
  }, [config]);

  useEffect(() => {
    if (!form || form.provider !== "openrouter") {
      setAvailableModels([]);
      setModelsError(null);
      setModelSearch("");
      return;
    }

    let cancelled = false;
    setModelSearch("");
    setModelsLoading(true);
    setModelsError(null);

    void fetchProviderModels("openrouter")
      .then((models) => {
        if (!cancelled) setAvailableModels(models);
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError((error as Error).message ?? "Failed to load OpenRouter models");
          setAvailableModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => { cancelled = true; };
  }, [form?.provider]);

  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent): void => {
      if (comboRef.current && !comboRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const filteredModels = useMemo(() => {
    if (!form || form.provider !== "openrouter") return [];
    const search = modelSearch.trim().toLowerCase();
    const filtered = search
      ? availableModels.filter((m) => m.id.toLowerCase().includes(search) || m.name.toLowerCase().includes(search))
      : [...availableModels];
    if (form.model && !filtered.some((m) => m.id === form.model)) {
      filtered.unshift({ id: form.model, name: `${form.model} (custom)`, contextLength: null });
    }
    return filtered;
  }, [availableModels, form, modelSearch]);

  const close = () => navigate(-1);

  if (!isOpen) return null;

  if (!form) {
    return (
      <div className="settings-modal-overlay" onClick={close}>
        <div className="settings-modal-panel" onClick={(e) => e.stopPropagation()}>
          <p>Configuration not loaded.</p>
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
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Settings</h2>
          <button type="button" className="settings-modal-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="settings-modal-body">
          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              const { hasApiKey, ...rest } = form;
              const payload: ConfigSavePayload = {
                ...rest,
                ...(apiKeyInput ? { apiKey: apiKeyInput } : {})
              };
              void onSave(payload).then(() => close());
            }}
          >
            <label>
              Provider
              <select value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value as Config["provider"] })}>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label>
              Model
              {form.provider === "openrouter" ? (
                <div className="settings-model-picker" ref={comboRef}>
                  <input
                    placeholder={modelsLoading ? "Loading models..." : "Search OpenRouter models"}
                    value={dropdownOpen ? modelSearch : form.model}
                    onChange={(event) => {
                      setModelSearch(event.target.value);
                      setDropdownOpen(true);
                      setHighlightIndex(-1);
                    }}
                    onFocus={() => {
                      setModelSearch("");
                      setDropdownOpen(true);
                      setHighlightIndex(-1);
                    }}
                    onKeyDown={(event) => {
                      if (!dropdownOpen) {
                        if (event.key === "ArrowDown" || event.key === "Enter") setDropdownOpen(true);
                        return;
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setHighlightIndex((prev) => Math.min(prev + 1, filteredModels.length - 1));
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setHighlightIndex((prev) => Math.max(prev - 1, 0));
                      } else if (event.key === "Enter" && highlightIndex >= 0 && filteredModels[highlightIndex]) {
                        event.preventDefault();
                        const selected = filteredModels[highlightIndex];
                        setForm({ ...form, model: selected.id });
                        setModelSearch("");
                        setDropdownOpen(false);
                      } else if (event.key === "Escape") {
                        setDropdownOpen(false);
                      }
                    }}
                  />
                  {dropdownOpen ? (
                    <ul className="settings-model-list" ref={listRef}>
                      {filteredModels.length === 0 ? (
                        <li className="settings-model-item disabled">
                          {modelsLoading ? "Loading models..." : "No models found"}
                        </li>
                      ) : (
                        filteredModels.map((model, index) => (
                          <li
                            key={model.id}
                            className={
                              "settings-model-item"
                              + (form.model === model.id ? " selected" : "")
                              + (index === highlightIndex ? " highlighted" : "")
                            }
                            onMouseEnter={() => setHighlightIndex(index)}
                            onClick={() => {
                              setForm({ ...form, model: model.id });
                              setModelSearch("");
                              setDropdownOpen(false);
                            }}
                          >
                            <span className="settings-model-name">{model.name}</span>
                            {model.contextLength ? (
                              <span className="settings-model-ctx">{model.contextLength.toLocaleString()} ctx</span>
                            ) : null}
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                  {modelsError ? <small className="settings-error">{modelsError}</small> : null}
                </div>
              ) : (
                <input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
              )}
            </label>
            <label>
              API key
              <input
                type="password"
                placeholder={form.hasApiKey ? "(key set -- leave blank to keep)" : "Set in .env when possible"}
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
              />
            </label>
            <label>
              Host
              <input value={form.host} readOnly />
            </label>
            <label>
              Port
              <input value={String(form.port)} readOnly />
            </label>
            <button type="submit">Save settings</button>
          </form>
        </div>
      </div>
    </div>
  );
};
