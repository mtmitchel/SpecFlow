import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { triageQuickTask } from "../../api/tickets.js";
import { importGithubIssue } from "../../api/import.js";
import type { ArtifactsSnapshot } from "../../types.js";
import { useToast } from "../context/toast.js";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}

type PaletteMode = "search" | "quick-task" | "github-import";

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

export const CommandPalette = ({ open, onClose, snapshot, onRefresh }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [mode, setMode] = useState<PaletteMode>("search");
  const [query, setQuery] = useState("");
  const [quickTaskText, setQuickTaskText] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setMode("search");
      setQuery("");
      setQuickTaskText("");
      setGithubUrl("");
      setBusy(false);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  const runQuickTask = async () => {
    if (!quickTaskText.trim() || busy) return;
    setBusy(true);
    try {
      const result = await triageQuickTask(quickTaskText.trim());
      await onRefresh();
      onClose();
      if (result.decision === "ok") {
        navigate(`/ticket/${result.ticketId}`);
      } else {
        navigate(`/initiative/${result.initiativeId}`);
      }
    } catch (err) {
      showError((err as Error).message ?? "Quick task failed");
    } finally {
      setBusy(false);
    }
  };

  const runGithubImport = async () => {
    if (!githubUrl.trim() || busy) return;
    setBusy(true);
    try {
      const result = await importGithubIssue(githubUrl.trim());
      await onRefresh();
      onClose();
      if (result.decision === "ok") {
        navigate(`/ticket/${result.ticketId}`);
      } else {
        navigate(`/initiative/${result.initiativeId}`);
      }
    } catch (err) {
      showError((err as Error).message ?? "GitHub import failed");
    } finally {
      setBusy(false);
    }
  };

  // Build result items for search mode
  const staticActions: ResultItem[] = [
    {
      id: "action-new-initiative",
      label: "New Initiative",
      sublabel: "Start a multi-step planning flow",
      isAction: true,
      action: () => { navigate("/new-initiative"); onClose(); }
    },
    {
      id: "action-quick-task",
      label: "Quick Task",
      sublabel: "Triage a single task with AI",
      isAction: true,
      action: () => setMode("quick-task")
    },
    {
      id: "action-github-import",
      label: "Import GitHub Issue",
      sublabel: "Convert a GitHub issue to a ticket",
      isAction: true,
      action: () => setMode("github-import")
    },
    {
      id: "action-settings",
      label: "Settings",
      sublabel: "Configure LLM provider and model",
      isAction: true,
      action: () => go("/settings")
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

  const executeItem = (item: ResultItem) => {
    if (item.action) {
      item.action();
    } else if (item.path) {
      go(item.path);
    }
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="palette-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      aria-modal="true"
      role="dialog"
      aria-label="Command palette"
    >
      <div className="palette-panel">
        {mode === "search" && (
          <>
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              className="palette-input"
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
              onKeyDown={handleKeyDown}
              placeholder="Search or type a command..."
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
        )}

        {mode === "quick-task" && (
          <>
            <div className="palette-mode-header">
              <button type="button" className="palette-back" onClick={() => setMode("search")}>
                ← Back
              </button>
              <span>Quick Task</span>
            </div>
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              className="palette-textarea"
              value={quickTaskText}
              onChange={(e) => setQuickTaskText(e.target.value)}
              placeholder="Describe the task..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void runQuickTask();
                }
              }}
            />
            <div className="palette-actions">
              <button
                type="button"
                className="palette-submit"
                disabled={busy || !quickTaskText.trim()}
                onClick={() => void runQuickTask()}
              >
                {busy ? "Creating..." : "Create Task"}
              </button>
              <span className="palette-hint">Cmd+Enter to submit</span>
            </div>
          </>
        )}

        {mode === "github-import" && (
          <>
            <div className="palette-mode-header">
              <button type="button" className="palette-back" onClick={() => setMode("search")}>
                ← Back
              </button>
              <span>Import GitHub Issue</span>
            </div>
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              className="palette-input"
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/issues/123"
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void runGithubImport(); }
              }}
            />
            <div className="palette-actions">
              <button
                type="button"
                className="palette-submit"
                disabled={busy || !githubUrl.trim()}
                onClick={() => void runGithubImport()}
              >
                {busy ? "Importing..." : "Import"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
