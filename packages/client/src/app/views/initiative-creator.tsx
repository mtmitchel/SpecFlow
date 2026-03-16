import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInitiative } from "../../api/initiatives.js";
import { useToast } from "../context/toast.js";

const INITIATIVE_SETUP_STEPS = [
  { label: "Brief", meta: "Start with intake" },
  { label: "Core flows", meta: "Shape journeys" },
  { label: "PRD", meta: "Define behavior" },
  { label: "Tech spec", meta: "Lock implementation" },
  { label: "Tickets", meta: "Break into execution" }
];

export const InitiativeCreator = ({ onRefresh }: { onRefresh: () => Promise<void> }) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!description.trim() || busy) {
      return;
    }

    setBusy(true);
    try {
      const result = await createInitiative(description.trim());
      await onRefresh();
      navigate(`/initiative/${result.initiativeId}?step=brief&handoff=created`);
    } catch (err) {
      showError((err as Error).message ?? "Failed to create initiative");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="planning-shell">
      <header className="section-header planning-shell-header">
        <div className="planning-shell-header-main">
          <div className="planning-shell-kicker">New initiative</div>
          <h2>Start on the same planning spectrum you will finish on</h2>
          <p>
            Write the raw idea once. SpecFlow will carry it straight into brief intake, then keep the rest of the work in the same contained planning shell.
          </p>
        </div>
      </header>

      <div className="planning-shell-grid quick-task-shell">
        <aside className="planning-rail">
          <div className="planning-rail-header">
            <span className="planning-rail-step-count">Step 1 of 5</span>
            <span className="planning-rail-step-label">Brief intake comes first</span>
          </div>
          <div className="planning-rail-list">
            {INITIATIVE_SETUP_STEPS.map((step, index) => (
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
                <div className="planning-stage-chip">Brief intake</div>
                <h3>Describe the opportunity, not the full brief</h3>
              </div>
              <div className="planning-stage-step-copy">SpecFlow will ask clarifying questions before it writes the first brief.</div>
            </div>
            <p className="planning-stage-body">
              Keep this lightweight. Focus on the problem, the audience, and any constraints you already know. The next screen will continue inside the same shell and start the required brief consultation.
            </p>
          </div>

          <div className="planning-section-card">
            <div className="planning-section-header">
              <div>
                <h4 style={{ margin: 0 }}>Idea</h4>
                <p style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
                  Bring the rough version. The brief intake will tighten the scope before any full artifact is generated.
                </p>
              </div>
            </div>

            <textarea
              className="multiline"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the problem, who it is for, and any hard constraints"
              style={{ minHeight: 220 }}
              autoFocus
            />

            <div className="button-row" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleCreate()}
                disabled={busy || description.trim().length === 0}
              >
                {busy ? "Setting up initiative..." : "Continue to brief intake"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
