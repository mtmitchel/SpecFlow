import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { triageQuickTask } from "../../api/tickets.js";
import { useToast } from "../context/toast.js";
import {
  applyInitiativeUpdate,
  applyQuickTaskTicketCreation,
  type ApplySnapshotUpdate,
} from "../utils/snapshot-updates.js";

interface PaletteQuickTaskModeProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onClose: () => void;
  onApplySnapshotUpdate: ApplySnapshotUpdate;
  onBack: () => void;
}

export const PaletteQuickTaskMode = ({ inputRef, onClose, onApplySnapshotUpdate, onBack }: PaletteQuickTaskModeProps) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [quickTaskText, setQuickTaskText] = useState("");
  const [busy, setBusy] = useState(false);

  const runQuickTask = async () => {
    if (!quickTaskText.trim() || busy) return;
    setBusy(true);
    try {
      const result = await triageQuickTask(quickTaskText.trim());
      onClose();
      if (result.decision === "ok") {
        onApplySnapshotUpdate((current) => applyQuickTaskTicketCreation(current, result.ticket));
        navigate(`/ticket/${result.ticket.id}`);
      } else {
        onApplySnapshotUpdate((current) => applyInitiativeUpdate(current, result.initiative));
        navigate(`/initiative/${result.initiative.id}`);
      }
    } catch (err) {
      showError((err as Error).message ?? "We couldn't start the quick task.");
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
        <span>Quick task</span>
      </div>
      <div className="palette-context">
        Describe the work. If it grows, SpecFlow will turn it into a project.
      </div>
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        className="palette-textarea"
        value={quickTaskText}
        onChange={(e) => setQuickTaskText(e.target.value)}
        placeholder="Add keyboard shortcuts to note search without changing the sync flow"
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
          {busy ? "Reviewing..." : "Start quick task"}
        </button>
        <span className="palette-hint">Cmd+Enter</span>
      </div>
    </>
  );
};
