import { useEffect, useState } from "react";
import type { Initiative, Ticket } from "../../../types.js";

const PhaseNameEditor = ({
  name,
  label,
  onCommit,
}: {
  name: string;
  label: string;
  onCommit: (nextName: string) => void;
}) => {
  const [localName, setLocalName] = useState(name);

  useEffect(() => {
    setLocalName(name);
  }, [name]);

  return (
    <input
      className="phase-name-input"
      aria-label={label}
      value={localName}
      onChange={(event) => setLocalName(event.target.value)}
      onBlur={() => {
        if (localName !== name) {
          onCommit(localName);
        }
      }}
    />
  );
};

interface TicketsStepSectionProps {
  initiative: Initiative;
  initiativeTickets: Ticket[];
  onOpenTicket: (ticketId: string) => void;
  onCommitPhaseName: (phaseId: string, nextName: string) => void;
}

export const TicketsStepSection = ({
  initiative,
  initiativeTickets,
  onOpenTicket,
  onCommitPhaseName,
}: TicketsStepSectionProps) => {
  const hasGeneratedTickets =
    initiative.phases.length > 0 || initiativeTickets.length > 0;

  if (!hasGeneratedTickets) {
    return (
      <div className="planning-main-column">
        <div className="planning-section-card">
          <div className="planning-document-card-header">
            <h3 className="planning-document-card-title">Tickets aren&apos;t ready yet</h3>
          </div>
          <p className="text-muted-sm" style={{ margin: 0 }}>
            Finish validation before tickets are created.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="planning-main-column">
      <div className="planning-phase-board-header">
        <div className="planning-phase-board-heading">
          <h4 className="heading-reset">Execution phases</h4>
          <span className="planning-phase-board-meta">
            {initiative.phases.length} phase{initiative.phases.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="planning-phase-board" aria-label="Execution phase board">
        {initiative.phases
          .slice()
          .sort((left, right) => left.order - right.order)
          .map((phase) => {
            const phaseTickets = initiativeTickets.filter(
              (ticket) => ticket.phaseId === phase.id,
            );
            const phaseLabel = `Phase ${phase.order}`;
            return (
              <div
                key={phase.id}
                className="phase-block planning-phase-column"
              >
                <div className="planning-phase-header">
                  <div className="planning-phase-meta">
                    <span className="planning-phase-label">{phaseLabel}</span>
                    <span className="planning-phase-count">
                      {phaseTickets.length} ticket
                      {phaseTickets.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <PhaseNameEditor
                    name={phase.name}
                    label={`${phaseLabel} name`}
                    onCommit={(nextName) =>
                      onCommitPhaseName(phase.id, nextName)
                    }
                  />
                </div>
                {phaseTickets.length === 0 ? (
                  <p className="ticket-empty-note">No tickets yet.</p>
                ) : (
                  <ul className="planning-ticket-list">
                    {phaseTickets.map((ticket) => (
                      <li key={ticket.id}>
                        <button
                          type="button"
                          className="planning-phase-ticket-link"
                          onClick={() => onOpenTicket(ticket.id)}
                        >
                          {ticket.title}
                        </button>
                        <span className="planning-phase-ticket-meta">
                          {ticket.status} · covers{" "}
                          {ticket.coverageItemIds.length} spec item
                          {ticket.coverageItemIds.length === 1 ? "" : "s"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};
