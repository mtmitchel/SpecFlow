import { Link } from "react-router-dom";
import type {
  Initiative,
  PlanningReviewArtifact,
  Run,
  Ticket,
  TicketCoverageArtifact,
} from "../../types.js";
import { RunReportMain } from "./run/run-report-main.js";
import { RunReportSidebar } from "./run/run-report-sidebar.js";
import { useRunViewModel } from "./run/use-run-view-model.js";

export const RunView = ({
  initiatives,
  tickets: _tickets,
  planningReviews: _planningReviews,
  runs: _runs,
  ticketCoverageArtifacts: _ticketCoverageArtifacts,
  onRefresh: _onRefresh,
}: {
  initiatives: Initiative[];
  tickets: Ticket[];
  planningReviews: PlanningReviewArtifact[];
  runs: Run[];
  ticketCoverageArtifacts: TicketCoverageArtifact[];
  onRefresh: () => Promise<void>;
}) => {
  const model = useRunViewModel({ initiatives });

  if (model.status === "loading") {
    return (
      <section>
        <div className="status-loading-card" role="status" aria-live="polite">
          <span className="status-loading-spinner" aria-hidden="true" />
          <div className="status-loading-copy">
            <strong>Loading run...</strong>
            <span>Pulling together the latest summary, verification result, and included files.</span>
          </div>
        </div>
      </section>
    );
  }

  if (model.status === "error") {
    return (
      <section>
        <h2>Run not found</h2>
        <p>{model.error}</p>
      </section>
    );
  }

  return (
    <section className="ticket-journey">
      <header className="section-header ticket-journey-header">
        <div>
          <h2>{model.detail.run.id}</h2>
          <p>{model.runTypeLabel}</p>
        </div>
        {model.detail.ticket ? (
          <div className="button-row mb-0">
            <Link to={`/ticket/${model.detail.ticket.id}`}>Open ticket</Link>
          </div>
        ) : null}
      </header>

      <div className="run-report-shell">
        <RunReportMain model={model} />
        <RunReportSidebar model={model} />
      </div>
    </section>
  );
};
