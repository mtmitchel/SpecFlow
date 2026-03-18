import type { FastifyReply } from "fastify";
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
import { PLANNING_STEP_LABELS } from "../../planner/workflow-contract.js";
import { isValidEntityId } from "../../server/validation.js";

export const stepLabel = (step: InitiativePlanningStep): string => PLANNING_STEP_LABELS[step];

export const requireValidEntityId = (value: string, label: string): void => {
  if (!isValidEntityId(value)) {
    throw badRequest(`Invalid ${label} format`);
  }
};

export const readInitiative = (runtime: SpecFlowRuntime, initiativeId: string): Initiative => {
  requireValidEntityId(initiativeId, "initiative ID");
  const initiative = runtime.store.initiatives.get(initiativeId);
  if (!initiative) {
    throw notFound(`Initiative ${initiativeId} not found`);
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

export const requireCoverageReviewResolved = (runtime: SpecFlowRuntime, ticket: Ticket): void => {
  if (!ticket.initiativeId) {
    return;
  }

  const gate = getTicketExecutionGate(ticket, runtime.store.planningReviews);
  if (gate.allowed) {
    return;
  }

  throw conflict(gate.message, {
    error: "Blocked",
    message: gate.message,
    reviewKind: gate.reviewKind
  });
};

export const requirePlanningReviewKind = (kind: string): PlanningReviewKind => {
  if (
    kind !== "brief-review" &&
    kind !== "brief-core-flows-crosscheck" &&
    kind !== "core-flows-review" &&
    kind !== "core-flows-prd-crosscheck" &&
    kind !== "prd-review" &&
    kind !== "prd-tech-spec-crosscheck" &&
    kind !== "tech-spec-review" &&
    kind !== "spec-set-review" &&
    kind !== "ticket-coverage-review"
  ) {
    throw badRequest("Unsupported review kind");
  }

  return kind as PlanningReviewKind;
};

export const structuredPlannerError = (
  runtime: SpecFlowRuntime,
  error: unknown
): HandlerError => {
  const structured = runtime.plannerService.toStructuredError(error);
  return new HandlerError({
    code: structured.code,
    message: structured.message,
    statusCode: structured.statusCode,
    response: structured
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

export const sendHandlerError = async (reply: FastifyReply, error: HandlerError): Promise<void> => {
  await reply.code(error.shape.statusCode).send(error.shape.response);
};
