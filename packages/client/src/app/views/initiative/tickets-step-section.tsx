import { useEffect, useRef, useState } from "react";
import type { Initiative, InitiativePhase, Ticket, TicketStatus } from "../../../types.js";
import { canTransition, statusColumns } from "../../constants/status-columns.js";

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


function _getTicketProgress(status: string): number {
  switch (status) {
    case 'backlog': return 0;
    case 'ready': return 25;
    case 'in-progress': return 50;
    case 'verify': return 75;
    case 'done': return 100;
    default: return 0;
  }
}

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
  onCommitPhaseName: _onCommitPhaseName,
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
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const phaseDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!phaseDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (phaseDropdownRef.current && !phaseDropdownRef.current.contains(e.target as Node)) {
        setPhaseDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [phaseDropdownOpen]);

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
  const selectedPhaseTickets = initiativeTickets.filter(
    (ticket) => ticket.phaseId === selectedPhase.id,
  );
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
      <div className="planning-phase-dropdown-wrap" ref={phaseDropdownRef}>
        <span className="planning-phase-dropdown-label">Phase</span>
        <button
          type="button"
          className="planning-phase-dropdown-trigger"
          onClick={() => setPhaseDropdownOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={phaseDropdownOpen}
          aria-label={`Select phase. Current phase ${selectedPhase.name}`}
        >
          <span>
            <strong>{selectedPhase.name}</strong>
          </span>
          <span className="planning-phase-dropdown-chevron" aria-hidden="true">{phaseDropdownOpen ? "\u25B4" : "\u25BE"}</span>
        </button>
        {phaseDropdownOpen ? (
          <ul className="planning-phase-dropdown-panel" role="listbox">
            {orderedPhases.map((phase) => {
              const phaseTickets = initiativeTickets.filter(
                (ticket) => ticket.phaseId === phase.id,
              );
              const selected = phase.id === selectedPhase.id;
              return (
                <li
                  key={phase.id}
                  role="option"
                  aria-selected={selected}
                  className={`planning-phase-dropdown-item${selected ? " planning-phase-dropdown-item-selected" : ""}`}
                  onClick={() => { setSelectedPhaseId(phase.id); setPhaseDropdownOpen(false); }}
                >
                  <span>{phase.name}</span>
                  <span className="planning-phase-dropdown-item-count">{phaseTickets.length} tickets</span>
                </li>
              );
            })}
          </ul>
        ) : null}
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
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", ticket.id);
                            setDraggedTicketId(ticket.id);
                          }}
                          onDragEnd={resetDragState}
                        >
                          <div className="planning-ticket-card-top">
                            <span className="planning-ticket-card-id">{ticket.id}</span>
                            <button
                              type="button"
                              className="planning-ticket-card-overflow"
                              onClick={() => onOpenTicket(ticket.id)}
                              aria-label={`Open ${ticket.title}`}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                                <circle cx="8" cy="3" r="1.25" />
                                <circle cx="8" cy="8" r="1.25" />
                                <circle cx="8" cy="13" r="1.25" />
                              </svg>
                            </button>
                          </div>
                          <button
                            type="button"
                            className="planning-ticket-card-link"
                            onClick={() => onOpenTicket(ticket.id)}
                          >
                            {ticket.title}
                          </button>
                          <div className="planning-ticket-card-stats">
                            {ticket.fileTargets.length > 0 ? (
                              <span className="planning-ticket-card-stat">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z" />
                                  <path d="M10 6H6M10 10H6" />
                                </svg>
                                {ticket.fileTargets.length} main file{ticket.fileTargets.length === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <span className="planning-ticket-card-stat">No main files listed yet</span>
                            )}
                          </div>
                          {unfinishedBlockerCount > 0 ? (
                            <span className="planning-ticket-card-blocker">
                              Blocked by {unfinishedBlockerCount}
                            </span>
                          ) : null}
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
