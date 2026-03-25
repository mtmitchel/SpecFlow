import type { PlanningReviewArtifact, PlanningReviewKind, Ticket } from "../types/entities.js";
import { isReviewResolved } from "./workflow-contract.js";
import { getTicketCoverageReviewId } from "./ticket-coverage.js";

export const TICKET_EXECUTION_GATE_REVIEW_KIND: PlanningReviewKind = "ticket-coverage-review";
export const TICKET_EXECUTION_GATE_MESSAGE =
  "Finish plan validation before starting work";
export const TICKET_DEPENDENCY_GATE_MESSAGE =
  "Complete the tickets ahead of this one first.";
export const EXECUTION_TICKET_STATUSES = ["in-progress", "verify", "done"] as const;

export type TicketExecutionGateResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "blocked-by-open-ticket";
      message: typeof TICKET_DEPENDENCY_GATE_MESSAGE;
      blockingTicketIds: string[];
    }
  | {
      allowed: false;
      code: "coverage-review-unresolved";
      reviewKind: typeof TICKET_EXECUTION_GATE_REVIEW_KIND;
      message: typeof TICKET_EXECUTION_GATE_MESSAGE;
    };

export const isExecutionTicketStatus = (status: Ticket["status"]): boolean =>
  EXECUTION_TICKET_STATUSES.includes(status as (typeof EXECUTION_TICKET_STATUSES)[number]);

export const getTicketExecutionGate = (
  ticket: Pick<Ticket, "initiativeId" | "blockedBy">,
  planningReviews: ReadonlyMap<string, Pick<PlanningReviewArtifact, "status">>,
  tickets: ReadonlyMap<string, Pick<Ticket, "status">>
): TicketExecutionGateResult => {
  const blockingTicketIds = (ticket.blockedBy ?? []).filter((ticketId) => {
    const blockingTicket = tickets.get(ticketId);
    return blockingTicket && blockingTicket.status !== "done";
  });
  if (blockingTicketIds.length > 0) {
    return {
      allowed: false,
      code: "blocked-by-open-ticket",
      message: TICKET_DEPENDENCY_GATE_MESSAGE,
      blockingTicketIds
    };
  }

  if (!ticket.initiativeId) {
    return { allowed: true };
  }

  const review = planningReviews.get(getTicketCoverageReviewId(ticket.initiativeId));
  if (review && isReviewResolved(review.status)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "coverage-review-unresolved",
    reviewKind: TICKET_EXECUTION_GATE_REVIEW_KIND,
    message: TICKET_EXECUTION_GATE_MESSAGE
  };
};

export const getTicketStatusTransitionGate = (
  ticket: Pick<Ticket, "initiativeId" | "blockedBy" | "status">,
  nextStatus: Ticket["status"],
  planningReviews: ReadonlyMap<string, Pick<PlanningReviewArtifact, "status">>,
  tickets: ReadonlyMap<string, Pick<Ticket, "status">>
): TicketExecutionGateResult => {
  if (ticket.status === nextStatus || !isExecutionTicketStatus(nextStatus)) {
    return { allowed: true };
  }

  return getTicketExecutionGate(ticket, planningReviews, tickets);
};
