import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { importGithubIssue } from "../../api/import.js";
import { useToast } from "../context/toast.js";

interface PaletteGithubImportModeProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onBack: () => void;
}

export const PaletteGithubImportMode = ({ inputRef, onClose, onRefresh, onBack }: PaletteGithubImportModeProps) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [githubUrl, setGithubUrl] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <div className="palette-mode-header">
        <button type="button" className="palette-back" onClick={onBack}>
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
  );
};
