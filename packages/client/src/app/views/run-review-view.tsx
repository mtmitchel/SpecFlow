import { Link, useParams } from "react-router-dom";
import type { Run, Ticket } from "../../types.js";
import { AuditPanel } from "../components/audit-panel.js";

export const RunReviewView = ({
  runs,
  tickets,
}: {
  runs: Run[];
  tickets: Ticket[];
}) => {
  const params = useParams<{ id: string }>();
  const run = runs.find((item) => item.id === params.id);
  const ticket = run?.ticketId ? tickets.find((item) => item.id === run.ticketId) ?? null : null;

  if (!run) {
    return (
      <section>
        <h2>Review not found</h2>
        <p>We couldn&apos;t find the run for this review.</p>
      </section>
    );
  }

  return (
    <section className="ticket-journey">
      <header className="ticket-journey-header">
        <div>
          <h2>Review changes</h2>
          <p className="ticket-empty-note">
            Run {run.id}
            {ticket ? ` · ${ticket.title}` : ""}
          </p>
        </div>
        <div className="ticket-journey-header-actions">
          <Link to={`/run/${run.id}`}>Back to run</Link>
          {ticket ? <Link to={`/ticket/${ticket.id}`}>Open ticket</Link> : null}
        </div>
      </header>

      <div className="run-review-shell">
        <AuditPanel runId={run.id} defaultScopePaths={ticket?.fileTargets ?? []} />
      </div>
    </section>
  );
};
