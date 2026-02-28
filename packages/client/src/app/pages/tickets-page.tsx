import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { importGithubIssue } from "../../api";
import { statusColumns, canTransition } from "../constants/status-columns";
import { useToast } from "../context/toast";
import { findPhaseWarning } from "../utils/phase-warning";
import type { Initiative, InitiativePhase, Ticket, TicketStatus } from "../../types";

export const TicketsPage = ({
  tickets,
  initiatives,
  onMoveTicket,
  onRefresh
}: {
  tickets: Ticket[];
  initiatives: Initiative[];
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
  onRefresh: () => Promise<void>;
}) => {
  const navigate = useNavigate();
  const { showError } = useToast();
  const [initiativeFilter, setInitiativeFilter] = useState<string>("all");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showImport, setShowImport] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

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
        <div className="button-row">
          <button type="button" onClick={() => setShowImport((current) => !current)}>
            {showImport ? "Cancel Import" : "Import GitHub Issue"}
          </button>
        </div>
      </header>

      {showImport ? (
        <div className="panel">
          <h3>Import GitHub Issue</h3>
          <p>Paste a GitHub issue URL to create a SpecFlow ticket via triage.</p>
          <div className="button-row">
            <input
              className="phase-name-input"
              value={importUrl}
              onChange={(event) => setImportUrl(event.target.value)}
              placeholder="https://github.com/owner/repo/issues/123"
            />
            <button
              type="button"
              disabled={importing || !importUrl.trim()}
              onClick={async () => {
                setImporting(true);
                try {
                  const result = await importGithubIssue(importUrl.trim());
                  await onRefresh();
                  setShowImport(false);
                  setImportUrl("");
                  if (result.decision === "ok") {
                    navigate(`/tickets/${result.ticketId}`);
                  } else {
                    navigate(`/initiatives/${result.initiativeId}`);
                  }
                } catch (err) {
                  showError((err as Error).message ?? "Import failed");
                } finally {
                  setImporting(false);
                }
              }}
            >
              {importing ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      ) : null}

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
