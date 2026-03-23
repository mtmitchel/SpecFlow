import type { PlanningReviewArtifact, Ticket, TicketStatus } from "../../types";
import { getTicketStatusTransitionGate } from "@specflow/shared-contracts";

export const statusColumns: Array<{ key: TicketStatus; label: string }> = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Up next" },
  { key: "in-progress", label: "In progress" },
  { key: "verify", label: "Needs attention" },
  { key: "done", label: "Done" }
];

export const canTransition = (
  ticket: Pick<Ticket, "initiativeId" | "blockedBy" | "status">,
  to: TicketStatus,
  tickets: ReadonlyMap<string, Pick<Ticket, "status">>,
  planningReviews: ReadonlyMap<string, Pick<PlanningReviewArtifact, "status">>
): boolean =>
  ticket.status !== to && getTicketStatusTransitionGate(ticket, to, planningReviews, tickets).allowed;

export const getAvailableStatusOptions = (
  ticket: Pick<Ticket, "initiativeId" | "blockedBy" | "status">,
  tickets: ReadonlyMap<string, Pick<Ticket, "status">>,
  planningReviews: ReadonlyMap<string, Pick<PlanningReviewArtifact, "status">>
): Array<{ key: TicketStatus; label: string }> =>
  statusColumns.filter(
    (column) => column.key === ticket.status || canTransition(ticket, column.key, tickets, planningReviews)
  );
