import { useEffect, useMemo, useRef, useState } from "react";
import { fetchProviderModels } from "../../api.js";
import type { ProviderModel } from "../../types.js";

interface ModelComboboxProps {
  provider: "anthropic" | "openai" | "openrouter";
  hasApiKey: boolean;
  value: string;
  onSelect: (modelId: string) => void;
  modelsGeneration: number;
}

export const ModelCombobox = ({ provider, hasApiKey, value, onSelect, modelsGeneration }: ModelComboboxProps) => {
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const comboRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!hasApiKey && modelsGeneration === 0) {
      setAvailableModels([]);
      setModelsError(null);
      return;
    }

    let cancelled = false;
    setModelSearch("");
    setModelsLoading(true);
    setModelsError(null);

    void fetchProviderModels(provider)
      .then((models) => {
        if (!cancelled) setAvailableModels(models);
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError((error as Error).message ?? "Failed to load models");
          setAvailableModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => { cancelled = true; };
  }, [provider, hasApiKey, modelsGeneration]);

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

  const filteredModels = useMemo(() => {
    if (availableModels.length === 0) return [];
    const search = modelSearch.trim().toLowerCase();
    const filtered = search
      ? availableModels.filter((m) => m.id.toLowerCase().includes(search) || m.name.toLowerCase().includes(search))
      : [...availableModels];
    if (value && !filtered.some((m) => m.id === value)) {
      filtered.unshift({ id: value, name: `${value} (current)`, contextLength: null });
    }
    return filtered;
  }, [availableModels, value, modelSearch]);

  const showModelPicker = availableModels.length > 0 || modelsLoading;

  if (!showModelPicker) {
    return <input value={value} onChange={(event) => onSelect(event.target.value)} />;
  }

  return (
    <div className="settings-model-picker" ref={comboRef}>
      <input
        placeholder={modelsLoading ? "Loading models" : `Search ${provider} models`}
        value={dropdownOpen ? modelSearch : value}
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
            onSelect(filteredModels[highlightIndex].id);
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
              {modelsLoading ? "Loading models" : "No models found"}
            </li>
          ) : (
            filteredModels.map((model, index) => (
              <li
                key={model.id}
                className={
                  "settings-model-item"
                  + (value === model.id ? " selected" : "")
                  + (index === highlightIndex ? " highlighted" : "")
                }
                onMouseEnter={() => setHighlightIndex(index)}
                onClick={() => {
                  onSelect(model.id);
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
  );
};
