import { useEffect, useMemo, useState } from "react";
import { fetchProviderModels } from "../../api";
import type { Config, ConfigSavePayload, ProviderModel } from "../../types";

export const SettingsPage = ({
  config,
  onSave
}: {
  config: Config | null;
  onSave: (next: ConfigSavePayload) => Promise<void>;
}): JSX.Element => {
  const [form, setForm] = useState<Config | null>(config);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

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
    setModelSearch(form.model);
    setModelsLoading(true);
    setModelsError(null);

    void fetchProviderModels("openrouter")
      .then((models) => {
        if (cancelled) {
          return;
        }

        setAvailableModels(models);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setModelsError((error as Error).message ?? "Failed to load OpenRouter models");
        setAvailableModels([]);
      })
      .finally(() => {
        if (!cancelled) {
          setModelsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [form?.provider]);

  const filteredModels = useMemo(() => {
    if (!form || form.provider !== "openrouter") {
      return [];
    }

    const search = modelSearch.trim().toLowerCase();
    const filtered = search
      ? availableModels.filter((model) => model.id.toLowerCase().includes(search) || model.name.toLowerCase().includes(search))
      : [...availableModels];

    if (form.model && !filtered.some((model) => model.id === form.model)) {
      filtered.unshift({
        id: form.model,
        name: `${form.model} (custom)`,
        contextLength: null
      });
    }

    return filtered;
  }, [availableModels, form, modelSearch]);

  if (!form) {
    return <p>Configuration not loaded.</p>;
  }

  return (
    <section>
      <header className="section-header">
        <h2>Settings</h2>
        <p>Provider and model configuration for local backend services.</p>
      </header>
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          const { hasApiKey, ...rest } = form;
          const payload: ConfigSavePayload = {
            ...rest,
            ...(apiKeyInput ? { apiKey: apiKeyInput } : {})
          };
          void onSave(payload);
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
            <div className="settings-model-picker">
              <input
                placeholder="Search OpenRouter models"
                value={modelSearch}
                onChange={(event) => setModelSearch(event.target.value)}
              />
              <select
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
              >
                {filteredModels.length === 0 ? (
                  <option value={form.model || ""}>
                    {modelsLoading ? "Loading models..." : "No models found"}
                  </option>
                ) : (
                  filteredModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                      {model.contextLength ? ` (${model.contextLength.toLocaleString()} ctx)` : ""}
                    </option>
                  ))
                )}
              </select>
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
    </section>
  );
};
