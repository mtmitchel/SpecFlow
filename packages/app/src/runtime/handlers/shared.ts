import type { Initiative, PlanningReviewKind, Ticket } from "../../types/entities.js";
import type { SpecFlowRuntime } from "../types.js";
import {
  badRequest,
  conflict,
  HandlerError,
  notFound
} from "../errors.js";
import { getTicketExecutionGate } from "../../planner/execution-gates.js";
import type { InitiativePlanningStep } from "../../types/entities.js";
import { PLANNING_STEP_LABELS, REVIEW_KINDS } from "../../planner/workflow-contract.js";
import { isValidEntityId } from "../../validation.js";

export const stepLabel = (step: InitiativePlanningStep): string => PLANNING_STEP_LABELS[step];

export const requireValidEntityId = (value: string, label: string): void => {
  if (!isValidEntityId(value)) {
    throw badRequest(`Invalid ${label} format`);
  }
};

export const readInitiative = (runtime: SpecFlowRuntime, initiativeId: string): Initiative => {
  requireValidEntityId(initiativeId, "project ID");
  const initiative = runtime.store.initiatives.get(initiativeId);
  if (!initiative) {
    throw notFound(`Project ${initiativeId} not found`);
  }

  return initiative;
};

export const readTicket = (runtime: SpecFlowRuntime, ticketId: string): Ticket => {
  requireValidEntityId(ticketId, "ticket ID");
  const ticket = runtime.store.tickets.get(ticketId);
  if (!ticket) {
    throw notFound(`Ticket ${ticketId} not found`);
  }

  return ticket;
};

export const requireTicketExecutionAllowed = (runtime: SpecFlowRuntime, ticket: Ticket): void => {
  const gate = getTicketExecutionGate(ticket, runtime.store.planningReviews, runtime.store.tickets);
  if (gate.allowed) {
    return;
  }

  throw conflict(gate.message, {
    error: "Blocked",
    message: gate.message,
    reviewKind: gate.code === "coverage-review-unresolved" ? gate.reviewKind : undefined,
    blockingTicketIds: gate.code === "blocked-by-open-ticket" ? gate.blockingTicketIds : undefined
  });
};

export const requirePlanningReviewKind = (kind: string): PlanningReviewKind => {
  if (!REVIEW_KINDS.includes(kind as PlanningReviewKind)) {
    throw badRequest("Unsupported review kind");
  }

  return kind as PlanningReviewKind;
};

export const structuredPlannerError = (
  runtime: SpecFlowRuntime,
  error: unknown
): HandlerError => {
  const structured = runtime.plannerService.toStructuredError(error);
  const response = structured.details === undefined
    ? structured
    : {
        ...structured,
        details: structured.details
      };
  return new HandlerError({
    code: structured.code,
    message: structured.message,
    statusCode: structured.statusCode,
    response
  });
};

export const structuredVerifierError = (
  runtime: SpecFlowRuntime,
  error: unknown
): HandlerError => {
  const structured = runtime.verifierService.toStructuredError(error);
  return new HandlerError({
    code: structured.code,
    message: structured.message,
    statusCode: structured.statusCode,
    response: structured
  });
};
