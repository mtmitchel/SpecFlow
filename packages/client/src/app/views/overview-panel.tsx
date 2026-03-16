import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TICKET_DOT: Record<string, string> = {
  backlog: "var(--muted)",
  ready: "var(--accent)",
  "in-progress": "var(--warning)",
  verify: "var(--accent)",
  done: "var(--success)"
};

const INIT_STATUS_COLOR: Record<string, string> = {
  draft: "var(--muted)",
  active: "var(--accent)",
  done: "var(--success)"
};

const modKey =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? "Cmd"
    : "Ctrl";

export const OverviewPanel = ({
  snapshot,
}: {
  snapshot: ArtifactsSnapshot;
  onOpenCommandPalette: () => void;
}) => {
  const total = snapshot.tickets.length;

  const initiativeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const init of snapshot.initiatives) map.set(init.id, init.title);
    return map;
  }, [snapshot.initiatives]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { backlog: 0, ready: 0, "in-progress": 0, verify: 0, done: 0 };
    for (const t of snapshot.tickets) if (t.status in c) c[t.status]++;
    return c;
  }, [snapshot.tickets]);

  const initiativesWithCounts = useMemo(
    () =>
      snapshot.initiatives.map((init) => ({
        ...init,
        ticketCount: snapshot.tickets.filter((t) => t.initiativeId === init.id).length,
        doneCount: snapshot.tickets.filter((t) => t.initiativeId === init.id && t.status === "done").length,
        activeCount: snapshot.tickets.filter(
          (t) => t.initiativeId === init.id && (t.status === "in-progress" || t.status === "ready")
        ).length,
      })),
    [snapshot.initiatives, snapshot.tickets]
  );

  const recentTickets = useMemo(
    () =>
      [...snapshot.tickets]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [snapshot.tickets]
  );

  const recentRuns = useMemo(
    () =>
      [...snapshot.runs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6),
    [snapshot.runs]
  );

  const ticketForRun = useMemo(() => {
    const map = new Map<string, string>();
    for (const run of snapshot.runs) {
      if (run.ticketId) {
        const t = snapshot.tickets.find((t) => t.id === run.ticketId);
        if (t) map.set(run.id, t.title);
      }
    }
    return map;
  }, [snapshot.runs, snapshot.tickets]);

  const runPassMap = useMemo(() => {
    const map = new Map<string, boolean | null>();
    for (const run of snapshot.runs) {
      if (run.committedAttemptId) {
        const attempt = snapshot.runAttempts.find(
          (a) => a.id === run.id && a.attemptId === run.committedAttemptId
        );
        map.set(run.id, attempt ? attempt.overallPass : null);
      } else {
        map.set(run.id, null);
      }
    }
    return map;
  }, [snapshot.runs, snapshot.runAttempts]);

  const hasContent = snapshot.initiatives.length > 0 || total > 0 || snapshot.runs.length > 0;
  const hasListData = recentTickets.length > 0 || recentRuns.length > 0;

  return (
    <section className="dash">
      <div className="dash-header">
        <h2 className="dash-title">Overview</h2>
        {total > 0 && (
          <div className="dash-counters">
            {statusCounts.backlog > 0 && (
              <span className="dash-counter">
                <span className="dash-counter-n">{statusCounts.backlog}</span> backlog
              </span>
            )}
            {statusCounts.ready > 0 && (
              <span className="dash-counter">
                <span className="dash-counter-n dash-n--accent">{statusCounts.ready}</span> ready
              </span>
            )}
            {statusCounts["in-progress"] > 0 && (
              <span className="dash-counter">
                <span className="dash-counter-n dash-n--warn">{statusCounts["in-progress"]}</span> in progress
              </span>
            )}
            {statusCounts.done > 0 && (
              <span className="dash-counter">
                <span className="dash-counter-n dash-n--success">{statusCounts.done}</span> done
              </span>
            )}
          </div>
        )}
      </div>

      {total > 0 && (
        <div
          className="dash-progress-bar"
          title={`${statusCounts.done} done, ${statusCounts["in-progress"]} in-progress, ${statusCounts.verify} verify, ${statusCounts.ready} ready, ${statusCounts.backlog} backlog`}
        >
          {statusCounts.done > 0 && <div className="dash-progress-seg" style={{ width: `${(statusCounts.done / total) * 100}%`, background: "var(--success)" }} />}
          {statusCounts["in-progress"] > 0 && <div className="dash-progress-seg" style={{ width: `${(statusCounts["in-progress"] / total) * 100}%`, background: "var(--warning)" }} />}
          {statusCounts.verify > 0 && <div className="dash-progress-seg" style={{ width: `${(statusCounts.verify / total) * 100}%`, background: "var(--accent)" }} />}
          {statusCounts.ready > 0 && <div className="dash-progress-seg" style={{ width: `${(statusCounts.ready / total) * 100}%`, background: "var(--accent)", opacity: 0.4 }} />}
          {statusCounts.backlog > 0 && <div className="dash-progress-seg" style={{ width: `${(statusCounts.backlog / total) * 100}%`, background: "var(--muted)", opacity: 0.25 }} />}
        </div>
      )}

      {hasContent ? (
        <>
          {initiativesWithCounts.length > 0 && (
            <div className="dash-section">
              <div className="dash-section-head">
                <span className="dash-section-title">Initiatives</span>
                <span className="dash-section-count">{snapshot.initiatives.length}</span>
              </div>
              <div className="dash-card">
                {initiativesWithCounts.map((init) => (
                  <Link key={init.id} to={`/initiative/${init.id}`} className="dash-row">
                    <span className="dash-dot" style={{ background: INIT_STATUS_COLOR[init.status] ?? "var(--muted)" }} />
                    <span className="dash-row-main">
                      <span className="dash-row-title">{init.title}</span>
                      <span className="dash-row-context">
                        {init.phases.length} phase{init.phases.length !== 1 ? "s" : ""}&ensp;&middot;&ensp;
                        {init.ticketCount} ticket{init.ticketCount !== 1 ? "s" : ""}
                        {init.activeCount > 0 && <>&ensp;&middot;&ensp;<span style={{ color: "var(--warning)" }}>{init.activeCount} active</span></>}
                        {init.doneCount > 0 && <>&ensp;&middot;&ensp;<span style={{ color: "var(--success)" }}>{init.doneCount} done</span></>}
                      </span>
                    </span>
                    <span className="dash-row-right">
                      <span className={`dash-status-chip dash-status-${init.status}`}>{init.status}</span>
                      <span className="dash-row-time">{relativeTime(init.updatedAt)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {hasListData && (
            <div className="dash-grid">
              <div className="dash-section">
                <div className="dash-section-head">
                  <span className="dash-section-title">Recent Tickets</span>
                  {recentTickets.length > 0 && <Link to="/tickets" className="dash-section-link">All &rarr;</Link>}
                </div>
                {recentTickets.length > 0 ? (
                  <div className="dash-card">
                    {recentTickets.map((ticket) => (
                      <Link key={ticket.id} to={`/ticket/${ticket.id}`} className="dash-row">
                        <span className="dash-dot" style={{ background: TICKET_DOT[ticket.status] ?? "var(--muted)" }} />
                        <span className="dash-row-main">
                          <span className="dash-row-title">{ticket.title}</span>
                          {ticket.initiativeId && initiativeMap.get(ticket.initiativeId) && (
                            <span className="dash-row-context">{initiativeMap.get(ticket.initiativeId)}</span>
                          )}
                        </span>
                        <span className="dash-row-right">
                          <span className={`dash-status-chip dash-status-${ticket.status}`}>{ticket.status}</span>
                          <span className="dash-row-time">{relativeTime(ticket.updatedAt)}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="dash-section-empty">No tickets yet</p>
                )}
              </div>

              <div className="dash-section">
                <div className="dash-section-head">
                  <span className="dash-section-title">Recent Runs</span>
                  {recentRuns.length > 0 && <Link to="/runs" className="dash-section-link">All &rarr;</Link>}
                </div>
                {recentRuns.length > 0 ? (
                  <div className="dash-card">
                    {recentRuns.map((run) => {
                      const passed = runPassMap.get(run.id);
                      return (
                        <Link key={run.id} to={`/run/${run.id}`} className="dash-row">
                          <span
                            className="dash-dot"
                            style={{
                              background:
                                passed === true ? "var(--success)" :
                                passed === false ? "var(--danger)" :
                                run.status === "pending" ? "var(--warning)" :
                                "var(--muted)"
                            }}
                          />
                          <span className="dash-row-main">
                            <span className="dash-row-title">{ticketForRun.get(run.id) ?? run.id}</span>
                            <span className="dash-row-context">{run.agentType}&ensp;&middot;&ensp;{run.type}</span>
                          </span>
                          <span className="dash-row-right">
                            {passed !== null ? (
                              <span className="dash-verdict" style={{ color: passed ? "var(--success)" : "var(--danger)" }}>
                                {passed ? "pass" : "fail"}
                              </span>
                            ) : run.status === "pending" ? (
                              <span className="dash-verdict" style={{ color: "var(--warning)" }}>pending</span>
                            ) : null}
                            <span className="dash-row-time">{relativeTime(run.createdAt)}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="dash-section-empty">No runs yet</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="dash-empty-state">
          <p className="dash-empty-lead">No work yet</p>
          <p className="dash-empty-hint">
            Create an initiative to start planning, or import a ticket to jump into execution. Press <kbd className="dash-kbd">{modKey}+K</kbd> for quick actions.
          </p>
        </div>
      )}
    </section>
  );
};
