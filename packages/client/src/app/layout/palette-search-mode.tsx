import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";

interface ResultItem {
  id: string;
  label: string;
  sublabel?: string;
  path?: string;
  action?: () => void;
  isAction?: boolean;
}

const filterItems = (items: ResultItem[], query: string): ResultItem[] => {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      (item.sublabel?.toLowerCase().includes(q) ?? false)
  );
};

interface PaletteSearchModeProps {
  snapshot: ArtifactsSnapshot;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onClose: () => void;
  onSwitchMode: (mode: "quick-task" | "github-import") => void;
}

export const PaletteSearchMode = ({ snapshot, inputRef, onClose, onSwitchMode }: PaletteSearchModeProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const staticActions: ResultItem[] = [
    {
      id: "action-new-initiative",
      label: "New Initiative",
      sublabel: "Start a multi-step planning flow",
      isAction: true,
      action: () => { onNavigate("/new-initiative"); onClose(); }
    },
    {
      id: "action-quick-task",
      label: "Quick Task",
      sublabel: "Triage a single task with AI",
      isAction: true,
      action: () => onSwitchMode("quick-task")
    },
    {
      id: "action-github-import",
      label: "Import GitHub Issue",
      sublabel: "Convert a GitHub issue to a ticket",
      isAction: true,
      action: () => onSwitchMode("github-import")
    },
    {
      id: "action-settings",
      label: "Settings",
      sublabel: "Configure LLM provider and model",
      isAction: true,
      action: () => go("/settings")
    },
    {
      id: "action-all-tickets",
      label: "All Tickets",
      sublabel: "Browse and filter all tickets",
      isAction: true,
      action: () => go("/tickets")
    },
    {
      id: "action-all-runs",
      label: "All Runs",
      sublabel: "Browse and filter all runs",
      isAction: true,
      action: () => go("/runs")
    },
    {
      id: "action-all-specs",
      label: "All Specs",
      sublabel: "Browse all spec documents",
      isAction: true,
      action: () => go("/specs")
    }
  ];

  const initiativeItems: ResultItem[] = snapshot.initiatives.map((init) => ({
    id: `nav-initiative-${init.id}`,
    label: init.title,
    sublabel: `Initiative · ${init.status}`,
    path: `/initiative/${init.id}`
  }));

  const ticketItems: ResultItem[] = snapshot.tickets.map((t) => ({
    id: `nav-ticket-${t.id}`,
    label: t.title,
    sublabel: `Ticket · ${t.status}`,
    path: `/ticket/${t.id}`
  }));

  const runItems: ResultItem[] = snapshot.runs.slice(-10).map((r) => ({
    id: `nav-run-${r.id}`,
    label: r.id,
    sublabel: `Run · ${r.type} · ${r.status}`,
    path: `/run/${r.id}`
  }));

  const allSearchItems = [...initiativeItems, ...ticketItems, ...runItems];

  const displayItems: ResultItem[] = query.trim()
    ? filterItems(allSearchItems, query)
    : [...staticActions, ...initiativeItems.slice(0, 5), ...ticketItems.slice(0, 5)];

  const clampedIndex = Math.min(activeIndex, Math.max(0, displayItems.length - 1));

  const executeItem = (item: ResultItem) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      go(item.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = displayItems[clampedIndex];
      if (item) executeItem(item);
    }
  };

  return (
    <>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        className="palette-input"
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
        onKeyDown={handleKeyDown}
        placeholder="Search or type a command"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="palette-results" role="listbox">
        {displayItems.length === 0 ? (
          <div className="palette-empty">No results</div>
        ) : (
          displayItems.map((item, idx) => (
            <div
              key={item.id}
              role="option"
              aria-selected={idx === clampedIndex}
              className={`palette-item${idx === clampedIndex ? " active" : ""}${item.isAction ? " palette-item-action" : ""}`}
              onClick={() => executeItem(item)}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="palette-item-label">{item.label}</span>
              {item.sublabel && <span className="palette-item-sub">{item.sublabel}</span>}
            </div>
          ))
        )}
      </div>
    </>
  );
};
