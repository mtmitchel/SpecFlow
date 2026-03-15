import { useNavigate } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";

export const OverviewPanel = ({
  snapshot,
  onOpenCommandPalette
}: {
  snapshot: ArtifactsSnapshot;
  onOpenCommandPalette: () => void;
}) => {
  const navigate = useNavigate();
  const total = snapshot.tickets.length;
  const done = snapshot.tickets.filter((t) => t.status === "done").length;
  const inProgress = snapshot.tickets.filter((t) => t.status === "in-progress").length;

  const isEmpty = snapshot.initiatives.length === 0 && total === 0;

  if (isEmpty) {
    return (
      <section>
        <header className="section-header">
          <h2>Welcome to SpecFlow</h2>
        </header>
        <div className="welcome-state">
          <p className="welcome-tagline">
            Plan work, export it to your AI coding agent, then verify the results.
            All data is stored locally in your project directory.
          </p>
          <div className="welcome-cards">
            <button
              type="button"
              className="welcome-card"
              onClick={() => navigate("/new-initiative")}
            >
              <div className="welcome-card-title">New Initiative</div>
              <div className="welcome-card-desc">
                Plan a multi-step feature with specs, phases, and tickets
              </div>
            </button>
            <button
              type="button"
              className="welcome-card"
              onClick={onOpenCommandPalette}
            >
              <div className="welcome-card-title">Quick Task</div>
              <div className="welcome-card-desc">
                Scope and export a single task for your coding agent
              </div>
            </button>
          </div>
          <p className="welcome-hint">
            Press <kbd style={{
              fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
              background: "var(--surface-button)",
              border: "1px solid var(--panel-border)",
              borderRadius: "var(--radius-sm)",
              padding: "0.1em 0.4em"
            }}>Cmd K</kbd> for more actions, or select an item from the navigator.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <header className="section-header">
        <h2>SpecFlow</h2>
        <p>
          {snapshot.initiatives.length} initiative{snapshot.initiatives.length !== 1 ? "s" : ""} ·{" "}
          {total} ticket{total !== 1 ? "s" : ""} · {done} done · {inProgress} in progress
        </p>
      </header>
      <div className="panel" style={{ maxWidth: 480 }}>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", margin: 0 }}>
          Press <kbd style={{
            fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
            background: "var(--surface-button)",
            border: "1px solid var(--panel-border)",
            borderRadius: "var(--radius-sm)",
            padding: "0.1em 0.4em"
          }}>Cmd K</kbd> to get started, or select an item from the navigator.
        </p>
      </div>
    </section>
  );
};
