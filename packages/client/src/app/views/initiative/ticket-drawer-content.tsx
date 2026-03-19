import type { Initiative, Ticket, TicketCoverageArtifact } from "../../../types.js";
import { INITIATIVE_WORKFLOW_LABELS } from "../../utils/initiative-workflow.js";

interface InitiativeTicketDrawerContentProps {
  initiative: Initiative;
  ticket: Ticket;
  initiativeTickets: Ticket[];
  ticketCoverageArtifact: TicketCoverageArtifact | null;
  onOpenFullPage: () => void;
}

export const InitiativeTicketDrawerContent = ({
  initiative,
  ticket,
  initiativeTickets,
  ticketCoverageArtifact,
  onOpenFullPage,
}: InitiativeTicketDrawerContentProps) => {
  const phase = initiative.phases.find((item) => item.id === ticket.phaseId) ?? null;
  const blockerTickets = (ticket.blockedBy ?? [])
    .map((id) => initiativeTickets.find((item) => item.id === id))
    .filter(Boolean) as Ticket[];
  const coveredItems = ticketCoverageArtifact
    ? ticketCoverageArtifact.items.filter((item) =>
        ticket.coverageItemIds.includes(item.id),
      )
    : [];
  const groupedCoveredItems = coveredItems.reduce<Record<string, typeof coveredItems>>(
    (acc, item) => {
      const key = item.sourceStep;
      acc[key] = [...(acc[key] ?? []), item];
      return acc;
    },
    {},
  );

  return (
    <div className="ticket-drawer-shell">
      <section className="ticket-context-card">
        {ticket.description ? (
          <p className="ticket-drawer-copy">{ticket.description}</p>
        ) : null}

        <div className="ticket-context-metrics">
          <div>
            <span>Status</span>
            <strong>{ticket.status}</strong>
          </div>
          <div>
            <span>Phase</span>
            <strong>{phase?.name ?? "Unassigned"}</strong>
          </div>
          <div>
            <span>Covered items</span>
            <strong>{ticket.coverageItemIds.length}</strong>
          </div>
        </div>

        {blockerTickets.length > 0 ? (
          <div className="ticket-context-group">
            <span className="qa-label">Blocked by</span>
            <ul className="ticket-drawer-list">
              {blockerTickets.map((blocker) => (
                <li key={blocker.id}>
                  {blocker.title} ({blocker.status})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="ticket-context-card">
        <h3>Acceptance criteria</h3>
        {ticket.acceptanceCriteria.length > 0 ? (
          <ul className="ticket-drawer-list">
            {ticket.acceptanceCriteria.map((criterion) => (
              <li key={criterion.id}>{criterion.text}</li>
            ))}
          </ul>
        ) : (
          <p className="ticket-empty-note">No acceptance criteria yet.</p>
        )}
      </section>

      <section className="ticket-context-card">
        <h3>Implementation plan</h3>
        {ticket.implementationPlan ? (
          <p className="ticket-drawer-copy">{ticket.implementationPlan}</p>
        ) : (
          <p className="ticket-empty-note">No implementation plan yet.</p>
        )}

        <span className="qa-label">Files in scope</span>
        {ticket.fileTargets.length > 0 ? (
          <ul className="ticket-drawer-file-list">
            {ticket.fileTargets.map((path) => (
              <li key={path} className="ticket-drawer-file-item">
                <code>{path}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ticket-empty-note">No file targets yet.</p>
        )}
      </section>

      <section className="ticket-context-card">
        <h3>Covered spec items</h3>
        {coveredItems.length > 0 ? (
          Object.entries(groupedCoveredItems).map(([step, items]) => (
            <div key={step} className="ticket-context-group">
              <span className="qa-label">
                {INITIATIVE_WORKFLOW_LABELS[
                  step as keyof typeof INITIATIVE_WORKFLOW_LABELS
                ] ?? step}
              </span>
              <ul className="ticket-drawer-list">
                {items.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="ticket-empty-note">No spec items are linked yet.</p>
        )}
      </section>

      <div className="button-row ticket-drawer-actions">
        <button type="button" className="btn-primary" onClick={onOpenFullPage}>
          Open full ticket
        </button>
      </div>
    </div>
  );
};
