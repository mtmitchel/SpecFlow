import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
    if (!text.trim() || busy) {
      return;
    }

    setBusy(true);
    try {
      const result = await triageQuickTask(text.trim());
      await onRefresh();
      if (result.decision === "ok") {
        navigate(`/ticket/${result.ticketId}`);
      } else {
        navigate(`/initiative/${result.initiativeId}?step=brief&handoff=quick-task`);
      }
    } catch (error) {
      showError((error as Error).message ?? "Quick task failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="planning-shell planning-entry-shell">
      <div className="planning-topbar">
        <div className="planning-topbar-row">
          <div className="planning-breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <span>Quick task</span>
          </div>
        </div>
      </div>

      <div className="planning-entry-column">
        <div className="planning-entry-card">
          <div className="planning-entry-card-header">
            <div>
              <h3>What needs to get done?</h3>
              <p>If it turns out to be bigger, it will move into planning.</p>
            </div>
            <span className="planning-entry-counter">{modKey}+Enter</span>
          </div>

          <textarea
            ref={textareaRef}
            className="multiline textarea-md"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Describe the work and any hard limits."
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />

          <div className="planning-entry-card-footer">
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !text.trim()}
              onClick={() => void submit()}
            >
              {busy ? "Checking..." : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
