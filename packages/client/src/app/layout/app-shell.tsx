import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { triageQuickTask } from "../../api";

export const AppShell = ({ children }: { children: ReactNode }): JSX.Element => {
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    { to: "/initiatives", label: "Initiatives" },
    { to: "/tickets", label: "Tickets" },
    { to: "/specs", label: "Specs/Docs" },
    { to: "/runs", label: "Runs" },
    { to: "/settings", label: "Settings" }
  ];
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDescription, setQuickDescription] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickResult, setQuickResult] = useState<
    | {
        decision: "ok";
        reason: string;
        ticketId: string;
        ticketTitle: string;
        acceptanceCriteria: Array<{ id: string; text: string }>;
        implementationPlan: string;
        fileTargets: string[];
      }
    | { decision: "too-large"; reason: string; initiativeId: string; initiativeTitle: string }
    | null
  >(null);

  useEffect(() => {
    setQuickOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">SF</div>
          <div>
            <h1>SpecFlow</h1>
            <p>Board Control</p>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          className="quick-task-button"
          onClick={() => {
            setQuickOpen(true);
            setQuickResult(null);
            setQuickDescription("");
          }}
        >
          + Quick Task
        </button>
      </aside>
      <main className="main-content">{children}</main>

      {quickOpen ? (
        <section className="quick-task-panel">
          <div className="panel">
            <div className="button-row">
              <h3>Quick Build</h3>
              <button
                type="button"
                onClick={() => {
                  setQuickOpen(false);
                  setQuickResult(null);
                }}
              >
                Dismiss
              </button>
            </div>

            <p>Describe the task. Planner triage will route to a ready ticket or Groundwork.</p>
            <textarea
              className="multiline"
              value={quickDescription}
              onChange={(event) => setQuickDescription(event.target.value)}
              placeholder="Implement dark-mode toggle with persisted preference and tests"
            />
            <div className="button-row">
              <button
                type="button"
                disabled={quickBusy || quickDescription.trim().length === 0}
                onClick={async () => {
                  setQuickBusy(true);
                  try {
                    const result = await triageQuickTask(quickDescription);
                    setQuickResult(result);

                    if (result.decision === "too-large") {
                      navigate(`/initiatives/${result.initiativeId}`);
                    }
                  } finally {
                    setQuickBusy(false);
                  }
                }}
              >
                Submit
              </button>
            </div>

            {quickBusy ? <p>Planner triaging task...</p> : null}

            {quickResult?.decision === "ok" ? (
              <div className="status-banner">
                <div>
                  Created ready ticket: <strong>{quickResult.ticketTitle}</strong>
                </div>
                <div>{quickResult.reason}</div>
                <div>
                  Criteria: {quickResult.acceptanceCriteria.length} · File targets: {quickResult.fileTargets.length}
                </div>
                <Link to={`/tickets/${quickResult.ticketId}`}>View Ticket</Link>
              </div>
            ) : null}

            {quickResult?.decision === "too-large" ? (
              <div className="status-banner warn">This looks like a larger initiative. Opening in Groundwork...</div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
};
