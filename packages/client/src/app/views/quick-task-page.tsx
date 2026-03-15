import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { triageQuickTask } from "../../api/tickets.js";
import { useToast } from "../context/toast.js";

const modKey =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? "Cmd"
    : "Ctrl";

interface QuickTaskPageProps {
  onRefresh: () => Promise<void>;
}

export const QuickTaskPage = ({ onRefresh }: QuickTaskPageProps) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const result = await triageQuickTask(text.trim());
      await onRefresh();
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
    <section className="quick-task-page">
      <h2 className="quick-task-heading">Quick Task</h2>
      <p className="quick-task-desc">
        Describe a task. AI will analyze it and create a ticket, or suggest a full initiative if the scope is large.
      </p>
      <textarea
        ref={textareaRef}
        className="quick-task-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe the task"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="quick-task-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !text.trim()}
          onClick={() => void submit()}
        >
          {busy ? "Creating" : "Create Task"}
        </button>
        <span className="quick-task-hint">{modKey}+Enter to submit</span>
      </div>
    </section>
  );
};
