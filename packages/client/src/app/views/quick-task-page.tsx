import { useEffect, useRef, useState } from "react";
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

const QUICK_TASK_STEPS = [
  { label: "Task brief", meta: "Describe the work" },
  { label: "Ticket draft", meta: "Triaged automatically" },
  { label: "Execute", meta: "Use the ticket workspace" },
  { label: "Verify", meta: "Capture and confirm" }
];

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
        navigate(`/initiative/${result.initiativeId}?step=brief&handoff=quick-task`);
      }
    } catch (err) {
      showError((err as Error).message ?? "Quick task failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="planning-shell">
      <header className="section-header planning-shell-header">
        <div className="planning-shell-header-main">
          <div className="planning-shell-kicker">Quick task</div>
          <h2>Start small, then let SpecFlow decide</h2>
          <p>
            Describe the work once. SpecFlow will keep it in a short execution path when it is small enough, or
            promote it into the full planning flow when it needs more structure.
          </p>
        </div>
      </header>

      <div className="planning-shell-grid quick-task-shell">
        <aside className="planning-rail">
          <div className="planning-rail-header">
            <span className="planning-rail-step-count">Quick path</span>
            <span className="planning-rail-step-label">One shell, shorter route</span>
          </div>
          <div className="planning-rail-list">
            {QUICK_TASK_STEPS.map((step, index) => (
              <div key={step.label} className={`planning-rail-item${index === 0 ? " active" : ""}`}>
                <span className="planning-rail-item-title">{step.label}</span>
                <span className="planning-rail-item-meta">{step.meta}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="planning-workspace">
          <div className="planning-stage-card">
            <div className="planning-stage-card-top">
              <div>
                <div className="planning-stage-chip">Task brief</div>
                <h3>Describe the work once</h3>
              </div>
              <div className="planning-stage-step-copy">SpecFlow will decide whether this stays a quick task or needs the full planning spectrum.</div>
            </div>
            <p className="planning-stage-body">
              Focus on the job to be done, the expected result, and any hard constraints. If the work is too large, SpecFlow will preserve this input and open the initiative flow at brief intake instead of forcing you to restart.
            </p>
          </div>

          <div className="planning-section-card">
            <div className="planning-section-header">
              <div>
                <h4 style={{ margin: 0 }}>Task input</h4>
                <p style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
                  Write the smallest useful description. The next surface depends on the size of the work, not on which entry point you chose.
                </p>
              </div>
              <span className="journey-queue-row-time">{modKey}+Enter to continue</span>
            </div>

            <textarea
              ref={textareaRef}
              className="multiline"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe the work, expected result, and any non-negotiable constraints"
              style={{ minHeight: 220 }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />

            <div className="button-row" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="btn-primary"
                disabled={busy || !text.trim()}
                onClick={() => void submit()}
              >
                {busy ? "Triaging..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
