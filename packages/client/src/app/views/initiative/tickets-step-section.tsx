import { useEffect, useState } from "react";
import type { Initiative, InitiativePhase, Ticket, TicketStatus } from "../../../types.js";
import { canTransition, statusColumns } from "../../constants/status-columns.js";

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

const getOrderedPhases = (initiative: Initiative): InitiativePhase[] =>
  initiative.phases.slice().sort((left, right) => left.order - right.order);

const getDefaultPhaseId = (
  phases: InitiativePhase[],
  initiativeTickets: Ticket[],
): string | null =>
  phases.find((phase) =>
    initiativeTickets.some(
      (ticket) => ticket.phaseId === phase.id && ticket.status !== "done",
    ),
  )?.id ??
  phases[0]?.id ??
  null;

const getCoverageCopy = (count: number): string =>
  `${count} covered spec item${count === 1 ? "" : "s"}`;

const getUnfinishedBlockerCount = (
  ticket: Ticket,
  initiativeTickets: Ticket[],
): number =>
  (ticket.blockedBy ?? []).filter((blockerId) => {
    const blocker = initiativeTickets.find((candidate) => candidate.id === blockerId);
    return blocker && blocker.status !== "done";
  }).length;

interface TicketsStepSectionProps {
  initiative: Initiative;
  initiativeTickets: Ticket[];
  onOpenTicket: (ticketId: string) => void;
  onCommitPhaseName: (phaseId: string, nextName: string) => void;
  onMoveTicket: (ticketId: string, status: TicketStatus) => Promise<void>;
}

