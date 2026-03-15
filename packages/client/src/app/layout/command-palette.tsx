import { useEffect, useRef, useState } from "react";
import type { ArtifactsSnapshot } from "../../types.js";
import { PaletteSearchMode } from "./palette-search-mode.js";
import { PaletteQuickTaskMode } from "./palette-quick-task-mode.js";
import { PaletteGithubImportMode } from "./palette-github-import-mode.js";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  snapshot: ArtifactsSnapshot;
  onRefresh: () => Promise<void>;
}

type PaletteMode = "search" | "quick-task" | "github-import";

export const CommandPalette = ({ open, onClose, snapshot, onRefresh }: CommandPaletteProps) => {
  const [mode, setMode] = useState<PaletteMode>("search");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMode("search");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
          <PaletteSearchMode
            snapshot={snapshot}
            inputRef={inputRef}
            onClose={onClose}
            onSwitchMode={setMode}
          />
        )}

        {mode === "quick-task" && (
          <PaletteQuickTaskMode
            inputRef={inputRef}
            onClose={onClose}
            onRefresh={onRefresh}
            onBack={() => setMode("search")}
          />
        )}

        {mode === "github-import" && (
          <PaletteGithubImportMode
            inputRef={inputRef}
            onClose={onClose}
            onRefresh={onRefresh}
            onBack={() => setMode("search")}
          />
        )}
      </div>
    </div>
  );
};
