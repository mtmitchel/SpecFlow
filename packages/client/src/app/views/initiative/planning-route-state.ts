import type {
  Initiative,
  InitiativePlanningStep,
  PlanningReviewArtifact,
  SpecDocumentSummary,
} from "../../../types.js";
import {
  buildInitiativeStepSearchParams,
  getInitiativePlanningSurface,
  isInitiativePlanningSurface,
  type InitiativePlanningSurface,
} from "../../utils/initiative-progress.js";
import {
  canOpenInitiativeStep,
  getInitiativeBlockedStep,
  getInitiativeResumeStep,
} from "../../utils/initiative-workflow.js";

export interface InitiativePlanningRouteState {
  activeStep: InitiativePlanningStep;
  activeSurface: InitiativePlanningSurface | null;
  canonicalSearchParams: URLSearchParams;
  requestedStep: string | null;
  requestedSurface: InitiativePlanningSurface | null;
}

export const resolveInitiativePlanningRouteState = ({
  initiative,
  planningReviews,
  requestedStep,
  requestedSurface,
  specSummaries,
}: {
  initiative: Initiative;
  planningReviews: PlanningReviewArtifact[];
  requestedStep: string | null;
  requestedSurface: string | null;
  specSummaries: SpecDocumentSummary[];
}): InitiativePlanningRouteState => {
  const reviewBlockedStep = getInitiativeBlockedStep(initiative.workflow, planningReviews);
  const resumeStep = reviewBlockedStep ?? getInitiativeResumeStep(initiative.workflow);
  const requestedPlanningStep = canOpenInitiativeStep(
    initiative.workflow,
    planningReviews,
    initiative.id,
    requestedStep,
  )
    ? requestedStep
    : resumeStep;
  const activeStep: InitiativePlanningStep =
    requestedPlanningStep === "validation" &&
    reviewBlockedStep !== "validation" &&
    initiative.workflow.steps.validation.status === "complete" &&
    initiative.workflow.steps.tickets.status !== "locked"
      ? "tickets"
      : requestedPlanningStep;
  const normalizedRequestedSurface = isInitiativePlanningSurface(requestedSurface) ? requestedSurface : null;
  const activeSurface =
    activeStep === "validation" || activeStep === "tickets"
      ? null
      : getInitiativePlanningSurface(initiative, specSummaries, activeStep, normalizedRequestedSurface);

  return {
    activeStep,
    activeSurface,
    canonicalSearchParams: buildInitiativeStepSearchParams(activeStep, activeSurface),
    requestedStep,
    requestedSurface: normalizedRequestedSurface,
  };
};
