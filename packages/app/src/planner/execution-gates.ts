import type { PlanningReviewArtifact, PlanningReviewKind, Ticket } from "../types/entities.js";
import { isReviewResolved } from "./workflow-contract.js";
import { getTicketCoverageReviewId } from "./ticket-coverage.js";

export const TICKET_EXECUTION_GATE_REVIEW_KIND: PlanningReviewKind = "ticket-coverage-review";
export const TICKET_EXECUTION_GATE_MESSAGE =
  "Resolve the coverage check for this initiative before starting execution";

export type TicketExecutionGateResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "coverage-review-unresolved";
      reviewKind: typeof TICKET_EXECUTION_GATE_REVIEW_KIND;
      message: typeof TICKET_EXECUTION_GATE_MESSAGE;
    };

export const getTicketExecutionGate = (
  ticket: Pick<Ticket, "initiativeId">,
  planningReviews: ReadonlyMap<string, Pick<PlanningReviewArtifact, "status">>
): TicketExecutionGateResult => {
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
