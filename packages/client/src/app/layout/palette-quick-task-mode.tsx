import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { triageQuickTask } from "../../api/tickets.js";
import { useToast } from "../context/toast.js";

interface PaletteQuickTaskModeProps {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onBack: () => void;
}

export const PaletteQuickTaskMode = ({ inputRef, onClose, onRefresh, onBack }: PaletteQuickTaskModeProps) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [quickTaskText, setQuickTaskText] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <>
      <div className="palette-mode-header">
        <button type="button" className="palette-back" onClick={onBack}>
          ← Back
        </button>
        <span>Quick Task</span>
      </div>
      <div className="palette-context">
        Describe a task. AI will analyze it and create a ticket, or suggest a full initiative if the scope is large.
      </div>
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        className="palette-textarea"
        value={quickTaskText}
        onChange={(e) => setQuickTaskText(e.target.value)}
        placeholder="Describe the task"
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
  );
};
