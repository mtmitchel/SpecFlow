import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { statusColumns, canTransition } from "../constants/status-columns";
import { findPhaseWarning } from "../utils/phase-warning";
import type { Initiative, InitiativePhase, Ticket, TicketStatus } from "../../types";

export const TicketsPage = ({
  tickets,
  initiatives,
  onMoveTicket
}: {
  tickets: Ticket[];
  initiatives: Initiative[];
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}): JSX.Element => {
  const [initiativeFilter, setInitiativeFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTickets = tickets.filter((ticket) => {
    if (initiativeFilter !== "all" && ticket.initiativeId !== initiativeFilter) {
      return false;
    }
    if (phaseFilter !== "all" && ticket.phaseId !== phaseFilter) {
      return false;
    }
    if (statusFilter !== "all" && ticket.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const phases = useMemo(() => {
    const allPhases: InitiativePhase[] = [];
    for (const initiative of initiatives) {
      allPhases.push(...initiative.phases);
    }

    return allPhases;
  }, [initiatives]);

  return (
    <section>
      <header className="section-header">
        <h2>Ticket Board</h2>
        <p>Drag cards through the lifecycle with state-guarded transitions.</p>
      </header>
      <div className="filters">
        <select value={initiativeFilter} onChange={(event) => setInitiativeFilter(event.target.value)}>
          <option value="all">All initiatives</option>
          {initiatives.map((initiative) => (
            <option key={initiative.id} value={initiative.id}>
              {initiative.title}
            </option>
          ))}
        </select>
        <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
          <option value="all">All phases</option>
          {phases.map((phase) => (
            <option key={phase.id} value={phase.id}>
              {phase.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {statusColumns.map((column) => (
            <option key={column.key} value={column.key}>
              {column.label}
            </option>
          ))}
        </select>
      </div>
      <div className="kanban-grid">
        {statusColumns.map((column) => (
          <div
            key={column.key}
            className="kanban-column"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const ticketId = event.dataTransfer.getData("text/ticket-id");
              const ticket = filteredTickets.find((item) => item.id === ticketId);
              if (!ticket || !canTransition(ticket.status, column.key)) {
                return;
              }

              void onMoveTicket(ticket.id, column.key);
            }}
          >
            <h3>{column.label}</h3>
            <div className="ticket-stack">
              {filteredTickets
                .filter((ticket) => ticket.status === column.key)
                .map((ticket) => {
                  const initiative = initiatives.find((item) => item.id === ticket.initiativeId);
                  const phaseWarning = findPhaseWarning(ticket, initiatives, tickets);

                  return (
                    <Link
                      key={ticket.id}
                      to={`/tickets/${ticket.id}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/ticket-id", ticket.id);
                      }}
                      className="ticket-card"
                    >
                      <strong>{ticket.title}</strong>
                      {initiative ? <span className="badge">{initiative.title}</span> : <span className="badge">Quick Task</span>}
                      {phaseWarning.hasWarning ? <span className="badge warn">Phase warning</span> : null}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
