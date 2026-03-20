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
  const [openAbove, setOpenAbove] = useState(false);
  const [dropdownMaxHeight, setDropdownMaxHeight] = useState(280);
  const comboRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
          setModelsError((error as Error).message ?? "We couldn't load models.");
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

  useEffect(() => {
    if (!dropdownOpen) {
      return;
    }

    const updateDropdownPlacement = () => {
      const input = inputRef.current;
      if (!input) {
        return;
      }

      const rect = input.getBoundingClientRect();
      const viewportPadding = 16;
      const listSpacing = 8;
      const minimumListHeight = 120;
      const preferredListHeight = 280;
      let clippingTop = viewportPadding;
      let clippingBottom = window.innerHeight - viewportPadding;
      let ancestor: HTMLElement | null = input.parentElement;

      while (ancestor) {
        const { overflowY } = window.getComputedStyle(ancestor);
        if (
          overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "hidden" ||
          overflowY === "clip"
        ) {
          const ancestorRect = ancestor.getBoundingClientRect();
          clippingTop = ancestorRect.top + viewportPadding;
          clippingBottom = ancestorRect.bottom - viewportPadding;
          break;
        }

        ancestor = ancestor.parentElement;
      }

      const availableBelow = Math.max(
        0,
        clippingBottom - rect.bottom - listSpacing,
      );
      const availableAbove = Math.max(0, rect.top - clippingTop - listSpacing);
      const shouldOpenAbove =
        availableBelow < minimumListHeight && availableAbove > availableBelow;
      const preferredSpace = shouldOpenAbove ? availableAbove : availableBelow;
      const fallbackSpace = shouldOpenAbove ? availableBelow : availableAbove;
      const resolvedSpace =
        preferredSpace >= minimumListHeight
          ? preferredSpace
          : Math.max(preferredSpace, fallbackSpace);
      const boundedHeight = Math.max(
        96,
        Math.min(preferredListHeight, resolvedSpace),
      );

      setOpenAbove(shouldOpenAbove);
      setDropdownMaxHeight(boundedHeight);
    };

    updateDropdownPlacement();
    window.addEventListener("resize", updateDropdownPlacement);
    window.addEventListener("scroll", updateDropdownPlacement, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPlacement);
      window.removeEventListener("scroll", updateDropdownPlacement, true);
    };
  }, [dropdownOpen, filteredModels.length]);

  const showModelPicker = availableModels.length > 0 || modelsLoading;

  if (!showModelPicker) {
    return <input value={value} onChange={(event) => onSelect(event.target.value)} />;
  }

  return (
    <div className="settings-model-picker" ref={comboRef}>
      <input
        ref={inputRef}
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
        <ul
          className={`settings-model-list${openAbove ? " settings-model-list-above" : ""}`}
          ref={listRef}
          style={{ maxHeight: `${dropdownMaxHeight}px` }}
          onMouseDown={(e) => e.preventDefault()}
        >
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