export const TicketsStepSection = ({
  initiative,
  initiativeTickets,
  onOpenTicket,
  onCommitPhaseName,
  onMoveTicket,
}: TicketsStepSectionProps) => {
  const hasGeneratedTickets =
    initiative.phases.length > 0 || initiativeTickets.length > 0;
  const orderedPhases = getOrderedPhases(initiative);
  const defaultPhaseId = getDefaultPhaseId(orderedPhases, initiativeTickets);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(
    defaultPhaseId,
  );
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [activeDropStatus, setActiveDropStatus] = useState<TicketStatus | null>(
    null,
  );
  const [movingTicketId, setMovingTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPhaseId) {
      setSelectedPhaseId(defaultPhaseId);
      return;
    }

    if (!orderedPhases.some((phase) => phase.id === selectedPhaseId)) {
      setSelectedPhaseId(defaultPhaseId);
    }
  }, [defaultPhaseId, orderedPhases, selectedPhaseId]);

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

  if (orderedPhases.length === 0 || !selectedPhaseId) {
    return (
      <div className="planning-main-column">
        <div className="planning-section-card">
          <div className="planning-document-card-header">
            <h3 className="planning-document-card-title">Tickets need a refresh</h3>
          </div>
          <p className="text-muted-sm" style={{ margin: 0 }}>
            Refresh tickets from validation before you start execution.
          </p>
        </div>
      </div>
    );
  }

  const selectedPhase =
    orderedPhases.find((phase) => phase.id === selectedPhaseId) ?? orderedPhases[0];
  const selectedPhaseLabel = `Phase ${selectedPhase.order}`;
  const selectedPhaseTickets = initiativeTickets.filter(
    (ticket) => ticket.phaseId === selectedPhase.id,
  );
  const selectedPhaseOpenCount = selectedPhaseTickets.filter(
    (ticket) => ticket.status !== "done",
  ).length;
  const draggedTicket = draggedTicketId
    ? initiativeTickets.find((ticket) => ticket.id === draggedTicketId) ?? null
    : null;

  const resetDragState = () => {
    setDraggedTicketId(null);
    setActiveDropStatus(null);
  };

  const canDropTicket = (
    ticket: Ticket | null,
    nextStatus: TicketStatus,
  ): boolean =>
    Boolean(
      ticket &&
        ticket.phaseId === selectedPhase.id &&
        ticket.status !== nextStatus &&
        canTransition(ticket.status, nextStatus),
    );

  const handleDrop = async (
    nextStatus: TicketStatus,
    ticketIdFromEvent?: string,
  ): Promise<void> => {
    const ticketId = ticketIdFromEvent ?? draggedTicketId;
    const ticket = ticketId
      ? initiativeTickets.find((candidate) => candidate.id === ticketId) ?? null
      : null;
    resetDragState();

    if (!canDropTicket(ticket, nextStatus) || !ticket) {
      return;
    }

    setMovingTicketId(ticket.id);
    try {
      await onMoveTicket(ticket.id, nextStatus);
    } finally {
      setMovingTicketId(null);
    }
  };

  return (
    <div className="planning-main-column">
      <div className="planning-phase-board-header">
        <div className="planning-phase-board-heading">
          <h4 className="heading-reset">Execution board</h4>
          <span className="planning-phase-board-meta">
            {orderedPhases.length} phase{orderedPhases.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="planning-phase-selector" aria-label="Execution phases">
        {orderedPhases.map((phase) => {
          const phaseTickets = initiativeTickets.filter(
            (ticket) => ticket.phaseId === phase.id,
          );
          const phaseOpenCount = phaseTickets.filter(
            (ticket) => ticket.status !== "done",
          ).length;
          const phaseLabel = `Phase ${phase.order}`;
          const selected = phase.id === selectedPhase.id;

          return (
            <button
              key={phase.id}
              type="button"
              className={`planning-phase-selector-button${selected ? " planning-phase-selector-button-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => setSelectedPhaseId(phase.id)}
            >
              <span className="planning-phase-selector-label">{phaseLabel}</span>
              <strong>{phase.name}</strong>
              <span className="planning-phase-selector-meta">
                {phaseTickets.length} ticket{phaseTickets.length === 1 ? "" : "s"}
                {phaseOpenCount > 0 ? ` · ${phaseOpenCount} open` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="phase-block planning-phase-focus">
        <div className="planning-phase-header">
          <div className="planning-phase-meta">
            <span className="planning-phase-label">{selectedPhaseLabel}</span>
            <span className="planning-phase-count">
              {selectedPhaseTickets.length} ticket
              {selectedPhaseTickets.length === 1 ? "" : "s"}
              {selectedPhaseOpenCount > 0 ? ` · ${selectedPhaseOpenCount} open` : ""}
            </span>
          </div>
          <PhaseNameEditor
            name={selectedPhase.name}
            label={`${selectedPhaseLabel} name`}
            onCommit={(nextName) =>
              onCommitPhaseName(selectedPhase.id, nextName)
            }
          />
        </div>
      </div>

      <div
        className="planning-ticket-board"
        aria-label={`${selectedPhase.name} ticket board`}
      >
        {statusColumns.map((column) => {
          const columnTickets = selectedPhaseTickets.filter(
            (ticket) => ticket.status === column.key,
          );
          const columnDropAllowed = canDropTicket(draggedTicket, column.key);
          const columnActive =
            draggedTicket &&
            columnDropAllowed &&
            activeDropStatus === column.key;

          return (
            <section
              key={column.key}
              className={[
                "planning-ticket-status-column",
                `planning-ticket-status-column-${column.key}`,
                columnActive ? "planning-ticket-status-column-active" : "",
                draggedTicket && !columnDropAllowed
                  ? "planning-ticket-status-column-disabled"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`${column.label} tickets`}
              onDragEnter={() => {
                if (columnDropAllowed) {
                  setActiveDropStatus(column.key);
                }
              }}
              onDragOver={(event) => {
                if (!columnDropAllowed) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (activeDropStatus !== column.key) {
                  setActiveDropStatus(column.key);
                }
              }}
              onDragLeave={() => {
                if (activeDropStatus === column.key) {
                  setActiveDropStatus(null);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const droppedTicketId =
                  event.dataTransfer.getData("text/plain") || undefined;
                void handleDrop(column.key, droppedTicketId);
              }}
            >
              <header className="planning-ticket-status-header">
                <div className="planning-ticket-status-heading">
                  <h5>{column.label}</h5>
                  <span className="planning-ticket-status-count">
                    {columnTickets.length}
                  </span>
                </div>
              </header>
              <div className="planning-ticket-status-body">
                {columnTickets.length === 0 ? (
                  <p className="ticket-empty-note">
                    No {column.label.toLowerCase()} tickets in this phase.
                  </p>
                ) : (
                  <ul className="planning-ticket-status-list">
                    {columnTickets.map((ticket) => {
                      const unfinishedBlockerCount = getUnfinishedBlockerCount(
                        ticket,
                        initiativeTickets,
                      );

                      return (
                        <li
                          key={ticket.id}
                          className={`planning-ticket-card${movingTicketId === ticket.id ? " planning-ticket-card-moving" : ""}`}
                        >
                          <div className="planning-ticket-card-header">
                            <button
                              type="button"
                              className="planning-ticket-card-link"
                              onClick={() => onOpenTicket(ticket.id)}
                            >
                              {ticket.title}
                            </button>
                            <button
                              type="button"
                              className="planning-ticket-drag-handle"
                              draggable
                              disabled={movingTicketId === ticket.id}
                              aria-label={`Drag ${ticket.title}`}
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", ticket.id);
                                setDraggedTicketId(ticket.id);
                              }}
                              onDragEnd={resetDragState}
                            >
                              <span aria-hidden="true">::</span>
                            </button>
                          </div>
                          <p className="planning-ticket-card-meta">
                            {getCoverageCopy(ticket.coverageItemIds.length)}
                            {unfinishedBlockerCount > 0
                              ? ` · Blocked by ${unfinishedBlockerCount} ticket${unfinishedBlockerCount === 1 ? "" : "s"}`
                              : ""}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};
