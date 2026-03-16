import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { ArtifactsSnapshot } from "../../types.js";
import {
  getInitiativeResumeStep,
  INITIATIVE_WORKFLOW_LABELS,
  REVIEW_KIND_LABELS
} from "../utils/initiative-workflow.js";

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

const modKey =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    ? "Cmd"
    : "Ctrl";

export const OverviewPanel = ({
  snapshot,
  onOpenCommandPalette
}: {
  snapshot: ArtifactsSnapshot;
  onOpenCommandPalette: () => void;
}) => {
  const initiativeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const initiative of snapshot.initiatives) {
      map.set(initiative.id, initiative.title);
    }
    return map;
  }, [snapshot.initiatives]);

  const planningQueue = useMemo(
    () =>
      snapshot.initiatives
        .map((initiative) => {
          const unresolvedReviews = snapshot.planningReviews.filter(
            (review) =>
              review.initiativeId === initiative.id &&
              review.status !== "passed" &&
              review.status !== "overridden"
          );

          return {
            initiative,
            resumeStep: getInitiativeResumeStep(initiative.workflow),
            unresolvedReviews
          };
        })
        .sort((left, right) => new Date(right.initiative.updatedAt).getTime() - new Date(left.initiative.updatedAt).getTime()),
    [snapshot.initiatives, snapshot.planningReviews]
  );

  const readyToRun = useMemo(
    () =>
      snapshot.tickets
        .filter((ticket) => ticket.status === "ready")
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 6),
    [snapshot.tickets]
  );

  const needsVerification = useMemo(
    () =>
      snapshot.tickets
        .filter((ticket) => ticket.status === "verify")
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
        .slice(0, 6),
    [snapshot.tickets]
  );

  const recentAuditRuns = useMemo(
    () =>
      snapshot.runs
        .filter((run) => run.type === "audit")
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 6),
    [snapshot.runs]
  );

  const hasContent =
    planningQueue.length > 0 || readyToRun.length > 0 || needsVerification.length > 0 || recentAuditRuns.length > 0;

  return (
    <section className="journey-queue">
      <header className="journey-queue-header">
        <div>
          <div className="planning-shell-kicker">Home</div>
          <h2 className="journey-queue-title">What needs attention</h2>
          <p className="journey-queue-copy">
            SpecFlow is strongest when the next action is obvious. Start new work, continue planning, or move tickets through execution and verification from one queue.
          </p>
        </div>
        <div className="journey-queue-actions">
          <Link to="/new-initiative" className="journey-queue-action journey-queue-action-primary">
            Start planning
          </Link>
          <Link to="/new-quick-task" className="journey-queue-action">
            Quick task
          </Link>
          <button type="button" className="journey-queue-action" onClick={onOpenCommandPalette}>
            Import or search
          </button>
        </div>
      </header>

      {hasContent ? (
        <div className="journey-queue-grid">
          <div className="journey-queue-section">
            <div className="journey-queue-section-head">
              <h3>Continue planning</h3>
              <span>{planningQueue.length}</span>
            </div>
            {planningQueue.length > 0 ? (
              <div className="journey-queue-card">
                {planningQueue.map(({ initiative, resumeStep, unresolvedReviews }) => (
                  <Link key={initiative.id} to={`/initiative/${initiative.id}?step=${resumeStep}`} className="journey-queue-row">
                    <div className="journey-queue-row-main">
                      <span className="journey-queue-row-title">{initiative.title}</span>
                      <span className="journey-queue-row-context">
                        Next: {INITIATIVE_WORKFLOW_LABELS[resumeStep]}
                        {unresolvedReviews.length > 0
                          ? ` · ${unresolvedReviews.length} checkpoint${unresolvedReviews.length === 1 ? "" : "s"} open`
                          : " · no open checkpoints"}
                      </span>
                    </div>
                    <span className="journey-queue-row-time">{relativeTime(initiative.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="journey-queue-empty">No active initiatives yet.</p>
            )}
          </div>

          <div className="journey-queue-section">
            <div className="journey-queue-section-head">
              <h3>Needs review</h3>
              <span>{planningQueue.filter((item) => item.unresolvedReviews.length > 0).length}</span>
            </div>
            {planningQueue.some((item) => item.unresolvedReviews.length > 0) ? (
              <div className="journey-queue-card">
                {planningQueue
                  .filter((item) => item.unresolvedReviews.length > 0)
                  .map(({ initiative, unresolvedReviews }) => (
                    <Link key={initiative.id} to={`/initiative/${initiative.id}`} className="journey-queue-row">
                      <div className="journey-queue-row-main">
                        <span className="journey-queue-row-title">{initiative.title}</span>
                        <span className="journey-queue-row-context">
                          {unresolvedReviews
                            .slice(0, 2)
                            .map((review) => REVIEW_KIND_LABELS[review.kind])
                            .join(" · ")}
                        </span>
                      </div>
                      <span className="journey-queue-row-time">{relativeTime(initiative.updatedAt)}</span>
                    </Link>
                  ))}
              </div>
            ) : (
              <p className="journey-queue-empty">No planning checkpoints are waiting right now.</p>
            )}
          </div>

          <div className="journey-queue-section">
            <div className="journey-queue-section-head">
              <h3>Ready to run</h3>
              <span>{readyToRun.length}</span>
            </div>
            {readyToRun.length > 0 ? (
              <div className="journey-queue-card">
                {readyToRun.map((ticket) => (
                  <Link key={ticket.id} to={`/ticket/${ticket.id}`} className="journey-queue-row">
                    <div className="journey-queue-row-main">
                      <span className="journey-queue-row-title">{ticket.title}</span>
                      <span className="journey-queue-row-context">
                        {ticket.initiativeId ? initiativeMap.get(ticket.initiativeId) ?? "Initiative ticket" : "Quick task"}
                      </span>
                    </div>
                    <span className="journey-queue-row-time">{relativeTime(ticket.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="journey-queue-empty">No tickets are ready to start.</p>
            )}
          </div>

          <div className="journey-queue-section">
            <div className="journey-queue-section-head">
              <h3>Needs verification</h3>
              <span>{needsVerification.length}</span>
            </div>
            {needsVerification.length > 0 ? (
              <div className="journey-queue-card">
                {needsVerification.map((ticket) => (
                  <Link key={ticket.id} to={`/ticket/${ticket.id}`} className="journey-queue-row">
                    <div className="journey-queue-row-main">
                      <span className="journey-queue-row-title">{ticket.title}</span>
                      <span className="journey-queue-row-context">Verification still needs a committed result.</span>
                    </div>
                    <span className="journey-queue-row-time">{relativeTime(ticket.updatedAt)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="journey-queue-empty">No tickets are waiting for verification.</p>
            )}
          </div>

          <div className="journey-queue-section journey-queue-section-wide">
            <div className="journey-queue-section-head">
              <h3>Recent audit activity</h3>
              <span>{recentAuditRuns.length}</span>
            </div>
            {recentAuditRuns.length > 0 ? (
              <div className="journey-queue-card">
                {recentAuditRuns.map((run) => (
                  <Link key={run.id} to={`/run/${run.id}`} className="journey-queue-row">
                    <div className="journey-queue-row-main">
                      <span className="journey-queue-row-title">{run.id}</span>
                      <span className="journey-queue-row-context">
                        {run.ticketId ? initiativeMap.get(snapshot.tickets.find((ticket) => ticket.id === run.ticketId)?.initiativeId ?? "") ?? "Ticket-linked audit" : "Standalone audit"}
                      </span>
                    </div>
                    <span className="journey-queue-row-time">{relativeTime(run.createdAt)}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="journey-queue-empty">No recent audit runs.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="journey-queue-empty-state">
          <p className="journey-queue-empty-lead">No work is in motion yet.</p>
          <p className="journey-queue-empty-copy">
            Start planning for multi-step work, use a quick task for something small, or open <kbd className="dash-kbd">{modKey}+K</kbd> to import an issue.
          </p>
        </div>
      )}
    </section>
  );
};
